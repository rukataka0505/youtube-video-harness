import { Easing } from 'remotion';
import {
  f2,
  handLine,
  hashRnd as rnd,
  impulses,
  ring,
  rr,
  sanitizeSvgId,
  type ImpulseDecayFn,
  type Pt,
} from '../_materials';
import { clamp01, snapAt } from './beatUtils';

/* ========================================================================== */
/* 純粋物理・手描きパス数式ユーティリティ（stickman-collage v2.1）                */
/* ========================================================================== */

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;
/** 棒人間の足が接地する標準床ライン */
export const STAGE_FLOOR_Y = 812;
export const D2R = Math.PI / 180;

export { f2, handLine, impulses, ring, rnd, rr, sanitizeSvgId };
export type { ImpulseDecayFn, Pt };

export interface FlyResult {
  x: number;
  y: number;
  u: number;
}

export const ramp = (sec: number, a: number, b: number): number =>
  clamp01((sec - a) / Math.max(0.001, b - a));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const EIO = Easing.inOut(Easing.cubic);
export const EO = Easing.out(Easing.cubic);
export const BACK = Easing.out(Easing.back(1.6));

export const eio = (sec: number, a: number, b: number): number => EIO(ramp(sec, a, b));
export const eo = (sec: number, a: number, b: number): number => EO(ramp(sec, a, b));
export const fadeIn = (sec: number, start: number, duration = 0.3): number =>
  eo(sec, start, start + duration);
export const fadeOut = (sec: number, start: number, duration = 0.3): number =>
  1 - fadeIn(sec, start, duration);
export const back = (sec: number, a: number, b: number): number => BACK(ramp(sec, a, b));

/** 7.5fps 等で段付けした時刻（手描き「描き直し」感） */
export const stepSec = (sec: number, fps = 7.5): number =>
  Math.floor(sec * Math.max(1, fps)) / Math.max(1, fps);

/** 減衰振動（ぐらつき・揺れ戻し）。sec < at は 0 */
export const wob = (
  sec: number,
  at: number,
  amp: number,
  freq = 2.2,
  decay = 3.2,
): number =>
  sec < at
    ? 0
    : amp * Math.exp(-decay * (sec - at)) * Math.sin((sec - at) * freq * Math.PI * 2);

/** 着地の押しつぶし量（0→1→0 の速い減衰振動） */
export const squash = (sec: number, at: number, decay = 9, freq = 16): number =>
  sec < at ? 0 : Math.exp(-decay * (sec - at)) * Math.cos((sec - at) * freq);

/** 重力放物線で a → b へ飛ぶ（水平等速・lift は頂点の持ち上げ量） */
export const fly = (
  sec: number,
  t0: number,
  dur: number,
  a: Pt,
  b: Pt,
  lift: number,
): FlyResult => {
  const u = clamp01((sec - t0) / Math.max(0.001, dur));
  return {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u) - lift * 4 * u * (1 - u),
    u,
  };
};

/** 1回きりのバネ出現（0→1、オーバーシュートあり） */
export const pop = (
  sec: number,
  at: number,
  stiffness = 420,
  damping = 18,
  mass = 0.62,
  fps = 30,
): number => snapAt(sec, at, fps, stiffness, damping, mass);

/* ---------- 手描き SVG パス生成 ---------- */

/** 雲形パス（楕円上の点をアーチでつなぐ） */
export const cloud = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  bumps = 11,
  seed = 3,
): string => {
  const safeBumps = Math.max(4, Math.round(bumps));
  const pts = Array.from({ length: safeBumps }, (_, i) => {
    const a = (i / safeBumps) * Math.PI * 2;
    const jit = 1 + (rnd(i + seed) - 0.5) * 0.08;
    return { x: cx + Math.cos(a) * rx * jit, y: cy + Math.sin(a) * ry * jit };
  });
  let d = `M ${pts[0].x} ${pts[0].y}`;
  const r = ((rx + ry) / safeBumps) * 1.25;
  for (let i = 1; i <= safeBumps; i += 1) {
    const p = pts[i % safeBumps];
    d += ` A ${r} ${r} 0 0 1 ${p.x} ${p.y}`;
  }
  return `${d} Z`;
};

/** 4点キラパス */
export const sparkPath = (x: number, y: number, r: number): string =>
  `M ${x} ${y - r} Q ${x + r * 0.16} ${y - r * 0.16} ${x + r} ${y} Q ${x + r * 0.16} ${y + r * 0.16} ${x} ${y + r} Q ${x - r * 0.16} ${y + r * 0.16} ${x - r} ${y} Q ${x - r * 0.16} ${y - r * 0.16} ${x} ${y - r} Z`;
