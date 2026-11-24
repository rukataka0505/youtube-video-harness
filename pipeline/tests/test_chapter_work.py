"""章抽出が音声ビルドのフレーム・語句を保持することを確認する。"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from chapter_work import plan_e_material, select_rows, stickman_material


class ChapterWorkTests(unittest.TestCase):
    def test_split_shots_use_visual_frames_including_intro(self):
        chunk = {"chunkId": "a", "text": "前半と後半", "splits": [{"shotLabel": "転換"}]}
        shots = [
            {"label": "a", "startSec": 0, "endSec": 1, "startFrame": 0, "endFrame": 30},
            {"label": "転換", "startSec": 1, "endSec": 2, "startFrame": 30, "endFrame": 60},
        ]
        timeline = {"shots": shots, "assets": {}, "events": {"転換": 1},
                    "chunks": {"a": {"text": chunk["text"], "startSec": 0.2}},
                    "charTimes": {"a": [0.2, 0.4, 0.6, 1.0, 1.2]}}
        material = plan_e_material({"chunks": [chunk]}, timeline, None, ("a", "a"), True)
        self.assertEqual(material["cuts"][0]["shots"], shots)
        self.assertEqual(material["cuts"][0]["charTimes"], timeline["charTimes"]["a"])
        self.assertEqual(material["events"], timeline["events"])
        with self.assertRaises(ValueError):
            plan_e_material({"chunks": [chunk]}, {**timeline, "shots": shots[:1]}, None, ("a", "a"), False)

    def test_stickman_rejects_outdated_shot(self):
        spec = {"chapters": [{"shots": [{"chunkId": "a", "narrationJa": "新しい台詞"}]}]}
        timeline = {"shots": [{"chunkId": "a", "chapterIndex": 1, "narrationJa": "古い台詞"}]}
        with self.assertRaises(ValueError):
            stickman_material(spec, timeline, 1, None, False)

    def test_reversed_interval_fails(self):
        with self.assertRaises(ValueError):
            select_rows([{"chunkId": "a"}, {"chunkId": "b"}], None, ("b", "a"))
