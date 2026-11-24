# ベンチマーク知見の汎用資産への昇格チェックリスト（03_promotion_checklist）

`02_diff_notes.md` の差分修正を個人の頭の中に留めず、必ずリポジトリ資産へ定着させてから次工程へ進む。

- [x] **文体・数値ルール定着:** 判明したテンポ・文字数・配色・間（ポーズ）・AI slop 3大NG・音響緩急・完全日本語ローカライズ規約を `configs/style_guide.md` 第4章へ追記した。
- [x] **再利用コンポーネント化:** 複数本で使える図解パーツ・棒人間・紙面カード・ビート積上げ・抜け感字幕・OFLフォント一式を `studio/src/components/plan_c/` および `studio/public/fonts/plan_c/` へ抽出した（丸ごと量産テンプレではなくモジュラー部品キットとして設計）。また音声・SFX・ピアノ同期・`-14.0 LUFS` ミキサーを `pipeline/src/yt_engine/audio/` へ昇格した。
- [x] **トークン更新:** 路線A確定パレット `planC_collage` を `studio/src/theme/tokens.ts` に反映し、`studio/src/Root.tsx` に `V2ACollage60s` を参照登録した。
- [x] **手順Skill反映:** 今後の指示プロンプトやチェック漏れを防ぐ修正（Pass 1 `gemini-4-neon` 標準化、過剰萎縮回避、`plan_c` / `yt_engine.audio` 再利用手順、代表フレームPNG目視検品必須ゲート、翻訳調完全排除）を `.agents/skills/`（`script-production` / `remotion-motion-design` / `benchmark-deconstruct`）へ反映した。
- [x] **非公開維持確認:** 本ベンチマーク再現コンポジション（`EasyActuallyBecomingSmart60s`, `V2ACollage60s`, `v2b_editorial`）は `studio/src/compositions/benchmarks/` 配下に隔離されており、外部公開・本番アップロード対象に混入していない。
