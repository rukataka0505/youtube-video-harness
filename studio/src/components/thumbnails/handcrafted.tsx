import React, { useId } from 'react';
import { f2, handLine, hashRnd, rr, sanitizeSvgId, tornRect } from '../_materials/paths';
import { FONT_SANS } from '../common/fonts';
import { akapenLoopPath } from '../plan_e/brand/akapenInk';

/* ========================================================================== */
/* サムネイル共通部品パレット：手描き・コラージュ・タイポ部品                     */
/*  方眼紙・ちぎり紙・マステ・赤ペン下線/丸・ハッチング・手描き矢印・縁取り文字   */
/* ========================================================================== */

export interface ThumbInkTextProps {
  x: number;
  y: number;
  size: number;
  fill: string;
  children: React.ReactNode;
  stroke?: string;
  strokeW?: number;
  weight?: number;
  family?: string;
  anchor?: 'start' | 'middle' | 'end';
  rotate?: number;
  spacing?: number;
  opacity?: number;
}

/** 縁取り付きの極太サムネタイポ（paint-order="stroke" で外側に線を回す） */
export const ThumbInkText: React.FC<ThumbInkTextProps> = ({
  x,
  y,
  size,
  fill,
  children,
  stroke,
  strokeW = 0,
  weight = 900,
  family = FONT_SANS,
  anchor = 'start',
  rotate = 0,
  spacing = 0,
  opacity = 1,
}) => (
  <text
    x={x}
    y={y}
    fontSize={size}
    fontFamily={family}
    fontWeight={weight}
    fill={fill}
    stroke={stroke}
    strokeWidth={stroke ? strokeW : undefined}
    strokeLinejoin="round"
    paintOrder="stroke"
    textAnchor={anchor}
    letterSpacing={spacing}
    opacity={opacity}
    transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
  >
    {children}
  </text>
);

export interface ThumbTornPaperProps {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  rotate?: number;
  pivotX?: number;
  pivotY?: number;
  seed?: number;
  roughness?: number;
  shadowOffset?: [number, number] | null;
  shadowOpacity?: number;
  children?: React.ReactNode;
}

/** ちぎり紙座布団（コピー帯・新聞切り抜き片の土台） */
export const ThumbTornPaper: React.FC<ThumbTornPaperProps> = ({
  x,
  y,
  w,
  h,
  fill = '#FFFFFF',
  stroke = '#171513',
  strokeWidth = 2,
  strokeOpacity = 0.18,
  rotate = 0,
  pivotX,
  pivotY,
  seed = 17,
  roughness = 10,
  shadowOffset = null,
  shadowOpacity = 0.18,
  children,
}) => {
  const px = pivotX ?? x + w / 2;
  const py = pivotY ?? y + h / 2;
  const d = tornRect(x, y, w, h, seed, roughness);
  return (
    <g transform={rotate ? `rotate(${rotate} ${f2(px)} ${f2(py)})` : undefined}>
      {shadowOffset ? (
        <path
          d={d}
          transform={`translate(${f2(shadowOffset[0])} ${f2(shadowOffset[1])})`}
          fill="#000000"
          opacity={shadowOpacity}
        />
      ) : null}
      <path d={d} fill={fill} />
      {stroke && strokeWidth > 0 ? (
        <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} opacity={strokeOpacity} />
      ) : null}
      {children}
    </g>
  );
};

export interface ThumbMaskingTapeProps {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  fill?: string;
  seed?: number;
}

/** マスキングテープ片（ちぎり紙・写真の仮留め感） */
export const ThumbMaskingTape: React.FC<ThumbMaskingTapeProps> = ({
  x,
  y,
  w,
  h,
  rot = -14,
  fill = 'rgba(255, 246, 214, 0.78)',
  seed = 31,
}) => (
  <g transform={`translate(${f2(x)} ${f2(y)}) rotate(${f2(rot)})`}>
    <path d={tornRect(-w / 2, -h / 2, w, h, seed, 5)} fill={fill} />
  </g>
);

export interface ThumbHatchFillProps {
  x: number;
  y: number;
  w: number;
  h: number;
  gap: number;
  color: string;
  sw: number;
  seed: number;
}

/** 手描きのハッチング（矩形内の斜線塗り） */
export const ThumbHatchFill: React.FC<ThumbHatchFillProps> = ({
  x,
  y,
  w,
  h,
  gap,
  color,
  sw,
  seed,
}) => {
  const id = `tht-${sanitizeSvgId(useId())}`;
  const lines: string[] = [];
  for (let k = -h; k < w; k += gap) {
    const j = (hashRnd(seed + k) - 0.5) * gap * 0.35;
    lines.push(handLine(x + k + j, y + h, x + k + h + j, y, 3, seed + k));
  }
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`} stroke={color} strokeWidth={sw} strokeLinecap="round" fill="none">
        {lines.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </g>
  );
};

export interface ThumbRedPenUnderlineProps {
  x1: number;
  x2: number;
  y: number;
  color?: string;
  thickness?: number;
  /** 二重下線にするか（既定 true） */
  double?: boolean;
  /** 筆運びのたわみ量（負で上へ弓なり） */
  arch?: number;
  filter?: string;
}

/** 手描き赤ペン下線（強弱ある二重線） */
export const ThumbRedPenUnderline: React.FC<ThumbRedPenUnderlineProps> = ({
  x1,
  x2,
  y,
  color = '#E1261C',
  thickness = 14,
  double = true,
  arch = -18,
  filter,
}) => {
  const mx = (x1 + x2) / 2;
  const subX1 = x1 + (x2 - x1) * 0.09;
  const subX2 = x2 - (x2 - x1) * 0.08;
  const subY = y + thickness * 2.2;
  return (
    <g fill="none" stroke={color} strokeLinecap="round" filter={filter}>
      <path d={`M ${f2(x1)} ${f2(y)} Q ${f2(mx)} ${f2(y + arch)} ${f2(x2)} ${f2(y + 6)}`} strokeWidth={thickness} />
      {double ? (
        <path
          d={`M ${f2(subX1)} ${f2(subY)} Q ${f2(mx)} ${f2(subY + arch * 0.75)} ${f2(subX2)} ${f2(subY + 2)}`}
          strokeWidth={Math.max(4, thickness * 0.5)}
          opacity={0.82}
        />
      ) : null}
    </g>
  );
};

export interface ThumbRedPenCircleProps {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color?: string;
  strokeWidth?: number;
  rotate?: number;
  seed?: number;
  opacity?: number;
  filter?: string;
}

/** 手描き赤ペン丸囲み（1.12周のオーバーラップ楕円。ch1/ch2共通で数字・実力・見出しを強調） */
export const ThumbRedPenCircle: React.FC<ThumbRedPenCircleProps> = ({
  cx,
  cy,
  rx,
  ry,
  color = '#D3172A',
  strokeWidth = 10,
  rotate = -7,
  seed = 3,
  opacity = 0.92,
  filter,
}) => (
  <path
    d={akapenLoopPath(cx, cy, rx, ry, rotate, seed)}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    opacity={opacity}
    filter={filter}
  />
);

export interface ThumbHandArrowProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  strokeWidth?: number;
  headSize?: number;
  wobble?: number;
  seed?: number;
  opacity?: number;
}

/** 手描き鉛筆・チョーク矢印（書き込み注釈用） */
export const ThumbHandArrow: React.FC<ThumbHandArrowProps> = ({
  x1,
  y1,
  x2,
  y2,
  color = 'rgba(30, 40, 36, 0.48)',
  strokeWidth = 3.5,
  headSize = 22,
  wobble = 5,
  seed = 2,
  opacity = 1,
}) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = 0.46;
  const hx1 = x2 - Math.cos(angle - spread) * headSize;
  const hy1 = y2 - Math.sin(angle - spread) * headSize;
  const hx2 = x2 - Math.cos(angle + spread) * headSize;
  const hy2 = y2 - Math.sin(angle + spread) * headSize;
  return (
    <g fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={opacity}>
      <path d={handLine(x1, y1, x2, y2, wobble, seed)} />
      <path d={`M ${f2(hx1)} ${f2(hy1)} L ${f2(x2)} ${f2(y2)} L ${f2(hx2)} ${f2(hy2)}`} />
    </g>
  );
};

export interface ThumbSparkLinesProps {
  rays: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number }>;
  color?: string;
  strokeWidth?: number;
  seed?: number;
}

/** 強調・ドヤの放射ピカ線 */
export const ThumbSparkLines: React.FC<ThumbSparkLinesProps> = ({
  rays,
  color = '#171513',
  strokeWidth = 6,
  seed = 4,
}) => (
  <g stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none">
    {rays.map((ray, i) => (
      <path key={i} d={handLine(ray.x1, ray.y1, ray.x2, ray.y2, 2, seed + i)} />
    ))}
  </g>
);

export interface ThumbStampBadgeProps {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color?: string;
  bg?: string;
  rotate?: number;
  fontSize?: number;
  seed?: number;
  filter?: string;
}

/** 赤ペン風刺スタンプ／検印バッジ（ch2『経済の赤ペン』・ch1 共用） */
export const ThumbStampBadge: React.FC<ThumbStampBadgeProps> = ({
  x,
  y,
  w,
  h,
  label,
  color = '#D3172A',
  bg = 'rgba(20, 18, 16, 0.88)',
  rotate = -7,
  fontSize = 46,
  seed = 9,
  filter,
}) => (
  <g transform={`translate(${f2(x)} ${f2(y)}) rotate(${f2(rotate)})`} filter={filter}>
    <path d={rr(-w / 2, -h / 2, w, h, 3, seed)} fill={bg} stroke={color} strokeWidth={7} strokeLinejoin="round" />
    <path
      d={rr(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 2, seed + 3)}
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      opacity={0.7}
    />
    <ThumbInkText x={0} y={fontSize * 0.36} size={fontSize} fill={color} anchor="middle" spacing={4}>
      {label}
    </ThumbInkText>
  </g>
);
