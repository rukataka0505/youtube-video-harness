# `stickman-collage` v2.1 ハーネス（ch1『バグる棒人間』 / `formatId: stickman_collage`）

**「固い基盤×自由な TSX シーン」**。入口: [SKILL.md](../../.agents/skills/harness-stickman-collage/SKILL.md) / 共通原則: [`AGENTS.md`](../../AGENTS.md)。

## 1. 責務分離と TSX シーン契約

- **基盤層（自動保証）**: ElevenLabs v4＋文字同期（`timeline.json`）、字幕保護（`STICKMAN_CONTENT_BOTTOM` 下
  `clipPath`）、`PolarityBackground` 8種＋`mediaBackdrop` 暗幕実写＋`SubtitleCalm`＋3f遷移、章間アイキャッチ、
  `resolveAsset()`、`cue()`、機械バリデータ。
- **純粋エンジン（`studio/src/components/stickman_collage/index.ts`）**: `RiggedStickman`, `Stage`（単一SVG・共有ボイル・
  `Stage.Crisp`・カメラ・影）, `motionMath`, `StageEffects`, `HandDrawnMotion`, `StickmanDiagrams`,
  `StickmanMediaBackdropLayer`。小道具は作品 TSX で自由造形。
- **TSX 入口**（`StickmanSceneProps`）: `sec`, `globalSec`, `shotDurationSec`, `beats`, `cue()`,
  `polarity`, `theme`, `safeRect`, `resolveAsset`, `shot`, `params`（`bgActorX` 可）を `customScenes` 登録。

## 2. 背景カタログ（`STAGE_POLARITIES` × `mediaBackdrop`）

| `polarity` | 質感 | 盤/字幕 | 特性/用途 |
|:---|:---|:---|:---|
| `black` | 黒スタジオ（光柱） | 暗/白 | `glow`/導入・没入・暗幕標準 |
| `white_sketch` | 白スケッチ（木漏れ影） | 明/黒 | 濃墨/日常導入・比喩 |
| `grid_paper` | 製図方眼（寸法線） | 明/黒 | 濃墨/因果図解・構造分解 |
| `wood_desk` | 木目机（ランプ＋マグ） | 中/白 | `cutout`/書斎・習慣 |
| `kraft_cork` | クラフトコルク（画鋲） | 中/白 | 温調影/推理・手がかり |
| `blueprint` | 紺ブループリント（光） | 暗/白 | `glow`/設計図・裏構造・紺暗幕 |
| `cream_notebook` | クリーム罫線（付箋） | 明/黒 | 紙面微揺/メモ・比較・本音 |
| `light_table` | 透写台（青ラフ） | 明/黒 | `onionSkin`/連続動作・変容 |

- **暗幕実写（`shot.mediaBackdrop`）**: 登録動画（`scene_video`/`broll_video`）・静止画を ID か
  `{ assetId, dim, vignette, blurPx, trimBeforeSec, playbackRate, loop, zoom, pan }` で全面化。
  暗幕・ビネット・微ズーム・`SubtitleCalm`・白字字幕を自動適用（`black`/`blueprint` 推奨）。
- **事前ベイク PNG**: `studio/public/backgrounds/*.png`（`useBaked` 既定 `true`、更新 `npm run bake:backgrounds`）。

## 3. ブランド資産・章間アイキャッチ

正本: `studio/src/components/stickman_collage/brand/`（アイコン `BuguruIcon`）。
- **公式 3 種（`BuguruEyecatch` / `BUGURU_EYECATCH_VARIANTS`）**: `strips`（汎用・明盤紙帯）/ `zoom`（導入後・
  明盤×目）/ `glitch`（暗転・暗盤 glow）。SE 再合成: `pipeline/scripts/build_buguru_brand_sfx.py`。
- **章間専用無音スロット方式**:
  - `spec.json` の **`chapters[].eyecatch`**（`variant`/`showName`/`withSfx`/`leadInSec`/`durationSec`/`postPauseSec`）で宣言。
  - `build_stickman_collage_assets.py` が前章余韻（`BUGURU_EYECATCH_DEFAULT_LEAD_IN_SEC` 0.25s）→本体
    （`BUGURU_EYECATCH_DURATION_SEC` 1.0s・無音）→後間（`BUGURU_EYECATCH_DEFAULT_POST_PAUSE_SEC` 0.25s、最小
    `BUGURU_EYECATCH_MIN_POST_PAUSE_SEC` 0.15s）を確保。
  - `StickmanCollageTemplate` が自動描画（`BUGURU_EYECATCH_CUT_SEC` 0.40s 裏で極性切替）。TSX 配置不要（併用は ERROR）。

## 4. 演出規律・バリデータ契約（`stickman_collage_validator.py`）

- **実写境界**: 固有実在物（実在人名 `polaroid_person`・特定場所・固有商品）は実写必須。一般小道具は手描き可。
- **ERROR**: 未登録 TSX キー、`scene.component` 空、不正 `polarity`/`lightBg` 矛盾、未解決素材 ID（`mediaBackdrop` 含む）、
  範囲外拍/SFX/`beatIndex`、章間アイキャッチ無音間不足/重複/TSX二重配置、`clip_cards`・`badge`/`subText`、SaaS 禁止 CSS
  （`borderLeft`/`borderRadius: 999`/slate/ダーク色）、AI 画像、合成ピアノ、画面内出典、ID `_`、字幕違反。
- **WARNING**: 無変化 `> MAX_VISUAL_STATIC_GAP_SEC`、Hero TSX 未設定、`secondaryPhotoLayers`、旧重ね掛け
  （`- BUGURU_EYECATCH_CUT_SEC`）、実在人名未紐づけ、単一背景、ボイル内文字、長文、`cue()` 低密度
  （`> MAX_CUE_INTERVAL_SEC`）、極小 `fontSize`（`< MIN_MOBILE_FONT_SIZE_PX`）/ スケール（`< MIN_MOBILE_STATIC_SCALE`）。

## 5. 効果音

- TSX の視覚ヒットに `<SfxCue kind="stamp_thud" atSec={cue('語句')} />` を直結（起点秒は自動加算。
  `spec.json` の `sfx` は互換用。[カタログ](../../pipeline/src/yt_engine/audio/README.md#sfx-カタログ標準-20-種カスタム合成)）。
- 合わない音は `build_sfx.py custom --slug <slug> --name <name>` で自作し `<SfxCue src="episodes/<slug>/sfx/<name>.wav" />`。
- 既定音量 `SFX_DEFAULT_VOLUME=0.35`。書き出し後 `master_final.py`（-14.0 LUFS）。

## 6. 検証・制作体制

[章の実装・検品](../chapter-work.md)。全体検査は統合時。

- **裏方＋クロス目視 QA ＝ Neon（`high`）**: 企画〜音声ビルド・検証・配線・レンダー・仕上げ・目視検品（自己採点禁止）。
- **映像 TSX 演出 ＝ Opus 5.5（`effort: high`）専任**: 全編 `scene.mode="tsx"`＋`<SfxCue>` を実装。
  フル尺は **1 委譲＝1 チャプター（10〜15 カット目安）** で分割並列。

```powershell
# 1. 音声ビルド
.\pipeline\.venv\Scripts\python.exe pipeline/scripts/build_stickman_collage_assets.py `
  --spec episodes/productions/<slug>/spec.json `
  --tsx-out studio/src/compositions/episodes/<CompDir>/timeline.ts

# 2. TSX 実装後の監査＋型チェック
.\pipeline\.venv\Scripts\python.exe pipeline/scripts/build_stickman_collage_assets.py `
  --spec episodes/productions/<slug>/spec.json `
  --tsx-dir studio/src/compositions/episodes/<CompDir> `
  --timeline episodes/productions/<slug>/timeline.json --validate-only
Set-Location studio; npx tsc --noEmit

# 3. 書き出し後の音圧仕上げ
.\pipeline\.venv\Scripts\python.exe pipeline/scripts/master_final.py --input <in.mp4> --output <out.mp4>
```
