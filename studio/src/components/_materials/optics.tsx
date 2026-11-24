import React from 'react';
import { Img, staticFile } from 'remotion';
import { useMaterialSid } from './noise';
import { f2, hashRnd } from './paths';

export const BAKED_LIGHT_BEAM_HAZE_FILE = 'backgrounds/light_beam_haze.png';

/* ========================================================================== */
/* フォーマット中立：光学・SVG フィルタ・大気粒子（名詞・物語アクションゼロ）        */
/* ========================================================================== */

export interface InkFxFilterDefsProps {
  cutoutId?: string;
  cutoutColor?: string;
  glowId?: string;
}

/**
 * 切り抜きシール（cutout：白紙縁＋落ち影）および暗地発光（glow）の SVG フィルタ定義部品。
 */
export const InkFxFilterDefs: React.FC<InkFxFilterDefsProps> = ({
  cutoutId,
  cutoutColor = '#FBF7EE',
  glowId,
}) => (
  <>
    {cutoutId ? (
      <filter id={cutoutId} x="-10%" y="-10%" width="120%" height="125%">
        <feMorphology in="SourceAlpha" operator="dilate" radius={8} result="d" />
        <feFlood floodColor={cutoutColor} result="pc" />
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
    ) : null}
    {glowId ? (
      <filter id={glowId} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur in="SourceGraphic" stdDeviation={7} result="b" />
        <feColorMatrix
          in="b"
          type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.45 0"
          result="g"
        />
        <feMerge>
          <feMergeNode in="g" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    ) : null}
  </>
);

export interface InkFxLayerProps {
  cutout?: string | boolean;
  glow?: string | boolean;
  children: React.ReactNode;
}

/**
 * cutout（白紙切り抜きシール＋落ち影）または glow（暗地発光）を SVG 要素へ適用する汎用ラッパ。
 */
export const InkFxLayer: React.FC<InkFxLayerProps> = ({
  cutout,
  glow,
  children,
}) => {
  const fxId = useMaterialSid('mat-fx');
  const useCutout = Boolean(cutout);
  const useGlow = !useCutout && Boolean(glow);
  if (!useCutout && !useGlow) {
    return <>{children}</>;
  }
  const cutoutColor = typeof cutout === 'string' ? cutout : '#FBF7EE';
  return (
    <g filter={`url(#${fxId})`}>
      <defs>
        <InkFxFilterDefs
          cutoutId={useCutout ? fxId : undefined}
          cutoutColor={cutoutColor}
          glowId={useGlow ? fxId : undefined}
        />
      </defs>
      {children}
    </g>
  );
};

export interface ChalkFilterDefProps {
  id: string;
  scale?: number;
  freq?: number;
  seed?: number;
  /** 消し跡のように滲ませたい場合のみガウスぼかし半径を指定 */
  blur?: number;
}

/** チョークの粉粗さ・手描きエッジ粗さを与える軽量 SVG `<filter>` 定義（`<defs>` 内に置く） */
export const ChalkFilterDef: React.FC<ChalkFilterDefProps> = ({
  id,
  scale = 2.2,
  freq = 0.9,
  seed = 4,
  blur,
}) => (
  <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence
      type="fractalNoise"
      baseFrequency={freq}
      numOctaves={1}
      seed={seed}
      result="g"
    />
    <feDisplacementMap in="SourceGraphic" in2="g" scale={scale} result="d" />
    {blur && blur > 0 ? <feGaussianBlur in="d" stdDeviation={blur} /> : null}
  </filter>
);

export interface BoilFilterDefProps {
  id: string;
  seed: number;
  scale?: number;
  freq?: number;
  octaves?: number;
}

/** 1 SVG で共有する軽量ボイル `<filter>` 定義（`<defs>` 内に置く） */
export const BoilFilterDef: React.FC<BoilFilterDefProps> = ({
  id,
  seed,
  scale = 2.6,
  freq = 0.024,
  octaves = 2,
}) => (
  <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence
      type="fractalNoise"
      baseFrequency={freq}
      numOctaves={octaves}
      seed={seed}
      result="n"
    />
    <feDisplacementMap in="SourceGraphic" in2="n" scale={scale} />
  </filter>
);

/* -------------------------------------------------------------------------- */
/* 浮遊チリ（DustField）                                                        */
/* -------------------------------------------------------------------------- */

interface DustParticle {
  i: number;
  z: number;
  x0: number;
  y0: number;
  r: number;
  rise: number;
  sway: number;
  freq: number;
  ph: number;
  tw: number;
}

const buildDustParticles = (count: number, width: number, height: number): DustParticle[] =>
  Array.from({ length: count }, (_, i) => {
    const z = 0.25 + hashRnd(i + 1) * 0.75;
    return {
      i,
      z,
      x0: hashRnd(i + 101) * width,
      y0: hashRnd(i + 211) * height,
      r: 0.9 + z * 2.4,
      rise: 6 + z * 16,
      sway: 6 + hashRnd(i + 307) * 18,
      freq: 0.12 + hashRnd(i + 401) * 0.25,
      ph: hashRnd(i + 503) * Math.PI * 2,
      tw: 0.6 + hashRnd(i + 601) * 1.6,
    };
  });

const DEFAULT_DUST_70 = buildDustParticles(70, 1920, 1080);

export interface DustFieldProps {
  /** 経過秒 */
  sec: number;
  /** 粒子数（既定 70） */
  count?: number;
  /** 粒子色（既定 "#FFF3DE"） */
  color?: string;
  /** 全体の不透明度係数（既定 1） */
  opacity?: number;
  /** 光柱外の基準不透明度（既定 0.03） */
  baseOpacity?: number;
  /** 光柱内の加算不透明度（既定 0.55） */
  litBoost?: number;
  /** 座標ごとの照明強度（0..1）。未指定時は画面全体に穏やかに分布 */
  inBeam?: (x: number, y: number) => number;
  /** 暖気・明滅の乗数（既定 1） */
  warm?: number;
  width?: number;
  height?: number;
  /** true なら `<g>` のみ返す（親 `<svg>` への埋め込み用）。既定 false は全面 `<svg>` */
  inline?: boolean;
  style?: React.CSSProperties;
}

/** 暗室・プロジェクタ・スタジオ空間を漂う浮遊チリ粒子 */
export const DustField: React.FC<DustFieldProps> = ({
  sec,
  count = 70,
  color = '#FFF3DE',
  opacity = 1,
  baseOpacity = 0.03,
  litBoost = 0.55,
  inBeam,
  warm = 1,
  width = 1920,
  height = 1080,
  inline = false,
  style,
}) => {
  const particles =
    count === 70 && width === 1920 && height === 1080
      ? DEFAULT_DUST_70
      : buildDustParticles(count, width, height);

  const nodes = (
    <g>
      {particles.map((d) => {
        const y = (((d.y0 - sec * d.rise) % height) + height) % height;
        const x = d.x0 + Math.sin(sec * d.freq * Math.PI * 0.5 + d.ph) * d.sway;
        const lit = inBeam ? inBeam(x, y) : 0.42;
        const tw = 0.7 + 0.3 * Math.sin(sec * d.tw + d.ph);
        const op = (baseOpacity + lit * litBoost) * d.z * tw * warm * opacity;
        return op < 0.012 ? null : (
          <circle key={d.i} cx={x} cy={y} r={d.r} fill={color} opacity={op} />
        );
      })}
    </g>
  );

  if (inline) {
    return nodes;
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {nodes}
    </svg>
  );
};

/* -------------------------------------------------------------------------- */
/* 光柱＋漂うヘイズ（LightBeam）                                                */
/* -------------------------------------------------------------------------- */

export interface LightBeamProps {
  /** 経過秒 */
  sec: number;
  /** 光源の上端 X 座標（既定 700） */
  srcX?: number;
  /** 照射先の下端 X 座標（既定 960） */
  spotX?: number;
  /** 上端 Y（既定 -60） */
  topY?: number;
  /** 下端 Y（既定 842） */
  bottomY?: number;
  /** 上端の半幅（既定 70） */
  topHalf?: number;
  /** 下端の半幅（既定 420） */
  bottomHalf?: number;
  /** 上・中・下のグラデーション色（既定は暖白） */
  stops?: readonly [string, string, string];
  /** 上・中・下のグラデーション不透明度（既定 [0.2, 0.085, 0.05]） */
  stopOpacities?: readonly [number, number, number];
  /** 全体不透明度（既定 1） */
  opacity?: number;
  /** ガウスぼかし量（既定 26） */
  blur?: number;
  /** 柱の中を漂うヘイズ層を描くか（既定 true） */
  haze?: boolean;
  /** ヘイズ不透明度（既定 0.2） */
  hazeOpacity?: number;
  /** ヘイズ色マトリクス（既定は暖白） */
  hazeMatrix?: string;
  width?: number;
  height?: number;
  /** true なら `<g>` のみ返す（親 `<svg>` への埋め込み用）。既定 false は全面 `<svg>` */
  inline?: boolean;
  /** 事前ベイク済みヘイズ PNG を使用するか（既定 true、inline=false かつ既定 hazeMatrix 時のみ適用） */
  useBaked?: boolean;
  style?: React.CSSProperties;
}

const DEFAULT_HAZE_MATRIX =
  '0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.88  0 0 0 1.8 -0.7';

/** 事前ベイク用：LightBeam ヘイズのシームレス透過 PNG レイヤ（1920x1080） */
export const LightBeamHazeStatic: React.FC<{
  width?: number;
  height?: number;
  hazeMatrix?: string;
}> = ({ width = 1920, height = 1080, hazeMatrix = DEFAULT_HAZE_MATRIX }) => {
  const hazeId = useMaterialSid('haze-bake');
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <filter id={hazeId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.0035 0.008"
            numOctaves={3}
            seed={4}
            stitchTiles="stitch"
            result="n"
          />
          <feColorMatrix in="n" type="matrix" values={hazeMatrix} />
        </filter>
      </defs>
      <rect x={0} y={0} width={width} height={height} filter={`url(#${hazeId})`} />
    </svg>
  );
};

/** 上方から斜めに落ちる照明の柱と内部の浮遊ヘイズ */
export const LightBeam: React.FC<LightBeamProps> = ({
  sec,
  srcX = 700,
  spotX = 960,
  topY = -60,
  bottomY = 842,
  topHalf = 70,
  bottomHalf = 420,
  stops = ['#FFEFD6', '#FFE9C8', '#FFE2B8'],
  stopOpacities = [0.2, 0.085, 0.05],
  opacity = 1,
  blur = 26,
  haze = true,
  hazeOpacity = 0.2,
  hazeMatrix = DEFAULT_HAZE_MATRIX,
  width = 1920,
  height = 1080,
  inline = false,
  useBaked = true,
  style,
}) => {
  const gradId = useMaterialSid('beam');
  const blurId = useMaterialSid('beamblur');
  const clipId = useMaterialSid('beamclip');
  const hazeId = useMaterialSid('haze');

  const d = `M ${f2(srcX - topHalf)} ${f2(topY)} L ${f2(srcX + topHalf)} ${f2(topY)} L ${f2(spotX + bottomHalf)} ${f2(bottomY)} L ${f2(spotX - bottomHalf)} ${f2(bottomY)} Z`;
  const hazeShiftX = sec * 22;
  const hazeShiftY = -sec * 9;
  const useBakedHaze = useBaked && !inline && haze && hazeMatrix === DEFAULT_HAZE_MATRIX;
  const useSvgHaze = haze && !useBakedHaze;

  const content = (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stops[0]} stopOpacity={stopOpacities[0]} />
          <stop offset="60%" stopColor={stops[1]} stopOpacity={stopOpacities[1]} />
          <stop offset="100%" stopColor={stops[2]} stopOpacity={stopOpacities[2]} />
        </linearGradient>
        <filter id={blurId} x="-20%" y="-10%" width="140%" height="120%">
          <feGaussianBlur stdDeviation={blur} />
        </filter>
        {useSvgHaze ? (
          <>
            <clipPath id={clipId}>
              <path d={d} />
            </clipPath>
            <filter id={hazeId} x="0" y="0" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.0035 0.008"
                numOctaves={3}
                seed={4}
                result="n"
              />
              <feColorMatrix in="n" type="matrix" values={hazeMatrix} />
            </filter>
          </>
        ) : null}
      </defs>
      <path
        d={d}
        fill={`url(#${gradId})`}
        filter={`url(#${blurId})`}
        opacity={opacity}
      />
      {useSvgHaze ? (
        <g clipPath={`url(#${clipId})`} opacity={hazeOpacity * opacity}>
          <g transform={`translate(${f2(hazeShiftX)} ${f2(hazeShiftY)})`}>
            <rect
              x={-300 - hazeShiftX}
              y={-200 - hazeShiftY}
              width={width + 600}
              height={height + 400}
              filter={`url(#${hazeId})`}
            />
          </g>
        </g>
      ) : null}
    </g>
  );

  if (inline) {
    return content;
  }

  const sx = ((hazeShiftX % width) + width) % width;
  const sy = ((hazeShiftY % height) + height) % height;
  const clipPolygon = `polygon(${f2(srcX - topHalf)}px ${f2(topY)}px, ${f2(srcX + topHalf)}px ${f2(topY)}px, ${f2(spotX + bottomHalf)}px ${f2(bottomY)}px, ${f2(spotX - bottomHalf)}px ${f2(bottomY)}px)`;
  const tileOffsets = useBakedHaze
    ? [
        { x: sx - width, y: sy - height },
        { x: sx, y: sy - height },
        { x: sx - width, y: sy },
        { x: sx, y: sy },
      ]
    : [];

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none',
        ...style,
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        {content}
      </svg>
      {useBakedHaze ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: hazeOpacity * opacity,
            clipPath: clipPolygon,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {tileOffsets.map((t, idx) => (
            <Img
              key={idx}
              src={staticFile(BAKED_LIGHT_BEAM_HAZE_FILE)}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width,
                height,
                maxWidth: 'none',
                transform: `translate(${f2(t.x)}px, ${f2(t.y)}px)`,
                pointerEvents: 'none',
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
