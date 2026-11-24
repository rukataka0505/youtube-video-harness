import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  FONT_ECON_MONO,
  PlanEBrollGrade,
  PlanEBrollMotion,
} from '../../../../components/plan_e';

function resolveMedia(src: string): string {
  if (/^(https?:\/\/|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

function gradeFilter(grade: PlanEBrollGrade): string {
  switch (grade) {
    case 'crisis_desat':
      return 'contrast(1.20) saturate(0.50) brightness(0.80)';
    case 'warm_night':
      return 'contrast(1.14) saturate(1.12) brightness(0.86)';
    case 'clean_bright':
      return 'contrast(1.06) saturate(1.06) brightness(0.92)';
    case 'editorial_cool':
      return 'contrast(1.12) saturate(0.82) brightness(0.86)';
    default:
      return 'contrast(1.10) saturate(0.92) brightness(0.86)';
  }
}

function motionTransform(motion: PlanEBrollMotion, progress: number): string {
  switch (motion) {
    case 'slow_zoom_in':
      return `scale(${interpolate(progress, [0, 1], [1.0, 1.09]).toFixed(4)})`;
    case 'slow_zoom_out':
      return `scale(${interpolate(progress, [0, 1], [1.10, 1.01]).toFixed(4)})`;
    case 'pan_left':
      return `scale(1.08) translateX(${interpolate(progress, [0, 1], [22, -22]).toFixed(1)}px)`;
    case 'pan_right':
      return `scale(1.08) translateX(${interpolate(progress, [0, 1], [-22, 22]).toFixed(1)}px)`;
    default:
      return 'scale(1.02)';
  }
}

export interface BrollCutStageProps {
  startSec: number;
  endSec: number;
  videoSrc: string;
  startFromFrame?: number;
  playbackRate?: number;
  motion?: PlanEBrollMotion;
  grade?: PlanEBrollGrade;
  vignetteStrength?: number;
  glitchIntroSec?: number;
  locationTag?: string;
  locationAccentColor?: string;
  children?: React.ReactNode;
}

/**
 * 案E v2_orch_neon 向けフルブリード1080p実写動画Bロール再生ステージ。
 * - <Sequence layout="none"> でグローバルフレーム契約を維持
 * - すべての下部ロケーションタグは bottom: 164px に配置し、CleanSubtitle (58-144px) と非衝突
 */
export const BrollCutStage: React.FC<BrollCutStageProps> = ({
  startSec,
  endSec,
  videoSrc,
  startFromFrame = 0,
  playbackRate = 1,
  motion = 'slow_zoom_in',
  grade = 'cinematic_vignette',
  vignetteStrength = 0.64,
  glitchIntroSec = 0,
  locationTag,
  locationAccentColor = '#22C55E',
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const totalDur = Math.max(0.2, endSec - startSec);
  const localSec = Math.max(0, sec - startSec);

  const progress = interpolate(sec, [startSec, startSec + totalDur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const seqFrom = Math.max(0, Math.floor(startSec * fps));
  const seqDur = Math.max(2, Math.ceil(totalDur * fps) + 2);

  const inGlitch = glitchIntroSec > 0 && localSec < glitchIntroSec;
  const glitchJitterX = inGlitch ? Math.sin(frame * 17) * 24 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#090B0E', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `${motionTransform(motion, progress)} translateX(${glitchJitterX.toFixed(1)}px)`,
          filter: `${gradeFilter(grade)} ${inGlitch ? 'hue-rotate(18deg) saturate(1.65)' : ''}`,
        }}
      >
        <Sequence key={`broll-${seqFrom}-${startFromFrame}`} from={seqFrom} durationInFrames={seqDur} layout="none">
          <OffthreadVideo
            src={resolveMedia(videoSrc)}
            muted
            startFrom={startFromFrame}
            playbackRate={playbackRate}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Sequence>
      </div>

      {/* ドキュメンタリー調ビネット＆下部字幕保護グラデーション */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: `radial-gradient(ellipse 84% 78% at 50% 46%, transparent 36%, rgba(8, 10, 14, ${vignetteStrength.toFixed(2)}) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(8,10,14,0.16) 0%, transparent 25%, transparent 66%, rgba(8,10,14,0.78) 100%)',
        }}
      />

      {/* 冒頭グリッチバースト */}
      {inGlitch ? (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 12 }}>
          {[0, 1, 2, 3, 4].map((idx) => {
            const topPct = ((idx * 19 + frame * 13) % 85) + 4;
            const hPx = 12 + ((idx * 11 + frame * 7) % 32);
            const shiftX = (idx % 2 === 0 ? 1 : -1) * (18 + ((frame * 9 + idx * 5) % 42));
            return (
              <div
                key={`gl-${idx}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: `${topPct}%`,
                  height: hPx,
                  transform: `translateX(${shiftX}px)`,
                  background:
                    idx % 2 === 0 ? 'rgba(56, 189, 248, 0.30)' : 'rgba(239, 68, 68, 0.28)',
                  mixBlendMode: 'screen',
                }}
              />
            );
          })}
        </AbsoluteFill>
      ) : null}

      {/* サブビート専用モーショングラフィックス重畳 */}
      {children}

      {/* ロケーション／状況タグ（セーフゾーン内側 bottom: 164px） */}
      {locationTag ? (
        <div
          style={{
            position: 'absolute',
            left: 96,
            bottom: 164,
            zIndex: 20,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            backgroundColor: 'rgba(10, 12, 16, 0.84)',
            borderLeft: `4px solid ${locationAccentColor}`,
            padding: '7px 16px',
            boxShadow: '0 8px 22px rgba(0, 0, 0, 0.45)',
          }}
        >
          <span
            style={{
              fontFamily: FONT_ECON_MONO,
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: '0.09em',
              color: '#F8FAFC',
            }}
          >
            {locationTag}
          </span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
