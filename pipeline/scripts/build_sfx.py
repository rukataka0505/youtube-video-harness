"""標準 20 種合成 SFX の一括書き出し ＆ エピソード固有カスタム合成 SFX 生成 CLI。

使用例:
  1) 標準 20 種を studio/public/sfx/<kind>.wav へ一括書き出し（立ち上がり 0ms・統一音圧）:
     .\\pipeline\\.venv\\Scripts\\python.exe pipeline/scripts/build_sfx.py export-standard --force

  2) エピソード固有カスタム SFX をコマンド1発で生成・配置:
     .\\pipeline\\.venv\\Scripts\\python.exe pipeline/scripts/build_sfx.py custom `
       --slug airline-mileage-bank --name jet_bank_slam --duration 0.65 `
       --layer "impact_thud@0.0:1.0" --layer "price_ping@0.04:0.75" --sweep "420:90:0.28:0.0:0.45:sine"

  3) レシピ JSON からカスタム SFX を生成:
     .\\pipeline\\.venv\\Scripts\\python.exe pipeline/scripts/build_sfx.py custom `
       --slug my-episode --name hook_drop --spec-json recipe.json
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
_SRC_DIR = str(REPO_ROOT / "pipeline" / "src")
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from yt_engine.audio.sfx_synth import (  # noqa: E402
    SAMPLE_RATE,
    STANDARD_SFX_KINDS,
    STUDIO_PUBLIC_DIR,
    STUDIO_PUBLIC_SFX_DIR,
    SfxEvent,
    StereoBuffer,
    add_noise_burst,
    add_tone_sweep,
    export_episode_custom_sfx,
    export_sfx_library,
    measure_sfx_wav,
    render_custom_sfx,
)


def _configure_stdio_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _parse_layer_expr(expr: str) -> SfxEvent:
    """`kind@offset[:gain[:pan[:dur]]]` 形式を SfxEvent へ変換する。"""
    if "@" in expr:
        kind_part, rest = expr.split("@", 1)
        parts = rest.split(":")
    else:
        kind_part = expr
        parts = ["0.0"]
    kind = kind_part.strip()
    offset = float(parts[0]) if len(parts) >= 1 and parts[0] != "" else 0.0
    gain = float(parts[1]) if len(parts) >= 2 and parts[1] != "" else None
    pan = float(parts[2]) if len(parts) >= 3 and parts[2] != "" else 0.0
    dur = float(parts[3]) if len(parts) >= 4 and parts[3] != "" else None
    return SfxEvent(kind=kind, time_sec=offset, gain=gain, pan=pan, duration_sec=dur)


def _parse_sweep_expr(expr: str) -> dict[str, Any]:
    """`f0:f1:dur[:offset[:gain[:waveform[:decay]]]]` 形式を辞書へ変換する。"""
    parts = expr.split(":")
    if len(parts) < 3:
        raise ValueError(f"--sweep expects 'f0:f1:dur[:offset[:gain[:waveform[:decay]]]]', got: {expr!r}")
    return {
        "f0": float(parts[0]),
        "f1": float(parts[1]),
        "durationSec": float(parts[2]),
        "offsetSec": float(parts[3]) if len(parts) >= 4 and parts[3] != "" else 0.0,
        "gain": float(parts[4]) if len(parts) >= 5 and parts[4] != "" else 0.28,
        "waveform": parts[5].strip() if len(parts) >= 6 and parts[5].strip() else "sine",
        "decayRate": float(parts[6]) if len(parts) >= 7 and parts[6] != "" else 9.0,
    }


def _parse_noise_expr(expr: str) -> dict[str, Any]:
    """`dur[:offset[:gain[:highpass[:lowpass[:decay]]]]]` 形式を辞書へ変換する。"""
    parts = expr.split(":")
    if len(parts) < 1 or not parts[0]:
        raise ValueError(f"--noise expects 'dur[:offset[:gain[:highpass[:lowpass[:decay]]]]]', got: {expr!r}")
    return {
        "durationSec": float(parts[0]),
        "offsetSec": float(parts[1]) if len(parts) >= 2 and parts[1] != "" else 0.0,
        "gain": float(parts[2]) if len(parts) >= 3 and parts[2] != "" else 0.24,
        "highpass": float(parts[3]) if len(parts) >= 4 and parts[3] != "" else 0.65,
        "lowpass": float(parts[4]) if len(parts) >= 5 and parts[4] != "" else 0.30,
        "decayRate": float(parts[5]) if len(parts) >= 6 and parts[5] != "" else 16.0,
    }


def _dict_to_sfx_event(raw: dict[str, Any]) -> SfxEvent:
    return SfxEvent(
        kind=str(raw["kind"]),
        time_sec=float(raw.get("offsetSec", raw.get("timeSec", 0.0))),
        gain=float(raw["gain"]) if raw.get("gain") is not None else None,
        pan=float(raw.get("pan", 0.0)),
        f0=float(raw.get("f0", 180.0)),
        f1=float(raw.get("f1", 300.0)),
        stroke_sec=float(raw.get("strokeSec", 0.22)),
        duration_sec=float(raw["durationSec"]) if raw.get("durationSec") is not None else None,
        freq_hz=float(raw["freqHz"]) if raw.get("freqHz") is not None else None,
        pulses=int(raw.get("pulses", 2)),
        pitch_start=float(raw["pitchStart"]) if raw.get("pitchStart") is not None else None,
        pitch_end=float(raw["pitchEnd"]) if raw.get("pitchEnd") is not None else None,
    )


def _cmd_export_standard(args: argparse.Namespace) -> int:
    kinds = tuple(args.kind) if args.kind else STANDARD_SFX_KINDS
    out_dir: Path = args.out_dir
    exported = export_sfx_library(
        out_dir=out_dir,
        kinds=kinds,
        force=args.force,
        sample_rate=args.sample_rate,
    )
    report: dict[str, Any] = {
        "outDir": str(out_dir),
        "count": len(exported),
        "files": {},
    }
    for kind, wav_path in exported.items():
        metrics = measure_sfx_wav(wav_path)
        report["files"][kind] = {
            "path": str(wav_path),
            **metrics,
        }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def _cmd_custom(args: argparse.Namespace) -> int:
    layers: list[SfxEvent] = []
    sweeps: list[dict[str, Any]] = []
    noises: list[dict[str, Any]] = []
    duration_sec: float = float(args.duration)
    seed: int = int(args.seed)

    if args.spec_json is not None:
        raw = json.loads(Path(args.spec_json).read_text(encoding="utf-8"))
        if raw.get("durationSec") is not None:
            duration_sec = float(raw["durationSec"])
        if raw.get("seed") is not None:
            seed = int(raw["seed"])
        for item in raw.get("layers") or []:
            layers.append(_dict_to_sfx_event(item))
        for item in raw.get("sweeps") or []:
            sweeps.append(dict(item))
        for item in raw.get("noises") or []:
            noises.append(dict(item))

    for expr in args.layer or []:
        layers.append(_parse_layer_expr(expr))
    for expr in args.sweep or []:
        sweeps.append(_parse_sweep_expr(expr))
    for expr in args.noise or []:
        noises.append(_parse_noise_expr(expr))

    if not layers and not sweeps and not noises:
        raise ValueError("Specify at least one --layer, --sweep, --noise, or --spec-json.")

    def _builder(buf: StereoBuffer) -> None:
        rng = random.Random(seed)
        for sw in sweeps:
            add_tone_sweep(
                buf,
                float(sw.get("offsetSec", 0.0)),
                f0=float(sw.get("f0", 220.0)),
                f1=float(sw.get("f1", 880.0)),
                duration_sec=float(sw.get("durationSec", 0.25)),
                waveform=sw.get("waveform", "sine"),
                gain=float(sw.get("gain", 0.28)),
                pan=float(sw.get("pan", 0.0)),
                attack_sec=float(sw.get("attackSec", 0.002)),
                decay_rate=float(sw.get("decayRate", 9.0)),
            )
        for ns in noises:
            add_noise_burst(
                buf,
                float(ns.get("offsetSec", 0.0)),
                duration_sec=float(ns.get("durationSec", 0.18)),
                gain=float(ns.get("gain", 0.24)),
                pan=float(ns.get("pan", 0.0)),
                highpass=float(ns.get("highpass", 0.65)),
                lowpass=float(ns.get("lowpass", 0.30)),
                decay_rate=float(ns.get("decayRate", 16.0)),
                rng=rng,
            )

    builder_fn = _builder if (sweeps or noises) else None

    if args.out is not None:
        out_path = render_custom_sfx(
            args.out,
            duration_sec=duration_sec,
            layers=layers,
            builder=builder_fn,
            sample_rate=args.sample_rate,
            seed=seed,
            normalize=not args.no_normalize,
        )
        try:
            public_src = out_path.resolve().relative_to(STUDIO_PUBLIC_DIR.resolve()).as_posix()
        except ValueError:
            public_src = out_path.as_posix()
    else:
        if not args.slug or not args.name:
            raise ValueError("Specify either --out <wav> or both --slug <slug> and --name <name>.")
        out_path, public_src = export_episode_custom_sfx(
            args.slug,
            args.name,
            duration_sec=duration_sec,
            layers=layers,
            builder=builder_fn,
            public_dir=args.public_dir,
            sample_rate=args.sample_rate,
            seed=seed,
            normalize=not args.no_normalize,
        )

    metrics = measure_sfx_wav(out_path)
    report = {
        "outPath": str(out_path),
        "publicSrc": public_src,
        "tsxSnippet": f'<SfxCue src="{public_src}" atSec={{tHit}} />',
        **metrics,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    _configure_stdio_utf8()
    parser = argparse.ArgumentParser(
        description="Export standard 20 synthesized SFX WAVs or synthesize episode-specific custom SFX WAVs."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_std = sub.add_parser("export-standard", help="Export standard 20 SFX WAVs to studio/public/sfx/<kind>.wav")
    p_std.add_argument("--out-dir", type=Path, default=STUDIO_PUBLIC_SFX_DIR)
    p_std.add_argument("--kind", action="append", help="Specific kind(s) to export (default: all 20)")
    p_std.add_argument("--force", action="store_true", help="Overwrite existing WAV files")
    p_std.add_argument("--sample-rate", type=int, default=SAMPLE_RATE)
    p_std.set_defaults(func=_cmd_export_standard)

    p_custom = sub.add_parser("custom", help="Synthesize an episode-specific custom SFX WAV")
    p_custom.add_argument("--slug", type=str, default=None, help="Episode slug (writes to studio/public/episodes/<slug>/sfx/<name>.wav)")
    p_custom.add_argument("--name", type=str, default=None, help="Custom SFX basename (without .wav)")
    p_custom.add_argument("--public-dir", type=Path, default=None, help="Override episode public directory")
    p_custom.add_argument("--out", type=Path, default=None, help="Explicit output WAV path")
    p_custom.add_argument("--duration", type=float, default=0.65, help="Buffer duration in seconds")
    p_custom.add_argument("--layer", action="append", help="Layer expression: kind@offset[:gain[:pan[:dur]]]")
    p_custom.add_argument("--sweep", action="append", help="Tone sweep expression: f0:f1:dur[:offset[:gain[:waveform[:decay]]]]")
    p_custom.add_argument("--noise", action="append", help="Noise burst expression: dur[:offset[:gain[:highpass[:lowpass[:decay]]]]]")
    p_custom.add_argument("--spec-json", type=Path, default=None, help="JSON recipe file")
    p_custom.add_argument("--seed", type=int, default=20261121)
    p_custom.add_argument("--sample-rate", type=int, default=SAMPLE_RATE)
    p_custom.add_argument("--no-normalize", action="store_true", help="Skip peak/RMS normalization and silence trim")
    p_custom.set_defaults(func=_cmd_custom)

    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except Exception as exc:
        print(f"[build_sfx error] {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
