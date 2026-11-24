import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from '../fonts';

export interface ProjectorClusterNode {
  id: string;
  label: string;
  group: string;
  color: string;
  x: number; // 0..1400 論理座標
  y: number; // 0..760 論理座標
  r: number;
  revealOffsetSec?: number;
}

export interface ProjectorNetworkStageProps {
  startSec: number;
  centerLabel?: string;
  clusters?: readonly ProjectorClusterNode[];
}

const DEFAULT_CLUSTERS: readonly ProjectorClusterNode[] = [
  { id: 'uk', label: 'U.K.', group: 'NATO / FIVE EYES', color: '#2563EB', x: 470, y: 185, r: 44, revealOffsetSec: 0.15 },
  { id: 'de', label: 'GERMANY', group: 'EU / NATO', color: '#2563EB', x: 270, y: 235, r: 46, revealOffsetSec: 0.25 },
  { id: 'fr', label: 'FRANCE', group: 'EU / NATO', color: '#2563EB', x: 350, y: 120, r: 40, revealOffsetSec: 0.35 },
  { id: 'ca', label: 'CANADA', group: 'USMCA', color: '#D97706', x: 215, y: 405, r: 48, revealOffsetSec: 0.45 },
  { id: 'mx', label: 'MEXICO', group: 'USMCA', color: '#D97706', x: 300, y: 555, r: 45, revealOffsetSec: 0.55 },
  { id: 'br', label: 'BRAZIL', group: 'AMERICAS', color: '#D97706', x: 465, y: 635, r: 40, revealOffsetSec: 0.65 },
  { id: 'jp', label: 'JAPAN', group: 'INDO-PACIFIC', color: '#16A34A', x: 965, y: 195, r: 48, revealOffsetSec: 0.75 },
  { id: 'kr', label: 'S. KOREA', group: 'INDO-PACIFIC', color: '#16A34A', x: 1125, y: 275, r: 42, revealOffsetSec: 0.85 },
  { id: 'au', label: 'AUSTRALIA', group: 'AUKUS', color: '#16A34A', x: 1095, y: 440, r: 44, revealOffsetSec: 0.95 },
  { id: 'tw', label: 'TAIWAN', group: 'SEMICONDUCTORS', color: '#0284C7', x: 1190, y: 155, r: 38, revealOffsetSec: 1.05 },
  { id: 'in', label: 'INDIA', group: 'QUAD', color: '#16A34A', x: 950, y: 585, r: 44, revealOffsetSec: 1.15 },
  { id: 'sa', label: 'SAUDI ARABIA', group: 'PETRODOLLAR', color: '#EA580C', x: 755, y: 625, r: 46, revealOffsetSec: 1.25 },
  { id: 'ae', label: 'U.A.E.', group: 'TRADE HUB', color: '#EA580C', x: 895, y: 460, r: 38, revealOffsetSec: 1.35 },
  { id: 'ch', label: 'SWISS', group: 'FINANCE', color: '#0284C7', x: 560, y: 120, r: 40, revealOffsetSec: 1.45 },
  { id: 'sg', label: 'SINGAPORE', group: 'FINANCE', color: '#0284C7', x: 1215, y: 535, r: 46, revealOffsetSec: 1.55 },
  { id: 'nl', label: 'NETHERLANDS', group: 'TECH / EU', color: '#2563EB', x: 185, y: 295, r: 47, revealOffsetSec: 1.65 },
];

/**
 * 案E Shot 15 暗室プロジェクター投影ネットワーク図ステージ。
 * 物理ロールスクリーンに、米国旗メダルを中心に色別バブルが連結された地政学・経済網を投影する。
 */
export const ProjectorNetworkStage: React.FC<ProjectorNetworkStageProps> = ({
  startSec,
  centerLabel = 'United States',
  clusters = DEFAULT_CLUSTERS,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const localFrame = Math.max(0, frame - Math.round(startSec * fps));

  const screenSpr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 360, damping: 26, mass: 0.7 },
  });

  const cx = 700;
  const cy = 370;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0A0C10', overflow: 'hidden' }}>
      {/* 暗室空間＆下部プロジェクター投射コーン */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="proj-glow" cx="50%" cy="44%" r="58%">
            <stop offset="0%" stopColor="rgba(230, 108, 55, 0.14)" />
            <stop offset="60%" stopColor="rgba(14, 16, 20, 0.5)" />
            <stop offset="100%" stopColor="rgba(6, 8, 12, 0.98)" />
          </radialGradient>
          <linearGradient id="proj-cone" x1="0.5" y1="1" x2="0.5" y2="0">
            <stop offset="0%" stopColor="rgba(241, 245, 249, 0.22)" />
            <stop offset="100%" stopColor="rgba(241, 245, 249, 0.01)" />
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#proj-glow)" />
        <polygon points="895,1050 1025,1050 1740,860 180,860" fill="url(#proj-cone)" />
      </svg>

      {/* 物理プロジェクターロールスクリーン */}
      <div
        style={{
          position: 'absolute',
          left: 140,
          right: 140,
          top: 38,
          bottom: 168,
          backgroundColor: '#F3F4F6',
          borderRadius: 6,
          boxShadow: '0 28px 80px rgba(0, 0, 0, 0.85), 0 0 90px rgba(255,255,255,0.12)',
          overflow: 'hidden',
          zIndex: 6,
          transform: `scale(${interpolate(screenSpr, [0, 1], [0.97, 1.0])})`,
        }}
      >
        {/* スクリーン上部アルミロールバー */}
        <div
          style={{
            height: 22,
            background: 'linear-gradient(180deg, #334155 0%, #1E293B 100%)',
            borderBottom: '2px solid #0F172A',
          }}
        />

        <svg width="100%" height="calc(100% - 22px)" viewBox="0 0 1400 740" aria-hidden="true">
          <defs>
            <radialGradient id="screen-vignette" cx="50%" cy="50%" r="72%">
              <stop offset="55%" stopColor="rgba(255,255,255,0)" />
              <stop offset="100%" stopColor="rgba(15, 23, 42, 0.14)" />
            </radialGradient>
            <clipPath id="us-flag-circle">
              <circle cx={cx} cy={cy} r={82} />
            </clipPath>
          </defs>

          <rect width="1400" height="740" fill="url(#screen-vignette)" />

          {/* スクリーン上部サブキャプション */}
          <text
            x={700}
            y={46}
            textAnchor="middle"
            fill="#475569"
            fontFamily={FONT_ECON_MONO}
            fontSize={16}
            fontWeight={800}
            letterSpacing="0.16em"
          >
            GEOPOLITICAL & FINANCIAL ENTANGLEMENT NETWORK
          </text>

          {/* クラスター同士の二次結合線 */}
          {[
            [0, 1],
            [1, 2],
            [3, 4],
            [6, 7],
            [7, 9],
            [6, 8],
            [10, 11],
            [0, 13],
          ].map(([a, b], idx) => {
            const na = clusters[a];
            const nb = clusters[b];
            if (!na || !nb) return null;
            const alpha = interpolate(sec, [startSec + 1.0 + idx * 0.12, startSec + 1.5 + idx * 0.12], [0, 0.35], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <line
                key={`sec-edge-${idx}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                stroke="#64748B"
                strokeWidth={2}
                strokeDasharray="6 6"
                opacity={alpha}
              />
            );
          })}

          {/* 米国中心からのメイン放射エッジ */}
          {clusters.map((node, idx) => {
            const rev = startSec + (node.revealOffsetSec ?? idx * 0.08);
            const prog = interpolate(sec, [rev, rev + 0.45], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const ex = cx + (node.x - cx) * prog;
            const ey = cy + (node.y - cy) * prog;
            return (
              <line
                key={`edge-${node.id}`}
                x1={cx}
                y1={cy}
                x2={ex}
                y2={ey}
                stroke={node.color}
                strokeWidth={3.5}
                opacity={0.75}
              />
            );
          })}

          {/* 各国カラーバブル */}
          {clusters.map((node, idx) => {
            const rev = startSec + (node.revealOffsetSec ?? idx * 0.08);
            if (sec < rev) return null;
            const lf = Math.max(0, frame - Math.round(rev * fps));
            const spr = spring({ frame: lf, fps, config: { stiffness: 460, damping: 20, mass: 0.6 } });
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y}) scale(${spr}) translate(${-node.x}, ${-node.y})`}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={node.color}
                  stroke="#FFFFFF"
                  strokeWidth={4}
                />
                {node.label.includes(' ') && node.label.length > 9 ? (
                  <text
                    x={node.x}
                    y={node.y - 3}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily={FONT_ECON_SANS}
                    fontSize={10.5}
                    fontWeight={900}
                  >
                    {node.label.split(' ').map((word, wi) => (
                      <tspan key={wi} x={node.x} dy={wi === 0 ? 0 : 12}>
                        {word}
                      </tspan>
                    ))}
                  </text>
                ) : (
                  <text
                    x={node.x}
                    y={node.y + 4}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily={FONT_ECON_SANS}
                    fontSize={node.label.length >= 10 ? 10.2 : node.label.length >= 8 ? 11.2 : 13}
                    fontWeight={900}
                  >
                    {node.label}
                  </text>
                )}
                <text
                  x={node.x}
                  y={node.y + node.r + 17}
                  textAnchor="middle"
                  fill="#334155"
                  fontFamily={FONT_ECON_MONO}
                  fontSize={11}
                  fontWeight={800}
                >
                  {node.group}
                </text>
              </g>
            );
          })}

          {/* 中央：星条旗メダル（United States） */}
          <g>
            <circle cx={cx} cy={cy} r={92} fill="#FFFFFF" stroke="#0F172A" strokeWidth={5} />
            <g clipPath="url(#us-flag-circle)">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => (
                <rect
                  key={`st-${s}`}
                  x={cx - 86}
                  y={cy - 84 + s * 13}
                  width={172}
                  height={13}
                  fill={s % 2 === 0 ? '#B91C1C' : '#FFFFFF'}
                />
              ))}
              <rect x={cx - 86} y={cy - 84} width={88} height={91} fill="#1E3A8A" />
              {[0, 1, 2, 3].map((row) =>
                [0, 1, 2, 3].map((col) => (
                  <circle
                    key={`star-${row}-${col}`}
                    cx={cx - 72 + col * 19 + (row % 2) * 7}
                    cy={cy - 70 + row * 20}
                    r={3}
                    fill="#FFFFFF"
                  />
                )),
              )}
            </g>
            <rect x={cx - 108} y={cy + 62} width={216} height={36} rx={6} fill="#0F172A" />
            <text
              x={cx}
              y={cy + 86}
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily={FONT_ECON_SERIF}
              fontSize={21}
              fontWeight={900}
            >
              {centerLabel}
            </text>
          </g>
        </svg>
      </div>

      {/* 手前下部のプロジェクターシルエット */}
      <svg
        width="200"
        height="58"
        viewBox="0 0 200 58"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          transform: 'translateX(-50%)',
          zIndex: 14,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <rect x={28} y={18} width={144} height={40} rx={6} fill="#161B22" stroke="#334155" strokeWidth={2} />
        <circle cx={100} cy={34} r={14} fill="#0B0F14" stroke="#64748B" strokeWidth={2} />
        <circle cx={100} cy={34} r={7} fill="#F8FAFC" opacity={0.85} />
      </svg>
    </AbsoluteFill>
  );
};
