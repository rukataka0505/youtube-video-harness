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
  WORLD_MAP_HEIGHT,
  WORLD_MAP_VIEWBOX,
  WORLD_MAP_WIDTH,
} from '../../../../components/plan_e';

function resolveMedia(src: string): string {
  if (/^(https?:\/\/|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

/* ============================================================================
 * 1. Sub 2B: 日本経済・CNN風 報道速報UI（米国ハードコード排除・右ペイン実写キャスター）
 * ========================================================================== */
const SHOCK_CHART_PTS: readonly [number, number][] = [
  [0, 56],
  [48, 60],
  [95, 50],
  [145, 76],
  [195, 68],
  [245, 118],
  [295, 110],
  [345, 168],
  [395, 154],
  [450, 214],
  [500, 206],
  [555, 258],
  [615, 248],
  [675, 308],
];

export interface JapanBreakingNewsStageProps {
  startSec: number;
  endSec: number;
  anchorVideoSrc: string;
}

export const JapanBreakingNewsStage: React.FC<JapanBreakingNewsStageProps> = ({
  startSec,
  endSec,
  anchorVideoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  const prog = interpolate(sec, [startSec, Math.min(endSec - 0.2, startSec + 2.2)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const liveVal = interpolate(prog, [0, 1], [28450.2, 23890.4]);
  const formattedVal = liveVal.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const blinkOn = Math.floor(sec * 3) % 2 === 0;
  const seqFrom = Math.max(0, Math.floor(startSec * fps));
  const seqDur = Math.max(2, Math.ceil((endSec - startSec) * fps) + 4);
  const tickerOffset = ((sec - startSec) * 215) % 1800;

  const polyD = SHOCK_CHART_PTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const areaD = `${polyD} L 675 340 L 0 340 Z`;
  const lastIdx = Math.max(
    1,
    Math.min(SHOCK_CHART_PTS.length - 1, Math.floor(prog * (SHOCK_CHART_PTS.length - 1))),
  );
  const dotPt = SHOCK_CHART_PTS[lastIdx];

  const tickerItems = [
    '増税2倍案：全国で抗議デモ拡大',
    '大企業解体シナリオ：設備投資が即時凍結',
    'MARKET SENTIMENT  -16.0%',
    'POLITICAL BACKLASH: APPROVAL COLLAPSE',
    '極端な破壊策は翌日に即頓挫',
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#120406', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 28% 36%, rgba(185, 28, 28, 0.34) 0%, rgba(18, 4, 6, 0.98) 72%)',
        }}
      />

      {/* 上部 報道局LIVEヘッダー（セーフゾーン内側） */}
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 96,
          right: 96,
          height: 52,
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
            TOKYO ECONOMIC DESK
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
          POLICY SHOCK // SIMULATION
        </span>
      </div>

      {/* メイン2ペイン（左56% 急落チャート / 右44% 実写報道スタジオ） */}
      <div
        style={{
          position: 'absolute',
          top: 116,
          left: 96,
          right: 96,
          bottom: 266,
          display: 'grid',
          gridTemplateColumns: '1.26fr 1fr',
          gap: 18,
          zIndex: 8,
        }}
      >
        {/* 左ペイン */}
        <div
          style={{
            backgroundColor: 'rgba(22, 6, 9, 0.94)',
            border: '2px solid rgba(220, 38, 38, 0.6)',
            padding: '22px 26px',
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
                MARKET SENTIMENT
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
                ▼ -16.0%
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 6 }}>
              <span
                style={{
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 58,
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
                  fontSize: 30,
                  fontWeight: 900,
                  color: '#EF4444',
                }}
              >
                -4,559.8
              </span>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, marginTop: 12 }}>
            <svg width="100%" height="100%" viewBox="0 0 680 340" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <clipPath id={`jp-news-clip-${startSec.toFixed(1)}`}>
                  <rect x={0} y={0} width={Math.max(12, prog * 680)} height={340} />
                </clipPath>
                <linearGradient id={`jp-news-fill-${startSec.toFixed(1)}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity={0.48} />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity={0.03} />
                </linearGradient>
              </defs>

              {[65, 135, 205, 275].map((gy) => (
                <line
                  key={`g-${gy}`}
                  x1={0}
                  y1={gy}
                  x2={680}
                  y2={gy}
                  stroke="rgba(248, 113, 113, 0.18)"
                  strokeDasharray="6 6"
                  strokeWidth={1.2}
                />
              ))}
              <line x1={0} y1={56} x2={680} y2={56} stroke="rgba(255,255,255,0.42)" strokeWidth={1.5} />
              <text x={8} y={42} fill="#CBD5E1" fontFamily={FONT_ECON_MONO} fontSize={14} fontWeight={700}>
                BEFORE TAX SHOCK: 28,450.2
              </text>

              <g clipPath={`url(#jp-news-clip-${startSec.toFixed(1)})`}>
                <path d={areaD} fill={`url(#jp-news-fill-${startSec.toFixed(1)})`} />
                <path d={polyD} fill="none" stroke="#EF4444" strokeWidth={6} strokeLinejoin="round" />
              </g>

              <circle cx={dotPt[0]} cy={dotPt[1]} r={9} fill="#FFFFFF" stroke="#CC0000" strokeWidth={5} />
            </svg>
          </div>
        </div>

        {/* 右ペイン：実写報道スタジオ */}
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
              background: 'linear-gradient(180deg, transparent 58%, rgba(0,0,0,0.68) 100%)',
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
            NEWS STUDIO // LIVE
          </div>
        </div>
      </div>

      {/* 下部速報見出し＆ティッカー（CleanSubtitle と絶対衝突しない bottom: 146px） */}
      <div
        style={{
          position: 'absolute',
          left: 96,
          right: 96,
          bottom: 146,
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
            増税2倍・大企業解体案に猛反発 — 計画は翌日で頓挫
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
 * 2. Sub 2C: 実写Bロール＋進行役アバター＋「派手な作戦 → 即・失敗」却下スタンプ
 * ========================================================================== */
export interface RejectedPlanBrollStageProps {
  startSec: number;
  endSec: number;
  backgroundVideoSrc: string;
  stampSec?: number;
}

export const RejectedPlanBrollStage: React.FC<RejectedPlanBrollStageProps> = ({
  startSec,
  endSec,
  backgroundVideoSrc,
  stampSec = startSec + 1.05,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const localFrame = Math.max(0, frame - Math.round(startSec * fps));
  const dur = Math.max(0.2, endSec - startSec);
  const seqFrom = Math.max(0, Math.floor(startSec * fps));
  const seqDur = Math.max(2, Math.ceil(dur * fps) + 4);

  const enterSpr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 380, damping: 24, mass: 0.7 },
  });

  const stamped = sec >= stampSec;
  const stampFrame = Math.max(0, frame - Math.round(stampSec * fps));
  const stampSpr = spring({
    frame: stampFrame,
    fps,
    config: { stiffness: 520, damping: 18, mass: 0.55 },
  });

  const shakeX =
    stamped && sec < stampSec + 0.25
      ? Math.sin((sec - stampSec) * 90) * 10 * (1 - (sec - stampSec) / 0.25)
      : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0A0D12',
        overflow: 'hidden',
        transform: `translateX(${shakeX.toFixed(1)}px)`,
      }}
    >
      {/* 背景フルブリード実写動画 */}
      <Sequence from={seqFrom} durationInFrames={seqDur} layout="none">
        <OffthreadVideo
          src={resolveMedia(backgroundVideoSrc)}
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'contrast(1.14) saturate(0.55) brightness(0.74)',
            transform: `scale(${interpolate(sec, [startSec, endSec], [1.02, 1.08], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }).toFixed(4)})`,
          }}
        />
      </Sequence>

      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(8,10,14,0.22) 0%, transparent 35%, rgba(8,10,14,0.72) 100%)',
        }}
      />

      {/* 左手前：進行役アバター */}
      <div
        style={{
          position: 'absolute',
          left: 140,
          bottom: 46,
          zIndex: 14,
          transform: `translateX(${interpolate(enterSpr, [0, 1], [-120, 0]).toFixed(1)}px)`,
          opacity: enterSpr,
        }}
      >
        <EconHostAvatar pose={stamped ? 'open_hands' : 'point_up'} emblem="¥?" scale={1.18} />
      </div>

      {/* 右側：紙面作戦メモ＋特大「即・失敗」スタンプ */}
      <div
        style={{
          position: 'absolute',
          right: 140,
          top: 120,
          width: 880,
          backgroundColor: '#F6F2E9',
          color: '#111827',
          borderTop: '12px solid #1E293B',
          boxShadow: '0 28px 64px rgba(0, 0, 0, 0.62)',
          padding: '32px 42px 44px 42px',
          transform: `rotate(-1.4deg) translateY(${interpolate(enterSpr, [0, 1], [-36, 0]).toFixed(1)}px)`,
          opacity: enterSpr,
          zIndex: 12,
        }}
      >
        <div
          style={{
            fontFamily: FONT_ECON_MONO,
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: '0.14em',
            color: '#64748B',
            borderBottom: '2px solid #1E293B',
            paddingBottom: 10,
            marginBottom: 22,
          }}
        >
          DRAFT MEMO // DIRECT DESTRUCTION PLAN
        </div>

        <div
          style={{
            fontFamily: FONT_ECON_SERIF,
            fontSize: 40,
            fontWeight: 900,
            lineHeight: 1.35,
            color: '#0F172A',
            paddingRight: 290,
          }}
        >
          <div>× 税金を一気に2倍へ</div>
          <div style={{ marginTop: 14 }}>× 大企業を次々と解体</div>
        </div>

        <div
          style={{
            marginTop: 28,
            fontFamily: FONT_ECON_SANS,
            fontSize: 21,
            fontWeight: 700,
            color: '#475569',
          }}
        >
          結果：国民・市場の猛反発により24時間以内に強制終了
        </div>

        {/* 赤スタンプ「即・失敗」（右側余白にクリーン配置） */}
        {stamped ? (
          <div
            style={{
              position: 'absolute',
              right: 34,
              top: 108,
              transform: `rotate(-10deg) scale(${interpolate(stampSpr, [0, 1], [1.85, 1.0]).toFixed(3)})`,
              opacity: stampSpr,
              border: '8px solid #CC0000',
              backgroundColor: 'rgba(255, 255, 255, 0.96)',
              color: '#CC0000',
              padding: '12px 26px',
              boxShadow: '0 12px 32px rgba(204, 0, 0, 0.35)',
            }}
          >
            <div
              style={{
                fontFamily: FONT_ECON_SANS,
                fontSize: 48,
                fontWeight: 900,
                letterSpacing: '0.08em',
                lineHeight: 1.05,
              }}
            >
              即・失敗
            </div>
            <div
              style={{
                fontFamily: FONT_ECON_MONO,
                fontSize: 17,
                fontWeight: 900,
                letterSpacing: '0.16em',
                textAlign: 'center',
                marginTop: 4,
              }}
            >
              REJECTED DAY 1
            </div>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================================
 * 3. Sub 3C: 実写Bロール＋風刺「激安値札POP」ポップイン演出
 * ========================================================================== */
export interface DiscountTagBrollStageProps {
  startSec: number;
  endSec: number;
  backgroundVideoSrc: string;
}

export const DiscountTagBrollStage: React.FC<DiscountTagBrollStageProps> = ({
  startSec,
  endSec,
  backgroundVideoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const dur = Math.max(0.2, endSec - startSec);
  const seqFrom = Math.max(0, Math.floor(startSec * fps));
  const seqDur = Math.max(2, Math.ceil(dur * fps) + 4);

  const tags = [
    {
      id: 'sale1',
      offsetSec: 0.15,
      left: 165,
      top: 138,
      rotate: -9,
      bg: '#FACC15',
      border: '#CC0000',
      ink: '#991B1B',
      topLabel: 'PRICE CUT',
      mainText: '値下げ -15%',
    },
    {
      id: 'sale2',
      offsetSec: 0.85,
      left: 720,
      top: 112,
      rotate: 5,
      bg: '#FFFFFF',
      border: '#CC0000',
      ink: '#CC0000',
      topLabel: 'ALL YEAR',
      mainText: 'お値段 据え置き',
    },
    {
      id: 'sale3',
      offsetSec: 1.55,
      left: 420,
      top: 365,
      rotate: -4,
      bg: '#CC0000',
      border: '#FDE047',
      ink: '#FFFFFF',
      topLabel: 'DEFLATION ILLUSION',
      mainText: '激安・お得！',
    },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#0A0D12', overflow: 'hidden' }}>
      <Sequence from={seqFrom} durationInFrames={seqDur} layout="none">
        <OffthreadVideo
          src={resolveMedia(backgroundVideoSrc)}
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'contrast(1.06) saturate(1.08) brightness(0.90)',
            transform: `scale(${interpolate(sec, [startSec, endSec], [1.08, 1.01], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }).toFixed(4)})`,
          }}
        />
      </Sequence>

      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(8,10,14,0.16) 0%, transparent 45%, rgba(8,10,14,0.72) 100%)',
        }}
      />

      {/* 値下げ・激安の値札POP3種 */}
      {tags.map((t) => {
        const revAt = startSec + t.offsetSec;
        if (sec < revAt) return null;
        const lf = Math.max(0, frame - Math.round(revAt * fps));
        const pop = spring({
          frame: lf,
          fps,
          config: { stiffness: 520, damping: 16, mass: 0.55 },
        });
        const bob = Math.sin((sec - revAt) * 3.2) * 4;
        return (
          <div
            key={t.id}
            style={{
              position: 'absolute',
              left: t.left,
              top: t.top + bob,
              transform: `rotate(${t.rotate}deg) scale(${pop.toFixed(3)})`,
              backgroundColor: t.bg,
              border: `6px solid ${t.border}`,
              padding: '16px 34px',
              boxShadow: '0 22px 46px rgba(0, 0, 0, 0.48)',
              zIndex: 12,
            }}
          >
            <div
              style={{
                fontFamily: FONT_ECON_MONO,
                fontSize: 15,
                fontWeight: 900,
                letterSpacing: '0.16em',
                color: t.ink,
                opacity: 0.85,
              }}
            >
              {t.topLabel}
            </div>
            <div
              style={{
                fontFamily: FONT_ECON_SANS,
                fontSize: 52,
                fontWeight: 900,
                color: t.ink,
                lineHeight: 1.15,
                marginTop: 2,
              }}
            >
              {t.mainText}
            </div>
          </div>
        );
      })}

      {/* 右端手前：進行役アバター（tented_handsは対称ポーズのためflipX不要） */}
      <div
        style={{
          position: 'absolute',
          right: 110,
          bottom: 42,
          zIndex: 16,
        }}
      >
        <EconHostAvatar pose="tented_hands" emblem="¥?" scale={1.06} />
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================================
 * 4. Sub 4B: 物理オーク木枠ホワイトボード（30年間の実質賃金国際比較グラフ＋指示棒アバター）
 * ========================================================================== */
const WAGE_YEARS = ['1995', '2000', '2005', '2010', '2015', '2020', '2024'] as const;
const US_WAGE = [100, 112, 119, 124, 132, 144, 148] as const;
const EU_WAGE = [100, 108, 115, 121, 126, 131, 134] as const;
const JP_WAGE = [100, 102, 100, 99, 99, 101, 102] as const;

export interface WageWhiteboardStageProps {
  startSec: number;
  endSec: number;
  japanHighlightSec?: number;
}

export const WageWhiteboardStage: React.FC<WageWhiteboardStageProps> = ({
  startSec,
  endSec,
  japanHighlightSec = 39.04,
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

  const drawProg = interpolate(sec, [startSec + 0.2, Math.min(endSec - 0.8, startSec + 2.6)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const jpHighlight = sec >= japanHighlightSec;
  const jpBadgeSpr = spring({
    frame: Math.max(0, frame - Math.round(japanHighlightSec * fps)),
    fps,
    config: { stiffness: 460, damping: 20, mass: 0.6 },
  });

  // SVG 座標変換（viewBox 0 0 1120 450）
  const xStart = 88;
  const xEnd = 900;
  const yTop = 50;
  const yBottom = 385;
  const minVal = 90;
  const maxVal = 155;

  const toX = (i: number) => xStart + (i / (WAGE_YEARS.length - 1)) * (xEnd - xStart);
  const toY = (v: number) => yBottom - ((v - minVal) / (maxVal - minVal)) * (yBottom - yTop);

  const buildPath = (vals: readonly number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');

  return (
    <AbsoluteFill style={{ backgroundColor: '#DDE2E8', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 90% 85% at 50% 44%, #EDF0F4 0%, #CFD6DF 72%, #B8C1CE 100%)',
        }}
      />

      {/* 物理オーク木枠ホワイトボード */}
      <div
        style={{
          position: 'absolute',
          left: 86,
          right: 86,
          top: 32,
          bottom: 184,
          padding: 18,
          borderRadius: 10,
          background: 'linear-gradient(145deg, #B47B44 0%, #8C5828 52%, #70421B 100%)',
          boxShadow: '0 26px 56px rgba(15, 23, 42, 0.34), inset 0 2px 3px rgba(255,255,255,0.28)',
          transform: `scale(${interpolate(boardSpr, [0, 1], [0.97, 1.0]).toFixed(4)})`,
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
            padding: '24px 36px 22px 36px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(125deg, rgba(255,255,255,0.52) 0%, transparent 38%, transparent 100%)',
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              paddingLeft: 245,
            }}
          >
            {/* 盤面ヘッダー */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div
                  style={{
                    fontFamily: FONT_ECON_SERIF,
                    fontSize: 34,
                    fontWeight: 900,
                    color: '#0F172A',
                  }}
                >
                  過去30年間の実質賃金推移（1995年＝100）
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
                  欧米が大きく伸びる一方、日本だけが30年間ほぼ水平線
                </div>
              </div>

              {jpHighlight ? (
                <div
                  style={{
                    backgroundColor: '#CC0000',
                    color: '#FFFFFF',
                    fontFamily: FONT_ECON_SANS,
                    fontSize: 22,
                    fontWeight: 900,
                    padding: '8px 18px',
                    borderRadius: 6,
                    transform: `scale(${jpBadgeSpr.toFixed(3)})`,
                    boxShadow: '0 8px 20px rgba(204, 0, 0, 0.28)',
                  }}
                >
                  日本：30年間 ほぼ横ばい
                </div>
              ) : null}
            </div>

            {/* 折れ線グラフSVG */}
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 1120 440"
              style={{ marginTop: 8, flex: 1, minHeight: 0 }}
              aria-hidden="true"
            >
              <defs>
                <clipPath id="wage-chart-clip">
                  <rect
                    x={xStart - 10}
                    y={0}
                    width={Math.max(10, drawProg * (xEnd - xStart + 250))}
                    height={440}
                  />
                </clipPath>
              </defs>

              {/* 横グリッド */}
              {[100, 115, 130, 145].map((v) => {
                const gy = toY(v);
                return (
                  <g key={`wy-${v}`}>
                    <line
                      x1={xStart}
                      y1={gy}
                      x2={xEnd}
                      y2={gy}
                      stroke={v === 100 ? '#64748B' : '#CBD5E1'}
                      strokeWidth={v === 100 ? 2 : 1.3}
                      strokeDasharray={v === 100 ? undefined : '5 5'}
                    />
                    <text
                      x={xStart - 14}
                      y={gy + 6}
                      textAnchor="end"
                      fill="#475569"
                      fontFamily={FONT_ECON_MONO}
                      fontSize={16}
                      fontWeight={800}
                    >
                      {v}
                    </text>
                  </g>
                );
              })}

              {/* X軸 */}
              <line x1={xStart} y1={yBottom} x2={xEnd} y2={yBottom} stroke="#334155" strokeWidth={2.5} />
              {WAGE_YEARS.map((yr, idx) => (
                <text
                  key={yr}
                  x={toX(idx)}
                  y={416}
                  textAnchor="middle"
                  fill="#0F172A"
                  fontFamily={FONT_ECON_MONO}
                  fontSize={17}
                  fontWeight={800}
                >
                  {yr}
                </text>
              ))}

              {/* 日本横ばい強調ハイライト帯 */}
              {jpHighlight ? (
                <rect
                  x={xStart}
                  y={toY(104)}
                  width={xEnd - xStart}
                  height={toY(97) - toY(104)}
                  fill="rgba(204, 0, 0, 0.14)"
                  opacity={jpBadgeSpr}
                />
              ) : null}

              {/* 3系列の折れ線 */}
              <g clipPath="url(#wage-chart-clip)">
                {/* 米国 */}
                <path
                  d={buildPath(US_WAGE)}
                  fill="none"
                  stroke="#0072B2"
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* 欧州 */}
                <path
                  d={buildPath(EU_WAGE)}
                  fill="none"
                  stroke="#1E8E3E"
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* 日本 */}
                <path
                  d={buildPath(JP_WAGE)}
                  fill="none"
                  stroke="#CC0000"
                  strokeWidth={jpHighlight ? 8 : 6.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* 終点ドット＆ラベル */}
                <circle cx={toX(6)} cy={toY(148)} r={8} fill="#0072B2" stroke="#FFFFFF" strokeWidth={3} />
                <text
                  x={xEnd + 16}
                  y={toY(148) + 6}
                  fill="#0072B2"
                  fontFamily={FONT_ECON_SANS}
                  fontSize={22}
                  fontWeight={900}
                >
                  アメリカ  +48%
                </text>

                <circle cx={toX(6)} cy={toY(134)} r={8} fill="#1E8E3E" stroke="#FFFFFF" strokeWidth={3} />
                <text
                  x={xEnd + 16}
                  y={toY(134) + 6}
                  fill="#1E8E3E"
                  fontFamily={FONT_ECON_SANS}
                  fontSize={22}
                  fontWeight={900}
                >
                  ヨーロッパ  +34%
                </text>

                <circle cx={toX(6)} cy={toY(102)} r={9} fill="#CC0000" stroke="#FFFFFF" strokeWidth={3} />
                <text
                  x={xEnd + 16}
                  y={toY(102) + 7}
                  fill="#CC0000"
                  fontFamily={FONT_ECON_SANS}
                  fontSize={24}
                  fontWeight={900}
                >
                  日本  ±0%圏
                </text>
              </g>
            </svg>
          </div>
        </div>

        {/* アルミペントレイ＋マーカー3本＆イレーザー */}
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

      {/* 前景左：指示棒を持つ進行役アバター */}
      <div
        style={{
          position: 'absolute',
          left: 92,
          bottom: 42,
          zIndex: 18,
        }}
      >
        <EconHostAvatar pose="pointer_stick" emblem="¥?" scale={1.06} />
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================================
 * 5. Sub 6B: 実写Bロール＋企業NPC vs 消費者NPC 膠着風刺ステージ
 * ========================================================================== */
export interface DeflationStandoffStageProps {
  startSec: number;
  endSec: number;
  backgroundVideoSrc: string;
}

export const DeflationStandoffStage: React.FC<DeflationStandoffStageProps> = ({
  startSec,
  endSec,
  backgroundVideoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = Math.max(0, frame - Math.round(startSec * fps));
  const dur = Math.max(0.2, endSec - startSec);
  const seqFrom = Math.max(0, Math.floor(startSec * fps));
  const seqDur = Math.max(2, Math.ceil(dur * fps) + 4);

  const enterSpr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 400, damping: 22, mass: 0.65 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0E1218', overflow: 'hidden' }}>
      <Sequence from={seqFrom} durationInFrames={seqDur} layout="none">
        <OffthreadVideo
          src={resolveMedia(backgroundVideoSrc)}
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'contrast(1.08) brightness(0.62) saturate(0.72)',
          }}
        />
      </Sequence>

      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: 'linear-gradient(180deg, rgba(8,10,14,0.34) 0%, transparent 45%, rgba(8,10,14,0.78) 100%)',
        }}
      />

      {/* 上部：凍結膠着バナー */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 96,
          transform: `translateX(-50%) scale(${enterSpr.toFixed(3)})`,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 16,
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          border: '3px solid #D97706',
          padding: '12px 32px',
          boxShadow: '0 18px 42px rgba(0, 0, 0, 0.55)',
          zIndex: 14,
        }}
      >
        <span
          style={{
            fontFamily: FONT_ECON_MONO,
            fontSize: 22,
            fontWeight: 900,
            color: '#F59E0B',
            letterSpacing: '0.12em',
          }}
        >
          DEADLOCK // 相互防衛ロック
        </span>
      </div>

      {/* 左：企業NPC＋本音タグ */}
      <div
        style={{
          position: 'absolute',
          left: 220,
          top: 235,
          transform: `translateX(${interpolate(enterSpr, [0, 1], [-140, 0]).toFixed(1)}px)`,
          backgroundColor: '#FFFBEB',
          borderLeft: '8px solid #CC0000',
          padding: '16px 24px',
          boxShadow: '0 18px 36px rgba(0, 0, 0, 0.48)',
          zIndex: 15,
        }}
      >
        <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 15, fontWeight: 900, color: '#CC0000' }}>
          FIRMS // 企業側
        </div>
        <div style={{ fontFamily: FONT_ECON_SANS, fontSize: 30, fontWeight: 900, color: '#0F172A', marginTop: 4 }}>
          「値上げしたら客が逃げる」
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 340,
          bottom: 52,
          transform: `translateX(${interpolate(enterSpr, [0, 1], [-160, 0]).toFixed(1)}px)`,
          zIndex: 10,
        }}
      >
        <EconHostAvatar isNpc emblem="" pose="handshake_left" scale={1.1} />
      </div>

      {/* 右：消費者NPC＋本音タグ */}
      <div
        style={{
          position: 'absolute',
          right: 220,
          top: 235,
          transform: `translateX(${interpolate(enterSpr, [0, 1], [140, 0]).toFixed(1)}px)`,
          backgroundColor: '#F0F9FF',
          borderRight: '8px solid #0072B2',
          padding: '16px 24px',
          boxShadow: '0 18px 36px rgba(0, 0, 0, 0.48)',
          zIndex: 15,
        }}
      >
        <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 15, fontWeight: 900, color: '#0072B2', textAlign: 'right' }}>
          CONSUMERS // 消費者側
        </div>
        <div style={{ fontFamily: FONT_ECON_SANS, fontSize: 30, fontWeight: 900, color: '#0F172A', marginTop: 4 }}>
          「給料が増えず安い店だけ」
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 340,
          bottom: 52,
          transform: `translateX(${interpolate(enterSpr, [0, 1], [160, 0]).toFixed(1)}px)`,
          zIndex: 10,
        }}
      >
        <EconHostAvatar isNpc flipX emblem="" pose="handshake_right" scale={1.1} />
      </div>

      {/* 中央前景：進行役アバター */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 38,
          transform: `translateX(-50%) translateY(${interpolate(enterSpr, [0, 1], [110, 0]).toFixed(1)}px)`,
          zIndex: 16,
        }}
      >
        <EconHostAvatar pose="tented_hands" emblem="¥?" scale={1.22} />
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================================
 * 6. Sub 7B: 物理ホワイトボード×実測188ヶ国世界地図（欧米上昇 vs 日本停滞）
 * ========================================================================== */
const GROWTH_ISOS = new Set(['us', 'ca', 'gb', 'de', 'fr', 'nl', 'se', 'ch', 'au', 'kr', 'it', 'es']);

export interface JapanWorldMapBoardStageProps {
  startSec: number;
  endSec: number;
}

export const JapanWorldMapBoardStage: React.FC<JapanWorldMapBoardStageProps> = ({ startSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const localFrame = Math.max(0, frame - Math.round(startSec * fps));

  const boardSpr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 360, damping: 26, mass: 0.7 },
  });

  const pins = [
    { id: 'us', label: '米国 +48%', sub: 'WAGE GROWTH', color: '#1E8E3E', xPct: 21, yPct: 58, offset: 0.25 },
    { id: 'eu', label: '欧州 +34%', sub: 'WAGE GROWTH', color: '#0072B2', xPct: 52, yPct: 50, offset: 0.65 },
    { id: 'jp', label: '日本 ±0%', sub: '30 YEARS FLAT', color: '#CC0000', xPct: 84, yPct: 57, offset: 1.15 },
  ];

  const pulseR = 14 + Math.sin((sec - startSec) * 6) * 4;

  return (
    <AbsoluteFill style={{ backgroundColor: '#DDE2E8', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 90% 85% at 50% 44%, #EDF0F4 0%, #CFD6DF 72%, #B8C1CE 100%)',
        }}
      />

      {/* 物理オーク木枠ホワイトボード */}
      <div
        style={{
          position: 'absolute',
          left: 86,
          right: 86,
          top: 32,
          bottom: 184,
          padding: 18,
          borderRadius: 10,
          background: 'linear-gradient(145deg, #B47B44 0%, #8C5828 52%, #70421B 100%)',
          boxShadow: '0 26px 56px rgba(15, 23, 42, 0.34), inset 0 2px 3px rgba(255,255,255,0.28)',
          transform: `scale(${interpolate(boardSpr, [0, 1], [0.97, 1.0]).toFixed(4)})`,
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
            padding: '22px 34px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ paddingLeft: 215, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontFamily: FONT_ECON_SERIF, fontSize: 33, fontWeight: 900, color: '#0F172A' }}>
                合理的な防衛が招いた「日本だけの30年停滞」
              </div>
              <span
                style={{
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 16,
                  fontWeight: 900,
                  color: '#CC0000',
                  border: '2px solid #CC0000',
                  padding: '3px 12px',
                }}
              >
                FALLACY OF COMPOSITION
              </span>
            </div>

            <div style={{ position: 'relative', flex: 1, minHeight: 0, marginTop: 10 }}>
              <svg
                width="100%"
                height="100%"
                viewBox={WORLD_MAP_VIEWBOX}
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
              >
                {WORLD_COUNTRIES.map((c) => {
                  const isJp = c.id === 'jp';
                  const isGrowth = GROWTH_ISOS.has(c.id);
                  return (
                    <path
                      key={`jm-${c.id}`}
                      d={c.d}
                      fill={isJp ? '#CC0000' : isGrowth ? '#2E9E4F' : '#CBD5E1'}
                      stroke="#F8FAFC"
                      strokeWidth={0.8}
                    />
                  );
                })}
                {/* 日本ハイライトリング */}
                <circle cx={829.2} cy={133.1} r={pulseR} fill="none" stroke="#CC0000" strokeWidth={3} opacity={0.85} />
              </svg>

              {pins.map((p) => {
                const revAt = startSec + p.offset;
                if (sec < revAt) return null;
                const lf = Math.max(0, frame - Math.round(revAt * fps));
                const pop = spring({
                  frame: lf,
                  fps,
                  config: { stiffness: 480, damping: 18, mass: 0.6 },
                });
                const isJp = p.id === 'jp';
                return (
                  <div
                    key={p.id}
                    style={{
                      position: 'absolute',
                      left: `${p.xPct}%`,
                      top: `${p.yPct}%`,
                      transform: `translate(-50%, -50%) scale(${pop.toFixed(3)})`,
                      width: isJp ? 196 : 168,
                      height: isJp ? 196 : 168,
                      borderRadius: '50%',
                      backgroundColor: isJp ? '#FEF2F2' : '#FFFFFF',
                      border: `7px solid ${p.color}`,
                      boxShadow: '0 16px 34px rgba(15, 23, 42, 0.25)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT_ECON_SANS,
                        fontSize: isJp ? 30 : 26,
                        fontWeight: 900,
                        color: p.color,
                      }}
                    >
                      {p.label}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_ECON_MONO,
                        fontSize: 12,
                        fontWeight: 800,
                        color: '#475569',
                        marginTop: 5,
                      }}
                    >
                      {p.sub}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* アルミペントレイ */}
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

      {/* 左手前：アバター */}
      <div style={{ position: 'absolute', left: 92, bottom: 42, zIndex: 18 }}>
        <EconHostAvatar pose="point_up" emblem="¥?" scale={1.04} />
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================================
 * 7. Sub 8B: 暗室プロジェクター（日銀・何百兆円マネー供給とデフレ心理の壁）
 * ========================================================================== */
interface BojNode {
  id: string;
  label: string;
  sub: string;
  color: string;
  x: number;
  y: number;
  r: number;
  blocked?: boolean;
  offset: number;
}

const BOJ_NODES: readonly BojNode[] = [
  // 内側：マネーが届く金融・貯蓄領域（右側破線通路 y:275..455 と交差しない配置）
  { id: 'jgb', label: '国債買入', sub: 'JGB BUYING', color: '#0072B2', x: 375, y: 215, r: 52, offset: 0.2 },
  { id: 'nirp', label: '超低金利', sub: 'ZERO RATE', color: '#0072B2', x: 375, y: 505, r: 50, offset: 0.4 },
  { id: 'bank', label: '当座預金', sub: 'BANK RESERVES', color: '#1E8E3E', x: 645, y: 145, r: 48, offset: 0.6 },
  { id: 'corp', label: '内部留保', sub: 'CASH HOARDING', color: '#D97706', x: 880, y: 155, r: 52, offset: 0.8 },
  { id: 'save', label: '家計の貯蓄', sub: 'SAVINGS LOCK', color: '#D97706', x: 880, y: 565, r: 52, offset: 1.0 },
  // 外側：デフレ心理の壁に阻まれて届かない実体経済
  { id: 'wage', label: '実質賃金', sub: 'BLOCKED', color: '#64748B', x: 1215, y: 215, r: 54, blocked: true, offset: 1.45 },
  { id: 'price', label: '値上げ余力', sub: 'BLOCKED', color: '#64748B', x: 1230, y: 370, r: 54, blocked: true, offset: 1.65 },
  { id: 'spend', label: '消費の勢い', sub: 'BLOCKED', color: '#64748B', x: 1215, y: 525, r: 54, blocked: true, offset: 1.85 },
];

export interface BojProjectorStageProps {
  startSec: number;
}

export const BojProjectorStage: React.FC<BojProjectorStageProps> = ({ startSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const localFrame = Math.max(0, frame - Math.round(startSec * fps));

  const screenSpr = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 360, damping: 26, mass: 0.7 },
  });

  const cx = 645;
  const cy = 365;
  const wallX = 1065;
  const wallProg = interpolate(sec, [startSec + 1.2, startSec + 1.85], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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
          <radialGradient id="boj-proj-glow" cx="50%" cy="44%" r="58%">
            <stop offset="0%" stopColor="rgba(220, 38, 38, 0.14)" />
            <stop offset="60%" stopColor="rgba(14, 16, 20, 0.55)" />
            <stop offset="100%" stopColor="rgba(6, 8, 12, 0.98)" />
          </radialGradient>
          <linearGradient id="boj-proj-cone" x1="0.5" y1="1" x2="0.5" y2="0">
            <stop offset="0%" stopColor="rgba(241, 245, 249, 0.22)" />
            <stop offset="100%" stopColor="rgba(241, 245, 249, 0.01)" />
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#boj-proj-glow)" />
        <polygon points="895,1050 1025,1050 1740,860 180,860" fill="url(#boj-proj-cone)" />
      </svg>

      {/* 物理プロジェクターロールスクリーン */}
      <div
        style={{
          position: 'absolute',
          left: 140,
          right: 140,
          top: 42,
          bottom: 174,
          backgroundColor: '#F3F4F6',
          borderRadius: 6,
          boxShadow: '0 28px 80px rgba(0, 0, 0, 0.85), 0 0 90px rgba(255,255,255,0.12)',
          overflow: 'hidden',
          zIndex: 6,
          transform: `scale(${interpolate(screenSpr, [0, 1], [0.97, 1.0]).toFixed(4)})`,
        }}
      >
        <div
          style={{
            height: 22,
            background: 'linear-gradient(180deg, #334155 0%, #1E293B 100%)',
            borderBottom: '2px solid #0F172A',
          }}
        />

        <svg width="100%" height="calc(100% - 22px)" viewBox="0 0 1400 720" aria-hidden="true">
          <defs>
            <radialGradient id="boj-screen-vignette" cx="50%" cy="50%" r="72%">
              <stop offset="55%" stopColor="rgba(255,255,255,0)" />
              <stop offset="100%" stopColor="rgba(15, 23, 42, 0.14)" />
            </radialGradient>
          </defs>

          <rect width="1400" height="720" fill="url(#boj-screen-vignette)" />

          {/* スクリーン上部タイトル */}
          <text
            x={700}
            y={46}
            textAnchor="middle"
            fill="#334155"
            fontFamily={FONT_ECON_MONO}
            fontSize={17}
            fontWeight={800}
            letterSpacing="0.16em"
          >
            MONETARY EXPANSION vs. DEFLATIONARY LOCK-IN
          </text>

          {/* 放射エッジ */}
          {BOJ_NODES.map((node) => {
            const rev = startSec + node.offset;
            const prog = interpolate(sec, [rev, rev + 0.45], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            if (prog <= 0.01) return null;

            const targetX = node.blocked ? wallX - 18 : node.x;
            const targetY = node.blocked ? cy + (node.y - cy) * ((wallX - 18 - cx) / (node.x - cx)) : node.y;
            const ex = cx + (targetX - cx) * prog;
            const ey = cy + (targetY - cy) * prog;

            return (
              <line
                key={`be-${node.id}`}
                x1={cx}
                y1={cy}
                x2={ex}
                y2={ey}
                stroke={node.blocked ? '#CC0000' : node.color}
                strokeWidth={node.blocked ? 3.5 : 4}
                strokeDasharray={node.blocked ? '9 7' : undefined}
                opacity={0.82}
              />
            );
          })}

          {/* デフレ心理の赤い遮断壁 */}
          {wallProg > 0.01 ? (
            <g opacity={wallProg}>
              <line
                x1={wallX}
                y1={115}
                x2={wallX}
                y2={115 + 520 * wallProg}
                stroke="#CC0000"
                strokeWidth={7}
                strokeDasharray="16 10"
              />
              <rect x={wallX - 88} y={76} width={176} height={32} rx={4} fill="#CC0000" />
              <text
                x={wallX}
                y={98}
                textAnchor="middle"
                fill="#FFFFFF"
                fontFamily={FONT_ECON_SANS}
                fontSize={16}
                fontWeight={900}
              >
                デフレ心理の壁
              </text>
            </g>
          ) : null}

          {/* 各ノードバブル */}
          {BOJ_NODES.map((node) => {
            const rev = startSec + node.offset;
            if (sec < rev) return null;
            const lf = Math.max(0, frame - Math.round(rev * fps));
            const spr = spring({ frame: lf, fps, config: { stiffness: 460, damping: 20, mass: 0.6 } });
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y}) scale(${spr.toFixed(3)}) translate(${-node.x}, ${-node.y})`}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={node.blocked ? '#E2E8F0' : node.color}
                  stroke={node.blocked ? '#CC0000' : '#FFFFFF'}
                  strokeWidth={node.blocked ? 4 : 4.5}
                  strokeDasharray={node.blocked ? '7 5' : undefined}
                />
                <text
                  x={node.x}
                  y={node.y + 6}
                  textAnchor="middle"
                  fill={node.blocked ? '#334155' : '#FFFFFF'}
                  fontFamily={FONT_ECON_SANS}
                  fontSize={19}
                  fontWeight={900}
                >
                  {node.label}
                </text>
                <text
                  x={node.x}
                  y={node.y + node.r + 19}
                  textAnchor="middle"
                  fill={node.blocked ? '#CC0000' : '#334155'}
                  fontFamily={FONT_ECON_MONO}
                  fontSize={12}
                  fontWeight={800}
                >
                  {node.sub}
                </text>
              </g>
            );
          })}

          {/* 中央：日本中央銀行・数百兆円メダル（日の丸モチーフ） */}
          <g>
            <circle cx={cx} cy={cy} r={96} fill="#FFFFFF" stroke="#0F172A" strokeWidth={5} />
            <circle cx={cx} cy={cy - 10} r={42} fill="#CC0000" />
            <text
              x={cx}
              y={cy + 3}
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily={FONT_ECON_SERIF}
              fontSize={38}
              fontWeight={900}
            >
              ¥
            </text>
            <rect x={cx - 116} y={cy + 56} width={232} height={40} rx={6} fill="#0F172A" />
            <text
              x={cx}
              y={cy + 83}
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily={FONT_ECON_SANS}
              fontSize={22}
              fontWeight={900}
            >
              中央銀行・何百兆円
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
        <circle cx={100} cy={34} r={7} fill="#94A3B8" opacity={0.45} />
      </svg>
    </AbsoluteFill>
  );
};

/* ============================================================================
 * 8. Sub 8C: オープンループ締め（日本中心→世界全体へSVG viewBoxズームアウト＋黒弧線）
 * ========================================================================== */
const OPEN_LOOP_TARGETS: readonly string[] = [
  'us',
  'ca',
  'gb',
  'de',
  'fr',
  'nl',
  'ch',
  'se',
  'it',
  'es',
  'au',
  'kr',
  'tw',
  'cn',
  'sg',
  'in',
];

export interface JapanWorldOpenLoopStageProps {
  startSec: number;
  endSec: number;
}

export const JapanWorldOpenLoopStage: React.FC<JapanWorldOpenLoopStageProps> = ({
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

  // SVG viewBox を日本周辺ズームから世界全体 (0 0 1000 432.3) へ滑らかにズームアウト
  const zoomRaw = interpolate(localSec, [0.25, Math.min(2.8, dur * 0.82)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const easeOut = 1 - Math.pow(1 - zoomRaw, 3);

  const vbW = interpolate(easeOut, [0, 1], [340, WORLD_MAP_WIDTH]);
  const vbH = interpolate(easeOut, [0, 1], [147, WORLD_MAP_HEIGHT]);
  const vbX = interpolate(easeOut, [0, 1], [Math.min(WORLD_MAP_WIDTH - 340, startX - 170), 0]);
  const vbY = interpolate(easeOut, [0, 1], [Math.max(0, startY - 73), 0]);
  const dynamicViewBox = `${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`;

  const targetProgressMap = new Map<string, number>();
  OPEN_LOOP_TARGETS.forEach((iso, idx) => {
    const arcStart = 0.22 + idx * 0.095;
    const arcEnd = arcStart + 0.65;
    const prog = interpolate(localSec, [arcStart, arcEnd], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    targetProgressMap.set(iso, prog);
  });

  const titleOp = interpolate(localSec, [0.45, 1.1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#F4F5F6', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 90% 84% at 50% 48%, #FFFFFF 0%, #EFF1F4 70%, #E2E6EC 100%)',
        }}
      />

      {/* 上部ミニマル・オープンループ題字 */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 12,
          opacity: titleOp,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 14,
          backgroundColor: 'rgba(255, 255, 255, 0.90)',
          borderBottom: '4px solid #CC0000',
          padding: '8px 26px',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
        }}
      >
        <span
          style={{
            fontFamily: FONT_ECON_MONO,
            fontSize: 16,
            fontWeight: 900,
            color: '#CC0000',
            letterSpacing: '0.16em',
          }}
        >
          OPEN CASE //
        </span>
        <span
          style={{
            fontFamily: FONT_ECON_SERIF,
            fontSize: 28,
            fontWeight: 900,
            color: '#0F172A',
          }}
        >
          「激安の罠」の解剖へ
        </span>
      </div>

      {/* 実測188ヶ国世界地図 */}
      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          top: 96,
          bottom: 126,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="100%" height="100%" viewBox={dynamicViewBox} aria-hidden="true">
          {WORLD_COUNTRIES.map((c) => {
            const isJp = c.id === 'jp';
            const prog = targetProgressMap.get(c.id);
            const lit = prog !== undefined && prog >= 0.85;
            const partial = prog !== undefined && prog > 0.42 && prog < 0.85;
            return (
              <path
                key={`ol-${c.id}`}
                d={c.d}
                fill={isJp ? '#CC0000' : lit ? '#4CAF50' : partial ? '#86EFAC' : '#D1D5DB'}
                stroke="#FFFFFF"
                strokeWidth={0.75}
              />
            );
          })}

          {OPEN_LOOP_TARGETS.map((iso, idx) => {
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
              <g key={`oarc-${iso}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke="#111827"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeDasharray={dashTotal}
                  strokeDashoffset={dashTotal * (1 - prog)}
                  opacity={0.86}
                />
                {prog >= 0.9 ? <circle cx={tx} cy={ty} r={3.6} fill="#111827" /> : null}
              </g>
            );
          })}

          <circle cx={startX} cy={startY} r={5.5} fill="#CC0000" />
          <circle
            cx={startX}
            cy={startY}
            r={9 + Math.sin(localSec * 6) * 2.5}
            fill="none"
            stroke="#CC0000"
            strokeWidth={2}
            opacity={0.8}
          />
        </svg>
      </div>
    </AbsoluteFill>
  );
};
