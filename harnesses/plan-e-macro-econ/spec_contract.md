# 案E（`planE_macro_econ` v3.1）Spec・タイムライン契約

## 1. Python 側 JSON 契約（`build_plan_e_assets.py`）

- テンプレート: `episodes/_templates/plan_e_spec.example.json`
- **禁止項目**: `scenes` / `imageConfig` / `audio.sfx`（効果音焼込み） / AI画像指定は即エラー。
- **TTS**: `provider="elevenlabs"`, `models=["eleven_v4", ...]`。`splits[].atText` から `charIndex` 自動計算。
- **終了コード（`--validate-only`）**: エラー `2` / 警告あり（`--strict`・`--release`）`1` / 合格 `0`。

## 2. 実写・資料素材検品契約

- `videoClips` / `stockImages` / `images` に `intent` と出典URL必須。
  `asset_manifest.json` へ `sha256` / `verified` 記録（`--release` 未検証は `2`）。
- テンプレート例示URL流用は警告、Wikimedia は高解像度のみ通過。
  `master_audio.wav` はナレ＋BGM の2入力、`contact_sheet.png` 目視。
- 標準 20 種 SFX は `studio/public/sfx/` 常設（`build_sfx.py export-standard`）。
  固有音は `build_sfx.py custom` で `episodes/<slug>/sfx/` へ出力。

## 3. TS 側タイムライン契約（`timeline.ts`）

- `definePlanESpec(base, input)` が開始アンカーから `endSec` を導出。
  時刻は `Anchor`（`at` / `atEvent` / `atStart`）・`ctx.cue()`・`ctx.beat()` のみ（**絶対秒直書き禁止**、相対秒・座標・振幅は自由）。
- `Beat.sfx` 省略は `PROP_DEFAULT_SFX[prop]`、`null` は無音。`hit(at, sfx)` は音専用ビート。
  自由舞台の `<SfxCue>` は probe が検知し `silent_stage` 解消（未知 `kind` は `unknown_sfx_kind` error）。
- `sfxMap` 未指定・空は共通 `studio/public/sfx/` へフォールバック。
  `surfaceShifts: [{ at, surface }]`（`custom` は区間ごとの `mediaBackdrop?` も指定可・次区間へは引き継がない）は区間内・昇順、`camera: { moves, shakes }` も語句アンカー。
- 自由舞台（`type: 'custom'`）は `start`・`surface`・`render(ctx)` を基本とし、背景は `LivingSurface`（既定）・`mediaBackdrop`（登録済み素材キーまたは暗幕設定。シーン直下・`surfaceShifts` 各要素の両方で指定可）・カスタム `backdrop(ctx)`（併用可）から選ぶ。

## 4. 監査契約（`audit.ts` / `sourceAudit.ts`）

- **error（床・事故。常に停止）**: 時間の穴・重なり、surface 不正・地切替の範囲外、未知 SFX、未検品素材（release）、
  自由舞台 probe の `stage_cue_unresolved` / `stage_unknown_media` / `stage_hook_in_render` / `stage_render_throws`、
  source の絶対秒・画面内出典・素材迂回・legacy 利用。
- **editorial（strict で停止。時間区間の指標は waiver 可）**: 極性連続・比率、ビート間隔、`silent_stage`、`missing_prop_sfx`
  （`hit` の音源欠落含む）、説教見出し、SaaS 風 UI 記法。
- **advice（合否に無関係）**: 冒頭がプリセットのみ（`hook_preset_only`）、自由舞台比率が `MIN_STAGE_RATIO_ADVICE` 未満。

- probe は `render()` / `backdrop()` 本体をシーン等分点（`STAGE_PROBE_SAMPLES`）・ビート点・地切替点で実行し、あわせてシーン直下・`surfaceShifts` の `mediaBackdrop` キーも `ctx.media()` 経由で解決検証する。
  `cue()` は本体で解決して子へ数値で渡す。hooks は本体で呼ばず子コンポーネントへ切り出す。
- エピソード制作は `npx tsc --noEmit` と `npm run audit:plan-e -- <id> --src <dir> --strict` を終了コード `0` で通す
  （`npm run test:plan-e` は `studio/src/components/plan_e/` ハーネス本体を改修した時のみ実行）。
