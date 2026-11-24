import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_ECON_SERIF } from './fonts';

export type EconHostPose =
  | 'remote'
  | 'point_up'
  | 'open_hands'
  | 'mallet_swing'
  | 'dizzy'
  | 'pointer_stick'
  | 'tented_hands'
  | 'handshake_left'
  | 'handshake_right';

export interface EconHostAvatarProps {
  pose?: EconHostPose;
  emblem?: string;
  headColor?: string;
  headBorderColor?: string;
  suitColor?: string;
  tieColor?: string;
  flipX?: boolean;
  scale?: number;
  malletSwingDeg?: number;
  isNpc?: boolean;
  showStars?: boolean;
  style?: React.CSSProperties;
}

/**
 * 案E 進行役2Dエディトリアル・アバター（スーツ＋シンボル円形ヘッド）。
 * 案B/C路線Aの棒人間とは完全に差別化し、面構成のジャケット＋タイ＋記号アイコン頭部で描画する。
 */
export const EconHostAvatar: React.FC<EconHostAvatarProps> = ({
  pose = 'open_hands',
  emblem = '$?',
  headColor,
  headBorderColor,
  suitColor,
  tieColor,
  flipX = false,
  scale = 1,
  malletSwingDeg = -35,
  isNpc = false,
  showStars,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  const resolvedHead = headColor ?? (isNpc ? '#6B7280' : '#1E8E3E');
  const resolvedHeadBorder = headBorderColor ?? (isNpc ? '#374151' : '#0F5132');
  const resolvedSuit = suitColor ?? (isNpc ? '#2C333F' : '#151B24');
  const resolvedLapel = isNpc ? '#3E4654' : '#222B38';
  const resolvedTie = tieColor ?? (isNpc ? '#64748B' : '#22C55E');
  const skinHand = isNpc ? '#9CA3AF' : '#22C55E';

  const breathY = Math.sin(sec * 2.8) * 3.0;
  const headTilt =
    pose === 'dizzy'
      ? Math.sin(sec * 11) * 7
      : pose === 'mallet_swing'
        ? malletSwingDeg * 0.12
        : Math.sin(sec * 1.9) * 1.8;

  const starsVisible = showStars ?? pose === 'dizzy';

  return (
    <div
      style={{
        width: 340,
        height: 440,
        transform: `scale(${scale}) ${flipX ? 'scaleX(-1)' : ''}`,
        transformOrigin: 'bottom center',
        pointerEvents: 'none',
        ...style,
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 340 440" overflow="visible" aria-hidden="true">
        <defs>
          <radialGradient id={`head-grad-${isNpc ? 'npc' : 'host'}`} cx="36%" cy="30%" r="72%">
            <stop offset="0%" stopColor={isNpc ? '#9CA3AF' : '#34D399'} />
            <stop offset="55%" stopColor={resolvedHead} />
            <stop offset="100%" stopColor={resolvedHeadBorder} />
          </radialGradient>
          <linearGradient id={`suit-grad-${isNpc ? 'npc' : 'host'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={resolvedLapel} />
            <stop offset="100%" stopColor={resolvedSuit} />
          </linearGradient>
          <filter id="avatar-shadow" x="-20%" y="-15%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#000000" floodOpacity="0.42" />
          </filter>
        </defs>

        <g transform={`translate(0, ${breathY.toFixed(2)})`} filter="url(#avatar-shadow)">
          {/* 胴体・テーラードジャケット */}
          <path
            d="M 88 212 C 88 188, 120 176, 170 176 C 220 176, 252 188, 252 212 L 266 436 L 74 436 Z"
            fill={`url(#suit-grad-${isNpc ? 'npc' : 'host'})`}
            stroke="#0B0F14"
            strokeWidth={3}
          />

          {/* 白シャツ Vゾーン */}
          <polygon points="140,178 200,178 170,288" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth={1.5} />

          {/* ネクタイ */}
          <polygon points="163,182 177,182 175,204 182,276 170,295 158,276 165,204" fill={resolvedTie} />

          {/* ラペル陰影 */}
          <polygon points="140,178 118,225 142,240 134,255 169,294" fill={resolvedLapel} stroke="#0B0F14" strokeWidth={2} />
          <polygon points="200,178 222,225 198,240 206,255 171,294" fill={resolvedLapel} stroke="#0B0F14" strokeWidth={2} />

          {/* ポーズ別：腕＆小道具 */}
          {pose === 'remote' ? (
            <g>
              {/* 左腕自然下げ */}
              <path
                d="M 92 216 L 68 340 L 96 346 L 114 236 Z"
                fill={resolvedSuit}
                stroke="#0B0F14"
                strokeWidth={2.5}
              />
              {/* 右腕：リモコンを前方へ構える */}
              <path
                d="M 244 216 L 288 290 L 320 268 L 306 244 L 278 260 L 248 206 Z"
                fill={resolvedSuit}
                stroke="#0B0F14"
                strokeWidth={2.5}
              />
              <circle cx={314} cy={254} r={14} fill={skinHand} stroke="#0B0F14" strokeWidth={2} />
              {/* リモコン本体 */}
              <g transform="translate(310, 212) rotate(-24)">
                <rect x={0} y={0} width={22} height={64} rx={5} fill="#1E293B" stroke="#94A3B8" strokeWidth={1.8} />
                <circle cx={11} cy={12} r={3.5} fill="#EF4444" />
                <rect x={5} y={22} width={12} height={6} rx={1.5} fill="#475569" />
                <rect x={5} y={32} width={12} height={6} rx={1.5} fill="#475569" />
                <rect x={5} y={42} width={12} height={6} rx={1.5} fill="#22C55E" />
                {/* 赤外線パルス */}
                <circle
                  cx={11}
                  cy={-4}
                  r={4 + (Math.sin(sec * 10) + 1) * 3}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth={2}
                  opacity={0.75}
                />
              </g>
            </g>
          ) : null}

          {pose === 'point_up' ? (
            <g>
              <path d="M 92 216 L 72 340 L 98 345 L 112 240 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <path d="M 246 214 L 286 270 L 298 206 L 274 202 L 266 238 L 246 205 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <circle cx={286} cy={196} r={15} fill={skinHand} stroke="#0B0F14" strokeWidth={2} />
              <rect x={282} y={160} width={9} height={34} rx={4.5} fill={skinHand} stroke="#0B0F14" strokeWidth={2} />
            </g>
          ) : null}

          {pose === 'open_hands' ? (
            <g>
              <path d="M 92 216 L 44 282 L 64 298 L 108 242 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <circle cx={46} cy={292} r={16} fill={skinHand} stroke="#0B0F14" strokeWidth={2} />
              <path d="M 248 216 L 296 282 L 276 298 L 232 242 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <circle cx={294} cy={292} r={16} fill={skinHand} stroke="#0B0F14" strokeWidth={2} />
            </g>
          ) : null}

          {pose === 'mallet_swing' ? (
            <g>
              <path d="M 92 216 L 64 318 L 90 326 L 112 242 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <g transform={`translate(248, 224) rotate(${malletSwingDeg.toFixed(1)})`}>
                <path d="M -8 -10 L 68 24 L 56 48 L -16 14 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
                <circle cx={66} cy={36} r={15} fill={skinHand} stroke="#0B0F14" strokeWidth={2} />
                {/* 巨大木槌 */}
                <g transform="translate(64, 34) rotate(-68)">
                  <rect x={-7} y={-145} width={14} height={165} rx={5} fill="#A16207" stroke="#422006" strokeWidth={2.5} />
                  <rect x={-48} y={-205} width={96} height={62} rx={10} fill="#B45309" stroke="#451A03" strokeWidth={3.5} />
                  <rect x={-48} y={-205} width={18} height={62} rx={4} fill="#D97706" />
                  <rect x={30} y={-205} width={18} height={62} rx={4} fill="#D97706" />
                </g>
              </g>
            </g>
          ) : null}

          {pose === 'dizzy' ? (
            <g>
              <path d="M 92 216 L 44 268 L 62 284 L 108 242 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <circle cx={48} cy={276} r={15} fill={skinHand} stroke="#0B0F14" strokeWidth={2} />
              <path d="M 248 216 L 292 262 L 272 280 L 234 240 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <circle cx={286} cy={272} r={15} fill={skinHand} stroke="#0B0F14" strokeWidth={2} />
            </g>
          ) : null}

          {pose === 'pointer_stick' ? (
            <g>
              <path d="M 92 216 L 68 338 L 94 345 L 112 242 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <path d="M 246 214 L 306 254 L 292 278 L 234 242 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <circle cx={302} cy={266} r={15} fill={skinHand} stroke="#0B0F14" strokeWidth={2} />
              {/* 木製指示棒 */}
              <line
                x1={300}
                y1={266}
                x2={445}
                y2={176}
                stroke="#78350F"
                strokeWidth={7}
                strokeLinecap="round"
              />
              <circle cx={446} cy={175} r={5} fill="#F59E0B" />
            </g>
          ) : null}

          {pose === 'tented_hands' ? (
            <g>
              <path d="M 92 216 L 122 308 L 154 294 L 112 240 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <path d="M 248 216 L 218 308 L 186 294 L 228 240 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <polygon points="154,288 170,264 186,288 170,308" fill={skinHand} stroke="#0B0F14" strokeWidth={2} />
            </g>
          ) : null}

          {pose === 'handshake_left' || pose === 'handshake_right' ? (
            <g>
              <path d="M 92 216 L 68 340 L 94 346 L 112 240 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <path d="M 246 214 L 336 276 L 320 302 L 236 244 Z" fill={resolvedSuit} stroke="#0B0F14" strokeWidth={2.5} />
              <circle cx={332} cy={290} r={17} fill={skinHand} stroke="#0B0F14" strokeWidth={2} />
            </g>
          ) : null}

          {/* 頭部（円形シンボルヘッド） */}
          <g transform={`translate(170, 108) rotate(${headTilt.toFixed(2)})`}>
            <circle
              cx={0}
              cy={0}
              r={68}
              fill={`url(#head-grad-${isNpc ? 'npc' : 'host'})`}
              stroke="#0B0F14"
              strokeWidth={4}
            />
            <circle cx={0} cy={0} r={60} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={2} />
            <text
              x={0}
              y={18}
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily={FONT_ECON_SERIF}
              fontSize={emblem.length > 2 ? 40 : 54}
              fontWeight={900}
              style={{ letterSpacing: '-0.02em' }}
            >
              {emblem}
            </text>
          </g>

          {/* めまい演出：頭上を旋回する星 */}
          {starsVisible ? (
            <g transform="translate(170, 22)">
              {[0, 1, 2, 3].map((idx) => {
                const ang = sec * 5.2 + (idx * Math.PI) / 2;
                const sx = Math.cos(ang) * 74;
                const sy = Math.sin(ang) * 18;
                const sc = 0.72 + 0.28 * Math.sin(ang);
                return (
                  <g key={`star-${idx}`} transform={`translate(${sx.toFixed(1)}, ${sy.toFixed(1)}) scale(${sc.toFixed(2)})`}>
                    <polygon
                      points="0,-13 3.5,-4 13,-4 5.5,2 8.5,11 0,5.5 -8.5,11 -5.5,2 -13,-4 -3.5,-4"
                      fill="#FACC15"
                      stroke="#713F12"
                      strokeWidth={1.6}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}
        </g>
      </svg>
    </div>
  );
};
