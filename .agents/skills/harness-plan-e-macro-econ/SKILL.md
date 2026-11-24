---
name: harness-plan-e-macro-econ
description: 案E（planE_macro_econ v3.1「固い床×自由な舞台」）制作ハーネス起動・仕様検証・自由舞台実装・TS監査・音圧仕上げを実行する。
---

# 案E（`planE_macro_econ` v3.1）起動スキル

## 1. 工程別の参照先

- 章担当は[材料抽出・スチル・型検査](../../../harnesses/chapter-work.md)と `visual_system.md`。
- 契約と工程は `harnesses/plan-e-macro-econ/` の README・spec_contract。
- 定数・部品・ブランドは `studio/src/components/plan_e/`。

## 2. 必須実行フロー

1. **JSON 契約検証**: `build_plan_e_assets.py --spec <spec.json> --validate-only --strict`（終了 0）
2. **音声・素材生成**: 同スクリプトで `ElevenLabs v4` 音声・`master_audio.wav`・`chunks`/`charTimes`・3コマ一覧を生成
3. **演出実装**: `definePlanESpec` で組み、Hero（フック・リフック・核心・オチ）は自由舞台 `type: 'custom'`
   （`render`/`mediaBackdrop`/`backdrop`/`ctx.cue()`/`hit()`/`surfaceShifts`/`camera`）で作品固有の画を作る。
   フル尺は **1 委譲＝1 チャプター（10〜15 カット）** で分割並列。
   音はヒットへ `<SfxCue kind="..." atSec={ctx.cue(...)} />`（標準20種）を直結、固有音は `build_sfx.py custom`。
   公式アイキャッチは直前の発話チャンクの `eyecatchAfter` に `swipe` / `pullback` / `slit` を指定する（BGM継続、`visual_system.md` 参照）
4. **統合後の監査＆型チェック**: `studio/` で `npm run audit:plan-e -- <module> --src <作品TSXディレクトリ> --strict` と `npx tsc --noEmit`
5. **仕上げ・クロスQA**: Remotion レンダ後 `master_final.py` を適用し、別モデル＋人間で `qa_checklist.md` 検品

## 3. 絶対禁止事項（床）

- JSON に `scenes` / `imageConfig` / `audio.sfx`（効果音の音声焼込み）を書くこと
- TSX に**絶対秒**（`startSec: 12` / `atSec={41.2}` / `atStart(12.3)` 等）を直書き（相対秒は自由）
- 素材マニフェスト迂回（`staticFile()` 直書き・外部 URL）、AI 画像生成、画面内出典、`legacy/` 新規利用
- 自由舞台の `render()` / `backdrop()` 本体で hooks を呼ぶ（子コンポーネントへ分離）
- しきい値・座標定数を `.md` に直書き複製（正本はコード定数名で参照）
