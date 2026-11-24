---
name: harness-stickman-collage
description: >-
  ch1『バグる棒人間』2D棒人間ハーネス stickman-collage v2.1（formatId: stickman_collage）の起動スキル。
  「固い基盤×自由なTSXシーン演出」、Neon(裏方＋クロス目視QA)×Opus 5.5(映像TSX)体制を適用する。
---

# `stickman-collage` v2.1 起動スキル（`formatId: stickman_collage`）

## 1. 工程別の参照先

- 章担当は[材料抽出・スチル・型検査](../../../harnesses/chapter-work.md)と[演出契約](../../../harnesses/stickman-collage/README.md)。
- 型・ブランドは `studio/src/components/stickman_collage/index.ts`、舞台は `StickmanCollageTemplate.tsx`。
- Spec 設計は `episodes/_templates/stickman_collage_spec.example.json`。
- 台本・サムネ・公開前監査は各担当が `AGENTS.md` の工程別索引を使う。

## 2. 必須フロー（クロスモデル分業）

1. **裏方一式（Neon）**: 台本・Spec（背景は動く壁紙 8 種 `polarity` と暗幕実写動画・画像 `mediaBackdrop` を対等に選択、
   章転換は `chapters[].eyecatch` に `strips`/`zoom`/`glitch` 宣言）・素材収集（動画は `scene_video`/`broll_video`）後、
   `build_stickman_collage_assets.py --spec <spec.json> --tsx-out <timeline.ts>` へ直行
   （冒頭・章間無音スロット・実尺検証まで完結。`spec.sfx` は空で可）。
   結論・反転・オチ前の長い間は shot の `pauseAfterSec`（秒）で発話後に無音を挿入する（台本にト書き不要）。
2. **映像 TSX 演出（Opus 5.5 High 専任）**: Hero を `scene: { mode: "tsx", component }`＋`customScenes` で
   `STICKMAN_CONTENT_BOTTOM` 上に自由造形（`cue()`・`resolveAsset()`）。
   音はヒットへ `<SfxCue kind="..." atSec={cue(...)} />`（標準 20 種）を直結、固有音は `build_sfx.py custom`
   フル尺は **1 委譲＝1 チャプター（10〜15 カット）** で分割並列。
3. **統合後の監査・型チェック・仕上げ＆目視QA（Neon High）**:
   `build_stickman_collage_assets.py --spec <spec.json> --tsx-dir <CompDir> --timeline <timeline.json> --validate-only`
   と `npx tsc --noEmit`、MP4 に `master_final.py`（-14.0 LUFS）適用後に目視 QA。

## 3. 絶対禁止事項（床）

- `clip_cards`・`badge`/`subText`・`borderLeft`・`borderRadius: 999`・slate 系・SaaS ダーク色
- ボイル内 `<text>`/`<HandText>`/`<SvgStamp>`（`crisp`/`Stage.Crisp` へ分離）
- 章間アイキャッチの TSX 手動配置（`- BUGURU_EYECATCH_CUT_SEC`）および Spec 二重配置
- 合成ピアノ自動挿入（`silent_sfx_only` / `licensed_bgm_file` のみ）、Remotion ID の `_`
- 固有実在物（実在人物・特定場所・根拠資料）の実写未紐づけ
- 共通原則（AI画像禁止・概要欄出典・SIL OFL・字幕一致18字）は `AGENTS.md` 正本に従う
