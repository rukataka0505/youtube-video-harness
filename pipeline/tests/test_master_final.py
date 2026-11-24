"""Unit tests for pipeline/scripts/master_final.py (-c:v copy & 2-pass loudnorm)."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "pipeline" / "scripts" / "master_final.py"
_SPEC = importlib.util.spec_from_file_location("master_final", SCRIPT_PATH)
assert _SPEC is not None and _SPEC.loader is not None
mf = importlib.util.module_from_spec(_SPEC)
sys.modules["master_final"] = mf
_SPEC.loader.exec_module(mf)


def _ffprobe_video_stream(mp4_path: Path) -> dict:
    proc = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_frames",
            "-of", "json", str(mp4_path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    return json.loads(proc.stdout)["streams"][0]


class MasterFinalTests(unittest.TestCase):
    def test_master_final_copies_video_stream_and_hits_target_loudness(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            in_mp4 = Path(td) / "rendered_quiet.mp4"
            out_mp4 = Path(td) / "mastered_final.mp4"
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-f", "lavfi", "-i", "testsrc=duration=3.0:size=320x180:rate=30",
                    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3.0",
                    "-af", "volume=-16dB",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k",
                    str(in_mp4),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            in_v = _ffprobe_video_stream(in_mp4)
            result = mf.master_final_mp4(in_mp4, out_mp4)
            self.assertTrue(out_mp4.is_file())

            out_v = _ffprobe_video_stream(out_mp4)
            self.assertEqual(in_v["codec_name"], out_v["codec_name"])
            self.assertEqual(in_v["width"], out_v["width"])
            self.assertEqual(in_v["height"], out_v["height"])
            self.assertEqual(in_v["r_frame_rate"], out_v["r_frame_rate"])
            self.assertEqual(in_v.get("nb_frames"), out_v.get("nb_frames"))

            self.assertTrue(result["passed"])
            self.assertEqual(result["videoCodec"], "copy")
            verified_i = float(result["outputI"])
            verified_tp = float(result["outputTp"])
            self.assertAlmostEqual(verified_i, -14.0, delta=0.5)
            self.assertLessEqual(verified_tp, -1.0)


if __name__ == "__main__":
    unittest.main()
