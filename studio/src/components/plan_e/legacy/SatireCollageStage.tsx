import React from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { PLAN_E_MACRO_PALETTE } from '../../../theme/tokens';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from '../fonts';
import { PlanEBackdropMode, PlanECollageCard, isPlanELightBackdrop } from './typesV2';

function resolveMedia(src: string): string {
  if (/^(https?:\/\/|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

export interface SatireCollageStageProps {
  startSec: number;
  headline?: string;
  subHeadline?: string;
  cards: readonly PlanECollageCard[];
  backgroundImageSrc?: string;
  backgroundOpacity?: number;
  satireNote?: string;
  backdropMode?: PlanEBackdropMode;
  imageMap?: Record<string, string>;
}

function resolveStampColor(tone?: PlanECollageCard['stampTone']): string {
  if (tone === 'emerald') return PLAN_E_MACRO_PALETTE.emerald;
  if (tone === 'gold') return PLAN_E_MACRO_PALETTE.policyGold;
  return PLAN_E_MACRO_PALETTE.crisisRed;
}

/**
 * 案E 風刺エディトリアル・報道コラージュステージ。
 * - broadsheet（紙面報道）/ ticker_alert（速報ティッカー）/ memo_note（経済分析メモ）/ photo_frame（実写フレーム）
 *   を意図的に異なる質感・書体・傾きで配置し、Tailwind角丸ダークカードの均一連打（AI slop）を回避する。
 */
export const SatireCollageStage: React.FC<SatireCollageStageProps> = ({
  startSec,
  headline,
  subHeadline,
  cards,
  backgroundImageSrc,
  backgroundOpacity = 0.24,
  satireNote,
  backdropMode = 'slate_grid',
  imageMap = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const isLight = isPlanELightBackdrop(backdropMode);
  const titleColor = isLight ? PLAN_E_MACRO_PALETTE.inkDark : PLAN_E_MACRO_PALETTE.textLight;
  const mutedColor = isLight ? '#475569' : PLAN_E_MACRO_PALETTE.textMuted;

  const renderHighlightHeadline = (
    text: string,
    phrase: string | undefined,
    revealAt: number,
    isDarkCard: boolean,
  ) => {
    if (!phrase || !text.includes(phrase)) {
      return <span>{text}</span>;
    }
    const idx = text.indexOf(phrase);
    const pct = interpolate(sec, [revealAt + 0.12, revealAt + 0.55], [0, 100], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const markerColor = isDarkCard
      ? 'rgba(220, 38, 38, 0.45)'
      : PLAN_E_MACRO_PALETTE.highlightYellow;
    return (
      <>
        <span>{text.slice(0, idx)}</span>
        <span
          style={{
            backgroundImage: `linear-gradient(transparent 48%, ${markerColor} 48%)`,
            backgroundSize: `${pct}% 100%`,
            backgroundRepeat: 'no-repeat',
          }}
        >
          {phrase}
        </span>
        <span>{text.slice(idx + phrase.length)}</span>
      </>
    );
  };

  const count = cards.length;
  const gridColumns = count >= 3 ? 'repeat(3, 1fr)' : count === 2 ? 'repeat(2, 1fr)' : '1fr';

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        paddingTop: 4,
        paddingBottom: 112,
        gap: 22,
      }}
    >
      {backgroundImageSrc ? (
        <div
          style={{
            position: 'absolute',
            inset: '0 0 70px 0',
            opacity: backgroundOpacity,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <Img
            src={resolveMedia(backgroundImageSrc)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'grayscale(0.35) contrast(1.12)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isLight
                ? 'rgba(250, 248, 243, 0.72)'
                : 'rgba(14, 16, 20, 0.72)',
            }}
          />
        </div>
      ) : null}

      {headline ? (
        <div style={{ position: 'relative', zIndex: 5 }}>
          <div
            style={{
              fontFamily: FONT_ECON_SERIF,
              fontSize: 40,
              fontWeight: 900,
              color: titleColor,
              lineHeight: 1.24,
            }}
          >
            {headline}
          </div>
          {subHeadline ? (
            <div style={{ fontSize: 20, color: mutedColor, marginTop: 4 }}>{subHeadline}</div>
          ) : null}
        </div>
      ) : null}

      {/* コラージュカード群 */}
      <div
        style={{
          position: 'relative',
          zIndex: 8,
          display: 'grid',
          gridTemplateColumns: gridColumns,
          gap: 24,
          alignItems: 'center',
          marginTop: 6,
        }}
      >
        {cards.map((card, idx) => {
          const revealAt = startSec + (card.revealOffsetSec ?? idx * 0.18);
          if (sec < revealAt) {
            return <div key={card.id} />;
          }
          const lf = Math.max(0, frame - Math.round(revealAt * fps));
          const spr = spring({
            frame: lf,
            fps,
            config: { stiffness: 450, damping: 24, mass: 0.62 },
          });
          const stampSpr = spring({
            frame: Math.max(0, lf - Math.round(0.28 * fps)),
            fps,
            config: { stiffness: 520, damping: 20, mass: 0.55 },
          });
          const translateY = interpolate(spr, [0, 1], [-22, 0]);
          const scale = interpolate(spr, [0, 1], [1.06, 1.0]);
          const baseRotate = card.rotateDeg ?? (idx % 2 === 0 ? -1.1 : 1.1);

          const rawImg = card.imageSrc ?? (card.imageKey ? imageMap[card.imageKey] : undefined);
          const resolvedImg = rawImg ? resolveMedia(rawImg) : undefined;
          const isTicker = card.variant === 'ticker_alert';
          const isMemo = card.variant === 'memo_note';
          const isPhoto = card.variant === 'photo_frame';

          const cardBg = isTicker
            ? '#1A0505'
            : isMemo
              ? '#FFFBEB'
              : isPhoto
                ? '#0E1014'
                : PLAN_E_MACRO_PALETTE.editorialPaper;
          const cardInk = isTicker || isPhoto ? '#F8FAFC' : '#111827';
          const borderTop = isTicker
            ? `8px solid ${PLAN_E_MACRO_PALETTE.crisisRed}`
            : isMemo
              ? `6px solid ${PLAN_E_MACRO_PALETTE.policyGold}`
              : isPhoto
                ? `4px solid ${PLAN_E_MACRO_PALETTE.emeraldBright}`
                : `10px solid #1E293B`;

          return (
            <div
              key={card.id}
              style={{
                position: 'relative',
                backgroundColor: cardBg,
                color: cardInk,
                borderTop,
                border: isTicker
                  ? '1px solid rgba(220, 38, 38, 0.55)'
                  : isPhoto
                    ? '1px solid rgba(148, 163, 184, 0.35)'
                    : '1px solid #D6D3CD',
                boxShadow: '0 22px 48px rgba(0, 0, 0, 0.45)',
                padding: '22px 24px',
                transform: `translateY(${translateY}px) scale(${scale}) rotate(${baseRotate}deg)`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 14,
                minHeight: 255,
              }}
            >
              {/* 媒体マストヘッド */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: isTicker || isPhoto ? '1px solid rgba(248,250,252,0.22)' : '2px solid #1E293B',
                    paddingBottom: 7,
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: isTicker ? FONT_ECON_MONO : FONT_ECON_SERIF,
                      fontSize: 18,
                      fontWeight: 900,
                      letterSpacing: isTicker ? '0.1em' : '0.02em',
                      color: isTicker ? '#FCA5A5' : isPhoto ? PLAN_E_MACRO_PALETTE.emeraldBright : '#0F172A',
                    }}
                  >
                    {card.publicationName}
                  </span>
                  {card.categoryLabel ? (
                    <span
                      style={{
                        fontFamily: FONT_ECON_MONO,
                        fontSize: 13,
                        fontWeight: 800,
                        backgroundColor: isTicker ? PLAN_E_MACRO_PALETTE.crisisRed : 'rgba(15, 23, 42, 0.08)',
                        color: isTicker ? '#FFFFFF' : isPhoto ? '#CBD5E1' : '#475569',
                        padding: '2px 8px',
                      }}
                    >
                      {card.categoryLabel}
                    </span>
                  ) : null}
                </div>

                {resolvedImg ? (
                  <div
                    style={{
                      width: '100%',
                      height: 155,
                      overflow: 'hidden',
                      marginBottom: 12,
                      border: '1px solid rgba(100,116,139,0.35)',
                    }}
                  >
                    <Img
                      src={resolvedImg}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                ) : null}

                <div
                  style={{
                    fontFamily: isTicker ? FONT_ECON_SANS : FONT_ECON_SERIF,
                    fontSize: count === 1 ? 34 : 25,
                    fontWeight: 900,
                    lineHeight: 1.34,
                  }}
                >
                  {renderHighlightHeadline(card.headline, card.highlightPhrase, revealAt, isTicker || isPhoto)}
                </div>

                {card.subHeadline ? (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 16,
                      lineHeight: 1.5,
                      color: isTicker || isPhoto ? '#CBD5E1' : '#475569',
                    }}
                  >
                    {card.subHeadline}
                  </div>
                ) : null}
              </div>

              {/* 出典フッター */}
              {card.citation ? (
                <div
                  style={{
                    fontFamily: FONT_ECON_MONO,
                    fontSize: 13,
                    color: isTicker || isPhoto ? '#94A3B8' : '#64748B',
                    borderTop: '1px dashed rgba(148, 163, 184, 0.45)',
                    paddingTop: 6,
                    textAlign: 'right',
                  }}
                >
                  {card.citation}
                </div>
              ) : null}

              {/* 風刺スタンプ */}
              {card.stampText ? (
                <div
                  style={{
                    position: 'absolute',
                    right: 16,
                    bottom: card.citation ? 38 : 16,
                    border: `4px solid ${resolveStampColor(card.stampTone)}`,
                    color: resolveStampColor(card.stampTone),
                    backgroundColor: isTicker || isPhoto ? 'rgba(14,16,20,0.88)' : 'rgba(255,255,255,0.92)',
                    padding: '4px 12px',
                    fontFamily: FONT_ECON_SANS,
                    fontSize: 20,
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                    transform: `rotate(-8deg) scale(${interpolate(stampSpr, [0, 1], [1.6, 1.0])})`,
                    opacity: stampSpr,
                    pointerEvents: 'none',
                  }}
                >
                  {card.stampText}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 下部風刺エディトリアル注釈帯 */}
      {satireNote ? (
        <div
          style={{
            position: 'relative',
            zIndex: 9,
            alignSelf: 'flex-start',
            borderLeft: `6px solid ${PLAN_E_MACRO_PALETTE.policyGold}`,
            backgroundColor: isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(27, 31, 36, 0.92)',
            padding: '10px 20px',
            fontSize: 21,
            fontWeight: 800,
            color: isLight ? PLAN_E_MACRO_PALETTE.inkDark : PLAN_E_MACRO_PALETTE.policyGold,
          }}
        >
          {satireNote}
        </div>
      ) : null}
    </div>
  );
};
