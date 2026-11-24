import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { PLAN_E_MACRO_PALETTE } from '../../../theme/tokens';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from '../fonts';
import { PlanEChartData } from './typesV2';

export interface EconChartWidgetProps {
  data: PlanEChartData;
  startSec: number;
  endSec: number;
  width?: number | string;
  height?: number;
  style?: React.CSSProperties;
}

const DEFAULT_SERIES_COLORS = [
  PLAN_E_MACRO_PALETTE.dataBlue,
  PLAN_E_MACRO_PALETTE.emeraldBright,
  PLAN_E_MACRO_PALETTE.policyGold,
  PLAN_E_MACRO_PALETTE.crisisRed,
  PLAN_E_MACRO_PALETTE.networkOrange,
];

/**
 * 案E データ駆動 2D経済チャートコンポーネント。
 * line / bar / dual_compare / crash_curve / stacked_bar を明暗両背景で高コントラスト描画する。
 */
export const EconChartWidget: React.FC<EconChartWidgetProps> = ({
  data,
  startSec,
  endSec,
  width = '100%',
  height = 490,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const localFrame = Math.max(0, frame - Math.round(startSec * fps));

  const drawProg = interpolate(
    sec,
    [startSec + 0.08, Math.min(endSec - 0.15, startSec + 1.05)],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );

  const badgeSpring = spring({
    frame: Math.max(0, localFrame - Math.round(0.45 * fps)),
    fps,
    config: { stiffness: 420, damping: 22, mass: 0.65 },
  });

  const isLight = Boolean(data.lightTheme);
  const cardBg = isLight ? '#FFFFFF' : '#161B22';
  const borderColor = isLight ? '#CBD5E1' : '#334155';
  const titleColor = isLight ? PLAN_E_MACRO_PALETTE.inkDark : PLAN_E_MACRO_PALETTE.textLight;
  const mutedColor = isLight ? '#475569' : PLAN_E_MACRO_PALETTE.textMuted;
  const gridColor = isLight ? 'rgba(15, 23, 42, 0.10)' : 'rgba(148, 163, 184, 0.15)';
  const axisColor = isLight ? '#64748B' : '#94A3B8';

  const vbW = 1040;
  const vbH = 380;
  const padL = 78;
  const padR = 44;
  const padT = 32;
  const padB = 56;
  const plotW = vbW - padL - padR;
  const plotH = vbH - padT - padB;

  const points = data.points ?? [];
  const series = data.series ?? [];
  const labels = data.labels ?? points.map((p) => p.label);

  // Y軸スケール算出
  let allVals: number[] = [];
  if (data.kind === 'stacked_bar' && series.length > 0) {
    const colCount = Math.max(...series.map((s) => s.values.length), 0);
    for (let i = 0; i < colCount; i++) {
      allVals.push(series.reduce((acc, s) => acc + (s.values[i] ?? 0), 0));
    }
  } else if (series.length > 0) {
    allVals = series.flatMap((s) => [...s.values]);
  } else {
    allVals = points.flatMap((p) =>
      p.secondaryValue !== undefined ? [p.value, p.secondaryValue] : [p.value],
    );
  }
  if (allVals.length === 0) {
    allVals = [0, 100];
  }

  const rawMin = data.yMin ?? Math.min(0, ...allVals);
  const rawMax = data.yMax ?? Math.max(...allVals, rawMin + 1);
  const span = Math.max(1e-6, rawMax - rawMin);
  const toY = (v: number) => padT + plotH - ((v - rawMin) / span) * plotH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const val = rawMin + span * t;
    return { y: toY(val), label: Number.isInteger(val) ? String(val) : val.toFixed(1) };
  });

  const renderLineOrCrash = () => {
    const primaryColor =
      data.kind === 'crash_curve'
        ? PLAN_E_MACRO_PALETTE.crisisRed
        : isLight
          ? PLAN_E_MACRO_PALETTE.dataBlue
          : PLAN_E_MACRO_PALETTE.emeraldBright;
    const secondaryColor = isLight
      ? PLAN_E_MACRO_PALETTE.networkOrange
      : PLAN_E_MACRO_PALETTE.dataCyan;

    const count = points.length;
    if (count === 0) return null;

    const coords = points.map((p, idx) => ({
      x: padL + (count === 1 ? plotW / 2 : (idx / (count - 1)) * plotW),
      y: toY(p.value),
      y2: p.secondaryValue !== undefined ? toY(p.secondaryValue) : null,
      point: p,
    }));

    const lineD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const areaD = `${lineD} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

    const hasSec = coords.some((c) => c.y2 !== null);
    const line2D = hasSec
      ? coords
          .filter((c) => c.y2 !== null)
          .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y2!.toFixed(1)}`)
          .join(' ')
      : '';

    const clipW = plotW * drawProg + 24;

    return (
      <>
        <defs>
          <clipPath id={`econ-clip-${startSec.toFixed(2)}`}>
            <rect x={padL - 8} y={0} width={clipW} height={vbH} />
          </clipPath>
          <linearGradient id={`econ-area-${startSec.toFixed(2)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity={0.32} />
            <stop offset="100%" stopColor={primaryColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <g clipPath={`url(#econ-clip-${startSec.toFixed(2)})`}>
          <path d={areaD} fill={`url(#econ-area-${startSec.toFixed(2)})`} />
          {hasSec ? (
            <path
              d={line2D}
              fill="none"
              stroke={secondaryColor}
              strokeWidth={4}
              strokeDasharray="10 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          <path
            d={lineD}
            fill="none"
            stroke={primaryColor}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coords.map((c, idx) => {
            const isHi = c.point.highlight || idx === data.highlightIndex || idx === coords.length - 1;
            return (
              <g key={`pt-${idx}`}>
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isHi ? 8 : 5}
                  fill={isHi ? primaryColor : cardBg}
                  stroke={primaryColor}
                  strokeWidth={3}
                />
                {c.point.annotation ? (
                  <g>
                    <rect
                      x={
                        (idx === coords.length - 1 ? c.x - (c.point.annotation.length * 16 + 18) : c.x - (c.point.annotation.length * 16 + 18) / 2)
                      }
                      y={Math.max(padT + 4, c.y - 34)}
                      width={c.point.annotation.length * 16 + 18}
                      height={22}
                      rx={4}
                      fill={isLight ? '#FFFFFF' : '#0E1014'}
                      stroke={primaryColor}
                      strokeWidth={1.5}
                    />
                    <text
                      x={
                        idx === coords.length - 1
                          ? c.x - (c.point.annotation.length * 16 + 18) / 2
                          : c.x
                      }
                      y={Math.max(padT + 19, c.y - 19)}
                      textAnchor="middle"
                      fill={isLight ? PLAN_E_MACRO_PALETTE.inkDark : '#F8FAFC'}
                      fontFamily={FONT_ECON_MONO}
                      fontSize={13}
                      fontWeight={800}
                    >
                      {c.point.annotation}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </g>
      </>
    );
  };

  const renderBarOrStacked = () => {
    if (data.kind === 'stacked_bar' && series.length > 0) {
      const colCount = labels.length;
      if (colCount === 0) return null;
      const slotW = plotW / colCount;
      const barW = Math.min(86, slotW * 0.56);

      return (
        <>
          {labels.map((_, colIdx) => {
            let accHeight = 0;
            const x = padL + colIdx * slotW + (slotW - barW) / 2;
            const colReveal = interpolate(
              drawProg,
              [colIdx * 0.08, Math.min(1, colIdx * 0.08 + 0.55)],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            );

            return (
              <g key={`scol-${colIdx}`}>
                {series.map((s, sIdx) => {
                  const val = (s.values[colIdx] ?? 0) * colReveal;
                  const segH = (val / span) * plotH;
                  const yBottom = padT + plotH - accHeight;
                  const yTop = yBottom - segH;
                  accHeight += segH;
                  const fill = s.color ?? DEFAULT_SERIES_COLORS[sIdx % DEFAULT_SERIES_COLORS.length];
                  return (
                    <rect
                      key={`seg-${sIdx}`}
                      x={x}
                      y={yTop}
                      width={barW}
                      height={Math.max(0, segH)}
                      fill={fill}
                      stroke={cardBg}
                      strokeWidth={1.5}
                    />
                  );
                })}
              </g>
            );
          })}
        </>
      );
    }

    const count = points.length;
    if (count === 0) return null;
    const slotW = plotW / count;
    const isDual = data.kind === 'dual_compare' || points.some((p) => p.secondaryValue !== undefined);
    const barW = isDual ? Math.min(42, slotW * 0.34) : Math.min(72, slotW * 0.54);

    return (
      <>
        {points.map((p, idx) => {
          const itemProg = interpolate(
            drawProg,
            [idx * 0.08, Math.min(1, idx * 0.08 + 0.5)],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          const v1 = p.value * itemProg;
          const y1 = toY(v1);
          const h1 = Math.max(0, padT + plotH - y1);
          const isHi = p.highlight || idx === data.highlightIndex;
          const color1 = isHi
            ? PLAN_E_MACRO_PALETTE.crisisRed
            : isLight
              ? PLAN_E_MACRO_PALETTE.dataBlue
              : PLAN_E_MACRO_PALETTE.emeraldBright;

          const xBase = padL + idx * slotW + slotW / 2;
          const x1 = isDual ? xBase - barW - 4 : xBase - barW / 2;

          return (
            <g key={`bar-${idx}`}>
              <rect x={x1} y={y1} width={barW} height={h1} rx={3} fill={color1} />
              <text
                x={x1 + barW / 2}
                y={Math.max(padT + 14, y1 - 8)}
                textAnchor="middle"
                fill={titleColor}
                fontFamily={FONT_ECON_MONO}
                fontSize={15}
                fontWeight={800}
              >
                {p.value}
              </text>
              {isDual && p.secondaryValue !== undefined ? (
                <>
                  <rect
                    x={xBase + 4}
                    y={toY(p.secondaryValue * itemProg)}
                    width={barW}
                    height={Math.max(0, padT + plotH - toY(p.secondaryValue * itemProg))}
                    rx={3}
                    fill={PLAN_E_MACRO_PALETTE.policyGold}
                  />
                  <text
                    x={xBase + 4 + barW / 2}
                    y={Math.max(padT + 14, toY(p.secondaryValue * itemProg) - 8)}
                    textAnchor="middle"
                    fill={mutedColor}
                    fontFamily={FONT_ECON_MONO}
                    fontSize={15}
                    fontWeight={700}
                  >
                    {p.secondaryValue}
                  </text>
                </>
              ) : null}
            </g>
          );
        })}
      </>
    );
  };

  return (
    <div
      style={{
        width,
        backgroundColor: cardBg,
        border: `1px solid ${borderColor}`,
        borderTop: `5px solid ${
          data.kind === 'crash_curve'
            ? PLAN_E_MACRO_PALETTE.crisisRed
            : PLAN_E_MACRO_PALETTE.emerald
        }`,
        padding: '20px 26px 16px',
        boxShadow: isLight
          ? '0 14px 34px rgba(15, 23, 42, 0.10)'
          : '0 18px 44px rgba(0, 0, 0, 0.55)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* ヘッダー行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div
            style={{
              fontFamily: FONT_ECON_SERIF,
              fontSize: 28,
              fontWeight: 900,
              color: titleColor,
              lineHeight: 1.25,
            }}
          >
            {data.title}
          </div>
          {data.subtitle ? (
            <div style={{ fontSize: 17, color: mutedColor, marginTop: 4 }}>{data.subtitle}</div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {data.unit ? (
            <span
              style={{
                fontFamily: FONT_ECON_MONO,
                fontSize: 15,
                fontWeight: 700,
                color: mutedColor,
                border: `1px solid ${borderColor}`,
                padding: '4px 10px',
              }}
            >
              {data.unit}
            </span>
          ) : null}
          {data.calloutBadge ? (
            <span
              style={{
                transform: `scale(${badgeSpring})`,
                backgroundColor:
                  data.kind === 'crash_curve'
                    ? PLAN_E_MACRO_PALETTE.crisisRed
                    : PLAN_E_MACRO_PALETTE.emerald,
                color: '#FFFFFF',
                fontFamily: FONT_ECON_SANS,
                fontSize: 17,
                fontWeight: 900,
                padding: '5px 14px',
              }}
            >
              {data.calloutBadge}
            </span>
          ) : null}
        </div>
      </div>

      {/* SVG グラフ本体 */}
      <svg
        width="100%"
        height={Math.max(240, height - 138)}
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {/* 水平グリッド & Y軸目盛り */}
        {yTicks.map((tk, i) => (
          <g key={`yt-${i}`}>
            <line
              x1={padL}
              y1={tk.y}
              x2={vbW - padR}
              y2={tk.y}
              stroke={gridColor}
              strokeWidth={1.2}
            />
            <text
              x={padL - 12}
              y={tk.y + 5}
              textAnchor="end"
              fill={axisColor}
              fontFamily={FONT_ECON_MONO}
              fontSize={15}
            >
              {tk.label}
            </text>
          </g>
        ))}

        {/* X軸ベース線 */}
        <line
          x1={padL}
          y1={padT + plotH}
          x2={vbW - padR}
          y2={padT + plotH}
          stroke={axisColor}
          strokeWidth={2}
        />

        {/* チャート本体 */}
        {data.kind === 'line' || data.kind === 'crash_curve'
          ? renderLineOrCrash()
          : renderBarOrStacked()}

        {/* X軸ラベル */}
        {labels.map((lbl, idx) => {
          const isBar = data.kind === 'bar' || data.kind === 'dual_compare' || data.kind === 'stacked_bar';
          const x = isBar
            ? padL + (idx + 0.5) * (plotW / Math.max(1, labels.length))
            : padL + (labels.length === 1 ? plotW / 2 : (idx / (labels.length - 1)) * plotW);
          return (
            <text
              key={`xl-${idx}`}
              x={x}
              y={vbH - 18}
              textAnchor="middle"
              fill={mutedColor}
              fontFamily={FONT_ECON_SANS}
              fontSize={16}
              fontWeight={700}
            >
              {lbl}
            </text>
          );
        })}
      </svg>

      {/* 凡例・出典フッター */}
      <div
        style={{
          display: 'flex',
          flexDirection: series.length > 0 && data.sourceCitation ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: series.length > 0 && data.sourceCitation ? 'flex-start' : 'center',
          gap: 6,
          minHeight: 24,
          borderTop: `1px dashed ${borderColor}`,
          paddingTop: 8,
        }}
      >
        {series.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
            {series.map((s, idx) => (
              <div
                key={`leg-${idx}`}
                style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    flexShrink: 0,
                    backgroundColor: s.color ?? DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length],
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: 15, fontWeight: 700, color: titleColor, whiteSpace: 'nowrap' }}>
                  {s.name}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {data.sourceCitation ? (
          <div
            style={{
              fontFamily: FONT_ECON_MONO,
              fontSize: 13,
              color: mutedColor,
              lineHeight: 1.35,
            }}
          >
            {data.sourceCitation}
          </div>
        ) : null}
      </div>
    </div>
  );
};
