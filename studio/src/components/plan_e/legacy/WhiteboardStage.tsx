import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { EconHostAvatar } from '../EconHostAvatar';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from '../fonts';
import { WORLD_COUNTRIES, WORLD_MAP_VIEWBOX } from '../worldMapPaths';

export type WhiteboardMode = 'stacked_chart' | 'logo_pop' | 'world_map_pins';

export interface WhiteboardStackedBarColumn {
  year: string;
  usd: number;
  eur: number;
  other: number;
}

export interface WhiteboardBadgeItem {
  id: string;
  label: string;
  subLabel?: string;
  accentColor: string;
  textColor?: string;
  xPct: number;
  yPct: number;
  revealOffsetSec?: number;
}

export interface WhiteboardStageProps {
  startSec: number;
  endSec: number;
  mode: WhiteboardMode;
  boardTitle?: string;
  boardSubtitle?: string;
  sourceNote?: string;
  stackedColumns?: readonly WhiteboardStackedBarColumn[];
  badges?: readonly WhiteboardBadgeItem[];
  avatarEmblem?: string;
}

const DEFAULT_RESERVE_COLUMNS: readonly WhiteboardStackedBarColumn[] = [
  { year: '2000', usd: 71, eur: 18, other: 11 },
  { year: '2004', usd: 66, eur: 25, other: 9 },
  { year: '2008', usd: 64, eur: 26, other: 10 },
  { year: '2012', usd: 61, eur: 24, other: 15 },
  { year: '2016', usd: 65, eur: 19, other: 16 },
  { year: '2020', usd: 59, eur: 21, other: 20 },
  { year: '2024', usd: 58, eur: 20, other: 22 },
];

const DEFAULT_CORP_BADGES: readonly WhiteboardBadgeItem[] = [
  { id: 'jpm', label: 'J.P.Morgan', subLabel: 'BANKING', accentColor: '#1E293B', xPct: 22, yPct: 30, revealOffsetSec: 0.2 },
  { id: 'nvda', label: 'NVIDIA', subLabel: 'COMPUTE', accentColor: '#76B900', xPct: 58, yPct: 27, revealOffsetSec: 0.65 },
  { id: 'dis', label: 'Disney', subLabel: 'MEDIA', accentColor: '#1D4ED8', xPct: 34, yPct: 72, revealOffsetSec: 1.1 },
  { id: 'ba', label: 'BOEING', subLabel: 'AEROSPACE', accentColor: '#0369A1', xPct: 72, yPct: 69, revealOffsetSec: 1.55 },
];

const DEFAULT_GLOBAL_BADGES: readonly WhiteboardBadgeItem[] = [
  { id: 'aapl', label: 'Apple', subLabel: 'GLOBAL TECH', accentColor: '#111827', xPct: 31, yPct: 35, revealOffsetSec: 0.2 },
  { id: 'mcd', label: "McDonald's", subLabel: 'RETAIL', accentColor: '#DC2626', xPct: 52, yPct: 27, revealOffsetSec: 0.55 },
  { id: 'ko', label: 'Coca-Cola', subLabel: 'CONSUMER', accentColor: '#B91C1C', xPct: 38, yPct: 67, revealOffsetSec: 0.9 },
  { id: 'visa', label: 'VISA', subLabel: 'PAYMENTS', accentColor: '#1E40AF', xPct: 76, yPct: 37, revealOffsetSec: 1.25 },
];

/**
 * 案E 物理オーク木枠ホワイトボード＋進行役アバターステージ。
 * パワポ風右箇条書きを排除し、ボード盤面いっぱいにIMF図表・企業円形ロゴ・実世界地図を展開する。
 */
export const WhiteboardStage: React.FC<WhiteboardStageProps> = ({
  startSec,
  endSec,
  mode,
  boardTitle,
  boardSubtitle,
  sourceNote,
  stackedColumns = DEFAULT_RESERVE_COLUMNS,
  badges,
  avatarEmblem = '$?',
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
  const chartProg = interpolate(sec, [startSec + 0.12, Math.min(endSec - 0.15, startSec + 1.1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const activeBadges =
    badges ?? (mode === 'world_map_pins' ? DEFAULT_GLOBAL_BADGES : DEFAULT_CORP_BADGES);

  const avatarOnRight = mode === 'logo_pop';

  return (
    <AbsoluteFill style={{ backgroundColor: '#DDE2E8', overflow: 'hidden' }}>
      {/* スタジオ壁面の柔らかい光グラデーション */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 90% 85% at 50% 44%, #EDF0F4 0%, #CFD6DF 72%, #B8C1CE 100%)',
        }}
      />

      {/* 物理オーク木枠ホワイトボード本体 */}
      <div
        style={{
          position: 'absolute',
          left: 86,
          right: 86,
          top: 28,
          bottom: 180,
          padding: 18,
          borderRadius: 10,
          background: 'linear-gradient(145deg, #B47B44 0%, #8C5828 52%, #70421B 100%)',
          boxShadow: '0 26px 56px rgba(15, 23, 42, 0.34), inset 0 2px 3px rgba(255,255,255,0.28)',
          transform: `scale(${interpolate(boardSpr, [0, 1], [0.97, 1.0])})`,
        }}
      >
        {/* ホワイトボード盤面 */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            backgroundColor: '#F9FAFB',
            borderRadius: 4,
            boxShadow: 'inset 0 3px 12px rgba(15, 23, 42, 0.12)',
            overflow: 'hidden',
            padding: '24px 36px 26px 36px',
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
                'linear-gradient(125deg, rgba(255,255,255,0.52) 0%, transparent 38%, transparent 100%)',
              pointerEvents: 'none',
            }}
          />

          {/* モード1: IMF 外貨準備高積み上げ棒グラフ（Shot 10） */}
          {mode === 'stacked_chart' ? (
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', paddingLeft: 250 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div
                    style={{
                      fontFamily: FONT_ECON_SERIF,
                      fontSize: 33,
                      fontWeight: 900,
                      color: '#0F172A',
                    }}
                  >
                    {boardTitle ?? 'Figure 2. Foreign exchange reserves'}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_ECON_SANS,
                      fontSize: 19,
                      fontWeight: 700,
                      color: '#475569',
                      marginTop: 4,
                    }}
                  >
                    {boardSubtitle ?? '通貨別シェア推移（%）— 圧倒的シェアを占める青色「U.S. dollar」'}
                  </div>
                </div>
                <div
                  style={{
                    backgroundColor: '#0072B2',
                    color: '#FFFFFF',
                    fontFamily: FONT_ECON_SANS,
                    fontSize: 20,
                    fontWeight: 900,
                    padding: '6px 16px',
                    borderRadius: 6,
                  }}
                >
                  U.S. dollar ≈ 58%
                </div>
              </div>

              <svg width="100%" height="100%" viewBox="0 0 1120 460" style={{ marginTop: 6, flex: 1, minHeight: 0 }} aria-hidden="true">
                {[0, 25, 50, 75, 100].map((v) => {
                  const gy = 395 - (v / 100) * 340;
                  return (
                    <g key={`wy-${v}`}>
                      <line x1={70} y1={gy} x2={1060} y2={gy} stroke="#CBD5E1" strokeWidth={1.3} strokeDasharray="4 4" />
                      <text x={55} y={gy + 5} textAnchor="end" fill="#475569" fontFamily={FONT_ECON_MONO} fontSize={15} fontWeight={700}>
                        {v}%
                      </text>
                    </g>
                  );
                })}
                <line x1={70} y1={395} x2={1060} y2={395} stroke="#334155" strokeWidth={2.5} />

                {stackedColumns.map((col, idx) => {
                  const slotW = 940 / Math.max(1, stackedColumns.length);
                  const barW = Math.min(82, slotW * 0.6);
                  const bx = 95 + idx * slotW + (slotW - barW) / 2;
                  const anim = interpolate(chartProg, [idx * 0.06, Math.min(1, idx * 0.06 + 0.55)], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  const hUsd = (col.usd / 100) * 340 * anim;
                  const hEur = (col.eur / 100) * 340 * anim;
                  const hOther = (col.other / 100) * 340 * anim;

                  const yUsd = 395 - hUsd;
                  const yEur = yUsd - hEur;
                  const yOther = yEur - hOther;

                  return (
                    <g key={col.year}>
                      <rect x={bx} y={yUsd} width={barW} height={hUsd} fill="#0072B2" />
                      <rect x={bx} y={yEur} width={barW} height={hEur} fill="#1E8E3E" />
                      <rect x={bx} y={yOther} width={barW} height={hOther} fill="#94A3B8" />
                      {anim > 0.65 ? (
                        <text
                          x={bx + barW / 2}
                          y={yUsd + hUsd / 2 + 6}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontFamily={FONT_ECON_MONO}
                          fontSize={16}
                          fontWeight={900}
                        >
                          {col.usd}%
                        </text>
                      ) : null}
                      <text
                        x={bx + barW / 2}
                        y={424}
                        textAnchor="middle"
                        fill="#0F172A"
                        fontFamily={FONT_ECON_MONO}
                        fontSize={18}
                        fontWeight={800}
                      >
                        {col.year}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <div style={{ display: 'flex', gap: 26, fontFamily: FONT_ECON_SANS, fontSize: 18, fontWeight: 800, color: '#1E293B' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 16, height: 16, backgroundColor: '#0072B2', display: 'inline-block' }} />
                    U.S. dollar (米ドル)
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 16, height: 16, backgroundColor: '#1E8E3E', display: 'inline-block' }} />
                    Euro (ユーロ)
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 16, height: 16, backgroundColor: '#94A3B8', display: 'inline-block' }} />
                    JPY / GBP / 他
                  </span>
                </div>
                {sourceNote ? (
                  <span style={{ fontFamily: FONT_ECON_MONO, fontSize: 14, color: '#64748B' }}>{sourceNote}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* モード2: 米国主要産業ロゴ連続ポップイン（Shot 11） */}
          {mode === 'logo_pop' ? (
            <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingRight: 260 }}>
              <div style={{ fontFamily: FONT_ECON_SERIF, fontSize: 34, fontWeight: 900, color: '#0F172A' }}>
                {boardTitle ?? '多様な基幹産業のポートフォリオ'}
              </div>
              {boardSubtitle ? (
                <div style={{ fontSize: 19, fontWeight: 700, color: '#475569', marginTop: 4 }}>
                  {boardSubtitle}
                </div>
              ) : null}
              <div style={{ position: 'relative', flex: 1, minHeight: 0, marginTop: 6 }}>
                {activeBadges.map((b, idx) => {
                  const revAt = startSec + (b.revealOffsetSec ?? idx * 0.42);
                  if (sec < revAt) return null;
                  const lf = Math.max(0, frame - Math.round(revAt * fps));
                  const pop = spring({ frame: lf, fps, config: { stiffness: 480, damping: 18, mass: 0.6 } });
                  return (
                    <div
                      key={b.id}
                      style={{
                        position: 'absolute',
                        left: `${b.xPct}%`,
                        top: `${b.yPct}%`,
                        transform: `translate(-50%, -50%) scale(${pop})`,
                        width: 192,
                        height: 192,
                        borderRadius: '50%',
                        backgroundColor: '#FFFFFF',
                        border: `7px solid ${b.accentColor}`,
                        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.20)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 12,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: idx % 2 === 0 ? FONT_ECON_SERIF : FONT_ECON_SANS,
                          fontSize: b.label.length > 8 ? 24 : 30,
                          fontWeight: 900,
                          color: b.textColor ?? b.accentColor,
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {b.label}
                      </span>
                      {b.subLabel ? (
                        <span
                          style={{
                            marginTop: 6,
                            fontFamily: FONT_ECON_MONO,
                            fontSize: 13,
                            fontWeight: 800,
                            letterSpacing: '0.12em',
                            color: '#64748B',
                          }}
                        >
                          {b.subLabel}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* モード3: ホワイトボード緑の世界地図＋多国籍企業ピン配置（Shot 12） */}
          {mode === 'world_map_pins' ? (
            <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingLeft: 210 }}>
              <div style={{ fontFamily: FONT_ECON_SERIF, fontSize: 32, fontWeight: 900, color: '#0F172A' }}>
                {boardTitle ?? '世界中の経済へ浸透する多国籍ネットワーク'}
              </div>
              <div style={{ position: 'relative', flex: 1, minHeight: 0, marginTop: 8 }}>
                <svg width="100%" height="100%" viewBox={WORLD_MAP_VIEWBOX} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  {WORLD_COUNTRIES.map((c) => (
                    <path
                      key={`wb-${c.id}`}
                      d={c.d}
                      fill={c.id === 'us' ? '#1E8E3E' : '#4CAF50'}
                      stroke="#F8FAFC"
                      strokeWidth={0.85}
                    />
                  ))}
                </svg>

                {activeBadges.map((b, idx) => {
                  const revAt = startSec + (b.revealOffsetSec ?? idx * 0.35);
                  if (sec < revAt) return null;
                  const lf = Math.max(0, frame - Math.round(revAt * fps));
                  const pop = spring({ frame: lf, fps, config: { stiffness: 480, damping: 18, mass: 0.6 } });
                  return (
                    <div
                      key={b.id}
                      style={{
                        position: 'absolute',
                        left: `${b.xPct}%`,
                        top: `${b.yPct}%`,
                        transform: `translate(-50%, -50%) scale(${pop})`,
                        width: 174,
                        height: 174,
                        borderRadius: '50%',
                        backgroundColor: '#FFFFFF',
                        border: `6px solid ${b.accentColor}`,
                        boxShadow: '0 14px 32px rgba(15, 23, 42, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: FONT_ECON_SANS,
                          fontSize: b.label.length > 8 ? 22 : 27,
                          fontWeight: 900,
                          color: b.accentColor,
                        }}
                      >
                        {b.label}
                      </span>
                      {b.subLabel ? (
                        <span style={{ fontFamily: FONT_ECON_MONO, fontSize: 11, fontWeight: 800, color: '#64748B', marginTop: 4 }}>
                          {b.subLabel}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* ホワイトボード下部アルミペントレイ＋マーカー3本＆イレーザー */}
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

      {/* 前景：進行役アバター */}
      <div
        style={{
          position: 'absolute',
          left: avatarOnRight ? undefined : 92,
          right: avatarOnRight ? 92 : undefined,
          bottom: 36,
          zIndex: 18,
        }}
      >
        <EconHostAvatar
          pose={mode === 'stacked_chart' ? 'pointer_stick' : mode === 'world_map_pins' ? 'point_up' : 'open_hands'}
          flipX={avatarOnRight}
          emblem={avatarEmblem}
          scale={1.06}
        />
      </div>
    </AbsoluteFill>
  );
};
