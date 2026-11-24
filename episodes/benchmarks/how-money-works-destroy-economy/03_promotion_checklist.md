# 案E（`planE_macro_econ` / `How Money Works` 型）資産昇格チェックリスト

- **ベンチマーク:** [`how-money-works-destroy-economy`](episodes/benchmarks/how-money-works-destroy-economy/01_gemini_analysis.json) (`https://www.youtube.com/watch?v=OAVin6xxd8E`)
- **更新日:** 2026-11-22

## 1. ベンチマーク解析・非公開60秒再現・QA成果物
- [x] `episodes/benchmarks/how-money-works-destroy-economy/01_gemini_analysis.json` (`HookMicroSpec`, `gemini-4-neon`, 2.0 FPS high)
- [x] `episodes/benchmarks/how-money-works-destroy-economy/01b_shot_breakdown.json` (19 shots 詳細分解)
- [x] `episodes/benchmarks/how-money-works-destroy-economy/04_pass2_macro.json` (`MacroWinningBlueprint`, `17:39 / 1059.0s`, 0.5 FPS low)
- [x] `episodes/benchmarks/how-money-works-destroy-economy/04b_chapter_blueprint.json` (全11章チャプターブループリント)
- [x] `episodes/benchmarks/how-money-works-destroy-economy/benchmark_60s_spec.json` (`build_plan_e_assets.py` 入力Spec)
- [x] `studio/src/compositions/benchmarks/how_money_works_destroy_economy/HowMoneyWorksDestroyEconomy60s.tsx` & `Root.tsx` 登録（非公開再現）
- [x] `episodes/benchmarks/how-money-works-destroy-economy/qa_frames/*.png`（代表8枚＋改修後4枚＋サムネ1枚視覚QA完了）
- [x] `episodes/benchmarks/how-money-works-destroy-economy/preview_v1_60s.mp4`（1080p 30fps, 59.136s, 48kHz stereo `ffprobe` 検証完了）
- [x] `episodes/benchmarks/how-money-works-destroy-economy/02_diff_notes.md`（構造・テンポ・視覚密度・改修差分記録）

## 2. リポジトリ基盤への昇格定着
- [x] **トークン・パレット:** `studio/src/theme/tokens.ts` に `FORMAT_PALETTES.planE_macro_econ` / `PLAN_E_MACRO_PALETTE` 追加
- [x] **再利用コンポーネント:** `studio/src/components/plan_e/`（`fonts.ts`, `types.ts`, `MacroEconCanvas.tsx`, `ParadoxHookHeader.tsx`, `EconChartWidget.tsx`, `IncentiveLoopDiagram.tsx`, `SatireCollageStage.tsx`, `PolicyLeverBoard.tsx`, `index.ts`）
- [x] **汎用ランナーテンプレート:** `studio/src/templates/PlanEMacroEconTemplate.tsx` & `studio/src/templates/index.ts`
- [x] **サムネイル統合（4フォーマット横断）:** `studio/src/templates/thumbnails/PlanEThumbnailTemplate.tsx`, `defaultSpecs.ts`, `ThumbnailDispatcher.tsx`, `ThumbnailRoot.tsx` (`ThumbnailPlanE`), `pipeline/src/yt_engine/thumbnail_builder.py`, `episodes/_templates/thumbnails/plan_e_thumbnail_spec.example.json`
- [x] **音声＆ビルダーCLI:** `pipeline/src/yt_engine/audio/sfx_synth.py`（`cynical_econ_groove_bgm`, `add_stamp_thud`, `add_chart_tick`）, `pipeline/scripts/build_plan_e_assets.py`（`--validate-only` / `--dry-run` / 本ビルド）, `pipeline/src/yt_engine/schemas.py`
- [x] **Spec 雛形:** `episodes/_templates/plan_e_spec.example.json`
- [x] **ブループリント＆スタイル規律:** `docs/evergreen/09_plan_e_longform_blueprint.md`, `docs/evergreen/02_format_and_localization.md`, `configs/style_guide.md`（第1.1節 / 第4.5節）
- [x] **専用ハーネス＆入口スキル:** `harnesses/plan-e-macro-econ/`（`README.md`, `visual_system.md`, `spec_contract.md`, `relay_playbook.md`, `qa_checklist.md`）, `.agents/skills/harness-plan-e-macro-econ/SKILL.md`
- [x] **横串スキル＆台帳／ルーティング更新:** `.agents/skills/{remotion-motion-design,script-production,benchmark-deconstruct,thumbnail-design}/SKILL.md`, `harnesses/README.md`, `episodes/_templates/README.md`, `studio/src/templates/README.md`, `AGENTS.md`
- [x] **単体テスト整備:** `pipeline/tests/test_plan_e_builder.py`, `pipeline/tests/test_thumbnail_builder.py`
