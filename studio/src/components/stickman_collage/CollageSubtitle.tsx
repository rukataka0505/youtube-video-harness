import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_SANS } from './fonts';
import { resolvePolarityTheme, type StagePolarity } from './types';

export interface CollageSubtitleCue {
  startSec: number;
  endSec: number;
  line1: string;
  line2?: string;
}

export interface CollageSubtitleProps {
  cues: readonly CollageSubtitleCue[];
  sec?: number;
  polarity?: StagePolarity;
  lightBg?: boolean;
  fontSize?: number;
  bottomOffset?: number;
  maxWidth?: string | number;
  fontFamily?: string;
}

/**
 * 暗い帯ボックスを廃した8方向アウトライン抜け感字幕。
 * polarity または lightBg から明暗極性を自動決定する。
 */
export const CollageSubtitle: React.FC<CollageSubtitleProps> = ({
  cues,
  sec,
  polarity = 'black',
  lightBg,
  fontSize = 38,
  bottomOffset = 8,
  maxWidth = '92%',
  fontFamily = FONT_SANS,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = sec ?? frame / Math.max(1, fps);

  const cue = cues.find((c) => currentSec >= c.startSec && currentSec < c.endSec);
  if (!cue) {
    return null;
  }

  const theme = resolvePolarityTheme(polarity);
  const isLight = lightBg ?? theme.subtitleIsLight;
  const textColor = isLight ? '#111111' : '#FFFFFF';
  const outlineColor = isLight ? '#FFFFFF' : '#000000';
  const shadowColor = isLight ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.92)';

  const textShadow = [
    `-2px -2px 0 ${outlineColor}`,
    `2px -2px 0 ${outlineColor}`,
    `-2px 2px 0 ${outlineColor}`,
    `2px 2px 0 ${outlineColor}`,
    `0 -2px 0 ${outlineColor}`,
    `0 2px 0 ${outlineColor}`,
    `-2px 0 0 ${outlineColor}`,
    `2px 0 0 ${outlineColor}`,
    `0 4px 14px ${shadowColor}`,
  ].join(', ');

  return (
    <div
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: '50%',
        transform: 'translateX(-50%)',
        width: maxWidth,
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 40,
        fontFamily,
      }}
    >
      <div
        style={{
          color: textColor,
          fontSize,
          fontWeight: 900,
          lineHeight: 1.38,
          letterSpacing: '0.03em',
          textShadow,
        }}
      >
        {cue.line1}
      </div>
      {cue.line2 ? (
        <div
          style={{
            color: textColor,
            fontSize,
            fontWeight: 900,
            lineHeight: 1.38,
            letterSpacing: '0.03em',
            textShadow,
          }}
        >
          {cue.line2}
        </div>
      ) : null}
    </div>
  );
};
