# フォーマット別制作ハーネス総覧（`harnesses/`）

共通基盤（[`AGENTS.md`](../AGENTS.md)）と2フォーマット固有のワークフロー・演出・Spec契約・QA基準を分離管理する。

## 1. モノレポ内の責務分離と工程別スキル運用

| 層 | 配置パス | 担う責務 |
| :--- | :--- | :--- |
| **共通基盤（正本）** | `AGENTS.md`, `docs/evergreen/`, `configs/style_guide.md`, `configs/stack.yaml`, `pipeline/src/yt_engine/`, `studio/src/theme/tokens.ts` | 全フォーマット横断の絶対ガードレール・TTS既定・モデル選定・字幕一致原則・法務/YPP防衛 |
| **汎用工程スキル（オンデマンド併用）** | `.agents/skills/thumbnail-design/`, `script-production/`, `legal-ypp-guardrail/`, `remotion-motion-design/`, `harness-ab-evolution/`, `script-ab-evolution/`, `benchmark-deconstruct/`, `stack-refresh/` | 担当工程で必要なスキルだけ読み込む |
| **フォーマット別ハーネス** | `harnesses/<format>/` + `.agents/skills/harness-*/SKILL.md` | 固有のビジュアル原則・舞台契約・Spec検証・ブランド資産・QA基準 |

> [!IMPORTANT]
> **工程別オンデマンド併用ルール：**
> 1. 対象フォーマットの `harness-*` スキルを入口にする。
> 2. **Gate 1（台本前ロック）＆ Gate 6（サムネ制作）** → [`thumbnail-design`](../.agents/skills/thumbnail-design/SKILL.md)（`build_thumbnail.py --validate-only`）
> 3. **台本執筆・推敲工程** → [`script-production`](../.agents/skills/script-production/SKILL.md)（固い床×自由舞台 / `lint_script.py`）
> 4. **企画前／公開前／YPP監査工程** → [`legal-ypp-guardrail`](../.agents/skills/legal-ypp-guardrail/SKILL.md)（`04_preflight_audit.md`）
> 5. **Remotion 共通技術規格の参照が必要な時のみ** → [`remotion-motion-design`](../.agents/skills/remotion-motion-design/SKILL.md)

## 2. 現行フォーマット別ハーネス一覧（2本柱）

| フォーマット名 (`formatId`) | テーマ方針（多ジャンル対応） | ハーネス本体 | 入口スキル | Remotion 基盤 | Spec 雛形 | 音声・ビルド基盤 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ch1『バグる棒人間』**<br>(`stickman_collage` v2.1) | 人体・進化・科学・歴史・生き物・言葉・確率・AI・社会・心理など幅広いジャンルから「人間や世界のバグ・奇妙な仕組み」を棒人間で解体 | [`harnesses/stickman-collage/`](./stickman-collage/README.md) | [`harness-stickman-collage`](../.agents/skills/harness-stickman-collage/SKILL.md) | `components/stickman_collage/` ＋ `StickmanCollageTemplate.tsx` | [`stickman_collage_spec.example.json`](../episodes/_templates/stickman_collage_spec.example.json) | `build_stickman_collage_assets.py` |
| **ch2『経済の赤ペン』**<br>(`planE_macro_econ` v3.1) | 経済ニュースに限らず恋愛・医療・スポーツ・エンタメ・冠婚葬祭・家電・歴史・教育など幅広いジャンルを「お金とインセンティブの構造」で赤ペン解剖 | [`harnesses/plan-e-macro-econ/`](./plan-e-macro-econ/README.md) | [`harness-plan-e-macro-econ`](../.agents/skills/harness-plan-e-macro-econ/SKILL.md) | `components/plan_e/` ＋ `PlanEMacroEconTemplate.tsx` | [`plan_e_spec.example.json`](../episodes/_templates/plan_e_spec.example.json) | `build_plan_e_assets.py` ＋ `master_final.py` |

## 3. 全ハーネス共通原則

廃止フォーマット禁止・AI画像不使用・出典の概要欄集約・ACML 1.0禁止・SIL OFL/Apache 2.0限定・
ElevenLabs v4既定・7系統モデル選定（自己採点禁止）・What主義委譲・子スレッド自動再開・
尺目安・字幕一致の正本は [`AGENTS.md`](../AGENTS.md)。
