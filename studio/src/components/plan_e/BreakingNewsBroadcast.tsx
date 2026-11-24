import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { SUBTITLE_SAFE_BOTTOM } from './constants';
import { FONT_ECON_MONO, FONT_ECON_SANS } from './fonts';

function resolveMedia(src: string): string {
  if (/^(https?:\/\/|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

export interface BreakingNewsBroadcastProps {
  startSec: number;
  endSec: number;
  anchorVideoSrc?: string;
  networkTag?: string;
  breakingLabel?: string;
  headline: string;
  tickerCode?: string;
  indexValueStart?: number;
  indexValueEnd?: number;
  changeValueText?: string;
  changePercentText?: string;
  tickerItems?: readonly string[];
}

const CRASH_PATH_PTS: readonly [number, number][] = [
  [0, 54],
  [45, 58],
  [90, 44],
  [135, 62],
  [175, 49],
  [220, 92],
  [260, 84],
  [305, 138],
  [345, 126],
  [390, 185],
  [435, 174],
  [480, 232],
  [525, 218],
  [575, 274],
  [620, 260],
  [675, 314],
];

/**
 * 案E Shot 5 CNN風 株価暴落速報ニュース画面。
 * 左側：急落指標カウントダウン＆ギザギザ暴落チャート／右側：実写キャスター映像／下部：速報帯＆ティッカー。
 * CleanSubtitle（画面下端 54〜120px）と絶対衝突しないよう bottom: 132px 以上に配置する。
 */
export const BreakingNewsBroadcast: React.FC<BreakingNewsBroadcastProps> = ({
  startSec,
  endSec,
  anchorVideoSrc,
  networkTag = 'GLOBAL MARKET DESK',
  breakingLabel = 'BREAKING NEWS',
  headline,
  tickerCode = 'DJI',
  indexValueStart = 23185.62,
  indexValueEnd = 20188.52,
  changeValueText = '-2,997.10',
  changePercentText = '-12.93%',
  tickerItems = [
    'S&P 500  -11.98%',
    'NASDAQ  -12.32%',
    'TRADING HALTED: LEVEL 1 CIRCUIT BREAKER',
    'VIX VOLATILITY  +42.8%',
    'TREASURY LIQUIDITY STRESS',
  ],
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  const prog = interpolate(sec, [startSec, Math.min(endSec - 0.15, startSec + 1.9)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const liveValue = interpolate(prog, [0, 1], [indexValueStart, indexValueEnd]);
  const formattedVal = liveValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const blinkOn = Math.floor(sec * 3) % 2 === 0;
  const seqFrom = Math.max(0, Math.floor(startSec * fps));
  const seqDur = Math.max(2, Math.ceil((endSec - startSec) * fps) + 4);
  const tickerOffset = ((sec - startSec) * 210) % 1600;

  const polyD = CRASH_PATH_PTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const areaD = `${polyD} L 675 340 L 0 340 Z`;
  const lastIdx = Math.max(1, Math.min(CRASH_PATH_PTS.length - 1, Math.floor(prog * (CRASH_PATH_PTS.length - 1))));
  const dotPt = CRASH_PATH_PTS[lastIdx];

  return (
    <AbsoluteFill style={{ backgroundColor: '#120406', overflow: 'hidden' }}>
      {/* スタジオ背景の深い赤黒グラデーション */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 28% 36%, rgba(185, 28, 28, 0.34) 0%, rgba(20, 4, 6, 0.98) 72%)',
        }}
      />

      {/* 上部 報道局LIVEヘッダー */}
      <div
        style={{
          position: 'absolute',
          top: 38,
          left: 72,
          right: 72,
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'rgba(10, 10, 14, 0.90)',
          borderBottom: '3px solid #CC0000',
          padding: '0 22px',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span
            style={{
              backgroundColor: '#CC0000',
              color: '#FFFFFF',
              fontFamily: FONT_ECON_MONO,
              fontSize: 18,
              fontWeight: 900,
              padding: '4px 12px',
              letterSpacing: '0.12em',
              opacity: blinkOn ? 1 : 0.72,
            }}
          >
            ● LIVE
          </span>
          <span
            style={{
              fontFamily: FONT_ECON_SANS,
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: '0.08em',
              color: '#F8FAFC',
            }}
          >
            {networkTag}
          </span>
        </div>
        <span
          style={{
            fontFamily: FONT_ECON_MONO,
            fontSize: 18,
            fontWeight: 700,
            color: '#FCA5A5',
            letterSpacing: '0.1em',
          }}
        >
          NYSE CLOSE // VOLATILITY ALERT
        </span>
      </div>

      {/* メイン2ペイン（左56% 暴落チャート / 右44% キャスター実写） */}
      <div
        style={{
          position: 'absolute',
          top: 108,
          left: 72,
          right: 72,
          bottom: 288,
          display: 'grid',
          gridTemplateColumns: '1.28fr 1fr',
          gap: 18,
          zIndex: 8,
        }}
      >
        {/* 左ペイン：数値急落パネル＆SVGチャート */}
        <div
          style={{
            backgroundColor: 'rgba(22, 6, 9, 0.94)',
            border: '2px solid rgba(220, 38, 38, 0.6)',
            padding: '24px 28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 28,
                  fontWeight: 900,
                  color: '#FCA5A5',
                  letterSpacing: '0.1em',
                }}
              >
                {tickerCode} INDEX
              </span>
              <span
                style={{
                  backgroundColor: '#CC0000',
                  color: '#FFFFFF',
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 26,
                  fontWeight: 900,
                  padding: '4px 16px',
                }}
              >
                ▼ {changePercentText}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginTop: 8 }}>
              <span
                style={{
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 64,
                  fontWeight: 900,
                  color: '#FFFFFF',
                  letterSpacing: '-0.02em',
                }}
              >
                {formattedVal}
              </span>
              <span
                style={{
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 34,
                  fontWeight: 900,
                  color: '#EF4444',
                }}
              >
                {changeValueText}
              </span>
            </div>
          </div>

          <svg width="100%" height="340" viewBox="0 0 700 340" aria-hidden="true">
            <defs>
              <clipPath id={`news-clip-${startSec.toFixed(2)}`}>
                <rect x={0} y={0} width={Math.max(12, prog * 700)} height={340} />
              </clipPath>
              <linearGradient id={`news-fill-${startSec.toFixed(2)}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#EF4444" stopOpacity={0.48} />
                <stop offset="100%" stopColor="#EF4444" stopOpacity={0.03} />
              </linearGradient>
            </defs>

            {[60, 130, 200, 270].map((gy) => (
              <line
                key={`g-${gy}`}
                x1={0}
                y1={gy}
                x2={690}
                y2={gy}
                stroke="rgba(248, 113, 113, 0.18)"
                strokeDasharray="6 6"
                strokeWidth={1.2}
              />
            ))}
            <line x1={0} y1={54} x2={690} y2={54} stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} />
            <text x={8} y={42} fill="#CBD5E1" fontFamily={FONT_ECON_MONO} fontSize={14} fontWeight={700}>
              PREV CLOSE {indexValueStart.toLocaleString('en-US')}
            </text>

            <g clipPath={`url(#news-clip-${startSec.toFixed(2)})`}>
              <path d={areaD} fill={`url(#news-fill-${startSec.toFixed(2)})`} />
              <path d={polyD} fill="none" stroke="#EF4444" strokeWidth={6} strokeLinejoin="round" />
            </g>

            <circle cx={dotPt[0]} cy={dotPt[1]} r={9} fill="#FFFFFF" stroke="#CC0000" strokeWidth={5} />
          </svg>
        </div>

        {/* 右ペイン：TVスタジオキャスター実写動画 */}
        <div
          style={{
            position: 'relative',
            backgroundColor: '#0B1220',
            border: '2px solid rgba(248, 250, 252, 0.25)',
            overflow: 'hidden',
          }}
        >
          {anchorVideoSrc ? (
            <Sequence from={seqFrom} durationInFrames={seqDur} layout="none">
              <OffthreadVideo
                src={resolveMedia(anchorVideoSrc)}
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center 20%',
                }}
              />
            </Sequence>
          ) : null}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.68) 100%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              backgroundColor: 'rgba(15, 23, 42, 0.86)',
              border: '1px solid rgba(255,255,255,0.35)',
              color: '#F8FAFC',
              fontFamily: FONT_ECON_MONO,
              fontSize: 14,
              fontWeight: 800,
              padding: '4px 10px',
            }}
          >
            NEW YORK STUDIO
          </div>
        </div>
      </div>

      {/* 下部 CNN風 速報見出し＆ティッカー帯（CleanSubtitle の上側 bottom: 168px に配置） */}
      <div
        style={{
          position: 'absolute',
          left: 72,
          right: 72,
          bottom: SUBTITLE_SAFE_BOTTOM,
          zIndex: 14,
          boxShadow: '0 14px 36px rgba(0, 0, 0, 0.72)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'stretch', height: 68 }}>
          <div
            style={{
              backgroundColor: '#CC0000',
              color: '#FFFFFF',
              fontFamily: FONT_ECON_SANS,
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: '0.06em',
              padding: '0 24px',
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {breakingLabel}
          </div>
          <div
            style={{
              flex: 1,
              backgroundColor: '#F8FAFC',
              color: '#0F172A',
              fontFamily: FONT_ECON_SANS,
              fontSize: 29,
              fontWeight: 900,
              padding: '0 24px',
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {headline}
          </div>
        </div>

        {/* スクロールティッカー帯 */}
        <div
          style={{
            height: 36,
            backgroundColor: '#0A0C10',
            borderTop: '2px solid #CC0000',
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            paddingLeft: 18,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 46,
              whiteSpace: 'nowrap',
              fontFamily: FONT_ECON_MONO,
              fontSize: 16,
              fontWeight: 800,
              color: '#FDE047',
              transform: `translateX(${-tickerOffset.toFixed(1)}px)`,
            }}
          >
            {[...tickerItems, ...tickerItems].map((item, idx) => (
              <span key={`tk-${idx}`}>◆ {item}</span>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
