# 台本ABテスト 事後解剖レポート（postmortem.md）

- **実験ID:** `2026-11-22_planE_luxury-trap`
- **対象フォーマット:** `planE_macro_econ`（案E v2.1）
- **勝者:** **`v2_opus_high`（Claude Opus 5.5 / `effort: high`）**（選定メモ：[decision.md](./decision.md)）
- **定量比較データ:** [lint_compare.json](./lint_compare.json)

---

## 1. 定量・定性比較サマリ

| 指標 | `v1_neon_high`（敗者） | `v2_opus_high`（勝者） |
| :--- | :---: | :---: |
| **読み上げ文字数 / 推定尺** | 943字 / 166.4s | **891字 / 157.2s** |
| **冒頭15sフック信号** | 2 | **3** |
| **具体例・皮肉密度（改修後）** | 8.3件/分 | **12.6件/分** |
| **改修後リンター結果** | ERROR 0 / **WARNING 4** | **ERROR 0 / WARNING 0** |

## 2. 勝因（3点）

1. **専門概念・統計の「生活実感」への即時翻訳:**
   - 敗者は「ヴェブレン財の法則」「中産階級」「営業利益率37.1%」を概念名のまま置いたのに対し、勝者は「高いこと自体が価値になる品」「お金持ちに見られたい普通の会社員」「100円売れるたびに37円が残る」「バッグは無理でも財布なら、と手が伸びます」と、聴いた瞬間に自分の財布が浮かぶ口語へ噛み砕いた。
2. **冒頭15秒での当事者化＋タイトル問いの即回収:**
   - 敗者は「5年で2倍に値上げ」から入り主語が遠かったのに対し、勝者は1文目で「もしあなたが160万円のバッグを売るなら、いちばん大事な客は誰でしょう？」と視聴者を当事者化し、2〜3文目で即座に「大富豪はロゴを持たない／支えているのは普通の会社員」と核心を突き刺した。
3. **解説書語尾・テンプレ予告締めの排除と2段オープンループ:**
   - 敗者は解説番組的な「〜のです」が3回（32文中9.4%）集中し、末尾も「ここから解体していきます。」の定型予告で閉じた。勝者は「〜のです」ゼロの乾いた語りを貫き、末尾を「どう決まっているのか。そして次に狙われるのは、誰の財布なのか。」の2段疑問ループで自分ごと化して切った。

---

## 3. 構造昇格ファイル一覧（リンター強化＋初代ゴールデンお手本定着）

1. **台本機械リンター強化:** [`pipeline/scripts/lint_script.py`](../../../../pipeline/scripts/lint_script.py)
   - `explanatory_nodesu_overuse`（解説書語尾「〜のです」の過密 Warning）を追加。
   - `generic_preview_transition`（「〜解体していきます／見ていきましょう」等のテンプレ予告締め Warning）を追加。
   - `IRONY_CONCRETE_MARKERS` に案E経済・生活実感語（会社員・値札・ご褒美・開封動画・買える側・100円 等）を拡充。
2. **単体テスト追加:** [`pipeline/tests/test_lint_script.py`](../../../../pipeline/tests/test_lint_script.py)
   - `test_explanatory_nodesu_and_generic_preview_warnings` を追加し全テスト通過を確認。
3. **初代ゴールデンお手本配置:**
   - [`episodes/_templates/golden_scripts/planE/02_script_display.md`](../../../../episodes/_templates/golden_scripts/planE/02_script_display.md)
   - [`episodes/_templates/golden_scripts/planE/03_script_reading.md`](../../../../episodes/_templates/golden_scripts/planE/03_script_reading.md)
   - ※既存 `.md` 文書への注意書き追記は行わず（行数膨張ゼロ）、構造（リンター＋お手本）側のみで再発防止と再現性を担保。
