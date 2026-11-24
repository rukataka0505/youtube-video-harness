"""Docs budget, line length, link integrity, and constant-name guards for stickman-collage & shared docs."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
VALIDATOR_PY = REPO_ROOT / "pipeline" / "src" / "yt_engine" / "stickman_collage_validator.py"
STICKMAN_TYPES_TS = REPO_ROOT / "studio" / "src" / "components" / "stickman_collage" / "types.ts"
BUGURU_EYECATCH_TSX = REPO_ROOT / "studio" / "src" / "components" / "stickman_collage" / "brand" / "BuguruEyecatch.tsx"

DOC_CHAR_BUDGETS: dict[str, int] = {
    "harnesses/stickman-collage/README.md": 4500,
    ".agents/skills/harness-stickman-collage/SKILL.md": 2000,
    "harnesses/README.md": 2600,
    ".agents/skills/remotion-motion-design/SKILL.md": 2200,
    ".agents/skills/legal-ypp-guardrail/SKILL.md": 2000,
    "configs/style_guide.md": 4500,
}

MAX_LINE_LENGTH = 140

FORBIDDEN_OBSOLETE_TOKENS = (
    "07_plan_c_longform_blueprint.md",
    "08_plan_b_longform_blueprint.md",
    "harness-plan-a-cinema",
    "harness-plan-b",
    "harness-plan-c-collage",
    "planC_collage",
    "planB_paint",
    "planA_corporate_cinema",
    "autoSceneSfx",
    "blueprint_econ",
)

LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


class StickmanCollageAndSharedDocsBudgetTests(unittest.TestCase):
    def test_char_budgets_line_lengths_and_no_obsolete_remnants(self) -> None:
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
                # テーブル行・コードブロック行以外は折返し上限を検証
                if line.lstrip().startswith("|") or line.lstrip().startswith("```") or line.lstrip().startswith(">"):
                    continue
                self.assertLessEqual(
                    len(line),
                    MAX_LINE_LENGTH,
                    f"{rel_path}:{idx} exceeds {MAX_LINE_LENGTH} chars ({len(line)})",
                )
            for token in FORBIDDEN_OBSOLETE_TOKENS:
                self.assertNotIn(token, text, f"Obsolete token {token!r} found in {rel_path}")

    def test_referenced_constants_exist_in_sources(self) -> None:
        py_src = VALIDATOR_PY.read_text(encoding="utf-8")
        ts_src = (
            STICKMAN_TYPES_TS.read_text(encoding="utf-8")
            + "\n"
            + BUGURU_EYECATCH_TSX.read_text(encoding="utf-8")
        )
        py_consts = set(re.findall(r"^([A-Z][A-Z0-9_]+)\s*(?::|=)", py_src, re.M))
        ts_consts = set(re.findall(r"export const ([A-Z][A-Z0-9_]+)", ts_src))
        known = py_consts | ts_consts

        for rel_path in (
            "harnesses/stickman-collage/README.md",
            ".agents/skills/harness-stickman-collage/SKILL.md",
        ):
            text = (REPO_ROOT / rel_path).read_text(encoding="utf-8")
            for sym in re.findall(
                r"\b(STICKMAN_[A-Z0-9_]+|STAGE_POLARITIES|BUGURU_[A-Z0-9_]+|MAX_VISUAL_STATIC_GAP_SEC|MAX_CUE_INTERVAL_SEC|MIN_MOBILE_[A-Z0-9_]+)\b",
                text,
            ):
                self.assertIn(sym, known, f"Unknown constant {sym!r} referenced in {rel_path}")

    def test_no_broken_markdown_links_in_active_skills_and_harnesses(self) -> None:
        roots = [
            REPO_ROOT / "AGENTS.md",
            REPO_ROOT / "configs" / "style_guide.md",
            *sorted((REPO_ROOT / "harnesses").rglob("*.md")),
            *sorted((REPO_ROOT / ".agents" / "skills").rglob("*.md")),
        ]
        broken: list[str] = []
        for f in roots:
            if not f.is_file():
                continue
            txt = f.read_text(encoding="utf-8")
            for idx, line in enumerate(txt.splitlines(), start=1):
                for m in LINK_RE.finditer(line):
                    href = m.group(1).strip()
                    if href.startswith(("http://", "https://", "#", "mailto:")):
                        continue
                    href_clean = href.split("#")[0]
                    if not href_clean:
                        continue
                    resolved = (f.parent / href_clean).resolve()
                    if not resolved.exists():
                        broken.append(f"{f.relative_to(REPO_ROOT).as_posix()}:{idx} -> {href}")
        self.assertEqual(broken, [], f"Broken markdown links found:\n" + "\n".join(broken))


if __name__ == "__main__":
    unittest.main()
