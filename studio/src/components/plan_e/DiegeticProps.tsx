import React from 'react';
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_ECON_SANS, FONT_ECON_SERIF } from './fonts';

const INK = '#16130F';
const RED = '#CC0000';
const GOLD = '#F59E0B';

function useSpringAt(
  atSec: number,
  config: { stiffness: number; damping: number; mass: number } = {
    stiffness: 420,
    damping: 22,
    mass: 0.6,
  },
): { active: boolean; sec: number; progress: number } {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  if (sec < atSec) {
    return { active: false, sec, progress: 0 };
  }
  const startFrame = Math.round(atSec * fps);
  const progress = spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config,
  });
  return { active: true, sec, progress };
}

export interface DiegeticStampProps {
  text: string;
  atSec: number;
  size?: number;
  rotateDeg?: number;
  color?: string;
  style?: React.CSSProperties;
}

/** 案E 物理赤判子（押印スプリング＋薄い紙地） */
export const DiegeticStamp: React.FC<DiegeticStampProps> = ({
  text,
  atSec,
  size = 56,
  rotateDeg = -9,
  color = RED,
  style,
}) => {
  const { active, progress } = useSpringAt(atSec, { stiffness: 520, damping: 18, mass: 0.55 });
  if (!active) return null;

  return (
    <div
      style={{
        position: 'absolute',
        border: `${Math.max(5, Math.round(size / 9))}px solid ${color}`,
        borderRadius: 8,
        padding: `${Math.round(size * 0.06)}px ${Math.round(size * 0.34)}px`,
        color,
        fontFamily: FONT_ECON_SERIF,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.15,
        letterSpacing: '0.1em',
        whiteSpace: 'nowrap',
        background: 'rgba(250,248,243,0.78)',
        boxShadow: `inset 0 0 0 2px ${color}55`,
        transform: `scale(${interpolate(progress, [0, 1], [2.3, 1]).toFixed(3)}) rotate(${rotateDeg}deg)`,
        opacity: interpolate(progress, [0, 0.2, 1], [0, 0.96, 0.92]),
        zIndex: 30,
        ...style,
      }}
    >
      {text}
    </div>
  );
};

export interface DiegeticHangTagProps {
  atSec: number;
  x: number;
  y: number;
  price: string;
  label?: string;
  scale?: number;
  stringLen?: number;
  swing?: boolean;
  glow?: number;
}

/** 案E 紐付き吊り下げ値札（物理落下＋減衰振り子スイング） */
export const DiegeticHangTag: React.FC<DiegeticHangTagProps> = ({
  atSec,
  x,
  y,
  price,
  label,
  scale = 1,
  stringLen = 110,
  swing = true,
  glow = 0,
}) => {
  const { active, sec, progress } = useSpringAt(atSec, { stiffness: 260, damping: 16, mass: 0.8 });
  if (!active) return null;

  const elapsed = Math.max(0, sec - atSec);
  const angle = swing
    ? 14 * Math.exp(-elapsed * 1.6) * Math.sin(elapsed * 6.2) + 1.2 * Math.sin(elapsed * 1.3)
    : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 0,
        height: 0,
        transform: `translateY(${interpolate(progress, [0, 1], [-420, 0]).toFixed(1)}px) scale(${scale})`,
        transformOrigin: '0 0',
        zIndex: 25,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -9,
          top: -9,
          width: 18,
          height: 18,
          borderRadius: 9,
          background: '#B8B2A6',
          boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `rotate(${angle.toFixed(2)}deg)`,
          transformOrigin: '0 0',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: -1.5,
            top: 0,
            width: 3,
            height: stringLen,
            background: '#D9D2C3',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: -190,
            top: stringLen,
            width: 380,
            padding: '46px 30px 30px',
            background: 'linear-gradient(180deg,#FBF8F1 0%,#EFE7D6 100%)',
            clipPath: 'polygon(28% 0%, 72% 0%, 100% 14%, 100% 100%, 0% 100%, 0% 14%)',
            textAlign: 'center',
            boxShadow: glow > 0 ? `0 0 ${40 * glow}px rgba(255,255,255,${0.8 * glow})` : undefined,
            filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.55))',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 16,
              width: 18,
              height: 18,
              marginLeft: -9,
              borderRadius: 9,
              background: '#3B342B',
            }}
          />
          {label ? (
            <div
              style={{
                fontFamily: FONT_ECON_SANS,
                fontWeight: 800,
                fontSize: 28,
                color: '#4A4238',
                letterSpacing: '0.2em',
                borderBottom: `2px solid ${INK}`,
                paddingBottom: 8,
                marginBottom: 10,
              }}
            >
              {label}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: FONT_ECON_SERIF,
              fontWeight: 900,
              fontSize: 60,
              color: INK,
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
            }}
          >
            {price}
          </div>
        </div>
      </div>
    </div>
  );
};

export interface DiegeticPhotoClipProps {
  atSec: number;
  x: number;
  y: number;
  width: number;
  height: number;
  src?: string;
  objectPosition?: string;
  filter?: string;
  caption?: string;
  captionSize?: number;
  rotateDeg?: number;
  highlight?: number;
  /** 1920px キャンバス端でキャプションや写真が見切れないよう自動クランプ（既定 true） */
  clampToSafeBounds?: boolean;
  safeMarginX?: number;
  children?: React.ReactNode;
}

/** 案E テープ留めポラロイド写真切抜き（画面端クランプによる見切れ防止内蔵） */
export const DiegeticPhotoClip: React.FC<DiegeticPhotoClipProps> = ({
  atSec,
  x,
  y,
  width,
  height,
  src,
  objectPosition = '50% 50%',
  filter,
  caption,
  captionSize = 34,
  rotateDeg = -1.5,
  highlight = 0,
  clampToSafeBounds = true,
  safeMarginX = 36,
  children,
}) => {
  const { active, progress } = useSpringAt(atSec, { stiffness: 320, damping: 22, mass: 0.7 });
  if (!active) return null;

  const frameW = width + 28;
  const rawLeft = x - frameW / 2;
  const clampedLeft = clampToSafeBounds
    ? Math.max(safeMarginX, Math.min(1920 - safeMarginX - frameW, rawLeft))
    : rawLeft;

  return (
    <div
      style={{
        position: 'absolute',
        left: clampedLeft,
        top: y,
        width: frameW,
        padding: '14px 14px 0',
        background: '#FFFFFF',
        boxShadow:
          highlight > 0
            ? `0 0 0 ${6 * highlight}px ${GOLD}, 0 22px 40px rgba(0,0,0,0.38)`
            : '0 18px 34px rgba(0,0,0,0.34)',
        opacity: interpolate(progress, [0, 0.25, 1], [0, 1, 1]),
        transform: `translateY(${interpolate(progress, [0, 1], [-46, 0]).toFixed(1)}px) scale(${(
          interpolate(progress, [0, 1], [1.08, 1]) +
          highlight * 0.04
        ).toFixed(3)}) rotate(${rotateDeg}deg)`,
        zIndex: 12 + Math.round(highlight * 5),
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: -16,
          width: 130,
          height: 34,
          marginLeft: -65,
          background: 'rgba(232,220,190,0.78)',
          transform: 'rotate(-3deg)',
        }}
      />
      <div
        style={{
          width,
          height,
          overflow: 'hidden',
          background: '#EFE9DD',
          position: 'relative',
        }}
      >
        {src ? (
          <Img
            src={src}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition, filter }}
          />
        ) : null}
        {children}
      </div>
      {caption ? (
        <div
          style={{
            fontFamily: FONT_ECON_SERIF,
            fontWeight: 900,
            fontSize: captionSize,
            color: INK,
            textAlign: 'center',
            padding: '12px 6px 16px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {caption}
        </div>
      ) : (
        <div style={{ height: 30 }} />
      )}
    </div>
  );
};

export interface MarkerWriteOnProps {
  id: string;
  progress: number;
  x: number;
  y: number;
  width: number;
  height: number;
  children: React.ReactNode;
}

/** SVG ホワイトボード・紙面向け：左→右のマーカー書き込み出現 */
export const MarkerWriteOn: React.FC<MarkerWriteOnProps> = ({
  id,
  progress,
  x,
  y,
  width,
  height,
  children,
}) =>
  progress <= 0 ? null : (
    <g>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={Math.max(0.1, width * Math.min(1, progress))} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </g>
  );

export interface MarkerEllipseProps {
  progress: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color?: string;
  strokeWidth?: number;
}

/** SVG ホワイトボード・紙面向け：手描き赤丸囲みアニメーション */
export const MarkerEllipse: React.FC<MarkerEllipseProps> = ({
  progress,
  cx,
  cy,
  rx,
  ry,
  color = RED,
  strokeWidth = 6,
}) =>
  progress <= 0 ? null : (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      pathLength={1}
      strokeDasharray="1"
      strokeDashoffset={1 - Math.min(1, progress)}
      strokeLinecap="round"
      transform={`rotate(-4 ${cx} ${cy})`}
    />
  );

function coinWedgePath(cx: number, cy: number, r: number, frac: number): string {
  if (frac <= 0) return '';
  const a = Math.min(0.9999, frac) * Math.PI * 2;
  const x = cx + r * Math.sin(a);
  const y = cy - r * Math.cos(a);
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}

export interface DiegeticCoinProps {
  atSec: number;
  cx: number;
  cy: number;
  r: number;
  frac: number;
  face?: string;
  label?: string;
  valueText?: string;
  fillColor?: string;
  fillDelaySec?: number;
  fillDurSec?: number;
}

/** 案E 硬貨配分プロップ（100円玉ウェッジ割合塗り） */
export const DiegeticCoin: React.FC<DiegeticCoinProps> = ({
  atSec,
  cx,
  cy,
  r,
  frac,
  face = '100',
  label,
  valueText,
  fillColor = RED,
  fillDelaySec = 0.25,
  fillDurSec = 0.85,
}) => {
  const { active, sec, progress } = useSpringAt(atSec, { stiffness: 360, damping: 20, mass: 0.65 });
  if (!active) return null;

  const fillFrac =
    frac *
    interpolate(sec, [atSec + fillDelaySec, atSec + fillDelaySec + fillDurSec], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  const labelOp = interpolate(sec, [atSec + fillDelaySec + fillDurSec * 0.65, atSec + fillDelaySec + fillDurSec + 0.15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const gradId = `diegetic-coin-${Math.round(cx)}-${Math.round(cy)}-${Math.round(r)}`;

  return (
    <g
      opacity={progress}
      transform={`translate(${cx} ${cy}) scale(${interpolate(progress, [0, 1], [0.7, 1]).toFixed(3)}) translate(${-cx} ${-cy})`}
    >
      <defs>
        <radialGradient id={gradId} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#F4F6F8" />
          <stop offset="60%" stopColor="#C2C8CF" />
          <stop offset="100%" stopColor="#8B939C" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy + 8} r={r} fill="rgba(0,0,0,0.18)" />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${gradId})`} stroke="#6B737C" strokeWidth={4} />
      <circle cx={cx} cy={cy} r={r * 0.86} fill="none" stroke="#9AA2AB" strokeWidth={2.5} strokeDasharray="3 6" />
      <text
        x={cx}
        y={cy + r * 0.2}
        textAnchor="middle"
        fontFamily={FONT_ECON_SERIF}
        fontWeight={900}
        fontSize={r * 0.62}
        fill="#4B535C"
      >
        {face}
      </text>
      {fillFrac > 0 ? <path d={coinWedgePath(cx, cy, r, fillFrac)} fill={fillColor} opacity={0.82} /> : null}
      {label ? (
        <text
          x={cx}
          y={cy + r + 42}
          textAnchor="middle"
          fontFamily={FONT_ECON_SANS}
          fontWeight={900}
          fontSize={Math.max(24, Math.round(r * 0.34))}
          fill="#334155"
        >
          {label}
        </text>
      ) : null}
      {valueText ? (
        <text
          x={cx}
          y={cy + r + (label ? 112 : 96)}
          textAnchor="middle"
          fontFamily={FONT_ECON_SERIF}
          fontWeight={900}
          fontSize={Math.max(44, Math.round(r * 0.44))}
          fill={fillColor}
          opacity={labelOp}
        >
          {valueText}
        </text>
      ) : null}
    </g>
  );
};

export interface DiegeticCounterProps {
  atSec: number;
  x: number;
  y: number;
  valueText: string;
  label?: string;
  color?: string;
  fontSize?: number;
}

/** 案E 数値カウンターラベル */
export const DiegeticCounter: React.FC<DiegeticCounterProps> = ({
  atSec,
  x,
  y,
  valueText,
  label,
  color = RED,
  fontSize = 52,
}) => {
  const { active, progress } = useSpringAt(atSec, { stiffness: 380, damping: 22, mass: 0.6 });
  if (!active) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${interpolate(progress, [0, 1], [0.82, 1]).toFixed(3)})`,
        opacity: progress,
        backgroundColor: 'rgba(251, 248, 241, 0.94)',
        border: `3px solid ${color}`,
        padding: '10px 24px',
        boxShadow: '0 12px 26px rgba(0,0,0,0.28)',
        textAlign: 'center',
        zIndex: 24,
      }}
    >
      {label ? (
        <div
          style={{
            fontFamily: FONT_ECON_SANS,
            fontWeight: 800,
            fontSize: Math.max(18, Math.round(fontSize * 0.42)),
            color: '#475569',
            marginBottom: 4,
          }}
        >
          {label}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: FONT_ECON_SERIF,
          fontWeight: 900,
          fontSize,
          color,
          whiteSpace: 'nowrap',
        }}
      >
        {valueText}
      </div>
    </div>
  );
};

export interface DiegeticXMarkProps {
  atSec: number;
  cx: number;
  cy: number;
  size?: number;
  color?: string;
  strokeWidth?: number;
  durationSec?: number;
}

/** 案E 手描き赤バツ印 */
export const DiegeticXMark: React.FC<DiegeticXMarkProps> = ({
  atSec,
  cx,
  cy,
  size = 120,
  color = RED,
  strokeWidth = 14,
  durationSec = 0.35,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  if (sec < atSec) return null;
  const p = interpolate(sec, [atSec, atSec + durationSec], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const half = size / 2;
  const x0 = cx - half;
  const y0 = cy - half;
  const p1 = Math.min(1, p * 2);
  const p2 = Math.max(0, (p - 0.5) * 2);

  return (
    <g stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <line x1={x0} y1={y0} x2={x0 + size * p1} y2={y0 + size * p1} />
      {p > 0.5 ? <line x1={x0 + size} y1={y0} x2={x0 + size - size * p2} y2={y0 + size * p2} /> : null}
    </g>
  );
};

export interface DiegeticMarkerTextProps {
  atSec: number;
  x: number;
  y: number;
  text: string;
  width?: number;
  fontSize?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  durationSec?: number;
}

/** 案E マーカー手書き風テキスト出現（SVG） */
export const DiegeticMarkerText: React.FC<DiegeticMarkerTextProps> = ({
  atSec,
  x,
  y,
  text,
  width = 520,
  fontSize = 44,
  color = INK,
  align = 'left',
  durationSec = 0.45,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  if (sec < atSec) return null;
  const p = interpolate(sec, [atSec, atSec + durationSec], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const clipX = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const id = `marker-txt-${Math.round(x)}-${Math.round(y)}-${Math.round(atSec * 100)}`;

  return (
    <MarkerWriteOn id={id} progress={p} x={clipX} y={y - fontSize} width={width} height={fontSize * 1.45}>
      <text x={x} y={y} textAnchor={anchor} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={fontSize} fill={color}>
        {text}
      </text>
    </MarkerWriteOn>
  );
};
