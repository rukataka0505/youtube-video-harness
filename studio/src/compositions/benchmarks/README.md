# 非公開ベンチマーク再現コンポジション（benchmarks/）

海外バズ動画の冒頭60秒（`1800 frames @ 30fps`）を `episodes/benchmarks/<slug>/01_gemini_analysis.json` に基づいて再現検証するためのディレクトリ。

- 再現実装は外部公開せず、人間の目で違和感・テンポ・視認性を確認する実験場として使う。
- ここで得た修正知見は `episodes/benchmarks/<slug>/02_diff_notes.md` 経由で `configs/style_guide.md` と `studio/src/components/` に昇格させる。
