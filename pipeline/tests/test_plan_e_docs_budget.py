"""Decision F guards: char budgets, line lengths, constant-name references, and human-only QA."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
AUDIT_RULES_TS = REPO_ROOT / "studio" / "src" / "components" / "plan_e" / "auditRules.ts"
CONSTANTS_TS = REPO_ROOT / "studio" / "src" / "components" / "plan_e" / "constants.ts"

# v3.1 で自由舞台（custom）の契約を追記したため予算を拡張。数値の直書き禁止・定数名参照の規律は据え置き。
DOC_CHAR_BUDGETS: dict[str, int] = {
    "harnesses/plan-e-macro-econ/README.md": 2000,
    "harnesses/plan-e-macro-econ/visual_system.md": 3000,
    "harnesses/plan-e-macro-econ/spec_contract.md": 2400,
    "harnesses/plan-e-macro-econ/relay_playbook.md": 1700,
    "harnesses/plan-e-macro-econ/qa_checklist.md": 1300,
    ".agents/skills/harness-plan-e-macro-econ/SKILL.md": 1700,
    "docs/evergreen/09_plan_e_longform_blueprint.md": 2400,
}

MAX_LINE_LENGTH = 120

FORBIDDEN_DOC_TOKENS = (
    "176px",
    "168px",
    "204px",
    "1920x1080",
    "15.0秒",
    "22.0秒",
    "6.0秒",
    "65%",
    "35%",
    "blueprint_econ",
    "sideInsightPoints",
    "autoSceneSfx",
    "sfxCues",
)

FORBIDDEN_QA_TOKENS = (
    "--validate-only",
    "--dry-run",
    "--strict",
    "audit:plan-e",
    "npx tsc",
    "unittest",
    "pytest",
)


def _extract_ts_exports_and_rule_keys() -> tuple[set[str], set[str]]:
    rules_src = AUDIT_RULES_TS.read_text(encoding="utf-8")
    consts_src = CONSTANTS_TS.read_text(encoding="utf-8")
    exports = set(re.findall(r"export const (\w+)", rules_src + "\n" + consts_src))
    m = re.search(r"export const PLAN_E_AUDIT_RULES\s*=\s*\{(.*?)\}\s*as const", rules_src, re.S)
    assert m is not None, "PLAN_E_AUDIT_RULES not found in auditRules.ts"
    rule_keys = set(re.findall(r"([A-Z0-9_]+)\s*:", m.group(1)))
    return exports, rule_keys


class PlanEDocsBudgetTests(unittest.TestCase):
    def test_char_budgets_line_lengths_and_forbidden_duplicates(self) -> None:
        for rel_path, budget in DOC_CHAR_BUDGETS.items():
            path = REPO_ROOT / rel_path
            self.assertTrue(path.is_file(), f"Missing doc: {rel_path}")
            text = path.read_text(encoding="utf-8")
            self.assertLessEqual(
                len(text),
                budget,
                f"{rel_path} exceeds char budget: {len(text)} > {budget}",
            )
            for idx, line in enumerate(text.splitlines(), start=1):
                self.assertLessEqual(
                    len(line),
                    MAX_LINE_LENGTH,
                    f"{rel_path}:{idx} exceeds {MAX_LINE_LENGTH} chars ({len(line)})",
                )
            for token in FORBIDDEN_DOC_TOKENS:
                self.assertNotIn(token, text, f"Forbidden token {token!r} found in {rel_path}")

    def test_referenced_constants_exist_in_ts_sources(self) -> None:
        exports, rule_keys = _extract_ts_exports_and_rule_keys()
        for rel_path in DOC_CHAR_BUDGETS:
            text = (REPO_ROOT / rel_path).read_text(encoding="utf-8")
            for sym in re.findall(r"\b(PLAN_E_[A-Z0-9_]+|SUBTITLE_SAFE_[A-Z0-9_]+|PROJECTOR_SAFE_[A-Z0-9_]+|SURFACE_POLARITY|PROP_DEFAULT_SFX)\b", text):
                self.assertIn(sym, exports, f"Unknown constant {sym!r} referenced in {rel_path}")
            for key in re.findall(r"PLAN_E_AUDIT_RULES\.([A-Z0-9_]+)", text):
                self.assertIn(key, rule_keys, f"Unknown rule key PLAN_E_AUDIT_RULES.{key} in {rel_path}")

    def test_qa_checklist_contains_human_checks_only(self) -> None:
        qa_text = (REPO_ROOT / "harnesses/plan-e-macro-econ/qa_checklist.md").read_text(encoding="utf-8")
        for token in FORBIDDEN_QA_TOKENS:
            self.assertNotIn(token, qa_text, f"Automated check reference {token!r} found in qa_checklist.md")


if __name__ == "__main__":
    unittest.main()
