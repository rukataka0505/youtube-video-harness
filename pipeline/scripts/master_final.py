"""完成 MP4 の音声のみを -14.0 LUFS / -1.4 dBTP へ 2パス loudnorm 正規化する最終マスタリング CLI。

映像ストリームは `-c:v copy` で無再エンコードのまま通し、音声のみを Remotion 合成済みミックス（ナレーション＋BGM＋SFX）から
YouTube 最適音圧（-14.0 ± 0.5 LUFS、True Peak <= -1.0 dBTP）へ仕上げて検証する。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def _configure_stdio_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _run_ffmpeg(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr[-1000:]}")
    return proc


def measure_loudness(mp4_path: Path, *, target_i: float = -14.0, target_tp: float = -1.4, target_lra: float = 9.0) -> dict[str, Any]:
    """ffmpeg loudnorm pass1 計測 JSON を返す。"""
    proc = _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(mp4_path),
            "-vn",
            "-af",
            f"loudnorm=I={target_i}:TP={target_tp}:LRA={target_lra}:print_format=json",
            "-f",
            "null",
            "-",
        ]
    )
    match = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", proc.stderr, re.DOTALL)
    if not match:
        raise RuntimeError(f"Failed to parse loudnorm measurement JSON from ffmpeg:\n{proc.stderr[-800:]}")
    return json.loads(match.group(0))


def _has_audio_stream(mp4_path: Path) -> bool:
    proc = _run_ffmpeg(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            str(mp4_path),
        ]
    )
    return bool(proc.stdout.strip())


def master_final_mp4(
    input_path: Path,
    output_path: Path,
    *,
    target_i: float = -14.0,
    target_tp: float = -1.4,
    target_lra: float = 9.0,
    audio_bitrate: str = "256k",
    sample_rate: int = 48000,
    verify: bool = True,
) -> dict[str, Any]:
    """MP4 映像を copy で保ったまま音声を 2パス loudnorm 正規化し、最終計測結果を返す。"""
    if not input_path.is_file():
        raise FileNotFoundError(f"Input MP4 not found: {input_path}")
    if not _has_audio_stream(input_path):
        raise ValueError(f"Input MP4 has no audio stream: {input_path}")

    stats = measure_loudness(
        input_path,
        target_i=target_i,
        target_tp=target_tp,
        target_lra=target_lra,
    )

    loudnorm_p2 = (
        f"loudnorm=I={target_i}:TP={target_tp}:LRA={target_lra}:linear=true:"
        f"measured_I={stats['input_i']}:"
        f"measured_TP={stats['input_tp']}:"
        f"measured_LRA={stats['input_lra']}:"
        f"measured_thresh={stats['input_thresh']}:"
        f"offset={stats['target_offset']}"
    )

    same_file = input_path.resolve() == output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_out = Path(tmp_dir) / "mastered_tmp.mp4" if same_file else output_path
        _run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(input_path),
                "-c:v",
                "copy",
                "-af",
                loudnorm_p2,
                "-ar",
                str(sample_rate),
                "-ac",
                "2",
                "-c:a",
                "aac",
                "-b:a",
                audio_bitrate,
                "-movflags",
                "+faststart",
                str(tmp_out),
            ]
        )
        if same_file:
            shutil.move(str(tmp_out), str(output_path))

    result: dict[str, Any] = {
        "input": str(input_path),
        "output": str(output_path),
        "videoCodec": "copy",
        "targetI": target_i,
        "targetTp": target_tp,
        "inputI": float(stats["input_i"]),
        "inputTp": float(stats["input_tp"]),
        "passed": True,
    }

    if verify:
        after = measure_loudness(
            output_path,
            target_i=target_i,
            target_tp=target_tp,
            target_lra=target_lra,
        )
        out_i = float(after["input_i"])
        out_tp = float(after["input_tp"])
        out_lra = float(after["input_lra"])
        ok = (abs(out_i - target_i) <= 0.5) and (out_tp <= -1.0)
        result.update(
            {
                "outputI": out_i,
                "outputTp": out_tp,
                "outputLra": out_lra,
                "passed": ok,
            }
        )

    return result


def main(argv: list[str] | None = None) -> int:
    _configure_stdio_utf8()
    parser = argparse.ArgumentParser(
        description="Apply 2-pass loudnorm (-14 LUFS / -1.4 dBTP) to final rendered MP4 with -c:v copy."
    )
    parser.add_argument("--input", type=Path, required=True, help="Input rendered MP4 path")
    parser.add_argument("--output", type=Path, default=None, help="Output mastered MP4 path")
    parser.add_argument("--in-place", action="store_true", help="Overwrite input MP4 atomically")
    parser.add_argument("--target-i", type=float, default=-14.0)
    parser.add_argument("--target-tp", type=float, default=-1.4)
    parser.add_argument("--target-lra", type=float, default=9.0)
    parser.add_argument("--audio-bitrate", type=str, default="256k")
    parser.add_argument("--no-verify", action="store_true")
    args = parser.parse_args(argv)

    if args.output is None and not args.in_place:
        print("Specify --output <path> or --in-place.", file=sys.stderr)
        return 2

    out_path = args.input if args.in_place else args.output
    assert out_path is not None

    try:
        report = master_final_mp4(
            args.input,
            out_path,
            target_i=args.target_i,
            target_tp=args.target_tp,
            target_lra=args.target_lra,
            audio_bitrate=args.audio_bitrate,
            verify=not args.no_verify,
        )
    except Exception as exc:
        print(f"[master_final error] {exc}", file=sys.stderr)
        return 2

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("passed", True) else 2


if __name__ == "__main__":
    raise SystemExit(main())
