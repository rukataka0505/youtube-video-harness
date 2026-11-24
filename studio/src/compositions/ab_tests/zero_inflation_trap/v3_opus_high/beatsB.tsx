import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useVideoConfig } from 'remotion';
import { EconHostAvatar, WORLD_COUNTRIES, WORLD_MAP_VIEWBOX } from '../../../../components/plan_e';
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
  SANS,
  SERIF,
  Stamp,
  SubShade,
  VhsOverlay,
  Vignette,
  impactShake,
  useBeat,
} from './kit';
import type { BeatProps } from './beatsA';

/* ========================================================================== */
/* Shot 5 (42.36–49.44) 「犯人は誰だ」報道 → 指名手配ポスターに無罪判子             */
/* ========================================================================== */

/** b14: 報道特集（キャスター寄りのクロップ）＋特集帯。 */
export const B14Special: React.FC<BeatProps> = ({ t0, dur }) => {
  const { at } = useBeat(t0);
  return (
    <AbsoluteFill>
      <Clip clip="news" durFrames={dur} trimSec={0.4} grade="cool" zoom={[1.55, 1.68]} origin="58% 40%" />
      <Vignette strength={0.6} />
      <CutGlitch frames={5} flash />
      <NewsBug desk="思考実験ニュース　特集" clock="CASE 001" />
      <NewsChyron
        label="特集"
        headline="給料が止まった国　真犯人は誰だ"
        enterFrame={at(42.5)}
        ticker={['容疑者A：悪徳企業？', '容疑者B：怠けた労働者？', '捜査は難航', '30年間 未解決']}
      />
    </AbsoluteFill>
  );
};

const WantedPoster: React.FC<{
  x: number;
  rotate: number;
  enterFrame: number;
  suspect: string;
  name: string;
  clip: 'cash' | 'street';
  trimSec: number;
  dur: number;
  objectPosition: string;
}> = ({ x, rotate, enterFrame, suspect, name, clip, trimSec, dur, objectPosition }) => {
  const { frame } = useBeat(0);
  const { fps } = useVideoConfig();
  if (frame < enterFrame) return null;
  const s = spring({ frame: frame - enterFrame, fps, config: { damping: 15, stiffness: 230 } });
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 96,
        width: 620,
        height: 760,
        transform: `translateY(${((1 - s) * -900).toFixed(1)}px) rotate(${rotate}deg)`,
        backgroundColor: '#EADCB8',
        backgroundImage: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.35), transparent 60%), radial-gradient(rgba(90,60,20,0.08) 1px, transparent 1.3px)',
        backgroundSize: '100% 100%, 6px 6px',
        boxShadow: '0 24px 44px rgba(0,0,0,0.5)',
        padding: '26px 40px',
        boxSizing: 'border-box',
        color: '#2A1A0C',
        textAlign: 'center',
      }}
    >
      {/* 押しピン */}
      <div style={{ position: 'absolute', left: '50%', top: -12, width: 34, height: 34, marginLeft: -17, borderRadius: 17, background: 'radial-gradient(circle at 35% 35%, #FCA5A5, #B91C1C 60%, #7F1D1D)', boxShadow: '0 6px 10px rgba(0,0,0,0.5)' }} />
      <div style={{ fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 92, letterSpacing: '0.08em', lineHeight: 1 }}>WANTED</div>
      <div style={{ height: 3, backgroundColor: '#2A1A0C', margin: '12px 0' }} />
      <div style={{ position: 'relative', width: '100%', height: 330, overflow: 'hidden', border: '5px solid #2A1A0C' }}>
        <Clip clip={clip} durFrames={dur} trimSec={trimSec} grade="mono" zoom={[1.2, 1.28]} objectPosition={objectPosition} extraFilter="sepia(0.45)" />
      </div>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 28, letterSpacing: '0.2em', marginTop: 16 }}>{suspect}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 78, lineHeight: 1.15 }}>{name}</div>
    </div>
  );
};

/** b15: コルクボードの指名手配2枚（実写動画入り）→「無罪」判子。 */
export const B15Wanted: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const sA = at(46.55);
  const sB = at(48.35);
  const sh = impactShake(frame, [sA + 3, sB + 3], 11);
  return (
    <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
      <AbsoluteFill style={{ backgroundColor: '#9A6B3F' }} />
      <AbsoluteFill
        style={{
          backgroundImage:
            'radial-gradient(rgba(60,30,10,0.35) 1.2px, transparent 1.6px), radial-gradient(rgba(255,220,170,0.18) 1px, transparent 1.4px)',
          backgroundSize: '9px 9px, 13px 13px',
          backgroundPosition: '0 0, 4px 6px',
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 75% at 50% 45%, transparent 45%, rgba(30,14,4,0.6) 100%)' }} />
      {/* 赤い捜査線 */}
      {frame >= at(47.3) ? (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, zIndex: 5 }}>
          <path d="M 560 92 Q 960 260 1350 92" fill="none" stroke="#B91C1C" strokeWidth={5} />
        </svg>
      ) : null}
      <WantedPoster x={250} rotate={-3} enterFrame={at(45.4)} suspect="容疑者 A" name="悪徳企業" clip="cash" trimSec={0} dur={dur} objectPosition="40% 50%" />
      <WantedPoster x={1040} rotate={2.6} enterFrame={at(47.25)} suspect="容疑者 B" name="怠けた労働者" clip="street" trimSec={2.0} dur={dur} objectPosition="30% 45%" />
      <Stamp text="無罪" x={560} y={430} enterFrame={sA} size={170} rotate={-16} blend={false} />
      <Stamp text="無罪" x={1350} y={440} enterFrame={sB} size={170} rotate={12} blend={false} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* Shot 6 (49.44–59.48) 企業×消費者のデフレ・インセンティブループ                    */
/* ========================================================================== */

const QuoteClip: React.FC<{ who: string; whoColor: string; lines: readonly string[]; x: number; y: number; w: number; enterFrame: number; rotate: number; seed: number; from: 'left' | 'right' }> = ({
  who,
  whoColor,
  lines,
  x,
  y,
  w,
  enterFrame,
  rotate,
  seed,
  from,
}) => (
  <Clipping x={x} y={y} w={w} rotate={rotate} enterFrame={enterFrame} from={from} seed={seed} padding="26px 38px 34px">
    <div style={{ display: 'inline-block', backgroundColor: whoColor, color: '#fff', fontFamily: SANS, fontWeight: 900, fontSize: 28, letterSpacing: '0.2em', padding: '4px 16px' }}>
      {who}の本音
    </div>
    <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 58, lineHeight: 1.28, marginTop: 12 }}>
      {lines.map((l, i) => (
        <div key={`q-${i}`}>{i === 0 ? `「${l}` : l}{i === lines.length - 1 ? '」' : ''}</div>
      ))}
    </div>
  </Clipping>
);

/** b16: 紙幣の実写を青く凍らせ、企業の本音＋値札が氷漬けになる。 */
export const B16PriceFreeze: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const iceF = at(52.3);
  const ice = interpolate(frame, [iceF, iceF + 8], [0, 1], { ...CLAMP, easing: EASE_OUT });
  const frost = interpolate(frame, [iceF - 4, iceF + 20], [0, 1], CLAMP);
  const sh = impactShake(frame, [iceF + 6], 8);
  return (
    <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
      <Clip clip="cash" durFrames={dur} trimSec={0} grade="icy" zoom={[1.04, 1.12]} />
      <Vignette strength={0.55} color="10,30,50" />
      <AbsoluteFill
        style={{
          opacity: frost,
          background: 'radial-gradient(ellipse 75% 70% at 50% 50%, transparent 45%, rgba(200,235,255,0.55) 85%, rgba(235,248,255,0.85) 100%)',
        }}
      />
      <SubShade />
      <CutGlitch frames={4} />
      <QuoteClip who="企業" whoColor={C.blue} lines={['値上げしたら、', '客が逃げる。']} x={110} y={130} w={760} enterFrame={at(49.6)} rotate={-2} seed={21} from="left" />
      {/* 値札 */}
      <div style={{ position: 'absolute', left: 1180, top: 250, width: 520, height: 460 }}>
        <div
          style={{
            position: 'absolute',
            left: 90,
            top: 90,
            width: 340,
            height: 280,
            backgroundColor: '#FFFFFF',
            border: `10px solid ${C.crimson}`,
            transform: 'rotate(6deg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 16px 26px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 30, color: C.ink }}>いつもの価格</div>
          <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: 130, color: C.crimson, lineHeight: 1 }}>¥100</div>
        </div>
        {ice > 0 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 34,
              transform: `scale(${interpolate(ice, [0, 1], [0.6, 1]).toFixed(3)}) rotate(-3deg)`,
              opacity: ice,
              background:
                'linear-gradient(150deg, rgba(255,255,255,0.75) 0%, rgba(186,230,253,0.42) 28%, rgba(125,211,252,0.3) 60%, rgba(224,242,254,0.6) 100%)',
              border: '4px solid rgba(255,255,255,0.85)',
              boxShadow: 'inset 0 0 40px rgba(255,255,255,0.7), inset -20px -30px 60px rgba(56,189,248,0.35), 0 20px 40px rgba(8,47,73,0.45)',
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 520 460" style={{ position: 'absolute', inset: 0 }}>
              <path d="M 40 60 L 150 140 L 130 220 L 210 300" stroke="rgba(255,255,255,0.85)" strokeWidth={3} fill="none" />
              <path d="M 470 80 L 380 170 L 420 260" stroke="rgba(255,255,255,0.7)" strokeWidth={2.5} fill="none" />
              <path d="M 300 430 L 340 350 L 300 300" stroke="rgba(255,255,255,0.7)" strokeWidth={2.5} fill="none" />
              <rect x={36} y={26} width={140} height={22} rx={11} fill="rgba(255,255,255,0.75)" transform="rotate(-12 106 37)" />
            </svg>
          </div>
        ) : null}
        <Stamp text="価格凍結" x={260} y={430} enterFrame={at(52.75)} size={72} rotate={-8} color={C.blue} blend={false} />
      </div>
    </AbsoluteFill>
  );
};

/** b17: 雑踏の実写＋消費者の本音＋財布のファスナーが閉まる。 */
export const B17Wallet: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const zip = interpolate(frame, [at(55.9), at(56.8)], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const lockOn = frame >= at(56.8);
  const sh = impactShake(frame, [at(56.8)], 7);
  return (
    <AbsoluteFill>
      <Clip clip="street" durFrames={dur} trimSec={1.5} grade="warm" zoom={[1.12, 1.18]} pan={[20, -20]} extraFilter="saturate(0.7)" />
      <Vignette strength={0.62} />
      <SubShade />
      <CutGlitch frames={4} />
      <QuoteClip
        who="消費者"
        whoColor={C.goldDeep}
        lines={['給料が増えないから、', '安い店しか行かない。']}
        x={960}
        y={120}
        w={860}
        enterFrame={at(54.1)}
        rotate={2}
        seed={33}
        from="right"
      />
      {/* 財布 */}
      <div style={{ position: 'absolute', left: 170, top: 330, width: 560, height: 400, transform: `translate(${sh.x}px, ${sh.y}px) rotate(-5deg)` }}>
        <svg width={560} height={400} viewBox="0 0 560 400" style={{ overflow: 'visible', filter: 'drop-shadow(0 22px 26px rgba(0,0,0,0.55))' }}>
          <defs>
            <linearGradient id="v3-leather" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B5A2B" />
              <stop offset="100%" stopColor="#5C3A1A" />
            </linearGradient>
          </defs>
          {/* 中身の紙幣（閉じると隠れる） */}
          <g opacity={1 - zip}>
            <rect x={70} y={40 + zip * 60} width={200} height={110} fill="#E7E2C9" stroke="#8A8460" strokeWidth={3} transform="rotate(-8 170 95)" />
            <rect x={250} y={30 + zip * 60} width={200} height={110} fill="#DCE8D2" stroke="#6F8A60" strokeWidth={3} transform="rotate(7 350 85)" />
            <text x={175} y={110} fontFamily={SERIF} fontWeight={900} fontSize={54} fill="#5B5530" transform="rotate(-8 170 95)">¥</text>
            <text x={335} y={100} fontFamily={SERIF} fontWeight={900} fontSize={54} fill="#3F5A30" transform="rotate(7 350 85)">¥</text>
          </g>
          <rect x={20} y={110} width={520} height={270} rx={34} fill="url(#v3-leather)" stroke="#3B2410" strokeWidth={5} />
          <rect x={44} y={134} width={472} height={222} rx={24} fill="none" stroke="rgba(255,230,190,0.45)" strokeWidth={3} strokeDasharray="10 9" />
          {/* ファスナー */}
          <line x1={40} y1={120} x2={520} y2={120} stroke="#2A2A2A" strokeWidth={10} strokeDasharray="6 4" />
          <line x1={40} y1={120} x2={40 + 480 * zip} y2={120} stroke="#C9A227" strokeWidth={12} />
          <g transform={`translate(${40 + 480 * zip}, 120)`}>
            <rect x={-16} y={-14} width={32} height={28} rx={6} fill="#D4AF37" stroke="#7A5E12" strokeWidth={3} />
            <rect x={-7} y={12} width={14} height={40} rx={5} fill="#D4AF37" stroke="#7A5E12" strokeWidth={3} />
          </g>
          {lockOn ? (
            <g transform="translate(470, 300)">
              <path d="M -26 -8 L -26 -34 A 26 26 0 0 1 26 -34 L 26 -8" fill="none" stroke="#E5E7EB" strokeWidth={10} />
              <rect x={-40} y={-10} width={80} height={64} rx={10} fill="#E5E7EB" stroke="#374151" strokeWidth={4} />
              <circle cx={0} cy={18} r={8} fill="#374151" />
            </g>
          ) : null}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

/** b18: 左右スプリット実写（企業の紙幣／消費者の雑踏）を回転する「抜けないループ」が貫く。 */
export const B18Loop: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const { fps } = useVideoConfig();
  const ringIn = spring({ frame: frame - at(57.1), fps, config: { damping: 14, stiffness: 200 } });
  const rot = (frame / fps) * 38;
  const R = 250;
  const ringPath = `M 0 ${-R} A ${R} ${R} 0 1 1 0 ${R} A ${R} ${R} 0 1 1 0 ${-R}`;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 957, overflow: 'hidden' }}>
        <Clip clip="cash" durFrames={dur} trimSec={4.4} grade="icy" zoom={[1.1, 1.16]} />
        <Vignette strength={0.6} />
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 957, overflow: 'hidden' }}>
        <Clip clip="street" durFrames={dur} trimSec={5.0} grade="warm" zoom={[1.12, 1.18]} extraFilter="saturate(0.7)" objectPosition="60% 50%" />
        <Vignette strength={0.6} />
      </div>
      <div style={{ position: 'absolute', left: 957, top: 0, bottom: 0, width: 6, backgroundColor: '#F8FAFC' }} />
      <SubShade strength={0.7} />
      <div style={{ position: 'absolute', left: 110, top: 70, fontFamily: SANS, fontWeight: 900, fontSize: 46, color: '#fff', letterSpacing: '0.12em', textShadow: '0 3px 14px rgba(0,0,0,0.8)' }}>
        <span style={{ backgroundColor: C.blue, padding: '2px 14px' }}>企業</span>　値上げできない
      </div>
      <div style={{ position: 'absolute', right: 110, top: 70, fontFamily: SANS, fontWeight: 900, fontSize: 46, color: '#fff', letterSpacing: '0.12em', textShadow: '0 3px 14px rgba(0,0,0,0.8)' }}>
        買えない　<span style={{ backgroundColor: C.goldDeep, padding: '2px 14px' }}>消費者</span>
      </div>
      <svg
        width={720}
        height={720}
        viewBox="-360 -360 720 720"
        style={{ position: 'absolute', left: 960 - 360, top: 470 - 360, transform: `scale(${ringIn.toFixed(3)})`, overflow: 'visible' }}
      >
        <defs>
          <path id="v3-loop-ring" d={ringPath} />
        </defs>
        <circle r={R} fill="none" stroke="rgba(18,20,23,0.88)" strokeWidth={86} />
        <circle r={R + 43} fill="none" stroke={C.gold} strokeWidth={4} />
        <circle r={R - 43} fill="none" stroke={C.gold} strokeWidth={4} />
        <g transform={`rotate(${rot.toFixed(2)})`}>
          <text fontFamily={SANS} fontWeight={900} fontSize={36} fill="#FDE68A" letterSpacing="2">
            <textPath href="#v3-loop-ring" startOffset="0">
              値上げできない ▶ 給料が上がらない ▶ 安い店しか行かない ▶ もっと値下げ ▶
            </textPath>
          </text>
        </g>
        <circle r={R - 50} fill="rgba(26,5,5,0.78)" />
        <text y={-14} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={70} fill="#FFFFFF">
          抜けない
        </text>
        <text y={70} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={70} fill={C.red}>
          ループ
        </text>
      </svg>
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* Shot 7 (59.48–69.19) 合成の誤謬                                             */
/* ========================================================================== */

const CHECKS: readonly { x: number; y: number; t: number; r: number }[] = [
  { x: 360, y: 370, t: 59.9, r: -8 },
  { x: 1480, y: 430, t: 60.4, r: 6 },
  { x: 820, y: 320, t: 60.85, r: -4 },
  { x: 1180, y: 630, t: 61.25, r: 9 },
  { x: 220, y: 670, t: 61.6, r: -10 },
  { x: 1700, y: 300, t: 61.95, r: 5 },
  { x: 610, y: 590, t: 62.25, r: 7 },
  { x: 1020, y: 470, t: 62.55, r: -6 },
  { x: 1400, y: 770, t: 62.8, r: -9 },
  { x: 470, y: 830, t: 63.05, r: 4 },
  { x: 1620, y: 630, t: 63.3, r: -3 },
  { x: 900, y: 760, t: 63.5, r: 8 },
];

const CheckSwarm: React.FC<{ t0: number; drained: number }> = ({ t0, drained }) => {
  const { frame, at } = useBeat(t0);
  return (
    <>
      {CHECKS.map((c, i) => {
        const f0 = at(c.t);
        if (frame < f0) return null;
        const sc = interpolate(frame - f0, [0, 5], [1.9, 1], { ...CLAMP, easing: Easing.out(Easing.back(2.4)) });
        const col = drained > 0 ? `rgba(148,163,184,${1 - drained * 0.55})` : C.emeraldBright;
        return (
          <div
            key={`ck-${i}`}
            style={{
              position: 'absolute',
              left: c.x,
              top: c.y,
              transform: `translate(-50%, -50%) rotate(${c.r}deg) scale(${sc.toFixed(3)})`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              border: `5px solid ${col}`,
              color: col,
              backgroundColor: 'rgba(5,20,10,0.45)',
              padding: '4px 18px 4px 12px',
              fontFamily: SANS,
              fontWeight: 900,
              fontSize: 38,
              letterSpacing: '0.08em',
              textShadow: '0 2px 8px rgba(0,0,0,0.6)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 46 }}>✓</span>合理的
          </div>
        );
      })}
    </>
  );
};

/** b19: 雑踏の一人ひとりに「✓合理的」が次々と押される。 */
export const B19Rational: React.FC<BeatProps> = ({ t0, dur }) => {
  const { at } = useBeat(t0);
  return (
    <AbsoluteFill>
      <Clip clip="street" durFrames={dur} trimSec={0.3} rate={0.9} grade="bright" zoom={[1.02, 1.1]} extraFilter="contrast(1.06) brightness(0.86)" />
      <Vignette strength={0.55} />
      <SubShade />
      <CutGlitch frames={4} flash />
      <CheckSwarm t0={t0} drained={0} />
      <Kicker text="一人ひとりは、正解。" x={96} y={64} enterFrame={at(62.7)} size={84} tag="個人" tagColor={C.emerald} underline={C.emeraldBright} />
    </AbsoluteFill>
  );
};

/** b20: 「静かに止まり続けた」— 映像がフリーズし色が抜け、合成の誤謬の切り抜き。 */
export const B20Fallacy: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const drain = interpolate(frame, [0, at(66.6)], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.sin) });
  return (
    <AbsoluteFill>
      <Clip
        clip="street"
        durFrames={dur}
        trimSec={5.39}
        freeze
        grade="none"
        zoom={[1.1, 1.16]}
        extraFilter={`grayscale(${drain.toFixed(3)}) contrast(1.06) brightness(${(0.86 - drain * 0.18).toFixed(3)})`}
      />
      <Vignette strength={0.7} />
      <SubShade />
      <CheckSwarm t0={100} drained={drain} />
      {frame >= at(65.35) ? <VhsOverlay label="II STOP" timecode="1995 → 2025" /> : null}
      <Kicker text="国全体では、不正解。" x={96} y={190} enterFrame={at(66.3)} size={88} tag="国" tagColor={C.crimson} underline={C.red} />
      <Clipping x={1200} y={430} w={600} rotate={3} enterFrame={at(67.3)} from="drop" seed={41} padding="24px 34px 30px">
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 24, color: C.crimson, letterSpacing: '0.22em' }}>経済用語メモ</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 76, lineHeight: 1.15, marginTop: 4 }}>合成の誤謬</div>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, color: C.inkSoft, marginTop: 8, lineHeight: 1.45 }}>
          一人ひとりの正解が、
          <br />
          全体の不正解になること。
        </div>
      </Clipping>
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* Shot 8 (69.19–82.01) 激安の罠 → 日銀が刷っても抜けない → 解剖へ                   */
/* ========================================================================== */

/** b21: 暗闇のスポットライトにネズミ捕り。エサは「激安」の値札。 */
export const B21Trap: React.FC<BeatProps> = ({ t0 }) => {
  const { frame, at } = useBeat(t0);
  const light = interpolate(frame, [at(69.35), at(69.8)], [0, 1], CLAMP);
  const snapF = at(72.15);
  const snap = interpolate(frame, [snapF, snapF + 3], [-1, 1], { ...CLAMP, easing: Easing.in(Easing.quad) });
  const flash = interpolate(frame, [snapF + 2, snapF + 6], [0.8, 0], CLAMP);
  const sh = impactShake(frame, [snapF + 3], 20);
  const sway = frame < snapF ? Math.sin(frame / 7) * 4 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#07080A' }}>
      <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
        <AbsoluteFill
          style={{
            opacity: light,
            background: 'radial-gradient(ellipse 34% 40% at 50% 62%, rgba(255,236,190,0.42) 0%, rgba(255,220,160,0.12) 55%, transparent 100%)',
          }}
        />
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, opacity: light }}>
          <defs>
            <linearGradient id="v3-wood" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#B7804A" />
              <stop offset="50%" stopColor="#CF9A62" />
              <stop offset="100%" stopColor="#A86F3C" />
            </linearGradient>
            <linearGradient id="v3-cone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,240,200,0.22)" />
              <stop offset="100%" stopColor="rgba(255,240,200,0.0)" />
            </linearGradient>
          </defs>
          <polygon points="900,0 1020,0 1380,860 540,860" fill="url(#v3-cone)" />
          <ellipse cx={960} cy={790} rx={470} ry={50} fill="rgba(0,0,0,0.5)" />
          {/* 台座 */}
          <rect x={560} y={540} width={800} height={240} rx={14} fill="url(#v3-wood)" stroke="#5B3A17" strokeWidth={5} />
          {[580, 620, 680, 730].map((yy) => (
            <path key={`gr-${yy}`} d={`M 580 ${yy} C 760 ${yy - 14}, 1100 ${yy + 14}, 1340 ${yy - 4}`} stroke="rgba(91,58,23,0.35)" strokeWidth={3} fill="none" />
          ))}
          {/* スプリング */}
          {[0, 1, 2, 3, 4].map((i) => (
            <ellipse key={`sp-${i}`} cx={930 + i * 14} cy={660} rx={12} ry={34} fill="none" stroke="#9CA3AF" strokeWidth={6} />
          ))}
          {/* エサ台＋値札 */}
          <rect x={1120} y={630} width={110} height={60} rx={8} fill="#D1D5DB" stroke="#4B5563" strokeWidth={4} />
          <g transform={`translate(1175, 560) rotate(${(sway + (frame >= snapF ? 24 : 0)).toFixed(2)})`}>
            <line x1={0} y1={70} x2={0} y2={20} stroke="#E5E7EB" strokeWidth={3} />
            <rect x={-95} y={-110} width={190} height={130} rx={8} fill="#FFE14D" stroke={C.crimson} strokeWidth={7} />
            <text x={0} y={-62} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={40} fill={C.crimson}>
              激安
            </text>
            <text x={0} y={2} textAnchor="middle" fontFamily={MONO} fontWeight={900} fontSize={54} fill={C.ink}>
              ¥100
            </text>
          </g>
          {/* 打撃バー（蝶番 x=960 を軸に開→閉） */}
          <g transform={`translate(960 0) scale(${snap.toFixed(3)} 1) translate(-960 0)`}>
            <path d="M 960 572 L 1290 572 L 1290 752 L 960 752" fill="none" stroke="#D1D5DB" strokeWidth={12} strokeLinejoin="round" />
          </g>
          <line x1={960} y1={556} x2={960} y2={768} stroke="#6B7280" strokeWidth={8} />
        </svg>
        <Kicker text="罠は、いつも「お得」に見える。" x={96} y={110} enterFrame={at(70.3)} size={74} />
      </AbsoluteFill>
      {flash > 0 ? <AbsoluteFill style={{ backgroundColor: `rgba(255,255,255,${flash})` }} /> : null}
      {frame >= snapF + 2 ? <Stamp text="激安の罠" x={1500} y={330} enterFrame={snapF + 2} size={96} rotate={-10} blend={false} /> : null}
    </AbsoluteFill>
  );
};

/** b22: 紙幣実写（エメラルド）＋日銀資産カウンターが積み上がる。 */
export const B22Printing: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const p = interpolate(frame, [at(73.3), at(75.7)], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const yen = Math.round(158 + p * (750 - 158));
  const year = Math.round(2012 + p * 11);
  return (
    <AbsoluteFill>
      <Clip clip="cash" durFrames={dur} trimSec={1.5} grade="emerald" zoom={[1.06, 1.16]} origin="40% 50%" />
      <Vignette strength={0.66} color="2,12,6" />
      <SubShade />
      <CutGlitch frames={5} flash />
      <div style={{ position: 'absolute', left: 110, top: 96, color: '#fff', textShadow: '0 4px 22px rgba(0,0,0,0.85)' }}>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 34, letterSpacing: '0.16em' }}>
          中央銀行（日本銀行）の資産
          <span style={{ fontFamily: MONO, marginLeft: 22, color: '#BBF7D0' }}>{year}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
          <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 62, color: '#BBF7D0' }}>約</span>
          <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: 210, lineHeight: 1, color: '#FFFFFF' }}>{yen}</span>
          <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 84, color: '#BBF7D0' }}>兆円</span>
        </div>
        <div style={{ height: 10, width: `${(18 + p * 82).toFixed(1)}%`, minWidth: 120, maxWidth: 1100, backgroundColor: C.emeraldBright, marginTop: 10 }} />
      </div>
    </AbsoluteFill>
  );
};

/** b23: それでも賃金は動かない — 紙幣実写が赤黒く沈み、横ばい線と斜めの帯。 */
export const B23Stuck: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const lineP = interpolate(frame, [at(76.2), at(77.0)], [0, 1], { ...CLAMP, easing: EASE_OUT });
  const band = interpolate(frame, [at(76.5), at(76.75)], [0, 1], { ...CLAMP, easing: EASE_OUT });
  return (
    <AbsoluteFill>
      <Clip clip="cash" durFrames={dur} trimSec={4.5} rate={0.9} grade="crisis" zoom={[1.16, 1.2]} />
      <Vignette strength={0.75} color="20,0,0" />
      <SubShade />
      <CutGlitch frames={4} />
      <div style={{ position: 'absolute', left: 110, top: 100, color: '#FCA5A5', fontFamily: MONO, fontWeight: 900, fontSize: 30, letterSpacing: '0.16em', textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
        お金 ↑↑↑　／　給料 →
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <line x1={110} y1={260} x2={110 + 1700 * lineP} y2={262} stroke={C.red} strokeWidth={12} strokeLinecap="round" />
        {lineP >= 1 ? (
          <text x={1810} y={240} textAnchor="end" fontFamily={SERIF} fontWeight={900} fontSize={44} fill="#FFFFFF">
            実質賃金：横ばい
          </text>
        ) : null}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: -40,
          right: -40,
          top: 480,
          height: 160,
          backgroundColor: C.crimson,
          transform: `rotate(-4deg) scaleX(${band.toFixed(3)})`,
          transformOrigin: 'left center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        }}
      >
        <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 96, color: '#FFFFFF', letterSpacing: '0.08em', opacity: band }}>
          それでも、抜け出せない。
        </span>
      </div>
    </AbsoluteFill>
  );
};

const JP = WORLD_COUNTRIES.find((c) => c.id === 'jp');

/** b24: 暗室プロジェクターに実地理の世界地図。日本に照準 →「解剖」へ続く。 */
export const B24Projector: React.FC<BeatProps> = ({ t0, dur }) => {
  const { frame, at } = useBeat(t0);
  const { fps } = useVideoConfig();
  const on = interpolate(frame, [0, 6], [0, 1], CLAMP);
  const zoom = interpolate(frame, [at(78.6), dur], [1, 1.9], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const jx = JP?.cx ?? 829;
  const jy = JP?.cy ?? 133;
  const pulse = 1 + Math.sin((frame / fps) * 8) * 0.12;
  const lock = interpolate(frame, [at(78.9), at(79.4)], [2.4, 1], { ...CLAMP, easing: EASE_OUT });
  const avatarIn = spring({ frame: frame - 4, fps, config: { damping: 16, stiffness: 180 } });
  // スクリーン 1340x620 に地図 viewBox 1000x432.3 を等比で収める
  const SW = 1340;
  const SH = 620;
  const mapW = SW;
  const mapH = (SW * 432.3) / 1000;
  const ox = jx * (mapW / 1000);
  const oy = (SH - mapH) / 2 + jy * (mapH / 432.3);
  return (
    <AbsoluteFill style={{ backgroundColor: '#08090C', overflow: 'hidden' }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: on }}>
        <defs>
          <linearGradient id="v3-beam" x1="0" y1="1" x2="0.3" y2="0">
            <stop offset="0%" stopColor="rgba(226,232,240,0.22)" />
            <stop offset="100%" stopColor="rgba(226,232,240,0.02)" />
          </linearGradient>
        </defs>
        <polygon points="930,1080 990,1080 1800,70 460,70" fill="url(#v3-beam)" />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 460,
          top: 70,
          width: SW,
          height: SH,
          backgroundColor: '#ECEFF3',
          border: '10px solid #1E242D',
          boxShadow: '0 24px 70px rgba(0,0,0,0.85), 0 0 80px rgba(255,255,255,0.08)',
          overflow: 'hidden',
          opacity: on,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom.toFixed(4)})`, transformOrigin: `${ox.toFixed(1)}px ${oy.toFixed(1)}px` }}>
          <svg viewBox={WORLD_MAP_VIEWBOX} width={mapW} height={mapH} style={{ position: 'absolute', left: 0, top: (SH - mapH) / 2 }}>
            {WORLD_COUNTRIES.map((c) => (
              <path key={`wm-${c.id}`} d={c.d} fill={c.id === 'jp' ? C.crimson : '#C3C9D2'} stroke="#ECEFF3" strokeWidth={0.6} />
            ))}
            <g transform={`translate(${jx} ${jy}) scale(${(lock * pulse).toFixed(3)})`}>
              <circle r={16} fill="none" stroke={C.crimson} strokeWidth={1.6} />
              <circle r={26} fill="none" stroke={C.crimson} strokeWidth={1} strokeDasharray="3 3" />
              <line x1={-34} y1={0} x2={-20} y2={0} stroke={C.crimson} strokeWidth={1.4} />
              <line x1={20} y1={0} x2={34} y2={0} stroke={C.crimson} strokeWidth={1.4} />
              <line x1={0} y1={-34} x2={0} y2={-20} stroke={C.crimson} strokeWidth={1.4} />
              <line x1={0} y1={20} x2={0} y2={34} stroke={C.crimson} strokeWidth={1.4} />
            </g>
          </svg>
        </div>
        {/* スクリーン上のVHS走査線 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 3px, rgba(0,0,0,0.05) 3px 5px)',
            pointerEvents: 'none',
          }}
        />
        {frame >= at(79.0) ? (
          <div style={{ position: 'absolute', left: 30, top: 26, backgroundColor: 'rgba(18,20,23,0.9)', borderLeft: `6px solid ${C.crimson}`, padding: '8px 18px', color: '#fff', fontFamily: SANS, fontWeight: 900, fontSize: 32, letterSpacing: '0.1em' }}>
            解剖対象：日本経済
          </div>
        ) : null}
        {frame >= at(79.9) ? (
          <div
            style={{
              position: 'absolute',
              right: 30,
              bottom: 24,
              fontFamily: MONO,
              fontWeight: 900,
              fontSize: 34,
              letterSpacing: '0.12em',
              color: C.ink,
              opacity: Math.floor(frame / 10) % 2 === 0 ? 1 : 0.6,
            }}
          >
            ▶ PLAY　CHAPTER 1｜罠の仕組み
          </div>
        ) : null}
      </div>
      <div style={{ position: 'absolute', left: 40, bottom: 196, transform: `translateX(${interpolate(avatarIn, [0, 1], [-420, 0]).toFixed(1)}px)`, zIndex: 10 }}>
        <EconHostAvatar pose="pointer_stick" emblem="¥?" scale={1.0} />
      </div>
      <CutGlitch frames={4} />
    </AbsoluteFill>
  );
};
