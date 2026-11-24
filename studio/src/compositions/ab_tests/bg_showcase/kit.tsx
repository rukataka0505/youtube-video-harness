import React, { useId } from 'react';
import { Easing } from 'remotion';
import { useBoilSeed } from '../../../components/stickman_collage';

/* ========================================================================== */
/* bg_showcase 共通キット：決定論乱数・イージング・紙/ノイズ/グレイン層          */
/* ========================================================================== */

export const W = 1920;
export const H = 1080;
/** 字幕帯の上端（これより下は背景を静かに保つ） */
export const SUB_TOP = 890;
/** 棒人間の足が接地する床ライン */
export const FLOOR_Y = 812;

export const D2R = Math.PI / 180;

export const rnd = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};

export const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
export const ramp = (sec: number, a: number, b: number): number => clamp01((sec - a) / Math.max(0.001, b - a));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const EIO = Easing.inOut(Easing.cubic);
export const EO = Easing.out(Easing.cubic);
export const BACK = Easing.out(Easing.back(1.7));
export const eio = (sec: number, a: number, b: number): number => EIO(ramp(sec, a, b));
export const eo = (sec: number, a: number, b: number): number => EO(ramp(sec, a, b));
export const back = (sec: number, a: number, b: number): number => BACK(ramp(sec, a, b));

/** 減衰振動（sec<at は 0） */
export const wob = (sec: number, at: number, amp: number, freq = 2.2, decay = 3.2): number =>
  sec < at ? 0 : amp * Math.exp(-decay * (sec - at)) * Math.sin((sec - at) * freq * Math.PI * 2);

/** 7.5fps で段付けした時刻（線画の「描き直し」感） */
export const stepSec = (sec: number, fps = 7.5): number => Math.floor(sec * fps) / fps;

export const sid = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, '');
export const useSid = (prefix: string): string => `${prefix}-${sid(useId())}`;

export const f2 = (v: number): string => v.toFixed(2);

/** 手描きの円（4ベジェ・半径に微小ムラ） */
export const ring = (cx: number, cy: number, r: number, seed = 1): string => {
  const k = 0.5523;
  const [a, b, c, d] = [0, 1, 2, 3].map((i) => r * (1 + (rnd(seed * 7 + i) - 0.5) * 0.06));
  return [
    `M ${cx + a} ${cy}`,
    `C ${cx + a} ${cy + b * k} ${cx + b * k} ${cy + b} ${cx} ${cy + b}`,
    `C ${cx - c * k} ${cy + b} ${cx - c} ${cy + c * k} ${cx - c} ${cy}`,
    `C ${cx - c} ${cy - d * k} ${cx - d * k} ${cy - d} ${cx} ${cy - d}`,
    `C ${cx + a * k} ${cy - d} ${cx + a} ${cy - a * k} ${cx + a} ${cy} Z`,
  ].join(' ');
};

/** 手描きのゆがんだ矩形 */
export const rr = (x: number, y: number, w: number, h: number, j = 2, seed = 1): string => {
  const o = (k: number) => (rnd(seed * 13 + k) - 0.5) * 2 * j;
  return [
    `M ${x + o(1)} ${y + o(2)}`,
    `Q ${x + w / 2} ${y + o(3) * 1.4} ${x + w + o(4)} ${y + o(5)}`,
    `Q ${x + w + o(6) * 1.4} ${y + h / 2} ${x + w + o(7)} ${y + h + o(8)}`,
    `Q ${x + w / 2} ${y + h + o(9) * 1.4} ${x + o(10)} ${y + h + o(11)}`,
    `Q ${x + o(12) * 1.4} ${y + h / 2} ${x + o(1)} ${y + o(2)} Z`,
  ].join(' ');
};

/** 少しだけ弓なりに曲がった手引き線 */
export const handLine = (x1: number, y1: number, x2: number, y2: number, bow = 3, seed = 1): string => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  const b = bow * (rnd(seed) - 0.5) * 2;
  return `M ${x1} ${y1} Q ${mx - (dy / len) * b} ${my + (dx / len) * b} ${x2} ${y2}`;
};

/** 描かれていく線（pathLength=1 のダッシュ送り）。opacity と dash 併用可 */
export const Draw: React.FC<{
  d: string;
  sec: number;
  at: number;
  dur?: number;
  stroke: string;
  width: number;
  opacity?: number;
  fill?: string;
  ease?: (t: number) => number;
}> = ({ d, sec, at, dur = 0.5, stroke, width, opacity = 1, fill = 'none', ease = EIO }) => {
  if (sec < at) {
    return null;
  }
  const p = ease(ramp(sec, at, at + dur));
  return (
    <path
      d={d}
      pathLength={1}
      fill={fill}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="1 1"
      strokeDashoffset={1 - p}
      opacity={opacity}
    />
  );
};

/* -------------------------------------------------------------------------- */
/* ノイズ層                                                                    */
/* -------------------------------------------------------------------------- */

export interface NoiseProps {
  /** viewBox の解像度（低いほど粗い＝軽い） */
  vw?: number;
  vh?: number;
  freq: string;
  octaves?: number;
  seed?: number;
  type?: 'fractalNoise' | 'turbulence';
  /** feColorMatrix values（20値）。省略時は彩度0 */
  matrix?: string;
  opacity: number;
  blend?: React.CSSProperties['mixBlendMode'];
  /** ノイズ座標の平行移動（漂うヘイズ等） */
  shiftX?: number;
  shiftY?: number;
  style?: React.CSSProperties;
}

export const Noise: React.FC<NoiseProps> = ({
  vw = 480,
  vh = 270,
  freq,
  octaves = 2,
  seed = 1,
  type = 'fractalNoise',
  matrix,
  opacity,
  blend = 'normal',
  shiftX = 0,
  shiftY = 0,
  style,
}) => {
  const id = useSid('nz');
  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity, mixBlendMode: blend, ...style }}
    >
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence type={type} baseFrequency={freq} numOctaves={octaves} seed={seed} result="n" />
          {matrix ? (
            <feColorMatrix in="n" type="matrix" values={matrix} />
          ) : (
            <feColorMatrix in="n" type="saturate" values="0" />
          )}
        </filter>
      </defs>
      <g transform={`translate(${f2(-shiftX)} ${f2(-shiftY)})`}>
        <rect x={shiftX} y={shiftY} width={vw} height={vh} filter={`url(#${id})`} />
      </g>
    </svg>
  );
};

/** 7.5fps で種が変わるフィルムグレイン／紙目ボイル */
export const Grain: React.FC<{ opacity: number; blend?: React.CSSProperties['mixBlendMode']; freq?: number }> = ({
  opacity,
  blend = 'multiply',
  freq = 0.8,
}) => {
  const seed = useBoilSeed(7.5, 24);
  return <Noise vw={320} vh={180} freq={String(freq)} seed={seed} opacity={opacity} blend={blend} />;
};

/** 紙の凹凸（feDiffuseLighting による紙目レリーフ） */
export const PaperTooth: React.FC<{
  opacity: number;
  freq?: number;
  seed?: number;
  surface?: number;
  azimuth?: number;
  elevation?: number;
}> = ({ opacity, freq = 0.06, seed = 3, surface = 2.4, azimuth = 225, elevation = 58 }) => {
  const id = useSid('tooth');
  return (
    <svg
      viewBox="0 0 960 540"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity, mixBlendMode: 'multiply' }}
    >
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={3} seed={seed} result="n" />
          <feDiffuseLighting in="n" surfaceScale={surface} diffuseConstant={1.05} lightingColor="#ffffff" result="l">
            <feDistantLight azimuth={azimuth} elevation={elevation} />
          </feDiffuseLighting>
        </filter>
      </defs>
      <rect width={960} height={540} filter={`url(#${id})`} />
    </svg>
  );
};

/** 全画面 SVG（1920x1080 座標） */
export const Stage: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <svg
    viewBox={`0 0 ${W} ${H}`}
    aria-hidden="true"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', ...style }}
  >
    {children}
  </svg>
);

/** 字幕帯の静音化：下端に向けて背景を均す（color は背景の基調色） */
export const SubtitleCalm: React.FC<{ color: string; strength?: number; from?: number }> = ({
  color,
  strength = 0.55,
  from = 840,
}) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      top: from,
      bottom: 0,
      background: `linear-gradient(to bottom, ${color}00 0%, ${color}${Math.round(strength * 255)
        .toString(16)
        .padStart(2, '0')} 100%)`,
    }}
  />
);
