import React, { useId } from 'react';
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { beatAt, beatProgress, resolveStickmanMediaSrc } from './beatUtils';
import { FONT_HAND, FONT_MARU, FONT_SANS, FONT_SERIF } from './fonts';
import { BoilSvg, DrawPath, HandDrawnFrame, ScalePop, useBoilSeed } from './HandDrawnMotion';
import { StickmanFigure, StickmanBubble } from './StickmanFigure';
import { resolvePolarityTheme, type StagePolarity } from './types';

/* -------------------------------------------------------------------------- */
/* 1. HandNote: 極性対応の手書き注釈                                           */
/* -------------------------------------------------------------------------- */

export interface HandNoteProps {
  text: string;
  polarity?: StagePolarity;
  color?: string;
  size?: number;
  rotateDeg?: number;
  style?: React.CSSProperties;
}

export const HandNote: React.FC<HandNoteProps> = ({
  text,
  polarity = 'black',
  color,
  size = 42,
  rotateDeg = 0,
  style,
}) => {
  const theme = resolvePolarityTheme(polarity);
  const resolvedColor = color ?? (theme.isLight ? theme.ink : theme.accentPrimary);
  const outline = theme.outlineColor;

  return (
    <div
      style={{
        fontFamily: FONT_HAND,
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.24,
        color: resolvedColor,
        whiteSpace: 'pre-line',
        lineBreak: 'strict',
        transform: rotateDeg ? `rotate(${rotateDeg}deg)` : undefined,
        textShadow: `-2px 0 0 ${outline}, 2px 0 0 ${outline}, 0 -2px 0 ${outline}, 0 2px 0 ${outline}`,
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. StickerTag: 極性対応の手描きボイル紙片ステッカー札                       */
/* -------------------------------------------------------------------------- */

export interface StickerTagProps {
  text: string;
  polarity?: StagePolarity;
  bg?: string;
  color?: string;
  size?: number;
  rotateDeg?: number;
  tape?: boolean;
  style?: React.CSSProperties;
}

export const StickerTag: React.FC<StickerTagProps> = ({
  text,
  polarity = 'black',
  bg,
  color,
  size = 34,
  rotateDeg = 0,
  tape = false,
  style,
}) => {
  const resolvedBg = bg ?? '#FAF8F3';
  const resolvedColor = color ?? '#1C1917';

  return (
    <HandDrawnFrame
      polarity={polarity}
      bg={resolvedBg}
      borderColor="#1C1917"
      strokeWidth={4.2}
      tiltDeg={rotateDeg}
      tape={tape}
      padding="7px 22px"
      style={style}
    >
      <div
        style={{
          fontFamily: FONT_MARU,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1.18,
          color: resolvedColor,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </HandDrawnFrame>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. PolarityBigStat: 大数値・キーワードスポットライト＋DrawPathアンダーライン  */
/* -------------------------------------------------------------------------- */

export interface PolarityBigStatItem {
  text: string;
  sub?: string;
  color?: string;
  at?: number;
  beatIndex?: number;
}

export interface PolarityBigStatProps {
  items: readonly PolarityBigStatItem[];
  sec: number;
  beats?: readonly number[];
  t0?: number;
  polarity?: StagePolarity;
  style?: React.CSSProperties;
}

export const PolarityBigStat: React.FC<PolarityBigStatProps> = ({
  items,
  sec,
  beats = [],
  t0 = 0,
  polarity = 'black',
  style,
}) => {
  const theme = resolvePolarityTheme(polarity);
  const safeItems = items.slice(0, 4);

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: safeItems.length >= 3 ? 48 : 80,
        flexWrap: 'wrap',
        ...style,
      }}
    >
      {safeItems.map((it, i) => {
        const triggerAt = it.at ?? beatAt(beats, it.beatIndex ?? i, t0 + 0.12 + i * 0.45);
        const fontSize =
          safeItems.length >= 3
            ? 100
            : Math.min(
                i === 0 ? 186 : 140,
                Math.floor(1360 / Math.max(1, it.text.length) / Math.max(1, safeItems.length)),
              );
        const rawColor = it.color ?? theme.accentPrimary;
        const textColor =
          !theme.isLight && rawColor.toUpperCase() === '#111111' ? '#FFFFFF' : rawColor;

        return (
          <ScalePop key={`${it.text}-${i}`} sec={sec} triggerSec={triggerAt}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  fontFamily: FONT_MARU,
                  fontWeight: 900,
                  fontSize,
                  lineHeight: 1.04,
                  whiteSpace: 'nowrap',
                  color: textColor,
                  WebkitTextStroke: theme.isLight ? '6px #111111' : '6px #000000',
                  paintOrder: 'stroke fill',
                  textShadow: theme.isLight
                    ? '7px 9px 0 rgba(17, 17, 17, 0.2)'
                    : '0 14px 36px rgba(0, 0, 0, 0.85)',
                }}
              >
                {it.text}
              </div>
              <BoilSvg width={Math.min(420, Math.max(180, it.text.length * 44))} height={24} style={{ marginTop: 4 }}>
                <DrawPath
                  d={`M 8 14 Q ${Math.min(420, Math.max(180, it.text.length * 44)) / 2} 4 ${Math.min(420, Math.max(180, it.text.length * 44)) - 8} 13`}
                  sec={sec}
                  at={triggerAt + 0.16}
                  dur={0.4}
                  stroke={textColor}
                  width={7}
                />
              </BoilSvg>
              {it.sub ? (
                <StickerTag
                  text={it.sub}
                  polarity={polarity}
                  bg={theme.isLight ? '#FEF08A' : '#FAF8F3'}
                  color="#111111"
                  size={34}
                  style={{ marginTop: 12 }}
                />
              ) : null}
            </div>
          </ScalePop>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. PolarityBarChart: BoilSvg + DrawPath軸線 + ビート同期棒グラフ           */
/* -------------------------------------------------------------------------- */

export interface PolarityBarChartItem {
  label: string;
  value: number;
  color?: string;
  at?: number;
  beatIndex?: number;
}

export interface PolarityBarChartProps {
  bars: readonly PolarityBarChartItem[];
  sec: number;
  beats?: readonly number[];
  t0?: number;
  max?: number;
  unit?: string;
  baseline?: number;
  baselineLabel?: string;
  baselineAt?: number;
  polarity?: StagePolarity;
  style?: React.CSSProperties;
}

export const PolarityBarChart: React.FC<PolarityBarChartProps> = ({
  bars,
  sec,
  beats = [],
  t0 = 0,
  max = 100,
  unit = '%',
  baseline,
  baselineLabel,
  baselineAt,
  polarity = 'black',
  style,
}) => {
  const theme = resolvePolarityTheme(polarity);
  const safeMax = Math.max(1, max);
  const safeBars = bars.slice(0, 6);
  const gap = 1280 / Math.max(1, safeBars.length);
  const bw = Math.min(220, gap * 0.58);
  const axisInk = theme.ink;
  const baseTrigger = baselineAt ?? beatAt(beats, 1, t0 + 0.85);
  const baseRatio = baseline !== undefined ? Math.max(0, Math.min(1, baseline / safeMax)) : 0;

  return (
    <BoilSvg width={1560} height={680} viewBox="0 0 1560 680" scale={2.4} style={{ width: '100%', height: '100%', ...style }}>
      <DrawPath
        d="M 120 90 C 118 260, 122 420, 120 570"
        sec={sec}
        at={t0}
        dur={0.35}
        stroke={axisInk}
        width={7}
      />
      <DrawPath
        d="M 120 570 C 560 568, 1020 572, 1440 570"
        sec={sec}
        at={t0 + 0.1}
        dur={0.45}
        stroke={axisInk}
        width={8}
      />

      {safeBars.map((b, i) => {
        const at = b.at ?? beatAt(beats, b.beatIndex ?? i, t0 + 0.25 + 0.42 * i);
        const p = beatProgress(sec, at, at + 0.55, true);
        const clampedVal = Math.max(0, b.value);
        const h = (430 * clampedVal * p) / safeMax;
        const x = 150 + gap * i + (gap - bw) / 2;
        const topY = 570 - h;
        const fill = b.color ?? (i % 2 === 0 ? theme.accentSecondary : theme.accentPrimary);
        const displayVal = Number.isInteger(clampedVal)
          ? Math.round(clampedVal * p)
          : (clampedVal * p).toFixed(2);

        return (
          <g key={`${b.label}-${i}`}>
            {p > 0.01 ? (
              <path
                d={`M ${x} 570 L ${x + 2} ${topY + 4} Q ${x + bw / 2} ${topY - 2} ${x + bw - 2} ${topY + 4} L ${x + bw} 570 Z`}
                fill={fill}
                stroke={axisInk}
                strokeWidth={7}
                strokeLinejoin="round"
              />
            ) : null}
            {p > 0.08 ? (
              <text
                x={x + bw / 2}
                y={topY - 18}
                textAnchor="middle"
                fontFamily={FONT_MARU}
                fontWeight={900}
                fontSize={52}
                fill={axisInk}
              >
                {displayVal}
                {unit}
              </text>
            ) : null}
            <text
              x={x + bw / 2}
              y={634}
              textAnchor="middle"
              fontFamily={FONT_MARU}
              fontWeight={900}
              fontSize={32}
              fill={axisInk}
            >
              {b.label}
            </text>
          </g>
        );
      })}

      {baseline !== undefined && sec >= baseTrigger ? (
        <g>
          <DrawPath
            d={`M 120 ${570 - 430 * baseRatio} L 1440 ${570 - 430 * baseRatio}`}
            sec={sec}
            at={baseTrigger}
            dur={0.45}
            stroke={theme.accentWarning}
            width={7}
            dash="24 14"
          />
          <text
            x={1430}
            y={554 - 430 * baseRatio}
            textAnchor="end"
            fontFamily={FONT_HAND}
            fontWeight={700}
            fontSize={38}
            fill={theme.accentWarning}
            stroke={theme.outlineColor}
            strokeWidth={10}
            paintOrder="stroke"
          >
            {baselineLabel ?? `基準 ${baseline}${unit}`}
          </text>
        </g>
      ) : null}
    </BoilSvg>
  );
};

/* -------------------------------------------------------------------------- */
/* 5. PolarityEquationFlow: 因果・等式フロー                                   */
/* -------------------------------------------------------------------------- */

export interface PolarityEquationNode {
  text: string;
  isOperator?: boolean;
  bg?: string;
  color?: string;
  at?: number;
  beatIndex?: number;
}

export interface PolarityEquationFlowProps {
  nodes: readonly PolarityEquationNode[];
  sec: number;
  beats?: readonly number[];
  t0?: number;
  handNote?: string;
  handNoteAt?: number;
  polarity?: StagePolarity;
  style?: React.CSSProperties;
}

export const PolarityEquationFlow: React.FC<PolarityEquationFlowProps> = ({
  nodes,
  sec,
  beats = [],
  t0 = 0,
  handNote,
  handNoteAt,
  polarity = 'grid_paper',
  style,
}) => {
  const theme = resolvePolarityTheme(polarity);
  const safeNodes = nodes.slice(0, 6);
  const noteTrigger = handNoteAt ?? beatAt(beats, 0, t0 + 0.15);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: safeNodes.length >= 5 ? 24 : 36,
        flexWrap: 'wrap',
        paddingTop: handNote ? 56 : 0,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {handNote ? (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <ScalePop sec={sec} triggerSec={noteTrigger}>
            <HandNote
              text={handNote}
              polarity={polarity}
              color={theme.isLight ? theme.accentPrimary : theme.accentPrimary}
              size={48}
            />
          </ScalePop>
        </div>
      ) : null}

      {safeNodes.map((n, i) => {
        const triggerAt = n.at ?? beatAt(beats, n.beatIndex ?? i, t0 + 0.15 + i * 0.45);
        return (
          <ScalePop key={`${n.text}-${i}`} sec={sec} triggerSec={triggerAt}>
            {n.isOperator ? (
              <div
                style={{
                  fontFamily: FONT_MARU,
                  fontWeight: 900,
                  fontSize: 96,
                  lineHeight: 1,
                  color: n.color ?? theme.accentPrimary,
                  textShadow: theme.isLight ? '3px 3px 0 #FFFFFF' : '0 8px 20px rgba(0,0,0,0.8)',
                }}
              >
                {n.text}
              </div>
            ) : (
              <StickerTag
                text={n.text}
                polarity={polarity}
                bg={n.bg ?? '#FFFFFF'}
                color={n.color ?? '#111111'}
                size={safeNodes.length >= 5 ? 40 : 50}
              />
            )}
          </ScalePop>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 6. PolarityCompareCards: 2〜4枚比較カード（赤×打ち消し線対応）               */
/* -------------------------------------------------------------------------- */

export interface PolarityCompareCardItem {
  title: string;
  body?: string;
  badge?: string;
  imageSrc?: string;
  highlight?: boolean;
  bg?: string;
  tiltDeg?: number;
  at?: number;
  beatIndex?: number;
  crossedOutAt?: number;
}

export interface PolarityCompareCardsProps {
  cards: readonly PolarityCompareCardItem[];
  sec: number;
  beats?: readonly number[];
  t0?: number;
  polarity?: StagePolarity;
  style?: React.CSSProperties;
}

export const PolarityCompareCards: React.FC<PolarityCompareCardsProps> = ({
  cards,
  sec,
  beats = [],
  t0 = 0,
  polarity = 'cream_notebook',
  style,
}) => {
  const theme = resolvePolarityTheme(polarity);
  const safeCards = cards.slice(0, 4);
  const cardW = safeCards.length <= 2 ? 480 : safeCards.length === 3 ? 360 : 300;
  const cardH = safeCards.length <= 2 ? 430 : 380;

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: safeCards.length >= 4 ? 30 : 56,
        ...style,
      }}
    >
      {safeCards.map((card, i) => {
        const triggerAt = card.at ?? beatAt(beats, card.beatIndex ?? i, t0 + 0.1 + i * 0.45);
        const tilt = card.tiltDeg ?? (i % 2 === 0 ? -2.2 : 2.2);
        const borderColor = card.highlight ? theme.accentPrimary : '#111111';

        return (
          <ScalePop key={`${card.title}-${i}`} sec={sec} triggerSec={triggerAt}>
            <HandDrawnFrame
              width={cardW}
              height={cardH}
              polarity={polarity}
              bg={card.bg ?? '#FAF8F3'}
              borderColor={borderColor}
              strokeWidth={6}
              tape
              tiltDeg={tilt}
              padding="24px 26px"
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 14,
                  position: 'relative',
                }}
              >
                {card.badge ? (
                  <div
                    style={{
                      fontFamily: FONT_HAND,
                      fontSize: 22,
                      fontWeight: 700,
                      padding: '3px 16px',
                      backgroundColor: card.highlight ? theme.accentPrimary : '#FEF08A',
                      color: card.highlight && theme.isLight ? '#FFFFFF' : '#1C1917',
                      border: '2.5px solid #1C1917',
                      transform: 'rotate(-2.4deg)',
                    }}
                  >
                    {card.badge}
                  </div>
                ) : null}

                {card.imageSrc ? (
                  <div
                    style={{
                      flex: 1,
                      width: '100%',
                      overflow: 'hidden',
                      border: '3px solid #1C1917',
                    }}
                  >
                    <Img
                      src={resolveStickmanMediaSrc(card.imageSrc)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                ) : null}

                <div
                  style={{
                    fontFamily: FONT_MARU,
                    fontWeight: 900,
                    fontSize: safeCards.length >= 4 ? 32 : 42,
                    lineHeight: 1.24,
                    lineBreak: 'strict',
                    color: card.highlight ? theme.accentPrimary : '#1C1917',
                    textAlign: 'center',
                  }}
                >
                  {card.title}
                </div>

                {card.body ? (
                  <div
                    style={{
                      fontFamily: FONT_HAND,
                      fontSize: safeCards.length >= 4 ? 26 : 32,
                      lineHeight: 1.32,
                      color: '#4A463F',
                      textAlign: 'center',
                      whiteSpace: 'pre-line',
                      lineBreak: 'strict',
                    }}
                  >
                    {card.body}
                  </div>
                ) : null}

                {card.crossedOutAt !== undefined && sec >= card.crossedOutAt ? (
                  <BoilSvg
                    width={cardW - 52}
                    height={cardH - 48}
                    viewBox={`0 0 ${cardW} ${cardH}`}
                    scale={2.4}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                  >
                    <DrawPath
                      d={`M 48 48 C ${cardW * 0.4} ${cardH * 0.4}, ${cardW * 0.65} ${cardH * 0.65}, ${cardW - 48} ${cardH - 48}`}
                      sec={sec}
                      at={card.crossedOutAt}
                      dur={0.28}
                      stroke="#DC2626"
                      width={20}
                    />
                    <DrawPath
                      d={`M ${cardW - 48} 48 C ${cardW * 0.6} ${cardH * 0.4}, ${cardW * 0.35} ${cardH * 0.65}, 48 ${cardH - 48}`}
                      sec={sec}
                      at={card.crossedOutAt + 0.28}
                      dur={0.28}
                      stroke="#DC2626"
                      width={20}
                    />
                  </BoilSvg>
                ) : null}
              </div>
            </HandDrawnFrame>
          </ScalePop>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 7. PolarityMatrix2x2: 7.5fpsボイル＋手描き2×2マトリクス図解                 */
/* -------------------------------------------------------------------------- */

export interface PolarityMatrixHighlightCell {
  row: 0 | 1;
  col: 0 | 1;
  startSec: number;
  annotation?: string;
  color?: string;
}

export interface PolarityMatrix2x2Props {
  topAxisTitle?: string;
  topLabels: [string, string];
  leftAxisTitle?: string;
  leftLabels: [string, string];
  cells: [[string, string], [string, string]];
  revealCellsSec?: number;
  highlightCell?: PolarityMatrixHighlightCell;
  sec?: number;
  polarity?: StagePolarity;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}

export const PolarityMatrix2x2: React.FC<PolarityMatrix2x2Props> = ({
  topAxisTitle,
  topLabels,
  leftAxisTitle,
  leftLabels,
  cells,
  revealCellsSec = 0,
  highlightCell,
  sec,
  polarity = 'black',
  width = 980,
  height = 580,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = sec ?? frame / Math.max(1, fps);
  const seed = useBoilSeed(7.5, 14);
  const rawId = useId();
  const filterId = `sc-matrix-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const theme = resolvePolarityTheme(polarity);

  const lineColor = theme.ink;
  const axisColor = theme.mutedInk;
  const cellColor = theme.isLight ? '#3E3B36' : '#E2DDD2';
  const showAnswers = currentSec >= revealCellsSec;
  const hlStartSec = highlightCell?.startSec ?? revealCellsSec;
  const hlColor = highlightCell?.color ?? theme.accentPrimary;

  const circleProg = highlightCell
    ? interpolate(currentSec, [hlStartSec + 0.08, hlStartSec + 0.7], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  const arrowProg = highlightCell?.annotation
    ? interpolate(currentSec, [hlStartSec + 0.5, hlStartSec + 0.9], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  const colCenters = [355, 625] as const;
  const rowTextYs = [248, 444] as const;
  const rowCircleOffsetY = [-196, 0] as const;

  const renderHighlightAnnotation = () => {
    if (!highlightCell?.annotation || arrowProg <= 0.05) {
      return null;
    }
    const { row, col, annotation } = highlightCell;
    if (col === 1 && row === 1) {
      return (
        <g opacity={arrowProg}>
          <path d="M 818 358 Q 774 388 730 416" fill="none" stroke={hlColor} strokeWidth={6.5} strokeLinecap="round" strokeDasharray={140} strokeDashoffset={140 * (1 - arrowProg)} />
          <path d="M 744 394 L 728 417 L 755 418" fill="none" stroke={hlColor} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          <text x={824} y={348} fill={hlColor} fontSize={42} fontWeight={900}>{annotation}</text>
        </g>
      );
    }
    if (col === 1 && row === 0) {
      return (
        <g opacity={arrowProg}>
          <path d="M 818 168 Q 774 196 730 222" fill="none" stroke={hlColor} strokeWidth={6.5} strokeLinecap="round" strokeDasharray={140} strokeDashoffset={140 * (1 - arrowProg)} />
          <path d="M 744 200 L 728 223 L 755 224" fill="none" stroke={hlColor} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          <text x={824} y={158} fill={hlColor} fontSize={42} fontWeight={900}>{annotation}</text>
        </g>
      );
    }
    if (col === 0 && row === 0) {
      return (
        <g opacity={arrowProg}>
          <path d="M 192 98 Q 228 136 270 176" fill="none" stroke={hlColor} strokeWidth={6.5} strokeLinecap="round" strokeDasharray={160} strokeDashoffset={160 * (1 - arrowProg)} />
          <path d="M 244 172 L 272 178 L 264 152" fill="none" stroke={hlColor} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          <text x={182} y={84} textAnchor="end" fill={hlColor} fontSize={40} fontWeight={900}>{annotation}</text>
        </g>
      );
    }
    return (
      <g opacity={arrowProg}>
        <path d="M 240 554 Q 290 520 330 486" fill="none" stroke={hlColor} strokeWidth={6.5} strokeLinecap="round" strokeDasharray={160} strokeDashoffset={160 * (1 - arrowProg)} />
        <path d="M 304 489 L 332 484 L 323 510" fill="none" stroke={hlColor} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        <text x={228} y={576} textAnchor="end" fill={hlColor} fontSize={40} fontWeight={900}>{annotation}</text>
      </g>
    );
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      <svg width={width} height={height} viewBox="0 0 980 600" aria-hidden="true">
        <defs>
          <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves={2} seed={seed} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={2.6} />
          </filter>
        </defs>
        <g filter={`url(#${filterId})`} fontFamily={FONT_HAND}>
          {topAxisTitle ? (
            <text x={490} y={48} textAnchor="middle" fill={axisColor} fontSize={30} fontWeight={900}>
              {topAxisTitle}
            </text>
          ) : null}
          <text x={355} y={102} textAnchor="middle" fill={lineColor} fontSize={36} fontWeight={900}>{topLabels[0]}</text>
          <text x={625} y={102} textAnchor="middle" fill={lineColor} fontSize={36} fontWeight={900}>{topLabels[1]}</text>
          {leftAxisTitle ? (
            <text x={68} y={336} textAnchor="middle" fill={axisColor} fontSize={30} fontWeight={900}>{leftAxisTitle}</text>
          ) : null}
          <text x={156} y={244} textAnchor="middle" fill={lineColor} fontSize={36} fontWeight={900}>{leftLabels[0]}</text>
          <text x={156} y={442} textAnchor="middle" fill={lineColor} fontSize={36} fontWeight={900}>{leftLabels[1]}</text>

          <path d="M 224 134 C 390 130, 590 136, 756 133" fill="none" stroke={lineColor} strokeWidth={6} strokeLinecap="round" />
          <path d="M 226 525 C 390 528, 595 522, 754 526" fill="none" stroke={lineColor} strokeWidth={6} strokeLinecap="round" />
          <path d="M 225 133 C 222 260, 227 390, 224 526" fill="none" stroke={lineColor} strokeWidth={6} strokeLinecap="round" />
          <path d="M 755 133 C 758 260, 753 390, 755 526" fill="none" stroke={lineColor} strokeWidth={6} strokeLinecap="round" />
          <path d="M 490 134 C 488 265, 493 395, 490 525" fill="none" stroke={lineColor} strokeWidth={5.5} strokeLinecap="round" />
          <path d="M 225 330 C 395 332, 585 327, 755 331" fill="none" stroke={lineColor} strokeWidth={5.5} strokeLinecap="round" />

          {showAnswers ? (
            <>
              {([0, 1] as const).map((r) =>
                ([0, 1] as const).map((c) => {
                  const isHighlighted =
                    highlightCell &&
                    highlightCell.row === r &&
                    highlightCell.col === c &&
                    currentSec >= hlStartSec;
                  return (
                    <text
                      key={`${r}-${c}`}
                      x={colCenters[c]}
                      y={rowTextYs[r]}
                      textAnchor="middle"
                      fill={isHighlighted ? hlColor : cellColor}
                      fontSize={isHighlighted ? 46 : 40}
                      fontWeight={900}
                    >
                      {cells[r][c]}
                    </text>
                  );
                }),
              )}
              {highlightCell && currentSec >= hlStartSec ? (
                <>
                  <g transform={`translate(${colCenters[highlightCell.col] - 625}, ${rowCircleOffsetY[highlightCell.row]})`}>
                    <path
                      d="M 622 374 C 692 372, 725 398, 720 434 C 715 470, 668 486, 616 483 C 556 480, 524 456, 529 422 C 534 388, 578 375, 628 377"
                      fill="none"
                      stroke={hlColor}
                      strokeWidth={7.5}
                      strokeLinecap="round"
                      strokeDasharray={540}
                      strokeDashoffset={540 * (1 - circleProg)}
                    />
                  </g>
                  {renderHighlightAnnotation()}
                </>
              ) : null}
            </>
          ) : null}
        </g>
      </svg>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 8. PolarityComparisonTable: 手描きT字線＋左右スナップ積上げ比較表            */
/* -------------------------------------------------------------------------- */

export interface PolarityComparisonTableItem {
  text: string;
  triggerSec: number;
  highlight?: boolean;
  color?: string;
}

export interface PolarityComparisonTableProps {
  leftTitle: string;
  rightTitle: string;
  leftTitleColor?: string;
  rightTitleColor?: string;
  lineColor?: string;
  lineStartSec?: number;
  lineDrawDurationSec?: number;
  leftItems: readonly PolarityComparisonTableItem[];
  rightItems: readonly PolarityComparisonTableItem[];
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  sec?: number;
  polarity?: StagePolarity;
  itemFontSize?: number;
  style?: React.CSSProperties;
}

export const PolarityComparisonTable: React.FC<PolarityComparisonTableProps> = ({
  leftTitle,
  rightTitle,
  leftTitleColor,
  rightTitleColor,
  lineColor,
  lineStartSec = 0,
  lineDrawDurationSec = 0.55,
  leftItems,
  rightItems,
  leftSlot,
  rightSlot,
  sec,
  polarity = 'black',
  itemFontSize = 38,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = sec ?? frame / Math.max(1, fps);
  const theme = resolvePolarityTheme(polarity);
  const seed = useBoilSeed(7.5, 12);
  const rawId = useId();
  const filterId = `sc-tline-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const resolvedLeftTitle = leftTitleColor ?? theme.accentPrimary;
  const resolvedRightTitle = rightTitleColor ?? theme.accentSecondary;
  const resolvedLine = lineColor ?? (theme.isLight ? '#111111' : theme.accentOlive);
  const lineProg = beatProgress(currentSec, lineStartSec, lineStartSec + lineDrawDurationSec, true);

  const itemSnap = (t: number) => {
    const lf = Math.max(0, (currentSec - t) * fps);
    const sp = spring({ frame: lf, fps, config: { stiffness: 450, damping: 24, mass: 0.6 } });
    return {
      transform: `translateY(${interpolate(sp, [0, 1], [-10, 0])}px) scale(${interpolate(sp, [0, 1], [1.05, 1])})`,
    };
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', ...style }}>
      {leftSlot ? <div style={{ width: 220, display: 'flex', justifyContent: 'center' }}>{leftSlot}</div> : null}

      <div style={{ flex: 1, height: 600, position: 'relative', paddingInline: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 8, fontFamily: FONT_HAND }}>
          <div style={{ color: resolvedLeftTitle, fontSize: 50, fontWeight: 900 }}>{leftTitle}</div>
          <div style={{ color: resolvedRightTitle, fontSize: 50, fontWeight: 900 }}>{rightTitle}</div>
        </div>

        <svg
          width="100%"
          height={520}
          viewBox="0 0 1100 520"
          style={{ position: 'absolute', top: 68, left: 0, pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <defs>
            <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.024" numOctaves={2} seed={seed} result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale={2.4} />
            </filter>
          </defs>
          <g filter={`url(#${filterId})`}>
            <path d="M 28 12 Q 550 6 1072 13" fill="none" stroke={resolvedLine} strokeWidth={7} strokeLinecap="round" strokeDasharray={1060} strokeDashoffset={1060 * (1 - lineProg)} />
            <path d="M 550 12 Q 547 260 551 500" fill="none" stroke={resolvedLine} strokeWidth={7} strokeLinecap="round" strokeDasharray={500} strokeDashoffset={500 * (1 - lineProg)} />
          </g>
        </svg>

        <div style={{ display: 'flex', marginTop: 42, fontFamily: FONT_HAND }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 34, paddingLeft: 26, paddingRight: 34 }}>
            {leftItems
              .filter((item) => currentSec >= item.triggerSec)
              .map((item, idx) => (
                <div
                  key={`${item.text}-${idx}`}
                  style={{
                    ...itemSnap(item.triggerSec),
                    color: item.color ?? (item.highlight ? theme.accentPrimary : theme.ink),
                    fontSize: itemFontSize,
                    fontWeight: 900,
                  }}
                >
                  {item.text}
                </div>
              ))}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 34, paddingLeft: 48 }}>
            {rightItems
              .filter((item) => currentSec >= item.triggerSec)
              .map((item, idx) => (
                <div
                  key={`${item.text}-${idx}`}
                  style={{
                    ...itemSnap(item.triggerSec),
                    color: item.color ?? (item.highlight ? theme.accentPrimary : theme.ink),
                    fontSize: itemFontSize,
                    fontWeight: 900,
                  }}
                >
                  {item.text}
                </div>
              ))}
          </div>
        </div>
      </div>

      {rightSlot ? <div style={{ width: 220, display: 'flex', justifyContent: 'center' }}>{rightSlot}</div> : null}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 9. PolarityKineticList: formula / paper_notes 順次積上げ（clip_cards廃止） */
/* -------------------------------------------------------------------------- */

export interface PolarityKineticItem {
  id?: string;
  triggerSec: number;
  text: string;
  /** @deprecated 廃止済み（新規制作では描画されず、バリデータエラー対象） */
  subText?: string;
  /** @deprecated 廃止済み（新規制作では描画されず、バリデータエラー対象） */
  badge?: string;
  color?: string;
  fontSize?: number;
  serif?: boolean;
  width?: number | string;
  rotateDeg?: number;
  accentColor?: string;
  isConclusion?: boolean;
}

export interface PolarityKineticListProps {
  items: readonly PolarityKineticItem[];
  sec?: number;
  polarity?: StagePolarity;
  variant?: 'formula' | 'paper_notes';
  gap?: number;
  dividerWidth?: number;
  align?: 'left' | 'center';
  style?: React.CSSProperties;
}

export const PolarityKineticList: React.FC<PolarityKineticListProps> = ({
  items,
  sec,
  polarity = 'black',
  variant = 'formula',
  gap,
  dividerWidth = 560,
  align = 'left',
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = sec ?? frame / Math.max(1, fps);
  const theme = resolvePolarityTheme(polarity);
  const resolvedGap = gap ?? (variant === 'paper_notes' ? 22 : 18);

  const getSnapTransform = (triggerSec: number, yFrom: number, scaleFrom: number) => {
    const lf = Math.max(0, (currentSec - triggerSec) * fps);
    const spr = spring({
      frame: lf,
      fps,
      config: { stiffness: 460, damping: 24, mass: 0.65 },
    });
    return {
      translateY: interpolate(spr, [0, 1], [yFrom, 0]),
      scale: interpolate(spr, [0, 1], [scaleFrom, 1.0]),
    };
  };

  if (variant === 'paper_notes') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: align === 'left' ? 'flex-start' : 'center',
          justifyContent: 'center',
          gap: resolvedGap,
          ...style,
        }}
      >
        {items
          .filter((item) => currentSec >= item.triggerSec)
          .map((item, idx) => {
            const { translateY, scale } = getSnapTransform(item.triggerSec, -18, 1.07);
            const accent = item.accentColor ?? '#1C1917';
            const rotate = item.rotateDeg ?? (idx % 2 === 0 ? -1.1 : 1.0);

            return (
              <div
                key={item.id ?? `${item.text}-${idx}`}
                style={{
                  transform: `translateY(${translateY}px) scale(${scale})`,
                }}
              >
                <HandDrawnFrame
                  width={item.width ?? 880}
                  polarity={polarity}
                  bg="#FAF8F3"
                  borderColor={accent}
                  strokeWidth={4.5}
                  tape={idx % 2 === 0}
                  tiltDeg={rotate}
                  padding="16px 28px"
                >
                  <div
                    style={{
                      fontFamily: item.serif ? FONT_SERIF : FONT_HAND,
                      fontSize: item.fontSize ?? 40,
                      fontWeight: item.serif ? 900 : 700,
                      lineHeight: 1.28,
                      lineBreak: 'strict',
                      wordBreak: 'keep-all',
                      color: item.color ?? '#1C1917',
                      textAlign: align === 'center' ? 'center' : 'left',
                    }}
                  >
                    {item.text}
                  </div>
                </HandDrawnFrame>
              </div>
            );
          })}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        gap: resolvedGap,
        fontFamily: FONT_HAND,
        fontWeight: 900,
        letterSpacing: '0.03em',
        ...style,
      }}
    >
      {items
        .filter((item) => currentSec >= item.triggerSec)
        .map((item, idx) => {
          if (item.isConclusion) {
            const lineDraw = beatProgress(currentSec, item.triggerSec, item.triggerSec + 0.35, true);
            const { translateY, scale } = getSnapTransform(item.triggerSec + 0.08, -14, 1.06);

            return (
              <div
                key={item.id ?? `${item.text}-${idx}`}
                style={{
                  marginTop: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: align === 'center' ? 'center' : 'flex-start',
                }}
              >
                <svg width={dividerWidth} height={22} viewBox="0 0 560 22" aria-hidden="true">
                  <path
                    d="M 6 12 Q 190 5 390 13 T 548 10"
                    fill="none"
                    stroke={theme.ink}
                    strokeWidth={7}
                    strokeLinecap="round"
                    strokeDasharray={560}
                    strokeDashoffset={560 * (1 - lineDraw)}
                  />
                </svg>
                <div
                  style={{
                    transform: `translateY(${translateY}px) scale(${scale})`,
                    color: item.color ?? theme.accentPrimary,
                    fontSize: item.fontSize ?? 62,
                    marginTop: 6,
                    textAlign: align === 'center' ? 'center' : 'left',
                  }}
                >
                  {item.text}
                </div>
              </div>
            );
          }

          const { translateY, scale } = getSnapTransform(item.triggerSec, -14, 1.06);
          return (
            <div
              key={item.id ?? `${item.text}-${idx}`}
              style={{
                transform: `translateY(${translateY}px) scale(${scale})`,
                color: item.color ?? theme.ink,
                fontSize: item.fontSize ?? 54,
                textAlign: align === 'center' ? 'center' : 'left',
              }}
            >
              <div>{item.text}</div>
            </div>
          );
        })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 10. PolarityArrowCallout: BoilSvg + DrawPath 曲線矢印＋HandNote            */
/* -------------------------------------------------------------------------- */

export interface PolarityArrowCalloutProps {
  sec: number;
  at?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  curveOffsetY?: number;
  color?: string;
  strokeWidth?: number;
  label?: string;
  labelX?: number;
  labelY?: number;
  polarity?: StagePolarity;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  style?: React.CSSProperties;
}

export const PolarityArrowCallout: React.FC<PolarityArrowCalloutProps> = ({
  sec,
  at = 0,
  fromX = 420,
  fromY = 380,
  toX = 1140,
  toY = 320,
  curveOffsetY = -120,
  color,
  strokeWidth = 10,
  label,
  labelX,
  labelY,
  polarity = 'black',
  viewBoxWidth = 1728,
  viewBoxHeight = 840,
  style,
}) => {
  if (sec < at) {
    return null;
  }
  const theme = resolvePolarityTheme(polarity);
  const resolvedColor = color ?? theme.accentPrimary;
  const ctrlX = (fromX + toX) / 2;
  const ctrlY = (fromY + toY) / 2 + curveOffsetY;
  const angle = Math.atan2(toY - ctrlY, toX - ctrlX);
  const headLen = 28;
  const h1x = toX - headLen * Math.cos(angle - Math.PI / 6);
  const h1y = toY - headLen * Math.sin(angle - Math.PI / 6);
  const h2x = toX - headLen * Math.cos(angle + Math.PI / 6);
  const h2y = toY - headLen * Math.sin(angle + Math.PI / 6);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...style }}>
      <BoilSvg
        width={viewBoxWidth}
        height={viewBoxHeight}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        scale={2.4}
        style={{ width: '100%', height: '100%' }}
      >
        <DrawPath
          d={`M ${fromX} ${fromY} Q ${ctrlX} ${ctrlY}, ${toX} ${toY}`}
          sec={sec}
          at={at}
          dur={0.45}
          stroke={resolvedColor}
          width={strokeWidth}
        />
        <DrawPath
          d={`M ${h1x} ${h1y} L ${toX} ${toY} L ${h2x} ${h2y}`}
          sec={sec}
          at={at + 0.34}
          dur={0.18}
          stroke={resolvedColor}
          width={strokeWidth}
        />
      </BoilSvg>
      {label ? (
        <div
          style={{
            position: 'absolute',
            left: `${((labelX ?? ctrlX) / viewBoxWidth) * 100}%`,
            top: `${((labelY ?? Math.max(48, ctrlY - 50)) / viewBoxHeight) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <ScalePop sec={sec} triggerSec={at + 0.25}>
            <HandNote text={label} polarity={polarity} color={resolvedColor} size={42} />
          </ScalePop>
        </div>
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 11. PolarityRedCircle: 手描き有機ベジェ丸囲み（正円<circle>不使用）          */
/* -------------------------------------------------------------------------- */

export interface PolarityRedCircleProps {
  sec: number;
  at?: number;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  dashed?: boolean;
  color?: string;
  strokeWidth?: number;
  polarity?: StagePolarity;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  style?: React.CSSProperties;
}

export const PolarityRedCircle: React.FC<PolarityRedCircleProps> = ({
  sec,
  at = 0,
  cx = 864,
  cy = 400,
  rx = 160,
  ry = 115,
  dashed = false,
  color,
  strokeWidth = 9,
  polarity = 'black',
  viewBoxWidth = 1728,
  viewBoxHeight = 840,
  style,
}) => {
  if (sec < at) {
    return null;
  }
  const theme = resolvePolarityTheme(polarity);
  const resolvedColor = color ?? (theme.isLight ? '#E62E2D' : '#FF4D4D');
  const d = [
    `M ${cx} ${cy - ry}`,
    `C ${cx + rx * 0.72} ${cy - ry * 1.04}, ${cx + rx * 1.05} ${cy - ry * 0.45}, ${cx + rx} ${cy + ry * 0.04}`,
    `C ${cx + rx * 0.96} ${cy + ry * 0.68}, ${cx + rx * 0.48} ${cy + ry * 1.03}, ${cx - rx * 0.04} ${cy + ry}`,
    `C ${cx - rx * 0.66} ${cy + ry * 0.96}, ${cx - rx * 1.04} ${cy + ry * 0.48}, ${cx - rx} ${cy - ry * 0.04}`,
    `C ${cx - rx * 0.96} ${cy - ry * 0.66}, ${cx - rx * 0.45} ${cy - ry * 1.02}, ${cx + rx * 0.06} ${cy - ry * 0.96}`,
  ].join(' ');

  return (
    <BoilSvg
      width={viewBoxWidth}
      height={viewBoxHeight}
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      scale={2.6}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }}
    >
      <DrawPath
        d={d}
        sec={sec}
        at={at}
        dur={0.48}
        stroke={resolvedColor}
        width={strokeWidth}
        dash={dashed ? '24 16' : undefined}
      />
    </BoilSvg>
  );
};

/* -------------------------------------------------------------------------- */
/* 12. PolarityStamp: ドスンと叩きつける極太スタンプ                            */
/* -------------------------------------------------------------------------- */

export interface PolarityStampProps {
  text: string;
  sec: number;
  at?: number;
  polarity?: StagePolarity;
  color?: string;
  rotateDeg?: number;
  fontSize?: number;
  style?: React.CSSProperties;
}

export const PolarityStamp: React.FC<PolarityStampProps> = ({
  text,
  sec,
  at = 0,
  polarity = 'black',
  color,
  rotateDeg = -10,
  fontSize = 76,
  style,
}) => {
  const seed = useBoilSeed(7.5, 16);
  const rawId = useId();
  const filterId = `sc-stamp-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  if (sec < at) {
    return null;
  }
  const theme = resolvePolarityTheme(polarity);
  const resolvedColor = color ?? theme.accentWarning;
  const p = beatProgress(sec, at, at + 0.18, true);
  const scale = interpolate(p, [0, 1], [1.95, 1.0]);

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        transform: `rotate(${rotateDeg}deg) scale(${scale})`,
        padding: '10px 34px',
        fontFamily: FONT_MARU,
        fontWeight: 900,
        fontSize,
        lineHeight: 1.08,
        color: resolvedColor,
        backgroundColor: theme.stampBg,
        filter: theme.isLight
          ? 'drop-shadow(5px 6px 0 rgba(28, 25, 23, 0.22))'
          : 'drop-shadow(0 14px 32px rgba(0, 0, 0, 0.85))',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <svg
        viewBox="0 0 200 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: -2,
          width: 'calc(100% + 4px)',
          height: 'calc(100% + 4px)',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        <defs>
          <filter id={filterId} x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={seed} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={2.4} />
          </filter>
        </defs>
        <g filter={`url(#${filterId})`}>
          <path
            d="M 4 5 C 66 2, 134 6, 196 4 C 198 35, 196 68, 197 95 C 134 98, 66 94, 3 96 C 2 66, 5 35, 4 5 Z"
            fill="none"
            stroke={resolvedColor}
            strokeWidth={8.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M 10 11 C 68 9, 132 12, 190 10 C 191 37, 190 64, 191 89 C 132 91, 68 89, 9 90 C 8 64, 11 37, 10 11 Z"
            fill="none"
            stroke={resolvedColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      <span style={{ position: 'relative', zIndex: 1 }}>{text}</span>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 13. PolarityRulerGauge: 効果量物差し(ruler) / 残量バッテリー(battery)       */
/* -------------------------------------------------------------------------- */

export interface PolarityRulerGaugeProps {
  variant?: 'ruler' | 'battery';
  label: string;
  sec: number;
  at: number;
  animateAt?: number;
  fromValue?: number;
  toValue?: number;
  min?: number;
  max?: number;
  ticks?: readonly { value: number; label: string }[];
  polarity?: StagePolarity;
  style?: React.CSSProperties;
}

export const PolarityRulerGauge: React.FC<PolarityRulerGaugeProps> = ({
  variant = 'ruler',
  label,
  sec,
  at,
  animateAt,
  fromValue,
  toValue,
  min = 0,
  max = 1,
  ticks,
  polarity = 'cream_notebook',
  style,
}) => {
  const { fps } = useVideoConfig();
  if (sec < at) {
    return null;
  }
  const theme = resolvePolarityTheme(polarity);
  const animStart = animateAt ?? at + 0.35;
  const appear = spring({
    frame: Math.max(0, (sec - at) * fps),
    fps,
    config: { stiffness: 460, damping: 24, mass: 0.65 },
  });

  if (variant === 'battery') {
    const startPct = fromValue ?? 92;
    const endPct = toValue ?? 8;
    const level = interpolate(sec, [animStart, animStart + 1.1], [startPct, endPct], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const ratio = Math.max(0, Math.min(1, level / 100));
    const fill = ratio > 0.5 ? '#22C55E' : ratio > 0.24 ? '#FACC15' : '#DC2626';

    return (
      <div
        style={{
          opacity: Math.min(1, appear * 2),
          transform: `scale(${interpolate(appear, [0, 1], [0.7, 1])})`,
          transformOrigin: 'left center',
          ...style,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', width: 560, marginBottom: 8 }}>
          <span style={{ fontFamily: FONT_MARU, fontWeight: 900, fontSize: 36, color: theme.ink }}>{label}</span>
          <span style={{ fontFamily: FONT_SANS, fontWeight: 900, fontSize: 40, color: fill }}>{Math.round(level)}%</span>
        </div>
        <BoilSvg width={620} height={160} viewBox="0 0 620 160" scale={2.4}>
          <path
            d="M 14 18 C 180 12, 400 12, 560 18 C 566 58, 566 102, 560 142 C 400 148, 180 148, 14 142 C 8 102, 8 58, 14 18 Z"
            fill={theme.isLight ? '#FFFFFF' : '#111116'}
            stroke={theme.ink}
            strokeWidth={9}
          />
          <path d="M 566 54 C 588 54, 600 56, 602 60 C 604 76, 604 88, 602 100 C 600 104, 588 106, 566 106" fill={theme.ink} />
          <path
            d={`M 30 34 L ${30 + Math.max(18, 514 * ratio)} 34 L ${30 + Math.max(18, 514 * ratio)} 126 L 30 126 Z`}
            fill={fill}
            stroke={theme.ink}
            strokeWidth={5}
            strokeLinejoin="round"
          />
        </BoilSvg>
      </div>
    );
  }

  const resolvedFrom = fromValue ?? min;
  const resolvedTo = toValue ?? 0.65;
  const val = interpolate(sec, [animStart, animStart + 0.85], [resolvedFrom, resolvedTo], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const span = Math.max(0.001, max - min);
  const ratio = Math.max(0, Math.min(1, (val - min) / span));
  const x0 = 60;
  const x1 = 1140;
  const vx = x0 + (x1 - x0) * ratio;
  const defaultTicks = ticks ?? [
    { value: 0, label: '0' },
    { value: 0.2, label: '0.2 小' },
    { value: 0.5, label: '0.5 中' },
    { value: 0.8, label: '0.8 大' },
    { value: 1.0, label: '1.0' },
  ];

  return (
    <div style={{ opacity: Math.min(1, appear * 2), transform: `translateY(${(1 - appear) * 18}px)`, ...style }}>
      <div style={{ marginBottom: 6 }}>
        <StickerTag text={label} polarity={polarity} bg="#FEF08A" color="#111111" size={34} />
      </div>
      <BoilSvg width={1220} height={225} viewBox="0 0 1220 225" scale={2.2}>
        <path d={`M ${x0} 140 C 380 136, 780 144, ${x1} 140`} stroke={theme.ink} strokeWidth={9} fill="none" strokeLinecap="round" />
        {defaultTicks.map((t) => {
          const tx = x0 + (x1 - x0) * Math.max(0, Math.min(1, (t.value - min) / span));
          return (
            <g key={t.label}>
              <path d={`M ${tx} 122 C ${tx + 1} 132, ${tx} 148, ${tx + 1} 158`} stroke={theme.ink} strokeWidth={6} strokeLinecap="round" />
              <text x={tx} y={200} textAnchor="middle" fontFamily={FONT_MARU} fontWeight={900} fontSize={28} fill={theme.mutedInk}>
                {t.label}
              </text>
            </g>
          );
        })}
        {sec >= animStart ? (
          <g transform={`translate(${vx} 0)`}>
            <path
              d="M 0 132 C -14 104, -26 88, -26 72 C -26 54, 26 54, 26 72 C 26 88, 14 104, 0 132 Z"
              fill={theme.accentPrimary}
              stroke={theme.ink}
              strokeWidth={6}
            />
            <text
              x={0}
              y={46}
              textAnchor="middle"
              fontFamily={FONT_MARU}
              fontWeight={900}
              fontSize={58}
              fill={theme.accentPrimary}
              stroke={theme.outlineColor}
              strokeWidth={10}
              paintOrder="stroke"
            >
              {val.toFixed(2)}
            </text>
          </g>
        ) : null}
      </BoilSvg>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 14. StickmanEndCtaStage: 挨拶締め廃止・オプション末尾CTAステージ             */
/* -------------------------------------------------------------------------- */

export interface StickmanEndCtaStageProps {
  sec: number;
  t0: number;
  polarity?: StagePolarity;
  linkLabelJa?: string;
  headlineJa?: string;
  communityPromptJa?: string;
  endCardLabels?: readonly [string, string];
}

export const StickmanEndCtaStage: React.FC<StickmanEndCtaStageProps> = ({
  sec,
  t0,
  polarity = 'black',
  linkLabelJa = '本編で残した最大の分岐へ',
  headlineJa = '次の一手はここで解説中',
  communityPromptJa = 'あなたの経験もコメント欄へ',
  endCardLabels = ['次に見るべき一本', '深掘り再生リスト'],
}) => {
  const theme = resolvePolarityTheme(polarity);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 36px 8px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <ScalePop sec={sec} triggerSec={t0 + 0.04}>
          <StickerTag
            text={linkLabelJa}
            polarity={polarity}
            bg={theme.isLight ? '#FEF08A' : '#FAF8F3'}
            color="#111111"
            size={28}
          />
        </ScalePop>
        <ScalePop sec={sec} triggerSec={t0 + 0.16}>
          <div
            style={{
              marginTop: 12,
              fontFamily: FONT_MARU,
              fontWeight: 900,
              fontSize: 64,
              lineHeight: 1.12,
              color: theme.accentPrimary,
              textShadow: theme.isLight ? '4px 5px 0 rgba(17,17,17,0.18)' : '0 10px 26px rgba(0,0,0,0.85)',
            }}
          >
            {headlineJa}
          </div>
        </ScalePop>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 1360,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 56,
        }}
      >
        {endCardLabels.map((label, i) => (
          <div
            key={`${label}-${i}`}
            style={{
              height: 300,
              border: `5px dashed ${theme.ink}`,
              borderRadius: 0,
              backgroundColor: theme.isLight ? 'rgba(255, 255, 255, 0.78)' : 'rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <div style={{ fontFamily: FONT_HAND, fontSize: 22, fontWeight: 700, color: theme.mutedInk }}>
              ▶ NEXT {i + 1}
            </div>
            <div style={{ fontFamily: FONT_MARU, fontSize: 32, fontWeight: 900, color: theme.ink }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <StickmanFigure pose="pointing" polarity={polarity} size={195} />
        {communityPromptJa ? (
          <StickmanBubble
            text={communityPromptJa}
            tailDirection="left"
            polarity={polarity}
            fontSize={28}
            maxWidth={480}
          />
        ) : null}
      </div>
    </div>
  );
};
