import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { SUBTITLE_SAFE_BOTTOM } from './constants';
import { EconHostAvatar } from './EconHostAvatar';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from './fonts';

export interface WhiteboardTrendSeries {
  id: string;
  label: string;
  badgeText: string;
  color: string;
  strokeWidth?: number;
  dashed?: string;
  values: readonly number[];
  /** 主役（例: 日本の横ばい赤太線）として後半に強調表示する系列 */
  isHighlight?: boolean;
}

export interface WhiteboardTrendChartProps {
  title: string;
  subtitle?: string;
  xLabels: readonly string[];
  yTicks?: readonly number[];
  yMin?: number;
  yMax?: number;
  /** 破線基準線の値（既定 100、null で非強調） */
  baselineTick?: number | null;
  series: readonly WhiteboardTrendSeries[];
  /** シーン開始時刻（グローバル秒・Template直挿し時対応） */
  startSec?: number;
  /** シーン終了時刻（グローバル秒） */
  endSec?: number;
  /** 主役系列（isHighlight: true）の描画開始オフセット秒（既定: 2.5秒） */
  highlightOffsetSec?: number;
  /** 主役系列の描画開始ローカルフレーム（互換用） */
  highlightStartFrame?: number;
  /** 主役系列終端を赤丸ハイライトするか */
  circleLastHighlight?: boolean;
  /** 乖離ハッチング帯のラベル（例: 「30年格差 -50pt」） */
  gapBadgeText?: string;
  /** 強調スタンプ（例: 「実質賃金 ほぼ横ばい」） */
  stampText?: string;
  avatarEmblem?: string;
}

interface DeconflictedLabel {
  id: string;
  badgeText: string;
  color: string;
  isHighlight: boolean;
  rawY: number;
  y: number;
  fontSize: number;
  fontWeight: number;
}

function deconflictEndLabels(
  items: Omit<DeconflictedLabel, 'y'>[],
  minY: number,
  maxY: number,
  minGap = 36,
): DeconflictedLabel[] {
  const sorted = [...items]
    .sort((a, b) => a.rawY - b.rawY)
    .map((item) => ({ ...item, y: Math.max(minY, Math.min(maxY, item.rawY)) }));

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y < sorted[i - 1].y + minGap) {
      sorted[i].y = sorted[i - 1].y + minGap;
    }
  }
  if (sorted.length > 0 && sorted[sorted.length - 1].y > maxY) {
    sorted[sorted.length - 1].y = maxY;
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (sorted[i].y > sorted[i + 1].y - minGap) {
        sorted[i].y = Math.max(minY, sorted[i + 1].y - minGap);
      }
    }
  }
  return sorted;
}

/**
 * 案E v2.1 標準コンポーネント（ABテスト v2 勝因昇格）:
 * オーク木枠＋アルミペントレイ（マーカー3本）＋指示棒アバターの物理ホワイトボード上に、
 * 複数国の比較折れ線＋強調赤太線＋乖離ハッチング帯＋衝突回避済み終端ラベル＋強調スタンプを描画する。
 */
export const WhiteboardTrendChart: React.FC<WhiteboardTrendChartProps> = ({
  title,
  subtitle,
  xLabels,
  yTicks = [90, 100, 120, 140, 160],
  yMin = 88,
  yMax = 162,
  baselineTick = 100,
  series,
  startSec = 0,
  highlightOffsetSec,
  highlightStartFrame,
  circleLastHighlight = true,
  gapBadgeText,
  stampText,
  avatarEmblem = '¥?',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const baseFrame = Math.round(startSec * fps);
  const localFrame = Math.max(0, frame - baseFrame);
  const hlStart =
    highlightOffsetSec !== undefined
      ? Math.round(highlightOffsetSec * fps)
      : highlightStartFrame ?? 75;

  const boardSpr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 340, damping: 26, mass: 0.7 },
  });

  const baseProg = interpolate(localFrame, [4, Math.max(24, hlStart - 6)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const hlProg = interpolate(localFrame, [hlStart, hlStart + 46], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const gapOpacity = interpolate(localFrame, [hlStart + 22, hlStart + 42], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const stampSpr = spring({
    frame: Math.max(0, localFrame - (hlStart + 18)),
    fps,
    config: { stiffness: 460, damping: 20, mass: 0.6 },
  });

  const vbW = 1280;
  const vbH = 510;
  const padL = 82;
  const padR = 264;
  const padT = 34;
  const padB = 56;
  const plotW = vbW - padL - padR;
  const plotH = vbH - padT - padB;

  const toX = (i: number) =>
    padL + (xLabels.length <= 1 ? 0 : (i / (xLabels.length - 1)) * plotW);
  const toY = (v: number) => padT + ((yMax - v) / Math.max(1, yMax - yMin)) * plotH;

  const buildPolyline = (vals: readonly number[], prog: number): { points: string; endX: number; endY: number } => {
    if (vals.length === 0 || prog <= 0) return { points: '', endX: toX(0), endY: toY(vals[0] ?? yMin) };
    const maxSeg = vals.length - 1;
    const exact = prog * maxSeg;
    const full = Math.floor(exact);
    const frac = exact - full;
    const pts: string[] = [];
    let endX = toX(0);
    let endY = toY(vals[0]);
    for (let i = 0; i <= Math.min(full, maxSeg); i++) {
      endX = toX(i);
      endY = toY(vals[i]);
      pts.push(`${endX.toFixed(1)},${endY.toFixed(1)}`);
    }
    if (full < maxSeg && frac > 0) {
      endX = toX(full) + (toX(full + 1) - toX(full)) * frac;
      endY = toY(vals[full]) + (toY(vals[full + 1]) - toY(vals[full])) * frac;
      pts.push(`${endX.toFixed(1)},${endY.toFixed(1)}`);
    }
    return { points: pts.join(' '), endX, endY };
  };

  const baseSeries = series.filter((s) => !s.isHighlight);
  const hlSeries = series.find((s) => s.isHighlight);
  const topBase = baseSeries[0];

  const gapPolygon =
    topBase && hlSeries && topBase.values.length === hlSeries.values.length
      ? [
          ...topBase.values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`),
          ...[...hlSeries.values]
            .reverse()
            .map((v, ri) => {
              const i = hlSeries.values.length - 1 - ri;
              return `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`;
            }),
        ].join(' ')
      : '';

  // 終端ラベル同士が重ならないよう最小間隔 36px を強制
  const candidateLabels: Omit<DeconflictedLabel, 'y'>[] = [];
  if (baseProg > 0.92) {
    for (const s of baseSeries) {
      const lastVal = s.values[s.values.length - 1];
      candidateLabels.push({
        id: s.id,
        badgeText: s.badgeText,
        color: s.color,
        isHighlight: false,
        rawY: toY(lastVal),
        fontSize: 21,
        fontWeight: 800,
      });
    }
  }
  if (hlSeries && hlProg > 0.9) {
    const lastVal = hlSeries.values[hlSeries.values.length - 1];
    candidateLabels.push({
      id: hlSeries.id,
      badgeText: hlSeries.badgeText,
      color: hlSeries.color,
      isHighlight: true,
      rawY: toY(lastVal),
      fontSize: 24,
      fontWeight: 900,
    });
  }
  const endLabels = deconflictEndLabels(candidateLabels, padT + 14, vbH - padB - 8, 36);

  const hlEndIdx = hlSeries ? hlSeries.values.length - 1 : 0;
  const hlLastX = toX(hlEndIdx);
  const hlLastY = hlSeries ? toY(hlSeries.values[hlEndIdx]) : 0;
  const rawGapMidY =
    topBase && hlSeries
      ? (toY(topBase.values[topBase.values.length - 1]) + hlLastY) / 2
      : (padT + vbH - padB) / 2;
  const clampedGapMidY = Math.max(padT + 30, Math.min(vbH - padB - 30, rawGapMidY));

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #E5E9F0 0%, #D2D9E3 64%, #A3B0C2 100%)',
      }}
    >
      {/* 物理オーク木枠ホワイトボード（左は指示棒アバター、下は字幕セーフ176pxを確保） */}
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 245,
          right: 96,
          bottom: SUBTITLE_SAFE_BOTTOM,
          borderRadius: 12,
          border: '18px solid #9A6332',
          backgroundColor: '#F8FAFC',
          boxShadow: '0 24px 54px rgba(15, 23, 42, 0.28), inset 0 2px 10px rgba(0,0,0,0.08)',
          transform: `scale(${interpolate(boardSpr, [0, 1], [0.96, 1])})`,
          padding: '24px 32px 18px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 38, color: '#0F172A' }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 18, color: '#475569', marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          {stampText && localFrame >= hlStart + 16 && (
            <div
              style={{
                border: '4px solid #CC0000',
                color: '#CC0000',
                backgroundColor: 'rgba(254, 226, 226, 0.88)',
                fontFamily: FONT_ECON_SANS,
                fontWeight: 900,
                fontSize: 25,
                padding: '6px 18px',
                borderRadius: 6,
                transform: `scale(${interpolate(stampSpr, [0, 1], [1.6, 1])}) rotate(-3deg)`,
                flexShrink: 0,
              }}
            >
              {stampText}
            </div>
          )}
        </div>

        <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', flex: 1, overflow: 'visible' }}>
          <defs>
            <pattern id="planE-gap-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <line x1="0" y1="0" x2="0" y2="12" stroke="#CC0000" strokeWidth="2.5" opacity="0.22" />
            </pattern>
          </defs>

          {yTicks.map((tick) => {
            const y = toY(tick);
            const isBase = baselineTick !== null && tick === baselineTick;
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={vbW - padR}
                  y2={y}
                  stroke={isBase ? '#64748B' : '#E2E8F0'}
                  strokeWidth={isBase ? 2 : 1.2}
                  strokeDasharray={isBase ? '6 4' : undefined}
                />
                <text
                  x={padL - 14}
                  y={y + 6}
                  textAnchor="end"
                  fontFamily={FONT_ECON_MONO}
                  fontSize={19}
                  fontWeight={isBase ? 800 : 600}
                  fill="#475569"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {xLabels.map((lbl, idx) => (
            <text
              key={`${lbl}-${idx}`}
              x={toX(idx)}
              y={vbH - 16}
              textAnchor="middle"
              fontFamily={FONT_ECON_MONO}
              fontSize={20}
              fontWeight={700}
              fill="#334155"
            >
              {lbl}
            </text>
          ))}

          {gapPolygon && (
            <polygon points={gapPolygon} fill="url(#planE-gap-hatch)" opacity={gapOpacity} />
          )}

          {baseSeries.map((s) => {
            const { points, endX, endY } = buildPolyline(s.values, baseProg);
            const shownPointsCount = Math.floor(baseProg * (s.values.length - 1)) + 1;
            return (
              <g key={s.id}>
                {points && (
                  <>
                    <polyline
                      points={points}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={s.strokeWidth ?? 4.5}
                      strokeDasharray={s.dashed}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {s.values.slice(0, shownPointsCount).map((val, ptIdx) => (
                      <circle
                        key={`${s.id}-pt-${ptIdx}`}
                        cx={toX(ptIdx)}
                        cy={toY(val)}
                        r={4.2}
                        fill="#F8FAFC"
                        stroke={s.color}
                        strokeWidth={2.5}
                      />
                    ))}
                    <circle cx={endX} cy={endY} r={5.5} fill={s.color} />
                  </>
                )}
              </g>
            );
          })}

          {hlSeries && hlProg > 0 && (() => {
            const { points, endX, endY } = buildPolyline(hlSeries.values, hlProg);
            const shownCount = Math.floor(hlProg * (hlSeries.values.length - 1)) + 1;
            return (
              <g>
                <polyline
                  points={points}
                  fill="none"
                  stroke={hlSeries.color}
                  strokeWidth={hlSeries.strokeWidth ?? 7.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {hlSeries.values.slice(0, shownCount).map((val, ptIdx) => (
                  <circle
                    key={`hl-pt-${ptIdx}`}
                    cx={toX(ptIdx)}
                    cy={toY(val)}
                    r={5.2}
                    fill="#F8FAFC"
                    stroke={hlSeries.color}
                    strokeWidth={3}
                  />
                ))}
                <circle cx={endX} cy={endY} r={7} fill={hlSeries.color} />
                {circleLastHighlight && hlProg > 0.92 && (
                  <g>
                    <circle
                      cx={hlLastX}
                      cy={hlLastY}
                      r={22 + Math.sin(localFrame * 0.18) * 2.5}
                      fill="none"
                      stroke="#CC0000"
                      strokeWidth={3.5}
                      strokeDasharray="8 4"
                    />
                  </g>
                )}
              </g>
            );
          })()}

          {/* 衝突回避済み終端ラベル */}
          {endLabels.map((lbl) => (
            <g key={`lbl-${lbl.id}`}>
              {Math.abs(lbl.y - lbl.rawY) > 6 && (
                <path
                  d={`M ${vbW - padR + 2} ${lbl.rawY.toFixed(1)} L ${vbW - padR + 14} ${lbl.y.toFixed(1)}`}
                  stroke={lbl.color}
                  strokeWidth={1.6}
                  opacity={0.55}
                />
              )}
              <text
                x={vbW - padR + 18}
                y={lbl.y + 7}
                fontFamily={FONT_ECON_SANS}
                fontSize={lbl.fontSize}
                fontWeight={lbl.fontWeight}
                fill={lbl.color}
              >
                {lbl.badgeText}
              </text>
            </g>
          ))}

          {gapBadgeText && topBase && hlSeries && gapOpacity > 0.05 && (
            <g opacity={gapOpacity}>
              <rect
                x={vbW - padR - 246}
                y={clampedGapMidY - 22}
                width={228}
                height={44}
                rx={6}
                fill="#FEF2F2"
                stroke="#CC0000"
                strokeWidth={2.5}
              />
              <text
                x={vbW - padR - 132}
                y={clampedGapMidY + 7}
                textAnchor="middle"
                fontFamily={FONT_ECON_MONO}
                fontSize={20}
                fontWeight={900}
                fill="#B91C1C"
              >
                {gapBadgeText}
              </text>
            </g>
          )}
        </svg>

        {/* アルミペントレイ＋ホワイトボードマーカー */}
        <div
          style={{
            position: 'absolute',
            left: '30%',
            right: '30%',
            bottom: -26,
            height: 16,
            borderRadius: 4,
            background: 'linear-gradient(180deg, #E2E8F0, #64748B)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.32)',
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            paddingLeft: 32,
          }}
        >
          <div style={{ width: 68, height: 8, borderRadius: 3, backgroundColor: '#1E293B', transform: 'translateY(-4px)' }} />
          <div style={{ width: 64, height: 8, borderRadius: 3, backgroundColor: '#CC0000', transform: 'translateY(-4px)' }} />
          <div style={{ width: 58, height: 8, borderRadius: 3, backgroundColor: '#0072B2', transform: 'translateY(-4px)' }} />
        </div>
      </div>

      {/* 左下 指示棒アバター */}
      <div style={{ position: 'absolute', left: 26, bottom: 148 }}>
        <EconHostAvatar emblem={avatarEmblem} pose="pointer_stick" scale={0.78} />
      </div>
    </AbsoluteFill>
  );
};
