# Python 異常値発掘・導線抽出・動画解析パイプライン（pipeline/）

日本市場および海外英語圏から「後発でも勝てる穴場ジャンル・異常値（Outlier）動画・高収益導線」を発掘し、Gemini API の YouTube URL ネイティブ解析（Two-Pass Static Hybrid）で演出仕様 JSON を抽出するローカル Python 基盤。

## 設計根拠とルール

- 詳細設計・数理式：[docs/evergreen/06_outlier_methodology.md](../docs/evergreen/06_outlier_methodology.md)
- 2チャンネル OAuth 2.0 認証・投稿運用：[docs/evergreen/10_youtube_publish_operations.md](../docs/evergreen/10_youtube_publish_operations.md)
- しきい値・クォータ設定：[configs/outlier_thresholds.yaml](../configs/outlier_thresholds.yaml)
- チャンネル定義・誤爆防止設定：[configs/channels.yaml](../configs/channels.yaml)
- 使用モデル設定：[configs/stack.yaml](../configs/stack.yaml)

## API 規約・安全保護（コードレベル実装済み）

1. **2026年6月刷新 細分化クォータ台帳（`yt_engine.quota.YouTubeQuotaLedger`）:**
   `search`（安全上限 85/日）、`batch_stats`（9,000/日）、`general`（8,500/日）を太平洋時間 PT 00:00 基準で独立管理し、上限到達または HTTP 403 `quotaExceeded` 時にサーキットブレーカーで即時停止する（リトライループ禁止）。
2. **30暦日保持ルール（`enforce_30day_ttl`）:**
   OAuth 認可のない第三者動画データは 29日基準で自動更新または削除する。
3. **動画・音声ローカル保存禁止:**
   `yt-dlp` 等による動画ダウンロードを実装せず、Gemini API へ公開 YouTube URL のみを直渡しする。
4. **APIキーのログマスク（`redact_url`）＆ SSRF 防御（`is_safe_public_url`）:**
   HTTP エラー文字列内の `key=` をマスクし、概要欄リンクのリダイレクト解決時にプライベートIP帯への接続を遮断する。

## 手動セットアップ手順（未実行）

```bash
cd pipeline
pip install -e .
# オプションのBERTopic/日本語形態素解析を利用する場合:
# pip install -e ".[nlp]"
```
