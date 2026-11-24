import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  EconHostAvatar,
  FONT_ECON_MONO,
  FONT_ECON_SANS,
  FONT_ECON_SERIF,
  WORLD_COUNTRIES,
  WORLD_MAP_VIEWBOX,
} from '../../../../components/plan_e';

function resolveMedia(src: string): string {
  if (/^(https?:\/\/|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

/* ============================================================================
 * 1. PolicyBacklashBroadcast (Shot 2-C1: CNN風 政策猛反発速報ニュース画面)
 *    下部ニュース帯は bottom: 162px に配置し、CleanSubtitle (58-144px) と完全非衝突
 * ============================================================================ */
export interface PolicyBacklashBroadcastProps {
  startSec: number;
  endSec: number;
  anchorVideoSrc: string;
}

const BACKLASH_PTS: readonly [number, number][] = [
  [0, 48],
  [48, 52],
  [95, 45],
  [145, 76],
  [195, 112],
  [245, 102],
  [300, 168],
  [355, 205],
  [410, 194],
  [465, 246],
  [520, 268],
  [580, 294],
  [640, 312],
  [685, 322],
];

export const PolicyBacklashBroadcast: React.FC<PolicyBacklashBroadcastProps> = ({
  startSec,
  endSec,
  anchorVideoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  const prog = interpolate(sec, [startSec, Math.min(endSec - 0.15, startSec + 2.1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const trustVal = interpolate(prog, [0, 1], [100.0, 24.8]).toFixed(1);
  const blinkOn = Math.floor(sec * 3) % 2 === 0;
  const seqFrom = Math.max(0, Math.floor(startSec * fps));
  const seqDur = Math.max(2, Math.ceil((endSec - startSec) * fps) + 2);
  const tickerOffset = ((sec - startSec) * 220) % 1600;

  const polyD = BACKLASH_PTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const areaD = `${polyD} L 685 340 L 0 340 Z`;
  const lastIdx = Math.max(
    1,
    Math.min(BACKLASH_PTS.length - 1, Math.floor(prog * (BACKLASH_PTS.length - 1))),
  );
  const dotPt = BACKLASH_PTS[lastIdx];

  const tickerItems = [
    'TAX HIKE ×2 BILL: PUBLIC PROTEST SURGES',
    'POLICY SUPPORT INDEX -75.2%',
    'CORPORATE BREAKUP PLAN HALTED',
    'PLAN FAILURE CONFIRMED IN 24 HOURS',
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#120406', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 28% 36%, rgba(185, 28, 28, 0.36) 0%, rgba(20, 4, 6, 0.98) 72%)',
        }}
      />

      {/* 上部 報道LIVEヘッダー（90%セーフゾーン内側） */}
      <div
        style={{
          position: 'absolute',
          top: 54,
          left: 96,
          right: 96,
          height: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'rgba(10, 10, 14, 0.92)',
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
              fontSize: 17,
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
              fontSize: 19,
              fontWeight: 900,
              letterSpacing: '0.08em',
              color: '#F8FAFC',
            }}
          >
            ECONOMIC POLICY DESK
          </span>
        </div>
        <span
          style={{
            fontFamily: FONT_ECON_MONO,
            fontSize: 17,
            fontWeight: 700,
            color: '#FCA5A5',
            letterSpacing: '0.1em',
          }}
        >
          TOKYO // BACKLASH ALERT
        </span>
      </div>

      {/* メイン2ペイン（bottom: 278px → 下部速報帯 bottom: 162px の上側に確実収容） */}
      <div
        style={{
          position: 'absolute',
          top: 118,
          left: 96,
          right: 96,
          bottom: 278,
          display: 'grid',
          gridTemplateColumns: '1.25fr 1fr',
          gap: 18,
          zIndex: 8,
        }}
      >
        {/* 左ペイン：急落指数＆チャート */}
        <div
          style={{
            backgroundColor: 'rgba(22, 6, 9, 0.94)',
            border: '2px solid rgba(220, 38, 38, 0.6)',
            padding: '20px 26px',
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
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#FCA5A5',
                  letterSpacing: '0.08em',
                }}
              >
                POLICY TRUST INDEX
              </span>
              <span
                style={{
                  backgroundColor: '#CC0000',
                  color: '#FFFFFF',
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 24,
                  fontWeight: 900,
                  padding: '4px 14px',
                }}
              >
                ▼ -75.2%
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 6 }}>
              <span
                style={{
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 60,
                  fontWeight: 900,
                  color: '#FFFFFF',
                }}
              >
                {trustVal}
              </span>
              <span
                style={{
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 28,
                  fontWeight: 900,
                  color: '#EF4444',
                }}
              >
                (-75.2 pts)
              </span>
            </div>
          </div>

          <svg width="100%" height="310" viewBox="0 0 700 340" aria-hidden="true">
            <defs>
              <clipPath id="pb-news-clip">
                <rect x={0} y={0} width={Math.max(12, prog * 700)} height={340} />
              </clipPath>
              <linearGradient id="pb-news-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#EF4444" stopOpacity={0.48} />
                <stop offset="100%" stopColor="#EF4444" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            {[70, 140, 210, 280].map((gy) => (
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
            <line x1={0} y1={48} x2={690} y2={48} stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} />
            <text x={8} y={36} fill="#CBD5E1" fontFamily={FONT_ECON_MONO} fontSize={14} fontWeight={700}>
              BASELINE 100.0
            </text>
            <g clipPath="url(#pb-news-clip)">
              <path d={areaD} fill="url(#pb-news-fill)" />
              <path d={polyD} fill="none" stroke="#EF4444" strokeWidth={6} strokeLinejoin="round" />
            </g>
            <circle cx={dotPt[0]} cy={dotPt[1]} r={9} fill="#FFFFFF" stroke="#CC0000" strokeWidth={5} />
          </svg>
        </div>

        {/* 右ペイン：実写スタジオ映像 */}
        <div
          style={{
            position: 'relative',
            backgroundColor: '#0B1220',
            border: '2px solid rgba(248, 250, 252, 0.25)',
            overflow: 'hidden',
          }}
        >
          <Sequence from={seqFrom} durationInFrames={seqDur} layout="none">
            <OffthreadVideo
              src={resolveMedia(anchorVideoSrc)}
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 25%',
              }}
            />
          </Sequence>
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
              backgroundColor: 'rgba(15, 23, 42, 0.88)',
              border: '1px solid rgba(255,255,255,0.35)',
              color: '#F8FAFC',
              fontFamily: FONT_ECON_MONO,
              fontSize: 14,
              fontWeight: 800,
              padding: '4px 10px',
            }}
          >
            BROADCAST DESK
          </div>
        </div>
      </div>

      {/* 下部速報帯＋ティッカー（bottom: 162px で字幕と絶対非衝突） */}
      <div
        style={{
          position: 'absolute',
          left: 96,
          right: 96,
          bottom: 162,
          zIndex: 14,
          boxShadow: '0 14px 36px rgba(0, 0, 0, 0.72)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'stretch', height: 64 }}>
          <div
            style={{
              backgroundColor: '#CC0000',
              color: '#FFFFFF',
              fontFamily: FONT_ECON_SANS,
              fontSize: 21,
              fontWeight: 900,
              letterSpacing: '0.06em',
              padding: '0 22px',
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            BREAKING NEWS
          </div>
          <div
            style={{
              flex: 1,
              backgroundColor: '#F8FAFC',
              color: '#0F172A',
              fontFamily: FONT_ECON_SANS,
              fontSize: 27,
              fontWeight: 900,
              padding: '0 22px',
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            急激な増税・企業解体案に全国で猛反発 — 計画は即座に撤回へ
          </div>
        </div>
        <div
          style={{
            height: 34,
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
              fontSize: 15,
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

/* ============================================================================
 * 2. EditorialVillainDebunk (Shot 5-B: 明るい紙面コラージュ・悪者論の否定)
 *    - 異なる質感の新聞切り抜き＋黄色蛍光マーカー＋赤スタンプ「✕ 犯人ではない」
 *    - 画面内出典テキスト一切なし
 * ============================================================================ */
export interface EditorialVillainDebunkProps {
  startSec: number;
  endSec: number;
}

export const EditorialVillainDebunk: React.FC<EditorialVillainDebunkProps> = ({ startSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  const leftCardAt = startSec + 0.06;
  const leftStampAt = startSec + 1.25;
  const rightCardAt = startSec + 1.62;
  const rightStampAt = startSec + 2.82;

  const leftSpr = spring({
    frame: Math.max(0, frame - Math.round(leftCardAt * fps)),
    fps,
    config: { stiffness: 420, damping: 24, mass: 0.65 },
  });
  const leftStampSpr = spring({
    frame: Math.max(0, frame - Math.round(leftStampAt * fps)),
    fps,
    config: { stiffness: 520, damping: 19, mass: 0.55 },
  });
  const rightSpr = spring({
    frame: Math.max(0, frame - Math.round(rightCardAt * fps)),
    fps,
    config: { stiffness: 420, damping: 24, mass: 0.65 },
  });
  const rightStampSpr = spring({
    frame: Math.max(0, frame - Math.round(rightStampAt * fps)),
    fps,
    config: { stiffness: 520, damping: 19, mass: 0.55 },
  });

  const leftHighlightPct = interpolate(sec, [leftCardAt + 0.25, leftCardAt + 0.75], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rightHighlightPct = interpolate(sec, [rightCardAt + 0.25, rightCardAt + 0.75], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#F6F2E9', overflow: 'hidden' }}>
      {/* 紙面の微細グラデーション */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 90% 85% at 45% 45%, #FAF8F2 0%, #EFE9DA 78%, #E2DAC6 100%)',
        }}
      />

      {/* 上部エディトリアル見出し（top: 58px） */}
      <div
        style={{
          position: 'absolute',
          top: 58,
          left: 96,
          right: 96,
          borderBottom: '3px solid #1E293B',
          paddingBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          zIndex: 6,
        }}
      >
        <div
          style={{
            fontFamily: FONT_ECON_SERIF,
            fontSize: 40,
            fontWeight: 900,
            color: '#111827',
          }}
        >
          よくある「2つの犯人探し」を検証する
        </div>
        <div
          style={{
            fontFamily: FONT_ECON_MONO,
            fontSize: 17,
            fontWeight: 800,
            color: '#475569',
            letterSpacing: '0.1em',
          }}
        >
          HYPOTHESIS CHECK // NO VILLAINS
        </div>
      </div>

      {/* 2枚の紙面切り抜き（中央配置、bottom: 210px 以上で字幕完全回避） */}
      <div
        style={{
          position: 'absolute',
          top: 158,
          left: 96,
          right: 340,
          bottom: 206,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 36,
          alignItems: 'center',
          zIndex: 8,
        }}
      >
        {/* 左：新聞ブロードシート切り抜き */}
        <div
          style={{
            position: 'relative',
            backgroundColor: '#F3EFE4',
            border: '1px solid #C8C1B2',
            borderTop: '10px solid #1E293B',
            boxShadow: '0 22px 48px rgba(15, 23, 42, 0.22)',
            padding: '26px 28px',
            minHeight: 380,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transform: `translateY(${interpolate(leftSpr, [0, 1], [-24, 0])}px) rotate(-1.8deg)`,
            opacity: leftSpr,
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #1E293B',
                paddingBottom: 8,
                marginBottom: 18,
              }}
            >
              <span style={{ fontFamily: FONT_ECON_SERIF, fontSize: 20, fontWeight: 900, color: '#0F172A' }}>
                ECONOMY WEEKLY
              </span>
              <span
                style={{
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 13,
                  fontWeight: 800,
                  backgroundColor: 'rgba(15,23,42,0.08)',
                  color: '#334155',
                  padding: '2px 8px',
                }}
              >
                仮説 01
              </span>
            </div>

            <div
              style={{
                fontFamily: FONT_ECON_SERIF,
                fontSize: 33,
                fontWeight: 900,
                lineHeight: 1.38,
                color: '#111827',
              }}
            >
              「
              <span
                style={{
                  backgroundImage: 'linear-gradient(transparent 44%, rgba(250, 204, 21, 0.85) 44%)',
                  backgroundSize: `${leftHighlightPct}% 100%`,
                  backgroundRepeat: 'no-repeat',
                }}
              >
                悪徳企業
              </span>
              」が利益を溜め込んで給料を上げない？
            </div>

            <div style={{ marginTop: 18, fontSize: 19, lineHeight: 1.55, color: '#475569', fontWeight: 600 }}>
              値上げすれば顧客が即座に他社へ逃げる市場環境では、単一企業の善意だけでは賃上げに踏み切れない。
            </div>
          </div>

          {sec >= leftStampAt ? (
            <div
              style={{
                position: 'absolute',
                right: 22,
                bottom: 24,
                border: '5px solid #CC0000',
                backgroundColor: 'rgba(255, 255, 255, 0.94)',
                color: '#CC0000',
                padding: '6px 16px',
                fontFamily: FONT_ECON_SANS,
                fontSize: 26,
                fontWeight: 900,
                letterSpacing: '0.06em',
                transform: `rotate(-8deg) scale(${interpolate(leftStampSpr, [0, 1], [1.65, 1.0])})`,
                opacity: leftStampSpr,
              }}
            >
              ✕ 犯人ではない
            </div>
          ) : null}
        </div>

        {/* 右：調査コラムメモ切り抜き */}
        <div
          style={{
            position: 'relative',
            backgroundColor: '#FFFBEB',
            border: '1px solid #D6C9A5',
            borderTop: '8px solid #D97706',
            boxShadow: '0 22px 48px rgba(15, 23, 42, 0.22)',
            padding: '26px 28px',
            minHeight: 380,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transform: `translateY(${interpolate(rightSpr, [0, 1], [-24, 0])}px) rotate(1.6deg)`,
            opacity: sec >= rightCardAt ? rightSpr : 0,
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #92400E',
                paddingBottom: 8,
                marginBottom: 18,
              }}
            >
              <span style={{ fontFamily: FONT_ECON_SERIF, fontSize: 20, fontWeight: 900, color: '#78350F' }}>
                LABOR REVIEW
              </span>
              <span
                style={{
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 13,
                  fontWeight: 800,
                  backgroundColor: 'rgba(217,119,6,0.14)',
                  color: '#92400E',
                  padding: '2px 8px',
                }}
              >
                仮説 02
              </span>
            </div>

            <div
              style={{
                fontFamily: FONT_ECON_SERIF,
                fontSize: 33,
                fontWeight: 900,
                lineHeight: 1.38,
                color: '#111827',
              }}
            >
              「
              <span
                style={{
                  backgroundImage: 'linear-gradient(transparent 44%, rgba(250, 204, 21, 0.85) 44%)',
                  backgroundSize: `${rightHighlightPct}% 100%`,
                  backgroundRepeat: 'no-repeat',
                }}
              >
                怠けた労働者
              </span>
              」の生産性不足が停滞を招いた？
            </div>

            <div style={{ marginTop: 18, fontSize: 19, lineHeight: 1.55, color: '#475569', fontWeight: 600 }}>
              可処分所得が伸びない環境で生活を守るため、より安い店舗や商品を選ぶのは極めて合理的な防衛行動である。
            </div>
          </div>

          {sec >= rightStampAt ? (
            <div
              style={{
                position: 'absolute',
                right: 22,
                bottom: 24,
                border: '5px solid #CC0000',
                backgroundColor: 'rgba(255, 255, 255, 0.94)',
                color: '#CC0000',
                padding: '6px 16px',
                fontFamily: FONT_ECON_SANS,
                fontSize: 26,
                fontWeight: 900,
                letterSpacing: '0.06em',
                transform: `rotate(-7deg) scale(${interpolate(rightStampSpr, [0, 1], [1.65, 1.0])})`,
                opacity: rightStampSpr,
              }}
            >
              ✕ 犯人ではない
            </div>
          ) : null}
        </div>
      </div>

      {/* 右下進行役アバター（tented_hands は左右対称のため flipX なしで文字反転を防止） */}
      <div style={{ position: 'absolute', right: 72, bottom: 52, zIndex: 14 }}>
        <EconHostAvatar pose="tented_hands" emblem="¥?" scale={0.86} />
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================================
 * 3. WageFlatlineMonitor (Shot 7-C: 実質賃金フラットラインモニター)
 * ============================================================================ */
export interface WageFlatlineMonitorProps {
  startSec: number;
  endSec: number;
  bgVideoSrc: string;
}

const PULSE_POINTS: readonly [number, number][] = [
  [0, 260],
  [90, 260],
  [140, 220],
  [175, 110],
  [210, 360],
  [250, 165],
  [290, 260],
  [360, 260],
  [410, 200],
  [445, 130],
  [480, 325],
  [520, 225],
  [560, 260],
  [650, 260],
  [690, 240],
  [730, 280],
  [770, 260],
  [1640, 260],
];

export const WageFlatlineMonitor: React.FC<WageFlatlineMonitorProps> = ({
  startSec,
  endSec,
  bgVideoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  const seqFrom = Math.max(0, Math.floor(startSec * fps));
  const seqDur = Math.max(2, Math.ceil((endSec - startSec) * fps) + 2);

  const sweepProg = interpolate(sec, [startSec + 0.08, endSec - 0.35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const flatHit = sweepProg > 0.48;
  const cursorX = sweepProg * 1640;

  const pulseD = PULSE_POINTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');

  return (
    <AbsoluteFill style={{ backgroundColor: '#0A0709', overflow: 'hidden' }}>
      {/* 低透過実写背景 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.34,
          filter: 'contrast(1.22) saturate(0.32) brightness(0.88)',
        }}
      >
        <Sequence from={seqFrom} durationInFrames={seqDur} layout="none">
          <OffthreadVideo
            src={resolveMedia(bgVideoSrc)}
            muted
            startFrom={75}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Sequence>
      </div>

      {/* 危機赤黒グラデーション */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 85% 75% at 50% 45%, rgba(153, 27, 27, 0.28) 0%, rgba(10, 7, 9, 0.92) 78%)',
          pointerEvents: 'none',
        }}
      />

      {/* 上部計器ヘッダー */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: 96,
          right: 96,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid rgba(239, 68, 68, 0.4)',
          paddingBottom: 12,
          zIndex: 12,
        }}
      >
        <span
          style={{
            fontFamily: FONT_ECON_MONO,
            fontSize: 20,
            fontWeight: 900,
            color: '#FCA5A5',
            letterSpacing: '0.12em',
          }}
        >
          FALLACY OF COMPOSITION // 合成の誤謬
        </span>
        <span
          style={{
            backgroundColor: flatHit ? '#CC0000' : '#1E293B',
            color: '#FFFFFF',
            fontFamily: FONT_ECON_MONO,
            fontSize: 22,
            fontWeight: 900,
            padding: '6px 18px',
            border: '2px solid #EF4444',
          }}
        >
          REAL WAGE GROWTH: 0.0%
        </span>
      </div>

      {/* 心電図風フラットラインモニター（top: 136px, bottom: 180px） */}
      <div
        style={{
          position: 'absolute',
          top: 136,
          left: 96,
          right: 96,
          bottom: 180,
          backgroundColor: 'rgba(12, 10, 14, 0.76)',
          border: '2px solid rgba(239, 68, 68, 0.35)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '18px 28px',
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 1640 460" aria-hidden="true">
          <defs>
            <clipPath id="flatline-sweep-clip">
              <rect x={0} y={0} width={Math.max(8, cursorX)} height={460} />
            </clipPath>
            <linearGradient id="flatline-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22C55E" />
              <stop offset="36%" stopColor="#F59E0B" />
              <stop offset="50%" stopColor="#EF4444" />
              <stop offset="100%" stopColor="#EF4444" />
            </linearGradient>
          </defs>

          {/* 計測グリッド */}
          {[80, 170, 260, 350].map((gy) => (
            <line
              key={`fg-${gy}`}
              x1={0}
              y1={gy}
              x2={1640}
              y2={gy}
              stroke="rgba(148, 163, 184, 0.14)"
              strokeDasharray="6 6"
            />
          ))}
          <text x={24} y={64} fill="#22C55E" fontFamily={FONT_ECON_MONO} fontSize={18} fontWeight={800}>
            1990s前半：賃金成長パルス
          </text>
          <g>
            <rect
              x={920}
              y={184}
              width={560}
              height={46}
              rx={5}
              fill="rgba(127, 29, 29, 0.85)"
              stroke="#EF4444"
              strokeWidth={2}
            />
            <text
              x={1200}
              y={214}
              textAnchor="middle"
              fill="#FEE2E2"
              fontFamily={FONT_ECON_SANS}
              fontSize={22}
              fontWeight={900}
            >
              30年間 実質賃金フラットライン（±0%）
            </text>
          </g>
          {[
            { x: 120, yr: '1995' },
            { x: 580, yr: '2005' },
            { x: 1080, yr: '2015' },
            { x: 1560, yr: '2025' },
          ].map((tk) => (
            <text
              key={tk.yr}
              x={tk.x}
              y={420}
              textAnchor="middle"
              fill="#94A3B8"
              fontFamily={FONT_ECON_MONO}
              fontSize={16}
              fontWeight={800}
            >
              {tk.yr}
            </text>
          ))}

          <g clipPath="url(#flatline-sweep-clip)">
            <path
              d={pulseD}
              fill="none"
              stroke="url(#flatline-stroke)"
              strokeWidth={7}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>

          <circle
            cx={Math.min(1632, Math.max(8, cursorX))}
            cy={260}
            r={10}
            fill="#FFFFFF"
            stroke={flatHit ? '#EF4444' : '#22C55E'}
            strokeWidth={5}
          />
        </svg>
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================================
 * 4. BojLiquidityProjectorStage (Shot 8-A: 暗室プロジェクター・日銀緩和遮断壁)
 * ============================================================================ */
export interface BojLiquidityProjectorStageProps {
  startSec: number;
  endSec: number;
}

/** 3次ベジェ曲線上の座標 (t in 0..1) */
function cubicPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return [
    mt2 * mt * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t2 * t * p3[0],
    mt2 * mt * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t2 * t * p3[1],
  ];
}

export const BojLiquidityProjectorStage: React.FC<BojLiquidityProjectorStageProps> = ({
  startSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const localSec = Math.max(0, sec - startSec);
  const localFrame = Math.max(0, frame - Math.round(startSec * fps));

  const screenSpr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 360, damping: 26, mass: 0.7 },
  });

  const moneyPct = interpolate(localSec, [0.25, 2.2], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const wallSpr = spring({
    frame: Math.max(0, frame - Math.round((startSec + 1.0) * fps)),
    fps,
    config: { stiffness: 460, damping: 20, mass: 0.6 },
  });

  const targets = [
    { id: 'bank', label: '銀行準備預金', y: 210, sub: '超過準備へ滞留' },
    { id: 'bond', label: '国債市場', y: 380, sub: '金融機関の買入' },
    { id: 'corp', label: '企業内部留保', y: 550, sub: '防衛的キャッシュ' },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#0A0C10', overflow: 'hidden' }}>
      {/* 暗室空間＆投射光コーン */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="boj-proj-glow" cx="50%" cy="44%" r="58%">
            <stop offset="0%" stopColor="rgba(34, 197, 94, 0.14)" />
            <stop offset="60%" stopColor="rgba(14, 16, 20, 0.55)" />
            <stop offset="100%" stopColor="rgba(6, 8, 12, 0.98)" />
          </radialGradient>
          <linearGradient id="boj-proj-cone" x1="0.5" y1="1" x2="0.5" y2="0">
            <stop offset="0%" stopColor="rgba(241, 245, 249, 0.20)" />
            <stop offset="100%" stopColor="rgba(241, 245, 249, 0.01)" />
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#boj-proj-glow)" />
        <polygon points="895,1050 1025,1050 1740,860 180,860" fill="url(#boj-proj-cone)" />
      </svg>

      {/* 物理プロジェクターロールスクリーン (bottom: 174px で字幕非衝突) */}
      <div
        style={{
          position: 'absolute',
          left: 120,
          right: 120,
          top: 34,
          bottom: 174,
          backgroundColor: '#F3F4F6',
          borderRadius: 6,
          boxShadow: '0 28px 80px rgba(0, 0, 0, 0.85), 0 0 90px rgba(255,255,255,0.10)',
          overflow: 'hidden',
          zIndex: 6,
          transform: `scale(${interpolate(screenSpr, [0, 1], [0.97, 1.0])})`,
        }}
      >
        <div
          style={{
            height: 20,
            background: 'linear-gradient(180deg, #334155 0%, #1E293B 100%)',
            borderBottom: '2px solid #0F172A',
          }}
        />

        <svg width="100%" height="calc(100% - 20px)" viewBox="0 0 1560 760" aria-hidden="true">
          {/* スクリーンヘッダー */}
          <text
            x={780}
            y={54}
            textAnchor="middle"
            fill="#0F172A"
            fontFamily={FONT_ECON_SERIF}
            fontSize={34}
            fontWeight={900}
          >
            異次元緩和マネーはなぜ「家計の給料」へ届かないのか？
          </text>
          <text
            x={780}
            y={86}
            textAnchor="middle"
            fill="#475569"
            fontFamily={FONT_ECON_MONO}
            fontSize={16}
            fontWeight={800}
            letterSpacing="0.14em"
          >
            MONETARY INJECTION VS PRICE RIGIDITY BARRIER
          </text>

          {/* 緑パイプ（日銀 → 銀行/国債/企業留保） */}
          {targets.map((t, idx) => (
            <g key={t.id}>
              <path
                d={`M 270 380 C 420 380, 440 ${t.y}, 600 ${t.y}`}
                fill="none"
                stroke="#1E8E3E"
                strokeWidth={9}
                strokeDasharray="600"
                strokeDashoffset={600 * (1 - moneyPct)}
              />
              {/* 流れる緑マネー粒子（3次ベジェ曲線上に正確追従） */}
              {[0, 1].map((pIdx) => {
                const prog = (localSec * 0.8 + pIdx * 0.5 + idx * 0.2) % 1;
                const [px, py] = cubicPoint([270, 380], [420, 380], [440, t.y], [600, t.y], prog);
                return moneyPct > 0.2 ? (
                  <circle key={`${t.id}-pt-${pIdx}`} cx={px} cy={py} r={8} fill="#4ADE80" stroke="#0F5132" strokeWidth={2.5} />
                ) : null;
              })}
              {/* 中間セクターノード */}
              <rect
                x={600}
                y={t.y - 46}
                width={250}
                height={92}
                rx={6}
                fill="#FFFFFF"
                stroke="#1E8E3E"
                strokeWidth={3}
              />
              <text x={725} y={t.y - 4} textAnchor="middle" fill="#0F172A" fontFamily={FONT_ECON_SANS} fontSize={23} fontWeight={900}>
                {t.label}
              </text>
              <text x={725} y={t.y + 26} textAnchor="middle" fill="#475569" fontFamily={FONT_ECON_SANS} fontSize={16} fontWeight={700}>
                {t.sub}
              </text>
              {/* 壁へ向かうが跳ね返る矢印 */}
              <line x1={850} y1={t.y} x2={976} y2={t.y} stroke="#1E8E3E" strokeWidth={5} strokeDasharray="8 6" />
              <path
                d={`M 976 ${t.y} Q 930 ${t.y - 32} 892 ${t.y - 16}`}
                fill="none"
                stroke="#CC0000"
                strokeWidth={4}
              />
              <polygon points={`888,${t.y - 16} 902,${t.y - 24} 900,${t.y - 8}`} fill="#CC0000" />
            </g>
          ))}

          {/* 左：中央銀行 / 日銀 メダル＋供給メーター */}
          <g>
            <circle cx={200} cy={380} r={96} fill="#1E8E3E" stroke="#0F172A" strokeWidth={5} />
            <circle cx={200} cy={380} r={84} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
            <text x={200} y={366} textAnchor="middle" fill="#FFFFFF" fontFamily={FONT_ECON_SERIF} fontSize={44} fontWeight={900}>
              ¥
            </text>
            <text x={200} y={406} textAnchor="middle" fill="#FFFFFF" fontFamily={FONT_ECON_SANS} fontSize={23} fontWeight={900}>
              中央銀行
            </text>
            <rect x={92} y={502} width={216} height={58} rx={6} fill="#0F172A" />
            <text x={200} y={539} textAnchor="middle" fill="#4ADE80" fontFamily={FONT_ECON_MONO} fontSize={24} fontWeight={900}>
              +{Math.round(500 * moneyPct)}兆円
            </text>
          </g>

          {/* 真っ赤な「価格硬直性の壁 (DEFLATION WALL)」 */}
          <g opacity={wallSpr} transform={`translate(1005, 380) scale(1, ${wallSpr}) translate(-1005, -380)`}>
            <rect x={985} y={142} width={44} height={476} rx={4} fill="#CC0000" stroke="#7F1D1D" strokeWidth={3} />
            <text
              x={1007}
              y={380}
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily={FONT_ECON_SANS}
              fontSize={22}
              fontWeight={900}
              transform="rotate(-90 1007 380)"
            >
              価格硬直性の壁 (BLOCKED)
            </text>
          </g>

          {/* 右：家計の給料（実質賃金）遮断ボックス */}
          <g>
            <rect
              x={1130}
              y={260}
              width={320}
              height={240}
              rx={8}
              fill="#E2E8F0"
              stroke="#64748B"
              strokeWidth={3}
              strokeDasharray="10 6"
            />
            <text x={1290} y={346} textAnchor="middle" fill="#1E293B" fontFamily={FONT_ECON_SANS} fontSize={28} fontWeight={900}>
              家計の給料
            </text>
            <text x={1290} y={384} textAnchor="middle" fill="#475569" fontFamily={FONT_ECON_SANS} fontSize={20} fontWeight={800}>
              （実質賃金・個人消費）
            </text>
            <rect x={1168} y={412} width={244} height={48} rx={4} fill="#FEF2F2" stroke="#CC0000" strokeWidth={2.5} />
            <text x={1290} y={444} textAnchor="middle" fill="#CC0000" fontFamily={FONT_ECON_SANS} fontSize={21} fontWeight={900}>
              ✕ 賃金へ届かない
            </text>
          </g>
        </svg>
      </div>

      {/* 手前下部プロジェクター筐体（字幕保護のため控えめ輝度） */}
      <svg
        width="220"
        height="58"
        viewBox="0 0 220 58"
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
        <rect x={36} y={18} width={148} height={40} rx={6} fill="#161B22" stroke="#334155" strokeWidth={2} />
        <circle cx={110} cy={34} r={14} fill="#0B0F14" stroke="#64748B" strokeWidth={2} />
        <circle cx={110} cy={34} r={7} fill="#94A3B8" opacity={0.35} />
      </svg>
    </AbsoluteFill>
  );
};

/* ============================================================================
 * 5. JapanWorldDivergenceMap (Shot 8-C: 実測188ヶ国世界地図オープンループ)
 *    - 日本 (jp) から欧米OECD諸国へ弧線が伸び、OECDは緑、日本のみ赤パルスで孤立を強調
 * ============================================================================ */
export interface JapanWorldDivergenceMapProps {
  startSec: number;
  endSec: number;
}

const OECD_TARGETS: readonly string[] = [
  'us',
  'ca',
  'gb',
  'de',
  'fr',
  'nl',
  'se',
  'ch',
  'it',
  'es',
  'au',
  'nz',
  'kr',
  'no',
  'dk',
  'fi',
  'at',
  'be',
  'ie',
];

export const JapanWorldDivergenceMap: React.FC<JapanWorldDivergenceMapProps> = ({
  startSec,
  endSec,
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

  const jp = countryById.get('jp') ?? { id: 'jp', d: '', cx: 829.2, cy: 133.1 };
  const startX = jp.cx;
  const startY = jp.cy;

  // 日本中心ズームイン (2.35x) から世界全体 (1.0x) へ滑らかにズームアウト
  const zoomRaw = interpolate(localSec, [0.25, Math.min(2.85, dur * 0.78)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const easeOut = 1 - Math.pow(1 - zoomRaw, 3);
  const scale = interpolate(easeOut, [0, 1], [2.35, 1.0]);
  const panX = interpolate(easeOut, [0, 1], [-520, 0]);
  const panY = interpolate(easeOut, [0, 1], [140, 0]);

  const targetProgressMap = new Map<string, number>();
  OECD_TARGETS.forEach((iso, idx) => {
    const arcStart = 0.22 + idx * 0.085;
    const arcEnd = arcStart + 0.62;
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

      {/* 実世界地図コンテナ */}
      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          top: 64,
          bottom: 136,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translate(${panX.toFixed(1)}px, ${panY.toFixed(1)}px) scale(${scale.toFixed(4)})`,
          transformOrigin: 'center center',
        }}
      >
        <svg width="100%" height="100%" viewBox={WORLD_MAP_VIEWBOX} aria-hidden="true">
          {WORLD_COUNTRIES.map((c) => {
            const prog = targetProgressMap.get(c.id);
            const isJp = c.id === 'jp';
            const lit = prog !== undefined && prog >= 0.85;
            const partial = prog !== undefined && prog > 0.4 && prog < 0.85;
            const fill = isJp ? '#DC2626' : lit ? '#22C55E' : partial ? '#86EFAC' : '#D1D5DB';
            return (
              <path
                key={`wm-${c.id}`}
                d={c.d}
                fill={fill}
                stroke="#FFFFFF"
                strokeWidth={0.75}
              />
            );
          })}

          {/* 日本から主要OECD諸国への比較弧線 */}
          {OECD_TARGETS.map((iso, idx) => {
            const target = countryById.get(iso);
            if (!target) return null;
            const prog = targetProgressMap.get(iso) ?? 0;
            if (prog <= 0.01) return null;

            const tx = target.cx;
            const ty = target.cy;
            const mx = (startX + tx) / 2;
            const archLift = 38 + (idx % 4) * 22;
            const my = Math.min(startY, ty) - archLift;
            const pathD = `M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
            const dashTotal = 1200;

            return (
              <g key={`arc-${iso}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke="#111827"
                  strokeWidth={1.65}
                  strokeLinecap="round"
                  strokeDasharray={dashTotal}
                  strokeDashoffset={dashTotal * (1 - prog)}
                  opacity={0.82}
                />
                {prog >= 0.9 ? <circle cx={tx} cy={ty} r={3.4} fill="#15803D" /> : null}
              </g>
            );
          })}

          {/* 日本の孤立赤パルスリング */}
          <circle cx={startX} cy={startY} r={5.5} fill="#DC2626" />
          <circle
            cx={startX}
            cy={startY}
            r={10 + Math.sin(localSec * 6.5) * 3.5}
            fill="none"
            stroke="#DC2626"
            strokeWidth={2.4}
            opacity={0.85}
          />
        </svg>
      </div>

      {/* 左上凡例＋右上オープンループ予告ラベル（90%セーフゾーン内側） */}
      <div
        style={{
          position: 'absolute',
          top: 54,
          left: 96,
          right: 96,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 18,
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            border: '1px solid #CBD5E1',
            padding: '6px 16px',
            borderRadius: 4,
            fontFamily: FONT_ECON_SANS,
            fontSize: 16,
            fontWeight: 800,
            color: '#0F172A',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 13, height: 13, backgroundColor: '#22C55E', display: 'inline-block' }} />
            主要OECD：実質賃金成長
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#CC0000' }}>
            <span style={{ width: 13, height: 13, backgroundColor: '#DC2626', display: 'inline-block' }} />
            日本：30年停滞
          </span>
        </div>

        <div
          style={{
            backgroundColor: '#0F172A',
            borderLeft: '5px solid #DC2626',
            color: '#F8FAFC',
            fontFamily: FONT_ECON_MONO,
            fontSize: 17,
            fontWeight: 900,
            padding: '8px 18px',
            letterSpacing: '0.06em',
            boxShadow: '0 10px 24px rgba(15, 23, 42, 0.22)',
          }}
        >
          NEXT // デフレ均衡の隠れた仕組みを解剖
        </div>
      </div>
    </AbsoluteFill>
  );
};
