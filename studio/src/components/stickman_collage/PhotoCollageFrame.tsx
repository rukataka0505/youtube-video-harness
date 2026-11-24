import React from 'react';
import { Img, interpolate, spring, useVideoConfig } from 'remotion';
import { resolveStickmanMediaSrc } from './beatUtils';
import { FONT_HAND, FONT_SANS } from './fonts';
import {
  resolvePolarityTheme,
  type StagePolarity,
  type StickmanPhotoVariant,
} from './types';

export interface PhotoCollageFrameProps {
  src: string;
  variant?: StickmanPhotoVariant;
  polarity?: StagePolarity;
  width?: number;
  height?: number;
  rotateDeg?: number;
  zoomFrom?: number;
  zoomTo?: number;
  objectPosition?: string;
  /** 人名・被写体名など（出典クレジット表記は禁止） */
  labelJa?: string;
  tape?: boolean;
  dim?: number;
  sec: number;
  triggerSec?: number;
  durationSec?: number;
  style?: React.CSSProperties;
}

/**
 * 実写・人物写真・透過切り抜き用のコラージュ枠。
 * - polaroid_person: 人名が出た際の本人写真用（顔切れ防止 objectPosition 既定 '50% 20%' + 下余白に名前）
 * - tape_scrap: 実在具体物・店舗・情景スクラップ（テープ留め＋紙縁＋ケンバーンズ）
 * - cutout: 透過切り抜きステッカー
 * - vignette_blend: 黒背景へ溶け込むソフトビネット（白紙極性時は自動テープ枠フォールバック）
 */
export const PhotoCollageFrame: React.FC<PhotoCollageFrameProps> = ({
  src,
  variant = 'tape_scrap',
  polarity = 'black',
  width = 620,
  height = 460,
  rotateDeg = -2.2,
  zoomFrom = 1.02,
  zoomTo = 1.1,
  objectPosition,
  labelJa,
  tape = true,
  dim = 0,
  sec,
  triggerSec = 0,
  durationSec = 6,
  style,
}) => {
  const { fps } = useVideoConfig();
  if (!src || sec < triggerSec) {
    return null;
  }

  const theme = resolvePolarityTheme(polarity);
  const effectiveVariant: StickmanPhotoVariant =
    variant === 'vignette_blend' && theme.isLight ? 'tape_scrap' : variant;

  const localFrame = Math.max(0, (sec - triggerSec) * fps);
  const sp = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 420, damping: 24, mass: 0.65 },
  });
  const opacity = interpolate(sp, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
  const popScale = interpolate(sp, [0, 1], [1.09, 1]);
  const ty = interpolate(sp, [0, 1], [-28, 0]);
  const safeSpan = Math.max(0.5, durationSec);
  const kbZoom = interpolate(sec, [triggerSec, triggerSec + safeSpan], [zoomFrom, zoomTo], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const resolvedSrc = resolveStickmanMediaSrc(src);
  const resolvedObjPos =
    objectPosition ?? (effectiveVariant === 'polaroid_person' ? '50% 20%' : '50% 50%');

  if (effectiveVariant === 'cutout') {
    return (
      <div
        style={{
          width,
          height,
          opacity,
          transform: `translateY(${ty}px) rotate(${rotateDeg + (1 - sp) * 2}deg) scale(${popScale})`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          ...style,
        }}
      >
        <Img
          src={resolvedSrc}
          style={{
            maxWidth: '100%',
            maxHeight: labelJa ? '86%' : '100%',
            objectFit: 'contain',
            objectPosition: resolvedObjPos,
            transform: `scale(${kbZoom})`,
            filter: theme.isLight
              ? 'drop-shadow(0 8px 16px rgba(17, 17, 17, 0.25))'
              : 'drop-shadow(0 12px 28px rgba(0, 0, 0, 0.85))',
          }}
        />
        {labelJa ? (
          <div
            style={{
              marginTop: 8,
              padding: '4px 18px',
              backgroundColor: '#FAF8F3',
              border: '2.5px solid #1C1917',
              transform: 'rotate(-1.8deg)',
              boxShadow: theme.isLight
                ? '4px 4px 0 rgba(28, 25, 23, 0.2)'
                : '0 8px 18px rgba(0, 0, 0, 0.65)',
              fontFamily: FONT_HAND,
              fontSize: 22,
              fontWeight: 700,
              color: '#1C1917',
              whiteSpace: 'nowrap',
            }}
          >
            {labelJa}
          </div>
        ) : null}
      </div>
    );
  }

  if (effectiveVariant === 'vignette_blend') {
    const vignetteMask =
      'radial-gradient(ellipse 76% 74% at 50% 50%, rgba(0,0,0,1) 58%, rgba(0,0,0,0) 98%)';
    return (
      <div
        style={{
          width,
          height,
          opacity,
          transform: `translateY(${ty}px) rotate(${rotateDeg}deg) scale(${popScale})`,
          overflow: 'hidden',
          WebkitMaskImage: vignetteMask,
          maskImage: vignetteMask,
          position: 'relative',
          ...style,
        }}
      >
        <Img
          src={resolvedSrc}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: resolvedObjPos,
            transform: `scale(${kbZoom})`,
            filter: 'contrast(1.06) saturate(0.95)',
          }}
        />
        {dim > 0 ? (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(0,0,0,${dim})` }} />
        ) : null}
      </div>
    );
  }

  const isPerson = effectiveVariant === 'polaroid_person';
  const bottomPad = isPerson || labelJa ? 56 : 14;
  const frameBg = '#FAF8F3';

  return (
    <div
      style={{
        width,
        height,
        padding: `14px 14px ${bottomPad}px`,
        boxSizing: 'border-box',
        backgroundColor: frameBg,
        border: theme.isLight ? '4px solid #111111' : '1px solid rgba(255,255,255,0.22)',
        boxShadow: theme.isLight
          ? '9px 10px 0 rgba(17, 17, 17, 0.24)'
          : '0 26px 60px rgba(0, 0, 0, 0.85)',
        opacity,
        transform: `translateY(${ty}px) rotate(${rotateDeg + (1 - sp) * 2}deg) scale(${popScale})`,
        position: 'relative',
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
            objectPosition: resolvedObjPos,
            transform: `scale(${kbZoom})`,
            filter: 'contrast(1.05) saturate(0.96)',
          }}
        />
        {dim > 0 ? (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(0,0,0,${dim})` }} />
        ) : null}
      </div>

      {tape ? (
        <div
          style={{
            position: 'absolute',
            top: -18,
            left: '50%',
            width: Math.min(180, width * 0.34),
            height: 36,
            backgroundColor: 'rgba(253, 224, 71, 0.62)',
            border: theme.isLight ? '2px solid rgba(17,17,17,0.22)' : 'none',
            transform: 'translateX(-50%) rotate(-4deg)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.22)',
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
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: isPerson ? FONT_SANS : FONT_HAND,
            fontSize: 24,
            fontWeight: 900,
            color: '#111111',
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
