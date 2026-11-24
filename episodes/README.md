# エピソード制作管理 ＆ 人間関与証跡アーカイブ（episodes/）

本ディレクトリは **海外バズ動画の冒頭60秒ベンチマーク検証（`benchmarks/`）** と **日本語オリジナル本番制作（`productions/`）** をエピソード単位で管理する。

## 二重の役割
1. **制作工程の一元管理:** 企画ブリーフ・表示用/読み上げ用台本・法務/YPP事前監査・公開後PDCAログを1フォルダに集約する。
2. **YPP再審査用の「人間関与証跡（Proof of Human Involvement）」保全:** 万一「非真正コンテンツ」等の誤停止を受けた場合、既存動画を削除せず5分未満の制作プロセス証明動画を提出できるよう、テキスト資料・ライセンス記録・Gitコミット差分を永続保全する（※大容量バイナリ `assets/*.mp4, *.wav` 等は `.gitignore` 除外）。

## 運用フロー

### A. ベンチマーク再現（`benchmarks/<slug>/`）
`_templates/benchmark_template/` をコピーし、`.agents/skills/benchmark-deconstruct/SKILL.md` に沿って進める（非公開・検証専用）。

### B. 本番エピソード制作（`productions/<YYYY-MM-DD>_<slug>/`）
`_templates/episode_template/` をコピーし、Gate 1〜7 を順に完了させる。
- 公開 **24時間以上前** に限定公開アップロード＋広告適合性自己診断申告。
- YPP申請〜承認完了まで、公開済み動画を**一切削除・非公開化しない**。
