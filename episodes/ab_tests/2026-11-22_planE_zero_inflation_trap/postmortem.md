# 案E ABテスト事後解剖レポート：2026-11-22_planE_zero_inflation_trap

## 1. Gemini API 動画3本横断解析（gemini-4-neon / 1.0 FPS）
詳細データ：[gemini_video_analysis.json](episodes/ab_tests/2026-11-22_planE_zero_inflation_trap/gemini_video_analysis.json) ／ 人間選定基準：[decision.md](episodes/ab_tests/2026-11-22_planE_zero_inflation_trap/decision.md)

| Variant | リズム(切替間隔) | 極性切替 | グラフ視認性 | SFX同期 | 脱AI Slop | 字幕安全 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `v1_neon_high` | 5.0 (4.2s) | 5.5 | 4.5 | 4.0 | 4.5 | 6.0 |
| `v2_orch_neon` | 5.5 (3.6s) | 5.0 | **7.0** | 4.5 | 4.0 | 6.0 |
| `v3_opus_high` | **7.0 (2.3s)** | **7.5** | 6.5 | **3.5 (最下位)** | 5.5 | 5.5 |

- **v3 勝因（採用軸）:** 暗色Bロール→号外(00:13)→特売チラシ(00:26)→コルク×赤紐×無罪判子(00:45)→暗室地図(01:18)へ2.3s平均切替。
- **v2 勝因（合流軸）:** 00:36 オーク木枠4カ国比較＋「30年格差 -50pt」、00:23 RGBグリッチ、00:49〜 因果ギア動作。
- **3大欠陥:** ① **SFX抜け**（v3 00:04/00:08/00:13/00:21/00:46/00:55/01:12、v1 00:19、v2 00:26） ② **残存AI Slop**（v1 00:56 / v2 00:49 青方眼カード、v1 00:39 `日本 ±0%間`ラベル重複、報道帯字幕近接） ③ **映像内お説教ポエム見出し**（v3 00:22・01:03「一人ひとりは、正解。／国全体では、不正解。」＋横線バー・01:10・01:17）。

## 2. 案Eハーネスへの構造昇格（スクラップ＆ビルド）
- **Remotion (`studio/src/`):** `RgbGlitchBurst.tsx` ＆ `CausalGearLoopStage.tsx` 新設；`EditorialCutoutCard.tsx`（`EditorialCutoutStage` / `CorkboardBackdrop` / `EditorialPaperBackdrop`）・`WhiteboardTrendChart.tsx`（`deconflictEndLabels`＋赤丸強調＋`left:245, bottom:176`）・`ProjectorTargetMapStage.tsx`（ISO2小文字重心自動解決・秒基準ズーム）・`VideoBrollStage.tsx`（`overlayCutout` / `bottom:168`）・`BreakingNewsBroadcast.tsx`（`bottom:168`）・`MacroEconCanvas.tsx`（`corkboard`・既定 `showLegacyCitation=false`）・`PlanEMacroEconTemplate.tsx`（新4型統合・`sfxMap` 二重再生防止サブビート `<Audio>`）。
- **音声＆ビルダー＆解析:** `sfx_synth.py`（`camera_shutter` / `price_ping` / `export_sfx_library`）・`build_plan_e_assets.py`（`sfxMap`/`sfxEvents`出力・AI Slop/ポエム/冒頭SFX/15s暗色連続バリデータ）・`ab_compare.py --format planE_macro_econ`・`plan_e_spec.example.json` ＆ `test_plan_e_builder.py` 更新。
- **文書圧縮置換:** `SKILL.md` と `harnesses/plan-e-macro-econ/` 5文書を旧記述削除の上ベースライン行数以下へ置換。

## 3. 検証実績
- **型チェック (`npx tsc --noEmit`)**: `plan_e` / `PlanEMacroEconTemplate` / `templates/` 関連 **エラー 0 件**（終了コード 1 は並行作業中の対象外 `stickman_self_help/v1OpusTimeline.ts:147`, `v2NeonTimeline.ts:1885` の2件のみに起因）。
- **Python 検証**: `test_plan_e_builder.py` **12/12 OK**、`build_plan_e_assets.py`（お手本Spec `--validate-only`: `passed: true, warnings: []` / `--dry-run`: `sfxMap` 15種・Exit 0 / 旧 `base_spec.json`: 警告3件検知）、`ab_compare.py` 等 `py_compile` 通過。
- **その他**: `.md` 7本すべてベースライン行数以下へ圧縮置換完了、`episodes/productions/` 未変更。
