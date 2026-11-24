import React, { useId } from 'react';
import { sanitizeSvgId } from '../_materials/paths';
import { THUMB_H, THUMB_W } from './utils';

/* ========================================================================== */
/* サムネイル共通部品パレット：紙・インク・背景質感（1920x1080 SVG 内用）          */
/*  構図を一切縛らず、「手触り・印刷ムラ・紙の歯・光」だけを即座に敷ける部品群。   */
/* ========================================================================== */

export interface ThumbGrainLayerProps {
  /** ノイズ色 [r, g, b]（0..1） */
  rgb: [number, number, number];
  alpha: number;
  freq: number;
  seed: number;
  octaves?: number;
  bias?: number;
  blend?: 'multiply' | 'screen' | 'normal' | 'overlay';
  width?: number;
  height?: number;
}

/** 色付きフラクタルノイズ（紙の歯・印刷ムラ・チョーク粉ムラ） */
export const ThumbGrainLayer: React.FC<ThumbGrainLayerProps> = ({
  rgb,
  alpha,
  freq,
  seed,
  octaves = 2,
  bias = 0,
  blend = 'normal',
  width = THUMB_W,
  height = THUMB_H,
}) => {
  const id = `tgr-${sanitizeSvgId(useId())}`;
  return (
    <>
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={octaves} seed={seed} />
          <feColorMatrix
            type="matrix"
            values={`0 0 0 0 ${rgb[0]}  0 0 0 0 ${rgb[1]}  0 0 0 0 ${rgb[2]}  0 0 0 ${alpha} ${bias}`}
          />
        </filter>
      </defs>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        filter={`url(#${id})`}
        style={blend === 'normal' ? undefined : { mixBlendMode: blend }}
      />
    </>
  );
};

export interface ThumbGraphPaperBgProps {
  paperColor?: string;
  minorGridColor?: string;
  majorGridColor?: string;
  minorStep?: number;
  majorStep?: number;
  grainRgb?: [number, number, number];
  vignetteColor?: string;
  vignetteOpacity?: number;
  seed?: number;
  /** ビネットを背景側に含めるか（手前要素にも掛けたい場合は false にして ThumbVignetteOverlay を最前面に置く） */
  includeVignette?: boolean;
}

/** 方眼紙背景（細罫線＋太罫線＋紙目2層＋任意ビネット） */
export const ThumbGraphPaperBg: React.FC<ThumbGraphPaperBgProps> = ({
  paperColor = '#E2ECE5',
  minorGridColor = 'rgba(38, 104, 86, 0.13)',
  majorGridColor = 'rgba(38, 104, 86, 0.26)',
  minorStep = 24,
  majorStep = 120,
  grainRgb = [0.16, 0.25, 0.2],
  vignetteColor = '#0D2A22',
  vignetteOpacity = 0.22,
  seed = 11,
  includeVignette = false,
}) => {
  const uid = sanitizeSvgId(useId());
  const minorId = `tgp-min-${uid}`;
  const majorId = `tgp-maj-${uid}`;
  return (
    <g>
      <defs>
        <pattern id={minorId} width={minorStep} height={minorStep} patternUnits="userSpaceOnUse">
          <path d={`M ${minorStep} 0 L 0 0 0 ${minorStep}`} fill="none" stroke={minorGridColor} strokeWidth={1.2} />
        </pattern>
        <pattern
          id={majorId}
          width={majorStep}
          height={majorStep}
          patternUnits="userSpaceOnUse"
          x={-12}
          y={8}
        >
          <path d={`M ${majorStep} 0 L 0 0 0 ${majorStep}`} fill="none" stroke={majorGridColor} strokeWidth={2} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={THUMB_W} height={THUMB_H} fill={paperColor} />
      <rect x={0} y={0} width={THUMB_W} height={THUMB_H} fill={`url(#${minorId})`} />
      <rect x={0} y={0} width={THUMB_W} height={THUMB_H} fill={`url(#${majorId})`} />
      <ThumbGrainLayer rgb={grainRgb} alpha={0.14} freq={0.9} seed={seed} />
      <ThumbGrainLayer
        rgb={[Math.min(1, grainRgb[0] + 0.04), Math.min(1, grainRgb[1] + 0.07), Math.min(1, grainRgb[2] + 0.07)]}
        alpha={0.2}
        freq={0.008}
        seed={seed + 7}
        octaves={3}
        bias={-0.04}
      />
      {includeVignette ? (
        <ThumbVignetteOverlay color={vignetteColor} opacity={vignetteOpacity} />
      ) : null}
    </g>
  );
};

export interface ThumbHalftoneDotsBgProps {
  baseColor?: string;
  dotColor?: string;
  dotOpacity?: number;
  dotSpacing?: number;
  dotRadius?: number;
  dotAngle?: number;
  stainRgb?: [number, number, number];
  seed?: number;
}

/** 回転ハーフトーンドット背景（信号赤・警告黄などの強い色面＋印刷ムラ） */
export const ThumbHalftoneDotsBg: React.FC<ThumbHalftoneDotsBgProps> = ({
  baseColor = '#D6261D',
  dotColor = '#9E120D',
  dotOpacity = 0.32,
  dotSpacing = 18,
  dotRadius = 3.1,
  dotAngle = 18,
  stainRgb = [0.35, 0.03, 0.02],
  seed = 14,
}) => {
  const uid = sanitizeSvgId(useId());
  const patId = `thf-dots-${uid}`;
  return (
    <g>
      <defs>
        <pattern
          id={patId}
          width={dotSpacing}
          height={dotSpacing}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${dotAngle})`}
        >
          <circle cx={dotSpacing / 2} cy={dotSpacing / 2} r={dotRadius} fill={dotColor} opacity={dotOpacity} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={THUMB_W} height={THUMB_H} fill={baseColor} />
      <rect x={0} y={0} width={THUMB_W} height={THUMB_H} fill={`url(#${patId})`} />
      <ThumbGrainLayer rgb={stainRgb} alpha={0.22} freq={0.012} seed={seed} octaves={3} bias={-0.04} />
      <ThumbGrainLayer rgb={[1, 0.95, 0.9]} alpha={0.12} freq={0.95} seed={seed + 5} />
    </g>
  );
};

export interface ThumbDarkSpotlightBgProps {
  outerColor?: string;
  midColor?: string;
  centerColor?: string;
  spotCx?: number;
  spotCy?: number;
  spotR?: number;
  /** 上からのスポット光円錐を表示するか */
  showCone?: boolean;
  conePath?: string;
  coneOpacity?: number;
  /** 黒板のチョーク消し跡を薄く入れるか */
  showChalkSmudge?: boolean;
  seed?: number;
}

/** 暗盤スポットライト＆光円錐＆黒板チョーク粒子背景 */
export const ThumbDarkSpotlightBg: React.FC<ThumbDarkSpotlightBgProps> = ({
  outerColor = '#050506',
  midColor = '#111116',
  centerColor = '#2B2C33',
  spotCx = 0.72,
  spotCy = 0.38,
  spotR = 0.62,
  showCone = true,
  conePath = 'M 1270 -10 L 1580 -10 L 1940 1090 L 860 1090 Z',
  coneOpacity = 0.16,
  showChalkSmudge = true,
  seed = 5,
}) => {
  const uid = sanitizeSvgId(useId());
  const spotId = `tds-spot-${uid}`;
  const coneId = `tds-cone-${uid}`;
  return (
    <g>
      <defs>
        <radialGradient id={spotId} cx={spotCx} cy={spotCy} r={spotR}>
          <stop offset="0" stopColor={centerColor} />
          <stop offset="0.55" stopColor={midColor} />
          <stop offset="1" stopColor={outerColor} />
        </radialGradient>
        {showCone ? (
          <linearGradient id={coneId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F3EFE6" stopOpacity={coneOpacity} />
            <stop offset="1" stopColor="#F3EFE6" stopOpacity={0} />
          </linearGradient>
        ) : null}
      </defs>
      <rect x={0} y={0} width={THUMB_W} height={THUMB_H} fill={`url(#${spotId})`} />
      {showCone ? <path d={conePath} fill={`url(#${coneId})`} /> : null}
      <ThumbGrainLayer rgb={[0.95, 0.93, 0.88]} alpha={0.1} freq={0.75} seed={seed} />
      <ThumbGrainLayer rgb={[0.95, 0.93, 0.88]} alpha={0.12} freq={0.006} seed={seed + 3} octaves={3} bias={-0.05} />
      {showChalkSmudge ? (
        <g stroke="rgba(243, 239, 230, 0.07)" strokeWidth={34} strokeLinecap="round" fill="none">
          <path d="M 980 120 Q 1120 90 1240 140" />
        </g>
      ) : null}
    </g>
  );
};

export interface ThumbNewsprintBgProps {
  paperColor?: string;
  ruleColor?: string;
  showColumnRules?: boolean;
  seed?: number;
}

/** 経済紙・生成り紙面背景（ch2『経済の赤ペン』向け。紙繊維＋印刷ムラ＋段組み罫線） */
export const ThumbNewsprintBg: React.FC<ThumbNewsprintBgProps> = ({
  paperColor = '#EFECE3',
  ruleColor = 'rgba(20, 18, 16, 0.10)',
  showColumnRules = true,
  seed = 19,
}) => (
  <g>
    <rect x={0} y={0} width={THUMB_W} height={THUMB_H} fill={paperColor} />
    {showColumnRules ? (
      <g stroke={ruleColor} strokeWidth={2}>
        <line x1={480} y1={72} x2={480} y2={THUMB_H - 72} />
        <line x1={960} y1={72} x2={960} y2={THUMB_H - 72} />
        <line x1={1440} y1={72} x2={1440} y2={THUMB_H - 72} />
        <line x1={72} y1={96} x2={THUMB_W - 72} y2={96} strokeWidth={4} />
        <line x1={72} y1={108} x2={THUMB_W - 72} y2={108} strokeWidth={1.5} />
      </g>
    ) : null}
    <ThumbGrainLayer rgb={[0.38, 0.31, 0.22]} alpha={0.14} freq={0.88} seed={seed} />
    <ThumbGrainLayer rgb={[0.45, 0.37, 0.25]} alpha={0.18} freq={0.01} seed={seed + 4} octaves={3} bias={-0.04} />
  </g>
);

export interface ThumbVignetteOverlayProps {
  color?: string;
  opacity?: number;
  cx?: number;
  cy?: number;
  r?: number;
  startOffset?: number;
}

/** 最前面に重ねる四隅ビネット（紙の縁焼け・スポット集中感） */
export const ThumbVignetteOverlay: React.FC<ThumbVignetteOverlayProps> = ({
  color = '#000000',
  opacity = 0.28,
  cx = 0.5,
  cy = 0.45,
  r = 0.85,
  startOffset = 0.55,
}) => {
  const id = `tvig-${sanitizeSvgId(useId())}`;
  return (
    <>
      <defs>
        <radialGradient id={id} cx={cx} cy={cy} r={r}>
          <stop offset={startOffset} stopColor="#000000" stopOpacity={0} />
          <stop offset="1" stopColor={color} stopOpacity={opacity} />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={THUMB_W} height={THUMB_H} fill={`url(#${id})`} />
    </>
  );
};
