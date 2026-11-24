import React from 'react';
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveStickmanMediaSrc } from './beatUtils';
import { FONT_SANS, FONT_SERIF, FONT_UI_SANS } from './fonts';
import { resolvePolarityTheme, type StagePolarity } from './types';

export type ClippingVariant = 'editorial_serif' | 'broadsheet' | 'web_news';

export interface ClippingCardProps {
  variant?: ClippingVariant;
  polarity?: StagePolarity;
  publicationName: string;
  categoryLabel?: string;
  accentColor?: string;
  publicationColor?: string;
  headline?: string;
  headlinePrefix?: string;
  highlightedHeadline?: string;
  headlineSuffix?: string;
  subHeadline?: string;
  excerpt?: string;
  imageSrc?: string;
  imagePosition?: 'left' | 'right';
  imageHeight?: number;
  startSec: number;
  sec?: number;
  rotateDeg?: number;
  width?: number | string;
  highlightDelaySec?: number;
  highlightDurationSec?: number;
  highlightColor?: string;
  style?: React.CSSProperties;
}

/**
 * 新聞・Web報道記事紙面カード（画面内出典フッターは設けず、概要欄集約原則を構造保証）。
 */
export const ClippingCard: React.FC<ClippingCardProps> = ({
  variant = 'editorial_serif',
  polarity = 'black',
  publicationName,
  categoryLabel,
  accentColor,
  publicationColor,
  headline,
  headlinePrefix,
  highlightedHeadline,
  headlineSuffix,
  subHeadline,
  excerpt,
  imageSrc,
  imagePosition = 'right',
  imageHeight = 200,
  startSec,
  sec,
  rotateDeg = 0,
  width = 960,
  highlightDelaySec = 0.25,
  highlightDurationSec = 0.55,
  highlightColor = 'rgba(253, 224, 71, 0.88)',
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = sec ?? frame / Math.max(1, fps);

  if (currentSec < startSec) {
    return null;
  }

  const theme = resolvePolarityTheme(polarity);
  const startFrame = Math.round(startSec * fps);
  const localFrame = Math.max(0, frame - startFrame);
  const spr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 440, damping: 24, mass: 0.65 },
  });

  const safeHlDur = Math.max(0.05, highlightDurationSec);
  const highlightPct = interpolate(
    currentSec,
    [startSec + highlightDelaySec, startSec + highlightDelaySec + safeHlDur],
    [0, 100],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );

  const scale = interpolate(spr, [0, 1], [1.08, 1.0]);
  const translateY = interpolate(spr, [0, 1], [-22, 0]);
  const dynamicRotate =
    rotateDeg + interpolate(spr, [0, 1], [rotateDeg >= 0 ? 1.8 : -1.8, 0]);

  const resolvedAccent =
    accentColor ??
    (variant === 'web_news'
      ? '#CC0000'
      : variant === 'broadsheet'
        ? '#18181B'
        : '#B21F24');

  const resolvedPaperBg =
    variant === 'broadsheet'
      ? '#F3EFE4'
      : variant === 'web_news'
        ? '#FFFFFF'
        : '#FAF8F3';

  const resolvedPubColor =
    publicationColor ?? (variant === 'editorial_serif' ? '#052962' : '#18181B');

  const hasSplitHighlight =
    headlinePrefix !== undefined ||
    highlightedHeadline !== undefined ||
    headlineSuffix !== undefined;

  const boxShadow = theme.isLight
    ? '8px 10px 0 rgba(17, 17, 17, 0.22)'
    : '0 30px 70px rgba(0, 0, 0, 0.90)';

  const renderHeadline = (fontFamily: string, color: string) => (
    <div
      style={{
        fontFamily,
        fontSize: 32,
        fontWeight: 900,
        lineHeight: 1.34,
        lineBreak: 'strict',
        wordBreak: 'keep-all',
        overflowWrap: 'break-word',
        color,
      }}
    >
      {hasSplitHighlight ? (
        <>
          {headlinePrefix}
          {highlightedHeadline ? (
            <span
              style={{
                backgroundImage: `linear-gradient(transparent 52%, ${highlightColor} 52%)`,
                backgroundSize: `${highlightPct}% 100%`,
                backgroundRepeat: 'no-repeat',
              }}
            >
              {highlightedHeadline}
            </span>
          ) : null}
          {headlineSuffix}
        </>
      ) : (
        headline
      )}
    </div>
  );

  const imageBlock = imageSrc ? (
    <div
      style={{
        flex: 0.88,
        height: imageHeight,
        overflow: 'hidden',
        border: '1.5px solid #C8C1B2',
      }}
    >
      <Img
        src={resolveStickmanMediaSrc(imageSrc)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  ) : null;

  const textBlock = (
    <div style={{ flex: 1.25 }}>
      {renderHeadline(
        variant === 'web_news' ? FONT_SANS : FONT_SERIF,
        variant === 'web_news' ? '#111111' : '#111827',
      )}
      {subHeadline ? (
        <div
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 18,
            color: '#4B5563',
            marginTop: 9,
            fontStyle: variant === 'web_news' ? 'normal' : 'italic',
          }}
        >
          {subHeadline}
        </div>
      ) : null}
      {excerpt ? (
        <div
          style={{
            fontFamily: FONT_UI_SANS,
            fontSize: 15,
            color: '#52525B',
            marginTop: 10,
            lineHeight: 1.55,
          }}
        >
          {excerpt}
        </div>
      ) : null}
    </div>
  );

  if (variant === 'web_news') {
    return (
      <div
        style={{
          width,
          backgroundColor: resolvedPaperBg,
          color: '#111827',
          border: theme.isLight ? '3.5px solid #111111' : '1px solid #E5E7EB',
          boxShadow,
          transform: `translateY(${translateY}px) scale(${scale}) rotate(${dynamicRotate}deg)`,
          overflow: 'hidden',
          ...style,
        }}
      >
        <div
          style={{
            backgroundColor: resolvedAccent,
            padding: '10px 26px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <span
            style={{
              color: '#FFFFFF',
              fontFamily: FONT_UI_SANS,
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: '-0.03em',
            }}
          >
            {publicationName}
          </span>
          {categoryLabel ? (
            <span
              style={{
                color: 'rgba(255, 255, 255, 0.92)',
                fontFamily: FONT_UI_SANS,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.12em',
              }}
            >
              {categoryLabel}
            </span>
          ) : null}
        </div>
        <div style={{ padding: '20px 28px' }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            {imagePosition === 'left' ? (
              <>
                {imageBlock}
                {textBlock}
              </>
            ) : (
              <>
                {textBlock}
                {imageBlock}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'broadsheet') {
    return (
      <div
        style={{
          width,
          backgroundColor: resolvedPaperBg,
          color: '#18181B',
          border: theme.isLight ? '3.5px solid #111111' : '1px solid #C8C1B2',
          boxShadow,
          transform: `translateY(${translateY}px) scale(${scale}) rotate(${dynamicRotate}deg)`,
          padding: '18px 32px 24px',
          ...style,
        }}
      >
        <div
          style={{
            textAlign: 'center',
            borderBottom: `3px double ${resolvedAccent}`,
            paddingBottom: 8,
          }}
        >
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 34,
              fontWeight: 900,
              letterSpacing: '0.02em',
              color: resolvedPubColor,
            }}
          >
            {publicationName}
          </div>
          {categoryLabel ? (
            <div
              style={{
                fontFamily: FONT_UI_SANS,
                fontSize: 12,
                color: '#52525B',
                letterSpacing: '0.16em',
                marginTop: 2,
              }}
            >
              {categoryLabel}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 16, alignItems: 'center' }}>
          {imagePosition === 'left' ? (
            <>
              {imageBlock}
              {textBlock}
            </>
          ) : (
            <>
              {textBlock}
              {imageBlock}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width,
        backgroundColor: resolvedPaperBg,
        color: '#121212',
        border: theme.isLight ? '3.5px solid #111111' : undefined,
        borderTop: `12px solid ${resolvedAccent}`,
        boxShadow,
        transform: `translateY(${translateY}px) scale(${scale}) rotate(${dynamicRotate}deg)`,
        padding: '22px 32px 26px',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          borderBottom: '1px solid #D6D3CD',
          paddingBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 30,
            fontWeight: 900,
            color: resolvedPubColor,
            letterSpacing: '-0.02em',
          }}
        >
          {publicationName}
        </span>
        {categoryLabel ? (
          <span
            style={{
              fontFamily: FONT_UI_SANS,
              fontSize: 15,
              fontWeight: 800,
              color: resolvedAccent,
              letterSpacing: '0.08em',
            }}
          >
            {categoryLabel}
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 18, alignItems: 'center' }}>
        {imagePosition === 'left' ? (
          <>
            {imageBlock}
            {textBlock}
          </>
        ) : (
          <>
            {textBlock}
            {imageBlock}
          </>
        )}
      </div>
    </div>
  );
};
