# プロジェクト共通エージェントルール（AGENTS.md）

本リポジトリは日本向け完全非属人・長尺（15〜25分）YouTube制作基盤。全出力は厳格に**日本語**で記述する。

## 1. 最上位の確定前提

- **目標:** 2027/02/01のYPP改定（4,000h→8,000h）前に旧基準一発合格（締切 2027-01-31 23:59 UTC）。
- **検証手順:** 海外バズ冒頭60秒Gemini解析 → Remotion非公開再現 → 人間差分修正を `configs/style_guide.md`・`studio/src/components/`・`.agents/skills/` に定着し日本語オリジナルへ展開。
- **フォーマット・チャンネル体制（2ch運用）:** 現行採用フォーマットは2Dコード駆動の2本柱のみ：**ch1『バグる棒人間』**（`stickman-collage` v2.1 / `stickman_collage`：行動科学・心理に限定せず、人体・進化・科学・歴史・生き物・言葉・確率・AI・社会・心理など幅広いジャンルから「人間や世界のバグ・奇妙な仕組み」を棒人間で解体）および **ch2『経済の赤ペン』**（`plan-e` v3.1 / `planE_macro_econ`：マクロ経済・家計ニュースに限定せず、恋愛・医療・スポーツ・アート・エンタメ・冠婚葬祭・家電・歴史・教育・都市など幅広いジャンルを「お金とインセンティブの構造」で赤ペン解剖）。**旧ハーネス（案A・案B・案C路線A・旧案Cシネマ・重い3D系/案D）は廃止・削除済みにつき新規制作禁止**。
- **非ロックイン:** ツール選定は `configs/stack.yaml` で抽象化する。終了済みサービス（にじボイス・Sora/Sora 2・Imagen 4・Veo Gemini API等）は使用禁止。なお、**AI画像生成（動画素材・サムネイル素材ともに）はプロジェクト方針として一切使用しない**（ネット収集素材＋Remotion 2Dコード描画/SVGで完結させる）。
- **モデル実行設定（全ハーネス共通・7系統ハイブリッド）:** 普段のタスク・大規模な長時間連続実装・横断調査・MP4/音声検品は **`Gemini 4 Neon` 単体（`medium` / `high`）** を標準主力とする。**`Orchestrator (Neon)`** は「調査・設計後に定型編集・テストが多い短〜中規模の単一機能」に限定し（長時間連続リファクタはキャッシュ破壊回避のため単体 `Neon high`、独立カット並列量産は `/swarm`）。**`Claude Opus 5.5`** は **`medium`（通常設計・中規模UI・要約リレー）と `high`（ゼロイチ骨格・勝負2D/TSX演出・最終監査）を使い分け**（`fastMode`禁止）。`Sonnet 5.5` の `xhigh`/`max`（力不足時は `Opus medium` 昇格）・`Hydrogen` の `xhigh`・`GPT-6.2 Astra` の PRレビュー・`Sol` の大規模リポジトリ読解・同一モデルの自己採点は禁止。詳細は `.agents/skills/llm-model-routing/SKILL.md` 参照。
- **既定ナレーションTTS（全ハーネス共通）:** 全ハーネス共通の既定TTSは **`ElevenLabs v4`**（`provider: elevenlabs` / `model: eleven_v4` / `voice_id: TX3LPaxmHKxFdv7VOQHJ` / `language_code: ja` / `with-timestamps` 文字単位アライメント連携、`configs/stack.yaml` 準拠）とする。Gemini TTS 等はフォールバック扱いとする。なお **ElevenLabs v4 本番TTS生成の事前承認ゲートは撤廃済み（承認待ちで止めず Step 1〜3 を一気通貫で実行してよい）**。
- **委譲・指示プロンプト原則（全ハーネス共通・What主義）:** サブエージェントや別セッションへ委譲・指示を投げる際は、細かい進め方（How）はもちろん、**共通の制約や完了条件の羅列も不要**とし、**目的と要件（＋必要なら参照先）** だけを簡潔に伝える。具体的な進め方・制約遵守・完了検証は受け手モデルの自律判断とリポジトリ規約に委ねる。
- **途中停止した子スレッドの自動再開（全ハーネス共通）:** すでに許可を得て起動した子スレッドがバックグラウンド処理待ちやターン切れ等で途中停止した場合、**当初の方針・要件・制約を変えずに残工程の続行・再開のみを促す `t3_thread_send`** は、相棒への事前許可を待たずに即実行してよい（新規委譲・方針変更・サムネ最終採用選定は従来どおり人間確認）。
- **尺・字幕の共通原則（全ハーネス共通）:** 尺（15〜25分等）はあくまで目安とし、水増しせず一次情報と演出密度に見合う自然な尺へ着地させる。画面下段の字幕は読み上げ原稿（`03_script_reading.md`）と表記差を除き**一言一句一致**させ（要約・単語削除・言い換え厳禁）、1行18文字以内目安・最大2行を超える長文は削らず句読点・文節で複数セグメントへ時間分割する。

## 2. 絶対ガードレール（違反禁止）

1. **音声ライセンス:** 実在企業・人物・商品の批判解説に既製 `ACML 1.0` モデルを使用しない（正当な批判も禁止）。最優先は自声クローンまたは許諾済み商用音声。
2. **AIペルソナ制限:** 金融・医療/健康・法律・政治で架空AI専門家アバターに助言させない。客観的解説・研究紹介に留める。
3. **非真正回避:** 名詞入替テンプレ量産・怒り煽りを禁止。全動画で一次情報3ソース以上・人間独自の問いと冒頭リライトを必須化。
4. **素材利用・引用・出典集約（AI画像生成不使用＆実務スタンス）:**
   - **AI画像生成は不使用:** 動画素材・サムネイル素材ともに AI画像生成は使わない。ネット上から実写写真・新聞・ニュース見出し切り抜き・図版・公的資料・フリー素材・関連画像を積極収集し、不足分や図解は Remotion 2Dコード描画・SVG等で補う。
   - **著作権を気にしすぎない実務スタンス:** 海外・国内の先駆者チャンネルの運用実態を参考にしたうえで、動画内での解説・批評に伴う引用や関連素材利用の程度であれば実務上問題ないと判断し、過度に萎縮しない。ただし致命的リスク（丸ごと転載、有料コンテンツの全文掲載、単一書籍の丸ごと要約、他動画の長尺そのまま流用、公式なりすまし加工）は避ける。
   - **出典は概要欄のみに集約:** 動画画面内（画面隅クレジットや出典バッジ等）での著作権・出典表記は原則行わず、必要な出典・クレジット表記はすべて YouTube 概要欄のみに集約して記載する。
5. **企業法務・広告規制:** 経営者の人格攻撃・未確定犯罪断定・批判対象企業の競合アフィリ（不競法）を禁止。PR/アフィリは紹介中常時テロップ＋概要欄先頭で明示し、金商法断定表現を排除する。
6. **技術・BGM権利:** クラウドレンダー時は SIL OFL / Apache 2.0 フォントに統一（Adobe/Morisawa同梱禁止）。Remotionコード関与人員は外注合算3名以下。BGMは権利クリア済み商用ライブラリ限定（Suno/Udio回避）。
7. **アカウント・API:** 同一AdSense下でグレー実験chを並走させない（BAN連鎖）。YPP審査中動画の削除/非公開禁止。API非認可データは30日TTL遵守・ローカル動画DL禁止。外部アップロード（YouTube公開等）の無断実行禁止（※既定TTS `ElevenLabs v4` の実行は事前承認不要）。

## 3. 参照ルーティング（通常制作は実務正本のみ・`docs/sources/` 読込禁止）

通常制作は `.agents/skills/`・`harnesses/`・`configs/`・実装コード（＋ch2台本設計図 `09_plan_e_longform_blueprint.md`）で完結させる。`docs/evergreen/01〜06`・`docs/decisions/` は**ハーネス改善・法務境界/戦略見直し時のみ**参照し、`docs/sources/`（原本9本）は通常作業で読み込まない。

| 目的 | 参照先 |
| :--- | :--- |
| フォーマット・文体 | `configs/style_guide.md`（※背景設計見直し時のみ `docs/evergreen/02_format_and_localization.md`） |
| フォーマット別ハーネス総覧 | `harnesses/README.md` / `episodes/_templates/README.md` |
| stickman-collage ハーネス（棒人間×人間・世界のバグ解体） | `harnesses/stickman-collage/README.md` / `.agents/skills/harness-stickman-collage/SKILL.md` / `episodes/_templates/stickman_collage_spec.example.json` |
| 案E制作ハーネス（お金とインセンティブ構造解剖） | `harnesses/plan-e-macro-econ/README.md` / `.agents/skills/harness-plan-e-macro-econ/SKILL.md` / `episodes/_templates/plan_e_spec.example.json` |
| 台本・推敲・検証 | `.agents/skills/script-production/SKILL.md` / `pipeline/scripts/lint_script.py` / `configs/style_guide.md`（ch2長尺構成は `docs/evergreen/09_plan_e_longform_blueprint.md`） |
| サムネイル設計・生成・QA | `.agents/skills/thumbnail-design/SKILL.md` / `episodes/_templates/thumbnails/` / `pipeline/scripts/build_thumbnail.py` |
| Remotion 2D実装・共通規格 | `.agents/skills/remotion-motion-design/SKILL.md`（※工程見直し時のみ `docs/evergreen/03_production_workflow.md`） |
| ABテスト進化（演出 / 台本） | 演出: `.agents/skills/harness-ab-evolution/SKILL.md` / 台本: `.agents/skills/script-ab-evolution/SKILL.md` / リンター: `pipeline/scripts/lint_script.py` |
| 法務・YPP監査 | `.agents/skills/legal-ypp-guardrail/SKILL.md`（※境界判断時のみ `docs/evergreen/01_guardrails_legal_ypp.md`） |
| グロース・収益化・異常値（改善・戦略時のみ） | `docs/evergreen/04_growth_and_analytics.md` / `05_monetization_architecture.md` / `06_outlier_methodology.md` / `configs/outlier_thresholds.yaml` |
| 最新スタック・規約 | `docs/volatile/` / `configs/stack.yaml` / `configs/pricing_watch.yaml` |
| LLMモデル選定・委譲・地雷回避 | `.agents/skills/llm-model-routing/SKILL.md` / `docs/volatile/llm_7families_routing.md` |
| 矛盾・未決事項（設計見直し時のみ） | `docs/decisions/001-open-decisions.md` |
