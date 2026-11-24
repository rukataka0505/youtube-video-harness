import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { WORLD_COUNTRIES, WORLD_MAP_VIEWBOX } from '../worldMapPaths';

export interface WorldConnectionMapProps {
  startSec: number;
  endSec: number;
  originIso?: string;
  targetIsos?: readonly string[];
}

const DEFAULT_TARGET_ISOS: readonly string[] = [
  'ca',
  'mx',
  'gb',
  'fr',
  'de',
  'it',
  'es',
  'nl',
  'se',
  'pl',
  'ch',
  'jp',
  'kr',
  'tw',
  'cn',
  'in',
  'au',
  'nz',
  'br',
  'ar',
  'cl',
  'sa',
  'ae',
  'il',
  'za',
  'sg',
  'id',
  'tr',
];

/**
 * 案E Shot 19 オープンループ締め：実世界地図ズームアウト＋米国東海岸からの無数黒弧線＆対象国緑点灯演出。
 */
export const WorldConnectionMap: React.FC<WorldConnectionMapProps> = ({
  startSec,
  endSec,
  originIso = 'us',
  targetIsos = DEFAULT_TARGET_ISOS,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const localSec = Math.max(0, sec - startSec);
  const dur = Math.max(0.5, endSec - startSec);

  const countryById = React.useMemo(() => {
    const map = new Map<string, (typeof WORLD_COUNTRIES)[number]>();
    for (const c of WORLD_COUNTRIES) {
      map.set(c.id, c);
    }
    return map;
  }, []);

  const origin = countryById.get(originIso) ?? { id: 'us', d: '', cx: 232.6, cy: 133.9 };
  // 米国東海岸付近の発信座標
  const startX = origin.cx + 38;
  const startY = origin.cy + 2;

  // 初期は米国中心に2.8xズーム、0.5s〜3.5sで1.0x世界全体へ滑らかにズームアウト
  const zoomRaw = interpolate(localSec, [0.35, Math.min(3.5, dur * 0.78)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const easeOut = 1 - Math.pow(1 - zoomRaw, 3);
  const scale = interpolate(easeOut, [0, 1], [2.75, 1.0]);
  const panX = interpolate(easeOut, [0, 1], [390, 0]);
  const panY = interpolate(easeOut, [0, 1], [150, 0]);

  const targetProgressMap = new Map<string, number>();
  targetIsos.forEach((iso, idx) => {
    const arcStart = 0.28 + idx * 0.085;
    const arcEnd = arcStart + 0.65;
    const prog = interpolate(localSec, [arcStart, arcEnd], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    targetProgressMap.set(iso, prog);
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#F4F5F6', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 90% 84% at 50% 48%, #FFFFFF 0%, #EFF1F4 70%, #E2E6EC 100%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 48,
          right: 48,
          top: 32,
          bottom: 96,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translate(${panX.toFixed(1)}px, ${panY.toFixed(1)}px) scale(${scale.toFixed(4)})`,
          transformOrigin: 'center center',
        }}
      >
        <svg width="100%" height="100%" viewBox={WORLD_MAP_VIEWBOX} aria-hidden="true">
          {/* 世界全土のポリゴン（米国と到達国がエメラルドグリーン #4CAF50 に点灯） */}
          {WORLD_COUNTRIES.map((c) => {
            const prog = targetProgressMap.get(c.id);
            const lit = c.id === originIso || (prog !== undefined && prog >= 0.88);
            const partial = prog !== undefined && prog > 0.45 && prog < 0.88;
            return (
              <path
                key={`wm-${c.id}`}
                d={c.d}
                fill={lit ? '#4CAF50' : partial ? '#86EFAC' : '#D1D5DB'}
                stroke="#FFFFFF"
                strokeWidth={0.75}
              />
            );
          })}

          {/* 東海岸から世界各地へ伸びる無数の黒い弧線 */}
          {targetIsos.map((iso, idx) => {
            const target = countryById.get(iso);
            if (!target) return null;
            const prog = targetProgressMap.get(iso) ?? 0;
            if (prog <= 0.01) return null;

            const tx = target.cx;
            const ty = target.cy;
            const mx = (startX + tx) / 2;
            const archLift = 42 + (idx % 4) * 24;
            const my = Math.min(startY, ty) - archLift;
            const pathD = `M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
            const dashTotal = 1100;

            return (
              <g key={`arc-${iso}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke="#111827"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeDasharray={dashTotal}
                  strokeDashoffset={dashTotal * (1 - prog)}
                  opacity={0.88}
                />
                {prog >= 0.92 ? (
                  <circle cx={tx} cy={ty} r={3.6} fill="#111827" />
                ) : null}
              </g>
            );
          })}

          {/* 米国東海岸の発信拠点 */}
          <circle cx={startX} cy={startY} r={5.5} fill="#111827" />
          <circle
            cx={startX}
            cy={startY}
            r={9 + Math.sin(localSec * 6) * 2.5}
            fill="none"
            stroke="#1E8E3E"
            strokeWidth={2}
            opacity={0.75}
          />
        </svg>
      </div>
    </AbsoluteFill>
  );
};
