# 案E（`planE_macro_econ`）v3.1 ハーネス（ch2『経済の赤ペン』）：固い床 × 自由な舞台

案E は **JSON が素材・字幕・文字単位時刻を持ち、TSX が演出とビート時刻を定義する** 二層分離ハーネス。
v3.1 は `stickman-collage` v2 の思想を吸収し、
**床（事故防止）はコードが保証し、天井（表現）は自由舞台で制作モデルに渡す**。

## 床：ハーネスが自動保証すること

1. **一本のタイムライン**: `build_plan_e_assets.py` が `chunks` / `charTimes` / `assets` を出し、`scenes` は持たない。
2. **語句アンカー**: 「いつ」は `at()` / `ctx.cue()` / `ctx.beat()` からだけ取る。絶対秒の直書きは監査で止める。
3. **SFX**: ヒットに `<SfxCue kind="stamp_thud" atSec={ctx.cue('語句')} />`（標準 20 種）を直結。
   合わない音は `build_sfx.py custom` で自作し `<SfxCue src="episodes/<slug>/sfx/<name>.wav" />`。
   `PROP_DEFAULT_SFX` / `hit()` 併用可（[カタログ](../../pipeline/src/yt_engine/audio/README.md#sfx-カタログ標準-20-種カスタム合成)）。
4. **TS 機械監査**: 極性連続・比率・ビート間隔は `auditRules.ts` 正本。自由舞台は probe で事前実行し
   未解決語句・未登録素材・hooks 誤用・例外を **描画前に error** にする。
5. **素材検品**: 実写・一次資料は `sha256` 検品済みマニフェストから `ctx.media(key)` や `mediaBackdrop` で引く。AI 画像は使わない。
6. **字幕の物理保護**: 自由舞台の主舞台は `PLAN_E_STAGE_BOTTOM` 以下を clipPath で遮断する。

## 天井：制作モデルに任せること

- 自由舞台（`type: 'custom'`）では座標・相対秒・振幅・層構成・カメラ・地の切替（2D 素地・暗幕実写 `mediaBackdrop`・カスタム `backdrop`）を自由に書く。
- プリセット（`video_broll` / `diegetic_stage` / `allocation()` 等）は床の速い道具であって型ではない。

## 索引

- [視覚・演出・自由舞台](visual_system.md) / [スキーマ＆検証契約](spec_contract.md)
- [制作リレー手順](relay_playbook.md) / [人間最終 QA](qa_checklist.md)
- ブランド資産: `studio/src/components/plan_e/brand/`（[visual_system.md](visual_system.md)）

## 主要コマンド

```powershell
.\pipeline\.venv\Scripts\python.exe pipeline\scripts\build_plan_e_assets.py --spec <spec.json> --validate-only --strict
.\pipeline\.venv\Scripts\python.exe pipeline\scripts\build_plan_e_assets.py --spec <spec.json> --contact-sheet-only
.\pipeline\.venv\Scripts\python.exe pipeline\scripts\build_akapen_brand_sfx.py
Set-Location studio; npm run audit:plan-e -- <composition-module> --src <作品TSXディレクトリ> --strict
.\pipeline\.venv\Scripts\python.exe pipeline\scripts\master_final.py --input <rendered.mp4> --output <final.mp4>
```
