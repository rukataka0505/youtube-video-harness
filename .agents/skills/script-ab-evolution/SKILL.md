---
name: script-ab-evolution
description: >-
  stickman_collage / planE の現行2フォーマット横断で、
  演出AB（harness-ab-evolution）と責務分離した台本専用ABテスト進化スキル。
  episodes/ab_tests/scripts/ 配下の4フェーズ運用、lint_script.py --compare による参考メトリクス比較、
  固い床改善→文書置換圧縮の構造昇格を回す。
---

# 台本専用ABテスト進化スキル（`script-ab-evolution`）

現行2フォーマット（`stickman_collage` / `planE_macro_econ`）横断の台本品質進化ループである。**本スキルは台本（構成・フック・語り口・緩急リズム・口語自然度）専用**であり、演出・映像構図・SE/BGMの同一音声ABは [harness-ab-evolution](../harness-ab-evolution/SKILL.md) へ委ねる。

> **絶対制約（固い床）＆API許可:** 稼働中の `episodes/productions/` には触れず、検証は `episodes/ab_tests/scripts/` 配下で完結させる。一次情報3ソース以上・2ファイル整合・読み上げ原稿のト書き/英語指示/装飾ゼロ・冒頭挨拶/登録依頼ゼロ・終了合図語ゼロ・ACML 1.0批判禁止・YMYL非助言・出典の概要欄集約（画面内表記なし）を厳守。Phase 3 任意の耳チェック用 **`ElevenLabs v4` TTS**（テキスト選定で決めきれない場合のみ）および Phase 4 任意の **Gemini API テキスト比較解剖** は事前承認不要で実行してよい。

---

## 1. ディレクトリ構成と命名規約

`.gitignore` のバイナリ除外規約に合わせ、共通前提は `base/`、台本差分案は `variants/` に分離する。

```text
episodes/ab_tests/scripts/<YYYY-MM-DD>_<format>_<slug>/
├── base/
│   └── 01_research_brief.md        # 共通テーマ・一次情報3ソース以上・仮パッケージ・目安尺・比較軸
├── variants/
│   ├── v1_<label>/                 # 例: v1_neon / v2_opus / v3_irony_strong
│   │   ├── 02_script_display.md    # 表示用・演出設計台本
│   │   ├── 03_script_reading.md    # TTS読み上げ専用原稿（純日本語・ト書き除外）
│   │   └── assets/                 # （任意）Phase 3 耳チェック用 ElevenLabs v4 音声のみ
│   └── v2_<label>/
├── lint_compare.json               # （任意）lint_script.py --compare --json 出力
├── decision.md                     # Phase 3 人間選定メモ（勝者＋一言直感コメント）
└── postmortem.md                   # Phase 4 差分解剖＆昇格ファイル一覧
```

---

## 2. 4フェーズ運用フロー

### Phase 1：共通ベース固定（テーマ・一次情報・目安尺）
1. テーマ・一次情報3ソース以上・仮確定パッケージ・目安尺（冒頭90〜180秒、または構成骨子＋冒頭3分程度。厳格な文字数強制はしない）・今回の比較軸を `base/01_research_brief.md` に1回固定する。
2. 対象フォーマットの語り口指針（[style_guide.md](../../../configs/style_guide.md)）と固い床基準（[script-production](../script-production/SKILL.md)）を共通前提とする。

### Phase 2：台本並走生成（1実験1軸・2ファイル分離）
- **固定変数（必ず揃える）:** `base/01_research_brief.md` のテーマ・一次情報・対象チャンネル。
- **操作変数（原則1実験1軸）:**
  - **モデル比較:** 例 `gemini-4-neon` vs `claude-opus-5-5`（通常 `medium`・勝負回 `high`）
  - **台本軸比較:** 導入切り口、語り口、皮肉/ユーモア密度、緩急リズム、構成・リフック設計
- **出力＆固い床チェック:** 各案を `variants/v<N>_<label>/` に `02_script_display.md` と `03_script_reading.md` の2ファイル分離で生成し、`pipeline/scripts/lint_script.py` で **固い床 ERROR 0** を通す（WARNING 0 は強制しない）。サブエージェントへ並走委譲する際は **What主義** を守る。

### Phase 3：人間選定（2段階ゲート）
1. **Step 3-1（0円テキスト直感選定）:** まず人間が `variants/*/02_script_display.md`・`03_script_reading.md` を読み比べ、Winner（勝ち案）を直感指名する。「Aは冒頭で止まる」「Bは説明くさい」等の一言コメントのみで可。
2. **Step 3-2（任意・`ElevenLabs v4` 耳チェック）:** テキストだけで甲乙つけがたい場合のみ、対象案の `03_script_reading.md` を既定TTS **`ElevenLabs v4`**（`eleven_v4` / `voice_id: TX3LPaxmHKxFdv7VOQHJ` / `language_code: ja`）で `variants/<varId>/assets/` へ音声化し、語感・間・テンポを聴き比べる。
3. 勝者と一言メモを `decision.md` に記録する。

### Phase 4：差分解剖＆構造昇格（固い床×自由舞台の維持）
1. **定量解剖（`lint_script.py --compare`）:**
   ```powershell
   .\pipeline\.venv\Scripts\python.exe pipeline/scripts/lint_script.py --compare episodes/ab_tests/scripts/<exp>/variants --json --out episodes/ab_tests/scripts/<exp>/lint_compare.json
   ```
   推定尺、平均/最大文長、短文連続、冒頭15秒密度、リフック間隔、具体例/皮肉密度、漢字率、「間」の手がかり数を**参考メトリクス**として横並び比較する。
2. **定性解剖:** 引きの強さ・口語自然度・緩急・構成の納得感・読後感を比較する（必要時 Gemini API テキスト比較レビュー併用可）。
3. **構造昇格の優先順位（過剰縛りの禁止・台本のお手本固定化は行わない）:**
   1. **リンター改修は「真の事故（固い床）」または「非強制メトリクス/TTS前処理WARNING」に限定:** `pipeline/scripts/lint_script.py` へ新規追加する場合、2ファイル整合やTTS破綻など明らかな事故のみ ERROR とし、表現・リズム・尺・海外固有名詞の自由を奪う過剰ブロックや語彙レベルのNG語リストは追加しない（リズム・密度は参考メトリクスへ追加）。
   2. **文書更新は置換圧縮（追記禁止）:** `configs/style_guide.md`・`.agents/skills/script-production/SKILL.md`・`docs/evergreen/09_plan_e_longform_blueprint.md` 等への注意書き追記は禁止。既存記述を簡潔に置換圧縮する。

---

## 3. フォーマット別 台本昇格先マップ（現行2フォーマット）

| フォーマット | 機械リンター | 関連ブループリント／文書（置換圧縮のみ） |
| :--- | :--- | :--- |
| **ch1『バグる棒人間』** (`stickman_collage`) | `pipeline/scripts/lint_script.py` | `harnesses/stickman-collage/README.md` / `configs/style_guide.md` |
| **ch2『経済の赤ペン』** (`planE_macro_econ`) | `pipeline/scripts/lint_script.py` | `docs/evergreen/09_plan_e_longform_blueprint.md` / `configs/style_guide.md` |

---

## 4. 完了検証ゲート
- `base/01_research_brief.md` が固定され、全案が同一テーマ・一次情報・比較軸で生成されていること。
- `decision.md`（勝者）と `postmortem.md`（勝因3点以内＋昇格ファイル一覧）が残っていること。
- **①リンター改善（固い床/参考メトリクス）**または**②文書置換圧縮**のいずれか1つ以上が反映されていること。
- `pipeline/scripts/lint_script.py` を改修した場合は `pipeline/tests/test_lint_script.py` が通過し、自由舞台の表現で誤爆しないこと。
- `.md` を更新した場合、冗長な追記をせず既存記述を置換圧縮していること。
