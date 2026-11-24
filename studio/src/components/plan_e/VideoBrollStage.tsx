import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { SUBTITLE_SAFE_BOTTOM } from './constants';
import { EditorialCutoutCard, EditorialCutoutCardProps } from './EditorialCutoutCard';
import { RgbGlitchBurst } from './RgbGlitchBurst';
import { FONT_ECON_MONO } from './fonts';
import { PlanEBrollCut, PlanEBrollGrade, PlanEBrollMotion } from './types';

function resolveMedia(src: string): string {
  if (/^(https?:\/\/|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

function gradeFilter(grade: PlanEBrollGrade): string {
  switch (grade) {
    case 'crisis_desat':
      return 'contrast(1.18) saturate(0.54) brightness(0.82)';
    case 'warm_night':
      return 'contrast(1.12) saturate(1.14) brightness(0.90)';
    case 'clean_bright':
      return 'contrast(1.04) saturate(1.05) brightness(0.96)';
    case 'editorial_cool':
      return 'contrast(1.10) saturate(0.86) brightness(0.90)';
    default:
      return 'contrast(1.08) saturate(0.94) brightness(0.88)';
  }
}

function motionTransform(
  motion: PlanEBrollMotion,
  progress: number,
  customZoom?: readonly [number, number],
  mirror = false,
): string {
  const mirrorSuffix = mirror ? ' scaleX(-1)' : '';
  if (customZoom) {
    const sc = interpolate(progress, [0, 1], [customZoom[0], customZoom[1]]);
    return `scale(${sc.toFixed(4)})${mirrorSuffix}`;
  }
  switch (motion) {
    case 'slow_zoom_in':
      return `scale(${interpolate(progress, [0, 1], [1.0, 1.09]).toFixed(4)})${mirrorSuffix}`;
    case 'slow_zoom_out':
      return `scale(${interpolate(progress, [0, 1], [1.10, 1.01]).toFixed(4)})${mirrorSuffix}`;
    case 'pan_left':
      return `scale(1.08) translateX(${interpolate(progress, [0, 1], [22, -22]).toFixed(1)}px)${mirrorSuffix}`;
    case 'pan_right':
      return `scale(1.08) translateX(${interpolate(progress, [0, 1], [-22, 22]).toFixed(1)}px)${mirrorSuffix}`;
    default:
      return `scale(1.02)${mirrorSuffix}`;
  }
}

export interface VideoBrollStageProps {
  startSec: number;
  endSec: number;
  videoSrc?: string;
  imageSrc?: string;
  cuts?: readonly (PlanEBrollCut & { resolvedVideoSrc?: string; resolvedImageSrc?: string })[];
  motion?: PlanEBrollMotion;
  grade?: PlanEBrollGrade;
  vignetteStrength?: number;
  glitchIntroSec?: number;
  locationTag?: string;
  playbackRate?: number;
  trimBeforeSec?: number;
  blurPx?: number;
  brightness?: number;
  saturate?: number;
  mirror?: boolean;
  objectPosition?: string;
  zoom?: readonly [number, number];
  /** 実写Bロール上に重ねる新聞切り抜き・三行広告カード */
  overlayCutout?: EditorialCutoutCardProps;
}

/**
 * 案E フルブリード実写動画Bロール（<OffthreadVideo>）＆高速写真モンタージュステージ。
 * trimBeforeSec / blurPx / mirror / brightness / objectPosition / zoom を標準サポート。
 */
export const VideoBrollStage: React.FC<VideoBrollStageProps> = ({
  startSec,
  endSec,
  videoSrc,
  imageSrc,
  cuts,
  motion = 'slow_zoom_in',
  grade = 'cinematic_vignette',
  vignetteStrength = 0.62,
  glitchIntroSec = 0,
  locationTag,
  playbackRate = 1,
  trimBeforeSec = 0,
  blurPx = 0,
  brightness,
  saturate,
  mirror = false,
  objectPosition = '50% 50%',
  zoom,
  overlayCutout,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const totalDur = Math.max(0.2, endSec - startSec);
  const localSec = Math.max(0, sec - startSec);

  const hasCuts = Boolean(cuts && cuts.length > 0);
  let activeCutIdx = 0;
  let cutStart = startSec;
  let cutEnd = endSec;
  let activeCaption = locationTag;

  if (hasCuts && cuts) {
    const sliceDur = totalDur / cuts.length;
    activeCutIdx = Math.min(cuts.length - 1, Math.max(0, Math.floor(localSec / sliceDur)));
    cutStart = startSec + activeCutIdx * sliceDur;
    cutEnd = Math.min(endSec, cutStart + sliceDur);
    activeCaption = cuts[activeCutIdx].caption ?? locationTag;
  }

  const segProgress = interpolate(sec, [cutStart, Math.max(cutStart + 0.1, cutEnd)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const activeCut = hasCuts && cuts ? cuts[activeCutIdx] : undefined;
  const effectiveVideo = activeCut ? activeCut.resolvedVideoSrc : videoSrc;
  const effectiveImage = activeCut ? activeCut.resolvedImageSrc : imageSrc;
  const effectiveMotion = activeCut?.motion ?? motion;
  const effectiveTrimBefore = activeCut?.trimBeforeSec ?? trimBeforeSec;
  const effectiveBlur = activeCut?.blurPx ?? blurPx;
  const effectiveMirror = activeCut?.mirror ?? mirror;
  const effectiveObjPos = activeCut?.objectPosition ?? objectPosition;
  const effectiveZoom = activeCut?.zoom ?? zoom;
  const effectiveBrightness = activeCut?.brightness ?? brightness;
  const effectiveSaturate = activeCut?.saturate ?? saturate;

  const seqFrom = Math.max(0, Math.floor(cutStart * fps));
  const seqDur = Math.max(2, Math.ceil((cutEnd - cutStart) * fps) + 4);
  const trimFrames = Math.max(0, Math.round(effectiveTrimBefore * fps));

  const inGlitch = glitchIntroSec > 0 && localSec < glitchIntroSec;
  const glitchSeed = frame * 17;
  const glitchJitterX = inGlitch ? Math.sin(glitchSeed) * 26 : 0;

  const extraFilterParts: string[] = [gradeFilter(grade)];
  if (effectiveBlur > 0) extraFilterParts.push(`blur(${effectiveBlur}px)`);
  if (effectiveBrightness !== undefined) extraFilterParts.push(`brightness(${effectiveBrightness})`);
  if (effectiveSaturate !== undefined) extraFilterParts.push(`saturate(${effectiveSaturate})`);
  if (inGlitch) extraFilterParts.push('hue-rotate(18deg) saturate(1.6)');

  return (
    <AbsoluteFill style={{ backgroundColor: '#090B0E', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `${motionTransform(effectiveMotion, segProgress, effectiveZoom, effectiveMirror)} translateX(${glitchJitterX.toFixed(1)}px)`,
          filter: extraFilterParts.join(' '),
        }}
      >
        {effectiveVideo ? (
          <Sequence key={`vid-seq-${seqFrom}-${activeCutIdx}`} from={seqFrom} durationInFrames={seqDur} layout="none">
            <OffthreadVideo
              src={resolveMedia(effectiveVideo)}
              muted
              playbackRate={playbackRate}
              trimBefore={trimFrames}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: effectiveObjPos }}
            />
          </Sequence>
        ) : effectiveImage ? (
          <Img
            src={resolveMedia(effectiveImage)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: effectiveObjPos }}
          />
        ) : null}
      </div>

      {/* ドキュメンタリー調ビネット＆下部字幕視認用ボトムグラデーション */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: `radial-gradient(ellipse 84% 78% at 50% 46%, transparent 38%, rgba(8, 10, 14, ${vignetteStrength.toFixed(2)}) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(8,10,14,0.18) 0%, transparent 24%, transparent 68%, rgba(8,10,14,0.72) 100%)',
        }}
      />

      {/* RGBグリッチ転換オーバーレイ */}
      {inGlitch ? (
        <RgbGlitchBurst startSec={startSec} durationSec={glitchIntroSec} zIndex={12} />
      ) : null}

      {/* 実写Bロール上に差し込む物理三行広告／切り抜きカード */}
      {overlayCutout ? (
        <div
          style={{
            position: 'absolute',
            top: 72,
            right: 96,
            bottom: SUBTITLE_SAFE_BOTTOM + 24,
            zIndex: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            pointerEvents: 'none',
          }}
        >
          <EditorialCutoutCard
            {...overlayCutout}
            startSec={overlayCutout.startSec ?? startSec}
          />
        </div>
      ) : null}

      {/* 控えめな報道ロケーション／機関ラベル */}
      {activeCaption ? (
        <div
          style={{
            position: 'absolute',
            left: 112,
            bottom: SUBTITLE_SAFE_BOTTOM,
            zIndex: 15,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            backgroundColor: 'rgba(12, 14, 18, 0.78)',
            borderLeft: '4px solid #22C55E',
            padding: '7px 16px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <span
            style={{
              fontFamily: FONT_ECON_MONO,
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: '0.09em',
              color: '#F8FAFC',
            }}
          >
            {activeCaption}
          </span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
