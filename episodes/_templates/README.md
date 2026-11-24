# エピソード＆ベンチマーク テンプレート案内（`episodes/_templates/`）

本ディレクトリには、全フォーマット共通の台本・監査テンプレートと、現行2フォーマット（`stickman_collage` / `planE_macro_econ`）の Spec 雛形を格納する。

> [!NOTE]
> 各フォーマット固有の演出設計・リレー手順・QAチェックは [`harnesses/README.md`](../../harnesses/README.md) 配下の専用ハーネスおよび `.agents/skills/harness-*/SKILL.md` を参照すること。

## 1. 全フォーマット共通テンプレート

| ファイル／フォルダ | 用途 | 参照タイミング |
| :--- | :--- | :--- |
| [`episode_template/`](./episode_template/) | 本番エピソード1本分の最小ディレクトリ雛形（`00_meta.yaml`, `01_research_brief.md`, `02_script_display.md`, `03_script_reading.md`, `04_preflight_audit.md`, `05_post_publish_pdca.md`, `assets/`） | 新規企画着手時（Gate 1〜7） |
| [`benchmark_template/`](./benchmark_template/) | 海外バズ動画の冒頭60秒解析・差分記録・昇格チェック雛形（`01_gemini_analysis.json`, `02_diff_notes.md`, `03_promotion_checklist.md`） | ベンチマーク検証時（`benchmark-deconstruct`） |

## 2. フォーマット別 Spec 雛形対応表（現行2フォーマット）

| フォーマット | Spec 雛形ファイル | 本編受け口 / サムネ v2 自由舞台方式 | 専用ハーネス / 入口スキル |
| :--- | :--- | :--- | :--- |
| **ch1『バグる棒人間』：2D棒人間×背景極性×TSX自由演出** (`stickman_collage` v2.1) | [`stickman_collage_spec.example.json`](./stickman_collage_spec.example.json) / [`thumbnails/stickman_collage_thumbnail_spec.example.json`](./thumbnails/stickman_collage_thumbnail_spec.example.json) | 本編: `StickmanCollageTemplate.tsx` / サムネ: 自由舞台 `<Still>`（`components/thumbnails/` ＋ `ThumbnailRoot.tsx` 登録） | [`harnesses/stickman-collage/README.md`](../../harnesses/stickman-collage/README.md) / `.agents/skills/harness-stickman-collage/SKILL.md` |
| **ch2『経済の赤ペン』：逆説・シニカル経済構造解剖** (`planE_macro_econ` v3.1) | [`plan_e_spec.example.json`](./plan_e_spec.example.json) / [`thumbnails/plan_e_thumbnail_spec.example.json`](./thumbnails/plan_e_thumbnail_spec.example.json) | 本編: `PlanEMacroEconTemplate.tsx` / サムネ: 自由舞台 `<Still>`（`components/thumbnails/` ＋ `ThumbnailRoot.tsx` 登録） | [`harnesses/plan-e-macro-econ/README.md`](../../harnesses/plan-e-macro-econ/README.md) / `.agents/skills/harness-plan-e-macro-econ/SKILL.md` |

## 3. 全フォーマット共通 サムネイル v2 Spec 雛形・CLI
- フォーマット別スキーマ雛形（`schemaVersion: 2`）：[`thumbnails/`](./thumbnails/)
- 詳細手順・部品パレット一覧：[`.agents/skills/thumbnail-design/SKILL.md`](../../.agents/skills/thumbnail-design/SKILL.md)
- 役割分担：**自由舞台 `<Still>` TSX 制作 ＝ Claude Opus 5.5 High** ／ **Spec検証・一括ビルド・クロス目視QA ＝ Gemini 4 Neon**
- 検証＆一括生成：
  ```powershell
  # Gate 1（台本執筆前・完全無料）
  .\pipeline\.venv\Scripts\python.exe pipeline/scripts/build_thumbnail.py --spec episodes/productions/<slug>/thumbnail_spec.json --validate-only

  # Gate 6（自由舞台 <Still> 実装後・4K/文字抜き/168x94/ライト&ダーク比較シート一括出力）
  .\pipeline\.venv\Scripts\python.exe pipeline/scripts/build_thumbnail.py --spec episodes/productions/<slug>/thumbnail_spec.json
  ```
