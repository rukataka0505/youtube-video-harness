import React from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { PLAN_E_MACRO_PALETTE } from '../../../theme/tokens';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from '../fonts';
import { PlanEBackdropMode, isPlanELightBackdrop } from './typesV2';

function resolveMedia(src: string): string {
  if (/^(https?:\/\/|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

export interface ParadoxHookHeaderProps {
  startSec: number;
  endSec: number;
  eyebrow?: string;
  headline: string;
  highlightToken?: string;
  subHeadline?: string;
  paradoxTag?: string;
  vhsPauseEffect?: boolean;
  timecodeLabel?: string;
  backgroundImageSrc?: string;
  backgroundOpacity?: number;
  backdropMode?: PlanEBackdropMode;
}

/**
 * @deprecated 旧フックコンポーネント。新規制作では `EditorialCutoutStage`（実写上の三行広告／新聞切り抜き）または `VhsPauseAvatarStage` を使用すること（過去ベンチマーク互換用）。
 *
 * 案E 逆説・思考実験フック用ステージ。
 * - 実写／背景B-Roll＋スレート編集オーバーレイまたはVHS一時停止プロジェクター風UIで「逆説の問い」を突き刺す。
 */
export const ParadoxHookHeader: React.FC<ParadoxHookHeaderProps> = ({
  startSec,
  endSec,
  eyebrow,
  headline,
  highlightToken,
  subHeadline,
  paradoxTag,
  vhsPauseEffect = false,
  timecodeLabel = 'II  00:00:00  PAUSE',
  backgroundImageSrc,
  backgroundOpacity = 0.42,
  backdropMode = 'slate_grid',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const localFrame = Math.max(0, frame - Math.round(startSec * fps));

  const isLight = isPlanELightBackdrop(backdropMode);
  const spr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 420, damping: 24, mass: 0.65 },
  });

  const translateY = interpolate(spr, [0, 1], [18, 0]);
  const scale = interpolate(spr, [0, 1], [0.97, 1.0]);
  const progress = interpolate(sec, [startSec, Math.max(startSec + 0.1, endSec)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const bgScale = interpolate(progress, [0, 1], [1.03, 1.09]);

  const accentColor =
    backdropMode === 'crisis_dark'
      ? PLAN_E_MACRO_PALETTE.crisisRed
      : isLight
        ? PLAN_E_MACRO_PALETTE.emerald
        : PLAN_E_MACRO_PALETTE.emeraldBright;

  const primaryColor = isLight ? PLAN_E_MACRO_PALETTE.inkDark : PLAN_E_MACRO_PALETTE.textLight;
  const subColor = isLight ? '#475569' : '#CBD5E1';

  const renderHeadline = () => {
    const tok = highlightToken?.trim();
    if (!tok || !headline.includes(tok)) {
      return <span>{headline}</span>;
    }
    const idx = headline.indexOf(tok);
    const before = headline.slice(0, idx);
    const after = headline.slice(idx + tok.length);
    return (
      <>
        <span>{before}</span>
        <span
          style={{
            color:
              backdropMode === 'crisis_dark'
                ? '#FCA5A5'
                : isLight
                  ? PLAN_E_MACRO_PALETTE.crisisRed
                  : PLAN_E_MACRO_PALETTE.policyGold,
            borderBottom: `5px solid ${accentColor}`,
            paddingBottom: 2,
          }}
        >
          {tok}
        </span>
        <span>{after}</span>
      </>
    );
  };

  const scanlineDrift = (frame * 2) % 16;

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        paddingBottom: 72,
      }}
    >
      {/* 背景画像フレーム（ある場合はシネマ/エディトリアル枠内で微ズーム） */}
      {backgroundImageSrc ? (
        <div
          style={{
            position: 'absolute',
            inset: '12px 0 88px 0',
            overflow: 'hidden',
            border: isLight
              ? '2px solid rgba(17, 24, 39, 0.18)'
              : '1px solid rgba(148, 163, 184, 0.22)',
            opacity: backgroundOpacity,
            pointerEvents: 'none',
          }}
        >
          <Img
            src={resolveMedia(backgroundImageSrc)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${vhsPauseEffect ? 1.02 : bgScale})`,
              filter: vhsPauseEffect
                ? 'grayscale(0.45) contrast(1.18) brightness(0.65)'
                : 'contrast(1.08) brightness(0.76)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isLight
                ? 'linear-gradient(95deg, rgba(250,248,243,0.94) 0%, rgba(250,248,243,0.78) 58%, rgba(250,248,243,0.40) 100%)'
                : 'linear-gradient(95deg, rgba(14,16,20,0.92) 0%, rgba(14,16,20,0.72) 58%, rgba(14,16,20,0.38) 100%)',
            }}
          />
        </div>
      ) : null}

      {/* VHS 一時停止オーバーレイ（思考実験の「ちょっと待って」演出） */}
      {vhsPauseEffect ? (
        <div
          style={{
            position: 'absolute',
            inset: '12px 0 88px 0',
            pointerEvents: 'none',
            zIndex: 5,
            backgroundImage: `repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.035) 3px, rgba(255,255,255,0.035) 4px)`,
            backgroundPositionY: scanlineDrift,
            border: `2px solid ${accentColor}`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 22,
              left: 28,
              fontFamily: FONT_ECON_MONO,
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: '0.14em',
              color: '#FFFFFF',
              backgroundColor: 'rgba(14, 16, 20, 0.85)',
              padding: '6px 16px',
              borderLeft: `6px solid ${PLAN_E_MACRO_PALETTE.emeraldBright}`,
            }}
          >
            {timecodeLabel}
          </div>
          <div
            style={{
              position: 'absolute',
              top: 22,
              right: 28,
              fontFamily: FONT_ECON_MONO,
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: PLAN_E_MACRO_PALETTE.policyGold,
              backgroundColor: 'rgba(14, 16, 20, 0.85)',
              padding: '6px 14px',
            }}
          >
            THOUGHT EXPERIMENT
          </div>
        </div>
      ) : null}

      {/* 前景タイポグラフィ */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          maxWidth: 1460,
          paddingLeft: 44,
          paddingRight: 44,
          transform: `translateY(${translateY}px) scale(${scale})`,
          borderLeft: `10px solid ${accentColor}`,
        }}
      >
        {eyebrow || paradoxTag ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
            {paradoxTag ? (
              <span
                style={{
                  backgroundColor: accentColor,
                  color: isLight ? '#FFFFFF' : '#0B0F14',
                  fontFamily: FONT_ECON_SANS,
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                  padding: '4px 14px',
                }}
              >
                {paradoxTag}
              </span>
            ) : null}
            {eyebrow ? (
              <span
                style={{
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 21,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: accentColor,
                }}
              >
                {eyebrow}
              </span>
            ) : null}
          </div>
        ) : null}

        <div
          style={{
            fontFamily: FONT_ECON_SERIF,
            fontSize: headline.length > 26 ? 56 : 64,
            fontWeight: 900,
            lineHeight: 1.24,
            color: primaryColor,
            textShadow: isLight ? 'none' : '0 8px 28px rgba(0, 0, 0, 0.72)',
            wordBreak: 'keep-all',
          }}
        >
          {renderHeadline()}
        </div>

        {subHeadline ? (
          <div
            style={{
              marginTop: 20,
              fontFamily: FONT_ECON_SANS,
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.48,
              color: subColor,
              maxWidth: 1220,
            }}
          >
            {subHeadline}
          </div>
        ) : null}
      </div>
    </div>
  );
};
