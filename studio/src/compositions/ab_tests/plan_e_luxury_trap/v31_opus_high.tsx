import React from 'react';
import { AbsoluteFill, Freeze } from 'remotion';
import {
  CountUp,
  DiegeticHangTag,
  DiegeticStamp,
  FONT_ECON_MONO,
  FONT_ECON_SANS,
  FONT_ECON_SERIF,
  InkStroke,
  LivingSurface,
  MediaPlate,
  PaperScrap,
  PhotoPrint,
  Place,
  Pop,
  Spotlight,
  Window,
  at,
  atStart,
  clamp01,
  definePlanESpec,
  eio,
  eo,
  hit,
  inkCirclePath,
  lerp,
  ramp,
  rnd,
  spr,
  wob,
  type PlanECustomSceneContext,
  type PlanEDefineInput,
} from '../../../components/plan_e';
import { PlanEMacroEconTemplate } from '../../../templates/PlanEMacroEconTemplate';
import { BASE_TIMELINE } from './baseTimelineData';

/**
 * 案E v3.1「固い床 × 自由な舞台」試運転 — 高級ブランドの罠 冒頭 64.87s（v31_opus_high）
 *
 * 物語の芯は「160万円の値札は、誰が支えているのか」。冒頭の値札（吊り下げ札）を最後に同じ札で回収する。
 *  1 取調べ   : 実写の雑踏を一時停止し、客を赤丸で「容疑者」扱い → 札束の実写で「常識の答え」
 *  2 破り捨て : 紙の顧客カード（大富豪 ✕ ロゴバッグ）を左右に破ると、下から会社員の実写と
 *               「高級ブランド業界」の石板を担ぐ人柱が現れる（paper → dark_broll）
 *  3 号外     : 60兆円を「10兆円の紙袋 × 6」で数える紙面
 *  4 天びん   : 黒板の天びん。45% の札束と 2 人 vs 98 人の群衆＋55% の札束で逆転
 *  5 赤い糸   : コルク板のレシートから赤糸で LVMH 決算へ → 板が持ち上がり暗い机で 100円玉を 37円分切り取る
 *               （corkboard → dark_desk）
 *  6 値札     : 黒板の 2 本の棒で「5年でほぼ2倍」、冒頭と同じ吊り札が「¥1,600,000」で再登場
 *
 * 時刻は at()（chunk 指定）/ ctx.cue() / ctx.beat() だけから取り、数値は相対オフセット・座標・振幅にのみ使う。
 */

type Ctx = PlanECustomSceneContext;
type AtOpts = { nth?: number; edge?: 'start' | 'end'; offset?: number };
const seg = (chunk: string) => (text: string, o: AtOpts = {}) => at(text, { chunk, ...o });
const A1 = seg('seg_01_hook');
const A2 = seg('seg_02_vhs_flip');
const A3 = seg('seg_03_market');
const A4 = seg('seg_04_margin');

const RED = '#C8102E';
const HOT = '#FF5A4E';
const GOLD = '#F2C230';
const CHALK = '#F1EEE6';
const INK = '#16130F';
const MUTED = '#5E554A';
const serif: React.CSSProperties = { fontFamily: FONT_ECON_SERIF, fontWeight: 900 };
const sans: React.CSSProperties = { fontFamily: FONT_ECON_SANS, fontWeight: 800 };

/* ================================================================== 共通の小道具（純関数・hooks なし） */

/** 足元を原点にした人型トークン（会社員はネクタイ付き、背伸び時は腕を上げる） */
function person(key: string | number, x: number, y: number, s: number, fill: string, opts: { tie?: string; arms?: number } = {}) {
  const arms = opts.arms ?? 0;
  return (
    <g key={key} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})`}>
      {arms > 0 ? (
        <path
          d={`M -13 -22 L ${(-19 - 4 * arms).toFixed(1)} ${(-22 - 26 * arms).toFixed(1)} M 13 -22 L ${(19 + 4 * arms).toFixed(1)} ${(-22 - 26 * arms).toFixed(1)}`}
          stroke={fill}
          strokeWidth={5}
          strokeLinecap="round"
          fill="none"
        />
      ) : null}
      <circle cx={0} cy={-40} r={11} fill={fill} />
      <path d="M -16 -25 Q 0 -31 16 -25 L 18 0 L -18 0 Z" fill={fill} />
      {opts.tie ? <path d="M 0 -26 L -3.5 -15 L 0 -6 L 3.5 -15 Z" fill={opts.tie} /> : null}
    </g>
  );
}

/** 時計回り（12時起点）の扇形 path */
function sectorPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

/** 机に落ちて、利益の扇形だけが切り取られて滑り出す硬貨 */
const SlicedCoin: React.FC<{
  id: string;
  sec: number;
  at: number;
  cx: number;
  cy: number;
  r: number;
  frac: number;
  tFill: number;
  tSlide: number;
  slide: number;
  wedgeColor: string;
}> = ({ id, sec, at: t0, cx, cy, r, frac, tFill, tSlide, slide, wedgeColor }) => {
  if (sec < t0) return null;
  const s = spr(sec, t0, 30, { stiffness: 300, damping: 15 });
  const scale = lerp(1.45, 1, s);
  const fill = eo(sec, tFill, 0.55);
  const d = eo(sec, tSlide, 0.5) * slide;
  const bis = 180 * frac;
  const dx = Math.sin((bis * Math.PI) / 180) * d;
  const dy = -Math.cos((bis * Math.PI) / 180) * d;
  const wedgeA = 360 * frac;
  const face = (
    <>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id}-g)`} stroke="#6B6458" strokeWidth={5} />
      <circle cx={cx} cy={cy} r={r * 0.87} fill="none" stroke="#9A9284" strokeWidth={3} strokeDasharray="4 7" />
      <text x={cx} y={cy + r * 0.2} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={r * 0.6} fill="#5A5347">
        100
      </text>
      {fill > 0 ? <path d={sectorPath(cx, cy, r, 0, wedgeA * fill)} fill={wedgeColor} opacity={0.82} /> : null}
    </>
  );
  return (
    <g opacity={clamp01(s * 3)} transform={`translate(${cx} ${cy}) scale(${scale.toFixed(4)}) translate(${-cx} ${-cy})`}>
      <defs>
        <radialGradient id={`${id}-g`} cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#FAF7EF" />
          <stop offset="55%" stopColor="#CFC8BA" />
          <stop offset="100%" stopColor="#8E8676" />
        </radialGradient>
        <clipPath id={`${id}-rest`}>
          <path d={sectorPath(cx, cy, r + 8, wedgeA, 360)} />
        </clipPath>
        <clipPath id={`${id}-wedge`}>
          <path d={sectorPath(cx, cy, r + 8, 0, wedgeA)} />
        </clipPath>
      </defs>
      <ellipse cx={cx + 14} cy={cy + 22} rx={r} ry={r * 0.96} fill="rgba(0,0,0,0.45)" />
      {d <= 0.01 ? (
        face
      ) : (
        <>
          <g clipPath={`url(#${id}-rest)`}>{face}</g>
          <g transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`}>
            <path d={sectorPath(cx + 10, cy + 16, r, 0, wedgeA)} fill="rgba(0,0,0,0.4)" />
            <g clipPath={`url(#${id}-wedge)`}>{face}</g>
          </g>
        </>
      )}
    </g>
  );
};

/** 紙の手提げ袋（60兆円を 10兆円ずつ数える単位） */
function shopBag(key: number, x: number, y: number, tone: string, text: string) {
  return (
    <g key={key} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <path d="M 34 30 C 34 -18 106 -18 106 30" fill="none" stroke="#2A241D" strokeWidth={7} />
      <path d="M 6 30 L 134 30 L 146 178 L -6 178 Z" fill="rgba(0,0,0,0.22)" transform="translate(7 9)" />
      <path d="M 6 30 L 134 30 L 146 178 L -6 178 Z" fill={tone} stroke="#1B1712" strokeWidth={2} />
      <path d="M 6 30 L 134 30 L 132 50 L 8 50 Z" fill="rgba(255,255,255,0.12)" />
      <text x={70} y={124} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={36} fill="#F6EFDF">
        {text}
      </text>
    </g>
  );
}

/** 札束（帯付き）を n 段積んだ塊。原点は塊の底中央 */
function billStack(key: string, n: number, w: number) {
  return (
    <g key={key}>
      {Array.from({ length: n }, (_, k) => (
        <g key={k} transform={`translate(${((rnd(k + 3) - 0.5) * 10).toFixed(1)} ${-(k + 1) * 24})`}>
          <rect x={-w / 2} y={0} width={w} height={22} fill="#D8CFA4" stroke="#6F6747" strokeWidth={2} />
          <rect x={-w / 2 + 4} y={4} width={w - 8} height={14} fill="none" stroke="#9D946B" strokeWidth={1.5} />
          <rect x={-14} y={0} width={28} height={22} fill={RED} />
        </g>
      ))}
    </g>
  );
}

/* ================================================================== 1 取調べ（実写の雑踏 → 札束） */

const CROWD_GRADE = 'contrast(1.12) saturate(0.62) brightness(0.66) sepia(0.16)';
/** 一時停止フレーム上の「容疑者」位置（雑踏Bロールの停止コマを目視で採寸） */
const SUSPECTS = [
  { x: 395, y: 330, rx: 180, ry: 255, word: 'いちばん大事', dt: 0.15 },
  { x: 935, y: 410, rx: 155, ry: 250, word: '大事な', dt: 0 },
  { x: 1580, y: 420, rx: 215, ry: 325, word: '客は', dt: 0 },
] as const;

const hookBackdrop = (c: Ctx) => {
  const tWho = c.cue('いちばん大事');
  const tCash = c.cue('普通に考えれば');
  const freezeU = eo(c.sec, tWho, 0.25);
  const flash = c.sec >= tCash ? Math.max(0, 1 - (c.sec - tCash) / 0.16) : 0;
  const maskOn = c.sec >= tWho && c.sec < tCash;
  return (
    <>
      {c.sec < tCash + 0.12 ? (
        <Freeze frame={Math.round(tWho * c.fps)} active={c.sec >= tWho}>
          <MediaPlate
            src={c.media('luxury_boutique_broll')}
            sec={c.sec}
            fromSec={c.scene.startSec}
            zoom={[1, 1]}
            filter={`${CROWD_GRADE} grayscale(${(0.6 * freezeU).toFixed(3)})`}
          />
        </Freeze>
      ) : null}
      {c.sec >= tCash ? (
        <AbsoluteFill style={{ opacity: eo(c.sec, tCash, 0.12) }}>
          <MediaPlate
            src={c.media('counting_cash_broll')}
            sec={c.sec}
            fromSec={tCash}
            toSec={c.scene.endSec}
            zoom={[1.04, 1.16]}
            filter="contrast(1.12) saturate(0.8) brightness(0.58) sepia(0.28)"
          />
        </AbsoluteFill>
      ) : null}
      {maskOn ? (
        <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <mask id="v31oh-suspects">
              <rect width="1920" height="1080" fill="white" />
              {SUSPECTS.map((p, i) => {
                const g = spr(c.sec, c.cue(p.word) + p.dt, 30, { stiffness: 260, damping: 18 });
                return <ellipse key={i} cx={p.x} cy={p.y} rx={p.rx * g} ry={p.ry * g} fill="black" />;
              })}
            </mask>
          </defs>
          <rect width="1920" height="1080" fill={`rgba(6,5,4,${(0.66 * freezeU).toFixed(3)})`} mask="url(#v31oh-suspects)" />
        </svg>
      ) : null}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 82% 78% at 50% 44%, transparent 46%, rgba(0,0,0,0.62) 100%)' }} />
      {flash > 0 ? <AbsoluteFill style={{ background: `rgba(255,247,232,${(0.55 * flash).toFixed(3)})` }} /> : null}
    </>
  );
};

const hookRender = (c: Ctx) => {
  const tTag = c.cue('160万円');
  const tWho = c.cue('いちばん大事');
  const tDare = c.cue('誰');
  const tCash = c.cue('普通に考えれば');
  const tRich = c.cue('お金持ち');
  const tDesu = c.cue('です');
  return (
    <>
      <DiegeticHangTag atSec={tTag} x={1250} y={-12} price="¥1,600,000" label="バッグ 1点" stringLen={64} swing />
      <Window sec={c.sec} from={tWho} to={tCash}>
        {SUSPECTS.map((p, i) => {
          const t = c.cue(p.word) + p.dt;
          return (
            <React.Fragment key={i}>
              <InkStroke sec={c.sec} at={t} dur={0.32} width={9} color={HOT} d={inkCirclePath(p.x, p.y, p.rx * 1.04, p.ry * 1.02, 5 + i * 3)} />
              <Pop sec={c.sec} at={t + 0.12} x={p.x + p.rx * 0.5} y={p.y - p.ry - 6} rot={i % 2 ? 7 : -6} from={1.5}>
                <PaperScrap w={92} seed={60 + i} tape={false} padding="4px 0 8px" tone="#FBF8F1">
                  <div style={{ ...serif, fontSize: 70, color: RED, textAlign: 'center', lineHeight: 1 }}>?</div>
                </PaperScrap>
              </Pop>
            </React.Fragment>
          );
        })}
        <Pop sec={c.sec} at={tDare} x={1010} y={470} rot={-4} from={1.8} dropY={0}>
          <div style={{ ...serif, fontSize: 250, lineHeight: 1, color: '#FBF8F1', textShadow: `0 10px 0 ${RED}, 0 24px 40px rgba(0,0,0,0.6)`, whiteSpace: 'nowrap' }}>
            誰？
          </div>
        </Pop>
      </Window>
      <Window sec={c.sec} from={tRich}>
        <Pop sec={c.sec} at={tRich} x={150} y={250} rot={-4} from={1.3}>
          <PaperScrap w={760} seed={14} tone="#FBF8F1" padding="26px 44px 34px">
            <div style={{ ...sans, fontSize: 34, color: MUTED }}>普通に考えれば、答えは</div>
            <div style={{ ...serif, fontSize: 158, color: INK, lineHeight: 1.08, whiteSpace: 'nowrap' }}>お金持ち</div>
          </PaperScrap>
        </Pop>
        <DiegeticStamp text="常識" atSec={tDesu} size={84} rotateDeg={-12} style={{ left: 640, top: 520 }} />
      </Window>
    </>
  );
};

/* ================================================================== 2 破り捨て（大富豪 ✕ ロゴ → 会社員の人柱） */

const TEAR_PTS = Array.from({ length: 19 }, (_, i) => ({ x: 925 + rnd(i + 70) * 80, y: (i / 18) * 1080 }));
const tearPoly = TEAR_PTS.map((p) => `${p.x.toFixed(0)}px ${p.y.toFixed(0)}px`).join(', ');
const TEAR_LEFT = `polygon(0px 0px, ${tearPoly}, 0px 1080px)`;
const TEAR_RIGHT = `polygon(${tearPoly}, 1920px 1080px, 1920px 0px)`;
const tearL = (u: number) => `translate(${(-1150 * u).toFixed(1)}px, ${(90 * u).toFixed(1)}px) rotate(${(-7 * u).toFixed(2)}deg)`;
const tearR = (u: number) => `translate(${(1150 * u).toFixed(1)}px, ${(-50 * u).toFixed(1)}px) rotate(${(6 * u).toFixed(2)}deg)`;

const PILLAR = { cx: 1250, cols: 8, rows: 12, cell: 46, bottom: 904 };

const richBackdrop = (c: Ctx) => {
  const tTear = c.cue('この業界を太く');
  const u = eio(c.sec, tTear - 0.05, 0.42);
  return (
    <>
      <MediaPlate
        src={c.media('tokyo_commuter_crowd')}
        sec={c.sec}
        fromSec={tTear}
        toSec={c.scene.endSec}
        zoom={[1.14, 1.03]}
        pan={[-40, 20]}
        filter="contrast(1.1) saturate(0.5) brightness(0.46) sepia(0.22) blur(1.5px)"
      />
      {u < 1 ? (
        <>
          <AbsoluteFill style={{ clipPath: TEAR_LEFT, transform: tearL(u), filter: 'drop-shadow(8px 0 18px rgba(0,0,0,0.5))' }}>
            <LivingSurface surface="paper" />
          </AbsoluteFill>
          <AbsoluteFill style={{ clipPath: TEAR_RIGHT, transform: tearR(u), filter: 'drop-shadow(-8px 0 18px rgba(0,0,0,0.5))' }}>
            <LivingSurface surface="paper" />
          </AbsoluteFill>
        </>
      ) : null}
    </>
  );
};

const richRender = (c: Ctx) => {
  const tRich = c.cue('本物の大富豪');
  const tLogo = c.cue('ロゴの目立つ');
  const tStand = c.cue('目立つ');
  const tNo = c.cue('持ちたがりません');
  const tTear = c.cue('この業界を太く');
  const tThick = c.cue('太く支え');
  const tWant = c.cue('お金持ちに見られたい');
  const tSalary = c.cue('普通の会社員');
  const tKai = c.cue('会社員');
  const u = eio(c.sec, tTear - 0.05, 0.42);
  const rowAt = (r: number) => tThick + r * 0.06;
  const topArrive = rowAt(PILLAR.rows - 1) + 0.12;
  const slabDrop = spr(c.sec, tTear + 0.15, 30, { stiffness: 180, damping: 14 });
  const slabY = lerp(-260, 236, slabDrop) + wob(c.sec, topArrive, 14, 3.2, 4);
  const pillarLeft = PILLAR.cx - (PILLAR.cols * PILLAR.cell) / 2;

  return (
    <>
      {/* 前半：紙面（破れと一緒に左右へ飛ぶ） */}
      {u < 1 ? (
        <>
          <AbsoluteFill style={{ transform: tearL(u) }}>
            <Pop sec={c.sec} at={tRich} x={150} y={130} rot={-3}>
              <PaperScrap w={600} h={560} seed={5} tone="#FFFDF7" padding="30px 40px">
                <div style={{ ...sans, fontSize: 30, color: MUTED, borderBottom: `3px solid ${INK}`, paddingBottom: 10 }}>顧客カード No.1</div>
                <div style={{ ...serif, fontSize: 66, color: INK, marginTop: 34 }}>本物の</div>
                <div style={{ ...serif, fontSize: 168, color: INK, lineHeight: 1, whiteSpace: 'nowrap' }}>大富豪</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 40 }}>
                  <span style={{ ...sans, fontSize: 32, color: MUTED }}>資産</span>
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} style={{ width: 40, height: 40, background: INK, display: 'inline-block', opacity: clamp01((c.sec - tRich - 0.3 - i * 0.06) * 8) }} />
                  ))}
                </div>
              </PaperScrap>
            </Pop>
            <InkStroke sec={c.sec} at={tStand} dur={0.42} width={12} color={INK} d="M 780 420 C 880 396 980 400 1080 420 M 1040 384 L 1086 422 L 1036 454" />
            <InkStroke sec={c.sec} at={tNo} dur={0.16} width={20} color={RED} d="M 870 350 L 990 480" />
            <InkStroke sec={c.sec} at={tNo + 0.1} dur={0.16} width={20} color={RED} d="M 990 350 L 870 480" />
          </AbsoluteFill>
          <AbsoluteFill style={{ transform: tearR(u) }}>
            <Pop sec={c.sec} at={tLogo} x={1120} y={110} rot={3} from={1.2}>
              <PhotoPrint src={c.media('luxury_handbag_display')} w={560} h={470} objectPosition="16% 55%" caption="ロゴの目立つバッグ" captionSize={34} />
            </Pop>
            <InkStroke sec={c.sec} at={tStand + 0.1} dur={0.45} width={10} color={RED} d={inkCirclePath(1414, 380, 215, 200, 9)} />
            <DiegeticStamp text="持たない" atSec={tNo + 0.35} size={78} rotateDeg={-10} style={{ left: 1250, top: 560 }} />
          </AbsoluteFill>
        </>
      ) : null}

      {/* 後半：会社員の人柱が「高級ブランド業界」を担ぐ */}
      <Window sec={c.sec} from={tTear}>
        <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {Array.from({ length: PILLAR.rows * PILLAR.cols }, (_, i) => {
            const r = Math.floor(i / PILLAR.cols);
            const col = i % PILLAR.cols;
            const t = rowAt(r) + rnd(i + 11) * 0.04;
            if (c.sec < t) return null;
            const k = spr(c.sec, t, 30, { stiffness: 420, damping: 20 });
            const x = pillarLeft + col * PILLAR.cell + PILLAR.cell / 2 + (r % 2 ? 10 : -6);
            const y = PILLAR.bottom - r * PILLAR.cell + lerp(40, 0, k);
            const lit = c.sec >= tSalary ? eo(c.sec, tSalary + (rnd(i) * 0.4), 0.3) : 0;
            return person(i, x, y, 0.9, lit > 0.5 ? '#FBF3E2' : '#D9CDB6', { tie: RED });
          })}
        </svg>
        <Place x={PILLAR.cx - 340} y={slabY} w={680} h={100}>
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(180deg, #23201C 0%, #0E0C0A 100%)',
              border: '3px solid #C9A44C',
              boxShadow: '0 22px 40px rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...serif,
              fontSize: 56,
              color: '#E2C178',
              letterSpacing: '0.08em',
            }}
          >
            高級ブランド業界
          </div>
        </Place>
        <Pop sec={c.sec} at={tWant} x={140} y={190} rot={-4} from={0.6}>
          <PaperScrap w={600} seed={23} tone="#FBF8F1" padding="24px 40px 30px">
            <div style={{ ...sans, fontSize: 30, color: MUTED }}>本音</div>
            <div style={{ ...serif, fontSize: 72, color: INK, lineHeight: 1.18, whiteSpace: 'nowrap' }}>お金持ちに</div>
            <div style={{ ...serif, fontSize: 72, color: RED, lineHeight: 1.18, whiteSpace: 'nowrap' }}>見られたい</div>
          </PaperScrap>
        </Pop>
        <Window sec={c.sec} from={tWant + 0.2}>
          {[{ x: 790, y: 470, r: 18 }, { x: 850, y: 530, r: 12 }, { x: 895, y: 575, r: 8 }].map((b, i) => (
            <Place key={i} x={b.x - b.r} y={b.y - b.r} w={b.r * 2} h={b.r * 2}>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#FBF8F1', opacity: clamp01((c.sec - tWant - 0.2 - i * 0.08) * 6) }} />
            </Place>
          ))}
        </Window>
        <Pop sec={c.sec} at={tSalary} x={1030} y={610} rot={-3} from={1.4}>
          <PaperScrap w={440} seed={29} tone="#FBF8F1" tape="corners" padding="10px 20px">
            <div style={{ ...serif, fontSize: 64, color: INK, textAlign: 'center', whiteSpace: 'nowrap' }}>普通の会社員</div>
          </PaperScrap>
        </Pop>
        <DiegeticStamp text="本当の上客" atSec={tKai + 0.2} size={74} rotateDeg={-9} style={{ left: 210, top: 600 }} />
      </Window>
    </>
  );
};

/* ================================================================== 3 号外（60兆円 = 10兆円の紙袋 × 6） */

const BAG_TONES = ['#1D1A17', '#7A2A22', '#2E3A2F', '#1D1A17', '#6B4A2B', '#7A2A22'];

const marketRender = (c: Ctx) => {
  const tHead = c.cue('世界の高級');
  const tYear = c.cue('2024年');
  const tSixty = c.cue('60兆円');
  const tCho = c.cue('兆円');
  return (
    <>
      <Pop sec={c.sec} at={tHead} x={190} y={80} rot={-1} from={1.08} dropY={0}>
        <PaperScrap w={1540} h={740} seed={31} tone="#F7F2E6" tape="corners" padding="38px 60px">
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `6px double ${INK}`, paddingBottom: 10 }}>
            <span style={{ ...sans, fontSize: 30, color: MUTED, letterSpacing: '0.3em' }}>経 済</span>
            <span style={{ ...sans, fontSize: 30, color: MUTED }}>市場規模</span>
          </div>
          <div style={{ ...serif, fontSize: 96, color: INK, marginTop: 22, whiteSpace: 'nowrap' }}>世界の高級ブランド市場</div>
          <div style={{ borderBottom: `2px solid ${INK}`, marginTop: 14, width: 760 }} />
        </PaperScrap>
      </Pop>
      <Pop sec={c.sec} at={tYear} x={258} y={330} rot={-3} from={1.5}>
        <div style={{ ...sans, fontSize: 56, color: RED, border: `5px solid ${RED}`, padding: '4px 22px', background: 'rgba(251,248,241,0.6)' }}>2024年</div>
      </Pop>
      <Window sec={c.sec} from={tSixty}>
        <Place x={250} y={420} w={760} style={{ display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
          <span style={{ ...serif, fontSize: 84, color: INK }}>約</span>
          <CountUp sec={c.sec} at={tSixty} dur={0.9} to={60} style={{ ...serif, fontFamily: FONT_ECON_SERIF, fontSize: 270, color: INK, lineHeight: 1 }} />
          <span style={{ ...serif, fontSize: 120, color: INK }}>兆円</span>
        </Place>
      </Window>
      <InkStroke sec={c.sec} at={tCho + 0.25} dur={0.35} width={14} color={RED} d="M 270 745 C 520 732 820 752 1010 736" />
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {BAG_TONES.map((tone, i) => {
          const t = tSixty + i * 0.14;
          if (c.sec < t) return null;
          const col = i % 3;
          const row = Math.floor(i / 3);
          const k = spr(c.sec, t, 30, { stiffness: 320, damping: 16 });
          const x = 1110 + col * 185 + (row ? 40 : 0);
          const y = lerp(-260, 330 + row * 205, k);
          return shopBag(i, x, y, tone, '10兆円');
        })}
      </svg>
    </>
  );
};

/* ================================================================== 4 天びん（2% vs 98%） */

const PIVOT = { x: 960, y: 235 };
const HALF = 520;
const STRING = 215;
const CROWD98 = Array.from({ length: 98 }, (_, i) => {
  const row = Math.floor(i / 14);
  const col = i % 14;
  return { x: -196 + col * 30 + (row % 2 ? 12 : 0) + (rnd(i + 5) - 0.5) * 6, y: -row * 21, delay: i * 0.011 + rnd(i) * 0.08 };
});

const scaleRender = (c: Ctx) => {
  const t45 = c.cue('45パーセント');
  const t2 = c.cue('2パーセント');
  const tSuper = c.cue('超富裕層');
  const tBut = c.cue('ところが残り');
  const t98 = c.cue('98パーセント');
  const t350 = c.cue('3億');
  const tTip = c.cue('背伸びして');
  const tHalf = c.cue('半分以上');
  const tPay = c.cue('払って');
  const sec = c.sec;

  const theta =
    -13 * spr(sec, t45 + 0.12, 30, { stiffness: 120, damping: 7 }) +
    2.5 * eo(sec, t98, 2.2) +
    15.5 * spr(sec, tHalf + 0.15, 30, { stiffness: 110, damping: 6 });
  const rad = (theta * Math.PI) / 180;
  const L = { x: PIVOT.x - HALF * Math.cos(rad), y: PIVOT.y - HALF * Math.sin(rad) };
  const R = { x: PIVOT.x + HALF * Math.cos(rad), y: PIVOT.y + HALF * Math.sin(rad) };
  const PL = { x: L.x, y: L.y + STRING };
  const PR = { x: R.x, y: R.y + STRING };
  const drop = (t: number, from: number) => (sec < t ? null : from * (1 - spr(sec, t, 30, { stiffness: 260, damping: 17 })));
  const d45 = drop(t45, -700);
  const d55 = drop(tHalf, -760);
  const tipU = eo(sec, tTip, 0.35);
  const draw = eo(sec, c.scene.startSec, 0.55);

  const pan = (p: { x: number; y: number }, key: string) => (
    <g key={key}>
      <path d={`M ${p.x} ${p.y - STRING} L ${p.x - 200} ${p.y} M ${p.x} ${p.y - STRING} L ${p.x + 200} ${p.y}`} stroke={CHALK} strokeWidth={3} opacity={0.75} />
      <path d={`M ${p.x - 235} ${p.y} Q ${p.x} ${p.y + 78} ${p.x + 235} ${p.y} Z`} fill="rgba(241,238,230,0.12)" stroke={CHALK} strokeWidth={7} strokeLinejoin="round" />
    </g>
  );

  return (
    <>
      <Place x={250} y={70}>
        <div style={{ ...sans, fontSize: 40, color: '#A29C90', letterSpacing: '0.12em', opacity: draw }}>売上の重さくらべ</div>
      </Place>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <filter id="v31oh-chalk" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={4} />
            <feDisplacementMap in="SourceGraphic" scale={2.2} />
          </filter>
        </defs>
        <g filter="url(#v31oh-chalk)" opacity={draw}>
          <path d={`M ${PIVOT.x} ${PIVOT.y} L ${PIVOT.x} 850 M ${PIVOT.x - 150} 880 L ${PIVOT.x + 150} 880 L ${PIVOT.x + 60} 850 L ${PIVOT.x - 60} 850 Z`} stroke={CHALK} strokeWidth={8} fill="none" strokeLinejoin="round" />
          <line x1={L.x} y1={L.y} x2={R.x} y2={R.y} stroke={CHALK} strokeWidth={11} strokeLinecap="round" />
          <circle cx={PIVOT.x} cy={PIVOT.y} r={16} fill={CHALK} />
          <path d={`M ${PIVOT.x - 30} ${PIVOT.y - 40} L ${PIVOT.x} ${PIVOT.y - 6} L ${PIVOT.x + 30} ${PIVOT.y - 40}`} stroke={CHALK} strokeWidth={6} fill="none" />
          {pan(PL, 'pl')}
          {pan(PR, 'pr')}
        </g>

        {/* 左皿：45% の札束と 2 人 */}
        <g transform={`translate(${PL.x.toFixed(1)} ${PL.y.toFixed(1)})`}>
          {d45 !== null ? (
            <g transform={`translate(-70 ${(d45 + 10).toFixed(1)})`}>
              {billStack('b45', 6, 220)}
              <text x={0} y={-176} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={50} fill={GOLD}>
                売上 45%
              </text>
            </g>
          ) : null}
          {[0, 1].map((i) =>
            sec >= t2 + i * 0.12 ? person(`r${i}`, 112 + i * 62, 10 - 18 * (1 - spr(sec, t2 + i * 0.12)), 1.75, GOLD) : null,
          )}
        </g>

        {/* 右皿：98 人の群衆（背伸び）と 55% の札束 */}
        <g transform={`translate(${PR.x.toFixed(1)} ${PR.y.toFixed(1)})`}>
          {CROWD98.map((p, i) => {
            const t = t98 + p.delay;
            if (sec < t) return null;
            const k = eo(sec, t, 0.22);
            const bob = tipU * (8 + 4 * Math.sin(sec * 7 + i * 0.7));
            return person(i, p.x, p.y + 6 + lerp(-140, 0, k) - bob, 0.58, CHALK, { tie: HOT, arms: tipU });
          })}
          {d55 !== null ? (
            <g transform={`translate(0 ${(d55 - 196).toFixed(1)})`}>
              {billStack('b55', 7, 250)}
              <text x={0} y={-200} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={54} fill={GOLD}>
                売上 55%
              </text>
            </g>
          ) : null}
        </g>

        {/* 皿下のラベル（傾かない） */}
        {sec >= t2 ? (
          <g opacity={eo(sec, t2, 0.25)}>
            <text x={PL.x} y={PL.y + 112} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={64} fill={GOLD}>
              上位 2%
            </text>
            {sec >= tSuper ? (
              <text x={PL.x} y={PL.y + 162} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={36} fill={CHALK} opacity={eo(sec, tSuper, 0.25)}>
                超富裕層
              </text>
            ) : null}
          </g>
        ) : null}
        {sec >= t98 ? (
          <g opacity={eo(sec, t98, 0.25)}>
            <text x={PR.x} y={PR.y + 112} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={64} fill={CHALK}>
              残り 98%
            </text>
            {sec >= t350 ? (
              <text x={PR.x} y={PR.y + 162} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={38} fill={CHALK}>
                {(() => {
                  const n = Math.round(lerp(0, 35000, eo(sec, t350, 0.9)));
                  const oku = Math.floor(n / 10000);
                  const man = n % 10000;
                  return `${oku > 0 ? `${oku}億` : ''}${man > 0 ? `${man}万` : ''}人超`;
                })()}
              </text>
            ) : null}
          </g>
        ) : null}
      </svg>
      <Window sec={sec} from={tBut} to={t98 + 0.6}>
        <Pop sec={sec} at={tBut} x={1290} y={70} rot={4} from={1.4}>
          <div style={{ ...serif, fontSize: 64, color: HOT, whiteSpace: 'nowrap' }}>ところが…</div>
        </Pop>
      </Window>
      <InkStroke sec={sec} at={tPay} dur={0.3} width={12} color={HOT} d={`M ${PR.x + 300} ${PR.y - 300} C ${PR.x + 320} ${PR.y - 200} ${PR.x + 300} ${PR.y - 120} ${PR.x + 280} ${PR.y - 40} M ${PR.x + 248} ${PR.y - 92} L ${PR.x + 280} ${PR.y - 34} L ${PR.x + 318} ${PR.y - 84}`} />
    </>
  );
};

/* ================================================================== 5 赤い糸（レシート → LVMH） → 暗い机（100円玉） */

const PIN_A = { x: 372, y: 122 };
const PIN_MID = { x: 900, y: 300 };
const PIN_B = { x: 1362, y: 116 };

const pushPin = (p: { x: number; y: number }, key: string) => (
  <Place key={key} x={p.x - 15} y={p.y - 15} w={30} h={30} z={8}>
    <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #FF8A80, #B0141E 60%, #5A0A10)', boxShadow: '3px 5px 6px rgba(0,0,0,0.45)' }} />
  </Place>
);

const moneyBackdrop = (c: Ctx) => {
  const tDesk = c.cue('100円売れる');
  const tApparel = c.cue('普通のアパレル');
  const lift = eio(c.sec, tDesk - 0.32, 0.45);
  const lamp = eo(c.sec, tDesk, 0.35);
  const sweep = eio(c.sec, tApparel - 0.1, 0.7);
  return (
    <>
      <LivingSurface surface="dark_desk" />
      <Spotlight x={lerp(560, 1000, sweep)} y={lerp(400, 430, sweep)} r={lerp(40, lerp(330, 640, sweep), lamp)} strength={0.74} color="6, 4, 2" />
      {lift < 1 ? (
        <AbsoluteFill style={{ transform: `translateY(${(-1180 * lift).toFixed(1)}px) rotate(${(-2.5 * lift).toFixed(2)}deg)`, boxShadow: '0 40px 90px rgba(0,0,0,0.65)' }}>
          <LivingSurface surface="corkboard" />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const moneyRender = (c: Ctx) => {
  const tDai = c.cue('代金');
  const tWhere = c.cue('どこへ');
  const tLouis = c.cue('ルイ・ヴィトン');
  const tLv = c.cue('エルブイ');
  const tLeather = c.cue('革製品部門');
  const tOp = c.cue('営業利益率');
  const t371 = c.cue('37.1');
  const tMo = c.cue('パーセントも');
  const tDesk = c.cue('100円売れる');
  const t37 = c.cue('37円');
  const tRemain = c.cue('残る');
  const tApparel = c.cue('普通のアパレル');
  const tSuu = c.cue('数倍');
  const sec = c.sec;
  const lift = eio(sec, tDesk - 0.32, 0.45);
  const hl = eo(sec, tOp, 0.45);
  const hlLeather = eo(sec, tLeather, 0.4);

  return (
    <>
      {lift < 1 ? (
        <AbsoluteFill style={{ transform: `translateY(${(-1180 * lift).toFixed(1)}px) rotate(${(-2.5 * lift).toFixed(2)}deg)` }}>
          <Pop sec={sec} at={tDai} x={152} y={112} rot={-4} from={1.25}>
            <PaperScrap w={440} h={620} seed={41} tone="#FFFFFF" tape={false} jag={0.7} padding="40px 36px">
              <div style={{ ...sans, fontSize: 32, color: INK, textAlign: 'center', letterSpacing: '0.2em' }}>お買上げ明細</div>
              <div style={{ borderTop: `3px dashed ${MUTED}`, margin: '18px 0' }} />
              <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 30, color: INK, display: 'flex', justifyContent: 'space-between' }}>
                <span>バッグ</span>
                <span>×1</span>
              </div>
              <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 30, color: INK, textAlign: 'right', marginTop: 8 }}>¥1,600,000</div>
              <div style={{ borderTop: `3px dashed ${MUTED}`, margin: '18px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ ...sans, fontSize: 34, color: INK }}>合計</span>
                <span style={{ ...serif, fontSize: 52, color: INK }}>¥1,600,000</span>
              </div>
              <div style={{ ...serif, fontSize: 60, color: RED, marginTop: 70, transform: 'rotate(-5deg)', opacity: clamp01((sec - tDai - 0.35) * 5), whiteSpace: 'nowrap' }}>背伸びの代金</div>
            </PaperScrap>
          </Pop>
          {sec >= tDai ? pushPin(PIN_A, 'pa') : null}
          <InkStroke sec={sec} at={tWhere} dur={0.6} width={5} color="#B0141E" d={`M ${PIN_A.x} ${PIN_A.y} C 520 240 700 330 ${PIN_MID.x} ${PIN_MID.y}`} />
          <Window sec={sec} from={tWhere + 0.45} to={tLv}>
            <Pop sec={sec} at={tWhere + 0.45} x={PIN_MID.x - 10} y={PIN_MID.y - 70} rot={8} from={1.5}>
              <div style={{ ...serif, fontSize: 130, color: '#B0141E', textShadow: '0 4px 8px rgba(0,0,0,0.35)' }}>？</div>
            </Pop>
          </Window>
          <Pop sec={sec} at={tLouis} x={920} y={96} rot={2} from={1.15}>
            <PaperScrap w={880} h={710} seed={44} tone="#FBF8F1" tape={false} padding="46px 56px">
              <div style={{ ...sans, fontSize: 32, color: MUTED, height: 46 }}>ルイ・ヴィトンの親会社</div>
              <div style={{ ...serif, fontSize: 116, color: INK, letterSpacing: '0.06em', height: 132, lineHeight: 1.1 }}>LVMH</div>
              <div style={{ borderBottom: `6px double ${INK}`, margin: '6px 0 18px' }} />
              <div style={{ ...sans, fontSize: 38, color: INK, height: 56, display: 'inline-block', background: `linear-gradient(90deg, rgba(242,194,48,0.65) ${(hl * 100).toFixed(1)}%, transparent ${(hl * 100).toFixed(1)}%)` }}>
                部門別の営業利益率
              </div>
              <div style={{ ...serif, fontSize: 54, color: INK, height: 78, marginTop: 8, whiteSpace: 'nowrap' }}>
                <span style={{ background: `linear-gradient(transparent 62%, rgba(200,16,46,0.28) 62%)`, backgroundSize: `${(hlLeather * 100).toFixed(1)}% 100%`, backgroundRepeat: 'no-repeat' }}>
                  ファッション・革製品
                </span>
              </div>
              <div style={{ height: 200, display: 'flex', alignItems: 'center' }}>
                {sec >= t371 ? (
                  <CountUp
                    sec={sec}
                    at={t371}
                    dur={0.9}
                    to={37.1}
                    format={(n) => `${n.toFixed(1)}%`}
                    style={{ ...serif, fontFamily: FONT_ECON_SERIF, fontSize: 190, color: RED, lineHeight: 1 }}
                  />
                ) : (
                  <span style={{ ...serif, fontSize: 120, color: 'rgba(94,85,74,0.35)' }}>――</span>
                )}
              </div>
            </PaperScrap>
          </Pop>
          {sec >= tLouis ? pushPin(PIN_B, 'pb') : null}
          <InkStroke sec={sec} at={tLv} dur={0.5} width={5} color="#B0141E" d={`M ${PIN_MID.x} ${PIN_MID.y} C 1050 260 1200 160 ${PIN_B.x} ${PIN_B.y}`} />
          <InkStroke sec={sec} at={tMo} dur={0.5} width={10} color={RED} d={inkCirclePath(1245, 618, 290, 120, 13)} />
        </AbsoluteFill>
      ) : null}

      {/* 暗い机：100円玉から 37円が抜ける */}
      <Window sec={sec} from={tDesk}>
        <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <SlicedCoin id="v31oh-coin-a" sec={sec} at={tDesk} cx={560} cy={400} r={230} frac={0.37} tFill={t37} tSlide={tRemain} slide={170} wedgeColor={RED} />
          <SlicedCoin id="v31oh-coin-b" sec={sec} at={tApparel} cx={1480} cy={430} r={150} frac={0.07} tFill={tApparel + 0.3} tSlide={tApparel + 0.75} slide={60} wedgeColor="#8E8676" />
          {sec >= tDesk ? (
            <text x={560} y={690} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={38} fill="#F3EDE2" opacity={eo(sec, tDesk + 0.2, 0.3)}>
              売上 100円
            </text>
          ) : null}
          {sec >= tApparel ? (
            <text x={1480} y={640} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={38} fill="#F3EDE2" opacity={eo(sec, tApparel + 0.2, 0.3)}>
              普通のアパレル
            </text>
          ) : null}
        </svg>
        <Pop sec={sec} at={tRemain + 0.25} x={1000} y={170} rot={-3} from={1.4}>
          <div style={{ whiteSpace: 'nowrap' }}>
            <span style={{ ...serif, fontSize: 120, color: '#F5B83D', textShadow: '0 6px 18px rgba(0,0,0,0.6)' }}>37円</span>
            <span style={{ ...sans, fontSize: 44, color: '#F3EDE2', marginLeft: 10 }}>が残る</span>
          </div>
        </Pop>
        <Pop sec={sec} at={tSuu} x={740} y={690} rot={2} from={1.6}>
          <div style={{ ...serif, fontSize: 104, color: '#F5B83D', whiteSpace: 'nowrap', textShadow: '0 6px 18px rgba(0,0,0,0.6)' }}>数倍の儲け</div>
        </Pop>
        <InkStroke sec={sec} at={tSuu + 0.2} dur={0.3} width={10} color={HOT} d="M 750 846 C 880 836 1040 852 1270 840" />
      </Window>
    </>
  );
};

/* ================================================================== 6 値札（5年でほぼ2倍 → ¥1,600,000 の回収） */

const RISING = Array.from({ length: 7 }, (_, i) => ({ x: 120 + i * 250 + rnd(i + 2) * 80, delay: rnd(i + 17) * 1.2, s: 0.7 + rnd(i + 8) * 0.5 }));
const BASE_Y = 800;
const BAR_L = { x: 860, w: 230, h: 230 };
const BAR_R = { x: 1340, w: 230, h: 470 };

const hatchBar = (x: number, w: number, h: number, color: string, key: string) => (
  <g key={key}>
    <rect x={x} y={BASE_Y - h} width={w} height={h} fill="rgba(241,238,230,0.08)" stroke={color} strokeWidth={6} />
    {Array.from({ length: Math.floor(h / 26) }, (_, i) => (
      <line key={i} x1={x + 8} y1={BASE_Y - 10 - i * 26} x2={x + w - 8} y2={BASE_Y - 26 - i * 26} stroke={color} strokeWidth={2.5} opacity={0.45} />
    ))}
  </g>
);

const priceRender = (c: Ctx) => {
  const tTag = c.cue('値札は');
  const tUp = c.cue('上がり続け');
  const tChanel = c.cue('シャネル');
  const t5 = c.cue('5年');
  const t2x = c.cue('2倍');
  const tJp = c.cue('日本では');
  const tOver = c.cue('超え');
  const sec = c.sec;
  const hL = BAR_L.h * eo(sec, t5, 0.5);
  const hR = BAR_R.h * (sec < t2x ? 0 : spr(sec, t2x, 30, { stiffness: 170, damping: 11 }));

  return (
    <>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <filter id="v31oh-chalk2" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={7} />
            <feDisplacementMap in="SourceGraphic" scale={2.2} />
          </filter>
        </defs>
        {/* 上がり続ける小さな値札（チョーク） */}
        <g filter="url(#v31oh-chalk2)">
          {RISING.map((p, i) => {
            const t = tTag + p.delay;
            if (sec < t || sec > t + 3.2) return null;
            const u = ramp(sec, t, 3.2);
            const y = lerp(900, 80, u);
            const op = Math.min(1, u * 6) * (1 - Math.max(0, (u - 0.7) / 0.3)) * (1 - eo(sec, t5, 0.4) * 0.7);
            return (
              <g key={i} transform={`translate(${p.x.toFixed(1)} ${y.toFixed(1)}) scale(${p.s.toFixed(2)}) rotate(${(Math.sin(sec * 2 + i) * 10).toFixed(1)})`} opacity={op * 0.55}>
                <path d="M -30 -20 L 20 -20 L 40 0 L 20 20 L -30 20 Z" fill="none" stroke={CHALK} strokeWidth={4} />
                <circle cx={22} cy={0} r={5} fill="none" stroke={CHALK} strokeWidth={3} />
                <text x={-8} y={10} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={26} fill={CHALK}>
                  ¥
                </text>
              </g>
            );
          })}
          <path d={`M 700 ${BASE_Y} L 1740 ${BASE_Y}`} stroke={CHALK} strokeWidth={6} strokeLinecap="round" opacity={eo(sec, tUp, 0.4)} />
          {hL > 1 ? hatchBar(BAR_L.x, BAR_L.w, hL, CHALK, 'bl') : null}
          {hR > 1 ? hatchBar(BAR_R.x, BAR_R.w, hR, HOT, 'br') : null}
        </g>
        {sec >= t5 ? (
          <text x={BAR_L.x + BAR_L.w / 2} y={BASE_Y + 62} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={42} fill={CHALK} opacity={eo(sec, t5, 0.3)}>
            5年前
          </text>
        ) : null}
        {sec >= t2x ? (
          <text x={BAR_R.x + BAR_R.w / 2} y={BASE_Y + 62} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={42} fill={CHALK} opacity={eo(sec, t2x, 0.3)}>
            いま
          </text>
        ) : null}
      </svg>
      <InkStroke sec={sec} at={t2x + 0.25} dur={0.4} width={8} color={HOT} d={`M ${BAR_L.x + 115} ${BASE_Y - BAR_L.h - 30} C 1000 360 1130 300 1300 330 M 1262 296 L 1306 332 L 1256 360`} />
      <Pop sec={sec} at={t2x + 0.4} x={930} y={330} rot={-6} from={1.6}>
        <div style={{ ...serif, fontSize: 92, color: HOT, whiteSpace: 'nowrap', textShadow: '0 4px 14px rgba(0,0,0,0.5)' }}>ほぼ2倍</div>
      </Pop>
      <Pop sec={sec} at={tChanel} x={130} y={140} rot={-3}>
        <PaperScrap w={560} seed={52} tone="#EFE9DC" padding="22px 36px 28px">
          <div style={{ ...sans, fontSize: 30, color: MUTED }}>値札は上がり続ける</div>
          <div style={{ ...serif, fontSize: 64, color: INK, lineHeight: 1.2, whiteSpace: 'nowrap' }}>シャネルの</div>
          <div style={{ ...serif, fontSize: 64, color: INK, lineHeight: 1.2, whiteSpace: 'nowrap' }}>定番バッグ</div>
        </PaperScrap>
      </Pop>
      <DiegeticHangTag atSec={tJp} x={BAR_R.x + BAR_R.w / 2} y={-12} price="¥1,600,000" label="日本の値札" stringLen={44} swing />
      <DiegeticStamp text="超え" atSec={tOver} size={96} rotateDeg={-12} style={{ left: 1640, top: 150 }} />
    </>
  );
};

/* ================================================================== spec */

export function createV31OpusHighInput(): PlanEDefineInput {
  return {
    id: 'ab-luxury-trap-v31-opus-high',
    themeTitle: 'ハイブランドが本当にカモにしているのは、富裕層ではない（冒頭 v31_opus_high）',
    range: { start: atStart(), end: at('ここで、妙なことが起きます。') },
    scenes: [
      {
        id: 'hook_interrogation',
        type: 'custom',
        start: atStart(),
        surface: 'dark_broll',
        camera: {
          moves: [
            { at: atStart(), zoom: 1.07, x: -10, y: -14, dur: 3.7 },
            { at: A1('いちばん大事'), zoom: 1, x: 0, y: 0, dur: 0.22 },
            { at: A2('普通に考えれば'), zoom: 1.1, x: 40, y: 10, dur: 2.9 },
          ],
          shakes: [A1('誰', { offset: 0.05 }), A2('です', { nth: 1, offset: 0.05 })],
        },
        beats: [
          hit(A1('160万円'), 'price_ping', { id: 'tag', gain: 0.3 }),
          hit(A1('いちばん大事'), 'vhs_pause', { id: 'freeze', gain: 0.26 }),
          hit(A1('大事な'), 'pen_scratch', { gain: 0.2 }),
          hit(A1('客は'), 'pen_scratch', { gain: 0.2 }),
          hit(A1('誰'), 'impact_thud', { id: 'who', gain: 0.3 }),
          hit(A2('普通に考えれば'), 'whoosh', { gain: 0.22 }),
          hit(A2('お金持ち', { nth: 1 }), 'paper_snap', { gain: 0.26 }),
          hit(A2('です', { nth: 1 }), 'stamp_thud', { gain: 0.28 }),
        ],
        backdrop: hookBackdrop,
        render: hookRender,
      },
      {
        id: 'rich_card_torn',
        type: 'custom',
        start: A2('ところが本物'),
        surface: 'paper',
        surfaceShifts: [{ at: A2('この業界を太く'), surface: 'dark_broll' }],
        camera: {
          moves: [
            { at: A2('ロゴの目立つ'), zoom: 1.05, x: -40, y: 0, dur: 1.2 },
            { at: A2('この業界を太く'), zoom: 1, x: 0, y: 0, dur: 0.3 },
            { at: A2('普通の会社員'), zoom: 1.08, x: -70, y: -10, dur: 1.4 },
          ],
          shakes: [A2('持ちたがりません'), A2('会社員', { offset: 0.22 })],
        },
        beats: [
          hit(A2('ところが本物'), 'whoosh', { gain: 0.18 }),
          hit(A2('本物の大富豪'), 'paper_snap', { id: 'card', gain: 0.26 }),
          hit(A2('ロゴの目立つ'), 'camera_shutter', { gain: 0.24 }),
          hit(A2('目立つ'), 'pen_scratch', { gain: 0.2 }),
          hit(A2('持ちたがりません'), 'impact_thud', { gain: 0.3 }),
          hit(A2('持ちたがりません', { offset: 0.35 }), 'stamp_thud', { gain: 0.26 }),
          hit(A2('この業界を太く'), 'whoosh', { id: 'tear', gain: 0.28 }),
          hit(A2('太く支え'), 'mech_slide', { gain: 0.24 }),
          hit(A2('お金持ちに見られたい'), 'soft_pop', { gain: 0.24 }),
          hit(A2('普通の会社員'), 'paper_snap', { gain: 0.24 }),
          hit(A2('会社員', { offset: 0.2 }), 'stamp_thud', { gain: 0.3 }),
        ],
        backdrop: richBackdrop,
        render: richRender,
      },
      {
        id: 'market_60t',
        type: 'custom',
        start: A3('世界の高級'),
        surface: 'paper',
        camera: {
          moves: [{ at: A3('60兆円'), zoom: 1.05, x: 30, y: -10, dur: 1.2 }],
        },
        beats: [
          hit(A3('世界の高級'), 'paper_snap', { id: 'head', gain: 0.26 }),
          hit(A3('2024年'), 'chart_tick', { gain: 0.24 }),
          hit(A3('60兆円'), 'price_ping', { gain: 0.26 }),
          hit(A3('兆円', { offset: 0.25 }), 'pen_scratch', { gain: 0.2 }),
        ],
        render: marketRender,
      },
      {
        id: 'balance_2_vs_98',
        type: 'custom',
        start: A3('その45'),
        surface: 'charcoal',
        camera: {
          moves: [
            { at: A3('ところが残り'), zoom: 1.08, x: -120, y: -20, dur: 1.0 },
            { at: A3('半分以上', { offset: -0.25 }), zoom: 1, x: 0, y: 0, dur: 0.45 },
          ],
          shakes: [A3('45パーセント', { offset: 0.2 }), A3('半分以上', { offset: 0.25 })],
        },
        beats: [
          hit(A3('45パーセント', { offset: 0.15 }), 'impact_thud', { id: 'w45', gain: 0.3 }),
          hit(A3('2パーセント'), 'soft_pop', { gain: 0.24 }),
          hit(A3('ところが残り'), 'whoosh', { gain: 0.18 }),
          hit(A3('98パーセント'), 'chart_tick', { gain: 0.24 }),
          hit(A3('3億'), 'chart_tick', { gain: 0.2 }),
          hit(A3('背伸びして'), 'soft_pop', { gain: 0.24 }),
          hit(A3('半分以上', { offset: 0.18 }), 'impact_thud', { id: 'w55', gain: 0.32 }),
          hit(A3('払って'), 'pen_scratch', { gain: 0.2 }),
        ],
        render: scaleRender,
      },
      {
        id: 'red_string_to_coin',
        type: 'custom',
        start: A4('その背伸びの代金'),
        surface: 'corkboard',
        surfaceShifts: [{ at: A4('100円売れる'), surface: 'dark_desk' }],
        camera: {
          moves: [
            { at: A4('革製品部門'), zoom: 1.16, x: -250, y: 20, dur: 0.9 },
            { at: A4('100円売れる', { offset: -0.32 }), zoom: 1, x: 0, y: 0, dur: 0.45 },
            { at: A4('普通のアパレル'), zoom: 1.04, x: -20, y: 0, dur: 1.2 },
          ],
          shakes: [A4('数倍', { offset: 0.05 })],
        },
        beats: [
          hit(A4('代金'), 'paper_snap', { gain: 0.26 }),
          hit(A4('どこへ'), 'pen_scratch', { gain: 0.2 }),
          hit(A4('ルイ・ヴィトン'), 'paper_snap', { gain: 0.26 }),
          hit(A4('エルブイ'), 'pen_scratch', { gain: 0.18 }),
          hit(A4('営業利益率'), 'pen_scratch', { gain: 0.18 }),
          hit(A4('37.1'), 'chart_tick', { gain: 0.26 }),
          hit(A4('パーセントも'), 'pen_scratch', { gain: 0.2 }),
          hit(A4('100円売れる', { offset: -0.32 }), 'whoosh', { gain: 0.22 }),
          hit(A4('100円売れる', { offset: 0.1 }), 'soft_pop', { gain: 0.28 }),
          hit(A4('37円'), 'pen_scratch', { gain: 0.2 }),
          hit(A4('残る'), 'mech_slide', { gain: 0.26 }),
          hit(A4('普通のアパレル'), 'soft_pop', { gain: 0.24 }),
          hit(A4('数倍'), 'impact_thud', { gain: 0.28 }),
        ],
        backdrop: moneyBackdrop,
        render: moneyRender,
      },
      {
        id: 'price_doubles_tag_returns',
        type: 'custom',
        start: A4('しかも値札は'),
        surface: 'charcoal',
        camera: {
          moves: [{ at: A4('日本では'), zoom: 1.1, x: -150, y: 80, dur: 1.0 }],
          shakes: [A4('超え', { offset: 0.05 })],
        },
        beats: [
          hit(A4('値札は'), 'whoosh', { gain: 0.2 }),
          hit(A4('シャネル'), 'paper_snap', { gain: 0.24 }),
          hit(A4('5年'), 'chart_tick', { gain: 0.24 }),
          hit(A4('2倍'), 'impact_thud', { gain: 0.3 }),
          hit(A4('日本では'), 'price_ping', { gain: 0.3 }),
          hit(A4('超え'), 'stamp_thud', { gain: 0.32 }),
        ],
        render: priceRender,
      },
    ],
  };
}

export const AB_LUXURY_TRAP_V31_OPUS_HIGH_SPEC = definePlanESpec(BASE_TIMELINE, createV31OpusHighInput());

export const ABLuxuryTrapV31OpusHigh: React.FC = () => <PlanEMacroEconTemplate spec={AB_LUXURY_TRAP_V31_OPUS_HIGH_SPEC} />;
