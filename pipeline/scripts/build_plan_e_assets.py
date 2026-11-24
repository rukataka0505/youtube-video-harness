"""案E（How Money Works 型：逆説・シニカル経済／マクロ構造解剖）v3.1 ビルド＆検品 CLI。

機能:
1. Spec JSON の法務・YPP非真正回避・SIL OFLフォント・禁止モデル・未知イベント・字幕/atText整合を機械検証する。
   --validate-only / --dry-run 時は API呼び出しゼロ・ファイル書き込みゼロで検証とタイムライン試算を実行する
   （終了コード: エラー=2 / --strict・--release時の警告=1 / 正常=0）。
2. ElevenLabs v4（eleven_v4 / with-timestamps 既定・TX3LPaxmHKxFdv7VOQHJ / ja）で日本語ナレーションを生成し、
   silenceremove＋整音＋ffprobe実尺計測で音声先行タイムライン（chunks / charTimes 含む）を確定する。
3. Remotion ビート駆動 SFX に一本化するため、master_audio.wav はナレーション＋ダッキング済み BGM のみを
   1パス loudnorm (I=-14.0 LUFS / TP=-1.4 dBTP / 48kHz stereo) で書き出し、単発SEは sfx/*.wav に出力する
   （最終 MP4 の2パス linear loudnorm＋実測検証は pipeline/scripts/master_final.py が担当）。
4. AI画像生成を全面廃止し、実写Bロール・ストック写真・ローカル素材を sourceUrl 一致キャッシュ＆sha256 検品し、
   3コマ確認用コンタクトシート（contact_sheet.png）を生成する。
5. Remotion 側が参照する timeline.json と timelineData.ts（chunks / charTimes / assets 付き）を出力する。
"""

from __future__ import annotations

import argparse
from collections import deque
import datetime as dt
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

import requests


REPO_ROOT = Path(__file__).resolve().parents[2]
_SRC_DIR = str(REPO_ROOT / "pipeline" / "src")
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from yt_engine.audio.sfx_synth import (  # noqa: E402
    ALLOWED_SFX_KINDS,
    PLAN_E_SFX_LIBRARY_KINDS,
    assemble_narration_track,
    cynical_econ_groove_bgm,
    export_sfx_library,
    resolve_sfx_kind,
)
from yt_engine.audio.tts_elevenlabs import (  # noqa: E402
    DEFAULT_ELEVENLABS_MODELS,
    DEFAULT_ELEVENLABS_VOICE_ID,
    CharacterAlignment,
    ElevenLabsAuthError,
    ElevenLabsQuotaExceededError,
    trim_leading_trailing_and_resample_tts,
)
from yt_engine.audio.tts_gemini import (  # noqa: E402
    GeminiQuotaExhaustedError,
    NarrationChunk,
    detect_internal_pauses,
    ffprobe_duration,
    load_dotenv,
    run_cmd,
    scale_wav_tempo,
    snap_to_pause,
    trim_and_resample_tts,
)
from yt_engine.audio.tts_provider import (  # noqa: E402
    TTSClientProtocol,
    create_tts_client,
    resolve_tts_cache_dir,
    resolve_tts_config,
)

SAMPLE_RATE = 48000
DEFAULT_TTS_MODELS = list(DEFAULT_ELEVENLABS_MODELS)
DEFAULT_TTS_VOICES = [DEFAULT_ELEVENLABS_VOICE_ID]
# 字幕／ショット分割: 句読点直後の分割は、単語間の微小な隙間ではなく句読点級の間へスナップする
SPLIT_PHRASE_PUNCT = frozenset("、。！？，,!?")
PHRASE_PAUSE_MIN_SEC = 0.10
PHRASE_SNAP_TOLERANCE_SEC = 0.65

FORBIDDEN_MODEL_TOKENS = ("imagen-4", "imagen4", "veo", "sora", "nijivoice", "にじボイス")
FORBIDDEN_FONT_TOKENS = ("morisawa", "adobe", "helvetica", "hiragino", "meiryo", "yu gothic")
FORBIDDEN_VIDEO_HOST_TOKENS = ("youtube.com", "youtu.be", "googlevideo.com")
ALLOWED_MEDIA_LICENSES = {
    "public_domain",
    "cc0",
    "cc_by",
    "royalty_free",
    "mixkit_free",
    "wikimedia_commons",
    "archive_org",
    "short_quotation",
}
TEMPLATE_SAMPLE_URLS = frozenset(
    {
        "https://assets.mixkit.co/videos/4437/4437-1080.mp4",
        "https://assets.mixkit.co/videos/22976/22976-720.mp4",
        "https://assets.mixkit.co/videos/18296/18296-720.mp4",
    }
)
TEMPLATE_SAMPLE_SLUG = "ep_sample_jp_consumption_paradox"
WIKIMEDIA_MIN_WIDTH_PX = 1000
ASSET_MANIFEST_NAME = "asset_manifest.json"

STOCK_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
WIKIMEDIA_UA = "YouTubeVideoEngine/1.0 (https://github.com/youtube-video-engine; benchmark-research)"
PLAN_E_VOICE_PRE_FILTERS = "highpass=f=80"
PLAN_E_VOICE_POST_FILTERS = (
    "equalizer=f=220:t=q:w=1.2:g=1.1,"
    "equalizer=f=2600:t=q:w=1.2:g=1.4,"
    "acompressor=threshold=-18dB:ratio=2.3:attack=10:release=115"
)
TTS_MANIFEST_NAME = "tts_manifest.json"


def _configure_stdio_utf8() -> None:
    """Windows cp932 環境での標準入出力エンコード例外を防ぐ。"""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


@dataclass(frozen=True)
class ChunkSplitSpec:
    char_index: int
    shot_role: str
    shot_label: str
    event_key: str | None = None
    min_offset_from_prev_sec: float = 0.25
    subtitle_line1: str | None = None
    subtitle_line2: str | None = None
    at_text: str | None = None


@dataclass(frozen=True)
class SubtitleSegmentSpec:
    start_char: int
    line1: str
    line2: str | None = None


@dataclass(frozen=True)
class NarrationChunkSpec:
    chunk_id: str
    text: str
    pause_after_sec: float = 0.24
    min_pause_sec: float = 0.10
    shot_role: str = "context_lean_in"
    shot_label: str = ""
    event_key: str | None = None
    speech_end_event_key: str | None = None
    subtitle_line1: str | None = None
    subtitle_line2: str | None = None
    subtitle_segments: list[SubtitleSegmentSpec] = field(default_factory=list)
    splits: list[ChunkSplitSpec] = field(default_factory=list)
    hide_subtitle: bool = False
    eyecatch_after: str | None = None
    subtitle_extra_tail_sec: float = 0.16


@dataclass(frozen=True)
class ImageSpec:
    key: str
    filename: str
    source: str = "local"
    description: str = ""
    intent: str = ""
    verified: str | None = None


@dataclass(frozen=True)
class VideoClipSpec:
    key: str
    filename: str
    source: str = "mixkit"
    url: str | None = None
    search_query: str | None = None
    start_offset_sec: float = 0.0
    duration_sec: float = 5.0
    extract_poster: bool = False
    license: str = "mixkit_free"
    credit_short: str = ""
    intent: str = ""
    verified: str | None = None


@dataclass(frozen=True)
class StockImageSpec:
    key: str
    filename: str
    source: str = "wikimedia"
    url: str | None = None
    search_query: str | None = None
    cutout_mode: str = "none"
    crop_box: tuple[float, float, float, float] | None = None
    license: str = "public_domain"
    credit_short: str = ""
    intent: str = ""
    verified: str | None = None


def _has_forbidden_video_host(url: str) -> bool:
    low = url.lower()
    return any(tok in low for tok in FORBIDDEN_VIDEO_HOST_TOKENS)


def sanitize_japanese_tts_text(text: str) -> tuple[str, list[str]]:
    """TTS誤発話を防ぐため、英語指示やト書き括弧を検出し純日本語文面へ整える。"""
    warnings: list[str] = []
    if re.search(r"\[[^\]]+\]", text):
        warnings.append(f"Bracketed stage direction found in TTS text: {text}")
    if re.search(r"^\s*(?:read|speak|say|narrate|voice|tone|style|in japanese)[^。\n:]*[:：]", text, re.I):
        warnings.append(f"Possible English prompt directive found in TTS text: {text}")
    cleaned = re.sub(r"\[[^\]]+\]", "", text)
    cleaned = re.sub(
        r"^\s*(?:read|speak|say|narrate|voice|tone|style|in japanese)[^。\n:]*[:：]\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()
    return cleaned, warnings


def _normalize_subtitle_match_text(text: str) -> str:
    """ナレーション本文と字幕の一字一句比較用に空白のみを除去する。"""
    return re.sub(r"\s+", "", text)


def _join_subtitle_obj(sub: Any) -> str:
    """subtitle オブジェクトの line1 + line2 を連結して返す。"""
    if not isinstance(sub, dict):
        return ""
    return f"{sub.get('line1') or ''}{sub.get('line2') or ''}"


def _expected_char_index_for_norm_prefix(full_text: str, norm_prefix_len: int) -> int:
    """full_text 先頭から非空白文字を norm_prefix_len 文字数えた直後の文字インデックスを返す。"""
    if norm_prefix_len <= 0:
        return 0
    seen = 0
    idx = 0
    n = len(full_text)
    while idx < n and seen < norm_prefix_len:
        if not full_text[idx].isspace():
            seen += 1
        idx += 1
    while idx < n and full_text[idx].isspace():
        idx += 1
    return idx


def _find_at_text_index(
    full_text: str,
    at_text: str,
    *,
    min_pos: int = 0,
    nth: int | None = None,
) -> tuple[int | None, str | None]:
    """full_text[min_pos:] から at_text の開始文字位置を解決し (index, error) を返す。"""
    if not at_text:
        return None, "atText must be a non-empty string."
    hits = [m.start() for m in re.finditer(re.escape(at_text), full_text) if m.start() >= min_pos]
    if not hits:
        return None, f"atText {at_text!r} not found at or after index {min_pos}."
    if nth is None:
        if len(hits) > 1:
            return None, f"atText {at_text!r} is ambiguous ({len(hits)} matches); specify nth."
        return hits[0], None
    if isinstance(nth, bool) or not isinstance(nth, int) or nth < 1 or nth > len(hits):
        return None, f"atText {at_text!r} nth={nth!r} out of range (1..{len(hits)})."
    return hits[nth - 1], None


def _resolve_split_char_indices(
    cid: str,
    cleaned: str,
    ch: dict[str, Any],
    errors: list[str],
    warnings: list[str],
) -> list[int]:
    """splits[] の文字境界を atText 優先・字幕連結フォールバックで解決し検証する。"""
    splits = ch.get("splits") or []
    if not splits:
        return []
    hide_sub = bool(ch.get("hideSubtitle", False))
    base_sub = _join_subtitle_obj(ch.get("subtitle"))
    sp_subs: list[str] = []
    for sp_idx, sp in enumerate(splits):
        sp_text = _join_subtitle_obj(sp.get("subtitle"))
        if not hide_sub and not sp_text:
            errors.append(f"{cid}.splits[{sp_idx}]: subtitle is required when hideSubtitle is false.")
        sp_subs.append(sp_text)

    concat_ok = False
    if not hide_sub:
        if not base_sub:
            errors.append(f"{cid}: subtitle is required when hideSubtitle is false.")
        elif all(sp_subs):
            concat_sub = base_sub + "".join(sp_subs)
            if _normalize_subtitle_match_text(cleaned) != _normalize_subtitle_match_text(concat_sub):
                errors.append(
                    f"{cid}: narration text and concatenated subtitles mismatch "
                    f"(text={cleaned!r} != subtitles={concat_sub!r})"
                )
            else:
                concat_ok = True

    resolved: list[int] = []
    prev_ci = 0
    cum_norm = len(_normalize_subtitle_match_text(base_sub)) if concat_ok else 0

    for sp_idx, sp in enumerate(splits):
        raw_ci = sp.get("charIndex")
        has_raw_ci = "charIndex" in sp and raw_ci is not None
        if has_raw_ci:
            warnings.append(
                f"{cid}.splits[{sp_idx}].charIndex is deprecated; omit it or use atText."
            )

        expected_sub_ci = (
            _expected_char_index_for_norm_prefix(cleaned, cum_norm) if concat_ok else None
        )
        at_text = sp.get("atText")
        chosen_ci: int | None = None

        if at_text is not None:
            pos, err = _find_at_text_index(
                cleaned,
                str(at_text),
                min_pos=prev_ci + (1 if sp_idx > 0 or prev_ci > 0 else 0),
                nth=sp.get("nth"),
            )
            if err:
                errors.append(f"{cid}.splits[{sp_idx}]: {err}")
            else:
                assert pos is not None
                if pos <= 0:
                    errors.append(f"{cid}.splits[{sp_idx}].atText matched at index 0; split must be > 0.")
                else:
                    chosen_ci = pos
                    if expected_sub_ci is not None and chosen_ci != expected_sub_ci:
                        errors.append(
                            f"{cid}.splits[{sp_idx}].atText boundary mismatch: "
                            f"resolved {chosen_ci}, subtitle boundary {expected_sub_ci}"
                        )
        elif expected_sub_ci is not None:
            chosen_ci = expected_sub_ci
        elif has_raw_ci:
            if isinstance(raw_ci, bool) or not isinstance(raw_ci, int) or not (prev_ci < raw_ci < len(cleaned)):
                errors.append(
                    f"{cid}.splits[{sp_idx}].charIndex invalid: got {raw_ci!r} "
                    f"(must be strictly increasing in 1..{len(cleaned) - 1})"
                )
            else:
                chosen_ci = raw_ci
        elif hide_sub:
            errors.append(f"{cid}.splits[{sp_idx}]: specify atText when hideSubtitle is true.")

        if has_raw_ci and chosen_ci is not None:
            if isinstance(raw_ci, bool) or not isinstance(raw_ci, int) or raw_ci != chosen_ci:
                errors.append(
                    f"{cid}.splits[{sp_idx}].charIndex mismatch: got {raw_ci!r}, expected {chosen_ci}"
                )

        if chosen_ci is not None:
            if chosen_ci <= prev_ci or chosen_ci >= len(cleaned):
                errors.append(
                    f"{cid}.splits[{sp_idx}] split index {chosen_ci} out of strictly increasing range "
                    f"({prev_ci + 1}..{len(cleaned) - 1})."
                )
            else:
                prev_ci = chosen_ci
                resolved.append(chosen_ci)
        else:
            resolved.append(max(prev_ci + 1, min(len(cleaned) - 1, prev_ci + 1)))

        if concat_ok:
            cum_norm += len(_normalize_subtitle_match_text(sp_subs[sp_idx]))

    return resolved


def _resolve_subtitle_segment_starts(
    cid: str,
    cleaned: str,
    ch: dict[str, Any],
    errors: list[str],
    warnings: list[str],
) -> list[int]:
    """subtitleSegments[] の開始文字位置を字幕連結から自動算出し、手書き startChar を検証する。"""
    sub_segs = ch.get("subtitleSegments") or []
    if not sub_segs:
        return []
    hide_sub = bool(ch.get("hideSubtitle", False))
    if hide_sub:
        return [int(seg.get("startChar") or 0) for seg in sub_segs]

    seg_subs: list[str] = []
    for s_idx, seg in enumerate(sub_segs):
        seg_text = _join_subtitle_obj(seg)
        if not seg_text:
            errors.append(f"{cid}.subtitleSegments[{s_idx}]: subtitle is required when hideSubtitle is false.")
        seg_subs.append(seg_text)

    if not all(seg_subs):
        return [int(seg.get("startChar") or 0) for seg in sub_segs]

    concat_sub = "".join(seg_subs)
    if _normalize_subtitle_match_text(cleaned) != _normalize_subtitle_match_text(concat_sub):
        errors.append(
            f"{cid}: narration text and subtitleSegments mismatch "
            f"(text={cleaned!r} != subtitles={concat_sub!r})"
        )
        return [int(seg.get("startChar") or 0) for seg in sub_segs]

    starts: list[int] = []
    cum_norm = 0
    for s_idx, seg in enumerate(sub_segs):
        expected_sc = 0 if s_idx == 0 else _expected_char_index_for_norm_prefix(cleaned, cum_norm)
        if "startChar" in seg and seg.get("startChar") is not None:
            warnings.append(
                f"{cid}.subtitleSegments[{s_idx}].startChar is deprecated; omit it to auto-derive."
            )
            raw_sc = seg.get("startChar")
            if isinstance(raw_sc, bool) or not isinstance(raw_sc, int) or raw_sc != expected_sc:
                errors.append(
                    f"{cid}.subtitleSegments[{s_idx}].startChar mismatch: "
                    f"got {raw_sc!r}, expected {expected_sc}"
                )
        starts.append(expected_sc)
        cum_norm += len(_normalize_subtitle_match_text(seg_subs[s_idx]))
    return starts


def _file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_asset_manifest(public_dir: Path | None) -> dict[str, Any]:
    if public_dir is None:
        return {}
    path = public_dir / ASSET_MANIFEST_NAME
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return dict(data.get("assets", data))
        except (OSError, json.JSONDecodeError):
            pass
    return {}


def _save_asset_manifest(public_dir: Path, assets: dict[str, Any]) -> Path:
    public_dir.mkdir(parents=True, exist_ok=True)
    path = public_dir / ASSET_MANIFEST_NAME
    payload = {
        "generator": "pipeline/scripts/build_plan_e_assets.py",
        "updatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "assets": assets,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def _expected_source_url(item: dict[str, Any], default_source: str) -> str:
    url = item.get("url")
    if url:
        return str(url).strip()
    query = item.get("searchQuery")
    if query:
        src = str(item.get("source") or default_source).strip()
        return f"search:{src}:{str(query).strip()}"
    return ""


def _resolve_asset_disk_path(public_dir: Path, section: str, filename: str) -> Path:
    sub = "videos" if section == "videoClips" else "images"
    return public_dir / sub / filename


def verify_assets_manifest(
    spec: dict[str, Any],
    public_dir: Path | None,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Spec 内全アセットの sha256 と verified（検品時 sha256）を照合する。"""
    manifest = _load_asset_manifest(public_dir)
    assets_meta: dict[str, dict[str, Any]] = {}
    issues: list[str] = []

    sections: list[tuple[str, str, list[dict[str, Any]]]] = [
        ("videoClips", "mixkit", list(spec.get("videoClips") or [])),
        ("stockImages", "wikimedia", list(spec.get("stockImages") or [])),
        ("images", "local", list(spec.get("images") or [])),
    ]
    for sec_name, def_src, items in sections:
        for item in items:
            if not isinstance(item, dict):
                continue
            key = str(item.get("key") or "")
            fn = str(item.get("filename") or "")
            if not key or not fn:
                continue
            intent = str(item.get("intent") or "").strip()
            expected_verified = str(item.get("verified") or "").strip().lower()
            src_url = _expected_source_url(item, def_src) or (
                f"local:{fn}" if sec_name == "images" else ""
            )

            disk_path = _resolve_asset_disk_path(public_dir, sec_name, fn) if public_dir else None
            man_entry = manifest.get(key) if isinstance(manifest.get(key), dict) else {}
            actual_sha = ""
            if disk_path is not None and disk_path.is_file():
                actual_sha = _file_sha256(disk_path).lower()
            elif man_entry.get("sha256"):
                actual_sha = str(man_entry["sha256"]).lower()

            man_url = str(man_entry.get("sourceUrl") or "")
            url_changed = bool(src_url and man_url and man_url != src_url)
            if url_changed:
                issues.append(f"{sec_name}.{key}: sourceUrl changed ({man_url} -> {src_url}); re-fetch required.")

            is_verified = bool(
                actual_sha
                and len(expected_verified) == 64
                and expected_verified == actual_sha
                and not url_changed
            )
            if not is_verified:
                if not actual_sha:
                    issues.append(f"{sec_name}.{key} ({fn}): asset file/sha256 missing; fetch and inspect first.")
                elif not expected_verified:
                    issues.append(
                        f"{sec_name}.{key} ({fn}): unverified asset (set verified='{actual_sha}' after contact-sheet QA)."
                    )
                elif expected_verified != actual_sha:
                    issues.append(
                        f"{sec_name}.{key} ({fn}): verified sha256 mismatch (stale={expected_verified[:12]} != actual={actual_sha[:12]})."
                    )

            assets_meta[key] = {
                "kind": sec_name,
                "filename": fn,
                "intent": intent,
                "sourceUrl": src_url,
                "sha256": actual_sha,
                "verified": is_verified,
            }

    return assets_meta, issues


def validate_plan_e_spec(
    spec: dict[str, Any],
    *,
    release: bool = False,
    public_dir: Path | None = None,
) -> tuple[list[str], list[str]]:
    """案E v3.0 Spec JSON を法務・技術・構造規約に基づき機械検証し (errors, warnings) を返す。"""
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(spec, dict):
        return ["Spec root must be a JSON object."], []

    for req_key in ("slug", "formatId", "chunks", "legalChecklist"):
        if req_key not in spec:
            errors.append(f"Missing required top-level field: {req_key}")

    if "scenes" in spec:
        errors.append(
            "spec.scenes is removed in Plan E v3.0; define scenes in TS via definePlanESpec() and run npm run audit:plan-e."
        )

    format_id = str(spec.get("formatId", ""))
    low_fmt = format_id.lower()
    if "plan_d" in low_fmt or "pland" in low_fmt or "3d" in low_fmt:
        errors.append(f"Prohibited heavy 3D formatId: {format_id}")
    elif format_id and format_id != "planE_macro_econ":
        errors.append(f"formatId must be 'planE_macro_econ', got: {format_id!r}")

    # フォント検証（SIL OFL 1.1 / Apache 2.0 のみ）
    fonts = spec.get("fonts") or ["Noto Sans JP", "Noto Serif JP", "Playfair Display"]
    for font_name in fonts:
        low_f = str(font_name).lower()
        if any(tok in low_f for tok in FORBIDDEN_FONT_TOKENS):
            errors.append(f"Forbidden non-OFL font specified: {font_name}")

    # 禁止・終了済みモデル検査 & TTS プロバイダ検証
    tts_cfg = spec.get("tts") or {}
    if isinstance(tts_cfg, dict) and tts_cfg.get("provider") is not None:
        raw_prov = str(tts_cfg.get("provider")).strip().lower()
        if raw_prov not in {"auto", "gemini", "elevenlabs"}:
            errors.append(f"Unsupported tts.provider specified: {tts_cfg.get('provider')!r}")
    for m in tts_cfg.get("models") or DEFAULT_TTS_MODELS:
        if any(tok in str(m).lower() for tok in FORBIDDEN_MODEL_TOKENS):
            errors.append(f"Forbidden/retired TTS model specified: {m}")
    el_tts_cfg = tts_cfg.get("elevenlabs") if isinstance(tts_cfg, dict) else None
    if isinstance(el_tts_cfg, dict):
        for m in el_tts_cfg.get("models") or []:
            if any(tok in str(m).lower() for tok in FORBIDDEN_MODEL_TOKENS):
                errors.append(f"Forbidden/retired ElevenLabs TTS model specified: {m}")

    if "imageConfig" in spec:
        errors.append("spec.imageConfig is removed in Plan E v3.0 (AI image generation is prohibited).")

    # 法務・YPP非真正・金融領域ガードレール検査
    legal = spec.get("legalChecklist") or {}
    if isinstance(legal, dict):
        sources = legal.get("primarySources") or []
        if not isinstance(sources, list) or len(sources) < 3:
            errors.append("legalChecklist.primarySources must contain at least 3 primary sources.")
        if legal.get("usesAcmlVoiceForCriticism") is not False:
            errors.append("legalChecklist.usesAcmlVoiceForCriticism must be false (ACML 1.0 critique ban).")
        if legal.get("usesAiExpertAdvice") is not False:
            errors.append("legalChecklist.usesAiExpertAdvice must be false (no fake AI financial expert persona).")
        if legal.get("noFinancialAdviceClaim") is not True:
            errors.append("legalChecklist.noFinancialAdviceClaim must be true (金商法断定表現排除).")
        fonts_lic = str(legal.get("fontsLicense", ""))
        if fonts_lic and ("sil ofl" not in fonts_lic.lower() and "apache" not in fonts_lic.lower()):
            errors.append(f"legalChecklist.fontsLicense must declare SIL OFL / Apache 2.0, got: {fonts_lic!r}")

    # チャンク＆字幕検査＋イベント収集
    chunks = spec.get("chunks") or []
    defined_events: set[str] = {"totalDurationSec"}
    if not isinstance(chunks, list) or len(chunks) == 0:
        errors.append("spec.chunks must be a non-empty list.")
    else:
        seen_ids: set[str] = set()
        for idx, ch in enumerate(chunks):
            if not isinstance(ch, dict):
                errors.append(f"chunks[{idx}] must be an object.")
                continue
            cid = ch.get("chunkId")
            txt = ch.get("text", "")
            if not cid or not isinstance(cid, str):
                errors.append(f"chunks[{idx}] missing valid chunkId.")
                continue
            if cid in seen_ids:
                errors.append(f"Duplicate chunkId: {cid}")
            seen_ids.add(cid)
            if "eyecatchAfter" in ch and ch["eyecatchAfter"] not in ("swipe", "pullback", "slit"):
                errors.append(f"{cid}.eyecatchAfter は swipe / pullback / slit から選んでください。")

            for ev_field in ("eventKey", "speechEndEventKey"):
                if ch.get(ev_field):
                    defined_events.add(str(ch[ev_field]))
            for sp in ch.get("splits") or []:
                if isinstance(sp, dict) and sp.get("eventKey"):
                    defined_events.add(str(sp["eventKey"]))

            if not txt or not isinstance(txt, str):
                errors.append(f"chunks[{idx}] ({cid}) missing non-empty text.")
                continue
            cleaned, tts_warns = sanitize_japanese_tts_text(txt)
            warnings.extend([f"{cid}: {w}" for w in tts_warns])
            if not cleaned:
                errors.append(f"chunks[{idx}] ({cid}) text became empty after TTS sanitization.")
                continue

            sub = ch.get("subtitle") or {}
            for line_key in ("line1", "line2"):
                line_val = sub.get(line_key)
                if line_val and len(str(line_val)) > 22:
                    warnings.append(
                        f"{cid}.subtitle.{line_key} exceeds 22 chars ({len(str(line_val))}): {line_val}"
                    )
            sub_segs = ch.get("subtitleSegments") or []
            for s_idx, seg in enumerate(sub_segs):
                for line_key in ("line1", "line2"):
                    line_val = seg.get(line_key)
                    if line_val and len(str(line_val)) > 22:
                        warnings.append(
                            f"{cid}.subtitleSegments[{s_idx}].{line_key} exceeds 22 chars ({len(str(line_val))})"
                        )
            splits = ch.get("splits") or []
            for sp_idx, sp in enumerate(splits):
                sp_sub = sp.get("subtitle") or {}
                for line_key in ("line1", "line2"):
                    line_val = sp_sub.get(line_key)
                    if line_val and len(str(line_val)) > 22:
                        warnings.append(
                            f"{cid}.splits[{sp_idx}].subtitle.{line_key} exceeds 22 chars ({len(str(line_val))}): {line_val}"
                        )

            hide_sub = bool(ch.get("hideSubtitle", False))
            if hide_sub and cleaned:
                warnings.append(
                    f"{cid}: hideSubtitle=true skips the narration/subtitle verbatim check; "
                    "spoken narration will have no subtitle (use only where captions collide with chart annotations)."
                )
            if splits:
                _resolve_split_char_indices(cid, cleaned, ch, errors, warnings)
            elif sub_segs:
                _resolve_subtitle_segment_starts(cid, cleaned, ch, errors, warnings)
            elif not hide_sub:
                base_sub = _join_subtitle_obj(ch.get("subtitle"))
                if not base_sub:
                    errors.append(f"{cid}: subtitle is required when hideSubtitle is false.")
                elif _normalize_subtitle_match_text(cleaned) != _normalize_subtitle_match_text(base_sub):
                    errors.append(
                        f"{cid}: narration text and subtitle mismatch "
                        f"(text={cleaned!r} != subtitle={base_sub!r})"
                    )

    # ローカル画像定義検査（AI画像生成廃止）
    images = spec.get("images") or []
    seen_img_keys: set[str] = set()
    seen_img_files: set[str] = set()
    for idx, img in enumerate(images):
        if not isinstance(img, dict):
            errors.append(f"images[{idx}] must be an object.")
            continue
        key = img.get("key")
        fn = img.get("filename")
        prompt = img.get("prompt")
        if not key or not fn:
            errors.append(f"images[{idx}] must define key and filename.")
            continue
        if not str(img.get("intent") or "").strip():
            errors.append(f"images[{idx}] ({key}) must define non-empty intent.")
        if key in seen_img_keys:
            errors.append(f"Duplicate image key: {key}")
        if fn in seen_img_files:
            errors.append(f"Duplicate image filename: {fn}")
        seen_img_keys.add(key)
        seen_img_files.add(fn)
        src_val = str(img.get("source") or "local").strip().lower()
        if src_val != "local":
            errors.append(
                f"images[{idx}] ({key}) only supports source='local' in Plan E v3.0 (got {src_val!r}); AI image generation is prohibited."
            )
        if prompt:
            warnings.append(f"images[{idx}] ({key}).prompt is ignored; AI image generation is removed in Plan E v3.0.")
            stripped_prompt = re.sub(
                r"strictly\s+no\s+(?:text|letters|words|numbers)[^.]*\.?", "", str(prompt), flags=re.I
            )
            if re.search(r"\b(?:with|render|write|draw|put)\s+(?:text|title|headline|words|letters)\b", stripped_prompt, re.I):
                errors.append(f"images[{idx}] ({key}) prompt appears to request AI-baked text.")

    # 実写動画 B-Roll 定義検査（YouTube URL禁止・重複禁止・サンプルURL流用検知）
    slug = str(spec.get("slug") or "")
    video_clips = spec.get("videoClips") or []
    if not isinstance(video_clips, list):
        errors.append("spec.videoClips must be a list when specified.")
        video_clips = []
    seen_vid_keys: set[str] = set()
    seen_vid_files: set[str] = set()
    for idx, vc in enumerate(video_clips):
        if not isinstance(vc, dict):
            errors.append(f"videoClips[{idx}] must be an object.")
            continue
        key = vc.get("key")
        fn = vc.get("filename")
        url = vc.get("url")
        query = vc.get("searchQuery")
        if not key or not fn:
            errors.append(f"videoClips[{idx}] must define key and filename.")
            continue
        if not str(vc.get("intent") or "").strip():
            errors.append(f"videoClips[{idx}] ({key}) must define non-empty intent.")
        if key in seen_vid_keys:
            errors.append(f"Duplicate videoClip key: {key}")
        if fn in seen_vid_files:
            errors.append(f"Duplicate videoClip filename: {fn}")
        seen_vid_keys.add(key)
        seen_vid_files.add(fn)
        if not url and not query:
            errors.append(f"videoClips[{idx}] ({key}) must define url or searchQuery.")
        if url and _has_forbidden_video_host(str(url)):
            errors.append(f"videoClips[{idx}] ({key}) prohibits YouTube URLs: {url}")
        if url and slug != TEMPLATE_SAMPLE_SLUG and str(url).strip() in TEMPLATE_SAMPLE_URLS:
            warnings.append(
                f"videoClips[{idx}] ({key}) reuses template sample URL ({url}); replace with topic-specific footage."
            )
        lic = vc.get("license")
        if lic and str(lic) not in ALLOWED_MEDIA_LICENSES:
            errors.append(f"videoClips[{idx}] ({key}) unsupported license: {lic!r}")
        dur = vc.get("durationSec")
        if dur is not None and float(dur) <= 0.0:
            errors.append(f"videoClips[{idx}] ({key}) durationSec must be > 0.")

    # ストック写真・アーカイブ画像定義検査
    stock_images = spec.get("stockImages") or []
    if not isinstance(stock_images, list):
        errors.append("spec.stockImages must be a list when specified.")
        stock_images = []
    for idx, si in enumerate(stock_images):
        if not isinstance(si, dict):
            errors.append(f"stockImages[{idx}] must be an object.")
            continue
        key = si.get("key")
        fn = si.get("filename")
        url = si.get("url")
        query = si.get("searchQuery")
        if not key or not fn:
            errors.append(f"stockImages[{idx}] must define key and filename.")
            continue
        if not str(si.get("intent") or "").strip():
            errors.append(f"stockImages[{idx}] ({key}) must define non-empty intent.")
        if key in seen_img_keys:
            errors.append(f"Duplicate image/stockImage key: {key}")
        if fn in seen_img_files:
            errors.append(f"Duplicate image/stockImage filename: {fn}")
        seen_img_keys.add(key)
        seen_img_files.add(fn)
        if not url and not query:
            errors.append(f"stockImages[{idx}] ({key}) must define url or searchQuery.")
        if url and _has_forbidden_video_host(str(url)):
            errors.append(f"stockImages[{idx}] ({key}) prohibits YouTube URLs: {url}")
        lic = si.get("license")
        if lic and str(lic) not in ALLOWED_MEDIA_LICENSES:
            errors.append(f"stockImages[{idx}] ({key}) unsupported license: {lic!r}")
        cutout_mode = str(si.get("cutoutMode", "none"))
        if cutout_mode not in {"none", "dark_bg_alpha", "light_paper_sticker", "corner_bg_alpha"}:
            errors.append(f"stockImages[{idx}] ({key}) invalid cutoutMode: {cutout_mode!r}")

    if spec.get("antiPowerPointCheck") is False:
        warnings.append("antiPowerPointCheck is disabled; ensure no PowerPoint-style bullet cards are used.")
    if len(video_clips) == 0:
        warnings.append(
            "spec.videoClips is empty; Plan E v3 recommends dark/live-action clips so dark surface ratio stays >= 35% (PLAN_E_AUDIT_RULES.MIN_DARK_RATIO)."
        )
    if len(images) + len(stock_images) == 0:
        warnings.append(
            "spec.images and spec.stockImages are both empty; include cutout/archival stills or posters for physical material contrast."
        )
    if spec.get("defaultCitationText"):
        warnings.append("spec.defaultCitationText is set; keep citations in YouTube description rather than on-screen overlays.")

    # イベント参照の静的検査 & レガシー audio.sfx 検査
    audio_cfg = spec.get("audio") or {}
    bgm_cfg = audio_cfg.get("bgm") or {}
    if isinstance(bgm_cfg, dict):
        for b_key in ("introDroneEndEvent", "grooveStartEvent"):
            ev_ref = bgm_cfg.get(b_key)
            if isinstance(ev_ref, str) and ev_ref not in defined_events:
                errors.append(f"audio.bgm.{b_key} references unknown eventKey: {ev_ref!r}")
        for c_idx, c_item in enumerate(bgm_cfg.get("cutouts") or []):
            if not isinstance(c_item, dict):
                continue
            for c_key in ("startEvent", "endEvent"):
                ev_ref = c_item.get(c_key)
                if isinstance(ev_ref, str) and ev_ref not in defined_events:
                    errors.append(f"audio.bgm.cutouts[{c_idx}].{c_key} references unknown eventKey: {ev_ref!r}")

    sfx_list = list(audio_cfg.get("sfx") or [])
    if sfx_list:
        errors.append(
            "audio.sfx is prohibited in Plan E v3.1; SFX are driven solely by Remotion beats (remove audio.sfx)."
        )
    for idx, sfx in enumerate(sfx_list):
        if not isinstance(sfx, dict):
            continue
        kind = str(sfx.get("kind") or sfx.get("type") or "")
        if kind not in ALLOWED_SFX_KINDS:
            errors.append(f"audio.sfx[{idx}] unsupported SFX kind: {kind!r}")
        ev_ref = sfx.get("event")
        if isinstance(ev_ref, str) and ev_ref not in defined_events:
            errors.append(f"audio.sfx[{idx}].event references unknown eventKey: {ev_ref!r}")
    for lib_kind in audio_cfg.get("sfxLibraryKinds") or []:
        try:
            resolve_sfx_kind(str(lib_kind))
        except ValueError:
            errors.append(f"audio.sfxLibraryKinds unsupported SFX kind: {lib_kind!r}")

    # 素材 sha256 検品チェック
    if release:
        _, asset_issues = verify_assets_manifest(spec, public_dir)
        errors.extend([f"release asset check: {iss}" for iss in asset_issues])
    elif public_dir is not None and (public_dir / ASSET_MANIFEST_NAME).is_file():
        _, asset_issues = verify_assets_manifest(spec, public_dir)
        warnings.extend(asset_issues)

    return errors, warnings


def load_and_validate_spec(
    spec_path: Path,
    *,
    release: bool = False,
    public_dir: Path | None = None,
) -> tuple[dict[str, Any], list[str]]:
    if not spec_path.is_file():
        raise FileNotFoundError(f"Spec file not found: {spec_path}")
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    errors, warnings = validate_plan_e_spec(spec, release=release, public_dir=public_dir)
    if errors:
        raise ValueError("Plan E spec validation failed:\n  - " + "\n  - ".join(errors))
    return spec, warnings


def parse_chunks(raw_chunks: list[dict[str, Any]]) -> list[NarrationChunkSpec]:
    out: list[NarrationChunkSpec] = []
    for ch in raw_chunks:
        cid = str(ch["chunkId"])
        cleaned_text, _ = sanitize_japanese_tts_text(str(ch["text"]))
        dummy_err: list[str] = []
        dummy_warn: list[str] = []
        resolved_split_cis = _resolve_split_char_indices(cid, cleaned_text, ch, dummy_err, dummy_warn)
        resolved_seg_starts = _resolve_subtitle_segment_starts(cid, cleaned_text, ch, dummy_err, dummy_warn)

        sub = ch.get("subtitle") or {}
        raw_segs = ch.get("subtitleSegments") or []
        segs = [
            SubtitleSegmentSpec(
                start_char=resolved_seg_starts[i] if i < len(resolved_seg_starts) else int(s.get("startChar", 0)),
                line1=str(s["line1"]),
                line2=s.get("line2"),
            )
            for i, s in enumerate(raw_segs)
        ]
        raw_splits = ch.get("splits") or []
        splits = [
            ChunkSplitSpec(
                char_index=resolved_split_cis[i] if i < len(resolved_split_cis) else int(sp.get("charIndex", 0)),
                shot_role=str(sp.get("shotRole", "example_illustration")),
                shot_label=str(sp.get("shotLabel", cid)),
                event_key=sp.get("eventKey"),
                min_offset_from_prev_sec=float(sp.get("minOffsetFromPrevSec", 0.25)),
                subtitle_line1=(sp.get("subtitle") or {}).get("line1"),
                subtitle_line2=(sp.get("subtitle") or {}).get("line2"),
                at_text=sp.get("atText"),
            )
            for i, sp in enumerate(raw_splits)
        ]
        out.append(
            NarrationChunkSpec(
                chunk_id=cid,
                text=cleaned_text,
                pause_after_sec=float(ch.get("pauseAfterSec", 0.24)),
                min_pause_sec=float(ch.get("minPauseSec", 0.10)),
                shot_role=str(ch.get("shotRole", "context_lean_in")),
                shot_label=str(ch.get("shotLabel", cid)),
                event_key=ch.get("eventKey"),
                speech_end_event_key=ch.get("speechEndEventKey"),
                subtitle_line1=sub.get("line1"),
                subtitle_line2=sub.get("line2"),
                subtitle_segments=segs,
                splits=splits,
                hide_subtitle=bool(ch.get("hideSubtitle", False)),
                eyecatch_after=ch.get("eyecatchAfter"),
                subtitle_extra_tail_sec=float(ch.get("subtitleExtraTailSec", 0.16)),
            )
        )
    return out


def parse_images(raw_images: list[dict[str, Any]]) -> list[ImageSpec]:
    specs: list[ImageSpec] = []
    for img in raw_images:
        specs.append(
            ImageSpec(
                key=str(img["key"]),
                filename=str(img["filename"]),
                source=str(img.get("source") or "local"),
                description=str(img.get("description") or "").strip(),
                intent=str(img.get("intent") or "").strip(),
                verified=str(img["verified"]).strip() if img.get("verified") else None,
            )
        )
    return specs


def parse_video_clips(raw_clips: list[dict[str, Any]]) -> list[VideoClipSpec]:
    specs: list[VideoClipSpec] = []
    for vc in raw_clips:
        specs.append(
            VideoClipSpec(
                key=str(vc["key"]),
                filename=str(vc["filename"]),
                source=str(vc.get("source", "mixkit")),
                url=str(vc["url"]) if vc.get("url") else None,
                search_query=str(vc["searchQuery"]) if vc.get("searchQuery") else None,
                start_offset_sec=float(vc.get("startOffsetSec", 0.0)),
                duration_sec=float(vc.get("durationSec", 5.0)),
                extract_poster=bool(vc.get("extractPoster", False)),
                license=str(vc.get("license", "mixkit_free")),
                credit_short=str(vc.get("creditShort", "")),
                intent=str(vc.get("intent") or "").strip(),
                verified=str(vc["verified"]).strip() if vc.get("verified") else None,
            )
        )
    return specs


def parse_stock_images(raw_items: list[dict[str, Any]]) -> list[StockImageSpec]:
    specs: list[StockImageSpec] = []
    for si in raw_items:
        raw_crop = si.get("cropBox")
        crop_box: tuple[float, float, float, float] | None = None
        if isinstance(raw_crop, (list, tuple)) and len(raw_crop) == 4:
            crop_box = (float(raw_crop[0]), float(raw_crop[1]), float(raw_crop[2]), float(raw_crop[3]))
        specs.append(
            StockImageSpec(
                key=str(si["key"]),
                filename=str(si["filename"]),
                source=str(si.get("source", "wikimedia")),
                url=str(si["url"]) if si.get("url") else None,
                search_query=str(si["searchQuery"]) if si.get("searchQuery") else None,
                cutout_mode=str(si.get("cutoutMode", "none")),
                crop_box=crop_box,
                license=str(si.get("license", "public_domain")),
                credit_short=str(si.get("creditShort", "")),
                intent=str(si.get("intent") or "").strip(),
                verified=str(si["verified"]).strip() if si.get("verified") else None,
            )
        )
    return specs


def resolve_output_paths(
    spec: dict[str, Any],
    override_public_dir: Path | None,
    override_ts_path: Path | None,
) -> tuple[Path, Path, str]:
    slug = str(spec["slug"])
    output_cfg = spec.get("output") or {}
    public_subdir = str(output_cfg.get("publicSubdir", f"episodes/{slug}"))
    public_dir = override_public_dir if override_public_dir else (REPO_ROOT / "studio" / "public" / public_subdir)
    default_ts = REPO_ROOT / "studio" / "src" / "compositions" / "episodes" / slug / "timelineData.ts"
    ts_rel = output_cfg.get("timelineTsPath")
    ts_path = override_ts_path if override_ts_path else (REPO_ROOT / ts_rel if ts_rel else default_ts)
    return public_dir, ts_path, public_subdir


def trim_and_clean_tts(raw_wav: Path, out_wav: Path) -> float:
    return trim_and_resample_tts(
        raw_wav,
        out_wav,
        sample_rate=SAMPLE_RATE,
        stop_duration=0.14,
        pre_filters=PLAN_E_VOICE_PRE_FILTERS,
        post_filters=PLAN_E_VOICE_POST_FILTERS,
    )


def _normalize_audio_variant(audio_variant: str | None) -> str | None:
    if not audio_variant or not audio_variant.strip():
        return None
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", audio_variant.strip()).strip("_")
    return cleaned or None


def load_tts_manifest(tts_dir: Path) -> dict[str, Any]:
    path = tts_dir / TTS_MANIFEST_NAME
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return dict(data.get("chunks", {}))
        except (OSError, json.JSONDecodeError):
            pass
    return {}


def save_tts_manifest(
    tts_dir: Path,
    entries: dict[str, Any],
    models: Sequence[str],
    *,
    provider: str = "elevenlabs",
) -> None:
    path = tts_dir / TTS_MANIFEST_NAME
    payload = {
        "generator": "pipeline/scripts/build_plan_e_assets.py",
        "provider": provider,
        "modelPriority": list(models),
        "updatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "chunks": entries,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def tts_cache_state(
    spec: NarrationChunkSpec,
    tts_dir: Path,
    manifest: dict[str, Any],
    *,
    expected_provider: str | None = None,
) -> tuple[bool, dict[str, Any] | None, str]:
    raw_wav = tts_dir / f"{spec.chunk_id}_raw.wav"
    if not (raw_wav.is_file() and raw_wav.stat().st_size > 4000):
        return False, None, "no_cache"
    entry = manifest.get(spec.chunk_id)
    if entry is None:
        return True, None, "legacy_cache_without_manifest"
    if entry.get("text") != spec.text:
        return False, entry, "text_changed"
    if expected_provider:
        entry_prov = str(entry.get("provider") or "elevenlabs").strip().lower()
        if entry_prov != expected_provider.strip().lower():
            return False, entry, "provider_changed"
    return True, entry, "manifest_match"


def inspect_tts_for_dry_run(
    chunks: list[NarrationChunkSpec],
    tts_dir: Path,
    force: bool = False,
    *,
    provider: str = "elevenlabs",
) -> tuple[dict[str, float], dict[str, str]]:
    durations: dict[str, float] = {}
    statuses: dict[str, str] = {}
    manifest = load_tts_manifest(tts_dir)
    for ch in chunks:
        clean_wav = tts_dir / f"{ch.chunk_id}.wav"
        reusable, entry, reason = tts_cache_state(ch, tts_dir, manifest, expected_provider=provider)
        model_note = f" model={entry.get('modelUsed')}" if entry else ""
        if reusable and not force and clean_wav.is_file() and clean_wav.stat().st_size > 4000:
            durations[ch.chunk_id] = ffprobe_duration(clean_wav)
            statuses[ch.chunk_id] = f"cached ({reason}){model_note}"
        else:
            durations[ch.chunk_id] = round(max(0.95, len(ch.text) * 0.155), 3)
            why = "force_tts" if (force and reusable) else reason
            statuses[ch.chunk_id] = f"estimated_pending_tts ({why})"
    return durations, statuses


def generate_tts_chunks(
    chunks: list[NarrationChunkSpec],
    tts_dir: Path,
    models: Sequence[str],
    voices: Sequence[str],
    temperature: float,
    force: bool = False,
    skip: bool = False,
    request_interval_sec: float | None = None,
    attempts_per_model: int = 2,
    tts_client: TTSClientProtocol | None = None,
    *,
    provider: str = "elevenlabs",
    language_code: str | None = None,
    voice_settings: dict[str, Any] | None = None,
    output_formats: Sequence[str] | None = None,
    use_timestamps: bool = True,
) -> tuple[dict[str, float], dict[str, dict[str, Any]]]:
    tts_dir.mkdir(parents=True, exist_ok=True)
    effective_provider = str(getattr(tts_client, "provider_name", provider) or provider).strip().lower()
    manifest = load_tts_manifest(tts_dir)
    durations: dict[str, float] = {}
    tts_info: dict[str, dict[str, Any]] = {}
    tts = tts_client
    locked_model: str | None = None
    locked_voice: str | None = None
    voice_list = (
        list(voices)
        if voices
        else ([DEFAULT_ELEVENLABS_VOICE_ID] if effective_provider == "elevenlabs" else ["Charon"])
    )
    model_list = list(models)

    def _ensure_client() -> TTSClientProtocol:
        nonlocal tts
        if tts is None:
            tts = create_tts_client(
                provider=effective_provider,
                voice_name=voice_list[0],
                models=model_list,
                language_code=language_code,
                temperature=temperature,
                voice_settings=voice_settings,
                output_formats=output_formats,
                use_timestamps=use_timestamps,
                sample_rate=SAMPLE_RATE,
                request_interval_sec=request_interval_sec,
                attempts_per_model=attempts_per_model,
                trim_pre_filters=PLAN_E_VOICE_PRE_FILTERS,
                trim_post_filters=PLAN_E_VOICE_POST_FILTERS,
                repo_root=REPO_ROOT,
            )
        return tts

    def _retrim_cached(chunk_id: str, raw_wav: Path, clean_wav: Path) -> float:
        raw_align_json = tts_dir / f"{chunk_id}_raw_alignment.json"
        clean_align_json = tts_dir / f"{chunk_id}_alignment.json"
        if raw_align_json.is_file():
            raw_align = CharacterAlignment.load_json(raw_align_json)
            dur_val, lead_trim = trim_leading_trailing_and_resample_tts(
                raw_wav,
                clean_wav,
                sample_rate=SAMPLE_RATE,
                pre_filters=PLAN_E_VOICE_PRE_FILTERS,
                post_filters=PLAN_E_VOICE_POST_FILTERS,
                alignment=raw_align,
            )
            raw_align.shifted_and_scaled(offset_sec=lead_trim, time_scale=1.0, max_sec=dur_val).save_json(
                clean_align_json
            )
            return dur_val
        if clean_align_json.is_file() and clean_wav.is_file() and clean_wav.stat().st_size > 4000:
            return ffprobe_duration(clean_wav)
        return trim_and_clean_tts(raw_wav, clean_wav)

    try:
        for spec in chunks:
            raw_wav = tts_dir / f"{spec.chunk_id}_raw.wav"
            clean_wav = tts_dir / f"{spec.chunk_id}.wav"
            max_expected = max(4.0, len(spec.text) * 0.30 + 2.0)
            reusable, entry, reason = tts_cache_state(
                spec,
                tts_dir,
                manifest,
                expected_provider=effective_provider,
            )
            cached_info = {
                **(entry or {"text": spec.text, "modelUsed": "unknown(legacy)", "provider": effective_provider}),
                "cached": True,
            }

            if reusable and not force:
                dur = _retrim_cached(spec.chunk_id, raw_wav, clean_wav)
                if 0.35 <= dur <= max_expected:
                    durations[spec.chunk_id] = dur
                    tts_info[spec.chunk_id] = cached_info
                    print(f"[TTS cache] {spec.chunk_id}: {dur:.3f}s ({reason})")
                    continue

            if skip:
                if reusable and clean_wav.is_file():
                    durations[spec.chunk_id] = ffprobe_duration(clean_wav)
                    tts_info[spec.chunk_id] = cached_info
                    continue
                raise RuntimeError(f"--skip-tts specified but no valid cached audio for {spec.chunk_id} ({reason})")

            client = _ensure_client()
            ordered_models = [locked_model, *[m for m in model_list if m != locked_model]] if locked_model else list(model_list)
            ordered_voices = [locked_voice, *[v for v in voice_list if v != locked_voice]] if locked_voice else list(voice_list)

            result = None
            last_err: Exception | None = None
            for voice_name in ordered_voices:
                try:
                    req_voice = voice_name
                    result = client.synthesize_chunk(
                        NarrationChunk(
                            chunk_id=spec.chunk_id,
                            text=spec.text,
                            pause_after_sec=spec.pause_after_sec,
                            voice_name=req_voice,
                        ),
                        tts_dir,
                        force=True,
                        stop_duration=0.14,
                        max_expected_sec=max_expected,
                        models=ordered_models,
                    )
                    break
                except (GeminiQuotaExhaustedError, ElevenLabsAuthError, ElevenLabsQuotaExceededError):
                    raise
                except Exception as exc:
                    last_err = exc
                    print(f"[TTS warn] {spec.chunk_id} voice={voice_name} failed: {str(exc)[:180]}")
            if result is None:
                raise RuntimeError(f"TTS failed for {spec.chunk_id}: {last_err}") from last_err

            locked_model = result.model_used
            locked_voice = result.voice_used
            durations[spec.chunk_id] = result.duration_sec
            align_obj = getattr(result, "alignment", None)
            info: dict[str, Any] = {
                "provider": getattr(result, "provider", effective_provider),
                "text": spec.text,
                "modelUsed": result.model_used,
                "voice": result.voice_used,
                "keyLabel": result.key_label,
                "durationSec": round(result.duration_sec, 4),
                "alignmentSource": getattr(align_obj, "source", None) if align_obj is not None else None,
                "generatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
            }
            voice_disp = getattr(result, "voice_display_name", None)
            if voice_disp:
                info["voiceName"] = voice_disp
            manifest[spec.chunk_id] = info
            tts_info[spec.chunk_id] = {**info, "cached": False}
            save_tts_manifest(tts_dir, manifest, model_list, provider=effective_provider)
            print(
                f"[TTS ok] {spec.chunk_id} provider={info['provider']} model={result.model_used} "
                f"voice={result.voice_used}: {result.duration_sec:.3f}s"
            )
    finally:
        if manifest:
            save_tts_manifest(tts_dir, manifest, model_list, provider=effective_provider)

    return durations, tts_info


def inspect_images_for_dry_run(images: list[ImageSpec], images_dir: Path) -> dict[str, str]:
    statuses: dict[str, str] = {}
    for img in images:
        out_path = images_dir / img.filename
        if out_path.is_file() and out_path.stat().st_size > 1000:
            statuses[img.filename] = f"local_ready ({out_path.stat().st_size // 1024} KB)"
        else:
            statuses[img.filename] = "pending_local_asset"
    return statuses


def resolve_local_images(
    images: list[ImageSpec],
    images_dir: Path,
    *,
    skip: bool = False,
    asset_manifest: dict[str, Any] | None = None,
) -> dict[str, str]:
    """ローカル／ネット収集済み画像を検証し、sha256 をマニフェストへ記録する（AI画像生成ゼロ）。"""
    if not images:
        return {}
    images_dir.mkdir(parents=True, exist_ok=True)
    resolved_paths: dict[str, str] = {}

    for spec in images:
        out_path = images_dir / spec.filename
        if out_path.is_file() and out_path.stat().st_size > 1000:
            resolved_paths[spec.key] = str(out_path)
            if asset_manifest is not None:
                asset_manifest[spec.key] = {
                    "kind": "images",
                    "filename": spec.filename,
                    "intent": spec.intent,
                    "sourceUrl": f"local:{spec.filename}",
                    "sha256": _file_sha256(out_path),
                }
            print(f"[IMG local] {spec.filename} ({out_path.stat().st_size // 1024} KB)")
            continue
        if skip:
            if out_path.is_file():
                resolved_paths[spec.key] = str(out_path)
                continue
            raise RuntimeError(f"--skip-images specified but missing {out_path}")
        raise RuntimeError(
            f"Local curated asset missing at {out_path}. "
            "AI画像生成は廃止済みです。ネット収集写真・公的資料・フリー素材を配置するか Remotion SVG で補完してください。"
        )

    return resolved_paths


def inspect_videos_for_dry_run(
    clips: list[VideoClipSpec],
    videos_dir: Path,
    images_dir: Path,
    *,
    public_dir: Path | None = None,
) -> dict[str, str]:
    manifest = _load_asset_manifest(public_dir)
    statuses: dict[str, str] = {}
    for vc in clips:
        out_path = videos_dir / vc.filename
        expected_url = vc.url or (f"search:{vc.source}:{vc.search_query}" if vc.search_query else "")
        man_url = str((manifest.get(vc.key) or {}).get("sourceUrl") or "")
        if out_path.is_file() and out_path.stat().st_size > 30000:
            if man_url and expected_url and man_url != expected_url:
                note = f"stale_url ({man_url} -> {expected_url})"
            else:
                note = f"cached ({out_path.stat().st_size // 1024} KB)"
        else:
            note = f"pending_fetch ({vc.source})"
        if vc.extract_poster:
            poster = images_dir / f"{Path(vc.filename).stem}_poster.png"
            note += "+poster_ok" if poster.is_file() else "+poster_pending"
        statuses[vc.filename] = note
    return statuses


def inspect_stock_images_for_dry_run(
    items: list[StockImageSpec],
    images_dir: Path,
    *,
    public_dir: Path | None = None,
) -> dict[str, str]:
    manifest = _load_asset_manifest(public_dir)
    statuses: dict[str, str] = {}
    for si in items:
        out_path = images_dir / si.filename
        expected_url = si.url or (f"search:{si.source}:{si.search_query}" if si.search_query else "")
        man_url = str((manifest.get(si.key) or {}).get("sourceUrl") or "")
        if out_path.is_file() and out_path.stat().st_size > 10000:
            if man_url and expected_url and man_url != expected_url:
                statuses[si.filename] = f"stale_url ({man_url} -> {expected_url})"
            else:
                statuses[si.filename] = f"cached ({out_path.stat().st_size // 1024} KB)"
        else:
            statuses[si.filename] = f"pending_fetch ({si.source})"
    return statuses


def resolve_mixkit_video_url(query: str) -> str | None:
    """Mixkit 無料ストック動画カテゴリページから自律検索で MP4 URL を解決する。"""
    slug = re.sub(r"[^a-z0-9]+", "-", query.lower()).strip("-")
    if not slug:
        return None
    candidates_urls = [
        f"https://mixkit.co/free-stock-video/{slug}/",
        *[
            f"https://mixkit.co/free-stock-video/{tok}/"
            for tok in slug.split("-")
            if len(tok) >= 3
        ],
    ]
    for page_url in candidates_urls:
        try:
            resp = requests.get(page_url, headers={"User-Agent": STOCK_BROWSER_UA}, timeout=15)
            if resp.status_code != 200:
                continue
            ids = list(dict.fromkeys(re.findall(r'href="/free-stock-video/[a-z0-9-]+-(\d+)/"', resp.text)))
            for vid in ids[:5]:
                for q in ("1080", "720"):
                    mp4_url = f"https://assets.mixkit.co/videos/{vid}/{vid}-{q}.mp4"
                    head = requests.head(
                        mp4_url, headers={"User-Agent": STOCK_BROWSER_UA}, timeout=10, allow_redirects=True
                    )
                    if head.status_code == 200:
                        return mp4_url
        except Exception:
            continue
    return None


def resolve_wikimedia_media_url(
    query: str,
    media_type: str = "bitmap",
    *,
    min_width: int = WIKIMEDIA_MIN_WIDTH_PX,
) -> str | None:
    """Wikimedia Commons API から自律検索で公開メディア URL を解決する（静止画は横幅 min_width px 以上）。"""
    try:
        resp = requests.get(
            "https://commons.wikimedia.org/w/api.php",
            params={
                "action": "query",
                "generator": "search",
                "gsrsearch": f"{query} filetype:{media_type}",
                "gsrnamespace": 6,
                "gsrlimit": 10,
                "prop": "imageinfo",
                "iiprop": "url|size|mime",
                "format": "json",
            },
            headers={"User-Agent": WIKIMEDIA_UA},
            timeout=20,
        )
        if resp.status_code != 200:
            return None
        pages = resp.json().get("query", {}).get("pages", {})
        for page in pages.values():
            ii = (page.get("imageinfo") or [{}])[0]
            url = ii.get("url")
            if not url or _has_forbidden_video_host(str(url)):
                continue
            if media_type == "bitmap":
                width = int(ii.get("width") or 0)
                if width < min_width:
                    continue
            return str(url)
    except Exception:
        return None
    return None


def _download_binary(url: str, dest: Path, *, user_agent: str) -> None:
    if _has_forbidden_video_host(url):
        raise ValueError(f"Prohibited YouTube URL: {url}")
    resp = requests.get(url, headers={"User-Agent": user_agent}, timeout=90, stream=True)
    resp.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as fh:
        for chunk in resp.iter_content(chunk_size=65536):
            if chunk:
                fh.write(chunk)


def _write_png_rgba(path: Path, width: int, height: int, rgba_bytes: bytes | bytearray) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return len(data).to_bytes(4, "big") + body + (zlib.crc32(body) & 0xFFFFFFFF).to_bytes(4, "big")

    stride = width * 4
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        start = y * stride
        rows.extend(rgba_bytes[start : start + stride])

    ihdr = width.to_bytes(4, "big") + height.to_bytes(4, "big") + bytes([8, 6, 0, 0, 0])
    idat = zlib.compress(bytes(rows), level=6)
    png_data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png_data)


def _cutout_stock_image_rgba(
    raw_path: Path,
    out_png: Path,
    *,
    mode: str,
    crop_box: tuple[float, float, float, float] | None = None,
    size: int = 960,
) -> tuple[int, int]:
    """外周BFSフラッドフィル＋最大連結成分残存＋境界フェザーで透過PNGを切り出す。"""
    vf_parts: list[str] = []
    if crop_box is not None:
        cx, cy, cw_r, ch_r = crop_box
        vf_parts.append(f"crop=iw*{cw_r:.4f}:ih*{ch_r:.4f}:iw*{cx:.4f}:ih*{cy:.4f}")
    vf_parts.append(f"scale={size}:{size}:force_original_aspect_ratio=decrease")
    vf_parts.append(f"pad={size}:{size}:(ow-iw)/2:(oh-ih)/2:color=black@0.0")
    proc = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(raw_path),
            "-vf",
            ",".join(vf_parts),
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "pipe:1",
        ],
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg rawvideo failed for {raw_path}: {proc.stderr.decode('utf-8', 'replace')}"
        )
    buf = bytearray(proc.stdout)
    total = size * size
    if len(buf) != total * 4:
        raise RuntimeError(f"Unexpected RGBA buffer size for {raw_path}: {len(buf)} != {total * 4}")

    edge_samples: list[tuple[int, int, int]] = []
    for y in range(0, size, max(1, size // 24)):
        for x in range(size):
            off = (y * size + x) * 4
            if buf[off + 3] >= 220:
                edge_samples.append((buf[off], buf[off + 1], buf[off + 2]))
                break
        for x in range(size - 1, -1, -1):
            off = (y * size + x) * 4
            if buf[off + 3] >= 220:
                edge_samples.append((buf[off], buf[off + 1], buf[off + 2]))
                break
    for x in range(0, size, max(1, size // 24)):
        for y in range(size):
            off = (y * size + x) * 4
            if buf[off + 3] >= 220:
                edge_samples.append((buf[off], buf[off + 1], buf[off + 2]))
                break
    if edge_samples:
        r0 = sorted(c[0] for c in edge_samples)[len(edge_samples) // 2]
        g0 = sorted(c[1] for c in edge_samples)[len(edge_samples) // 2]
        b0 = sorted(c[2] for c in edge_samples)[len(edge_samples) // 2]
    else:
        r0, g0, b0 = 200, 200, 200

    chroma0 = max(r0, g0, b0) - min(r0, g0, b0)
    bg = bytearray(total)

    def is_bg_pixel(idx: int, ref_rgb: tuple[int, int, int] | None = None) -> bool:
        off = idx * 4
        if buf[off + 3] < 20:
            return True
        r, g, b = buf[off], buf[off + 1], buf[off + 2]
        if mode == "corner_bg_alpha":
            if abs(r - r0) <= 32 and abs(g - g0) <= 32 and abs(b - b0) <= 32:
                return True
            if chroma0 <= 18:
                mx = max(r, g, b)
                mn = min(r, g, b)
                if (mx - mn) <= 18 and r >= 120 and g >= 120 and b >= 120 and ref_rgb is not None:
                    rr, rg, rb = ref_rgb
                    if abs(r - rr) <= 14 and abs(g - rg) <= 14 and abs(b - rb) <= 14:
                        return True
            return False
        if mode == "light_paper_sticker":
            mx = max(r, g, b)
            mn = min(r, g, b)
            return mn >= 165 and (mx - mn) <= 44
        mx = max(r, g, b)
        sm = r + g + b
        return mx <= 38 and sm <= 92

    q: deque[int] = deque()
    for x in range(size):
        for idx in (x, (size - 1) * size + x):
            if not bg[idx] and is_bg_pixel(idx):
                bg[idx] = 1
                q.append(idx)
    for y in range(1, size - 1):
        for idx in (y * size, y * size + size - 1):
            if not bg[idx] and is_bg_pixel(idx):
                bg[idx] = 1
                q.append(idx)

    while q:
        idx = q.popleft()
        x = idx % size
        y = idx // size
        off = idx * 4
        ref_rgb = (buf[off], buf[off + 1], buf[off + 2]) if buf[off + 3] >= 20 else None
        for n in (
            idx - 1 if x > 0 else -1,
            idx + 1 if x + 1 < size else -1,
            idx - size if y > 0 else -1,
            idx + size if y + 1 < size else -1,
        ):
            if n >= 0 and not bg[n] and is_bg_pixel(n, ref_rgb):
                bg[n] = 1
                q.append(n)

    if mode == "corner_bg_alpha" and chroma0 <= 18:
        def is_flat_hole_seed(idx: int) -> bool:
            hx = idx % size
            hy = idx // size
            if hx < 1 or hx >= size - 1 or hy < 1 or hy >= size - 1:
                return False
            off = idx * 4
            if buf[off + 3] < 20:
                return False
            r, g, b = buf[off], buf[off + 1], buf[off + 2]
            if abs(r - r0) > 12 or abs(g - g0) > 12 or abs(b - b0) > 12:
                return False
            for nn in (idx - 1, idx + 1, idx - size, idx + size):
                noff = nn * 4
                if abs(buf[noff] - r) > 4 or abs(buf[noff + 1] - g) > 4 or abs(buf[noff + 2] - b) > 4:
                    return False
            return True

        hole_vis = bytearray(total)
        min_hole_area = max(900, total // 1000)
        for s in range(total):
            if bg[s] or hole_vis[s] or not is_flat_hole_seed(s):
                continue
            hq: deque[int] = deque([s])
            hole_vis[s] = 1
            comp_hole: list[int] = [s]
            seed_cnt = 1
            soff = s * 4
            sr, sg, sb = buf[soff], buf[soff + 1], buf[soff + 2]
            while hq:
                cur = hq.popleft()
                cx2 = cur % size
                cy2 = cur // size
                for nn in (
                    cur - 1 if cx2 > 0 else -1,
                    cur + 1 if cx2 + 1 < size else -1,
                    cur - size if cy2 > 0 else -1,
                    cur + size if cy2 + 1 < size else -1,
                ):
                    if nn >= 0 and not bg[nn] and not hole_vis[nn]:
                        noff = nn * 4
                        nr, ng, nb = buf[noff], buf[noff + 1], buf[noff + 2]
                        if (
                            abs(nr - sr) <= 18
                            and abs(ng - sg) <= 18
                            and abs(nb - sb) <= 18
                            and (max(nr, ng, nb) - min(nr, ng, nb)) <= 16
                        ):
                            hole_vis[nn] = 1
                            hq.append(nn)
                            comp_hole.append(nn)
                            if is_flat_hole_seed(nn):
                                seed_cnt += 1
            if len(comp_hole) >= min_hole_area and (seed_cnt / len(comp_hole)) >= 0.35:
                for pi in comp_hole:
                    bg[pi] = 1

    for idx in range(total):
        if bg[idx]:
            buf[idx * 4 + 3] = 0

    visited = bytearray(total)
    components: list[list[int]] = []
    for start in range(total):
        if bg[start] or buf[start * 4 + 3] < 16 or visited[start]:
            continue
        comp: list[int] = [start]
        cq: deque[int] = deque([start])
        visited[start] = 1
        while cq:
            idx = cq.popleft()
            x = idx % size
            y = idx // size
            for n in (
                idx - 1 if x > 0 else -1,
                idx + 1 if x + 1 < size else -1,
                idx - size if y > 0 else -1,
                idx + size if y + 1 < size else -1,
            ):
                if n >= 0 and not visited[n] and not bg[n] and buf[n * 4 + 3] >= 16:
                    visited[n] = 1
                    cq.append(n)
                    comp.append(n)
        components.append(comp)

    if len(components) > 1:
        components.sort(key=len, reverse=True)
        min_keep = max(500, int(len(components[0]) * 0.03))
        for comp in components[1:]:
            if len(comp) < min_keep:
                for idx in comp:
                    bg[idx] = 1
                    buf[idx * 4 + 3] = 0

    dist = bytearray([255] * total)
    dq: deque[int] = deque()
    for idx in range(total):
        if bg[idx]:
            dist[idx] = 0
            dq.append(idx)
    while dq:
        idx = dq.popleft()
        d = dist[idx]
        if d >= 3:
            continue
        x = idx % size
        y = idx // size
        nd = d + 1
        for n in (
            idx - 1 if x > 0 else -1,
            idx + 1 if x + 1 < size else -1,
            idx - size if y > 0 else -1,
            idx + size if y + 1 < size else -1,
        ):
            if n >= 0 and dist[n] > nd:
                dist[n] = nd
                dq.append(n)

    for idx in range(total):
        off = idx * 4
        if bg[idx]:
            buf[off + 3] = 0
        elif dist[idx] == 1:
            buf[off + 3] = min(buf[off + 3], 150)
        elif dist[idx] == 2:
            buf[off + 3] = min(buf[off + 3], 225)

    min_x, min_y = size, size
    max_x, max_y = -1, -1
    for y in range(size):
        row_off = y * size * 4
        for x in range(size):
            if buf[row_off + x * 4 + 3] >= 16:
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)

    if max_x < min_x or max_y < min_y:
        _write_png_rgba(out_png, size, size, buf)
        return size, size

    pad = max(8, int(max(max_x - min_x + 1, max_y - min_y + 1) * 0.03))
    x0 = max(0, min_x - pad)
    y0 = max(0, min_y - pad)
    x1 = min(size, max_x + 1 + pad)
    y1 = min(size, max_y + 1 + pad)
    cw, ch = x1 - x0, y1 - y0
    cropped = bytearray(cw * ch * 4)
    for yy in range(ch):
        src_off = ((y0 + yy) * size + x0) * 4
        dst_off = (yy * cw) * 4
        cropped[dst_off : dst_off + cw * 4] = buf[src_off : src_off + cw * 4]
    _write_png_rgba(out_png, cw, ch, cropped)
    return cw, ch


def fetch_and_normalize_video_clips(
    clips: list[VideoClipSpec],
    videos_dir: Path,
    images_dir: Path,
    *,
    force: bool = False,
    skip: bool = False,
    asset_manifest: dict[str, Any] | None = None,
) -> tuple[dict[str, str], dict[str, str]]:
    """実写動画Bロールを取得し正規化する。sourceUrl 一致時のみキャッシュ再利用する。"""
    if not clips:
        return {}, {}
    videos_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)
    video_paths: dict[str, str] = {}
    poster_paths: dict[str, str] = {}
    manifest = asset_manifest if asset_manifest is not None else {}

    for vc in clips:
        out_path = videos_dir / vc.filename
        poster_path = images_dir / f"{Path(vc.filename).stem}_poster.png"
        spec_source_url = vc.url or (f"search:{vc.source}:{vc.search_query}" if vc.search_query else "")
        prev_entry = manifest.get(vc.key) if isinstance(manifest.get(vc.key), dict) else {}
        prev_url = str(prev_entry.get("sourceUrl") or "")
        url_matches = bool(spec_source_url and prev_url == spec_source_url)

        if not force and out_path.is_file() and out_path.stat().st_size > 1000 and url_matches:
            video_paths[vc.key] = str(out_path)
            manifest[vc.key] = {
                "kind": "videoClips",
                "filename": vc.filename,
                "intent": vc.intent,
                "sourceUrl": spec_source_url,
                "sha256": _file_sha256(out_path),
            }
            print(f"[VID cache] {vc.filename} ({out_path.stat().st_size // 1024} KB)")
            if vc.extract_poster:
                if force or not poster_path.is_file() or poster_path.stat().st_size < 1000:
                    run_cmd(["ffmpeg", "-y", "-ss", "0.5", "-i", str(out_path), "-frames:v", "1", str(poster_path)])
                poster_paths[f"{vc.key}_poster"] = str(poster_path)
            continue

        if skip:
            if out_path.is_file():
                video_paths[vc.key] = str(out_path)
                manifest[vc.key] = {
                    "kind": "videoClips",
                    "filename": vc.filename,
                    "intent": vc.intent,
                    "sourceUrl": spec_source_url,
                    "sha256": _file_sha256(out_path),
                }
                if vc.extract_poster and poster_path.is_file():
                    poster_paths[f"{vc.key}_poster"] = str(poster_path)
                continue
            raise RuntimeError(f"--skip-videos specified but missing {out_path}")

        resolved_url = vc.url
        if not resolved_url and vc.search_query:
            if vc.source == "mixkit":
                resolved_url = resolve_mixkit_video_url(vc.search_query)
            elif vc.source == "wikimedia":
                resolved_url = resolve_wikimedia_media_url(vc.search_query, media_type="video")
        if not resolved_url:
            raise RuntimeError(f"Could not resolve video URL for {vc.key} ({vc.source}: {vc.search_query})")

        tmp_raw = videos_dir / f"_raw_{vc.filename}"
        ua = WIKIMEDIA_UA if "wikimedia.org" in resolved_url else STOCK_BROWSER_UA
        try:
            try:
                _download_binary(resolved_url, tmp_raw, user_agent=ua)
            except Exception as exc:
                if vc.search_query and vc.source == "mixkit":
                    alt_url = resolve_mixkit_video_url(vc.search_query)
                    if not alt_url:
                        raise
                    print(f"[VID fallback] {vc.key}: {exc} -> {alt_url}")
                    _download_binary(alt_url, tmp_raw, user_agent=STOCK_BROWSER_UA)
                else:
                    raise

            vf = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p"
            offset = max(0.0, vc.start_offset_sec)
            run_cmd(
                [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    f"{offset:.3f}",
                    "-i",
                    str(tmp_raw),
                    "-t",
                    f"{max(0.5, vc.duration_sec):.3f}",
                    "-vf",
                    vf,
                    "-an",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "fast",
                    "-crf",
                    "21",
                    "-g",
                    "15",
                    "-movflags",
                    "+faststart",
                    str(out_path),
                ]
            )
            if ffprobe_duration(out_path) < 0.4 and offset > 0.0:
                run_cmd(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        str(tmp_raw),
                        "-t",
                        f"{max(0.5, vc.duration_sec):.3f}",
                        "-vf",
                        vf,
                        "-an",
                        "-c:v",
                        "libx264",
                        "-preset",
                        "fast",
                        "-crf",
                        "21",
                        "-g",
                        "15",
                        "-movflags",
                        "+faststart",
                        str(out_path),
                    ]
                )
        finally:
            tmp_raw.unlink(missing_ok=True)

        video_paths[vc.key] = str(out_path)
        manifest[vc.key] = {
            "kind": "videoClips",
            "filename": vc.filename,
            "intent": vc.intent,
            "sourceUrl": spec_source_url or resolved_url,
            "sha256": _file_sha256(out_path),
        }
        print(f"[VID ok] {vc.filename} ({out_path.stat().st_size // 1024} KB, {ffprobe_duration(out_path):.2f}s)")
        if vc.extract_poster:
            run_cmd(["ffmpeg", "-y", "-ss", "0.5", "-i", str(out_path), "-frames:v", "1", str(poster_path)])
            poster_paths[f"{vc.key}_poster"] = str(poster_path)
            print(f"[POSTER ok] {poster_path.name}")

    return video_paths, poster_paths


def fetch_stock_images(
    items: list[StockImageSpec],
    images_dir: Path,
    *,
    force: bool = False,
    skip: bool = False,
    asset_manifest: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Wikimedia Commons / 公開アーカイブから実写写真を取得する。sourceUrl 一致時のみキャッシュ再利用する。"""
    if not items:
        return {}
    images_dir.mkdir(parents=True, exist_ok=True)
    out_paths: dict[str, str] = {}
    manifest = asset_manifest if asset_manifest is not None else {}

    for si in items:
        out_path = images_dir / si.filename
        spec_source_url = si.url or (f"search:{si.source}:{si.search_query}" if si.search_query else "")
        prev_entry = manifest.get(si.key) if isinstance(manifest.get(si.key), dict) else {}
        prev_url = str(prev_entry.get("sourceUrl") or "")
        url_matches = bool(spec_source_url and prev_url == spec_source_url)

        if not force and out_path.is_file() and out_path.stat().st_size > 1000 and url_matches:
            out_paths[si.key] = str(out_path)
            manifest[si.key] = {
                "kind": "stockImages",
                "filename": si.filename,
                "intent": si.intent,
                "sourceUrl": spec_source_url,
                "sha256": _file_sha256(out_path),
            }
            print(f"[STOCK cache] {si.filename} ({out_path.stat().st_size // 1024} KB)")
            continue
        if skip:
            if out_path.is_file():
                out_paths[si.key] = str(out_path)
                manifest[si.key] = {
                    "kind": "stockImages",
                    "filename": si.filename,
                    "intent": si.intent,
                    "sourceUrl": spec_source_url,
                    "sha256": _file_sha256(out_path),
                }
                continue
            raise RuntimeError(f"--skip-images specified but missing {out_path}")

        resolved_url = si.url
        if not resolved_url and si.search_query:
            resolved_url = resolve_wikimedia_media_url(si.search_query, media_type="bitmap")
        if not resolved_url:
            raise RuntimeError(f"Could not resolve stock image URL for {si.key}")

        tmp_raw = images_dir / f"_raw_{si.filename}"
        ua = WIKIMEDIA_UA if "wikimedia.org" in resolved_url else STOCK_BROWSER_UA
        try:
            _download_binary(resolved_url, tmp_raw, user_agent=ua)
            if si.cutout_mode in {"dark_bg_alpha", "light_paper_sticker", "corner_bg_alpha"}:
                cw, ch = _cutout_stock_image_rgba(
                    tmp_raw,
                    out_path,
                    mode=si.cutout_mode,
                    crop_box=si.crop_box,
                )
                print(f"[STOCK cutout ok] {si.filename} ({cw}x{ch}, mode={si.cutout_mode})")
            else:
                vf_parts: list[str] = []
                if si.crop_box is not None:
                    cx, cy, cw_r, ch_r = si.crop_box
                    vf_parts.append(f"crop=iw*{cw_r:.4f}:ih*{ch_r:.4f}:iw*{cx:.4f}:ih*{cy:.4f}")
                vf_parts.append("scale='min(1920,iw)':-2")
                run_cmd(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        str(tmp_raw),
                        "-vf",
                        ",".join(vf_parts),
                        "-frames:v",
                        "1",
                        str(out_path),
                    ]
                )
                print(f"[STOCK ok] {si.filename} ({out_path.stat().st_size // 1024} KB)")
        finally:
            tmp_raw.unlink(missing_ok=True)
        out_paths[si.key] = str(out_path)
        manifest[si.key] = {
            "kind": "stockImages",
            "filename": si.filename,
            "intent": si.intent,
            "sourceUrl": spec_source_url or resolved_url,
            "sha256": _file_sha256(out_path),
        }

    return out_paths


def generate_asset_contact_sheet(
    public_dir: Path,
    video_clips: Sequence[VideoClipSpec],
    stock_images: Sequence[StockImageSpec] = (),
    images: Sequence[ImageSpec] = (),
) -> dict[str, Any]:
    """全動画クリップ（先頭5%/中央50%/末尾90%の3コマ横並び）と静止画の検品用コンタクトシートを生成する。"""
    videos_dir = public_dir / "videos"
    images_dir = public_dir / "images"
    out_sheet = public_dir / "contact_sheet.png"
    index_json = public_dir / "contact_sheet_index.json"
    entries: list[dict[str, Any]] = []

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        row_paths: list[Path] = []

        for r_idx, vc in enumerate(video_clips):
            vid_path = videos_dir / vc.filename
            if not vid_path.is_file():
                continue
            dur = max(0.3, ffprobe_duration(vid_path))
            sample_times = [round(dur * 0.05, 3), round(dur * 0.50, 3), round(max(0.0, dur * 0.90 - 0.04), 3)]
            cell_paths: list[Path] = []
            for c_idx, ts in enumerate(sample_times):
                cell = tmp_path / f"v_{r_idx}_{c_idx}.png"
                run_cmd(
                    [
                        "ffmpeg",
                        "-y",
                        "-ss",
                        f"{ts:.3f}",
                        "-i",
                        str(vid_path),
                        "-frames:v",
                        "1",
                        "-vf",
                        "scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:color=#111827",
                        str(cell),
                    ]
                )
                cell_paths.append(cell)
            row_img = tmp_path / f"row_{r_idx}.png"
            run_cmd(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(cell_paths[0]),
                    "-i",
                    str(cell_paths[1]),
                    "-i",
                    str(cell_paths[2]),
                    "-filter_complex",
                    "[0:v][1:v][2:v]hstack=inputs=3,pad=iw:ih+8:0:4:color=#0B0E14",
                    str(row_img),
                ]
            )
            row_paths.append(row_img)
            entries.append(
                {
                    "rowIndex": len(row_paths) - 1,
                    "kind": "videoClips",
                    "key": vc.key,
                    "filename": vc.filename,
                    "intent": vc.intent,
                    "sha256": _file_sha256(vid_path),
                    "sampleTimesSec": sample_times,
                }
            )

        if row_paths:
            if len(row_paths) == 1:
                out_sheet.parent.mkdir(parents=True, exist_ok=True)
                out_sheet.write_bytes(row_paths[0].read_bytes())
            else:
                inputs: list[str] = []
                labels: list[str] = []
                for idx, rp in enumerate(row_paths):
                    inputs.extend(["-i", str(rp)])
                    labels.append(f"[{idx}:v]")
                run_cmd(
                    [
                        "ffmpeg",
                        "-y",
                        *inputs,
                        "-filter_complex",
                        f"{''.join(labels)}vstack=inputs={len(row_paths)}",
                        str(out_sheet),
                    ]
                )

        # 静止画（stockImages / images）のサムネイル一覧も生成
        img_entries: list[dict[str, Any]] = []
        img_tiles: list[Path] = []
        for idx, item in enumerate([*stock_images, *images]):
            img_path = images_dir / item.filename
            if not img_path.is_file():
                continue
            tile = tmp_path / f"img_tile_{idx}.png"
            run_cmd(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(img_path),
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:color=#111827",
                    str(tile),
                ]
            )
            img_tiles.append(tile)
            img_entries.append(
                {
                    "tileIndex": len(img_tiles) - 1,
                    "kind": "stockImages" if isinstance(item, StockImageSpec) else "images",
                    "key": item.key,
                    "filename": item.filename,
                    "intent": item.intent,
                    "sha256": _file_sha256(img_path),
                }
            )
        images_sheet = public_dir / "images_contact_sheet.png"
        if img_tiles:
            if len(img_tiles) == 1:
                images_sheet.parent.mkdir(parents=True, exist_ok=True)
                images_sheet.write_bytes(img_tiles[0].read_bytes())
            else:
                inputs_i: list[str] = []
                labels_i: list[str] = []
                for idx, tp in enumerate(img_tiles):
                    inputs_i.extend(["-i", str(tp)])
                    labels_i.append(f"[{idx}:v]")
                run_cmd(
                    [
                        "ffmpeg",
                        "-y",
                        *inputs_i,
                        "-filter_complex",
                        f"{''.join(labels_i)}vstack=inputs={len(img_tiles)}",
                        str(images_sheet),
                    ]
                )

    payload = {
        "videoContactSheet": str(out_sheet) if out_sheet.is_file() else None,
        "imagesContactSheet": str(public_dir / "images_contact_sheet.png")
        if (public_dir / "images_contact_sheet.png").is_file()
        else None,
        "videos": entries,
        "images": img_entries,
    }
    index_json.parent.mkdir(parents=True, exist_ok=True)
    index_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def _resolve_time(
    events: dict[str, Any],
    key_or_sec: Any,
    default_sec: float | None = None,
    *,
    context: str = "",
) -> float:
    if key_or_sec is None:
        if default_sec is not None:
            return float(default_sec)
        raise ValueError(f"Missing time/event reference ({context})")
    if not isinstance(key_or_sec, bool) and isinstance(key_or_sec, (int, float)):
        return float(key_or_sec)
    if isinstance(key_or_sec, str):
        if key_or_sec in events:
            val = events[key_or_sec]
            if not isinstance(val, bool) and isinstance(val, (int, float)):
                return float(val)
        raise ValueError(f"Unknown event reference {key_or_sec!r} ({context})")
    raise ValueError(f"Unsupported event/time value {key_or_sec!r} ({context})")


def _compute_chunk_char_times(
    text: str,
    start_sec: float,
    duration_sec: float,
    speech_end_sec: float,
    alignment: CharacterAlignment | None,
) -> list[float]:
    """チャンク各文字の絶対開始時刻リスト（小数3桁・単調非減少・len==len(text)）を算出する。"""
    n = len(text)
    if n == 0:
        return []
    out: list[float] = []
    prev_t = start_sec
    for idx in range(n):
        abs_t: float | None = None
        if alignment is not None and alignment.characters:
            mapped = alignment._map_char_index(text, idx)
            if mapped is not None:
                if mapped < len(alignment.start_times_sec):
                    rel_t = float(alignment.start_times_sec[mapped])
                else:
                    rel_t = float(alignment.end_times_sec[-1])
                abs_t = start_sec + max(0.0, rel_t)
        if abs_t is None:
            abs_t = start_sec + duration_sec * (idx / max(1, n))
        clamped = max(prev_t, min(speech_end_sec, abs_t))
        rounded = round(clamped, 3)
        out.append(rounded)
        prev_t = rounded
    return out


def _plan_e_sfx_kinds(spec: dict[str, Any]) -> Sequence[str]:
    audio_cfg = spec.get("audio") or {}
    if not audio_cfg.get("exportSfxLibrary", True):
        return ()
    requested = audio_cfg.get("sfxLibraryKinds") or PLAN_E_SFX_LIBRARY_KINDS
    return tuple(dict.fromkeys(resolve_sfx_kind(str(kind)) for kind in requested))


def _export_plan_e_sfx(spec: dict[str, Any], public_dir: Path) -> None:
    kinds = _plan_e_sfx_kinds(spec)
    if kinds:
        export_sfx_library(
            public_dir / "sfx", kinds, force=True, sample_rate=SAMPLE_RATE,
        )


def build_timeline(
    spec: dict[str, Any],
    chunks: list[NarrationChunkSpec],
    durations: dict[str, float],
    tts_dir: Path,
    public_subdir: str,
    images: list[ImageSpec],
    dry_run: bool = False,
    tts_info: dict[str, dict[str, Any]] | None = None,
    video_clips: list[VideoClipSpec] | None = None,
    stock_images: list[StockImageSpec] | None = None,
    audio_variant: str | None = None,
    assets_meta: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    video_cfg = spec.get("video") or {}
    fps = int(video_cfg.get("fps", 30))
    width = int(video_cfg.get("width", 1920))
    height = int(video_cfg.get("height", 1080))

    pacing_cfg = spec.get("pacing") or {}
    pacing_mode = str(pacing_cfg.get("mode", "natural"))
    leading_silence = float(pacing_cfg.get("leadingSilenceSec", 0.15))
    target_ideal = float(pacing_cfg.get("targetTotalSec", 60.0))
    target_min = float(pacing_cfg.get("targetMinSec", target_ideal - 0.8))
    target_max = float(pacing_cfg.get("targetMaxSec", target_ideal + 0.8))
    min_tempo = float(pacing_cfg.get("minTempo", 0.92))
    max_tempo = float(pacing_cfg.get("maxTempo", 1.15))

    brand = json.loads((REPO_ROOT / "studio/src/components/plan_e/brand/akapenCues.json").read_text(encoding="utf-8"))
    reserved_sec = sum(brand["variants"][c.eyecatch_after]["durationSec"] + brand["postPauseSec"]
                       for c in chunks if c.eyecatch_after)
    fixed_sec = leading_silence + reserved_sec
    raw_speech = sum(durations.values())
    raw_pauses = sum(c.pause_after_sec for c in chunks)
    raw_total = fixed_sec + raw_speech + raw_pauses

    pauses = {c.chunk_id: c.pause_after_sec for c in chunks}
    applied_tempo = 1.0
    sim_durations = dict(durations)

    if pacing_mode == "fit_target" and not (target_min <= raw_total <= target_max):
        desired_pauses = target_ideal - fixed_sec - raw_speech
        scale_p = desired_pauses / max(raw_pauses, 0.01)
        if 0.65 <= scale_p <= 1.50:
            for c in chunks:
                pauses[c.chunk_id] = max(c.min_pause_sec, c.pause_after_sec * scale_p)
                if not dry_run:
                    scale_wav_tempo(tts_dir / f"{c.chunk_id}.wav", tts_dir / f"{c.chunk_id}_paced.wav", 1.0)
        else:
            applied_tempo = max(
                min_tempo,
                min(max_tempo, raw_speech / max(target_ideal - fixed_sec - raw_pauses, 12.0)),
            )
            for c in chunks:
                if dry_run:
                    sim_durations[c.chunk_id] = round(sim_durations[c.chunk_id] / applied_tempo, 4)
                else:
                    sim_durations[c.chunk_id] = scale_wav_tempo(
                        tts_dir / f"{c.chunk_id}.wav",
                        tts_dir / f"{c.chunk_id}_paced.wav",
                        applied_tempo,
                    )
            new_speech = sum(sim_durations.values())
            rem_p = max(1.0, target_ideal - fixed_sec - new_speech)
            scale_p2 = rem_p / max(raw_pauses, 0.01)
            for c in chunks:
                pauses[c.chunk_id] = max(c.min_pause_sec, c.pause_after_sec * max(0.65, min(1.50, scale_p2)))
    elif not dry_run:
        for c in chunks:
            scale_wav_tempo(tts_dir / f"{c.chunk_id}.wav", tts_dir / f"{c.chunk_id}_paced.wav", 1.0)

    cursor = leading_silence
    chunk_times: dict[str, dict[str, Any]] = {}
    chunk_list: list[dict[str, Any]] = []
    char_times: dict[str, list[float]] = {}
    internal_pauses: dict[str, list[float]] = {}
    phrase_pauses: dict[str, list[float]] = {}
    chunk_alignments: dict[str, CharacterAlignment] = {}

    eyecatches = {}
    for c in chunks:
        dur = sim_durations[c.chunk_id]
        p = pauses[c.chunk_id]
        start = cursor
        speech_end = start + dur
        end = speech_end + p
        if c.eyecatch_after:
            start_ec = round(end, 4)
            duration_ec = brand["variants"][c.eyecatch_after]["durationSec"]
            end_ec = round(end + duration_ec, 4)
            p += duration_ec + brand["postPauseSec"]
            end = speech_end + p
            eyecatches[c.chunk_id] = {"variant": c.eyecatch_after, "startSec": start_ec,
                                      "endSec": end_ec, "resumeSec": round(end, 4)}
        clean_wav = tts_dir / f"{c.chunk_id}.wav"
        if dry_run:
            candidate = tts_dir / f"{c.chunk_id}_paced.wav"
            if not candidate.is_file():
                candidate = clean_wav
            time_scale = applied_tempo
        else:
            candidate = tts_dir / f"{c.chunk_id}_paced.wav"
            time_scale = 1.0
        if candidate.is_file():
            pauses_rel = [m / time_scale for m in detect_internal_pauses(candidate, min_duration=0.04)]
            phrase_rel = [
                m / time_scale
                for m in detect_internal_pauses(candidate, min_duration=PHRASE_PAUSE_MIN_SEC)
            ]
        else:
            pauses_rel, phrase_rel = [], []
        internal_pauses[c.chunk_id] = [start + m for m in pauses_rel]
        phrase_pauses[c.chunk_id] = [start + m for m in phrase_rel]

        align_json = tts_dir / f"{c.chunk_id}_alignment.json"
        if align_json.is_file():
            try:
                raw_align = CharacterAlignment.load_json(align_json)
                clean_ref_dur = ffprobe_duration(clean_wav) if clean_wav.is_file() else durations[c.chunk_id]
                align_scale = dur / max(clean_ref_dur, 1e-6)
                chunk_alignments[c.chunk_id] = raw_align.shifted_and_scaled(
                    offset_sec=0.0,
                    time_scale=align_scale,
                    max_sec=dur,
                )
            except (OSError, json.JSONDecodeError, ValueError):
                pass

        start_r = round(start, 4)
        speech_end_r = round(speech_end, 4)
        end_r = round(end, 4)

        chunk_times[c.chunk_id] = {
            "text": c.text,
            "startSec": start_r,
            "speechEndSec": speech_end_r,
            "endSec": end_r,
            "durationSec": round(dur, 4),
            "pauseSec": round(p, 4),
            "internalPausesSec": [round(x, 4) for x in internal_pauses[c.chunk_id]],
        }
        chunk_list.append(
            {
                "id": c.chunk_id,
                "text": c.text,
                "startSec": start_r,
                "speechEndSec": speech_end_r,
                "endSec": end_r,
            }
        )
        char_times[c.chunk_id] = _compute_chunk_char_times(
            c.text,
            start_r,
            dur,
            speech_end_r,
            chunk_alignments.get(c.chunk_id),
        )

        if c.chunk_id in chunk_alignments:
            chunk_times[c.chunk_id]["alignmentSource"] = chunk_alignments[c.chunk_id].source
        if tts_info and c.chunk_id in tts_info:
            if tts_info[c.chunk_id].get("provider"):
                chunk_times[c.chunk_id]["provider"] = tts_info[c.chunk_id].get("provider")
            chunk_times[c.chunk_id]["modelUsed"] = tts_info[c.chunk_id].get("modelUsed")
            chunk_times[c.chunk_id]["voice"] = tts_info[c.chunk_id].get("voice")
        cursor = end

    total_duration = round(cursor, 3)
    total_frames = int(math.ceil(total_duration * fps))

    def split_at_char(cid: str, char_idx: int, tol: float = 0.38) -> float:
        spec_c = next(x for x in chunks if x.chunk_id == cid)
        ct = chunk_times[cid]
        if cid in chunk_alignments:
            rel_t = chunk_alignments[cid].time_at_char_index(spec_c.text, char_idx)
            if rel_t is not None:
                abs_t = ct["startSec"] + rel_t
                if char_idx > 0 and spec_c.text[char_idx - 1] in SPLIT_PHRASE_PUNCT and phrase_pauses[cid]:
                    nearest = min(phrase_pauses[cid], key=lambda m: abs(m - abs_t))
                    if abs(nearest - abs_t) <= 0.14:
                        return round(nearest, 4)
                return round(abs_t, 4)
        ratio = max(0.0, min(1.0, char_idx / max(1, len(spec_c.text))))
        raw_t = ct["startSec"] + ct["durationSec"] * ratio
        if char_idx > 0 and spec_c.text[char_idx - 1] in SPLIT_PHRASE_PUNCT and phrase_pauses[cid]:
            nearest = min(phrase_pauses[cid], key=lambda m: abs(m - raw_t))
            if abs(nearest - raw_t) <= PHRASE_SNAP_TOLERANCE_SEC:
                return round(nearest, 4)
        return round(snap_to_pause(raw_t, internal_pauses[cid], tolerance=tol), 4)

    events: dict[str, Any] = {"totalDurationSec": total_duration}
    raw_shots: list[tuple[float, float, str, str]] = []
    subtitles: list[dict[str, Any]] = []

    for c_idx, c in enumerate(chunks):
        ct = chunk_times[c.chunk_id]
        chunk_shot_start = 0.0 if c_idx == 0 else ct["startSec"]
        chunk_shot_end = total_duration if c_idx == len(chunks) - 1 else ct["endSec"]

        if c.eyecatch_after:
            chunk_shot_end = eyecatches[c.chunk_id]["startSec"]

        if c.event_key:
            events[c.event_key] = round(chunk_shot_start, 4)
        if c.speech_end_event_key:
            events[c.speech_end_event_key] = ct["speechEndSec"]

        if c.splits:
            split_times: list[float] = []
            prev_t = ct["startSec"]
            for sp in c.splits:
                t_sp = max(round(prev_t + sp.min_offset_from_prev_sec, 4), split_at_char(c.chunk_id, sp.char_index))
                t_sp = min(t_sp, round(ct["speechEndSec"] - 0.15, 4))
                split_times.append(t_sp)
                if sp.event_key:
                    events[sp.event_key] = t_sp
                prev_t = t_sp

            raw_shots.append((chunk_shot_start, split_times[0], c.shot_role, c.shot_label))
            if not c.hide_subtitle and c.subtitle_line1:
                cue: dict[str, Any] = {"startSec": ct["startSec"], "endSec": split_times[0], "line1": c.subtitle_line1}
                if c.subtitle_line2:
                    cue["line2"] = c.subtitle_line2
                subtitles.append(cue)

            for sp_idx, sp in enumerate(c.splits):
                seg_start = split_times[sp_idx]
                seg_end = split_times[sp_idx + 1] if sp_idx + 1 < len(split_times) else chunk_shot_end
                raw_shots.append((seg_start, seg_end, sp.shot_role, sp.shot_label))
                if not c.hide_subtitle and sp.subtitle_line1:
                    cue_end_t = (
                        seg_end
                        if sp_idx + 1 < len(split_times)
                        else round(min(seg_end, ct["speechEndSec"] + c.subtitle_extra_tail_sec), 4)
                    )
                    cue = {"startSec": seg_start, "endSec": cue_end_t, "line1": sp.subtitle_line1}
                    if sp.subtitle_line2:
                        cue["line2"] = sp.subtitle_line2
                    subtitles.append(cue)
        else:
            raw_shots.append((chunk_shot_start, chunk_shot_end, c.shot_role, c.shot_label))
            if not c.hide_subtitle:
                cue_tail_limit = round(min(chunk_shot_end, ct["speechEndSec"] + c.subtitle_extra_tail_sec), 4)
                if c_idx == len(chunks) - 1:
                    cue_tail_limit = round(min(total_duration - 0.10, cue_tail_limit), 4)

                if c.subtitle_segments:
                    seg_starts = [
                        ct["startSec"] if seg.start_char <= 0 else split_at_char(c.chunk_id, seg.start_char)
                        for seg in c.subtitle_segments
                    ]
                    for s_i, seg in enumerate(c.subtitle_segments):
                        s_start = seg_starts[s_i]
                        s_end = seg_starts[s_i + 1] if s_i + 1 < len(seg_starts) else cue_tail_limit
                        cue = {"startSec": s_start, "endSec": s_end, "line1": seg.line1}
                        if seg.line2:
                            cue["line2"] = seg.line2
                        subtitles.append(cue)
                elif c.subtitle_line1:
                    cue = {"startSec": ct["startSec"], "endSec": cue_tail_limit, "line1": c.subtitle_line1}
                    if c.subtitle_line2:
                        cue["line2"] = c.subtitle_line2
                    subtitles.append(cue)

    shots: list[dict[str, Any]] = []
    for idx, (s_sec, e_sec, role, lbl) in enumerate(raw_shots, start=1):
        shots.append(
            {
                "shotIndex": idx,
                "startSec": round(s_sec, 4),
                "endSec": round(e_sec, 4),
                "startFrame": int(round(s_sec * fps)),
                "endFrame": int(round(e_sec * fps)),
                "narrativeRole": role,
                "label": lbl,
            }
        )
    if shots and not chunks[-1].eyecatch_after:
        shots[-1]["endFrame"] = total_frames

    image_map = {img.key: f"{public_subdir}/images/{img.filename}" for img in images}
    for si in stock_images or []:
        image_map[si.key] = f"{public_subdir}/images/{si.filename}"
    video_map: dict[str, str] = {}
    for vc in video_clips or []:
        video_map[vc.key] = f"{public_subdir}/videos/{vc.filename}"
        if vc.extract_poster:
            image_map[f"{vc.key}_poster"] = f"{public_subdir}/images/{Path(vc.filename).stem}_poster.png"

    clean_var = _normalize_audio_variant(audio_variant)
    master_filename = f"master_audio_{clean_var}.wav" if clean_var else "master_audio.wav"

    sfx_paths = {
        kind: f"{public_subdir}/sfx/{kind}.wav"
        for kind in _plan_e_sfx_kinds(spec)
    }

    return {
        "slug": str(spec["slug"]),
        "title": str(spec.get("title", spec["slug"])),
        "formatId": "planE_macro_econ",
        "fps": fps,
        "width": width,
        "height": height,
        "totalDurationSec": total_duration,
        "totalFrames": total_frames,
        "appliedTempo": round(applied_tempo, 4),
        "audioSrc": f"{public_subdir}/{master_filename}",
        "imageMap": image_map,
        "videoMap": video_map,
        "sfxMap": sfx_paths,
        "sfxVariants": {},
        "chunks": chunk_times,
        "chunkList": chunk_list,
        "eyecatches": list(eyecatches.values()),
        "charTimes": char_times,
        "assets": assets_meta or {},
        "shots": shots,
        "subtitles": subtitles,
        "events": events,
    }


def synthesize_audio_and_master(
    spec: dict[str, Any],
    chunks: list[NarrationChunkSpec],
    timeline: dict[str, Any],
    public_dir: Path,
    *,
    tts_dir: Path | None = None,
    audio_variant: str | None = None,
) -> Path:
    """ナレーション＋ダッキング済み BGM のみを 2パス loudnorm で master_audio.wav に書き出し、SFXライブラリを出力する。"""
    clean_var = _normalize_audio_variant(audio_variant)
    eff_tts_dir = tts_dir if tts_dir is not None else (public_dir / "tts")
    audio_dir = public_dir / (f"audio_parts_{clean_var}" if clean_var else "audio_parts")
    audio_dir.mkdir(parents=True, exist_ok=True)
    master_wav_path = public_dir / (f"master_audio_{clean_var}.wav" if clean_var else "master_audio.wav")

    total_sec = float(timeline["totalDurationSec"])
    ev = timeline["events"]
    chunks_map = timeline["chunks"]

    audio_cfg = spec.get("audio") or {}
    bpm = float(audio_cfg.get("bpm", 115.0))
    target_i = float(audio_cfg.get("loudnormTargetI", -14.0))
    target_tp = float(audio_cfg.get("loudnormTargetTp", -1.4))
    target_lra = float(audio_cfg.get("loudnormTargetLra", 9.0))

    # 1) ナレーショントラック結合
    narr_wav = audio_dir / "narration_track.wav"
    chunk_wav_starts = [
        (eff_tts_dir / f"{ch.chunk_id}_paced.wav", float(chunks_map[ch.chunk_id]["startSec"]))
        for ch in chunks
    ]
    assemble_narration_track(chunk_wav_starts, total_sec, narr_wav, sample_rate=SAMPLE_RATE)

    # 2) 案E専用 BGM（導入ドローン → 無音間 → 115BPM経済グルーヴ＋25msカットアウト）
    bgm_cfg = audio_cfg.get("bgm") or {}
    intro_drone_end = _resolve_time(
        ev,
        bgm_cfg.get("introDroneEndEvent", bgm_cfg.get("introDroneEndSec")),
        5.5,
        context="audio.bgm.introDroneEnd",
    )
    groove_start = _resolve_time(
        ev,
        bgm_cfg.get("grooveStartEvent", bgm_cfg.get("grooveStartSec")),
        8.5,
        context="audio.bgm.grooveStart",
    )
    cutouts: list[tuple[float, float]] = []
    for c_idx, c_item in enumerate(bgm_cfg.get("cutouts") or []):
        cs = _resolve_time(
            ev,
            c_item.get("startEvent", c_item.get("startSec")),
            0.0,
            context=f"audio.bgm.cutouts[{c_idx}].start",
        )
        ce = _resolve_time(
            ev,
            c_item.get("endEvent", c_item.get("endSec")),
            0.0,
            context=f"audio.bgm.cutouts[{c_idx}].end",
        )
        if ce > cs:
            cutouts.append((cs, ce))

    bgm_wav = audio_dir / "bgm_track.wav"
    cynical_econ_groove_bgm(
        total_sec,
        bgm_wav,
        bpm=bpm,
        intro_drone_end_sec=intro_drone_end,
        groove_start_sec=groove_start,
        cutout_ranges=cutouts,
        sample_rate=SAMPLE_RATE,
    )

    # 3) Remotion 側ビート再生用に単発 SFX ライブラリのみ出力（master_audio.wav には焼き込まない）
    _export_plan_e_sfx(spec, public_dir)

    # 4) サイドチェーンダッキング＋1パス loudnorm（最終 MP4 の2パス linear loudnorm は master_final.py が担当）
    mix_filter = (
        "[0:a]volume=1.12,asplit=2[narr_out][narr_sc];"
        "[1:a]volume=0.82[bgm_pre];"
        "[bgm_pre][narr_sc]sidechaincompress=threshold=0.024:ratio=2.8:attack=15:release=220[bgm_duck];"
        "[narr_out][bgm_duck]amix=inputs=2:normalize=0:dropout_transition=0,"
        f"atrim=0:{total_sec:.4f},"
        f"loudnorm=I={target_i}:TP={target_tp}:LRA={target_lra}[master]"
    )
    run_cmd(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(narr_wav),
            "-i",
            str(bgm_wav),
            "-filter_complex",
            mix_filter,
            "-map",
            "[master]",
            "-ar",
            str(SAMPLE_RATE),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            "-t",
            f"{total_sec:.4f}",
            str(master_wav_path),
        ]
    )
    return master_wav_path


def write_timeline_outputs(
    spec: dict[str, Any],
    timeline: dict[str, Any],
    public_dir: Path,
    ts_path: Path,
    *,
    audio_variant: str | None = None,
    export_name_override: str | None = None,
) -> Path:
    public_dir.mkdir(parents=True, exist_ok=True)
    ts_path.parent.mkdir(parents=True, exist_ok=True)

    clean_var = _normalize_audio_variant(audio_variant)
    timeline_json_path = public_dir / (f"timeline_{clean_var}.json" if clean_var else "timeline.json")
    timeline_json_path.write_text(json.dumps(timeline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    output_cfg = spec.get("output") or {}
    export_name = (export_name_override or "").strip() or str(output_cfg.get("exportName", "TIMELINE"))

    payload: dict[str, Any] = {
        "slug": timeline["slug"],
        "title": timeline["title"],
        "fps": timeline["fps"],
        "width": timeline["width"],
        "height": timeline["height"],
        "totalDurationSec": timeline["totalDurationSec"],
        "totalFrames": timeline["totalFrames"],
        "audioSrc": timeline["audioSrc"],
        "imageMap": timeline["imageMap"],
        "videoMap": timeline["videoMap"],
        "sfxMap": timeline["sfxMap"],
        "sfxVariants": timeline.get("sfxVariants", {}),
        "chunks": timeline["chunkList"],
        "eyecatches": timeline.get("eyecatches", []),
        "charTimes": timeline["charTimes"],
        "assets": timeline.get("assets") or {},
        "shots": timeline["shots"],
        "subtitles": timeline["subtitles"],
        "events": timeline["events"],
    }
    ts_content = (
        "// Auto-generated by pipeline/scripts/build_plan_e_assets.py\n"
        "// 音声実尺（ffprobe計測）先行で同期された案E（planE_macro_econ v3.0）タイムラインマニフェスト。\n\n"
        "export interface PlanETimelineChunk {\n"
        "  id: string;\n"
        "  text: string;\n"
        "  startSec: number;\n"
        "  speechEndSec: number;\n"
        "  endSec: number;\n"
        "}\n\n"
        "export interface PlanETimelineAssetMeta {\n"
        "  kind: string;\n"
        "  filename: string;\n"
        "  intent?: string;\n"
        "  sourceUrl?: string;\n"
        "  sha256?: string;\n"
        "  verified: boolean;\n"
        "}\n\n"
        "export interface PlanEShotTimeline {\n"
        "  shotIndex: number;\n"
        "  startSec: number;\n"
        "  endSec: number;\n"
        "  startFrame: number;\n"
        "  endFrame: number;\n"
        "  narrativeRole: string;\n"
        "  label: string;\n"
        "}\n\n"
        "export interface PlanESubtitleCue {\n"
        "  startSec: number;\n"
        "  endSec: number;\n"
        "  line1: string;\n"
        "  line2?: string;\n"
        "}\n\n"
        "export type PlanETimelineEvents = Record<string, number | number[]>;\n\n"
        "export interface PlanETimelineData {\n"
        "  slug: string;\n"
        "  title: string;\n"
        "  fps: number;\n"
        "  width: number;\n"
        "  height: number;\n"
        "  totalDurationSec: number;\n"
        "  totalFrames: number;\n"
        "  audioSrc: string;\n"
        "  imageMap: Record<string, string>;\n"
        "  videoMap: Record<string, string>;\n"
        "  sfxMap?: Record<string, string>;\n"
        "  sfxVariants?: Record<string, string[]>;\n"
        "  eyecatches?: { variant: 'swipe' | 'pullback' | 'slit'; startSec: number; endSec: number; resumeSec: number }[];\n"
        "  chunks: PlanETimelineChunk[];\n"
        "  charTimes: Record<string, number[]>;\n"
        "  assets?: Record<string, PlanETimelineAssetMeta>;\n"
        "  shots: PlanEShotTimeline[];\n"
        "  subtitles: PlanESubtitleCue[];\n"
        "  events: PlanETimelineEvents;\n"
        "}\n\n"
        f"export const {export_name}: PlanETimelineData = {json.dumps(payload, ensure_ascii=False, indent=2)};\n"
    )
    ts_path.write_text(ts_content, encoding="utf-8")
    print(f"[TIMELINE written] {timeline_json_path} & {ts_path}")
    return timeline_json_path


def main(argv: list[str] | None = None) -> int:
    _configure_stdio_utf8()
    parser = argparse.ArgumentParser(
        description="Build Plan E v3.0 narration, BGM (-14 LUFS), verified assets, and audio-first timeline."
    )
    parser.add_argument("--spec", type=Path, required=True, help="Path to Plan E spec JSON")
    parser.add_argument("--output-public-dir", type=Path, default=None)
    parser.add_argument("--output-ts", type=Path, default=None)
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate spec schema, legal checklist, fonts, and events with ZERO API calls and ZERO writes",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate spec, inspect cache, and simulate audio-first timeline with ZERO API calls and ZERO writes",
    )
    parser.add_argument("--strict", action="store_true", help="Exit with code 1 when warnings are present")
    parser.add_argument("--release", action="store_true", help="Require verified sha256 on all assets and strict checks")
    parser.add_argument(
        "--contact-sheet-only",
        action="store_true",
        help="Generate 3-frame contact sheet from existing local videos/images and exit",
    )
    parser.add_argument("--force-tts", action="store_true")
    parser.add_argument("--force-images", action="store_true")
    parser.add_argument("--force-videos", action="store_true")
    parser.add_argument("--skip-tts", action="store_true")
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument("--skip-stock-images", action="store_true")
    parser.add_argument("--skip-videos", action="store_true")
    parser.add_argument("--skip-audio", action="store_true", help="マスター音声の生成を省略し、SFX は書き出す")
    parser.add_argument(
        "--tts-provider",
        choices=["auto", "gemini", "elevenlabs"],
        default=None,
        help="Override TTS provider (auto reads configs/stack.yaml)",
    )
    parser.add_argument("--tts-model", type=str, default=None)
    parser.add_argument("--tts-voice", type=str, default=None)
    parser.add_argument("--tts-language", type=str, default=None)
    parser.add_argument("--tts-interval-sec", type=float, default=None)
    parser.add_argument(
        "--audio-variant",
        type=str,
        default=None,
        help="Isolate tts/audio_parts/master_audio/timeline JSON outputs under a variant suffix (e.g. eleven_v4)",
    )
    parser.add_argument(
        "--export-name",
        type=str,
        default=None,
        help="Override exported TypeScript timeline constant name (e.g. TIMELINE_ELEVEN_V4)",
    )
    parser.add_argument("--target-sec", type=float, default=None)
    args = parser.parse_args(argv)

    load_dotenv(REPO_ROOT)
    if not args.spec.is_file():
        print(f"[SPEC error] Spec file not found: {args.spec}", file=sys.stderr)
        return 2
    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    if not isinstance(spec, dict):
        print("[SPEC error] Spec root must be a JSON object.", file=sys.stderr)
        return 2

    public_dir, ts_path, public_subdir = resolve_output_paths(
        spec if "slug" in spec else {"slug": "invalid"},
        args.output_public_dir,
        args.output_ts,
    )

    if args.contact_sheet_only:
        video_clips = parse_video_clips(spec.get("videoClips") or [])
        stock_images = parse_stock_images(spec.get("stockImages") or [])
        images = parse_images(spec.get("images") or [])
        sheet_info = generate_asset_contact_sheet(public_dir, video_clips, stock_images, images)
        print(json.dumps({"mode": "contact_sheet_only", **sheet_info}, ensure_ascii=False, indent=2))
        return 0

    spec_errors, spec_warnings = validate_plan_e_spec(
        spec,
        release=args.release,
        public_dir=public_dir,
    )
    for w in spec_warnings:
        print(f"[SPEC warn] {w}", file=sys.stderr)
    for e in spec_errors:
        print(f"[SPEC error] {e}", file=sys.stderr)

    strict_mode = args.strict or args.release
    if spec_errors:
        if args.validate_only or args.dry_run:
            report = {
                "mode": "validate_only" if args.validate_only else "dry_run",
                "passed": False,
                "slug": spec.get("slug"),
                "formatId": spec.get("formatId"),
                "errors": spec_errors,
                "warnings": spec_warnings,
            }
            print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2

    if strict_mode and spec_warnings and args.validate_only:
        report = {
            "mode": "validate_only",
            "passed": False,
            "slug": spec.get("slug"),
            "formatId": spec.get("formatId"),
            "errors": [],
            "warnings": spec_warnings,
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    if args.target_sec is not None:
        spec.setdefault("pacing", {})["targetTotalSec"] = args.target_sec

    chunks = parse_chunks(spec["chunks"])
    images = parse_images(spec.get("images") or [])
    video_clips = parse_video_clips(spec.get("videoClips") or [])
    stock_images = parse_stock_images(spec.get("stockImages") or [])

    if args.validate_only:
        report = {
            "mode": "validate_only",
            "passed": True,
            "slug": spec["slug"],
            "formatId": spec["formatId"],
            "chunkCount": len(chunks),
            "imageCount": len(images),
            "stockImageCount": len(stock_images),
            "videoCount": len(video_clips),
            "errors": [],
            "warnings": spec_warnings,
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    tts_cfg = spec.get("tts") or {}
    resolved_tts = resolve_tts_config(
        tts_cfg,
        cli_provider=args.tts_provider,
        cli_model=args.tts_model,
        cli_voice=args.tts_voice,
        cli_language=args.tts_language,
        default_provider="elevenlabs",
        repo_root=REPO_ROOT,
    )
    clean_variant = _normalize_audio_variant(args.audio_variant)
    tts_dir = resolve_tts_cache_dir(public_dir, resolved_tts.provider, variant=clean_variant)
    images_dir = public_dir / "images"
    videos_dir = public_dir / "videos"

    if args.dry_run:
        print("=== [DRY-RUN] Plan E v3.0 Validation & Audio-First Simulation (0 API calls, 0 writes) ===")
        durations, tts_status = inspect_tts_for_dry_run(
            chunks,
            tts_dir,
            force=args.force_tts,
            provider=resolved_tts.provider,
        )
        img_status = inspect_images_for_dry_run(images, images_dir)
        stock_status = inspect_stock_images_for_dry_run(stock_images, images_dir, public_dir=public_dir)
        vid_status = inspect_videos_for_dry_run(video_clips, videos_dir, images_dir, public_dir=public_dir)
        assets_meta, _ = verify_assets_manifest(spec, public_dir)
        timeline = build_timeline(
            spec,
            chunks,
            durations,
            tts_dir,
            public_subdir,
            images,
            dry_run=True,
            video_clips=video_clips,
            stock_images=stock_images,
            audio_variant=clean_variant,
            assets_meta=assets_meta,
        )
        passed_flag = not (strict_mode and spec_warnings)
        summary = {
            "mode": "dry_run",
            "passed": passed_flag,
            "slug": spec["slug"],
            "formatId": spec["formatId"],
            "ttsProvider": resolved_tts.provider,
            "ttsModels": list(resolved_tts.models),
            "ttsVoices": list(resolved_tts.voices),
            "ttsLanguage": resolved_tts.language_code,
            "audioVariant": clean_variant,
            "outputPublicDir": str(public_dir),
            "outputTimelineTs": str(ts_path),
            "chunkCount": len(chunks),
            "shotCount": len(timeline["shots"]),
            "subtitleCount": len(timeline["subtitles"]),
            "imageCount": len(images),
            "stockImageCount": len(stock_images),
            "videoCount": len(video_clips),
            "videoMap": timeline["videoMap"],
            "sfxMap": timeline["sfxMap"],
            "sfxVariants": timeline["sfxVariants"],
            "estimatedTotalSec": timeline["totalDurationSec"],
            "estimatedTotalFrames": timeline["totalFrames"],
            "appliedTempo": timeline["appliedTempo"],
            "ttsCacheStatus": tts_status,
            "imageCacheStatus": img_status,
            "stockImageCacheStatus": stock_status,
            "videoCacheStatus": vid_status,
            "events": timeline["events"],
            "warnings": spec_warnings,
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 1 if (strict_mode and spec_warnings) else 0

    print(
        f"=== [1/5] Preparing Japanese Narration TTS "
        f"(provider={resolved_tts.provider}, models={list(resolved_tts.models)}) ==="
    )
    durations, tts_info = generate_tts_chunks(
        chunks=chunks,
        tts_dir=tts_dir,
        models=resolved_tts.models,
        voices=resolved_tts.voices,
        temperature=resolved_tts.temperature,
        force=args.force_tts,
        skip=args.skip_tts,
        request_interval_sec=args.tts_interval_sec,
        provider=resolved_tts.provider,
        language_code=resolved_tts.language_code,
        voice_settings=resolved_tts.voice_settings,
        output_formats=resolved_tts.output_formats,
        use_timestamps=resolved_tts.use_timestamps,
    )

    asset_manifest = _load_asset_manifest(public_dir)
    print(f"=== [2/5] Fetching & Normalizing {len(video_clips)} Video B-Roll Clips ===")
    video_paths, poster_paths = fetch_and_normalize_video_clips(
        video_clips,
        videos_dir,
        images_dir,
        force=args.force_videos,
        skip=args.skip_videos,
        asset_manifest=asset_manifest,
    )

    print(f"=== [3/5] Resolving {len(images)} Local Images & {len(stock_images)} Stock Images (No AI Image Gen) ===")
    img_paths = resolve_local_images(
        images=images,
        images_dir=images_dir,
        skip=args.skip_images,
        asset_manifest=asset_manifest,
    )
    stock_paths = fetch_stock_images(
        stock_images,
        images_dir,
        force=args.force_images,
        skip=args.skip_stock_images,
        asset_manifest=asset_manifest,
    )
    if asset_manifest:
        _save_asset_manifest(public_dir, asset_manifest)

    contact_sheet_info = generate_asset_contact_sheet(public_dir, video_clips, stock_images, images)
    assets_meta, post_asset_issues = verify_assets_manifest(spec, public_dir)
    if args.release and post_asset_issues:
        for iss in post_asset_issues:
            print(f"[RELEASE error] {iss}", file=sys.stderr)
        return 2

    print("=== [4/5] Building Audio-First Timeline (chunks + charTimes + assets) ===")
    timeline = build_timeline(
        spec,
        chunks,
        durations,
        tts_dir,
        public_subdir,
        images,
        dry_run=False,
        tts_info=tts_info,
        video_clips=video_clips,
        stock_images=stock_images,
        audio_variant=clean_variant,
        assets_meta=assets_meta,
    )
    master_name = f"master_audio_{clean_variant}.wav" if clean_variant else "master_audio.wav"
    master_wav: Path | None = public_dir / master_name
    if args.skip_audio:
        _export_plan_e_sfx(spec, public_dir)
    else:
        print("=== [5/5] Synthesizing Plan E Groove BGM + 2-Pass -14.0 LUFS Mastering + SFX Library ===")
        master_wav = synthesize_audio_and_master(
            spec,
            chunks,
            timeline,
            public_dir,
            tts_dir=tts_dir,
            audio_variant=clean_variant,
        )
    timeline_json_path = write_timeline_outputs(
        spec,
        timeline,
        public_dir,
        ts_path,
        audio_variant=clean_variant,
        export_name_override=args.export_name,
    )

    summary = {
        "slug": spec["slug"],
        "formatId": "planE_macro_econ",
        "ttsProvider": resolved_tts.provider,
        "audioVariant": clean_variant,
        "masterAudio": str(master_wav) if master_wav and master_wav.is_file() else None,
        "timelineJson": str(timeline_json_path),
        "timelineTs": str(ts_path),
        "contactSheet": contact_sheet_info.get("videoContactSheet"),
        "totalDurationSec": timeline["totalDurationSec"],
        "totalFrames": timeline["totalFrames"],
        "shotCount": len(timeline["shots"]),
        "subtitleCount": len(timeline["subtitles"]),
        "imageCount": len(img_paths),
        "stockImageCount": len(stock_paths),
        "videoCount": len(video_paths),
        "posterCount": len(poster_paths),
        "assetIssues": post_asset_issues,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if (strict_mode and (spec_warnings or post_asset_issues)) else 0


if __name__ == "__main__":
    raise SystemExit(main())
