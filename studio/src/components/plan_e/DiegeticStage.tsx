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
import { PLAN_E_CANVAS_HEIGHT, PLAN_E_CANVAS_WIDTH, SUBTITLE_SAFE_BOTTOM } from './constants';
import {
  DiegeticCoin,
  DiegeticCounter,
  DiegeticHangTag,
  DiegeticMarkerText,
  DiegeticPhotoClip,
  DiegeticStamp,
  DiegeticXMark,
  MarkerEllipse,
} from './DiegeticProps';
import {
  CorkboardBackdrop,
  EditorialCutoutCard,
  EditorialPaperBackdrop,
} from './EditorialCutoutCard';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from './fonts';
import type { PlanEResolvedBeat, PlanESurface } from './types';

function resolveMedia(map: Record<string, string>, src?: string, key?: string): string | undefined {
  const raw = src ?? (key ? map[key] : undefined);
  if (!raw) return undefined;
  if (/^(https?:\/\/|data:|blob:|\/)/.test(raw)) return raw;
  return staticFile(raw);
}

/** 物理オーク木枠ホワイトボード背景（マクロ・diegetic_stage 共用） */
export const WhiteboardSurfaceBackdrop: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => (
  <AbsoluteFill
    style={{ background: 'linear-gradient(180deg, #E5E9F0 0%, #D2D9E3 64%, #A3B0C2 100%)' }}
  >
    <div
      style={{
        position: 'absolute',
        top: 46,
        left: 130,
        right: 130,
        bottom: SUBTITLE_SAFE_BOTTOM,
        border: '18px solid #9A6332',
        borderRadius: 12,
        background: '#F8FAFC',
        boxShadow: '0 24px 54px rgba(15,23,42,0.28), inset 0 2px 10px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
    <div
      style={{
        position: 'absolute',
        left: '34%',
        right: '34%',
        bottom: SUBTITLE_SAFE_BOTTOM - 26,
        height: 16,
        borderRadius: 4,
        background: 'linear-gradient(180deg,#E2E8F0,#64748B)',
        boxShadow: '0 4px 10px rgba(0,0,0,0.32)',
      }}
    >
      <div style={{ position: 'absolute', left: 40, top: -6, width: 70, height: 8, borderRadius: 3, background: '#1E293B' }} />
      <div style={{ position: 'absolute', left: 130, top: -6, width: 64, height: 8, borderRadius: 3, background: '#CC0000' }} />
      <div style={{ position: 'absolute', left: 214, top: -6, width: 60, height: 8, borderRadius: 3, background: '#0072B2' }} />
    </div>
  </AbsoluteFill>
);

/** ビート配列を物理小道具レイヤーとして描画する（全シーン共通オーバーレイ）。 */
export const DiegeticBeatsLayer: React.FC<{
  beats: readonly PlanEResolvedBeat[];
  imageMap: Record<string, string>;
}> = ({ beats, imageMap }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  if (!beats || beats.length === 0) return null;

  const svgProps: React.ReactNode[] = [];
  const domProps: React.ReactNode[] = [];

  beats.forEach((beat, idx) => {
    const key = beat.id ?? `beat-${idx}-${beat.prop}`;
    switch (beat.prop) {
      case 'hang_tag':
        domProps.push(
          <DiegeticHangTag
            key={key}
            atSec={beat.timeSec}
            x={beat.params.x}
            y={beat.params.y}
            price={beat.params.price}
            label={beat.params.label}
            scale={beat.params.scale}
            stringLen={beat.params.stringLen}
            swing={beat.params.swing}
            glow={beat.params.glow}
          />,
        );
        break;
      case 'photo_clip':
        domProps.push(
          <DiegeticPhotoClip
            key={key}
            atSec={beat.timeSec}
            x={beat.params.x}
            y={beat.params.y}
            width={beat.params.width}
            height={beat.params.height}
            src={resolveMedia(imageMap, beat.params.src, beat.params.imageKey)}
            objectPosition={beat.params.objectPosition}
            filter={beat.params.filter}
            caption={beat.params.caption}
            captionSize={beat.params.captionSize}
            rotateDeg={beat.params.rotateDeg}
            highlight={beat.params.highlight}
          />,
        );
        break;
      case 'stamp':
        domProps.push(
          <DiegeticStamp
            key={key}
            text={beat.params.text}
            atSec={beat.timeSec}
            size={beat.params.size}
            rotateDeg={beat.params.rotateDeg}
            color={beat.params.color}
            style={{ left: beat.params.x, top: beat.params.y }}
          />,
        );
        break;
      case 'cutout_card': {
        const { x, y, ...cardProps } = beat.params;
        const enterOffsetSec = 0;
        const card = (
          <EditorialCutoutCard
            key={key}
            {...cardProps}
            startSec={beat.timeSec}
            enterOffsetSec={enterOffsetSec}
          />
        );
        if (x !== undefined || y !== undefined) {
          domProps.push(
            <div key={key} style={{ position: 'absolute', left: x ?? 96, top: y ?? 120, zIndex: 20 }}>
              {card}
            </div>,
          );
        } else {
          domProps.push(card);
        }
        break;
      }
      case 'counter':
        domProps.push(
          <DiegeticCounter
            key={key}
            atSec={beat.timeSec}
            x={beat.params.x}
            y={beat.params.y}
            valueText={beat.params.valueText}
            label={beat.params.label}
            color={beat.params.color}
            fontSize={beat.params.fontSize}
          />,
        );
        break;
      case 'marker_write':
        svgProps.push(
          <DiegeticMarkerText
            key={key}
            atSec={beat.timeSec}
            x={beat.params.x}
            y={beat.params.y}
            text={beat.params.text}
            width={beat.params.width}
            fontSize={beat.params.fontSize}
            color={beat.params.color}
            align={beat.params.align}
            durationSec={beat.params.durationSec}
          />,
        );
        break;
      case 'marker_circle': {
        const dur = beat.params.durationSec ?? 0.45;
        const p =
          sec < beat.timeSec
            ? 0
            : interpolate(sec, [beat.timeSec, beat.timeSec + dur], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
        svgProps.push(
          <MarkerEllipse
            key={key}
            progress={p}
            cx={beat.params.cx}
            cy={beat.params.cy}
            rx={beat.params.rx}
            ry={beat.params.ry}
            color={beat.params.color}
            strokeWidth={beat.params.strokeWidth}
          />,
        );
        break;
      }
      case 'coin':
        svgProps.push(
          <DiegeticCoin
            key={key}
            atSec={beat.timeSec}
            cx={beat.params.cx}
            cy={beat.params.cy}
            r={beat.params.r}
            frac={beat.params.frac}
            face={beat.params.face}
            label={beat.params.label}
            valueText={beat.params.valueText}
            fillColor={beat.params.fillColor}
            fillDelaySec={beat.params.fillDelaySec}
            fillDurSec={beat.params.fillDurSec}
          />,
        );
        break;
      case 'x_mark':
        svgProps.push(
          <DiegeticXMark
            key={key}
            atSec={beat.timeSec}
            cx={beat.params.cx}
            cy={beat.params.cy}
            size={beat.params.size}
            color={beat.params.color}
            strokeWidth={beat.params.strokeWidth}
            durationSec={beat.params.durationSec}
          />,
        );
        break;
      case 'custom_cue':
      default:
        break;
    }
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 24 }}>
      {svgProps.length > 0 ? (
        <svg
          width={PLAN_E_CANVAS_WIDTH}
          height={PLAN_E_CANVAS_HEIGHT}
          viewBox={`0 0 ${PLAN_E_CANVAS_WIDTH} ${PLAN_E_CANVAS_HEIGHT}`}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}
        >
          {svgProps}
        </svg>
      ) : null}
      {domProps}
    </AbsoluteFill>
  );
};

export interface DiegeticStageProps {
  startSec: number;
  endSec: number;
  surface: PlanESurface;
  beats?: readonly PlanEResolvedBeat[];
  imageMap: Record<string, string>;
  videoMap: Record<string, string>;
  mastheadTitle?: string;
  mastheadSubtitle?: string;
  badgeText?: string;
  title?: string;
  showRedString?: boolean;
  pins?: readonly [number, number][];
  backgroundImageKey?: string;
  backgroundImageSrc?: string;
  backgroundVideoKey?: string;
  backgroundVideoSrc?: string;
  backgroundBlurPx?: number;
  backgroundBrightness?: number;
}

/**
 * 案E v3.0 物理ビート演出ステージ（`diegetic_stage`）。
 * 紙面・白板・コルク・黒板・暗卓・暗室実写・プロジェクター背景上で `beats` を自動再生する。
 */
export const DiegeticStage: React.FC<DiegeticStageProps> = ({
  startSec,
  endSec,
  surface,
  beats = [],
  imageMap,
  videoMap,
  mastheadTitle,
  mastheadSubtitle,
  badgeText,
  title,
  showRedString = false,
  pins,
  backgroundImageKey,
  backgroundImageSrc,
  backgroundVideoKey,
  backgroundVideoSrc,
  backgroundBlurPx = 6,
  backgroundBrightness = 0.55,
}) => {
  const { fps } = useVideoConfig();
  const bgVid = resolveMedia(videoMap, backgroundVideoSrc, backgroundVideoKey);
  const bgImg = resolveMedia(imageMap, backgroundImageSrc, backgroundImageKey);

  const beatsOverlay = (
    <>
      {badgeText || title ? (
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: 96,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            zIndex: 22,
          }}
        >
          {badgeText ? (
            <span
              style={{
                background: surface === 'paper' || surface === 'whiteboard' ? '#16130F' : '#CC0000',
                color: '#FAF8F3',
                fontFamily: FONT_ECON_SANS,
                fontWeight: 900,
                fontSize: 28,
                padding: '3px 16px',
                letterSpacing: '0.16em',
              }}
            >
              {badgeText}
            </span>
          ) : null}
          {title ? (
            <span
              style={{
                fontFamily: FONT_ECON_SERIF,
                fontWeight: 900,
                fontSize: 40,
                color: surface === 'paper' || surface === 'whiteboard' ? '#16130F' : '#F8FAFC',
              }}
            >
              {title}
            </span>
          ) : null}
        </div>
      ) : null}
      <DiegeticBeatsLayer beats={beats} imageMap={imageMap} />
    </>
  );

  if (surface === 'paper') {
    return (
      <EditorialPaperBackdrop mastheadTitle={mastheadTitle} mastheadSubtitle={mastheadSubtitle}>
        {beatsOverlay}
      </EditorialPaperBackdrop>
    );
  }
  if (surface === 'corkboard') {
    return (
      <CorkboardBackdrop showRedString={showRedString} pins={pins}>
        {beatsOverlay}
      </CorkboardBackdrop>
    );
  }
  if (surface === 'whiteboard') {
    return (
      <WhiteboardSurfaceBackdrop>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {title ? (
            <div
              style={{
                padding: '22px 34px',
                fontFamily: FONT_ECON_SERIF,
                fontWeight: 900,
                fontSize: 38,
                color: '#0F172A',
              }}
            >
              {title}
            </div>
          ) : null}
        </div>
        <DiegeticBeatsLayer beats={beats} imageMap={imageMap} />
      </WhiteboardSurfaceBackdrop>
    );
  }

  const darkBgColor =
    surface === 'projector' ? '#050608' : surface === 'dark_desk' ? '#120E0B' : '#0A0C10';
  const seqFrom = Math.max(0, Math.floor(startSec * fps));
  const seqDur = Math.max(2, Math.ceil((endSec - startSec) * fps) + 4);

  return (
    <AbsoluteFill style={{ backgroundColor: darkBgColor, overflow: 'hidden' }}>
      {bgVid ? (
        <Sequence from={seqFrom} durationInFrames={seqDur} layout="none">
          <OffthreadVideo
            muted
            src={bgVid}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: `blur(${backgroundBlurPx}px) brightness(${backgroundBrightness})`,
              transform: 'scale(1.06)',
            }}
          />
        </Sequence>
      ) : bgImg ? (
        <Img
          src={bgImg}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: `blur(${backgroundBlurPx}px) brightness(${backgroundBrightness})`,
            transform: 'scale(1.06)',
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 84% 78% at 50% 44%, transparent 30%, rgba(6,8,11,0.74) 100%)',
        }}
      />
      {mastheadTitle ? (
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: 96,
            fontFamily: FONT_ECON_MONO,
            fontWeight: 900,
            fontSize: 24,
            letterSpacing: '0.18em',
            color: '#94A3B8',
            zIndex: 20,
          }}
        >
          {mastheadTitle}
        </div>
      ) : null}
      {beatsOverlay}
    </AbsoluteFill>
  );
};
