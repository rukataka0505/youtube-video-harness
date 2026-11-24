---
name: harness-ab-evolution
description: >-
  stickman_collage・planE_macro_econ の現行2フォーマット共通で、同一テーマ・同一音声（冒頭90〜180秒）による
  高速ABテスト→人間選定→定量/定性の差分解剖→ハーネス構造改善（コンポーネント・テンプレート・
  機械バリデータ改修とMD置換圧縮）を回す横串スキル。
---

# ハーネス進化ABテストスキル（`harness-ab-evolution`）

現行2フォーマット（`stickman_collage` / `planE_macro_econ`）共通の**演出専用**AB改善ループである（台本自体のAB進化は [script-ab-evolution](../script-ab-evolution/SKILL.md) へ分離）。長尺丸ごとではなく**冒頭数分・同一音声の2〜3案比較**でコストを抑え、勝ち演出の構造だけをハーネス本体へ代謝・定着させる。

> **絶対制約＆API許可:** 稼働中の `episodes/productions/` には触れず、検証は `episodes/ab_tests/` 配下で完結させる。AI画像生成不使用・SIL OFL/Apache 2.0フォント限定・ACML 1.0批判禁止・出典の概要欄集約（画面内表記なし）を厳守。なお本スキル内の **`ElevenLabs v4` TTS（Phase 1・1回生成）** および **Gemini API ネイティブ動画解析（Phase 4・`variants/*/*.mp4` 比較）** は事前承認不要で自律実行してよい。

---

## 1. ディレクトリ構成と命名規約

`.gitignore` の `episodes/**/*.mp4`・`episodes/**/assets/*` 規約に合わせ、演出ABは `episodes/ab_tests/<YYYY-MM-DD>_<format>_<slug>/`（台本ABは `episodes/ab_tests/scripts/` 配下）で共有資産 `base/` と差分案 `variants/` に分離する。

```text
episodes/ab_tests/<YYYY-MM-DD>_<format>_<slug>/
├── base/
│   ├── 02_script_display.md        # 共通表示台本（冒頭90〜180秒）
│   ├── 03_script_reading.md        # 共通読み上げ原稿
│   ├── alignment.json              # ElevenLabs v4 文字単位アライメント＋ffprobe実尺
│   └── assets/                     # 共通音声(.wav/.mp3)＋共通ネット収集素材（読取専用参照）
├── variants/
│   ├── v1_<label>/                 # 例: v1_neon / v2_opus / v3_dense_diagram
│   │   ├── spec.json               # 案別Spec（必要な場合）
│   │   ├── assets/                 # 案固有の追加素材・ミックス音声
│   │   ├── qa_frames/              # 代表フレーム
│   │   └── <varId>.mp4             # 比較用レンダー出力
│   └── v2_<label>/
├── decision.md                     # Phase 3 人間選定メモ（勝者＋一言コメントのみ可）
└── postmortem.md                   # Phase 4 差分解剖＆昇格ファイル一覧
```

---

## 2. 4フェーズ運用フロー

### Phase 1：共通ベース1回生成（トークン＆TTSコスト節約）
1. 対象フォーマットの `harness-*` スキル前提で、1テーマの**冒頭90〜180秒**に絞った表示用台本・読み上げ用台本を作成する。
2. 既定TTS **`ElevenLabs v4`**（`eleven_v4` / `with-timestamps`、`configs/stack.yaml` 準拠・事前承認不要）でナレーション音声・文字単位アライメント・`ffprobe` 実尺JSONを**1回だけ生成**し、`base/` に固定する。
3. テーマ固有の実写写真・紙面見出し・公的図版など共通利用できる素材も `base/assets/` に1度だけ集約する。

### Phase 2：バリエーション並走生成（統制条件つき2〜3案）
- **固定変数（必ず揃える）:** `base/` の音声ファイル、総フレーム数（実尺）、読み上げテキスト（字幕一言一句一致）、フォーマット基本規格。
- **操作変数（原則1実験1軸）:**
  - **モデル比較:** 例 `gemini-4-neon` vs `claude-opus-5-5`（通常 `medium`・勝負カット `high`）
  - **演出方針比較:** 例 構図比率・図解密度・ビート刻み間隔・背景極性・SE/BGM設計
- **並走ルール:** Remotion コンポジション ID はハイフン区切りの `AB-<Slug>-<varId>`（`_` 禁止）で統一し、各案を `variants/<varId>/<varId>.mp4` に出力する。サブエージェントへ並走委譲する際は **What主義**（目的・比較軸・`base/` 参照先のみ記述し、Howや共通制約・完了条件を羅列しない）を守る。

### Phase 3：人間選定ゲート（低摩擦・直感OK）
- 人間が `variants/*/*.mp4`（2〜3本）を見比べて **Winner（勝ちパターン）** を1案指名する。
- **詳細な言語化は不要。**「Aが一番見やすい」「Bは間延び」「Cの図解が刺さる」といった直感・一言コメントだけで即座に Phase 4 へ進む。勝者と一言メモを `decision.md` に数行で残す。

### Phase 4：差分解剖＆ハーネス代謝アップデート（構造強制・文書膨張禁止）
1. **定量＋定性の差分解剖**
   - **定量（Spec / タイムライン / TSX 直接比較）:** ショット平均秒数、ビート間隔・最大静止時間、レイアウト種別比率、図解/実写/棒人間比率、文字数・コールアウト密度、SE発火密度、WCAGコントラスト比。
   - **定性（視覚・リズム比較）:** **Gemini API ネイティブ動画解析**（`gemini-4-neon`、`pipeline/src/yt_engine/analyzer/` 基準・事前承認不要）または `qa_frames/` 横並び比較で、視線誘導・緩急・情報圧縮の差を特定する。
2. **ハーネス構造への組み込み優先順位（コード優先・文書は最後／特定作例をお手本固定化しない）**
   1. **Remotion コンポーネント／デフォルト挙動:** 指示しなくても自然に品質が上がるよう、汎用部品の初期値・レイアウト制約・トランジションを改修する（特定エピソードの構図をテンプレ固定しない）。
   2. **機械バリデータ強化:** 負けパターンの欠陥を `--validate-only` / `--dry-run` の Error / Warning として機械検知させる。
   3. **音声・SFX合成改修:** SE密度やBGMダッキング差が勝因なら `pipeline/src/yt_engine/audio/` を改修する。
   4. **`.md` 更新の鉄則（追記禁止・コード正本）:** `harnesses/<format>/*.md`・`.agents/skills/harness-*/SKILL.md`・`configs/style_guide.md` への注意書き追記は**禁止**。数値しきい値はコード定数に置き、`.md` は定数名参照・1行120字目安・文字数予算（`test_*_docs_budget.py`）を守って置換圧縮する。チェックリストは人間判断項目のみに限定する。

---

## 3. フォーマット別 ハーネス昇格先マップ（現行2フォーマット）

| フォーマット | コンポーネント / テンプレート | 機械バリデータ | ハーネス文書（置換圧縮のみ） |
| :--- | :--- | :--- | :--- |
| **ch1『バグる棒人間』** (`stickman_collage`) | `studio/src/components/stickman_collage/` / `StickmanCollageTemplate.tsx` | `pipeline/src/yt_engine/stickman_collage_validator.py` | `harnesses/stickman-collage/` / `harness-stickman-collage/SKILL.md` |
| **ch2『経済の赤ペン』** (`planE_macro_econ`) | `studio/src/components/plan_e/` / `PlanEMacroEconTemplate.tsx` | `pipeline/scripts/build_plan_e_assets.py` / `studio/scripts/audit-plan-e.ts` | `harnesses/plan-e-macro-econ/` / `harness-plan-e-macro-econ/SKILL.md` |

---

## 4. 完了検証ゲート
- `base/` の音声・実尺を全バリエーションで使い回し、重複TTS生成が発生していないこと。
- `decision.md`（勝者）と `postmortem.md`（勝因3点以内＋変更した構造ファイル一覧）が残っていること。
- 最低1つ以上の改善が**構造側（コンポーネント／テンプレート／機械バリデータ／音声ロジック）**へ組み込まれていること。
- 該当バリデータ（`--validate-only` 等）で勝ち案が通過し、負け案の主要欠陥が検知されること（可能な範囲で回帰確認）。
- `studio/` の `npx tsc --noEmit` が通ること、および `.md` 更新時に文字数予算・1行120字目安・定数名参照を満たしていること。
