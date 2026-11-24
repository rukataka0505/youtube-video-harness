import brandCues from './brand/akapenCues.json';
import React from 'react';
import { SfxCue, type SfxCueProps } from '../SfxCue';
import { resolveSfxKind } from '../sfx';
import {
  PLAN_E_AUDIT_RULES,
  PROP_DEFAULT_SFX,
  SURFACE_POLARITY,
} from './auditRules';
import { PlanEAnchorError, PlanEMediaError } from './errors';
import { resolvePlanESfxSource } from './sfx';
import {
  createStageContext,
  normalizeMediaBackdrop,
  surfaceSegments,
  type PlanEStageRecorder,
} from './stageContext';
import type {
  PlanEAuditRuleCode,
  PlanEAuditWaiver,
  PlanEMediaBackdrop,
  PlanEProjectSpec,
  PlanESceneSpec,
} from './types';

export interface PlanEAuditIssue {
  severity: 'error' | 'editorial' | 'advice';
  code: string;
  rule?: PlanEAuditRuleCode;
  message: string;
  sceneId?: string;
  startSec?: number;
  endSec?: number;
  durationSec?: number;
  waiverReason?: string;
}

export interface PlanEAuditMetrics {
  totalDurationSec: number;
  sceneCount: number;
  maxBrightStreakSec: number;
  maxBrightStreakRange: readonly [number, number] | null;
  maxNonDarkStreakSec: number;
  maxNonDarkStreakRange: readonly [number, number] | null;
  maxDarkStreakSec: number;
  maxDarkStreakRange: readonly [number, number] | null;
  brightRatio: number;
  darkRatio: number;
  maxBeatGapSec: number;
  maxBeatGapRange: readonly [number, number] | null;
  propCount: number;
  coveredPropCount: number;
  sfxCoverageRatio: number;
  /** 自由舞台（custom）シーンの合計秒と比率 */
  stageSec: number;
  stageRatio: number;
  /** probe で観測した自由舞台の cue 呼び出し数（視覚イベントとして beat_gap に算入） */
  stageCueCount: number;
}

export interface PlanEAuditReport {
  id: string;
  passed: boolean;
  strictPassed: boolean;
  errors: PlanEAuditIssue[];
  editorial: PlanEAuditIssue[];
  waived: PlanEAuditIssue[];
  /** 合否に影響しない助言（表現の天井を上げるための提案） */
  advice: PlanEAuditIssue[];
  metrics: PlanEAuditMetrics;
}

interface StageProbeResult {
  cueTimes: number[];
  mediaKeys: string[];
  sfxCueCount: number;
  sfxCueTimes: number[];
}

function collectSfxCuesFromNode(
  node: unknown,
  out: { count: number; times: number[]; unknownKinds: string[] },
  depth = 0,
): void {
  if (depth > 32 || node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectSfxCuesFromNode(child, out, depth + 1);
    return;
  }
  if (!React.isValidElement(node)) return;
  const props = node.props as Record<string, unknown> | undefined;
  if (node.type === SfxCue && props) {
    const p = props as Partial<SfxCueProps>;
    const disabled = Boolean(p.disabled) || (typeof p.volume === 'number' && p.volume <= 0);
    if (!disabled) {
      if (p.kind !== undefined) {
        const kindStr = String(p.kind);
        if (!resolveSfxKind(kindStr)) {
          out.unknownKinds.push(kindStr);
        } else {
          out.count += 1;
        }
      } else if (typeof p.src === 'string' && p.src.trim().length > 0) {
        out.count += 1;
      }
      if (typeof p.atSec === 'number' && Number.isFinite(p.atSec)) {
        out.times.push(p.atSec);
      }
    }
    return;
  }
  if (props && 'children' in props) {
    collectSfxCuesFromNode(props.children, out, depth + 1);
  }
}

function classifyProbeError(err: unknown): { code: string; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof PlanEAnchorError) return { code: 'stage_cue_unresolved', message: msg };
  if (err instanceof PlanEMediaError) return { code: 'stage_unknown_media', message: msg };
  if (/hook|reading 'use|dispatcher/i.test(msg)) {
    return {
      code: 'stage_hook_in_render',
      message: `${msg} — render()/backdrop() 本体で hooks を呼ばず、子コンポーネントへ切り出すこと。`,
    };
  }
  return { code: 'stage_render_throws', message: msg };
}

/**
 * 自由舞台の render() / backdrop() をシーン区間の等分点・ビート点・地切替点で事前実行する。
 * 返り値の React 要素から `<SfxCue>` と cue / media / 例外を観測する（DOM マウントなし）。
 */
function probeStageScene(
  spec: PlanEProjectSpec,
  sc: Extract<PlanESceneSpec, { type: 'custom' }>,
  errors: PlanEAuditIssue[],
): StageProbeResult {
  const fps = spec.fps ?? 30;
  const recorder: PlanEStageRecorder = { cueTimes: [], mediaKeys: [] };
  const n = Math.max(2, PLAN_E_AUDIT_RULES.STAGE_PROBE_SAMPLES);
  const dur = Math.max(0.001, sc.endSec - sc.startSec);
  const samples = new Set<number>();
  for (let i = 0; i < n; i++) samples.add(sc.startSec + (dur * i) / (n - 1));
  for (const b of sc.beats ?? []) samples.add(b.timeSec);
  for (const sh of sc.surfaceShifts ?? []) samples.add(sh.atSec);
  const lastFrame = Math.max(0, Math.ceil(sc.endSec * fps) - 1);
  const firstFrame = Math.max(0, Math.ceil(sc.startSec * fps - 1e-6));
  const frames = new Set<number>();
  for (const s of samples) {
    frames.add(Math.min(lastFrame, Math.max(firstFrame, Math.round(s * fps))));
  }
  const seen = new Set<string>();
  const mediaBackdropEntries: { label: string; atSec: number; spec: PlanEMediaBackdrop }[] = [];
  if (sc.mediaBackdrop !== undefined) {
    mediaBackdropEntries.push({
      label: 'mediaBackdrop',
      atSec: sc.startSec,
      spec: sc.mediaBackdrop,
    });
  }
  for (let k = 0; k < (sc.surfaceShifts ?? []).length; k++) {
    const sh = sc.surfaceShifts![k];
    if (sh.mediaBackdrop !== undefined) {
      mediaBackdropEntries.push({
        label: `surfaceShifts[${k}].mediaBackdrop`,
        atSec: sh.atSec,
        spec: sh.mediaBackdrop,
      });
    }
  }
  if (mediaBackdropEntries.length > 0) {
    const probeCtx = createStageContext(spec, sc, firstFrame, fps, recorder);
    for (const entry of mediaBackdropEntries) {
      const key = normalizeMediaBackdrop(entry.spec).key;
      try {
        probeCtx.media(key);
      } catch (err) {
        const { code, message } = classifyProbeError(err);
        const dedupKey = `${entry.label}|${code}|${message}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        errors.push({
          severity: 'error',
          code,
          sceneId: sc.id,
          startSec: +entry.atSec.toFixed(2),
          message: `Scene "${sc.id}" ${entry.label}: ${message}`,
        });
      }
    }
  }
  let maxSfxCueCount = 0;
  const sfxCueTimes: number[] = [];
  for (const frame of [...frames].sort((a, b) => a - b)) {
    const ctx = createStageContext(spec, sc, frame, fps, recorder);
    for (const [label, fn] of [
      ['render', sc.render],
      ['backdrop', sc.backdrop],
    ] as const) {
      if (!fn) continue;
      try {
        const rendered = fn(ctx);
        const sfxScan = { count: 0, times: [] as number[], unknownKinds: [] as string[] };
        collectSfxCuesFromNode(rendered, sfxScan);
        if (sfxScan.count > maxSfxCueCount) maxSfxCueCount = sfxScan.count;
        for (const t of sfxScan.times) sfxCueTimes.push(t);
        for (const badKind of sfxScan.unknownKinds) {
          const key = `sfx_cue|unknown|${badKind}`;
          if (seen.has(key)) continue;
          seen.add(key);
          errors.push({
            severity: 'error',
            code: 'unknown_sfx_kind',
            sceneId: sc.id,
            startSec: +(frame / fps).toFixed(2),
            message: `Scene "${sc.id}" <SfxCue> uses unknown SFX kind "${badKind}".`,
          });
        }
      } catch (err) {
        const { code, message } = classifyProbeError(err);
        const key = `${label}|${code}|${message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        errors.push({
          severity: 'error',
          code,
          sceneId: sc.id,
          startSec: +(frame / fps).toFixed(2),
          message: `Scene "${sc.id}" ${label}() at ${(frame / fps).toFixed(2)}s: ${message}`,
        });
      }
    }
  }
  return {
    cueTimes: [...new Set(recorder.cueTimes.map((t) => +t.toFixed(3)))].sort((a, b) => a - b),
    mediaKeys: [...new Set(recorder.mediaKeys)],
    sfxCueCount: maxSfxCueCount,
    sfxCueTimes: [...new Set(sfxCueTimes.map((t) => +t.toFixed(3)))].sort((a, b) => a - b),
  };
}


function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.min(aEnd, bEnd) > Math.max(aStart, bStart) - 1e-6;
}

function findMatchingWaiver(
  issue: PlanEAuditIssue,
  waivers: readonly PlanEAuditWaiver[],
): PlanEAuditWaiver | undefined {
  if (!issue.rule) return undefined;
  const s = issue.startSec ?? 0;
  const e = issue.endSec ?? s;
  return waivers.find(
    (w) =>
      w.rule === issue.rule &&
      w.reason.trim().length >= PLAN_E_AUDIT_RULES.MIN_WAIVER_REASON_CHARS &&
      w.range[1] > w.range[0] &&
      overlaps(s, e, w.range[0], w.range[1]),
  );
}

function collectHeadlineStrings(scene: PlanESceneSpec): string[] {
  const texts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim().length > 0) texts.push(v.trim());
  };
  if (scene.type === 'news_broadcast') {
    push(scene.headline);
  } else if (scene.type === 'whiteboard_trend') {
    push(scene.title);
  } else if (scene.type === 'causal_gear_loop') {
    push(scene.title);
  } else if (scene.type === 'diegetic_stage') {
    push(scene.title);
    push(scene.mastheadTitle);
  } else if (scene.type === 'editorial_cutout') {
    push(scene.mastheadTitle);
    for (const card of scene.cards) push(card.headline);
  } else if (scene.type === 'video_broll' && scene.overlayCutout) {
    push(scene.overlayCutout.headline);
  }
  return texts;
}

function isPoeticPreachyHeadline(text: string): boolean {
  if (/は、(?:正解|不正解)。/.test(text)) return true;
  if (text.includes('。') && text.length >= PLAN_E_AUDIT_RULES.POETIC_HEADLINE_MIN_CHARS) {
    return true;
  }
  return false;
}

export function auditPlanEProjectSpec(
  spec: PlanEProjectSpec,
  options?: { release?: boolean },
): PlanEAuditReport {
  const errors: PlanEAuditIssue[] = [];
  const rawEditorial: PlanEAuditIssue[] = [];
  const waivers = spec.waivers ?? [];

  for (let i = 0; i < waivers.length; i++) {
    const w = waivers[i];
    if (!w.reason || w.reason.trim().length < PLAN_E_AUDIT_RULES.MIN_WAIVER_REASON_CHARS) {
      errors.push({
        severity: 'error',
        code: 'invalid_waiver',
        message: `waivers[${i}] for rule "${w.rule}" requires reason >= ${PLAN_E_AUDIT_RULES.MIN_WAIVER_REASON_CHARS} chars.`,
      });
    }
    if (!Array.isArray(w.range) || w.range.length !== 2 || w.range[1] <= w.range[0]) {
      errors.push({
        severity: 'error',
        code: 'invalid_waiver',
        message: `waivers[${i}] for rule "${w.rule}" has invalid time range.`,
      });
    }
  }

  const origin = spec.timeline?.originSec ?? 0;
  for (const ec of spec.eyecatches ?? []) {
    const overlaps = (start: number, end: number) => start < ec.resumeSec - 0.0001 && end > ec.startSec + 0.0001;
    const issue = (code: string, message: string) => errors.push({
      severity: 'error', code, message, startSec: ec.startSec, endSec: ec.resumeSec,
    });
    if (Math.abs(ec.endSec - ec.startSec - brandCues.variants[ec.variant].durationSec) > 0.001 ||
        ec.resumeSec - ec.endSec < brandCues.postPauseSec - 0.001) {
      issue('eyecatch_duration', 'アイキャッチの尺または終了後の間が不足しています。');
    }
    if (!spec.timeline || spec.timeline.chunks.some(c => overlaps(c.startSec - origin, c.speechEndSec - origin))) {
      issue('eyecatch_speech', '専用区間内に発話があるか、音声タイムラインがありません。');
    }
    if (spec.subtitles.some(c => overlaps(c.startSec, c.endSec))) {
      issue('eyecatch_subtitle', 'アイキャッチまたは後間に字幕が重なっています。');
    }
  }

  const scenes = spec.scenes ?? [];
  if (scenes.length === 0) {
    errors.push({
      severity: 'error',
      code: 'empty_scenes',
      message: 'spec.scenes must contain at least one scene.',
    });
  }

  if (options?.release && spec.assets) {
    for (const [key, meta] of Object.entries(spec.assets)) {
      if (!meta.verified) {
        errors.push({
          severity: 'error',
          code: 'unverified_asset',
          message: `Asset "${key}" (${meta.filename}) is not verified with current sha256.`,
        });
      }
    }
  }

  let totalDurationSec = spec.totalDurationSec;
  if (scenes.length > 0 && totalDurationSec <= 0) {
    totalDurationSec = scenes[scenes.length - 1].endSec;
  }

  // タイムライン連続性・surface・ビート検証
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    if (!sc.surface || !(sc.surface in SURFACE_POLARITY)) {
      errors.push({
        severity: 'error',
        code: 'missing_surface',
        sceneId: sc.id,
        startSec: sc.startSec,
        endSec: sc.endSec,
        message: `Scene "${sc.id}" must declare a valid surface.`,
      });
    }
    const shifts = sc.surfaceShifts ?? [];
    for (let k = 0; k < shifts.length; k++) {
      const sh = shifts[k];
      const prevAt = k > 0 ? shifts[k - 1].atSec : sc.startSec;
      const outOfScene = sh.atSec <= sc.startSec + 0.02 || sh.atSec >= sc.endSec - 0.02;
      if (outOfScene || sh.atSec <= prevAt || !(sh.surface in SURFACE_POLARITY)) {
        errors.push({
          severity: 'error',
          code: 'invalid_surface_shift',
          sceneId: sc.id,
          startSec: sh.atSec,
          message: `Scene "${sc.id}" surfaceShifts[${k}] (${sh.surface} @ ${sh.atSec.toFixed(2)}s) must lie strictly inside ${sc.startSec.toFixed(2)}s-${sc.endSec.toFixed(2)}s in ascending order.`,
        });
      }
    }
    if (sc.endSec <= sc.startSec) {
      errors.push({
        severity: 'error',
        code: 'invalid_scene_duration',
        sceneId: sc.id,
        startSec: sc.startSec,
        endSec: sc.endSec,
        message: `Scene "${sc.id}" has endSec (${sc.endSec}) <= startSec (${sc.startSec}).`,
      });
    }
    if (i === 0 && sc.startSec > 0.02) {
      errors.push({
        severity: 'error',
        code: 'timeline_gap',
        sceneId: sc.id,
        startSec: 0,
        endSec: sc.startSec,
        message: `Initial timeline gap before "${sc.id}" (0.00s -> ${sc.startSec.toFixed(2)}s).`,
      });
    }
    if (i > 0) {
      const prev = scenes[i - 1];
      const delta = sc.startSec - prev.endSec;
      if (delta > 0.02) {
        errors.push({
          severity: 'error',
          code: 'timeline_gap',
          sceneId: sc.id,
          startSec: prev.endSec,
          endSec: sc.startSec,
          message: `Timeline gap between "${prev.id}" and "${sc.id}" (${prev.endSec.toFixed(2)}s -> ${sc.startSec.toFixed(2)}s).`,
        });
      } else if (delta < -0.02) {
        errors.push({
          severity: 'error',
          code: 'timeline_overlap',
          sceneId: sc.id,
          startSec: sc.startSec,
          endSec: prev.endSec,
          message: `Timeline overlap between "${prev.id}" and "${sc.id}" (${sc.startSec.toFixed(2)}s < ${prev.endSec.toFixed(2)}s).`,
        });
      }
    }
    if (i === scenes.length - 1 && Math.abs(totalDurationSec - sc.endSec) > 0.05) {
      errors.push({
        severity: 'error',
        code: 'timeline_gap',
        sceneId: sc.id,
        startSec: sc.endSec,
        endSec: totalDurationSec,
        message: `Trailing timeline gap after "${sc.id}" (${sc.endSec.toFixed(2)}s -> ${totalDurationSec.toFixed(2)}s).`,
      });
    }

    for (const h of collectHeadlineStrings(sc)) {
      if (isPoeticPreachyHeadline(h)) {
        rawEditorial.push({
          severity: 'editorial',
          code: 'poetic_headline',
          rule: 'poetic_headline',
          sceneId: sc.id,
          startSec: sc.startSec,
          endSec: sc.endSec,
          message: `Scene "${sc.id}" contains preachy/poetic headline "${h}".`,
        });
      }
    }
  }

  if (spec.showLegacyCitation) {
    rawEditorial.push({
      severity: 'editorial',
      code: 'legacy_citation_shown',
      rule: 'legacy_citation_shown',
      startSec: 0,
      endSec: totalDurationSec,
      message: 'showLegacyCitation is enabled; keep citations in YouTube description only.',
    });
  }

  // 極性・明暗連続・比率計算
  let brightAcc = 0;
  let brightStart = 0;
  let maxBrightStreak = 0;
  let maxBrightRange: [number, number] | null = null;

  let nonDarkAcc = 0;
  let nonDarkStart = 0;
  let maxNonDarkStreak = 0;
  let maxNonDarkRange: [number, number] | null = null;

  let darkAcc = 0;
  let darkStart = 0;
  let maxDarkStreak = 0;
  let maxDarkRange: [number, number] | null = null;

  let totalBrightSec = 0;
  let totalDarkSec = 0;
  let measuredSec = 0;

  const flushBright = (endSec: number) => {
    if (brightAcc > 0) {
      if (brightAcc > maxBrightStreak) {
        maxBrightStreak = brightAcc;
        maxBrightRange = [+brightStart.toFixed(2), +endSec.toFixed(2)];
      }
      if (brightAcc > PLAN_E_AUDIT_RULES.MAX_BRIGHT_STREAK_SEC) {
        rawEditorial.push({
          severity: 'editorial',
          code: 'bright_streak',
          rule: 'bright_streak',
          startSec: +brightStart.toFixed(2),
          endSec: +endSec.toFixed(2),
          durationSec: +brightAcc.toFixed(2),
          message: `Bright surface streak ${brightAcc.toFixed(2)}s (${brightStart.toFixed(2)}s-${endSec.toFixed(2)}s) exceeds ${PLAN_E_AUDIT_RULES.MAX_BRIGHT_STREAK_SEC}s.`,
        });
      }
      brightAcc = 0;
    }
  };

  const flushNonDark = (endSec: number) => {
    if (nonDarkAcc > 0) {
      if (nonDarkAcc > maxNonDarkStreak) {
        maxNonDarkStreak = nonDarkAcc;
        maxNonDarkRange = [+nonDarkStart.toFixed(2), +endSec.toFixed(2)];
      }
      if (nonDarkAcc > PLAN_E_AUDIT_RULES.MAX_NON_DARK_STREAK_SEC) {
        rawEditorial.push({
          severity: 'editorial',
          code: 'non_dark_streak',
          rule: 'non_dark_streak',
          startSec: +nonDarkStart.toFixed(2),
          endSec: +endSec.toFixed(2),
          durationSec: +nonDarkAcc.toFixed(2),
          message: `Non-dark surface streak ${nonDarkAcc.toFixed(2)}s (${nonDarkStart.toFixed(2)}s-${endSec.toFixed(2)}s) exceeds ${PLAN_E_AUDIT_RULES.MAX_NON_DARK_STREAK_SEC}s.`,
        });
      }
      nonDarkAcc = 0;
    }
  };

  const flushDark = (endSec: number) => {
    if (darkAcc > 0) {
      if (darkAcc > maxDarkStreak) {
        maxDarkStreak = darkAcc;
        maxDarkRange = [+darkStart.toFixed(2), +endSec.toFixed(2)];
      }
      if (darkAcc > PLAN_E_AUDIT_RULES.MAX_DARK_STREAK_SEC) {
        rawEditorial.push({
          severity: 'editorial',
          code: 'dark_streak',
          rule: 'dark_streak',
          startSec: +darkStart.toFixed(2),
          endSec: +endSec.toFixed(2),
          durationSec: +darkAcc.toFixed(2),
          message: `Dark surface streak ${darkAcc.toFixed(2)}s (${darkStart.toFixed(2)}s-${endSec.toFixed(2)}s) exceeds ${PLAN_E_AUDIT_RULES.MAX_DARK_STREAK_SEC}s.`,
        });
      }
      darkAcc = 0;
    }
  };

  const slots = spec.eyecatches ?? [];
  const surfaces = scenes.flatMap(surfaceSegments).flatMap(segment => {
    const boundaries = slots.flatMap(ec => [ec.startSec, ec.resumeSec])
      .filter(t => t > segment.startSec && t < segment.endSec);
    const times = [segment.startSec, ...boundaries, segment.endSec];
    return times.slice(1).map((endSec, i) => {
      const startSec = times[i];
      const inSlot = slots.some(ec => startSec >= ec.startSec && startSec < ec.resumeSec);
      return { startSec, endSec, surface: inSlot ? 'dark_desk' as const : segment.surface };
    });
  });
  for (const sc of surfaces) {
    const dur = Math.max(0, sc.endSec - sc.startSec);
    if (dur <= 0 || !(sc.surface in SURFACE_POLARITY)) continue;
    measuredSec += dur;
    const pol = SURFACE_POLARITY[sc.surface];

    if (pol === 'bright') {
      totalBrightSec += dur;
      if (brightAcc === 0) brightStart = sc.startSec;
      brightAcc += dur;

      if (nonDarkAcc === 0) nonDarkStart = sc.startSec;
      nonDarkAcc += dur;

      flushDark(sc.startSec);
    } else if (pol === 'mid') {
      flushBright(sc.startSec);
      if (nonDarkAcc === 0) nonDarkStart = sc.startSec;
      nonDarkAcc += dur;
      flushDark(sc.startSec);
    } else {
      totalDarkSec += dur;
      flushBright(sc.startSec);
      flushNonDark(sc.startSec);
      if (darkAcc === 0) darkStart = sc.startSec;
      darkAcc += dur;
    }
  }

  const endBoundary = scenes.length > 0 ? scenes[scenes.length - 1].endSec : totalDurationSec;
  flushBright(endBoundary);
  flushNonDark(endBoundary);
  flushDark(endBoundary);

  const brightRatio = measuredSec > 0 ? totalBrightSec / measuredSec : 0;
  const darkRatio = measuredSec > 0 ? totalDarkSec / measuredSec : 0;

  if (measuredSec >= PLAN_E_AUDIT_RULES.RATIO_CHECK_MIN_TOTAL_SEC) {
    if (brightRatio > PLAN_E_AUDIT_RULES.MAX_BRIGHT_RATIO) {
      rawEditorial.push({
        severity: 'editorial',
        code: 'bright_ratio',
        rule: 'bright_ratio',
        startSec: 0,
        endSec: +endBoundary.toFixed(2),
        message: `Bright ratio ${(brightRatio * 100).toFixed(1)}% exceeds ${(PLAN_E_AUDIT_RULES.MAX_BRIGHT_RATIO * 100).toFixed(0)}%.`,
      });
    }
    if (darkRatio < PLAN_E_AUDIT_RULES.MIN_DARK_RATIO) {
      rawEditorial.push({
        severity: 'editorial',
        code: 'dark_ratio',
        rule: 'dark_ratio',
        startSec: 0,
        endSec: +endBoundary.toFixed(2),
        message: `Dark ratio ${(darkRatio * 100).toFixed(1)}% is below ${(PLAN_E_AUDIT_RULES.MIN_DARK_RATIO * 100).toFixed(0)}%.`,
      });
    }
  }

  // ビート空白・SFX検査
  const visualChangePoints: number[] = [0, endBoundary, ...slots.flatMap(ec => [ec.startSec, ec.endSec, ec.resumeSec]).filter(t => t >= 0 && t <= endBoundary)];
  let propCount = 0;
  let coveredPropCount = 0;

  let stageSec = 0;
  let stageCueCount = 0;
  const hasSfxManifest =
    (spec.sfxMap !== undefined && Object.keys(spec.sfxMap).length > 0) ||
    (spec.sfxVariants !== undefined && Object.keys(spec.sfxVariants).length > 0);

  for (const sc of scenes) {
    visualChangePoints.push(sc.startSec);
    for (const sh of sc.surfaceShifts ?? []) visualChangePoints.push(sh.atSec);
    for (const mv of sc.camera?.moves ?? []) visualChangePoints.push(mv.atSec);
    for (const t of sc.camera?.shakes ?? []) visualChangePoints.push(t);
    if (sc.type === 'custom') {
      const dur = Math.max(0, sc.endSec - sc.startSec);
      stageSec += dur;
      const probe = probeStageScene(spec, sc, errors);
      stageCueCount += probe.cueTimes.length;
      for (const t of probe.cueTimes) visualChangePoints.push(t);
      for (const t of probe.sfxCueTimes) visualChangePoints.push(t);
      const audible = (sc.beats ?? []).filter((b) => b.sfx !== null).length + probe.sfxCueCount;
      if (
        dur >= PLAN_E_AUDIT_RULES.SILENT_STAGE_MIN_SEC &&
        probe.cueTimes.length >= 2 &&
        audible === 0
      ) {
        rawEditorial.push({
          severity: 'editorial',
          code: 'silent_stage',
          rule: 'silent_stage',
          sceneId: sc.id,
          startSec: +sc.startSec.toFixed(2),
          endSec: +sc.endSec.toFixed(2),
          message: `Free stage "${sc.id}" has ${probe.cueTimes.length} visual cues but no audible beat; add <SfxCue ... /> or hit(at(...), sfx) beats or waive intentional silence.`,
        });
      }
    }
    for (const beat of sc.beats ?? []) {
      visualChangePoints.push(beat.timeSec);
      if (beat.sfx !== null && !resolveSfxKind(beat.sfx)) {
        errors.push({
          severity: 'error',
          code: 'unknown_sfx_kind',
          sceneId: sc.id,
          startSec: beat.timeSec,
          message: `Scene "${sc.id}" beat uses unknown SFX kind "${String(beat.sfx)}".`,
        });
      }
      const needsSfx = PROP_DEFAULT_SFX[beat.prop] !== null;
      const hasAudioAsset =
        beat.sfx !== null && (!hasSfxManifest || Boolean(resolvePlanESfxSource(spec, beat.sfx)));
      if (!needsSfx && beat.sfx !== null && !hasAudioAsset) {
        rawEditorial.push({
          severity: 'editorial',
          code: 'missing_prop_sfx',
          rule: 'missing_prop_sfx',
          sceneId: sc.id,
          startSec: +beat.timeSec.toFixed(2),
          endSec: +beat.timeSec.toFixed(2),
          message: `Scene "${sc.id}" hit "${beat.id ?? beat.prop}" requests SFX "${beat.sfx}" with no audio asset.`,
        });
      }
      if (needsSfx) {
        propCount += 1;
        if (beat.explicitSilence || hasAudioAsset) {
          coveredPropCount += 1;
        } else {
          rawEditorial.push({
            severity: 'editorial',
            code: 'missing_prop_sfx',
            rule: 'missing_prop_sfx',
            sceneId: sc.id,
            startSec: +beat.timeSec.toFixed(2),
            endSec: +beat.timeSec.toFixed(2),
            message: `Scene "${sc.id}" prop "${beat.prop}" at ${beat.timeSec.toFixed(2)}s has no SFX (pass sfx: null for intentional silence).`,
          });
        }
      }
    }
  }

  visualChangePoints.sort((a, b) => a - b);
  let maxBeatGapSec = 0;
  let maxBeatGapRange: [number, number] | null = null;
  for (let i = 1; i < visualChangePoints.length; i++) {
    const gap = visualChangePoints[i] - visualChangePoints[i - 1];
    if (gap <= 0.01) continue;
    if (gap > maxBeatGapSec) {
      maxBeatGapSec = gap;
      maxBeatGapRange = [+visualChangePoints[i - 1].toFixed(2), +visualChangePoints[i].toFixed(2)];
    }
    if (gap > PLAN_E_AUDIT_RULES.MAX_BEAT_GAP_SEC) {
      rawEditorial.push({
        severity: 'editorial',
        code: 'beat_gap',
        rule: 'beat_gap',
        startSec: +visualChangePoints[i - 1].toFixed(2),
        endSec: +visualChangePoints[i].toFixed(2),
        durationSec: +gap.toFixed(2),
        message: `Beat gap ${gap.toFixed(2)}s (${visualChangePoints[i - 1].toFixed(2)}s-${visualChangePoints[i].toFixed(2)}s) exceeds ${PLAN_E_AUDIT_RULES.MAX_BEAT_GAP_SEC}s.`,
      });
    }
  }

  const editorial: PlanEAuditIssue[] = [];
  const waived: PlanEAuditIssue[] = [];
  for (const iss of rawEditorial) {
    const w = findMatchingWaiver(iss, waivers);
    if (w) {
      waived.push({ ...iss, waiverReason: w.reason });
    } else {
      editorial.push(iss);
    }
  }

  const sfxCoverageRatio = propCount > 0 ? coveredPropCount / propCount : 1;
  const stageRatio = measuredSec > 0 ? stageSec / measuredSec : 0;

  const advice: PlanEAuditIssue[] = [];
  if (scenes.length > 0 && scenes[0].type !== 'custom') {
    advice.push({
      severity: 'advice',
      code: 'hook_preset_only',
      sceneId: scenes[0].id,
      startSec: scenes[0].startSec,
      endSec: scenes[0].endSec,
      message: `Opening scene "${scenes[0].id}" is a preset (${scenes[0].type}); hero shots (hook / rehook / punchline) gain the most from a free stage (type: 'custom').`,
    });
  }
  if (
    measuredSec >= PLAN_E_AUDIT_RULES.STAGE_ADVICE_MIN_TOTAL_SEC &&
    stageRatio < PLAN_E_AUDIT_RULES.MIN_STAGE_RATIO_ADVICE
  ) {
    advice.push({
      severity: 'advice',
      code: 'stage_share_low',
      startSec: 0,
      endSec: +endBoundary.toFixed(2),
      message: `Free stage share ${(stageRatio * 100).toFixed(1)}% is low; presets keep the floor, free stages raise the ceiling.`,
    });
  }

  return {
    id: spec.id,
    passed: errors.length === 0,
    strictPassed: errors.length === 0 && editorial.length === 0,
    errors,
    editorial,
    waived,
    advice,
    metrics: {
      totalDurationSec: +measuredSec.toFixed(2),
      sceneCount: scenes.length,
      maxBrightStreakSec: +maxBrightStreak.toFixed(2),
      maxBrightStreakRange: maxBrightRange,
      maxNonDarkStreakSec: +maxNonDarkStreak.toFixed(2),
      maxNonDarkStreakRange: maxNonDarkRange,
      maxDarkStreakSec: +maxDarkStreak.toFixed(2),
      maxDarkStreakRange: maxDarkRange,
      brightRatio: +brightRatio.toFixed(4),
      darkRatio: +darkRatio.toFixed(4),
      maxBeatGapSec: +maxBeatGapSec.toFixed(2),
      maxBeatGapRange: maxBeatGapRange,
      propCount,
      coveredPropCount,
      sfxCoverageRatio: +sfxCoverageRatio.toFixed(4),
      stageSec: +stageSec.toFixed(2),
      stageRatio: +stageRatio.toFixed(4),
      stageCueCount,
    },
  };
}
