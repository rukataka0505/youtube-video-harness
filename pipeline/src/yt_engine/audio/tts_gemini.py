"""Gemini TTS (v1beta) による純日本語ナレーション生成＋音声先行タイムライン構築モジュール。

主なノウハウ:
1. 英語指示文（「Read calmly in Japanese:」等）をプロンプトに混入すると音声モデルがそのまま
   英語を発話する事故が起きるため、純日本語テキストのみを送信する（sanitize_japanese_text）。
2. ffmpeg silenceremove で前後および句読点間の冗長な無音を圧縮し、テンポを最適化する。
3. ffprobe で全チャンクの実尺を計測してから Remotion タイムライン（JSON / TS）を確定させる。
4. Paid Tier 1（10 RPM）基準のキー単位ペーシング・2キー自動フェイルオーバー（GEMINI_API_KEY /
   GEMINI_API_KEY_FALLBACK）・429原因判別（RPM超過 vs RPD日次枯渇）・サーキットブレーカーを備える。
"""

from __future__ import annotations

import array
import base64
import hashlib
import json
import math
import os
import random
import re
import shutil
import subprocess
import time
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Literal, Mapping, Sequence, TypeVar

from yt_engine.config import find_repo_root

if TYPE_CHECKING:
    from google import genai
    from google.genai import types


DEFAULT_TTS_MODELS: tuple[str, ...] = (
    "gemini-3.8-flash-tts",
    "gemini-3.8-flash-lite-tts",
    "gemini-2.5-flash-preview-tts",
)
DEFAULT_SAMPLE_RATE = 48000
DEFAULT_FPS = 30
DEFAULT_KEY_MIN_INTERVAL_SEC: float = 6.5
DEFAULT_RATE_LIMIT_FALLBACK_DELAY_SEC: float = 7.0
DEFAULT_MAX_RETRY_DELAY_SEC: float = 90.0

_T = TypeVar("_T")


class _UnsetType:
    """引数未指定と明示的 None を区別するためのセンチネル型。"""

    def __repr__(self) -> str:
        return "<UNSET>"


_UNSET: Any = _UnsetType()

# 先頭に誤って混入しやすい英語指示プレフィックスやト書き括弧の検出パターン
_STAGE_DIRECTION_RE = re.compile(r"\[[^\]]*\]")
_ENGLISH_INSTRUCTION_PREFIX_RE = re.compile(
    r"^\s*(?:read|speak|say|narrate|voice|tone|style|in japanese)[^。\n:]*[:：]\s*",
    re.IGNORECASE,
)
_SENTENCE_SPLIT_RE = re.compile(r"[^。！？!?]+[。！？!?]*")
_SMALL_KANA_SET = frozenset("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ")
_PAUSE_PUNCT_SET = frozenset("、,，・：:")
_SENTENCE_PUNCT_SET = frozenset("。！？!?")

BoundarySource = Literal[
    "silence_boundary",
    "energy_valley",
    "whisper_match",
    "proportional_fallback",
    "elevenlabs_char_alignment",
]


@dataclass(frozen=True)
class NarrationChunk:
    """音声先行タイムライン用の 1 発話チャンク定義。"""

    chunk_id: str
    text: str
    pause_after_sec: float = 0.25
    voice_name: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SynthesizedChunk:
    """生成またはキャッシュ読込された 1 チャンクの計測結果。"""

    chunk_id: str
    text: str
    raw_wav: Path
    clean_wav: Path
    duration_sec: float
    pause_after_sec: float
    model_used: str
    cached: bool
    voice_used: str | None = None
    key_label: str | None = None
    provider: str = "gemini"
    alignment: Any | None = None
    voice_display_name: str | None = None


@dataclass(frozen=True)
class SilenceInterval:
    """音声ファイル内の無音区間（秒・最小RMS dB）を表す。"""

    start_sec: float
    end_sec: float
    duration_sec: float
    min_db: float = -60.0

    @property
    def midpoint_sec(self) -> float:
        return 0.5 * (self.start_sec + self.end_sec)


@dataclass(frozen=True)
class AlignedChunkSpan:
    """ワンテイク音声から自動アライメントされた 1 チャンクの時間区間。"""

    chunk_id: str
    text: str
    start_sec: float
    speech_end_sec: float
    end_sec: float
    duration_sec: float
    pause_after_sec: float
    boundary_confidence: float
    boundary_source: BoundarySource
    internal_pauses_sec: tuple[float, ...] = ()
    sentence_spans: tuple[tuple[float, float, str], ...] = ()


@dataclass(frozen=True)
class OneTakeSynthesisResult:
    """章単位ワンテイク一括生成＋自動アライメント結果。"""

    block_id: str
    raw_wav: Path
    clean_wav: Path
    total_duration_sec: float
    model_used: str
    voice_used: str | None
    key_label: str | None
    cached: bool
    api_calls: int
    aligner_used: str
    alignment_summary: dict[str, Any]
    chunks: tuple[AlignedChunkSpan, ...]
    silences: tuple[SilenceInterval, ...] = ()
    character_alignment: Any | None = None


def load_dotenv(repo_root: Path | None = None) -> Path | None:
    """リポジトリ直下の .env を os.environ へ読み込む（既存環境変数は上書きしない）。"""
    if repo_root is None:
        try:
            repo_root = find_repo_root()
        except FileNotFoundError:
            return None

    env_path = repo_root / ".env"
    if not env_path.is_file():
        return None

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, val = stripped.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and val and key not in os.environ:
            os.environ[key] = val
    return env_path


def run_cmd(cmd: Sequence[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    """外部コマンド（ffmpeg / ffprobe 等）を UTF-8 で安全実行する。"""
    proc = subprocess.run(
        [str(part) for part in cmd],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if check and proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(map(str, cmd))}\n{proc.stderr}")
    return proc


def ffprobe_duration(path: Path | str) -> float:
    """ffprobe により音声/動画ファイルの実尺（秒）を正確に取得する。"""
    proc = run_cmd(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ]
    )
    return float(proc.stdout.strip())


def sanitize_japanese_text(text: str) -> str:
    """TTS誤発話を防ぐため、英語指示プレフィックスや [ト書き] を除去して純日本語テキストに整形する。"""
    cleaned = _STAGE_DIRECTION_RE.sub("", text)
    cleaned = _ENGLISH_INSTRUCTION_PREFIX_RE.sub("", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        raise ValueError("TTS input text became empty after sanitization; pure Japanese text is required.")
    return cleaned


def decode_inline_bytes(data: Any) -> bytes:
    """Gemini inline_data を raw bytes へ正規化する。"""
    if isinstance(data, (bytes, bytearray)):
        return bytes(data)
    if isinstance(data, str):
        return base64.b64decode(data)
    raise TypeError(f"Unsupported inline data type: {type(data)}")


def extract_audio_from_response(resp: Any) -> tuple[bytes, str]:
    """Gemini GenerateContentResponse から音声バイト列と MIME を抽出する。"""
    candidates = getattr(resp, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            inline = getattr(part, "inline_data", None)
            if inline and getattr(inline, "data", None):
                mime = getattr(inline, "mime_type", "") or "audio/L16;rate=24000"
                return decode_inline_bytes(inline.data), mime
    raise RuntimeError("No audio inline_data returned in Gemini TTS response")


def write_raw_audio_as_wav(raw_bytes: bytes, mime_type: str, out_wav: Path) -> None:
    """PCM または RIFF 音声バイト列を WAV ファイルとして保存する。"""
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    if raw_bytes[:4] == b"RIFF":
        out_wav.write_bytes(raw_bytes)
        return
    rate_match = re.search(r"rate=(\d+)", mime_type)
    src_rate = int(rate_match.group(1)) if rate_match else 24000
    with wave.open(str(out_wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(src_rate)
        wf.writeframes(raw_bytes)


def trim_and_resample_tts(
    raw_wav: Path,
    out_wav: Path,
    *,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    stop_duration: float = 0.14,
    pre_filters: str | None = None,
    post_filters: str | None = None,
) -> float:
    """ffmpeg silenceremove で前後・中間の冗長無音を圧縮し、指定サンプルレートのモノラルWAVへ整形する。

    pre_filters / post_filters には silenceremove の前後に挿入する ffmpeg フィルタ列
    （例: "highpass=f=75" / "equalizer=...,acompressor=..."）を任意で指定できる。
    """
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    af_parts: list[str] = []
    if pre_filters:
        af_parts.append(pre_filters.strip(","))
    af_parts.append(
        "silenceremove="
        "start_periods=1:start_duration=0:start_threshold=-40dB:"
        f"stop_periods=-1:stop_duration={stop_duration:.3f}:stop_threshold=-38dB,"
        "areverse,"
        "silenceremove=start_periods=1:start_duration=0:start_threshold=-40dB,"
        "areverse"
    )
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
    # 末尾クリックノイズ防止のための極短フェードアウト
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
    return ffprobe_duration(out_wav)


def _build_atempo_chain(tempo: float) -> str:
    """ffmpeg atempo の 0.5〜2.0 制約に合わせてフィルタチェーンを組み立てる。"""
    if tempo <= 0:
        raise ValueError(f"tempo must be positive, got {tempo}")
    factors: list[float] = []
    remaining = float(tempo)
    while remaining > 2.0:
        factors.append(2.0)
        remaining /= 2.0
    while remaining < 0.5:
        factors.append(0.5)
        remaining /= 0.5
    factors.append(remaining)
    return ",".join(f"atempo={f:.5f}" for f in factors)


def scale_wav_tempo(
    clean_wav: Path,
    paced_wav: Path,
    tempo: float,
    *,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
) -> float:
    """ffmpeg atempo で発話速度を微調整し、実尺（秒）を返す。"""
    paced_wav.parent.mkdir(parents=True, exist_ok=True)
    if abs(tempo - 1.0) < 0.005:
        shutil.copyfile(clean_wav, paced_wav)
        return ffprobe_duration(paced_wav)

    chain = _build_atempo_chain(tempo)
    run_cmd(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(clean_wav),
            "-af",
            chain,
            "-ar",
            str(sample_rate),
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(paced_wav),
        ]
    )
    return ffprobe_duration(paced_wav)


def detect_internal_pauses(
    wav_path: Path,
    *,
    noise_db: str = "-34dB",
    min_duration: float = 0.05,
    edge_margin_sec: float = 0.15,
) -> list[float]:
    """ffmpeg silencedetect によりチャンク内部の自然な息継ぎ位置（秒）を検出する。"""
    total_dur = ffprobe_duration(wav_path)
    proc = run_cmd(
        [
            "ffmpeg",
            "-i",
            str(wav_path),
            "-af",
            f"silencedetect=noise={noise_db}:d={min_duration:.3f}",
            "-f",
            "null",
            "-",
        ],
        check=False,
    )
    starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", proc.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([0-9.]+)", proc.stderr)]
    mids: list[float] = []
    for s, e in zip(starts, ends):
        mid = 0.5 * (s + e)
        if edge_margin_sec < mid < total_dur - edge_margin_sec:
            mids.append(mid)
    return mids


def snap_to_pause(target_sec: float, pauses: Sequence[float], tolerance: float = 0.42) -> float:
    """文字割合で推定した切替時刻を、近傍の自然な息継ぎ位置へスナップする。"""
    best = target_sec
    best_dist = tolerance
    for p in pauses:
        d = abs(p - target_sec)
        if d < best_dist:
            best_dist = d
            best = p
    return best


def estimate_japanese_morae(text: str) -> float:
    """日本語テキストの推定モーラ（拍）数を算出する（句点はポーズ扱いとして 0.0）。"""
    total = 0.0
    for ch in text:
        if ch.isspace():
            continue
        if ch in _SMALL_KANA_SET:
            total += 0.15
        elif ch in _PAUSE_PUNCT_SET:
            total += 1.6
        elif ch in _SENTENCE_PUNCT_SET:
            total += 0.0
        elif ("\u4e00" <= ch <= "\u9fff") or ch == "々":
            total += 1.95
        elif ("\u3040" <= ch <= "\u30ff") or ch == "ー":
            total += 1.0
        elif ch.isdigit():
            total += 1.5
        elif ch.isascii() and ch.isalpha():
            total += 0.8
        else:
            total += 0.2
    return total


def split_japanese_sentences(text: str) -> list[str]:
    """チャンク内のテキストを句点（。！？）単位の文リストへ分割する。"""
    cleaned = text.strip()
    if not cleaned:
        return []
    parts = [m.group(0).strip() for m in _SENTENCE_SPLIT_RE.finditer(cleaned)]
    parts = [p for p in parts if p]
    return parts if parts else [cleaned]


def compose_onetake_prompt(
    chunks: Sequence[NarrationChunk],
    *,
    separator: str = "\n",
    default_voice: str | None = None,
) -> tuple[str, list[str], str | None]:
    """複数チャンクを単一ボイス検証・純日本語サニタイズした上で 1 本のワンテイク原稿へ結合する。"""
    if not chunks:
        raise ValueError("chunks must not be empty for one-take TTS synthesis")

    pure_texts: list[str] = []
    resolved_voices: set[str] = set()
    for chunk in chunks:
        pure_texts.append(sanitize_japanese_text(chunk.text))
        explicit = chunk.voice_name.strip() if chunk.voice_name and chunk.voice_name.strip() else None
        effective_voice = explicit if explicit is not None else (default_voice.strip() if default_voice else "")
        resolved_voices.add(effective_voice)

    non_empty_voices = {v for v in resolved_voices if v}
    if len(resolved_voices) > 1 or len(non_empty_voices) > 1:
        raise ValueError(
            f"All chunks in a one-take block must share a single voice_name, got: {sorted(resolved_voices)}"
        )

    target_voice = next(iter(non_empty_voices), default_voice)
    return separator.join(pure_texts), pure_texts, target_voice


def trim_onetake_tts(
    raw_wav: Path,
    out_wav: Path,
    *,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    max_internal_silence_sec: float | None = None,
    keep_silence_sec: float = 0.36,
    pre_filters: str | None = None,
    post_filters: str | None = None,
) -> float:
    """ワンテイク音声の前後無音のみをトリムし、内部の自然な間を保ったまま 48kHz モノラル WAV へ整形する。

    max_internal_silence_sec が指定された場合のみ、それ以上の異常長無音を穏やかに圧縮する。
    """
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    af_parts: list[str] = []
    if pre_filters:
        af_parts.append(pre_filters.strip(","))

    start_trim = "silenceremove=start_periods=1:start_duration=0:start_threshold=-40dB"
    if max_internal_silence_sec is not None and max_internal_silence_sec > 0.0:
        # ffmpeg silenceremove は stop_duration 分だけ無音を残してそれ以降を除去する（stop_silence を足すと二重加算になるため省略）
        capped = max(0.05, float(max_internal_silence_sec))
        start_trim += f":stop_periods=-1:stop_duration={capped:.3f}:stop_threshold=-38dB"
    af_parts.append(start_trim)
    af_parts.append("areverse")
    af_parts.append("silenceremove=start_periods=1:start_duration=0:start_threshold=-40dB")
    af_parts.append("areverse")
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
    return ffprobe_duration(out_wav)


def _compute_wav_rms_db_curve(
    wav_path: Path,
    *,
    frame_ms: float = 10.0,
) -> tuple[list[float], list[float], float, float] | None:
    """16bit PCM WAV から (times_sec, frame_dbs, total_dur_sec, dt_sec) を算出する。"""
    if wav_path.suffix.lower() != ".wav" or not wav_path.is_file():
        return None
    try:
        with wave.open(str(wav_path), "rb") as wf:
            if wf.getsampwidth() != 2:
                return None
            nchannels = wf.getnchannels()
            sr = wf.getframerate()
            nframes = wf.getnframes()
            if sr <= 0 or nframes <= 0:
                return None
            raw = wf.readframes(nframes)
    except wave.Error:
        return None

    samples = array.array("h")
    samples.frombytes(raw)
    if nchannels > 1:
        mono = [
            sum(samples[i + ch] for ch in range(nchannels)) / nchannels
            for i in range(0, len(samples) - nchannels + 1, nchannels)
        ]
    else:
        mono = samples

    total_samples = len(mono)
    total_dur = total_samples / float(sr)
    hop = max(1, int(round(sr * (frame_ms / 1000.0))))
    win = max(hop, int(round(sr * (frame_ms * 2.0 / 1000.0))))
    dt = hop / float(sr)

    prefix_sq = [0.0] * (total_samples + 1)
    acc = 0.0
    for idx, s in enumerate(mono):
        acc += float(s) * float(s)
        prefix_sq[idx + 1] = acc

    times: list[float] = []
    dbs: list[float] = []
    pos = 0
    inv_norm_sq = 1.0 / (32768.0 * 32768.0)
    while pos < total_samples:
        end = min(total_samples, pos + win)
        cnt = max(1, end - pos)
        mean_sq = (prefix_sq[end] - prefix_sq[pos]) / float(cnt)
        rms = math.sqrt(max(0.0, mean_sq * inv_norm_sq))
        db = 20.0 * math.log10(max(rms, 1e-6))
        times.append((pos + 0.5 * cnt) / float(sr))
        dbs.append(db)
        pos += hop

    return times, dbs, total_dur, dt


def _detect_silence_ffmpeg_fallback(
    wav_path: Path,
    *,
    min_duration_sec: float = 0.06,
    noise_db: str = "-35dB",
) -> list[SilenceInterval]:
    total_dur = ffprobe_duration(wav_path)
    proc = run_cmd(
        [
            "ffmpeg",
            "-i",
            str(wav_path),
            "-af",
            f"silencedetect=noise={noise_db}:d={min_duration_sec:.3f}",
            "-f",
            "null",
            "-",
        ],
        check=False,
    )
    starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", proc.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([0-9.]+)", proc.stderr)]
    results: list[SilenceInterval] = []
    for idx, s in enumerate(starts):
        e = ends[idx] if idx < len(ends) else total_dur
        dur = max(0.0, e - s)
        if dur >= min_duration_sec:
            results.append(SilenceInterval(start_sec=s, end_sec=e, duration_sec=dur, min_db=-50.0))
    return results


def detect_silence_intervals(
    wav_path: Path,
    *,
    min_duration_sec: float = 0.06,
    threshold_db: float | None = None,
    frame_ms: float = 10.0,
) -> list[SilenceInterval]:
    """音声ファイル内の無音区間（開始・終了・長さ・最小dB）を適応閾値で高精度検出する。"""
    curve = _compute_wav_rms_db_curve(wav_path, frame_ms=frame_ms)
    if curve is None:
        return _detect_silence_ffmpeg_fallback(wav_path, min_duration_sec=min_duration_sec)

    _times, dbs, total_dur, dt = curve
    if not dbs:
        return []

    if threshold_db is None:
        sorted_db = sorted(dbs)
        n = len(sorted_db)
        noise_db = sorted_db[max(0, min(n - 1, int(0.05 * (n - 1))))]
        speech_db = sorted_db[max(0, min(n - 1, int(0.85 * (n - 1))))]
        eff_thresh = min(-30.0, max(noise_db + 8.0, speech_db - 22.0))
    else:
        eff_thresh = float(threshold_db)

    is_silent = [db <= eff_thresh for db in dbs]
    # 25ms 未満の極短スパイク（子音・クリックノイズ等）で無音区間が分断されるのを防止
    max_spike_frames = max(0, int(round(0.025 / max(dt, 1e-4))))
    if max_spike_frames > 0:
        idx = 0
        n_frames = len(is_silent)
        while idx < n_frames:
            if not is_silent[idx]:
                end = idx
                while end < n_frames and not is_silent[end]:
                    end += 1
                has_prev_sil = idx > 0 and is_silent[idx - 1]
                has_next_sil = end < n_frames and is_silent[end]
                if has_prev_sil and has_next_sil and (end - idx) <= max_spike_frames:
                    for k in range(idx, end):
                        is_silent[k] = True
                idx = end
            else:
                idx += 1

    intervals: list[SilenceInterval] = []
    idx = 0
    n_frames = len(is_silent)
    while idx < n_frames:
        if is_silent[idx]:
            end = idx
            min_db = dbs[idx]
            while end < n_frames and is_silent[end]:
                if dbs[end] < min_db:
                    min_db = dbs[end]
                end += 1
            s_sec = max(0.0, idx * dt)
            e_sec = min(total_dur, end * dt)
            dur = e_sec - s_sec
            if dur >= min_duration_sec:
                intervals.append(
                    SilenceInterval(
                        start_sec=round(s_sec, 4),
                        end_sec=round(e_sec, 4),
                        duration_sec=round(dur, 4),
                        min_db=round(min_db, 2),
                    )
                )
            idx = end
        else:
            idx += 1
    return intervals


def detect_energy_valleys(
    wav_path: Path,
    *,
    min_spacing_sec: float = 0.16,
    frame_ms: float = 10.0,
) -> list[float]:
    """完全無音にならず息継ぎでエネルギーが一瞬落ち込む極小点（秒）を検出する。"""
    curve = _compute_wav_rms_db_curve(wav_path, frame_ms=frame_ms)
    if curve is None:
        return []
    times, dbs, _total_dur, _dt = curve
    n = len(dbs)
    if n < 5:
        return []

    sorted_db = sorted(dbs)
    speech_db = sorted_db[max(0, min(n - 1, int(0.85 * (n - 1))))]
    valley_ceiling = speech_db - 10.0

    smooth = [
        sum(dbs[max(0, i - 2) : min(n, i + 3)]) / float(min(n, i + 3) - max(0, i - 2))
        for i in range(n)
    ]

    raw_valleys: list[tuple[float, float]] = []
    for i in range(2, n - 2):
        if smooth[i] <= smooth[i - 1] and smooth[i] <= smooth[i + 1] and smooth[i] < valley_ceiling:
            raw_valleys.append((times[i], smooth[i]))

    # 近接する極小点はより深い方だけを残す
    filtered: list[tuple[float, float]] = []
    for t_val, db_val in raw_valleys:
        if filtered and (t_val - filtered[-1][0]) < min_spacing_sec:
            if db_val < filtered[-1][1]:
                filtered[-1] = (t_val, db_val)
        else:
            filtered.append((t_val, db_val))
    return [round(t_val, 4) for t_val, _ in filtered]


@dataclass(frozen=True)
class _DPBoundaryCandidate:
    time_sec: float
    start_sec: float
    end_sec: float
    pause_dur: float
    min_db: float
    source: BoundarySource

    @property
    def speech_end_sec(self) -> float:
        return self.start_sec

    @property
    def speech_start_after_sec(self) -> float:
        if self.source != "silence_boundary":
            return self.time_sec
        return min(self.end_sec, max(self.time_sec, self.end_sec - 0.03))


def _run_boundary_dp(
    num_segments: int,
    d_exp: Sequence[float],
    anchor_t: Sequence[float],
    is_chunk_end: Sequence[bool],
    candidates: Sequence[_DPBoundaryCandidate],
    speech_head_sec: float,
    speech_tail_sec: float,
    *,
    ratio_min: float,
    ratio_max: float,
    anchor_weight: float,
) -> list[int] | None:
    """単調増加な (num_segments - 1) 個の境界候補インデックスを Viterbi DP で厳密最適探索する。"""
    num_bounds = num_segments - 1
    num_cand = len(candidates)
    if num_bounds == 0:
        return []
    if num_cand < num_bounds:
        return None

    inf = float("inf")

    def _node_cost(cand: _DPBoundaryCandidate, seg_idx: int) -> float:
        boundary_is_chunk = is_chunk_end[seg_idx]
        if cand.source == "silence_boundary":
            weight = 1.8 if boundary_is_chunk else 1.15
            depth_bonus = min(0.35, max(0.0, (-35.0 - cand.min_db) * 0.012))
            return -weight * min(0.65, cand.pause_dur) - depth_bonus
        if cand.source == "energy_valley":
            return 2.4 if boundary_is_chunk else 1.4
        return 7.5 if boundary_is_chunk else 5.5

    # dp[k][j]: k番目境界(0..num_bounds-1)を candidates[j] に置いたときの最小コスト
    dp: list[list[float]] = [[inf] * num_cand for _ in range(num_bounds)]
    parent: list[list[int]] = [[-1] * num_cand for _ in range(num_bounds)]

    # k = 0 (先頭文 [speech_head_sec .. cand.speech_end_sec])
    d0 = d_exp[0]
    min_d0 = max(0.16, d0 * ratio_min)
    max_d0 = max(1.8, d0 * ratio_max)
    for j, cand in enumerate(candidates):
        if cand.speech_end_sec <= speech_head_sec + 0.08:
            continue
        actual_d = cand.speech_end_sec - speech_head_sec
        if actual_d < min_d0:
            continue
        if actual_d > max_d0:
            break
        err = (actual_d - d0) / max(0.55, d0)
        anc_err = cand.time_sec - anchor_t[1]
        dp[0][j] = (
            6.0 * (err * err)
            + 0.55 * abs(actual_d - d0)
            + anchor_weight * (anc_err * anc_err)
            + _node_cost(cand, 0)
        )

    # k = 1 .. num_bounds - 1
    for k in range(1, num_bounds):
        dk = d_exp[k]
        min_dk = max(0.16, dk * ratio_min)
        max_dk = max(1.8, dk * ratio_max)
        anc_target = anchor_t[k + 1]

        for u in range(k - 1, num_cand - (num_bounds - k)):
            prev_cost = dp[k - 1][u]
            if math.isinf(prev_cost):
                continue
            start_after_u = candidates[u].speech_start_after_sec
            for v in range(u + 1, num_cand - (num_bounds - 1 - k)):
                cand_v = candidates[v]
                actual_d = cand_v.speech_end_sec - start_after_u
                if actual_d < min_dk:
                    continue
                if actual_d > max_dk:
                    break
                err = (actual_d - dk) / max(0.55, dk)
                anc_err = cand_v.time_sec - anc_target
                cand_cost = (
                    prev_cost
                    + 6.0 * (err * err)
                    + 0.55 * abs(actual_d - dk)
                    + anchor_weight * (anc_err * anc_err)
                    + _node_cost(cand_v, k)
                )
                if cand_cost < dp[k][v]:
                    dp[k][v] = cand_cost
                    parent[k][v] = u

    # 最終文 [cand.speech_start_after_sec .. speech_tail_sec] を評価して最良終端を選択
    d_last = d_exp[-1]
    min_dlast = max(0.16, d_last * ratio_min)
    max_dlast = max(1.8, d_last * ratio_max)
    best_total = inf
    best_last_idx = -1
    k_last = num_bounds - 1
    for j in range(k_last, num_cand):
        prev_cost = dp[k_last][j]
        if math.isinf(prev_cost):
            continue
        actual_last = speech_tail_sec - candidates[j].speech_start_after_sec
        if actual_last < min_dlast or actual_last > max_dlast:
            continue
        err = (actual_last - d_last) / max(0.55, d_last)
        total = prev_cost + 6.0 * (err * err) + 0.55 * abs(actual_last - d_last)
        if total < best_total:
            best_total = total
            best_last_idx = j

    if best_last_idx < 0:
        return None

    chosen = [0] * num_bounds
    cur = best_last_idx
    for k in range(k_last, -1, -1):
        chosen[k] = cur
        cur = parent[k][cur]
    return chosen


def _build_proportional_fallback_spans(
    chunks: Sequence[NarrationChunk],
    sentences: Sequence[tuple[int, bool, str, float]],
    speech_head_sec: float,
    speech_tail_sec: float,
    total_dur: float,
    silences: Sequence[SilenceInterval],
) -> tuple[list[AlignedChunkSpan], dict[str, Any]]:
    """候補不足時の最終フォールバック：モーラ比例配分で単調増加スパンを生成する。"""
    total_mora = max(1.0, sum(max(0.5, s[3]) for s in sentences))
    span_len = max(0.2, speech_tail_sec - speech_head_sec)
    cur = speech_head_sec
    sent_bounds: list[tuple[int, float, float, str, BoundarySource, float]] = []
    for idx, (c_idx, _is_end, s_text, mora) in enumerate(sentences):
        frac = max(0.5, mora) / total_mora
        nxt = speech_tail_sec if idx == len(sentences) - 1 else cur + span_len * frac
        sent_bounds.append((c_idx, cur, nxt, s_text, "proportional_fallback", 0.35))
        cur = nxt

    return _aggregate_sentence_spans_to_chunks(chunks, sent_bounds, total_dur, silences, passes=0)


def _aggregate_sentence_spans_to_chunks(
    chunks: Sequence[NarrationChunk],
    sent_bounds: Sequence[tuple[int, float, float, str, BoundarySource, float]],
    total_dur: float,
    silences: Sequence[SilenceInterval],
    *,
    passes: int,
) -> tuple[list[AlignedChunkSpan], dict[str, Any]]:
    """文スパン列をチャンク単位 AlignedChunkSpan 列へ集約し、同期精度メトリクスを算出する。"""
    grouped: list[list[tuple[float, float, str, BoundarySource, float]]] = [[] for _ in chunks]
    for c_idx, s_start, s_end, s_text, b_src, b_conf in sent_bounds:
        grouped[c_idx].append((s_start, s_end, s_text, b_src, b_conf))

    aligned: list[AlignedChunkSpan] = []
    total_mora_all = max(1.0, sum(max(0.5, estimate_japanese_morae(c.text)) for c in chunks))
    total_speech_all = 0.0
    for c_idx in range(len(chunks)):
        items = grouped[c_idx]
        total_speech_all += max(0.0, items[-1][1] - items[0][0])

    silence_hits = 0
    valley_hits = 0
    fallback_hits = 0
    rel_errors: list[float] = []

    for c_idx, chunk in enumerate(chunks):
        items = grouped[c_idx]
        speech_start = 0.0 if c_idx == 0 else items[0][0]
        speech_end = items[-1][1]
        if c_idx + 1 < len(chunks):
            next_start = grouped[c_idx + 1][0][0]
            end_sec = max(speech_end, next_start)
        else:
            end_sec = max(speech_end, total_dur)

        dur = max(0.05, speech_end - speech_start)
        pause_sec = max(0.0, end_sec - speech_end)
        b_src = items[-1][3]
        b_conf = items[-1][4]
        if b_src == "silence_boundary":
            silence_hits += 1
        elif b_src == "energy_valley":
            valley_hits += 1
        elif b_src == "proportional_fallback":
            fallback_hits += 1

        exp_share = max(0.5, estimate_japanese_morae(chunk.text)) / total_mora_all
        exp_dur = total_speech_all * exp_share
        rel_err = abs(dur - exp_dur) / max(0.4, exp_dur)
        rel_errors.append(rel_err)

        internal_pauses = tuple(
            round(s.midpoint_sec, 4)
            for s in silences
            if (speech_start + 0.10) < s.midpoint_sec < (speech_end - 0.10)
        )
        sent_tuple = tuple((round(s0, 4), round(s1, 4), stxt) for s0, s1, stxt, _, _ in items)
        aligned.append(
            AlignedChunkSpan(
                chunk_id=chunk.chunk_id,
                text=sanitize_japanese_text(chunk.text),
                start_sec=round(speech_start, 4),
                speech_end_sec=round(speech_end, 4),
                end_sec=round(end_sec, 4),
                duration_sec=round(dur, 4),
                pause_after_sec=round(pause_sec, 4),
                boundary_confidence=round(b_conf, 3),
                boundary_source=b_src,
                internal_pauses_sec=internal_pauses,
                sentence_spans=sent_tuple,
            )
        )

    n_chunks = max(1, len(aligned))
    summary = {
        "aligner": "acoustic_dp",
        "passes": passes,
        "chunkCount": len(aligned),
        "sentenceCount": len(sent_bounds),
        "totalDurationSec": round(total_dur, 4),
        "detectedSilencesCount": len(silences),
        "silenceHitChunks": silence_hits,
        "energyValleyChunks": valley_hits,
        "fallbackChunks": fallback_hits,
        "silenceHitRate": round(silence_hits / float(n_chunks), 4),
        "meanRelativeDurError": round(sum(rel_errors) / float(n_chunks), 4),
        "maxRelativeDurError": round(max(rel_errors) if rel_errors else 0.0, 4),
    }
    return aligned, summary


def align_chunks_acoustic_dp(
    chunks: Sequence[NarrationChunk],
    wav_path: Path,
    *,
    total_duration_sec: float | None = None,
    silences: Sequence[SilenceInterval] | None = None,
    valleys: Sequence[float] | None = None,
) -> tuple[list[AlignedChunkSpan], dict[str, Any]]:
    """無音区間・エネルギー谷・モーラ重み 2-pass Viterbi DP によりチャンク境界を全体最適アライメントする。"""
    if not chunks:
        raise ValueError("chunks must not be empty")

    total_dur = float(total_duration_sec) if total_duration_sec is not None else ffprobe_duration(wav_path)
    det_silences = list(silences) if silences is not None else detect_silence_intervals(wav_path, min_duration_sec=0.06)
    det_valleys = list(valleys) if valleys is not None else detect_energy_valleys(wav_path, min_spacing_sec=0.16)

    # チャンク列を句点単位の文列へ展開
    sentences: list[tuple[int, bool, str, float]] = []
    for c_idx, chunk in enumerate(chunks):
        pure = sanitize_japanese_text(chunk.text)
        sents = split_japanese_sentences(pure)
        for s_idx, s_text in enumerate(sents):
            is_c_end = s_idx == len(sents) - 1
            sentences.append((c_idx, is_c_end, s_text, max(0.5, estimate_japanese_morae(s_text))))

    num_segments = len(sentences)
    if num_segments == 1:
        pure = sanitize_japanese_text(chunks[0].text)
        internal = tuple(
            round(s.midpoint_sec, 4) for s in det_silences if 0.12 < s.midpoint_sec < total_dur - 0.12
        )
        span = AlignedChunkSpan(
            chunk_id=chunks[0].chunk_id,
            text=pure,
            start_sec=0.0,
            speech_end_sec=round(total_dur, 4),
            end_sec=round(total_dur, 4),
            duration_sec=round(total_dur, 4),
            pause_after_sec=0.0,
            boundary_confidence=1.0,
            boundary_source="silence_boundary",
            internal_pauses_sec=internal,
            sentence_spans=((0.0, round(total_dur, 4), pure),),
        )
        return [span], {
            "aligner": "acoustic_dp",
            "passes": 1,
            "chunkCount": 1,
            "sentenceCount": 1,
            "totalDurationSec": round(total_dur, 4),
            "detectedSilencesCount": len(det_silences),
            "silenceHitChunks": 1,
            "energyValleyChunks": 0,
            "fallbackChunks": 0,
            "silenceHitRate": 1.0,
            "meanRelativeDurError": 0.0,
            "maxRelativeDurError": 0.0,
        }

    # 先頭/末尾に張り付いた無音があれば音声の正味先頭・末尾境界を特定
    speech_head_sec = 0.0
    speech_tail_sec = total_dur
    internal_silences: list[SilenceInterval] = []
    for s in det_silences:
        if s.start_sec <= 0.06 and s.end_sec < total_dur * 0.25:
            speech_head_sec = max(speech_head_sec, max(0.0, s.end_sec - 0.03))
        elif s.end_sec >= total_dur - 0.06 and s.start_sec > total_dur * 0.75:
            speech_tail_sec = min(speech_tail_sec, s.start_sec)
        elif 0.15 < s.midpoint_sec < total_dur - 0.15:
            internal_silences.append(s)

    candidates: list[_DPBoundaryCandidate] = [
        _DPBoundaryCandidate(
            time_sec=s.midpoint_sec,
            start_sec=s.start_sec,
            end_sec=s.end_sec,
            pause_dur=s.duration_sec,
            min_db=s.min_db,
            source="silence_boundary",
        )
        for s in internal_silences
    ]

    for v_t in det_valleys:
        if not (speech_head_sec + 0.15 < v_t < speech_tail_sec - 0.15):
            continue
        if any((s.start_sec - 0.10) <= v_t <= (s.end_sec + 0.10) for s in internal_silences):
            continue
        candidates.append(
            _DPBoundaryCandidate(
                time_sec=v_t,
                start_sec=v_t,
                end_sec=v_t,
                pause_dur=0.04,
                min_db=-26.0,
                source="energy_valley",
            )
        )

    # 1パス目の期待位置（上位 K 個の無音合計で総ポーズを推定）
    num_bounds = num_segments - 1
    top_pauses = sorted((s.duration_sec for s in internal_silences), reverse=True)[:num_bounds]
    est_total_pause = min(max(0.0, (speech_tail_sec - speech_head_sec) * 0.42), sum(top_pauses))
    est_total_speech = max(0.5, (speech_tail_sec - speech_head_sec) - est_total_pause)
    total_mora = max(1.0, sum(s[3] for s in sentences))
    mora_rate = est_total_speech / total_mora

    d_exp = [max(0.28, s[3] * mora_rate) for s in sentences]
    raw_p_weights = [0.35 if s[1] else 0.22 for s in sentences[:-1]]
    p_sum = max(0.01, sum(raw_p_weights))
    p_exp = [est_total_pause * (w / p_sum) for w in raw_p_weights]

    anchor_t = [speech_head_sec]
    cur_t = speech_head_sec
    for idx in range(num_segments):
        cur_t += d_exp[idx] + (p_exp[idx] if idx < num_bounds else 0.0)
        anchor_t.append(cur_t)

    # 無音/谷が存在しない区間向けに仮想フォールバック候補を補完
    for k in range(1, num_segments):
        anc = anchor_t[k]
        for offset in (0.0, -0.18, 0.18):
            t_fb = anc + offset
            if not (speech_head_sec + 0.12 < t_fb < speech_tail_sec - 0.12):
                continue
            if any(abs(c.time_sec - t_fb) < 0.14 for c in candidates):
                continue
            candidates.append(
                _DPBoundaryCandidate(
                    time_sec=round(t_fb, 4),
                    start_sec=round(t_fb, 4),
                    end_sec=round(t_fb, 4),
                    pause_dur=0.0,
                    min_db=-18.0,
                    source="proportional_fallback",
                )
            )

    candidates.sort(key=lambda c: c.time_sec)
    is_chunk_end = [bool(s[1]) for s in sentences[:-1]]

    chosen = _run_boundary_dp(
        num_segments,
        d_exp,
        anchor_t,
        is_chunk_end,
        candidates,
        speech_head_sec,
        speech_tail_sec,
        ratio_min=0.40,
        ratio_max=2.35,
        anchor_weight=0.22,
    )
    if chosen is None:
        chosen = _run_boundary_dp(
            num_segments,
            d_exp,
            anchor_t,
            is_chunk_end,
            candidates,
            speech_head_sec,
            speech_tail_sec,
            ratio_min=0.15,
            ratio_max=4.5,
            anchor_weight=0.35,
        )
    if chosen is None:
        return _build_proportional_fallback_spans(
            chunks, sentences, speech_head_sec, speech_tail_sec, total_dur, det_silences
        )

    # 2パス目: 1パス目で確定した実ポーズ合計を使って発話速度を再較正し、ドリフトを除去
    passes_run = 1
    actual_pause_sum = sum(candidates[idx].pause_dur for idx in chosen if candidates[idx].source == "silence_boundary")
    actual_speech_sum = max(0.5, (speech_tail_sec - speech_head_sec) - actual_pause_sum)
    mora_rate_2 = actual_speech_sum / total_mora
    d_exp_2 = [max(0.28, s[3] * mora_rate_2) for s in sentences]
    p_exp_2 = [candidates[idx].pause_dur for idx in chosen]
    anchor_t_2 = [speech_head_sec]
    cur_t2 = speech_head_sec
    for idx in range(num_segments):
        cur_t2 += d_exp_2[idx] + (p_exp_2[idx] if idx < num_bounds else 0.0)
        anchor_t_2.append(cur_t2)

    chosen_2 = _run_boundary_dp(
        num_segments,
        d_exp_2,
        anchor_t_2,
        is_chunk_end,
        candidates,
        speech_head_sec,
        speech_tail_sec,
        ratio_min=0.40,
        ratio_max=2.35,
        anchor_weight=0.25,
    )
    if chosen_2 is not None:
        chosen = chosen_2
        passes_run = 2

    # 確定境界から文スパン列を構築
    sent_bounds: list[tuple[int, float, float, str, BoundarySource, float]] = []
    for i in range(num_segments):
        c_idx, _is_end, s_text, _mora = sentences[i]
        s_start = speech_head_sec if i == 0 else candidates[chosen[i - 1]].speech_start_after_sec
        if i < num_bounds:
            cand = candidates[chosen[i]]
            s_end = cand.speech_end_sec
            b_src = cand.source
            if b_src == "silence_boundary":
                b_conf = min(0.99, 0.72 + min(0.27, cand.pause_dur * 0.65))
            elif b_src == "energy_valley":
                b_conf = 0.62
            else:
                b_conf = 0.35
        else:
            s_end = speech_tail_sec
            b_src = "silence_boundary"
            b_conf = 0.95
        sent_bounds.append((c_idx, s_start, max(s_start + 0.04, s_end), s_text, b_src, b_conf))

    return _aggregate_sentence_spans_to_chunks(chunks, sent_bounds, total_dur, det_silences, passes=passes_run)


def _escape_ffmpeg_filter_val(val: str) -> str:
    """ffmpeg フィルタ引数用に Windows パス区切りとコロンをエスケープする。"""
    return val.replace("\\", "/").replace(":", "\\:")


def _normalize_jp_for_match(text: str) -> str:
    return re.sub(r"[\s、。！？!?,.\-―「」『』（）()・:：]+", "", text).lower()


def align_chunks_ffmpeg_whisper(
    chunks: Sequence[NarrationChunk],
    wav_path: Path,
    *,
    model_path: Path,
    language: str = "ja",
) -> tuple[list[AlignedChunkSpan], dict[str, Any]]:
    """ローカル whisper.cpp ggml モデルと ffmpeg whisper フィルタで書き起こし＋無音スナップ同期を行う。"""
    if not model_path.is_file():
        raise FileNotFoundError(f"whisper.cpp model not found: {model_path}")

    total_dur = ffprobe_duration(wav_path)
    silences = detect_silence_intervals(wav_path, min_duration_sec=0.06)
    json_out = wav_path.with_suffix(".whisper.json")
    try:
        filter_expr = (
            f"whisper=model='{_escape_ffmpeg_filter_val(str(model_path))}':"
            f"language={language}:format=json:destination='{_escape_ffmpeg_filter_val(str(json_out))}'"
        )
        run_cmd(["ffmpeg", "-y", "-i", str(wav_path), "-af", filter_expr, "-f", "null", "-"])
        raw_payload = json.loads(json_out.read_text(encoding="utf-8"))
    finally:
        json_out.unlink(missing_ok=True)

    segments: list[tuple[float, float, str]] = []
    if isinstance(raw_payload, list):
        raw_segs = raw_payload
    elif isinstance(raw_payload, dict):
        raw_segs = raw_payload.get("transcription") or raw_payload.get("segments") or []
    else:
        raw_segs = []

    for seg in raw_segs:
        if not isinstance(seg, Mapping):
            continue
        offsets = seg.get("offsets")
        if isinstance(offsets, Mapping):
            t0 = float(offsets.get("from", 0.0)) / 1000.0
            t1 = float(offsets.get("to", 0.0)) / 1000.0
        else:
            t0 = float(seg.get("start", 0.0))
            t1 = float(seg.get("end", t0))
        txt = _normalize_jp_for_match(str(seg.get("text", "")))
        if txt and t1 > t0:
            segments.append((max(0.0, t0), min(total_dur, t1), txt))

    if not segments:
        aligned, summary = align_chunks_acoustic_dp(chunks, wav_path, total_duration_sec=total_dur, silences=silences)
        summary["whisperFallback"] = "empty_transcription"
        return aligned, summary

    # 書き起こし累積文字位置でチャンク境界時刻を推定し、最寄り無音へスナップして精度を統合する
    full_transcript = "".join(s[2] for s in segments)
    char_times: list[float] = []
    for t0, t1, txt in segments:
        n_c = max(1, len(txt))
        for i in range(n_c):
            char_times.append(t0 + (t1 - t0) * ((i + 0.5) / float(n_c)))

    pure_chunks = [sanitize_japanese_text(c.text) for c in chunks]
    norm_chunks = [_normalize_jp_for_match(t) for t in pure_chunks]
    total_norm_len = max(1, sum(len(t) for t in norm_chunks))
    total_trans_len = max(1, len(full_transcript))

    pause_mids = [s.midpoint_sec for s in silences if 0.15 < s.midpoint_sec < total_dur - 0.15]
    boundaries: list[float] = [0.0]
    cum_len = 0
    for c_idx in range(len(chunks) - 1):
        cum_len += len(norm_chunks[c_idx])
        char_idx = min(total_trans_len - 1, int(round((cum_len / float(total_norm_len)) * total_trans_len)))
        raw_t = char_times[char_idx]
        snapped = snap_to_pause(raw_t, pause_mids, tolerance=0.45)
        if snapped <= boundaries[-1] + 0.15:
            snapped = max(boundaries[-1] + 0.15, raw_t)
        boundaries.append(min(total_dur - 0.15 * (len(chunks) - 1 - c_idx), snapped))
    boundaries.append(total_dur)

    aligned: list[AlignedChunkSpan] = []
    for c_idx, chunk in enumerate(chunks):
        s_t = boundaries[c_idx]
        e_t = boundaries[c_idx + 1]
        matched_sil = next((s for s in silences if abs(s.midpoint_sec - e_t) < 0.25), None)
        speech_end = matched_sil.start_sec if (matched_sil and c_idx < len(chunks) - 1) else e_t
        speech_end = max(s_t + 0.05, min(e_t, speech_end))
        internal = tuple(round(s.midpoint_sec, 4) for s in silences if (s_t + 0.10) < s.midpoint_sec < (speech_end - 0.10))
        aligned.append(
            AlignedChunkSpan(
                chunk_id=chunk.chunk_id,
                text=pure_chunks[c_idx],
                start_sec=round(s_t, 4),
                speech_end_sec=round(speech_end, 4),
                end_sec=round(e_t, 4),
                duration_sec=round(speech_end - s_t, 4),
                pause_after_sec=round(max(0.0, e_t - speech_end), 4),
                boundary_confidence=0.88 if matched_sil else 0.72,
                boundary_source="whisper_match",
                internal_pauses_sec=internal,
                sentence_spans=((round(s_t, 4), round(speech_end, 4), pure_chunks[c_idx]),),
            )
        )

    return aligned, {
        "aligner": "ffmpeg_whisper",
        "chunkCount": len(aligned),
        "whisperSegments": len(segments),
        "totalDurationSec": round(total_dur, 4),
    }


def align_chunks_to_wav(
    chunks: Sequence[NarrationChunk],
    wav_path: Path,
    *,
    aligner: Literal["auto", "acoustic_dp", "ffmpeg_whisper"] = "auto",
    whisper_model_path: Path | str | None = None,
) -> tuple[list[AlignedChunkSpan], str, dict[str, Any]]:
    """ワンテイク音声に対して利用可能な最適ローカルアライメント手法を実行する。"""
    resolved_model: Path | None = None
    if whisper_model_path:
        resolved_model = Path(whisper_model_path)
    else:
        env_model = os.environ.get("WHISPER_MODEL_PATH", "").strip()
        if env_model:
            resolved_model = Path(env_model)

    if aligner == "ffmpeg_whisper":
        if resolved_model is None or not resolved_model.is_file():
            raise FileNotFoundError(
                f"aligner='ffmpeg_whisper' requires an existing ggml model file, got: {resolved_model}"
            )
        spans, summary = align_chunks_ffmpeg_whisper(chunks, wav_path, model_path=resolved_model)
        return spans, "ffmpeg_whisper", summary

    if aligner == "auto" and resolved_model is not None and resolved_model.is_file():
        try:
            spans, summary = align_chunks_ffmpeg_whisper(chunks, wav_path, model_path=resolved_model)
            return spans, "ffmpeg_whisper", summary
        except Exception as exc:
            print(f"[ALIGN] ffmpeg_whisper failed, falling back to acoustic_dp: {exc}")

    spans, summary = align_chunks_acoustic_dp(chunks, wav_path)
    return spans, "acoustic_dp", summary


def locate_text_timestamp_in_chunk(
    chunk_span: AlignedChunkSpan | Mapping[str, Any],
    needle: str,
    *,
    tolerance: float = 0.35,
) -> float:
    """チャンク内の特定キーワード発話時刻を、文スパン境界＋モーラ重み比率＋無音スナップで算出する。"""
    if isinstance(chunk_span, AlignedChunkSpan):
        text = chunk_span.text
        start_sec = chunk_span.start_sec
        dur_sec = chunk_span.duration_sec
        internal_pauses = list(chunk_span.internal_pauses_sec)
        sentence_spans = list(chunk_span.sentence_spans)
    else:
        text = str(chunk_span["text"])
        start_sec = float(chunk_span["startSec"])
        dur_sec = float(chunk_span["durationSec"])
        internal_pauses = [float(x) for x in chunk_span.get("internalPausesSec", ())]
        sentence_spans = [
            (float(item[0]), float(item[1]), str(item[2]))
            for item in chunk_span.get("sentenceSpans", ())
        ]

    # 文スパン情報がある場合は該当文を直接特定して文頭ズレを防ぐ
    for s_start, s_end, s_text in sentence_spans:
        idx = s_text.find(needle)
        if idx >= 0:
            if idx == 0:
                return round(s_start, 4)
            prefix_mora = estimate_japanese_morae(s_text[:idx])
            total_mora = max(0.5, estimate_japanese_morae(s_text))
            ratio = min(1.0, max(0.0, prefix_mora / total_mora))
            raw_t = s_start + max(0.0, s_end - s_start) * ratio
            if idx <= 1:
                return round(raw_t, 4)
            return round(snap_to_pause(raw_t, internal_pauses, tolerance=tolerance), 4)

    idx = text.find(needle)
    if idx < 0:
        raise ValueError(f"needle {needle!r} not in chunk text {text!r}")
    if idx == 0:
        return round(start_sec, 4)
    prefix_mora = estimate_japanese_morae(text[:idx])
    total_mora = max(0.5, estimate_japanese_morae(text))
    ratio = min(1.0, max(0.0, prefix_mora / total_mora))
    raw_t = start_sec + dur_sec * ratio
    return round(snap_to_pause(raw_t, internal_pauses, tolerance=tolerance), 4)


def _import_genai() -> tuple[Any, Any]:
    """google.genai を遅延インポートして (genai, types) を返す。"""
    from google import genai
    from google.genai import types

    return genai, types


@dataclass(frozen=True)
class GeminiErrorClassification:
    """Gemini API 例外の種別と推奨待機秒数の分類結果。"""

    kind: Literal[
        "daily_quota",
        "rate_limit",
        "transient",
        "auth",
        "model_unavailable",
        "invalid_argument",
        "fatal",
    ]
    retry_delay_sec: float | None = None
    reason: str = ""


class GeminiQuotaExhaustedError(RuntimeError):
    """全 API キーで対象モデルの日次クォータ（RPD 等）が枯渇したことを示す例外。"""

    def __init__(self, message: str, *, model_name: str | None = None) -> None:
        super().__init__(message)
        self.model_name = model_name


def resolve_gemini_api_keys(
    api_key: str | None = None,
    *,
    api_keys: Sequence[str] | None = None,
    fallback_api_key: str | None = None,
    repo_root: Path | None = None,
    load_env: bool = True,
) -> list[str]:
    """Gemini API キー一覧（メイン→サブ）を解決し、空文字と重複を除外して返す。

    - api_keys が明示指定された場合は .env を読まずにそのまま正規化する。
    - api_key が非空で明示指定された場合も .env を読まず、fallback_api_key または環境変数
      GEMINI_API_KEY_FALLBACK をサブ候補として結合する。
    - api_key が未指定/空の場合は必要に応じて .env を読み込み、GEMINI_API_KEY と
      GEMINI_API_KEY_FALLBACK（または fallback_api_key）を結合する。
    """
    if api_keys is not None:
        raw_candidates = list(api_keys)
    elif api_key is not None and api_key.strip():
        fb = fallback_api_key if fallback_api_key is not None else os.environ.get("GEMINI_API_KEY_FALLBACK", "")
        raw_candidates = [api_key, fb]
    else:
        if load_env:
            load_dotenv(repo_root)
        primary = os.environ.get("GEMINI_API_KEY", "")
        fb = fallback_api_key if fallback_api_key is not None else os.environ.get("GEMINI_API_KEY_FALLBACK", "")
        raw_candidates = [primary, fb]

    resolved: list[str] = []
    seen: set[str] = set()
    for candidate in raw_candidates:
        cleaned = str(candidate).strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        resolved.append(cleaned)
    return resolved


def _redact_secrets(text: str, api_keys: Sequence[str]) -> str:
    """ログ・エラー文字列から API キー生文字列を除去する。"""
    masked = text
    for key in api_keys:
        if key:
            masked = masked.replace(key, "[REDACTED]")
    return masked


def _parse_duration_token(raw: Any) -> float | None:
    """Google RPC Duration（'12s', '500ms', '1m30s', {'seconds': ...}, 数値等）を秒へ変換する。"""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        val = float(raw)
        return val if (math.isfinite(val) and val >= 0.0) else None
    if isinstance(raw, Mapping):
        if "seconds" in raw or "nanos" in raw:
            try:
                sec = float(raw.get("seconds") or 0.0)
                nanos = float(raw.get("nanos") or 0.0)
                total = sec + nanos / 1_000_000_000.0
                return total if (math.isfinite(total) and total >= 0.0) else None
            except (TypeError, ValueError):
                return None
        return None
    if not isinstance(raw, str):
        return None

    text = raw.strip().lower()
    if not text:
        return None

    if re.fullmatch(r"\d+(?:\.\d+)?", text):
        val = float(text)
        return val if math.isfinite(val) else None

    unit_match = re.fullmatch(
        r"(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)",
        text,
    )
    if unit_match:
        num = float(unit_match.group(1))
        unit = unit_match.group(2)
        if unit.startswith("ms") or unit.startswith("millisecond"):
            return num / 1000.0
        if unit.startswith("m"):
            return num * 60.0
        if unit.startswith("h"):
            return num * 3600.0
        return num

    comp_match = re.fullmatch(
        r"(?:(?P<h>\d+(?:\.\d+)?)h)?"
        r"(?:(?P<m>\d+(?:\.\d+)?)m(?!s))?"
        r"(?:(?P<s>\d+(?:\.\d+)?)s)?"
        r"(?:(?P<ms>\d+(?:\.\d+)?)ms)?",
        text,
    )
    if comp_match and any(comp_match.groupdict().values()):
        total = 0.0
        if comp_match.group("h"):
            total += float(comp_match.group("h")) * 3600.0
        if comp_match.group("m"):
            total += float(comp_match.group("m")) * 60.0
        if comp_match.group("s"):
            total += float(comp_match.group("s"))
        if comp_match.group("ms"):
            total += float(comp_match.group("ms")) / 1000.0
        return total if math.isfinite(total) else None

    return None


def _extract_retry_delay_from_details(node: Any) -> float | None:
    """例外 details の辞書/配列から retryDelay / retry_delay を再帰探索する。"""
    if isinstance(node, Mapping):
        for key, val in node.items():
            if str(key).lower() in ("retrydelay", "retry_delay"):
                parsed = _parse_duration_token(val)
                if parsed is not None:
                    return parsed
        for val in node.values():
            found = _extract_retry_delay_from_details(val)
            if found is not None:
                return found
    elif isinstance(node, (list, tuple)):
        for item in node:
            found = _extract_retry_delay_from_details(item)
            if found is not None:
                return found
    return None


def parse_retry_delay_sec(exc_or_text: Exception | str) -> float | None:
    """Gemini API 例外またはエラー文字列から retryDelay / Retry-After（秒）を抽出する。"""
    if isinstance(exc_or_text, Exception):
        details = getattr(exc_or_text, "details", None)
        if details is not None:
            found = _extract_retry_delay_from_details(details)
            if found is not None:
                return found

        response = getattr(exc_or_text, "response", None)
        headers = getattr(response, "headers", None)
        if isinstance(headers, Mapping):
            retry_after = headers.get("Retry-After") or headers.get("retry-after")
            if retry_after is not None:
                parsed = _parse_duration_token(str(retry_after))
                if parsed is not None:
                    return parsed

    text = str(exc_or_text)

    dict_match = re.search(
        r"['\"]?retry_?delay['\"]?\s*[:=]\s*\{([^}]+)\}",
        text,
        re.IGNORECASE,
    )
    if dict_match:
        body = dict_match.group(1)
        sec_m = re.search(r"['\"]?seconds['\"]?\s*[:=]\s*(\d+(?:\.\d+)?)", body, re.IGNORECASE)
        nanos_m = re.search(r"['\"]?nanos['\"]?\s*[:=]\s*(\d+(?:\.\d+)?)", body, re.IGNORECASE)
        if sec_m or nanos_m:
            sec = float(sec_m.group(1)) if sec_m else 0.0
            nanos = float(nanos_m.group(1)) if nanos_m else 0.0
            total = sec + nanos / 1_000_000_000.0
            if math.isfinite(total) and total >= 0.0:
                return total

    kv_match = re.search(
        r"['\"]?retry_?delay['\"]?\s*[:=]\s*['\"]?"
        r"("
        r"(?:\d+(?:\.\d+)?h(?:\d+(?:\.\d+)?m(?!s|i))?(?:\d+(?:\.\d+)?s)?(?:\d+(?:\.\d+)?ms)?)"
        r"|(?:\d+(?:\.\d+)?m(?!s|i)(?:\d+(?:\.\d+)?s)?(?:\d+(?:\.\d+)?ms)?)"
        r"|(?:\d+(?:\.\d+)?\s*(?:ms|milliseconds?|h|hr|hrs|hours?|min|mins|minutes?|m(?!s)|sec|secs|seconds?|s))"
        r"|(?:\d+(?:\.\d+)?)"
        r")"
        r"['\"]?",
        text,
        re.IGNORECASE,
    )
    if kv_match:
        parsed = _parse_duration_token(kv_match.group(1))
        if parsed is not None:
            return parsed

    duration_expr = (
        r"(?:\d+(?:\.\d+)?h(?:\d+(?:\.\d+)?m(?!s|i))?(?:\d+(?:\.\d+)?s)?(?:\d+(?:\.\d+)?ms)?)"
        r"|(?:\d+(?:\.\d+)?m(?!s|i)(?:\d+(?:\.\d+)?s)?(?:\d+(?:\.\d+)?ms)?)"
        r"|(?:\d+(?:\.\d+)?\s*(?:ms|milliseconds?|h|hr|hrs|hours?|min|mins|minutes?|m(?!s)|sec|secs|seconds?|s))"
    )
    for phrase_pat in (
        rf"please\s+retry\s+in\s+({duration_expr})\b",
        rf"retry\s+after\s+({duration_expr})\b",
    ):
        m = re.search(phrase_pat, text, re.IGNORECASE)
        if m:
            parsed = _parse_duration_token(m.group(1))
            if parsed is not None:
                return parsed

    return None


_DAILY_QUOTA_TEXT_RE = re.compile(
    r"(?:per[\s_-]*day|\brpd\b|\bdaily\b|\blimit\s*[:=]\s*0(?:\.0+)?\b|quotavalue['\"]?\s*[:=]\s*['\"]?0(?:\.0+)?\b)",
    re.IGNORECASE,
)


def _has_daily_quota_details(node: Any) -> bool:
    """details 構造体内の QuotaFailure 情報から日次枯渇・limit=0 を検出する。"""
    if isinstance(node, Mapping):
        for key, val in node.items():
            low_key = str(key).lower()
            if low_key in ("quotavalue", "quota_value") and str(val).strip() in ("0", "0.0"):
                return True
            if low_key in ("quotaid", "quota_id", "quotametric", "quota_metric", "description"):
                if isinstance(val, str) and _DAILY_QUOTA_TEXT_RE.search(val):
                    return True
        return any(_has_daily_quota_details(v) for v in node.values())
    if isinstance(node, (list, tuple)):
        return any(_has_daily_quota_details(item) for item in node)
    return False


def classify_gemini_error(exc: Exception) -> GeminiErrorClassification:
    """Gemini API 例外を解析し、429原因（日次枯渇 vs RPM超過）や再試行可否を判別する。"""
    code = getattr(exc, "code", None)
    status = str(getattr(exc, "status", "") or "").upper()
    details = getattr(exc, "details", None)
    raw_text = str(exc)

    details_text = ""
    if details is not None:
        try:
            details_text = json.dumps(details, ensure_ascii=False)
        except TypeError:
            details_text = str(details)

    combined_text = f"{raw_text} {details_text}".strip()
    upper_text = combined_text.upper()

    is_429 = (
        code == 429
        or status == "RESOURCE_EXHAUSTED"
        or bool(re.search(r"(?<!\d)429(?!\d)", raw_text))
        or "RESOURCE_EXHAUSTED" in upper_text
    )
    if is_429:
        if _has_daily_quota_details(details) or _DAILY_QUOTA_TEXT_RE.search(combined_text):
            return GeminiErrorClassification(
                kind="daily_quota",
                retry_delay_sec=None,
                reason=raw_text[:200],
            )
        return GeminiErrorClassification(
            kind="rate_limit",
            retry_delay_sec=parse_retry_delay_sec(exc),
            reason=raw_text[:200],
        )

    if code in (401, 403) or any(
        tok in upper_text for tok in ("API_KEY_INVALID", "PERMISSION_DENIED", "UNAUTHENTICATED", "INVALID API KEY")
    ):
        return GeminiErrorClassification(kind="auth", reason=raw_text[:200])

    if code == 404 or status == "NOT_FOUND" or "NOT_FOUND" in upper_text or "IS NOT FOUND FOR API VERSION" in upper_text:
        return GeminiErrorClassification(kind="model_unavailable", reason=raw_text[:200])

    if code == 400 or status == "INVALID_ARGUMENT" or "INVALID_ARGUMENT" in upper_text:
        return GeminiErrorClassification(kind="invalid_argument", reason=raw_text[:200])

    if (
        code in (500, 502, 503, 504)
        or status in ("INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED")
        or any(tok in upper_text for tok in ("UNAVAILABLE", "DEADLINE_EXCEEDED", "INTERNAL"))
        or bool(re.search(r"(?<!\d)(?:500|502|503|504)(?!\d)", raw_text))
    ):
        return GeminiErrorClassification(
            kind="transient",
            retry_delay_sec=parse_retry_delay_sec(exc),
            reason=raw_text[:200],
        )

    return GeminiErrorClassification(kind="fatal", reason=raw_text[:200])


@dataclass
class _KeyState:
    """キープール内の個別 API キー稼働・クールダウン状態。"""

    index: int
    label: str
    api_key: str
    client: Any = None
    last_request_started_at: float | None = None
    last_request_finished_at: float | None = None
    cooldown_until: float = 0.0
    disabled_reason: str | None = None


def _default_client_factory(api_key: str, api_version: str) -> Any:
    """google.genai.Client を遅延インポートして生成する。"""
    genai_mod, types_mod = _import_genai()
    return genai_mod.Client(
        api_key=api_key,
        http_options=types_mod.HttpOptions(api_version=api_version),
    )


class GeminiKeyPool:
    """2キー自動フェイルオーバー・キー単位ペーシング・日次枯渇サーキットブレーカー管理クラス。"""

    def __init__(
        self,
        api_keys: Sequence[str] | None = None,
        *,
        api_key: str | None = None,
        fallback_api_key: str | None = None,
        api_version: str = "v1beta",
        min_interval_sec: float = DEFAULT_KEY_MIN_INTERVAL_SEC,
        max_retries_per_key: int = 2,
        rate_limit_fallback_delay_sec: float = DEFAULT_RATE_LIMIT_FALLBACK_DELAY_SEC,
        max_retry_delay_sec: float = DEFAULT_MAX_RETRY_DELAY_SEC,
        repo_root: Path | None = None,
        load_env: bool = True,
        client_factory: Callable[[str, str], Any] | None = None,
        clock: Callable[[], float] | None = None,
        sleep_fn: Callable[[float], None] | None = None,
        jitter_fn: Callable[[float, float], float] | None = None,
    ) -> None:
        self._explicit_api_keys = tuple(api_keys) if api_keys is not None else None
        self._explicit_api_key = api_key
        self._explicit_fallback_api_key = fallback_api_key
        self.api_version = api_version
        self.min_interval_sec = max(0.0, float(min_interval_sec))
        self.max_retries_per_key = max(0, int(max_retries_per_key))
        self.rate_limit_fallback_delay_sec = max(0.0, float(rate_limit_fallback_delay_sec))
        self.max_retry_delay_sec = max(0.0, float(max_retry_delay_sec))
        self._repo_root = repo_root
        self._load_env = load_env
        self._client_factory = client_factory
        self._clock: Callable[[], float] = clock or time.monotonic
        self._sleep: Callable[[float], None] = sleep_fn or time.sleep
        self._jitter: Callable[[float, float], float] = jitter_fn or random.uniform

        self._keys: list[_KeyState] | None = None
        self._exhausted_daily: dict[tuple[int, str], str] = {}

    def ensure_initialized(self) -> list[_KeyState]:
        """必要なタイミングでのみ API キー一覧を解決し、キー状態リストを初期化する。"""
        if self._keys is None:
            resolved = resolve_gemini_api_keys(
                self._explicit_api_key,
                api_keys=self._explicit_api_keys,
                fallback_api_key=self._explicit_fallback_api_key,
                repo_root=self._repo_root,
                load_env=self._load_env,
            )
            if not resolved:
                raise RuntimeError("GEMINI_API_KEY is missing in environment or .env")
            self._keys = [
                _KeyState(
                    index=idx,
                    label="primary" if idx == 0 else ("fallback" if idx == 1 else f"key{idx + 1}"),
                    api_key=key,
                )
                for idx, key in enumerate(resolved)
            ]
        return self._keys

    def _get_client(self, state: _KeyState) -> Any:
        if state.client is None:
            factory = self._client_factory or _default_client_factory
            state.client = factory(state.api_key, self.api_version)
        return state.client

    def get_primary_client(self) -> Any:
        """プライマリキーのクライアントを返す（後方互換用）。"""
        keys = self.ensure_initialized()
        return self._get_client(keys[0])

    @staticmethod
    def _key_tag(state: _KeyState) -> str:
        return f"key#{state.index + 1}({state.label})"

    def is_key_model_exhausted(self, key_index: int, model_name: str) -> bool:
        """指定 (key_index, model_name) が日次枯渇または無効化されているか返す。"""
        if (key_index, model_name) in self._exhausted_daily:
            return True
        if self._keys is not None and 0 <= key_index < len(self._keys):
            return self._keys[key_index].disabled_reason is not None
        return False

    def is_model_exhausted(self, model_name: str) -> bool:
        """初期化済みかつ全キーが日次枯渇または無効化されている場合に True を返す。"""
        if self._keys is None:
            return False
        return all(
            (k.disabled_reason is not None) or ((k.index, model_name) in self._exhausted_daily)
            for k in self._keys
        )

    def mark_daily_exhausted(self, key_index: int, model_name: str, reason: str = "") -> None:
        """指定 (key_index, model_name) をセッション内で当日枯渇として記憶する。"""
        self._exhausted_daily[(key_index, model_name)] = reason

    def call_with_failover(
        self,
        model_name: str,
        call_fn: Callable[[Any, int], _T],
        *,
        log_prefix: str = "[TTS]",
    ) -> tuple[_T, int]:
        """同一モデル上でキー単位ペーシングと2キー自動フェイルオーバーを行い API を呼び出す。"""
        keys = self.ensure_initialized()
        secret_values = [k.api_key for k in keys]
        attempts_per_key: dict[int, int] = {k.index: 0 for k in keys}
        rl_strikes: dict[int, int] = {k.index: 0 for k in keys}
        transient_strikes: dict[int, int] = {k.index: 0 for k in keys}
        last_err: Exception | None = None

        while True:
            candidates = [
                k
                for k in keys
                if k.disabled_reason is None
                and (k.index, model_name) not in self._exhausted_daily
                and attempts_per_key[k.index] <= self.max_retries_per_key
            ]
            if not candidates:
                if self.is_model_exhausted(model_name):
                    detail = _redact_secrets(str(last_err), secret_values) if last_err else "daily quota exhausted"
                    raise GeminiQuotaExhaustedError(
                        f"All Gemini API keys exhausted for model '{model_name}': {detail}",
                        model_name=model_name,
                    ) from last_err
                assert last_err is not None
                raise last_err

            now = self._clock()
            ready = [k for k in candidates if k.cooldown_until <= now]
            if ready:
                chosen = ready[0]
            else:
                chosen = min(candidates, key=lambda k: (k.cooldown_until, k.index))
                wait_sec = max(0.0, chosen.cooldown_until - now)
                if wait_sec > 0.0:
                    if wait_sec >= 0.5:
                        print(f"{log_prefix} {model_name}: pacing {self._key_tag(chosen)} {wait_sec:.2f}s")
                    self._sleep(wait_sec)

            started_at = self._clock()
            chosen.last_request_started_at = started_at
            if self.min_interval_sec > 0.0:
                chosen.cooldown_until = max(chosen.cooldown_until, started_at + self.min_interval_sec)

            client = self._get_client(chosen)
            try:
                result = call_fn(client, chosen.index)
                chosen.last_request_finished_at = self._clock()
                return result, chosen.index
            except Exception as exc:
                last_err = exc
                finished_at = self._clock()
                chosen.last_request_finished_at = finished_at
                cls = classify_gemini_error(exc)
                safe_reason = _redact_secrets(cls.reason, secret_values)
                tag = self._key_tag(chosen)

                if cls.kind == "daily_quota":
                    self.mark_daily_exhausted(chosen.index, model_name, safe_reason)
                    print(
                        f"{log_prefix} {model_name}: {tag} 429 daily_quota -> "
                        f"circuit-broken for session ({safe_reason[:120]})"
                    )
                    continue

                if cls.kind == "rate_limit":
                    attempts_per_key[chosen.index] += 1
                    strike = rl_strikes[chosen.index]
                    rl_strikes[chosen.index] += 1
                    if cls.retry_delay_sec is not None:
                        delay = min(self.max_retry_delay_sec, max(0.0, cls.retry_delay_sec))
                        delay_src = f"retryDelay={delay:.2f}s"
                    else:
                        base = min(30.0, self.rate_limit_fallback_delay_sec * (1.5 ** strike))
                        delay = base + max(0.0, float(self._jitter(0.2, 1.5)))
                        delay = min(self.max_retry_delay_sec, delay)
                        delay_src = f"backoff={delay:.2f}s"
                    chosen.cooldown_until = max(chosen.cooldown_until, finished_at + delay)
                    print(f"{log_prefix} {model_name}: {tag} 429 rate_limit ({delay_src}) -> failover/cooldown")
                    continue

                if cls.kind == "transient":
                    attempts_per_key[chosen.index] += 1
                    strike = transient_strikes[chosen.index]
                    transient_strikes[chosen.index] += 1
                    if cls.retry_delay_sec is not None:
                        delay = min(self.max_retry_delay_sec, max(0.0, cls.retry_delay_sec))
                    else:
                        base = min(25.0, 2.5 * (2 ** strike))
                        delay = base + max(0.0, float(self._jitter(0.2, 1.0)))
                    chosen.cooldown_until = max(chosen.cooldown_until, finished_at + delay)
                    print(f"{log_prefix} {model_name}: {tag} transient ({delay:.2f}s) -> {safe_reason[:120]}")
                    continue

                if cls.kind == "auth":
                    chosen.disabled_reason = safe_reason
                    print(f"{log_prefix} {model_name}: {tag} auth disabled -> {safe_reason[:120]}")
                    continue

                raise


class GeminiTTSClient:
    """Gemini v1beta TTS クライアント（純日本語送信・2キー自動フェイルオーバー・キャッシュ対応）。"""

    provider_name: str = "gemini"

    def __init__(
        self,
        api_key: str | None = None,
        *,
        api_keys: Sequence[str] | None = None,
        fallback_api_key: str | None = None,
        voice_name: str = "Charon",
        models: Sequence[str] = DEFAULT_TTS_MODELS,
        api_version: str = "v1beta",
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        temperature: float | None = 0.35,
        request_interval_sec: float = DEFAULT_KEY_MIN_INTERVAL_SEC,
        max_retries_per_key: int = 2,
        attempts_per_model: int = 1,
        trim_pre_filters: str | None = None,
        trim_post_filters: str | None = None,
        repo_root: Path | None = None,
        load_env: bool = True,
        key_pool: GeminiKeyPool | None = None,
        client_factory: Callable[[str, str], Any] | None = None,
        clock: Callable[[], float] | None = None,
        sleep_fn: Callable[[float], None] | None = None,
        jitter_fn: Callable[[float, float], float] | None = None,
    ) -> None:
        self._explicit_api_key = api_key
        self._repo_root = repo_root
        self.voice_name = voice_name
        self.models = tuple(models)
        self.api_version = api_version
        self.sample_rate = sample_rate
        self.temperature = temperature
        self.request_interval_sec = request_interval_sec
        self.attempts_per_model = max(1, int(attempts_per_model))
        self.trim_pre_filters = trim_pre_filters
        self.trim_post_filters = trim_post_filters
        self.key_pool = key_pool or GeminiKeyPool(
            api_keys=api_keys,
            api_key=api_key,
            fallback_api_key=fallback_api_key,
            api_version=api_version,
            min_interval_sec=request_interval_sec,
            max_retries_per_key=max_retries_per_key,
            repo_root=repo_root,
            load_env=load_env,
            client_factory=client_factory,
            clock=clock,
            sleep_fn=sleep_fn,
            jitter_fn=jitter_fn,
        )
        self._supports_lang_code = True
        self._lang_code_unsupported_models: set[str] = set()

    @property
    def client(self) -> Any:
        """必要なタイミングでのみ .env を読み込みプライマリ genai.Client を遅延初期化する（後方互換）。"""
        return self.key_pool.get_primary_client()

    def generate_audio_bytes(
        self,
        text: str,
        *,
        model_name: str,
        voice_name: str | None = None,
        temperature: float | None = _UNSET,
        language_code: str | None = "ja-JP",
        system_instruction: str | None = None,
        sanitize: bool = True,
        log_prefix: str = "[TTS]",
    ) -> tuple[bytes, str, int]:
        """指定モデル・ボイスで音声バイト列を生成し、(audio_bytes, mime_type, key_index) を返す。"""
        payload_text = sanitize_japanese_text(text) if sanitize else text
        target_voice = voice_name or self.voice_name
        effective_temp = self.temperature if temperature is _UNSET else temperature
        _, types_mod = _import_genai()

        def _invoke(api_client: Any, _key_index: int) -> tuple[bytes, str]:
            speech_kwargs: dict[str, Any] = {
                "voice_config": types_mod.VoiceConfig(
                    prebuilt_voice_config=types_mod.PrebuiltVoiceConfig(voice_name=target_voice)
                )
            }
            use_lang = bool(
                language_code
                and self._supports_lang_code
                and model_name not in self._lang_code_unsupported_models
            )
            if use_lang:
                speech_kwargs["language_code"] = language_code

            cfg_kwargs: dict[str, Any] = {
                "response_modalities": ["AUDIO"],
                "speech_config": types_mod.SpeechConfig(**speech_kwargs),
            }
            if effective_temp is not None:
                cfg_kwargs["temperature"] = effective_temp
            if system_instruction:
                cfg_kwargs["system_instruction"] = system_instruction

            try:
                resp = api_client.models.generate_content(
                    model=model_name,
                    contents=payload_text,
                    config=types_mod.GenerateContentConfig(**cfg_kwargs),
                )
            except Exception as exc:
                if use_lang and "INVALID_ARGUMENT" in str(exc):
                    self._lang_code_unsupported_models.add(model_name)
                    speech_kwargs.pop("language_code", None)
                    cfg_kwargs["speech_config"] = types_mod.SpeechConfig(**speech_kwargs)
                    resp = api_client.models.generate_content(
                        model=model_name,
                        contents=payload_text,
                        config=types_mod.GenerateContentConfig(**cfg_kwargs),
                    )
                else:
                    raise
            return extract_audio_from_response(resp)

        (audio_bytes, mime), key_index = self.key_pool.call_with_failover(
            model_name,
            _invoke,
            log_prefix=log_prefix,
        )
        return audio_bytes, mime, key_index

    def key_label_for(self, key_index: int) -> str:
        """キー index をログ・マニフェスト用ラベル（key#1(primary) 等、生キーは含まない）へ変換する。"""
        keys = self.key_pool.ensure_initialized()
        if 0 <= key_index < len(keys):
            return GeminiKeyPool._key_tag(keys[key_index])
        return f"key#{key_index + 1}"

    def _trim(self, raw_wav: Path, clean_wav: Path, stop_duration: float) -> float:
        return trim_and_resample_tts(
            raw_wav,
            clean_wav,
            sample_rate=self.sample_rate,
            stop_duration=stop_duration,
            pre_filters=self.trim_pre_filters,
            post_filters=self.trim_post_filters,
        )

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
        """1 チャンクを生成（または有効キャッシュ利用）し、無音トリム＋ffprobe計測結果を返す。

        - models: 今回だけ優先順位を差し替えるモデル列（省略時は self.models）。
        - max_expected_sec: 生成直後の実尺がこれを超えたら異常として同一モデルで再試行する
          （試行回数は attempts_per_model）。省略時は文字数からの既定上限を使う。
        """
        out_dir.mkdir(parents=True, exist_ok=True)
        pure_text = sanitize_japanese_text(chunk.text)
        raw_wav = out_dir / f"{chunk.chunk_id}_raw.wav"
        clean_wav = out_dir / f"{chunk.chunk_id}.wav"
        target_voice = chunk.voice_name or self.voice_name
        max_dur = max_expected_sec if max_expected_sec is not None else max(3.5, len(pure_text) * 0.25 + 1.4)

        if not force and raw_wav.is_file() and raw_wav.stat().st_size > 4000:
            dur = self._trim(raw_wav, clean_wav, stop_duration)
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
                    voice_used=target_voice,
                )

        self.key_pool.ensure_initialized()
        model_order = tuple(models) if models is not None else self.models
        last_err: Exception | None = None
        exhausted_models = 0

        for model_name in model_order:
            if self.key_pool.is_model_exhausted(model_name):
                exhausted_models += 1
                continue
            quota_hit = False
            for attempt in range(1, self.attempts_per_model + 1):
                try:
                    audio_bytes, mime, key_index = self.generate_audio_bytes(
                        pure_text,
                        model_name=model_name,
                        voice_name=target_voice,
                        temperature=self.temperature,
                        language_code="ja-JP",
                        sanitize=False,
                        log_prefix=f"[TTS:{chunk.chunk_id}]",
                    )
                    write_raw_audio_as_wav(audio_bytes, mime, raw_wav)
                    dur = self._trim(raw_wav, clean_wav, stop_duration)
                    if not (0.35 <= dur <= max_dur):
                        raise RuntimeError(f"Abnormal TTS duration {dur:.3f}s (expected 0.35..{max_dur:.2f}s)")
                    return SynthesizedChunk(
                        chunk_id=chunk.chunk_id,
                        text=pure_text,
                        raw_wav=raw_wav,
                        clean_wav=clean_wav,
                        duration_sec=dur,
                        pause_after_sec=chunk.pause_after_sec,
                        model_used=model_name,
                        cached=False,
                        voice_used=target_voice,
                        key_label=self.key_label_for(key_index),
                    )
                except GeminiQuotaExhaustedError as exc:
                    last_err = exc
                    quota_hit = True
                    print(f"[TTS:{chunk.chunk_id}] {model_name}: all keys exhausted (daily quota) -> next model")
                    break
                except Exception as exc:
                    last_err = exc
                    print(
                        f"[TTS:{chunk.chunk_id}] {model_name}/{target_voice} attempt {attempt}/"
                        f"{self.attempts_per_model} failed: {type(exc).__name__}: {str(exc)[:160]}"
                    )
            if quota_hit:
                exhausted_models += 1
            print(f"[TTS:{chunk.chunk_id}] falling back from {model_name}")

        if exhausted_models == len(model_order) and model_order:
            raise GeminiQuotaExhaustedError(
                f"TTS quota exhausted across all models for {chunk.chunk_id}: {last_err}",
                model_name=model_order[-1],
            ) from last_err
        raise RuntimeError(f"TTS failed for {chunk.chunk_id}: {last_err}") from last_err

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
        for chunk in chunks:
            res = self.synthesize_chunk(chunk, out_dir, force=force, stop_duration=stop_duration)
            if not res.cached:
                used_model = res.model_used
            results.append(res)
        return results, used_model

    def synthesize_onetake_block(
        self,
        chunks: Sequence[NarrationChunk],
        out_dir: Path,
        *,
        block_id: str = "onetake_block",
        force: bool = False,
        separator: str = "\n",
        max_internal_silence_sec: float | None = None,
        keep_silence_sec: float = 0.36,
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
            default_voice=self.voice_name,
        )
        effective_voice = target_voice or self.voice_name
        raw_wav = out_dir / f"{block_id}_raw.wav"
        clean_wav = out_dir / f"{block_id}.wav"
        meta_path = out_dir / f"{block_id}_meta.json"

        sig_payload = json.dumps(
            {
                "texts": pure_texts,
                "separator": separator,
                "voice": effective_voice,
                "max_internal_silence_sec": max_internal_silence_sec,
                "keep_silence_sec": keep_silence_sec,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
        signature = hashlib.sha256(sig_payload.encode("utf-8")).hexdigest()

        total_mora = sum(max(0.5, estimate_japanese_morae(t)) for t in pure_texts)
        min_dur = min_expected_sec if min_expected_sec is not None else max(0.5, total_mora * 0.045)
        max_dur = max_expected_sec if max_expected_sec is not None else max(6.0, len(joined_text) * 0.28 + 4.0)

        if not force and raw_wav.is_file() and raw_wav.stat().st_size > 4000 and meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                meta = {}
            if meta.get("signature") == signature:
                dur = trim_onetake_tts(
                    raw_wav,
                    clean_wav,
                    sample_rate=self.sample_rate,
                    max_internal_silence_sec=max_internal_silence_sec,
                    keep_silence_sec=keep_silence_sec,
                    pre_filters=self.trim_pre_filters,
                    post_filters=self.trim_post_filters,
                )
                if min_dur <= dur <= max_dur:
                    spans, aligner_used, summary = align_chunks_to_wav(
                        chunks,
                        clean_wav,
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
                    )

        self.key_pool.ensure_initialized()
        model_order = tuple(models) if models is not None else self.models
        last_err: Exception | None = None
        exhausted_models = 0

        for model_name in model_order:
            if self.key_pool.is_model_exhausted(model_name):
                exhausted_models += 1
                continue
            quota_hit = False
            for attempt in range(1, self.attempts_per_model + 1):
                try:
                    audio_bytes, mime, key_index = self.generate_audio_bytes(
                        joined_text,
                        model_name=model_name,
                        voice_name=effective_voice,
                        temperature=self.temperature,
                        language_code="ja-JP",
                        sanitize=False,
                        log_prefix=f"[TTS-1TAKE:{block_id}]",
                    )
                    write_raw_audio_as_wav(audio_bytes, mime, raw_wav)
                    dur = trim_onetake_tts(
                        raw_wav,
                        clean_wav,
                        sample_rate=self.sample_rate,
                        max_internal_silence_sec=max_internal_silence_sec,
                        keep_silence_sec=keep_silence_sec,
                        pre_filters=self.trim_pre_filters,
                        post_filters=self.trim_post_filters,
                    )
                    if not (min_dur <= dur <= max_dur):
                        raise RuntimeError(
                            f"Abnormal one-take TTS duration {dur:.3f}s (expected {min_dur:.2f}..{max_dur:.2f}s)"
                        )
                    spans, aligner_used, summary = align_chunks_to_wav(
                        chunks,
                        clean_wav,
                        aligner=aligner,
                        whisper_model_path=whisper_model_path,
                    )
                    silences = tuple(detect_silence_intervals(clean_wav, min_duration_sec=0.06))
                    key_lbl = self.key_label_for(key_index)
                    meta_payload = {
                        "blockId": block_id,
                        "signature": signature,
                        "chunkIds": [c.chunk_id for c in chunks],
                        "modelUsed": model_name,
                        "voiceUsed": effective_voice,
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
                        voice_used=effective_voice,
                        key_label=key_lbl,
                        cached=False,
                        api_calls=1,
                        aligner_used=aligner_used,
                        alignment_summary=summary,
                        chunks=tuple(spans),
                        silences=silences,
                    )
                except GeminiQuotaExhaustedError as exc:
                    last_err = exc
                    quota_hit = True
                    print(f"[TTS-1TAKE:{block_id}] {model_name}: all keys exhausted (daily quota) -> next model")
                    break
                except Exception as exc:
                    last_err = exc
                    print(
                        f"[TTS-1TAKE:{block_id}] {model_name}/{effective_voice} attempt {attempt}/"
                        f"{self.attempts_per_model} failed: {type(exc).__name__}: {str(exc)[:160]}"
                    )
            if quota_hit:
                exhausted_models += 1
            print(f"[TTS-1TAKE:{block_id}] falling back from {model_name}")

        if exhausted_models == len(model_order) and model_order:
            raise GeminiQuotaExhaustedError(
                f"One-take TTS quota exhausted across all models for {block_id}: {last_err}",
                model_name=model_order[-1],
            ) from last_err
        raise RuntimeError(f"One-take TTS failed for {block_id}: {last_err}") from last_err


def build_audio_first_timeline(
    chunks: Sequence[NarrationChunk],
    durations: Mapping[str, float],
    tts_dir: Path | None = None,
    *,
    fps: int = DEFAULT_FPS,
    width: int = 1920,
    height: int = 1080,
    leading_silence_sec: float = 0.15,
    target_total_sec: float | None = None,
    min_tempo: float = 0.92,
    max_tempo: float = 1.18,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    detect_pauses: bool = True,
) -> dict[str, Any]:
    """音声実尺を最優先にしてチャンク単位のタイムライン（秒・フレーム・息継ぎ位置）を確定する。"""
    working_durations = {c.chunk_id: float(durations[c.chunk_id]) for c in chunks}
    pauses = {c.chunk_id: float(c.pause_after_sec) for c in chunks}
    applied_tempo = 1.0

    raw_speech = sum(working_durations.values())
    raw_pauses = sum(pauses.values())
    raw_total = leading_silence_sec + raw_speech + raw_pauses

    if target_total_sec is not None and abs(raw_total - target_total_sec) > 0.8:
        desired_pauses = target_total_sec - leading_silence_sec - raw_speech
        scale_p = desired_pauses / max(raw_pauses, 0.01)
        if 0.65 <= scale_p <= 1.65:
            for c in chunks:
                pauses[c.chunk_id] = max(0.10, c.pause_after_sec * scale_p)
        else:
            applied_tempo = max(
                min_tempo,
                min(max_tempo, raw_speech / max(target_total_sec - leading_silence_sec - raw_pauses, 1.0)),
            )
            for c in chunks:
                if tts_dir is not None:
                    clean_wav = tts_dir / f"{c.chunk_id}.wav"
                    paced_wav = tts_dir / f"{c.chunk_id}_paced.wav"
                    if clean_wav.is_file():
                        working_durations[c.chunk_id] = scale_wav_tempo(
                            clean_wav, paced_wav, applied_tempo, sample_rate=sample_rate
                        )
                        continue
                working_durations[c.chunk_id] = working_durations[c.chunk_id] / applied_tempo

            new_speech = sum(working_durations.values())
            rem_p = max(0.5, target_total_sec - leading_silence_sec - new_speech)
            scale_p2 = rem_p / max(raw_pauses, 0.01)
            for c in chunks:
                pauses[c.chunk_id] = max(0.10, c.pause_after_sec * max(0.55, min(1.6, scale_p2)))

    if tts_dir is not None and abs(applied_tempo - 1.0) < 0.005:
        for c in chunks:
            clean_wav = tts_dir / f"{c.chunk_id}.wav"
            paced_wav = tts_dir / f"{c.chunk_id}_paced.wav"
            if clean_wav.is_file():
                scale_wav_tempo(clean_wav, paced_wav, 1.0, sample_rate=sample_rate)

    cursor = leading_silence_sec
    chunk_times: dict[str, dict[str, Any]] = {}
    for c in chunks:
        dur = working_durations[c.chunk_id]
        pause_sec = pauses[c.chunk_id]
        start = cursor
        speech_end = start + dur
        end = speech_end + pause_sec

        internal_pauses: list[float] = []
        paced_path: str | None = None
        if tts_dir is not None:
            candidate = tts_dir / f"{c.chunk_id}_paced.wav"
            if not candidate.is_file():
                candidate = tts_dir / f"{c.chunk_id}.wav"
            if candidate.is_file():
                paced_path = str(candidate)
                if detect_pauses:
                    internal_pauses = [round(start + m, 4) for m in detect_internal_pauses(candidate)]

        chunk_times[c.chunk_id] = {
            "text": c.text,
            "startSec": round(start, 4),
            "speechEndSec": round(speech_end, 4),
            "endSec": round(end, 4),
            "startFrame": int(round(start * fps)),
            "endFrame": int(round(end * fps)),
            "durationSec": round(dur, 4),
            "pauseSec": round(pause_sec, 4),
            "internalPausesSec": internal_pauses,
            "pacedWav": paced_path,
        }
        cursor = end

    total_duration = round(cursor, 3)
    total_frames = int(math.ceil(total_duration * fps))

    return {
        "fps": fps,
        "width": width,
        "height": height,
        "totalDurationSec": total_duration,
        "totalFrames": total_frames,
        "appliedTempo": round(applied_tempo, 4),
        "chunks": chunk_times,
    }


def build_onetake_timeline(
    onetake: OneTakeSynthesisResult,
    tts_dir: Path | None = None,
    *,
    fps: int = DEFAULT_FPS,
    width: int = 1920,
    height: int = 1080,
    leading_silence_sec: float = 0.12,
    target_total_sec: float | None = None,
    trailing_pad_sec: float = 0.25,
    min_tempo: float = 0.95,
    max_tempo: float = 1.08,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
) -> dict[str, Any]:
    """ワンテイク一括音声の自動アライメント結果を Remotion 互換タイムラインへ変換する。"""
    clean_wav = onetake.clean_wav
    clean_dur = ffprobe_duration(clean_wav) if clean_wav.is_file() else float(onetake.total_duration_sec)

    applied_tempo = 1.0
    if target_total_sec is not None:
        target_speech = max(1.0, float(target_total_sec) - leading_silence_sec - trailing_pad_sec)
        raw_tempo = clean_dur / target_speech
        applied_tempo = max(min_tempo, min(max_tempo, raw_tempo))
        if abs(applied_tempo - 1.0) < 0.015 and (leading_silence_sec + clean_dur) <= (float(target_total_sec) - 0.05):
            applied_tempo = 1.0

    out_dir = tts_dir if tts_dir is not None else clean_wav.parent
    paced_wav = out_dir / f"{onetake.block_id}_paced.wav"
    if clean_wav.is_file():
        paced_dur = scale_wav_tempo(clean_wav, paced_wav, applied_tempo, sample_rate=sample_rate)
        paced_path: str | None = str(paced_wav)
    else:
        paced_dur = clean_dur / applied_tempo
        paced_path = str(clean_wav)

    scale = paced_dur / max(clean_dur, 1e-6)
    natural_total = round(leading_silence_sec + paced_dur + trailing_pad_sec, 3)
    total_duration = round(float(target_total_sec), 3) if target_total_sec is not None else natural_total
    if target_total_sec is not None and (leading_silence_sec + paced_dur) > total_duration:
        total_duration = round(leading_silence_sec + paced_dur + 0.08, 3)

    chunk_times: dict[str, dict[str, Any]] = {}
    n_spans = len(onetake.chunks)
    for idx, span in enumerate(onetake.chunks):
        start = leading_silence_sec + span.start_sec * scale
        speech_end = leading_silence_sec + span.speech_end_sec * scale
        end = total_duration if idx == n_spans - 1 else (leading_silence_sec + span.end_sec * scale)
        end = max(speech_end, end)
        dur = max(0.05, speech_end - start)
        pause_sec = max(0.0, end - speech_end)
        internal_pauses = [round(leading_silence_sec + p * scale, 4) for p in span.internal_pauses_sec]
        sent_spans = [
            [
                round(leading_silence_sec + s0 * scale, 4),
                round(leading_silence_sec + s1 * scale, 4),
                stxt,
            ]
            for s0, s1, stxt in span.sentence_spans
        ]

        chunk_times[span.chunk_id] = {
            "text": span.text,
            "startSec": round(start, 4),
            "speechEndSec": round(speech_end, 4),
            "endSec": round(end, 4),
            "startFrame": int(round(start * fps)),
            "endFrame": int(round(end * fps)),
            "durationSec": round(dur, 4),
            "pauseSec": round(pause_sec, 4),
            "internalPausesSec": internal_pauses,
            "sentenceSpans": sent_spans,
            "boundaryConfidence": span.boundary_confidence,
            "boundarySource": span.boundary_source,
            "pacedWav": paced_path,
        }

    total_frames = int(math.ceil(total_duration * fps))
    return {
        "fps": fps,
        "width": width,
        "height": height,
        "totalDurationSec": total_duration,
        "totalFrames": total_frames,
        "appliedTempo": round(applied_tempo, 4),
        "ttsMode": "onetake",
        "ttsModel": onetake.model_used,
        "ttsVoice": onetake.voice_used,
        "ttsApiCalls": onetake.api_calls,
        "onetakeWav": paced_path,
        "leadingSilenceSec": round(leading_silence_sec, 4),
        "aligner": onetake.aligner_used,
        "alignmentSummary": onetake.alignment_summary,
        "chunks": chunk_times,
    }


def export_timeline_manifest(
    timeline: Mapping[str, Any],
    json_path: Path,
    ts_path: Path | None = None,
    *,
    ts_export_name: str = "TIMELINE",
) -> None:
    """音声先行タイムラインを JSON（および任意で Remotion 用 TypeScript 定数ファイル）へ書き出す。"""
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(timeline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if ts_path is not None:
        ts_path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(timeline, ensure_ascii=False, indent=2)
        ts_content = (
            "// Auto-generated by yt_engine.audio.tts_gemini\n"
            "// 音声実尺（ffprobe計測）先行で同期された Remotion タイムライン定義。\n\n"
            f"export const {ts_export_name} = {payload} as const;\n"
        )
        ts_path.write_text(ts_content, encoding="utf-8")
