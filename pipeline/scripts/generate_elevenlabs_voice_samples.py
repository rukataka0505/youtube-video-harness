"""ElevenLabs eleven_v4（language_code="ja"）音声サンプル比較セット生成＆検証スクリプト。

固定テキスト（c07_title）を男声10種・女声3種の計13ボイスで生成し、
48kHz mono PCM WAV として整理・音響検証・一覧出力（manifest.json / README.md）を行う。
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import struct
import subprocess
import sys
import wave
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_SRC = REPO_ROOT / "pipeline" / "src"
if str(PIPELINE_SRC) not in sys.path:
    sys.path.insert(0, str(PIPELINE_SRC))

from yt_engine.audio.tts_elevenlabs import (
    ElevenLabsError,
    ElevenLabsTTSClient,
    ElevenLabsVoiceInfo,
    redact_elevenlabs_secret,
)
from yt_engine.audio.tts_gemini import (
    NarrationChunk,
    _compute_wav_rms_db_curve,
)

MODEL_ID = "eleven_v4"
LANGUAGE_CODE = "ja"
SAMPLE_TEXT = "タイトルでお察しのとおり、さきのばしぐせを直すのは、実はめちゃくちゃ簡単です。"
TEXT_SOURCE = "episodes/productions/ep01-procrastination-opus/03_script_reading.md (c07_title)"
DEFAULT_OUT_ROOT = REPO_ROOT / "episodes" / "voice_samples" / "eleven_v4"


@dataclass(frozen=True)
class VoiceSampleSpec:
    """聴き比べ対象ボイスの仕様定義。"""

    gender: str
    order: int
    filename: str
    voice_id: str
    expected_name: str
    source_type: str
    feature_summary: str

    @property
    def chunk_id(self) -> str:
        return f"{self.gender}_{Path(self.filename).stem}"


VOICE_SPECS: tuple[VoiceSampleSpec, ...] = (
    # 男声（10種）
    VoiceSampleSpec(
        gender="male",
        order=1,
        filename="01_koji_ja_narrator.wav",
        voice_id="W8wofKLOWnsM57L8hIx2",
        expected_name="Koji - Japanese Narrator",
        source_type="professional / ja",
        feature_summary="中年・温かく信頼感のある王道日本語ナレーター（解説・企業向け）",
    ),
    VoiceSampleSpec(
        gender="male",
        order=2,
        filename="02_hinata_jp.wav",
        voice_id="j210dv0vWm7fCknyQpbA",
        expected_name="Hinata JP",
        source_type="professional / ja",
        feature_summary="若年・クリアで落ち着いた日本語男性（ニュース・軽快解説向け）",
    ),
    VoiceSampleSpec(
        gender="male",
        order=3,
        filename="03_daniel_broadcaster.wav",
        voice_id="onwK4e9ZLuTAKqWW03F9",
        expected_name="Daniel - Steady Broadcaster",
        source_type="premade / en→ja",
        feature_summary="中年・知的でフォーマルな報道・教育アナウンサー調",
    ),
    VoiceSampleSpec(
        gender="male",
        order=4,
        filename="04_george_storyteller.wav",
        voice_id="JBFqnCBsd6RMkjVDRZzb",
        expected_name="George - Warm, Captivating Storyteller",
        source_type="premade / en→ja",
        feature_summary="中年・重厚で温かみのあるドキュメンタリー語り部調",
    ),
    VoiceSampleSpec(
        gender="male",
        order=5,
        filename="05_brian_deep.wav",
        voice_id="nPczCjzI2devNBz1zQrb",
        expected_name="Brian - Deep, Resonant and Comforting",
        source_type="premade / en→ja",
        feature_summary="中年・深く響く低音・安心感のある落ち着いたナレーション",
    ),
    VoiceSampleSpec(
        gender="male",
        order=6,
        filename="06_eric_smooth.wav",
        voice_id="cjVigY5qzO86Huf0OWal",
        expected_name="Eric - Smooth, Trustworthy",
        source_type="premade / en→ja",
        feature_summary="40代・滑らかなテノール・知的かつ親しみやすい語り",
    ),
    VoiceSampleSpec(
        gender="male",
        order=7,
        filename="07_adam_dominant.wav",
        voice_id="pNInz6obpgDQGcFmaJgB",
        expected_name="Adam - Dominant, Firm",
        source_type="premade / en→ja",
        feature_summary="中年・通りが良く力強い・断定感とフック重視のSNS定番調",
    ),
    VoiceSampleSpec(
        gender="male",
        order=8,
        filename="08_liam_energetic.wav",
        voice_id="TX3LPaxmHKxFdv7VOQHJ",
        expected_name="Liam - Energetic, Social Media Creator",
        source_type="premade / en→ja",
        feature_summary="若年・軽快でエネルギッシュ・テンポ重視のYouTube/SNS調",
    ),
    VoiceSampleSpec(
        gender="male",
        order=9,
        filename="09_will_relaxed.wav",
        voice_id="bIHbv24MWmeRgasZH58o",
        expected_name="Will - Relaxed Optimist",
        source_type="premade / en→ja",
        feature_summary="若年・肩の力が抜けた気さくな語りかけ・脱力会話調",
    ),
    VoiceSampleSpec(
        gender="male",
        order=10,
        filename="10_bill_wise.wav",
        voice_id="pqHfZKP75CvOlQylNhV4",
        expected_name="Bill - Wise, Mature, Balanced",
        source_type="premade / en→ja",
        feature_summary="年配・渋みと貫禄のある落ち着いた老練な語り",
    ),
    # 女声（3種）
    VoiceSampleSpec(
        gender="female",
        order=1,
        filename="01_konoha_jp.wav",
        voice_id="T7yYq3WpB94yAuOXraRi",
        expected_name="Konoha JP",
        source_type="professional / ja",
        feature_summary="中年・透明感と自然なリズム・知的で落ち着いた日本語中音域",
    ),
    VoiceSampleSpec(
        gender="female",
        order=2,
        filename="02_matilda_professional.wav",
        voice_id="XrExE9yKIg1WjnnlVkGX",
        expected_name="Matilda - Knowledgable, Professional",
        source_type="premade / en→ja",
        feature_summary="中年・心地よい低めアルト・知的でキレのある解説者調",
    ),
    VoiceSampleSpec(
        gender="female",
        order=3,
        filename="03_jessica_bright.wav",
        voice_id="cgSgspJ2msm6clMCkdW9",
        expected_name="Jessica - Playful, Bright, Warm",
        source_type="premade / en→ja",
        feature_summary="若年・明るく親しみやすい・軽快な会話調",
    ),
)


def _measure_pcm_levels(wav_path: Path) -> tuple[float, float]:
    """16bit PCM WAV のピーク dBFS と全体 RMS dBFS を計測する。"""
    with wave.open(str(wav_path), "rb") as wf:
        sampwidth = wf.getsampwidth()
        nframes = wf.getnframes()
        raw = wf.readframes(nframes)

    if sampwidth != 2 or nframes <= 0:
        raise ValueError(f"Unsupported WAV format or empty frames: sampwidth={sampwidth}, nframes={nframes}")

    total_samples = len(raw) // 2
    samples = struct.unpack(f"<{total_samples}h", raw)
    peak_abs = max(abs(s) for s in samples)
    sum_sq = sum(float(s) * float(s) for s in samples)
    rms = math.sqrt(sum_sq / total_samples) if total_samples > 0 else 0.0

    peak_dbfs = 20.0 * math.log10(peak_abs / 32768.0) if peak_abs > 0 else -120.0
    rms_dbfs = 20.0 * math.log10(rms / 32768.0) if rms > 0 else -120.0
    return peak_dbfs, rms_dbfs


def verify_sample_wav(wav_path: Path) -> dict[str, Any]:
    """最終サンプル WAV の形式・デコード健全性・音量/非無音基準を検証する。"""
    if not wav_path.is_file():
        raise FileNotFoundError(f"Missing output WAV: {wav_path}")

    file_size = wav_path.stat().st_size
    if file_size <= 4000:
        raise ValueError(f"WAV size too small ({file_size} bytes): {wav_path}")

    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,sample_rate,channels",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(wav_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    probe_data = json.loads(probe.stdout)
    streams = probe_data.get("streams") or []
    if not streams:
        raise ValueError(f"No audio stream found in {wav_path}")

    stream = streams[0]
    codec_name = str(stream.get("codec_name") or "")
    sample_rate = str(stream.get("sample_rate") or "")
    channels = int(stream.get("channels") or 0)
    duration_sec = float((probe_data.get("format") or {}).get("duration") or 0.0)

    if codec_name != "pcm_s16le":
        raise ValueError(f"Unexpected codec {codec_name!r} in {wav_path}")
    if sample_rate != "48000":
        raise ValueError(f"Unexpected sample_rate {sample_rate!r} in {wav_path}")
    if channels != 1:
        raise ValueError(f"Unexpected channels {channels!r} in {wav_path}")
    if not (1.8 <= duration_sec <= 12.0):
        raise ValueError(f"Abnormal duration {duration_sec:.3f}s (expected 1.8..12.0s) in {wav_path}")

    decode = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(wav_path), "-f", "null", "-"],
        capture_output=True,
        text=True,
        check=False,
    )
    if decode.returncode != 0 or decode.stderr.strip():
        raise ValueError(f"ffmpeg decode error in {wav_path}: {decode.stderr.strip()}")

    peak_dbfs, rms_dbfs = _measure_pcm_levels(wav_path)
    if peak_dbfs <= -25.0:
        raise ValueError(f"Peak level too low ({peak_dbfs:.2f} dBFS) in {wav_path}")
    if not (-40.0 <= rms_dbfs <= -3.0):
        raise ValueError(f"RMS level out of range ({rms_dbfs:.2f} dBFS) in {wav_path}")

    curve = _compute_wav_rms_db_curve(wav_path, frame_ms=10.0)
    if curve is None:
        raise ValueError(f"Failed to compute RMS frame curve for {wav_path}")
    _times, dbs, _c_dur, _dt = curve
    active_ratio = sum(1 for db in dbs if db > -40.0) / max(1, len(dbs))
    if active_ratio < 0.45:
        raise ValueError(f"Active speech frame ratio too low ({active_ratio:.3f}) in {wav_path}")

    return {
        "file_size_bytes": file_size,
        "codec": codec_name,
        "sample_rate_hz": int(sample_rate),
        "channels": channels,
        "duration_sec": round(duration_sec, 4),
        "peak_dbfs": round(peak_dbfs, 2),
        "rms_dbfs": round(rms_dbfs, 2),
        "active_frame_ratio": round(active_ratio, 4),
        "decode_ok": True,
        "passed": True,
    }


def validate_account_voices(voices: list[ElevenLabsVoiceInfo]) -> dict[str, ElevenLabsVoiceInfo]:
    """アカウント利用可能ボイスに選定13件がすべて含まれることを検証し、IDマップを返す。"""
    by_id = {v.voice_id: v for v in voices}
    missing = [spec for spec in VOICE_SPECS if spec.voice_id not in by_id]
    if missing:
        missing_str = ", ".join(f"{s.expected_name} ({s.voice_id})" for s in missing)
        raise ElevenLabsError(f"Selected voice(s) not found in account /v1/voices: {missing_str}")
    return by_id


def write_readme(out_root: Path, entries: list[dict[str, Any]]) -> Path:
    """男声・女声ごとに整理した聴き比べ一覧 README.md を書き出す。"""
    male_rows = [e for e in entries if e["gender"] == "male"]
    female_rows = [e for e in entries if e["gender"] == "female"]

    lines: list[str] = [
        "# ElevenLabs `eleven_v4` (`language_code=\"ja\"`) ボイス比較サンプル一覧",
        "",
        f"- **モデル:** `{MODEL_ID}` (`language_code=\"{LANGUAGE_CODE}\"`)",
        f"- **フォーマット:** 48kHz / mono / 16bit PCM WAV（非破壊前後無音トリム済み）",
        f"- **読み上げテキスト（固定・{len(SAMPLE_TEXT)}文字）:** 「{SAMPLE_TEXT}」",
        f"- **テキスト出典:** `{TEXT_SOURCE}`",
        f"- **対象ボイス数:** 計{len(entries)}種（男声{len(male_rows)}種・女声{len(female_rows)}種）",
        "",
        "## 男声（10種）",
        "",
        "| # | ボイス名 | `voice_id` | 種別 / 元言語 | 特徴 | 尺 (秒) | RMS / Peak (dBFS) | ファイルパス |",
        "| :-: | :--- | :--- | :--- | :--- | --: | --: | :--- |",
    ]
    for e in male_rows:
        v = e["verification"]
        lines.append(
            f"| {e['order']} | {e['voice_name']} | `{e['voice_id']}` | {e['source_type']} | "
            f"{e['feature_summary']} | {v['duration_sec']:.2f}s | {v['rms_dbfs']:.1f} / {v['peak_dbfs']:.1f} | "
            f"`{e['file_path']}` |"
        )

    lines.extend(
        [
            "",
            "## 女声（3種）",
            "",
            "| # | ボイス名 | `voice_id` | 種別 / 元言語 | 特徴 | 尺 (秒) | RMS / Peak (dBFS) | ファイルパス |",
            "| :-: | :--- | :--- | :--- | :--- | --: | --: | :--- |",
        ]
    )
    for e in female_rows:
        v = e["verification"]
        lines.append(
            f"| {e['order']} | {e['voice_name']} | `{e['voice_id']}` | {e['source_type']} | "
            f"{e['feature_summary']} | {v['duration_sec']:.2f}s | {v['rms_dbfs']:.1f} / {v['peak_dbfs']:.1f} | "
            f"`{e['file_path']}` |"
        )

    lines.append("")
    readme_path = out_root / "README.md"
    readme_path.write_text("\n".join(lines), encoding="utf-8")
    return readme_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate and verify ElevenLabs eleven_v4 (ja) voice comparison samples."
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_ROOT,
        help="Output root directory (default: episodes/voice_samples/eleven_v4)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only check /v1/voices availability and print generation plan without calling TTS.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate samples even if cached raw files exist in _work.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    out_root = args.out_dir.resolve()

    client = ElevenLabsTTSClient(
        repo_root=REPO_ROOT,
        models=(MODEL_ID,),
        language_code=LANGUAGE_CODE,
        attempts_per_model=1,
        max_retries=3,
        use_timestamps=True,
    )

    secret_for_redaction: str | None = None
    try:
        secret_for_redaction = client._ensure_api_key()
        voices = client.list_voices(refresh=True)
        voice_map = validate_account_voices(voices)

        male_count = sum(1 for s in VOICE_SPECS if s.gender == "male")
        female_count = sum(1 for s in VOICE_SPECS if s.gender == "female")
        print(
            f"[PLAN] model={MODEL_ID} language_code={LANGUAGE_CODE} "
            f"text_len={len(SAMPLE_TEXT)} voices={len(VOICE_SPECS)} (male={male_count}, female={female_count})"
        )
        print(f"[PLAN] out_root={out_root}")

        if args.dry_run:
            for spec in VOICE_SPECS:
                info = voice_map[spec.voice_id]
                target = out_root / spec.gender / spec.filename
                print(
                    f"[DRY-RUN] [{spec.gender}:{spec.order:02d}] {info.name} ({spec.voice_id}) "
                    f"category={info.category} labels={info.labels} -> {target}"
                )
            return 0

        work_dir = out_root / "_work"
        work_dir.mkdir(parents=True, exist_ok=True)
        (out_root / "male").mkdir(parents=True, exist_ok=True)
        (out_root / "female").mkdir(parents=True, exist_ok=True)

        entries: list[dict[str, Any]] = []
        for spec in VOICE_SPECS:
            info = voice_map[spec.voice_id]
            chunk = NarrationChunk(
                chunk_id=spec.chunk_id,
                text=SAMPLE_TEXT,
                pause_after_sec=0.0,
                voice_name=spec.voice_id,
            )
            res = client.synthesize_chunk(chunk, work_dir, force=args.force)
            if not res.cached and res.model_used != MODEL_ID:
                raise ElevenLabsError(
                    f"Unexpected model_used={res.model_used!r} for {spec.voice_id} (expected {MODEL_ID!r})"
                )

            dest_wav = (out_root / spec.gender / spec.filename).resolve()
            shutil.copy2(res.clean_wav, dest_wav)
            metrics = verify_sample_wav(dest_wav)

            print(
                f"[OK] [{spec.gender}:{spec.order:02d}] {info.name} ({spec.voice_id}) "
                f"model={res.model_used} dur={metrics['duration_sec']:.2f}s "
                f"rms={metrics['rms_dbfs']:.1f}dBFS peak={metrics['peak_dbfs']:.1f}dBFS "
                f"active={metrics['active_frame_ratio']:.2f} -> {dest_wav}"
            )

            entries.append(
                {
                    "gender": spec.gender,
                    "order": spec.order,
                    "voice_name": info.name,
                    "voice_id": spec.voice_id,
                    "category": info.category,
                    "source_type": spec.source_type,
                    "labels": info.labels,
                    "feature_summary": spec.feature_summary,
                    "model_id": MODEL_ID,
                    "model_used": res.model_used,
                    "language_code": LANGUAGE_CODE,
                    "alignment_obtained": res.alignment is not None,
                    "file_path": str(dest_wav),
                    "relative_path": f"{spec.gender}/{spec.filename}",
                    "verification": metrics,
                }
            )

        manifest = {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "model_id": MODEL_ID,
            "language_code": LANGUAGE_CODE,
            "text": SAMPLE_TEXT,
            "text_length": len(SAMPLE_TEXT),
            "text_source": TEXT_SOURCE,
            "counts": {
                "total": len(entries),
                "male": male_count,
                "female": female_count,
            },
            "samples": entries,
        }
        manifest_path = (out_root / "manifest.json").resolve()
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        readme_path = write_readme(out_root, entries).resolve()

        shutil.rmtree(work_dir, ignore_errors=False)
        print(f"[DONE] manifest={manifest_path}")
        print(f"[DONE] readme={readme_path}")
        print(f"[DONE] All {len(entries)} samples generated and verified.")
        return 0
    except Exception as exc:
        safe_err = redact_elevenlabs_secret(str(exc), secret_for_redaction)
        print(f"[ERROR] {type(exc).__name__}: {safe_err}", file=sys.stderr)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
