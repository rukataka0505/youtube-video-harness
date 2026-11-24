import React from 'react';
import {
  AbsoluteFill,
  Audio,
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
  MacroEconCanvas,
  VhsPauseAvatarStage,
  usePlanEFonts,
} from '../../../../components/plan_e';
import { BASE_TIMELINE } from '../baseTimelineData';
import { BrollCutStage } from './BrollCutStage';
import { DeflationIncentiveEngine } from './DeflationIncentiveEngine';
import {
  BojLiquidityProjectorStage,
  EditorialVillainDebunk,
  JapanWorldDivergenceMap,
  PolicyBacklashBroadcast,
  WageFlatlineMonitor,
} from './MacroVisualStages';
import { WhiteboardOecdWageChart } from './WhiteboardOecdWageChart';

const ev = (key: string, fallback: number): number => {
  const v = BASE_TIMELINE.events[key];
  return typeof v === 'number' ? v : fallback;
};

export const V2_ORCH_NEON_METRICS = {
  variantId: 'v2_orch_neon',
  totalDurationSec: BASE_TIMELINE.totalDurationSec,
  totalFrames: BASE_TIMELINE.totalFrames,
  shotCount: BASE_TIMELINE.shots.length, // 8 shots
  subBeatCount: 21, // 21 distinct timeline sub-beats (22 visual cuts incl. S4-A dual B-roll; Shot 6 has 2 internal phases)
  visualCutCount: 22,
  fullBleedBrollSec: 42.69, // 52.1% full-bleed live-action B-roll
  fullBleedBrollRatioPct: 52.1,
  includingBroadcastBrollSec: 46.89, // 57.2% incl. S2-C1 news anchor video pane
  includingBroadcastBrollRatioPct: 57.2,
} as const;

/**
 * 案E（planE_macro_econ）ABテスト バリエーション v2_orch_neon
 * 方針：高密度データ＆構造可視化重視型
 * - 共通ベース音声 (82.01s / 2461f) と字幕 (BASE_TIMELINE.subtitles) を完全固定
 * - 全8ショットを21サブビート（22視覚カット）で高テンポ展開しつつ、
 *   1) 物理ホワイトボード上の OECD 30年実質賃金比較マルチラインチャート
 *   2) 企業 ⇔ 消費者のデフレ・インセンティブループ＆価格硬直性ロック機構
 *   3) 暗室プロジェクターの日銀緩和遮断壁
 *   4) 実測188ヶ国世界地図オープンループ
 *   を高密度モーショングラフィックスで描き切る。
 */
export const ABZeroInflationTrapV2OrchNeon: React.FC = () => {
  const fontsReady = usePlanEFonts();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  const T = {
    s1: ev('hookStartSec', 0.0),
    s2: ev('vhsPauseSec', 11.66),
    s3: ev('grooveStartSec', 23.29),
    s4: ev('whiteboardChartSec', 33.0),
    s5: ev('satireRevealSec', 42.36),
    s6: ev('incentiveLoopSec', 49.44),
    s7: ev('systemFreezeSec', 59.48),
    s8: ev('openLoopSec', 69.19),
    total: ev('totalDurationSec', BASE_TIMELINE.totalDurationSec),
  };

  // サブビート境界時刻（秒）
  const B = {
    s1b: 3.31,
    s1c: 7.4,
    s2b: 14.3,
    s2c1: 16.9,
    s2c2: 21.1,
    s3b: 26.29,
    s3c: 29.75,
    s4a2: 34.4,
    s4b: 35.8,
    s5b: 45.28,
    s6b: 53.96,
    s7b: 62.6,
    s7c: 65.04,
    s8b1: 73.1,
    s8b2: 76.07,
    s8c: 78.35,
  };

  const v = BASE_TIMELINE.videoMap;
  const img = BASE_TIMELINE.imageMap;

  // 明るい背景（ホワイトボード・紙面コラージュ・白地世界地図）のみ字幕を黒文字白縁取りへ自動切替
  const isLightSubtitle =
    (sec >= B.s4b && sec < T.s5) ||
    (sec >= B.s5b && sec < T.s6) ||
    sec >= B.s8c;

  const renderActiveVisual = (): React.ReactNode => {
    /* ------------------------------------------------------------------
     * Shot 1 (0.00 - 11.66s): 実写街並み＆現金Bロール＋30年賃金停止フック
     * ------------------------------------------------------------------ */
    if (sec < B.s1b) {
      return (
        <BrollCutStage
          startSec={T.s1}
          endSec={B.s1b}
          videoSrc={v.tokyo_commuters_broll}
          startFromFrame={0}
          motion="slow_zoom_in"
          grade="cinematic_vignette"
          vignetteStrength={0.68}
          locationTag="TOKYO // COMMUTER DISTRICT"
          locationAccentColor="#22C55E"
        >
          <div
            style={{
              position: 'absolute',
              top: 54,
              left: 96,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              backgroundColor: 'rgba(10, 12, 16, 0.84)',
              borderLeft: '5px solid #22C55E',
              padding: '8px 18px',
              zIndex: 18,
            }}
          >
            <span
              style={{
                fontFamily: FONT_ECON_MONO,
                fontSize: 17,
                fontWeight: 900,
                letterSpacing: '0.12em',
                color: '#4ADE80',
              }}
            >
              THOUGHT EXPERIMENT // CASE 01
            </span>
          </div>
        </BrollCutStage>
      );
    }

    if (sec < B.s1c) {
      const yearProg = interpolate(sec, [B.s1b + 0.15, B.s1c - 0.5], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const dispYear = Math.round(1995 + yearProg * 30);
      return (
        <BrollCutStage
          startSec={B.s1b}
          endSec={B.s1c}
          videoSrc={v.counting_cash_broll}
          startFromFrame={0}
          motion="slow_zoom_out"
          grade="editorial_cool"
          vignetteStrength={0.66}
          locationTag="NOMINAL INCOME // 30-YEAR STAGNATION"
          locationAccentColor="#F59E0B"
        >
          {/* 右上 鋭利HUD：1995→2025 カウントアップ＋横ばい波形 */}
          <div
            style={{
              position: 'absolute',
              top: 54,
              right: 96,
              width: 390,
              backgroundColor: 'rgba(10, 14, 20, 0.88)',
              border: '1px solid rgba(248, 250, 252, 0.25)',
              borderTop: '4px solid #F59E0B',
              padding: '16px 22px',
              zIndex: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: FONT_ECON_MONO, fontSize: 15, fontWeight: 800, color: '#94A3B8' }}>
                OBSERVATION WINDOW
              </span>
              <span style={{ fontFamily: FONT_ECON_MONO, fontSize: 28, fontWeight: 900, color: '#FDE047' }}>
                1995 → {dispYear}
              </span>
            </div>
            <svg width="100%" height="58" viewBox="0 0 340 58" style={{ marginTop: 8 }} aria-hidden="true">
              <line x1={0} y1={34} x2={340} y2={34} stroke="rgba(148,163,184,0.3)" strokeDasharray="4 4" />
              <path
                d="M 4 34 L 58 32 L 114 35 L 172 36 L 228 35 L 284 34 L 334 34"
                fill="none"
                stroke="#EF4444"
                strokeWidth={4}
                strokeDasharray="360"
                strokeDashoffset={360 * (1 - yearProg)}
              />
              <circle cx={4 + 330 * yearProg} cy={34} r={5} fill="#FFFFFF" stroke="#EF4444" strokeWidth={3} />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontFamily: FONT_ECON_SANS, fontSize: 16, fontWeight: 800, color: '#E2E8F0' }}>
                実質賃金トレンド
              </span>
              <span style={{ fontFamily: FONT_ECON_MONO, fontSize: 20, fontWeight: 900, color: '#EF4444' }}>
                REAL WAGE: +0.0%
              </span>
            </div>
          </div>
        </BrollCutStage>
      );
    }

    if (sec < T.s2) {
      const qSpr = spring({
        frame: Math.max(0, frame - Math.round(9.5 * fps)),
        fps,
        config: { stiffness: 420, damping: 22, mass: 0.65 },
      });
      return (
        <BrollCutStage
          startSec={B.s1c}
          endSec={T.s2}
          videoSrc={v.tokyo_commuters_broll}
          startFromFrame={80}
          motion="pan_left"
          grade="crisis_desat"
          vignetteStrength={0.72}
        >
          {sec >= 9.5 ? (
            <div
              style={{
                position: 'absolute',
                left: 96,
                right: 96,
                top: '32%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transform: `scale(${interpolate(qSpr, [0, 1], [0.92, 1])})`,
                opacity: qSpr,
                zIndex: 20,
              }}
            >
              <div
                style={{
                  backgroundColor: 'rgba(10, 12, 16, 0.88)',
                  borderLeft: '6px solid #EF4444',
                  padding: '16px 34px',
                  boxShadow: '0 22px 48px rgba(0,0,0,0.65)',
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_ECON_MONO,
                    fontSize: 20,
                    fontWeight: 900,
                    color: '#FCA5A5',
                    letterSpacing: '0.12em',
                    textAlign: 'center',
                  }}
                >
                  HOW TO FREEZE WAGES FOR 30 YEARS?
                </div>
                <div
                  style={{
                    fontFamily: FONT_ECON_SERIF,
                    fontSize: 44,
                    fontWeight: 900,
                    color: '#FFFFFF',
                    marginTop: 6,
                    textAlign: 'center',
                  }}
                >
                  どうやって給料を30年止めるのか？
                </div>
              </div>
            </div>
          ) : null}
        </BrollCutStage>
      );
    }

    /* ------------------------------------------------------------------
     * Shot 2 (11.66 - 23.29s): VHS一時停止＆素朴な破壊策の即却下
     * ------------------------------------------------------------------ */
    if (sec < B.s2b) {
      const tagSpr = spring({
        frame: Math.max(0, frame - Math.round(12.56 * fps)),
        fps,
        config: { stiffness: 480, damping: 20, mass: 0.6 },
      });
      return (
        <AbsoluteFill>
          <VhsPauseAvatarStage
            startSec={T.s2}
            frozenImageSrc={img.tokyo_commuters_broll_poster}
            timecodeLabel="II  00:00:11"
            avatarEmblem="¥?"
          />
          {sec >= 12.56 ? (
            <div
              style={{
                position: 'absolute',
                top: 132,
                right: 176,
                backgroundColor: '#CC0000',
                border: '2px solid #FFFFFF',
                color: '#FFFFFF',
                fontFamily: FONT_ECON_MONO,
                fontSize: 22,
                fontWeight: 900,
                padding: '8px 20px',
                zIndex: 18,
                transform: `scale(${interpolate(tagSpr, [0, 1], [1.3, 1.0])})`,
                opacity: tagSpr,
                boxShadow: '0 10px 26px rgba(0,0,0,0.55)',
              }}
            >
              OPTION A: TAX ×2
            </div>
          ) : null}
        </AbsoluteFill>
      );
    }

    if (sec < B.s2c1) {
      const rejSpr = spring({
        frame: Math.max(0, frame - Math.round((B.s2b + 0.9) * fps)),
        fps,
        config: { stiffness: 520, damping: 18, mass: 0.55 },
      });
      return (
        <BrollCutStage
          startSec={B.s2b}
          endSec={B.s2c1}
          videoSrc={v.counting_cash_broll}
          startFromFrame={75}
          motion="slow_zoom_in"
          grade="crisis_desat"
          vignetteStrength={0.72}
        >
          <div
            style={{
              position: 'absolute',
              inset: '110px 96px 190px 96px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 44,
              zIndex: 18,
            }}
          >
            {[
              { code: 'OPTION A', label: '税金を一気に 2倍' },
              { code: 'OPTION B', label: '大企業を片っ端から解体' },
            ].map((item, idx) => (
              <div
                key={item.code}
                style={{
                  position: 'relative',
                  backgroundColor: 'rgba(14, 16, 20, 0.90)',
                  border: '2px solid rgba(239, 68, 68, 0.65)',
                  padding: '26px 38px',
                  minWidth: 420,
                  boxShadow: '0 22px 48px rgba(0,0,0,0.65)',
                }}
              >
                <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 16, fontWeight: 900, color: '#FCA5A5' }}>
                  {item.code}
                </div>
                <div style={{ fontFamily: FONT_ECON_SERIF, fontSize: 34, fontWeight: 900, color: '#FFFFFF', marginTop: 8 }}>
                  {item.label}
                </div>
                {sec >= B.s2b + 0.9 + idx * 0.35 ? (
                  <div
                    style={{
                      position: 'absolute',
                      right: 18,
                      bottom: -18,
                      backgroundColor: '#CC0000',
                      border: '3px solid #FFFFFF',
                      color: '#FFFFFF',
                      fontFamily: FONT_ECON_MONO,
                      fontSize: 22,
                      fontWeight: 900,
                      padding: '4px 16px',
                      transform: `rotate(-5deg) scale(${rejSpr})`,
                    }}
                  >
                    ✕ REJECTED
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </BrollCutStage>
      );
    }

    if (sec < B.s2c2) {
      return (
        <PolicyBacklashBroadcast
          startSec={B.s2c1}
          endSec={B.s2c2}
          anchorVideoSrc={v.news_studio_broll}
        />
      );
    }

    if (sec < T.s3) {
      const failSpr = spring({
        frame: Math.max(0, frame - Math.round((B.s2c2 + 0.25) * fps)),
        fps,
        config: { stiffness: 520, damping: 18, mass: 0.55 },
      });
      return (
        <BrollCutStage
          startSec={B.s2c2}
          endSec={T.s3}
          videoSrc={v.tokyo_commuters_broll}
          startFromFrame={140}
          motion="slow_zoom_out"
          grade="crisis_desat"
          vignetteStrength={0.75}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
            }}
          >
            <div
              style={{
                border: '6px solid #EF4444',
                backgroundColor: 'rgba(18, 4, 6, 0.90)',
                color: '#FFFFFF',
                padding: '18px 42px',
                fontFamily: FONT_ECON_MONO,
                fontSize: 38,
                fontWeight: 900,
                letterSpacing: '0.08em',
                transform: `rotate(-3deg) scale(${interpolate(failSpr, [0, 1], [1.4, 1.0])})`,
                opacity: failSpr,
                boxShadow: '0 22px 52px rgba(0,0,0,0.72)',
              }}
            >
              PLAN FAILED // 計画は即座に失敗
            </div>
          </div>
        </BrollCutStage>
      );
    }

    /* ------------------------------------------------------------------
     * Shot 3 (23.29 - 33.00s): 115BPMグルーヴ解禁＆「激安の罠」逆転宣言
     * ------------------------------------------------------------------ */
    if (sec < B.s3b) {
      const revSpr = spring({
        frame: Math.max(0, frame - Math.round((T.s3 + 0.3) * fps)),
        fps,
        config: { stiffness: 460, damping: 22, mass: 0.6 },
      });
      return (
        <BrollCutStage
          startSec={T.s3}
          endSec={B.s3b}
          videoSrc={v.tokyo_commuters_broll}
          startFromFrame={30}
          motion="slow_zoom_in"
          grade="editorial_cool"
          glitchIntroSec={0.28}
          locationTag="PARADOX PIVOT // REVERSE STRATEGY"
          locationAccentColor="#38BDF8"
        >
          <div
            style={{
              position: 'absolute',
              top: 58,
              left: 96,
              right: 96,
              display: 'flex',
              justifyContent: 'center',
              zIndex: 20,
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(10, 14, 22, 0.88)',
                borderTop: '5px solid #22C55E',
                padding: '16px 36px',
                transform: `translateY(${interpolate(revSpr, [0, 1], [-18, 0])}px)`,
                opacity: revSpr,
              }}
            >
              <span style={{ fontFamily: FONT_ECON_MONO, fontSize: 22, fontWeight: 900, color: '#4ADE80' }}>
                REVERSE STRATEGY —{' '}
              </span>
              <span style={{ fontFamily: FONT_ECON_SERIF, fontSize: 34, fontWeight: 900, color: '#FFFFFF' }}>
                真逆のアプローチ
              </span>
            </div>
          </div>
        </BrollCutStage>
      );
    }

    if (sec < B.s3c) {
      const tags = [
        { title: '牛丼・外食', oldPrice: '¥500', newPrice: '¥290', delay: 0.1 },
        { title: '日用品・食品', oldPrice: '¥1,000', newPrice: '¥590', delay: 0.55 },
        { title: '物価指数 (CPI)', oldPrice: '+2.0%', newPrice: '0.0%', delay: 1.0 },
      ];
      return (
        <BrollCutStage
          startSec={B.s3b}
          endSec={B.s3c}
          videoSrc={v.counting_cash_broll}
          startFromFrame={36}
          motion="pan_right"
          grade="warm_night"
          locationTag="PRICE DEFLATION // SILENT EROSION"
          locationAccentColor="#F59E0B"
        >
          {/* 物理値札SVG 3連 */}
          <div
            style={{
              position: 'absolute',
              top: 110,
              left: 96,
              right: 96,
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
              zIndex: 18,
            }}
          >
            {tags.map((t, idx) => {
              const revAt = B.s3b + t.delay;
              if (sec < revAt) return <div key={t.title} style={{ width: 320 }} />;
              const spr = spring({
                frame: Math.max(0, frame - Math.round(revAt * fps)),
                fps,
                config: { stiffness: 480, damping: 19, mass: 0.6 },
              });
              return (
                <div
                  key={t.title}
                  style={{
                    transform: `rotate(${idx === 1 ? 2 : -2.5}deg) scale(${spr})`,
                    width: 320,
                    backgroundColor: '#FAF8F3',
                    border: '2px solid #1E293B',
                    borderTop: '14px solid #CC0000',
                    padding: '20px 24px',
                    boxShadow: '0 22px 44px rgba(0,0,0,0.58)',
                    position: 'relative',
                  }}
                >
                  {/* 値札穴 */}
                  <div
                    style={{
                      position: 'absolute',
                      top: -9,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      backgroundColor: '#0F172A',
                      border: '2px solid #FFFFFF',
                    }}
                  />
                  <div style={{ fontFamily: FONT_ECON_SANS, fontSize: 20, fontWeight: 900, color: '#334155' }}>
                    {t.title}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_ECON_MONO,
                      fontSize: 24,
                      fontWeight: 700,
                      color: '#64748B',
                      textDecoration: 'line-through',
                      marginTop: 8,
                    }}
                  >
                    {t.oldPrice}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_ECON_MONO,
                      fontSize: 48,
                      fontWeight: 900,
                      color: '#CC0000',
                      marginTop: 2,
                    }}
                  >
                    {t.newPrice}
                  </div>
                </div>
              );
            })}
          </div>
        </BrollCutStage>
      );
    }

    if (sec < T.s4) {
      const b1Spr = spring({
        frame: Math.max(0, frame - Math.round((B.s3c + 0.2) * fps)),
        fps,
        config: { stiffness: 480, damping: 18, mass: 0.6 },
      });
      const b2Spr = spring({
        frame: Math.max(0, frame - Math.round((B.s3c + 1.1) * fps)),
        fps,
        config: { stiffness: 480, damping: 18, mass: 0.6 },
      });
      return (
        <BrollCutStage
          startSec={B.s3c}
          endSec={T.s4}
          videoSrc={v.tokyo_commuters_broll}
          startFromFrame={90}
          motion="slow_zoom_in"
          grade="clean_bright"
          vignetteStrength={0.54}
          locationTag="CONSUMER ILLUSION // BARGAIN TRAP"
          locationAccentColor="#FACC15"
        >
          {/* 左側：割引シール風バッジ */}
          <div
            style={{
              position: 'absolute',
              left: 140,
              top: 165,
              display: 'flex',
              gap: 32,
              zIndex: 18,
            }}
          >
            <div
              style={{
                width: 210,
                height: 210,
                borderRadius: '50%',
                backgroundColor: '#FACC15',
                border: '6px dashed #B91C1C',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `rotate(-8deg) scale(${b1Spr})`,
                boxShadow: '0 18px 36px rgba(0,0,0,0.48)',
              }}
            >
              <span style={{ fontFamily: FONT_ECON_SANS, fontSize: 48, fontWeight: 900, color: '#B91C1C' }}>
                お得!
              </span>
              <span style={{ fontFamily: FONT_ECON_MONO, fontSize: 16, fontWeight: 900, color: '#7F1D1D' }}>
                PRICE DOWN
              </span>
            </div>

            {sec >= B.s3c + 1.1 ? (
              <div
                style={{
                  width: 210,
                  height: 210,
                  borderRadius: '50%',
                  backgroundColor: '#DC2626',
                  border: '6px solid #FFFFFF',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `rotate(6deg) scale(${b2Spr})`,
                  boxShadow: '0 18px 36px rgba(0,0,0,0.48)',
                }}
              >
                <span style={{ fontFamily: FONT_ECON_SANS, fontSize: 32, fontWeight: 900, color: '#FFFFFF' }}>
                  さらに値下げ
                </span>
                <span style={{ fontFamily: FONT_ECON_MONO, fontSize: 16, fontWeight: 900, color: '#FEF08A', marginTop: 4 }}>
                  WAGE FROZEN
                </span>
              </div>
            ) : null}
          </div>

          {/* 右下進行役アバター（open_hands は左右対称のため flipX なしで文字反転を防止） */}
          <div style={{ position: 'absolute', right: 96, bottom: 44, zIndex: 18 }}>
            <EconHostAvatar pose="open_hands" emblem="¥?" scale={0.96} />
          </div>
        </BrollCutStage>
      );
    }

    /* ------------------------------------------------------------------
     * Shot 4 (33.00 - 42.36s): 欧米実写2連カット → 目玉①物理ホワイトボードOECDチャート
     * ------------------------------------------------------------------ */
    if (sec < B.s4a2) {
      return (
        <BrollCutStage
          startSec={T.s4}
          endSec={B.s4a2}
          videoSrc={v.supermarket_aisle_broll} // 実体：米国星条旗実写映像
          startFromFrame={15}
          motion="slow_zoom_in"
          grade="clean_bright"
          vignetteStrength={0.50}
          locationTag="UNITED STATES // REAL WAGES +51%"
          locationAccentColor="#0072B2"
        />
      );
    }

    if (sec < B.s4b) {
      return (
        <BrollCutStage
          startSec={B.s4a2}
          endSec={B.s4b}
          videoSrc={v.news_studio_broll} // 実体：EU旗ニューススタジオ映像
          startFromFrame={30}
          motion="slow_zoom_out"
          grade="editorial_cool"
          vignetteStrength={0.54}
          locationTag="EUROPE (OECD) // REAL WAGES +29~38%"
          locationAccentColor="#22C55E"
        />
      );
    }

    if (sec < T.s5) {
      return (
        <WhiteboardOecdWageChart
          startSec={B.s4b}
          endSec={T.s5}
          japanRevealSec={39.04}
          avatarEmblem="¥?"
        />
      );
    }

    /* ------------------------------------------------------------------
     * Shot 5 (42.36 - 49.44s): 報道導入 → 明るい紙面コラージュ（悪者論否定）
     * ------------------------------------------------------------------ */
    if (sec < B.s5b) {
      return (
        <BrollCutStage
          startSec={T.s5}
          endSec={B.s5b}
          videoSrc={v.news_studio_broll}
          startFromFrame={66}
          motion="slow_zoom_in"
          grade="cinematic_vignette"
          vignetteStrength={0.65}
          locationTag="INVESTIGATION // WHO CAUSED THE FREEZE?"
          locationAccentColor="#38BDF8"
        >
          <div
            style={{
              position: 'absolute',
              top: 56,
              left: 96,
              backgroundColor: 'rgba(10, 14, 22, 0.88)',
              borderLeft: '6px solid #38BDF8',
              padding: '12px 26px',
              zIndex: 18,
            }}
          >
            <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 16, fontWeight: 900, color: '#38BDF8' }}>
              STRUCTURAL AUDIT
            </div>
            <div style={{ fontFamily: FONT_ECON_SERIF, fontSize: 34, fontWeight: 900, color: '#FFFFFF', marginTop: 4 }}>
              なぜそんな奇妙なことが起きたのか？
            </div>
          </div>
        </BrollCutStage>
      );
    }

    if (sec < T.s6) {
      return <EditorialVillainDebunk startSec={B.s5b} endSec={T.s6} />;
    }

    /* ------------------------------------------------------------------
     * Shot 6 (49.44 - 59.48s): 目玉② 企業 ⇔ 消費者のデフレ・インセンティブループ
     * ------------------------------------------------------------------ */
    if (sec < T.s7) {
      return (
        <DeflationIncentiveEngine
          startSec={T.s6}
          consumerPhaseSec={B.s6b}
          endSec={T.s7}
        />
      );
    }

    /* ------------------------------------------------------------------
     * Shot 7 (59.48 - 69.19s): 合成の誤謬 → 実質賃金フラットラインモニター
     * ------------------------------------------------------------------ */
    if (sec < B.s7b) {
      return (
        <BrollCutStage
          startSec={T.s7}
          endSec={B.s7b}
          videoSrc={v.tokyo_commuters_broll}
          startFromFrame={60}
          motion="slow_zoom_in"
          grade="editorial_cool"
          vignetteStrength={0.62}
          locationTag="INDIVIDUAL RATIONALITY // MICRO OPTIMUM"
          locationAccentColor="#22C55E"
        >
          <div
            style={{
              position: 'absolute',
              top: 120,
              left: 96,
              right: 96,
              display: 'flex',
              justifyContent: 'space-between',
              zIndex: 18,
            }}
          >
            {[
              { actor: '企業：防衛', badge: '✓ 合理的選択', color: '#38BDF8' },
              { actor: '家計：節約', badge: '✓ 合理的選択', color: '#F59E0B' },
            ].map((b) => (
              <div
                key={b.actor}
                style={{
                  backgroundColor: 'rgba(10, 14, 20, 0.88)',
                  borderLeft: `6px solid ${b.color}`,
                  padding: '16px 28px',
                  boxShadow: '0 16px 34px rgba(0,0,0,0.5)',
                }}
              >
                <div style={{ fontFamily: FONT_ECON_SANS, fontSize: 28, fontWeight: 900, color: '#FFFFFF' }}>
                  {b.actor}
                </div>
                <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 22, fontWeight: 900, color: '#4ADE80', marginTop: 6 }}>
                  {b.badge}
                </div>
              </div>
            ))}
          </div>
        </BrollCutStage>
      );
    }

    if (sec < B.s7c) {
      return (
        <BrollCutStage
          startSec={B.s7b}
          endSec={B.s7c}
          videoSrc={v.counting_cash_broll}
          startFromFrame={96}
          motion="pan_left"
          grade="cinematic_vignette"
          vignetteStrength={0.68}
        >
          <div
            style={{
              position: 'absolute',
              left: 96,
              right: 96,
              top: '36%',
              display: 'flex',
              justifyContent: 'center',
              zIndex: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                backgroundColor: 'rgba(12, 14, 18, 0.92)',
                border: '2px solid rgba(239, 68, 68, 0.6)',
                padding: '18px 38px',
                boxShadow: '0 22px 52px rgba(0,0,0,0.68)',
              }}
            >
              <span style={{ fontFamily: FONT_ECON_MONO, fontSize: 28, fontWeight: 900, color: '#4ADE80' }}>
                MICRO: 最適解
              </span>
              <span style={{ fontFamily: FONT_ECON_MONO, fontSize: 32, fontWeight: 900, color: '#F59E0B' }}>
                ━━▶
              </span>
              <span style={{ fontFamily: FONT_ECON_MONO, fontSize: 28, fontWeight: 900, color: '#EF4444' }}>
                MACRO: 合成の誤謬
              </span>
            </div>
          </div>
        </BrollCutStage>
      );
    }

    if (sec < T.s8) {
      return (
        <WageFlatlineMonitor
          startSec={B.s7c}
          endSec={T.s8}
          bgVideoSrc={v.tokyo_commuters_broll}
        />
      );
    }

    /* ------------------------------------------------------------------
     * Shot 8 (69.19 - 82.01s): 暗室プロジェクター → 日銀マネー注入 → 世界地図オープンループ
     * ------------------------------------------------------------------ */
    if (sec < B.s8b1) {
      return <BojLiquidityProjectorStage startSec={T.s8} endSec={B.s8b1} />;
    }

    if (sec < B.s8b2) {
      const moneyProg = interpolate(sec, [B.s8b1, B.s8b2 - 0.25], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const trillions = Math.round(moneyProg * 680);
      return (
        <BrollCutStage
          startSec={B.s8b1}
          endSec={B.s8b2}
          videoSrc={v.counting_cash_broll}
          startFromFrame={0}
          playbackRate={1.35}
          motion="slow_zoom_in"
          grade="warm_night"
          vignetteStrength={0.62}
          locationTag="MONETARY BASE EXPANSION // LIQUIDITY INJECTION"
          locationAccentColor="#22C55E"
        >
          <div
            style={{
              position: 'absolute',
              top: 120,
              left: 96,
              right: 96,
              display: 'flex',
              justifyContent: 'center',
              zIndex: 20,
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(10, 14, 18, 0.90)',
                borderTop: '5px solid #22C55E',
                padding: '20px 44px',
                textAlign: 'center',
                boxShadow: '0 22px 52px rgba(0,0,0,0.68)',
              }}
            >
              <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 18, fontWeight: 900, color: '#86EFAC', letterSpacing: '0.12em' }}>
                CENTRAL BANK MONETARY SUPPLY
              </div>
              <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 78, fontWeight: 900, color: '#FFFFFF', marginTop: 4 }}>
                ¥{trillions}
                <span style={{ fontSize: 42, color: '#4ADE80', marginLeft: 8 }}>兆円</span>
              </div>
            </div>
          </div>
        </BrollCutStage>
      );
    }

    if (sec < B.s8c) {
      return (
        <BrollCutStage
          startSec={B.s8b2}
          endSec={B.s8c}
          videoSrc={v.news_studio_broll}
          startFromFrame={84}
          motion="slow_zoom_out"
          grade="crisis_desat"
          vignetteStrength={0.70}
          locationTag="STRUCTURAL EQUILIBRIUM // TRAPPED"
          locationAccentColor="#EF4444"
        >
          <div
            style={{
              position: 'absolute',
              top: 56,
              right: 96,
              backgroundColor: 'rgba(153, 27, 27, 0.92)',
              border: '2px solid #FCA5A5',
              color: '#FFFFFF',
              fontFamily: FONT_ECON_MONO,
              fontSize: 22,
              fontWeight: 900,
              padding: '10px 22px',
              zIndex: 20,
            }}
          >
            REAL WAGE: UNCHANGED
          </div>
        </BrollCutStage>
      );
    }

    return <JapanWorldDivergenceMap startSec={B.s8c} endSec={T.total} />;
  };

  return (
    <div style={{ width: '100%', height: '100%', opacity: fontsReady ? 1 : 0.999 }}>
      <Audio src={staticFile(BASE_TIMELINE.audioSrc)} />
      <MacroEconCanvas
        backdropMode={isLightSubtitle ? 'whiteboard' : 'slate_grid'}
        subtitles={BASE_TIMELINE.subtitles}
        sec={sec}
        subtitleLightBgOverride={isLightSubtitle}
        showTickerBar={false}
        fullBleed={true}
        grainOpacity={0.018}
        grainIdPrefix="v2-orch-neon"
      >
        {renderActiveVisual()}
      </MacroEconCanvas>
    </div>
  );
};
