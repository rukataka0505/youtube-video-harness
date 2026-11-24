import React from 'react';
import { useBoilSeed } from '../../../components/stickman_collage';
import {
  BACK,
  D2R,
  Draw,
  EIO,
  FLOOR_Y,
  back,
  clamp01,
  eio,
  eo,
  f2,
  handLine,
  lerp,
  ramp,
  ring,
  rnd,
  rr,
  stepSec,
  useSid,
  wob,
} from './kit';

/* ========================================================================== */
/* ショーケース用：関節リグ棒人間 × 芝居 × 手描き小道具                          */
/* ========================================================================== */

export interface ActorInk {
  line: string;
  headFill: string;
  accent: string;
  accent2: string;
  muted: string;
  /** 床の落ち影 */
  shadow: string;
  /** 紙の切り抜きシール化（木目など中間調の背景向け）。紙色 */
  cutout?: string;
  /** 暗い背景での線の発光色 */
  glow?: string;
}

/* ---------------------------- リグ ---------------------------------------- */

/** 角度は「真下=0°、右=+90°、真上=180°」。肘・膝は相対角。右向き基準。 */
export interface StickPose {
  x: number;
  y: number;
  s: number;
  lean: number;
  head: number;
  ls: number;
  le: number;
  rs: number;
  re: number;
  lh: number;
  lk: number;
  rh: number;
  rk: number;
}

export type Face = 'neutral' | 'happy' | 'surprised' | 'think';

const LEN = { torso: 104, neck: 8, headR: 30, upper: 56, fore: 52, thigh: 62, shin: 60 };
const HIP_H = LEN.thigh + LEN.shin;
const SCALE = 1.32;
const HIP_Y = FLOOR_Y - HIP_H * SCALE;

type Pt = { x: number; y: number };
const polar = (o: Pt, a: number, l: number): Pt => ({ x: o.x + Math.sin(a * D2R) * l, y: o.y + Math.cos(a * D2R) * l });

const STAND: Omit<StickPose, 'x' | 'y' | 's'> = {
  lean: 0,
  head: 0,
  ls: -12,
  le: -8,
  rs: 14,
  re: 8,
  lh: -7,
  lk: 0,
  rh: 7,
  rk: 0,
};

const mix = (a: StickPose, b: StickPose, t: number): StickPose => {
  const o = { ...a };
  (Object.keys(a) as (keyof StickPose)[]).forEach((k) => {
    o[k] = lerp(a[k], b[k], t);
  });
  return o;
};

interface Key {
  t: number;
  d?: number;
  soft?: boolean;
  p: Partial<StickPose>;
}

const track = (sec: number, base: StickPose, keys: Key[]): StickPose => {
  let cur = { ...base };
  for (const k of [...keys].sort((a, b) => a.t - b.t)) {
    if (sec < k.t) {
      break;
    }
    const raw = ramp(sec, k.t, k.t + (k.d ?? 0.3));
    cur = mix(cur, { ...cur, ...k.p }, k.soft ? EIO(raw) : BACK(raw));
  }
  return cur;
};

const walkCycle = (p: StickPose, phase: number, amp: number): StickPose => {
  const sw = Math.sin(phase);
  const cw = Math.cos(phase);
  return {
    ...p,
    lh: lerp(p.lh, 27 * sw, amp),
    rh: lerp(p.rh, -27 * sw, amp),
    lk: lerp(p.lk, -Math.max(0, cw) * 44, amp),
    rk: lerp(p.rk, -Math.max(0, -cw) * 44, amp),
    ls: lerp(p.ls, -26 * sw - 4, amp),
    le: lerp(p.le, 20, amp),
    rs: lerp(p.rs, 26 * sw + 4, amp),
    re: lerp(p.re, 20, amp),
    lean: p.lean + 5 * amp,
    y: p.y - (1 - Math.abs(sw)) * 7 * p.s * amp,
  };
};

const seg = (a: Pt, b: Pt, bow: number): string => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return `M ${f2(a.x)} ${f2(a.y)} Q ${f2(mx - (dy / len) * bow)} ${f2(my + (dx / len) * bow)} ${f2(b.x)} ${f2(b.y)}`;
};

export const StickBody: React.FC<{
  p: StickPose;
  ink: string;
  headFill: string;
  face?: Face;
  flip?: boolean;
  width?: number;
  faceless?: boolean;
}> = ({ p, ink, headFill, face = 'neutral', flip = false, width = 9.5, faceless = false }) => {
  const s = p.s;
  const hip = { x: p.x, y: p.y };
  const sh = polar(hip, 180 - p.lean, LEN.torso * s);
  const head = polar(sh, 180 - p.lean - p.head, (LEN.neck + LEN.headR) * s);
  const lE = polar(sh, p.ls, LEN.upper * s);
  const lH = polar(lE, p.ls + p.le, LEN.fore * s);
  const rE = polar(sh, p.rs, LEN.upper * s);
  const rH = polar(rE, p.rs + p.re, LEN.fore * s);
  const lK = polar(hip, p.lh, LEN.thigh * s);
  const lF = polar(lK, p.lh + p.lk, LEN.shin * s);
  const rK = polar(hip, p.rh, LEN.thigh * s);
  const rF = polar(rK, p.rh + p.rk, LEN.shin * s);
  const w = width * s;
  const b = 2.2 * s;
  const fw = 3.4;
  const limb = (a: Pt, m: Pt, e: Pt, sign: number) => `${seg(a, m, b * sign)} ${seg(m, e, -b * sign).replace('M', 'L')}`;

  const faceEl = (() => {
    switch (face) {
      case 'happy':
        return (
          <>
            <path d="M -9 -2 Q -4 -10 1 -2" stroke={ink} strokeWidth={fw} fill="none" strokeLinecap="round" />
            <path d="M 8 -2 Q 13 -10 18 -2" stroke={ink} strokeWidth={fw} fill="none" strokeLinecap="round" />
            <path d="M -6 8 Q 5 21 17 8" stroke={ink} strokeWidth={fw} fill="none" strokeLinecap="round" />
          </>
        );
      case 'surprised':
        return (
          <>
            <circle cx={-4} cy={-4} r={4.4} fill={ink} />
            <circle cx={14} cy={-4} r={4.4} fill={ink} />
            <ellipse cx={6} cy={12} rx={4.6} ry={6} fill="none" stroke={ink} strokeWidth={fw} />
          </>
        );
      case 'think':
        return (
          <>
            <circle cx={-2} cy={-6} r={3.4} fill={ink} />
            <circle cx={15} cy={-6} r={3.4} fill={ink} />
            <path d="M 0 12 L 13 10" stroke={ink} strokeWidth={fw} strokeLinecap="round" />
          </>
        );
      case 'neutral':
      default:
        return (
          <>
            <circle cx={-3} cy={-3} r={3.4} fill={ink} />
            <circle cx={14} cy={-3} r={3.4} fill={ink} />
            <path d="M -2 11 Q 6 15 14 11" stroke={ink} strokeWidth={fw} fill="none" strokeLinecap="round" />
          </>
        );
    }
  })();

  const body = (
    <g fill="none" stroke={ink} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      <path d={limb(hip, lK, lF, 1)} />
      <path d={limb(hip, rK, rF, -1)} />
      <path d={seg(hip, sh, b * 1.4)} />
      <path d={limb(sh, lE, lH, 1)} />
      <path d={limb(sh, rE, rH, -1)} />
      <path d={ring(head.x, head.y, LEN.headR * s, 3)} fill={headFill} />
      {faceless ? null : (
        <g transform={`translate(${f2(head.x)} ${f2(head.y)}) rotate(${f2(p.lean + p.head)}) scale(${s})`} stroke="none">
          {faceEl}
        </g>
      )}
    </g>
  );
  return flip ? <g transform={`translate(${f2(2 * p.x)} 0) scale(-1 1)`}>{body}</g> : body;
};

/* ---------------------------- 芝居 ---------------------------------------- */

export type ActKind = 'walk_point' | 'walk_think_point' | 'drop_present' | 'walk_nod_cheer' | 'stroll_jump';

export interface ActSpec {
  kind: ActKind;
  /** 1 = 左から入って右向き / -1 = 右から入って左向き */
  dir: 1 | -1;
  standX: number;
}

export interface ActState {
  pose: StickPose;
  face: Face;
  flip: boolean;
  /** 0..1 接地度（影の濃さ） */
  ground: number;
}

const POINT: Partial<StickPose> = { rs: 104, re: -6, ls: -22, le: -14, lean: 4 };
const THINK: Partial<StickPose> = { rs: 26, re: 140, ls: -16, le: -24, head: -10, lean: -4 };
const PRESENT: Partial<StickPose> = { ls: -118, le: -22, rs: 118, re: 22, lean: 0, head: -4 };
const CHEER: Partial<StickPose> = { ls: -162, le: -12, rs: 162, re: 12, head: -10 };
const SQUAT: Partial<StickPose> = { lh: 42, lk: -78, rh: 30, rk: -70, lean: 12, ls: -40, le: 30, rs: -30, re: 30 };

const nod = (t: number): Key[] => [
  { t, d: 0.13, p: { head: 18 } },
  { t: t + 0.15, d: 0.16, soft: true, p: { head: 0 } },
  { t: t + 0.34, d: 0.13, p: { head: 16 } },
  { t: t + 0.49, d: 0.18, soft: true, p: { head: 0 } },
];

/** 歩いて立ち止まるまでの x と歩行フェーズ */
const walkIn = (sec: number, startX: number, endX: number, dur: number) => {
  const t = ramp(sec, 0, dur);
  // 等速 → 最後 25% で減速
  const e = t < 0.75 ? t / 0.875 : 0.857 + (1 - Math.pow(1 - (t - 0.75) / 0.25, 2)) * 0.143;
  const x = lerp(startX, endX, Math.min(1, e));
  const travelled = Math.abs(x - startX);
  const phase = (travelled / (108 * SCALE)) * Math.PI;
  const amp = 1 - eio(sec, dur - 0.3, dur + 0.05);
  return { x, phase, amp };
};

export const actAt = (secRaw: number, spec: ActSpec): ActState => {
  const sec = Math.max(0, secRaw);
  const { dir, standX, kind } = spec;
  const flip = dir === -1;
  const base: StickPose = { x: standX, y: HIP_Y, s: SCALE, ...STAND };
  const breathe = (p: StickPose): StickPose => ({
    ...p,
    lean: p.lean + Math.sin(sec * 2.3) * 1.1,
    ls: p.ls + Math.sin(sec * 2.3 + 1) * 1.5,
    rs: p.rs - Math.sin(sec * 2.3 + 1) * 1.5,
  });

  if (kind === 'stroll_jump') {
    // 画面をゆっくり横断 → 跳ねる（透写台のオニオンスキン用に連続動作）
    const endX = standX;
    const startX = standX - dir * 760;
    const wk = walkIn(sec, startX, endX, 3.0);
    let p: StickPose = { ...base, x: wk.x };
    p = walkCycle(p, wk.phase, wk.amp);
    const tj = 3.55;
    p = track(sec, p, [
      { t: 3.05, d: 0.3, soft: true, p: { ...SQUAT, y: HIP_Y + 30 * SCALE } },
      { t: tj, d: 0.12, p: { ...CHEER, lh: -10, lk: -20, rh: 18, rk: -30, lean: -2, y: HIP_Y } },
      { t: 4.15, d: 0.18, soft: true, p: { lh: 30, lk: -50, rh: 24, rk: -46, y: HIP_Y + 18 * SCALE } },
      { t: 4.35, d: 0.35, p: { ...STAND, ...PRESENT, y: HIP_Y } },
    ]);
    const air = sec >= tj && sec < tj + 0.6 ? Math.sin(((sec - tj) / 0.6) * Math.PI) * 170 : 0;
    p = { ...p, y: p.y - air };
    const face: Face = sec < 3.05 ? 'neutral' : 'happy';
    return { pose: breathe(p), face, flip, ground: 1 - air / 260 };
  }

  if (kind === 'drop_present') {
    // 上から落ちてきて着地 → 両手で提示 → 頷き → 指差し
    const tLand = 0.62;
    const fall = sec < tLand ? 1 - Math.pow(sec / tLand, 2) : 0;
    let p: StickPose = { ...base, y: HIP_Y - fall * 900 };
    if (sec < tLand) {
      p = { ...p, ...CHEER, lh: -18, lk: -16, rh: 16, rk: -22 };
    }
    p = track(sec, p, [
      { t: tLand, d: 0.1, soft: true, p: { ...SQUAT, ls: -70, rs: 70, y: HIP_Y + 34 * SCALE } },
      { t: tLand + 0.14, d: 0.38, p: { ...STAND, y: HIP_Y } },
      { t: 1.35, d: 0.4, p: PRESENT },
      ...nod(2.05),
      { t: 2.9, d: 0.34, p: { ...STAND, ...POINT } },
      { t: 4.1, d: 0.2, soft: true, p: { head: -10 } },
    ]);
    const face: Face = sec < tLand + 0.3 ? 'surprised' : sec < 2.9 ? 'neutral' : 'happy';
    return { pose: breathe(p), face, flip, ground: sec < tLand ? clamp01(1 - fall * 1.6) : 1 };
  }

  const startX = standX - dir * 560;
  const wk = walkIn(sec, startX, standX, 1.55);
  let p: StickPose = { ...base, x: wk.x };
  p = walkCycle(p, wk.phase, wk.amp);

  if (kind === 'walk_point') {
    p = track(sec, p, [
      { t: 1.7, d: 0.32, soft: true, p: { head: -16, lean: -4 } },
      ...nod(2.45).map((k) => ({ ...k, p: { ...k.p, head: k.p.head === 0 ? -6 : 12 } })),
      { t: 3.15, d: 0.34, p: { ...POINT, head: 0 } },
      { t: 4.2, d: 0.2, soft: true, p: { head: -8 } },
    ]);
    const face: Face = sec < 2.3 ? 'neutral' : sec < 3.15 ? 'surprised' : 'happy';
    return { pose: breathe(p), face, flip, ground: 1 };
  }

  if (kind === 'walk_think_point') {
    p = track(sec, p, [
      { t: 1.65, d: 0.4, soft: true, p: THINK },
      ...nod(2.55).map((k) => ({ ...k, p: { ...k.p, head: k.p.head === 0 ? -10 : 8 } })),
      { t: 3.3, d: 0.34, p: { ...STAND, ...POINT } },
    ]);
    const face: Face = sec < 1.65 ? 'neutral' : sec < 3.3 ? 'think' : 'happy';
    return { pose: breathe(p), face, flip, ground: 1 };
  }

  // walk_nod_cheer
  const tj = 3.4;
  p = track(sec, p, [
    ...nod(1.75),
    { t: 2.55, d: 0.34, p: POINT },
    { t: 3.08, d: 0.26, soft: true, p: { ...SQUAT, y: HIP_Y + 28 * SCALE } },
    { t: tj, d: 0.12, p: { ...CHEER, lh: -10, lk: -18, rh: 14, rk: -26, lean: -2, y: HIP_Y } },
    { t: tj + 0.56, d: 0.14, soft: true, p: { lh: 30, lk: -50, rh: 24, rk: -46, y: HIP_Y + 18 * SCALE } },
    { t: tj + 0.72, d: 0.35, p: { ...STAND, ...CHEER, ls: -150, rs: 150, y: HIP_Y } },
  ]);
  const air = sec >= tj && sec < tj + 0.56 ? Math.sin(((sec - tj) / 0.56) * Math.PI) * 140 : 0;
  p = { ...p, y: p.y - air };
  const face: Face = sec < 2.55 ? 'neutral' : 'happy';
  return { pose: breathe(p), face, flip, ground: 1 - air / 240 };
};

/* ---------------------------- 描画ラッパ ----------------------------------- */

/** 7.5fps ボイル＋（任意）切り抜きシール化＋（任意）発光 */
export const InkLayer: React.FC<{ ink: ActorInk; children: React.ReactNode; boil?: number }> = ({
  ink,
  children,
  boil = 2.6,
}) => {
  const seed = useBoilSeed(7.5, 16);
  const boilId = useSid('boil');
  const fxId = useSid('fx');
  const fx = ink.cutout ? (
    <filter id={fxId} x="-10%" y="-10%" width="120%" height="125%">
      <feMorphology in="SourceAlpha" operator="dilate" radius={8} result="d" />
      <feFlood floodColor={ink.cutout} result="pc" />
      <feComposite in="pc" in2="d" operator="in" result="paper" />
      <feGaussianBlur in="d" stdDeviation={6} result="b" />
      <feOffset in="b" dx={7} dy={11} result="bo" />
      <feFlood floodColor="rgba(26, 12, 4, 0.5)" result="sc" />
      <feComposite in="sc" in2="bo" operator="in" result="shadow" />
      <feMerge>
        <feMergeNode in="shadow" />
        <feMergeNode in="paper" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  ) : ink.glow ? (
    <filter id={fxId} x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceGraphic" stdDeviation={7} result="b" />
      <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.45 0" result="g" />
      <feMerge>
        <feMergeNode in="g" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  ) : null;

  return (
    <g filter={fx ? `url(#${fxId})` : undefined}>
      <defs>
        <filter id={boilId} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency={0.024} numOctaves={2} seed={seed} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={boil} />
        </filter>
        {fx}
      </defs>
      <g filter={`url(#${boilId})`}>{children}</g>
    </g>
  );
};

export const FloorShadow: React.FC<{ x: number; ground: number; color: string; rx?: number }> = ({
  x,
  ground,
  color,
  rx = 92,
}) => (
  <ellipse
    cx={x}
    cy={FLOOR_Y + 4}
    rx={rx * (0.55 + 0.45 * ground)}
    ry={13 * (0.55 + 0.45 * ground)}
    fill={color}
    opacity={0.35 + 0.65 * ground}
  />
);

/* ========================================================================== */
/* 手描き小道具（8種）                                                         */
/* ========================================================================== */

export interface PropProps {
  sec: number;
  x: number;
  ink: ActorInk;
}

/** 01 電球：描かれる → 点灯して光が広がる */
export const PropBulb: React.FC<PropProps> = ({ sec, x, ink }) => {
  const y = 360 + Math.sin(sec * 2.1) * 8;
  const on = eo(sec, 2.6, 2.9);
  const flick = sec > 2.6 && sec < 2.85 ? (Math.floor(sec * 30) % 2 === 0 ? 0.35 : 1) : 1;
  const glow = on * flick * (0.88 + Math.sin(sec * 7) * 0.06);
  const gid = useSid('bulbglow');
  const bulb = `M ${x - 50} ${y} C ${x - 58} ${y - 74}, ${x + 58} ${y - 74}, ${x + 50} ${y} C ${x + 44} ${y + 24}, ${x + 26} ${y + 34}, ${x + 24} ${y + 58} L ${x - 24} ${y + 58} C ${x - 26} ${y + 34}, ${x - 44} ${y + 24}, ${x - 50} ${y} Z`;
  return (
    <g>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0%" stopColor={ink.accent} stopOpacity={0.55} />
          <stop offset="45%" stopColor={ink.accent} stopOpacity={0.18} />
          <stop offset="100%" stopColor={ink.accent} stopOpacity={0} />
        </radialGradient>
      </defs>
      {glow > 0.01 ? (
        <g opacity={glow}>
          <circle cx={x} cy={y - 10} r={190} fill={`url(#${gid})`} />
          {Array.from({ length: 9 }, (_, i) => {
            const a = -90 + (i - 4) * 26;
            const r0 = 92 + Math.sin(sec * 9 + i) * 5;
            const r1 = r0 + 34 * eo(sec, 2.7 + i * 0.03, 3.0 + i * 0.03);
            const c = Math.cos(a * D2R);
            const s = Math.sin(a * D2R);
            return (
              <path
                key={i}
                d={`M ${x + c * r0} ${y - 10 + s * r0} L ${x + c * r1} ${y - 10 + s * r1}`}
                stroke={ink.accent}
                strokeWidth={8}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      ) : null}
      {glow > 0.01 ? <path d={bulb} fill={ink.accent} opacity={0.82 * glow} /> : null}
      <Draw d={bulb} sec={sec} at={1.55} dur={0.6} stroke={ink.line} width={8} />
      <Draw
        d={`M ${x - 18} ${y + 22} L ${x - 10} ${y - 12} L ${x} ${y + 10} L ${x + 10} ${y - 12} L ${x + 18} ${y + 22}`}
        sec={sec}
        at={2.05}
        dur={0.3}
        stroke={glow > 0.3 ? '#FFF8E0' : ink.line}
        width={5}
      />
      <Draw d={`M ${x - 26} ${y + 72} L ${x + 26} ${y + 72}`} sec={sec} at={2.15} dur={0.15} stroke={ink.line} width={8} />
      <Draw d={`M ${x - 22} ${y + 86} L ${x + 22} ${y + 86}`} sec={sec} at={2.25} dur={0.15} stroke={ink.line} width={8} />
      <Draw d={`M ${x - 12} ${y + 100} Q ${x} ${y + 108} ${x + 12} ${y + 100}`} sec={sec} at={2.35} dur={0.15} stroke={ink.line} width={8} />
    </g>
  );
};

/** 02 鉢植え：茎が伸び、葉が開き、そよぐ */
export const PropPlant: React.FC<PropProps> = ({ sec, x, ink }) => {
  const potIn = back(sec, 0.9, 1.3);
  const sway = Math.sin(sec * 1.9) * 4 * eio(sec, 2.2, 3.0);
  const top = FLOOR_Y - 120;
  const stem = `M ${x} ${top} C ${x - 10} ${top - 70}, ${x + 18 + sway} ${top - 140}, ${x + sway * 2} ${top - 230}`;
  const leaf = (lx: number, ly: number, ang: number, at: number, k: number) => {
    const sc = back(sec, at, at + 0.35);
    if (sc <= 0) {
      return null;
    }
    const rot = ang + Math.sin(sec * 2.4 + k) * 5;
    return (
      <g key={k} transform={`translate(${f2(lx + sway * (k / 3))} ${ly}) rotate(${f2(rot)}) scale(${f2(sc)})`}>
        <path d="M 0 0 C 20 -30, 64 -30, 84 0 C 64 26, 20 26, 0 0 Z" fill={ink.accent2} stroke={ink.line} strokeWidth={6} strokeLinejoin="round" />
        <path d="M 6 0 Q 42 -4 76 0" stroke={ink.line} strokeWidth={3.5} fill="none" strokeLinecap="round" />
      </g>
    );
  };
  return (
    <g>
      <g transform={`translate(${x} ${FLOOR_Y}) scale(${f2(potIn)}) translate(${-x} ${-FLOOR_Y})`}>
        <path
          d={`M ${x - 78} ${top} L ${x + 78} ${top} L ${x + 60} ${FLOOR_Y} L ${x - 60} ${FLOOR_Y} Z`}
          fill={ink.accent}
          stroke={ink.line}
          strokeWidth={8}
          strokeLinejoin="round"
        />
        <path d={`M ${x - 92} ${top - 2} L ${x + 92} ${top - 2} L ${x + 86} ${top + 30} L ${x - 86} ${top + 30} Z`} fill={ink.accent} stroke={ink.line} strokeWidth={8} strokeLinejoin="round" />
      </g>
      <Draw d={stem} sec={sec} at={1.35} dur={1.0} stroke={ink.line} width={8} />
      {leaf(x + 6, top - 80, -28, 1.85, 1)}
      {leaf(x + 4, top - 120, 200, 2.25, 2)}
      {leaf(x + 10, top - 170, -48, 2.65, 3)}
      {leaf(x + 4, top - 205, 215, 3.0, 4)}
    </g>
  );
};

/** 03 手描き棒グラフ：軸 → 棒が伸びる → 上昇矢印 */
export const PropBars: React.FC<PropProps> = ({ sec, x, ink }) => {
  const bx = x - 170;
  const by = FLOOR_Y - 10;
  const bars = [
    { h: 130, c: ink.accent2, at: 1.5 },
    { h: 210, c: ink.accent2, at: 1.85 },
    { h: 330, c: ink.accent, at: 2.25 },
  ];
  return (
    <g>
      <Draw d={handLine(bx - 20, by, bx + 360, by, 4, 2)} sec={sec} at={0.7} dur={0.45} stroke={ink.line} width={8} />
      <Draw d={handLine(bx - 10, by + 10, bx - 10, by - 400, 4, 3)} sec={sec} at={0.9} dur={0.45} stroke={ink.line} width={8} />
      {bars.map((b, i) => {
        const g = back(sec, b.at, b.at + 0.45);
        if (g <= 0) {
          return null;
        }
        const h = b.h * g;
        const x0 = bx + 30 + i * 110;
        return (
          <g key={i}>
            <path d={rr(x0, by - h, 76, h, 2, i + 4)} fill={b.c} stroke={ink.line} strokeWidth={7} strokeLinejoin="round" />
            {Array.from({ length: Math.floor(h / 26) }, (_, k) => (
              <path
                key={k}
                d={`M ${x0 + 8} ${by - 10 - k * 26} L ${x0 + 68} ${by - 34 - k * 26}`}
                stroke={ink.line}
                strokeWidth={2.4}
                opacity={0.35}
              />
            ))}
          </g>
        );
      })}
      <Draw
        d={`M ${bx + 40} ${by - 190} Q ${bx + 170} ${by - 260} ${bx + 300} ${by - 410}`}
        sec={sec}
        at={2.95}
        dur={0.45}
        stroke={ink.accent}
        width={9}
      />
      <Draw d={`M ${bx + 256} ${by - 404} L ${bx + 302} ${by - 412} L ${bx + 300} ${by - 364}`} sec={sec} at={3.35} dur={0.2} stroke={ink.accent} width={9} />
    </g>
  );
};

/** 04 本の山：一冊ずつ落ちて積み上がる */
export const PropBooks: React.FC<PropProps> = ({ sec, x, ink }) => {
  const books = [
    { w: 250, h: 54, c: '#B5443A', at: 1.8, dx: 0, rot: 0 },
    { w: 220, h: 48, c: '#2F4F7F', at: 2.12, dx: 10, rot: -3 },
    { w: 236, h: 50, c: '#D9A43A', at: 2.44, dx: -8, rot: 2 },
  ];
  let stackY = FLOOR_Y;
  return (
    <g>
      {books.map((b, i) => {
        const yTarget = stackY - b.h;
        stackY = yTarget;
        if (sec < b.at) {
          return null;
        }
        const t = ramp(sec, b.at, b.at + 0.34);
        const y = lerp(yTarget - 520, yTarget, t * t);
        const sq = sec > b.at + 0.34 ? Math.exp(-10 * (sec - b.at - 0.34)) * Math.cos((sec - b.at - 0.34) * 18) : 0;
        const rot = b.rot + wob(sec, b.at + 0.34, 4, 2.6, 4);
        const bx = x - b.w / 2 + b.dx;
        return (
          <g key={i} transform={`rotate(${f2(rot)} ${x} ${y + b.h}) translate(0 ${f2(sq * 4)})`}>
            <path d={rr(bx, y, b.w, b.h, 2, i + 8)} fill={b.c} stroke={ink.line} strokeWidth={7} strokeLinejoin="round" />
            <path d={`M ${bx + 14} ${y + 8} L ${bx + 14} ${y + b.h - 8}`} stroke={ink.line} strokeWidth={4} />
            <path d={`M ${bx + 34} ${y + b.h / 2} L ${bx + b.w - 40} ${y + b.h / 2}`} stroke="#FBF7EE" strokeWidth={5} strokeLinecap="round" opacity={0.8} />
            <path d={`M ${bx + b.w - 6} ${y + 6} L ${bx + b.w - 6} ${y + b.h - 6}`} stroke="#FBF7EE" strokeWidth={4} opacity={0.6} />
          </g>
        );
      })}
    </g>
  );
};

/** 05 虫めがね：「？」の上で揺れて「！」に変わる */
export const PropMagnifier: React.FC<PropProps> = ({ sec, x, ink }) => {
  const qy = 460;
  const swing = Math.sin(sec * 2.2) * 14 * (1 - eio(sec, 3.0, 3.4)) + wob(sec, 3.0, 10, 2.2, 3);
  const inP = back(sec, 1.4, 1.85);
  const bang = sec >= 3.05;
  const aside = eio(sec, 2.95, 3.35);
  const mx = x + 40 + Math.sin(sec * 1.6) * 30 * (1 - aside) + aside * 170;
  const my = qy - 10 + aside * 90;
  return (
    <g>
      {bang ? (
        <g transform={`translate(${x} ${qy}) scale(${f2(back(sec, 3.05, 3.35))})`}>
          <path d="M -6 -110 L 6 -110 L 2 20 L -2 20 Z" fill={ink.accent} stroke={ink.line} strokeWidth={6} strokeLinejoin="round" />
          <path d={ring(0, 58, 13, 5)} fill={ink.accent} stroke={ink.line} strokeWidth={6} />
        </g>
      ) : (
        <g>
          <Draw d={`M ${x - 52} ${qy - 64} C ${x - 50} ${qy - 132}, ${x + 62} ${qy - 132}, ${x + 56} ${qy - 66} C ${x + 52} ${qy - 22}, ${x} ${qy - 22}, ${x} ${qy + 20}`} sec={sec} at={0.9} dur={0.55} stroke={ink.line} width={11} />
          <Draw d={ring(x, qy + 60, 9, 2)} sec={sec} at={1.4} dur={0.15} stroke={ink.line} width={9} />
        </g>
      )}
      {inP > 0 ? (
        <g transform={`translate(${f2(mx)} ${my}) rotate(${f2(-30 + swing)}) scale(${f2(inP)})`}>
          <path d="M 70 70 L 150 150" stroke={ink.line} strokeWidth={26} strokeLinecap="round" />
          <path d="M 76 76 L 146 146" stroke="#8A5A33" strokeWidth={14} strokeLinecap="round" />
          <path d={ring(0, 0, 96, 7)} fill="rgba(255, 252, 240, 0.28)" stroke={ink.line} strokeWidth={14} />
          <path d="M -58 -34 Q -46 -62 -14 -70" stroke="#FFFDF4" strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.9} />
        </g>
      ) : null}
    </g>
  );
};

const gearPath = (r: number, teeth: number, depth: number): string => {
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const ang = [a0, a0 + step * 0.18, a0 + step * 0.32, a0 + step * 0.68, a0 + step * 0.82];
    const rad = [r - depth, r, r, r - depth, r - depth];
    ang.forEach((a, k) => pts.push(`${f2(Math.cos(a) * rad[k])} ${f2(Math.sin(a) * rad[k])}`));
  }
  return `M ${pts.join(' L ')} Z`;
};

/** 06 噛み合う歯車：線が引かれて回り出す */
export const PropGears: React.FC<PropProps> = ({ sec, x, ink }) => {
  const spin = Math.max(0, sec - 1.8);
  const speed = eio(sec, 1.8, 2.6);
  const a1 = spin * 42 * speed;
  const r1 = 118;
  const r2 = 78;
  const c1 = { x: x - 20, y: 560 };
  const c2 = { x: c1.x + r1 + r2 - 14, y: c1.y - 92 };
  const g1 = gearPath(r1, 12, 22);
  const g2 = gearPath(r2, 8, 22);
  const d1 = eo(sec, 1.0, 1.8);
  const d2 = eo(sec, 1.25, 2.0);
  return (
    <g>
      <g transform={`translate(${c1.x} ${c1.y}) rotate(${f2(a1)})`} opacity={d1 > 0 ? 1 : 0}>
        <path d={g1} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - d1} fill={d1 >= 1 ? 'rgba(120, 190, 255, 0.16)' : 'none'} stroke={ink.line} strokeWidth={7} strokeLinejoin="round" />
        <path d={ring(0, 0, 34, 2)} fill="none" stroke={ink.line} strokeWidth={6} opacity={d1} />
        <path d="M -60 0 L 60 0 M 0 -60 L 0 60" stroke={ink.accent} strokeWidth={3} opacity={0.7 * d1} strokeDasharray="10 8" />
      </g>
      <g transform={`translate(${c2.x} ${c2.y}) rotate(${f2(-a1 * (12 / 8) + 22)})`} opacity={d2 > 0 ? 1 : 0}>
        <path d={g2} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - d2} fill={d2 >= 1 ? 'rgba(255, 214, 102, 0.18)' : 'none'} stroke={ink.line} strokeWidth={7} strokeLinejoin="round" />
        <path d={ring(0, 0, 22, 4)} fill="none" stroke={ink.line} strokeWidth={6} opacity={d2} />
      </g>
      <Draw d={`M ${c1.x} ${c1.y + r1 + 20} L ${c1.x} ${FLOOR_Y}`} sec={sec} at={2.0} dur={0.3} stroke={ink.line} width={6} />
      <Draw d={`M ${c1.x - 60} ${FLOOR_Y} L ${c1.x + 60} ${FLOOR_Y}`} sec={sec} at={2.2} dur={0.25} stroke={ink.line} width={7} />
    </g>
  );
};

/** 07 ハート：描かれ、塗られ、鼓動する */
export const PropHeart: React.FC<PropProps> = ({ sec, x, ink }) => {
  const cy = 470;
  const beat = sec > 2.1 ? 1 + Math.max(0, Math.sin((sec - 2.1) * Math.PI * 2 * 1.15)) ** 6 * 0.12 : 1;
  const fillP = back(sec, 1.95, 2.3);
  const heart = `M ${x} ${cy + 110} C ${x - 40} ${cy + 70}, ${x - 150} ${cy + 20}, ${x - 140} ${cy - 50} C ${x - 132} ${cy - 112}, ${x - 40} ${cy - 120}, ${x} ${cy - 54} C ${x + 40} ${cy - 122}, ${x + 134} ${cy - 108}, ${x + 140} ${cy - 46} C ${x + 146} ${cy + 22}, ${x + 40} ${cy + 72}, ${x} ${cy + 110} Z`;
  return (
    <g transform={`translate(${x} ${cy}) scale(${f2(beat)}) translate(${-x} ${-cy})`}>
      {fillP > 0 ? (
        <g opacity={fillP}>
          <path d={heart} fill={ink.accent} opacity={0.88} />
          {Array.from({ length: 11 }, (_, k) => (
            <path key={k} d={`M ${x - 140 + k * 26} ${cy + 100} L ${x - 60 + k * 26} ${cy - 110}`} stroke="#FFFFFF" strokeWidth={3} opacity={0.18} />
          ))}
        </g>
      ) : null}
      <Draw d={heart} sec={sec} at={1.1} dur={0.8} stroke={ink.line} width={9} />
      {sec > 2.2
        ? [0, 1, 2].map((k) => {
            const ph = ((sec - 2.2) * 1.15 + k / 3) % 1;
            return (
              <path
                key={k}
                d={`M ${x + 150 + k * 6} ${cy - 90 - k * 40} l ${18 + ph * 26} ${-8 - ph * 10}`}
                stroke={ink.line}
                strokeWidth={6}
                strokeLinecap="round"
                opacity={1 - ph}
              />
            );
          })
        : null}
    </g>
  );
};

/** 08 星：赤鉛筆のラフ → 清書線 → きらめき（透写台の作画工程） */
export const PropStar: React.FC<PropProps> = ({ sec, x, ink }) => {
  const cy = 400 + Math.sin(sec * 2) * 6 + (sec > 3.55 && sec < 4.15 ? -Math.sin(((sec - 3.55) / 0.6) * Math.PI) * 40 : 0);
  const star = (r: number, jitter: number, seed: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = (i % 2 === 0 ? r : r * 0.44) * (1 + (rnd(seed + i) - 0.5) * jitter);
      pts.push(`${f2(x + Math.cos(a) * rad)} ${f2(cy + Math.sin(a) * rad)}`);
    }
    return `M ${pts.join(' L ')} Z`;
  };
  const rough = stepSec(sec);
  const spin = eio(sec, 3.55, 4.15) * 72;
  return (
    <g>
      <Draw d={star(140, 0.12, 3 + Math.floor(rough * 2) % 3)} sec={sec} at={0.5} dur={0.7} stroke="#D8433A" width={3.5} opacity={0.6} />
      <Draw d={ring(x, cy, 150, 9)} sec={sec} at={0.4} dur={0.6} stroke="#3A6FD8" width={2.5} opacity={0.4} />
      <g transform={`rotate(${f2(spin)} ${x} ${cy})`}>
        {sec > 2.1 ? <path d={star(130, 0.02, 11)} fill={ink.accent} opacity={back(sec, 2.1, 2.4) * 0.95} /> : null}
        <Draw d={star(130, 0.02, 11)} sec={sec} at={1.3} dur={0.8} stroke={ink.line} width={8} />
      </g>
      {sec > 2.3
        ? [0, 1, 2, 3].map((k) => {
            const ph = ((sec - 2.3) * 0.9 + k * 0.25) % 1;
            const a = k * 1.7 + 0.4;
            const r = 170 + ph * 40;
            const sx = x + Math.cos(a) * r;
            const sy = cy + Math.sin(a) * r;
            const sz = 16 * Math.sin(ph * Math.PI);
            return (
              <path
                key={k}
                d={`M ${f2(sx)} ${f2(sy - sz)} Q ${f2(sx)} ${f2(sy)} ${f2(sx + sz)} ${f2(sy)} Q ${f2(sx)} ${f2(sy)} ${f2(sx)} ${f2(sy + sz)} Q ${f2(sx)} ${f2(sy)} ${f2(sx - sz)} ${f2(sy)} Q ${f2(sx)} ${f2(sy)} ${f2(sx)} ${f2(sy - sz)} Z`}
                fill={ink.accent}
                stroke={ink.line}
                strokeWidth={3}
              />
            );
          })
        : null}
    </g>
  );
};
