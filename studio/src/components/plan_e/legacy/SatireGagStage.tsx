import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { EconHostAvatar } from '../EconHostAvatar';
import { PlanESatireGagMode } from './typesV2';

function resolveMedia(src: string): string {
  if (/^(https?:\/\/|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

export interface SatireGagStageProps {
  startSec: number;
  endSec: number;
  mode: PlanESatireGagMode;
  backgroundVideoSrc?: string;
  targetImageSrc?: string;
  transformedImageSrc?: string;
  propImageSrc?: string;
  avatarEmblem?: string;
}

/**
 * 案E 実写動画背景＋2D風刺アバター＆コラージュギャグステージ。
 * - avatar_talk (Shot 6): 芝生公園実写動画前に $? アバターが登場し指差し→両手広げへ変化
 * - mallet_knight (Shot 7): アンクル・サムを木槌で叩く→甲冑騎士へ変化→めまい星旋回
 * - middleman_handshake (Shot 16): 市場背景前に左右グレーNPCが100ドル紙幣越しに握手し、中央で $? が指を組む
 */
export const SatireGagStage: React.FC<SatireGagStageProps> = ({
  startSec,
  endSec,
  mode,
  backgroundVideoSrc,
  targetImageSrc,
  transformedImageSrc,
  propImageSrc,
  avatarEmblem = '$?',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const localSec = Math.max(0, sec - startSec);
  const localFrame = Math.max(0, frame - Math.round(startSec * fps));
  const dur = Math.max(0.2, endSec - startSec);

  const seqFrom = Math.max(0, Math.floor(startSec * fps));
  const seqDur = Math.max(2, Math.ceil(dur * fps) + 4);

  const enterSpr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 400, damping: 22, mass: 0.65 },
  });

  // Mallet gag timings
  const impactSec = 1.05;
  const dizzyStartSec = 1.72;
  const hitYet = localSec >= impactSec;
  const dizzyYet = localSec >= dizzyStartSec;

  let malletDeg = -75;
  if (localSec < impactSec) {
    const p = interpolate(localSec, [0.25, impactSec], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    malletDeg = interpolate(p * p, [0, 1], [-75, 42]);
  } else {
    const reb = interpolate(localSec, [impactSec, dizzyStartSec], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    malletDeg = interpolate(reb, [0, 0.35, 1], [42, -58, -32]);
  }

  const impactFlash =
    localSec >= impactSec && localSec < impactSec + 0.18
      ? interpolate(localSec, [impactSec, impactSec + 0.18], [0.85, 0], { extrapolateRight: 'clamp' })
      : 0;

  const shakeX =
    localSec >= impactSec && localSec < impactSec + 0.28
      ? Math.sin(localSec * 95) * 14 * (1 - (localSec - impactSec) / 0.28)
      : 0;
  const shakeY =
    localSec >= impactSec && localSec < impactSec + 0.28
      ? Math.cos(localSec * 82) * 9 * (1 - (localSec - impactSec) / 0.28)
      : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#1E293B',
        overflow: 'hidden',
        transform: `translate(${shakeX.toFixed(1)}px, ${shakeY.toFixed(1)}px)`,
      }}
    >
      {/* 1. 背景フルブリード実写動画Bロール */}
      {backgroundVideoSrc ? (
        <Sequence from={seqFrom} durationInFrames={seqDur} layout="none">
          <OffthreadVideo
            src={resolveMedia(backgroundVideoSrc)}
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter:
                mode === 'middleman_handshake'
                  ? 'contrast(1.06) brightness(0.76) saturate(0.88)'
                  : 'contrast(1.05) brightness(0.96) saturate(1.12)',
            }}
          />
        </Sequence>
      ) : null}

      {/* 下部字幕が確実に読めるよう、下端グラデーション */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: 'linear-gradient(180deg, transparent 62%, rgba(8, 12, 16, 0.56) 100%)',
        }}
      />

      {/* 2A. avatar_talk モード (Shot 6) */}
      {mode === 'avatar_talk' ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 42,
            transform: `translateX(-50%) translateY(${interpolate(enterSpr, [0, 1], [180, 0]).toFixed(1)}px)`,
            opacity: enterSpr,
            zIndex: 12,
          }}
        >
          <EconHostAvatar
            pose={localSec < dur * 0.48 ? 'point_up' : 'open_hands'}
            emblem={avatarEmblem}
            scale={1.36}
          />
        </div>
      ) : null}

      {/* 2B. mallet_knight モード (Shot 7) */}
      {mode === 'mallet_knight' ? (
        <>
          {/* 左側：進行役アバター（木槌振り下ろし→跳ね返り→めまい星） */}
          <div
            style={{
              position: 'absolute',
              left: 340,
              bottom: 48,
              zIndex: 14,
            }}
          >
            <EconHostAvatar
              pose={dizzyYet ? 'dizzy' : 'mallet_swing'}
              malletSwingDeg={malletDeg}
              emblem={avatarEmblem}
              scale={1.26}
            />
          </div>

          {/* 右側：アンクル・サム → 衝撃後に甲冑騎士へ変化 */}
          <div
            style={{
              position: 'absolute',
              right: hitYet ? 220 : 260,
              bottom: hitYet ? 0 : 92,
              width: hitYet ? 560 : 540,
              height: hitYet ? 775 : 670,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              zIndex: 12,
            }}
          >
            {!hitYet && targetImageSrc ? (
              <Img
                src={resolveMedia(targetImageSrc)}
                style={{
                  maxWidth: '100%',
                  maxHeight: '88%',
                  objectFit: 'contain',
                  transform: `scale(${interpolate(enterSpr, [0, 1], [0.6, 1.0])})`,
                  filter: 'drop-shadow(0 16px 32px rgba(0,0,0,0.45))',
                }}
              />
            ) : transformedImageSrc ? (
              <Img
                src={resolveMedia(transformedImageSrc)}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  transform: `scale(${interpolate(
                    spring({
                      frame: Math.max(0, frame - Math.round((startSec + impactSec) * fps)),
                      fps,
                      config: { stiffness: 520, damping: 16, mass: 0.55 },
                    }),
                    [0, 1],
                    [1.18, 1.0],
                  )})`,
                  filter: 'drop-shadow(0 20px 38px rgba(0,0,0,0.55))',
                }}
              />
            ) : null}

            {/* 衝撃スターバースト */}
            {impactFlash > 0.02 ? (
              <svg
                width="360"
                height="360"
                viewBox="-120 -120 240 240"
                style={{
                  position: 'absolute',
                  left: -40,
                  top: 80,
                  opacity: impactFlash,
                  pointerEvents: 'none',
                }}
                aria-hidden="true"
              >
                <polygon
                  points="0,-108 18,-36 92,-68 42,-8 106,36 32,36 52,102 0,48 -56,102 -36,36 -108,32 -42,-12 -88,-72 -18,-38"
                  fill="#FDE047"
                  stroke="#EA580C"
                  strokeWidth={6}
                />
              </svg>
            ) : null}
          </div>
        </>
      ) : null}

      {/* 2C. middleman_handshake モード (Shot 16) */}
      {mode === 'middleman_handshake' ? (
        <>
          {/* 中央上：実物100ドル紙幣 */}
          {propImageSrc ? (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 96,
                transform: `translate(-50%, ${Math.sin(sec * 2.4) * 8}px) rotate(-2deg) scale(${enterSpr})`,
                width: 500,
                zIndex: 9,
                boxShadow: '0 22px 48px rgba(0,0,0,0.55)',
                border: '3px solid rgba(255,255,255,0.65)',
              }}
            >
              <Img src={resolveMedia(propImageSrc)} style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
          ) : null}

          {/* 左グレーNPC */}
          <div
            style={{
              position: 'absolute',
              left: 420,
              bottom: 50,
              transform: `translateX(${interpolate(enterSpr, [0, 1], [-180, 0]).toFixed(1)}px)`,
              zIndex: 10,
            }}
          >
            <EconHostAvatar isNpc emblem="" pose="handshake_left" scale={1.12} />
          </div>

          {/* 右グレーNPC */}
          <div
            style={{
              position: 'absolute',
              right: 420,
              bottom: 50,
              transform: `translateX(${interpolate(enterSpr, [0, 1], [180, 0]).toFixed(1)}px)`,
              zIndex: 10,
            }}
          >
            <EconHostAvatar isNpc flipX emblem="" pose="handshake_right" scale={1.12} />
          </div>

          {/* 中央前景：仲介役の $? アバター */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 36,
              transform: `translateX(-50%) translateY(${interpolate(enterSpr, [0, 1], [120, 0]).toFixed(1)}px)`,
              zIndex: 16,
            }}
          >
            <EconHostAvatar pose="open_hands" emblem={avatarEmblem} scale={1.24} />
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
