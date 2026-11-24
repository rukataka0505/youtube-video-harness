import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

export interface RgbGlitchBurstProps {
  /** バースト開始時刻（秒） */
  startSec?: number;
  /** バースト継続時間（秒） */
  durationSec?: number;
  /** 初動フラッシュの有無 */
  flash?: boolean;
  /** 強度の倍率 */
  intensity?: number;
  /** 重ね順（既定 45） */
  zIndex?: number;
}

const BAND_COLORS = [
  'rgba(34, 211, 238, 0.72)', // cyan
  'rgba(239, 68, 68, 0.68)',  // crimson
  'rgba(245, 158, 11, 0.62)', // amber
  'rgba(255, 255, 255, 0.85)',
] as const;

/**
 * 局面転換・VTR切替・緊急展開時に差し込む 0.24秒前後の RGB グリッチバースト。
 * v2_orch_neon での高評価ポイントをコンポーネント化し、グローバル秒基準（startSec）で発火する。
 */
export const RgbGlitchBurst: React.FC<RgbGlitchBurstProps> = ({
  startSec = 0,
  durationSec = 0.24,
  flash = true,
  intensity = 1,
  zIndex = 45,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const sec = frame / fps;
  const rel = sec - startSec;

  if (rel < 0 || rel >= durationSec || durationSec <= 0) {
    return null;
  }

  const progress = rel / durationSec;
  const decay = Math.max(0, 1 - progress);
  const localFrame = Math.max(0, Math.floor(rel * fps));
  const flashOpacity = flash && rel < 0.08 ? Math.max(0, 1 - rel / 0.08) * 0.48 * intensity : 0;

  // Remotion 決定論的疑似乱数でスキャンバーを配置
  const bars = Array.from({ length: 7 }, (_, i) => {
    const seed = (localFrame + 1) * 97 + i * 53;
    const yRatio = ((seed * 31) % 88) / 100 + 0.04;
    const hPx = 6 + ((seed * 17) % 28);
    const xShift = (((seed * 41) % 120) - 60) * intensity * decay;
    const widthPct = 36 + ((seed * 19) % 62);
    const leftPct = ((seed * 23) % Math.max(4, 100 - widthPct));
    const color = BAND_COLORS[i % BAND_COLORS.length];
    return {
      top: Math.round(yRatio * height),
      height: hPx,
      leftPct,
      widthPct,
      xShift,
      color,
    };
  });

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        zIndex,
        overflow: 'hidden',
      }}
    >
      {/* 高速スキャンライン */}
      <AbsoluteFill
        style={{
          opacity: 0.35 * decay * intensity,
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 2px, transparent 2px, transparent 6px)',
        }}
      />

      {/* RGB スプリット走査帯 */}
      {bars.map((bar, idx) => (
        <div
          key={idx}
          style={{
            position: 'absolute',
            top: bar.top,
            left: `${bar.leftPct}%`,
            width: `${bar.widthPct}%`,
            height: bar.height,
            backgroundColor: bar.color,
            opacity: Math.min(0.92, decay * 0.88 * intensity),
            transform: `translateX(${bar.xShift}px)`,
            mixBlendMode: 'screen',
          }}
        />
      ))}

      {/* 1〜2フレームのフラッシュ */}
      {flashOpacity > 0 && (
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(248, 250, 252, ${Math.min(0.65, flashOpacity)})`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
