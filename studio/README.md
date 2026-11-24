# Remotion 2D制作スタジオ（studio/）

海外バズ動画の冒頭60秒ベンチマーク再現（非公開検証）と、日本語オリジナル長尺（15〜25分）のコード駆動モーショングラフィックスを生成するための Remotion 環境。

## 設計ルール

1. **モジュラー分離原則:** Remotionで音声・BGMまで1本丸ごと完パケ出力しない。音声先行＋FFprobe尺同期のうえ、チャプター単位の無音クリップまたは透過 `ProRes 4444` (`yuva444p10le`) で書き出し、NLE（DaVinci Resolve等）で統合する。
2. **2D・コード駆動特化:** 主力は案C（ミニマル図解）および案B/E（2D棒人間・比喩経済）、チャレンジ枠は案A（財務チャート・企業年表）。重い3D系（案D）は実装禁止。
3. **フォント規定:** `public/fonts/` には **SIL OFL 1.1 / Apache 2.0** フォント（Noto Sans JP 等）のみ配置する。Adobe Fonts / Morisawa Fonts のサーバー・リポジトリ同梱は契約違反。
4. **外注ライセンス境界:** 本ディレクトリ（Remotionコード）に関与する人数は自社・外注合算で **3名以下**（4名以上で Company License 必須）。
5. **非量産ルール:** 同一テンプレートのテキスト・数値差し替え量産を行わず、回ごとに固有のデータ可視化と視覚変化設計を組むこと。

## ディレクトリ役割

- `src/theme/tokens.ts`: 1080p 90%セーフゾーン・フォントサイズ規格・フォーマット別配色プリセット
- `src/components/`: ベンチマーク再現から昇格した再利用UIコンポーネント（`SafeAreaFrame`, `DualLayerSubtitle` 等）
- `src/compositions/benchmarks/`: 非公開ベンチマーク再現（冒頭60秒＝1800 frames @ 30fps）
- `src/compositions/episodes/`: 本番オリジナル動画のチャプター別クリップ

## 手動セットアップ手順（未実行）

```bash
cd studio
npm install
npm run dev
```
