import React from 'react';

export type StickFigurePose =
  | 'sitting_desk'
  | 'grad_unhappy'
  | 'cardboard_sign'
  | 'celebrate'
  | 'talking'
  | 'listening'
  | 'nerd_glasses';

export interface MinimalStickFigureProps {
  pose: StickFigurePose;
  color?: string;
  size?: number;
  strokeWidth?: number;
  signText?: string;
}

/**
 * 案C（easy, actually型）ミニマル2D線画棒人間コンポーネント。
 * 2〜3色制限・高コントラスト黒背景映えを前提にSVGパスのみで描画する。
 */
export const MinimalStickFigure: React.FC<MinimalStickFigureProps> = ({
  pose,
  color = '#FFCC00',
  size = 240,
  strokeWidth = 7,
  signText = '博士号あり',
}) => {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <svg width={size} height={size} viewBox="0 0 240 240" aria-hidden="true">
      {/* 頭部 */}
      <circle cx={120} cy={62} r={26} {...common} />

      {/* ポーズ別の顔・小物 */}
      {pose === 'grad_unhappy' && (
        <>
          {/* 角帽 */}
          <polygon points="82,38 120,24 158,38 120,50" fill={color} opacity={0.92} />
          <line x1={154} y1={40} x2={154} y2={62} {...common} strokeWidth={4} />
          {/* 不満顔 */}
          <circle cx={111} cy={58} r={2.5} fill={color} />
          <circle cx={129} cy={58} r={2.5} fill={color} />
          <path d="M 108 74 Q 120 66 132 74" {...common} strokeWidth={4} />
        </>
      )}

      {pose === 'celebrate' && (
        <>
          <circle cx={111} cy={58} r={2.8} fill={color} />
          <circle cx={129} cy={58} r={2.8} fill={color} />
          <path d="M 107 69 Q 120 82 133 69" {...common} strokeWidth={4.5} />
        </>
      )}

      {pose === 'nerd_glasses' && (
        <>
          <rect x={98} y={53} width={18} height={13} rx={3} {...common} strokeWidth={4} />
          <rect x={124} y={53} width={18} height={13} rx={3} {...common} strokeWidth={4} />
          <line x1={116} y1={59} x2={124} y2={59} {...common} strokeWidth={4} />
          <path d="M 111 75 Q 120 79 129 73" {...common} strokeWidth={3.5} />
        </>
      )}

      {/* 胴体 */}
      <line x1={120} y1={88} x2={120} y2={162} {...common} />

      {/* 腕 */}
      {pose === 'sitting_desk' && (
        <>
          <polyline points="120,108 152,126 174,126" {...common} />
          <polyline points="120,114 96,134 114,142" {...common} />
          {/* 机 */}
          <line x1={156} y1={134} x2={220} y2={134} stroke="#94A3B8" strokeWidth={6} strokeLinecap="round" />
          <line x1={168} y1={134} x2={168} y2={208} stroke="#94A3B8" strokeWidth={5} />
          <line x1={210} y1={134} x2={210} y2={208} stroke="#94A3B8" strokeWidth={5} />
        </>
      )}

      {pose === 'grad_unhappy' && (
        <>
          <polyline points="120,108 92,138 104,152" {...common} />
          <polyline points="120,108 148,138 136,152" {...common} />
        </>
      )}

      {pose === 'cardboard_sign' && (
        <>
          <polyline points="120,110 82,124 68,108" {...common} />
          <polyline points="120,110 158,124 172,108" {...common} />
          {/* 段ボール看板 */}
          <rect x={44} y={84} width={152} height={46} rx={4} fill="#92400E" stroke="#F59E0B" strokeWidth={3} />
          <text
            x={120}
            y={114}
            textAnchor="middle"
            fill="#FEF3C7"
            fontSize={20}
            fontWeight={800}
            fontFamily='"Noto Sans JP", sans-serif'
          >
            {signText}
          </text>
        </>
      )}

      {pose === 'celebrate' && (
        <>
          <polyline points="120,106 84,74 70,48" {...common} />
          <polyline points="120,106 156,74 170,48" {...common} />
        </>
      )}

      {pose === 'talking' && (
        <>
          <polyline points="120,108 156,96 182,82" {...common} />
          <polyline points="120,112 90,136 98,154" {...common} />
        </>
      )}

      {pose === 'listening' && (
        <>
          <line x1={120} y1={108} x2={96} y2={152} {...common} />
          <line x1={120} y1={108} x2={144} y2={152} {...common} />
        </>
      )}

      {pose === 'nerd_glasses' && (
        <>
          <polyline points="120,108 164,98 182,78" {...common} />
          <polyline points="120,112 94,142 104,158" {...common} />
          {/* 塩瓶 */}
          <rect x={176} y={56} width={22} height={32} rx={4} fill="#E2E8F0" stroke="#94A3B8" strokeWidth={2.5} />
          <rect x={179} y={50} width={16} height={7} rx={2} fill="#64748B" />
        </>
      )}

      {/* 脚 */}
      {pose === 'sitting_desk' ? (
        <>
          <polyline points="120,162 152,166 152,208" {...common} />
          <polyline points="120,162 134,174 134,208" {...common} />
        </>
      ) : (
        <>
          <line x1={120} y1={162} x2={94} y2={214} {...common} />
          <line x1={120} y1={162} x2={146} y2={214} {...common} />
        </>
      )}
    </svg>
  );
};
