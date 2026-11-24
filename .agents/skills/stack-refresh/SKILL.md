---
name: stack-refresh
description: >-
  定期的なキャッチアップ情報（AI新モデル、API/サブスク価格改定、ツール提供終了、
  YouTube規約・RPM・ASP変動）を取り込み、普遍原則層を汚さずに docs/volatile/ と
  configs/ のみを安全に差分更新する手順を実行する。
---

# 変動情報・技術スタック 定期アップデートスキル

本プロジェクトの「普遍原則と変動情報の疎結合」を維持し、特定ツール・モデル・価格前提の陳腐化を防ぐためのメンテナンス手順。

## 更新の鉄則
1. **編集対象の限定:** 更新対象は原則として `docs/volatile/*.md`、`configs/stack.yaml`、`configs/pricing_watch.yaml`、`configs/outlier_thresholds.yaml` のみに限定する。
2. **普遍層の保護:** `docs/evergreen/` は原則変更しない（プラットフォーム根本設計が変わった場合のみ最小限の追記を行う）。ツール固有名・単価を `evergreen/` へ書き込まない。
3. **廃止サービスの即時隔離:** 提供終了したモデル・ツールは現役ロールから削除し、`docs/volatile/stack_catalog.md` の「廃止済み一覧」と `configs/pricing_watch.yaml` の `expired_or_sunset` へ移す。

## 更新手順

1. **現在の監視アラート確認**
   - `configs/pricing_watch.yaml` の `effective_date` が現在日付に接近・超過している項目（例：`2026-12-01` Carbon倍額、`2026-12-05` Flow旧モデル終了、`2027-01-01` 3.8 Flash倍額、`2027-01-31` YPP締切）を確認する。
2. **差分情報の検証と分類**
   - 取得した新情報を以下に振り分ける：
     - AIモデル・単価・ツール仕様・終了 → `docs/volatile/stack_catalog.md` ＋ `configs/stack.yaml`
     - YouTube規約・アルゴリズム・APIクォータ → `docs/volatile/platform_policies_2026_2027.md` ＋ `configs/outlier_thresholds.yaml`
     - 日本市場RPM・ASP単価・税務 → `docs/volatile/jp_market_monetization_rates.md`
3. **設定ファイルとカタログの同期更新**
   - 切替先のモデルID・単価・制約（例：音声ライセンス変更やBatch API要件）を `configs/stack.yaml` の該当ロールの `primary` / `fallback` へ反映する。
   - 更新した全 `docs/volatile/*.md` の YAMLフロントマター（`last_verified`, `next_review`, `triggers`）を最新日付に更新する。
4. **廃止ツール残存スキャン＆台帳記録**
   - `configs/` と `pipeline/` と `studio/` を検索し、廃止済みモデルIDや古い単価前提のハードコードが残っていないかチェックする。
   - `docs/volatile/UPDATE_LOG.md` に「日付・更新対象・変更要約・次回確認点」を1行追記する。

## 完了検証
- `configs/*.yaml` が YAML としてエラーなくパースできること。
- `configs/stack.yaml` 内の `primary` に廃止済みサービスが存在しないこと。
- `docs/volatile/UPDATE_LOG.md` が更新されていること。
