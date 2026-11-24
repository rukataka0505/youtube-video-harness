import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_SANS } from './fonts';

export interface SubtitleCue {
  startSec: number;
  endSec: number;
  line1: string;
  line2?: string;
}

export interface CleanSubtitleProps {
  cues: SubtitleCue[];
  /** 未指定時は useCurrentFrame() / fps から自動算出する */
  sec?: number;
  lightBg?: boolean;
  fontSize?: number;
  bottomOffset?: number;
  maxWidth?: string | number;
  fontFamily?: string;
}

/**
 * 暗い帯ボックスを廃した抜け感ベース字幕。
 * 8方向アウトライン＋ドロップシャドウにより、暗背景・明背景どちらでもクッキリ読める。
 */
export const CleanSubtitle: React.FC<CleanSubtitleProps> = ({
  cues,
  sec,
  lightBg = false,
  fontSize = 31,
  bottomOffset = 6,
  maxWidth = '92%',
  fontFamily = FONT_SANS,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = sec ?? frame / fps;

  const cue = cues.find((c) => currentSec >= c.startSec && currentSec < c.endSec);
  if (!cue) return null;

  const textColor = lightBg ? '#0F172A' : '#FFFFFF';
  const outlineColor = lightBg ? '#FFFFFF' : '#000000';
  const shadowColor = lightBg ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.92)';

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
