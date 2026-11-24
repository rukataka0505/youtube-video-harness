# 再利用テンプレート方針（`studio/src/templates/`）

- **採用対象（現行2フォーマット）:**
  1. `StickmanCollageTemplate.tsx`（`stickman_collage` v2.1：2D棒人間×背景極性×TSX自由演出）
  2. `PlanEMacroEconTemplate.tsx`（`planE_macro_econ` v3.1：逆説・シニカル経済構造解剖）
- **除外対象:** 旧ハーネス（案A・案B・案C路線A・旧案Cシネマ・重い3D系/案D）は廃止・削除済みにつきテンプレートを作成しない。
- **非真正コンテンツ防止原則:** テンプレートは「固い基盤（音・尺・背景極性・字幕保護）」を担い、各動画の中身はテーマ固有のTSXシーンと一次情報データで独自に組むこと。

---

## 全フォーマット共通サムネイル v2（固い床 × 自由舞台 `<Still>` TSX）

サムネイル制作は固定プリセット流し込みを廃止し、動画本編と同じ **「固い床（共通インフラ＋部品パレット）× 自由舞台 `<Still>` TSX」** の v2 方式へ統一している。

- **共通インフラ:** `studio/src/templates/thumbnails/ThumbnailFeedComparisonSheet.tsx`（実書き出し PNG を自動埋め込みする YouTube ホーム[ダーク]＋関連動画[ライト/ダーク 168×94 実寸]＋細目スクイント模擬比較シート）
- **共通部品パレット:** `studio/src/components/thumbnails/`（`ThumbStageFrame`、方眼紙・ドット・暗盤・新聞紙面背景、ちぎり紙・マステ・赤ペン下線/丸・ハッチング・判子、ch1/ch2 ブランド資産）
- **エピソード自由舞台:** `studio/src/compositions/episodes/<slugCamel>/thumbnails/` に大差 2〜3 案の `<Still>` TSX を実装し、`studio/src/ThumbnailRoot.tsx` へ `Thumb-<EpisodePascal>-A/B/C` として登録する。

1. **台本執筆前に Spec JSON を作成し無料検証する**
   ```powershell
   Copy-Item episodes\_templates\thumbnails\<format>_thumbnail_spec.example.json episodes\productions\<slug>\thumbnail_spec.json
   .\pipeline\.venv\Scripts\python.exe pipeline/scripts/build_thumbnail.py --spec episodes/productions/<slug>/thumbnail_spec.json --validate-only
   ```
2. **自由舞台 `<Still>` の本番4K PNG・文字抜きベースPNG・168×94px Lanczos スクイント・ライト/ダーク比較シートを一括生成する**
   ```powershell
   .\pipeline\.venv\Scripts\python.exe pipeline/scripts/build_thumbnail.py --spec episodes/productions/<slug>/thumbnail_spec.json
   ```
   - 出力先（既定：`episodes/productions/<slug>/thumbnails/`）：各案4K PNG（`3840×2160`・50MB以下）、文字抜きベース4K PNG、`168×94px` Lanczos スクイント画像、`2560×1600` ライト/ダーク模擬比較シート、`thumbnail_build_report.json`。
