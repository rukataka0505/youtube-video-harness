# 案E（`planE_macro_econ` v3.1）制作リレー手順

委譲は目的・要件・参照先を伝える。

## Step 1: 台本・Spec 作成

1. `script-production` 規約で台本を組み、視覚化したい語句単位で `chunks[].splits[].atText` を設計する。
2. `episodes/<project>/plan_e_spec.json` に `chunks`・`videoClips`・`stockImages`（各 `intent`・出典）を記述する。
3. `scenes` や `audio.sfx`・AI画像指定は一切書かない。

## Step 2: 音声・素材ビルド＆コンタクトシート検品

1. `--validate-only --strict` で契約・素材メタを検証する（終了コード 0）。
2. 本番ビルドで `master_audio.wav`（SFXなし2入力）と `chunks`/`charTimes` 付きマニフェストを生成する。
3. `contact_sheet.png` を目視し、`intent` とズレた素材を差し替える。

## Step 3: 演出設計と TSX 実装

1. 既製部品は素材であり完成品ではない。まずその回だけの物理メタファー（何が壊れ・傾き・切り出されるか）を
   1文で決め、必要な素材だけ引き出す。
2. フック・リフック・核心・オチは自由舞台（`type: 'custom'`）で作る。データ提示・繋ぎはプリセットやマクロで速く組む。
3. 時刻は `at()` / `ctx.cue()` / `ctx.beat()`、地の変化は `surfaceShifts`。
   背景は 2D 素地（`LivingSurface`）に偏らず、情景や空気感を乗せたい区間では `mediaBackdrop`（シーン直下・`surfaceShifts` 両対応）で実写動画＋暗幕背景も気軽に使う。複雑な合成・照明が必要なときだけ `backdrop(ctx)` を書く。
   音はヒットへ `<SfxCue kind="..." atSec={ctx.cue(...)} />`（標準 20 種）を直結。合わない音は
   `build_sfx.py custom` で自作し `<SfxCue src="episodes/<slug>/sfx/<name>.wav" />`（既定 SFX・`hit()` 併用可）。
4. 本編はコールドオープン直後に公式アイキャッチ（`swipe` / `pullback` / `slit`）から1種を標準配置する
   （直前チャンクの `eyecatchAfter`、BGM継続。詳細は `visual_system.md`）。
5. フル尺 TSX は **1 委譲＝1 チャプター（10〜15 カット）** で分割並列（全編一括は密度低下で禁止）。

## Step 4: 型検証・機械監査

編集中は[章単位の材料・検品・型検査](../chapter-work.md)を使い、全章の統合後に作品全体を検査する。

1. `studio/` で `npm run audit:plan-e -- <composition-module> --src <作品TSXディレクトリ> --strict` を実行し、
   `errors: []`・`editorial: []`・`source: []` を確認する（`advice` は判断材料）。
2. `npx tsc --noEmit` を通してからレンダリングへ進む（`npm run test:plan-e` はハーネス本体改修時のみ実行）。

## Step 5: レンダ＆最終音圧マスタリング

1. Remotion で MP4 レンダリング（SFX は `<Audio>` で映像と完全同期）。
2. `pipeline/scripts/master_final.py` を `-c:v copy`（2パス loudnorm）で実行し最終 MP4 を確定する。
3. [qa_checklist.md](qa_checklist.md) に基づき人間が最終視聴検品を行う。
