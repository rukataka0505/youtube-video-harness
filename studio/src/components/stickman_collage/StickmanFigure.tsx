import React, { useId } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_HAND, FONT_MARU } from './fonts';
import {
  resolvePolarityTheme,
  type StagePolarity,
  type StickmanPose,
} from './types';

export interface StickmanFigureProps {
  pose: StickmanPose;
  polarity?: StagePolarity;
  color?: string;
  size?: number;
  boilFps?: number;
  boilScale?: number;
  signPrimary?: string;
  signSecondary?: string;
  flipX?: boolean;
  style?: React.CSSProperties;
}

/**
 * 7.5fps 手描きボイル揺らぎ付き棒人間（直線 <line>・正円 <circle> 不使用）。
 * polarity に応じて黒舞台では黄/白/青、方眼紙・クリームノート上では濃墨 #111111 へ自動適応する。
 */
export const StickmanFigure: React.FC<StickmanFigureProps> = ({
  pose,
  polarity = 'black',
  color,
  size = 320,
  boilFps = 7.5,
  boilScale = 3.4,
  signPrimary = 'I HAVE A PhD',
  signSecondary = '（博士号あり）',
  flipX = false,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rawId = useId();
  const filterId = `sc-fig-boil-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const stepFrames = Math.max(1, Math.round(fps / Math.max(1, boilFps)));
  const boilSeed = (Math.floor(frame / stepFrames) % 16) + 1;
  const theme = resolvePolarityTheme(polarity);

  const mainColor =
    color ??
    (pose === 'listening_blue'
      ? theme.accentSecondary
      : theme.isLight
        ? theme.ink
        : theme.accentPrimary);

  const secondaryMuted = theme.isLight ? '#57534E' : '#B8B2A6';
  const chairMuted = theme.isLight ? '#6B655D' : '#7C766E';

  const strokeStyle = {
    stroke: mainColor,
    strokeWidth: 11.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  const detailStroke = {
    stroke: mainColor,
    strokeWidth: 7.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  if (pose === 'stick_legs_only') {
    return (
      <svg
        width={size}
        height={size * 0.72}
        viewBox="0 0 260 190"
        aria-hidden="true"
        style={style}
      >
        <defs>
          <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.032"
              numOctaves={2}
              seed={boilSeed}
              result="noise"
            />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={boilScale} />
          </filter>
        </defs>
        <g
          filter={`url(#${filterId})`}
          transform={flipX ? 'translate(260, 0) scale(-1, 1)' : undefined}
        >
          <path d="M 108 10 C 101 58, 92 104, 83 158" {...strokeStyle} strokeWidth={10.5} />
          <path d="M 83 158 C 72 162, 60 165, 53 163" {...strokeStyle} strokeWidth={10.5} />
          <path d="M 150 10 C 158 58, 166 105, 175 158" {...strokeStyle} strokeWidth={10.5} />
          <path d="M 175 158 C 188 162, 200 164, 208 161" {...strokeStyle} strokeWidth={10.5} />
        </g>
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 280 280"
      aria-hidden="true"
      style={style}
    >
      <defs>
        <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.031"
            numOctaves={2}
            seed={boilSeed}
            result="noise"
          />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={boilScale} />
        </filter>
      </defs>

      <g
        filter={`url(#${filterId})`}
        transform={flipX ? 'translate(280, 0) scale(-1, 1)' : undefined}
      >
        {pose === 'sitting_desk' && (
          <>
            <path d="M 78 140 C 77 175, 79 200, 80 225" stroke={chairMuted} strokeWidth={8} strokeLinecap="round" fill="none" />
            <path d="M 78 186 C 98 185, 118 186, 134 188" stroke={chairMuted} strokeWidth={8} strokeLinecap="round" fill="none" />
            <path d="M 128 188 C 127 205, 128 218, 127 228" stroke={chairMuted} strokeWidth={8} strokeLinecap="round" fill="none" />
            <path
              d="M 122 58 C 145 56, 159 73, 157 93 C 155 113, 138 122, 119 120 C 100 118, 91 102, 93 83 C 95 66, 107 59, 122 58 Z"
              {...strokeStyle}
            />
            <path d="M 134 83 C 136 83, 137 85, 135 86" {...detailStroke} strokeWidth={6} />
            <path d="M 146 84 C 148 84, 149 86, 147 87" {...detailStroke} strokeWidth={6} />
            <path d="M 134 103 C 140 101, 146 102, 149 104" {...detailStroke} strokeWidth={5.5} />
            <path d="M 121 122 C 117 146, 112 164, 110 183" {...strokeStyle} />
            <path d="M 118 136 C 144 148, 168 153, 195 151" {...strokeStyle} />
            <path d="M 115 142 C 134 157, 154 162, 174 156" {...strokeStyle} />
            <path d="M 110 183 C 138 183, 154 186, 160 227" {...strokeStyle} />
            <path d="M 110 183 C 127 194, 141 196, 146 227" {...strokeStyle} />
            <path d="M 164 160 C 196 158, 232 159, 256 161" stroke={secondaryMuted} strokeWidth={9.5} strokeLinecap="round" fill="none" />
            <path d="M 178 161 C 177 186, 179 208, 178 232" stroke={secondaryMuted} strokeWidth={8.5} strokeLinecap="round" fill="none" />
            <path d="M 242 161 C 241 186, 242 210, 241 232" stroke={secondaryMuted} strokeWidth={8.5} strokeLinecap="round" fill="none" />
          </>
        )}

        {pose === 'grad_unhappy' && (
          <>
            <path
              d="M 139 62 C 161 60, 174 75, 172 95 C 170 116, 154 126, 136 124 C 117 122, 106 108, 108 88 C 110 71, 122 63, 139 62 Z"
              {...strokeStyle}
            />
            <path
              d="M 88 57 L 140 37 L 194 55 L 140 72 Z"
              fill="#B82535"
              stroke="#E11D48"
              strokeWidth={4}
              strokeLinejoin="round"
            />
            <path d="M 114 63 C 120 75, 160 75, 166 63" fill="#881337" stroke="#9F1239" strokeWidth={3} />
            <path d="M 188 57 C 192 71, 193 83, 190 94" stroke="#FBBF24" strokeWidth={5.5} strokeLinecap="round" fill="none" />
            <path d="M 123 84 C 127 87, 132 87, 134 86" {...detailStroke} strokeWidth={5.5} />
            <path d="M 156 84 C 152 87, 148 87, 145 86" {...detailStroke} strokeWidth={5.5} />
            <path d="M 127 109 C 136 100, 146 100, 155 109" {...detailStroke} strokeWidth={6} />
            <path d="M 139 125 C 141 154, 138 179, 139 203" {...strokeStyle} />
            <path d="M 139 144 C 113 158, 103 176, 114 192" {...strokeStyle} />
            <path d="M 139 144 C 166 158, 175 176, 164 192" {...strokeStyle} />
            <path d="M 139 203 C 126 226, 116 244, 110 260" {...strokeStyle} />
            <path d="M 139 203 C 154 226, 164 244, 170 260" {...strokeStyle} />
          </>
        )}

        {pose === 'homeless_sign' && (
          <>
            <path d="M 192 252 C 209 246, 229 247, 248 253" stroke="#78350F" strokeWidth={9} strokeLinecap="round" fill="none" />
            <path d="M 198 242 C 216 250, 234 252, 245 242" stroke="#92400E" strokeWidth={8} strokeLinecap="round" fill="none" />
            <path
              d="M 205 242 C 198 220, 211 201, 219 182 C 224 198, 232 204, 236 191 C 246 209, 243 229, 233 242 Z"
              fill="#F97316"
              stroke="#EA580C"
              strokeWidth={3.5}
            />
            <path
              d="M 213 242 C 210 227, 219 214, 223 203 C 229 217, 232 230, 226 242 Z"
              fill="#FACC15"
            />
            <path
              d="M 105 56 C 126 54, 139 70, 137 90 C 135 109, 118 119, 101 117 C 83 115, 73 99, 75 80 C 77 64, 89 57, 105 56 Z"
              {...strokeStyle}
            />
            <path d="M 94 84 C 96 84, 97 86, 95 87" {...detailStroke} strokeWidth={5.5} />
            <path d="M 114 84 C 116 84, 117 86, 115 87" {...detailStroke} strokeWidth={5.5} />
            <path d="M 95 103 C 102 98, 111 98, 117 103" {...detailStroke} strokeWidth={5} />
            <path d="M 104 118 C 103 149, 102 178, 103 204" {...strokeStyle} />
            <path d="M 103 204 C 84 225, 76 244, 72 259" {...strokeStyle} />
            <path d="M 103 204 C 122 225, 131 244, 135 259" {...strokeStyle} />
            <path d="M 103 142 C 74 150, 56 142, 46 130" {...strokeStyle} />
            <path d="M 103 142 C 132 150, 150 142, 160 130" {...strokeStyle} />
            <path
              d="M 18 112 L 188 106 L 194 128 L 185 135 L 190 169 L 22 175 L 16 146 L 23 137 Z"
              fill="#A16A39"
              stroke="#D99B58"
              strokeWidth={4}
              strokeLinejoin="round"
            />
            <path d="M 35 119 L 175 114" stroke="#78461E" strokeWidth={2} opacity={0.5} />
            <g transform={flipX ? 'translate(210, 0) scale(-1, 1)' : undefined}>
              <text
                x={105}
                y={139}
                textAnchor="middle"
                fill="#1C1007"
                fontSize={22}
                fontWeight={900}
                fontFamily={FONT_HAND}
                transform="rotate(-1.8 105 139)"
              >
                {signPrimary}
              </text>
              {signSecondary ? (
                <text
                  x={105}
                  y={162}
                  textAnchor="middle"
                  fill="#2D1A0B"
                  fontSize={16}
                  fontWeight={800}
                  fontFamily={FONT_HAND}
                  transform="rotate(-1.8 105 162)"
                >
                  {signSecondary}
                </text>
              ) : null}
            </g>
          </>
        )}

        {pose === 'celebrate' && (
          <>
            <path d="M 52 54 L 33 41" stroke={theme.isLight ? '#E62E2D' : '#FDE047'} strokeWidth={6} strokeLinecap="round" />
            <path d="M 228 54 L 247 41" stroke={theme.isLight ? '#E62E2D' : '#FDE047'} strokeWidth={6} strokeLinecap="round" />
            <path d="M 140 24 L 140 8" stroke={theme.isLight ? '#E62E2D' : '#FDE047'} strokeWidth={6} strokeLinecap="round" />
            <path
              d="M 140 58 C 162 56, 175 72, 173 92 C 171 112, 155 123, 137 121 C 118 119, 107 104, 109 84 C 111 67, 124 59, 140 58 Z"
              {...strokeStyle}
            />
            <path d="M 127 83 C 129 82, 131 85, 128 86" {...detailStroke} strokeWidth={6} />
            <path d="M 152 83 C 154 82, 156 85, 153 86" {...detailStroke} strokeWidth={6} />
            <path d="M 125 99 C 134 112, 148 112, 157 98" {...detailStroke} strokeWidth={6.5} />
            <path d="M 140 122 C 141 151, 139 178, 140 202" {...strokeStyle} />
            <path d="M 140 140 C 106 116, 86 90, 74 58" {...strokeStyle} />
            <path d="M 140 140 C 174 116, 194 90, 206 58" {...strokeStyle} />
            <path d="M 140 202 C 122 225, 109 244, 101 262" {...strokeStyle} />
            <path d="M 140 202 C 158 225, 171 244, 179 262" {...strokeStyle} />
          </>
        )}

        {(pose === 'talking_yellow' || pose === 'listening_blue') && (
          <>
            <path
              d="M 138 56 C 160 54, 173 70, 171 90 C 169 110, 153 121, 135 119 C 116 117, 105 102, 107 82 C 109 65, 122 57, 138 56 Z"
              {...strokeStyle}
            />
            {pose === 'talking_yellow' ? (
              <>
                <path d="M 146 82 C 148 82, 149 84, 147 85" {...detailStroke} strokeWidth={5.5} />
                <path d="M 160 82 C 162 82, 163 84, 161 85" {...detailStroke} strokeWidth={5.5} />
                <path d="M 146 101 C 152 106, 159 104, 161 99 C 156 97, 149 97, 146 101 Z" {...detailStroke} strokeWidth={4.5} />
                <path d="M 137 120 C 139 149, 137 177, 138 202" {...strokeStyle} />
                <path d="M 138 140 C 169 133, 195 119, 214 101" {...strokeStyle} />
                <path d="M 137 143 C 112 162, 102 181, 111 196" {...strokeStyle} />
              </>
            ) : (
              <>
                <path d="M 118 83 C 120 83, 121 85, 119 86" {...detailStroke} strokeWidth={5.5} />
                <path d="M 133 83 C 135 83, 136 85, 134 86" {...detailStroke} strokeWidth={5.5} />
                <path d="M 121 103 C 127 102, 133 102, 137 103" {...detailStroke} strokeWidth={5} />
                <path d="M 138 120 C 137 149, 139 177, 138 202" {...strokeStyle} />
                <path d="M 138 140 C 118 164, 112 184, 116 200" {...strokeStyle} />
                <path d="M 138 140 C 157 164, 163 184, 159 200" {...strokeStyle} />
              </>
            )}
            <path d="M 138 202 C 124 226, 114 245, 108 263" {...strokeStyle} />
            <path d="M 138 202 C 152 226, 162 245, 168 263" {...strokeStyle} />
          </>
        )}

        {pose === 'nerd_glasses' && (
          <>
            <path
              d="M 136 58 C 158 56, 171 72, 169 92 C 167 112, 151 123, 133 121 C 114 119, 103 104, 105 84 C 107 67, 120 59, 136 58 Z"
              {...strokeStyle}
            />
            <path d="M 111 76 L 135 76 L 134 94 L 112 94 Z" fill="#292524" stroke={mainColor} strokeWidth={4.5} strokeLinejoin="round" />
            <path d="M 144 76 L 168 76 L 167 94 L 145 94 Z" fill="#292524" stroke={mainColor} strokeWidth={4.5} strokeLinejoin="round" />
            <path d="M 135 83 L 144 83" stroke={mainColor} strokeWidth={4.5} strokeLinecap="round" />
            <path d="M 117 89 L 126 80" stroke="#93C5FD" strokeWidth={3} strokeLinecap="round" />
            <path d="M 150 89 L 159 80" stroke="#93C5FD" strokeWidth={3} strokeLinecap="round" />
            <path d="M 129 104 C 138 110, 148 109, 155 101" {...detailStroke} strokeWidth={5.5} />
            <path d="M 136 122 C 135 151, 137 178, 136 203" {...strokeStyle} />
            <path d="M 136 141 C 110 160, 101 180, 111 196" {...strokeStyle} />
            <path d="M 136 141 C 167 132, 193 116, 211 97" {...strokeStyle} />
            <path d="M 136 203 C 122 227, 112 246, 106 263" {...strokeStyle} />
            <path d="M 136 203 C 151 227, 161 246, 167 263" {...strokeStyle} />
            <g transform="translate(205, 58) rotate(8)">
              <path d="M 4 12 L 28 12 L 31 46 L 1 46 Z" fill="#E7E5E0" stroke="#A8A29E" strokeWidth={3.5} strokeLinejoin="round" />
              <path d="M 4 24 C 11 21, 21 26, 28 23 L 30 45 L 2 45 Z" fill="#FFFFFF" />
              <path d="M 6 4 L 26 4 L 27 12 L 5 12 Z" fill="#6B655D" stroke="#D6D1C4" strokeWidth={2.5} strokeLinejoin="round" />
            </g>
          </>
        )}

        {pose === 'pointing' && (
          <>
            <path
              d="M 134 57 C 156 55, 169 71, 167 91 C 165 111, 149 122, 131 120 C 112 118, 101 103, 103 83 C 105 66, 118 58, 134 57 Z"
              {...strokeStyle}
            />
            <path d="M 142 83 C 144 83, 145 85, 143 86" {...detailStroke} strokeWidth={5.5} />
            <path d="M 156 83 C 158 83, 159 85, 157 86" {...detailStroke} strokeWidth={5.5} />
            <path d="M 142 103 C 148 106, 155 104, 159 99" {...detailStroke} strokeWidth={5.5} />
            <path d="M 133 121 C 134 150, 132 178, 133 203" {...strokeStyle} />
            <path d="M 134 142 C 167 126, 198 101, 224 73" {...strokeStyle} />
            <path d="M 214 68 L 233 65 L 228 84" {...detailStroke} strokeWidth={6.5} />
            <path d="M 133 144 C 106 156, 98 175, 118 186" {...strokeStyle} />
            <path d="M 133 203 C 119 227, 109 246, 103 263" {...strokeStyle} />
            <path d="M 133 203 C 148 227, 158 246, 165 263" {...strokeStyle} />
          </>
        )}

        {pose === 'thinking' && (
          <>
            <path
              d="M 136 58 C 158 56, 171 72, 169 92 C 167 112, 151 123, 133 121 C 114 119, 103 104, 105 84 C 107 67, 120 59, 136 58 Z"
              {...strokeStyle}
            />
            <path d="M 124 81 C 126 80, 128 82, 126 84" {...detailStroke} strokeWidth={5.5} />
            <path d="M 146 80 C 148 79, 150 81, 148 83" {...detailStroke} strokeWidth={5.5} />
            <path d="M 129 104 C 135 102, 141 104, 147 102" {...detailStroke} strokeWidth={5.5} />
            <path
              d="M 188 42 C 194 31, 211 33, 211 45 C 211 54, 198 57, 198 66"
              stroke={secondaryMuted}
              strokeWidth={5.5}
              strokeLinecap="round"
              fill="none"
            />
            <path d="M 198 76 C 198 77, 199 78, 198 79" stroke={secondaryMuted} strokeWidth={6.5} strokeLinecap="round" fill="none" />
            <path d="M 135 122 C 134 151, 136 178, 135 203" {...strokeStyle} />
            <path d="M 136 144 C 165 148, 172 132, 152 117" {...strokeStyle} />
            <path d="M 134 144 C 108 158, 104 176, 126 176" {...strokeStyle} />
            <path d="M 135 203 C 122 227, 112 246, 106 263" {...strokeStyle} />
            <path d="M 135 203 C 150 227, 160 246, 166 263" {...strokeStyle} />
          </>
        )}
      </g>
    </svg>
  );
};

export interface StickmanBubbleProps {
  text: string;
  subText?: string;
  tailDirection?: 'bottom-left' | 'bottom-right' | 'left' | 'right' | 'none';
  polarity?: StagePolarity;
  textColor?: string;
  fontSize?: number;
  maxWidth?: number;
  style?: React.CSSProperties;
}

/**
 * 棒人間用の手描き太枠吹き出し。
 */
export const StickmanBubble: React.FC<StickmanBubbleProps> = ({
  text,
  subText,
  tailDirection = 'bottom-left',
  polarity = 'black',
  textColor,
  fontSize = 32,
  maxWidth = 420,
  style,
}) => {
  const theme = resolvePolarityTheme(polarity);
  const ink = '#111111';
  const resolvedTextColor = textColor ?? ink;

  return (
    <div
      style={{
        position: 'relative',
        maxWidth,
        backgroundColor: '#FFFFFF',
        border: `5px solid ${ink}`,
        borderRadius: 22,
        padding: '12px 22px',
        boxShadow: theme.isLight ? '6px 7px 0 rgba(17,17,17,0.2)' : '0 14px 30px rgba(0,0,0,0.65)',
        fontFamily: FONT_MARU,
        fontWeight: 900,
        fontSize,
        lineHeight: 1.25,
        color: resolvedTextColor,
        textAlign: 'center',
        ...style,
      }}
    >
      <div>{text}</div>
      {subText ? (
        <div
          style={{
            marginTop: 4,
            fontFamily: FONT_HAND,
            fontSize: Math.max(18, Math.round(fontSize * 0.68)),
            color: '#57534E',
            fontWeight: 700,
          }}
        >
          {subText}
        </div>
      ) : null}

      {tailDirection !== 'none' ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 22,
            height: 22,
            backgroundColor: '#FFFFFF',
            borderRight: `5px solid ${ink}`,
            borderBottom: `5px solid ${ink}`,
            ...(tailDirection === 'bottom-left'
              ? { bottom: -14, left: 32, transform: 'rotate(45deg)' }
              : tailDirection === 'bottom-right'
                ? { bottom: -14, right: 32, transform: 'rotate(45deg)' }
                : tailDirection === 'left'
                  ? { left: -14, top: '42%', transform: 'rotate(135deg)' }
                  : { right: -14, top: '42%', transform: 'rotate(-45deg)' }),
          }}
        />
      ) : null}
    </div>
  );
};
