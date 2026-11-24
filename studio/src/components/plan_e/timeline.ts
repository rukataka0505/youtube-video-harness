import { resolveSfxKind } from '../sfx';
import { PROP_DEFAULT_SFX, SURFACE_POLARITY } from './auditRules';
import { auditPlanEProjectSpec, type PlanEAuditReport } from './audit';
import { PlanEAnchorError, PlanEAuditError } from './errors';

export { PlanEAnchorError, PlanEAuditError, PlanEMediaError } from './errors';
import type {
  PlanEProjectSpec as PlanEProjectSpecV2,
  PlanESceneSpec as PlanESceneSpecV2,
} from './legacy/typesV2';
import type {
  Anchor,
  PlanEAuditWaiver,
  PlanEBeatInput,
  PlanECameraInput,
  PlanEProjectSpec,
  PlanEResolvedBeat,
  PlanEResolvedCamera,
  PlanEResolvedSurfaceShift,
  PlanESceneInput,
  PlanESceneSpec,
  PlanESfxKind,
  PlanESurface,
  PlanETimelineBase,
} from './types';

export function at(
  text: string,
  opts?: { chunk?: string; nth?: number; edge?: 'start' | 'end'; offset?: number },
): Anchor {
  return {
    kind: 'text',
    text,
    ...(opts?.chunk !== undefined ? { chunk: opts.chunk } : {}),
    ...(opts?.nth !== undefined ? { nth: opts.nth } : {}),
    ...(opts?.edge !== undefined ? { edge: opts.edge } : {}),
    ...(opts?.offset !== undefined ? { offset: opts.offset } : {}),
  };
}

export function atEvent(event: string, offset?: number): Anchor {
  return {
    kind: 'event',
    event,
    ...(offset !== undefined ? { offset } : {}),
  };
}

export function atStart(offset?: number): Anchor {
  return {
    kind: 'start',
    start: true,
    ...(offset !== undefined ? { offset } : {}),
  };
}

/**
 * 自由舞台用の「音だけのビート」。視覚は render() 側で `ctx.beat(id)` を読んで自由に描き、
 * 効果音だけをこのビートで Remotion `<Audio>` に一本化して鳴らす。
 */
export function hit(
  anchor: Anchor,
  sfx: PlanESfxKind,
  opts?: { id?: string; gain?: number; label?: string },
): PlanEBeatInput {
  return {
    ...(opts?.id !== undefined ? { id: opts.id } : {}),
    at: anchor,
    prop: 'custom_cue',
    params: { label: opts?.label ?? sfx },
    sfx,
    ...(opts?.gain !== undefined ? { gain: opts.gain } : {}),
  } as PlanEBeatInput;
}

export function shiftAnchor(anchor: Anchor, deltaSec: number): Anchor {
  return {
    ...anchor,
    offset: +((anchor.offset ?? 0) + deltaSec).toFixed(3),
  };
}

function findAllOccurrences(haystack: string, needle: string): number[] {
  const hits: number[] = [];
  if (!needle) return hits;
  let pos = haystack.indexOf(needle, 0);
  while (pos !== -1) {
    hits.push(pos);
    pos = haystack.indexOf(needle, pos + 1);
  }
  return hits;
}

export function resolveAnchor(base: PlanETimelineBase, a: Anchor): number {
  if ('start' in a && a.start === true) {
    const raw = a.offset ?? 0;
    return +raw.toFixed(3);
  }

  if ('event' in a && a.event !== undefined) {
    const val = base.events?.[a.event];
    if (typeof val !== 'number' || Number.isNaN(val)) {
      throw new PlanEAnchorError(`Unknown event anchor: "${a.event}"`);
    }
    return +(val + (a.offset ?? 0)).toFixed(3);
  }

  const textAnchor = a as Extract<Anchor, { text: string }>;
  const needle = textAnchor.text;
  if (!needle) {
    throw new PlanEAnchorError('Anchor text must be a non-empty string.');
  }
  const chunks = base.chunks ?? [];
  const charTimes = base.charTimes ?? {};
  if (chunks.length === 0) {
    throw new PlanEAnchorError(
      `Timeline "${base.slug}" has no chunks; rebuild with build_plan_e_assets.py v3.0.`,
    );
  }

  const targetChunks = textAnchor.chunk
    ? chunks.filter((c) => c.id === textAnchor.chunk)
    : chunks;
  if (textAnchor.chunk && targetChunks.length === 0) {
    throw new PlanEAnchorError(`Anchor chunk "${textAnchor.chunk}" not found.`);
  }

  const matches: { chunkId: string; charIdx: number; text: string; speechEndSec: number }[] = [];
  for (const ch of targetChunks) {
    for (const idx of findAllOccurrences(ch.text, needle)) {
      matches.push({
        chunkId: ch.id,
        charIdx: idx,
        text: ch.text,
        speechEndSec: ch.speechEndSec,
      });
    }
  }

  if (matches.length === 0) {
    throw new PlanEAnchorError(
      `Anchor text not found: "${needle}"${textAnchor.chunk ? ` in chunk "${textAnchor.chunk}"` : ''}`,
    );
  }

  let chosen = matches[0];
  if (textAnchor.nth === undefined) {
    if (matches.length > 1) {
      throw new PlanEAnchorError(
        `Anchor text "${needle}" is ambiguous (${matches.length} matches); specify chunk or nth.`,
      );
    }
  } else {
    if (!Number.isInteger(textAnchor.nth) || textAnchor.nth < 1 || textAnchor.nth > matches.length) {
      throw new PlanEAnchorError(
        `Anchor nth=${textAnchor.nth} for "${needle}" out of range (1..${matches.length}).`,
      );
    }
    chosen = matches[textAnchor.nth - 1];
  }

  const times = charTimes[chosen.chunkId];
  if (!times || times.length < chosen.text.length) {
    throw new PlanEAnchorError(
      `Missing charTimes for chunk "${chosen.chunkId}" (expected >= ${chosen.text.length}).`,
    );
  }

  let baseSec: number;
  if (textAnchor.edge === 'end') {
    const endIdx = chosen.charIdx + needle.length;
    baseSec = endIdx < chosen.text.length ? times[endIdx] : chosen.speechEndSec;
  } else {
    baseSec = times[chosen.charIdx];
  }

  return +(baseSec + (textAnchor.offset ?? 0)).toFixed(3);
}

const DEFAULT_CAMERA_MOVE_SEC = 0.6;
const DEFAULT_SHAKE_AMP = 11;

function resolveCamera(
  base: PlanETimelineBase,
  cam: PlanECameraInput,
  originSec: number,
): PlanEResolvedCamera {
  const moves = (cam.moves ?? [])
    .map((m) => ({
      atSec: +(resolveAnchor(base, m.at) - originSec).toFixed(3),
      zoom: m.zoom ?? 1,
      x: m.x ?? 0,
      y: m.y ?? 0,
      durSec: m.dur ?? DEFAULT_CAMERA_MOVE_SEC,
    }))
    .sort((a, b) => a.atSec - b.atSec);
  const shakes = (cam.shakes ?? [])
    .map((a) => +(resolveAnchor(base, a) - originSec).toFixed(3))
    .sort((a, b) => a - b);
  return {
    moves,
    shakes,
    shakeAmp: cam.shakeAmp ?? DEFAULT_SHAKE_AMP,
    origin: cam.origin ?? '50% 45%',
  };
}

export interface PlanEDefineInput {
  id: string;
  themeTitle?: string;
  range?: { start: Anchor; end: Anchor };
  scenes: readonly PlanESceneInput[];
  waivers?: readonly PlanEAuditWaiver[];
  showTickerBar?: boolean;
  release?: boolean;
  throwOnAuditError?: boolean;
}

function resolveBeat(
  base: PlanETimelineBase,
  beat: PlanEBeatInput,
  originSec: number,
): PlanEResolvedBeat {
  const timeSec = +(resolveAnchor(base, beat.at) - originSec).toFixed(3);
  let resolvedSfx: PlanESfxKind | null;
  let explicitSilence = false;

  if (beat.sfx === null) {
    resolvedSfx = null;
    explicitSilence = true;
  } else if (beat.sfx === undefined) {
    resolvedSfx = PROP_DEFAULT_SFX[beat.prop];
  } else {
    resolvedSfx = beat.sfx;
  }

  return {
    id: beat.id,
    timeSec,
    prop: beat.prop,
    params: beat.params,
    sfx: resolvedSfx,
    explicitSilence,
    gain: beat.gain,
  } as PlanEResolvedBeat;
}

export function definePlanESpec(
  base: PlanETimelineBase,
  input: PlanEDefineInput,
): PlanEProjectSpec {
  if (input.scenes.length === 0) {
    throw new PlanEAnchorError(`definePlanESpec("${input.id}"): scenes must not be empty.`);
  }

  const originSec = input.range ? resolveAnchor(base, input.range.start) : 0;
  const rangeEndSec = input.range
    ? resolveAnchor(base, input.range.end)
    : base.totalDurationSec;

  if (rangeEndSec <= originSec) {
    throw new PlanEAnchorError(
      `definePlanESpec("${input.id}"): invalid range (${originSec} >= ${rangeEndSec}).`,
    );
  }
  const totalDurationSec = +(rangeEndSec - originSec).toFixed(3);

  const rawStarts = input.scenes.map((sc) => ({
    sc,
    startSec: +(resolveAnchor(base, sc.start) - originSec).toFixed(3),
  }));

  for (let i = 0; i < rawStarts.length; i++) {
    const cur = rawStarts[i];
    if (!cur.sc.surface || !(cur.sc.surface in SURFACE_POLARITY)) {
      throw new PlanEAnchorError(
        `Scene "${cur.sc.id}" has missing or invalid surface: ${String(cur.sc.surface)}`,
      );
    }
    if (i > 0 && cur.startSec <= rawStarts[i - 1].startSec) {
      throw new PlanEAnchorError(
        `Scene "${cur.sc.id}" start (${cur.startSec}s) must be strictly greater than previous scene "${rawStarts[i - 1].sc.id}" (${rawStarts[i - 1].startSec}s).`,
      );
    }
  }

  const resolvedScenes: PlanESceneSpec[] = rawStarts.map(({ sc, startSec }, idx) => {
    const endSec =
      idx + 1 < rawStarts.length ? rawStarts[idx + 1].startSec : totalDurationSec;
    const {
      start: _omitStart,
      beats: rawBeats,
      surfaceShifts: rawShifts,
      camera: rawCamera,
      ...rest
    } = sc;
    const resolvedBeats = rawBeats?.map((b) => resolveBeat(base, b, originSec));
    const resolvedShifts: PlanEResolvedSurfaceShift[] | undefined = rawShifts?.map((sh) => {
      if (!(sh.surface in SURFACE_POLARITY)) {
        throw new PlanEAnchorError(
          `Scene "${sc.id}" surfaceShift has invalid surface: ${String(sh.surface)}`,
        );
      }
      const mediaBackdrop =
        sc.type === 'custom' && 'mediaBackdrop' in sh ? sh.mediaBackdrop : undefined;
      return {
        atSec: +(resolveAnchor(base, sh.at) - originSec).toFixed(3),
        surface: sh.surface,
        ...(mediaBackdrop !== undefined ? { mediaBackdrop } : {}),
      };
    });
    return {
      ...rest,
      startSec,
      endSec,
      ...(resolvedBeats ? { beats: resolvedBeats } : {}),
      ...(resolvedShifts ? { surfaceShifts: resolvedShifts } : {}),
      ...(rawCamera ? { camera: resolveCamera(base, rawCamera, originSec) } : {}),
    } as PlanESceneSpec;
  });

  const shiftedSubtitles = base.subtitles
    .filter((sub) => sub.endSec > originSec && sub.startSec < rangeEndSec)
    .map((sub) => ({
      ...sub,
      startSec: Math.max(0, +(sub.startSec - originSec).toFixed(4)),
      endSec: Math.min(totalDurationSec, +(sub.endSec - originSec).toFixed(4)),
    }));

  const spec: PlanEProjectSpec = {
    id: input.id,
    themeTitle: input.themeTitle ?? base.title,
    fps: base.fps,
    totalDurationSec,
    audioSrc: base.audioSrc,
    ...(originSec > 0 ? { audioTrimBeforeSec: originSec, rangeOriginSec: originSec } : {}),
    imageMap: base.imageMap,
    videoMap: base.videoMap,
    sfxMap: base.sfxMap,
    sfxVariants: base.sfxVariants,
    assets: base.assets,
    eyecatches: base.eyecatches
      ?.filter(ec => ec.startSec < rangeEndSec && ec.resumeSec > originSec)
      .map(ec => ({
        variant: ec.variant,
        startSec: ec.startSec - originSec,
        endSec: ec.endSec - originSec,
        resumeSec: ec.resumeSec - originSec,
      })),
    subtitles: shiftedSubtitles,
    scenes: resolvedScenes,
    timeline: { originSec, chunks: base.chunks, charTimes: base.charTimes },
    ...(input.waivers ? { waivers: input.waivers } : {}),
    showTickerBar: input.showTickerBar ?? false,
    showLegacyCitation: false,
  };

  const report = auditPlanEProjectSpec(spec, { release: input.release });
  if (report.errors.length > 0 && input.throwOnAuditError !== false) {
    throw new PlanEAuditError(report);
  }

  return spec;
}

function inferSurfaceFromV2Scene(sc: PlanESceneSpecV2): PlanESurface {
  if (sc.type === 'video_broll') return 'dark_broll';
  if (sc.type === 'vhs_pause_avatar' || sc.type === 'projector_target_map' || sc.type === 'projector_network') {
    return 'projector';
  }
  if (sc.type === 'news_broadcast') return 'dark_desk';
  if (sc.type === 'whiteboard_trend' || sc.type === 'whiteboard_stage' || sc.type === 'world_connection_map') {
    return 'whiteboard';
  }
  if (sc.type === 'editorial_cutout') {
    if (sc.backdrop === 'paper') return 'paper';
    if (sc.backdrop === 'corkboard') return 'corkboard';
    return 'dark_broll';
  }
  if (sc.type === 'causal_gear_loop') {
    return sc.surfaceTheme ?? 'paper';
  }
  switch (sc.backdropMode) {
    case 'editorial_paper':
      return 'paper';
    case 'whiteboard':
      return 'whiteboard';
    case 'corkboard':
      return 'corkboard';
    default:
      return 'charcoal';
  }
}

/**
 * 現行 v2（`PlanEProjectSpecV2`）を `definePlanESpec` で包んで v3 監査へ通す。
 * postmortem の白連続・非暗色連続などの違反再現検証に用いる。
 */
export function auditLegacyV2Spec(
  v2Spec: PlanEProjectSpecV2,
  base: PlanETimelineBase,
): PlanEAuditReport {
  const rawScenes = [...v2Spec.scenes].sort((a, b) => a.startSec - b.startSec);
  const sceneInputs: PlanESceneInput[] = rawScenes.map((sc, idx) => {
    const startSec = idx === 0 ? 0 : sc.startSec;
    const beats: PlanEBeatInput[] = (sc.sfxCues ?? []).map((cue, cIdx) => ({
      id: `${sc.id}-cue-${cIdx}`,
      at: atStart(+(sc.startSec + cue.offsetSec).toFixed(3)),
      prop: 'custom_cue',
      params: { label: cue.kind },
      sfx: resolveSfxKind(cue.kind) ? (cue.kind as PlanESfxKind) : null,
      gain: cue.gain,
    }));

    return {
      id: sc.id,
      type: 'diegetic_stage',
      start: atStart(startSec),
      surface: inferSurfaceFromV2Scene(sc),
      beats,
      hideSubtitle: sc.hideSubtitle,
    };
  });

  const wrapped = definePlanESpec(base, {
    id: v2Spec.id,
    themeTitle: v2Spec.themeTitle,
    scenes: sceneInputs,
    showTickerBar: v2Spec.showTickerBar ?? false,
    throwOnAuditError: false,
  });

  return auditPlanEProjectSpec({
    ...wrapped,
    showLegacyCitation: v2Spec.showLegacyCitation ?? false,
  });
}
