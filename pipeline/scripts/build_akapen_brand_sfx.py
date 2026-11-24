"""ch2「経済の赤ペン」公式アイキャッチ（3種・各1.3秒・115BPM同期）用の SE（48kHz stereo WAV）を合成するCLI。

尺と SFX 配置の唯一正本は studio/src/components/plan_e/brand/akapenCues.json（TS と共有）。
既存 `yt_engine.audio.render_sfx_track`（純SFX・音程なし）で公式3種（swipe / pullback / slit）を
studio/public/brand/akapen/ へ書き出す。

    .\\pipeline\\.venv\\Scripts\\python.exe pipeline/scripts/build_akapen_brand_sfx.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
_SRC_DIR = str(REPO_ROOT / "pipeline" / "src")
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from yt_engine.audio import SfxEvent, render_sfx_track  # noqa: E402

CUES_JSON = REPO_ROOT / "studio" / "src" / "components" / "plan_e" / "brand" / "akapenCues.json"
PUBLIC_DIR = REPO_ROOT / "studio" / "public" / "brand" / "akapen"

# cues JSON のキー → SfxEvent の引数名（任意項目）
_OPTIONAL_FIELDS = {
    "pan": "pan",
    "duration": "duration_sec",
    "pitchStart": "pitch_start",
    "pitchEnd": "pitch_end",
    "f0": "f0",
    "f1": "f1",
    "freqHz": "freq_hz",
}


def _events(raw: list[dict]) -> list[SfxEvent]:
    out: list[SfxEvent] = []
    for c in raw:
        kw: dict = {"kind": c["kind"], "time_sec": float(c["offset"]), "gain": float(c["gain"])}
        for src, dst in _OPTIONAL_FIELDS.items():
            if src in c:
                kw[dst] = float(c[src])
        if "pulses" in c:
            kw["pulses"] = int(c["pulses"])
        out.append(SfxEvent(**kw))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--variant",
        action="append",
        help="特定の variant のみ生成する（複数指定可。未指定時は公式全3種を生成）",
    )
    args = parser.parse_args()

    cues = json.loads(CUES_JSON.read_text(encoding="utf-8"))
    variants = cues["variants"]
    targets = args.variant if args.variant else list(variants.keys())
    unknown = [v for v in targets if v not in variants]
    if unknown:
        parser.error(f"未定義の variant: {unknown}（有効値: {sorted(variants)}）")

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for variant in targets:
        spec = variants[variant]
        dur = float(spec.get("durationSec", cues["durationSec"])) + float(cues["wavTailSec"])
        out = PUBLIC_DIR / f"eyecatch_{variant}_se.wav"
        render_sfx_track(dur, _events(spec["sfx"]), out)
        print(f"[ok] {variant}: {out.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
