import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  ChalkboardSurface,
  CorkGrainSurface,
  DARK_WOOD_PLANKS,
  DustField,
  GrainLayer,
  LightBeam,
  NoiseLayer,
  SunlitPaperSurface,
  WoodPlanksSurface,
  type SurfaceDetail,
} from '../../_materials';
import type { PlanESurface } from '../auditRules';
import { PLAN_E_INK } from '../stageContext';

export interface LivingSurfaceProps {
  surface: PlanESurface;
  /** 質感の強さ（0..1.5 目安、既定 1） */
  intensity?: number;
  /** フィルタ密度（破片複製や実写重ねの軽量化に 'light' を使う。既定 'full'） */
  detail?: SurfaceDetail;
}

const DARK_WOOD_RING_MATRIX =
  '0 0 0 0 0.08  0 0 0 0 0.04  0 0 0 0 0.015  0.86 0 0 0 0';
const DARK_WOOD_FIBER_MATRIX =
  '0 0 0 0 0.07  0 0 0 0 0.035  0 0 0 0 0.015  1.5 0 0 0 -0.58';

const PROJECTOR_HAZE_MATRIX =
  '0 0 0 0 0.82  0 0 0 0 0.91  0 0 0 0 1  1.6 0 0 0 -0.68';

/**
 * 地の「生きた質感」（置物ゼロ素地）。
 * 全面を覆う背景へ紙目凹凸・4層コルク粒・暗調3枚板木目・黒板消し跡・プロジェクタ光柱＆チリを与える。
 * 字幕帯の静音化（SubtitleCalm）はここには焼き込まず、テンプレート側のカメラ外へ分離している。
 */
export const LivingSurface: React.FC<LivingSurfaceProps> = ({
  surface,
  intensity = 1,
  detail = 'full',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / Math.max(1, fps);
  const ink = PLAN_E_INK[surface];
  const k = Math.max(0, intensity);
  const drift = (frame % 2400) / 2400;
  const isFull = detail === 'full';

  let layers: React.ReactNode;
  switch (surface) {
    case 'paper': {
      layers = (
        <>
          <SunlitPaperSurface
            intensity={k}
            toothOpacity={0.22}
            toothFreq={0.11}
            toothSeed={5}
            toothSurface={1.75}
            fiberOpacity={0.038}
            warmthOpacity={0.12}
            warmthXPercent={62 + Math.sin(sec * 0.22) * 3}
            detail={detail}
          />
          {isFull ? (
            <NoiseLayer
              freq="0.006"
              octaves={2}
              seed={14}
              opacity={0.055 * k}
              blend="multiply"
            />
          ) : null}
          <AbsoluteFill
            style={{
              background: `linear-gradient(115deg, transparent ${(18 + drift * 40).toFixed(1)}%, rgba(255,255,255,${(0.08 * k).toFixed(3)}) ${(30 + drift * 40).toFixed(1)}%, transparent ${(44 + drift * 40).toFixed(1)}%)`,
              pointerEvents: 'none',
            }}
          />
          {isFull ? <GrainLayer opacity={0.032 * k} blend="multiply" freq={0.85} /> : null}
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse 92% 88% at 50% 44%, rgba(255,255,255,0) 60%, rgba(72, 54, 30, ${(0.15 * k).toFixed(3)}) 100%)`,
              pointerEvents: 'none',
            }}
          />
        </>
      );
      break;
    }

    case 'whiteboard': {
      layers = (
        <>
          {isFull ? (
            <>
              <NoiseLayer freq="0.008" octaves={2} seed={4} opacity={0.035 * k} blend="multiply" />
              <GrainLayer opacity={0.02 * k} blend="multiply" freq={0.9} />
            </>
          ) : null}
          <AbsoluteFill
            style={{
              background: `linear-gradient(115deg, transparent ${(16 + drift * 40).toFixed(1)}%, rgba(255,255,255,${(0.18 * k).toFixed(3)}) ${(29 + drift * 40).toFixed(1)}%, transparent ${(44 + drift * 40).toFixed(1)}%)`,
              pointerEvents: 'none',
            }}
          />
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse 90% 86% at 50% 44%, transparent 60%, rgba(44, 52, 62, ${(0.1 * k).toFixed(3)}) 100%)`,
              pointerEvents: 'none',
            }}
          />
        </>
      );
      break;
    }

    case 'corkboard': {
      const lampX = 48 + Math.sin(sec * 0.38) * 3;
      layers = (
        <>
          <CorkGrainSurface baseColor="#9C6F42" intensity={k} detail={detail} />
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse 62% 60% at ${lampX.toFixed(2)}% 36%, rgba(255, 220, 168, ${(0.18 * k).toFixed(3)}) 0%, rgba(255, 220, 168, 0) 70%)`,
              mixBlendMode: 'screen',
              pointerEvents: 'none',
            }}
          />
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse 98% 94% at 50% 44%, rgba(0, 0, 0, 0) 48%, rgba(30, 14, 4, ${(0.56 * k).toFixed(3)}) 100%)`,
              pointerEvents: 'none',
            }}
          />
          {isFull ? <GrainLayer opacity={0.045 * k} blend="overlay" freq={0.8} /> : null}
        </>
      );
      break;
    }

    case 'charcoal': {
      layers = <ChalkboardSurface sec={sec} baseColor={ink.ground} intensity={k} detail={detail} />;
      break;
    }

    case 'dark_desk': {
      const lampX = 44 + Math.sin(sec * 0.34) * 2;
      const flick = 0.94 + Math.sin(sec * 2.8) * 0.03 + Math.sin(sec * 6.9) * 0.015;
      layers = (
        <>
          <WoodPlanksSurface
            planks={DARK_WOOD_PLANKS}
            ringMatrix={DARK_WOOD_RING_MATRIX}
            fiberMatrix={DARK_WOOD_FIBER_MATRIX}
            fiberOpacity={0.5}
            seamColor="rgba(8, 3, 1, 0.78)"
            seamHighlight="rgba(255, 206, 152, 0.08)"
            detail={detail}
          />
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse 54% 58% at ${lampX.toFixed(2)}% 38%, rgba(255, 198, 126, ${(0.28 * flick * k).toFixed(3)}) 0%, rgba(255, 174, 96, ${(0.09 * flick * k).toFixed(3)}) 46%, rgba(255, 170, 90, 0) 72%)`,
              mixBlendMode: 'screen',
              pointerEvents: 'none',
            }}
          />
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse 92% 90% at ${(lampX + 4).toFixed(2)}% 40%, rgba(0, 0, 0, 0) 36%, rgba(8, 4, 1, ${(0.78 * k).toFixed(3)}) 100%)`,
              pointerEvents: 'none',
            }}
          />
          {isFull ? <GrainLayer opacity={0.05 * k} blend="overlay" freq={0.75} /> : null}
        </>
      );
      break;
    }

    case 'projector': {
      const flicker =
        0.92 + 0.08 * Math.abs(Math.sin(frame * 1.37) * Math.cos(frame * 0.71));
      const spotX = 960 + Math.sin(sec * 0.45) * 24;
      const srcX = spotX - 240;
      const inBeam = (x: number, y: number): number => {
        const u = Math.max(0, Math.min(1, (y + 60) / 1000));
        const cx = srcX + (spotX - srcX) * u;
        const half = 68 + (440 - 68) * u;
        const d = Math.abs(x - cx) / half;
        return Math.max(0, 1 - d * d);
      };
      layers = (
        <>
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse 62% 70% at ${((spotX / 1920) * 100).toFixed(2)}% 46%, rgba(168, 206, 236, ${(0.12 * flicker * k).toFixed(3)}) 0%, rgba(28, 36, 46, 0.35) 48%, rgba(6, 7, 10, 0.92) 86%)`,
              pointerEvents: 'none',
            }}
          />
          <LightBeam
            sec={sec}
            srcX={srcX}
            spotX={spotX}
            topY={-60}
            bottomY={920}
            topHalf={68}
            bottomHalf={440}
            stops={['#E8F4FF', '#CFE6FF', '#B8D8FA']}
            stopOpacities={[0.18, 0.08, 0.035]}
            opacity={flicker * k}
            haze={isFull}
            hazeOpacity={0.16}
            hazeMatrix={PROJECTOR_HAZE_MATRIX}
          />
          <DustField
            sec={sec}
            count={isFull ? 56 : 26}
            color="#E8F3FF"
            opacity={0.85 * k}
            baseOpacity={0.02}
            litBoost={0.44}
            inBeam={inBeam}
            warm={flicker}
          />
          {isFull ? <GrainLayer opacity={0.065 * k} blend="screen" freq={0.95} /> : null}
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse 88% 82% at 50% 46%, transparent 45%, rgba(0, 0, 0, ${(0.68 * k).toFixed(3)}) 100%)`,
              pointerEvents: 'none',
            }}
          />
        </>
      );
      break;
    }

    default: {
      layers = (
        <>
          {isFull ? <GrainLayer opacity={0.06 * k} blend="screen" freq={0.95} /> : null}
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse 84% 78% at 50% 46%, transparent 40%, rgba(4, 5, 7, ${(0.62 * k).toFixed(3)}) 100%)`,
              pointerEvents: 'none',
            }}
          />
        </>
      );
    }
  }

  return (
    <AbsoluteFill
      style={{ backgroundColor: ink.ground, pointerEvents: 'none', overflow: 'hidden' }}
    >
      {layers}
    </AbsoluteFill>
  );
};
