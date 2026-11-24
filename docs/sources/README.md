# リサーチ原本アーカイブ（Sources）

初期リサーチレポート7本（2026年11月21日取得）および追加リサーチ原本（計9本）の完全な原本アーカイブである。

> **コンテキスト節約ルール（厳守）:** 普段の制作・開発・レビュー作業で本ディレクトリ配下のファイルを読み込まないこと（合計約 547 KB）。必要な知識は `docs/evergreen/`・`docs/volatile/`・`configs/` に蒸留済みである。一次記述の表現確認や引用元URLの遡及検証が必要な場合のみピンポイントで参照する。

## 原本一覧と蒸留先マッピング

| ファイル | タイトル | Google Docs URL | 取得日 | 主な蒸留先 | 確定前提に基づく除外・保留事項 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [01_initial_growth_strategy.md](./01_initial_growth_strategy.md) | 非属人YouTube初動グロース戦略 | https://docs.google.com/document/d/1BDYsZisJ4Vd30FKWwF6IL7LAqIfJmLKB9AvX7lbRhxw/edit | 2026-11-21 | `evergreen/04`, `volatile/platform_policies_2026_2027.md`, `volatile/jp_market_monetization_rates.md` | Shorts併用上限・Tier 1先行戦略等は `001-open-decisions.md` で人間判断項目として整理 |
| [02_legal_ypp_defense.md](./02_legal_ypp_defense.md) | 非属人AI YouTube法務・YPP審査防衛 | https://docs.google.com/document/d/135t8jaIwdYk5riWrS7pn35klZTXgZeSgXJJVlQE2cz4/edit | 2026-11-21 | `evergreen/01`, `volatile/platform_policies_2026_2027.md`, `volatile/jp_market_monetization_rates.md` | ACML 1.0批判禁止条項を最優先ガードレール化。1/7達成目標・12/20安全案との差分は `001` へ記録 |
| [03_jp_monetization_strategy.md](./03_jp_monetization_strategy.md) | 日本向け非属人YouTube収益化戦略 | https://docs.google.com/document/d/1uosROyY5LtyNV4809971AGXVgTHw5vVp23pqoQ7BBcU/edit | 2026-11-21 | `evergreen/05`, `volatile/jp_market_monetization_rates.md` | AIペルソナ規制を `evergreen/01` と統合。2ch目・M&A設計を普遍原則化 |
| [04_overseas_import_strategy.md](./04_overseas_import_strategy.md) | 海外長尺YouTubeの日本輸入戦略 | https://docs.google.com/document/d/1PQepkRZOLA2g-m6uecRv28jeDfezhuHEQdcKsYBzyQY/edit | 2026-11-21 | `evergreen/02`, `decisions/000` | **重い3D系（No.3 3Dローポリ事件 / No.5 3D地形図事故 / No.7 3D断面）はボツ確定のため採用対象から除外** |
| [05_outlier_pipeline_design.md](./05_outlier_pipeline_design.md) | YouTube異常値発掘パイプライン設計 | https://docs.google.com/document/d/1R9ZMUSh5_gq6rwREbTwSmT0InD_Y3MHyMjKnXOxY94k/edit | 2026-11-21 | `evergreen/06`, `volatile/platform_policies_2026_2027.md`, `configs/outlier_thresholds.yaml`, `pipeline/` | 設計式・Pydanticスキーマ・クォータ台帳を `pipeline/` と `configs/` へ分離実装 |
| [06_jp_ai_production_design.md](./06_jp_ai_production_design.md) | 日本向けAI長尺YouTube制作設計 | https://docs.google.com/document/d/1eGemAhgP7zQUGyNiY_B0jbEM1Lv2R-TQHHOIBpufQs8/edit | 2026-11-21 | `evergreen/03`, `volatile/stack_catalog.md`, `configs/stack.yaml`, `configs/style_guide.md` | レポート07と統合蒸留。にじボイス/Sora/11月20日終了セール等を除外し、ACML 1.0注意を反映 |
| [07_2026_ai_video_stack.md](./07_2026_ai_video_stack.md) | 2026年高品質AI動画制作スタック | https://docs.google.com/document/d/1vBweWDeGRCnZy4ElV7HhMbKBcZOHykSWNjrUJ7SyHQ0/edit | 2026-11-21 | `evergreen/03`, `volatile/stack_catalog.md`, `configs/stack.yaml`, `configs/pricing_watch.yaml` | レポート06と統合蒸留。Ultra 5x/20x・BGM・画像・工数差異を `001-open-decisions.md` で整理 |
| [08_llm_7families_field_report.md](./08_llm_7families_field_report.md) | 動画制作ハーネス向け最新フロンティアLLM 7系統実戦調査 | https://share.gemini.google/4Yc5tXootANi | 2026-11-23 | `volatile/llm_7families_routing.md`, `.agents/skills/llm-model-routing/SKILL.md`, `volatile/stack_catalog.md` | 本リポジトリは2Dコード駆動主力・重い3D廃止方針のため、GPT-6.2 AstraはWebMCP操作・特殊VFX・深層調査のスポット枠へ最適化 |
| [09_thumbnail_harness_v2_report.md](./09_thumbnail_harness_v2_report.md) | 2Dコード駆動（Remotion `<Still>`）＋実写・紙面素材で勝つサムネイル制作ハーネスv2設計レポート | https://share.gemini.google/CCENkiOBFNQu | 2026-11-23 | `configs/style_guide.md`, `.agents/skills/thumbnail-design/SKILL.md` | 自由舞台の表現品質を落とさない方針に基づき、6型ローテーション・明暗配分固定・厳格ピクセル/APCA/dHashブロック・720p JPEG契約変更等の過剰制約は除外し、分業チェック・一枚絵の引き出し・縮小QA視点のみ柔らかいガイドラインとして蒸留 |
