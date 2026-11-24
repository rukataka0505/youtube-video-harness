---
name: thumbnail-design
description: >-
  Remotion <Still> 自由舞台 v2（固い床×自由舞台TSX）で現行2フォーマット共通（stickman_collage / planE_macro_econ）の
  YouTubeサムネイル（4K 3840x2160・Test & Compare大差2〜3案・168x94px Lanczosスクイント・
  ライト/ダーク模擬比較シート・文字抜きベースPNG）を設計・機械検証・一括出力する横串スキル。
---

# サムネイル設計・検証・一括出力スキル v2（`thumbnail-design`）

本リポジトリ現行2フォーマット（ch1『バグる棒人間』`stickman_collage` / ch2『経済の赤ペン』`planE_macro_econ`）に横串で適用する **v2「固い床 × 自由舞台 `<Still>` TSX」** サムネイル制作ハーネスである。

- **固定プリセット流し込みの廃止:** テンプレ枠への流し込みは廃止済み。各エピソードで企画ごとに全く別物の世界観・構図・タイポ配置・配色を自由に発明し、**大差2〜3案の自由舞台 `<Still>` TSX**（論理 `1920×1080`、書き出し時 `scale=2` で `3840×2160` 4K）を設計する。共通部品パレット（`studio/src/components/thumbnails/`）は必須ではなく、必要に応じて使える**任意素材**である。
- **クロスモデル分業体制（自己採点禁止）:**
  - **自由舞台 `<Still>` TSX 制作（大差2〜3案）:** **`Claude Opus 5.5 High`**（`claude-opus-5-5` / `effort: high` / `fastMode: false`）
  - **Spec検証・一括ビルド・実画像クロス目視QA:** **`Gemini 4 Neon`**（`gemini-4-neon` / `medium`〜`high`）
- **書体は固定しない:** ゴシック・明朝・手書き系などを題材と大差案の狙いで自由に選ぶ（SIL OFL / Apache 2.0 限定）。
- **素材調達＆出典表記方針:** サムネイル素材でも **AI画像生成は一切使用しない**（ネット収集の実写写真・新聞見出し・公的資料・フリー素材＋Remotion `<Still>` 2D/SVG描画で完結、`sourceType: "ai_generated"` は Error）。**サムネイル画面内に著作権・出典クレジットは記載せず、必要な出典は YouTube 概要欄のみに集約する**。

## 1. 責務境界と参照ドキュメント
- パッケージ・技術規格：[style_guide.md](../../../configs/style_guide.md) 第3節 / [tokens.ts](../../../studio/src/theme/tokens.ts) (`THUMBNAIL_SPEC`)
- 法務・公式誤認防止：[legal-ypp-guardrail](../legal-ypp-guardrail/SKILL.md)
- 共通部品パレット（`ThumbStageFrame` は固い床フレーム、その他は任意素材）：[studio/src/components/thumbnails/](../../../studio/src/components/thumbnails/index.ts)
- `<Still>` 登録ルート：[ThumbnailRoot.tsx](../../../studio/src/ThumbnailRoot.tsx)
- Spec 雛形：[episodes/_templates/thumbnails/](../../../episodes/_templates/thumbnails/)
- 検証＆一括ビルド CLI：[build_thumbnail.py](../../../pipeline/scripts/build_thumbnail.py) / [thumbnail_builder.py](../../../pipeline/src/yt_engine/thumbnail_builder.py)

---

## 2. 絶対制作フロー（Gate 1 台本前ロック → Opus 自由舞台 → Neon ビルド＆クロスQA）

1. **【Gate 1：台本執筆前（Neon）】パッケージ仮確定＆Spec機械検証**
   - 動画制作後にサムネを後付けすると冒頭離脱（型C崩壊）を起こすため、台本執筆前に `episodes/productions/<slug>/thumbnail_spec.json`（`schemaVersion: 2`）を作成し、`workflow.lockedBeforeScript: true`、`clickConfirmPromise`、および大差2〜3案の `compositionId`（命名規約：`Thumb-<EpisodePascal>-A/B/C`）・`copyLines`・`visualHook`・`triggers` を仮確定する。
   - 下記コマンド（完全無料・APIコールゼロ）で全規約パスを確認してから台本執筆へ進む（`stage: "pre_script_locked"` の時点では未実装の `compositionId` は Warning 止まりで通過可能）：
     ```powershell
     .\pipeline\.venv\Scripts\python.exe pipeline/scripts/build_thumbnail.py --spec episodes/productions/<slug>/thumbnail_spec.json --validate-only
     ```

2. **【Gate 6-A：自由舞台 `<Still>` TSX 実装（Opus 5.5 High）】**
   - `studio/src/compositions/episodes/<slugCamel>/thumbnails/<EpisodePascal>Thumbnails.tsx` に大差2〜3案の `<Still>` コンポーネントを作成する。
   - 全案は `FreeStageThumbnailStillProps`（`textless?: boolean`, `showSafeGuides?: boolean`）を受け取り、`<ThumbStageFrame showSafeGuides={showSafeGuides}>` で包む。`textless=true` 時は主コピー層のみ非表示にし、背景・キャラ・図解骨格だけの文字抜きベースを残す。
   - `studio/src/ThumbnailRoot.tsx` に論理サイズ `1920×1080` で `<Still id="Thumb-<EpisodePascal>-A" ... />` 等を登録し、`studio/` で `npm run typecheck` を通す。
   - **自由舞台の設計方針:** 企画ごとに全く別物の世界観・構図・タイポ配置・配色・視覚メタファーを自由に発明する。大差2〜3案でも、絵面・切り口・心理トリガー軸・コピーがはっきり異なる別物の案を設計する。
   - **視覚要素の引き算（推奨）:** スマホ縮小時に一瞬で伝わるよう、主役・モチーフを絞り、画面内の細かい文字や装飾は極力省く。
   - **文字数の目安（推奨）:** スマホ縮小時に0.5秒で読める文字サイズを保つため、コピーは **3〜10文字程度** を推奨する（絶対上限20文字・2行以内は維持）。

3. **【Gate 6-B：一括ビルド＆実測検証（Neon）】**
   - `thumbnail_spec.json` の `workflow.stage` を `"final_qa"` へ更新し、以下を実行する：
     ```powershell
     .\pipeline\.venv\Scripts\python.exe pipeline/scripts/build_thumbnail.py --spec episodes/productions/<slug>/thumbnail_spec.json
     ```
   - 既定で `episodes/productions/<slug>/thumbnails/` へ以下を一括出力・実測検証する：
     - `<variantId>_3840x2160.png`（本番用 4K PNG・50MB以下・`scale=2` 出力）
     - `<variantId>_textless_3840x2160.png`（Photoshop / Figma 最終微調整用の文字抜きベース 4K PNG）
     - `<variantId>_squint_168x94.png`（`ffmpeg` Lanczos 縮小スクイントテスト画像）
     - `comparison_sheet.png`（`2560×1600` 実書き出し PNG 自動埋め込み YouTube ホーム[ダーク・競合混在] ＋ 関連動画[ライト/ダーク 168×94 実寸] ＋ 細目スクイント＆A/B監査シート）
     - `thumbnail_build_report.json`（機械バリデーション＆実測解像度/バイト数レポート）

4. **【Gate 6-C：必須クロスモデル目視QA（Neon）→ 人間最終選定】**
   - 実装担当（Opus 5.5）とは別モデルの **Neon** が `comparison_sheet.png` および各 4K PNG・`*_squint_168x94.png` を直接画像閲覧し、①168×94px（ライト/ダーク両方）で一瞬で文字と主モチーフが読めるか（主役のオチや焦点が潰れず、文字と背景のコントラストが十分か）、②タイトルだけ・画像だけ・両方の3通りで見て「丸写し・言い換えただけの重複」や「接点ゼロ」になっておらず、主題語1〜2語の共有で0.5秒で文脈が噛み合うか、③右下 YouTube 再生時間バッジ領域（`1920×1080` 右下 220×84px）に重要要素が被っていないか、④競合カード群の中で視線強度が抜け、絵面・切り口・コピーともに大差案として検証価値があるかを監査する。合格後、相棒へ最終採用案の選定を仰ぐ。

---

## 3. 共通部品パレット早見表（`studio/src/components/thumbnails/`）

`ThumbStageFrame` のみが固い床フレームであり、**それ以外の背景・手描き・チャンネル資産はすべて必須ではなく任意素材**である。構図・世界観・質感は企画ごとにゼロから SVG / CSS 等で自由に描いてよい。

| カテゴリ | コンポーネント / 資産 | 用途・手触り |
| :--- | :--- | :--- |
| **固い床フレーム（必須）** | `ThumbStageFrame` / `ThumbnailSafeGuidesOverlay` | 論理 `1920×1080` SVG 座標系、SIL OFL フォント自動待機、`showSafeGuides` 重ね焼き |
| **背景質感（任意素材）** | `ThumbGraphPaperBg` / `ThumbDarkSpotlightBg` / `ThumbHalftoneDotsBg` / `ThumbNewsprintBg` / `ThumbGrainLayer` / `ThumbVignetteOverlay` | 方眼紙、暗盤スポット＆光円錐、回転ハーフトーンドット、経済新聞紙面、印刷ムラ、四隅ビネット |
| **手描き・コラージュ（任意素材）** | `ThumbInkText` / `ThumbTornPaper` / `ThumbMaskingTape` / `ThumbHatchFill` / `ThumbRedPenUnderline` / `ThumbRedPenCircle` / `ThumbHandArrow` / `ThumbSparkLines` / `ThumbStampBadge` | 外側ストローク極太タイポ、ちぎり紙座布団、マステ片、斜線ハッチング、赤ペン二重下線・二重丸、鉛筆矢印、ピカ線、かすれ判子 |
| **ch1 資産（任意素材）** | `RiggedStickman`, `reachHand`, `rig`, `BuguruCharacter`, `BuguruFace`, `BuguruGlowFilter`, `SvgSlices`, `ColorSplit`, `GlitchBlocks`, `TwitchMarks`, `BUGURU_PALETTE` | 棒人間ポーズ・×目ブランド顔・水平スライスずれ・RGB色分離・破損ピクセル |
| **ch2 資産（任意素材）** | `AKAPEN`, `AkapenFilterDefs`, `RedPenGlyph`, `akapenFilterIds`, `akapenLoopPath`, `FONT_ECON_SERIF`, `FONT_ECON_MONO` | 赤ペン用インク・マーカー滲み/判子かすれフィルタ・赤ペン本体グリフ・手描き楕円 |

---

## 4. 機械バリデーション規約一覧（`validate_thumbnail_spec` v2）

| 検証項目 | 機械判定基準（Error / Warning） |
| :--- | :--- |
| **現行2フォーマット限定** | `stickman_collage` / `planE_macro_econ` のみ許可（廃止フォーマット・重い3D案Dは Error） |
| **自由舞台 `compositionId`** | 全バリアントに `compositionId`（英数字・ハイフンのみ）必須、バリアント間重複は Error。`final_qa` および実ビルド時は `ThumbnailRoot.tsx` 未登録を Error（`pre_script_locked` の `--validate-only` 時は Warning） |
| **台本前仮確定** | `workflow.lockedBeforeScript: true` および `clickConfirmPromise`・`researchBriefRef` 非空が必須（未達は Error） |
| **サムネ文字数・行数** | `copyLines` は **1〜2行必須**（3行以上 Error）。合計文字数（任意バッジ含む）は **絶対上限20文字**（超過 Error）、**推奨3〜10文字程度**（スマホ縮小で0.5秒で読める文字サイズを保つため推奨・非強制、レポートに字数表示）。バッジ単体は8文字以内。大差案間の同一コピーは原則 Error（各案に最適なコピーを振る運用を推奨） |
| **タイトル文字数・重複** | タイトル目安 **全角30文字前後**（22〜38字範囲外 Warning、45字超 Error。検索KW先頭・`【】`は任意で検査しない）。**丸写し**（コピー全体がタイトルに含まれる）のみ Error、言い換えに近い重複（連続一致9字以上 / バイグラム一致率60%以上）は Warning。**主題語1〜2語の自然な共有は推奨** |
| **4大心理トリガー** | `numbers`（具体数字）/ `loss_avoidance`（損失回避）/ `surprise`（意外性）/ `self_relevance`（自分ごと化）から **1〜2種必須**（0種・3種以上・重複は Error）。別案と同一トリガー集合は Warning |
| **右下バッジ回避・コントラスト** | `copyZone: "bottom_right"` は禁止（Error）。それ以外のタイポ配置は自由。通常は背景（または座布団 `textBacking`）対比 **4.5:1 以上**必須。太縁取り `strokeColor` 指定時は **背景 3.0:1 以上（Large Text）かつ縁取り 4.5:1 以上**で合格 |
| **AI画像生成禁止・終了モデル禁止** | `sourceType: "ai_generated"` は全面禁止（Error）。ネット収集素材（`existing_public` / `public_domain` / `commercial_stock`）または `none`（Remotion 描画）のみ許可。終了済みモデル・画面内出典表記も禁止 |
| **公式誤認加工・3大NG** | `noOfficialImpersonation: true`、商標誤認なし、なりすまし語句（「【公式】」等）なし、AI slop 3大NG排除、一次情報3ソース以上、SIL OFL/Apache 2.0限定必須 |
| **出力解像度・容量** | A/B全案最低 **`1280×720` 以上**・16:9必須（未満 Error）、本番4K **`3840×2160`** 推奨、サイズ **`50MB` 以下**、スクイント `168×94` 固定 |

---

## 5. インプレッション規模別のテスト運用ルール
- **日次インプ 1,000回以上（`dailyImpressionsTier: "over_1000"`）：** YouTube公式 `Test & Compare` へ大差の2〜3案（全案 `1280×720` 以上）を投入。
- **日次インプ 1,000回未満（`dailyImpressionsTier: "under_1000"`）：** 公式A/Bテストの14日判定不能復帰を避けるため、投稿タブ「画像アンケート」事前検証 ＋ 公開後48〜72h単位での **7日間順次スワップ（1回1変数）** で比較する。
