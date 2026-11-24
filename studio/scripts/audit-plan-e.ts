import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { auditPlanEProjectSpec } from '../src/components/plan_e/audit';
import { auditPlanESource, type PlanESourceIssue } from '../src/components/plan_e/sourceAudit';
import { auditLegacyV2Spec } from '../src/components/plan_e/timeline';
import type { PlanEProjectSpec } from '../src/components/plan_e/types';

const TARGETS = 'golden-allocation | golden-selection | golden-stage | luxury-trap-v2 | <module path>';

function parseArgs(argv: string[]) {
  let target = '';
  let strict = false;
  let release = false;
  const src: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--strict') strict = true;
    else if (arg === '--release') release = true;
    else if (arg === '--src') src.push(argv[++i] ?? '');
    else if (!target) target = arg;
  }
  return { target, strict, release, src: src.filter(Boolean) };
}

async function resolveReport(target: string, release: boolean) {
  switch (target) {
    case 'golden-allocation':
    case 'golden-selection':
    case 'golden-stage': {
      const golden = await import('../src/compositions/golden/plan_e');
      const specs = {
        'golden-allocation': golden.LUXURY_TRAP_ALLOCATION_SPEC,
        'golden-selection': golden.LUXURY_TRAP_SELECTION_SPEC,
        'golden-stage': golden.LUXURY_TRAP_FREE_STAGE_SPEC,
      };
      return auditPlanEProjectSpec(specs[target], { release });
    }
    case 'luxury-trap-v2': {
      const { BASE_TIMELINE } = await import('../src/compositions/ab_tests/plan_e_luxury_trap/baseTimelineData');
      const { AB_LUXURY_TRAP_V2_SPEC } = await import('../src/compositions/ab_tests/plan_e_luxury_trap/v2_opus_high');
      return auditLegacyV2Spec(AB_LUXURY_TRAP_V2_SPEC, BASE_TIMELINE);
    }
    default: {
      const abs = path.resolve(process.cwd(), target);
      if (!existsSync(abs)) {
        throw new Error(`Unknown audit target "${target}". Use ${TARGETS}.`);
      }
      const mod = await import(pathToFileURL(abs).href);
      const spec: PlanEProjectSpec | undefined =
        mod.default ?? mod.SPEC ?? mod.PLAN_E_SPEC ?? Object.values(mod).find((v: any) => v && Array.isArray(v.scenes));
      if (!spec) {
        throw new Error(`Module "${abs}" does not export a PlanEProjectSpec.`);
      }
      return auditPlanEProjectSpec(spec, { release });
    }
  }
}

function collectSourceFiles(p: string): string[] {
  const abs = path.resolve(process.cwd(), p);
  if (!existsSync(abs)) throw new Error(`--src path not found: ${p}`);
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs, { recursive: true })
    .map((f) => path.join(abs, String(f)))
    // 本編と同居するサムネは thumbnail-design の対象。明示したファイルは個別監査できる。
    .filter((f) => path.relative(abs, f).split(path.sep)[0] !== 'thumbnails')
    .filter((f) => /\.(tsx?|jsx?)$/.test(f) && !/__tests__/.test(f) && statSync(f).isFile());
}

function auditSources(paths: string[]): PlanESourceIssue[] {
  const issues: PlanESourceIssue[] = [];
  for (const p of paths) {
    for (const f of collectSourceFiles(p)) {
      issues.push(...auditPlanESource(readFileSync(f, 'utf-8'), path.relative(process.cwd(), f)));
    }
  }
  return issues;
}

async function main() {
  const { target, strict, release, src } = parseArgs(process.argv.slice(2));
  if (!target && src.length === 0) {
    console.error(`Usage: npm run audit:plan-e -- <${TARGETS}> [--src <dir|file>]... [--strict] [--release]`);
    process.exit(2);
  }
  try {
    const report = target ? await resolveReport(target, release) : undefined;
    const sourceIssues = src.length > 0 ? auditSources(src) : [];
    console.log(JSON.stringify({ ...(report ?? {}), ...(src.length > 0 ? { source: sourceIssues } : {}) }, null, 2));
    const errorCount = (report?.errors.length ?? 0) + sourceIssues.filter((i) => i.severity === 'error').length;
    const editorialCount =
      (report?.editorial.length ?? 0) + sourceIssues.filter((i) => i.severity === 'editorial').length;
    if (errorCount > 0) process.exit(2);
    if ((strict || release) && editorialCount > 0) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

main();
