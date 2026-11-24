import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { PLAN_E_MACRO_PALETTE } from '../../../theme/tokens';
import { FONT_ECON_MONO, FONT_ECON_SANS } from '../fonts';
import { PlanEBackdropMode, PlanEIncentiveEdge, PlanEIncentiveNode, isPlanELightBackdrop } from './typesV2';

export interface IncentiveLoopDiagramProps {
  startSec: number;
  title?: string;
  subtitle?: string;
  nodes: readonly PlanEIncentiveNode[];
  edges: readonly PlanEIncentiveEdge[];
  centerTag?: string;
  backdropMode?: PlanEBackdropMode;
  width?: number;
  height?: number;
}

const NODE_WIDTH = 228;
const NODE_HEIGHT = 96;

function resolveToneColor(
  tone: PlanEIncentiveNode['tone'] | PlanEIncentiveEdge['tone'],
  isLight: boolean,
): string {
  switch (tone) {
    case 'emerald':
      return isLight ? PLAN_E_MACRO_PALETTE.emerald : PLAN_E_MACRO_PALETTE.emeraldBright;
    case 'crimson':
      return PLAN_E_MACRO_PALETTE.crisisRed;
    case 'gold':
      return PLAN_E_MACRO_PALETTE.policyGold;
    case 'cyan':
      return isLight ? PLAN_E_MACRO_PALETTE.dataBlue : PLAN_E_MACRO_PALETTE.dataCyan;
    default:
      return isLight ? '#475569' : '#94A3B8';
  }
}

/**
 * 矩形中心 (x1, y1) から目標点 (x2, y2) へ向かう線分と、矩形境界との交点を返す。
 * これにより矢印・ラベルがノード箱の内側線と交差・衝突するのを防ぐ。
 */
function clipToBoxEdge(
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  halfW: number,
  halfH: number,
  pad: number,
): { x: number; y: number } {
  const dx = tx - cx;
  const dy = ty - cy;
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) {
    return { x: cx, y: cy };
  }
  const scaleX = Math.abs(dx) > 1e-3 ? (halfW + pad) / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 1e-3 ? (halfH + pad) / Math.abs(dy) : Infinity;
  const t = Math.min(scaleX, scaleY);
  return { x: cx + dx * t, y: cy + dy * t };
}

/**
 * @deprecated 旧ダーク方眼カード矢印型図解。AI Slop 排除方針により新規制作では `CausalGearLoopStage` を使用すること（過去ベンチマーク互換用）。
 *
 * 案E インセンティブ構造・因果フィードバックループ・意図せぬ副作用連鎖図解。
 * - 1000x600 論理座標系で配置したノード間を矩形境界クリップ＋ベジェ曲線＋矢印で結線。
 */
export const IncentiveLoopDiagram: React.FC<IncentiveLoopDiagramProps> = ({
  startSec,
  title,
  subtitle,
  nodes,
  edges,
  centerTag,
  backdropMode = 'slate_grid',
  width = 1620,
  height = 680,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const isLight = isPlanELightBackdrop(backdropMode);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const surfaceBg = isLight ? '#FFFFFF' : '#161B22';
  const primaryText = isLight ? PLAN_E_MACRO_PALETTE.inkDark : PLAN_E_MACRO_PALETTE.textLight;
  const mutedText = isLight ? '#475569' : '#94A3B8';
  const labelBg = isLight ? '#FAF8F3' : '#0E1014';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      {title ? (
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: primaryText }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 20, color: mutedText }}>{subtitle}</div> : null}
        </div>
      ) : null}

      <div style={{ position: 'relative', width, height }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1000 600"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {/* 中央コアリング／ループラベル */}
          {centerTag ? (
            <g>
              <circle
                cx={500}
                cy={300}
                r={76}
                fill={isLight ? 'rgba(30, 142, 62, 0.08)' : 'rgba(34, 197, 94, 0.08)'}
                stroke={resolveToneColor('emerald', isLight)}
                strokeWidth={2}
                strokeDasharray="6 6"
              />
              <text
                x={500}
                y={306}
                textAnchor="middle"
                fill={resolveToneColor('emerald', isLight)}
                fontFamily={FONT_ECON_MONO}
                fontSize={16}
                fontWeight={900}
              >
                {centerTag}
              </text>
            </g>
          ) : null}

          {/* エッジ（矢印＋曲線） */}
          {edges.map((edge, idx) => {
            const fromNode = nodeMap.get(edge.from);
            const toNode = nodeMap.get(edge.to);
            if (!fromNode || !toNode) return null;

            const revStart = startSec + (edge.revealOffsetSec ?? 0.12 + idx * 0.15);
            const prog = interpolate(sec, [revStart, revStart + 0.45], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            if (prog <= 0.01) return null;

            const p1 = clipToBoxEdge(
              fromNode.x,
              fromNode.y,
              toNode.x,
              toNode.y,
              NODE_WIDTH / 2,
              NODE_HEIGHT / 2,
              6,
            );
            const p2 = clipToBoxEdge(
              toNode.x,
              toNode.y,
              fromNode.x,
              fromNode.y,
              NODE_WIDTH / 2,
              NODE_HEIGHT / 2,
              10,
            );

            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.max(1, Math.hypot(dx, dy));
            // 外向き法線へわずかに膨らませて双方向エッジ重なりを防ぐ
            const nx = (-dy / len) * 26;
            const ny = (dx / len) * 26;
            const cx = mx + nx;
            const cy = my + ny;

            const color = resolveToneColor(edge.tone ?? 'emerald', isLight);
            const pathD = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;

            // 矢尻向き計算
            const adx = p2.x - cx;
            const ady = p2.y - cy;
            const alen = Math.max(1, Math.hypot(adx, ady));
            const ux = adx / alen;
            const uy = ady / alen;
            const arrowLen = 13;
            const arrowWid = 7;
            const ax1 = p2.x - ux * arrowLen + -uy * arrowWid;
            const ay1 = p2.y - uy * arrowLen + ux * arrowWid;
            const ax2 = p2.x - ux * arrowLen - -uy * arrowWid;
            const ay2 = p2.y - uy * arrowLen - ux * arrowWid;

            const labelX = 0.25 * p1.x + 0.5 * cx + 0.25 * p2.x;
            const labelY = 0.25 * p1.y + 0.5 * cy + 0.25 * p2.y;

            return (
              <g key={`edge-${idx}`} opacity={prog}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeWidth={3.2}
                  strokeDasharray={edge.dashed ? '9 6' : undefined}
                />
                <polygon
                  points={`${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${ax1.toFixed(1)},${ay1.toFixed(1)} ${ax2.toFixed(1)},${ay2.toFixed(1)}`}
                  fill={color}
                />
                {edge.label ? (
                  <g>
                    <rect
                      x={labelX - Math.max(46, edge.label.length * 8.5 + 14)}
                      y={labelY - 14}
                      width={Math.max(92, edge.label.length * 17 + 28)}
                      height={26}
                      rx={4}
                      fill={labelBg}
                      stroke={color}
                      strokeWidth={1.2}
                    />
                    <text
                      x={labelX}
                      y={labelY + 4}
                      textAnchor="middle"
                      fill={color}
                      fontFamily={FONT_ECON_SANS}
                      fontSize={14}
                      fontWeight={800}
                    >
                      {edge.label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {/* ノード箱 */}
          {nodes.map((node, idx) => {
            const revStart = startSec + (node.revealOffsetSec ?? idx * 0.12);
            const lf = Math.max(0, frame - Math.round(revStart * fps));
            const spr = spring({
              frame: lf,
              fps,
              config: { stiffness: 420, damping: 24, mass: 0.65 },
            });
            if (sec < revStart) return null;

            const color = resolveToneColor(node.tone ?? 'neutral', isLight);
            const s = interpolate(spr, [0, 1], [0.88, 1.0]);
            const x0 = node.x - NODE_WIDTH / 2;
            const y0 = node.y - NODE_HEIGHT / 2;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y}) scale(${s}) translate(${-node.x}, ${-node.y})`}
              >
                <rect
                  x={x0}
                  y={y0}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={6}
                  fill={surfaceBg}
                  stroke={color}
                  strokeWidth={2.8}
                />
                <rect x={x0} y={y0} width={8} height={NODE_HEIGHT} rx={2} fill={color} />
                <text
                  x={x0 + 20}
                  y={y0 + 34}
                  fill={primaryText}
                  fontFamily={FONT_ECON_SANS}
                  fontSize={19}
                  fontWeight={900}
                >
                  {node.title}
                </text>
                {node.subtitle ? (
                  <text
                    x={x0 + 20}
                    y={y0 + 58}
                    fill={mutedText}
                    fontFamily={FONT_ECON_SANS}
                    fontSize={14}
                    fontWeight={600}
                  >
                    {node.subtitle}
                  </text>
                ) : null}
                {node.metric ? (
                  <text
                    x={x0 + 20}
                    y={y0 + 82}
                    fill={color}
                    fontFamily={FONT_ECON_MONO}
                    fontSize={15}
                    fontWeight={800}
                  >
                    {node.metric}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
