from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_SRC = REPO_ROOT / "pipeline" / "src"
if str(PIPELINE_SRC) not in sys.path:
    sys.path.insert(0, str(PIPELINE_SRC))

from yt_engine.audio.tts_elevenlabs import CharacterAlignment  # noqa: E402
from yt_engine.stickman_collage_validator import (  # noqa: E402
    audit_stickman_collage_tsx_dir,
    format_validation_report,
    validate_stickman_collage_spec,
)

BUILDER_SCRIPT = REPO_ROOT / "pipeline" / "scripts" / "build_stickman_collage_assets.py"
_SPEC = importlib.util.spec_from_file_location("build_stickman_collage_assets", BUILDER_SCRIPT)
assert _SPEC and _SPEC.loader
builder_mod = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(builder_mod)


class StickmanCollageV2ValidatorAndBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.example_path = REPO_ROOT / "pipeline" / "tests" / "fixtures" / "stickman_collage_spec.fixture.json"
        cls.minimal_template_path = REPO_ROOT / "episodes" / "_templates" / "stickman_collage_spec.example.json"
        cls.example_spec = json.loads(cls.example_path.read_text(encoding="utf-8"))

    def _clone_spec(self) -> dict:
        return copy.deepcopy(self.example_spec)

    def _all_shots(self, spec: dict) -> list[dict]:
        out: list[dict] = []
        for ch in spec["chapters"]:
            out.extend(ch["shots"])
        return out

    def test_example_spec_passes_and_cli_modes_succeed(self) -> None:
        rep = validate_stickman_collage_spec(self.example_spec)
        self.assertTrue(rep.passed, format_validation_report(rep))
        self.assertEqual(rep.errors, [])
        self.assertEqual(rep.warnings, [])
        self.assertEqual(rep.metrics["tsx_scene_shots"], 4)

        for flag in ("--validate-only", "--dry-run"):
            proc = subprocess.run(
                [sys.executable, str(BUILDER_SCRIPT), "--spec", str(self.example_path), flag],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
            self.assertIn("PASSED (Errors: 0, Warnings: 0)", proc.stdout)
            if flag == "--dry-run":
                self.assertIn('"tsx_scene_shots": 4', proc.stdout)
                self.assertIn('"declared_beats"', proc.stdout)

    def test_tsx_scene_registry_inline_var_arrow_and_unregistered_errors(self) -> None:
        spec = self._clone_spec()
        with tempfile.TemporaryDirectory() as tmp:
            tsx_dir = Path(tmp)
            # 1) インライン customScenes={{...}} + 変数 customScenes={SCENES} + アロー関数混在
            (tsx_dir / "scenes.tsx").write_text(
                """
import React from 'react';
import type { StickmanSceneProps } from '../../../components/stickman_collage';

export const BookstoreHookScene: React.FC<StickmanSceneProps> = ({ sec, cue, resolveAsset }) => {
  const photo = resolveAsset('photo_bookstore');
  const t1 = cue('本屋', 0.1);
  const t2 = cue('三冊まとめて', 2.2);
  return <div>{photo?.src}{sec >= t1 ? 'A' : null}{sec >= t2 ? 'B' : null}</div>;
};

export const SaladChickenIronyScene: React.FC<StickmanSceneProps> = ({ sec, cue }) => {
  const t1 = cue('まだ一ページ', 0.1);
  const t2 = cue('サラダチキン', 4.0);
  return <div>{sec >= t1 ? 'A' : null}{sec >= t2 ? 'B' : null}</div>;
};

const EXTRA_SCENES: Record<string, React.FC<StickmanSceneProps>> = {
  PrepayMechanismScene: ({ sec, cue }) => {
    const t = cue('先払い', 2.0);
    return <div data-t={t}>{sec}</div>;
  },
  SmartphoneRehookScene: ({ sec, resolveAsset }) => {
    const p = resolveAsset('photo_smartphone_night');
    return <div>{p?.src}{sec}</div>;
  },
};

export const CompA: React.FC<any> = ({ spec }) => (
  <StickmanCollageTemplate
    spec={spec}
    customScenes={{
      BookstoreHookScene,
      'SaladChickenIronyScene': (props) => <SaladChickenIronyScene {...props} />,
    }}
  />
);

export const CompB: React.FC<any> = ({ spec }) => (
  <StickmanCollageTemplate spec={spec} customScenes={EXTRA_SCENES} />
);
""",
                encoding="utf-8",
            )
            rep_ok = validate_stickman_collage_spec(spec, tsx_dir=tsx_dir)
            self.assertTrue(rep_ok.passed, format_validation_report(rep_ok))
            self.assertEqual(
                set(rep_ok.metrics["tsx_registered_scene_keys"]),
                {
                    "BookstoreHookScene",
                    "SaladChickenIronyScene",
                    "PrepayMechanismScene",
                    "SmartphoneRehookScene",
                },
            )

            # 2) 未登録キー + 空 component エラー
            bad_spec = self._clone_spec()
            shots = self._all_shots(bad_spec)
            shots[0]["scene"]["component"] = "MissingSceneComponent"
            shots[1]["scene"]["component"] = ""
            rep_bad = validate_stickman_collage_spec(bad_spec, tsx_dir=tsx_dir)
            self.assertFalse(rep_bad.passed)
            joined = "\n".join(rep_bad.errors)
            self.assertIn("未登録の TSX シーンキー 'MissingSceneComponent'", joined)
            self.assertIn("scene.component が未指定", joined)

    def test_unresolved_asset_ids_fail_across_all_locations(self) -> None:
        spec = self._clone_spec()
        shots = self._all_shots(spec)
        shots[0]["scene"]["assetIds"] = ["missing_scene_asset"]
        shots[3]["photoLayer"]["assetId"] = "missing_photo_layer"
        shots[3]["diagram"]["params"]["imageAssetId"] = "missing_diag_img"
        shots[5]["diagram"]["params"]["cards"][0]["assetId"] = "missing_card_asset"

        with tempfile.TemporaryDirectory() as tmp:
            tsx_dir = Path(tmp)
            (tsx_dir / "ep.tsx").write_text(
                """
const SCENES = {
  BookstoreHookScene: ({ resolveAsset }) => <div>{resolveAsset('missing_tsx_asset')?.src}</div>,
  SaladChickenIronyScene: () => <div />,
  PrepayMechanismScene: () => <div />,
  SmartphoneRehookScene: () => <div />,
};
export const Ep = ({ spec }) => <StickmanCollageTemplate spec={spec} customScenes={SCENES} />;
""",
                encoding="utf-8",
            )
            rep = validate_stickman_collage_spec(spec, tsx_dir=tsx_dir)
            self.assertFalse(rep.passed)
            joined = "\n".join(rep.errors)
            self.assertIn("missing_scene_asset", joined)
            self.assertIn("missing_photo_layer", joined)
            self.assertIn("missing_diag_img", joined)
            self.assertIn("missing_card_asset", joined)
            self.assertIn("missing_tsx_asset", joined)

    def test_out_of_bounds_beats_sfx_and_timeline_fail(self) -> None:
        spec = self._clone_spec()
        shots = self._all_shots(spec)
        shots[0]["beats"][0]["offsetSec"] = -0.2
        shots[0]["beats"][2]["offsetSec"] = 12.0
        shots[0]["sfx"][0]["offsetSec"] = 9.5
        shots[3]["photoLayer"]["beatIndex"] = 9

        tl = {
            "shots": [
                {
                    "chunkId": shots[0]["chunkId"],
                    "startSec": 0.0,
                    "endSec": 6.0,
                    "beatTimesSec": [0.1, 1.8, 7.2],
                }
            ]
        }
        rep = validate_stickman_collage_spec(spec, timeline=tl)
        self.assertFalse(rep.passed)
        joined = "\n".join(rep.errors)
        self.assertIn("c01_bookstore_hook.beats[0]", joined)
        self.assertIn("c01_bookstore_hook.beats[2]", joined)
        self.assertIn("c01_bookstore_hook.sfx[0]", joined)
        self.assertIn("c04_gollwitzer_2009.photoLayer.beatIndex", joined)
        self.assertIn("timeline.beatTimesSec=7.20s", joined)

    def test_clip_cards_and_badge_subtext_prohibited(self) -> None:
        spec = self._clone_spec()
        shots = self._all_shots(spec)
        shots[3]["diagram"] = {
            "kind": "kinetic_list",
            "params": {
                "variant": "clip_cards",
                "items": [{"text": "項目1", "badge": "STEP1", "subText": "補足"}],
            },
        }
        rep = validate_stickman_collage_spec(spec)
        self.assertFalse(rep.passed)
        joined = "\n".join(rep.errors)
        self.assertIn("variant='clip_cards'", joined)
        self.assertIn("badge / subText", joined)

    def test_tsx_static_saas_patterns_fail_without_false_positive_on_none(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tsx_dir = Path(tmp)
            # 1) 正常（borderLeft: 'none' は誤爆しない）
            (tsx_dir / "clean.tsx").write_text(
                """
export const CleanBox = () => (
  <div style={{ borderLeft: 'none', borderRadius: 0, color: '#57534E' }}>OK</div>
);
""",
                encoding="utf-8",
            )
            rep_clean = audit_stickman_collage_tsx_dir(tsx_dir)
            self.assertTrue(rep_clean.passed, format_validation_report(rep_clean))

            # 2) 全 SaaS 禁止パターン検出
            (tsx_dir / "bad.tsx").write_text(
                """
export const BadBox = () => (
  <div
    style={{
      backgroundColor: '#0F172A',
      borderLeft: '12px solid #FFCC00',
      borderRadius: 999,
      color: '#CBD5E1',
      borderColor: '#475569',
    }}
  >
    <Kinetic variant="clip_cards" showCitation={true} />
    <span>{'出典: テスト'}</span>
  </div>
);
""",
                encoding="utf-8",
            )
            rep_bad = audit_stickman_collage_tsx_dir(tsx_dir)
            self.assertFalse(rep_bad.passed)
            joined = "\n".join(rep_bad.errors)
            self.assertIn("SaaSダークUIカード色", joined)
            self.assertIn("borderLeft", joined)
            self.assertIn("borderRadius: 999", joined)
            self.assertIn("Tailwind slate", joined)
            self.assertIn("clip_cards", joined)
            self.assertIn("画面内出典表示", joined)

    def test_10s_target_limit_removed_and_actual_static_gap_warns(self) -> None:
        spec = self._clone_spec()
        shots = self._all_shots(spec)
        # 10秒上限エラーは廃止されているため PASSED になること（実尺イベント間隔が <= 4.5s の場合）
        shots[4]["targetDurationSec"] = 12.5
        shots[4]["beats"] = [
            {"beatIndex": 0, "offsetSec": 0.2, "phraseJa": "前半", "action": "stagger_grid"},
            {"beatIndex": 1, "offsetSec": 4.2, "phraseJa": "中盤", "action": "animate_metric"},
            {"beatIndex": 2, "offsetSec": 8.2, "phraseJa": "後半", "action": "pop_callout"},
        ]
        tl_ok = {
            "shots": [
                {
                    "chunkId": shots[4]["chunkId"],
                    "startSec": 0.0,
                    "endSec": 12.2,
                    "beatTimesSec": [0.2, 4.2, 8.2],
                }
            ]
        }
        rep_ok = validate_stickman_collage_spec(spec, timeline=tl_ok)
        self.assertTrue(rep_ok.passed, format_validation_report(rep_ok))
        self.assertEqual(rep_ok.warnings, [])

        # 実尺ベースで 4.5秒を超える静止区間があれば WARNING
        shots[4]["beats"] = [
            {"beatIndex": 0, "offsetSec": 0.2, "phraseJa": "前半", "action": "stagger_grid"},
            {"beatIndex": 1, "offsetSec": 1.0, "phraseJa": "中盤", "action": "animate_metric"},
            {"beatIndex": 2, "offsetSec": 2.0, "phraseJa": "後半", "action": "pop_callout"},
        ]
        tl_frozen = {
            "shots": [
                {
                    "chunkId": shots[4]["chunkId"],
                    "startSec": 0.0,
                    "endSec": 12.0,
                    "beatTimesSec": [0.2, 1.0, 2.0],
                }
            ]
        }
        rep_frozen = validate_stickman_collage_spec(spec, timeline=tl_frozen)
        self.assertTrue(rep_frozen.passed)
        self.assertTrue(any("視覚イベント無変化区間" in w and "> 4.5s" in w for w in rep_frozen.warnings), rep_frozen.warnings)

        # timeline 無しでも narrationJa 推定実尺が長くイベントが固まっていれば WARNING
        spec2 = self._clone_spec()
        s4 = self._all_shots(spec2)[4]
        s4["targetDurationSec"] = 3.0  # 嘘申告
        s4["narrationJa"] = "九十四の研究をまとめた大規模なメタ分析によってようやく明らかになったのは、やる気ではなく具体的な条件分岐の設計でした。"
        s4["subtitleSegments"] = [
            {"line1": "94の研究をまとめた大規模な", "line2": "メタ分析によってようやく"},
            {"line1": "明らかになったのは、やる気ではなく", "line2": "具体的な条件分岐の設計でした。"},
        ]
        s4["beats"] = [{"beatIndex": 0, "offsetSec": 0.1, "phraseJa": "九十四", "action": "stagger_grid"}]
        s4["sfx"] = [{"kind": "whoosh", "offsetSec": 0.1}]
        s4["callout"]["beatIndex"] = 0
        rep_est = validate_stickman_collage_spec(spec2)
        self.assertTrue(rep_est.passed, format_validation_report(rep_est))
        self.assertTrue(any("視覚イベント無変化区間" in w for w in rep_est.warnings), rep_est.warnings)

    def test_hero_tsx_warning_dead_field_warning_and_relaxed_real_assets(self) -> None:
        spec = self._clone_spec()
        shots = self._all_shots(spec)
        # Hero ショットから scene.mode='tsx' を外すと警告
        del shots[0]["scene"]
        shots[0]["layoutArchetype"] = "collage_stage"
        shots[0]["photoLayer"] = {"assetId": "photo_bookstore", "variant": "tape_scrap", "beatIndex": 0}
        # 死にフィールド secondaryPhotoLayers を載せると警告
        shots[3]["secondaryPhotoLayers"] = [{"assetId": "person_gollwitzer"}]
        # 一般名詞キーワード（本・サラダチキン・時計・スマホ・コンビニ）は警告なし、実在人名未カバーは警告
        shots[4]["narrationJa"] = "コンビニでサラダチキンと時計とスマホを買ったロバート・チャルディーニの実験。"
        shots[4]["subtitleSegments"] = [
            {"line1": "コンビニでサラダチキンと", "line2": "時計とスマホを買った"},
            {"line1": "ロバート・チャルディーニの実験。"},
        ]

        rep = validate_stickman_collage_spec(spec)
        self.assertTrue(rep.passed, format_validation_report(rep))
        joined_w = "\n".join(rep.warnings)
        self.assertIn("Hero ショット", joined_w)
        self.assertIn("secondaryPhotoLayers", joined_w)
        self.assertIn("ロバート・チャルディーニ", joined_w)
        self.assertNotIn("'サラダチキン'", joined_w)
        self.assertNotIn("'スマホ'", joined_w)
        self.assertNotIn("'時計'", joined_w)

    def test_subtitle_switch_follows_repeated_phrase_after_pause(self) -> None:
        shot = {
            "chunkId": "c01", "startSec": 10.0, "endSec": 18.0,
            "alignment": {
                "characters": list("ジップだ。まただ。"),
                "charStartSec": [0.2, 0.3, 0.4, 0.5, 0.6, 4.8, 5.0, 5.2, 5.4],
                "charEndSec": [0.3, 0.4, 0.5, 0.6, 0.7, 5.0, 5.2, 5.4, 5.5],
            },
            "subtitleSegments": [{"line1": "ジップだ。", "line2": "また"}, {"line1": "だ。"}],
        }
        cues = builder_mod.aligned_subtitles(shot)
        self.assertEqual([(c["startSec"], c["endSec"]) for c in cues], [(10.2, 15.2), (15.2, 15.5)])
        tl = {"shots": [shot], "subtitles": cues}
        self.assertFalse(any("字幕同期" in e for e in validate_stickman_collage_spec(self._clone_spec(), timeline=tl).errors))
        cues[1]["startSec"] = cues[0]["endSec"] = 14.0
        self.assertTrue(any("字幕同期" in e for e in validate_stickman_collage_spec(self._clone_spec(), timeline=tl).errors))

    def test_build_assets_alignment_extraction_and_phrase_resolution(self) -> None:
        joined = "本屋で三冊まとめて買った。\nサラダチキン。"
        chars = list(joined)
        starts = [round(0.2 + i * 0.15, 4) for i in range(len(chars))]
        ends = [round(s + 0.14, 4) for s in starts]
        align = CharacterAlignment(
            characters=tuple(chars),
            start_times_sec=tuple(starts),
            end_times_sec=tuple(ends),
        )

        # チャンク0 ("本屋で三冊まとめて買った。"), a_off=0.35, c_start=0.0
        reading = "本屋で三冊まとめて買った。"
        shot_align = builder_mod._extract_shot_alignment(
            align,
            joined,
            char_offset=0,
            reading=reading,
            a_off=0.35,
            c_start=0.0,
            s_start=0.35,
            s_end=2.6,
        )
        self.assertEqual(shot_align["source"], "elevenlabs_with_timestamps")
        self.assertEqual(shot_align["text"], reading)
        self.assertEqual(len(shot_align["charStartSec"]), len(reading))
        self.assertGreater(len(shot_align["phrases"]), 0)

        # 「まとめ買い」は活用形プレフィックス「まとめて」へ一致（index 5: "ま" -> 0.35 + (0.2 + 5*0.15) = 1.30）
        rel_buy = builder_mod._resolve_phrase_in_alignment(shot_align, "まとめ買い")
        self.assertIsNotNone(rel_buy)
        self.assertAlmostEqual(rel_buy, 1.30, places=3)

        # 「3冊」は漢数字「三冊」へ一致（index 3: "三" -> 0.35 + (0.2 + 3*0.15) = 1.00）
        rel_books = builder_mod._resolve_phrase_in_alignment(shot_align, "3冊")
        self.assertIsNotNone(rel_books)
        self.assertAlmostEqual(rel_books, 1.00, places=3)

    def test_all_8_polarities_allowed_and_light_bg_consistency(self) -> None:
        all_8 = [
            "black",
            "white_sketch",
            "grid_paper",
            "wood_desk",
            "kraft_cork",
            "blueprint",
            "cream_notebook",
            "light_table",
        ]
        # 1) 全8種がエラーなく通り、dry-run 集計でも8種すべてカウントされる
        spec = self._clone_spec()
        shots = self._all_shots(spec)
        base_shot = copy.deepcopy(shots[3])
        spec["chapters"] = [
            {
                "chapterIndex": 1,
                "topicId": "all_8_polarities",
                "titleJa": "全8背景極性チェック",
                "defaultPolarity": "black",
                "shots": [],
            }
        ]
        for idx, pol in enumerate(all_8):
            sh = copy.deepcopy(base_shot)
            sh["shotIndex"] = idx + 1
            sh["chunkId"] = f"pol_{idx:02d}_{pol}"
            sh["polarity"] = pol
            # 中間明度 wood_desk / kraft_cork は lightBg のどちら指定も許容される
            sh["lightBg"] = pol in {"white_sketch", "grid_paper", "cream_notebook", "light_table", "wood_desk"}
            spec["chapters"][0]["shots"].append(sh)

        rep_ok = validate_stickman_collage_spec(spec)
        self.assertTrue(rep_ok.passed, format_validation_report(rep_ok))
        self.assertEqual(set(rep_ok.metrics["unique_polarities"]), set(all_8))

        summary = builder_mod._estimate_dry_run_summary(spec)
        for pol in all_8:
            self.assertEqual(summary["polarity_counts"][pol], 1)

        # 2) 不正極性および暗・明の lightBg 矛盾はエラー
        bad = self._clone_spec()
        b_shots = self._all_shots(bad)
        b_shots[0]["polarity"] = "unknown_stage"
        b_shots[1]["polarity"] = "blueprint"
        b_shots[1]["lightBg"] = True
        b_shots[2]["polarity"] = "light_table"
        b_shots[2]["lightBg"] = False
        rep_bad = validate_stickman_collage_spec(bad)
        self.assertFalse(rep_bad.passed)
        joined = "\n".join(rep_bad.errors)
        self.assertIn("invalid polarity 'unknown_stage'", joined)
        self.assertIn("contradicts polarity='blueprint'", joined)
        self.assertIn("contradicts polarity='light_table'", joined)

    def test_tsx_out_relative_import_path_auto_calculation(self) -> None:
        cases = [
            (
                REPO_ROOT / "studio" / "src" / "compositions" / "episodes" / "ep01" / "timeline.ts",
                "../../../components/stickman_collage",
            ),
            (
                REPO_ROOT
                / "studio"
                / "src"
                / "compositions"
                / "ab_tests"
                / "stickman_v2_4cut"
                / "v2_opus"
                / "v2OpusTimeline.ts",
                "../../../../components/stickman_collage",
            ),
            (
                REPO_ROOT / "studio" / "src" / "compositions" / "a" / "b" / "c" / "d" / "timeline.ts",
                "../../../../../components/stickman_collage",
            ),
            (
                REPO_ROOT / "studio" / "src" / "components" / "timeline.ts",
                "./stickman_collage",
            ),
            (
                REPO_ROOT / "studio" / "src" / "components" / "stickman_collage" / "timeline.ts",
                "./index",
            ),
        ]
        for out_path, expected in cases:
            actual = builder_mod._compute_stickman_components_import_path(out_path, repo_root=REPO_ROOT)
            self.assertEqual(actual, expected, f"Failed for {out_path}")

    def test_subtraction_discipline_warnings_do_not_fail_validation(self) -> None:
        # 1) クリーンな TSX (<Stage crisp={...}> / <Stage.Crisp>、短文、十分 cue()、十分 fontSize) は WARNING ゼロ
        spec_clean = self._clone_spec()
        with tempfile.TemporaryDirectory() as tmp:
            clean_dir = Path(tmp)
            (clean_dir / "scenes.tsx").write_text(
                """
import React from 'react';
import { Stage, RiggedStickman, HandText, createStandPose, type StickmanSceneProps } from '../../../components/stickman_collage';

export const BookstoreHookScene: React.FC<StickmanSceneProps> = ({ sec, cue, theme, resolveAsset }) => {
  const _p = resolveAsset('photo_bookstore');
  const t1 = cue('本屋', 0.2);
  const t2 = cue('三冊まとめて', 2.4);
  return (
    <Stage
      sec={sec}
      theme={theme}
      crisp={<HandText x={960} y={180} text="×3" size={88} fill={theme.accentPrimary} />}
    >
      <RiggedStickman p={createStandPose(900)} theme={theme} />
      {sec >= t1 && sec >= t2 ? null : null}
    </Stage>
  );
};

export const SaladChickenIronyScene: React.FC<StickmanSceneProps> = ({ sec, cue, theme }) => {
  const t1 = cue('一ページ', 0.2);
  const t2 = cue('サラダチキン', 3.5);
  return (
    <Stage sec={sec} theme={theme} manualLayers>
      <Stage.Boil>
        <RiggedStickman p={createStandPose(800)} theme={theme} />
      </Stage.Boil>
      <Stage.Crisp>
        <HandText x={400} y={240} text="0ページ" size={44} fill={theme.ink} />
      </Stage.Crisp>
      {sec >= t1 && sec >= t2 ? null : null}
    </Stage>
  );
};

export const PrepayMechanismScene: React.FC<StickmanSceneProps> = ({ sec, cue, theme }) => {
  const t1 = cue('本を買って', 0.2);
  const t2 = cue('先払い', 3.0);
  return <div data-t={t1 + t2 + sec} style={{ fontSize: 36, color: theme.ink }} />;
};

export const SmartphoneRehookScene: React.FC<StickmanSceneProps> = ({ sec, cue, theme, resolveAsset }) => {
  const _p = resolveAsset('photo_smartphone_night');
  const t1 = cue('深夜二時', 0.2);
  const t2 = cue('切り分け', 3.0);
  return <div data-t={t1 + t2 + sec} style={{ fontSize: 32, color: theme.ink }} />;
};

export const Comp: React.FC<any> = ({ spec }) => (
  <StickmanCollageTemplate
    spec={spec}
    customScenes={{
      BookstoreHookScene,
      SaladChickenIronyScene,
      PrepayMechanismScene,
      SmartphoneRehookScene,
    }}
  />
);
""",
                encoding="utf-8",
            )
            rep_clean = validate_stickman_collage_spec(spec_clean, tsx_dir=clean_dir)
            self.assertTrue(rep_clean.passed, format_validation_report(rep_clean))
            self.assertEqual(rep_clean.metrics["tsx_text_in_boil_warnings"], 0)
            self.assertEqual(rep_clean.metrics["tsx_long_text_warnings"], 0)
            self.assertEqual(rep_clean.metrics["tsx_tiny_visual_warnings"], 0)
            self.assertEqual(rep_clean.metrics["tsx_low_cue_density_warnings"], 0)

        # 2) 引き算規律違反パターンはすべて WARNING に留まり、Error にはならない
        spec_warn = self._clone_spec()
        shots = self._all_shots(spec_warn)
        shots[4]["callout"]["textJa"] = "これは二十四文字を超える非常に長い画面内の説明文章テストです。"
        with tempfile.TemporaryDirectory() as tmp:
            warn_dir = Path(tmp)
            (warn_dir / "scenes.tsx").write_text(
                """
import React from 'react';
import { BoilSvg, Stage, HandText, type StickmanSceneProps } from '../../../components/stickman_collage';

export const BookstoreHookScene: React.FC<StickmanSceneProps> = ({ sec, theme, resolveAsset }) => {
  const _p = resolveAsset('photo_bookstore');
  // cue() 0回、かつボイル内に <text>、長文、極小 fontSize/scale
  return (
    <Stage sec={sec} theme={theme}>
      <BoilSvg width={200} height={100}>
        <text x={10} y={20} fontSize={14}>ボイル内の極小文字</text>
      </BoilSvg>
      <HandText x={400} y={300} text="画面内に長く説明文を書いてしまうアンチパターン文字列です" size={16} fill={theme.ink} />
      <div style={{ transform: 'scale(0.35)' }}>tiny</div>
    </Stage>
  );
};

export const SaladChickenIronyScene: React.FC<StickmanSceneProps> = ({ sec, cue }) => {
  const t1 = cue('一ページ', 0.2);
  // 7.4s に対して cue 1回 (> 5.0s/回)
  return <div data-t={t1 + sec} />;
};

export const PrepayMechanismScene: React.FC<StickmanSceneProps> = ({ sec, cue }) => {
  const t1 = cue('本を買って', 0.2);
  const t2 = cue('先払い', 2.8);
  return <div data-t={t1 + t2 + sec} />;
};

export const SmartphoneRehookScene: React.FC<StickmanSceneProps> = ({ sec, cue, resolveAsset }) => {
  const _p = resolveAsset('photo_smartphone_night');
  const t1 = cue('深夜二時', 0.2);
  const t2 = cue('切り分け', 2.8);
  return <div data-t={t1 + t2 + sec} />;
};

export const Comp: React.FC<any> = ({ spec }) => (
  <StickmanCollageTemplate
    spec={spec}
    customScenes={{
      BookstoreHookScene,
      SaladChickenIronyScene,
      PrepayMechanismScene,
      SmartphoneRehookScene,
    }}
  />
);
""",
                encoding="utf-8",
            )
            rep_warn = validate_stickman_collage_spec(spec_warn, tsx_dir=warn_dir)
            self.assertTrue(rep_warn.passed, format_validation_report(rep_warn))
            self.assertEqual(rep_warn.errors, [])
            self.assertGreaterEqual(rep_warn.metrics["tsx_text_in_boil_warnings"], 1)
            self.assertGreaterEqual(rep_warn.metrics["tsx_long_text_warnings"], 1)
            self.assertGreaterEqual(rep_warn.metrics["spec_long_text_warnings"], 1)
            self.assertGreaterEqual(rep_warn.metrics["tsx_tiny_visual_warnings"], 3)
            self.assertGreaterEqual(rep_warn.metrics["tsx_low_cue_density_warnings"], 2)

    def test_tsx_comments_do_not_trigger_false_positive_errors(self) -> None:
        spec = self._clone_spec()
        with tempfile.TemporaryDirectory() as tmp:
            tsx_dir = Path(tmp)
            (tsx_dir / "scenes.tsx").write_text(
                """
import React from 'react';
import { Stage, type StickmanSceneProps } from '../../../components/stickman_collage';

// 注意: #0F172A / #1E293B / #CBD5E1 / borderLeft: '4px solid red' / borderRadius: 999 / variant='clip_cards' 禁止
/* showCitation: true や resolveAsset('nonexistent_comment_asset') や <Composition id="bad_id" /> はコメント内 */
export const BookstoreHookScene: React.FC<StickmanSceneProps> = ({ sec, cue, theme, resolveAsset }) => {
  const _p = resolveAsset('photo_bookstore');
  const t1 = cue('本屋', 0.2);
  const t2 = cue('まとめ買い', 2.4);
  return <Stage sec={sec} theme={theme} crisp={<div data-t={t1 + t2} />} />;
};
export const SaladChickenIronyScene: React.FC<StickmanSceneProps> = ({ sec, cue }) => <div data-t={cue('一ページ', 0.2) + sec} />;
export const PrepayMechanismScene: React.FC<StickmanSceneProps> = ({ sec, cue }) => <div data-t={cue('先払い', 0.2) + sec} />;
export const SmartphoneRehookScene: React.FC<StickmanSceneProps> = ({ sec, cue, resolveAsset }) => {
  const _p = resolveAsset('photo_smartphone_night');
  return <div data-t={cue('深夜二時', 0.2) + sec} />;
};
export const Comp: React.FC<any> = ({ spec }) => (
  <StickmanCollageTemplate
    spec={spec}
    customScenes={{ BookstoreHookScene, SaladChickenIronyScene, PrepayMechanismScene, SmartphoneRehookScene }}
  />
);
""",
                encoding="utf-8",
            )
            rep = validate_stickman_collage_spec(spec, tsx_dir=tsx_dir)
            self.assertTrue(rep.passed, format_validation_report(rep))
            self.assertEqual(rep.errors, [])

    def test_chapter_eyecatch_spec_validation_and_dry_run(self) -> None:
        spec = self._clone_spec()
        rep_ok = validate_stickman_collage_spec(spec)
        self.assertTrue(rep_ok.passed, format_validation_report(rep_ok))
        self.assertEqual(rep_ok.metrics["chapter_eyecatches"], 1)

        summary = builder_mod._estimate_dry_run_summary(spec)
        self.assertEqual(summary["chapter_eyecatches"], 1)
        self.assertAlmostEqual(summary["eyecatch_total_sec"], 1.5, places=2)

        # 不正な variant・最小無音間未満・負の leadInSec・過大 sfxVolume はすべて ERROR
        bad = self._clone_spec()
        bad["chapters"][1]["eyecatch"] = {
            "variant": "unknown_variant",
            "showName": "yes",
            "leadInSec": -0.1,
            "durationSec": 0.2,
            "postPauseSec": 0.05,
            "sfxVolume": 3.5,
        }
        rep_bad = validate_stickman_collage_spec(bad)
        self.assertFalse(rep_bad.passed)
        joined = "\n".join(rep_bad.errors)
        self.assertIn("eyecatch.variant", joined)
        self.assertIn("eyecatch.showName", joined)
        self.assertIn("eyecatch.leadInSec", joined)
        self.assertIn("eyecatch.durationSec", joined)
        self.assertIn("eyecatch.postPauseSec", joined)
        self.assertIn("eyecatch.sfxVolume", joined)

    def test_chapter_eyecatch_slot_computation_and_timeline_contract(self) -> None:
        spec = self._clone_spec()
        ec_cfg = builder_mod.resolve_chapter_eyecatch_spec(spec["chapters"][1])
        assert ec_cfg is not None
        ec_rt, resume_sec = builder_mod._compute_chapter_eyecatch_slot(28.0, 30, ec_cfg)
        self.assertEqual(ec_rt["startSec"], 28.0)
        self.assertEqual(ec_rt["endSec"], 29.0)
        self.assertEqual(ec_rt["startFrame"], 840)
        self.assertEqual(ec_rt["endFrame"], 870)
        self.assertGreaterEqual(resume_sec - ec_rt["endSec"], 0.25)

        # 正常タイムライン：前章終了 == ec.startSec、次章開始 == resume_sec、字幕/ショット重複ゼロ
        ch1_shots = spec["chapters"][0]["shots"]
        ch2_shots = spec["chapters"][1]["shots"]
        good_tl = {
            "chapters": [
                {"chapterIndex": 1, "startSec": 0.0, "endSec": 28.0, "durationSec": 28.0},
                {
                    "chapterIndex": 2,
                    "startSec": resume_sec,
                    "endSec": resume_sec + 21.0,
                    "durationSec": 21.0,
                    "eyecatch": ec_rt,
                },
            ],
            "shots": [
                {"chunkId": ch1_shots[0]["chunkId"], "chapterIndex": 1, "startSec": 0.0, "endSec": 7.0, "beatTimesSec": [0.1, 2.0, 4.0]},
                {"chunkId": ch1_shots[1]["chunkId"], "chapterIndex": 1, "startSec": 7.0, "endSec": 14.0, "beatTimesSec": [7.1, 9.5, 11.5]},
                {"chunkId": ch1_shots[2]["chunkId"], "chapterIndex": 1, "startSec": 14.0, "endSec": 21.0, "beatTimesSec": [14.1, 16.5, 18.5]},
                {"chunkId": ch1_shots[3]["chunkId"], "chapterIndex": 1, "startSec": 21.0, "endSec": 28.0, "beatTimesSec": [21.1, 23.5, 25.5]},
                {"chunkId": ch2_shots[0]["chunkId"], "chapterIndex": 2, "startSec": resume_sec, "endSec": resume_sec + 7.0, "beatTimesSec": [resume_sec + 0.1, resume_sec + 2.4, resume_sec + 4.4]},
                {"chunkId": ch2_shots[1]["chunkId"], "chapterIndex": 2, "startSec": resume_sec + 7.0, "endSec": resume_sec + 14.0, "beatTimesSec": [resume_sec + 7.1, resume_sec + 9.4, resume_sec + 11.6]},
                {"chunkId": ch2_shots[2]["chunkId"], "chapterIndex": 2, "startSec": resume_sec + 14.0, "endSec": resume_sec + 21.0, "beatTimesSec": [resume_sec + 14.1, resume_sec + 16.0, resume_sec + 18.0]},
            ],
            "subtitles": [
                {"startSec": 21.0, "endSec": 28.0, "line1": "前章の最後"},
                {"startSec": resume_sec, "endSec": resume_sec + 3.5, "line1": "次章の最初"},
            ],
        }
        rep_ok = validate_stickman_collage_spec(spec, timeline=good_tl)
        self.assertTrue(rep_ok.passed, format_validation_report(rep_ok))
        self.assertEqual(rep_ok.errors, [])

        # 1) timeline.chapters[].eyecatch 欠落は ERROR
        missing_ec_tl = copy.deepcopy(good_tl)
        del missing_ec_tl["chapters"][1]["eyecatch"]
        rep_missing = validate_stickman_collage_spec(spec, timeline=missing_ec_tl)
        self.assertFalse(rep_missing.passed)
        self.assertIn("timeline.chapters[].eyecatch が未生成", "\n".join(rep_missing.errors))

        # 2) 次章開始がアイキャッチ中（旧重ね掛け相当）＋字幕・ショット重複＋前章食い込みはすべて ERROR
        overlap_tl = copy.deepcopy(good_tl)
        overlap_tl["chapters"][0]["endSec"] = 28.4
        overlap_tl["chapters"][1]["startSec"] = 28.6
        overlap_tl["shots"][3]["endSec"] = 28.4
        overlap_tl["shots"][4]["startSec"] = 28.6
        overlap_tl["subtitles"][0]["endSec"] = 28.4
        overlap_tl["subtitles"][1]["startSec"] = 28.6
        rep_overlap = validate_stickman_collage_spec(spec, timeline=overlap_tl)
        self.assertFalse(rep_overlap.passed)
        joined = "\n".join(rep_overlap.errors)
        self.assertIn("契約下限", joined)
        self.assertIn("前章 (Chapter 1) の終了", joined)
        self.assertIn("ショット", joined)
        self.assertIn("字幕", joined)

    def test_chapter_eyecatch_tsx_duplicate_error_and_legacy_overlay_warning(self) -> None:
        # 1) spec.chapters[].eyecatch 定義＋TSX手動 <BuguruEyecatch> は二重再生 ERROR
        spec_with_ec = self._clone_spec()
        with tempfile.TemporaryDirectory() as tmp:
            tsx_dir = Path(tmp)
            (tsx_dir / "scenes.tsx").write_text(
                """
import React from 'react';
import { Sequence } from 'remotion';
import { BuguruEyecatch, BUGURU_EYECATCH_CUT_SEC, type StickmanSceneProps } from '../../../components/stickman_collage';
import { StickmanCollageTemplate } from '../../../templates/StickmanCollageTemplate';

const SCENES: Record<string, React.FC<StickmanSceneProps>> = {
  BookstoreHookScene: ({ resolveAsset, cue }) => <div>{resolveAsset('photo_bookstore')?.src}{cue('本屋', 0.1)}</div>,
  SaladChickenIronyScene: ({ cue }) => <div>{cue('一ページ', 0.1)}</div>,
  PrepayMechanismScene: ({ cue }) => <div>{cue('先払い', 0.1)}</div>,
  SmartphoneRehookScene: ({ resolveAsset, cue }) => <div>{resolveAsset('photo_smartphone_night')?.src}{cue('深夜二時', 0.1)}</div>,
};

export const Ep: React.FC<any> = ({ spec }) => (
  <>
    <StickmanCollageTemplate spec={spec} customScenes={SCENES} />
    <Sequence from={Math.round((10 - BUGURU_EYECATCH_CUT_SEC) * 30)} durationInFrames={30}>
      <BuguruEyecatch variant="zoom" />
    </Sequence>
  </>
);
""",
                encoding="utf-8",
            )
            rep_dup = validate_stickman_collage_spec(spec_with_ec, tsx_dir=tsx_dir)
            self.assertFalse(rep_dup.passed)
            self.assertIn("手動 <BuguruEyecatch> 配置が重複", "\n".join(rep_dup.errors))

            # 2) spec.chapters[].eyecatch が無い旧エピソードでの - BUGURU_EYECATCH_CUT_SEC は WARNING（既存互換）
            spec_legacy = self._clone_spec()
            del spec_legacy["chapters"][1]["eyecatch"]
            rep_legacy = validate_stickman_collage_spec(spec_legacy, tsx_dir=tsx_dir)
            self.assertTrue(rep_legacy.passed, format_validation_report(rep_legacy))
            self.assertTrue(
                any("旧重ね掛け方式 (- BUGURU_EYECATCH_CUT_SEC)" in w for w in rep_legacy.warnings),
                rep_legacy.warnings,
            )

    def test_build_production_assets_inserts_silent_eyecatch_slot_and_offsets_next_chapter_audio(self) -> None:
        spec = self._clone_spec()
        spec["slug"] = "unit_test_eyecatch_slot"
        captured_wav_starts: list[tuple[Path, float]] = []

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            spec_path = tmp_path / "spec.json"
            spec_path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
            tsx_out = tmp_path / "timeline.ts"
            public_dir = tmp_path / "public_prod"

            class _FakeTTSClient:
                def __init__(self, *args, **kwargs) -> None:
                    pass

                def synthesize_onetake_block(self, nar_chunks, tts_dir, *, block_id, **kwargs):
                    wav_path = Path(tts_dir) / f"{block_id}.wav"
                    wav_path.write_bytes(b"RIFF")
                    return SimpleNamespace(
                        clean_wav=wav_path,
                        api_calls=0,
                        character_alignment=None,
                        chunks=nar_chunks,
                    )

                def close(self) -> None:
                    pass

            def _fake_build_onetake_timeline(res, **kwargs):
                chunks_map = {}
                cur = 0.0
                for ch in res.chunks:
                    chunks_map[ch.chunk_id] = {
                        "startSec": round(cur, 4),
                        "speechEndSec": round(cur + 6.0, 4),
                    }
                    cur += 6.5
                return {"chunks": chunks_map}

            def _fake_ffprobe_duration(wav_path):
                return 26.0 if "ch01_" in str(wav_path) else 19.5

            def _fake_assemble(wav_starts, total_sec, out_wav, **kwargs):
                captured_wav_starts.extend(wav_starts)
                Path(out_wav).write_bytes(b"RIFF")

            def _fake_render_sfx(total_sec, events, out_wav, **kwargs):
                Path(out_wav).write_bytes(b"RIFF")

            def _fake_mix(out_wav, total_sec, **kwargs):
                Path(out_wav).write_bytes(b"RIFF")

            def _fake_run_cmd(cmd, **kwargs):
                out_file = Path(cmd[-1])
                out_file.parent.mkdir(parents=True, exist_ok=True)
                out_file.write_bytes(b"ID3")
                return SimpleNamespace(stdout="", stderr="")

            with (
                mock.patch.object(builder_mod, "REPO_ROOT", tmp_path),
                mock.patch.object(builder_mod, "ElevenLabsTTSClient", _FakeTTSClient),
                mock.patch.object(builder_mod, "ffprobe_duration", side_effect=_fake_ffprobe_duration),
                mock.patch.object(builder_mod, "build_onetake_timeline", side_effect=_fake_build_onetake_timeline),
                mock.patch.object(builder_mod, "assemble_narration_track", side_effect=_fake_assemble),
                mock.patch.object(builder_mod, "_wav_rms_db", return_value=-20.0),
                mock.patch.object(builder_mod, "render_sfx_track", side_effect=_fake_render_sfx),
                mock.patch.object(builder_mod, "mix_master_audio", side_effect=_fake_mix),
                mock.patch.object(builder_mod, "_measure_loudnorm", return_value={}),
                mock.patch.object(builder_mod, "run_cmd", side_effect=_fake_run_cmd),
            ):
                tl_path = builder_mod.build_production_assets(spec, spec_path, tsx_out=tsx_out)

            runtime_spec = json.loads(tl_path.read_text(encoding="utf-8"))
            self.assertTrue(tsx_out.is_file())
            self.assertEqual(len(captured_wav_starts), 2)

            ch1, ch2 = runtime_spec["chapters"]
            self.assertNotIn("eyecatch", ch1)
            self.assertIn("eyecatch", ch2)
            ec = ch2["eyecatch"]

            # 前章終了 == アイキャッチ開始、次章音声開始 == 次章開始 >= アイキャッチ終了 + 0.25s
            self.assertAlmostEqual(ch1["endSec"], ec["startSec"], places=4)
            self.assertAlmostEqual(ec["endSec"] - ec["startSec"], 1.0, places=4)
            self.assertGreaterEqual(ch2["startSec"] - ec["endSec"], 0.25 - 1e-4)
            self.assertAlmostEqual(captured_wav_starts[1][1], ch2["startSec"], places=4)

            # 生成された runtime_spec 自体が機械バリデーションを Errors: 0 で通過すること
            post_rep = validate_stickman_collage_spec(spec, timeline=runtime_spec)
            self.assertTrue(post_rep.passed, format_validation_report(post_rep))
            self.assertEqual(post_rep.errors, [])

    def test_media_backdrop_validation_video_catalog_dry_run_and_timeline_propagation(self) -> None:
        spec = self._clone_spec()
        spec["assetCatalog"].extend(
            [
                {
                    "id": "broll_city_night",
                    "kind": "scene_video",
                    "src": "episodes/sample/assets/city_night.mp4",
                    "labelJa": "夜の都会タイムラプス実写動画",
                    "license": "royalty_free",
                    "creditShort": "Pexels Video",
                },
                {
                    "id": "broll_rain_window",
                    "kind": "broll_video",
                    "src": "episodes/sample/assets/rain_window.webm",
                    "labelJa": "雨の窓辺実写クリップ",
                    "license": "cc0",
                    "creditShort": "Pixabay Video",
                },
            ]
        )
        shots = self._all_shots(spec)
        # 1) 文字列1行指定 + オブジェクト詳細指定（実写動画 mp4 / webm）がエラー・警告ゼロで通過
        shots[0]["mediaBackdrop"] = "broll_city_night"
        shots[1]["mediaBackdrop"] = {
            "assetId": "broll_rain_window",
            "dim": 0.55,
            "vignette": 0.7,
            "blurPx": 2,
            "trimBeforeSec": 3.5,
            "playbackRate": 0.85,
            "loop": True,
            "zoom": [1.03, 1.1],
            "pan": [-12, 12],
        }
        # realAssetTargets から mediaBackdrop のみの利用も使用済み扱いになること
        spec["realAssetTargets"].append(
            {
                "labelJa": "夜の都会",
                "category": "place",
                "assetId": "broll_city_night",
                "chunkIds": [shots[0]["chunkId"]],
            }
        )

        rep_ok = validate_stickman_collage_spec(spec)
        self.assertTrue(rep_ok.passed, format_validation_report(rep_ok))
        self.assertEqual(rep_ok.errors, [])
        self.assertEqual(rep_ok.warnings, [])
        self.assertEqual(rep_ok.metrics["media_backdrop_shots"], 2)

        summary = builder_mod._estimate_dry_run_summary(spec)
        self.assertEqual(summary["media_backdrop_shots"], 2)

        # 2) 全ショット同一 polarity="black" でも動く壁紙と mediaBackdrop を切り替えていれば単一背景警告にならない
        spec_same_pol = copy.deepcopy(spec)
        for sh in self._all_shots(spec_same_pol):
            sh["polarity"] = "black"
            sh["lightBg"] = False
        rep_same_pol = validate_stickman_collage_spec(spec_same_pol)
        self.assertTrue(rep_same_pol.passed, format_validation_report(rep_same_pol))
        self.assertFalse(any("単一背景" in w for w in rep_same_pol.warnings), rep_same_pol.warnings)
        self.assertGreaterEqual(rep_same_pol.metrics["backdrop_switches"], 2)

        # 2b) 全ショット同一 mediaBackdrop のときは polarity が違っていても単一背景警告となり、メッセージも media:* で整合する
        spec_single_mb = copy.deepcopy(spec)
        for sh in self._all_shots(spec_single_mb):
            sh["mediaBackdrop"] = "broll_city_night"
        rep_single_mb = validate_stickman_collage_spec(spec_single_mb)
        self.assertTrue(rep_single_mb.passed, format_validation_report(rep_single_mb))
        self.assertTrue(
            any("単一背景" in w and "media:broll_city_night" in w for w in rep_single_mb.warnings),
            rep_single_mb.warnings,
        )

        # 2c) 全ショット同一 polarity でも、動く壁紙と短い mediaBackdrop の切替は背景ブロック短すぎ警告として検出される
        spec_short_mb = copy.deepcopy(spec_same_pol)
        short_shots = self._all_shots(spec_short_mb)
        for sh in short_shots:
            sh.pop("mediaBackdrop", None)
        short_shots[1]["mediaBackdrop"] = "broll_rain_window"
        short_shots[1]["narrationJa"] = "一瞬だけ。"
        short_shots[1]["targetDurationSec"] = 2.0
        short_shots[1]["subtitle"] = {"line1": "一瞬だけ。"}
        short_shots[1].pop("subtitleSegments", None)
        short_shots[1]["beats"] = [{"beatIndex": 0, "offsetSec": 0.2, "action": "reveal_diagram"}]
        short_shots[1]["sfx"] = [{"kind": "stamp_thud", "offsetSec": 0.2}]
        rep_short_mb = validate_stickman_collage_spec(spec_short_mb)
        self.assertTrue(rep_short_mb.passed, format_validation_report(rep_short_mb))
        self.assertTrue(
            any("背景ブロック #2 (media:broll_rain_window)" in w and "短すぎます" in w for w in rep_short_mb.warnings),
            rep_short_mb.warnings,
        )

        # 3) 未解決 assetId（文字列 / オブジェクト / 空文字）と壊れた型は ERROR
        bad = self._clone_spec()
        b_shots = self._all_shots(bad)
        b_shots[0]["mediaBackdrop"] = "missing_video_clip"
        b_shots[1]["mediaBackdrop"] = {"assetId": "missing_obj_clip", "dim": 0.5}
        b_shots[2]["mediaBackdrop"] = {"dim": 0.4}
        b_shots[3]["mediaBackdrop"] = ["invalid_list"]
        rep_bad = validate_stickman_collage_spec(bad)
        self.assertFalse(rep_bad.passed)
        joined = "\n".join(rep_bad.errors)
        self.assertIn("missing_video_clip", joined)
        self.assertIn("missing_obj_clip", joined)
        self.assertIn("mediaBackdrop assetId '' not found in assetCatalog", joined)
        self.assertIn("mediaBackdrop must be an assetId string or an object with assetId", joined)

        # 4) build_production_assets が mediaBackdrop と動画 assetCatalog を timeline.json / timeline.ts へ伝播すること
        spec["slug"] = "unit_test_media_backdrop"
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            spec_path = tmp_path / "spec.json"
            spec_path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
            tsx_out = tmp_path / "timeline.ts"

            class _FakeTTSClient:
                def __init__(self, *args, **kwargs) -> None:
                    pass

                def synthesize_onetake_block(self, nar_chunks, tts_dir, *, block_id, **kwargs):
                    wav_path = Path(tts_dir) / f"{block_id}.wav"
                    wav_path.write_bytes(b"RIFF")
                    return SimpleNamespace(
                        clean_wav=wav_path,
                        api_calls=0,
                        character_alignment=None,
                        chunks=nar_chunks,
                    )

                def close(self) -> None:
                    pass

            def _fake_build_onetake_timeline(res, **kwargs):
                chunks_map = {}
                cur = 0.0
                for ch in res.chunks:
                    chunks_map[ch.chunk_id] = {"startSec": round(cur, 4), "speechEndSec": round(cur + 6.0, 4)}
                    cur += 6.5
                return {"chunks": chunks_map}

            def _fake_run_cmd(cmd, **kwargs):
                out_file = Path(cmd[-1])
                out_file.parent.mkdir(parents=True, exist_ok=True)
                out_file.write_bytes(b"ID3")
                return SimpleNamespace(stdout="", stderr="")

            with (
                mock.patch.object(builder_mod, "REPO_ROOT", tmp_path),
                mock.patch.object(builder_mod, "ElevenLabsTTSClient", _FakeTTSClient),
                mock.patch.object(builder_mod, "ffprobe_duration", return_value=24.0),
                mock.patch.object(builder_mod, "build_onetake_timeline", side_effect=_fake_build_onetake_timeline),
                mock.patch.object(builder_mod, "assemble_narration_track", side_effect=lambda ws, ts, out, **kw: Path(out).write_bytes(b"RIFF")),
                mock.patch.object(builder_mod, "_wav_rms_db", return_value=-20.0),
                mock.patch.object(builder_mod, "render_sfx_track", side_effect=lambda ts, ev, out, **kw: Path(out).write_bytes(b"RIFF")),
                mock.patch.object(builder_mod, "mix_master_audio", side_effect=lambda out, ts, **kw: Path(out).write_bytes(b"RIFF")),
                mock.patch.object(builder_mod, "_measure_loudnorm", return_value={}),
                mock.patch.object(builder_mod, "run_cmd", side_effect=_fake_run_cmd),
            ):
                tl_path = builder_mod.build_production_assets(spec, spec_path, tsx_out=tsx_out)

            runtime_spec = json.loads(tl_path.read_text(encoding="utf-8"))
            self.assertEqual(runtime_spec["shots"][0]["mediaBackdrop"], "broll_city_night")
            self.assertEqual(runtime_spec["shots"][1]["mediaBackdrop"]["assetId"], "broll_rain_window")
            self.assertEqual(runtime_spec["shots"][1]["mediaBackdrop"]["trimBeforeSec"], 3.5)
            self.assertIs(runtime_spec["shots"][1]["mediaBackdrop"]["loop"], True)
            self.assertIn("broll_city_night", tsx_out.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
