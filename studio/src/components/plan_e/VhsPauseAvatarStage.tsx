import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { PROJECTOR_SAFE_BOTTOM, SUBTITLE_SAFE_BOTTOM } from './constants';
import { EconHostAvatar } from './EconHostAvatar';
import { FONT_ECON_MONO } from './fonts';

function resolveMedia(src: string): string {
  if (/^(https?:\/\/|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

export interface VhsPauseAvatarStageProps {
  startSec: number;
  frozenImageSrc?: string;
  timecodeLabel?: string;
  avatarEmblem?: string;
}

/**
 * 案E Shot 2 象徴シーン：暗室プロジェクター＋背面スクリーン前ショット一時停止＋VHS走査線＋リモコン持ち進行役アバター。
 */
export const VhsPauseAvatarStage: React.FC<VhsPauseAvatarStageProps> = ({
  startSec,
  frozenImageSrc,
  timecodeLabel = 'II  00:00:00',
  avatarEmblem = '$?',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const localFrame = Math.max(0, frame - Math.round(startSec * fps));

  const enterSpr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 360, damping: 24, mass: 0.7 },
  });

  const scanOffset = (frame * 3) % 12;
  const jitterX = frame % 11 === 0 ? 3 : frame % 17 === 0 ? -2 : 0;
  const avatarX = interpolate(enterSpr, [0, 1], [-160, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#090A0D', overflow: 'hidden' }}>
      {/* 1. 暗室の微光とプロジェクター投射光コーン */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="room-ambient" cx="56%" cy="44%" r="60%">
            <stop offset="0%" stopColor="rgba(30, 142, 62, 0.14)" />
            <stop offset="55%" stopColor="rgba(18, 22, 28, 0.25)" />
            <stop offset="100%" stopColor="rgba(5, 6, 8, 0.96)" />
          </radialGradient>
          <linearGradient id="beam-cone" x1="0" y1="1" x2="0.4" y2="0">
            <stop offset="0%" stopColor="rgba(226, 232, 240, 0.24)" />
            <stop offset="100%" stopColor="rgba(226, 232, 240, 0.02)" />
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#room-ambient)" />
        {/* 手前プロジェクターから背面スクリーンへの光学コーン */}
        <polygon points="880,1040 940,1040 1690,150 420,150" fill="url(#beam-cone)" />
      </svg>

      {/* 2. 背面プロジェクタースクリーン（前ショット一時停止フレーム） */}
      <div
        style={{
          position: 'absolute',
          left: 410,
          right: 140,
          top: 96,
          bottom: Math.max(SUBTITLE_SAFE_BOTTOM, PROJECTOR_SAFE_BOTTOM + 6),
          zIndex: 4,
          backgroundColor: '#11151B',
          border: '10px solid #1E242D',
          boxShadow: '0 24px 68px rgba(0, 0, 0, 0.85), 0 0 60px rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
        }}
      >
        {/* ロールスクリーン上部ケース */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 16,
            backgroundColor: '#2B3340',
            zIndex: 8,
          }}
        />

        {frozenImageSrc ? (
          <Img
            src={resolveMedia(frozenImageSrc)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `translateX(${jitterX}px) scale(1.03)`,
              filter: 'contrast(1.14) saturate(0.75) brightness(0.78)',
            }}
          />
        ) : null}

        {/* VHS走査線＋水平トラッキングノイズ */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 6,
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.06) 3px, rgba(255,255,255,0.06) 5px)',
            backgroundPositionY: scanOffset,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${(sec * 22) % 85}%`,
            height: 28,
            background:
              'linear-gradient(180deg, transparent, rgba(255,255,255,0.16), transparent)',
            zIndex: 7,
            pointerEvents: 'none',
          }}
        />

        {/* 左上モノスペース VHS PAUSE タイムコード */}
        <div
          style={{
            position: 'absolute',
            top: 34,
            left: 34,
            zIndex: 9,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            backgroundColor: 'rgba(10, 12, 16, 0.84)',
            borderLeft: '6px solid #22C55E',
            padding: '10px 22px',
          }}
        >
          <span
            style={{
              fontFamily: FONT_ECON_MONO,
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: '0.14em',
              color: '#FFFFFF',
              textShadow: '2px 0 rgba(239,68,68,0.65), -2px 0 rgba(56,189,248,0.65)',
            }}
          >
            {timecodeLabel}
          </span>
        </div>
      </div>

      {/* 3. 左側手前：リモコンを持つ進行役アバター */}
      <div
        style={{
          position: 'absolute',
          left: 115,
          bottom: 48,
          zIndex: 12,
          transform: `translateX(${avatarX.toFixed(1)}px)`,
          opacity: enterSpr,
        }}
      >
        <EconHostAvatar pose="remote" emblem={avatarEmblem} scale={1.18} />
      </div>

      {/* 4. 中央下部手前：プロジェクター筐体シルエット */}
      <svg
        width="320"
        height="130"
        viewBox="0 0 320 130"
        style={{
          position: 'absolute',
          left: '48%',
          bottom: 0,
          transform: 'translateX(-50%)',
          zIndex: 14,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <rect x={45} y={42} width={230} height={88} rx={10} fill="#14181F" stroke="#334155" strokeWidth={2.5} />
        <circle cx={160} cy={72} r={26} fill="#0B0F14" stroke="#475569" strokeWidth={3} />
        {/* レンズ芯は字幕帯の真後ろに来るため、白字幕の可読性を損なわない暗めの発光に留める */}
        <circle cx={160} cy={72} r={14} fill="#94A3B8" opacity={0.32} />
        <circle cx={238} cy={62} r={4} fill="#22C55E" />
      </svg>
    </AbsoluteFill>
  );
};
