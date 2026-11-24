"""yt_engine.analyzer.benchmark_pass2 のオフライン単体テスト（API呼び出し無し）。"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from google.genai import types
from google.genai.errors import APIError

from yt_engine.analyzer.benchmark_pass2 import (
    ChapterBlueprint,
    VideoTarget,
    build_arg_parser,
    is_api_key_error,
    main,
    make_pass2_video_part,
    resolve_targets,
    run_pass2_batch,
)
from yt_engine.schemas import MacroWinningBlueprint


def _sample_macro_payload() -> dict:
    return {
        "content_format": "explainer_essay",
        "structural_roadmap_shown": True,
        "body_avg_shot_len_sec": 3.8,
        "pattern_interrupt_interval_sec": 24.0,
        "visual_dominant_layer": "slides_motion_gfx",
        "bgm_shift_count": 5,
        "dead_air_eliminated": True,
        "uses_j_l_cuts": True,
        "open_loops": [
            {
                "opened_at": "00:18",
                "hook_question": "なぜ賢くなるほど逆に成果が落ちるのか？",
                "closed_at": "08:40",
                "is_closed": True,
            }
        ],
        "monetization_ctas": [
            {
                "timestamp": "09:10",
                "cta_type": "next_video",
                "duration_sec": 15,
                "placement_context": "end_screen",
                "bridge_script_summary": "次の動画で具体的な訓練プロトコルを解説する予告で即切断",
            }
        ],
        "has_finalizing_phrase": False,
        "end_screen_continuous_value": True,
        "faceless_reproducible": True,
        "production_effort_tier": "medium_editorial",
        "replicable_winning_formula": "通説否定フック→3章ミニアーク→中盤視覚極性反転→ピアノ再投入→次動画直結",
    }


def _sample_chapter_payload() -> dict:
    return {
        "video_title_observed": "Sample Plan C Essay",
        "channel_style_observed_ja": "淡々とした皮肉と黒背景棒人間コラージュのミニマル図解",
        "total_duration_sec": 600.0,
        "total_duration_mmss": "10:00",
        "mini_arc_count": 3,
        "avg_rehook_interval_sec": 120.0,
        "bgm_architecture_summary_ja": "冒頭無音から01:00にピアノ導入、中盤で25msカットアウト後に再投入",
        "irony_and_humor_rhythm_ja": "90秒ごとにドライな自虐小オチを挿入",
        "end_cta_mechanism_ja": "挨拶締めを排し、最後の15秒で次動画の未解決疑問を提示して即終了",
        "chapters": [
            {
                "chapter_index": 1,
                "chapter_title_ja": "冒頭フックと通説破壊",
                "start_sec": 0.0,
                "end_sec": 60.0,
                "start_mmss": "00:00",
                "end_mmss": "01:00",
                "duration_ratio_pct": 10.0,
                "chapter_role": "hook_intro",
                "opening_hook_or_rehook_en": "So you want to become smart.",
                "opening_hook_or_rehook_ja": "頭が良くなりたいんですよね。",
                "core_argument_ja": "従来の勉強法は遠回りで、認知負荷の設計がすべてを決める。",
                "visual_pattern": "stick_figure_minimal",
                "visual_break_technique_ja": "黒背景に黄色棒人間と新聞切り抜きを1.5秒ごとに重ねる",
                "irony_or_punchline_ja": "00:09 22年かけて得られるのはホームレス生活という皮肉",
                "bgm_transition": "silence_hold",
                "bgm_detail_ja": "00:00〜00:55までBGM完全無音、00:55にピアノビートイン",
                "next_chapter_bridge_ja": "ではなぜ9割の人が努力で空回りするのか？",
            },
            {
                "chapter_index": 2,
                "chapter_title_ja": "本編ミニアークと回収・次動画接続",
                "start_sec": 60.0,
                "end_sec": 600.0,
                "start_mmss": "01:00",
                "end_mmss": "10:00",
                "duration_ratio_pct": 90.0,
                "chapter_role": "climax_payoff",
                "opening_hook_or_rehook_en": "Here is the part nobody tells you.",
                "opening_hook_or_rehook_ja": "ここからが誰も教えてくれない核心です。",
                "core_argument_ja": "日常の摩擦設計と1日15分の実践へ落とし込んで回収する。",
                "visual_pattern": "polarity_invert_reset",
                "visual_break_technique_ja": "05:00に黒から白背景へ極性反転して図解をリセット",
                "irony_or_punchline_ja": None,
                "bgm_transition": "bgm_intensity_lift",
                "bgm_detail_ja": "中盤で一時無音カットアウト後、終盤にピアノ＋ベースを再投入",
                "next_chapter_bridge_ja": None,
            },
        ],
    }


def _max_object_depth(schema: dict, defs: dict, depth: int = 1) -> int:
    """JSON Schema 内の object ネスト深さ（ルート=1、直下配列アイテム=2）を計測する。"""
    if "$ref" in schema:
        ref_name = schema["$ref"].split("/")[-1]
        return _max_object_depth(defs[ref_name], defs, depth)
    if "anyOf" in schema:
        return max(_max_object_depth(opt, defs, depth) for opt in schema["anyOf"])

    schema_type = schema.get("type")
    if schema_type == "object":
        props = schema.get("properties", {})
        if not props:
            return depth
        return max(_max_object_depth(prop, defs, depth + 1) for prop in props.values())
    if schema_type == "array":
        items = schema.get("items", {})
        return _max_object_depth(items, defs, depth)
    return depth - 1


def _assert_all_required(schema: dict, defs: dict) -> None:
    """全 object スキーマにおいて全プロパティが required に含まれることを検証する。"""
    for obj in [schema, *defs.values()]:
        if obj.get("type") == "object" and "properties" in obj:
            prop_keys = set(obj["properties"].keys())
            req_keys = set(obj.get("required", []))
            assert prop_keys == req_keys, f"Mismatch in required fields: {prop_keys ^ req_keys}"


class _FakeUsage:
    def __init__(self, total: int) -> None:
        self.prompt_token_count = total - 200
        self.candidates_token_count = 150
        self.thoughts_token_count = 50
        self.total_token_count = total


class _FakeModels:
    def __init__(self, handler) -> None:
        self._handler = handler

    def generate_content(self, *, model: str, contents: list, config: types.GenerateContentConfig):
        return self._handler(model=model, contents=contents, config=config)


class _FakeClient:
    def __init__(self, handler) -> None:
        self.models = _FakeModels(handler)


class TestBenchmarkPass2(unittest.TestCase):
    def test_schemas_follow_gemini_fsm_constraints_and_validate(self) -> None:
        for schema_cls in (MacroWinningBlueprint, ChapterBlueprint):
            schema = schema_cls.model_json_schema()
            defs = schema.get("$defs", {})
            _assert_all_required(schema, defs)
            depth = _max_object_depth(schema, defs)
            self.assertLessEqual(depth, 2, f"{schema_cls.__name__} depth exceeded 2: {depth}")

        macro = MacroWinningBlueprint.model_validate_json(json.dumps(_sample_macro_payload()))
        chapter = ChapterBlueprint.model_validate_json(json.dumps(_sample_chapter_payload()))
        self.assertEqual(macro.content_format, "explainer_essay")
        self.assertEqual(len(chapter.chapters), 2)

    def test_make_pass2_video_part_uses_full_video_and_fps(self) -> None:
        url = "https://www.youtube.com/watch?v=C5OJJD3Eytk"
        part = make_pass2_video_part(url, fps=0.5)
        self.assertEqual(part.file_data.file_uri, url)
        self.assertEqual(part.video_metadata.fps, 0.5)
        self.assertIsNone(part.video_metadata.start_offset)
        self.assertIsNone(part.video_metadata.end_offset)

    def test_batch_skips_403_restricted_video_and_continues_next(self) -> None:
        macro_json = json.dumps(_sample_macro_payload(), ensure_ascii=False)
        chapter_json = json.dumps(_sample_chapter_payload(), ensure_ascii=False)
        seen_configs: list[types.GenerateContentConfig] = []

        def handler(*, model: str, contents: list, config: types.GenerateContentConfig):
            seen_configs.append(config)
            video_part = contents[0]
            uri = video_part.file_data.file_uri
            if "RESTRICTED" in uri:
                raise APIError(403, {"error": {"message": "Video is private or restricted"}}, None)
            if len(seen_configs) % 2 == 0 or "ChapterBlueprint" in str(config.response_json_schema):
                schema_title = (config.response_json_schema or {}).get("title")
                if schema_title == "MacroWinningBlueprint":
                    return SimpleNamespace(text=macro_json, usage_metadata=_FakeUsage(1200))
                return SimpleNamespace(text=chapter_json, usage_metadata=_FakeUsage(1500))
            return SimpleNamespace(text=macro_json, usage_metadata=_FakeUsage(1200))

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "configs").mkdir()
            targets = [
                VideoTarget(slug="restricted-vid", url="https://www.youtube.com/watch?v=RESTRICTED"),
                VideoTarget(slug="valid-vid", url="https://www.youtube.com/watch?v=VALID123"),
            ]
            results = run_pass2_batch(
                targets,
                model="gemini-4-neon",
                fps=0.5,
                repo_root=root,
                client=_FakeClient(handler),
                retry_delays=(0.0,),
            )

            self.assertEqual(len(results), 2)
            self.assertEqual(results[0]["status"], "skipped_video_restricted")
            self.assertEqual(results[1]["status"], "ok")

            err_file = root / "episodes" / "benchmarks" / "restricted-vid" / "04_pass2_error.json"
            self.assertTrue(err_file.is_file())
            err_data = json.loads(err_file.read_text(encoding="utf-8"))
            self.assertEqual(err_data["code"], 403)

            macro_file = root / "episodes" / "benchmarks" / "valid-vid" / "04_pass2_macro.json"
            chapter_file = root / "episodes" / "benchmarks" / "valid-vid" / "04b_chapter_blueprint.json"
            self.assertTrue(macro_file.is_file())
            self.assertTrue(chapter_file.is_file())
            MacroWinningBlueprint.model_validate_json(macro_file.read_text(encoding="utf-8"))
            ChapterBlueprint.model_validate_json(chapter_file.read_text(encoding="utf-8"))

            for cfg in seen_configs:
                self.assertEqual(cfg.media_resolution, types.MediaResolution.MEDIA_RESOLUTION_LOW)

    def test_api_key_invalid_400_is_not_skipped(self) -> None:
        exc = APIError(400, {"error": {"message": "API_KEY_INVALID: API key not valid"}}, None)
        self.assertTrue(is_api_key_error(exc))

        def handler(*, model: str, contents: list, config: types.GenerateContentConfig):
            raise exc

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "configs").mkdir()
            with self.assertRaises(APIError):
                run_pass2_batch(
                    [VideoTarget(slug="any-vid", url="https://www.youtube.com/watch?v=ANY")],
                    repo_root=root,
                    client=_FakeClient(handler),
                    retry_delays=(0.0,),
                )

    def test_cli_arg_parsing_single_and_batch_targets(self) -> None:
        parser = build_arg_parser()

        args_batch = parser.parse_args(
            [
                "--target",
                "slug-a=https://www.youtube.com/watch?v=aaa",
                "--target",
                "slug-b=https://www.youtube.com/watch?v=bbb",
                "--model",
                "gemini-4-neon",
                "--fps",
                "0.5",
            ]
        )
        targets_batch = resolve_targets(args_batch)
        self.assertEqual(
            targets_batch,
            [
                VideoTarget(slug="slug-a", url="https://www.youtube.com/watch?v=aaa"),
                VideoTarget(slug="slug-b", url="https://www.youtube.com/watch?v=bbb"),
            ],
        )

        args_single = parser.parse_args(
            ["--url", "https://www.youtube.com/watch?v=ccc", "--slug", "slug-c"]
        )
        targets_single = resolve_targets(args_single)
        self.assertEqual(
            targets_single,
            [VideoTarget(slug="slug-c", url="https://www.youtube.com/watch?v=ccc")],
        )

        with patch("yt_engine.analyzer.benchmark_pass2.run_pass2_batch") as mock_batch:
            mock_batch.return_value = [{"slug": "slug-a", "status": "ok", "usage": {}}]
            code = main(["--target", "slug-a=https://www.youtube.com/watch?v=aaa"])
            self.assertEqual(code, 0)
            mock_batch.assert_called_once()


if __name__ == "__main__":
    unittest.main()
