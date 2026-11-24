import React from 'react';

/**
 * 「経済の赤ペン」ブランド共通の墨・朱・紙と SVG フィルタ。
 * アイコン（1024 正方）とアイキャッチ（1920x1080）の両方から使う。
 */
export const AKAPEN = {
  red: '#D3172A',
  redDeep: '#A80E1D',
  redHi: '#F0414F',
  ink: '#141210',
  desk: '#17130F',
  deskDeep: '#0A0807',
  newsprint: '#E7E3D9',
  newsprintShade: '#CFC9BC',
  page: '#F6F4EF',
  white: '#F5F2EC',
} as const;

export type AkapenFilterIds = { marker: string; stamp: string; grain: string; blur: string };

export const akapenFilterIds = (prefix: string): AkapenFilterIds => ({
  marker: `${prefix}-marker`,
  stamp: `${prefix}-stamp`,
  grain: `${prefix}-grain`,
  blur: `${prefix}-blur`,
});

/** マーカーの滲み縁・判子のかすれ・紙の粒子（seed 固定で毎フレーム同一） */
export const AkapenFilterDefs: React.FC<{ prefix: string; markerRough?: number; stampSeed?: number }> = ({
  prefix,
  markerRough = 5,
  stampSeed = 4,
}) => {
  const id = akapenFilterIds(prefix);
  return (
    <defs>
      <filter id={id.marker} x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves={2} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={markerRough} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id={id.stamp} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.018 0.026" numOctaves={4} seed={stampSeed} result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -4.2 0 0 0 3.3" result="a" />
        <feComposite in="SourceGraphic" in2="a" operator="in" result="ink" />
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={stampSeed + 3} result="d" />
        <feDisplacementMap in="ink" in2="d" scale={6} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id={id.grain} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={11} result="g" />
        <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.32" />
      </filter>
      <filter id={id.blur}>
        <feGaussianBlur stdDeviation="14" />
      </filter>
    </defs>
  );
};

/**
 * 赤いマーカーペン本体。ペン先が原点 (0,0)、軸は +x 方向へ伸びる。
 * 置くときは `<g transform="translate(tipX tipY) rotate(deg)">` で包む。
 */
export const RedPenGlyph: React.FC<{ length?: number; thick?: number; shadow?: boolean }> = ({
  length = 760,
  thick = 120,
  shadow = true,
}) => {
  const h = thick;
  const nib = h * 0.42;
  const cone = h * 0.95;
  const bodyX = nib + cone;
  const bodyLen = length - bodyX;
  const r = h / 2;
  return (
    <g>
      {shadow ? (
        <g transform={`translate(${h * 0.28} ${h * 0.5})`} opacity={0.42}>
          <path
            d={`M 0 0 L ${bodyX} ${-r} L ${length - r} ${-r} A ${r} ${r} 0 0 1 ${length - r} ${r} L ${bodyX} ${r} Z`}
            fill="#000"
          />
        </g>
      ) : null}
      {/* フェルトの穂先 */}
      <path d={`M 0 0 L ${nib} ${-h * 0.17} L ${nib} ${h * 0.17} Z`} fill={AKAPEN.redDeep} />
      {/* 樹脂の円錐 */}
      <path
        d={`M ${nib} ${-h * 0.17} L ${bodyX} ${-r * 0.78} L ${bodyX} ${r * 0.78} L ${nib} ${h * 0.17} Z`}
        fill="#E9E4DA"
      />
      <path d={`M ${nib} ${h * 0.05} L ${bodyX} ${r * 0.3} L ${bodyX} ${r * 0.78} L ${nib} ${h * 0.17} Z`} fill="#BDB5A7" />
      {/* 軸 */}
      <path
        d={`M ${bodyX} ${-r} L ${length - r} ${-r} A ${r} ${r} 0 0 1 ${length - r} ${r} L ${bodyX} ${r} Z`}
        fill={AKAPEN.red}
      />
      <rect x={bodyX} y={-r * 0.82} width={bodyLen - r * 0.6} height={h * 0.16} fill={AKAPEN.redHi} opacity={0.55} />
      <rect x={bodyX} y={r * 0.5} width={bodyLen - r} height={h * 0.22} fill={AKAPEN.redDeep} opacity={0.55} />
      {/* 口金と尻 */}
      <rect x={bodyX} y={-r} width={h * 0.32} height={h} fill={AKAPEN.redDeep} />
      <rect x={length - h * 0.62} y={-r} width={h * 0.1} height={h} fill={AKAPEN.redDeep} opacity={0.8} />
    </g>
  );
};

/** 手描きのムラ楕円（1.12 周、終点が始点を越えて重なる）。viewBox 座標 */
export function akapenLoopPath(cx: number, cy: number, rx: number, ry: number, rotDeg = -8, seed = 3): string {
  const steps = 48;
  const start = -2.2;
  const span = Math.PI * 2 * 1.12;
  const rot = (rotDeg * Math.PI) / 180;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + (span * i) / steps;
    const n = Math.sin(seed * 12.9898 + i * 0.731) * 43758.5453;
    const j = 1 + ((n - Math.floor(n)) - 0.5) * 0.035 + (i / steps) * 0.06;
    const x = Math.cos(a) * rx * j;
    const y = Math.sin(a) * ry * j;
    pts.push(`${(cx + x * Math.cos(rot) - y * Math.sin(rot)).toFixed(1)} ${(cy + x * Math.sin(rot) + y * Math.cos(rot)).toFixed(1)}`);
  }
  return `M ${pts.join(' L ')}`;
}
