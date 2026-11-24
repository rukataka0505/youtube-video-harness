import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  EconHostAvatar,
  FONT_ECON_MONO,
  FONT_ECON_SANS,
  FONT_ECON_SERIF,
} from '../../../../components/plan_e';

export interface WhiteboardOecdWageChartProps {
  startSec: number;
  endSec: number;
  japanRevealSec: number;
  avatarEmblem?: string;
}

const YEARS = ['1995', '2000', '2005', '2010', '2015', '2020', '2024'] as const;

interface WageSeries {
  id: string;
  label: string;
  badgeText: string;
  color: string;
  strokeWidth: number;
  dashed?: string;
  values: readonly number[];
}

const WESTERN_SERIES: readonly WageSeries[] = [
  {
    id: 'us',
    label: '米国 (US)',
    badgeText: '米国 +51%',
    color: '#0072B2',
    strokeWidth: 5.5,
    values: [100, 114, 121, 127, 134, 146, 151],
  },
  {
    id: 'uk',
    label: '英国 (UK)',
    badgeText: '英国 +38%',
    color: '#1E8E3E',
    strokeWidth: 4.5,
    values: [100, 113, 126, 129, 127, 134, 138],
  },
  {
    id: 'de',
    label: 'ドイツ (DE)',
    badgeText: 'ドイツ +29%',
    color: '#0284C7',
    strokeWidth: 3.5,
    dashed: '9 6',
    values: [100, 106, 108, 111, 119, 126, 129],
  },
];

const JAPAN_SERIES: WageSeries = {
  id: 'jp',
  label: '日本 (JP)',
  badgeText: '日本 +1% (横ばい)',
  color: '#CC0000',
  strokeWidth: 7.5,
  values: [100, 101, 100, 98, 97, 99, 101],
};

/**
 * 目玉①: 物理オーク木枠ホワイトボード上の OECD 30年実質賃金比較マルチラインチャート (1995=100)。
 * - 35.80s〜39.04s: 米国・英国・ドイツの実質賃金成長ラインを描画
 * - 39.04s〜42.36s: 日本の赤太線 (+1%) を描画し、米国との 50pt 乖離ハッチング＆強調スタンプを展開
 * - 画面内出典テキストなし（概要欄集約原則遵守）
 */
export const WhiteboardOecdWageChart: React.FC<WhiteboardOecdWageChartProps> = ({
  startSec,
  endSec,
  japanRevealSec,
  avatarEmblem = '¥?',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const localFrame = Math.max(0, frame - Math.round(startSec * fps));

  const boardSpr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 360, damping: 26, mass: 0.7 },
  });

  const westernProg = interpolate(
    sec,
    [startSec + 0.15, Math.max(startSec + 0.5, japanRevealSec - 0.18)],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const japanProg = interpolate(
    sec,
    [japanRevealSec, Math.min(endSec - 0.15, japanRevealSec + 1.85)],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const gapOpacity = interpolate(
    sec,
    [japanRevealSec + 0.85, japanRevealSec + 1.55],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const stampSpr = spring({
    frame: Math.max(0, frame - Math.round((japanRevealSec + 0.75) * fps)),
    fps,
    config: { stiffness: 460, damping: 20, mass: 0.6 },
  });

  // SVG 論理座標
  const vbW = 1260;
  const vbH = 510;
  const padL = 78;
  const padR = 248;
  const padT = 34;
  const padB = 56;
  const plotW = vbW - padL - padR;
  const plotH = vbH - padT - padB;

  const yMin = 90;
  const yMax = 160;
  const toX = (idx: number) => padL + (idx / (YEARS.length - 1)) * plotW;
  const toY = (val: number) => padT + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  const buildPath = (vals: readonly number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');

  // 米国と日本の間のハッチング領域ポリゴン
  const usCoords = WESTERN_SERIES[0].values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
  const jpCoordsRev = [...JAPAN_SERIES.values]
    .map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
    .reverse();
  const gapAreaPath = `M ${usCoords.join(' L ')} L ${jpCoordsRev.join(' L ')} Z`;

  const yTicks = [90, 100, 110, 120, 130, 140, 150, 160];

  const usEndPt = { x: toX(YEARS.length - 1), y: toY(WESTERN_SERIES[0].values[6]) };
  const ukEndPt = { x: toX(YEARS.length - 1), y: toY(WESTERN_SERIES[1].values[6]) };
  const deEndPt = { x: toX(YEARS.length - 1), y: toY(WESTERN_SERIES[2].values[6]) };
  const jpEndPt = { x: toX(YEARS.length - 1), y: toY(JAPAN_SERIES.values[6]) };

  return (
    <AbsoluteFill style={{ backgroundColor: '#DDE2E8', overflow: 'hidden' }}>
      {/* スタジオ壁背景 */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 90% 85% at 50% 44%, #EDF0F4 0%, #CFD6DF 72%, #B8C1CE 100%)',
        }}
      />

      {/* 物理オーク木枠ホワイトボード（bottom: 176px で下部字幕と非衝突） */}
      <div
        style={{
          position: 'absolute',
          left: 88,
          right: 88,
          top: 32,
          bottom: 176,
          padding: 18,
          borderRadius: 10,
          background: 'linear-gradient(145deg, #B47B44 0%, #8C5828 52%, #70421B 100%)',
          boxShadow: '0 26px 56px rgba(15, 23, 42, 0.34), inset 0 2px 3px rgba(255,255,255,0.28)',
          transform: `scale(${interpolate(boardSpr, [0, 1], [0.97, 1.0])})`,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            backgroundColor: '#F9FAFB',
            borderRadius: 4,
            boxShadow: 'inset 0 3px 12px rgba(15, 23, 42, 0.12)',
            overflow: 'hidden',
            padding: '22px 34px 20px 256px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 盤面上の控えめな反射グレア */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(125deg, rgba(255,255,255,0.55) 0%, transparent 38%, transparent 100%)',
              pointerEvents: 'none',
            }}
          />

          {/* ボードヘッダー行 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 4 }}>
            <div>
              <div
                style={{
                  fontFamily: FONT_ECON_SERIF,
                  fontSize: 33,
                  fontWeight: 900,
                  color: '#0F172A',
                  letterSpacing: '-0.01em',
                }}
              >
                主要先進国の実質賃金推移（30年間・1995年＝100）
              </div>
              <div
                style={{
                  fontFamily: FONT_ECON_SANS,
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#475569',
                  marginTop: 4,
                }}
              >
                購買力平価ベース指数推移 — 成長する欧米 vs 停滞する日本
              </div>
            </div>

            {sec >= japanRevealSec + 0.6 ? (
              <div
                style={{
                  border: '4px solid #CC0000',
                  backgroundColor: 'rgba(255, 255, 255, 0.94)',
                  color: '#CC0000',
                  fontFamily: FONT_ECON_SANS,
                  fontSize: 21,
                  fontWeight: 900,
                  padding: '6px 16px',
                  transform: `rotate(-3deg) scale(${interpolate(stampSpr, [0, 1], [1.45, 1.0])})`,
                  opacity: stampSpr,
                  boxShadow: '0 6px 16px rgba(204, 0, 0, 0.18)',
                  whiteSpace: 'nowrap',
                }}
              >
                実質賃金 ほぼ横ばい
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: '#0072B2',
                  color: '#FFFFFF',
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 17,
                  fontWeight: 800,
                  padding: '6px 14px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                INDEX: 1995 = 100
              </div>
            )}
          </div>

          {/* グラフ SVG 本体 */}
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${vbW} ${vbH}`}
            style={{ flex: 1, minHeight: 0, marginTop: 6, zIndex: 3 }}
            aria-hidden="true"
          >
            <defs>
              <clipPath id="wb-west-clip">
                <rect x={padL - 10} y={0} width={Math.max(4, plotW * westernProg + 22)} height={vbH} />
              </clipPath>
              <clipPath id="wb-jp-clip">
                <rect x={padL - 10} y={0} width={Math.max(4, plotW * japanProg + 22)} height={vbH} />
              </clipPath>
              <pattern id="wb-gap-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                <line x1="0" y1="0" x2="0" y2="12" stroke="rgba(204, 0, 0, 0.28)" strokeWidth="3.5" />
              </pattern>
            </defs>

            {/* Y軸グリッド＆目盛 */}
            {yTicks.map((v) => {
              const gy = toY(v);
              const isBase = v === 100;
              return (
                <g key={`wy-${v}`}>
                  <line
                    x1={padL}
                    y1={gy}
                    x2={padL + plotW}
                    y2={gy}
                    stroke={isBase ? '#64748B' : '#CBD5E1'}
                    strokeWidth={isBase ? 2.0 : 1.2}
                    strokeDasharray={isBase ? '8 5' : '4 4'}
                  />
                  <text
                    x={padL - 14}
                    y={gy + 6}
                    textAnchor="end"
                    fill={isBase ? '#0F172A' : '#475569'}
                    fontFamily={FONT_ECON_MONO}
                    fontSize={16}
                    fontWeight={isBase ? 900 : 700}
                  >
                    {v}
                  </text>
                </g>
              );
            })}

            {/* X軸ベース線＆年ラベル */}
            <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#334155" strokeWidth={2.5} />
            {YEARS.map((yr, idx) => (
              <g key={yr}>
                <line
                  x1={toX(idx)}
                  y1={padT + plotH}
                  x2={toX(idx)}
                  y2={padT + plotH + 7}
                  stroke="#334155"
                  strokeWidth={2}
                />
                <text
                  x={toX(idx)}
                  y={padT + plotH + 30}
                  textAnchor="middle"
                  fill="#0F172A"
                  fontFamily={FONT_ECON_MONO}
                  fontSize={17}
                  fontWeight={800}
                >
                  {yr}
                </text>
              </g>
            ))}

            {/* 米国と日本の50pt乖離ハッチング帯（背面） */}
            {gapOpacity > 0.01 ? (
              <g opacity={gapOpacity}>
                <path d={gapAreaPath} fill="url(#wb-gap-hatch)" />
              </g>
            ) : null}

            {/* 欧米3本ライン */}
            <g clipPath="url(#wb-west-clip)">
              {WESTERN_SERIES.map((s) => (
                <g key={s.id}>
                  <path
                    d={buildPath(s.values)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.strokeWidth}
                    strokeDasharray={s.dashed}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {s.values.map((v, i) => (
                    <circle
                      key={`${s.id}-p-${i}`}
                      cx={toX(i)}
                      cy={toY(v)}
                      r={i === 6 ? 6.5 : 4}
                      fill={i === 6 ? s.color : '#FFFFFF'}
                      stroke={s.color}
                      strokeWidth={2.5}
                    />
                  ))}
                </g>
              ))}
            </g>

            {/* 欧米 右端バッジ */}
            {westernProg > 0.85 ? (
              <g
                opacity={interpolate(westernProg, [0.85, 1.0], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })}
              >
                {[
                  { pt: usEndPt, dy: 0, text: WESTERN_SERIES[0].badgeText, color: WESTERN_SERIES[0].color },
                  { pt: ukEndPt, dy: -4, text: WESTERN_SERIES[1].badgeText, color: WESTERN_SERIES[1].color },
                  { pt: deEndPt, dy: 6, text: WESTERN_SERIES[2].badgeText, color: WESTERN_SERIES[2].color },
                ].map((b, i) => (
                  <g key={`wb-lbl-${i}`}>
                    <rect
                      x={b.pt.x + 14}
                      y={b.pt.y + b.dy - 17}
                      width={162}
                      height={34}
                      rx={5}
                      fill={b.color}
                    />
                    <text
                      x={b.pt.x + 95}
                      y={b.pt.y + b.dy + 6}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontFamily={FONT_ECON_SANS}
                      fontSize={17}
                      fontWeight={900}
                    >
                      {b.text}
                    </text>
                  </g>
                ))}
              </g>
            ) : null}

            {/* 日本 赤太線 */}
            {sec >= japanRevealSec ? (
              <g clipPath="url(#wb-jp-clip)">
                <path
                  d={buildPath(JAPAN_SERIES.values)}
                  fill="none"
                  stroke={JAPAN_SERIES.color}
                  strokeWidth={JAPAN_SERIES.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {JAPAN_SERIES.values.map((v, i) => (
                  <circle
                    key={`jp-p-${i}`}
                    cx={toX(i)}
                    cy={toY(v)}
                    r={i === 6 ? 8 : 5}
                    fill={i === 6 ? '#CC0000' : '#FFFFFF'}
                    stroke="#CC0000"
                    strokeWidth={3}
                  />
                ))}
              </g>
            ) : null}

            {/* 50pt乖離 垂直両矢印＆最前面バッジ（ドイツ線と日本線の空き領域へ配置） */}
            {gapOpacity > 0.01 ? (
              <g opacity={gapOpacity}>
                <line
                  x1={usEndPt.x - 24}
                  y1={usEndPt.y + 10}
                  x2={jpEndPt.x - 24}
                  y2={jpEndPt.y - 10}
                  stroke="#CC0000"
                  strokeWidth={3}
                  strokeDasharray="5 4"
                />
                <polygon
                  points={`${usEndPt.x - 24},${usEndPt.y + 6} ${usEndPt.x - 31},${usEndPt.y + 20} ${usEndPt.x - 17},${usEndPt.y + 20}`}
                  fill="#CC0000"
                />
                <polygon
                  points={`${jpEndPt.x - 24},${jpEndPt.y - 6} ${jpEndPt.x - 31},${jpEndPt.y - 20} ${jpEndPt.x - 17},${jpEndPt.y - 20}`}
                  fill="#CC0000"
                />
                <rect
                  x={usEndPt.x - 244}
                  y={toY(112) - 22}
                  width={204}
                  height={44}
                  rx={6}
                  fill="#FFFFFF"
                  stroke="#CC0000"
                  strokeWidth={3}
                />
                <text
                  x={usEndPt.x - 142}
                  y={toY(112) + 7}
                  textAnchor="middle"
                  fill="#CC0000"
                  fontFamily={FONT_ECON_MONO}
                  fontSize={18}
                  fontWeight={900}
                >
                  30年格差 -50pt
                </text>
              </g>
            ) : null}

            {/* 日本 右端強調バッジ */}
            {japanProg > 0.85 ? (
              <g
                opacity={interpolate(japanProg, [0.85, 1.0], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })}
              >
                <rect
                  x={jpEndPt.x + 14}
                  y={jpEndPt.y - 21}
                  width={216}
                  height={42}
                  rx={6}
                  fill="#CC0000"
                  stroke="#7F1D1D"
                  strokeWidth={2}
                />
                <text
                  x={jpEndPt.x + 122}
                  y={jpEndPt.y + 7}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontFamily={FONT_ECON_SANS}
                  fontSize={18}
                  fontWeight={900}
                >
                  {JAPAN_SERIES.badgeText}
                </text>
              </g>
            ) : null}
          </svg>

          {/* 凡例バー（アバターの指示棒と絶対に重ならないよう右側へ寄せる） */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingLeft: 170,
              gap: 30,
              paddingTop: 6,
              borderTop: '1px solid #E2E8F0',
              fontFamily: FONT_ECON_SANS,
              fontSize: 17,
              fontWeight: 800,
              color: '#1E293B',
              zIndex: 4,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 22, height: 5, backgroundColor: '#0072B2', display: 'inline-block' }} />
              米国 (US)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 22, height: 5, backgroundColor: '#1E8E3E', display: 'inline-block' }} />
              英国 (UK)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 22, height: 4, borderTop: '4px dashed #0284C7', display: 'inline-block' }} />
              ドイツ (DE)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#CC0000' }}>
              <span style={{ width: 24, height: 7, backgroundColor: '#CC0000', display: 'inline-block' }} />
              日本 (JP)
            </span>
          </div>
        </div>

        {/* ホワイトボード下部アルミペントレイ */}
        <div
          style={{
            position: 'absolute',
            left: '14%',
            right: '14%',
            bottom: -14,
            height: 22,
            background: 'linear-gradient(180deg, #E2E8F0 0%, #94A3B8 100%)',
            borderRadius: '0 0 6px 6px',
            boxShadow: '0 6px 12px rgba(0,0,0,0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 22,
          }}
        >
          <div style={{ width: 64, height: 10, borderRadius: 4, backgroundColor: '#1E293B' }} />
          <div style={{ width: 64, height: 10, borderRadius: 4, backgroundColor: '#DC2626' }} />
          <div style={{ width: 64, height: 10, borderRadius: 4, backgroundColor: '#0072B2' }} />
          <div style={{ width: 92, height: 14, borderRadius: 3, backgroundColor: '#334155', marginLeft: 32 }} />
        </div>
      </div>

      {/* 前景：指示棒を持つ進行役アバター */}
      <div
        style={{
          position: 'absolute',
          left: 84,
          bottom: 44,
          zIndex: 18,
        }}
      >
        <EconHostAvatar pose="pointer_stick" emblem={avatarEmblem} scale={1.04} />
      </div>
    </AbsoluteFill>
  );
};
