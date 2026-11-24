---
last_verified: 2026-11-23
review_cadence: monthly
next_review: 2026-12-01
triggers:
  - stack.yaml または pricing_watch.yaml の更新時
---

# 変動情報アップデート履歴台帳（UPDATE_LOG）

`docs/volatile/` および `configs/` に対するキャッチアップ更新履歴を記録する。更新手順は `.agents/skills/stack-refresh/SKILL.md` を参照すること。

| 日付 | 更新者 | 対象ファイル | 変更要約 | 確認メモ |
| :--- | :--- | :--- | :--- | :--- |
| 2026-11-21 | 初期構築エージェント | `volatile/*.md`, `configs/*.yaml` | Google Drive リサーチレポート7本（2026/11/21取得）から蒸留・統合し初期ベースラインを策定。終了済みサービス（にじボイス・Sora/Sora 2・Imagen 4・11/20 DaVinciセール等）およびボツ案（重い3D系）を除外。 | 次回定期チェック：`2026-12-01`（Gemini 4 Carbon/Argon倍額切替確認、`12/5` Flow旧モデル終了確認）。 |
| 2026-11-22 | Orchestrator | `configs/stack.yaml`, `configs/style_guide.md`, `volatile/stack_catalog.md` 他 | 動画・サムネイルともに **AI画像生成不使用**（ネット収集素材＋Remotion 2D/SVG補完）、**出典表記は動画内非表示・概要欄のみ集約**、**著作権を気にしすぎない実務スタンス**へ全現役ハーネス・共通規定を統一。 | 次回定期チェック：`2026-12-01` 維持。`configs/stack.yaml` 内の `image_primary` / `image_diagram` は実務ツール定義へ切替済み。 |
| 2026-11-22 | Orchestrator | `configs/stack.yaml`, `docs/volatile/stack_catalog.md` | ElevenLabs `eleven_v4`（`tts_primary`）の既定ボイスを `Liam - Energetic, Social Media Creator`（`voice_id: TX3LPaxmHKxFdv7VOQHJ`）へ確定更新。 | `.env` の `ELEVENLABS_VOICE_ID`、CLI 引数、および明示 `"auto"` による自動選定フォールバックも維持。 |
| 2026-11-23 | Gemini 4 Neon | `docs/sources/08_llm_7families_field_report.md`, `docs/volatile/llm_7families_routing.md`, `.agents/skills/llm-model-routing/SKILL.md`, `docs/volatile/stack_catalog.md`, `configs/stack.yaml`, `AGENTS.md`, `CLAUDE.md`, `harnesses/*`, グローバル `GEMINI.md` / `$consult` | 動画制作ハーネス向けフロンティアLLM 7系統実戦調査レポート（45KB）を原本保管・蒸留し、オンデマンドスキル（`llm-model-routing`）＋変動知識カタログ＋全ハーネス/設定/グローバル `$consult` まで全面同期。Opus `medium`/`high` 使い分け、Neon単体 vs `Orchestrator (Neon)` vs `/swarm` 3択基準、Effortコスト逆転ガード、クロスモデル品質ゲートを定着。 | 次回定期チェック：`2026-12-01` 維持。`configs/stack.yaml` YAML検証通過済み。 |
