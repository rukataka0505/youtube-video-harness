import { staticFile } from 'remotion';
import { PLAN_E_MACRO_PALETTE, VIDEO_SPEC } from '../../theme/tokens';
import { SURFACE_POLARITY } from './auditRules';
import { PLAN_E_CANVAS_WIDTH, PLAN_E_STAGE_BOTTOM } from './constants';
import { PlanEAnchorError, PlanEMediaError } from './errors';
import type {
  PlanECueOptions,
  PlanECustomResolvedSurfaceShift,
  PlanECustomSceneContext,
  PlanEInk,
  PlanEMediaBackdrop,
  PlanEMediaBackdropConfig,
  PlanEProjectSpec,
  PlanEResolvedCamera,
  PlanESceneSpec,
  PlanESpecTimeline,
  PlanEStageRect,
  PlanESurface,
} from './types';

/**
 * 案E 自由舞台の文脈生成（テンプレート描画と監査 probe が共有する唯一の実装）。
 * probe と本番描画で同じ関数を通すため、probe で通った cue / media は本番でも必ず解決する。
 */

const PAPER_TAPE = 'rgba(232, 214, 160, 0.82)';

export const PLAN_E_INK: Record<PlanESurface, PlanEInk> = {
  paper: {
    ground: PLAN_E_MACRO_PALETTE.editorialPaper,
    ink: '#16130F',
    muted: '#5E554A',
    accent: '#C8102E',
    highlight: '#F2C230',
    paper: '#FBF8F1',
    tape: PAPER_TAPE,
    isLight: true,
  },
  whiteboard: {
    ground: PLAN_E_MACRO_PALETTE.whiteboardBg,
    ink: '#1A1C1E',
    muted: '#5D6164',
    accent: '#D7263D',
    highlight: '#0072B2',
    paper: '#FFFFFF',
    tape: PAPER_TAPE,
    isLight: true,
  },
  corkboard: {
    ground: '#7C542F',
    ink: '#1B120A',
    muted: '#4A3420',
    accent: '#C8102E',
    highlight: '#F2C230',
    paper: '#F6F0E2',
    tape: PAPER_TAPE,
    isLight: false,
  },
  charcoal: {
    ground: '#17191B',
    ink: '#F1EEE6',
    muted: '#A29C90',
    accent: '#FF5A4E',
    highlight: '#F2C230',
    paper: '#EFE9DC',
    tape: 'rgba(222, 204, 150, 0.78)',
    isLight: false,
  },
  dark_desk: {
    ground: '#130F0B',
    ink: '#F3EDE2',
    muted: '#A89C8A',
    accent: '#FF5A4E',
    highlight: '#F5B83D',
    paper: '#EFE7D6',
    tape: 'rgba(222, 204, 150, 0.78)',
    isLight: false,
  },
  dark_broll: {
    ground: '#090B0E',
    ink: '#F5F3EE',
    muted: '#B4AEA3',
    accent: '#FF5A4E',
    highlight: '#F2C230',
    paper: '#F2EDE2',
    tape: 'rgba(222, 204, 150, 0.78)',
    isLight: false,
  },
  projector: {
    ground: '#07080A',
    ink: '#EDEBE4',
    muted: '#9C998F',
    accent: '#FF5A4E',
    highlight: '#7FD3FF',
    paper: '#E9E4D8',
    tape: 'rgba(222, 204, 150, 0.7)',
    isLight: false,
  },
};

export const PLAN_E_STAGE_RECT: PlanEStageRect = {
  x: VIDEO_SPEC.safeMarginX,
  y: VIDEO_SPEC.safeMarginY,
  width: PLAN_E_CANVAS_WIDTH - VIDEO_SPEC.safeMarginX * 2,
  height: PLAN_E_STAGE_BOTTOM - VIDEO_SPEC.safeMarginY,
  bottom: PLAN_E_STAGE_BOTTOM,
};

export interface PlanESurfaceSegment {
  index: number;
  startSec: number;
  endSec: number;
  surface: PlanESurface;
  mediaBackdrop?: PlanEMediaBackdrop;
}

/** `mediaBackdrop` の文字列／オブジェクト表記を設定オブジェクトへ正規化する。 */
export function normalizeMediaBackdrop(spec: PlanEMediaBackdrop): PlanEMediaBackdropConfig {
  return typeof spec === 'string' ? { key: spec } : spec;
}

/** surfaceShifts を適用した時刻 sec（spec 秒）の地。 */
export function activeSurfaceAt(scene: PlanESceneSpec, sec: number): PlanESurface {
  let surface = scene.surface;
  for (const sh of scene.surfaceShifts ?? []) {
    if (sec + 1e-6 >= sh.atSec) surface = sh.surface;
  }
  return surface;
}

/** シーンを地ごとの区間 [start, end) に分割する（監査の極性連続計算・暗幕実写背景の区間解決用）。 */
export function surfaceSegments(scene: PlanESceneSpec): PlanESurfaceSegment[] {
  const out: PlanESurfaceSegment[] = [];
  let cursor = scene.startSec;
  let surface = scene.surface;
  let mediaBackdrop: PlanEMediaBackdrop | undefined =
    scene.type === 'custom' ? scene.mediaBackdrop : undefined;
  let index = 0;
  for (const sh of scene.surfaceShifts ?? []) {
    const atSec = Math.min(Math.max(sh.atSec, scene.startSec), scene.endSec);
    if (atSec > cursor) {
      out.push({
        index: index++,
        startSec: cursor,
        endSec: atSec,
        surface,
        ...(mediaBackdrop !== undefined ? { mediaBackdrop } : {}),
      });
    }
    cursor = Math.max(cursor, atSec);
    surface = sh.surface;
    mediaBackdrop =
      scene.type === 'custom'
        ? (sh as PlanECustomResolvedSurfaceShift).mediaBackdrop
        : undefined;
  }
  if (scene.endSec > cursor) {
    out.push({
      index: index++,
      startSec: cursor,
      endSec: scene.endSec,
      surface,
      ...(mediaBackdrop !== undefined ? { mediaBackdrop } : {}),
    });
  }
  return out;
}

/** 時刻 sec（spec 秒）における現在の地セグメント（surface と mediaBackdrop）を返す。 */
export function activeSurfaceSegmentAt(
  scene: PlanESceneSpec,
  sec: number,
): PlanESurfaceSegment {
  const segs = surfaceSegments(scene);
  if (segs.length === 0) {
    return {
      index: 0,
      startSec: scene.startSec,
      endSec: scene.endSec,
      surface: scene.surface,
      ...(scene.type === 'custom' && scene.mediaBackdrop !== undefined
        ? { mediaBackdrop: scene.mediaBackdrop }
        : {}),
    };
  }
  let active = segs[0];
  for (const seg of segs) {
    if (sec + 1e-6 >= seg.startSec) active = seg;
  }
  return active;
}

function findAll(haystack: string, needle: string): number[] {
  const hits: number[] = [];
  let pos = haystack.indexOf(needle, 0);
  while (pos !== -1) {
    hits.push(pos);
    pos = haystack.indexOf(needle, pos + 1);
  }
  return hits;
}

const CUE_WINDOW_TOLERANCE_SEC = 0.05;

/**
 * 語句の発話時刻（spec 秒）をシーン区間内から解決する。
 * 区間内に 0 件・nth 範囲外・未指定で複数件のときは PlanEAnchorError。
 */
export function resolveCueInWindow(
  timeline: PlanESpecTimeline | undefined,
  text: string,
  opts: PlanECueOptions | undefined,
  window: { startSec: number; endSec: number; sceneId: string },
): number {
  if (!timeline || timeline.chunks.length === 0) {
    throw new PlanEAnchorError(
      `cue("${text}") in scene "${window.sceneId}": spec has no timeline (build it with definePlanESpec).`,
    );
  }
  if (!text) {
    throw new PlanEAnchorError(`cue() in scene "${window.sceneId}" requires non-empty text.`);
  }
  const chunks = opts?.chunk
    ? timeline.chunks.filter((c) => c.id === opts.chunk)
    : timeline.chunks;
  const hits: number[] = [];
  for (const ch of chunks) {
    const times = timeline.charTimes[ch.id];
    if (!times || times.length < ch.text.length) continue;
    for (const idx of findAll(ch.text, text)) {
      let abs: number;
      if (opts?.edge === 'end') {
        const endIdx = idx + text.length;
        abs = endIdx < ch.text.length ? times[endIdx] : ch.speechEndSec;
      } else {
        abs = times[idx];
      }
      const specSec = abs - timeline.originSec;
      if (
        specSec >= window.startSec - CUE_WINDOW_TOLERANCE_SEC &&
        specSec <= window.endSec + CUE_WINDOW_TOLERANCE_SEC
      ) {
        hits.push(specSec);
      }
    }
  }
  if (hits.length === 0) {
    throw new PlanEAnchorError(
      `cue("${text}") not spoken inside scene "${window.sceneId}" (${window.startSec.toFixed(2)}s-${window.endSec.toFixed(2)}s).`,
    );
  }
  let chosen: number;
  if (opts?.nth === undefined) {
    if (hits.length > 1) {
      throw new PlanEAnchorError(
        `cue("${text}") is ambiguous in scene "${window.sceneId}" (${hits.length} matches); pass { nth }.`,
      );
    }
    chosen = hits[0];
  } else {
    if (!Number.isInteger(opts.nth) || opts.nth < 1 || opts.nth > hits.length) {
      throw new PlanEAnchorError(
        `cue("${text}") nth=${opts.nth} out of range (1..${hits.length}) in scene "${window.sceneId}".`,
      );
    }
    chosen = hits[opts.nth - 1];
  }
  return +(chosen + (opts?.offset ?? 0)).toFixed(3);
}

function resolvePlayableSrc(raw: string): string {
  if (/^(https?:\/\/|data:|blob:|\/)/.test(raw)) return raw;
  return staticFile(raw);
}

const easeInOutCubic = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

/** カメラの状態（ズーム・平行移動・着弾シェイク）を CSS transform 文字列で返す。 */
export function cameraTransformAt(sec: number, cam: PlanEResolvedCamera): string {
  let zoom = 1;
  let x = 0;
  let y = 0;
  for (const mv of cam.moves) {
    if (sec <= mv.atSec) break;
    const u = mv.durSec <= 0 ? 1 : Math.min(1, (sec - mv.atSec) / mv.durSec);
    const e = easeInOutCubic(u);
    zoom = zoom + (mv.zoom - zoom) * e;
    x = x + (mv.x - x) * e;
    y = y + (mv.y - y) * e;
  }
  let sx = 0;
  let sy = 0;
  let rot = 0;
  for (const t0 of cam.shakes) {
    const dt = sec - t0;
    if (dt < 0 || dt > 0.6) continue;
    const env = cam.shakeAmp * Math.exp(-8.5 * dt);
    sx += env * Math.sin(dt * 71);
    sy += env * 0.7 * Math.cos(dt * 57);
    rot += env * 0.03 * Math.sin(dt * 43);
  }
  return `translate(${(x + sx).toFixed(2)}px, ${(y + sy).toFixed(2)}px) scale(${zoom.toFixed(4)}) rotate(${rot.toFixed(3)}deg)`;
}

/** probe 時に cue / beat / media の利用を記録するレコーダ。 */
export interface PlanEStageRecorder {
  cueTimes: number[];
  mediaKeys: string[];
}

export function createStageContext(
  spec: PlanEProjectSpec,
  scene: PlanESceneSpec,
  frame: number,
  fps: number,
  recorder?: PlanEStageRecorder,
): PlanECustomSceneContext {
  const sec = frame / fps;
  const durationSec = Math.max(0.001, scene.endSec - scene.startSec);
  const t = Math.min(durationSec, Math.max(0, sec - scene.startSec));
  const surface = activeSurfaceAt(scene, sec);
  const imageMap = spec.imageMap ?? {};
  const videoMap = spec.videoMap ?? {};
  const beatLookup = new Map<string, number>();
  for (const b of scene.beats ?? []) {
    if (b.id) beatLookup.set(b.id, b.timeSec);
  }
  const window = { startSec: scene.startSec, endSec: scene.endSec, sceneId: scene.id };

  return {
    sec,
    frame,
    fps,
    scene,
    imageMap,
    videoMap,
    beat: (id: string) => {
      const v = beatLookup.get(id);
      if (v === undefined) {
        throw new PlanEAnchorError(`Unknown beat id "${id}" in scene "${scene.id}".`);
      }
      return v;
    },
    t,
    durationSec,
    progress: t / durationSec,
    surface,
    polarity: SURFACE_POLARITY[surface],
    ink: PLAN_E_INK[surface],
    stage: PLAN_E_STAGE_RECT,
    cue: (text, opts) => {
      const v = resolveCueInWindow(spec.timeline, text, opts, window);
      recorder?.cueTimes.push(v);
      return v;
    },
    media: (key: string) => {
      const raw = imageMap[key] ?? videoMap[key];
      if (!raw) {
        throw new PlanEMediaError(
          `media("${key}") in scene "${scene.id}" is not in imageMap/videoMap (add it to the spec JSON and rebuild).`,
        );
      }
      recorder?.mediaKeys.push(key);
      return resolvePlayableSrc(raw);
    },
  };
}
