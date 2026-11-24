import React from 'react';
import { AbsoluteFill } from 'remotion';
import { GrainLayer, NoiseLayer, PaperToothLayer, useMaterialSid } from './noise';
import { f2 } from './paths';

/* ========================================================================== */
/* フォーマット中立：置物ゼロの高質感素地（木目・コルク・黒板・紙・青写真・方眼）     */
/*  ※マグ・鉛筆・ポラ・赤糸・固定寸法・キャラクター用床線など具象置物を一切持たない。 */
/* ========================================================================== */

export type SurfaceDetail = 'full' | 'light';

/* -------------------------------------------------------------------------- */
/* 1. 年輪木目 3枚板（WoodPlanksSurface）                                       */
/* -------------------------------------------------------------------------- */

export interface WoodPlankSpec {
  y: number;
  h: number;
  seed: number;
  tint: string;
}

export const DEFAULT_WOOD_PLANKS: readonly WoodPlankSpec[] = [
  { y: 0, h: 352, seed: 21, tint: '#9C6B43' },
  { y: 352, h: 368, seed: 37, tint: '#8F5F38' },
  { y: 720, h: 360, seed: 53, tint: '#93633B' },
];

export const DARK_WOOD_PLANKS: readonly WoodPlankSpec[] = [
  { y: 0, h: 352, seed: 21, tint: '#382517' },
  { y: 352, h: 368, seed: 37, tint: '#2F1E12' },
  { y: 720, h: 360, seed: 53, tint: '#332114' },
];

const WoodPlank: React.FC<{
  plank: WoodPlankSpec;
  width: number;
  ringMatrix: string;
  fiberMatrix: string;
  fiberOpacity: number;
  detail: SurfaceDetail;
}> = ({ plank, width, ringMatrix, fiberMatrix, fiberOpacity, detail }) => {
  const ringsId = useMaterialSid('rings');
  const fiberId = useMaterialSid('fiber');
  const clipId = useMaterialSid('plank');
  const { y, h, seed, tint } = plank;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={y} width={width} height={h} />
        </clipPath>
        <filter id={ringsId} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.0009 0.017"
            numOctaves={detail === 'light' ? 2 : 3}
            seed={seed}
            result="n"
          />
          <feComponentTransfer in="n" result="b">
            <feFuncR
              type="table"
              tableValues="0 1 0.15 0.95 0 1 0.15 0.95 0 1 0.15 0.95 0"
            />
          </feComponentTransfer>
          <feColorMatrix in="b" type="matrix" values={ringMatrix} />
        </filter>
        {detail === 'full' ? (
          <filter id={fiberId} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.0025 0.32"
              numOctaves={2}
              seed={seed + 5}
              result="f"
            />
            <feColorMatrix in="f" type="matrix" values={fiberMatrix} />
          </filter>
        ) : null}
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x={0} y={y} width={width} height={h} fill={tint} />
        <rect
          x={-200}
          y={y - 40}
          width={width + 400}
          height={h + 80}
          filter={`url(#${ringsId})`}
          transform={`rotate(-0.6 ${width / 2} ${y + h / 2})`}
        />
        {detail === 'full' ? (
          <rect
            x={0}
            y={y}
            width={width}
            height={h}
            filter={`url(#${fiberId})`}
            opacity={fiberOpacity}
          />
        ) : null}
      </g>
    </g>
  );
};

export interface WoodPlanksSurfaceProps {
  planks?: readonly WoodPlankSpec[];
  width?: number;
  height?: number;
  ringMatrix?: string;
  fiberMatrix?: string;
  fiberOpacity?: number;
  seamColor?: string;
  seamHighlight?: string;
  detail?: SurfaceDetail;
  /** true なら `<g>` のみ返す（親 `<svg>` 埋め込み用） */
  inline?: boolean;
  style?: React.CSSProperties;
}

const DEFAULT_RING_MATRIX =
  '0 0 0 0 0.2  0 0 0 0 0.09  0 0 0 0 0.03  0.78 0 0 0 0';
const DEFAULT_FIBER_MATRIX =
  '0 0 0 0 0.18  0 0 0 0 0.08  0 0 0 0 0.03  1.6 0 0 0 -0.62';

/** 3枚板の年輪木目＋板溝素地（置物ゼロ） */
export const WoodPlanksSurface: React.FC<WoodPlanksSurfaceProps> = ({
  planks = DEFAULT_WOOD_PLANKS,
  width = 1920,
  height = 1080,
  ringMatrix = DEFAULT_RING_MATRIX,
  fiberMatrix = DEFAULT_FIBER_MATRIX,
  fiberOpacity = 0.55,
  seamColor = 'rgba(28, 12, 4, 0.6)',
  seamHighlight = 'rgba(255, 220, 180, 0.14)',
  detail = 'full',
  inline = false,
  style,
}) => {
  const seams = planks.slice(1).map((p) => p.y);
  const content = (
    <g>
      {planks.map((p) => (
        <WoodPlank
          key={p.seed}
          plank={p}
          width={width}
          ringMatrix={ringMatrix}
          fiberMatrix={fiberMatrix}
          fiberOpacity={fiberOpacity}
          detail={detail}
        />
      ))}
      {seams.map((y) => (
        <g key={y}>
          <path
            d={`M -20 ${y} L ${width + 20} ${y + 2}`}
            stroke={seamColor}
            strokeWidth={4}
          />
          <path
            d={`M -20 ${y + 3.5} L ${width + 20} ${y + 5.5}`}
            stroke={seamHighlight}
            strokeWidth={1.6}
          />
        </g>
      ))}
    </g>
  );

  if (inline) {
    return content;
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {content}
    </svg>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. 4層コルク粒合成（CorkGrainSurface）                                       */
/* -------------------------------------------------------------------------- */

export interface CorkGrainSurfaceProps {
  /** 指定時のみ下地色レイヤを敷く（外側に背景色がある場合は省略可） */
  baseColor?: string;
  /** 質感の強さ（既定 1） */
  intensity?: number;
  detail?: SurfaceDetail;
}

/** 4層ノイズ合成による天然コルク粒素地（画鋲・赤糸・紙片ゼロ） */
export const CorkGrainSurface: React.FC<CorkGrainSurfaceProps> = ({
  baseColor,
  intensity = 1,
  detail = 'full',
}) => {
  const k = Math.max(0, intensity);
  const layers = (
    <>
      <NoiseLayer freq="0.006" octaves={3} seed={3} opacity={0.3 * k} blend="multiply" />
      <NoiseLayer
        vw={960}
        vh={540}
        freq="0.11"
        octaves={detail === 'light' ? 2 : 3}
        seed={5}
        matrix="0 0 0 0 0.3  0 0 0 0 0.17  0 0 0 0 0.07  4.2 0 0 0 -2.25"
        opacity={0.75 * k}
      />
      {detail === 'full' ? (
        <>
          <NoiseLayer
            vw={960}
            vh={540}
            freq="0.16"
            octaves={2}
            seed={9}
            matrix="0 0 0 0 0.92  0 0 0 0 0.74  0 0 0 0 0.5  0 4.4 0 0 -2.5"
            opacity={0.5 * k}
          />
          <NoiseLayer
            vw={960}
            vh={540}
            freq="0.45"
            octaves={1}
            seed={12}
            matrix="0 0 0 0 0.2  0 0 0 0 0.1  0 0 0 0 0.04  5 0 0 0 -3.1"
            opacity={0.55 * k}
          />
        </>
      ) : null}
    </>
  );

  if (!baseColor) {
    return layers;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: baseColor, pointerEvents: 'none', overflow: 'hidden' }}>
      {layers}
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. 黒板・スレート素地（ChalkboardSurface）                                   */
/* -------------------------------------------------------------------------- */

export interface ChalkboardSurfaceProps {
  /** 経過秒（微細な拭き跡ドリフト・グレイン用） */
  sec?: number;
  baseColor?: string;
  intensity?: number;
  detail?: SurfaceDetail;
  animated?: boolean;
}

/** チョーク消し跡ムラ＋微弱粉粒の黒板素地（落書き・文字ゼロ） */
export const ChalkboardSurface: React.FC<ChalkboardSurfaceProps> = ({
  sec = 0,
  baseColor = '#17191B',
  intensity = 1,
  detail = 'full',
  animated = true,
}) => {
  const k = Math.max(0, intensity);
  const driftX = (sec * 1.6) % 80;
  return (
    <AbsoluteFill style={{ backgroundColor: baseColor, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* スレート中央のわずかな光落ち */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 68% 72% at 50% 44%, rgba(56, 60, 64, 0.34) 0%, rgba(23, 25, 27, 0.12) 56%, rgba(8, 9, 10, 0.58) 100%)',
        }}
      />
      {/* 水平方向のチョーク消し跡ムラ */}
      <NoiseLayer
        freq="0.006 0.02"
        octaves={detail === 'light' ? 2 : 3}
        seed={11}
        matrix="0 0 0 0 0.92  0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 2.4 -1.05"
        opacity={0.11 * k}
        blend="screen"
        shiftX={driftX}
      />
      {detail === 'full' ? (
        <>
          <NoiseLayer
            freq="0.014 0.01"
            octaves={2}
            seed={19}
            matrix="0 0 0 0 0.9  0 0 0 0 0.88  0 0 0 0 0.83  0 0 0 1.6 -0.75"
            opacity={0.07 * k}
            blend="screen"
          />
          <GrainLayer opacity={0.06 * k} blend="screen" freq={0.9} animated={animated} />
        </>
      ) : null}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 88% 82% at 50% 44%, rgba(0, 0, 0, 0) 44%, rgba(0, 0, 0, ${f2(0.56 * k)}) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. 水彩紙・紙目凹凸素地（SunlitPaperSurface）                                */
/* -------------------------------------------------------------------------- */

export interface SunlitPaperSurfaceProps {
  /** 下地色（指定時のみ塗る） */
  baseColor?: string;
  intensity?: number;
  toothOpacity?: number;
  toothFreq?: number;
  toothSeed?: number;
  toothSurface?: number;
  fiberOpacity?: number;
  /** 斜め自然光の暖色ハイライト強さ（0 で無効） */
  warmthOpacity?: number;
  warmthXPercent?: number;
  detail?: SurfaceDetail;
}

/** 立体紙目凹凸（feDiffuseLighting）＋微細繊維の紙素地（鉛筆・落書きゼロ） */
export const SunlitPaperSurface: React.FC<SunlitPaperSurfaceProps> = ({
  baseColor,
  intensity = 1,
  toothOpacity = 0.24,
  toothFreq = 0.11,
  toothSeed = 5,
  toothSurface = 1.8,
  fiberOpacity = 0.04,
  warmthOpacity = 0,
  warmthXPercent = 66,
  detail = 'full',
}) => {
  const k = Math.max(0, intensity);
  const content = (
    <>
      {detail === 'full' ? (
        <PaperToothLayer
          opacity={toothOpacity * k}
          freq={toothFreq}
          seed={toothSeed}
          surface={toothSurface}
        />
      ) : null}
      <NoiseLayer
        freq="0.012 0.3"
        seed={8}
        opacity={(detail === 'light' ? fiberOpacity * 1.4 : fiberOpacity) * k}
        blend="multiply"
      />
      {warmthOpacity > 0 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 52% 62% at ${f2(warmthXPercent)}% 30%, rgba(255, 228, 170, ${f2(warmthOpacity * k)}) 0%, rgba(255, 228, 170, 0) 70%)`,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </>
  );

  if (!baseColor) {
    return content;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: baseColor, pointerEvents: 'none', overflow: 'hidden' }}>
      {content}
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* 5. ブループリント素地（BlueprintSurface）                                    */
/* -------------------------------------------------------------------------- */

export interface BlueprintSurfaceProps {
  sec?: number;
  detail?: SurfaceDetail;
  showScan?: boolean;
  scanOpacity?: number;
  scanY?: number;
}

/** 露光ムラ紺地＋2段グリッド＋任意スキャン光の素地（固定図面・表題欄ゼロ） */
export const BlueprintSurface: React.FC<BlueprintSurfaceProps> = ({
  sec = 0,
  detail = 'full',
  showScan = false,
  scanOpacity = 0,
  scanY = -160,
}) => (
  <>
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse 80% 80% at 44% 40%, #17407A 0%, #0E2B55 52%, #081B37 100%)',
        pointerEvents: 'none',
      }}
    />
    {detail === 'full' ? (
      <NoiseLayer
        freq="0.005"
        octaves={3}
        seed={6}
        matrix="0 0 0 0 0.55  0 0 0 0 0.76  0 0 0 0 1  1.5 0 0 0 -0.6"
        opacity={0.22}
        blend="screen"
        shiftX={sec * 3}
      />
    ) : null}
    <AbsoluteFill
      style={{
        backgroundImage: [
          'linear-gradient(to right, rgba(170, 214, 255, 0.2) 1.5px, transparent 1.5px)',
          'linear-gradient(to bottom, rgba(170, 214, 255, 0.2) 1.5px, transparent 1.5px)',
          'linear-gradient(to right, rgba(150, 200, 255, 0.075) 1px, transparent 1px)',
          'linear-gradient(to bottom, rgba(150, 200, 255, 0.075) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: '150px 150px, 150px 150px, 30px 30px, 30px 30px',
        backgroundPosition: `${f2(-sec * 2)}px 0px`,
        pointerEvents: 'none',
      }}
    />
    {showScan && scanOpacity > 0.005 ? (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: scanY - 120,
          height: 240,
          opacity: scanOpacity,
          pointerEvents: 'none',
          background:
            'linear-gradient(to bottom, rgba(160, 210, 255, 0) 0%, rgba(160, 210, 255, 0.09) 46%, rgba(220, 240, 255, 0.2) 50%, rgba(160, 210, 255, 0.09) 54%, rgba(160, 210, 255, 0) 100%)',
          mixBlendMode: 'screen',
        }}
      />
    ) : null}
  </>
);

/* -------------------------------------------------------------------------- */
/* 6. 2段方眼紙素地（DraftingGridSurface）                                      */
/* -------------------------------------------------------------------------- */

export interface DraftingGridSurfaceProps {
  panX?: number;
  panY?: number;
  detail?: SurfaceDetail;
}

/** 2段方眼＋紙目凹凸＋繊維の素地（定規・コンパス・テープゼロ） */
export const DraftingGridSurface: React.FC<DraftingGridSurfaceProps> = ({
  panX = 0,
  panY = 0,
  detail = 'full',
}) => (
  <>
    <AbsoluteFill
      style={{
        backgroundImage: [
          'linear-gradient(to right, rgba(28, 118, 106, 0.26) 1.6px, transparent 1.6px)',
          'linear-gradient(to bottom, rgba(28, 118, 106, 0.26) 1.6px, transparent 1.6px)',
          'linear-gradient(to right, rgba(28, 118, 106, 0.1) 1px, transparent 1px)',
          'linear-gradient(to bottom, rgba(28, 118, 106, 0.1) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: '120px 120px, 120px 120px, 24px 24px, 24px 24px',
        backgroundPosition: `${f2(panX)}px ${f2(panY)}px`,
        pointerEvents: 'none',
      }}
    />
    {detail === 'full' ? (
      <PaperToothLayer opacity={0.28} freq={0.12} seed={2} surface={1.6} />
    ) : null}
    <NoiseLayer freq="0.016 0.42" seed={7} opacity={0.06} blend="multiply" />
  </>
);
