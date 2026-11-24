"""yt_engine.thumbnail_builder v2（自由舞台 <Still> 正式ルート）の契約スキーマ・機械バリデーション・CLI テスト。"""

from __future__ import annotations

import copy
import json
import struct
import tempfile
import unittest
from pathlib import Path

from yt_engine.config import find_repo_root
from yt_engine.thumbnail_builder import (
    ThumbnailPackageSpec,
    extract_registered_still_ids,
    main as thumbnail_cli_main,
    read_png_dimensions,
    run_thumbnail_build,
    validate_rendered_outputs,
    validate_thumbnail_spec,
)


def _write_dummy_png(path: Path, width: int, height: int, extra_padding: int = 0) -> None:
    """Pillow非依存で有効な PNG IHDR ヘッダ付きダミーファイルを生成する。"""
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr_chunk = struct.pack(">I", len(ihdr_data)) + b"IHDR" + ihdr_data + b"\x00\x00\x00\x00"
    iend_chunk = struct.pack(">I", 0) + b"IEND" + b"\x00\x00\x00\x00"
    payload = b"\x89PNG\r\n\x1a\n" + ihdr_chunk + iend_chunk + (b"\x00" * extra_padding)
    path.write_bytes(payload)


class TestThumbnailBuilder(unittest.TestCase):
    def setUp(self) -> None:
        self.repo_root = find_repo_root(Path(__file__))
        self.template_specs = [
            self.repo_root / "episodes" / "_templates" / "thumbnails" / "stickman_collage_thumbnail_spec.example.json",
            self.repo_root / "episodes" / "_templates" / "thumbnails" / "plan_e_thumbnail_spec.example.json",
        ]
        self.sample_specs = [*self.template_specs]
        self.base_raw = json.loads(self.template_specs[0].read_text(encoding="utf-8"))

    def test_registered_stills_scan_finds_v2_compositions(self) -> None:
        stills = extract_registered_still_ids(self.repo_root)
        self.assertIsNotNone(stills)
        assert stills is not None
        self.assertIn("ThumbnailFeedComparisonSheet", stills)

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_root = Path(tmpdir)
            thumb_root = tmp_root / "studio" / "src" / "ThumbnailRoot.tsx"
            thumb_root.parent.mkdir(parents=True, exist_ok=True)
            thumb_root.write_text(
                '<Still id="ThumbnailFeedComparisonSheet" />\n<Still id="Thumb-SampleEpisode-A" />\n',
                encoding="utf-8",
            )
            scanned = extract_registered_still_ids(tmp_root)
            self.assertEqual(scanned, {"ThumbnailFeedComparisonSheet", "Thumb-SampleEpisode-A"})

    def test_all_two_format_sample_and_reference_specs_pass_without_warnings(self) -> None:
        for spec_path in self.template_specs:
            with self.subTest(template=spec_path.name):
                val_res = run_thumbnail_build(
                    spec_path,
                    validate_only=True,
                    require_registered_stills=False,
                    repo_root=self.repo_root,
                )
                self.assertTrue(val_res["passed"], f"Validation failed for {spec_path}: {val_res['validation']['errors']}")

                dry_res = run_thumbnail_build(
                    spec_path,
                    dry_run=True,
                    require_registered_stills=False,
                    repo_root=self.repo_root,
                )
                self.assertTrue(dry_res["passed"])
                self.assertEqual(dry_res["mode"], "dry_run")
                kinds = [item["kind"] for item in dry_res["plannedOutputs"]]
                self.assertIn("variant_4k", kinds)
                self.assertIn("variant_textless_4k", kinds)
                self.assertIn("squint_168x94", kinds)
                self.assertIn("comparison_sheet", kinds)

                # 各 variant_4k がエピソード専用自由舞台 compositionId を参照していること
                variant_comps = [item["compositionId"] for item in dry_res["plannedOutputs"] if item["kind"] == "variant_4k"]
                self.assertTrue(all(cid and cid != "ThumbnailRenderer" for cid in variant_comps))

                exit_code = thumbnail_cli_main(["--spec", str(spec_path), "--validate-only"])
                self.assertEqual(exit_code, 0)

    def _validate_mutated(self, mutator, *, require_registered_stills: bool = False):
        raw = copy.deepcopy(self.base_raw)
        mutator(raw)
        spec = ThumbnailPackageSpec.model_validate(raw)
        return validate_thumbnail_spec(
            spec,
            repo_root=self.repo_root,
            check_assets=False,
            check_compositions=True,
            require_registered_stills=require_registered_stills,
        )

    def _error_codes(self, mutator, *, require_registered_stills: bool = False) -> list[str]:
        return [err.code for err in self._validate_mutated(mutator, require_registered_stills=require_registered_stills).errors]

    def test_v2_composition_id_validation_and_registration_gate(self) -> None:
        # 未指定は Error
        codes_missing = self._error_codes(lambda r: r["variants"][0].pop("compositionId", None))
        self.assertIn("MISSING_COMPOSITION_ID", codes_missing)

        # 不正文字（アンダースコア）は Error
        codes_invalid = self._error_codes(lambda r: r["variants"][0].update({"compositionId": "Thumb_Invalid_Id"}))
        self.assertIn("INVALID_COMPOSITION_ID", codes_invalid)

        # 重複 compositionId（stillProps 同一）は Error
        def _dup_comp(r: dict) -> None:
            r["variants"][1]["compositionId"] = r["variants"][0]["compositionId"]

        codes_dup = self._error_codes(_dup_comp)
        self.assertIn("DUPLICATE_COMPOSITION_ID", codes_dup)

        # stillProps が異なれば同一 compositionId の共有も許容
        def _shared_comp_diff_props(r: dict) -> None:
            r["variants"][0]["stillProps"] = {"variant": "A"}
            r["variants"][1]["compositionId"] = r["variants"][0]["compositionId"]
            r["variants"][1]["stillProps"] = {"variant": "B"}

        self.assertNotIn("DUPLICATE_COMPOSITION_ID", self._error_codes(_shared_comp_diff_props))

        # 未登録 ID: pre_script_locked 時は Warning 止まり、final_qa / strict 時は Error
        rep_pre = self._validate_mutated(
            lambda r: (
                r["workflow"].update({"stage": "pre_script_locked"}),
                r["variants"][0].update({"compositionId": "Thumb-FutureEpisode-A"}),
            )
        )
        self.assertTrue(rep_pre.passed)
        self.assertIn("COMPOSITION_ID_NOT_REGISTERED_YET", [w.code for w in rep_pre.warnings])

        rep_final = self._validate_mutated(
            lambda r: (
                r["workflow"].update({"stage": "final_qa"}),
                r["variants"][0].update({"compositionId": "Thumb-FutureEpisode-A"}),
            )
        )
        self.assertFalse(rep_final.passed)
        self.assertIn("COMPOSITION_ID_NOT_REGISTERED", [e.code for e in rep_final.errors])

    def test_rejects_copy_over_20_chars_and_over_2_lines(self) -> None:
        codes_len = self._error_codes(
            lambda r: r["variants"][0].update({"copyLines": ["これは絶対上限二十文字を", "確実に超える長いコピー文"]})
        )
        self.assertIn("COPY_EXCEEDS_MAX_20", codes_len)

        codes_lines = self._error_codes(
            lambda r: r["variants"][0].update({"copyLines": ["一行目", "二行目", "三行目"]})
        )
        self.assertIn("COPY_LINES_TOO_MANY", codes_lines)

    def test_rejects_title_copy_overlap(self) -> None:
        # 丸写し（コピー全体がタイトル内にそのまま含まれる）は Error
        def _set_exact(r: dict) -> None:
            r["videoTitle"] = "マルチタスクが得意な人ほど脳が遅くなる理由"
            r["variants"][0].update({"copyLines": ["マルチタスクが得意な", "人"]})

        codes = self._error_codes(_set_exact)
        self.assertIn("TITLE_COPY_EXACT_OVERLAP", codes)

        # 長い言い換え（タイトルの大部分を連続共有）は Warning 止まり
        def _set_near(r: dict) -> None:
            r["videoTitle"] = "マルチタスクが得意な人ほど脳が遅くなる理由"
            r["variants"][0].update({"copyLines": ["マルチタスクが得意な", "脳はバグる"]})

        rep_near = self._validate_mutated(_set_near)
        self.assertNotIn("TITLE_COPY_EXACT_OVERLAP", [e.code for e in rep_near.errors])
        self.assertIn("TITLE_COPY_NEAR_DUPLICATE", [w.code for w in rep_near.warnings])

    def test_allows_shared_topic_word(self) -> None:
        # 主題語1〜2語の自然な共有は推奨（エラーにも言い換え警告にもならない）
        def _set_shared(r: dict) -> None:
            r["videoTitle"] = "マルチタスクが得意な人ほど実は集中を削られる心理の罠"
            r["variants"][0].update({"copyLines": ["マルチタスクで", "脳が遅くなる"]})

        rep = self._validate_mutated(_set_shared)
        self.assertFalse([e.code for e in rep.errors if e.code.startswith("TITLE_COPY_")])
        self.assertNotIn("TITLE_COPY_NEAR_DUPLICATE", [w.code for w in rep.warnings])

    def test_rejects_more_than_two_triggers(self) -> None:
        codes = self._error_codes(
            lambda r: r["variants"][0].update({"triggers": ["numbers", "loss_avoidance", "surprise"]})
        )
        self.assertIn("TRIGGERS_EXCEED_MAX_2", codes)

    def test_rejects_unlocked_before_script(self) -> None:
        codes = self._error_codes(lambda r: r["workflow"].update({"lockedBeforeScript": False}))
        self.assertIn("WORKFLOW_NOT_LOCKED_BEFORE_SCRIPT", codes)

    def test_rejects_bottom_right_copy_zone_and_low_contrast_and_respects_stroke(self) -> None:
        codes_zone = self._error_codes(lambda r: r["variants"][0].update({"copyZone": "bottom_right"}))
        self.assertIn("COPY_ZONE_BOTTOM_RIGHT", codes_zone)

        # bottom_right 以外の自由な配置（center / top_right 等）では警告・エラーにならない
        for zone in ("center", "top_right", "bottom_center", "right"):
            rep_zone = self._validate_mutated(lambda r, z=zone: r["variants"][0].update({"copyZone": z}))
            self.assertNotIn("COPY_ZONE_BOTTOM_RIGHT", [e.code for e in rep_zone.errors])
            self.assertNotIn("COPY_ZONE_NOT_TOP_LEFT", [w.code for w in rep_zone.warnings])

        # 縁取り・座布団なしで低コントラスト → Error
        codes_contrast = self._error_codes(
            lambda r: r["variants"][0]["colors"].update(
                {"background": "#000000", "textBacking": None, "strokeColor": None, "primaryText": "#222222"}
            )
        )
        self.assertIn("LOW_CONTRAST_PRIMARY", codes_contrast)

        # 信号赤(#D6261D) × 黄(#FFE14A) は単体 3.89:1 だが、黒縁(#151110)付きなら合格
        codes_stroked_ok = self._error_codes(
            lambda r: r["variants"][0]["colors"].update(
                {"background": "#D6261D", "textBacking": None, "emphasisText": "#FFE14A", "strokeColor": "#151110"}
            )
        )
        self.assertNotIn("LOW_CONTRAST_EMPHASIS", codes_stroked_ok)

        # 縁取りがあっても背景対比が 3.0 未満（同系色潰れ）は Error
        codes_stroked_bad = self._error_codes(
            lambda r: r["variants"][0]["colors"].update(
                {"background": "#111111", "textBacking": None, "emphasisText": "#222222", "strokeColor": "#FFFFFF"}
            )
        )
        self.assertIn("LOW_CONTRAST_EMPHASIS", codes_stroked_bad)

    def test_rejects_ai_baked_text_flag_and_prompt_text_request(self) -> None:
        codes_flag = self._error_codes(
            lambda r: r["variants"][0].update(
                {
                    "backgroundAsset": {
                        "sourceType": "ai_generated",
                        "containsAiBakedText": True,
                        "strictlyNoTextEnforced": True,
                    }
                }
            )
        )
        self.assertIn("AI_IMAGE_GENERATION_DISALLOWED", codes_flag)
        self.assertIn("AI_BAKED_TEXT_FORBIDDEN", codes_flag)

        codes_prompt = self._error_codes(
            lambda r: r["variants"][0].update(
                {
                    "backgroundAsset": {
                        "sourceType": "ai_generated",
                        "containsAiBakedText": False,
                        "strictlyNoTextEnforced": True,
                        "prompt": "Dark dramatic room, add bold text overlay in center, STRICTLY NO watermarks",
                    }
                }
            )
        )
        self.assertIn("AI_IMAGE_GENERATION_DISALLOWED", codes_prompt)
        self.assertIn("AI_PROMPT_REQUESTS_TEXT", codes_prompt)

    def test_rejects_official_impersonation_and_forbidden_tools_fonts_format(self) -> None:
        codes_imp = self._error_codes(lambda r: r["compliance"].update({"noOfficialImpersonation": False}))
        self.assertIn("OFFICIAL_IMPERSONATION_FLAG", codes_imp)

        codes_word = self._error_codes(lambda r: r["variants"][0].update({"badgeText": "【公式】解説"}))
        self.assertIn("OFFICIAL_IMPERSONATION_COPY", codes_word)

        codes_font = self._error_codes(lambda r: r.update({"fonts": ["MorisawaUD"]}))
        self.assertIn("FORBIDDEN_FONT", codes_font)

        codes_model = self._error_codes(
            lambda r: r["variants"][0].update(
                {
                    "backgroundAsset": {
                        "sourceType": "ai_generated",
                        "generatorModel": "imagen-4",
                        "strictlyNoTextEnforced": True,
                    }
                }
            )
        )
        self.assertIn("AI_IMAGE_GENERATION_DISALLOWED", codes_model)
        self.assertIn("FORBIDDEN_IMAGE_MODEL", codes_model)

        codes_3d = self._error_codes(lambda r: r.update({"formatId": "plan_d_heavy_3d"}))
        self.assertIn("FORBIDDEN_FORMAT_3D", codes_3d)

        codes_deprecated = self._error_codes(lambda r: r.update({"formatId": "planC_cinematic"}))
        self.assertIn("UNSUPPORTED_FORMAT", codes_deprecated)

    def test_rejects_ab_test_constraints_and_resolution_limits(self) -> None:
        codes_one = self._error_codes(lambda r: r.update({"variants": [r["variants"][0]]}))
        self.assertIn("AB_VARIANT_COUNT", codes_one)

        def _dup_copy(r: dict) -> None:
            r["variants"][1]["copyLines"] = list(r["variants"][0]["copyLines"])

        codes_dup = self._error_codes(_dup_copy)
        self.assertIn("DUPLICATE_VARIANT_COPY", codes_dup)

        # 後方互換：既存エピソードで copyLockedAcrossVariants=True が残っている場合はエラーにしない
        def _dup_copy_legacy_locked(r: dict) -> None:
            r["workflow"]["copyLockedAcrossVariants"] = True
            r["variants"][1]["copyLines"] = list(r["variants"][0]["copyLines"])

        codes_dup_legacy = self._error_codes(_dup_copy_legacy_locked)
        self.assertNotIn("DUPLICATE_VARIANT_COPY", codes_dup_legacy)

        codes_res = self._error_codes(lambda r: r["render"].update({"width": 960, "height": 540}))
        self.assertIn("RENDER_BELOW_720P", codes_res)

        codes_size = self._error_codes(lambda r: r["render"].update({"maxFileSizeMb": 80}))
        self.assertIn("RENDER_MAX_SIZE_INVALID", codes_size)

    def test_png_dimension_reader_and_rendered_output_verification(self) -> None:
        spec = ThumbnailPackageSpec.model_validate(self.base_raw)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            p_4k = tmp_dir / "a_4k.png"
            p_squint = tmp_dir / "a_squint.png"
            p_sheet = tmp_dir / "sheet.png"
            _write_dummy_png(p_4k, 3840, 2160)
            _write_dummy_png(p_squint, 168, 94)
            _write_dummy_png(p_sheet, 2560, 1600)

            self.assertEqual(read_png_dimensions(p_4k), (3840, 2160))
            ok_failures = validate_rendered_outputs(
                spec,
                [
                    {"kind": "variant_4k", "path": str(p_4k), "expectedWidth": 3840, "expectedHeight": 2160},
                    {"kind": "squint_168x94", "path": str(p_squint), "expectedWidth": 168, "expectedHeight": 94},
                    {"kind": "comparison_sheet", "path": str(p_sheet), "expectedWidth": 2560, "expectedHeight": 1600},
                ],
            )
            self.assertEqual(ok_failures, [])

            p_small = tmp_dir / "small.png"
            _write_dummy_png(p_small, 640, 360)
            p_huge = tmp_dir / "huge.png"
            _write_dummy_png(p_huge, 3840, 2160, extra_padding=(51 * 1024 * 1024))
            p_bad_squint = tmp_dir / "bad_squint.png"
            _write_dummy_png(p_bad_squint, 320, 180)

            err_failures = validate_rendered_outputs(
                spec,
                [
                    {"kind": "variant_4k", "path": str(p_small), "expectedWidth": 3840, "expectedHeight": 2160},
                    {"kind": "variant_4k", "path": str(p_huge), "expectedWidth": 3840, "expectedHeight": 2160},
                    {"kind": "squint_168x94", "path": str(p_bad_squint), "expectedWidth": 168, "expectedHeight": 94},
                ],
            )
            self.assertTrue(any("1280×720" in msg for msg in err_failures), err_failures)
            self.assertTrue(any("超過" in msg for msg in err_failures), err_failures)
            self.assertTrue(any("スクイント画像解像度" in msg for msg in err_failures), err_failures)

    def test_show_citation_defaults_false_and_allows_opt_in(self) -> None:
        spec_default = ThumbnailPackageSpec.model_validate(self.base_raw)
        self.assertFalse(spec_default.variants[0].showCitation)

        mutated = copy.deepcopy(self.base_raw)
        mutated["variants"][0]["showCitation"] = True
        spec_opt_in = ThumbnailPackageSpec.model_validate(mutated)
        self.assertTrue(spec_opt_in.variants[0].showCitation)


if __name__ == "__main__":
    unittest.main()
