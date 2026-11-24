"""ElevenLabs TTS（eleven_v4 主力）共通モジュール。

全制作ハーネス（案A / 案B / 案C / 案E）から共通利用できる ElevenLabs API クライアント、
既定ボイス（Liam - Energetic, Social Media Creator / TX3LPaxmHKxFdv7VOQHJ）および
明示 "auto" 指定時の自声クローン／日本語知的男性ナレーター自動ボイス選定、
output_format 段階フォールバック、with-timestamps 文字単位アライメント解析、
および非破壊前後無音トリム同期を提供する。
"""

from __future__ import annotations

import base64
import difflib
import hashlib
import json
import os
import re
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal, Mapping, Sequence

import httpx

from yt_engine.audio.tts_gemini import (
    DEFAULT_SAMPLE_RATE,
    AlignedChunkSpan,
    NarrationChunk,
    OneTakeSynthesisResult,
    SynthesizedChunk,
    _compute_wav_rms_db_curve,
    align_chunks_to_wav,
    compose_onetake_prompt,
    detect_silence_intervals,
    estimate_japanese_morae,
    ffprobe_duration,
    load_dotenv,
    run_cmd,
    sanitize_japanese_text,
    split_japanese_sentences,
    trim_and_resample_tts,
)

ELEVENLABS_API_BASE_URL = "https://api.elevenlabs.io/v1"
DEFAULT_ELEVENLABS_MODELS: tuple[str, ...] = (
    "eleven_v4",
    "eleven_v4_turbo",
    "eleven_multilingual_v2",
)
DEFAULT_ELEVENLABS_VOICE_ID = "TX3LPaxmHKxFdv7VOQHJ"
DEFAULT_ELEVENLABS_VOICE_NAME = "Liam - Energetic, Social Media Creator"
DEFAULT_ELEVENLABS_LANGUAGE_CODE = "ja"
DEFAULT_ELEVENLABS_OUTPUT_FORMATS: tuple[str, ...] = (
    "pcm_48000",
    "pcm_44100",
    "mp3_44100_192",
    "mp3_44100_128",
)
DEFAULT_ELEVENLABS_MIN_INTERVAL_SEC: float = 0.25
DEFAULT_ELEVENLABS_HTTP_TIMEOUT_SEC: float = 180.0
DEFAULT_ELEVENLABS_VOICE_SETTINGS: dict[str, float] = {
    "stability": 0.50,
    "similarity_boost": 0.78,
}

_ELEVEN_V4_MODELS = frozenset({"eleven_v4", "eleven_v4_turbo"})
_BOUNDARY_PUNCT_CHARS = frozenset("、。！？，,.!?・：:「」『』（）()[] ")
_SECRET_KEY_PATTERN = re.compile(r"\bsk_[A-Za-z0-9]{12,}\b")
_HEADER_SECRET_PATTERN = re.compile(r"(?i)(xi-api-key\s*[:=]\s*)([^\s,;'\"}]+)")


class ElevenLabsError(RuntimeError):
    """ElevenLabs API 呼び出し・音声デコードに関する基底例外。"""


class ElevenLabsAuthError(ElevenLabsError):
    """API キー欠落・認証失敗（401/403）例外。"""


class ElevenLabsQuotaExceededError(ElevenLabsError):
    """クレジット・文字数上限超過（402 / quota_exceeded）例外。"""


class ElevenLabsFormatNotAllowedError(ElevenLabsError):
    """契約プラン等で指定 output_format が利用不可の際のフォールバック用例外。"""


def redact_elevenlabs_secret(text: str, secret: str | None = None) -> str:
    """ログ・例外メッセージから ElevenLabs API キーが露出しないようマスクする。"""
    masked = str(text)
    if secret:
        stripped = secret.strip()
        if stripped:
            masked = masked.replace(stripped, "[REDACTED]")
    masked = _HEADER_SECRET_PATTERN.sub(r"\1[REDACTED]", masked)
    masked = _SECRET_KEY_PATTERN.sub("[REDACTED]", masked)
    return masked


def resolve_elevenlabs_api_key(
    api_key: str | None = None,
    *,
    repo_root: Path | None = None,
    load_env: bool = True,
) -> str:
    """ElevenLabs API キーを解決する。明示キー指定時は .env を読み込まない。"""
    if api_key is not None and api_key.strip():
        return api_key.strip()
    if load_env:
        load_dotenv(repo_root)
    env_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not env_key:
        raise ElevenLabsAuthError(
            "ELEVENLABS_API_KEY is missing in environment or .env."
        )
    return env_key


def normalize_elevenlabs_language_code(language_code: str | None) -> str | None:
    """'ja-JP' などのロケール形式を ElevenLabs ISO 639-1 形式（'ja'）へ正規化する。"""
    if language_code is None:
        return None
    cleaned = language_code.strip()
    if not cleaned:
        return None
    base = re.split(r"[-_]", cleaned, maxsplit=1)[0].strip().lower()
    return base or None


def _filter_voice_settings(
    model_id: str,
    voice_settings: Mapping[str, Any] | None,
) -> dict[str, Any] | None:
    """モデル仕様に合わせて voice_settings の有効キーのみ抽出する。

    eleven_v4 / eleven_v4_turbo は style / speed / use_speaker_boost 非対応のため除外する。
    """
    if not voice_settings:
        return None
    if model_id in _ELEVEN_V4_MODELS:
        allowed = {"stability", "similarity_boost", "clone_strength"}
    else:
        allowed = {"stability", "similarity_boost", "style", "use_speaker_boost", "speed"}
    filtered = {k: v for k, v in voice_settings.items() if k in allowed and v is not None}
    return filtered or None


@dataclass(frozen=True)
class CharacterAlignment:
    """ElevenLabs with-timestamps API から取得した文字単位タイムスタンプ。"""

    characters: tuple[str, ...]
    start_times_sec: tuple[float, ...]
    end_times_sec: tuple[float, ...]
    source: str = "elevenlabs_with_timestamps"

    def __post_init__(self) -> None:
        n = len(self.characters)
        if n != len(self.start_times_sec) or n != len(self.end_times_sec):
            raise ValueError(
                f"CharacterAlignment length mismatch: chars={n}, "
                f"starts={len(self.start_times_sec)}, ends={len(self.end_times_sec)}"
            )

    @classmethod
    def from_elevenlabs_payload(
        cls,
        payload: Mapping[str, Any],
        *,
        source: str = "elevenlabs_with_timestamps",
    ) -> CharacterAlignment | None:
        """ElevenLabs with-timestamps 応答 JSON から CharacterAlignment を構築する。"""
        block = payload.get("alignment") or payload.get("normalized_alignment")
        if not isinstance(block, Mapping):
            return None
        chars = block.get("characters")
        starts = block.get("character_start_times_seconds")
        ends = block.get("character_end_times_seconds")
        if not (isinstance(chars, list) and isinstance(starts, list) and isinstance(ends, list)):
            return None
        if not chars or len(chars) != len(starts) or len(chars) != len(ends):
            return None
        return cls(
            characters=tuple(str(c) for c in chars),
            start_times_sec=tuple(max(0.0, float(s)) for s in starts),
            end_times_sec=tuple(max(float(s), float(e)) for s, e in zip(starts, ends)),
            source=source,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "characters": list(self.characters),
            "character_start_times_seconds": [round(float(x), 4) for x in self.start_times_sec],
            "character_end_times_seconds": [round(float(x), 4) for x in self.end_times_sec],
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> CharacterAlignment:
        chars = [str(c) for c in (data.get("characters") or [])]
        starts_raw = data.get("character_start_times_seconds")
        if starts_raw is None:
            starts_raw = data.get("start_times_sec") or []
        ends_raw = data.get("character_end_times_seconds")
        if ends_raw is None:
            ends_raw = data.get("end_times_sec") or []
        starts = [max(0.0, float(s)) for s in starts_raw]
        ends = [max(s, float(e)) for s, e in zip(starts, ends_raw)]
        return cls(
            characters=tuple(chars),
            start_times_sec=tuple(starts),
            end_times_sec=tuple(ends),
            source=str(data.get("source", "elevenlabs_with_timestamps")),
        )

    def save_json(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return path

    @classmethod
    def load_json(cls, path: Path) -> CharacterAlignment:
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls.from_dict(data)

    def shifted_and_scaled(
        self,
        *,
        offset_sec: float = 0.0,
        time_scale: float = 1.0,
        max_sec: float | None = None,
    ) -> CharacterAlignment:
        """トリム開始オフセット減算と再生速度倍率スケーリングを全文字時刻へ適用する。"""
        scale = max(1e-6, float(time_scale))
        new_starts: list[float] = []
        new_ends: list[float] = []
        for s, e in zip(self.start_times_sec, self.end_times_sec):
            ns = max(0.0, (float(s) - offset_sec) * scale)
            ne = max(ns, (float(e) - offset_sec) * scale)
            if max_sec is not None:
                ns = min(max_sec, ns)
                ne = min(max_sec, max(ns, ne))
            new_starts.append(round(ns, 4))
            new_ends.append(round(ne, 4))
        return CharacterAlignment(
            characters=self.characters,
            start_times_sec=tuple(new_starts),
            end_times_sec=tuple(new_ends),
            source=self.source,
        )

    def _map_char_index(self, text: str, char_index: int) -> int | None:
        if not self.characters:
            return None
        aligned_text = "".join(self.characters)
        if aligned_text == text:
            return max(0, min(len(self.characters), char_index))

        norm_text_chars: list[str] = []
        norm_target_len = 0
        for idx, ch in enumerate(text):
            if not ch.isspace():
                norm_text_chars.append(ch)
                if idx < char_index:
                    norm_target_len += 1
        norm_text = "".join(norm_text_chars)

        norm_to_aligned_idx: list[int] = []
        norm_aligned_chars: list[str] = []
        for a_idx, ch in enumerate(self.characters):
            if not ch.isspace():
                norm_aligned_chars.append(ch)
                norm_to_aligned_idx.append(a_idx)
        norm_aligned = "".join(norm_aligned_chars)

        if not norm_text or not norm_aligned:
            return None

        if norm_text == norm_aligned:
            if norm_target_len <= 0:
                return norm_to_aligned_idx[0]
            if norm_target_len >= len(norm_to_aligned_idx):
                return len(self.characters)
            return norm_to_aligned_idx[norm_target_len]

        sm = difflib.SequenceMatcher(None, norm_text, norm_aligned, autojunk=False)
        if sm.ratio() < 0.70:
            return None

        norm_mapped: int | None = None
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if i1 <= norm_target_len <= i2:
                if i2 == i1:
                    norm_mapped = j1
                else:
                    frac = (norm_target_len - i1) / float(i2 - i1)
                    norm_mapped = int(round(j1 + frac * (j2 - j1)))
                break
        if norm_mapped is None:
            norm_mapped = len(norm_aligned)

        norm_mapped = max(0, min(len(norm_to_aligned_idx), norm_mapped))
        if norm_mapped >= len(norm_to_aligned_idx):
            return len(self.characters)
        return norm_to_aligned_idx[norm_mapped]

    def onset_at_char_index(self, text: str, char_index: int) -> float | None:
        """字幕の文字位置に対応する文字の発話開始秒を返す。"""
        mapped = self._map_char_index(text, char_index)
        if mapped is None or mapped >= len(self.characters):
            return None
        return self.start_times_sec[mapped]

    def time_at_char_index(self, text: str, char_index: int) -> float | None:
        """テキスト文字位置 char_index に対応する自然な発話境界時刻（秒）を返す。"""
        if not self.characters:
            return None
        mapped = self._map_char_index(text, char_index)
        if mapped is None:
            return None

        n = len(self.characters)
        if mapped <= 0:
            for i in range(n):
                if not self.characters[i].isspace():
                    return round(max(0.0, self.start_times_sec[i]), 4)
            return round(max(0.0, self.start_times_sec[0]), 4)

        if mapped >= n:
            for i in range(n - 1, -1, -1):
                if not self.characters[i].isspace():
                    return round(max(0.0, self.end_times_sec[i]), 4)
            return round(max(0.0, self.end_times_sec[-1]), 4)

        prev_end: float | None = None
        for i in range(mapped - 1, -1, -1):
            ch = self.characters[i]
            if not ch.isspace() and ch not in _BOUNDARY_PUNCT_CHARS:
                prev_end = self.end_times_sec[i]
                break
        if prev_end is None:
            for i in range(mapped - 1, -1, -1):
                if not self.characters[i].isspace():
                    prev_end = self.end_times_sec[i]
                    break
        if prev_end is None:
            prev_end = 0.0

        next_start: float | None = None
        for i in range(mapped, n):
            ch = self.characters[i]
            if not ch.isspace() and ch not in _BOUNDARY_PUNCT_CHARS:
                next_start = self.start_times_sec[i]
                break
        if next_start is None:
            for i in range(mapped, n):
                if not self.characters[i].isspace():
                    next_start = self.start_times_sec[i]
                    break
        if next_start is None:
            next_start = prev_end

        if next_start < prev_end:
            next_start = prev_end

        gap = next_start - prev_end
        if gap >= 0.04:
            boundary = max(0.5 * (prev_end + next_start), next_start - 0.12)
        else:
            boundary = next_start
        return round(max(0.0, boundary), 4)

    def end_time_at_char_index(self, text: str, char_end: int) -> float | None:
        """テキスト終了位置 char_end 直前の発話終了時刻（秒）を返す。"""
        if not self.characters:
            return None
        mapped = self._map_char_index(text, char_end)
        if mapped is None:
            return None
        limit = min(len(self.characters), max(0, mapped))
        for i in range(limit - 1, -1, -1):
            ch = self.characters[i]
            if not ch.isspace() and ch not in _BOUNDARY_PUNCT_CHARS:
                return round(max(0.0, float(self.end_times_sec[i])), 4)
        for i in range(limit - 1, -1, -1):
            if not self.characters[i].isspace():
                return round(max(0.0, float(self.end_times_sec[i])), 4)
        return round(max(0.0, float(self.end_times_sec[0])), 4)


def _locate_chunk_offsets_in_joined_text(
    pure_texts: Sequence[str],
    joined_text: str,
    separator: str,
) -> list[tuple[int, int]] | None:
    """結合済みワンテイク原稿内の各チャンクの [start, end) 文字インデックスを求める。"""
    if separator.join(pure_texts) == joined_text:
        offsets: list[tuple[int, int]] = []
        pos = 0
        sep_len = len(separator)
        for idx, pt in enumerate(pure_texts):
            if idx > 0:
                pos += sep_len
            offsets.append((pos, pos + len(pt)))
            pos += len(pt)
        return offsets

    offsets = []
    cursor = 0
    for pt in pure_texts:
        found = joined_text.find(pt, cursor)
        if found < 0:
            return None
        offsets.append((found, found + len(pt)))
        cursor = found + len(pt)
    return offsets


def _build_chunk_sentence_spans(
    pure_text: str,
    chunk_char_start: int,
    speech_start: float,
    speech_end: float,
    joined_text: str,
    alignment: CharacterAlignment,
) -> tuple[tuple[float, float, str], ...]:
    """チャンク内の文単位時間スパンを文字アライメント（必要時はモーラ比例）で求める。"""
    sents = split_japanese_sentences(pure_text)
    if len(sents) <= 1:
        return ((round(speech_start, 4), round(speech_end, 4), pure_text),)

    n_sents = len(sents)
    rel_ranges: list[tuple[int, int, str]] = []
    rel_cursor = 0
    for stxt in sents:
        found = pure_text.find(stxt, rel_cursor)
        if found < 0:
            found = rel_cursor
        rel_ranges.append((found, found + len(stxt), stxt))
        rel_cursor = found + len(stxt)

    sent_starts: list[float] = [speech_start]
    total_mora = max(0.5, estimate_japanese_morae(pure_text))
    acc_mora = estimate_japanese_morae(rel_ranges[0][2])
    span_dur = max(0.05, speech_end - speech_start)

    for s_idx in range(1, n_sents):
        s_rel_start, _, s_txt = rel_ranges[s_idx]
        min_t = sent_starts[-1] + 0.02
        max_t = max(min_t, speech_end - 0.02 * (n_sents - s_idx))
        raw_t = alignment.time_at_char_index(joined_text, chunk_char_start + s_rel_start)
        if raw_t is None:
            raw_t = speech_start + span_dur * (acc_mora / total_mora)
        clamped_t = min(max_t, max(min_t, float(raw_t)))
        sent_starts.append(clamped_t)
        acc_mora += estimate_japanese_morae(s_txt)

    spans: list[tuple[float, float, str]] = []
    for s_idx, (_, s_rel_end, s_txt) in enumerate(rel_ranges):
        s0 = sent_starts[s_idx]
        next_limit = sent_starts[s_idx + 1] if s_idx + 1 < n_sents else speech_end
        if s_idx == n_sents - 1:
            s1 = speech_end
        else:
            raw_end = alignment.end_time_at_char_index(joined_text, chunk_char_start + s_rel_end)
            s1 = next_limit if raw_end is None else min(next_limit, max(s0 + 0.02, float(raw_end)))
        spans.append((round(s0, 4), round(s1, 4), s_txt))
    return tuple(spans)


def align_chunks_with_character_alignment(
    chunks: Sequence[NarrationChunk],
    joined_text: str,
    separator: str,
    alignment: CharacterAlignment,
    wav_path: Path,
    *,
    total_duration_sec: float | None = None,
) -> tuple[list[AlignedChunkSpan], dict[str, Any]] | None:
    """ElevenLabs with-timestamps の文字単位アライメントから章内チャンク境界を精密確定する。"""
    if not chunks or not alignment.characters:
        return None

    pure_texts = [sanitize_japanese_text(c.text) for c in chunks]
    offsets = _locate_chunk_offsets_in_joined_text(pure_texts, joined_text, separator)
    if offsets is None:
        return None

    norm_joined = "".join(ch for ch in joined_text if not ch.isspace())
    norm_aligned = "".join(ch for ch in alignment.characters if not ch.isspace())
    if not norm_joined or not norm_aligned:
        return None
    char_match_ratio = difflib.SequenceMatcher(None, norm_joined, norm_aligned, autojunk=False).ratio()
    if char_match_ratio < 0.70:
        return None

    total_dur = float(total_duration_sec) if total_duration_sec is not None else ffprobe_duration(wav_path)
    if total_dur <= 0.05:
        return None

    n_chunks = len(chunks)
    raw_starts: list[float] = []
    for idx, (c_start, _) in enumerate(offsets):
        if idx == 0:
            raw_starts.append(0.0)
            continue
        t0 = alignment.time_at_char_index(joined_text, c_start)
        if t0 is None:
            return None
        t0_val = float(t0)
        if t0_val <= raw_starts[-1] + 0.05 or t0_val >= total_dur - 0.05 * (n_chunks - idx):
            return None
        raw_starts.append(t0_val)

    det_silences = detect_silence_intervals(wav_path, min_duration_sec=0.06)
    total_mora_all = max(1.0, sum(max(0.5, estimate_japanese_morae(pt)) for pt in pure_texts))

    speech_ranges: list[tuple[float, float, float]] = []
    for idx, (_c_start, c_end) in enumerate(offsets):
        s_start = raw_starts[idx]
        next_start = raw_starts[idx + 1] if idx + 1 < n_chunks else total_dur
        if next_start - s_start < 0.05:
            return None
        raw_end = alignment.end_time_at_char_index(joined_text, c_end)
        if raw_end is None:
            return None
        s_end = min(next_start, max(s_start + 0.05, float(raw_end)))
        if not (s_start < s_end <= next_start) or (s_end - s_start) < 0.05:
            return None
        speech_ranges.append((s_start, s_end, next_start))

    total_speech_all = max(0.05, sum(se - ss for ss, se, _ in speech_ranges))
    aligned: list[AlignedChunkSpan] = []
    rel_errors: list[float] = []

    for idx, chunk in enumerate(chunks):
        pt = pure_texts[idx]
        c_start, _ = offsets[idx]
        speech_start, speech_end, end_sec = speech_ranges[idx]
        dur = speech_end - speech_start
        pause_sec = max(0.0, end_sec - speech_end)

        exp_share = max(0.5, estimate_japanese_morae(pt)) / total_mora_all
        exp_dur = total_speech_all * exp_share
        rel_errors.append(abs(dur - exp_dur) / max(0.4, exp_dur))

        internal_pauses = tuple(
            round(s.midpoint_sec, 4)
            for s in det_silences
            if (speech_start + 0.10) < s.midpoint_sec < (speech_end - 0.10)
        )
        sent_spans = _build_chunk_sentence_spans(
            pt, c_start, speech_start, speech_end, joined_text, alignment
        )
        aligned.append(
            AlignedChunkSpan(
                chunk_id=chunk.chunk_id,
                text=pt,
                start_sec=round(speech_start, 4),
                speech_end_sec=round(speech_end, 4),
                end_sec=round(end_sec, 4),
                duration_sec=round(dur, 4),
                pause_after_sec=round(pause_sec, 4),
                boundary_confidence=1.0,
                boundary_source="elevenlabs_char_alignment",
                internal_pauses_sec=internal_pauses,
                sentence_spans=sent_spans,
            )
        )

    summary: dict[str, Any] = {
        "aligner": "elevenlabs_char_alignment",
        "chunkCount": len(aligned),
        "sentenceCount": sum(len(a.sentence_spans) for a in aligned),
        "totalDurationSec": round(total_dur, 4),
        "alignmentCharCount": len(alignment.characters),
        "charMatchRatio": round(char_match_ratio, 4),
        "detectedSilencesCount": len(det_silences),
        "silenceHitRate": 1.0,
        "meanRelativeDurError": round(sum(rel_errors) / float(max(1, n_chunks)), 4),
        "maxRelativeDurError": round(max(rel_errors) if rel_errors else 0.0, 4),
    }
    return aligned, summary


def trim_leading_trailing_and_resample_tts(
    raw_wav: Path,
    out_wav: Path,
    *,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    pre_filters: str | None = None,
    post_filters: str | None = None,
    threshold_db: float = -40.0,
    pad_head_sec: float = 0.015,
    pad_tail_sec: float = 0.040,
    alignment: CharacterAlignment | None = None,
) -> tuple[float, float]:
    """内部無音を破壊せず前後無音のみ精密カットし、48kHz mono PCM WAV へ整形する。

    Returns:
        (clean_duration_sec, lead_trim_sec)
    """
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    total_dur = ffprobe_duration(raw_wav)
    curve = _compute_wav_rms_db_curve(raw_wav, frame_ms=10.0)

    lead_trim = 0.0
    tail_end = total_dur
    if curve is not None:
        times, dbs, c_dur, _dt = curve
        total_dur = c_dur
        active_indices = [i for i, db in enumerate(dbs) if db > threshold_db]
        if active_indices:
            rms_start = max(0.0, times[active_indices[0]] - 0.005)
            rms_end = min(total_dur, times[active_indices[-1]] + 0.005)
            if alignment is not None and alignment.start_times_sec and alignment.end_times_sec:
                non_space_starts = [
                    s for ch, s in zip(alignment.characters, alignment.start_times_sec) if not ch.isspace()
                ]
                non_space_ends = [
                    e for ch, e in zip(alignment.characters, alignment.end_times_sec) if not ch.isspace()
                ]
                first_char = min(non_space_starts) if non_space_starts else alignment.start_times_sec[0]
                last_char = max(non_space_ends) if non_space_ends else alignment.end_times_sec[-1]
                rms_start = min(rms_start, max(0.0, first_char))
                rms_end = max(rms_end, min(total_dur, last_char))
            cand_lead = max(0.0, rms_start - pad_head_sec)
            cand_tail = min(total_dur, rms_end + pad_tail_sec)
            if cand_tail > cand_lead + 0.08:
                lead_trim = round(cand_lead, 4)
                tail_end = round(cand_tail, 4)

    af_parts: list[str] = []
    if pre_filters:
        af_parts.append(pre_filters.strip(","))
    af_parts.append(f"atrim=start={lead_trim:.4f}:end={tail_end:.4f},asetpts=PTS-STARTPTS")
    if post_filters:
        af_parts.append(post_filters.strip(","))
    af_parts.append("afade=t=in:d=0.008")

    run_cmd(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(raw_wav),
            "-af",
            ",".join(af_parts),
            "-ar",
            str(sample_rate),
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(out_wav),
        ]
    )
    dur = ffprobe_duration(out_wav)
    fade_start = max(0.0, dur - 0.012)
    tmp_wav = out_wav.with_suffix(".tmp.wav")
    run_cmd(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(out_wav),
            "-af",
            f"afade=t=out:st={fade_start:.4f}:d=0.012",
            "-ar",
            str(sample_rate),
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(tmp_wav),
        ]
    )
    tmp_wav.replace(out_wav)
    return ffprobe_duration(out_wav), lead_trim


@dataclass(frozen=True)
class ElevenLabsVoiceInfo:
    """ElevenLabs /v1/voices レスポンスの正規化メタデータ。"""

    voice_id: str
    name: str
    category: str
    is_owner: bool
    description: str
    labels: dict[str, str]
    verified_languages: tuple[dict[str, Any], ...]

    @classmethod
    def from_api_dict(cls, item: Mapping[str, Any]) -> ElevenLabsVoiceInfo:
        raw_labels = item.get("labels") or {}
        labels = {str(k): str(v) for k, v in raw_labels.items()} if isinstance(raw_labels, Mapping) else {}
        verified_raw = item.get("verified_languages") or []
        verified = tuple(dict(v) for v in verified_raw if isinstance(v, Mapping))
        return cls(
            voice_id=str(item.get("voice_id") or ""),
            name=str(item.get("name") or ""),
            category=str(item.get("category") or "").lower(),
            is_owner=bool(item.get("is_owner", False)),
            description=str(item.get("description") or ""),
            labels=labels,
            verified_languages=verified,
        )


def _score_own_clone_voice(voice: ElevenLabsVoiceInfo, *, model_id: str) -> int:
    score = 0
    if voice.category == "professional" and voice.is_owner:
        score += 1000
    elif voice.category == "cloned":
        score += 500
    else:
        return -1

    lang = voice.labels.get("language", "").lower()
    if lang == "ja":
        score += 100
    ja_verified = [v for v in voice.verified_languages if str(v.get("language", "")).lower() == "ja"]
    if ja_verified:
        score += 60
        if any(str(v.get("model_id", "")) == model_id for v in ja_verified):
            score += 50
    return score


def _score_narrator_voice(voice: ElevenLabsVoiceInfo, *, model_id: str) -> int:
    score = 0
    lang = voice.labels.get("language", "").lower()
    if lang == "ja":
        score += 100
    ja_verified = [v for v in voice.verified_languages if str(v.get("language", "")).lower() == "ja"]
    if ja_verified:
        score += 60
        if any(str(v.get("model_id", "")) == model_id for v in ja_verified):
            score += 50

    gender = voice.labels.get("gender", "").lower()
    if gender == "male":
        score += 50

    age = voice.labels.get("age", "").lower()
    if age in {"middle_aged", "mature", "old"}:
        score += 25

    use_case = voice.labels.get("use_case", "").lower()
    if use_case in {"narrative_story", "informative_educational", "news", "documentary"}:
        score += 20

    descriptive = voice.labels.get("descriptive", "").lower()
    if descriptive in {"calm", "confident", "professional", "mature", "formal", "warm", "trustworthy"}:
        score += 15
    elif descriptive in {"hyped", "sassy", "rough", "cute"}:
        score -= 10

    desc_low = voice.description.lower()
    if any(
        kw in desc_low
        for kw in ("narrator", "explainer", "documentary", "calm", "trustworthy", "mature", "business", "intellectual")
    ):
        score += 10
    return score


def select_elevenlabs_voice(
    voices: Sequence[ElevenLabsVoiceInfo],
    preferred_voice: str | None = None,
    *,
    model_id: str = "eleven_v4",
) -> ElevenLabsVoiceInfo:
    """利用可能ボイス一覧から明示指定または規定優先順位で最適ボイスを選定する。

    優先順位:
    1. preferred_voice が 'auto' 以外の明示指定（voice_id 完全一致 -> name 一致 -> ID 形式直接採用）
    2. 自声クローン（PVC [professional + is_owner] > IVC [cloned]）
    3. 日本語・落ち着いた知的解説向け男性ボイス
    """
    pref = (preferred_voice or "").strip()
    if pref and pref.lower() != "auto":
        for v in voices:
            if v.voice_id == pref:
                return v
        pref_low = pref.lower()
        for v in voices:
            if v.name.lower() == pref_low:
                return v
        for v in voices:
            if pref_low in v.name.lower():
                return v
        if re.fullmatch(r"[A-Za-z0-9_-]{16,40}", pref):
            return ElevenLabsVoiceInfo(
                voice_id=pref,
                name=DEFAULT_ELEVENLABS_VOICE_NAME if pref == DEFAULT_ELEVENLABS_VOICE_ID else pref,
                category="explicit",
                is_owner=False,
                description="",
                labels={},
                verified_languages=(),
            )
        raise ElevenLabsError(f"Requested ElevenLabs voice not found: {pref!r}")

    if not voices:
        raise ElevenLabsError("No ElevenLabs voices returned from account.")

    own_clones = [v for v in voices if _score_own_clone_voice(v, model_id=model_id) >= 0]
    if own_clones:
        best_idx = max(
            range(len(own_clones)),
            key=lambda i: (_score_own_clone_voice(own_clones[i], model_id=model_id), -i),
        )
        return own_clones[best_idx]

    best_idx = max(
        range(len(voices)),
        key=lambda i: (_score_narrator_voice(voices[i], model_id=model_id), -i),
    )
    return voices[best_idx]


def _parse_elevenlabs_error(resp: Any, secret: str) -> tuple[str, str, str]:
    status_code = int(getattr(resp, "status_code", 0) or 0)
    raw_text = str(getattr(resp, "text", "") or "")
    err_status = ""
    err_msg = raw_text
    try:
        data = resp.json()
        if isinstance(data, Mapping):
            detail = data.get("detail")
            if isinstance(detail, Mapping):
                err_status = str(detail.get("status") or "")
                err_msg = str(detail.get("message") or raw_text)
            elif detail is not None:
                err_msg = str(detail)
    except Exception:
        pass
    safe_msg = redact_elevenlabs_secret(f"HTTP {status_code} {err_status}: {err_msg}".strip(), secret)
    return err_status.lower(), err_msg.lower(), safe_msg


def _parse_retry_after_header(resp: Any) -> float | None:
    headers = getattr(resp, "headers", None)
    if not headers:
        return None
    raw = None
    if hasattr(headers, "get"):
        raw = headers.get("retry-after") or headers.get("Retry-After")
    if not raw:
        return None
    try:
        return max(0.0, float(str(raw).strip()))
    except ValueError:
        return None


def _write_elevenlabs_audio_to_wav(
    audio_bytes: bytes,
    output_format: str,
    raw_wav: Path,
    *,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
) -> None:
    """ElevenLabs から返却された PCM/MP3/Opus/WAV バイト列を PCM WAV へ保存する。"""
    raw_wav.parent.mkdir(parents=True, exist_ok=True)
    if audio_bytes[:4] == b"RIFF":
        raw_wav.write_bytes(audio_bytes)
        return

    fmt_low = output_format.lower()
    if fmt_low.startswith("pcm_"):
        m = re.match(r"pcm_(\d+)", fmt_low)
        src_rate = int(m.group(1)) if m else 44100
        with wave.open(str(raw_wav), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(src_rate)
            wf.writeframes(audio_bytes)
        return

    ext = ".opus" if fmt_low.startswith("opus_") else ".mp3"
    tmp_encoded = raw_wav.with_name(f"{raw_wav.stem}_dl{ext}")
    tmp_encoded.write_bytes(audio_bytes)
    try:
        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(tmp_encoded),
                "-ar",
                str(sample_rate),
                "-ac",
                "1",
                "-c:a",
                "pcm_s16le",
                str(raw_wav),
            ]
        )
    finally:
        tmp_encoded.unlink(missing_ok=True)


class ElevenLabsTTSClient:
    """ElevenLabs TTS API（eleven_v4 主力・with-timestamps 同期対応）共通クライアント。"""

    provider_name: str = "elevenlabs"

    def __init__(
        self,
        api_key: str | None = None,
        *,
        voice_id: str | None = None,
        voice_name: str | None = None,
        models: Sequence[str] = DEFAULT_ELEVENLABS_MODELS,
        language_code: str | None = DEFAULT_ELEVENLABS_LANGUAGE_CODE,
        voice_settings: Mapping[str, Any] | None = None,
        output_formats: Sequence[str] = DEFAULT_ELEVENLABS_OUTPUT_FORMATS,
        use_timestamps: bool = True,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        request_interval_sec: float = DEFAULT_ELEVENLABS_MIN_INTERVAL_SEC,
        timeout_sec: float = DEFAULT_ELEVENLABS_HTTP_TIMEOUT_SEC,
        max_retries: int = 3,
        attempts_per_model: int = 2,
        trim_pre_filters: str | None = None,
        trim_post_filters: str | None = None,
        base_url: str = ELEVENLABS_API_BASE_URL,
        repo_root: Path | None = None,
        load_env: bool = True,
        http_client: Any | None = None,
        clock: Callable[[], float] | None = None,
        sleep_fn: Callable[[float], None] | None = None,
    ) -> None:
        self._explicit_api_key = api_key if (api_key is not None and api_key.strip()) else None
        self._api_key: str | None = self._explicit_api_key
        self._repo_root = repo_root
        self._load_env = load_env
        self._base_url = base_url.rstrip("/")

        explicit_voice = (voice_name or "").strip() or (voice_id or "").strip()
        if explicit_voice:
            self.voice_preference: str = explicit_voice
        else:
            env_voice = os.environ.get("ELEVENLABS_VOICE_ID", "").strip()
            if not env_voice and self._load_env and self._explicit_api_key is None:
                load_dotenv(self._repo_root)
                env_voice = os.environ.get("ELEVENLABS_VOICE_ID", "").strip()
            self.voice_preference = env_voice or DEFAULT_ELEVENLABS_VOICE_ID
        self.models: tuple[str, ...] = tuple(models) if models else DEFAULT_ELEVENLABS_MODELS
        self.language_code: str | None = normalize_elevenlabs_language_code(language_code)
        self.voice_settings: dict[str, Any] = (
            dict(voice_settings) if voice_settings is not None else dict(DEFAULT_ELEVENLABS_VOICE_SETTINGS)
        )
        self.output_formats: tuple[str, ...] = (
            tuple(output_formats) if output_formats else DEFAULT_ELEVENLABS_OUTPUT_FORMATS
        )
        self.use_timestamps = bool(use_timestamps)
        self.sample_rate = int(sample_rate)
        self.request_interval_sec = max(0.0, float(request_interval_sec))
        self.timeout_sec = max(5.0, float(timeout_sec))
        self.max_retries = max(1, int(max_retries))
        self.attempts_per_model = max(1, int(attempts_per_model))
        self.trim_pre_filters = trim_pre_filters
        self.trim_post_filters = trim_post_filters

        self._http_client = http_client
        self._owns_http_client = http_client is None
        self._clock = clock or time.monotonic
        self._sleep = sleep_fn or time.sleep
        self._next_ready_at: float = 0.0

        self._voices_cache: list[ElevenLabsVoiceInfo] | None = None
        self._resolved_voices: dict[str, ElevenLabsVoiceInfo] = {}
        self._resolved_output_format: str | None = None
        self._timestamps_unsupported_models: set[str] = set()

    def close(self) -> None:
        if self._owns_http_client and self._http_client is not None:
            close_fn = getattr(self._http_client, "close", None)
            if callable(close_fn):
                close_fn()
            self._http_client = None

    def _ensure_api_key(self) -> str:
        if self._api_key is None:
            self._api_key = resolve_elevenlabs_api_key(
                self._explicit_api_key,
                repo_root=self._repo_root,
                load_env=self._load_env,
            )
        return self._api_key

    def _key_label(self) -> str:
        return "elevenlabs(explicit)" if self._explicit_api_key else "elevenlabs(env)"

    def _get_http_client(self) -> Any:
        if self._http_client is None:
            self._http_client = httpx.Client(timeout=self.timeout_sec)
        return self._http_client

    def _pace(self) -> None:
        if self.request_interval_sec <= 0.0:
            return
        now = self._clock()
        wait_sec = self._next_ready_at - now
        if wait_sec > 0.0:
            self._sleep(wait_sec)
        self._next_ready_at = self._clock() + self.request_interval_sec

    def _request_with_retry(
        self,
        method: str,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
        json_body: Mapping[str, Any] | None = None,
        accept: str = "application/json",
    ) -> Any:
        api_key = self._ensure_api_key()
        client = self._get_http_client()
        url = f"{self._base_url}{path}"
        headers = {
            "xi-api-key": api_key,
            "Accept": accept,
        }
        if json_body is not None:
            headers["Content-Type"] = "application/json"

        last_err: Exception | None = None
        for attempt in range(self.max_retries):
            self._pace()
            try:
                if method == "GET":
                    resp = client.get(url, headers=headers, params=params)
                else:
                    resp = client.post(url, headers=headers, params=params, json=json_body)
            except Exception as exc:
                last_err = exc
                safe_err = redact_elevenlabs_secret(str(exc), api_key)
                if attempt + 1 < self.max_retries:
                    delay = min(16.0, 1.5 * (2**attempt))
                    self._sleep(delay)
                    continue
                raise ElevenLabsError(f"ElevenLabs transport error: {safe_err}") from exc

            status_code = int(getattr(resp, "status_code", 0) or 0)
            if 200 <= status_code < 300:
                return resp

            err_status, err_msg_low, safe_msg = _parse_elevenlabs_error(resp, api_key)

            if status_code == 401 or err_status in {"invalid_api_key", "missing_permissions", "unauthorized"}:
                raise ElevenLabsAuthError(f"ElevenLabs authentication failed: {safe_msg}")

            if (
                status_code == 402
                or "quota_exceeded" in err_status
                or "quota" in err_msg_low
                or "insufficient_credits" in err_status
                or "credit" in err_msg_low
                and "exceed" in err_msg_low
            ):
                raise ElevenLabsQuotaExceededError(f"ElevenLabs quota/credits exhausted: {safe_msg}")

            if status_code in {400, 403} and any(
                tok in err_msg_low or tok in err_status
                for tok in (
                    "output_format",
                    "pcm_",
                    "mp3_",
                    "subscription",
                    "tier",
                    "pro",
                    "creator",
                    "not_allowed",
                    "not allowed",
                )
            ):
                raise ElevenLabsFormatNotAllowedError(f"ElevenLabs output_format rejected: {safe_msg}")

            if status_code == 403:
                raise ElevenLabsAuthError(f"ElevenLabs forbidden: {safe_msg}")

            if status_code in {429, 500, 502, 503, 504}:
                last_err = ElevenLabsError(f"ElevenLabs transient error: {safe_msg}")
                if attempt + 1 < self.max_retries:
                    retry_after = _parse_retry_after_header(resp)
                    delay = retry_after if retry_after is not None else min(20.0, 1.5 * (2**attempt))
                    self._sleep(delay)
                    continue
                raise last_err

            raise ElevenLabsError(f"ElevenLabs API error: {safe_msg}")

        assert last_err is not None
        raise last_err

    def list_voices(self, *, refresh: bool = False) -> list[ElevenLabsVoiceInfo]:
        """アカウント内で利用可能なボイス一覧を取得する。"""
        if self._voices_cache is not None and not refresh:
            return list(self._voices_cache)
        resp = self._request_with_retry("GET", "/voices")
        data = resp.json()
        raw_voices = data.get("voices") if isinstance(data, Mapping) else []
        voices = [
            ElevenLabsVoiceInfo.from_api_dict(v)
            for v in (raw_voices or [])
            if isinstance(v, Mapping) and v.get("voice_id")
        ]
        self._voices_cache = voices
        return list(voices)

    def resolve_voice(
        self,
        preferred_voice: str | None = None,
        *,
        model_id: str = "eleven_v4",
    ) -> ElevenLabsVoiceInfo:
        """明示ボイスまたは自動選定ロジックで ElevenLabsVoiceInfo を解決・キャッシュする。"""
        pref = (
            preferred_voice or self.voice_preference or DEFAULT_ELEVENLABS_VOICE_ID
        ).strip() or DEFAULT_ELEVENLABS_VOICE_ID
        cache_key = f"{pref}::{model_id}"
        if cache_key in self._resolved_voices:
            return self._resolved_voices[cache_key]

        if pref.lower() != "auto" and re.fullmatch(r"[A-Za-z0-9_-]{16,40}", pref) and self._voices_cache is None:
            # 明示的な voice_id 指定時は余分な /voices 通信をせず、ただし利用可能ならキャッシュ検索
            info = ElevenLabsVoiceInfo(
                voice_id=pref,
                name=DEFAULT_ELEVENLABS_VOICE_NAME if pref == DEFAULT_ELEVENLABS_VOICE_ID else pref,
                category="explicit",
                is_owner=False,
                description="",
                labels={},
                verified_languages=(),
            )
            self._resolved_voices[cache_key] = info
            return info

        voices = self.list_voices()
        selected = select_elevenlabs_voice(voices, preferred_voice=pref, model_id=model_id)
        self._resolved_voices[cache_key] = selected
        return selected

    def generate_audio_bytes(
        self,
        text: str,
        *,
        model_name: str = "eleven_v4",
        voice_id: str | None = None,
        language_code: str | None = DEFAULT_ELEVENLABS_LANGUAGE_CODE,
        voice_settings: Mapping[str, Any] | None = None,
        sanitize: bool = True,
        with_timestamps: bool | None = None,
    ) -> tuple[bytes, str, CharacterAlignment | None, ElevenLabsVoiceInfo]:
        """1テキストの音声バイト列と（可能なら）文字単位アライメントを生成して返す。"""
        payload_text = sanitize_japanese_text(text) if sanitize else text
        voice_info = self.resolve_voice(voice_id, model_id=model_name)
        eff_lang = normalize_elevenlabs_language_code(
            language_code if language_code is not None else self.language_code
        )
        eff_settings = _filter_voice_settings(
            model_name,
            voice_settings if voice_settings is not None else self.voice_settings,
        )

        body: dict[str, Any] = {
            "text": payload_text,
            "model_id": model_name,
        }
        if eff_lang:
            body["language_code"] = eff_lang
        if eff_settings:
            body["voice_settings"] = eff_settings

        want_ts = self.use_timestamps if with_timestamps is None else bool(with_timestamps)
        if model_name in self._timestamps_unsupported_models:
            want_ts = False

        if self._resolved_output_format:
            format_candidates = [
                self._resolved_output_format,
                *[f for f in self.output_formats if f != self._resolved_output_format],
            ]
        else:
            format_candidates = list(self.output_formats)

        last_format_err: Exception | None = None
        for out_fmt in format_candidates:
            try:
                if want_ts:
                    try:
                        resp = self._request_with_retry(
                            "POST",
                            f"/text-to-speech/{voice_info.voice_id}/with-timestamps",
                            params={"output_format": out_fmt},
                            json_body=body,
                            accept="application/json",
                        )
                        data = resp.json()
                        b64_audio = data.get("audio_base64")
                        if not b64_audio:
                            raise ElevenLabsError("Missing audio_base64 in with-timestamps response")
                        audio_bytes = base64.b64decode(b64_audio)
                        alignment = CharacterAlignment.from_elevenlabs_payload(data)
                        self._resolved_output_format = out_fmt
                        return audio_bytes, out_fmt, alignment, voice_info
                    except (ElevenLabsAuthError, ElevenLabsQuotaExceededError, ElevenLabsFormatNotAllowedError):
                        raise
                    except ElevenLabsError as exc:
                        # with-timestamps 非対応や JSON パース異常時は標準エンドポイントへフォールバック
                        if any(code in str(exc) for code in ("HTTP 400", "HTTP 404", "HTTP 422")):
                            self._timestamps_unsupported_models.add(model_name)
                        else:
                            raise

                resp = self._request_with_retry(
                    "POST",
                    f"/text-to-speech/{voice_info.voice_id}",
                    params={"output_format": out_fmt},
                    json_body=body,
                    accept="audio/*",
                )
                audio_bytes = bytes(getattr(resp, "content", b"") or b"")
                if not audio_bytes:
                    raise ElevenLabsError("Empty audio response from ElevenLabs TTS endpoint")
                self._resolved_output_format = out_fmt
                return audio_bytes, out_fmt, None, voice_info
            except ElevenLabsFormatNotAllowedError as exc:
                last_format_err = exc
                if self._resolved_output_format == out_fmt:
                    self._resolved_output_format = None
                continue

        assert last_format_err is not None
        raise last_format_err

    def _trim_with_optional_alignment(
        self,
        raw_wav: Path,
        clean_wav: Path,
        *,
        stop_duration: float,
        raw_alignment: CharacterAlignment | None,
        clean_align_json: Path,
    ) -> tuple[float, CharacterAlignment | None]:
        if raw_alignment is not None:
            dur, lead_trim = trim_leading_trailing_and_resample_tts(
                raw_wav,
                clean_wav,
                sample_rate=self.sample_rate,
                pre_filters=self.trim_pre_filters,
                post_filters=self.trim_post_filters,
                alignment=raw_alignment,
            )
            clean_alignment = raw_alignment.shifted_and_scaled(offset_sec=lead_trim, time_scale=1.0, max_sec=dur)
            clean_alignment.save_json(clean_align_json)
            return dur, clean_alignment

        clean_align_json.unlink(missing_ok=True)
        dur = trim_and_resample_tts(
            raw_wav,
            clean_wav,
            sample_rate=self.sample_rate,
            stop_duration=stop_duration,
            pre_filters=self.trim_pre_filters,
            post_filters=self.trim_post_filters,
        )
        return dur, None

    def synthesize_chunk(
        self,
        chunk: NarrationChunk,
        out_dir: Path,
        *,
        force: bool = False,
        stop_duration: float = 0.14,
        max_expected_sec: float | None = None,
        models: Sequence[str] | None = None,
    ) -> SynthesizedChunk:
        """1 チャンクを生成（または有効キャッシュ利用）し、計測済み SynthesizedChunk を返す。"""
        out_dir.mkdir(parents=True, exist_ok=True)
        pure_text = sanitize_japanese_text(chunk.text)
        raw_wav = out_dir / f"{chunk.chunk_id}_raw.wav"
        clean_wav = out_dir / f"{chunk.chunk_id}.wav"
        raw_align_json = out_dir / f"{chunk.chunk_id}_raw_alignment.json"
        clean_align_json = out_dir / f"{chunk.chunk_id}_alignment.json"
        max_dur = max_expected_sec if max_expected_sec is not None else max(4.0, len(pure_text) * 0.30 + 2.0)

        if not force and raw_wav.is_file() and raw_wav.stat().st_size > 4000:
            raw_align = CharacterAlignment.load_json(raw_align_json) if raw_align_json.is_file() else None
            if raw_align is not None:
                dur, clean_align = self._trim_with_optional_alignment(
                    raw_wav,
                    clean_wav,
                    stop_duration=stop_duration,
                    raw_alignment=raw_align,
                    clean_align_json=clean_align_json,
                )
            elif clean_align_json.is_file() and clean_wav.is_file() and clean_wav.stat().st_size > 4000:
                dur = ffprobe_duration(clean_wav)
                clean_align = CharacterAlignment.load_json(clean_align_json)
            else:
                dur, clean_align = self._trim_with_optional_alignment(
                    raw_wav,
                    clean_wav,
                    stop_duration=stop_duration,
                    raw_alignment=None,
                    clean_align_json=clean_align_json,
                )
            if 0.35 <= dur <= max_dur:
                return SynthesizedChunk(
                    chunk_id=chunk.chunk_id,
                    text=pure_text,
                    raw_wav=raw_wav,
                    clean_wav=clean_wav,
                    duration_sec=dur,
                    pause_after_sec=chunk.pause_after_sec,
                    model_used="cached",
                    cached=True,
                    voice_used=chunk.voice_name or self.voice_preference,
                    key_label=self._key_label(),
                    provider=self.provider_name,
                    alignment=clean_align,
                )

        api_key = self._ensure_api_key()
        model_order = tuple(models) if models is not None else self.models
        last_err: Exception | None = None

        for model_name in model_order:
            for attempt in range(1, self.attempts_per_model + 1):
                try:
                    audio_bytes, out_fmt, raw_align, voice_info = self.generate_audio_bytes(
                        pure_text,
                        model_name=model_name,
                        voice_id=chunk.voice_name,
                        language_code=self.language_code,
                        voice_settings=self.voice_settings,
                        sanitize=False,
                    )
                    _write_elevenlabs_audio_to_wav(
                        audio_bytes,
                        out_fmt,
                        raw_wav,
                        sample_rate=self.sample_rate,
                    )
                    if raw_align is not None:
                        raw_align.save_json(raw_align_json)
                    else:
                        raw_align_json.unlink(missing_ok=True)

                    dur, clean_align = self._trim_with_optional_alignment(
                        raw_wav,
                        clean_wav,
                        stop_duration=stop_duration,
                        raw_alignment=raw_align,
                        clean_align_json=clean_align_json,
                    )
                    if not (0.35 <= dur <= max_dur):
                        raise ElevenLabsError(
                            f"Abnormal ElevenLabs TTS duration {dur:.3f}s (expected 0.35..{max_dur:.2f}s)"
                        )
                    return SynthesizedChunk(
                        chunk_id=chunk.chunk_id,
                        text=pure_text,
                        raw_wav=raw_wav,
                        clean_wav=clean_wav,
                        duration_sec=dur,
                        pause_after_sec=chunk.pause_after_sec,
                        model_used=model_name,
                        cached=False,
                        voice_used=voice_info.voice_id,
                        key_label=self._key_label(),
                        provider=self.provider_name,
                        alignment=clean_align,
                        voice_display_name=voice_info.name,
                    )
                except (ElevenLabsAuthError, ElevenLabsQuotaExceededError):
                    raise
                except Exception as exc:
                    last_err = exc
                    safe_msg = redact_elevenlabs_secret(str(exc), api_key)
                    print(
                        f"[TTS-EL:{chunk.chunk_id}] {model_name} attempt {attempt}/"
                        f"{self.attempts_per_model} failed: {type(exc).__name__}: {safe_msg[:160]}"
                    )
            print(f"[TTS-EL:{chunk.chunk_id}] falling back from {model_name}")

        safe_last = redact_elevenlabs_secret(str(last_err), api_key) if last_err else "unknown error"
        raise ElevenLabsError(f"ElevenLabs TTS failed for {chunk.chunk_id}: {safe_last}") from last_err

    def synthesize_chunks(
        self,
        chunks: Sequence[NarrationChunk],
        out_dir: Path,
        *,
        force: bool = False,
        stop_duration: float = 0.14,
    ) -> tuple[list[SynthesizedChunk], str]:
        """複数チャンクを順次生成し、結果リストと主使用モデル名を返す。"""
        results: list[SynthesizedChunk] = []
        used_model = "cached"
        locked_voice_id: str | None = None
        for chunk in chunks:
            effective_chunk = chunk
            if not chunk.voice_name and locked_voice_id:
                effective_chunk = NarrationChunk(
                    chunk_id=chunk.chunk_id,
                    text=chunk.text,
                    pause_after_sec=chunk.pause_after_sec,
                    voice_name=locked_voice_id,
                    meta=chunk.meta,
                )
            res = self.synthesize_chunk(effective_chunk, out_dir, force=force, stop_duration=stop_duration)
            if not res.cached:
                used_model = res.model_used
                if res.voice_used:
                    locked_voice_id = res.voice_used
            results.append(res)
        return results, used_model

    def _trim_onetake_audio(
        self,
        raw_wav: Path,
        clean_wav: Path,
        *,
        raw_alignment: CharacterAlignment | None,
        clean_align_json: Path,
    ) -> tuple[float, CharacterAlignment | None]:
        """ワンテイク音声の内部無音を破壊せず前後無音のみトリムし、アライメント時刻をシフトする。"""
        dur, lead_trim = trim_leading_trailing_and_resample_tts(
            raw_wav,
            clean_wav,
            sample_rate=self.sample_rate,
            pre_filters=self.trim_pre_filters,
            post_filters=self.trim_post_filters,
            alignment=raw_alignment,
        )
        if raw_alignment is not None:
            clean_align = raw_alignment.shifted_and_scaled(offset_sec=lead_trim, time_scale=1.0, max_sec=dur)
            clean_align.save_json(clean_align_json)
            return dur, clean_align
        clean_align_json.unlink(missing_ok=True)
        return dur, None

    @staticmethod
    def _align_onetake_block(
        chunks: Sequence[NarrationChunk],
        joined_text: str,
        separator: str,
        clean_wav: Path,
        dur: float,
        clean_align: CharacterAlignment | None,
        *,
        aligner: Literal["auto", "acoustic_dp", "ffmpeg_whisper"] = "auto",
        whisper_model_path: Path | str | None = None,
    ) -> tuple[list[AlignedChunkSpan], str, dict[str, Any]]:
        """文字単位アライメントを優先適用し、欠落・不整合時は acoustic_dp へフォールバックする。"""
        if clean_align is not None:
            aligned_res = align_chunks_with_character_alignment(
                chunks,
                joined_text,
                separator,
                clean_align,
                clean_wav,
                total_duration_sec=dur,
            )
            if aligned_res is not None:
                spans, summary = aligned_res
                return spans, "elevenlabs_char_alignment", summary
        return align_chunks_to_wav(
            chunks,
            clean_wav,
            aligner=aligner,
            whisper_model_path=whisper_model_path,
        )

    def synthesize_onetake_block(
        self,
        chunks: Sequence[NarrationChunk],
        out_dir: Path,
        *,
        block_id: str = "onetake_block",
        force: bool = False,
        separator: str = "\n",
        min_expected_sec: float | None = None,
        max_expected_sec: float | None = None,
        models: Sequence[str] | None = None,
        aligner: Literal["auto", "acoustic_dp", "ffmpeg_whisper"] = "auto",
        whisper_model_path: Path | str | None = None,
    ) -> OneTakeSynthesisResult:
        """複数チャンク（1章・60〜90秒分）を単一モデル・単一ボイス・1 API リクエストで一括生成し自動同期する。"""
        out_dir.mkdir(parents=True, exist_ok=True)
        joined_text, pure_texts, target_voice = compose_onetake_prompt(
            chunks,
            separator=separator,
            default_voice=self.voice_preference,
        )
        effective_voice = target_voice or self.voice_preference or DEFAULT_ELEVENLABS_VOICE_ID
        raw_wav = out_dir / f"{block_id}_raw.wav"
        clean_wav = out_dir / f"{block_id}.wav"
        raw_align_json = out_dir / f"{block_id}_raw_alignment.json"
        clean_align_json = out_dir / f"{block_id}_alignment.json"
        meta_path = out_dir / f"{block_id}_meta.json"

        sig_payload = json.dumps(
            {
                "texts": pure_texts,
                "separator": separator,
                "voice": effective_voice,
                "language_code": self.language_code,
                "voice_settings": self.voice_settings,
                "use_timestamps": self.use_timestamps,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
        signature = hashlib.sha256(sig_payload.encode("utf-8")).hexdigest()

        total_mora = sum(max(0.5, estimate_japanese_morae(t)) for t in pure_texts)
        min_dur = min_expected_sec if min_expected_sec is not None else max(0.5, total_mora * 0.045)
        max_dur = max_expected_sec if max_expected_sec is not None else max(6.0, len(joined_text) * 0.34 + 6.0)

        if not force and raw_wav.is_file() and raw_wav.stat().st_size > 4000 and meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                meta = {}
            if meta.get("signature") == signature:
                raw_align = CharacterAlignment.load_json(raw_align_json) if raw_align_json.is_file() else None
                dur, clean_align = self._trim_onetake_audio(
                    raw_wav,
                    clean_wav,
                    raw_alignment=raw_align,
                    clean_align_json=clean_align_json,
                )
                if min_dur <= dur <= max_dur:
                    spans, aligner_used, summary = self._align_onetake_block(
                        chunks,
                        joined_text,
                        separator,
                        clean_wav,
                        dur,
                        clean_align,
                        aligner=aligner,
                        whisper_model_path=whisper_model_path,
                    )
                    silences = tuple(detect_silence_intervals(clean_wav, min_duration_sec=0.06))
                    return OneTakeSynthesisResult(
                        block_id=block_id,
                        raw_wav=raw_wav,
                        clean_wav=clean_wav,
                        total_duration_sec=dur,
                        model_used=str(meta.get("modelUsed", "cached")),
                        voice_used=str(meta.get("voiceUsed", effective_voice)),
                        key_label=meta.get("keyLabel"),
                        cached=True,
                        api_calls=0,
                        aligner_used=aligner_used,
                        alignment_summary=summary,
                        chunks=tuple(spans),
                        silences=silences,
                        character_alignment=clean_align,
                    )

        api_key = self._ensure_api_key()
        model_order = tuple(models) if models is not None else self.models
        last_err: Exception | None = None

        for model_name in model_order:
            for attempt in range(1, self.attempts_per_model + 1):
                try:
                    audio_bytes, out_fmt, raw_align, voice_info = self.generate_audio_bytes(
                        joined_text,
                        model_name=model_name,
                        voice_id=effective_voice,
                        language_code=self.language_code,
                        voice_settings=self.voice_settings,
                        sanitize=False,
                        with_timestamps=self.use_timestamps,
                    )
                    _write_elevenlabs_audio_to_wav(
                        audio_bytes,
                        out_fmt,
                        raw_wav,
                        sample_rate=self.sample_rate,
                    )
                    if raw_align is not None:
                        raw_align.save_json(raw_align_json)
                    else:
                        raw_align_json.unlink(missing_ok=True)

                    dur, clean_align = self._trim_onetake_audio(
                        raw_wav,
                        clean_wav,
                        raw_alignment=raw_align,
                        clean_align_json=clean_align_json,
                    )
                    if not (min_dur <= dur <= max_dur):
                        raise ElevenLabsError(
                            f"Abnormal one-take ElevenLabs TTS duration {dur:.3f}s (expected {min_dur:.2f}..{max_dur:.2f}s)"
                        )
                    spans, aligner_used, summary = self._align_onetake_block(
                        chunks,
                        joined_text,
                        separator,
                        clean_wav,
                        dur,
                        clean_align,
                        aligner=aligner,
                        whisper_model_path=whisper_model_path,
                    )
                    silences = tuple(detect_silence_intervals(clean_wav, min_duration_sec=0.06))
                    key_lbl = self._key_label()
                    meta_payload = {
                        "blockId": block_id,
                        "signature": signature,
                        "chunkIds": [c.chunk_id for c in chunks],
                        "modelUsed": model_name,
                        "voiceUsed": voice_info.voice_id,
                        "voiceDisplayName": voice_info.name,
                        "keyLabel": key_lbl,
                        "totalDurationSec": round(dur, 4),
                        "alignerUsed": aligner_used,
                        "alignmentSummary": summary,
                    }
                    meta_path.write_text(json.dumps(meta_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                    return OneTakeSynthesisResult(
                        block_id=block_id,
                        raw_wav=raw_wav,
                        clean_wav=clean_wav,
                        total_duration_sec=dur,
                        model_used=model_name,
                        voice_used=voice_info.voice_id,
                        key_label=key_lbl,
                        cached=False,
                        api_calls=1,
                        aligner_used=aligner_used,
                        alignment_summary=summary,
                        chunks=tuple(spans),
                        silences=silences,
                        character_alignment=clean_align,
                    )
                except (ElevenLabsAuthError, ElevenLabsQuotaExceededError):
                    raise
                except Exception as exc:
                    last_err = exc
                    safe_msg = redact_elevenlabs_secret(str(exc), api_key)
                    print(
                        f"[TTS-EL-1TAKE:{block_id}] {model_name}/{effective_voice} attempt {attempt}/"
                        f"{self.attempts_per_model} failed: {type(exc).__name__}: {safe_msg[:160]}"
                    )
            print(f"[TTS-EL-1TAKE:{block_id}] falling back from {model_name}")

        safe_last = redact_elevenlabs_secret(str(last_err), api_key) if last_err else "unknown error"
        raise ElevenLabsError(f"One-take ElevenLabs TTS failed for {block_id}: {safe_last}") from last_err
