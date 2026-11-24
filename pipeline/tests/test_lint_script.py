"""台本機械リンター pipeline/scripts/lint_script.py の単体テスト。"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path


def _find_repo_root(start: Path) -> Path:
    for parent in [start, *start.parents]:
        if (parent / "pipeline" / "scripts" / "lint_script.py").is_file():
            return parent
    raise RuntimeError("Could not locate repository root")


REPO_ROOT = _find_repo_root(Path(__file__).resolve())

_LINT_SPEC = importlib.util.spec_from_file_location(
    "lint_script",
    REPO_ROOT / "pipeline" / "scripts" / "lint_script.py",
)
assert _LINT_SPEC and _LINT_SPEC.loader
lint_script = importlib.util.module_from_spec(_LINT_SPEC)
sys.modules["lint_script"] = lint_script
_LINT_SPEC.loader.exec_module(lint_script)


class TestScriptParsers(unittest.TestCase):
    """4種の台本書式パーサーでメタ領域が混入せず本文のみ抽出されることを確認。"""

    def test_parse_display_chunk_bullets(self) -> None:
        md = """# ABテスト共通台本（表示用）
- **対象尺:** 冒頭 約90秒
- **フォーマット:** stickman_collage

## 一次情報ソース
1. Smith (2020)

---

## チャンク構成
- **c01 [フック]**
  朝からコーヒーを3杯飲んでも、まだ眠いですよね。
- **c02 [リフック / 転換]**
  実はそこに、脳の意外なバグが隠れています。
"""
        parsed = lint_script.parse_display_script(md)
        self.assertEqual(parsed.style, "chunk_bullets")
        self.assertEqual(parsed.chunk_ids, ["c01", "c02"])
        self.assertEqual(parsed.has_explicit_rehook_tags, 1)
        self.assertEqual(parsed.estimated_target_sec, 90.0)
        self.assertEqual(parsed.detected_format, "stickman_collage")
        self.assertNotIn("Smith", parsed.full_text)

    def test_parse_display_markdown_table(self) -> None:
        md = """# 表示用台本
- **対象尺:** 冒頭60秒

| Chunk ID | ショット | ナレーション表示文 | 映像指示 |
| :--- | :--- | :--- | :--- |
| `c01_hook` | Shot 1 | 今日こそ片付けるぞと<br>決めましたよね。 | 純黒背景。棒人間。 |
| `c02_body` | Shot 2 | でもなぜか掃除を始めます。 | 実写カット。 |
"""
        parsed = lint_script.parse_display_script(md)
        self.assertEqual(parsed.style, "markdown_table")
        self.assertEqual(parsed.chunk_ids, ["c01_hook", "c02_body"])
        self.assertNotIn("純黒背景", parsed.full_text)
        self.assertIn("今日こそ片付けるぞと", parsed.full_text)

    def test_parse_display_template_quotes(self) -> None:
        md = """# 表示用台本
## 0:00〜0:15 フック
- **想定秒数:** 15s
- **映像レイヤー:** 図解
- **発話（表示用）：**
  > 貯金を増やしたいなら、まず家計簿アプリを消してください。

## 0:15〜0:45 ブリッジ
- **想定秒数:** 30s
- **発話（表示用）：**
  > なぜなら記録するほど、脳は節約した気分になるからです。
"""
        parsed = lint_script.parse_display_script(md)
        self.assertEqual(parsed.style, "template_quotes")
        self.assertEqual(len(parsed.segments), 2)
        self.assertEqual(parsed.estimated_target_sec, 45.0)
        self.assertNotIn("図解", parsed.full_text)

    def test_parse_display_section_prose(self) -> None:
        md = """# タイトル
- フォーマット: `planE_macro_econ`
- 一次ソース:
  1. 日本銀行

---

## [0:00〜0:20] 思考実験
もし国の給料を止めたいなら、どうしますか？

（※VHS一時停止・無音ブレイク）

一番うまくいくのは、モノを安くし続けることです。
"""
        parsed = lint_script.parse_display_script(md)
        self.assertEqual(parsed.style, "section_prose")
        self.assertEqual(parsed.detected_format, "planE")
        self.assertNotIn("VHS一時停止", parsed.full_text)
        self.assertNotIn("日本銀行", parsed.full_text)
        self.assertIn("もし国の給料を止めたいなら", parsed.full_text)

    def test_parse_reading_skips_metadata_keeps_inline_stage_directions(self) -> None:
        md = """# 読み上げ原稿

> **運用規約:**
> - `GeminiTTSClient` のテスト用メモ。`[pause]` 禁止。

## 前処理チェック
- [ ] 同音異義語チェック

## セグメント別読み上げ本文

### [seg_01_hook]
（ここに読み上げ専用テキストを記載）
おはようございます、ではなく本題です。[pause]

---

## Gate 3: 耳チェック修正ログ
- 修正メモ
"""
        parsed = lint_script.parse_reading_script(md)
        self.assertEqual(parsed.style, "segment_headings")
        self.assertNotIn("GeminiTTSClient", parsed.full_text)
        self.assertNotIn("同音異義語チェック", parsed.full_text)
        self.assertNotIn("修正メモ", parsed.full_text)
        self.assertIn("[pause]", parsed.full_text)


class TestScriptLintRules(unittest.TestCase):
    """固い床(ERROR)・任意の推敲ヒント(WARNING)・自由舞台の非誤爆・参考メトリクスを検証。"""

    def _run_pair(
        self,
        display_body: str,
        reading_body: str,
        *,
        target_sec: float | None = None,
        mode: str = "auto",
    ) -> lint_script.LintResult:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "v1_test"
            root.mkdir(parents=True)
            d_path = root / "02_script_display.md"
            r_path = root / "03_script_reading.md"
            d_path.write_text(display_body, encoding="utf-8")
            r_path.write_text(reading_body, encoding="utf-8")
            return lint_script.lint_script_pair(
                display_path=d_path,
                reading_path=r_path,
                target_sec=target_sec,
                mode=mode,
            )

    def test_clean_pair_passes(self) -> None:
        display = """# テスト台本
- **対象尺:** 冒頭 約30秒

---

## [0:00〜0:30] 本編
コンビニでついつい甘いお菓子を買ってしまう夜って、ありますよね。
お腹は空いていないのに、レジ横のホットスナックまで手に取ってしまいます。
実はこれ、意志が弱いからではありません。脳が疲れたときに手っ取り早く気分を切り替える反応なんです。
まずは自分の部屋の机の上から、お菓子のストックを遠くへ移すだけで行動は大きく変わります。
"""
        reading = """コンビニでついつい甘いお菓子を買ってしまう夜って、ありますよね。
お腹は空いていないのに、レジ横のホットスナックまで手に取ってしまいます。
実はこれ、意志が弱いからではありません。脳が疲れたときに手っ取り早く気分を切り替える反応なんです。
まずは自分の部屋の机の上から、お菓子のストックを遠くへ移すだけで行動は大きく変わります。
"""
        res = self._run_pair(display, reading)
        self.assertTrue(res.metrics.passed, msg=[i.message for i in res.issues])
        self.assertEqual(res.metrics.error_count, 0)
        self.assertEqual(res.metrics.warning_count, 0)

    def test_missing_pair_and_chunk_mismatch_and_divergence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "only_display"
            root.mkdir()
            d = root / "02_script_display.md"
            d.write_text("# テスト\n---\n本文だけのテキストです。\n", encoding="utf-8")
            res_missing = lint_script.lint_script_pair(display_path=d, reading_path=None)
            self.assertIn("missing_pair_file", {i.code for i in res_missing.issues})
            self.assertFalse(res_missing.metrics.passed)

        res_mismatch = self._run_pair(
            "# テスト\n---\n- **c01 [フック]**\n  最初の文です。\n- **c02 [展開]**\n  二番目の文です。\n",
            "c01: 最初の文です。\nc99: 全く関係ない別の話題を急に長々と話して文字数も増やしていきます。\n",
        )
        codes = {i.code for i in res_mismatch.issues}
        self.assertIn("chunk_id_mismatch", codes)
        self.assertIn("display_reading_length_mismatch", codes)
        self.assertIn("display_reading_content_divergence", codes)
        self.assertFalse(res_mismatch.metrics.passed)

    def test_opening_greeting_and_ending_phrases_are_hard_floor_errors(self) -> None:
        text = (
            "こんにちは！今回の動画では脳の仕組みを解説します。"
            "チャンネル登録もお願いします。本編の説明に入ります。"
            "いかがでしたでしょうか。ご視聴ありがとうございました。"
        )
        res = self._run_pair(f"# テスト\n---\n{text}\n", text)
        codes = {i.code for i in res.issues if i.severity == "ERROR"}
        self.assertIn("opening_greeting", codes)
        self.assertIn("forbidden_ending_phrase", codes)
        self.assertFalse(res.metrics.passed)

    def test_reading_stage_directions_and_english_cues_are_hard_floor_errors(self) -> None:
        display = "# テスト\n---\n静かな夜にコーヒーを飲みながら考えてみましょう。なぜ予定は崩れるのでしょうか。\n"
        reading = (
            "静かな夜に**コーヒー**を飲みながら考えてみましょう。[pause]\n"
            "Speak in a calm and ironic tone. なぜ予定は崩れるのでしょうか。（※ここで無音）\n"
        )
        res = self._run_pair(display, reading)
        error_codes = {i.code for i in res.issues if i.severity == "ERROR"}
        self.assertIn("reading_stage_direction", error_codes)
        self.assertIn("reading_english_direction", error_codes)
        self.assertGreaterEqual(res.metrics.stage_direction_hits, 3)
        self.assertFalse(res.metrics.passed)

    def test_freedom_stage_expressions_and_rhythms_do_not_trigger_false_positives(self) -> None:
        """自由舞台（尺・短文連打・長文・読点・語尾連続・漢字率・自然な表現・海外題材・章末）が誤爆しないこと。"""
        text = (
            "止まりません。本当に止まりません。脳が勝手に動きます。もう遅いです。しかも気づけません。\n"
            "なぜなら、アメリカのウォルマートやレディットの現場で起きた現象は、一見すると失敗ではありませんが、"
            "実は単なる偶然ではなく、むしろ巨大な構造の必然だと言えますし、ここから丁寧に背景と数字を追いかけながら解体していきます。\n"
            "あなたが毎日見るニュースの裏側で、あなたの財布から静かに吸い上げられる仕組みを、あなたと一緒に見ていきましょう。\n"
            "経済構造改革推進特別委員会審議結果報告書概要説明開始時刻確認完了を示唆しています。"
            "金融政策決定会合議事要旨公表資料経済指標統計分析結果報告書を確認しています。"
            "産業競争力強化法案関係省庁連絡会議最終報告書添付資料詳細検討事項です。"
            "まず確認します。また比較します。さらに検証します。そのため納得します。したがって理解します。"
        )
        res = self._run_pair(
            f"# テスト\n- **対象尺:** 180秒\n---\n{text}\n",
            text,
            target_sec=180.0,
            mode="longform",
        )
        self.assertTrue(res.metrics.passed, msg=[i.message for i in res.issues])
        self.assertEqual(res.metrics.error_count, 0)
        self.assertEqual(res.metrics.warning_count, 0, msg=[i.message for i in res.issues])
        # リズム・密度・漢字率・推定尺は参考メトリクスとして正しく計測される
        self.assertGreaterEqual(res.metrics.short_sentence_max_streak, 5)
        self.assertGreater(res.metrics.max_sentence_len, 90)
        self.assertGreater(res.metrics.display_kanji_ratio, 0.42)
        self.assertEqual(res.metrics.target_sec, 180.0)
        self.assertGreater(res.metrics.estimated_sec, 0.0)

    def test_no_vocabulary_ng_list(self) -> None:
        """語彙レベルのNG語リスト（AI臭・翻訳調・「〜のです」連発・ソフト締め）は撤廃済みで、指摘ゼロ。"""
        text = (
            "これは単なる技術の問題ではありません。本質はここにあります。"
            "少し違います。焦る必要はありません。それだけのことです。"
            "完璧な英語で書かれた記事について話しましょう。"
            "本物の富裕層ほどロゴのない品を好むのです。"
            "高くなるほど欲しくなるのです。"
            "希少性が価格を押し上げるのです。"
            "気づけば財布へ給料が吸い込まれるのです。"
            "これが構造の裏側なのです。"
            "最後にまとめます。"
        )
        res = self._run_pair(f"# テスト\n---\n{text}\n", text)
        self.assertTrue(res.metrics.passed)
        self.assertEqual(res.issues, [], msg=[i.code for i in res.issues])

    def test_pause_cues_are_pure_text_and_counted(self) -> None:
        """「……」「――」による間は読み上げ原稿の純度を壊さず、参考メトリクスとして数えられる。"""
        text = (
            "値札を見た瞬間、手が止まります。"
            "答えは……ゼロ円です。"
            "そして――ここからが本題です。"
        )
        res = self._run_pair(f"# テスト\n---\n{text}\n", text)
        self.assertTrue(res.metrics.passed, msg=[i.message for i in res.issues])
        self.assertEqual(res.metrics.stage_direction_hits, 0)
        self.assertEqual(res.metrics.pause_cue_count, 2)

    def test_pause_stage_direction_still_errors(self) -> None:
        """「（間）」「[pause]」のようなト書き形式の間は従来どおり固い床ERROR。"""
        display = "# テスト\n---\n答えはゼロ円です。\n"
        res = self._run_pair(display, "答えは（間）ゼロ円です。")
        self.assertFalse(res.metrics.passed)
        self.assertIn("reading_stage_direction", {i.code for i in res.issues})

    def test_reading_preprocess_hints(self) -> None:
        """桁カンマ・%記号は読み上げ前処理のWARNINGヒント（合否には影響しない）。"""
        display = "# テスト\n---\n利用者は5,000人、比率は12%です。\n"
        res = self._run_pair(display, "利用者は5,000人、比率は12%です。")
        codes = {i.code for i in res.issues}
        self.assertTrue(res.metrics.passed)
        self.assertIn("reading_digit_comma", codes)
        self.assertIn("reading_percent_sign", codes)


class TestCompareCLIAndRealSamples(unittest.TestCase):
    """--compare モードの親ディレクトリ自動展開・JSON出力と既存台本スモークテスト。"""

    def test_compare_parent_dir_and_json_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            exp_dir = Path(tmp) / "2026-11-22_planC_demo"
            v1 = exp_dir / "variants" / "v1_good"
            v2 = exp_dir / "variants" / "v2_ai_slop"
            v1.mkdir(parents=True)
            v2.mkdir(parents=True)

            good_text = (
                "なぜ頑張る人ほど三日坊主で終わるのか。コンビニで参考書を買った夜がピークだからです。"
                "実は脳は計画を立てた瞬間にご褒美を先払いしてしまいます。だから翌朝にはやる気が空っぽなんです。"
            )
            (v1 / "02_script_display.md").write_text(f"# v1\n---\n{good_text}\n", encoding="utf-8")
            (v1 / "03_script_reading.md").write_text(good_text, encoding="utf-8")

            bad_text = (
                "こんにちは！これは単なる怠けではありません。本質はここにあります。[pause]"
                "焦る必要はありません。いかがでしたでしょうか。"
            )
            (v2 / "02_script_display.md").write_text(f"# v2\n---\n{bad_text}\n", encoding="utf-8")
            (v2 / "03_script_reading.md").write_text(bad_text, encoding="utf-8")

            out_json = exp_dir / "compare.json"
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = lint_script.main(
                    ["--compare", str(exp_dir), "--json", "--out", str(out_json)]
                )
            self.assertEqual(rc, 0)
            data = json.loads(out_json.read_text(encoding="utf-8"))
            self.assertEqual(len(data["compare"]), 2)
            m1, m2 = data["compare"][0]["metrics"], data["compare"][1]["metrics"]
            self.assertEqual(m1["name"], "v1_good")
            self.assertTrue(m1["passed"])
            self.assertEqual(m2["name"], "v2_ai_slop")
            self.assertFalse(m2["passed"])
            self.assertGreater(m2["error_count"], 0)

    def test_smoke_existing_repo_scripts(self) -> None:
        plan_e = lint_script.lint_script_pair(
            display_path=REPO_ROOT / "episodes/ab_tests/2026-11-22_planE_zero_inflation_trap/base/02_script_display.md",
            reading_path=REPO_ROOT / "episodes/ab_tests/2026-11-22_planE_zero_inflation_trap/base/03_script_reading.md",
            name="planE_base",
        )
        self.assertEqual(plan_e.metrics.format_id, "planE")
        self.assertEqual(plan_e.metrics.stage_direction_hits, 0)

    def test_cli_exit_codes_hard_floor_vs_strict(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            d_warn = Path(tmp) / "warn_only"
            d_warn.mkdir()
            warn_text = "夜中にコンビニへ行く理由を考えます。客の割合は12%です。"
            (d_warn / "02_script_display.md").write_text(f"# w\n---\n{warn_text}\n", encoding="utf-8")
            (d_warn / "03_script_reading.md").write_text(warn_text, encoding="utf-8")

            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc_default = lint_script.main([str(d_warn)])
                rc_strict = lint_script.main([str(d_warn), "--strict"])
            self.assertEqual(rc_default, 0)
            self.assertEqual(rc_strict, 1)


if __name__ == "__main__":
    unittest.main()
