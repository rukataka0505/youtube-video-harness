import React from 'react';
import { interpolate } from 'remotion';
import {
  InkFxFilterDefs,
  InkFxLayer,
  type InkFxFilterDefsProps,
  type InkFxLayerProps,
} from '../_materials';
import { snapAt } from './beatUtils';
import { FONT_HAND, FONT_MARU } from './fonts';
import { EO, ramp, ring, rr } from './motionMath';

/* ========================================================================== */
/* 純粋汎用エフェクト・スタンプ・文字（stickman-collage v2.1）                  */
/*  ※具体的な小道具は一切含めず、汎用演出プリミティブのみを提供する。            */
/* ========================================================================== */

export { InkFxFilterDefs, InkFxLayer };
export type { InkFxFilterDefsProps, InkFxLayerProps };

export interface BurstProps {
  sec: number;
  at: number;
  x: number;
  y: number;
  r: number;
  color: string;
  n?: number;
  dur?: number;
  strokeWidth?: number;
}

/** 放射状のキラ（at から dur 秒間） */
export const Burst: React.FC<BurstProps> = ({
  sec,
  at,
  x,
  y,
  r,
  color,
  n = 8,
  dur = 0.7,
  strokeWidth = 6,
}) => {
  if (sec < at || sec > at + dur + 0.1) {
    return null;
  }
  const u = ramp(sec, at, at + dur);
  const e = EO(u);
  return (
    <g opacity={1 - u}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.3;
        const r0 = r * (0.45 + 0.55 * e);
        const r1 = r0 + r * 0.32 * (1 - u * 0.6);
        return (
          <path
            key={i}
            d={`M ${x + Math.cos(a) * r0} ${y + Math.sin(a) * r0} L ${x + Math.cos(a) * r1} ${y + Math.sin(a) * r1}`}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
};

export interface PuffProps {
  sec: number;
  at: number;
  x: number;
  y: number;
  color: string;
  spread?: number;
  dur?: number;
  strokeWidth?: number;
}

/** 足元の土ぼこり（at から dur 秒間） */
export const Puff: React.FC<PuffProps> = ({
  sec,
  at,
  x,
  y,
  color,
  spread = 120,
  dur = 0.9,
  strokeWidth = 3.5,
}) => {
  if (sec < at || sec > at + dur + 0.1) {
    return null;
  }
  const u = ramp(sec, at, at + dur);
  const e = EO(u);
  return (
    <g opacity={0.55 * (1 - u)}>
      {[-1, -0.55, -0.15, 0.2, 0.6, 1].map((k, i) => (
        <path
          key={i}
          d={ring(
            x + k * spread * e,
            y - 10 - Math.abs(k) * 12 * e,
            10 + 16 * e * (1 - Math.abs(k) * 0.3),
            i + 2,
          )}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
        />
      ))}
    </g>
  );
};

export interface SvgStampProps {
  sec: number;
  at: number;
  x: number;
  y: number;
  text: string;
  color: string;
  rot?: number;
  size?: number;
  fps?: number;
  font?: string;
}

/** SVG スタンプ（叩きつけ＋インク二重手描き枠）。非ボイル層で可読性優先 */
export const SvgStamp: React.FC<SvgStampProps> = ({
  sec,
  at,
  x,
  y,
  text,
  color,
  rot = -8,
  size = 60,
  fps = 30,
  font = FONT_MARU,
}) => {
  if (sec < at) {
    return null;
  }
  const sp = snapAt(sec, at, fps, 620, 20, 0.7);
  const sc = interpolate(sp, [0, 1], [2.4, 1]);
  const op = interpolate(sp, [0, 0.25], [0, 0.94], { extrapolateRight: 'clamp' });
  const w = text.length * size * 1.04 + size * 0.95;
  const h = size * 1.6;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot + (1 - sp) * 10}) scale(${sc})`} opacity={op}>
      <path
        d={rr(-w / 2, -h / 2, w, h, 3, 9)}
        fill="rgba(255,255,255,0.06)"
        stroke={color}
        strokeWidth={size * 0.09}
        strokeLinejoin="round"
      />
      <path
        d={rr(
          -w / 2 + size * 0.16,
          -h / 2 + size * 0.16,
          w - size * 0.32,
          h - size * 0.32,
          2,
          11,
        )}
        fill="none"
        stroke={color}
        strokeWidth={size * 0.035}
      />
      <text
        x={0}
        y={size * 0.36}
        textAnchor="middle"
        fontFamily={font}
        fontWeight={900}
        fontSize={size}
        fill={color}
        letterSpacing={2}
      >
        {text}
      </text>
    </g>
  );
};

export interface HandTextProps {
  x: number;
  y: number;
  text: string;
  size: number;
  fill: string;
  edge?: string;
  edgeWidth?: number;
  anchor?: 'start' | 'middle' | 'end';
  rot?: number;
  opacity?: number;
  font?: string;
  weight?: number;
  letterSpacing?: string | number;
}

/**
 * 縁取り付き非ボイル手書き SVG 文字。
 * 可読性のため Stage の非ボイル層（crisp）へ配置する。
 */
export const HandText: React.FC<HandTextProps> = ({
  x,
  y,
  text,
  size,
  fill,
  edge,
  edgeWidth,
  anchor = 'middle',
  rot = 0,
  opacity = 1,
  font = FONT_HAND,
  weight = 700,
  letterSpacing,
}) => (
  <text
    x={x}
    y={y}
    textAnchor={anchor}
    fontFamily={font}
    fontWeight={weight}
    fontSize={size}
    fill={fill}
    stroke={edge}
    strokeWidth={edge ? edgeWidth ?? size * 0.14 : 0}
    paintOrder="stroke"
    strokeLinejoin="round"
    opacity={opacity}
    letterSpacing={letterSpacing}
    transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}
  >
    {text}
  </text>
);
