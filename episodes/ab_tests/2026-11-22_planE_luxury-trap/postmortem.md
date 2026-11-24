# Phase 4 差分解剖＆ハーネス昇格レポート（`2026-11-22_planE_luxury-trap`）

- **実験軸:** モデル比較（同一音声 `161.48s` / `4,845 frames` / `ElevenLabs v4` 1回生成使い回し）
- **勝者（Winner）:** `v2_opus_high`（Agy1 Opus 5.5 / High）
- **人間ジャッジ:** 「Opusの圧勝　でも白背景が連続して続くと飽きるね」

---

## 1. 定量比較（`v1_astra_high` vs `v2_opus_high`）

| 指標 | `v1_astra_high`（6.2 Astra） | `v2_opus_high`（Opus 5.5・勝者） | 差分の意味 |
| :--- | ---: | ---: | :--- |
| TSX コード規模 | 103行 | 1,249行 | 物理小道具（値札・ポラロイド・手描きマーカー・100円玉・ふるい等）を作り込んだ決定差 |
| シーン数 / 平均秒数 | 16シーン（10.1s） | 21シーン（7.7s） | 視線切替テンポの速さとビート刻み密度 |
| サブビート `sfxCues` | **0発**（`autoSceneSfx: false` で沈黙） | **約60発**（文字時刻・判子・値札同期） | 視聴体感のリズム・小道具の「手触り」の差 |
| 実写動画Bロール秒数 | 4.2s（2.6%） | 15.0s（9.3%・ズレ素材回避） | `base/assets/` の中身ズレ4本を目視回避した検品力 |
| 暗色/Bロール最長連続 | 13.3s | 10.9s（合計 39.7s / 24.6%） | 既存「暗色≤15s」規制は双方クリア |
| **白/紙/板の最長連続** | **27.3s**（9.3〜36.6s） | **27.1s**（9.3〜36.4s） | **既存ハーネスに上限規制がなく双方で白背景が間延び** |
| **非暗色（コルク含）最長連続** | **55.9s**（40.8〜119.7s内） | **54.9s**（64.9〜119.7s：紙→コルク→紙） | **「白背景が連続して続くと飽きる」の直接原因** |
| 白/紙/板の全体比率 | 66.2% | **75.4%**（コルク含） | 暗色受け皿（Bロール・`charcoal`ギア等）の不足 |

---

## 2. 勝因（3点）と共通残課題

1. **ダイエジェティック物理小道具による圧倒的な画面密度（勝因①）：** 既製 `editorial_cutout` の単調な連打（`v1`）に対し、`v2` は吊り下げ値札・テープ留め写真・赤判子・マーカー手描き出現・丸囲みを組み合わせて全編を物理的に演出した。
2. **文字単位アライメント×高密度 `sfxCues` 同期（勝因②）：** `v1` が `autoSceneSfx: false` のまま手動 `sfxCues` をゼロにして無音抜けしたのに対し、`v2` は約60発のSEを視覚ビートへ完全同期させた。
3. **実写素材の中身目視検品（勝因③）：** `base/assets/` 内のファイル名と中身がズレた4本（`02_shopping_mall`・`04_tokyo_street`・`05_smartphone_scroll`・`s01_ginza_luxury_street`）を `v2` は検品回避した。
4. **勝者にも残ったハーネス側の穴（人間フィードバック直結）：** 既存バリデータが「暗色連続≤15s」しか監視しておらず、「白/紙/板の連続」と「非暗色連続（紙→コルク→紙）」が野放しだったため、最大54.9秒の明背景連続・白背景偏重（75%）が発生した。

---

## 3. ハーネス構造への昇格ファイル一覧

1. **Remotion コンポーネント新設・エクスポート（`v2` の勝因＋1:42端切れ防止を構造化）：**
   - `studio/src/components/plan_e/DiegeticProps.tsx`（新設：`DiegeticHangTag` / `DiegeticPhotoClip`（1920px端切れ自動クランプ内蔵） / `DiegeticStamp` / `MarkerWriteOn` / `MarkerEllipse`）
   - `studio/src/components/plan_e/index.ts`（エクスポート追加）
2. **機械バリデータ強化＆単体テスト（白背景飽き＋`v1` SFX沈黙を機械検知）：**
   - `pipeline/scripts/build_plan_e_assets.py`（`validate_plan_e_spec()` に **白/紙/板連続 > 15.0s**、**コルク込み非暗色連続 > 22.0s**、**白背景全体比率 > 65%**、**`autoSceneSfx: false` かつ `sfxCues` 0発** の警告を追加）
   - `pipeline/tests/test_plan_e_builder.py`（`test_detects_bright_backdrop_monotony_and_silent_auto_sfx` 追加、全13件通過）
3. **お手本 Spec 改修（白連続の解消見本）：**
   - `episodes/_templates/plan_e_spec.example.json`（`s05_causal_gear_loop.surfaceTheme` を `"paper"` → `"charcoal"` へ変更。暗≤9.5s・白≤14.5s・白比率27.9%で `--validate-only` 警告0件通過）
4. **ハーネス文書 置換圧縮（全ファイル行数増減ゼロ）：**
   - `harnesses/plan-e-macro-econ/visual_system.md`（22行→22行）
   - `harnesses/plan-e-macro-econ/spec_contract.md`（27行→27行）
   - `harnesses/plan-e-macro-econ/qa_checklist.md`（9行→9行）
   - `.agents/skills/harness-plan-e-macro-econ/SKILL.md`（25行→25行）
