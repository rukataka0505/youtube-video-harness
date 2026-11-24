# 06. 異常値発掘・収益導線抽出・Gemini動画解析メソドロジー

本ファイルは `pipeline/`（Python異常値発掘・導線抽出・Gemini Two-Pass動画解析）が実装すべき数理ロジック、API規約境界、データ構造の普遍原則を定義する。具体的な数値しきい値とクォータ上限は `configs/outlier_thresholds.yaml` に外出しする。

---

## 1. 異常値（Outlier）定量評価の4大指標とノイズ除外

2025年〜2026年の仕様拡張（Shorts再生即カウント・1フレーム目カウント・TV Co-Views）により「生涯平均」を分母とする判定はインフレで破綻する。必ず**直近ローリングウィンドウ × 同一フォーマット分離**で評価する。

### 1.1 定量4指標の数式
1. **Leave-One-Out 同一フォーマット異常値スコア（`OS_LOO`）：**
   チャンネル $c$ の同一フォーマット $f \in \{\text{Long}, \text{Shorts}, \text{Live}\}$ に属する直近 $N$ 本（推奨 $N=20$、下限5〜上限30、公開48h〜12か月以内）を $\mathcal{W}_c(f)$ とし、評価対象動画 $v$ 自身を除外した中央値比で算出する（過去1本の大型ヒットによる算術平均の歪み＝偽陰性を構造的に防ぐ）。
   $$OS_{\text{LOO}}(v) = \frac{V_v}{\operatorname{median}\left(\{V_j : j \in \mathcal{W}_c(f) \setminus \{v\}\}\right)}$$
   - 母数10本未満時は `low_sample_confidence = True` を付与し、`VSR` と併用する。
2. **時系列瞬間VPH（`VPH_inst`）＆ 経過日数補正速度（`VPD_norm`）：**
   古参エバーグリーン動画と現行ブレイク中の動画を切り分ける。
   $$\text{VPH}_{\text{inst}}(v, t_2) = \frac{V_v(t_2) - V_v(t_1)}{(t_2 - t_1)_{\text{hours}}}, \qquad \text{VPD}_{\text{norm}}(v) = \frac{V_v}{(\text{AgeDays}_v + \tau)^{\alpha}}$$
3. **非登録者到達力（Views-to-Subscriber Ratio: `VSR`）：**
   登録者非公開・極小chの発散を防ぐため下限フロア100を設ける。
   $$\text{VSR}(v) = \frac{V_v}{\max(S_c, 100)}$$
4. **クロスチャンネル・ニッチ検証：**
   単発の運やニュース特需を除外するため、同一クラスタ内で独立した複数の中小チャンネル（JP 2ch以上 / Global EN 3ch以上）が過去180日以内に強異常値（`OS_LOO >= 5.0` 等）を達成したジャンルのみを「再現性あり」と判定する。

### 1.2 広告ブースト・bot再生・一発屋の除外ロジック
- **相対高評価率崩壊（最重要）：** `OS_LOO >= 1.5` かつ `V_v >= 1,000` なのに `高評価率 < チャンネル通常高評価率 × 0.40` の場合、TrueView広告や再生数購入の疑いとして**即時除外**。
- **絶対エンゲージメント下限：** 高評価率や1,000再生あたりコメント数の極端な低下を警告/除外（※コメント無効設定動画は別判定）。
- **不自然な均一性（botパッケージ）検知：** 直近30本の IQR/Median や高評価率変動係数（CV）が極端に低い均一アカウントを除外。
- **買収・著名人除外：** `TotalViews / Subs` が極小（買収疑い）または登録者20万超かつ `Subs / Videos` が極大の著名人チャンネルを除外。
- **休眠転用対策：** チャンネル開設日（`channels.publishedAt`）ではなく「最古動画の投稿日」で実質稼働期間を算出する。

---

## 2. 低クォータ収集＆ローカル2層データ基盤設計

1. **UULF / UUSH 自動プレイリスト分離とフォールバック:**
   チャンネルID（`UC...`）の先頭2文字を `UULF`（長尺）/ `UUSH`（Shorts）/ `UULV`（Live）へ置換し `playlistItems.list(maxResults=50)`（1ユニット）でフォーマット純粋取得。404時のみ `UU` 一覧へフォールバックし `durationMillis > 180_000` で切り分ける（Shorts上限3分＝180秒対応）。
2. **RSS非依存の収集主軸:**
   YouTube公式RSSの不安定化（UTC 09:00〜12:00障害報告）を踏まえ、`playlistItems.list` を一次主軸とする。
3. **search.list 最小化 × 芋づるシード拡張:**
   `search.list` は新規シード発掘のみに限定。有望チャンネルの `channelSections.list`（`multipleChannels` 棚）および概要欄 `@handle` 抽出から一般プール低消費で競合網を拡張する。
4. **時系列VPH監視のバケット分離:**
   `videos.batchGetStats` 専用バケット（安全バッチサイズ 50 ID/回）を一般プールから分離して高頻度VPHスナップショットを蓄積する。
5. **SQLite（OLTP）＋ DuckDB（OLAP）二層構成:**
   SQLite で収集状態・クォータ台帳（PT 00:00リセット・サーキットブレーカー）・30日TTL管理を行い、DuckDB からゼロETLで `LOAD sqlite` 接続してウィンドウ集計とベクトル分析を高速実行する。

---

## 3. YouTube API Services Developer Policies 厳格遵守（コードレベル）

1. **30暦日TTL制限（Non-Authorized Data）：**
   チャンネル所有者のOAuth認可がない第三者データは最長30暦日を超えて保持禁止。**29日基準で自動更新（Refresh）または削除（Delete）する `enforce_30day_ttl()`** を日次実行する。
2. **迂回・動画DL禁止:**
   複数GCPプロジェクト作成によるクォータ迂回、非公式スクレイピング、YouTube動画/音声ファイルのローカルダウンロード・キャッシュ保存を全面禁止とする。
3. **派生指標（Derived Metrics）制限：**
   外部公開やSaaS提供を行う場合は必ずGoogle監査・クォータ拡張申請を先行する。
4. **安全実装：**
   HTTP 403 `quotaExceeded` はリトライせずバケット別サーキットブレーカーで即停止。ログ出力時は必ず `redact_url()` で `key=` をマスクする。

---

## 4. 収益導線4層抽出・コメント不満分析・Gemini Two-Pass解析

### 4.1 収益導線4信号融合＆SSRFガード
- アフィリエイト・LINE/UTAGE等・自社デジタル商品・企業案件を、①APIフラグ（単一依存不可の不具合あり）、②日米法規制表記正規表現、③SponsorBlock公開API（SHA-256先頭4文字ハッシュ検索・クォータゼロ）、④Gemini音声/テロップ検出の **4信号融合** で抽出する。
- 短縮URLやリンク集（`linktr.ee` 等）のリダイレクト解決時は、**解決前後にプライベートIP帯への接続を拒否するSSRFガード**を必須とする。

### 4.2 コメント不満抽出（カウンター企画設計）
- `commentThreads.list(order="relevance", maxResults=100)` で収集し（`searchTerms` との併用不具合回避・403 `commentsDisabled` スキップ・投稿者自身除外）、低情報称賛を除いた上で共感重み $w_i = \ln(1 + \text{likeCount}_i) + 0.5 \cdot \text{replyCount}_i$ を付与。
- 日本語トークナイザー（SudachiPy Mode B / fugashi）＋ BERTopic（HDBSCANで外れ値隔離）＋ LLM構造化要約で「未解決ペインとカウンター動画案」を抽出する。

### 4.3 Gemini URLネイティブ「Two-Pass Static Hybrid」解析
公開YouTube URLを直渡しして映像・音声を同時解析する（ローカルDL不要）。Agenticモードの思考トークン暴騰およびサイレントフォールバックリスクを避けるため、以下を標準とする。

- **Pass 1（冒頭60秒マイクロ演出：0〜60s・`fps=2.0`・`media_resolution="high"`）：** カット数、ASL、Blackman 3部フック、最初のパターンインタラプト、テロップ仕様、SFXを `HookMicroSpec` JSONとして抽出（**ベンチマーク再現の直接入力**）。
- **Pass 2（全編マクロ構成：0s〜終了・`fps=0.5`・`media_resolution="low"`＋フル音声）：** オープンループの開閉回収台帳（`is_closed`）、リフック周期、BGM転換、CTA文脈、終了合図語の有無を `MacroWinningBlueprint` JSONとして抽出（3分以下ShortsはPass 1のみ）。
- **技術制約：**
  - 非公開/年齢/地域制限動画の400/403はAPIキー障害と切り分け、動画単体スキップとして隔離する。
  - Gemini FSM制約による400エラーを防ぐため、スキーマは **ネスト最大2層・全プロパティ必須（nullable許容）・コンパクトLiteral列挙** とする。
  - 初回実行時は `usage_metadata` / `count_tokens` で `fps` 指定時の実課金トークンを必ず実測確認する。
