# 案E（`planE_macro_econ` v3.1）視覚・演出システム

数値しきい値・ピクセル定数はコード（`auditRules.ts`・`constants.ts`）が唯一正本。ここには名前だけを書く。

## キャンバスと字幕

- キャンバス: `PLAN_E_CANVAS_WIDTH` × `PLAN_E_CANVAS_HEIGHT`。プリセットの字幕回避は `SUBTITLE_SAFE_BOTTOM` 系。
- 自由舞台の主舞台下端は `PLAN_E_STAGE_BOTTOM`（`guard: 'subtitle'` 既定で物理 clip）。

## 7種サーフェスと明暗極性（`SURFACE_POLARITY`）

| `surface` | 極性 | 質感 |
| :--- | :--- | :--- |
| `paper` / `whiteboard` | `bright` | 紙面・決算カード・マーカー板 |
| `corkboard` | `mid` | コルク・ピン留め・赤紐 |
| `charcoal` / `dark_desk` | `dark` | 黒板・暗い机上の資料と札束 |
| `dark_broll` / `projector` | `dark` | 実写 B ロール・暗室投影 |

シーン途中で地を変えるときは `surfaceShifts` で宣言する（監査の極性連続と字幕の明暗が切替点で追従）。各区間は 2D 素地（`LivingSurface`）と暗幕付き実写（`mediaBackdrop`）を同じ手軽さで切り替えられる。

## 自由舞台（`type: 'custom'`）— 表現の天井

- 層: 地（現在区間の `mediaBackdrop` があれば暗幕付き実写 `DarkMediaBackdrop`、なければ `backdrop` 未指定時に `LivingSurface`）→ `backdrop(ctx)`（任意のカスタム全面層）→ `render(ctx)`（字幕上 clip）。
  下端静音帯 `SubtitleCalm` はカメラ変換外・字幕直下に `activeSurface` 連動で1枚自動配置。
- 背景の選び方（ガイド）: 2D 素地（`LivingSurface`）と実写動画＋暗幕（`mediaBackdrop`）を対等な選択肢として扱う。
  シーン直下または `surfaceShifts` の各要素に `mediaBackdrop`（登録済み素材キー文字列、または `{ key, dim, vignette, blurPx, trimBeforeSec, playbackRate, zoom, pan, ... }`）を1行添えるだけで、暗色グレード・黒幕・ビネット・微ズーム付きの背景になる（通常は `dark_broll` 等の暗極性 `surface` と合わせると字幕・前景が馴染む）。`mediaBackdrop` は区間ごとに指定し、次の切替へは引き継がない（省略した区間は 2D 素地へ戻る）。
  複雑な照明や合成を重ねたい区間だけ `backdrop(ctx)` を併用・差し替えする（`mediaBackdrop` と併用すると暗幕実写の上に重なる）。
- 文脈 `ctx`: `sec`・`t`・`progress`・`cue(語句)`・`beat(id)`・`media(key)`・`surface`・`ink`・`stage`（区間内解決）。
- カメラ: `camera.moves`（語句アンカー）と `camera.shakes` を背景層（暗幕実写・`backdrop`）と舞台層に同時適用。
- 引き出し（正本: `components/plan_e/index.ts`）:
  - 実写・素地: `DarkMediaBackdrop` / `MediaPlate` / `LivingSurface` / 8種背景（`StudioBackground` 等） / `Place` / `Pop` / `Window` / `PaperScrap` /
    `Tape` / `PhotoPrint` / `InkStroke` / `inkCirclePath` / `CountUp` / `DiegeticStamp` 等
  - 光学・物理: `InkFxLayer` / `InkFxFilterDefs` / `ChalkFilterDef` / `DustField` / `LightBeam` / `Spotlight` /
    `ramp` / `eo` / `spr` / `wob` / `squash` / `fly` / `shakeAt` / `impulses` / `tornRect` / `sag` / `handLine` / `rr`
- 型は持たず作品固有の物理演出を設計。`stickman_collage` 直 import は error（`src_cross_format_import`）。

## ペーシング監査（`PLAN_E_AUDIT_RULES`）

- 連続極性上限 `MAX_BRIGHT_STREAK_SEC` / `MAX_DARK_STREAK_SEC` / `MAX_NON_DARK_STREAK_SEC`、比率 `MAX_BRIGHT_RATIO` /
  `MIN_DARK_RATIO`（総尺 `RATIO_CHECK_MIN_TOTAL_SEC` 以上）、ビート間隔 `MAX_BEAT_GAP_SEC`。
- 自由舞台の `cue()`・地切替・カメラも視覚イベントに算入。視覚 cue ありで可聴ビート 0 は `silent_stage`（`SILENT_STAGE_MIN_SEC` 以上）。
- 見出しは数値＋体言止め（`POETIC_HEADLINE_MIN_CHARS`）。意図的例外は `PlanEAuditWaiver`（理由 `MIN_WAIVER_REASON_CHARS` 以上）。

## プリセット・マクロ・小道具（床の道具）

- `diegetic_stage` / `video_broll` / `vhs_pause_avatar` / `news_broadcast` / `editorial_cutout` /
  `whiteboard_trend` / `causal_gear_loop` / `projector_target_map`、マクロ `allocation()` / `selection()`。
- 小道具既定 SFX は `PROP_DEFAULT_SFX`（無音は `sfx: null`）。自由舞台の音は `hit()`。旧9型と `PlanEMacroEconTemplateV2` は `legacy/` 隔離。

## 公式ブランド資産（ch2『経済の赤ペン』）

正本: `studio/src/components/plan_e/brand/`（`plan_e` から re-export。尺・BPM・SFX は `akapenCues.json`）。

- **アイコン**: `<AkapenIcon />`（`penArticle`・`AKAPEN_ICON_SIZE`）、PNG `public/brand/akapen/icon.png`（`Brand-AkapenIcon`）。
- **アイキャッチ 3 種（`AKAPEN_EYECATCH_VARIANTS` / `AKAPEN_EYECATCH_SEC` / `AKAPEN_EYECATCH_BPM`）**: BGM継続＋純 SFX。
  - `swipe`（既定）: 記事片→赤二重線二連一閃 / `pullback`: 赤接写→アイコン＋ロゴ / `slit`: 暗転赤スリット
- 直前の発話チャンクに `"eyecatchAfter": "swipe"` 等を指定する。ビルダーが通常の間の後に専用尺と後間を加え、共通テンプレートが BGM 上で公式映像と SE を再生する。
