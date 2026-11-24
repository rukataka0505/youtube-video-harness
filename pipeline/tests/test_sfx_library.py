"""標準 20 種合成 SFX・静的 WAV 一括出力・カスタム合成ヘルパー・TS カタログ同期・バリデータ検査のテスト。"""

from __future__ import annotations

import array
import json
import math
import re
import sys
import tempfile
import unittest
import wave
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_SRC = REPO_ROOT / "pipeline" / "src"
PIPELINE_SCRIPTS = REPO_ROOT / "pipeline" / "scripts"
for p in (str(PIPELINE_SRC), str(PIPELINE_SCRIPTS)):
    if p not in sys.path:
        sys.path.insert(0, p)

import build_sfx  # noqa: E402
from yt_engine.audio import sfx_synth as sfx  # noqa: E402
from yt_engine.stickman_collage_validator import validate_stickman_collage_spec  # noqa: E402


def _read_pcm(path: Path, sample_rate: int = sfx.SAMPLE_RATE) -> array.array:
    with wave.open(str(path), "rb") as wf:
        assert (wf.getnchannels(), wf.getsampwidth(), wf.getframerate()) == (2, 2, sample_rate)
        frame_count = wf.getnframes()
        pcm = array.array("h", wf.readframes(frame_count))
    if sys.byteorder != "little":
        pcm.byteswap()
    assert len(pcm) == frame_count * 2
    return pcm


class SfxSynthLibraryTests(unittest.TestCase):
    def test_standard_20_catalog_ts_sync_and_static_wavs(self) -> None:
        self.assertEqual(len(sfx.STANDARD_SFX_KINDS), 20)
        self.assertEqual(sfx.ALLOWED_SFX_KINDS, frozenset(sfx.STANDARD_SFX_KINDS))

        # Python と TypeScript（studio/src/components/sfx.ts）の標準20種・互換エイリアス完全同期
        ts_catalog = (REPO_ROOT / "studio/src/components/sfx.ts").read_text(encoding="utf-8")
        ts_kinds = re.findall(r"^  '([a-z_]+)',$", ts_catalog, re.M)
        self.assertEqual(tuple(ts_kinds), sfx.STANDARD_SFX_KINDS)
        ts_aliases = dict(re.findall(r"^  ([a-z_]+): '([a-z_]+)',$", ts_catalog, re.M))
        self.assertEqual(ts_aliases, sfx.LEGACY_SFX_ALIASES)

        # studio/public/sfx/<kind>.wav に全20本が立ち上がり0ms・統一音圧で常設されていること
        pub_dir = sfx.STUDIO_PUBLIC_SFX_DIR
        for kind in sfx.STANDARD_SFX_KINDS:
            wav_path = pub_dir / f"{kind}.wav"
            with self.subTest(kind=kind):
                self.assertTrue(wav_path.is_file(), f"Missing static SFX WAV: {wav_path}")
                pcm = _read_pcm(wav_path)
                metrics = sfx.measure_sfx_wav(wav_path)
                self.assertEqual(metrics["sampleRate"], float(sfx.SAMPLE_RATE))
                self.assertTrue(0.05 <= metrics["durationSec"] <= 1.2, metrics)
                self.assertLess(max(map(abs, pcm)), 32767, "クリップ禁止")
                self.assertTrue(0.40 <= metrics["peak"] <= sfx.SFX_TARGET_PEAK + 0.01, metrics)
                self.assertTrue(0.11 <= metrics["activeRms"] <= sfx.SFX_TARGET_ACTIVE_RMS + 0.01, metrics)
                # 立ち上がり 0ms 契約（緩やかフェードイン系を含め 6ms 以内＝30fps 1/5 フレーム以下）
                self.assertLessEqual(metrics["onsetMs"], 6.0, metrics)

    def test_render_sfx_track_synthesizes_all_20_and_aliases(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            out = root / "track.wav"
            events = [sfx.SfxEvent(kind, idx * 0.25) for idx, kind in enumerate(sfx.STANDARD_SFX_KINDS)]
            sfx.render_sfx_track(len(sfx.STANDARD_SFX_KINDS) * 0.25 + 1.0, events, out)
            pcm = _read_pcm(out)
            self.assertGreater(max(map(abs, pcm)), 1000)

            # エイリアス解決（制作中エピソード互換名 → 標準20種）
            alias_out = root / "alias.wav"
            std_out = root / "std.wav"
            sfx.render_sfx_track(0.5, [sfx.SfxEvent("finger_snap", 0.05, pan=-0.5)], alias_out, seed=42)
            sfx.render_sfx_track(0.5, [sfx.SfxEvent("paper_snap", 0.05, pan=-0.5)], std_out, seed=42)
            self.assertEqual(_read_pcm(alias_out), _read_pcm(std_out))

            with self.assertRaises(ValueError):
                sfx.render_sfx_track(0.4, [sfx.SfxEvent("unknown_sfx_xyz", 0.0)], root / "bad.wav")

    def test_custom_sfx_helpers_and_cli(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)

            # 1) Python ヘルパー（レイヤー＋自由波形ビルダー）
            def _builder(buf: sfx.StereoBuffer) -> None:
                sfx.add_tone_sweep(buf, 0.0, f0=660.0, f1=140.0, duration_sec=0.22, waveform="triangle", gain=0.35)
                sfx.add_noise_burst(buf, 0.02, duration_sec=0.14, gain=0.22)

            wav_path, rel_src = sfx.export_episode_custom_sfx(
                "demo-ep",
                "hook_drop",
                duration_sec=0.55,
                layers=[sfx.SfxEvent("impact_thud", 0.0, gain=0.4)],
                builder=_builder,
                public_root=root,
            )
            self.assertEqual(rel_src, "episodes/demo-ep/sfx/hook_drop.wav")
            self.assertTrue(wav_path.is_file())
            m = sfx.measure_sfx_wav(wav_path)
            self.assertLessEqual(m["onsetMs"], 2.0)
            self.assertLessEqual(m["peak"], sfx.SFX_TARGET_PEAK + 0.01)
            self.assertGreater(m["activeRms"], 0.12)

            # 2) build_sfx.py CLI（export-standard / custom）
            std_dir = root / "std_sfx"
            rc = build_sfx.main(["export-standard", "--out-dir", str(std_dir), "--kind", "stamp_thud", "--kind", "price_ping", "--force"])
            self.assertEqual(rc, 0)
            self.assertEqual({p.name for p in std_dir.glob("*.wav")}, {"stamp_thud.wav", "price_ping.wav"})

            custom_out = root / "cli_custom.wav"
            rc_c = build_sfx.main([
                "custom",
                "--out",
                str(custom_out),
                "--duration",
                "0.5",
                "--layer",
                "stamp_thud@0.0:0.9",
                "--sweep",
                "800:220:0.18:0.02:0.4:sine",
                "--noise",
                "0.12:0.0:0.3",
            ])
            self.assertEqual(rc_c, 0)
            self.assertTrue(custom_out.is_file())
            mc = sfx.measure_sfx_wav(custom_out)
            self.assertLessEqual(mc["onsetMs"], 2.0)
            self.assertLessEqual(mc["peak"], sfx.SFX_TARGET_PEAK + 0.01)

    def test_stickman_validator_accepts_standard_alias_and_tsx_sfxcue(self) -> None:
        spec_path = REPO_ROOT / "episodes/_templates/stickman_collage_spec.example.json"
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        shot = spec["chapters"][0]["shots"][0]
        for kind in ("stamp_thud", "price_ping", "finger_snap", "switch_click"):
            with self.subTest(kind=kind):
                shot["sfx"] = [{"kind": kind, "offsetSec": 0.12}]
                self.assertEqual(validate_stickman_collage_spec(spec).errors, [])
        shot["sfx"] = [{"kind": "unknown_bad_kind", "offsetSec": 0.12}]
        self.assertTrue(any("unsupported sfx kind" in err for err in validate_stickman_collage_spec(spec).errors))

        # 新方針: spec.sfx が空でも TSX に <SfxCue> があれば無音警告なし、未知 kind は ERROR
        for ch in spec["chapters"]:
            for sh in ch["shots"]:
                sh["sfx"] = []
        with tempfile.TemporaryDirectory() as td:
            tsx_dir = Path(td)
            (tsx_dir / "scenes.tsx").write_text(
                "import { SfxCue } from '../../../components/stickman_collage';\n"
                "export const Demo = () => <><SfxCue kind=\"stamp_thud\" atSec={0.2} /><SfxCue src=\"episodes/demo/sfx/hit.wav\" atSec={0.5} /></>;\n",
                encoding="utf-8",
            )
            rep_ok = validate_stickman_collage_spec(spec, tsx_dir=tsx_dir)
            self.assertEqual(rep_ok.metrics.get("tsx_sfx_cue_count"), 2)
            self.assertFalse(any("<SfxCue>" in w for w in rep_ok.warnings))
            self.assertFalse(any("<SfxCue>" in e for e in rep_ok.errors))

            (tsx_dir / "scenes.tsx").write_text(
                "export const Demo = () => <SfxCue kind=\"nonexistent_sfx\" atSec={0.2} />;\n",
                encoding="utf-8",
            )
            rep_bad = validate_stickman_collage_spec(spec, tsx_dir=tsx_dir)
            self.assertTrue(any("nonexistent_sfx" in e for e in rep_bad.errors))


if __name__ == "__main__":
    unittest.main()
