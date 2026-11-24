---
name: benchmark-deconstruct
description: >-
  海外バズ長尺動画の冒頭60秒をGeminiネイティブ解析（Two-Pass Static Hybrid）し、
  Remotionで非公開ベンチマーク再現を行った上で、人間の差分修正をスタイルガイド・
  再利用コンポーネント・Skillsへ定着させて日本語オリジナル展開へ繋ぐ手順を実行する。
---

# 海外バズ冒頭60秒 ベンチマーク再現＆資産化スキル

量産に入る前に「勝ち動画の構造・リズム・視覚密度」をコードレベルで体得し、リポジトリ資産へ定着させる手順書。
共通原則（AI画像生成不使用・出典の概要欄集約・ローカル動画DL禁止・廃止フォーマット禁止）は [`AGENTS.md`](../../../AGENTS.md) に従う。

## 事前確認
- [000-project-charter.md](../../../docs/decisions/000-project-charter.md) の現行2本柱（ch1 `stickman_collage` / ch2 `planE_macro_econ`）を確認する。
- [06_outlier_methodology.md](../../../docs/evergreen/06_outlier_methodology.md) の Two-Pass 解析仕様と `episodes/_templates/benchmark_template/` を確認する。

## 実行手順

1. **対象動画の選定（現行2フォーマット適合）**
   - 登録者比・LOO異常値スコアが高い海外の2D棒人間・人間や世界のバグ/奇妙な仕組み解説（ch1系：行動科学・心理に限らず人体・進化・科学・歴史など多ジャンル）または逆説・お金とインセンティブ構造解剖（ch2系：マクロ経済に限らず社会・文化・生活など多ジャンル）から1本選ぶ。
   - 公開 YouTube URL のみ扱い、ローカル動画ファイル DL は厳禁。
2. **Gemini Pass 1 / Pass 2 解析（`gemini-4-neon` 標準）**
   - `pipeline/src/yt_engine/analyzer/` の Pass 1（`0s〜60s`, `fps=2.0`, `media_resolution="high"`）で `HookMicroSpec` JSON を取得し `episodes/benchmarks/<slug>/01_gemini_analysis.json` へ保存。
   - 長尺骨格を測る場合は Pass 2（全編 `0.5 FPS`, `media_resolution="low"` ＋フル音声）で `04_pass2_macro.json`・`04b_chapter_blueprint.json` を取得する。
3. **Remotion 非公開ベンチマーク再現（現行2フォーマット基準）**
   - `studio/src/compositions/benchmarks/` 配下に約60秒（`1800` frames 前後 @ `30fps`）の再現コンポジションを作成。
   - ch1系は `studio/src/components/stickman_collage/` ＋ `StickmanCollageTemplate.tsx`、ch2系は `studio/src/components/plan_e/` ＋ `PlanEMacroEconTemplate.tsx` の自由舞台・純正エンジンを土台に組む。
   - 外部公開や著作物の丸コピー公開は行わず、構造・テンポ・カメラ・情報密度の検証専用とする。
4. **人間レビューと差分メモ記録**
   - 原動画と再現を比較し、違和感を `episodes/benchmarks/<slug>/02_diff_notes.md` に記録して直接修正する。
   - 本番オリジナル化時は海外固有名詞・翻訳調・英語主見出しを排し日本文脈へ完全変換する。
5. **汎用資産への昇格定着（コード優先・文書は置換圧縮のみ）**
   - `03_promotion_checklist.md` に従い、勝因を以下へ昇格する：
     - コンポーネント／テンプレート／Spec雛形／バリデータ → `studio/src/components/`・`episodes/_templates/`・`pipeline/`
     - ハーネス文書・文体規約 → `harnesses/stickman-collage/`・`harnesses/plan-e-macro-econ/`・`configs/style_guide.md`（文字数予算内で置換圧縮）

## 完了検証
- `01_gemini_analysis.json` が `HookMicroSpec` スキーマに適合していること。
- `02_diff_notes.md` から最低1つ以上のルールまたはコンポーネント改善が構造側へ昇格されていること。
- 廃止フォーマット要素・非ライセンスフォント・AI画像生成が混入していないこと。
