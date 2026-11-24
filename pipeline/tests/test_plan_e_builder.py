"""Unit tests for Plan E (planE_macro_econ v3.0) asset/timeline builder and audit CLI."""

from __future__ import annotations

import importlib.util
import json
import math
import struct
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_SRC = REPO_ROOT / "pipeline" / "src"
if str(PIPELINE_SRC) not in sys.path:
    sys.path.insert(0, str(PIPELINE_SRC))

SCRIPT_PATH = REPO_ROOT / "pipeline" / "scripts" / "build_plan_e_assets.py"
_SPEC = importlib.util.spec_from_file_location("build_plan_e_assets", SCRIPT_PATH)
assert _SPEC is not None and _SPEC.loader is not None
bpe = importlib.util.module_from_spec(_SPEC)
sys.modules["build_plan_e_assets"] = bpe
_SPEC.loader.exec_module(bpe)

EXAMPLE_SPEC_PATH = REPO_ROOT / "episodes" / "_templates" / "plan_e_spec.example.json"


def _write_test_wav(path: Path, duration_sec: float = 1.2, sample_rate: int = 48000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    num_frames = max(1, int(round(duration_sec * sample_rate)))
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        for i in range(num_frames):
            val = int(4000 * math.sin(2.0 * math.pi * 440.0 * i / sample_rate))
            frames.extend(struct.pack("<h", val))
        wf.writeframes(bytes(frames))


def _make_real_jpeg_bytes(tmp_dir: Path) -> bytes:
    """ffmpeg でキャッシュ閾値(>1KB)を超える実 JPEG バイト列を生成する。"""
    out_jpg = tmp_dir / "sample_real.jpg"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=0.1:size=320x180:rate=10",
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(out_jpg),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return out_jpg.read_bytes()


def _minimal_valid_spec(slug: str = "unit_test_plan_e_v3") -> dict:
    return {
        "slug": slug,
        "formatId": "planE_macro_econ",
        "title": "案E v3.0 テスト動画",
        "fps": 30,
        "fonts": ["Noto Sans JP"],
        "audio": {
            "bgm": {"gain": 0.04, "grooveStartEvent": "c01_start"},
        },
        "chunks": [
            {
                "chunkId": "c01",
                "eventKey": "c01_start",
                "speechEndEventKey": "c01_end",
                "pauseAfterSec": 0.3,
                "text": "物価が上がっているのに、実質賃金は下がり続けています。",
                "subtitle": {"line1": "物価が上がっているのに、", "line2": ""},
                "splits": [
                    {
                        "atText": "実質賃金は",
                        "shotRole": "data_snap",
                        "shotLabel": "c01_b",
                        "eventKey": "c01_mid",
                        "subtitle": {"line1": "実質賃金は下がり続けています。", "line2": ""},
                    }
                ],
            },
            {
                "chunkId": "c02",
                "eventKey": "c02_start",
                "speechEndEventKey": "c02_end",
                "pauseAfterSec": 0.3,
                "text": "なぜ企業は値下げをせず値上げを選ぶのか。",
                "subtitleSegments": [
                    {"line1": "なぜ企業は値下げをせず", "line2": ""},
                    {"line1": "値上げを選ぶのか。", "line2": ""},
                ],
            },
        ],
        "videoClips": [
            {
                "key": "city_broll",
                "filename": "city_broll.mp4",
                "source": "mixkit",
                "url": "https://assets.mixkit.co/videos/999999/999999-1080.mp4",
                "license": "mixkit_free",
                "creditShort": "Mixkit",
                "intent": "evening city commuters for macro intro",
            }
        ],
        "stockImages": [
            {
                "key": "tokyo_chart",
                "filename": "tokyo_chart.jpg",
                "source": "wikimedia",
                "url": "https://upload.wikimedia.org/wikipedia/commons/sample/tokyo_1200.jpg",
                "license": "public_domain",
                "creditShort": "Wikimedia Commons",
                "intent": "CPI chart visual context",
            }
        ],
        "images": [],
        "legalChecklist": {
            "primarySources": [
                {"title": "総務省統計局", "url": "https://www.stat.go.jp/", "publisher": "総務省"},
                {"title": "内閣府統計", "url": "https://www.esri.cao.go.jp/", "publisher": "内閣府"},
                {"title": "日本銀行統計", "url": "https://www.boj.or.jp/", "publisher": "日本銀行"},
            ],
            "usesAcmlVoiceForCriticism": False,
            "usesAiExpertAdvice": False,
            "noFinancialAdviceClaim": True,
            "fontsLicense": "SIL OFL 1.1",
        },
    }


class PlanEBuilderV3Tests(unittest.TestCase):
    def test_example_spec_validates_strict(self) -> None:
        raw = json.loads(EXAMPLE_SPEC_PATH.read_text(encoding="utf-8"))
        errors, warnings = bpe.validate_plan_e_spec(raw)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])
        code = bpe.main(["--spec", str(EXAMPLE_SPEC_PATH), "--validate-only", "--strict"])
        self.assertEqual(code, 0)

    def test_rejects_scenes_image_config_and_ai_images(self) -> None:
        bad = _minimal_valid_spec()
        bad["scenes"] = [{"id": "s1", "type": "paper_document"}]
        bad["imageConfig"] = {"models": ["legacy"]}
        bad["images"] = [{"key": "ai_bad", "filename": "ai.png", "source": "ai_generated", "intent": "bad"}]
        errors, _ = bpe.validate_plan_e_spec(bad)
        joined = "\n".join(errors)
        self.assertIn("scenes", joined)
        self.assertIn("imageConfig", joined)
        self.assertIn("source='local'", joined)

    def test_rejects_audio_sfx_and_missing_intent(self) -> None:
        bad = _minimal_valid_spec()
        bad["audio"]["sfx"] = [{"kind": "paper_snap", "event": "c01_start"}]
        bad["videoClips"][0]["intent"] = ""
        bad["stockImages"][0].pop("intent", None)
        errors, _ = bpe.validate_plan_e_spec(bad)
        joined = "\n".join(errors)
        self.assertIn("audio.sfx is prohibited", joined)
        self.assertIn("videoClips[0] (city_broll) must define non-empty intent", joined)
        self.assertIn("stockImages[0] (tokyo_chart) must define non-empty intent", joined)

        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "bad_sfx_intent.json"
            p.write_text(json.dumps(bad, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(bpe.main(["--spec", str(p), "--validate-only"]), 2)

        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "bad_spec.json"
            p.write_text(json.dumps(bad, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(bpe.main(["--spec", str(p), "--validate-only"]), 2)

    def test_strict_exit_code_1_on_warnings(self) -> None:
        warn_spec = _minimal_valid_spec("not_the_sample_slug")
        warn_spec["videoClips"][0]["url"] = "https://assets.mixkit.co/videos/4437/4437-1080.mp4"
        errors, warnings = bpe.validate_plan_e_spec(warn_spec)
        self.assertEqual(errors, [])
        self.assertTrue(any("template sample URL" in w for w in warnings))

        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "warn_spec.json"
            p.write_text(json.dumps(warn_spec, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(bpe.main(["--spec", str(p), "--validate-only"]), 0)
            self.assertEqual(bpe.main(["--spec", str(p), "--validate-only", "--strict"]), 1)

    def test_unknown_event_reference_is_static_error_and_raises_at_runtime(self) -> None:
        with self.assertRaises(ValueError):
            bpe._resolve_time({"c01_start": 0.0}, "nonexistent_event", context="unit_test")

        bad = _minimal_valid_spec()
        bad["audio"]["bgm"]["grooveStartEvent"] = "nonexistent_event"
        errors, _ = bpe.validate_plan_e_spec(bad)
        self.assertTrue(any("nonexistent_event" in e for e in errors))

    def test_default_tts_is_elevenlabs_v4(self) -> None:
        self.assertEqual(bpe.DEFAULT_ELEVENLABS_MODELS[0], "eleven_v4")
        self.assertEqual(bpe.DEFAULT_TTS_MODELS[0], "eleven_v4")

    def test_at_text_derives_split_char_index_and_subtitle_starts(self) -> None:
        spec = _minimal_valid_spec()
        c01_raw = spec["chunks"][0]
        c02_raw = spec["chunks"][1]
        cleaned1, _ = bpe.sanitize_japanese_tts_text(c01_raw["text"])
        cleaned2, _ = bpe.sanitize_japanese_tts_text(c02_raw["text"])
        errors: list[str] = []
        warnings: list[str] = []
        split_indices = bpe._resolve_split_char_indices("c01", cleaned1, c01_raw, errors, warnings)
        sub_starts = bpe._resolve_subtitle_segment_starts("c02", cleaned2, c02_raw, errors, warnings)
        self.assertEqual(errors, [])
        expected_split_idx = cleaned1.index("実質賃金は")
        expected_sub_idx = cleaned2.index("値上げを選ぶのか")
        self.assertEqual(split_indices, [expected_split_idx])
        self.assertEqual(sub_starts, [0, expected_sub_idx])

        parsed = bpe.parse_chunks(spec["chunks"])
        self.assertEqual(parsed[0].splits[0].char_index, expected_split_idx)
        self.assertEqual(parsed[1].subtitle_segments[1].start_char, expected_sub_idx)

    def test_build_timeline_and_master_2_input_no_sfx_events(self) -> None:
        spec = _minimal_valid_spec()
        with tempfile.TemporaryDirectory() as td:
            pub = Path(td) / "public"
            tts_dir = pub / "tts"
            _write_test_wav(tts_dir / "c01.wav", duration_sec=1.5)
            _write_test_wav(tts_dir / "c02.wav", duration_sec=1.3)

            parsed_chunks = bpe.parse_chunks(spec["chunks"])
            durations = {"c01": 1.5, "c02": 1.3}
            timeline = bpe.build_timeline(
                spec,
                parsed_chunks,
                durations,
                tts_dir,
                "unit/ep",
                [],
                dry_run=False,
                tts_info=None,
                video_clips=[],
                stock_images=bpe.parse_stock_images(spec["stockImages"]),
                assets_meta={},
            )
            self.assertNotIn("sfxEvents", timeline)
            self.assertIn("chunkList", timeline)
            self.assertIn("charTimes", timeline)
            self.assertEqual(len(timeline["chunkList"]), 2)
            self.assertEqual(len(timeline["charTimes"]["c01"]), len(parsed_chunks[0].text))

            ts_out = Path(td) / "timelineData.ts"
            bpe.write_timeline_outputs(spec, timeline, pub, ts_out)
            manifest = json.loads((pub / "timeline.json").read_text(encoding="utf-8"))
            self.assertIn("chunks", manifest)
            self.assertIn("charTimes", manifest)
            self.assertIn("assets", manifest)
            self.assertNotIn("sfxEvents", manifest)
            self.assertEqual(set(manifest["sfxMap"]), bpe.ALLOWED_SFX_KINDS)
            self.assertEqual(len(manifest["sfxMap"]), 20)
            self.assertEqual(manifest["sfxMap"]["paper_snap"], "unit/ep/sfx/paper_snap.wav")
            self.assertEqual(manifest["sfxVariants"], {})

            master_wav = bpe.synthesize_audio_and_master(spec, parsed_chunks, timeline, pub, tts_dir=tts_dir)
            self.assertTrue(master_wav.is_file())
            self.assertGreater(master_wav.stat().st_size, 1000)
            published = set(manifest["sfxMap"].values())
            self.assertEqual({Path(src).name for src in published}, {p.name for p in (pub / "sfx").glob("*.wav")})

    def test_skip_audio_exports_canonical_recording_and_preserves_master(self) -> None:
        spec = _minimal_valid_spec()
        spec["videoClips"] = []
        spec["stockImages"] = []
        spec["audio"]["sfxLibraryKinds"] = ["phone_notification", "radar_beep"]
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            spec_path = root / "spec.json"
            spec_path.write_text(json.dumps(spec), encoding="utf-8")
            pub = root / "public"
            master = pub / "master_audio_recorded.wav"
            _write_test_wav(master)
            original_audio = master.read_bytes()
            ts_out = root / "timelineData.ts"

            def cached_tts(*, tts_dir, **kwargs):
                durations = {"c01": 1.5, "c02": 1.3}
                for chunk_id, duration in durations.items():
                    _write_test_wav(tts_dir / f"{chunk_id}.wav", duration_sec=duration)
                return durations, {}

            with mock.patch.object(bpe, "generate_tts_chunks", side_effect=cached_tts):
                result = bpe.main([
                    "--spec", str(spec_path), "--output-public-dir", str(pub), "--output-ts", str(ts_out),
                    "--skip-tts", "--skip-audio", "--audio-variant", "recorded",
                ])
            self.assertEqual(result, 0)
            manifest = json.loads((pub / "timeline_recorded.json").read_text(encoding="utf-8"))
            self.assertEqual(set(manifest["sfxMap"]), {"radar_beep"})
            self.assertEqual(
                {p.name for p in (pub / "sfx").glob("*.wav")},
                {"radar_beep.wav"},
            )
            self.assertEqual(master.read_bytes(), original_audio)

    def test_release_gate_and_url_mismatch_cache_invalidation(self) -> None:
        spec = _minimal_valid_spec()
        with tempfile.TemporaryDirectory() as td:
            td_path = Path(td)
            pub = td_path / "public"
            p = td_path / "spec.json"
            p.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")

            # Release gate must reject unverified/missing assets with exit 2
            self.assertEqual(
                bpe.main(["--spec", str(p), "--output-public-dir", str(pub), "--validate-only", "--release"]),
                2,
            )

            images_dir = pub / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            stock_specs = bpe.parse_stock_images(spec["stockImages"])
            asset_manifest: dict[str, dict] = {}
            jpg_bytes = _make_real_jpeg_bytes(td_path)

            with mock.patch.object(bpe, "_download_binary") as dl_mock:
                dl_mock.side_effect = lambda url, dest, user_agent="": dest.write_bytes(jpg_bytes)
                bpe.fetch_stock_images(stock_specs, images_dir, asset_manifest=asset_manifest)
                self.assertEqual(dl_mock.call_count, 1)
                self.assertEqual(asset_manifest["tokyo_chart"]["sourceUrl"], stock_specs[0].url)
                sha = asset_manifest["tokyo_chart"]["sha256"]
                self.assertEqual(len(sha), 64)

                # Same URL hits cache -> 0 new downloads
                bpe.fetch_stock_images(stock_specs, images_dir, asset_manifest=asset_manifest)
                self.assertEqual(dl_mock.call_count, 1)

                # Different URL invalidates cache -> downloads again
                changed = [
                    bpe.StockImageSpec(
                        **{**stock_specs[0].__dict__, "url": "https://upload.wikimedia.org/wikipedia/commons/other.jpg"}
                    )
                ]
                bpe.fetch_stock_images(changed, images_dir, asset_manifest=asset_manifest)
                self.assertEqual(dl_mock.call_count, 2)
                self.assertEqual(asset_manifest["tokyo_chart"]["sourceUrl"], changed[0].url)

            # Verify verified == sha256 check
            bpe._save_asset_manifest(pub, asset_manifest)
            actual_sha = bpe._file_sha256(images_dir / "tokyo_chart.jpg")
            spec_check = _minimal_valid_spec()
            spec_check["stockImages"][0]["url"] = "https://upload.wikimedia.org/wikipedia/commons/other.jpg"
            spec_check["stockImages"][0]["verified"] = actual_sha
            meta, issues = bpe.verify_assets_manifest(spec_check, pub)
            self.assertTrue(meta["tokyo_chart"]["verified"])
            self.assertFalse(any("tokyo_chart" in iss for iss in issues))

            spec_check["stockImages"][0]["verified"] = "0" * 64
            meta_bad, issues_bad = bpe.verify_assets_manifest(spec_check, pub)
            self.assertFalse(meta_bad["tokyo_chart"]["verified"])
            self.assertTrue(any("sha256 mismatch" in iss for iss in issues_bad))

    def test_wikimedia_min_width_filter(self) -> None:
        fake_resp = mock.MagicMock()
        fake_resp.status_code = 200
        fake_resp.json.return_value = {
            "query": {
                "pages": {
                    "1": {"imageinfo": [{"url": "https://upload.wikimedia.org/low_600.jpg", "width": 600}]},
                    "2": {"imageinfo": [{"url": "https://upload.wikimedia.org/hi_1400.jpg", "width": 1400}]},
                }
            }
        }
        with mock.patch.object(bpe.requests, "get", return_value=fake_resp):
            resolved = bpe.resolve_wikimedia_media_url("japanese yen banknotes", min_width=1000)
        self.assertEqual(resolved, "https://upload.wikimedia.org/hi_1400.jpg")

    def test_generate_asset_contact_sheet_3frames(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            pub = Path(td) / "public"
            vid = pub / "videos" / "clip01.mp4"
            vid.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(
                [
                    "ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=duration=1.5:size=320x180:rate=30",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(vid),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            vc = bpe.VideoClipSpec(
                key="clip01", filename="clip01.mp4", source="local",
                url="local://clip01.mp4", intent="contact sheet test",
            )
            summary = bpe.generate_asset_contact_sheet(pub, [vc])
            sheet = Path(summary["videoContactSheet"])
            self.assertTrue(sheet.is_file())
            self.assertTrue(sheet.read_bytes().startswith(b"\x89PNG"))
            idx_json = pub / "contact_sheet_index.json"
            self.assertTrue(idx_json.is_file())
            idx_data = json.loads(idx_json.read_text(encoding="utf-8"))
            self.assertEqual(len(idx_data["videos"]), 1)
            self.assertEqual(len(idx_data["videos"][0]["sampleTimesSec"]), 3)


if __name__ == "__main__":
    unittest.main()
