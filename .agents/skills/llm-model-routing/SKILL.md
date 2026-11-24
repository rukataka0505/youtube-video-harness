---
name: llm-model-routing
description: >-
  動画制作ハーネス（Remotion / React / TypeScript / SVG・物理演出 / 台本 / 監査）において、
  最新フロンティアLLM 7系統（Claude Opus 5.5 / Sonnet 5.5、Gemini 4 Neon / Hydrogen /
  Antigravity Orchestrator・/swarm、GPT-6.2 Astra / Sol）から工程別の最適モデル・推論強度（effort）・
  並列境界・クロスモデル品質ゲートを選定するスキル。
  サブエージェント委譲、モデル選定相談、レビュー/QA体制設計、大量カット並列化を行う際に発動する。
---

# 動画制作ハーネス LLM 7系統 実戦ルーティング＆品質ゲートスキル

本スキルは、モデル選定・委譲・品質ゲート設計を**実戦データに基づいて迷わず決定するための運用手順**である。
最新の個別単価・ベンチマーク数値・ハーネス仕様の正本は [docs/volatile/llm_7families_routing.md](../../../docs/volatile/llm_7families_routing.md) を参照し、本スキル自体は「ディスパッチ判断と事故防止手順」に集中する。

> **本リポジトリ前提:** 主力は **2Dコード駆動（Remotion / SVG / 物理演出）**、**重い3D系は廃止済み**、**AI画像生成は不使用**。なお `$consult` 明示実行時の承認手順（事前プロンプト提示・途中停止のみ自動再開）や `AGENTS.md` の What 主義は本スキルと併用し遵守する。

---

## Step 1: 工程別ディスパッチ（まずモデルと Effort を決める）

作業を以下の6工程に分類し、**第一候補 → 条件付き第二候補** を選ぶ。**NGモデルは原則選ばない。**

| 工程 | 第一候補（モデル / Effort / T3 `target`） | 第二候補（代替・条件付き） | NGモデル（回避） |
| :--- | :--- | :--- | :--- |
| **① コードベース棚卸し・調査**<br>（Read-only横断・依存把握・既存動画/素材分析） | **`Gemini 4 Neon`** (`antigravity` / `thought_level: "high"`) | `Claude Opus 5.5` (`claudeAgent` / `effort: "medium"`, 200K以下かつ網羅回答優先時) | `GPT-6.2 Sol`（読解大幅劣化） / `Hydrogen`（複雑依存誤認） |
| **② アーキテクチャ・ハーネス設計**<br>（`STYLE.md`・`Root.tsx`・Props契約・タイムライン設計） | **`Claude Opus 5.5`** (`claudeAgent` / 通常 `effort: "medium"`, ゼロイチ骨格は `"high"`, `fastMode: false`) | `Gemini 4 Neon` (`antigravity` / `thought_level: "high"`, 超巨大リポジトリ準拠設計時) | `Hydrogen`（設計力不足） / `Sol`（config誤生成） / `Sonnet max`（暴走・高コスト） |
| **③ 演出・SVG / Motion 実装**<br>（2Dモーショングラフィックス・自作物理・WebMCP） | **2D主軸:** `Claude Opus 5.5` (`claudeAgent` / 勝負カット `"high"`, 通常 `"medium"`)<br>**WebMCP直結操作・特殊物理VFX:** `GPT-6.2 Astra` (`codex` / `reasoningEffort: "high"〜"xhigh"`) | `Gemini 4 Neon` (`antigravity` / `thought_level: "high"`, 漸進的SVG合成・WebGL・コスパ重視時) | `Sol`（UI粗・手戻り） / `Hydrogen`（従属パーツ省略） / `Sonnet` ブラインド運用（偽モック黒画面） |
| **④ 定型カット量産・小規模改修**<br>（確定済み `STYLE.md` 下の量産・字幕・外科修正） | **`Claude Sonnet 5.5`** (`claudeAgent` / フルID `claude-sonnet-5-5` / `effort: "medium"〜"high"`) | `GPT-6.2 Sol` (`codex` / `reasoningEffort: "medium"〜"high"`, 単体明確・スクショ模写) または `Gemini 4 Hydrogen` (`antigravity` / `thought_level: "high"`) | `Opus max`（過剰コスト） / `Astra`（高単価・過剰設計） / **`Sonnet max`・`Hydrogen xhigh`**（コスパ崩壊） |
| **⑤ レビュー・審美眼・動画QA**<br>（PRバグ検出・モーション/音ズレ検品・品質ゲート） | **一次PRレビュー:** `Claude Sonnet 5.5` (`effort: "medium"〜"high"`)<br>**最終難関監査・審美眼:** `Claude Opus 5.5` (`effort: "high"`, 要約リレーは `"medium"`)<br>**書き出しMP4/音声実検品:** **`Gemini 4 Neon`** (`thought_level: "high"`・動画ネイティブ入力) | `GPT-6.2 Sol`（`codex` / **必ず `reasoningEffort: "low"` 固定**・低コスト補助） | **`GPT-6.2 Astra`**（コメント爆弾・Precision 12%） / `Sol high`（ノイズ増） / **同一モデルの自己採点** |
| **⑥ 並列バッチ・反復改修**<br>（複数カット同時生成・単一機能実装・大規模連続改修） | 下記 **Step 4 の3択表** で `Neon単体` / `Orchestrator (Neon)` / `/swarm` を切り分ける | — | `Orchestrator` への並列期待・長時間連続リファクタでの往復（キャッシュ破壊） / `Hydrogen` 単独統括 / Worktree未使用の同時編集 |

---

## Step 2: Effort（推論強度）とコスト崖の機械チェック

委譲・実行前に以下5条件を必ず確認し、**「迷ったら max」を禁止する**。

1. **Opus 5.5 は `medium` と `high` を使い分け:** 通常設計・中規模UI・要約リレー・Sonnet昇格先は **`medium`**（旧Opus 5 `high` 相当を44%安・2倍速）、ゼロイチ骨格・勝負2D/TSX演出・最終難関監査のみ **`high`**。`fastMode: true`（4倍単価）は禁止。
2. **Sonnet 5.5 は `high` で打ち止め:** `medium`/`high` で力不足なら Sonnet を `xhigh`/`max` に上げず、**即座に `Claude Opus 5.5 (medium)` へ昇格**する。フルID `claude-sonnet-5-5` 指定、`/fast`・セッション途中アカウント切替禁止。
3. **Hydrogen は `high` で打ち止め:** `xhigh` は厳禁。力不足なら **`Gemini 4 Neon (medium/high)`** または **`GPT-6.2 Sol (high)`** へ上げる。
4. **Neon は既定 `high` を維持:** 軽〜中規模は `medium`、標準主力・大規模連続実装は `high`。`xhigh` は `high` で解けなかった超難関推論のみに限定する。
5. **GPT-6.2 Astra / Sol は `xhigh` 上限（`max` 非推奨）＋272K料金崖:** 入力 272,000 tok 超が見込まれる場合は事前フィルタするか **`Gemini 4 Neon (high)`** へ逃がす（272K超で入・キャ2倍、出1.5倍）。

---

## Step 3: 指示プロンプト原則（What主義）とモデル別の既知クセ（参考）

**原則（最上位モデルへの過剰指示を禁止）:**
- `Neon` / `Opus 5.5` / `Astra` / `Orchestrator` 等の最上位モデルへ委譲する際は、**目的と要件（＋必要なら参照先）だけ**を簡潔に伝える。
- **テスト要件・完了条件・下記のモデル別注意書きを毎回プロンプトへ自動注入しない**（リポジトリの `AGENTS.md` とモデルの自律判断に委ねる）。
- 下記のモデル特性は、**①モデル選定・レビュー時の着眼点**として使い、プロンプトに書くのは **②実際に同種の失敗を再発防止したい時** や **③軽量モデル（`Hydrogen` / `Sol`）へ定型作業を投げる時** など本当に必要な場合だけに限る。

- **Claude Opus 5.5:** 「よく考えて」等のメタ指示は不要。視覚実装レビュー時は既定5点セット（クリーム背景・見出しイタリック・`01/02`番号・モノスペースラベル・ピル型ボタン）への逃げがないかを見る。
- **Claude Sonnet 5.5:** 視覚実装でモック通過だけで済ませる癖があるため、レビュー側で実ブラウザ／スチル結果を確認する。
- **Gemini 4 Neon:** カットオフ2026年3月（最古）のため、新API絡みのレビュー時はローカル型定義との整合を意識する。動画QAは MP4＋音声を直接入力。
- **Gemini 4 Hydrogen:** 軽量モデルのため設計判断させず、委譲時は対象ファイルと見本を最小限明示する。SVG/アニメは従属パーツ（影・関節等）の追従漏れをレビューで確認。
- **GPT-6.2 Astra:** 長期調査・難問デバッグ後は生出力をそのまま流さず **`Claude Opus 5.5 (medium)` で要約リレー**する。
- **GPT-6.2 Sol:** 軽量・単体特化のため変更対象と期待入出力を絞って渡す。PRレビュー時は **`low` 固定**。

---

## Step 4: 「Neon 単体 vs `Orchestrator (Neon)` vs `/swarm`」0.5秒判定＆品質ゲート

### 1. 迷わない3択基準（Antigravity 運用）

| 使うもの | いつ使うか | 崩れ防止・注意点 |
| :--- | :--- | :--- |
| **`Gemini 4 Neon` 単体**<br>(`medium` / `high`) | ① 普段のタスク全般<br>② **長時間・大規模な連続リファクタリング**<br>③ 巨大リポジトリ棚卸し・MP4/音声検品 | プロンプトキャッシュが壊れず一貫した思考で完走できる。大規模連続編集では Orchestrator よりクォータ持ちが良い。 |
| **`Orchestrator (Neon)`**<br>(`gemini-pro-orchestrator-neon`) | **「最初に調査・設計が必要だが、決まった後の編集・パッケージ更新・テスト等の雑務が多い」短〜中規模の単一機能実装・バグ修正** | **長時間の大規模連続編集には使わない**（Neon⇔Hydrogen往復でキャッシュ破壊＆クォータ急消費）。 |
| **`/swarm`**<br>（並列ワーカー） | 共有骨格確定後の**独立した複数カット（1カット1ファイル）・独立SVGアセット・字幕・多視点Read-only監査**の同時量産 | 共有骨格（`STYLE.md`・`Root.tsx`・トークン・冒頭ヒーロー）は直列ロック。`workspace="branch"`＋編集許可/禁止リスト＋**同時最大4ワーカー**＋`remotion render`/エミュレータは**排他1本**。 |

### 2. クロスモデル品質ゲート（自己採点の禁止）
- 実装を担当した**同一モデル・同一セッションに最終採点・承認をさせない**（全主要モデルに強い自己採点バイアスあり）。
- 推奨ペア：
  - `Opus 5.5` / `Sonnet 5.5` 実装 → **`Gemini 4 Neon (high)` で書き出し MP4＋音声をネイティブ実検品**
  - `Neon` / `Hydrogen` 実装 → **`Claude Opus 5.5 (medium〜high)` で審美眼・引き算設計・高難度バグ監査**
  - 並列 `/swarm` 実装 → **クリーンコンテキストの独立 Read-only `@verifier`** が最終ゲートを担当。
