# ドキュメント索引・参照ルール（docs/）

本リポジトリの知識ベースは、**変更頻度**と**用途**に応じて4つの領域に分離されている。

## 4層構造の役割

| ディレクトリ | 性質 | 更新頻度 | エージェントの読み込み方針 |
| :--- | :--- | :--- | :--- |
| [decisions/](./decisions/) | 確定前提（憲章）と7本横断の矛盾・未決事項 | 意思決定時のみ | 新規フェーズ開始・設計判断時に参照 |
| [evergreen/](./evergreen/) | 法務・YPP防衛・制作工程・グロース・収益化・数理の背景設計書 | 低（構造変更時のみ） | **通常制作では読込不要**（`SKILL.md`・`harnesses/`・`configs/` で完結）。ハーネス改善・法務境界/戦略見直し時のみ参照（例外：実務設計図の `09`・`10`） |
| [volatile/](./volatile/) | AIモデル・単価・プラットフォーム規約・ASP/税務等の変動情報 | 高（月次／改定時） | ツール選定・コスト見積・期限確認時に参照 |
| [sources/](./sources/) | リサーチ原本アーカイブ（計9本） | 固定（アーカイブ） | **通常作業では読込禁止**。出典遡及時のみ部分参照 |

## タスク別ナビゲーション

| 実施したい作業 | 最初に読むファイル（実務正本） | 改善・境界判断時のみ参照する背景書 |
| :--- | :--- | :--- |
| プロジェクト前提・未決事項の把握 | `AGENTS.md` | [000-project-charter.md](./decisions/000-project-charter.md), [001-open-decisions.md](./decisions/001-open-decisions.md) |
| 企画選定・公開前・YPP申請前の法務/審査監査 | `.agents/skills/legal-ypp-guardrail/SKILL.md` | [01_guardrails_legal_ypp.md](./evergreen/01_guardrails_legal_ypp.md) |
| 海外バズ60秒解析→Remotion再現→資産化 | `.agents/skills/benchmark-deconstruct/SKILL.md`, `configs/style_guide.md` | [02_format_and_localization.md](./evergreen/02_format_and_localization.md), [03_production_workflow.md](./evergreen/03_production_workflow.md) |
| 台本作成・AI構文駆除・読み原稿分離 | `.agents/skills/script-production/SKILL.md`, `configs/style_guide.md`, [09_plan_e_longform_blueprint.md](./evergreen/09_plan_e_longform_blueprint.md) | [02_format_and_localization.md](./evergreen/02_format_and_localization.md) |
| Remotion 2D実装・映像/字幕/音響規格 | `.agents/skills/remotion-motion-design/SKILL.md`, `studio/src/theme/tokens.ts` | [03_production_workflow.md](./evergreen/03_production_workflow.md) |
| 公開設計・Shorts連動・伸び悩み異常診断 | [platform_policies_2026_2027.md](./volatile/platform_policies_2026_2027.md) | [04_growth_and_analytics.md](./evergreen/04_growth_and_analytics.md) |
| ASP・企業案件・税務・M&A設計 | [jp_market_monetization_rates.md](./volatile/jp_market_monetization_rates.md) | [05_monetization_architecture.md](./evergreen/05_monetization_architecture.md) |
| 異常値発掘パイプラインの開発・運用 | `configs/outlier_thresholds.yaml`, `pipeline/` | [06_outlier_methodology.md](./evergreen/06_outlier_methodology.md) |
| 2チャンネル OAuth 2.0 認証・投稿・メタデータ管理 | [10_youtube_publish_operations.md](./evergreen/10_youtube_publish_operations.md), `configs/channels.yaml` | — |
| 最新AIモデル・単価・規約情報の差し替え | `.agents/skills/stack-refresh/SKILL.md`, [stack_catalog.md](./volatile/stack_catalog.md), [UPDATE_LOG.md](./volatile/UPDATE_LOG.md) | `configs/stack.yaml`, `configs/pricing_watch.yaml` |
