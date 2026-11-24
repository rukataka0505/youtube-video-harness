import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useVideoConfig } from 'remotion';
import { EconHostAvatar, VhsPauseAvatarStage } from '../../../../components/plan_e';
import {
  C,
  CLAMP,
  Clip,
  Clipping,
  CutGlitch,
  EASE_OUT,
  Kicker,
  MONO,
  NewsBug,
  NewsChyron,
  POSTER_SRC,
  PaperBg,
  SANS,
  SERIF,
  Stamp,
  SubShade,
  TypeLine,
  VhsOverlay,
  Vignette,
  impactShake,
  useBeat,
} from './kit';

export interface BeatProps {
  t0: number;
  dur: number;
}

/* ========================================================================== */
/* Shot 1 (0.00–11.66) 思考実験フック                                          */
/* ========================================================================== */

const CaseBug: React.FC = () => {
  const { frame } = useBeat(0);
  const blink = Math.floor(frame / 14) % 2 === 0;
  return (
    <div
      style={{
        position: 'absolute',
        top: 64,
        left: 96,
        zIndex: 22,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: MONO,
        fontWeight: 800,
        fontSize: 22,
        letterSpacing: '0.16em',
        color: 'rgba(248,250,252,0.94)',
        textShadow: '0 2px 10px rgba(0,0,0,0.85)',
      }}
    >
      <span style={{ color: C.red, opacity: blink ? 1 : 0.25 }}>●</span>
      <span>CASE FILE 001</span>
      <span style={{ opacity: 0.55 }}>//</span>
      <span style={{ fontFamily: SANS, letterSpacing: '0.1em' }}>思考実験</span>
    </div>
  );
};

/** b01: 東京の雑踏＋タイプライターで「目的」を打つ。 */
export const B01Hook: React.FC<BeatProps> = ({ t0, dur }) => {
  const { at } = useBeat(t0);
  return (
    <AbsoluteFill>
      <Clip clip="street" durFrames={dur} trimSec={0} grade="cool" zoom={[1.03, 1.11]} origin="50% 40%" />
      <Vignette strength={0.66} />
      <SubShade />
      <CaseBug />
      <TypeLine
        text="目的：一国の給料を、止める。"
        startFrame={at(0.55)}
        cps={13}
        style={{
          left: 96,
          top: 150,
          fontFamily: SERIF,
          fontWeight: 900,
          fontSize: 66,
          color: '#FFFFFF',
          letterSpacing: '0.04em',
          textShadow: '0 4px 24px rgba(0,0,0,0.85)',
        }}
      />
    </AbsoluteFill>
  );
};

/** b02: 雑踏の上に「急募」三行広告の切り抜きが叩きつけられる。 */
export const B02WantedAd: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const sh = impactShake(frame, [at(3.5) + 4], 9);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
        <Clip clip="street" durFrames={dur} trimSec={3.4} grade="desat" zoom={[1.08, 1.12]} pan={[30, -30]} />
      </AbsoluteFill>
      <Vignette strength={0.7} />
      <SubShade />
      <CaseBug />
      <Clipping x={1040} y={130} w={760} rotate={-3} enterFrame={at(3.5)} from="drop" seed={3} padding="30px 40px 40px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: `3px solid ${C.ink}`, paddingBottom: 10 }}>
          <span
            style={{
              backgroundColor: C.ink,
              color: C.paper,
              fontFamily: SERIF,
              fontWeight: 900,
              fontSize: 40,
              padding: '2px 16px',
              letterSpacing: '0.12em',
            }}
          >
            急募
          </span>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 22, color: C.inkSoft, letterSpacing: '0.1em' }}>
            三行広告｜国家プロジェクト
          </span>
        </div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 60, lineHeight: 1.22, marginTop: 16 }}>
          先進国の給料を
          <br />
          <span style={{ color: C.crimson }}>30年間</span>、止める方法
        </div>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 24,
            color: C.inkSoft,
            marginTop: 16,
            lineHeight: 1.5,
            borderTop: `1px dashed ${C.inkSoft}`,
            paddingTop: 10,
          }}
        >
          経験不問　※派手な手口はお断り
          <br />
          成功報酬：なし（給料は上がりません）
        </div>
      </Clipping>
    </AbsoluteFill>
  );
};

/** b03: 給与明細（紙）— 年だけが進み、基本給は1円も動かない。 */
export const B03PayStub: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const { fps } = useVideoConfig();
  const yearP = interpolate(frame, [at(6.75), at(8.85)], [0, 1], { ...CLAMP, easing: Easing.in(Easing.quad) });
  const year = Math.round(1995 + yearP * 30);
  const flick = yearP > 0 && yearP < 1 && frame % 3 === 0;
  const circleP = interpolate(frame, [at(8.9), at(9.4)], [0, 1], { ...CLAMP, easing: EASE_OUT });
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 200 } });
  return (
    <AbsoluteFill>
      <Clip clip="street" durFrames={dur} trimSec={0.8} grade="desat" zoom={[1.18, 1.26]} origin="62% 45%" />
      <Vignette strength={0.72} />
      <SubShade />
      <CaseBug />
      <div
        style={{
          position: 'absolute',
          left: 150,
          top: 150,
          width: 620,
          height: 660,
          transform: `translateY(${((1 - enter) * 700).toFixed(1)}px) rotate(-2.2deg)`,
          backgroundColor: '#FBF8F1',
          boxShadow: '0 30px 60px rgba(0,0,0,0.55)',
          padding: '34px 40px',
          boxSizing: 'border-box',
          color: C.ink,
          backgroundImage: 'repeating-linear-gradient(180deg, transparent 0 63px, rgba(30,60,120,0.12) 63px 65px)',
          backgroundPosition: '0 170px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 46, letterSpacing: '0.18em' }}>給与明細書</span>
          <span style={{ fontFamily: MONO, fontSize: 20, color: C.inkSoft }}>No. 0001</span>
        </div>
        <div style={{ height: 3, backgroundColor: C.ink, marginTop: 10 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 34 }}>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, color: C.inkSoft }}>支給年</span>
          <span
            style={{
              fontFamily: MONO,
              fontWeight: 900,
              fontSize: 92,
              color: yearP >= 1 ? C.crimson : C.ink,
              transform: flick ? 'translateY(-3px)' : undefined,
            }}
          >
            {year}
          </span>
        </div>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 30 }}>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, color: C.inkSoft }}>基本給</span>
          <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: 64 }}>¥300,000</span>
          <svg width={430} height={150} viewBox="0 0 430 150" style={{ position: 'absolute', right: -36, top: -36, overflow: 'visible' }}>
            <ellipse
              cx={215}
              cy={75}
              rx={200}
              ry={62}
              fill="none"
              stroke={C.crimson}
              strokeWidth={7}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - circleP}
              transform="rotate(-4 215 75)"
            />
          </svg>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 34 }}>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, color: C.inkSoft }}>前年比</span>
          <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: 56 }}>±0</span>
        </div>
        <div style={{ position: 'absolute', right: 46, bottom: 40, fontFamily: SERIF, fontSize: 24, color: C.inkSoft }}>
          ※毎年おなじ金額です
        </div>
      </div>
      <Stamp text="据え置き" x={640} y={640} enterFrame={at(9.35)} size={64} rotate={-14} blend={false} />
    </AbsoluteFill>
  );
};

/** b04: 「どうすれば？」クラッシュズーム＋巨大な疑問符。 */
export const B04Question: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame } = useBeat(t0);
  const q = interpolate(frame, [0, 6], [1.8, 1], { ...CLAMP, easing: Easing.out(Easing.back(2)) });
  return (
    <AbsoluteFill>
      <Clip clip="street" durFrames={dur} trimSec={6.6} grade="cool" zoom={[1.0, 1.32]} origin="50% 42%" />
      <Vignette strength={0.8} />
      <SubShade />
      <CaseBug />
      <CutGlitch frames={5} flash />
      <div
        style={{
          position: 'absolute',
          right: 220,
          top: 120,
          fontFamily: SERIF,
          fontWeight: 900,
          fontSize: 560,
          lineHeight: 1,
          color: C.red,
          opacity: 0.9,
          transform: `scale(${q.toFixed(3)}) rotate(8deg)`,
          textShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        ？
      </div>
    </AbsoluteFill>
  );
};

/** b04b: 無音の「間」— 映像がその場でフリーズし、VHSの一時停止がかかる。 */
export const B04bFreeze: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame } = useBeat(t0);
  const drain = interpolate(frame, [0, dur], [0, 1], CLAMP);
  return (
    <AbsoluteFill>
      <Clip
        clip="street"
        durFrames={dur}
        trimSec={7.7}
        freeze
        grade="none"
        zoom={[1.32, 1.32]}
        origin="50% 42%"
        extraFilter={`grayscale(${drain.toFixed(2)}) contrast(1.15) brightness(${(0.8 - drain * 0.2).toFixed(2)})`}
      />
      <Vignette strength={0.85} />
      <VhsOverlay label="II PAUSE" timecode="SP  00:00:10" />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* Shot 2 (11.66–23.29) VHS一時停止＆派手な破壊策の即却下                          */
/* ========================================================================== */

export const B05Vhs: React.FC<BeatProps> = () => (
  <AbsoluteFill>
    <VhsPauseAvatarStage startSec={0} frozenImageSrc={POSTER_SRC.street} timecodeLabel="II  00:00:11" avatarEmblem="¥?" />
  </AbsoluteFill>
);

const PlanClippingA: React.FC<{ enterFrame: number; animate: boolean }> = ({ enterFrame, animate }) => (
  <Clipping x={130} y={150} w={800} rotate={-2.5} enterFrame={animate ? enterFrame : -999} from="left" seed={5} padding="30px 42px 40px">
    <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 26, color: C.crimson, letterSpacing: '0.2em' }}>計画案 ①</div>
    <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 78, lineHeight: 1.1, marginTop: 6, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
      増税、一気に2倍へ
    </div>
    <div style={{ height: 3, backgroundColor: C.ink, margin: '16px 0 14px' }} />
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 26 }}>
      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, color: C.inkSoft }}>消費税</span>
      <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: 84 }}>10%</span>
      <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 60, color: C.inkSoft }}>→</span>
      <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: 104, color: C.crimson }}>20%</span>
    </div>
  </Clipping>
);

const PlanClippingB: React.FC<{ enterFrame: number; animate: boolean }> = ({ enterFrame, animate }) => (
  <Clipping x={1000} y={300} w={800} rotate={2.2} enterFrame={animate ? enterFrame : -999} from="right" seed={9} padding="30px 42px 40px">
    <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 26, color: C.crimson, letterSpacing: '0.2em' }}>計画案 ②</div>
    <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 82, lineHeight: 1.14, marginTop: 6 }}>
      大企業、
      <br />
      片っ端から解体
    </div>
    <div style={{ height: 3, backgroundColor: C.ink, margin: '16px 0 12px' }} />
    <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, color: C.inkSoft }}>
      上場企業 <span style={{ fontFamily: MONO, fontWeight: 900, color: C.ink }}>約3,900社 → 0社</span>
    </div>
  </Clipping>
);

const Masthead: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      left: 96,
      right: 96,
      top: 54,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      borderBottom: `4px double ${C.ink}`,
      paddingBottom: 8,
      color: C.ink,
    }}
  >
    <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 40, letterSpacing: '0.3em' }}>思考実験日報</span>
    <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 20, color: C.inkSoft, letterSpacing: '0.12em' }}>
      号外 ／ 給料停止計画・素案
    </span>
  </div>
);

/** b06: 紙面に「派手な計画案」2枚が飛び込む。 */
export const B06Plans: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const cam = interpolate(frame, [0, dur], [1.0, 1.04], CLAMP);
  const sh = impactShake(frame, [at(12.75) + 5, at(14.1) + 5], 7);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px) scale(${cam.toFixed(4)})` }}>
        <PaperBg />
        <Masthead />
        <PlanClippingA enterFrame={at(12.75)} animate />
        <PlanClippingB enterFrame={at(14.1)} animate />
      </AbsoluteFill>
      <CutGlitch frames={4} />
    </AbsoluteFill>
  );
};

/** b07: 翌朝の速報 — 実写報道スタジオ＋速報帯。 */
export const B07Backlash: React.FC<BeatProps> = ({ t0, dur }) => {
  const { at } = useBeat(t0);
  return (
    <AbsoluteFill>
      <Clip clip="news" durFrames={dur} trimSec={2.4} rate={0.8} grade="cool" zoom={[1.06, 1.12]} origin="58% 40%" />
      <Vignette strength={0.5} />
      <CutGlitch frames={5} flash />
      <NewsBug desk="思考実験ニュース" clock="翌朝 07:00" />
      <NewsChyron
        label="速報"
        headline="国民が猛反発　「給料停止計画」わずか1日で頓挫"
        enterFrame={at(17.1)}
        ticker={['内閣支持率 急落', '抗議の声 全国に拡大', '計画担当者 雲隠れ', '※これは思考実験です']}
      />
    </AbsoluteFill>
  );
};

/** b08: 紙面に戻り、2案に「却下」「失敗」の判子。 */
export const B08Rejected: React.FC<BeatProps> = ({ t0 }) => {
  const { frame, at } = useBeat(t0);
  const sA = at(21.2);
  const sB = at(21.75);
  const sh = impactShake(frame, [sA + 3, sB + 3], 12);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px) scale(1.04)` }}>
        <PaperBg />
        <Masthead />
        <PlanClippingA enterFrame={0} animate={false} />
        <PlanClippingB enterFrame={0} animate={false} />
        <Stamp text="却下" x={600} y={250} enterFrame={sA} size={150} rotate={-14} />
        <Stamp text="失敗" x={1420} y={520} enterFrame={sB} size={150} rotate={10} />
      </AbsoluteFill>
      <Kicker
        text="派手な悪事は、翌日バレる。"
        x={130}
        y={700}
        enterFrame={at(22.2)}
        size={62}
        color={C.ink}
        shadow={false}
        underline={C.crimson}
      />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* Shot 3 (23.29–33.00) 「真逆」宣言＆じわじわ値下げ                              */
/* ========================================================================== */

/** b09: グルーヴ解禁。雑踏に吊り下げ値札が回転し「値上げ」→「値下げ」に裏返る。 */
export const B09Reversal: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const { fps } = useVideoConfig();
  const drop = spring({ frame: frame - at(23.45), fps, config: { damping: 9, stiffness: 120, mass: 0.9 } });
  const flip = interpolate(frame, [at(24.7), at(25.15)], [0, 180], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const swing = Math.sin((frame / fps) * 3.2) * interpolate(frame, [0, dur], [7, 3], CLAMP);
  const face: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backfaceVisibility: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '18px 18px 18px 18px',
    clipPath: 'polygon(14% 0, 86% 0, 100% 16%, 100% 100%, 0 100%, 0 16%)',
  };
  return (
    <AbsoluteFill>
      <Clip clip="street" durFrames={dur} trimSec={4.0} mirror grade="warm" zoom={[1.1, 1.18]} origin="40% 50%" />
      <Vignette strength={0.7} />
      <SubShade />
      <CutGlitch frames={7} flash />
      {/* 吊り紐 */}
      <div
        style={{
          position: 'absolute',
          left: 1300,
          top: 0,
          width: 3,
          height: interpolate(drop, [0, 1], [0, 210]),
          backgroundColor: 'rgba(255,255,255,0.85)',
          transformOrigin: 'top center',
          transform: `rotate(${swing.toFixed(2)}deg)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 1100,
          top: interpolate(drop, [0, 1], [-520, 200]),
          width: 400,
          height: 460,
          transformOrigin: '50% -10%',
          transform: `rotate(${swing.toFixed(2)}deg)`,
          perspective: 1400,
          filter: 'drop-shadow(0 26px 30px rgba(0,0,0,0.55))',
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: `rotateY(${flip}deg)` }}>
          <div style={{ ...face, backgroundColor: '#FBF7EE' }}>
            <div style={{ width: 34, height: 34, borderRadius: 17, border: '6px solid #9CA3AF', position: 'absolute', top: 22 }} />
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 96, color: C.crimson, marginTop: 50 }}>値上げ</div>
            <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 120, color: C.crimson, lineHeight: 1.2 }}>▲</div>
          </div>
          <div style={{ ...face, backgroundColor: '#FFE14D', transform: 'rotateY(180deg)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 17, border: '6px solid #A16207', position: 'absolute', top: 22 }} />
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 96, color: C.ink, marginTop: 50 }}>値下げ</div>
            <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 120, color: C.crimson, lineHeight: 1.2 }}>▼</div>
          </div>
        </div>
      </div>
      <Kicker text="正解は、真逆。" x={120} y={300} enterFrame={at(25.0)} size={104} tag="逆転" underline={C.gold} />
    </AbsoluteFill>
  );
};

/** b10: 激安チラシ — 値札が「じわじわ」上書きされていく。 */
export const B10Flyer: React.FC<BeatProps> = ({ t0 }) => {
  const { frame, at } = useBeat(t0);
  const hits = [at(26.5), at(27.75), at(28.95)];
  const prices = ['398', '298', '198'];
  const sh = impactShake(frame, hits.map((h) => h + 2), 9);
  const level = hits.filter((h) => frame >= h).length; // 1..3
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
        <AbsoluteFill style={{ backgroundColor: '#FFE14D' }} />
        <AbsoluteFill
          style={{
            backgroundImage:
              'repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,120,0,0.16) 0deg 9deg, transparent 9deg 18deg)',
          }}
        />
        <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(200,0,0,0.1) 1.4px, transparent 1.6px)', backgroundSize: '9px 9px' }} />
        {/* 赤帯ヘッダー（チラシ） */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 54,
            height: 120,
            backgroundColor: C.crimson,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 40,
            color: '#FFF7CC',
            fontFamily: SERIF,
            fontWeight: 900,
            fontSize: 78,
            letterSpacing: '0.14em',
            boxShadow: '0 10px 0 rgba(0,0,0,0.12)',
          }}
        >
          本日の目玉！
          <span style={{ fontFamily: SANS, fontSize: 34, letterSpacing: '0.06em', color: '#FFFFFF' }}>
            今日も明日も、ずーっと値下げ
          </span>
        </div>

        {/* 旧価格（打ち消し線で積み上がる） */}
        {prices.slice(0, Math.max(0, level - 1)).map((p, i) => (
          <div
            key={`old-${p}`}
            style={{
              position: 'absolute',
              left: 180,
              top: 250 + i * 128,
              fontFamily: MONO,
              fontWeight: 900,
              fontSize: 110,
              color: 'rgba(60,40,20,0.62)',
              transform: `rotate(${-3 + i * 2}deg)`,
            }}
          >
            ¥{p}
            <div
              style={{
                position: 'absolute',
                left: -10,
                right: -10,
                top: '52%',
                height: 12,
                backgroundColor: C.crimson,
                transform: 'rotate(-6deg)',
              }}
            />
          </div>
        ))}

        {/* 現在価格（巨大値札ステッカー） */}
        {level > 0 ? (
          <div
            key={`now-${level}`}
            style={{
              position: 'absolute',
              left: 760,
              top: 230,
              width: 960,
              height: 600,
              transform: `rotate(-4deg) scale(${interpolate(frame - hits[level - 1], [0, 5], [1.6, 1], { ...CLAMP, easing: Easing.out(Easing.back(2.2)) }).toFixed(3)})`,
              backgroundColor: '#FFFFFF',
              border: `14px solid ${C.crimson}`,
              boxShadow: '0 24px 0 rgba(120,30,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 46, color: C.ink, letterSpacing: '0.1em' }}>
              ちょっといい食パン　1斤
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', color: C.crimson, fontFamily: MONO, fontWeight: 900 }}>
              <span style={{ fontSize: 150 }}>¥</span>
              <span style={{ fontSize: 300, lineHeight: 1 }}>{prices[level - 1]}</span>
            </div>
          </div>
        ) : null}

        {/* 「じわじわ」手書き矢印 */}
        <svg width={260} height={430} viewBox="0 0 260 430" style={{ position: 'absolute', left: 500, top: 260 }}>
          <path
            d="M 60 20 C 160 90, 20 170, 120 240 S 90 360, 150 400"
            fill="none"
            stroke={C.crimson}
            strokeWidth={10}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - interpolate(frame, [at(28.84), at(29.4)], [0, 1], CLAMP)}
          />
          <polygon points="130,392 178,388 150,428" fill={C.crimson} opacity={frame >= at(29.35) ? 1 : 0} />
        </svg>
        <div
          style={{
            position: 'absolute',
            left: 420,
            top: 700,
            fontFamily: SERIF,
            fontWeight: 900,
            fontSize: 70,
            color: C.crimson,
            transform: 'rotate(-8deg)',
            opacity: interpolate(frame, [at(28.9), at(29.1)], [0, 1], CLAMP),
          }}
        >
          じわじわ
        </div>
      </AbsoluteFill>
      <CutGlitch frames={3} />
    </AbsoluteFill>
  );
};

const Sticker: React.FC<{ text: string; x: number; y: number; enterFrame: number; bg: string; color?: string; size?: number; rotate?: number; burst?: boolean }> = ({
  text,
  x,
  y,
  enterFrame,
  bg,
  color = C.ink,
  size = 300,
  rotate = -8,
  burst = false,
}) => {
  const { frame } = useBeat(0);
  const lf = frame - enterFrame;
  if (lf < 0) return null;
  const sc = interpolate(lf, [0, 6], [0.2, 1], { ...CLAMP, easing: Easing.out(Easing.back(2.6)) });
  const pts: string[] = [];
  const n = 18;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 50 : 41;
    const a = (Math.PI * i) / n;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)}% ${(50 + r * Math.sin(a)).toFixed(1)}%`);
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        transform: `rotate(${rotate}deg) scale(${sc.toFixed(3)})`,
        filter: 'drop-shadow(0 12px 16px rgba(0,0,0,0.35))',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: bg,
          clipPath: burst ? `polygon(${pts.join(', ')})` : 'circle(50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: SERIF,
          fontWeight: 900,
          fontSize: size * 0.2,
          color,
          textAlign: 'center',
          lineHeight: 1.1,
          whiteSpace: 'pre-line',
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** b11: 明るい撮影スタジオ実写＋「お得！」ステッカー＋皮肉の注釈。 */
export const B11Grateful: React.FC<BeatProps> = ({ t0, dur }) => {
  const { at } = useBeat(t0);
  return (
    <AbsoluteFill>
      <Clip clip="studio" durFrames={dur} trimSec={0.5} grade="bright" zoom={[1.04, 1.1]} origin="45% 45%" />
      <CutGlitch frames={3} flash />
      <Sticker text="お得！" x={1560} y={280} enterFrame={at(31.0)} bg="#FFE14D" color={C.crimson} size={330} burst rotate={10} />
      <Sticker text={'ありが\nたい！'} x={330} y={300} enterFrame={at(31.5)} bg="#FF8FB1" color="#FFFFFF" size={290} rotate={-10} />
      <Clipping x={300} y={640} w={1320} rotate={-1} enterFrame={at(32.05)} from="drop" seed={12} tone="#FFFDF7" padding="20px 36px 24px">
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 44, textAlign: 'center' }}>
          ※ただし、あなたの<span style={{ color: C.crimson }}>給料</span>も「据え置き価格」です。
        </div>
      </Clipping>
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* Shot 4 (33.00–42.36) 欧米 vs 日本の30年                                      */
/* ========================================================================== */

const SplitLabel: React.FC<{ side: 'left' | 'right'; title: string; sub: string; value: string; enterFrame: number; valueFrame: number }> = ({
  side,
  title,
  sub,
  value,
  enterFrame,
  valueFrame,
}) => {
  const { frame } = useBeat(0);
  const lf = frame - enterFrame;
  if (lf < 0) return null;
  const sl = interpolate(lf, [0, 9], [-60, 0], { ...CLAMP, easing: EASE_OUT });
  const vOn = frame >= valueFrame;
  const vSc = interpolate(frame - valueFrame, [0, 6], [1.5, 1], { ...CLAMP, easing: Easing.out(Easing.back(2)) });
  return (
    <div
      style={{
        position: 'absolute',
        top: 120,
        left: side === 'left' ? 110 : 1070,
        transform: `translateY(${sl}px)`,
        opacity: interpolate(lf, [0, 5], [0, 1], CLAMP),
        color: '#fff',
        textShadow: '0 4px 18px rgba(0,0,0,0.8)',
      }}
    >
      <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: 40, letterSpacing: '0.16em' }}>{title}</div>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 26, opacity: 0.9, marginTop: 4 }}>{sub}</div>
      {vOn ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14, transform: `scale(${vSc.toFixed(3)})`, transformOrigin: 'left center' }}>
          <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 116, color: C.emeraldBright, lineHeight: 1 }}>{value}</span>
          <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 70, color: C.emeraldBright }}>▲</span>
        </div>
      ) : null}
    </div>
  );
};

/** b12: 左右スプリット実写（星条旗のボート／EU旗の報道スタジオ）＋実質賃金の伸び。 */
export const B12SplitWest: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const split = interpolate(frame, [0, 8], [0, 1], { ...CLAMP, easing: EASE_OUT });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 957, overflow: 'hidden', transform: `translateX(${((1 - split) * -400).toFixed(1)}px)` }}>
        <Clip clip="boat" durFrames={dur} trimSec={0.5} grade="warm" zoom={[1.05, 1.12]} objectPosition="62% 40%" />
        <Vignette strength={0.55} />
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 957, overflow: 'hidden', transform: `translateX(${((1 - split) * 400).toFixed(1)}px)` }}>
        <Clip clip="news" durFrames={dur} trimSec={0} grade="cool" zoom={[1.15, 1.22]} objectPosition="35% 40%" origin="40% 40%" />
        <Vignette strength={0.55} />
      </div>
      <div style={{ position: 'absolute', left: 957, top: 0, bottom: 0, width: 6, backgroundColor: '#F8FAFC' }} />
      <SubShade strength={0.7} />
      <div
        style={{
          position: 'absolute',
          top: 62,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: MONO,
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: '0.22em',
          color: 'rgba(255,255,255,0.88)',
          textShadow: '0 2px 8px rgba(0,0,0,0.8)',
        }}
      >
        REAL WAGES ／ 1991 → 2020
      </div>
      <SplitLabel side="left" title="USA" sub="アメリカの実質賃金" value="+47%" enterFrame={at(33.1)} valueFrame={at(35.6)} />
      <SplitLabel side="right" title="EUROPE" sub="ドイツの実質賃金" value="+34%" enterFrame={at(33.25)} valueFrame={at(36.05)} />
    </AbsoluteFill>
  );
};

type Series = { id: string; label: string; color: string; pts: readonly number[]; labelDy: number };

const YEARS = [1991, 1995, 2000, 2005, 2010, 2015, 2020] as const;
const SERIES: readonly Series[] = [
  { id: 'us', label: 'アメリカ', color: '#0072B2', pts: [100, 103, 115, 121, 127, 134, 148], labelDy: -10 },
  { id: 'uk', label: 'イギリス', color: '#7C3AED', pts: [100, 104, 117, 128, 131, 133, 144], labelDy: 14 },
  { id: 'de', label: 'ドイツ', color: '#B45309', pts: [100, 104, 108, 109, 113, 123, 134], labelDy: -8 },
  { id: 'fr', label: 'フランス', color: '#0F766E', pts: [100, 104, 110, 117, 123, 127, 131], labelDy: 18 },
];
const JAPAN: Series = { id: 'jp', label: '日本', color: '#CC0000', pts: [100, 103, 104, 103, 102, 101, 103], labelDy: 0 };

const CX0 = 90;
const CX1 = 1010;
const CY0 = 520;
const CY1 = 40;
const sx = (i: number) => CX0 + (i / (YEARS.length - 1)) * (CX1 - CX0);
const sy = (v: number) => CY0 - ((v - 95) / (155 - 95)) * (CY0 - CY1);
const pathOf = (pts: readonly number[]) => pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');

/** b13: 物理オーク木枠ホワイトボード — 欧米4本が伸び、日本だけ水平。 */
export const B13Whiteboard: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 22, stiffness: 260 } });
  const westP = interpolate(frame, [at(37.05), at(38.6)], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const jpP = interpolate(frame, [at(39.15), at(40.0)], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const ringP = interpolate(frame, [at(40.25), at(40.75)], [0, 1], { ...CLAMP, easing: EASE_OUT });
  const cam = interpolate(frame, [at(39.1), dur], [1, 1.06], { ...CLAMP, easing: Easing.inOut(Easing.sin) });
  const avatarIn = spring({ frame: frame - at(37.0), fps, config: { damping: 16, stiffness: 180 } });
  return (
    <AbsoluteFill style={{ backgroundColor: '#D6DBE2', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 90% 85% at 50% 40%, #EEF1F4 0%, #CBD2DB 72%, #B3BCC8 100%)' }} />
      <AbsoluteFill style={{ transform: `scale(${cam.toFixed(4)})`, transformOrigin: '78% 62%' }}>
        <div
          style={{
            position: 'absolute',
            left: 96,
            right: 96,
            top: 56,
            bottom: 206,
            padding: 18,
            borderRadius: 8,
            background: 'linear-gradient(145deg, #B47B44 0%, #8C5828 52%, #70421B 100%)',
            boxShadow: '0 26px 56px rgba(15,23,42,0.34), inset 0 2px 3px rgba(255,255,255,0.28)',
            transform: `scale(${interpolate(enter, [0, 1], [0.96, 1]).toFixed(4)})`,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              backgroundColor: '#FAFBFC',
              borderRadius: 3,
              boxShadow: 'inset 0 3px 12px rgba(15,23,42,0.12)',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(125deg, rgba(255,255,255,0.6) 0%, transparent 36%)' }} />
            <div style={{ position: 'absolute', left: 340, top: 26, color: C.ink }}>
              <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 44 }}>実質賃金の30年</div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 22, color: '#475569', marginTop: 2 }}>1991年＝100 とした指数</div>
            </div>
            <svg viewBox="0 0 1200 560" style={{ position: 'absolute', left: 380, top: 120, width: 1160, height: 542 }}>
              {[100, 110, 120, 130, 140, 150].map((v) => (
                <g key={`gy-${v}`}>
                  <line x1={CX0} y1={sy(v)} x2={CX1} y2={sy(v)} stroke="#CBD5E1" strokeWidth={1.4} strokeDasharray="5 6" />
                  <text x={CX0 - 14} y={sy(v) + 7} textAnchor="end" fontFamily={MONO} fontSize={20} fontWeight={700} fill="#64748B">
                    {v}
                  </text>
                </g>
              ))}
              {YEARS.map((y, i) => (
                <text key={`yx-${y}`} x={sx(i)} y={CY0 + 34} textAnchor="middle" fontFamily={MONO} fontSize={20} fontWeight={700} fill="#64748B">
                  {y}
                </text>
              ))}
              <line x1={CX0} y1={CY0} x2={CX1} y2={CY0} stroke="#334155" strokeWidth={2.5} />
              {SERIES.map((s) => (
                <g key={s.id}>
                  <path
                    d={pathOf(s.pts)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - westP}
                    opacity={jpP > 0 ? 0.55 : 1}
                  />
                  {westP >= 0.98 ? (
                    <text x={CX1 + 16} y={sy(s.pts[6]) + 8 + s.labelDy} fontFamily={SANS} fontWeight={900} fontSize={25} fill={s.color} opacity={jpP > 0 ? 0.6 : 1}>
                      {s.label} {s.pts[6]}
                    </text>
                  ) : null}
                </g>
              ))}
              <path
                d={pathOf(JAPAN.pts)}
                fill="none"
                stroke={JAPAN.color}
                strokeWidth={13}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - jpP}
              />
              {jpP >= 0.98 ? (
                <text x={CX1 + 16} y={sy(103) + 12} fontFamily={SERIF} fontWeight={900} fontSize={40} fill={JAPAN.color}>
                  日本 103
                </text>
              ) : null}
              <ellipse
                cx={CX1 + 90}
                cy={sy(103)}
                rx={112}
                ry={44}
                fill="none"
                stroke={C.crimson}
                strokeWidth={6}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - ringP}
                transform={`rotate(-5 ${CX1 + 90} ${sy(103)})`}
              />
              {frame >= at(40.55) ? (
                <text x={620} y={sy(103) - 34} fontFamily={SERIF} fontWeight={900} fontSize={46} fill={C.crimson} transform={`rotate(-4 620 ${sy(103) - 34})`}>
                  ほぼ横ばい
                </text>
              ) : null}
            </svg>
          </div>
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 70,
          bottom: 196,
          transform: `translateX(${interpolate(avatarIn, [0, 1], [-420, 0]).toFixed(1)}px)`,
          zIndex: 10,
        }}
      >
        <EconHostAvatar pose={frame >= at(39.15) ? 'pointer_stick' : 'open_hands'} emblem="¥?" scale={0.95} />
      </div>
    </AbsoluteFill>
  );
};

