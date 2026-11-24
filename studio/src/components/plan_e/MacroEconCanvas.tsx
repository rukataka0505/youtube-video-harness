import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { PLAN_E_MACRO_PALETTE, VIDEO_SPEC } from '../../theme/tokens';
import { CleanSubtitle, SubtitleCue } from '../common/CleanSubtitle';
import { SURFACE_POLARITY, type PlanESurface } from './auditRules';
import { FONT_ECON_MONO, FONT_ECON_SANS } from './fonts';

type LegacyBackdropMode =
  | 'slate_grid'
  | 'editorial_paper'
  | 'crisis_dark'
  | 'whiteboard'
  | 'corkboard'
  | 'blueprint_econ';

function resolveLightMode(surface?: PlanESurface, backdropMode?: LegacyBackdropMode | PlanESurface): boolean {
  if (surface && surface in SURFACE_POLARITY) {
    return SURFACE_POLARITY[surface] === 'bright';
  }
  return (
    backdropMode === 'editorial_paper' ||
    backdropMode === 'whiteboard' ||
    backdropMode === 'paper'
  );
}

export interface MacroEconCanvasProps {
  children?: React.ReactNode;
  backgroundLayer?: React.ReactNode;
  surface?: PlanESurface;
  /** @deprecated 互換維持用。新規制作は surface を指定すること */
  backdropMode?: LegacyBackdropMode | PlanESurface;
  backgroundColor?: string;
  subtitles: readonly SubtitleCue[];
  sec?: number;
  hideSubtitle?: boolean;
  subtitleLightBgOverride?: boolean;
  subtitleFontSize?: number;
  /** @deprecated 現行共通方針では動画内に出典表記を行わず概要欄のみに集約（既存ベンチマーク互換用） */
  citationText?: string;
  /** 互換用：明示的に true の場合のみ画面内 citationText を描画（既定 false） */
  showLegacyCitation?: boolean;
  chapterCode?: string;
  tickerLabel?: string;
  showTickerBar?: boolean;
  fullBleed?: boolean;
  grainOpacity?: number;
  grainIdPrefix?: string;
}

/**
 * 案E（planE_macro_econ / How Money Works 型）共通1080pキャンバス。
 * - 内側90%セーフゾーン（上下54px / 左右96px）厳守
 * - 5種の背景モード（slate_grid / editorial_paper / crisis_dark / blueprint_econ / whiteboard）と
 *   明暗に応じた CleanSubtitle 8方向アウトライン自動切替
 * - fullBleed=true の場合は方眼背景・章バッジを非表示にし、1920x1080全面へ実写動画Bロールや
 *   ニュース速報・ホワイトボード・プロジェクター等を配置した上で最前面へ CleanSubtitle を重ねる
 */
export const MacroEconCanvas: React.FC<MacroEconCanvasProps> = ({
  children,
  backgroundLayer,
  surface,
  backdropMode = 'slate_grid',
  backgroundColor,
  subtitles,
  sec,
  hideSubtitle = false,
  subtitleLightBgOverride,
  subtitleFontSize = 31,
  citationText,
  showLegacyCitation = false,
  chapterCode,
  tickerLabel,
  showTickerBar = false,
  fullBleed = false,
  grainOpacity = 0.022,
  grainIdPrefix = 'plan-e-grain',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = sec ?? frame / fps;
  const grainSeed = (Math.floor(frame / 2.5) % 64) + 1;

  const effMode = surface ?? backdropMode;
  const isLight = resolveLightMode(surface, backdropMode);
  const subtitleLightBg = subtitleLightBgOverride ?? isLight;

  const defaultBg =
    effMode === 'editorial_paper' || effMode === 'paper'
      ? PLAN_E_MACRO_PALETTE.editorialPaper
      : effMode === 'whiteboard'
        ? PLAN_E_MACRO_PALETTE.whiteboardBg
        : effMode === 'corkboard'
          ? '#7C542F'
          : effMode === 'crisis_dark' || effMode === 'charcoal' || effMode === 'dark_desk' || effMode === 'dark_broll' || effMode === 'projector'
            ? PLAN_E_MACRO_PALETTE.crisisDarkBg
            : effMode === 'blueprint_econ'
              ? '#15181E'
              : PLAN_E_MACRO_PALETTE.bg;

  const resolvedBg = backgroundColor ?? defaultBg;

  const gridStroke =
    effMode === 'editorial_paper' || effMode === 'paper'
      ? 'rgba(17, 24, 39, 0.055)'
      : effMode === 'whiteboard'
        ? 'rgba(0, 114, 178, 0.075)'
        : effMode === 'corkboard'
          ? 'rgba(36, 20, 8, 0.06)'
          : effMode === 'crisis_dark'
            ? 'rgba(220, 38, 38, 0.09)'
            : 'rgba(148, 163, 184, 0.065)';

  const textColor = isLight ? PLAN_E_MACRO_PALETTE.inkDark : PLAN_E_MACRO_PALETTE.textLight;

  if (fullBleed) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: resolvedBg,
          color: textColor,
          fontFamily: FONT_ECON_SANS,
          overflow: 'hidden',
        }}
      >
        {backgroundLayer}
        <AbsoluteFill style={{ zIndex: 10 }}>{children}</AbsoluteFill>

        {/* 最前面セーフゾーン内の控えめ出典表示と抜け感字幕 */}
        <div
          style={{
            position: 'absolute',
            left: VIDEO_SPEC.safeMarginX,
            right: VIDEO_SPEC.safeMarginX,
            top: VIDEO_SPEC.safeMarginY,
            bottom: VIDEO_SPEC.safeMarginY,
            pointerEvents: 'none',
            zIndex: 40,
          }}
        >
          {showLegacyCitation && citationText ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                fontFamily: FONT_ECON_SANS,
                fontSize: 15,
                fontWeight: 700,
                color: isLight ? 'rgba(15, 23, 42, 0.78)' : 'rgba(248, 250, 252, 0.80)',
                backgroundColor: isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(14, 16, 20, 0.72)',
                border: isLight ? '1px solid rgba(15, 23, 42, 0.16)' : '1px solid rgba(148, 163, 184, 0.25)',
                padding: '3px 11px',
                borderRadius: 4,
                maxWidth: '52%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {citationText}
            </div>
          ) : null}

          {!hideSubtitle ? (
            <CleanSubtitle
              cues={subtitles as SubtitleCue[]}
              sec={currentSec}
              lightBg={subtitleLightBg}
              fontSize={subtitleFontSize}
              bottomOffset={4}
              maxWidth="92%"
              fontFamily={FONT_ECON_SANS}
            />
          ) : null}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: resolvedBg,
        color: textColor,
        fontFamily: FONT_ECON_SANS,
        overflow: 'hidden',
      }}
    >
      {/* 1. 背景方眼＆トーン演出 */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <defs>
          <pattern id={`${grainIdPrefix}-grid`} width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke={gridStroke} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1920" height="1080" fill={`url(#${grainIdPrefix}-grid)`} />
      </svg>

      {/* モード別の微妙なビネット／スポットグラデーション */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: isLight
            ? 'radial-gradient(ellipse 88% 84% at 50% 45%, transparent 56%, rgba(15, 23, 42, 0.08) 100%)'
            : backdropMode === 'crisis_dark'
              ? 'radial-gradient(ellipse 82% 76% at 50% 45%, rgba(204, 0, 0, 0.14) 0%, rgba(14, 16, 20, 0.88) 100%)'
              : 'radial-gradient(ellipse 86% 80% at 50% 45%, rgba(30, 142, 62, 0.07) 0%, rgba(12, 14, 18, 0.65) 100%)',
        }}
      />

      {/* 2. 任意フルブリード背景層 */}
      {backgroundLayer}

      {/* 3. 内側90%セーフゾーンコンテナ */}
      <div
        style={{
          position: 'absolute',
          left: VIDEO_SPEC.safeMarginX,
          right: VIDEO_SPEC.safeMarginX,
          top: VIDEO_SPEC.safeMarginY,
          bottom: VIDEO_SPEC.safeMarginY,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 20,
        }}
      >
        {/* 上部ミニ・マクロ経済ティッカー / 章コード＆右上出典 */}
        {(showTickerBar && (chapterCode || tickerLabel)) || citationText ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 30,
              marginBottom: 8,
              zIndex: 35,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {showTickerBar && chapterCode ? (
                <span
                  style={{
                    fontFamily: FONT_ECON_MONO,
                    fontSize: 15,
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    padding: '3px 10px',
                    backgroundColor:
                      backdropMode === 'crisis_dark'
                        ? PLAN_E_MACRO_PALETTE.crisisRed
                        : PLAN_E_MACRO_PALETTE.emerald,
                    color: '#FFFFFF',
                  }}
                >
                  {chapterCode}
                </span>
              ) : null}
              {showTickerBar && tickerLabel ? (
                <span
                  style={{
                    fontFamily: FONT_ECON_MONO,
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: isLight ? '#475569' : PLAN_E_MACRO_PALETTE.textMuted,
                  }}
                >
                  {tickerLabel}
                </span>
              ) : null}
            </div>

            {showLegacyCitation && citationText ? (
              <div
                style={{
                  fontFamily: FONT_ECON_SANS,
                  fontSize: 16,
                  fontWeight: 700,
                  color: isLight ? 'rgba(15, 23, 42, 0.78)' : 'rgba(248, 250, 252, 0.78)',
                  backgroundColor: isLight
                    ? 'rgba(255, 255, 255, 0.84)'
                    : 'rgba(14, 16, 20, 0.76)',
                  border: isLight
                    ? '1px solid rgba(15, 23, 42, 0.16)'
                    : '1px solid rgba(148, 163, 184, 0.25)',
                  padding: '3px 11px',
                  borderRadius: 4,
                  maxWidth: '52%',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {citationText}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* メインコンテンツ領域 */}
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {children}
        </div>

        {/* 下段常時抜け感字幕スペース */}
        {!hideSubtitle ? (
          <CleanSubtitle
            cues={subtitles as SubtitleCue[]}
            sec={currentSec}
            lightBg={subtitleLightBg}
            fontSize={subtitleFontSize}
            bottomOffset={4}
            maxWidth="92%"
            fontFamily={FONT_ECON_SANS}
          />
        ) : null}
      </div>

      {/* 4. 微妙なエディトリアル粒子グレイン */}
      {grainOpacity > 0 ? (
        <svg
          width="100%"
          height="100%"
          style={{
            position: 'absolute',
            inset: 0,
            opacity: grainOpacity,
            mixBlendMode: isLight ? 'multiply' : 'screen',
            pointerEvents: 'none',
            zIndex: 45,
          }}
          aria-hidden="true"
        >
          <filter id={`${grainIdPrefix}-${grainSeed}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.82"
              numOctaves={2}
              seed={grainSeed}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${grainIdPrefix}-${grainSeed})`} />
        </svg>
      ) : null}
    </AbsoluteFill>
  );
};
