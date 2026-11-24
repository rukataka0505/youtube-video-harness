import React, { createContext, useContext, useId } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { BoilFilterDef } from '../_materials';
import { clamp01 } from './beatUtils';
import { DrawPath, useBoilSeed } from './HandDrawnMotion';
import {
  STAGE_FLOOR_Y,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  f2,
  sanitizeSvgId,
} from './motionMath';
import { InkFxFilterDefs } from './StageEffects';
import type { PolarityTheme } from './types';

/* ========================================================================== */
/* 単一 1920×1080 SVG 舞台＋カメラ＋共有ボイル層＋非ボイル層                    */
/* ========================================================================== */

export interface SharedBoilFilter {
  id: string;
  url: string;
  defs: React.ReactNode;
}

/**
 * 1シーン1共有の 7.5fps ボイルフィルタを生成するフック。
 */
export const useSharedBoil = (
  scale = 2.6,
  freq = 0.024,
  boilFps = 7.5,
): SharedBoilFilter => {
  const seed = useBoilSeed(boilFps, 16);
  const uid = sanitizeSvgId(useId());
  const id = `sc-stage-boil-${uid}`;
  return {
    id,
    url: `url(#${id})`,
    defs: <BoilFilterDef id={id} seed={seed} scale={scale} freq={freq} octaves={2} />,
  };
};

export interface StageCamera {
  panX?: number;
  panY?: number;
  pan?: readonly [number, number];
  zoom?: number;
  rotate?: number;
  shake?: number;
  shakeFreq?: number;
  origin?: string;
}

export interface StageHorizonProps {
  floorY?: number;
  sec?: number;
  /** 描かれていく開始秒。省略時は最初から表示 */
  at?: number;
  dur?: number;
  x1?: number;
  x2?: number;
  stroke?: string;
  width?: number;
  opacity?: number;
}

/** 地平線（手描き弓なりライン） */
export const StageHorizon: React.FC<StageHorizonProps> = ({
  floorY = STAGE_FLOOR_Y,
  sec = 0,
  at,
  dur = 0.6,
  x1 = 110,
  x2 = 1780,
  stroke = 'rgba(184, 178, 166, 0.72)',
  width = 5,
  opacity = 1,
}) => {
  const midX = (x1 + x2) / 2;
  const d = `M ${x1} ${floorY + 2} Q ${midX} ${floorY - 6} ${x2} ${floorY + 1}`;
  if (at !== undefined) {
    return (
      <g opacity={opacity}>
        <DrawPath d={d} sec={sec} at={at} dur={dur} stroke={stroke} width={width} />
      </g>
    );
  }
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      opacity={opacity}
    />
  );
};

export interface StageFloorShadowProps {
  x: number;
  floorY?: number;
  /** 0..1 接地度（1=着地、0=高所浮遊） */
  ground?: number;
  /** 床からの浮遊高さ（px）。指定時は ground より優先して算出 */
  lift?: number;
  maxLift?: number;
  rx?: number;
  ry?: number;
  color?: string;
  opacity?: number;
}

/** 浮遊・ジャンプと連動して大きさと濃さが変わる接地影 */
export const StageFloorShadow: React.FC<StageFloorShadowProps> = ({
  x,
  floorY = STAGE_FLOOR_Y,
  ground,
  lift,
  maxLift = 240,
  rx = 92,
  ry = 13,
  color = 'rgba(0, 0, 0, 0.35)',
  opacity = 1,
}) => {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
    return null;
  }
  const resolvedGround =
    ground !== undefined
      ? clamp01(ground)
      : lift !== undefined
        ? clamp01(1 - Math.max(0, lift) / Math.max(1, maxLift))
        : 1;
  const scale = 0.55 + 0.45 * resolvedGround;
  const alpha = (0.35 + 0.65 * resolvedGround) * opacity;
  return (
    <ellipse
      cx={x}
      cy={floorY + 4}
      rx={rx * scale}
      ry={ry * scale}
      fill={color}
      opacity={alpha}
    />
  );
};

export type StageFxMode =
  | 'auto'
  | 'none'
  | 'cutout'
  | 'glow'
  | { cutout?: string; glow?: string };

interface StageContextValue {
  boilUrl: string;
  fxUrl?: string;
  sec: number;
  floorY: number;
  theme?: PolarityTheme;
}

const StageContext = createContext<StageContextValue | null>(null);

export interface StageLayerProps {
  fx?: boolean;
  children: React.ReactNode;
}

/**
 * Stage 内で 1 共有 7.5fps ボイルフィルタを適用する線画レイヤ（manualLayers モード用）。
 */
export const StageBoilLayer: React.FC<StageLayerProps> = ({ fx = true, children }) => {
  const ctx = useContext(StageContext);
  if (!ctx) {
    return <g>{children}</g>;
  }
  const boilNode = <g filter={ctx.boilUrl}>{children}</g>;
  return fx && ctx.fxUrl ? <g filter={ctx.fxUrl}>{boilNode}</g> : boilNode;
};

/**
 * Stage 内でボイルをかけない文字・スタンプ・写真枠向けレイヤ（manualLayers モード用）。
 */
export const StageCrispLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <g>{children}</g>
);

export interface StageProps {
  sec?: number;
  theme?: PolarityTheme;
  camera?: StageCamera;
  boilScale?: number;
  boilFreq?: number;
  boilFps?: number;
  /** 'auto' のとき theme.cutout / theme.glow をボイル層外側へ自動適用 */
  fx?: StageFxMode;
  floorY?: number;
  /** true または設定オブジェクトを渡すと手描き地平線を描画 */
  horizon?: boolean | Omit<StageHorizonProps, 'floorY' | 'sec'>;
  /** 棒人間や小道具の接地影配列 */
  shadows?: readonly StageFloorShadowProps[];
  defs?: React.ReactNode;
  /** ボイル対象より背面・非ボイルで置く要素（オニオンスキン等） */
  beforeBoil?: React.ReactNode;
  /** ボイル対象より前面・非ボイルで置く要素（手書き文字・スタンプ等） */
  crisp?: React.ReactNode;
  /** true の場合、children をそのまま描画し <Stage.Boil> / <Stage.Crisp> で手動制御できる */
  manualLayers?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

interface StageComponent extends React.FC<StageProps> {
  Boil: typeof StageBoilLayer;
  Crisp: typeof StageCrispLayer;
  Horizon: typeof StageHorizon;
  Shadow: typeof StageFloorShadow;
}

/**
 * stickman-collage v2.1 公式単一 1920×1080 SVG 舞台＋カメラ。
 * 1 シーン 1 共有の 7.5fps ボイル層（線画用）と非ボイル層（文字・スタンプ・オニオンスキン用）、
 * カメラ（pan / zoom / rotate / shake）、地平線、浮遊連動の接地影を提供する。
 */
const StageBase: React.FC<StageProps> = ({
  sec,
  theme,
  camera,
  boilScale = 2.6,
  boilFreq = 0.024,
  boilFps = 7.5,
  fx = 'auto',
  floorY = STAGE_FLOOR_Y,
  horizon = false,
  shadows,
  defs,
  beforeBoil,
  crisp,
  manualLayers = false,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = sec ?? frame / Math.max(1, fps);
  const boil = useSharedBoil(boilScale, boilFreq, boilFps);
  const uid = sanitizeSvgId(useId());
  const fxId = `sc-stage-fx-${uid}`;

  let cutoutColor: string | undefined;
  let useGlow = false;
  if (fx === 'auto') {
    cutoutColor = theme?.cutout;
    useGlow = !cutoutColor && Boolean(theme?.glow);
  } else if (fx === 'cutout') {
    cutoutColor = theme?.cutout ?? '#FBF7EE';
  } else if (fx === 'glow') {
    useGlow = true;
  } else if (typeof fx === 'object' && fx !== null) {
    cutoutColor = fx.cutout;
    useGlow = !cutoutColor && Boolean(fx.glow);
  }

  const hasFx = Boolean(cutoutColor) || useGlow;
  const fxUrl = hasFx ? `url(#${fxId})` : undefined;

  const camPanX = camera?.panX ?? camera?.pan?.[0] ?? 0;
  const camPanY = camera?.panY ?? camera?.pan?.[1] ?? 0;
  const camZoom = camera?.zoom ?? 1;
  const camRotate = camera?.rotate ?? 0;
  const shakeAmp = camera?.shake ?? 0;
  const shakeFreq = camera?.shakeFreq ?? 28;
  const shakeX =
    shakeAmp > 0
      ? Math.sin(currentSec * shakeFreq * Math.PI * 2) * shakeAmp
      : 0;
  const shakeY =
    shakeAmp > 0
      ? Math.cos(currentSec * shakeFreq * 1.37 * Math.PI * 2) * shakeAmp * 0.72
      : 0;

  const tx = camPanX + shakeX;
  const ty = camPanY + shakeY;
  const hasTransform = tx !== 0 || ty !== 0 || camZoom !== 1 || camRotate !== 0;

  const horizonNode = horizon ? (
    <StageHorizon
      floorY={floorY}
      sec={currentSec}
      stroke={theme?.mutedInk ?? 'rgba(184, 178, 166, 0.72)'}
      {...(typeof horizon === 'object' ? horizon : {})}
    />
  ) : null;

  const shadowNodes =
    shadows && shadows.length > 0
      ? shadows.map((sh, i) => (
          <StageFloorShadow
            key={i}
            floorY={floorY}
            color={theme?.shadow}
            {...sh}
          />
        ))
      : null;

  const boiledContent = (
    <g filter={boil.url}>
      {horizonNode}
      {shadowNodes}
      {children}
    </g>
  );

  const svgNode = (
    <svg
      width={STAGE_WIDTH}
      height={STAGE_HEIGHT}
      viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        ...style,
      }}
    >
      <defs>
        {boil.defs}
        {hasFx ? (
          <InkFxFilterDefs
            cutoutId={cutoutColor ? fxId : undefined}
            cutoutColor={cutoutColor}
            glowId={useGlow ? fxId : undefined}
          />
        ) : null}
        {defs}
      </defs>
      {beforeBoil}
      {manualLayers ? (
        children
      ) : fxUrl ? (
        <g filter={fxUrl}>{boiledContent}</g>
      ) : (
        boiledContent
      )}
      {crisp}
    </svg>
  );

  const ctxValue: StageContextValue = {
    boilUrl: boil.url,
    fxUrl,
    sec: currentSec,
    floorY,
    theme,
  };

  if (!hasTransform) {
    return (
      <StageContext.Provider value={ctxValue}>{svgNode}</StageContext.Provider>
    );
  }

  return (
    <StageContext.Provider value={ctxValue}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${f2(tx)}px, ${f2(ty)}px)${camRotate ? ` rotate(${f2(camRotate)}deg)` : ''} scale(${camZoom})`,
          transformOrigin: camera?.origin ?? '50% 50%',
        }}
      >
        {svgNode}
      </div>
    </StageContext.Provider>
  );
};

export const Stage: StageComponent = Object.assign(StageBase, {
  Boil: StageBoilLayer,
  Crisp: StageCrispLayer,
  Horizon: StageHorizon,
  Shadow: StageFloorShadow,
});
