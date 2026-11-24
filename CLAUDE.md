# Claude Code 作業指針（CLAUDE.md）

本リポジトリの最上位ルールは [AGENTS.md](./AGENTS.md) に従う。重複記述は置かず、Claude Code 担当領域の参照先と Claude 5.5 系固有の厳守制約のみを記す。

## 主な担当タスクと参照先

- **本編の章実装:** [章の材料抽出・実画像の検品・章別型検査](harnesses/chapter-work.md)と担当フォーマットの起動スキルを使う。全体検査は統合担当が実行する。
- **モデル選定・推論強度・地雷回避:** `.agents/skills/llm-model-routing/SKILL.md` および `docs/volatile/llm_7families_routing.md`
- **企画・タイトル設計・日本語長尺台本・推敲:** `.agents/skills/script-production/SKILL.md` および `configs/style_guide.md`
- **Remotion 2D実装・ベンチマーク再現:** `.agents/skills/remotion-motion-design/SKILL.md`、`.agents/skills/benchmark-deconstruct/SKILL.md`、`studio/src/theme/tokens.ts`
- **スタック・モデル切替確認:** `configs/stack.yaml` および `docs/volatile/stack_catalog.md`
- **公開前・YPPコンプラ監査:** `.agents/skills/legal-ypp-guardrail/SKILL.md`

## 厳守事項（共通＋Claude 5.5 系地雷回避）

1. 原則として `docs/sources/` は読まない（コンテキスト節約）。
2. 台本と音声読み上げ原稿（`02_script_display.md` / `03_script_reading.md`）を必ず分離し、別セッション/観点（クロスモデル監査）で聴感・品質を検証する。
3. 同一Remotionテンプレートの文字・数値差し替え量産を行わず、動画ごとに固有のデータ構造・視覚図解を実装する。重い3D系（案D）・AI画像生成・終了済みサービス（にじボイス・Sora等）は使用禁止。
4. **Effort・モデル指定規律:** `Opus 5.5` は通常 **`medium`**、ゼロイチ骨格・勝負2D/TSX演出・最終難関監査は **`high`** を使い分ける。`Sonnet 5.5` は必ずフルID **`claude-sonnet-5-5`** を指定し **`medium`〜`high` 上限**（`xhigh`/`max` 禁止、力不足時は `Opus 5.5 medium` へ即昇格）。`/fast`（4倍単価）禁止。
5. **視覚品質・過剰設計ガード:** 視覚実装では Opus 既定5点セット（クリーム背景・見出しイタリック・`01/02`番号・モノスペースラベル・ピル型ボタン）を名指し除外し、モック通過ではなく `remotion still` コンタクトシート実機確認を完了証跡とする。要求外のテスト・文書・小ファイル追加および無断レビューサブエージェント起動を禁止する。
