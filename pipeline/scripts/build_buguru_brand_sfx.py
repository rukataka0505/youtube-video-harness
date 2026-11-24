"""「バグる棒人間」1.0秒アイキャッチ用の軽量SE（48kHz stereo WAV）を合成するCLI。

既存 `yt_engine.audio.render_sfx_track`（合成ピアノ不使用・純SFX）を使い、
案A（暗盤バグ発光 glow）／案B（明盤スケッチ sketch＝variant strips）に加え、
variant zoom（×目ドリーアウト）／glitch（システムダウン焼き付き）の計4本を書き出す。

    .\\pipeline\\.venv\\Scripts\\python.exe pipeline/scripts/build_buguru_brand_sfx.py
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
_SRC_DIR = str(REPO_ROOT / "pipeline" / "src")
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from yt_engine.audio import SfxEvent, render_sfx_track  # noqa: E402

# アイキャッチ本体（studio/src/components/stickman_collage/brand/BuguruEyecatch.tsx）の
# 正規化タイムライン（0..1 = 1.0秒）と同期させた配置。
EYECATCH_SFX: dict[str, list[SfxEvent]] = {
    "glow": [
        SfxEvent(kind="glitch_burst", time_sec=0.00, gain=0.20, pan=-0.15),
        SfxEvent(kind="impact_thud", time_sec=0.13, gain=0.34),
        SfxEvent(kind="data_chirp", time_sec=0.22, gain=0.07, pan=0.1),
        SfxEvent(kind="glitch_burst", time_sec=0.69, gain=0.22, pan=0.15),
        SfxEvent(kind="whoosh", time_sec=0.74, gain=0.16),
    ],
    "sketch": [
        SfxEvent(kind="paper_snap", time_sec=0.00, gain=0.30),
        SfxEvent(kind="pen_scratch", time_sec=0.11, gain=0.16),
        SfxEvent(kind="glitch_burst", time_sec=0.40, gain=0.10),
        SfxEvent(kind="soft_pop", time_sec=0.42, gain=0.24),
        SfxEvent(kind="whoosh", time_sec=0.71, gain=0.15),
        SfxEvent(kind="paper_snap", time_sec=0.75, gain=0.20, pan=0.2),
    ],
    # variant="zoom"（×目ドリーアウト）: ×の2画 → 飛び込み → 紙に着地 → 0.40 一気に引く → ロゴ刷り → ×で裂けて抜ける
    "zoom": [
        SfxEvent(kind="pen_scratch", time_sec=0.02, gain=0.16, pan=-0.15, duration_sec=0.035),
        SfxEvent(kind="pen_scratch", time_sec=0.05, gain=0.16, pan=0.15, duration_sec=0.035),
        SfxEvent(kind="whoosh", time_sec=0.07, gain=0.20, duration_sec=0.12, pitch_start=220.0, pitch_end=1600.0),
        SfxEvent(kind="soft_pop", time_sec=0.17, gain=0.16, f0=120.0, f1=70.0),
        SfxEvent(kind="glitch_burst", time_sec=0.40, gain=0.10, duration_sec=0.08),
        SfxEvent(kind="whoosh", time_sec=0.40, gain=0.22, duration_sec=0.22, pitch_start=1400.0, pitch_end=150.0),
        SfxEvent(kind="soft_pop", time_sec=0.42, gain=0.22),
        SfxEvent(kind="stamp_thud", time_sec=0.53, gain=0.15),
        SfxEvent(kind="pen_scratch", time_sec=0.72, gain=0.18, pan=-0.25, duration_sec=0.04),
        SfxEvent(kind="pen_scratch", time_sec=0.755, gain=0.18, pan=0.25, duration_sec=0.04),
        SfxEvent(kind="paper_snap", time_sec=0.80, gain=0.26),
        SfxEvent(kind="whoosh", time_sec=0.81, gain=0.14, duration_sec=0.16),
    ],
    # variant="glitch"（システムダウン焼き付き）: 破損ノイズ → 電源断 → 暗転 → 0.40 焼き付き → 微グリッチ → 走査線収束
    "glitch": [
        SfxEvent(kind="glitch_burst", time_sec=0.00, gain=0.20, pan=-0.2, duration_sec=0.18),
        SfxEvent(kind="data_chirp", time_sec=0.07, gain=0.08, duration_sec=0.12),
        SfxEvent(kind="glitch_burst", time_sec=0.12, gain=0.16, pan=0.25, duration_sec=0.10),
        SfxEvent(kind="vhs_pause", time_sec=0.20, gain=0.24, duration_sec=0.12),
        SfxEvent(kind="soft_pop", time_sec=0.27, gain=0.12, f0=900.0, f1=120.0),
        SfxEvent(kind="impact_thud", time_sec=0.40, gain=0.34),
        SfxEvent(kind="glitch_burst", time_sec=0.40, gain=0.18, duration_sec=0.12),
        SfxEvent(kind="data_chirp", time_sec=0.43, gain=0.07, duration_sec=0.2, pan=0.1),
        SfxEvent(kind="glitch_burst", time_sec=0.633, gain=0.08, duration_sec=0.06),
        SfxEvent(kind="glitch_burst", time_sec=0.72, gain=0.12, duration_sec=0.08),
        SfxEvent(kind="whoosh", time_sec=0.74, gain=0.14, duration_sec=0.16, pitch_start=1400.0, pitch_end=300.0),
        SfxEvent(kind="soft_pop", time_sec=0.86, gain=0.08, f0=1800.0, f1=1200.0),
    ],
}

PUBLIC_DIR = REPO_ROOT / "studio" / "public" / "brand" / "buguru"
AB_DIR = REPO_ROOT / "episodes" / "ab_tests" / "2026-11-23_buguru-brand-kit" / "sfx"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--duration", type=float, default=1.25, help="WAV尺（余韻込み）")
    args = parser.parse_args()

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    AB_DIR.mkdir(parents=True, exist_ok=True)
    for variant, events in EYECATCH_SFX.items():
        out = PUBLIC_DIR / f"eyecatch_{variant}_se.wav"
        render_sfx_track(args.duration, events, out)
        shutil.copy2(out, AB_DIR / out.name)
        print(f"[ok] {variant}: {out.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
