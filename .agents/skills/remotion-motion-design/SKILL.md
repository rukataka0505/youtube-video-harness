---
name: remotion-motion-design
description: >-
  studio/ で Remotion 2Dコード駆動モーショングラフィックスを実装・改修する際の共通技術規格スキル。
  音声先行アライメント同期、1080p内側90%セーフゾーン、抜け感字幕、SIL OFL/Apache 2.0フォント限定、
  Remotion直接MP4出力とクロスモデル目視検品ゲートを適用する。
---

# Remotion 2Dモーション共通技術規格スキル

フォーマット固有の舞台設計・背景極性・コンポーネント・監査 CLI は各ハーネス正本
（[harness-stickman-collage](../harness-stickman-collage/SKILL.md) /
[harness-plan-e-macro-econ](../harness-plan-e-macro-econ/SKILL.md) /
[harnesses/README.md](../../../harnesses/README.md)）へ委譲し、本スキルは共通技術規格のみを担う。
法務・AI画像不使用・出典概要欄集約・What主義委譲は [`AGENTS.md`](../../../AGENTS.md) 正本に従う。

## 1. 共通技術制約（2フォーマット横断）

1. **画面・フレーム・セーフゾーン:** `1920×1080` / `30fps`。重要要素は内側 `90%` セーフゾーン
   （左右各 `96px`・上下各 `54px`：`studio/src/theme/tokens.ts` の `VIDEO_SPEC`）内に収める。
2. **フォントライセンス:** `studio/public/fonts/` には **SIL OFL 1.1 / Apache 2.0**
   （`Noto Sans JP`, `Noto Serif JP`, `Zen Maru Gothic`, `Yomogi`, `Playfair Display` 等）のみ配置。
   Adobe / Morisawa 同梱禁止。Remotion コード関与人員は外注合算 3 名以下。
3. **脱 AI Slop ＆ 非テンプレ量産:** 直線 `<line>`/`<circle>` 幾何学棒人間、Tailwind slate 系ダークカード
   （`#0F172A` / `#1E293B` 等）、ピル型（`borderRadius: 999`）、`borderLeft` 帯、常時ダーク帯ボックス字幕を禁止。
   同じ構成の文字・数字差し替え量産をせず、毎話固有の図解・自由舞台を設計する。
4. **抜け感字幕（一言一句一致）:** 下段字幕は `CleanSubtitle` / `CollageSubtitle` を用い、
   読み上げ原稿と一言一句一致（1行 14〜18字目安・最大2行・コントラスト `4.5:1` 以上）を厳守する。

## 2. 標準書き出し・検品フロー

1. **音声先行タイムライン確定:** 既定 TTS（`ElevenLabs v4` / `with-timestamps`）で文字単位アライメントと
   実尺を取得し、各ハーネスのビルド CLI でタイムラインを生成する。
2. **Remotion 直接 MP4 出力（現行標準）:** 現行2ハーネスは `<Audio>` と字幕を含めて Remotion から直接 MP4 を書き出す
   （案Eは直後に `pipeline/scripts/master_final.py` で `-c:v copy` 2パス `-14.0 LUFS / -1.4 dBTP` 仕上げ。
   DaVinci Resolve 連携用のチャプター分割／透過 `ProRes 4444` 出力は長尺手動微調整が必要な特例時のみ任意選択）。
3. **完了ゲート:**
   - 全章の統合後、`studio/` で `npx tsc --noEmit` がエラー 0、かつ対象ハーネスの作品監査が通過すること。
   - **本編全編レンダー前に代表フレーム PNG（フック・転換・核心・オチ等）を事前確認**し、
     書き出し後は実装担当と別モデルによるクロス目視検品（自己採点禁止）を通すこと。
