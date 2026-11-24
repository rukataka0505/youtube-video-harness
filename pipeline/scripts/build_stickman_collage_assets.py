"""stickman-collage (formatId: stickman_collage) Spec検証・ドライラン・ElevenLabs v4 音声＆タイムラインビルドCLI。"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import struct
import sys
import unicodedata
import wave
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
_SRC_DIR = str(REPO_ROOT / "pipeline" / "src")
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from yt_engine.audio import (  # noqa: E402
    DEFAULT_ELEVENLABS_VOICE_ID,
    DEFAULT_ELEVENLABS_VOICE_NAME,
    ElevenLabsTTSClient,
    NarrationChunk,
    SfxEvent,
    assemble_narration_track,
    build_onetake_timeline,
    compose_onetake_prompt,
    export_sfx_library,
    ffprobe_duration,
    load_dotenv,
    mix_master_audio,
    render_sfx_track,
    run_cmd,
    sanitize_japanese_text,
)
from yt_engine.stickman_subtitles import aligned_subtitles  # noqa: E402
from yt_engine.stickman_collage_validator import (  # noqa: E402
    CANONICAL_POLARITIES,
    ValidationReport,
    format_validation_report,
    resolve_chapter_eyecatch_spec,
    validate_stickman_collage_spec,
)

SAMPLE_RATE = 48000
DEFAULT_LEADING_SILENCE_SEC = 0.35
POST_CHAPTER_PAUSE_SEC = 0.55
TARGET_LUFS = -14.0
TARGET_TP = -1.4
TARGET_LRA = 9.0
PUNCT = "、。！？"


def _configure_stdio_utf8() -> None:
    """Windows cp932 環境での標準入出力エンコード例外を防ぐ。"""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _split_phrases(text: str) -> list[str]:
    out: list[str] = []
    cur = ""
    for ch in text:
        cur += ch
        if ch in PUNCT:
            out.append(cur)
            cur = ""
    if cur:
        out.append(cur)
    return out or [text]


_KANJI_DIGIT_VAL = {
    "〇": 0,
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}
_KANJI_UNIT_VAL = {"十": 10, "百": 100, "千": 1000}
_CUE_NOISE_RE = re.compile(r"[\s、。！？・「」『』（）()【】\[\]:：\-—~〜!?,.'\"…%％¥$円]")


def _parse_kanji_numeral_token(token: str) -> str:
    if not any(u in token for u in _KANJI_UNIT_VAL):
        return "".join(str(_KANJI_DIGIT_VAL.get(c, c)) for c in token)
    total = 0
    current = 0
    for ch in token:
        if ch in _KANJI_DIGIT_VAL:
            current = _KANJI_DIGIT_VAL[ch]
        elif ch in _KANJI_UNIT_VAL:
            unit = _KANJI_UNIT_VAL[ch]
            total += (1 if current == 0 else current) * unit
            current = 0
    return str(total + current)


def _normalize_cue_text_with_map(raw: str) -> tuple[str, list[int]]:
    chars = list(str(raw or ""))
    norm_chars: list[str] = []
    norm_to_orig: list[int] = []
    i = 0
    while i < len(chars):
        ch = chars[i]
        if ch in _KANJI_DIGIT_VAL or ch in _KANJI_UNIT_VAL:
            start = i
            tok = ""
            while i < len(chars) and (chars[i] in _KANJI_DIGIT_VAL or chars[i] in _KANJI_UNIT_VAL):
                tok += chars[i]
                i += 1
            for d in _parse_kanji_numeral_token(tok):
                norm_chars.append(d)
                norm_to_orig.append(start)
            continue

        nfkc = unicodedata.normalize("NFKC", ch).lower()
        for sub in nfkc:
            if not _CUE_NOISE_RE.match(sub):
                code = ord(sub)
                if 0x30A1 <= code <= 0x30F6:
                    sub = chr(code - 0x60)
                norm_chars.append(sub)
                norm_to_orig.append(i)
        i += 1
    return "".join(norm_chars), norm_to_orig


def _build_phrase_cues(chars: list[str], starts: list[float], ends: list[float]) -> list[dict[str, Any]]:
    phrases: list[dict[str, Any]] = []
    buf: list[str] = []
    p_start: float | None = None
    p_end = 0.0
    for ch, st, en in zip(chars, starts, ends):
        if p_start is None:
            p_start = st
        buf.append(ch)
        p_end = en
        if ch in PUNCT:
            txt = "".join(buf).strip()
            if txt:
                phrases.append({"text": txt, "startSec": p_start, "endSec": p_end})
            buf = []
            p_start = None
    if buf and p_start is not None:
        txt = "".join(buf).strip()
        if txt:
            phrases.append({"text": txt, "startSec": p_start, "endSec": p_end})
    return phrases


def _extract_shot_alignment(
    align: Any,
    joined: str,
    char_offset: int,
    reading: str,
    a_off: float,
    c_start: float,
    s_start: float,
    s_end: float,
) -> dict[str, Any]:
    """ElevenLabs の文字単位アライメントからショット相対秒の語・文字タイミングを抽出する。"""
    if align is not None and getattr(align, "characters", None) and reading:
        map_fn = getattr(align, "_map_char_index", None)
        if callable(map_fn):
            idx_start = map_fn(joined, char_offset)
            idx_end = map_fn(joined, char_offset + len(reading))
            if idx_start is not None and idx_end is not None and idx_end > idx_start:
                chars_raw = align.characters[idx_start:idx_end]
                starts_raw = align.start_times_sec[idx_start:idx_end]
                ends_raw = align.end_times_sec[idx_start:idx_end]
                chars: list[str] = []
                c_starts: list[float] = []
                c_ends: list[float] = []
                for ch, st, en in zip(chars_raw, starts_raw, ends_raw):
                    if ch in ("\n", "\r"):
                        continue
                    rel_st = round(max(0.0, a_off + float(st) - c_start), 4)
                    rel_en = round(max(rel_st, a_off + float(en) - c_start), 4)
                    chars.append(str(ch))
                    c_starts.append(rel_st)
                    c_ends.append(rel_en)
                if chars:
                    return {
                        "text": "".join(chars),
                        "characters": chars,
                        "charStartSec": c_starts,
                        "charEndSec": c_ends,
                        "phrases": _build_phrase_cues(chars, c_starts, c_ends),
                        "source": str(getattr(align, "source", "elevenlabs_with_timestamps")),
                    }

    # フォールバック：発話区間を文字数で等分補間
    fallback_text = reading or "。"
    chars = list(fallback_text)
    n = max(1, len(chars))
    rel_s0 = max(0.0, s_start - c_start)
    rel_s1 = max(rel_s0 + 0.05, s_end - c_start)
    span = rel_s1 - rel_s0
    c_starts = [round(rel_s0 + span * (i / n), 4) for i in range(n)]
    c_ends = [round(rel_s0 + span * ((i + 1) / n), 4) for i in range(n)]
    return {
        "text": fallback_text,
        "characters": chars,
        "charStartSec": c_starts,
        "charEndSec": c_ends,
        "phrases": _build_phrase_cues(chars, c_starts, c_ends),
        "source": "interpolated",
    }


def _resolve_phrase_in_alignment(alignment: dict[str, Any], phrase: str) -> float | None:
    """alignment 辞書内から phrase のショット内相対開始秒を引く。"""
    q = str(phrase or "").strip()
    if not q:
        return None
    starts = alignment.get("charStartSec") or []
    chars = alignment.get("characters") or []
    raw_text = str(alignment.get("text") or "".join(chars))
    if not raw_text or not starts:
        return None

    exact = raw_text.find(q)
    if exact >= 0 and exact < len(starts):
        return float(starts[exact])

    q_norm, _ = _normalize_cue_text_with_map(q)
    if not q_norm:
        return None
    t_norm, t_map = _normalize_cue_text_with_map(raw_text)
    if not t_norm:
        return None

    pos = t_norm.find(q_norm)
    if pos >= 0:
        orig = t_map[pos]
        if 0 <= orig < len(starts):
            return float(starts[orig])

    if len(q_norm) >= 2:
        min_pref = max(2, math.ceil(len(q_norm) * 0.5))
        for plen in range(len(q_norm) - 1, min_pref - 1, -1):
            pos = t_norm.find(q_norm[:plen])
            if pos >= 0:
                orig = t_map[pos]
                if 0 <= orig < len(starts):
                    return float(starts[orig])
    return None


def _shot_pause_plan(raw_shots: list[dict[str, Any]], tl: dict[str, Any]) -> list[tuple[float, float]]:
    """ショット単位の演出「間」（spec の shots[].pauseAfterSec）を、挿入時刻と長さの組へ変換する。

    読み上げ原稿にト書きを入れずに結論・反転・オチ前の間を作るための仕組み。挿入位置は
    そのショットの発話終了と次ショットの発話開始の中点（＝既存の自然な無音の中）とし、最終ショットは対象外
    （章末は章末ポーズ・アイキャッチ側で扱う）。
    """
    plan: list[tuple[float, float]] = []
    chunks = tl.get("chunks") or {}
    for k in range(len(raw_shots) - 1):
        try:
            pause = float(raw_shots[k].get("pauseAfterSec") or 0.0)
        except (TypeError, ValueError):
            pause = 0.0
        if pause <= 0.0:
            continue
        cur = chunks.get(str(raw_shots[k]["chunkId"]))
        nxt = chunks.get(str(raw_shots[k + 1]["chunkId"]))
        if not cur or not nxt:
            continue
        speech_end = float(cur["speechEndSec"])
        next_start = max(speech_end, float(nxt["startSec"]))
        plan.append((round((speech_end + next_start) / 2.0, 4), round(min(pause, 3.0), 4)))
    return sorted(plan)


def _shift_time_by_pauses(t: float, plan: list[tuple[float, float]]) -> float:
    return round(t + sum(p for at, p in plan if t >= at), 4)


def _insert_pauses_into_wav(src: Path, dst: Path, plan: list[tuple[float, float]]) -> Path:
    """WAV の指定時刻へ無音を挿入した新しい WAV を書き出す（元 WAV は変更しない）。"""
    with wave.open(str(src), "rb") as rf:
        params = rf.getparams()
        frames = rf.readframes(rf.getnframes())
    frame_bytes = params.sampwidth * params.nchannels
    out = bytearray()
    cursor = 0
    for at, pause in plan:
        cut = min(len(frames), int(round(at * params.framerate)) * frame_bytes)
        out += frames[cursor:cut]
        out += b"\x00" * (int(round(pause * params.framerate)) * frame_bytes)
        cursor = cut
    out += frames[cursor:]
    dst.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(dst), "wb") as wf:
        wf.setparams(params)
        wf.writeframes(bytes(out))
    return dst


def _apply_pause_plan_to_timeline(tl: dict[str, Any], plan: list[tuple[float, float]]) -> None:
    for span in (tl.get("chunks") or {}).values():
        for key in ("startSec", "speechEndSec", "endSec"):
            if key in span:
                span[key] = _shift_time_by_pauses(float(span[key]), plan)
        if "internalPausesSec" in span:
            span["internalPausesSec"] = [_shift_time_by_pauses(float(x), plan) for x in span["internalPausesSec"]]
        if "sentenceSpans" in span:
            span["sentenceSpans"] = [
                [_shift_time_by_pauses(float(a), plan), _shift_time_by_pauses(float(b), plan), txt]
                for a, b, txt in span["sentenceSpans"]
            ]


def _apply_pause_plan_to_alignment(align: Any, plan: list[tuple[float, float]]) -> Any:
    if align is None:
        return None
    return type(align)(
        characters=align.characters,
        start_times_sec=tuple(_shift_time_by_pauses(float(x), plan) for x in align.start_times_sec),
        end_times_sec=tuple(_shift_time_by_pauses(float(x), plan) for x in align.end_times_sec),
        source=align.source,
    )


def _safe_sanitize_tts(text: str) -> str:
    raw = str(text or "")
    if not raw.strip():
        return ""
    try:
        return sanitize_japanese_text(raw)
    except ValueError:
        return ""


def _is_end_cta_enabled(spec: dict[str, Any]) -> bool:
    end_cta = spec.get("endCta")
    return isinstance(end_cta, dict) and end_cta.get("enabled", True) is not False


def _compute_chapter_eyecatch_slot(
    cursor: float,
    fps: int,
    eyecatch_cfg: dict[str, Any],
) -> tuple[dict[str, Any], float]:
    """章頭アイキャッチの専用無音スロット（本体＋後間）をフレーム境界整合で算出し、(runtime_eyecatch, resume_sec) を返す。"""
    safe_fps = max(1, int(fps))
    start_frame = max(0, math.ceil(cursor * safe_fps - 1e-6))
    dur_frames = max(1, round(float(eyecatch_cfg["durationSec"]) * safe_fps))
    end_frame = start_frame + dur_frames
    post_pause_frames = max(1, math.ceil(float(eyecatch_cfg["postPauseSec"]) * safe_fps - 1e-6))
    resume_frame = end_frame + post_pause_frames

    ec_start = round(start_frame / safe_fps, 4)
    ec_end = round(end_frame / safe_fps, 4)
    resume_sec = round(resume_frame / safe_fps, 4)
    return (
        {
            "variant": str(eyecatch_cfg["variant"]),
            "showName": bool(eyecatch_cfg["showName"]),
            "withSfx": bool(eyecatch_cfg["withSfx"]),
            "sfxVolume": float(eyecatch_cfg["sfxVolume"]),
            "startSec": ec_start,
            "endSec": ec_end,
            "durationSec": round(ec_end - ec_start, 4),
            "startFrame": start_frame,
            "endFrame": end_frame,
            "leadInSec": float(eyecatch_cfg["leadInSec"]),
            "postPauseSec": round(resume_sec - ec_end, 4),
        },
        resume_sec,
    )


def _estimate_dry_run_summary(spec: dict[str, Any]) -> dict[str, Any]:
    chapters = spec.get("chapters") or []
    end_cta = spec.get("endCta") or {}
    end_enabled = _is_end_cta_enabled(spec)
    total_shots = 0
    tsx_scene_shots = 0
    media_backdrop_shots = 0
    total_chars = 0
    total_target_sec = 0.0
    total_beats = 0
    total_sfx = 0
    chapter_eyecatches = 0
    eyecatch_total_sec = 0.0
    polarity_counts = {pol: 0 for pol in CANONICAL_POLARITIES}
    polarity_seq: list[str] = []

    for ch in chapters:
        ec_cfg = resolve_chapter_eyecatch_spec(ch) if isinstance(ch, dict) else None
        if ec_cfg is not None:
            chapter_eyecatches += 1
            ec_span = float(ec_cfg["leadInSec"]) + float(ec_cfg["durationSec"]) + float(ec_cfg["postPauseSec"])
            eyecatch_total_sec += ec_span
            total_target_sec += ec_span
        for sh in ch.get("shots") or []:
            total_shots += 1
            if isinstance(sh.get("scene"), dict) and sh["scene"].get("mode") == "tsx":
                tsx_scene_shots += 1
            if sh.get("mediaBackdrop") is not None:
                media_backdrop_shots += 1
            total_target_sec += float(sh.get("targetDurationSec") or 0.0)
            cleaned = _safe_sanitize_tts(str(sh.get("narrationJa") or ""))
            total_chars += len(cleaned)
            total_beats += len(sh.get("beats") or [])
            total_sfx += len(sh.get("sfx") or [])
            pol = str(sh.get("polarity") or "black")
            polarity_counts[pol] = polarity_counts.get(pol, 0) + 1
            polarity_seq.append(pol)

    switches = sum(1 for i in range(1, len(polarity_seq)) if polarity_seq[i] != polarity_seq[i - 1])

    if end_enabled:
        end_cleaned = _safe_sanitize_tts(str(end_cta.get("narrationJa") or ""))
        total_chars += len(end_cleaned)
        total_target_sec += float(end_cta.get("durationSec") or 7.0)

    est_tts_sec = round(total_chars / (334.0 / 60.0), 2) if total_chars > 0 else 0.0
    audio_cfg = spec.get("audio") or {}
    return {
        "slug": spec.get("slug"),
        "compositionId": spec.get("compositionId"),
        "formatId": spec.get("formatId"),
        "chapters": len(chapters),
        "chapter_eyecatches": chapter_eyecatches,
        "eyecatch_total_sec": round(eyecatch_total_sec, 2),
        "shots": total_shots,
        "tsx_scene_shots": tsx_scene_shots,
        "media_backdrop_shots": media_backdrop_shots,
        "polarity_counts": polarity_counts,
        "polarity_switches": switches,
        "real_asset_targets": len(spec.get("realAssetTargets") or []),
        "end_cta_enabled": end_enabled,
        "audio_mode": audio_cfg.get("mode"),
        "reading_chars": total_chars,
        "spec_target_sec": round(total_target_sec, 2),
        "estimated_elevenlabs_v4_sec": est_tts_sec,
        "declared_beats": total_beats,
        "sfx_events": total_sfx,
    }


def _wav_rms_db(wav_path: Path) -> float:
    with wave.open(str(wav_path), "rb") as wf:
        raw = wf.readframes(wf.getnframes())
    n = len(raw) // 2
    if n == 0:
        return -30.0
    samples = struct.unpack(f"<{n}h", raw)
    step = max(1, n // 2_000_000)
    active = [s for s in samples[::step] if abs(s) > 300]
    rms = math.sqrt(sum(float(s) * s for s in active) / max(1, len(active)))
    return 20.0 * math.log10(max(1e-9, rms / 32768.0))


def _measure_loudnorm(wav_path: Path) -> dict[str, Any]:
    proc = run_cmd(
        [
            "ffmpeg",
            "-i",
            str(wav_path),
            "-af",
            f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json",
            "-f",
            "null",
            "-",
        ]
    )
    text = (proc.stderr or "") + (proc.stdout or "")
    matches = re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", text, flags=re.S)
    return json.loads(matches[-1]) if matches else {}


def _resolve_licensed_bgm_path(raw_path: str, ep_dir: Path) -> Path:
    p = Path(raw_path)
    if p.is_file():
        return p.resolve()
    for base in (ep_dir, REPO_ROOT):
        cand = (base / raw_path).resolve()
        if cand.is_file():
            return cand
    raise FileNotFoundError(f"Licensed BGM file not found: {raw_path!r}")


def _prepare_licensed_bgm_track(
    audio_cfg: dict[str, Any],
    total_sec: float,
    ep_dir: Path,
    out_wav: Path,
) -> Path:
    """権利クリア済み BGM ファイルを導入無音・フェードイン・任意25msカットアウト付きで整形する。"""
    src_path = _resolve_licensed_bgm_path(str(audio_cfg["bgmFile"]), ep_dir)
    bgm_start = max(0.0, float(audio_cfg.get("bgmStartSec") or 0.0))
    delay_ms = int(round(bgm_start * 1000))
    fade_out_dur = 1.2
    fade_out_st = max(bgm_start, total_sec - fade_out_dur)

    filters: list[str] = [
        f"afade=t=in:st=0:d=1.5",
        f"afade=t=out:st={max(0.0, fade_out_st - bgm_start):.4f}:d={fade_out_dur}",
    ]
    if delay_ms > 0:
        filters.append(f"adelay={delay_ms}|{delay_ms}")

    for win in audio_cfg.get("cutoutWindowsSec") or []:
        if not isinstance(win, dict) or win.get("startSec") is None:
            continue
        ws = max(0.0, float(win["startSec"]))
        dur_ms = max(15.0, float(win.get("durationMs") or 25.0))
        we = ws + dur_ms / 1000.0
        filters.append(f"volume=enable='between(t,{ws:.4f},{we:.4f})':volume=0")

    filters.append(f"apad=whole_dur={total_sec:.6f}")

    run_cmd(
        [
            "ffmpeg",
            "-y",
            "-stream_loop",
            "-1",
            "-i",
            str(src_path),
            "-af",
            ",".join(filters),
            "-t",
            f"{total_sec:.6f}",
            "-ar",
            str(SAMPLE_RATE),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            str(out_wav),
        ]
    )
    return out_wav


def _compute_stickman_components_import_path(
    tsx_out: Path,
    repo_root: Path = REPO_ROOT,
) -> str:
    """出力先 tsx_out のディレクトリ深さに応じた stickman_collage 相対 import パスを自動算出する。"""
    target_dir = (repo_root / "studio" / "src" / "components" / "stickman_collage").resolve()
    out_dir = tsx_out.resolve().parent
    try:
        rel = Path(os.path.relpath(target_dir, start=out_dir)).as_posix()
    except ValueError:
        return "../../../components/stickman_collage"
    if rel == ".":
        return "./index"
    if not rel.startswith("."):
        rel = f"./{rel}"
    return rel


def build_production_assets(
    spec: dict[str, Any],
    spec_path: Path,
    *,
    skip_tts: bool = False,
    force_tts: bool = False,
    tsx_out: Path | None = None,
    tsx_dir: Path | None = None,
) -> Path:
    """ElevenLabs v4 章単位ワンテイク音声合成・音響ミックス（合成ピアノなし）・タイムライン書き出し。"""
    load_dotenv(REPO_ROOT / ".env")
    slug = str(spec["slug"])
    ep_dir = spec_path.parent
    audio_work = ep_dir / "_audio_work"
    tts_dir = audio_work / "tts"
    tts_dir.mkdir(parents=True, exist_ok=True)
    public_dir = REPO_ROOT / "studio" / "public" / "productions" / slug
    public_dir.mkdir(parents=True, exist_ok=True)

    video = spec.get("video") or {}
    fps = int(video.get("fps") or 30)
    width = int(video.get("width") or 1920)
    height = int(video.get("height") or 1080)

    tts_cfg = spec.get("tts") or {}
    voices = tts_cfg.get("voices") or [DEFAULT_ELEVENLABS_VOICE_ID]
    models = tts_cfg.get("models") or ["eleven_v4"]
    voice_id = str(voices[0])
    model_id = str(models[0])

    audio_cfg = spec.get("audio") or {}
    leading_silence = float(audio_cfg.get("leadingSilenceSec") or DEFAULT_LEADING_SILENCE_SEC)

    client = ElevenLabsTTSClient(
        voice_id=voice_id,
        models=tuple(str(m) for m in models),
        language_code=str(tts_cfg.get("languageCode") or "ja"),
        use_timestamps=bool(tts_cfg.get("useTimestamps", True)),
        attempts_per_model=2,
        repo_root=REPO_ROOT,
    )

    chapters_in = list(spec.get("chapters") or [])
    end_cta = spec.get("endCta")
    all_blocks = list(chapters_in)

    if _is_end_cta_enabled(spec) and isinstance(end_cta, dict):
        all_blocks.append(
            {
                "chapterIndex": len(chapters_in) + 1,
                "topicId": "end_cta",
                "titleJa": end_cta.get("headlineJa") or "CTA",
                "defaultPolarity": "black",
                "shots": [
                    {
                        "shotIndex": 9999,
                        "chunkId": "end_cta",
                        "targetDurationSec": float(end_cta.get("durationSec") or 7.0),
                        "narrativeRole": "end_cta",
                        "polarity": "black",
                        "lightBg": False,
                        "layoutArchetype": "end_cta",
                        "narrationJa": str(end_cta.get("narrationJa") or ""),
                        "subtitle": end_cta.get("subtitle")
                        or {"line1": str(end_cta.get("headlineJa") or "次の一手はこちら")},
                        "sfx": [{"kind": "soft_pop", "offsetSec": 0.06, "gain": 0.2}],
                    }
                ],
            }
        )

    cursor = leading_silence
    chapters_out: list[dict[str, Any]] = []
    shots_out: list[dict[str, Any]] = []
    subs_out: list[dict[str, Any]] = []
    sfx_events: list[SfxEvent] = []
    wav_starts: list[tuple[Path, float]] = []
    api_calls = 0

    try:
        for ci, ch in enumerate(all_blocks):
            ch_idx = int(ch.get("chapterIndex", ci + 1))
            block_id = f"ch{ch_idx:02d}_{ch.get('topicId', 'topic')}"
            raw_shots = list(ch.get("shots") or [])
            nar_chunks: list[NarrationChunk] = []
            for sh in raw_shots:
                cleaned = _safe_sanitize_tts(str(sh.get("narrationJa") or ""))
                nar_chunks.append(
                    NarrationChunk(
                        chunk_id=str(sh["chunkId"]),
                        text=cleaned or "。",
                        pause_after_sec=0.28,
                        voice_name=voice_id,
                    )
                )

            joined, pure, _ = compose_onetake_prompt(nar_chunks, separator="\n", default_voice=voice_id)
            offsets: list[int] = []
            acc = 0
            for idx_p, ptxt in enumerate(pure):
                if idx_p > 0:
                    acc += 1
                offsets.append(acc)
                acc += len(ptxt)
            nchar = sum(len(p) for p in pure)

            wav_expected = tts_dir / f"{block_id}.wav"
            if skip_tts and not wav_expected.exists():
                raise FileNotFoundError(f"--skip-tts specified but cached WAV missing: {wav_expected}")

            res = client.synthesize_onetake_block(
                nar_chunks,
                tts_dir,
                block_id=block_id,
                force=force_tts,
                separator="\n",
                min_expected_sec=max(2.0, nchar * 0.07),
                max_expected_sec=max(14.0, nchar * 0.4),
                models=tuple(str(m) for m in models),
                aligner="auto",
            )
            api_calls += res.api_calls
            clean_wav = Path(res.clean_wav)
            dur = ffprobe_duration(clean_wav)
            tl = build_onetake_timeline(
                res,
                tts_dir=None,
                fps=fps,
                width=width,
                height=height,
                leading_silence_sec=0.0,
                target_total_sec=None,
                trailing_pad_sec=0.0,
                sample_rate=SAMPLE_RATE,
            )
            align = getattr(res, "character_alignment", None)
            pause_plan = _shot_pause_plan(raw_shots, tl)
            if pause_plan:
                clean_wav = _insert_pauses_into_wav(clean_wav, tts_dir / f"{block_id}_paused.wav", pause_plan)
                dur = ffprobe_duration(clean_wav)
                _apply_pause_plan_to_timeline(tl, pause_plan)
                align = _apply_pause_plan_to_alignment(align, pause_plan)
            cur_eyecatch_cfg = resolve_chapter_eyecatch_spec(ch)
            eyecatch_runtime: dict[str, Any] | None = None
            if cur_eyecatch_cfg is not None:
                eyecatch_runtime, cursor = _compute_chapter_eyecatch_slot(cursor, fps, cur_eyecatch_cfg)

            a_off = cursor
            vis_start = 0.0 if (ci == 0 and eyecatch_runtime is None) else cursor
            is_end = block_id.endswith("end_cta")
            next_block = all_blocks[ci + 1] if ci + 1 < len(all_blocks) else None
            next_eyecatch_cfg = (
                resolve_chapter_eyecatch_spec(next_block) if isinstance(next_block, dict) else None
            )
            if is_end:
                tail_pause = 0.35
                vis_end = round(a_off + dur + tail_pause, 4)
            elif next_eyecatch_cfg is not None:
                tail_pause = float(next_eyecatch_cfg["leadInSec"])
                vis_end = round(math.ceil((a_off + dur + tail_pause) * fps - 1e-6) / fps, 4)
            else:
                tail_pause = POST_CHAPTER_PAUSE_SEC
                vis_end = round(a_off + dur + tail_pause, 4)
            if is_end and isinstance(end_cta, dict):
                vis_end = max(vis_end, round(a_off + float(end_cta.get("durationSec") or 7.0), 4))
            wav_starts.append((clean_wav, a_off))

            def time_at(chunk_i: int, rel_char: int, fallback: float) -> float:
                if align is not None:
                    v = align.time_at_char_index(joined, offsets[chunk_i] + max(0, rel_char))
                    if v is not None:
                        return round(a_off + float(v), 4)
                return round(fallback, 4)

            spans = [tl["chunks"][str(sh["chunkId"])] for sh in raw_shots]
            starts = [round(a_off + float(sp["startSec"]), 4) for sp in spans]

            for k, sh in enumerate(raw_shots):
                sp = spans[k]
                c_start = vis_start if k == 0 else starts[k]
                c_end = vis_end if k == len(raw_shots) - 1 else starts[k + 1]
                s_start = starts[k]
                s_end = round(a_off + float(sp["speechEndSec"]), 4)
                reading = pure[k]

                phrases = _split_phrases(reading)
                phrase_times: list[float] = []
                pos = 0
                for tok in phrases:
                    frac = pos / max(1, len(reading))
                    phrase_times.append(time_at(k, pos, s_start + (s_end - s_start) * frac))
                    pos += len(tok)

                shot_alignment = _extract_shot_alignment(
                    align,
                    joined,
                    offsets[k],
                    reading,
                    a_off,
                    c_start,
                    s_start,
                    s_end,
                )

                beat_times = list(phrase_times)
                if sh.get("beats"):
                    resolved_beats: list[float] = []
                    for bi, bobj in enumerate(sh["beats"]):
                        if bobj.get("timeSec") is not None:
                            resolved_beats.append(round(c_start + float(bobj["timeSec"]), 4))
                        elif bobj.get("offsetSec") is not None:
                            resolved_beats.append(round(c_start + float(bobj["offsetSec"]), 4))
                        else:
                            rel_phrase_sec = _resolve_phrase_in_alignment(
                                shot_alignment, str(bobj.get("phraseJa") or "")
                            )
                            if rel_phrase_sec is not None:
                                resolved_beats.append(round(c_start + rel_phrase_sec, 4))
                            elif bi < len(phrase_times):
                                resolved_beats.append(phrase_times[bi])
                            else:
                                resolved_beats.append(round(c_start + (c_end - c_start) * (bi / max(1, len(sh["beats"]))), 4))
                    beat_times = resolved_beats

                for sfx in sh.get("sfx") or []:
                    tt = round(c_start + float(sfx.get("offsetSec") or 0.0), 4)
                    if tt < c_end - 0.05:
                        sfx_events.append(
                            SfxEvent(
                                kind=str(sfx["kind"]),
                                time_sec=tt,
                                gain=float(sfx["gain"]) if sfx.get("gain") is not None else None,
                                pan=float(sfx.get("pan") or 0.0),
                                duration_sec=float(sfx["durationSec"]) if sfx.get("durationSec") is not None else None,
                            )
                        )

                shot_runtime = dict(sh)
                shot_runtime.update(
                    {
                        "chapterIndex": ch_idx,
                        "topicId": str(ch.get("topicId") or ""),
                        "startSec": round(c_start, 4),
                        "endSec": round(c_end, 4),
                        "durationSec": round(c_end - c_start, 4),
                        "startFrame": round(c_start * fps),
                        "endFrame": round(c_end * fps),
                        "beatTimesSec": beat_times,
                        "alignment": shot_alignment,
                    }
                )
                subs_out.extend(aligned_subtitles(shot_runtime))
                shots_out.append(shot_runtime)

            chapter_entry: dict[str, Any] = {
                "chapterIndex": ch_idx,
                "topicId": str(ch.get("topicId") or ""),
                "titleJa": str(ch.get("titleJa") or ""),
                "defaultPolarity": ch.get("defaultPolarity") or "black",
                "openLoopQuestionJa": ch.get("openLoopQuestionJa"),
                "startSec": round(vis_start, 4),
                "endSec": vis_end,
                "durationSec": round(vis_end - vis_start, 4),
            }
            if eyecatch_runtime is not None:
                chapter_entry["eyecatch"] = eyecatch_runtime
            chapters_out.append(chapter_entry)
            cursor = vis_end
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            close()

    total_sec = round(cursor, 4)
    total_frames = round(total_sec * fps)

    narr_wav = audio_work / "narration_track.wav"
    assemble_narration_track(wav_starts, total_sec, narr_wav, sample_rate=SAMPLE_RATE, highpass_hz=85, apply_compressor=True, batch_size=16)
    rms = _wav_rms_db(narr_wav)
    narr_gain = round(min(2.2, max(0.95, 10 ** ((-20.0 - rms) / 20.0))), 4)

    # 標準 20 種静的 WAV（studio/public/sfx/<kind>.wav）の存在を保証（未生成時のみ出力）
    export_sfx_library(force=False, sample_rate=SAMPLE_RATE)

    sfx_wav: Path | None = None
    if sfx_events:
        sfx_wav = audio_work / "sfx_track.wav"
        render_sfx_track(total_sec + 0.5, sfx_events, sfx_wav, sample_rate=SAMPLE_RATE, seed=20261122)

    bgm_wav: Path | None = None
    if str(audio_cfg.get("mode")) == "licensed_bgm_file":
        bgm_wav = _prepare_licensed_bgm_track(audio_cfg, total_sec, ep_dir, audio_work / "bgm_track.wav")

    pass1_wav = audio_work / "master_pass1.wav"
    mix_master_audio(
        pass1_wav,
        total_sec,
        narration_wav=narr_wav,
        sfx_wav=sfx_wav,
        piano_wav=None,
        bgm_wav=bgm_wav,
        narration_gain=narr_gain,
        sfx_gain=float(audio_cfg.get("sfxGain") or 0.58),
        bgm_gain=float(audio_cfg.get("bgmGain") or 0.22),
        duck_bgm_on_narration=bool(audio_cfg.get("duckBgmOnNarration", True)),
        target_lufs=TARGET_LUFS,
        true_peak_dbtp=TARGET_TP,
        lra=TARGET_LRA,
        sample_rate=SAMPLE_RATE,
    )

    m1 = _measure_loudnorm(pass1_wav)
    master_wav = audio_work / "master_audio.wav"
    if m1 and (abs(float(m1["input_i"]) - TARGET_LUFS) > 0.15 or float(m1["input_tp"]) > TARGET_TP):
        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(pass1_wav),
                "-af",
                (
                    f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA={TARGET_LRA}:"
                    f"measured_I={m1['input_i']}:measured_TP={m1['input_tp']}:"
                    f"measured_LRA={m1['input_lra']}:measured_thresh={m1['input_thresh']}:"
                    f"offset={m1['target_offset']}:linear=true"
                ),
                "-t",
                f"{total_sec:.6f}",
                "-ar",
                str(SAMPLE_RATE),
                "-ac",
                "2",
                "-c:a",
                "pcm_s16le",
                str(master_wav),
            ]
        )
    else:
        shutil.copy2(pass1_wav, master_wav)

    master_mp3 = public_dir / "master_audio.mp3"
    run_cmd(["ffmpeg", "-y", "-i", str(master_wav), "-codec:a", "libmp3lame", "-b:a", "256k", str(master_mp3)])

    runtime_spec = {
        "slug": slug,
        "compositionId": str(spec["compositionId"]),
        "title": spec.get("title", ""),
        "formatId": "stickman_collage",
        "fps": fps,
        "width": width,
        "height": height,
        "totalDurationSec": total_sec,
        "totalFrames": total_frames,
        "masterAudioMp3": f"productions/{slug}/master_audio.mp3",
        "assetCatalog": spec.get("assetCatalog") or [],
        "chapters": chapters_out,
        "shots": shots_out,
        "subtitles": subs_out,
        "endCta": end_cta if _is_end_cta_enabled(spec) else None,
        "apiCalls": api_calls,
        "ttsVoiceDisplayName": DEFAULT_ELEVENLABS_VOICE_NAME,
        "ttsModel": model_id,
    }
    tl_path = ep_dir / "timeline.json"
    tl_path.write_text(json.dumps(runtime_spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if tsx_out is not None:
        tsx_out.parent.mkdir(parents=True, exist_ok=True)
        import_path = _compute_stickman_components_import_path(tsx_out)
        tsx_out.write_text(
            "// Auto-generated by pipeline/scripts/build_stickman_collage_assets.py\n"
            f"import type {{ StickmanCollageRuntimeSpec }} from '{import_path}';\n\n"
            f"export const STICKMAN_COLLAGE_TIMELINE: StickmanCollageRuntimeSpec = {json.dumps(runtime_spec, ensure_ascii=False, indent=2)};\n",
            encoding="utf-8",
        )

    print(f"[DONE] timeline={tl_path}, mp3={master_mp3}, dur={total_sec:.2f}s, frames={total_frames}")
    post_report = validate_stickman_collage_spec(spec, tsx_dir=tsx_dir, timeline=runtime_spec)
    print(format_validation_report(post_report, title=f"Post-Build Actual Timeline Validation: {spec_path.name}"))
    return tl_path


def main(argv: list[str] | None = None) -> int:
    _configure_stdio_utf8()
    parser = argparse.ArgumentParser(description="stickman-collage Spec Validator & ElevenLabs v4 Asset Builder")
    parser.add_argument("--spec", type=Path, required=True, help="Path to stickman_collage spec JSON")
    parser.add_argument("--tsx-dir", type=Path, help="Optional Remotion episode TSX directory to audit")
    parser.add_argument("--timeline", type=Path, help="Optional generated timeline.json path for actual-duration validation")
    parser.add_argument("--validate-only", action="store_true", help="Validate spec (and optional --tsx-dir) without API/disk writes")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print timeline/TTS cost estimate without API/disk writes")
    parser.add_argument("--skip-tts", action="store_true", help="Use cached chapter WAVs only")
    parser.add_argument("--force-tts", action="store_true", help="Regenerate TTS ignoring cache")
    parser.add_argument("--tsx-out", type=Path, help="Optional output path for StickmanCollageRuntimeSpec TypeScript manifest")
    args = parser.parse_args(argv)

    args.spec = args.spec.resolve()
    if args.tsx_dir is not None:
        args.tsx_dir = args.tsx_dir.resolve()
    if args.timeline is not None:
        args.timeline = args.timeline.resolve()
        if not args.timeline.is_file():
            print(f"Timeline file not found: {args.timeline}", file=sys.stderr)
            return 1

    if not args.spec.is_file():
        print(f"Spec file not found: {args.spec}", file=sys.stderr)
        return 1

    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    timeline_obj = json.loads(args.timeline.read_text(encoding="utf-8")) if args.timeline else None
    report: ValidationReport = validate_stickman_collage_spec(
        spec,
        tsx_dir=args.tsx_dir,
        timeline=timeline_obj,
    )
    print(format_validation_report(report, title=f"Stickman Collage Spec Validation: {args.spec.name}"))

    if not report.passed:
        return 1

    if args.dry_run:
        summary = _estimate_dry_run_summary(spec)
        print("=== Dry-Run Summary ===")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    if args.validate_only:
        return 0

    build_production_assets(
        spec,
        args.spec,
        skip_tts=args.skip_tts,
        force_tts=args.force_tts,
        tsx_out=args.tsx_out,
        tsx_dir=args.tsx_dir,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
