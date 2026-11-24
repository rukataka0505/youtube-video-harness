import React, { useId } from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { beatProgress, clampLerp, resolveStickmanMediaSrc, snapAt } from './beatUtils';
import { FONT_HAND } from './fonts';
import { resolvePolarityTheme, type StagePolarity } from './types';

/**
 * 7.5fps の決定論的ボイルシード（30fps 環境では 4 フレームごとに 1 更新）。
 */
export const useBoilSeed = (boilFps = 7.5, mod = 16): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stepFrames = Math.max(1, Math.round(fps / Math.max(1, boilFps)));
  return (Math.floor(frame / stepFrames) % Math.max(1, mod)) + 1;
};

export interface BoilSvgProps {
  width: number;
  height: number;
  viewBox?: string;
  scale?: number;
  baseFrequency?: number;
  boilFps?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * 7.5fps feTurbulence / feDisplacementMap ボイル揺らぎ付き手描き SVG キャンバス。
 */
export const BoilSvg: React.FC<BoilSvgProps> = ({
  width,
  height,
  viewBox,
  scale = 3.0,
  baseFrequency = 0.03,
  boilFps = 7.5,
  style,
  children,
}) => {
  const seed = useBoilSeed(boilFps, 16);
  const rawId = useId();
  const filterId = `sc-boil-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={viewBox ?? `0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ overflow: 'visible', ...style }}
    >
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={baseFrequency}
            numOctaves={2}
            seed={seed}
            result="noise"
          />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={scale} />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>{children}</g>
    </svg>
  );
};

export interface DrawPathProps {
  d: string;
  sec: number;
  at: number;
  dur?: number;
  stroke: string;
  width: number;
  fill?: string;
  dash?: string;
}

/**
 * pathLength=1 + strokeDashoffset による「手書きで描かれていく過程」アニメーション。
 * カレンダー・矢印・囲み枠・グラフ軸線など「描く過程」で見せたい要素に使う。
 */
export const DrawPath: React.FC<DrawPathProps> = ({
  d,
  sec,
  at,
  dur = 0.45,
  stroke,
  width,
  fill = 'none',
  dash,
}) => {
  if (sec < at) {
    return null;
  }
  const p = beatProgress(sec, at, at + dur, true);

  if (dash) {
    return (
      <path
        d={d}
        fill={fill}
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dash}
        opacity={Math.min(1, p * 1.35)}
      />
    );
  }

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
    />
  );
};

export interface ScalePopProps {
  triggerSec: number;
  sec?: number;
  fromScale?: number;
  rotateFromDeg?: number;
  rotateToDeg?: number;
  translateYFrom?: number;
  stiffness?: number;
  damping?: number;
  mass?: number;
  transformOrigin?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * スナップ感のあるバネ出現ラッパー。triggerSec 未満では描画しない。
 */
export const ScalePop: React.FC<ScalePopProps> = ({
  triggerSec,
  sec,
  fromScale = 0.48,
  rotateFromDeg = 0,
  rotateToDeg = 0,
  translateYFrom = 14,
  stiffness = 440,
  damping = 20,
  mass = 0.62,
  transformOrigin = 'center center',
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = sec ?? frame / Math.max(1, fps);

  if (currentSec < triggerSec) {
    return null;
  }

  const localFrame = Math.max(0, (currentSec - triggerSec) * fps);
  const sp = spring({
    frame: localFrame,
    fps,
    config: { stiffness, damping, mass },
  });

  const opacity = interpolate(sp, [0, 0.35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(sp, [0, 1], [fromScale, 1]);
  const rotate = interpolate(sp, [0, 1], [rotateFromDeg, rotateToDeg]);
  const translateY = interpolate(sp, [0, 1], [translateYFrom, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px) rotate(${rotate}deg) scale(${scale})`,
        transformOrigin,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export interface PolarityTransitionFlashProps {
  prevPolarity: StagePolarity | undefined;
  currentPolarity: StagePolarity;
  segmentStartFrame: number;
  transitionFrames?: number;
}

/**
 * 背景極性が切り替わった瞬間だけ、前極性の背景色を3フレームで抜いて切れ味を作る。
 */
export const PolarityTransitionFlash: React.FC<PolarityTransitionFlashProps> = ({
  prevPolarity,
  currentPolarity,
  segmentStartFrame,
  transitionFrames = 3,
}) => {
  const frame = useCurrentFrame();
  if (!prevPolarity || prevPolarity === currentPolarity) {
    return null;
  }
  const sinceFlip = frame - segmentStartFrame;
  if (sinceFlip < 0 || sinceFlip >= transitionFrames) {
    return null;
  }
  const prevBg = resolvePolarityTheme(prevPolarity).bg;
  const opacity = interpolate(sinceFlip, [0, transitionFrames], [0.55, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: prevBg,
        opacity,
        pointerEvents: 'none',
        zIndex: 35,
      }}
    />
  );
};

export type StaggeredItemShape = 'paper_sheet' | 'book' | 'person' | 'coin' | 'dot';

export interface StaggeredItemGridProps {
  count: number;
  itemShape?: StaggeredItemShape;
  highlightCount?: number;
  columns?: number;
  sec: number;
  startSec: number;
  spanSec?: number;
  polarity?: StagePolarity;
  highlightColor?: string;
  width?: number;
  height?: number;
  boil?: boolean;
  style?: React.CSSProperties;
}

/**
 * 数量の実体連打コンポーネント（例：94枚論文シートの高速スタガード配置）。
 * すべて有機的ベジェパスで描画し、単調な数字だけの表現を防ぐ。
 */
export const StaggeredItemGrid: React.FC<StaggeredItemGridProps> = ({
  count,
  itemShape = 'paper_sheet',
  highlightCount = 0,
  columns,
  sec,
  startSec,
  spanSec = 2.0,
  polarity = 'cream_notebook',
  highlightColor,
  width = 960,
  height = 460,
  boil = false,
  style,
}) => {
  const theme = resolvePolarityTheme(polarity);
  const seed = useBoilSeed(7.5, 14);
  const rawId = useId();
  const filterId = `sc-grid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const safeCount = Math.max(1, Math.min(120, Math.round(count)));
  const cols = Math.max(1, columns ?? (safeCount > 40 ? 16 : safeCount > 16 ? 10 : Math.min(safeCount, 8)));
  const rows = Math.max(1, Math.ceil(safeCount / cols));
  const cell = Math.min(width / cols, height / rows);
  const svgW = cols * cell;
  const svgH = rows * cell + 8;
  const itemScale = cell / 64;
  const safeSpan = Math.max(0.25, spanSec);
  const hlColor = highlightColor ?? theme.accentPrimary;
  const strokeInk = theme.isLight ? '#111111' : '#FFFFFF';
  const baseFill = theme.isLight ? '#FFFFFF' : '#1E1D1B';
  const mutedLine = theme.isLight ? '#78716C' : '#A8A29E';

  const renderShape = (isHighlighted: boolean) => {
    const fill = isHighlighted ? hlColor : baseFill;
    const detailInk = isHighlighted ? '#111111' : mutedLine;

    if (itemShape === 'book') {
      return (
        <>
          <path
            d="M -18 -22 C -6 -24, 8 -23, 18 -21 C 19 -6, 19 8, 18 22 C 6 24, -6 23, -18 21 C -19 6, -19 -8, -18 -22 Z"
            fill={isHighlighted ? hlColor : '#3F3B36'}
            stroke={strokeInk}
            strokeWidth={3.6}
          />
          <path d="M -12 -22 L -12 22" stroke={strokeInk} strokeWidth={3} />
          <path d="M -5 -10 C 2 -11, 8 -11, 13 -10" stroke="#FDE68A" strokeWidth={3.2} strokeLinecap="round" />
        </>
      );
    }

    if (itemShape === 'person') {
      return (
        <>
          <path
            d="M 0 -24 C 9 -24, 13 -17, 12 -10 C 11 -3, 6 1, 0 1 C -7 1, -12 -4, -12 -11 C -12 -18, -7 -24, 0 -24 Z"
            fill={fill}
            stroke={strokeInk}
            strokeWidth={3.8}
          />
          <path
            d="M -17 24 C -16 6, -9 2, 0 2 C 9 2, 16 6, 17 24 Z"
            fill={fill}
            stroke={strokeInk}
            strokeWidth={3.8}
            strokeLinejoin="round"
          />
        </>
      );
    }

    if (itemShape === 'coin') {
      return (
        <>
          <path
            d="M 0 -22 C 13 -22, 22 -12, 21 0 C 20 13, 11 22, 0 21 C -12 21, -22 12, -21 0 C -21 -12, -12 -22, 0 -22 Z"
            fill={isHighlighted ? hlColor : '#FACC15'}
            stroke={strokeInk}
            strokeWidth={3.8}
          />
          <path d="M 0 -10 L 0 10 M -7 -4 L 7 -4 M -7 3 L 7 3" stroke="#111111" strokeWidth={2.8} strokeLinecap="round" />
        </>
      );
    }

    if (itemShape === 'dot') {
      return (
        <path
          d="M 0 -18 C 11 -18, 19 -10, 18 0 C 18 11, 10 19, 0 18 C -11 18, -19 10, -18 0 C -18 -11, -10 -18, 0 -18 Z"
          fill={fill}
          stroke={strokeInk}
          strokeWidth={3.6}
        />
      );
    }

    // default: 'paper_sheet'
    return (
      <>
        <path
          d="M -19 -24 C -6 -25, 9 -25, 19 -23 C 20 -7, 20 9, 19 24 C 6 25, -7 25, -19 23 C -20 7, -20 -9, -19 -24 Z"
          fill={fill}
          stroke={strokeInk}
          strokeWidth={3.6}
        />
        <path d="M -10 -11 C -2 -12, 5 -12, 11 -11" stroke={detailInk} strokeWidth={2.8} fill="none" strokeLinecap="round" />
        <path d="M -10 -1 C -2 -2, 5 -2, 11 -1" stroke={detailInk} strokeWidth={2.8} fill="none" strokeLinecap="round" />
        <path d="M -10 9 C -4 8, 2 8, 6 9" stroke={detailInk} strokeWidth={2.8} fill="none" strokeLinecap="round" />
      </>
    );
  };

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      aria-hidden="true"
      style={{ overflow: 'visible', ...style }}
    >
      {boil ? (
        <defs>
          <filter id={filterId} x="-12%" y="-12%" width="124%" height="124%">
            <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves={2} seed={seed} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={2.0} />
          </filter>
        </defs>
      ) : null}
      <g filter={boil ? `url(#${filterId})` : undefined}>
        {Array.from({ length: safeCount }).map((_, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const t = startSec + (safeSpan * i) / safeCount;
          if (sec < t) {
            return null;
          }
          const s = beatProgress(sec, t, t + 0.14, true);
          const rot = ((i * 37) % 11) - 5;
          const cx = c * cell + cell / 2;
          const cy = r * cell + cell / 2 + 4;
          const isHl = i < highlightCount;
          return (
            <g key={i} transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s * itemScale})`}>
              {renderShape(isHl)}
            </g>
          );
        })}
      </g>
    </svg>
  );
};

/* -------------------------------------------------------------------------- */
/* 作品TSXシーン向け 表現プリミティブ（Place / Pop / Window / Scribble 等）     */
/* -------------------------------------------------------------------------- */

export interface PlaceProps {
  x: number;
  y: number;
  w?: number | string;
  h?: number | string;
  z?: number;
  rot?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * 絶対座標配置ラッパー（作品TSXシーン内の自由レイアウト用）。
 */
export const Place: React.FC<PlaceProps> = ({
  x,
  y,
  w,
  h,
  z,
  rot = 0,
  style,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      height: h,
      zIndex: z,
      transform: rot ? `rotate(${rot}deg)` : undefined,
      ...style,
    }}
  >
    {children}
  </div>
);

export interface PopProps {
  x: number;
  y: number;
  w?: number | string;
  h?: number | string;
  z?: number;
  sec: number;
  at: number;
  rot?: number;
  from?: number;
  origin?: string;
  translateYFrom?: number;
  stiffness?: number;
  damping?: number;
  mass?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * 絶対座標＋バネ出現（Place × ScalePop）統合ラッパー。
 * 回転は ScalePop 側のみへ渡し二重回転を防ぐ。
 */
export const Pop: React.FC<PopProps> = ({
  x,
  y,
  w,
  h,
  z,
  sec,
  at,
  rot = 0,
  from = 0.48,
  origin = 'center center',
  translateYFrom = 14,
  stiffness = 440,
  damping = 20,
  mass = 0.62,
  style,
  children,
}) => (
  <Place x={x} y={y} w={w} h={h} z={z} style={style}>
    <ScalePop
      sec={sec}
      triggerSec={at}
      fromScale={from}
      rotateFromDeg={rot - 5}
      rotateToDeg={rot}
      translateYFrom={translateYFrom}
      stiffness={stiffness}
      damping={damping}
      mass={mass}
      transformOrigin={origin}
    >
      {children}
    </ScalePop>
  </Place>
);

export interface WindowProps {
  sec: number;
  from: number;
  to?: number;
  children: React.ReactNode;
}

/**
 * ショット内で区間 [from, to) の間だけ描画する場面転換ラッパー。
 */
export const Window: React.FC<WindowProps> = ({
  sec,
  from,
  to = Number.POSITIVE_INFINITY,
  children,
}) => (sec >= from && sec < to ? <>{children}</> : null);

export interface ScribbleProps {
  text: string;
  size?: number;
  polarity?: StagePolarity;
  color?: string;
  rot?: number;
  font?: string;
  weight?: number;
  outline?: string | boolean;
  align?: 'left' | 'center' | 'right';
  style?: React.CSSProperties;
}

/**
 * 極性自動対応の手描き文字（帯なし・Yomogi ベース）。
 */
export const Scribble: React.FC<ScribbleProps> = ({
  text,
  size = 48,
  polarity = 'black',
  color,
  rot = 0,
  font = FONT_HAND,
  weight = 700,
  outline,
  align,
  style,
}) => {
  const theme = resolvePolarityTheme(polarity);
  const resolvedColor = color ?? theme.ink;
  const outlineColor =
    typeof outline === 'string'
      ? outline
      : outline === true
        ? theme.outlineColor
        : undefined;

  return (
    <div
      style={{
        fontFamily: font,
        fontSize: size,
        fontWeight: weight,
        color: resolvedColor,
        lineHeight: 1.22,
        whiteSpace: 'pre-line',
        lineBreak: 'strict',
        textAlign: align,
        transform: rot ? `rotate(${rot}deg)` : undefined,
        textShadow: outlineColor
          ? `-2px 0 0 ${outlineColor}, 2px 0 0 ${outlineColor}, 0 -2px 0 ${outlineColor}, 0 2px 0 ${outlineColor}`
          : undefined,
        ...style,
      }}
    >
      {text}
    </div>
  );
};

export interface PhotoScrapProps {
  src: string;
  sec: number;
  at?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rot?: number;
  tape?: boolean;
  dim?: number;
  polarity?: StagePolarity;
  objectPosition?: string;
  labelJa?: string;
  durationSec?: number;
  z?: number;
  style?: React.CSSProperties;
}

/**
 * 紙縁＋マスキングテープ＋スナップ投下＋ゆるいケンバーンズ付き実写スクラップ。
 */
export const PhotoScrap: React.FC<PhotoScrapProps> = ({
  src,
  sec,
  at = 0,
  x,
  y,
  w = 640,
  h = 460,
  rot = -2.2,
  tape = true,
  dim = 0,
  polarity = 'black',
  objectPosition = '50% 50%',
  labelJa,
  durationSec = 8,
  z,
  style,
}) => {
  const { fps } = useVideoConfig();
  if (!src || sec < at) {
    return null;
  }

  const theme = resolvePolarityTheme(polarity);
  const sp = snapAt(sec, at, fps, 420, 24, 0.65);
  const scale = interpolate(sp, [0, 1], [1.1, 1]);
  const ty = interpolate(sp, [0, 1], [-34, 0]);
  const opacity = interpolate(sp, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
  const kb = clampLerp(sec, [at, at + Math.max(0.8, durationSec)], [1.03, 1.12]);
  const resolvedSrc = resolveStickmanMediaSrc(src);
  const isAbs = x !== undefined || y !== undefined;
  const bottomPad = labelJa ? 52 : 14;

  return (
    <div
      style={{
        position: isAbs ? 'absolute' : 'relative',
        left: isAbs ? x ?? 0 : undefined,
        top: isAbs ? y ?? 0 : undefined,
        zIndex: z,
        width: w,
        height: h,
        padding: `14px 14px ${bottomPad}px`,
        boxSizing: 'border-box',
        backgroundColor: '#FAF8F3',
        border: theme.isLight ? '3.5px solid #1C1917' : '1px solid rgba(245, 242, 234, 0.28)',
        boxShadow: theme.isLight
          ? '8px 9px 0 rgba(28, 25, 23, 0.24)'
          : '0 26px 60px rgba(0, 0, 0, 0.78)',
        transform: `translateY(${ty}px) rotate(${rot + (1 - sp) * 2}deg) scale(${scale})`,
        opacity,
        ...style,
      }}
    >
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
        <Img
          src={resolvedSrc}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition,
            transform: `scale(${kb})`,
            filter: 'contrast(1.05) saturate(0.96)',
          }}
        />
        {dim > 0 ? (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(0,0,0,${dim})` }} />
        ) : null}
      </div>

      {tape ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -18,
            left: '36%',
            width: Math.min(176, w * 0.34),
            height: 38,
            backgroundColor: 'rgba(253, 224, 71, 0.62)',
            border: theme.isLight ? '1.5px solid rgba(28, 25, 23, 0.22)' : 'none',
            transform: 'rotate(-5deg)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.24)',
          }}
        />
      ) : null}

      {labelJa ? (
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 8,
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT_HAND,
            fontSize: 24,
            fontWeight: 700,
            color: '#1C1917',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {labelJa}
        </div>
      ) : null}
    </div>
  );
};

export interface HandDrawnFrameProps {
  width?: number | string;
  height?: number | string;
  polarity?: StagePolarity;
  bg?: string;
  borderColor?: string;
  strokeWidth?: number;
  tape?: boolean;
  tapeColor?: string;
  tiltDeg?: number;
  padding?: string | number;
  boil?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const TORN_PAPER_CLIP =
  'polygon(0.6% 0.9%, 24% 0.3%, 52% 0.8%, 79% 0.2%, 99.4% 0.7%, 99.7% 32%, 99.2% 67%, 99.6% 99.1%, 74% 99.6%, 44% 99.1%, 16% 99.7%, 0.4% 99.2%, 0.8% 64%, 0.3% 31%)';

/**
 * 破り紙片クリップ＋7.5fps 手描きボイル枠＋マスキングテープの共通アナログ紙カード枠。
 * SaaS 風の角丸パネル・ドロップシャドウの代替として使う。
 */
export const HandDrawnFrame: React.FC<HandDrawnFrameProps> = ({
  width,
  height,
  polarity = 'cream_notebook',
  bg,
  borderColor,
  strokeWidth = 4.5,
  tape = false,
  tapeColor = 'rgba(253, 224, 71, 0.65)',
  tiltDeg = 0,
  padding = '18px 24px',
  boil = true,
  style,
  children,
}) => {
  const theme = resolvePolarityTheme(polarity);
  const seed = useBoilSeed(7.5, 16);
  const rawId = useId();
  const filterId = `sc-frame-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const resolvedBg = bg ?? '#FAF8F3';
  const resolvedStroke = borderColor ?? '#1C1917';
  const shadow = theme.isLight
    ? 'drop-shadow(6px 7px 0 rgba(28, 25, 23, 0.22))'
    : 'drop-shadow(0 18px 34px rgba(0, 0, 0, 0.78))';

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        display: width === undefined ? 'inline-block' : 'block',
        transform: tiltDeg ? `rotate(${tiltDeg}deg)` : undefined,
        filter: shadow,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: width !== undefined ? '100%' : undefined,
          height: height !== undefined ? '100%' : undefined,
          backgroundColor: resolvedBg,
          clipPath: TORN_PAPER_CLIP,
          padding,
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>

      <svg
        viewBox="0 0 200 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: -2,
          width: 'calc(100% + 4px)',
          height: 'calc(100% + 4px)',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {boil ? (
          <defs>
            <filter id={filterId} x="-6%" y="-6%" width="112%" height="112%">
              <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={seed} result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale={2.4} />
            </filter>
          </defs>
        ) : null}
        <g filter={boil ? `url(#${filterId})` : undefined}>
          <path
            d="M 2.5 3 C 62 1.2, 138 3.6, 197.5 2.4 C 198.6 34, 197.2 68, 197.8 97.4 C 135 98.8, 66 96.8, 2.4 97.6 C 1.4 66, 2.8 34, 2.5 3 Z"
            fill="none"
            stroke={resolvedStroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>

      {tape ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -14,
            left: '50%',
            width: 112,
            height: 26,
            backgroundColor: tapeColor,
            border: '1.5px solid rgba(28, 25, 23, 0.22)',
            transform: 'translateX(-50%) rotate(-3.5deg)',
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );
};
