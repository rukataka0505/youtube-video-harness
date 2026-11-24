import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { MediaBackdropPlate, type MediaBackdropPlateProps } from '../../_materials';
import { FONT_ECON_SANS, FONT_ECON_SERIF } from '../fonts';
import { clamp01, eo, lerp, rnd, spr } from './motion';

/**
 * 案E 自由舞台の表現プリミティブ。How Money Works 型の「机の上の物理的な紙と実写」を
 * 自由座標で組むための最小部品で、レイアウトや物語の型は一切持たない。
 * 時刻引数はすべて spec 時刻（秒）。
 */

/* ------------------------------------------------------------------ 配置・出現 */

export interface PlaceProps {
  x: number;
  y: number;
  w?: number | string;
  h?: number | string;
  rot?: number;
  z?: number;
  origin?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** 絶対座標配置（1920x1080 基準） */
export const Place: React.FC<PlaceProps> = ({ x, y, w, h, rot = 0, z, origin, style, children }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      height: h,
      zIndex: z,
      transform: rot ? `rotate(${rot}deg)` : undefined,
      transformOrigin: origin,
      ...style,
    }}
  >
    {children}
  </div>
);

export interface PopProps extends PlaceProps {
  sec: number;
  at: number;
  fps?: number;
  /** 出現前の縮尺（1 より大きいと「叩きつけ」、小さいと「湧き出し」） */
  from?: number;
  /** 出現前の縦ずれ px */
  dropY?: number;
  stiffness?: number;
  damping?: number;
}

/** 絶対座標＋バネ出現。at 以前は描画しない */
export const Pop: React.FC<PopProps> = ({
  sec,
  at,
  fps = 30,
  from = 0.55,
  dropY = 18,
  stiffness = 420,
  damping = 19,
  rot = 0,
  children,
  ...place
}) => {
  if (sec < at) return null;
  const p = spr(sec, at, fps, { stiffness, damping });
  return (
    <Place {...place}>
      <div
        style={{
          transform: `translateY(${lerp(dropY, 0, p).toFixed(2)}px) scale(${lerp(from, 1, p).toFixed(4)}) rotate(${lerp(rot - 6, rot, p).toFixed(3)}deg)`,
          opacity: clamp01(p * 3),
          transformOrigin: place.origin ?? 'center center',
        }}
      >
        {children}
      </div>
    </Place>
  );
};

/** 区間 [from, to) の間だけ描画する */
export const Window: React.FC<{ sec: number; from: number; to?: number; children?: React.ReactNode }> = ({
  sec,
  from,
  to = Number.POSITIVE_INFINITY,
  children,
}) => (sec >= from && sec < to ? <>{children}</> : null);

/* ------------------------------------------------------------------ 紙・テープ・写真 */

/** seed 固定の破れ縁 polygon（clip-path 用） */
export function tornEdgePolygon(seed: number, jag = 1.4, steps = 18): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) pts.push(`${(i / steps) * 100}% ${(rnd(seed + i) * jag).toFixed(2)}%`);
  for (let i = 0; i <= steps; i++) pts.push(`${(100 - rnd(seed + 40 + i) * jag).toFixed(2)}% ${(i / steps) * 100}%`);
  for (let i = steps; i >= 0; i--) pts.push(`${(i / steps) * 100}% ${(100 - rnd(seed + 80 + i) * jag).toFixed(2)}%`);
  for (let i = steps; i >= 0; i--) pts.push(`${(rnd(seed + 120 + i) * jag).toFixed(2)}% ${(i / steps) * 100}%`);
  return `polygon(${pts.join(', ')})`;
}

export interface TapeProps {
  w?: number;
  rot?: number;
  color?: string;
  style?: React.CSSProperties;
}

/** マスキングテープ片 */
export const Tape: React.FC<TapeProps> = ({ w = 150, rot = -4, color = 'rgba(232, 214, 160, 0.82)', style }) => (
  <div
    style={{
      position: 'absolute',
      width: w,
      height: Math.round(w * 0.26),
      background: color,
      transform: `rotate(${rot}deg)`,
      boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
      clipPath: 'polygon(2% 8%, 98% 0%, 100% 92%, 0% 100%)',
      zIndex: 5,
      ...style,
    }}
  />
);

export interface PaperScrapProps {
  w: number;
  h?: number;
  tone?: string;
  seed?: number;
  /** 破れ縁の深さ（%） */
  jag?: number;
  tape?: 'top' | 'corners' | false;
  shadow?: boolean;
  padding?: number | string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** 破れ紙片（新聞・メモ・領収書・チラシ）。中身は自由 */
export const PaperScrap: React.FC<PaperScrapProps> = ({
  w,
  h,
  tone = '#FBF8F1',
  seed = 7,
  jag = 1.4,
  tape = 'top',
  shadow = true,
  padding = 28,
  style,
  children,
}) => (
  <div style={{ position: 'relative', width: w, height: h, ...style }}>
    <div style={{ filter: shadow ? 'drop-shadow(0 10px 16px rgba(0,0,0,0.32))' : undefined, height: '100%' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          padding,
          background: `radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.5), transparent 60%), ${tone}`,
          clipPath: tornEdgePolygon(seed, jag),
        }}
      >
        {children}
      </div>
    </div>
    {tape === 'top' ? <Tape w={Math.min(190, w * 0.36)} rot={-3 + rnd(seed) * 6} style={{ left: '50%', top: -16, marginLeft: -Math.min(95, w * 0.18) }} /> : null}
    {tape === 'corners' ? (
      <>
        <Tape w={Math.min(130, w * 0.28)} rot={-38} style={{ left: -26, top: 4 }} />
        <Tape w={Math.min(130, w * 0.28)} rot={38} style={{ right: -26, top: 4 }} />
      </>
    ) : null}
  </div>
);

export interface PhotoPrintProps {
  src: string;
  w: number;
  h: number;
  border?: number;
  caption?: string;
  captionSize?: number;
  objectPosition?: string;
  filter?: string;
  tape?: boolean;
  tone?: string;
  style?: React.CSSProperties;
}

/** 白縁の実写プリント（`ctx.media(key)` で解決した実写・一次資料のみを入れる） */
export const PhotoPrint: React.FC<PhotoPrintProps> = ({
  src,
  w,
  h,
  border = 14,
  caption,
  captionSize = 30,
  objectPosition = '50% 50%',
  filter,
  tape = true,
  tone = '#F7F4EC',
  style,
}) => (
  <div style={{ position: 'relative', width: w + border * 2, ...style }}>
    <div
      style={{
        background: tone,
        padding: border,
        paddingBottom: caption ? border + captionSize * 1.6 : border,
        boxShadow: '0 14px 24px rgba(0,0,0,0.34), 0 2px 4px rgba(0,0,0,0.2)',
      }}
    >
      <Img src={src} style={{ width: w, height: h, objectFit: 'cover', objectPosition, filter, display: 'block' }} />
      {caption ? (
        <div
          style={{
            marginTop: captionSize * 0.35,
            fontFamily: FONT_ECON_SERIF,
            fontWeight: 800,
            fontSize: captionSize,
            color: '#1B1712',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
    {tape ? <Tape w={Math.min(170, w * 0.34)} rot={-5} style={{ left: '50%', top: -14, marginLeft: -Math.min(85, w * 0.17) }} /> : null}
  </div>
);

/* ------------------------------------------------------------------ 実写の地 */

export type MediaPlateProps = MediaBackdropPlateProps;

/** 全面の実写プレート（動画は fromSec から trimBeforeSec 位置で再生・loop 対応、静止画は Ken Burns） */
export const MediaPlate: React.FC<MediaPlateProps> = MediaBackdropPlate;

export const DARK_MEDIA_BACKDROP_DEFAULTS = {
  filter: 'contrast(1.1) saturate(0.78) brightness(0.76)',
  dim: 0.44,
  vignette: 0.62,
  zoom: [1.04, 1.12] as readonly [number, number],
} as const;

export type DarkMediaBackdropProps = MediaPlateProps;

/** 暗幕フィルター（暗色グレード・黒幕・ビネット・微ズーム）を既定適用する全面実写プレート。 */
export const DarkMediaBackdrop: React.FC<DarkMediaBackdropProps> = ({
  filter = DARK_MEDIA_BACKDROP_DEFAULTS.filter,
  dim = DARK_MEDIA_BACKDROP_DEFAULTS.dim,
  vignette = DARK_MEDIA_BACKDROP_DEFAULTS.vignette,
  zoom = DARK_MEDIA_BACKDROP_DEFAULTS.zoom,
  ...rest
}) => (
  <MediaPlate
    {...rest}
    filter={filter}
    dim={dim}
    vignette={vignette}
    zoom={zoom}
  />
);

/** 暗転スポット（机上ランプ・取調室・舞台照明） */
export const Spotlight: React.FC<{ x: number; y: number; r: number; strength?: number; color?: string }> = ({
  x,
  y,
  r,
  strength = 0.78,
  color = '4, 4, 6',
}) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `radial-gradient(circle at ${x}px ${y}px, transparent ${r}px, rgba(${color}, ${strength}) ${Math.round(r * 1.9)}px)`,
    }}
  />
);

/* ------------------------------------------------------------------ インク */

export interface InkStrokeProps {
  /** 1920x1080 座標の SVG path */
  d: string;
  sec: number;
  at: number;
  dur?: number;
  color?: string;
  width?: number;
  opacity?: number;
}

/** マーカーで引く線（矢印・下線・取り消し線・流れ） */
export const InkStroke: React.FC<InkStrokeProps> = ({ d, sec, at, dur = 0.45, color = '#C8102E', width = 9, opacity = 0.92 }) => {
  if (sec < at) return null;
  const p = eo(sec, at, dur);
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}>
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1"
        strokeDashoffset={(1 - p).toFixed(4)}
        opacity={opacity}
      />
    </svg>
  );
};

/** 手描きの丸囲み（始点と終点が重なる 1.1 周のムラ楕円） */
export function inkCirclePath(cx: number, cy: number, rx: number, ry: number, seed = 3): string {
  const steps = 40;
  const start = -1.9;
  const span = Math.PI * 2 * 1.1;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + (span * i) / steps;
    const j = 1 + (rnd(seed + i * 0.37) - 0.5) * 0.06 + (i / steps) * 0.05;
    pts.push(`${(cx + Math.cos(a) * rx * j).toFixed(1)} ${(cy + Math.sin(a) * ry * j).toFixed(1)}`);
  }
  return `M ${pts.join(' L ')}`;
}

/** 数え上げ表示（at から dur 秒で from→to） */
export const CountUp: React.FC<{
  sec: number;
  at: number;
  dur?: number;
  from?: number;
  to: number;
  format?: (n: number) => string;
  style?: React.CSSProperties;
}> = ({ sec, at, dur = 1.1, from = 0, to, format = (n) => Math.round(n).toLocaleString('ja-JP'), style }) => (
  <span style={{ fontFamily: FONT_ECON_SANS, fontVariantNumeric: 'tabular-nums', ...style }}>
    {format(lerp(from, to, eo(sec, at, dur)))}
  </span>
);
