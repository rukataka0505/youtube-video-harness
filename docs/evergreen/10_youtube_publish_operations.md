# 10. 2チャンネル分離 YouTube OAuth 2.0 認証・投稿運用ガイド

`ch1_buguru`（**バグる棒人間** / `stickman_collage`）と `ch2_akapen`（**経済の赤ペン** / `planE_macro_econ`）の2チャンネルを、既存の Google OAuth 2.0 クライアント（`client_secret.json`）で安全に分離認証・自動投稿・メタデータ管理するための最短手順。

---

## 1. シークレット配置（Git 非管理・絶対厳守）

以下のパスはすべて `.gitignore` で保護されている。**`client_secret.json` や `*_token.json` をリポジトリ直下や公開領域にコミットしないこと。**

| 種別 | 既定パス（環境変数で上書き可） | 環境変数 |
| :--- | :--- | :--- |
| OAuth クライアント | `pipeline/.secrets/client_secret.json` | `YOUTUBE_OAUTH_CLIENT_SECRET_PATH` |
| チャンネル別トークン | `pipeline/.secrets/youtube_tokens/ch1_buguru_token.json`<br>`pipeline/.secrets/youtube_tokens/ch2_akapen_token.json` | `YOUTUBE_OAUTH_TOKEN_DIR` |
| チャンネル定義 | `configs/channels.yaml` | `YOUTUBE_CHANNEL_ID_CH1_BUGURU` / `YOUTUBE_CHANNEL_ID_CH2_AKAPEN` |

```powershell
# 1) 秘匿ディレクトリを作成し、Google Cloud Console のデスクトップアプリ用 client_secret.json を配置
New-Item -ItemType Directory -Force pipeline\.secrets | Out-Null
Copy-Item <ダウンロード済みclient_secret.json> pipeline\.secrets\client_secret.json

# 2) ローカル状態確認（外部通信なし）
pipeline\.venv\Scripts\python.exe pipeline/scripts/youtube_auth.py --status
```

---

## 2. 2チャンネル分離 OAuth 2.0 認証（ブランドアカウント別）

同一 Google アカウント配下にブランドアカウントが2つある場合、**1チャンネルずつ個別に認証**し、ブラウザのアカウント選択画面で該当ブランドアカウントを選ぶ。

```powershell
# ch1: バグる棒人間（ブラウザで「バグる棒人間」ブランドアカウントを選択）
pipeline\.venv\Scripts\python.exe pipeline/scripts/youtube_auth.py --channel ch1_buguru --write-channel-id

# ch2: 経済の赤ペン（ブラウザで「経済の赤ペン」ブランドアカウントを選択）
pipeline\.venv\Scripts\python.exe pipeline/scripts/youtube_auth.py --channel ch2_akapen --write-channel-id

# 両チャンネルの接続先チャンネル名・ID・誤爆整合性を API 照合
pipeline\.venv\Scripts\python.exe pipeline/scripts/youtube_auth.py --verify-all --require-bound
```

- `--write-channel-id` により、認証確認済みの `UC...` が `configs/channels.yaml` の `expected_channel_id` へ記録される。
- 誤って両方に同じブランドアカウントを選んでしまった場合、**重複チャンネルID検知でトークン保存自体が拒否**される。

---

## 3. 投稿・メタデータ管理の最短手順（既定 `--dry-run` / 既定 `unlisted`）

すべての書き込みコマンドは **デフォルトで `--dry-run`**（外部通信・クォータ消費ゼロ）。内容を確認してから **`--execute`** を付けて実実行する。

### 3.1 動画アップロード（デフォルト限定公開 `unlisted`）

```powershell
# 1) まず dry-run でフォーマット誤爆・メタデータ・クォータ見積もりを検証
pipeline\.venv\Scripts\python.exe pipeline/scripts/youtube_publish.py upload `
  --channel ch1_buguru `
  --episode-dir episodes/productions/multitask-brain-trap `
  --video episodes/productions/multitask-brain-trap/multitask_brain_trap_v21_neon.mp4 `
  --title "なぜマルチタスクが得意な人ほど脳の処理能力が落ちるのか" `
  --description-file episodes/productions/multitask-brain-trap/description.txt `
  --thumbnail episodes/productions/multitask-brain-trap/thumb_A.jpg `
  --caption episodes/productions/multitask-brain-trap/subtitles.srt

# 2) 問題なければ --execute を付けて限定公開（unlisted）アップロード実行
pipeline\.venv\Scripts\python.exe pipeline/scripts/youtube_publish.py upload `
  --channel ch1_buguru `
  --episode-dir episodes/productions/multitask-brain-trap `
  --video episodes/productions/multitask-brain-trap/multitask_brain_trap_v21_neon.mp4 `
  --title "なぜマルチタスクが得意な人ほど脳の処理能力が落ちるのか" `
  --description-file episodes/productions/multitask-brain-trap/description.txt `
  --thumbnail episodes/productions/multitask-brain-trap/thumb_A.jpg `
  --caption episodes/productions/multitask-brain-trap/subtitles.srt `
  --execute
```

> [!TIP]
> 公開 24 時間以上前の広告適合性自己診断バッファ（`docs/evergreen/03_production_workflow.md`）に合わせ、デフォルト公開設定は `unlisted` に固定している。予約公開へ切り替える場合は `--publish-at "2026-12-01T18:00:00+09:00"`（YouTube API 仕様により `privacyStatus=private` へ自動解決）を使用する。

### 3.2 既存動画のメタデータ更新・サムネ・字幕・再生リスト

```powershell
# 既存動画のタイトル変更・予約公開設定（動画所有権チェック＋既存snippet差分マージ）
pipeline\.venv\Scripts\python.exe pipeline/scripts/youtube_publish.py update `
  --channel ch2_akapen --video-id <VIDEO_ID> `
  --publish-at "2026-12-01T18:00:00+09:00" --execute

# サムネイル単体差し替え（API 2MB 超過時は警告表示）
pipeline\.venv\Scripts\python.exe pipeline/scripts/youtube_publish.py thumbnail `
  --channel ch2_akapen --video-id <VIDEO_ID> --thumbnail path/to/thumb.jpg --execute

# 字幕単体アップロード（.srt / .vtt 等）
pipeline\.venv\Scripts\python.exe pipeline/scripts/youtube_publish.py caption `
  --channel ch1_buguru --video-id <VIDEO_ID> --caption path/to/sub.srt --execute

# 再生リスト追加（複数回指定・channels.yaml エイリアス対応）
pipeline\.venv\Scripts\python.exe pipeline/scripts/youtube_publish.py playlist `
  --channel ch1_buguru --video-id <VIDEO_ID> --playlist-id PLxxxxxxxx --execute

# 本日の YouTube Data API クォータ残高確認（PT 00:00 リセット）
pipeline\.venv\Scripts\python.exe pipeline/scripts/youtube_publish.py quota
```

---

## 4. 多層誤爆防止ガード一覧

1. **フォーマット一致ガード:** `--format-id` または `--spec` / `--episode-dir/spec.json` の `formatId` と `configs/channels.yaml` の `format_id` が不一致なら即停止。
2. **パス混入ガード:** 動画・サムネ・字幕・エピソードフォルダのパスに別チャンネル固有キーワード（例: `ch1_buguru` 指定時に `planE` / `akapen`）が含まれる場合は即停止。
3. **チャンネルID一致＆重複禁止ガード:** 認証先 `channels.list(mine=true)` の実チャンネルIDが `expected_channel_id` と不一致、未バインド、または他チャンネルと重複する場合は即停止。
4. **動画所有権ガード:** `update` / `thumbnail` / `caption` / `playlist` 実行前に `videos.list` で動画の `snippet.channelId` を照合し、別チャンネル動画の書き換えを遮断。
5. **クォータ安全上限:** 全 API 消費を `yt_engine.quota.YouTubeQuotaLedger`（`general` バケット、安全上限 8,500/日）へ記録し、上限超過前にサーキットブレーカーで停止（`videos.insert`=1,600 / `videos.update`=50 / `thumbnails.set`=50 / `captions.insert`=400 / `playlistItems.insert`=50）。
