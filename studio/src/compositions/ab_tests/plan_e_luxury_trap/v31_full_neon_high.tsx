import React from 'react';
import { AbsoluteFill } from 'remotion';
import {
  BgDraftingGrid,
  BgKraftCork,
  BgLightTable,
  BgMidnightBlueprint,
  BgRuledNotebook,
  BgStudioBlackRich,
  BgWarmWhiteSketch,
  BgWoodDesk,
  ChalkFilterDef,
  CountUp,
  DiegeticCoin,
  DiegeticHangTag,
  DiegeticStamp,
  DustField,
  EconHostAvatar,
  FONT_ECON_MONO,
  FONT_ECON_SANS,
  FONT_ECON_SERIF,
  InkStroke,
  LightBeam,
  MediaPlate,
  PaperScrap,
  PhotoPrint,
  Place,
  Pop,
  Spotlight,
  WORLD_COUNTRIES,
  WORLD_MAP_HEIGHT,
  WORLD_MAP_WIDTH,
  Window,
  at,
  atStart,
  boilSeed,
  clamp01,
  definePlanESpec,
  eio,
  eo,
  fly,
  handLine,
  hit,
  inkCirclePath,
  lerp,
  ring,
  rnd,
  rr,
  sag,
  spr,
  stagger,
  tornRect,
  wob,
  type PlanECustomSceneContext,
  type PlanEDefineInput,
  type PlanETimelineBase,
} from '../../../components/plan_e';
import { PlanEMacroEconTemplate } from '../../../templates/PlanEMacroEconTemplate';
import { BASE_TIMELINE } from './baseTimelineData';

/* ========================================================================== */
/* 共通カラー＆タイポグラフィ（紙・墨・朱・真鍮・黒板の物理パレット）                 */
/* ========================================================================== */

const INK = '#16130F';
const INK_MUTED = '#574E44';
const PAPER = '#FAF6EC';
const PAPER_WARM = '#F3EBD9';
const CRIMSON = '#C8102E';
const CRIMSON_BRIGHT = '#FF5247';
const GOLD = '#C9931B';
const GOLD_BRIGHT = '#F5C443';
const CHALK = '#F1EDE3';
const CHALK_MUTED = '#B9B1A1';
const NAVY_INK = '#1B4B72';
const EMERALD_INK = '#1E6B45';

const SERIF = { fontFamily: FONT_ECON_SERIF, fontWeight: 900 } as const;
const SANS = { fontFamily: FONT_ECON_SANS, fontWeight: 800 } as const;
const MONO = { fontFamily: FONT_ECON_MONO, fontWeight: 800 } as const;

/* ========================================================================== */
/* 再利用可能な小型エディトリアル SVG アイコン（純関数・hooks なし）               */
/* ========================================================================== */

const PersonIcon: React.FC<{
  x: number;
  y: number;
  scale?: number;
  color: string;
  opacity?: number;
  crown?: boolean;
}> = ({ x, y, scale = 1, color, opacity = 1, crown = false }) => (
  <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})`} opacity={opacity}>
    {crown ? (
      <path
        d="M -11 -26 L -7 -37 L 0 -30 L 7 -37 L 11 -26 Z"
        fill={GOLD_BRIGHT}
        stroke={INK}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    ) : null}
    <circle cx={0} cy={-16} r={9.5} fill={color} />
    <path d="M -15 16 C -15 -3, 15 -3, 15 16 Z" fill={color} />
  </g>
);

const WalletGlyph: React.FC<{ color?: string; accent?: string }> = ({
  color = '#2B1E14',
  accent = GOLD_BRIGHT,
}) => (
  <svg width={180} height={132} viewBox="0 0 180 132" style={{ display: 'block' }}>
    <rect x={12} y={24} width={156} height={96} rx={12} fill={color} stroke="#0E0905" strokeWidth={4} />
    <rect
      x={20}
      y={32}
      width={140}
      height={80}
      rx={8}
      fill="none"
      stroke="rgba(245,196,67,0.45)"
      strokeWidth={2}
      strokeDasharray="6 5"
    />
    {/* 飛び出す紙幣の端 */}
    <path d="M 36 24 L 54 6 L 138 6 L 148 24 Z" fill="#E6DFC8" stroke={INK} strokeWidth={3} />
    <line x1={62} y1={14} x2={126} y2={14} stroke={EMERALD_INK} strokeWidth={3} />
    {/* 留め具フラップ */}
    <rect x={118} y={56} width={54} height={34} rx={8} fill="#3E2B1C" stroke="#0E0905" strokeWidth={3.5} />
    <circle cx={136} cy={73} r={7} fill={accent} stroke="#0E0905" strokeWidth={2} />
  </svg>
);

const PushPin: React.FC<{ x: number; y: number; color?: string }> = ({ x, y, color = CRIMSON }) => (
  <g transform={`translate(${x} ${y})`}>
    <ellipse cx={3} cy={6} rx={11} ry={7} fill="rgba(0,0,0,0.42)" />
    <circle cx={0} cy={0} r={11} fill={color} stroke="#3B0A0D" strokeWidth={2.2} />
    <circle cx={-3.5} cy={-3.5} r={3.2} fill="rgba(255,255,255,0.58)" />
  </g>
);

/* ========================================================================== */
/* Scene 1 (0.00s - 6.46s): 160万円の値札ショーケース（dark_desk）               */
/* ========================================================================== */

const s1Backdrop = (c: PlanECustomSceneContext) => {
  const tBag = c.cue('160万円のバッグ');
  const tWho = c.cue('いちばん大事な客');
  const lampX = lerp(560, 1280, eio(c.sec, tWho - 0.2, 1.1));
  const lampR = lerp(240, 440, eo(c.sec, tBag - 0.15, 0.7));
  return (
    <>
      <BgWoodDesk sec={c.t} />
      <AbsoluteFill style={{ background: 'rgba(10, 5, 2, 0.28)', pointerEvents: 'none' }} />
      <Spotlight x={lampX} y={420} r={lampR} strength={0.62} />
      <DustField sec={c.sec} count={36} color="#FFE9C7" opacity={0.42} />
    </>
  );
};

const s1Render = (c: PlanECustomSceneContext) => {
  const tOpen = c.scene.startSec;
  const tPrice = c.cue('160万円のバッグ');
  const tSell = c.cue('売るなら');
  const tWho = c.cue('いちばん大事な客');

  const cardSpread = spr(c.sec, tWho, c.fps, { stiffness: 320, damping: 18 });
  const qPulse = 1 + Math.sin((c.sec - tWho) * 5.2) * 0.035;

  return (
    <>
      {/* 左：高級バッグ実写プリント（暗調机に置かれた商品） */}
      <Pop sec={c.sec} at={tOpen} x={150} y={135} rot={-2.6} from={1.08} dropY={36}>
        <PhotoPrint
          src={c.media('luxury_handbag_display')}
          w={560}
          h={590}
          border={18}
          caption="CLASSIC MONOGRAM"
          captionSize={30}
          objectPosition="50% 48%"
          filter="contrast(1.08) saturate(0.95)"
        />
      </Pop>

      {/* 中央上：160万円の吊り下げ値札（物理落下＆振り子スイング） */}
      <DiegeticHangTag
        atSec={tPrice}
        x={815}
        y={42}
        price="¥1,600,000"
        label="LUXURY BAG"
        scale={1.06}
        stringLen={118}
        swing
        glow={eo(c.sec, tPrice, 0.5) * 0.45}
      />

      {/* 右上：売る側の問いかけメモ */}
      <Pop sec={c.sec} at={tSell} x={1090} y={120} rot={1.8} from={0.78} dropY={-28}>
        <PaperScrap w={690} h={245} seed={4} tone={PAPER} padding="28px 38px">
          <div style={{ ...MONO, fontSize: 24, color: INK_MUTED, letterSpacing: '0.16em' }}>
            CASE FILE // 01
          </div>
          <div style={{ ...SERIF, fontSize: 56, color: INK, marginTop: 10, lineHeight: 1.2 }}>
            いちばん大事な客は
          </div>
          <div style={{ ...SERIF, fontSize: 64, color: CRIMSON, marginTop: 4 }}>誰なのか？</div>
        </PaperScrap>
      </Pop>

      {/* 赤い手描き丸囲み（「誰なのか？」を強調） */}
      <InkStroke
        sec={c.sec}
        at={tWho + 0.15}
        dur={0.55}
        color={CRIMSON}
        width={8}
        d={inkCirclePath(1268, 305, 185, 58, 7)}
      />

      {/* 右下：3枚の容疑者カードが扇状に展開 */}
      {c.sec >= tWho ? (
        <Place x={1090} y={445} w={700} h={380}>
          {[
            { label: '資産数十億', sub: '超富裕層？', rot: -7, dx: 0, dy: 24, bg: PAPER_WARM, color: GOLD },
            { label: '普通の会社員', sub: 'まさか…？', rot: 0, dx: 225, dy: 0, bg: PAPER, color: INK },
            { label: '？？？', sub: '本当の顧客', rot: 7, dx: 450, dy: 24, bg: '#2A1614', color: GOLD_BRIGHT },
          ].map((card, i) => {
            const p = spr(c.sec, stagger(tWho, i, 0.12), c.fps, { stiffness: 360, damping: 20 });
            const isMystery = i === 2;
            return (
              <div
                key={card.label}
                style={{
                  position: 'absolute',
                  left: lerp(225, card.dx, cardSpread),
                  top: lerp(90, card.dy, p),
                  width: 228,
                  height: 295,
                  background: card.bg,
                  border: `3px solid ${isMystery ? GOLD_BRIGHT : INK}`,
                  boxShadow: '0 18px 34px rgba(0,0,0,0.48)',
                  padding: '22px 16px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transform: `rotate(${(card.rot * cardSpread).toFixed(2)}deg) scale(${(p * (isMystery ? qPulse : 1)).toFixed(3)})`,
                  opacity: clamp01(p * 2.5),
                }}
              >
                <div style={{ ...MONO, fontSize: 18, color: isMystery ? CHALK_MUTED : INK_MUTED, letterSpacing: '0.14em' }}>
                  OPTION 0{i + 1}
                </div>
                <svg width={96} height={96} viewBox="-48 -60 96 100">
                  {isMystery ? (
                    <text
                      x={0}
                      y={14}
                      textAnchor="middle"
                      fill={GOLD_BRIGHT}
                      fontFamily={FONT_ECON_SERIF}
                      fontWeight={900}
                      fontSize={72}
                    >
                      ?
                    </text>
                  ) : (
                    <PersonIcon x={0} y={10} scale={1.75} color={card.color} crown={i === 0} />
                  )}
                </svg>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ ...SERIF, fontSize: 28, color: isMystery ? GOLD_BRIGHT : INK }}>{card.label}</div>
                  <div style={{ ...SANS, fontSize: 20, color: isMystery ? CHALK : INK_MUTED, marginTop: 4 }}>
                    {card.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </Place>
      ) : null}
    </>
  );
};

/* ========================================================================== */
/* Scene 2 (6.46s - 20.33s): VHS逆転劇 → 大富豪は無ロゴ → 普通の会社員の柱       */
/*   dark_broll (6.46) → paper (ところが) → charcoal (この業界を)               */
/* ========================================================================== */

const s2Backdrop = (c: PlanECustomSceneContext) => {
  const tFlip = c.beat('s2_flip_paper');
  const tPillar = c.beat('s2_pillar_chalk');
  const paperIn = eo(c.sec, tFlip, 0.28);
  const chalkIn = eo(c.sec, tPillar, 0.34);

  return (
    <>
      {c.sec < tFlip + 0.35 ? (
        <MediaPlate
          src={c.media('counting_cash_broll')}
          sec={c.sec}
          fromSec={c.scene.startSec}
          toSec={tFlip + 0.5}
          fps={c.fps}
          playbackRate={0.85}
          zoom={[1.04, 1.14]}
          dim={0.38}
          filter="contrast(1.16) saturate(0.85) brightness(0.82)"
        />
      ) : null}

      {c.sec >= tFlip && chalkIn < 1 ? (
        <AbsoluteFill
          style={{
            transform: `translateY(${lerp(-1120, 0, paperIn).toFixed(1)}px)`,
            boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          }}
        >
          <BgWarmWhiteSketch sec={Math.max(0, c.sec - tFlip)} />
        </AbsoluteFill>
      ) : null}

      {c.sec >= tPillar ? (
        <AbsoluteFill
          style={{
            transform: `translateX(${lerp(1960, 0, chalkIn).toFixed(1)}px)`,
            boxShadow: '-32px 0 70px rgba(0,0,0,0.6)',
          }}
        >
          <BgStudioBlackRich sec={Math.max(0, c.sec - tPillar)} actorX={1080} />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const s2Render = (c: PlanECustomSceneContext) => {
  const tOpen = c.scene.startSec;
  const tRich = c.cue('お金持ちです');
  const tFlip = c.beat('s2_flip_paper');
  const tBillionaire = c.cue('本物の大富豪ほど');
  const tLogo = c.cue('ロゴの目立つバッグ');
  const tPillar = c.beat('s2_pillar_chalk');
  const tSalaryman = c.cue('普通の会社員');

  const vhsPauseP = eo(c.sec, tRich - 0.1, 0.18);
  const riseP = eio(c.sec, tPillar + 0.18, 0.95);
  const salarySpr = spr(c.sec, tSalaryman, c.fps, { stiffness: 360, damping: 18 });
  const bSeed = boilSeed(c.frame, 12, 4);

  return (
    <>
      {/* パートA: VHS フリーズ「普通に考えれば、お金持ちです」 */}
      <Window sec={c.sec} from={tOpen} to={tFlip + 0.08}>
        {/* 走査線＆VHS一時停止オーバーレイ */}
        <AbsoluteFill
          style={{
            background:
              'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 2px, transparent 2px, transparent 5px)',
            pointerEvents: 'none',
          }}
        />
        <Place x={92} y={76}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 16,
              padding: '10px 24px',
              background: 'rgba(14, 12, 10, 0.84)',
              border: `3px solid ${CHALK}`,
            }}
          >
            <span style={{ ...MONO, fontSize: 34, color: CRIMSON_BRIGHT }}>❚❚ PAUSE</span>
            <span style={{ ...MONO, fontSize: 26, color: CHALK, letterSpacing: '0.12em' }}>
              COMMON SENSE // 00:06
            </span>
          </div>
        </Place>

        <Pop sec={c.sec} at={tOpen + 0.15} x={190} y={240} rot={-1.5}>
          <PaperScrap w={760} h={310} seed={12} tone={PAPER}>
            <div style={{ ...SANS, fontSize: 30, color: INK_MUTED }}>ふつうの常識</div>
            <div style={{ ...SERIF, fontSize: 82, color: INK, marginTop: 12 }}>客 ＝ お金持ち</div>
            <div style={{ ...SANS, fontSize: 30, color: EMERALD_INK, marginTop: 16 }}>
              160万円を即決できる富裕層のはず
            </div>
          </PaperScrap>
        </Pop>

        {/* 右下に進行役アバター（リモコンで止める） */}
        <Place
          x={1350}
          y={410}
          style={{
            transform: `translateY(${lerp(180, 0, vhsPauseP).toFixed(1)}px)`,
            opacity: clamp01(vhsPauseP * 2),
          }}
        >
          <EconHostAvatar pose="remote" emblem="¥?" scale={1.1} />
        </Place>
      </Window>

      {/* パートB: 紙面逆転「ところが本物の大富豪ほど、ロゴの目立つバッグを持ちたがりません」 */}
      <Window sec={c.sec} from={tFlip + 0.12} to={tPillar + 0.08}>
        <Place x={96} y={66}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ ...SANS, fontSize: 26, background: INK, color: PAPER, padding: '5px 18px', letterSpacing: '0.16em' }}>
              PARADOX
            </span>
            <span style={{ ...SERIF, fontSize: 44, color: INK }}>本物の大富豪が避けるもの</span>
          </div>
        </Place>

        {/* 左：本物の大富豪（クラシックなパリ・無地の品） */}
        <Pop sec={c.sec} at={tBillionaire} x={125} y={168} rot={-2.2} from={0.85}>
          <PhotoPrint
            src={c.media('paris_champs_elysees')}
            w={620}
            h={410}
            caption="本物の大富豪 ＝ 無地・ロゴなし"
            captionSize={30}
            filter="contrast(1.12) sepia(0.14)"
          />
        </Pop>

        {/* 右：ロゴの目立つバッグ → 赤い巨大なバツで却下 */}
        <Pop sec={c.sec} at={tLogo} x={1080} y={162} rot={2.4} from={1.18}>
          <PhotoPrint
            src={c.media('luxury_handbag_display')}
            w={580}
            h={410}
            caption="目立つロゴ ＝ 持ちたがらない"
            captionSize={30}
          />
        </Pop>

        {/* 巨大な赤バツ */}
        <InkStroke sec={c.sec} at={tLogo + 0.35} dur={0.22} color={CRIMSON} width={18} d="M 1120 190 L 1640 560" />
        <InkStroke sec={c.sec} at={tLogo + 0.52} dur={0.22} color={CRIMSON} width={18} d="M 1640 190 L 1120 560" />

        {/* 中央下：朱印スタンプ「真逆」 */}
        <DiegeticStamp text="真逆" atSec={tFlip + 0.25} size={86} rotateDeg={-10} style={{ left: 785, top: 360 }} />

        {/* 対比メモ */}
        <Pop sec={c.sec} at={tLogo + 0.85} x={410} y={700} rot={-0.8}>
          <PaperScrap w={1100} h={132} seed={19} tape={false} tone="#EFE4CD" padding="20px 36px">
            <div style={{ ...SERIF, fontSize: 42, color: INK, textAlign: 'center' }}>
              ロゴが大きいほど、本物の大富豪は離れていく
            </div>
          </PaperScrap>
        </Pop>
      </Window>

      {/* パートC: 黒板「この業界を太く支えているのは、お金持ちに見られたい普通の会社員のほうです」 */}
      <Window sec={c.sec} from={tPillar + 0.14}>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <ChalkFilterDef id="s2-chalk" scale={2.4} seed={bSeed} />
          </defs>
          {/* 業界を支える巨大な天板（LUXURY INDUSTRY） */}
          <g filter="url(#s2-chalk)" opacity={eo(c.sec, tPillar + 0.2, 0.4)}>
            <path d={rr(220, 108, 1480, 136, 4, 2)} fill="rgba(241,237,227,0.08)" stroke={GOLD_BRIGHT} strokeWidth={5} />
            <text x={960} y={196} textAnchor="middle" fill={GOLD_BRIGHT} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={68} letterSpacing="0.08em">
              高級ブランド業界
            </text>
          </g>

          {/* 下から天板を太く支える3本のチョーク矢印＆柱 */}
          {[420, 960, 1500].map((cx, i) => {
            const p = eo(c.sec, stagger(tPillar + 0.35, i, 0.18), 0.5);
            const topY = lerp(520, 268, p);
            return (
              <g key={cx} filter="url(#s2-chalk)" opacity={p}>
                <path d={handLine(cx, 540, cx, topY, 4, 10 + i)} stroke={CRIMSON_BRIGHT} strokeWidth={12} fill="none" strokeLinecap="round" />
                <path d={`M ${cx - 28} ${topY + 34} L ${cx} ${topY - 6} L ${cx + 28} ${topY + 34}`} stroke={CRIMSON_BRIGHT} strokeWidth={12} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })}

          {/* 下部シルエット群（支える会社員の波） */}
          <g opacity={riseP * 0.72}>
            {Array.from({ length: 19 }).map((_, i) => (
              <PersonIcon
                key={i}
                x={180 + i * 86}
                y={lerp(940, 825, riseP) + (i % 2) * 14}
                scale={1.35}
                color={i % 3 === 1 ? CRIMSON_BRIGHT : CHALK}
              />
            ))}
          </g>
        </svg>

        {/* 左中：渋谷・東京の会社員群衆実写プリント */}
        <Pop sec={c.sec} at={tPillar + 0.45} x={150} y={325} rot={-2.5}>
          <PhotoPrint
            src={c.media('tokyo_commuter_crowd')}
            w={540}
            h={340}
            caption="お金持ちに見られたい層"
            captionSize={28}
          />
        </Pop>

        {/* 右中：極太結論カード「普通の会社員」 */}
        <Place
          x={820}
          y={355}
          w={920}
          style={{
            transform: `scale(${lerp(0.75, 1, salarySpr).toFixed(4)}) rotate(-1.5deg)`,
            opacity: clamp01(salarySpr * 2),
          }}
        >
          <PaperScrap w={910} h={345} seed={27} tone="#F8F2E4" padding="32px 44px">
            <div style={{ ...SANS, fontSize: 32, color: CRIMSON, letterSpacing: '0.08em' }}>
              この業界を太く支える主役
            </div>
            <div style={{ ...SERIF, fontSize: 102, color: INK, marginTop: 10, lineHeight: 1.1 }}>
              普通の会社員
            </div>
            <div style={{ ...SANS, fontSize: 32, color: INK_MUTED, marginTop: 18 }}>
              「上に見られたい」欲望が、巨大な市場を支えている
            </div>
          </PaperScrap>
        </Place>
      </Window>
    </>
  );
};

/* ========================================================================== */
/* Scene 3 (20.33s - 40.84s): 60兆円市場の天秤（2% vs 98%・3億5000万人）        */
/*   whiteboard (20.33) → dark_desk (ところが残りの)                            */
/* ========================================================================== */

const s3Backdrop = (c: PlanECustomSceneContext) => {
  const tFlip = c.beat('s3_shift_dark');
  const darkIn = eo(c.sec, tFlip, 0.35);

  return (
    <>
      <BgDraftingGrid sec={c.t} />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 74% 68% at 50% 48%, rgba(238, 242, 232, 0.42) 0%, rgba(238, 242, 232, 0.14) 72%, rgba(238, 242, 232, 0) 100%)',
          pointerEvents: 'none',
        }}
      />
      {c.sec >= tFlip ? (
        <AbsoluteFill style={{ opacity: darkIn }}>
          <BgStudioBlackRich sec={Math.max(0, c.sec - tFlip)} actorX={1220} />
          {/* 暗いスタジオの奥に、大衆の買い物客動画を薄く透かして空気感を出す */}
          <AbsoluteFill style={{ opacity: 0.22 }}>
            <MediaPlate
              src={c.media('luxury_boutique_broll')}
              sec={c.sec}
              fromSec={tFlip}
              toSec={c.scene.endSec}
              fps={c.fps}
              playbackRate={0.72}
              zoom={[1.02, 1.1]}
              filter="grayscale(0.55) contrast(1.18) brightness(0.75)"
            />
          </AbsoluteFill>
          <Spotlight x={1220} y={470} r={470} strength={0.58} />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const s3Render = (c: PlanECustomSceneContext) => {
  const tOpen = c.scene.startSec;
  const t60 = c.cue('およそ60兆円');
  const t45 = c.cue('45パーセント');
  const tTop2 = c.cue('上位わずか2パーセント');
  const tFlip = c.beat('s3_shift_dark');
  const t350m = c.cue('3億5000万人');
  const tOverHalf = c.cue('売上の半分以上');

  const isDark = c.sec >= tFlip;
  const inkC = isDark ? CHALK : INK;

  // 天秤の傾き：前半 2% が落ちると左へ -8.5度傾き、後半 98% が落ちると右へ +10.5度ガコンと逆転！
  const leftTilt = -8.5 * eo(c.sec, t45, 0.65) + wob(c.sec, t45, -2.5, 2.6, 3.2);
  const rightTilt = 19.0 * eo(c.sec, tFlip, 0.52) + wob(c.sec, tFlip, 4.8, 2.8, 3.0);
  const beamAngle = leftTilt + rightTilt;

  const bar45 = eo(c.sec, t45, 0.75);
  const bar55 = eo(c.sec, tOverHalf - 0.35, 0.85);

  return (
    <>
      {/* 上段：市場規模ヘッダー（2024年 約60兆円） */}
      <Place x={96} y={42} w={1728}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span
              style={{
                ...MONO,
                fontSize: 24,
                background: isDark ? CRIMSON : INK,
                color: PAPER,
                padding: '5px 16px',
                letterSpacing: '0.14em',
              }}
            >
              GLOBAL MARKET // 2024
            </span>
            <span style={{ ...SERIF, fontSize: 38, color: inkC }}>世界の高級ブランド市場</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ ...SANS, fontSize: 30, color: isDark ? CHALK_MUTED : INK_MUTED }}>約</span>
            <CountUp
              sec={c.sec}
              at={tOpen + 0.3}
              dur={Math.max(1.2, t60 - tOpen)}
              from={0}
              to={60}
              format={(n) => `${Math.round(n)}兆円`}
              style={{
                ...SERIF,
                fontSize: 84,
                color: isDark ? GOLD_BRIGHT : INK,
                lineHeight: 1,
              }}
            />
          </div>
        </div>
        <div
          style={{
            height: 4,
            marginTop: 10,
            background: isDark ? 'rgba(241,237,227,0.28)' : 'rgba(22,19,15,0.22)',
          }}
        />
      </Place>

      {/* 中央：物理バランス天秤＆100人ドット分解 */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {/* 支点三角 */}
        <polygon points="960,592 920,680 1000,680" fill={isDark ? GOLD_BRIGHT : INK} />
        <rect x={855} y={680} width={210} height={16} rx={4} fill={isDark ? GOLD_BRIGHT : INK} />

        {/* 回転する天秤の梁 */}
        <g transform={`translate(960 592) rotate(${beamAngle.toFixed(2)})`}>
          <line x1={-520} y1={0} x2={520} y2={0} stroke={inkC} strokeWidth={12} strokeLinecap="round" />
          <circle cx={0} cy={0} r={16} fill={CRIMSON} stroke={inkC} strokeWidth={4} />

          {/* 左皿：上位2% 超富裕層（45%） */}
          <g transform="translate(-450 0)">
            <line x1={0} y1={0} x2={0} y2={-22} stroke={inkC} strokeWidth={5} />
            <rect x={-210} y={-34} width={420} height={14} rx={5} fill={GOLD} />
            {c.sec >= t45 ? (
              <g opacity={eo(c.sec, t45, 0.35)}>
                {/* 黄金の塊（45%の売上） */}
                <rect
                  x={-165}
                  y={-34 - 155 * bar45}
                  width={330}
                  height={155 * bar45}
                  rx={6}
                  fill={GOLD_BRIGHT}
                  stroke={INK}
                  strokeWidth={4}
                />
                <text x={0} y={-92} textAnchor="middle" fill={INK} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={74}>
                  45%
                </text>
                <text x={0} y={-48} textAnchor="middle" fill={INK} fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={26}>
                  売上の約半分
                </text>
              </g>
            ) : null}
            {/* 上位2%のアイコン2人だけ */}
            {c.sec >= tTop2 ? (
              <g opacity={eo(c.sec, tTop2, 0.35)}>
                <PersonIcon x={-28} y={-226} scale={1.4} color={GOLD} crown />
                <PersonIcon x={28} y={-226} scale={1.4} color={GOLD} crown />
              </g>
            ) : null}
          </g>

          {/* 右皿：残り98% 3億5000万人（55%） */}
          <g transform="translate(450 0)">
            <line x1={0} y1={0} x2={0} y2={-22} stroke={inkC} strokeWidth={5} />
            <rect x={-240} y={-34} width={480} height={14} rx={5} fill={CRIMSON_BRIGHT} />
            {c.sec >= tFlip ? (
              <g opacity={eo(c.sec, tFlip, 0.35)}>
                <rect
                  x={-205}
                  y={-34 - 195 * bar55}
                  width={410}
                  height={195 * bar55}
                  rx={6}
                  fill={CRIMSON}
                  stroke={PAPER}
                  strokeWidth={4}
                />
                <text x={0} y={-114} textAnchor="middle" fill={PAPER} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={84}>
                  55%
                </text>
                <text x={0} y={-60} textAnchor="middle" fill={GOLD_BRIGHT} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={28}>
                  売上の半分以上
                </text>
              </g>
            ) : null}
            {/* ぎっしり並ぶ大衆ドット */}
            {c.sec >= tFlip ? (
              <g opacity={eo(c.sec, tFlip + 0.25, 0.5)}>
                {Array.from({ length: 36 }).map((_, i) => {
                  const col = i % 12;
                  const row = Math.floor(i / 12);
                  return (
                    <circle
                      key={i}
                      cx={-176 + col * 32}
                      cy={-254 - row * 26}
                      r={8.5}
                      fill={row === 2 && col % 3 === 0 ? GOLD_BRIGHT : CHALK}
                      opacity={0.92}
                    />
                  );
                })}
              </g>
            ) : null}
          </g>
        </g>

        {/* 下部：100% 構成比較横帯 */}
        <g transform="translate(150 760)">
          <rect x={0} y={0} width={1620} height={66} rx={6} fill={isDark ? 'rgba(255,255,255,0.1)' : '#E7E0D2'} stroke={inkC} strokeWidth={3} />
          <rect x={0} y={0} width={1620 * 0.45 * bar45} height={66} rx={4} fill={GOLD_BRIGHT} />
          <rect x={1620 * 0.45} y={0} width={1620 * 0.55 * bar55} height={66} rx={4} fill={CRIMSON} />
          {c.sec >= t45 ? (
            <text x={365} y={45} textAnchor="middle" fill={INK} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={32}>
              上位 2% の超富裕層 ＝ 売上 45%
            </text>
          ) : null}
          {c.sec >= tFlip ? (
            <text x={1175} y={45} textAnchor="middle" fill={PAPER} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={34}>
              残り 98%（3億5,000万人+） ＝ 売上 55%
            </text>
          ) : null}
        </g>
      </svg>

      {/* 左ラベル：上位2%（天秤と干渉しない左上コーナーへ） */}
      <Pop sec={c.sec} at={tTop2} x={96} y={145} rot={-2}>
        <PaperScrap w={330} h={140} seed={8} tape="top" tone={PAPER_WARM} padding="20px 24px 14px">
          <div style={{ ...MONO, fontSize: 20, color: GOLD }}>TOP 2%</div>
          <div style={{ ...SERIF, fontSize: 40, color: INK }}>超富裕層</div>
          <div style={{ ...SANS, fontSize: 22, color: INK_MUTED }}>人数はごくわずか</div>
        </PaperScrap>
      </Pop>

      {/* 右ラベル：3億5000万人超（天秤ドット群と干渉しない右上へ） */}
      <Pop sec={c.sec} at={t350m} x={1360} y={142} rot={2}>
        <PaperScrap w={465} h={172} seed={15} tape="corners" tone={PAPER} padding="20px 28px">
          <div style={{ ...MONO, fontSize: 22, color: CRIMSON }}>REMAINING 98%</div>
          <CountUp
            sec={c.sec}
            at={t350m}
            dur={1.1}
            from={10000}
            to={35000}
            format={(n) => `${(n / 10000).toFixed(1)}億人超`}
            style={{ ...SERIF, fontSize: 60, color: CRIMSON, display: 'block', lineHeight: 1.15 }}
          />
          <div style={{ ...SANS, fontSize: 23, color: INK }}>背伸びして買う人たち</div>
        </PaperScrap>
      </Pop>

      {/* クライマックススタンプ：「売上の過半」（55%ブロック下にスッキリ配置） */}
      <DiegeticStamp text="売上の過半" atSec={tOverHalf} size={66} rotateDeg={-6} style={{ left: 765, top: 345 }} />
    </>
  );
};

/* ========================================================================== */
/* Scene 4 (40.84s - 64.87s): 利益率37.1%の錬金術 ＆ 5年で2倍の値札階段          */
/*   dark_broll (40.84) → paper (ルイ・ヴィトン) → charcoal (しかも値札は)       */
/* ========================================================================== */

const s4Backdrop = (c: PlanECustomSceneContext) => {
  const tPaper = c.beat('s4_paper_in');
  const tChalk = c.beat('s4_chalk_in');
  const paperSlide = eo(c.sec, tPaper, 0.34);
  const chalkSlide = eo(c.sec, tChalk, 0.34);

  return (
    <>
      {c.sec < tPaper + 0.38 ? (
        <MediaPlate
          src={c.media('counting_cash_broll')}
          sec={c.sec}
          fromSec={c.scene.startSec}
          toSec={tPaper + 0.4}
          fps={c.fps}
          trimBeforeSec={1.2}
          playbackRate={0.85}
          zoom={[1.05, 1.18]}
          dim={0.44}
        />
      ) : null}

      {c.sec >= tPaper && chalkSlide < 1 ? (
        <AbsoluteFill
          style={{
            transform: `translateX(${lerp(1940, 0, paperSlide).toFixed(1)}px)`,
            boxShadow: '-26px 0 56px rgba(0,0,0,0.4)',
          }}
        >
          <BgDraftingGrid sec={Math.max(0, c.sec - tPaper)} />
          <AbsoluteFill
            style={{
              background:
                'radial-gradient(ellipse 56% 64% at 72% 48%, rgba(238, 242, 232, 0.36) 0%, rgba(238, 242, 232, 0) 76%)',
              pointerEvents: 'none',
            }}
          />
        </AbsoluteFill>
      ) : null}

      {c.sec >= tChalk ? (
        <AbsoluteFill
          style={{
            transform: `translateY(${lerp(1100, 0, chalkSlide).toFixed(1)}px)`,
            boxShadow: '0 -28px 64px rgba(0,0,0,0.55)',
          }}
        >
          <BgMidnightBlueprint sec={Math.max(0, c.sec - tChalk)} titleCode="ECON-04" />
          <AbsoluteFill style={{ background: 'rgba(6, 20, 42, 0.28)', pointerEvents: 'none' }} />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const s4Render = (c: PlanECustomSceneContext) => {
  const tOpen = c.scene.startSec;
  const tPaper = c.beat('s4_paper_in');
  const tMargin = c.cue('37.1パーセント');
  const tCoin = c.cue('100円売れるたびに');
  const tApparel = c.cue('普通のアパレル');
  const tChalk = c.beat('s4_chalk_in');
  const tChanel = c.cue('シャネルの定番バッグ');
  const tDouble = c.cue('5年でほぼ2倍');
  const t160 = c.cue('160万円を超えました');

  const hlProg = eo(c.sec, tMargin - 0.15, 0.6);
  const bSeed = boilSeed(c.frame, 14, 4);

  return (
    <>
      {/* パートA: 導入問い（札束Bロール上） */}
      <Window sec={c.sec} from={tOpen} to={tPaper + 0.08}>
        <Pop sec={c.sec} at={tOpen + 0.1} x={240} y={280} rot={-1.6}>
          <PaperScrap w={1440} h={280} seed={33} tone={PAPER} padding="36px 56px">
            <div style={{ ...MONO, fontSize: 26, color: CRIMSON, letterSpacing: '0.16em' }}>
              FOLLOW THE MONEY
            </div>
            <div style={{ ...SERIF, fontSize: 78, color: INK, marginTop: 14 }}>
              その背伸びの代金は、どこへ行くのか？
            </div>
          </PaperScrap>
        </Pop>
      </Window>

      {/* パートB: 紙面決算シート＆100円玉から37円を切り出す */}
      <Window sec={c.sec} from={tPaper + 0.12} to={tChalk + 0.08}>
        {/* 左：LVMH 決算カード */}
        <Pop sec={c.sec} at={tPaper + 0.14} x={115} y={108} rot={-1.4} from={0.92}>
          <PaperScrap w={790} h={655} seed={41} tone="#FFFFFF" padding="34px 44px">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: `3px solid ${INK}`, paddingBottom: 14 }}>
              <span style={{ ...MONO, fontSize: 24, background: INK, color: PAPER, padding: '4px 14px' }}>
                FINANCIAL REPORT
              </span>
              <span style={{ ...MONO, fontSize: 24, color: INK_MUTED }}>LVMH GROUP</span>
            </div>
            <div style={{ ...SERIF, fontSize: 48, color: INK, marginTop: 22, lineHeight: 1.25 }}>
              ファッション＆革製品部門
            </div>
            <div style={{ ...SANS, fontSize: 26, color: INK_MUTED, marginTop: 6 }}>
              ルイ・ヴィトン／ディオール等を擁する中核事業
            </div>

            <div style={{ marginTop: 32 }}>
              {[
                ['事業セグメント', '革製品・ファッション'],
                ['営業利益率', '37.1 %'],
                ['一般アパレル平均', '約 5 〜 8 %'],
              ].map(([k, v], i) => (
                <div
                  key={k}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '20px 10px',
                    borderBottom: '1px dashed rgba(22,19,15,0.32)',
                    fontFamily: FONT_ECON_SANS,
                    fontWeight: 900,
                    fontSize: i === 1 ? 40 : 32,
                    color: i === 1 ? CRIMSON : INK,
                  }}
                >
                  {i === 1 ? (
                    <div
                      style={{
                        position: 'absolute',
                        left: -8,
                        top: 8,
                        bottom: 8,
                        width: `${(hlProg * 103).toFixed(1)}%`,
                        background: 'rgba(245, 196, 67, 0.56)',
                        zIndex: 0,
                      }}
                    />
                  ) : null}
                  <span style={{ position: 'relative' }}>{k}</span>
                  <span style={{ position: 'relative', fontFamily: FONT_ECON_MONO }}>{v}</span>
                </div>
              ))}
            </div>
          </PaperScrap>
        </Pop>

        {/* 左下に赤判子「営業利益率 37.1%」 */}
        <DiegeticStamp text="異常利益 37.1%" atSec={tMargin + 0.1} size={56} rotateDeg={-6} style={{ left: 260, top: 618 }} />

        {/* 右：100円玉から37.1%切り出し＋一般アパレル比較 */}
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <DiegeticCoin
            atSec={tCoin - 0.1}
            cx={1285}
            cy={375}
            r={195}
            frac={0.371}
            face="¥100"
            fillColor={CRIMSON}
            fillDelaySec={0.2}
            fillDurSec={0.85}
          />
          {c.sec >= tCoin + 0.5 ? (
            <g opacity={eo(c.sec, tCoin + 0.5, 0.35)}>
              <text x={1285} y={665} textAnchor="middle" fill={CRIMSON} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={84}>
                ¥37 が残る
              </text>
              <text x={1285} y={722} textAnchor="middle" fill={INK_MUTED} fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={30}>
                100円売れるたびに手元へ
              </text>
            </g>
          ) : null}

          {/* 右上隅：一般アパレル比較ミニコイン */}
          <DiegeticCoin
            atSec={tApparel}
            cx={1695}
            cy={290}
            r={86}
            frac={0.07}
            face="¥100"
            label="一般アパレル"
            fillColor={NAVY_INK}
            fillDelaySec={0.12}
            fillDurSec={0.45}
          />
          {c.sec >= tApparel + 0.65 ? (
            <g opacity={eo(c.sec, tApparel + 0.65, 0.3)} transform="rotate(-7 1695 510)">
              <text x={1695} y={510} textAnchor="middle" fill={CRIMSON} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={62}>
                数倍の儲け
              </text>
            </g>
          ) : null}
        </svg>
      </Window>

      {/* パートC: 黒板エスカレーター「シャネル定番バッグ：5年でほぼ2倍・160万円超」 */}
      <Window sec={c.sec} from={tChalk + 0.12}>
        <Place x={96} y={64}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ ...MONO, fontSize: 24, background: CRIMSON, color: PAPER, padding: '5px 16px', letterSpacing: '0.14em' }}>
              PRICE ESCALATION
            </span>
            <span style={{ ...SERIF, fontSize: 46, color: CHALK }}>止まらない値札の階段</span>
          </div>
        </Place>

        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <ChalkFilterDef id="s4-chalk" scale={2.2} seed={bSeed} />
          </defs>

          {/* 軸線 */}
          <g filter="url(#s4-chalk)" opacity={eo(c.sec, tChalk + 0.18, 0.4)}>
            <path d={handLine(160, 770, 1340, 770, 3, 1)} stroke={CHALK_MUTED} strokeWidth={4} fill="none" />
            <path d={handLine(160, 770, 160, 190, 3, 2)} stroke={CHALK_MUTED} strokeWidth={4} fill="none" />
          </g>

          {/* 5年間の値上がり階段バー（2019 → 2024） */}
          {[
            { year: '2019', yen: '約80万円', h: 240, x: 240, at: tChalk + 0.25 },
            { year: '2020', yen: '約95万円', h: 295, x: 455, at: tChanel - 0.1 },
            { year: '2022', yen: '約125万円', h: 395, x: 670, at: tChanel + 0.55 },
            { year: '2023', yen: '約145万円', h: 465, x: 885, at: tDouble - 0.15 },
            { year: '2024', yen: '160万円超', h: 535, x: 1100, at: t160 - 0.25, peak: true },
          ].map((bar) => {
            const p = eo(c.sec, bar.at, 0.45);
            const curH = bar.h * p;
            const yTop = 770 - curH;
            return (
              <g key={bar.year} opacity={clamp01(p * 3)}>
                <rect
                  x={bar.x}
                  y={yTop}
                  width={150}
                  height={curH}
                  rx={4}
                  fill={bar.peak ? CRIMSON_BRIGHT : 'rgba(241,237,227,0.22)'}
                  stroke={bar.peak ? GOLD_BRIGHT : CHALK}
                  strokeWidth={bar.peak ? 5 : 3}
                />
                <text x={bar.x + 75} y={818} textAnchor="middle" fill={CHALK_MUTED} fontFamily={FONT_ECON_MONO} fontWeight={800} fontSize={28}>
                  {bar.year}
                </text>
                {p > 0.5 ? (
                  <text
                    x={bar.x + 75}
                    y={yTop - 16}
                    textAnchor="middle"
                    fill={bar.peak ? GOLD_BRIGHT : CHALK}
                    fontFamily={FONT_ECON_SERIF}
                    fontWeight={900}
                    fontSize={bar.peak ? 36 : 28}
                  >
                    {bar.yen}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* 上昇矢印（バーラベルの上を通る美しい軌道） */}
        <InkStroke
          sec={c.sec}
          at={tDouble}
          dur={0.55}
          color={GOLD_BRIGHT}
          width={11}
          d="M 290 450 Q 670 305 1105 142 M 1052 138 L 1116 138 L 1090 192"
        />

        {/* 「5年でほぼ2倍」バッジ（左上余白にスッキリ配置） */}
        <Pop sec={c.sec} at={tDouble + 0.2} x={245} y={168} rot={-5}>
          <PaperScrap w={450} h={142} seed={55} tape={false} tone={GOLD_BRIGHT} padding="14px 26px">
            <div style={{ ...SERIF, fontSize: 62, color: INK, textAlign: 'center', whiteSpace: 'nowrap' }}>
              5年でほぼ 2倍
            </div>
          </PaperScrap>
        </Pop>

        {/* 右側：160万円の吊り下げ値札が落下 */}
        <DiegeticHangTag
          atSec={t160 - 0.15}
          x={1580}
          y={75}
          price="¥1,600,000"
          label="JAPAN RETAIL"
          scale={1.06}
          stringLen={120}
          swing
          glow={0.55}
        />

        <DiegeticStamp text="160万円超" atSec={t160 + 0.3} size={64} rotateDeg={-8} style={{ left: 1365, top: 625 }} />
      </Window>
    </>
  );
};

/* ========================================================================== */
/* Scene 5 (64.87s - 82.18s): 5000万人脱落の逆説「下がらず上がる値札」            */
/*   paper (64.87) → dark_desk (約5000万人) → whiteboard (普通なら値下げ)        */
/*   → charcoal (ところがブランド)                                              */
/* ========================================================================== */

const DROPOUT_PEOPLE = Array.from({ length: 50 }, (_, i) => ({
  col: i % 10,
  row: Math.floor(i / 10),
  drops: i % 10 >= 6 || (i % 7 === 0 && i > 12),
  delay: rnd(i * 19 + 7) * 0.75,
  driftX: (rnd(i * 31 + 3) - 0.5) * 180,
}));

const s5Backdrop = (c: PlanECustomSceneContext) => {
  const tDark = c.beat('s5_dark_drop');
  const tBoard = c.beat('s5_whiteboard');
  const tChalk = c.beat('s5_chalk_raise');

  const darkP = eo(c.sec, tDark, 0.25);
  const boardP = eo(c.sec, tBoard, 0.25);
  const chalkP = eo(c.sec, tChalk, 0.25);

  return (
    <>
      <BgRuledNotebook sec={c.t} headerDate="22 - 24" headerNote="" />
      {c.sec >= tDark && boardP < 1 ? (
        <AbsoluteFill style={{ opacity: darkP }}>
          <BgStudioBlackRich sec={Math.max(0, c.sec - tDark)} actorX={560} />
          <Spotlight x={960} y={440} r={480} strength={0.55} />
        </AbsoluteFill>
      ) : null}
      {c.sec >= tBoard && chalkP < 1 ? (
        <AbsoluteFill style={{ transform: `translateX(${lerp(1940, 0, boardP).toFixed(1)}px)` }}>
          <BgLightTable sec={Math.max(0, c.sec - tBoard)} cutCode="EC-05" />
        </AbsoluteFill>
      ) : null}
      {c.sec >= tChalk ? (
        <AbsoluteFill style={{ opacity: chalkP }}>
          <BgStudioBlackRich sec={Math.max(0, c.sec - tChalk)} actorX={1240} />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const s5Render = (c: PlanECustomSceneContext) => {
  const tOpen = c.scene.startSec;
  const t2022 = c.cue('2022年から');
  const tPressure = c.cue('値上げと物価高');
  const tDark = c.beat('s5_dark_drop');
  const tLeft = c.cue('市場を去りました');
  const tBoard = c.beat('s5_whiteboard');
  const tChalk = c.beat('s5_chalk_raise');
  const tRaise = c.cue('もう一段の値上げ');

  const pressP = eo(c.sec, tPressure, 0.7);
  const bSeed = boilSeed(c.frame, 12, 4);

  return (
    <>
      {/* パートA: 紙面の異常レポート（2022→2024 値上げ＆物価高の挟み撃ち） */}
      <Window sec={c.sec} from={tOpen} to={tDark + 0.05}>
        <Pop sec={c.sec} at={tOpen + 0.1} x={225} y={88} rot={-0.6}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ ...MONO, fontSize: 28, background: CRIMSON, color: PAPER, padding: '6px 20px', letterSpacing: '0.14em' }}>
              MARKET ANOMALY
            </span>
            <span style={{ ...SERIF, fontSize: 52, color: INK }}>ここで、妙なことが起きる</span>
          </div>
        </Pop>

        {/* 中央の2年間カレンダーチケット */}
        <Pop sec={c.sec} at={t2022} x={610} y={220} rot={-1.5}>
          <PaperScrap w={700} h={280} seed={62} tone="#FFFFFF" padding="28px 40px">
            <div style={{ ...MONO, fontSize: 24, color: INK_MUTED, textAlign: 'center', letterSpacing: '0.16em' }}>
              TIME SPAN // 2 YEARS
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36, marginTop: 18 }}>
              <span style={{ ...SERIF, fontSize: 96, color: INK }}>2022</span>
              <span style={{ ...SERIF, fontSize: 72, color: CRIMSON }}>→</span>
              <CountUp
                sec={c.sec}
                at={t2022 + 0.25}
                dur={1.1}
                from={2022}
                to={2024}
                format={(n) => String(Math.round(n))}
                style={{ ...SERIF, fontSize: 96, color: CRIMSON }}
              />
            </div>
          </PaperScrap>
        </Pop>

        {/* 左右から迫る「値上げ」「物価高」の赤い圧力ブロック */}
        {c.sec >= tPressure ? (
          <>
            <Place x={lerp(40, 230, pressP)} y={555} rot={-4}>
              <PaperScrap w={460} h={180} seed={71} tape={false} tone={CRIMSON} padding="36px 24px">
                <div style={{ ...SERIF, fontSize: 62, color: PAPER, textAlign: 'center', whiteSpace: 'nowrap' }}>連続値上げ</div>
              </PaperScrap>
            </Place>
            <Place x={lerp(1440, 1230, pressP)} y={555} rot={4}>
              <PaperScrap w={460} h={180} seed={72} tape={false} tone={INK} padding="36px 24px">
                <div style={{ ...SERIF, fontSize: 62, color: GOLD_BRIGHT, textAlign: 'center', whiteSpace: 'nowrap' }}>物価高騰</div>
              </PaperScrap>
            </Place>
            <Place x={755} y={605}>
              <div style={{ ...SERIF, fontSize: 52, color: CRIMSON, textAlign: 'center', width: 410, whiteSpace: 'nowrap' }}>
                ▶ 限界を突破 ◀
              </div>
            </Place>
          </>
        ) : null}
      </Window>

      {/* パートB: 暗い机へ暗転「約5000万人が、この市場を去りました」 */}
      <Window sec={c.sec} from={tDark + 0.05} to={tBoard + 0.05}>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* 50体の購入者グリッドから一気に崩落する演出 */}
          {DROPOUT_PEOPLE.map((p, i) => {
            const baseX = 190 + p.col * 82;
            const baseY = 230 + p.row * 105;
            if (!p.drops) {
              return <PersonIcon key={i} x={baseX} y={baseY} scale={1.35} color={CHALK_MUTED} opacity={0.78} />;
            }
            const dropStart = tLeft - 0.35 + p.delay * 0.55;
            if (c.sec < dropStart) {
              return <PersonIcon key={i} x={baseX} y={baseY} scale={1.35} color={CRIMSON_BRIGHT} opacity={0.95} />;
            }
            const f = fly(c.sec, dropStart, 0.85, { x: baseX, y: baseY }, { x: baseX + p.driftX, y: 980 }, 45);
            return (
              <PersonIcon
                key={i}
                x={f.x}
                y={f.y}
                scale={1.35}
                color={CRIMSON_BRIGHT}
                opacity={clamp01(1 - f.u * 1.15)}
              />
            );
          })}
        </svg>

        {/* 右側：巨大な欠損カウンター −5,000万人 */}
        <Pop sec={c.sec} at={tDark + 0.1} x={1055} y={205} rot={-2} from={1.15}>
          <PaperScrap w={730} h={430} seed={88} tone="#1D1410" padding="36px 42px">
            <div style={{ ...MONO, fontSize: 26, color: CRIMSON_BRIGHT, letterSpacing: '0.16em' }}>
              CUSTOMER EXODUS
            </div>
            <CountUp
              sec={c.sec}
              at={tDark + 0.15}
              dur={1.45}
              from={0}
              to={5000}
              format={(n) => `−${Math.round(n).toLocaleString('ja-JP')}万人`}
              style={{ ...SERIF, fontSize: 108, color: CRIMSON_BRIGHT, display: 'block', marginTop: 18, lineHeight: 1.05 }}
            />
            <div style={{ ...SERIF, fontSize: 44, color: PAPER, marginTop: 22 }}>高級市場から一斉退場</div>
            <div style={{ ...SANS, fontSize: 28, color: CHALK_MUTED, marginTop: 10 }}>
              客が5000万人消えた異常事態
            </div>
          </PaperScrap>
        </Pop>
      </Window>

      {/* パートC: ホワイトボード「普通なら値下げを考える場面です」 */}
      <Window sec={c.sec} from={tBoard + 0.08} to={tChalk + 0.05}>
        <Place x={150} y={135}>
          <div style={{ ...MONO, fontSize: 26, color: NAVY_INK, letterSpacing: '0.16em' }}>
            TEXTBOOK ECONOMICS // 通常の経営判断
          </div>
          <div style={{ ...SERIF, fontSize: 66, color: INK, marginTop: 12 }}>
            客が 5,000万人 減ったら？
          </div>
        </Place>

        <Pop sec={c.sec} at={tBoard + 0.25} x={220} y={350} rot={-1.2}>
          <PaperScrap w={960} h={340} seed={91} tone="#FFFFFF" padding="36px 48px">
            <div style={{ ...SANS, fontSize: 32, color: INK_MUTED }}>ふつうの解決策</div>
            <div style={{ ...SERIF, fontSize: 108, color: EMERALD_INK, marginTop: 14 }}>
              値下げする ↓
            </div>
          </PaperScrap>
        </Pop>

        <InkStroke
          sec={c.sec}
          at={tBoard + 0.45}
          dur={0.45}
          color={EMERALD_INK}
          width={16}
          d="M 1360 280 C 1380 420 1350 560 1370 700 M 1300 620 L 1370 715 L 1440 620"
        />
      </Window>

      {/* パートD: 黒板へ叩きつけ「ところがブランドが選んだのは、もう一段の値上げでした」 */}
      <Window sec={c.sec} from={tChalk + 0.06}>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <ChalkFilterDef id="s5-chalk" scale={2.4} seed={bSeed} />
          </defs>
          {/* 却下された「値下げ」メモが左下に小さく斜め打ち消し */}
          <g filter="url(#s5-chalk)" opacity={0.55}>
            <text x={240} y={640} fill={CHALK_MUTED} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={74}>
              値下げ
            </text>
            <path d={handLine(195, 585, 495, 655, 5, 4)} stroke={CRIMSON_BRIGHT} strokeWidth={12} />
            <path d={handLine(495, 585, 195, 655, 5, 5)} stroke={CRIMSON_BRIGHT} strokeWidth={12} />
          </g>
        </svg>

        {/* 右斜め上に突き抜ける巨大矢印 */}
        <InkStroke
          sec={c.sec}
          at={tRaise - 0.35}
          dur={0.42}
          color={GOLD_BRIGHT}
          width={18}
          d="M 520 720 Q 980 560 1480 185 M 1395 190 L 1492 178 L 1466 274"
        />

        {/* 上昇する値札 */}
        <DiegeticHangTag
          atSec={tRaise - 0.15}
          x={1580}
          y={45}
          price="再値上げ"
          label="PRICE HIKE"
          scale={1.06}
          stringLen={105}
          swing
          glow={0.65}
        />

        {/* 中央ドン！スタンプ「もう一段の値上げ」 */}
        <DiegeticStamp text="もう一段の値上げ" atSec={tRaise} size={86} rotateDeg={-6} style={{ left: 320, top: 280 }} />
      </Window>
    </>
  );
};

/* ========================================================================== */
/* Scene 6 (82.18s - 104.58s): 2010年マーケティング研究 4象限コルクボード捜査     */
/*   corkboard (82.18) → paper (本当の資産家ほど) → dark_desk (大きなロゴを)    */
/* ========================================================================== */

const s6Backdrop = (c: PlanECustomSceneContext) => {
  const tPaper = c.beat('s6_paper_quiet');
  const tDark = c.beat('s6_dark_logo');
  const paperP = eo(c.sec, tPaper, 0.32);
  const darkP = eo(c.sec, tDark, 0.3);

  return (
    <>
      <BgKraftCork sec={c.t} />
      {c.sec >= tPaper && darkP < 1 ? (
        <AbsoluteFill
          style={{
            transform: `translateY(${lerp(1100, 0, paperP).toFixed(1)}px)`,
            boxShadow: '0 -24px 60px rgba(0,0,0,0.42)',
          }}
        >
          <BgWarmWhiteSketch sec={Math.max(0, c.sec - tPaper)} />
        </AbsoluteFill>
      ) : null}
      {c.sec >= tDark ? (
        <AbsoluteFill style={{ opacity: darkP }}>
          <BgWoodDesk sec={Math.max(0, c.sec - tDark)} />
          <AbsoluteFill style={{ background: 'rgba(10, 5, 2, 0.28)', pointerEvents: 'none' }} />
          <Spotlight x={960} y={440} r={460} strength={0.62} />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const s6Render = (c: PlanECustomSceneContext) => {
  const tOpen = c.scene.startSec;
  const tWealth = c.cue('資産の多さ');
  const tShowOff = c.cue('見せびらかしたい気持ち');
  const tSplit = c.cue('4つに分けると');
  const tPaper = c.beat('s6_paper_quiet');
  const tMaterial = c.cue('素材や仕立ての違い');
  const tDark = c.beat('s6_dark_logo');
  const tAbove = c.cue('上にいると見せたい');

  const yAxisP = eo(c.sec, tWealth, 0.55);
  const xAxisP = eo(c.sec, tShowOff, 0.55);
  const redCordP = eo(c.sec, tSplit, 0.65);

  return (
    <>
      {/* パートA: コルクボード上の4象限捜査マップ */}
      <Window sec={c.sec} from={tOpen} to={tPaper + 0.08}>
        {/* 左上見出しメモ */}
        <Pop sec={c.sec} at={tOpen + 0.1} x={88} y={50} rot={-1.8}>
          <PaperScrap w={640} h={150} seed={101} tape="top" tone={PAPER} padding="28px 26px 16px">
            <div style={{ ...MONO, fontSize: 22, color: CRIMSON, letterSpacing: '0.14em' }}>
              MARKETING STUDY // 2010
            </div>
            <div style={{ ...SERIF, fontSize: 38, color: INK, marginTop: 4 }}>
              買い手の 4タイプ分類
            </div>
          </PaperScrap>
        </Pop>

        {/* 赤紐の2軸（クラフト紙上でくっきり読める墨軸＋紙タグ帯） */}
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* 縦軸：資産の多さ */}
          {c.sec >= tWealth ? (
            <>
              <path
                d={handLine(960, 825, 960, lerp(825, 134, yAxisP), 4, 3)}
                stroke={INK}
                strokeWidth={6}
                fill="none"
              />
              <g opacity={yAxisP}>
                <rect x={838} y={70} width={244} height={46} rx={3} fill={INK} />
                <text x={960} y={104} textAnchor="middle" fill={PAPER} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={32}>
                  ▲ 資産が多い
                </text>
              </g>
              <PushPin x={960} y={134} />
            </>
          ) : null}
          {/* 横軸：見せびらかしたい欲 */}
          {c.sec >= tShowOff ? (
            <>
              <path
                d={handLine(260, 500, lerp(260, 1660, xAxisP), 500, 4, 4)}
                stroke={INK}
                strokeWidth={6}
                fill="none"
              />
              <g opacity={xAxisP}>
                <rect x={1402} y={448} width={322} height={44} rx={3} fill={CRIMSON} />
                <text x={1563} y={480} textAnchor="middle" fill={PAPER} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={30}>
                  見せびらかしたい ▶
                </text>
                <rect x={256} y={448} width={262} height={44} rx={3} fill={INK} />
                <text x={387} y={480} textAnchor="middle" fill={PAPER} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={30}>
                  ◀ 静かに楽しむ
                </text>
              </g>
              <PushPin x={960} y={500} color={GOLD_BRIGHT} />
            </>
          ) : null}

          {/* 対角を結ぶ赤い捜査紐 */}
          {c.sec >= tSplit ? (
            <path
              d={sag({ x: 560, y: 270 }, { x: 1360, y: 690 }, 18)}
              stroke={CRIMSON}
              strokeWidth={6}
              fill="none"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={(1 - redCordP).toFixed(4)}
            />
          ) : null}
        </svg>

        {/* 4象限のピン留めカード */}
        {[
          { x: 315, y: 245, title: '本物の資産家', sub: '資産：高 × 顕示：低', tag: 'ロゴなし', tone: '#FBF7ED', rot: -2.2, idx: 0 },
          { x: 1110, y: 245, title: '成金層', sub: '資産：高 × 顕示：高', tag: '大ロゴ', tone: '#F4EBD7', rot: 1.8, idx: 1 },
          { x: 315, y: 585, title: '関心なし層', sub: '資産：低 × 顕示：低', tag: '買わない', tone: '#E8DFCE', rot: 1.5, idx: 2 },
          { x: 1110, y: 585, title: '背伸び層', sub: '資産：低 × 顕示：高', tag: '巨大ロゴ熱望', tone: '#FCE8E8', rot: -2.0, idx: 3 },
        ].map((q) => (
          <Pop key={q.title} sec={c.sec} at={stagger(tSplit - 0.1, q.idx, 0.25)} x={q.x} y={q.y} rot={q.rot}>
            <PaperScrap w={490} h={210} seed={110 + q.idx} tape={false} tone={q.tone} padding="26px 28px">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ ...SERIF, fontSize: 40, color: INK }}>{q.title}</span>
                <span
                  style={{
                    ...SANS,
                    fontSize: 22,
                    background: q.idx === 3 ? CRIMSON : q.idx === 0 ? EMERALD_INK : INK,
                    color: PAPER,
                    padding: '4px 12px',
                  }}
                >
                  {q.tag}
                </span>
              </div>
              <div style={{ ...MONO, fontSize: 24, color: INK_MUTED, marginTop: 14 }}>{q.sub}</div>
            </PaperScrap>
          </Pop>
        ))}

        {/* 前面の押しピン（カードを実際にコルクへ留める立体表現） */}
        {c.sec >= tSplit ? (
          <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 12 }}>
            <PushPin x={560} y={262} />
            <PushPin x={1355} y={262} color={GOLD_BRIGHT} />
            <PushPin x={560} y={602} color={INK} />
            <PushPin x={1355} y={602} />
          </svg>
        ) : null}
      </Window>

      {/* パートB: 紙面クローズアップ「本当の資産家ほどロゴのない地味な品」 */}
      <Window sec={c.sec} from={tPaper + 0.1} to={tDark + 0.08}>
        <Place x={96} y={66}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ ...MONO, fontSize: 24, background: EMERALD_INK, color: PAPER, padding: '5px 16px', letterSpacing: '0.14em' }}>
              QUIET LUXURY // 左上の象限
            </span>
            <span style={{ ...SERIF, fontSize: 46, color: INK }}>本当の資産家の選び方</span>
          </div>
        </Place>

        {/* 左：モノクロ老舗写真 */}
        <Pop sec={c.sec} at={tPaper + 0.16} x={135} y={175} rot={-2.2}>
          <PhotoPrint
            src={c.media('paris_champs_elysees')}
            w={640}
            h={440}
            caption="ロゴの消えた静かな高級品"
            captionSize={30}
            filter="contrast(1.1) sepia(0.12)"
          />
        </Pop>

        {/* 右：素材と仕立ての暗号カード */}
        <Pop sec={c.sec} at={tMaterial - 0.15} x={925} y={195} rot={1.4}>
          <PaperScrap w={840} h={495} seed={128} tone="#FFFFFF" padding="42px 44px">
            <div style={{ ...MONO, fontSize: 24, color: EMERALD_INK, letterSpacing: '0.14em' }}>
              INSIDER SIGNAL
            </div>
            <div style={{ ...SERIF, fontSize: 48, color: INK, marginTop: 18, lineHeight: 1.25, whiteSpace: 'nowrap' }}>
              素材と仕立ての違いだけでいい
            </div>
            <div style={{ height: 3, background: INK, margin: '28px 0' }} />
            <div style={{ ...SANS, fontSize: 34, color: INK_MUTED, lineHeight: 1.6 }}>
              ・大きなブランドロゴは不要
              <br />
              ・同じ階層の仲間にだけ伝われば十分
            </div>
          </PaperScrap>
        </Pop>

        {/* 緑の丸囲み（1行の見出しにピッタリ） */}
        <InkStroke
          sec={c.sec}
          at={tMaterial + 0.6}
          dur={0.55}
          color={EMERALD_INK}
          width={9}
          d={inkCirclePath(1320, 326, 365, 56, 12)}
        />
      </Window>

      {/* パートC: 暗い机へ暗転「大きなロゴを欲しがったのは、上にいると見せたい人たち」 */}
      <Window sec={c.sec} from={tDark + 0.08}>
        <Pop sec={c.sec} at={tDark + 0.12} x={175} y={140} rot={-2.5} from={1.12}>
          <PhotoPrint
            src={c.media('luxury_handbag_display')}
            w={540}
            h={560}
            caption="ひと目で分かる巨大ロゴ"
            captionSize={32}
          />
        </Pop>

        <Pop sec={c.sec} at={tAbove - 0.25} x={855} y={185} rot={1.5}>
          <PaperScrap w={890} h={430} seed={144} tone={PAPER} padding="36px 46px">
            <div style={{ ...MONO, fontSize: 26, color: CRIMSON, letterSpacing: '0.16em' }}>
              STATUS SIGNALING
            </div>
            <div style={{ ...SERIF, fontSize: 74, color: INK, marginTop: 14, lineHeight: 1.2 }}>
              「上にいる」と
              <br />
              見せたい人たち
            </div>
            <div style={{ ...SANS, fontSize: 32, color: INK_MUTED, marginTop: 22 }}>
              だからこそ、分かりやすいロゴに金を払う
            </div>
          </PaperScrap>
        </Pop>

        <DiegeticStamp text="BIG LOGO" atSec={tAbove + 0.15} size={78} rotateDeg={-9} style={{ left: 1120, top: 645 }} />
      </Window>
    </>
  );
};

/* ========================================================================== */
/* Scene 7 (104.58s - 119.73s): 1899年ヴェブレン理論 ＆ 価格ハードルの選別門      */
/*   dark_desk (104.58) → paper (値上げは客を)                                 */
/* ========================================================================== */

const SIEVE_CROWD = Array.from({ length: 28 }, (_, i) => ({
  x: 240 + (i % 7) * 105 + (Math.floor(i / 7) % 2) * 38,
  y: 255 + Math.floor(i / 7) * 108,
  stays: i < 7,
  delay: rnd(i * 23 + 5) * 0.55,
}));

const s7Backdrop = (c: PlanECustomSceneContext) => {
  const tPaper = c.beat('s7_paper_sieve');
  const paperIn = eo(c.sec, tPaper, 0.34);

  return (
    <>
      <BgWoodDesk sec={c.t} />
      <AbsoluteFill style={{ background: 'rgba(10, 5, 2, 0.24)', pointerEvents: 'none' }} />
      <Spotlight x={960} y={420} r={490} strength={0.6} />
      {c.sec >= tPaper ? (
        <AbsoluteFill
          style={{
            transform: `translateX(${lerp(-1940, 0, paperIn).toFixed(1)}px)`,
            boxShadow: '30px 0 60px rgba(0,0,0,0.45)',
          }}
        >
          <BgRuledNotebook sec={Math.max(0, c.sec - tPaper)} headerDate="18  99" headerNote="" />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const s7Render = (c: PlanECustomSceneContext) => {
  const tOpen = c.scene.startSec;
  const t1899 = c.cue('1899年');
  const tHighVal = c.cue('高いこと自体が価値');
  const tPaper = c.beat('s7_paper_sieve');
  const tRemain = c.cue('残った客に');
  const tStillCan = c.cue('自分はまだ買える側');

  const curveP = eo(c.sec, tHighVal - 0.15, 1.0);
  const barLift = eio(c.sec, tPaper + 0.3, 1.35);
  const keepGlow = eo(c.sec, tStillCan - 0.1, 0.65);

  return (
    <>
      {/* パートA: 暗い書斎机の上の1899年ヴェブレン理論＆右上がり需要曲線 */}
      <Window sec={c.sec} from={tOpen} to={tPaper + 0.08}>
        {/* 左：1899年古書切抜きカード */}
        <Pop sec={c.sec} at={tOpen + 0.12} x={115} y={135} rot={-2.2}>
          <PaperScrap w={700} h={610} seed={151} tone="#F3E9D2" padding="34px 40px">
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `3px solid ${INK}`, paddingBottom: 12 }}>
              <span style={{ ...MONO, fontSize: 24, color: INK }}>ECONOMIC ARCHIVE</span>
              <span style={{ ...SERIF, fontSize: 38, color: CRIMSON }}>1899</span>
            </div>
            <div style={{ ...SERIF, fontSize: 44, color: INK, marginTop: 22, whiteSpace: 'nowrap' }}>
              ソースティン・ヴェブレン
            </div>
            <div style={{ ...SANS, fontSize: 28, color: INK_MUTED, marginTop: 8 }}>
              『有閑階級の理論』
            </div>
            <div style={{ marginTop: 28, padding: '20px 24px', background: '#E9DCC0', border: `2px solid ${INK}` }}>
              <div style={{ ...SERIF, fontSize: 44, color: CRIMSON, lineHeight: 1.3 }}>
                高いこと自体が
                <br />
                価値になる品
              </div>
              <div style={{ ...SANS, fontSize: 24, color: INK_MUTED, marginTop: 10 }}>
                ＝ ヴェブレン財（顕示的消費）
              </div>
            </div>
          </PaperScrap>
        </Pop>

        {/* 右：逆説の需要曲線（普通は右下がり、ヴェブレン財だけ右上がり！） */}
        <Pop sec={c.sec} at={t1899} x={925} y={155} rot={1.2}>
          <PaperScrap w={860} h={575} seed={162} tone="#FAF6EC" padding="28px 36px">
            <div style={{ ...SANS, fontSize: 30, color: INK }}>価格と「欲しさ」の関係</div>
            <svg width={780} height={440} viewBox="0 0 780 440" style={{ marginTop: 12 }}>
              {/* 軸 */}
              <path d={handLine(90, 380, 720, 380, 2, 1)} stroke={INK} strokeWidth={4} fill="none" />
              <path d={handLine(90, 380, 90, 35, 2, 2)} stroke={INK} strokeWidth={4} fill="none" />
              <text x={715} y={422} textAnchor="end" fill={INK} fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={26}>
                値段が高い ▶
              </text>
              <text x={96} y={32} fill={INK} fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={26}>
                ▲ 欲しがる人
              </text>

              {/* 通常の商品（点線：右下がり） */}
              <path
                d="M 135 120 Q 380 230 650 340"
                stroke={INK_MUTED}
                strokeWidth={5}
                strokeDasharray="12 10"
                fill="none"
              />
              <text x={710} y={324} textAnchor="end" fill={INK_MUTED} fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={24}>
                普通の商品（高いと減る）
              </text>

              {/* ヴェブレン財（極太の赤い右上がり！） */}
              <path
                d="M 135 335 Q 410 275 675 68"
                stroke={CRIMSON}
                strokeWidth={11}
                fill="none"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={(1 - curveP).toFixed(4)}
              />
              {curveP > 0.7 ? (
                <g opacity={clamp01((curveP - 0.7) * 3.5)}>
                  <circle cx={675} cy={68} r={12} fill={CRIMSON} />
                  <text x={555} y={118} textAnchor="end" fill={CRIMSON} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={36}>
                    高いほど価値UP
                  </text>
                </g>
              ) : null}
            </svg>
          </PaperScrap>
        </Pop>
      </Window>

      {/* パートB: 紙面の「価格ハードル（選別ゲート）」 */}
      <Window sec={c.sec} from={tPaper + 0.12}>
        <Place x={220} y={56}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ ...MONO, fontSize: 24, background: CRIMSON, color: PAPER, padding: '5px 16px', letterSpacing: '0.14em' }}>
              PRICE FILTER
            </span>
            <span style={{ ...SERIF, fontSize: 46, color: INK }}>値上げ＝客をふるい分ける門</span>
          </div>
        </Place>

        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* せり上がる価格バー */}
          {(() => {
            const barY = lerp(585, 345, barLift);
            return (
              <g>
                <rect x={160} y={barY} width={860} height={22} rx={4} fill={CRIMSON} stroke={INK} strokeWidth={3} />
                <text x={590} y={barY - 14} textAnchor="middle" fill={CRIMSON} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={34}>
                  ▲ 価格ハードル上昇（値上げ）
                </text>
              </g>
            );
          })()}

          {/* 上に残る客（金色に輝く） vs 下へ振り落とされる客 */}
          {SIEVE_CROWD.map((p, i) => {
            if (p.stays) {
              return (
                <g key={i}>
                  {keepGlow > 0.05 ? (
                    <circle cx={p.x} cy={p.y - 10} r={34} fill="rgba(245,196,67,0.34)" opacity={keepGlow} />
                  ) : null}
                  <PersonIcon
                    x={p.x}
                    y={p.y}
                    scale={1.45}
                    color={keepGlow > 0.2 ? GOLD : INK}
                    crown={keepGlow > 0.45}
                  />
                </g>
              );
            }
            const dropAt = tPaper + 0.65 + p.delay;
            if (c.sec < dropAt) {
              return <PersonIcon key={i} x={p.x} y={p.y} scale={1.25} color={INK_MUTED} opacity={0.85} />;
            }
            const f = fly(c.sec, dropAt, 0.9, { x: p.x, y: p.y }, { x: p.x, y: 980 }, 18);
            return (
              <PersonIcon
                key={i}
                x={f.x}
                y={f.y}
                scale={1.25}
                color={CRIMSON}
                opacity={clamp01(1 - f.u * 1.1)}
              />
            );
          })}
        </svg>

        {/* 左下：ふるい落とされたゾーンの静かな補助カード */}
        <Pop sec={c.sec} at={tPaper + 1.3} x={190} y={530} rot={-1.2}>
          <PaperScrap w={790} h={175} seed={171} tape={false} tone="#EFE6D5" padding="26px 34px">
            <div style={{ ...MONO, fontSize: 22, color: CRIMSON, letterSpacing: '0.14em' }}>
              PRICED OUT // ふるい落とされた層
            </div>
            <div style={{ ...SERIF, fontSize: 40, color: INK_MUTED, marginTop: 10 }}>
              値上げについていけない客は下へ脱落
            </div>
          </PaperScrap>
        </Pop>

        {/* 右側：残った客の心理カード */}
        <Pop sec={c.sec} at={tRemain} x={1095} y={190} rot={1.5}>
          <PaperScrap w={710} h={430} seed={174} tone="#FFFDF7" padding="34px 40px">
            <div style={{ ...MONO, fontSize: 24, color: GOLD, letterSpacing: '0.14em' }}>
              SURVIVOR PSYCHOLOGY
            </div>
            <div style={{ ...SERIF, fontSize: 60, color: INK, marginTop: 14, lineHeight: 1.25 }}>
              「自分はまだ
              <br />
              買える側だ」
            </div>
            <div style={{ ...SANS, fontSize: 30, color: INK_MUTED, marginTop: 22 }}>
              脱落者が出るほど、残った客の優越感は強まる
            </div>
          </PaperScrap>
        </Pop>

        <DiegeticStamp text="選別装置" atSec={tStillCan + 0.35} size={78} rotateDeg={-8} style={{ left: 1210, top: 650 }} />
      </Window>
    </>
  );
};

/* ========================================================================== */
/* Scene 8 (119.73s - 141.84s): 日本へのロックオン → 渋谷群衆＆SNS →            */
/*   魔法の殺し文句3連チラシ → 「バッグは無理でも財布なら」                       */
/*   projector (119.73) → dark_broll (実質賃金) → paper (一生もの)               */
/*   → dark_desk (バッグは無理でも)                                             */
/* ========================================================================== */

const s8Backdrop = (c: PlanECustomSceneContext) => {
  const tBroll = c.beat('s8_broll_in');
  const tSns = c.cue('SNSには開封動画');
  const tPaper = c.beat('s8_paper_flyer');
  const tWallet = c.beat('s8_dark_wallet');

  const brollP = eo(c.sec, tBroll, 0.25);
  const paperP = eo(c.sec, tPaper, 0.3);
  const walletP = eo(c.sec, tWallet, 0.3);

  return (
    <>
      <BgMidnightBlueprint sec={c.t} titleCode="JP-LOCK" />

      {/* 122.65s〜130.65s: 東京渋谷群衆（写真）→ 街の買い物客（動画） */}
      {c.sec >= tBroll && paperP < 1 ? (
        <AbsoluteFill style={{ opacity: brollP }}>
          {c.sec < tSns ? (
            <MediaPlate
              src={c.media('tokyo_commuter_crowd')}
              sec={c.sec}
              fromSec={tBroll}
              toSec={tSns + 0.5}
              fps={c.fps}
              zoom={[1.03, 1.14]}
              pan={[0, -28]}
              dim={0.34}
              filter="contrast(1.12) saturate(0.92) brightness(0.86)"
            />
          ) : (
            <MediaPlate
              src={c.media('luxury_boutique_broll')}
              sec={c.sec}
              fromSec={tSns}
              toSec={tPaper + 0.4}
              fps={c.fps}
              trimBeforeSec={1.0}
              playbackRate={0.9}
              zoom={[1.04, 1.12]}
              dim={0.42}
              filter="contrast(1.14) saturate(0.88) brightness(0.8)"
            />
          )}
        </AbsoluteFill>
      ) : null}

      {/* 130.65s〜137.8s: 雑誌チラシ紙面（罫線ノート） */}
      {c.sec >= tPaper && walletP < 1 ? (
        <AbsoluteFill style={{ transform: `translateY(${lerp(-1100, 0, paperP).toFixed(1)}px)` }}>
          <BgRuledNotebook sec={Math.max(0, c.sec - tPaper)} headerDate="03  24" headerNote="" />
        </AbsoluteFill>
      ) : null}

      {/* 137.8s〜141.84s: 暗い机（財布へスポットライト移動） */}
      {c.sec >= tWallet ? (
        <AbsoluteFill style={{ opacity: walletP }}>
          <BgWoodDesk sec={Math.max(0, c.sec - tWallet)} />
          <AbsoluteFill style={{ background: 'rgba(10, 5, 2, 0.3)', pointerEvents: 'none' }} />
          <Spotlight x={lerp(560, 1340, eio(c.sec, tWallet + 0.3, 1.2))} y={470} r={420} strength={0.64} />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const s8Render = (c: PlanECustomSceneContext) => {
  const tOpen = c.scene.startSec;
  const tBroll = c.beat('s8_broll_in');
  const tGinza = c.cue('銀座の店には行列');
  const tSns = c.cue('SNSには開封動画');
  const tPaper = c.beat('s8_paper_flyer');
  const tAsset = c.cue('資産価値');
  const tReward = c.cue('自分へのご褒美');
  const tRumor = c.cue('来月また値上げ');
  const tWallet = c.beat('s8_dark_wallet');
  const tReach = c.cue('財布なら');

  // プロジェクタ世界地図：日本 (cx=829.2, cy=133.1) へロックオンズーム
  const jpZoom = lerp(1.15, 2.35, eio(c.sec, tOpen, 2.5));
  const vw = WORLD_MAP_WIDTH / jpZoom;
  const vh = WORLD_MAP_HEIGHT / jpZoom;
  const cx = lerp(WORLD_MAP_WIDTH * 0.56, 829.2 - vw * 0.04, eio(c.sec, tOpen, 2.5));
  const cy = lerp(WORLD_MAP_HEIGHT * 0.45, 133.1 + vh * 0.04, eio(c.sec, tOpen, 2.5));
  const vx = Math.max(0, Math.min(WORLD_MAP_WIDTH - vw, cx - vw / 2));
  const vy = Math.max(0, Math.min(WORLD_MAP_HEIGHT - vh, cy - vh / 2));
  const radarPulse = 1 + Math.sin((c.sec - tOpen) * 7.5) * 0.14;

  return (
    <>
      {/* パートA: 暗室プロジェクタ「日本だと、もっとよく見えます」 */}
      <Window sec={c.sec} from={tOpen} to={tBroll + 0.05}>
        <Place x={190} y={84} w={1540} h={750}>
          <div
            style={{
              width: '100%',
              height: '100%',
              background: '#F4F0E6',
              border: `6px solid ${INK}`,
              boxShadow: '0 0 90px rgba(207,230,255,0.22), 0 28px 60px rgba(0,0,0,0.72)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <svg width="100%" height="100%" viewBox={`${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`}>
              {WORLD_COUNTRIES.map((country) => {
                const isJp = country.id === 'jp';
                return (
                  <path
                    key={country.id}
                    d={country.d}
                    fill={isJp ? CRIMSON : '#D2C8B6'}
                    stroke="#FAF6EC"
                    strokeWidth={0.7}
                  />
                );
              })}
              {/* 日本ロックオン照準 */}
              <g transform={`translate(829.2 133.1) scale(${(radarPulse / jpZoom).toFixed(3)})`}>
                <circle cx={0} cy={0} r={46} fill="none" stroke={CRIMSON} strokeWidth={4} strokeDasharray="10 6" />
                <circle cx={0} cy={0} r={22} fill="none" stroke={CRIMSON} strokeWidth={3} />
                <line x1={-62} y1={0} x2={-28} y2={0} stroke={CRIMSON} strokeWidth={3.5} />
                <line x1={28} y1={0} x2={62} y2={0} stroke={CRIMSON} strokeWidth={3.5} />
                <line x1={0} y1={-62} x2={0} y2={-28} stroke={CRIMSON} strokeWidth={3.5} />
                <line x1={0} y1={28} x2={0} y2={62} stroke={CRIMSON} strokeWidth={3.5} />
              </g>
            </svg>
            <div style={{ position: 'absolute', left: 32, top: 26, background: INK, color: PAPER, padding: '8px 22px', ...MONO, fontSize: 28, letterSpacing: '0.14em' }}>
              TARGET LOCK // JAPAN
            </div>
          </div>
        </Place>
      </Window>

      {/* パートB: 東京群衆＆実質賃金低下 vs 行列・SNS開封 */}
      <Window sec={c.sec} from={tBroll + 0.05} to={tPaper + 0.05}>
        {/* 左上：実質賃金伸び悩みカード */}
        <Pop sec={c.sec} at={tBroll + 0.1} x={105} y={95} rot={-2}>
          <PaperScrap w={560} h={295} seed={181} tone={PAPER} padding="34px 32px 22px">
            <div style={{ ...MONO, fontSize: 22, color: CRIMSON, letterSpacing: '0.14em' }}>
              JAPAN REAL WAGES
            </div>
            <div style={{ ...SERIF, fontSize: 46, color: INK, marginTop: 6 }}>実質賃金は伸び悩み</div>
            <svg width={480} height={115} viewBox="0 0 480 115" style={{ marginTop: 10 }}>
              <path d="M 15 35 L 140 42 L 260 66 L 380 78 L 455 96" stroke={CRIMSON} strokeWidth={8} fill="none" strokeLinecap="round" />
              <path d="M 432 76 L 460 98 L 428 106" stroke={CRIMSON} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </PaperScrap>
        </Pop>

        {/* 右側：銀座行列＆SNS開封の紙枠コラージュ */}
        <Pop sec={c.sec} at={tGinza} x={1150} y={130} rot={2.4}>
          <PaperScrap w={640} h={215} seed={185} tone="#FFFDF7" padding="34px 34px 20px">
            <div style={{ ...MONO, fontSize: 22, color: GOLD, letterSpacing: '0.14em' }}>MEANWHILE IN TOKYO</div>
            <div style={{ ...SERIF, fontSize: 58, color: INK, marginTop: 8 }}>銀座の店に行列</div>
          </PaperScrap>
        </Pop>

        {/* SNS 縦型開封カード2枚 */}
        {c.sec >= tSns ? (
          <>
            <Pop sec={c.sec} at={tSns} x={1120} y={405} rot={-3.5} from={0.78}>
              <div
                style={{
                  width: 300,
                  height: 410,
                  background: '#14110E',
                  border: `5px solid ${PAPER}`,
                  boxShadow: '0 20px 40px rgba(0,0,0,0.65)',
                  padding: 18,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ ...MONO, fontSize: 18, color: CRIMSON_BRIGHT }}>● REC // UNBOXING</div>
                <div style={{ ...SERIF, fontSize: 42, color: PAPER, textAlign: 'center', lineHeight: 1.25 }}>
                  開封動画
                  <br />
                  <span style={{ color: GOLD_BRIGHT, fontSize: 32 }}>#ハイブラ購入品</span>
                </div>
                <div style={{ ...MONO, fontSize: 22, color: CHALK, borderTop: '1px solid rgba(255,255,255,0.25)', paddingTop: 10 }}>
                  ♥ 12.4万 再生中
                </div>
              </div>
            </Pop>
            <Pop sec={c.sec} at={tSns + 0.35} x={1450} y={435} rot={4.2} from={0.78}>
              <div
                style={{
                  width: 300,
                  height: 380,
                  background: '#1E1813',
                  border: `5px solid ${GOLD_BRIGHT}`,
                  boxShadow: '0 20px 40px rgba(0,0,0,0.65)',
                  padding: 18,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ ...MONO, fontSize: 18, color: GOLD_BRIGHT }}>TRENDING</div>
                <div style={{ ...SERIF, fontSize: 40, color: PAPER, textAlign: 'center', lineHeight: 1.25 }}>
                  念願の
                  <br />
                  お迎え報告
                </div>
                <div style={{ ...MONO, fontSize: 22, color: CRIMSON_BRIGHT, borderTop: '1px solid rgba(255,255,255,0.25)', paddingTop: 10 }}>
                  ▶ 89.2万 回視聴
                </div>
              </div>
            </Pop>
          </>
        ) : null}
      </Window>

      {/* パートC: 紙面の殺し文句3連チラシ＋来月値上げの噂 */}
      <Window sec={c.sec} from={tPaper + 0.08} to={tWallet + 0.05}>
        <Place x={220} y={60}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ ...MONO, fontSize: 24, background: INK, color: PAPER, padding: '5px 16px', letterSpacing: '0.14em' }}>
              MAGIC WORDS
            </span>
            <span style={{ ...SERIF, fontSize: 46, color: INK }}>背中を押す「魔法の言葉」</span>
          </div>
        </Place>

        {/* 1. 一生もの */}
        <Pop sec={c.sec} at={tPaper + 0.1} x={115} y={190} rot={-3.5} from={1.35}>
          <PaperScrap w={510} h={280} seed={191} tone="#FFFFFF" padding="32px 30px">
            <div style={{ ...MONO, fontSize: 22, color: INK_MUTED }}>EXCUSE #01</div>
            <div style={{ ...SERIF, fontSize: 82, color: INK, marginTop: 18, textAlign: 'center' }}>一生もの</div>
          </PaperScrap>
        </Pop>

        {/* 2. 資産価値 */}
        <Pop sec={c.sec} at={tAsset} x={705} y={170} rot={1.8} from={1.35}>
          <PaperScrap w={510} h={280} seed={192} tone={PAPER_WARM} padding="32px 30px">
            <div style={{ ...MONO, fontSize: 22, color: GOLD }}>EXCUSE #02</div>
            <div style={{ ...SERIF, fontSize: 82, color: INK, marginTop: 18, textAlign: 'center' }}>資産価値</div>
          </PaperScrap>
        </Pop>

        {/* 3. 自分へのご褒美 */}
        <Pop sec={c.sec} at={tReward} x={1295} y={195} rot={-2.2} from={1.35}>
          <PaperScrap w={515} h={280} seed={193} tone="#FFFFFF" padding="32px 26px">
            <div style={{ ...MONO, fontSize: 22, color: CRIMSON }}>EXCUSE #03</div>
            <div style={{ ...SERIF, fontSize: 64, color: INK, marginTop: 26, textAlign: 'center' }}>自分へのご褒美</div>
          </PaperScrap>
        </Pop>

        {/* 4. 来月また値上げ！？の赤い緊急帯 */}
        <Pop sec={c.sec} at={tRumor} x={240} y={555} rot={-1.8} from={1.45}>
          <PaperScrap w={1440} h={230} seed={199} tape={false} tone={CRIMSON} padding="28px 46px">
            <div style={{ ...MONO, fontSize: 26, color: GOLD_BRIGHT, letterSpacing: '0.18em', textAlign: 'center' }}>
              URGENT RUMOR // 駆け込み需要
            </div>
            <div style={{ ...SERIF, fontSize: 84, color: PAPER, textAlign: 'center', marginTop: 8 }}>
              「来月また値上げらしい…」
            </div>
          </PaperScrap>
        </Pop>
      </Window>

      {/* パートD: 暗い机「バッグは無理でも財布なら、と手が伸びます」 */}
      <Window sec={c.sec} from={tWallet + 0.06}>
        {/* 左：160万円バッグに赤バツ */}
        <Pop sec={c.sec} at={tWallet + 0.08} x={180} y={180} rot={-2.5}>
          <div style={{ opacity: 0.48, filter: 'grayscale(0.65)' }}>
            <PhotoPrint
              src={c.media('luxury_handbag_display')}
              w={440}
              h={450}
              caption="バッグ ¥1,600,000（無理）"
              captionSize={28}
            />
          </div>
        </Pop>
        <InkStroke sec={c.sec} at={tWallet + 0.25} dur={0.22} color={CRIMSON_BRIGHT} width={16} d="M 210 205 L 620 620" />
        <InkStroke sec={c.sec} at={tWallet + 0.42} dur={0.22} color={CRIMSON_BRIGHT} width={16} d="M 620 205 L 210 620" />

        {/* 中央：右へ誘導する赤い矢印 */}
        <InkStroke
          sec={c.sec}
          at={tReach - 0.35}
          dur={0.45}
          color={GOLD_BRIGHT}
          width={14}
          d="M 695 450 Q 865 390 1030 450 M 975 405 L 1040 452 L 975 495"
        />

        {/* 右：スポットライトを浴びる「レザー財布 ¥120,000」エントリー罠 */}
        <Pop sec={c.sec} at={tReach - 0.1} x={1070} y={175} rot={1.8} from={1.15}>
          <PaperScrap w={690} h={525} seed={205} tone={PAPER} padding="34px 40px">
            <div style={{ ...MONO, fontSize: 24, color: CRIMSON, letterSpacing: '0.16em' }}>
              ENTRY TRAP // 入門商品
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
              <WalletGlyph />
            </div>
            <div style={{ ...SERIF, fontSize: 64, color: INK, textAlign: 'center', marginTop: 18 }}>
              「財布なら…」
            </div>
            <div style={{ ...MONO, fontSize: 52, color: CRIMSON, textAlign: 'center', marginTop: 6 }}>
              ¥100,000 〜 ¥150,000
            </div>
          </PaperScrap>
        </Pop>

        <DiegeticStamp text="手が伸びる" atSec={tReach + 0.45} size={68} rotateDeg={-8} style={{ left: 1325, top: 675 }} />
      </Window>
    </>
  );
};

/* ========================================================================== */
/* Scene 9 (141.84s - 161.48s): 総括＆暗室オープンループ                         */
/*   dark_broll (141.84) → paper (ただ、憧れを) → projector (では、5000万人を)   */
/* ========================================================================== */

const s9Backdrop = (c: PlanECustomSceneContext) => {
  const tPaper = c.beat('s9_paper_pyramid');
  const tProj = c.beat('s9_projector_loop');

  const paperP = eo(c.sec, tPaper, 0.34);
  const projP = eo(c.sec, tProj, 0.38);

  return (
    <>
      {c.sec < tPaper + 0.4 ? (
        <MediaPlate
          src={c.media('counting_cash_broll')}
          sec={c.sec}
          fromSec={c.scene.startSec}
          toSec={tPaper + 0.4}
          fps={c.fps}
          trimBeforeSec={0.5}
          playbackRate={0.85}
          zoom={[1.04, 1.15]}
          dim={0.44}
        />
      ) : null}

      {c.sec >= tPaper && projP < 1 ? (
        <AbsoluteFill style={{ transform: `translateX(${lerp(1940, 0, paperP).toFixed(1)}px)` }}>
          <BgWarmWhiteSketch sec={Math.max(0, c.sec - tPaper)} />
        </AbsoluteFill>
      ) : null}

      {c.sec >= tProj ? (
        <AbsoluteFill style={{ opacity: projP }}>
          <BgMidnightBlueprint sec={Math.max(0, c.sec - tProj)} titleCode="NEXT-02" />
          <AbsoluteFill style={{ background: 'rgba(4, 12, 26, 0.34)', pointerEvents: 'none' }} />
          <LightBeam
            sec={c.sec}
            srcX={960}
            spotX={960}
            topY={-40}
            bottomY={880}
            topHalf={95}
            bottomHalf={460}
            opacity={0.72}
          />
          <DustField sec={c.sec} count={42} color="#CFE6FF" opacity={0.48} />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const s9Render = (c: PlanECustomSceneContext) => {
  const tOpen = c.scene.startSec;
  const tRichHalf = c.cue('大富豪が払っています');
  const tPaper = c.beat('s9_paper_pyramid');
  const tLookUp = c.cue('それを見上げる何億人');
  const tProj = c.beat('s9_projector_loop');
  const tHowDecide = c.cue('どう決まっているのか');
  const tNextWallet = c.cue('誰の財布なのか');

  const pyrP = eo(c.sec, tPaper + 0.25, 0.9);
  const lookArrowsP = eo(c.sec, tLookUp, 0.85);
  const radarSpin = (c.sec - tProj) * 28;
  const nextPulse = 1 + Math.sin((c.sec - tNextWallet) * 6.5) * 0.04;

  return (
    <>
      {/* パートA: 札束動画上「売上の半分近くは、たしかに大富豪が払っています」 */}
      <Window sec={c.sec} from={tOpen} to={tPaper + 0.06}>
        <Pop sec={c.sec} at={tOpen + 0.12} x={230} y={240} rot={-1.4}>
          <PaperScrap w={1460} h={365} seed={211} tone={PAPER} padding="36px 52px">
            <div style={{ ...MONO, fontSize: 26, color: GOLD, letterSpacing: '0.16em' }}>
              THE SURFACE REALITY
            </div>
            <div style={{ ...SERIF, fontSize: 78, color: INK, marginTop: 14 }}>
              売上の 45% ＝ たしかに大富豪
            </div>
            <div style={{ ...SANS, fontSize: 34, color: INK_MUTED, marginTop: 18 }}>
              だが、それだけでは「160万円の値札」は成立しない
            </div>
          </PaperScrap>
        </Pop>
        <DiegeticStamp text="事実" atSec={tRichHalf} size={72} rotateDeg={-9} style={{ left: 1360, top: 470 }} />
      </Window>

      {/* パートB: 紙面総括ピラミッド「憧れを値札に変える何億人もの財布」 */}
      <Window sec={c.sec} from={tPaper + 0.08} to={tProj + 0.06}>
        <Place x={96} y={56}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ ...MONO, fontSize: 24, background: CRIMSON, color: PAPER, padding: '5px 16px', letterSpacing: '0.14em' }}>
              THE ENGINE OF DESIRE
            </span>
            <span style={{ ...SERIF, fontSize: 44, color: INK }}>憧れを値札に変える構造</span>
          </div>
        </Place>

        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* 頂点の値札プレート */}
          <g opacity={pyrP}>
            <path d={tornRect(740, 140, 440, 138, 221, 5)} fill="#18130E" stroke={GOLD_BRIGHT} strokeWidth={4} />
            <text x={960} y={200} textAnchor="middle" fill={GOLD_BRIGHT} fontFamily={FONT_ECON_MONO} fontWeight={800} fontSize={24}>
              PRICING POWER
            </text>
            <text x={960} y={258} textAnchor="middle" fill={PAPER} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={62}>
              ¥1,600,000
            </text>
          </g>

          {/* 下から頂点を見上げて突き上げる赤い矢印群（憧れ） */}
          {[360, 620, 960, 1300, 1560].map((x0, i) => {
            const x1 = lerp(x0, 960, 0.72);
            const y0 = 640;
            const y1 = 308;
            return (
              <path
                key={x0}
                d={handLine(x0, y0, x1, y1, 8, 230 + i)}
                stroke={CRIMSON}
                strokeWidth={9}
                fill="none"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={(1 - lookArrowsP).toFixed(4)}
              />
            );
          })}

          {/* 下段：何億人もの財布の土台 */}
          <g opacity={eo(c.sec, tLookUp - 0.1, 0.45)}>
            <path d={rr(165, 655, 1590, 175, 4, 9)} fill="#EFE5D1" stroke={INK} strokeWidth={5} />
            <text x={960} y={732} textAnchor="middle" fill={INK} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={58}>
              見上げる 3億5,000万人+ の財布
            </text>
            <text x={960} y={792} textAnchor="middle" fill={CRIMSON} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={32}>
              「買いたい」「上に見られたい」という視線が、頂点の値札を支えている
            </text>
          </g>
        </svg>

        {/* 左下に実写群衆、右下に札束静止画をピン留め */}
        <Pop sec={c.sec} at={tPaper + 0.35} x={150} y={220} rot={-3.5}>
          <PhotoPrint src={c.media('tokyo_commuter_crowd')} w={360} h={235} caption="見上げる人々" captionSize={24} />
        </Pop>
        <Pop sec={c.sec} at={tPaper + 0.55} x={1380} y={220} rot={3.2}>
          <PhotoPrint src={c.media('counting_cash_broll_poster')} w={360} h={235} caption="吸い上がる資金" captionSize={24} />
        </Pop>
      </Window>

      {/* パートC: 暗室プロジェクタ・オープンループ締め */}
      <Window sec={c.sec} from={tProj + 0.08}>
        {/* 背景にうっすら世界地図の投影シルエット */}
        <svg
          width={1920}
          height={1080}
          viewBox={`0 0 ${WORLD_MAP_WIDTH} ${WORLD_MAP_HEIGHT}`}
          style={{ position: 'absolute', left: 0, top: 80, width: 1920, height: 800, opacity: 0.14, pointerEvents: 'none' }}
        >
          {WORLD_COUNTRIES.map((country) => (
            <path key={country.id} d={country.d} fill="#CFE6FF" />
          ))}
        </svg>

        {/* 左中：消えた5000万人（背景 SECTION A-A と分離し視認性を維持） */}
        <Pop sec={c.sec} at={tProj + 0.15} x={135} y={405} rot={-2.2}>
          <div style={{ opacity: lerp(0.96, 0.72, eo(c.sec, tHowDecide, 1.4)) }}>
            <PaperScrap w={470} h={200} seed={241} tape={false} tone="#211614" padding="24px 30px">
              <div style={{ ...MONO, fontSize: 22, color: CRIMSON_BRIGHT }}>LOST BUYERS</div>
              <div style={{ ...SERIF, fontSize: 66, color: CRIMSON_BRIGHT, marginTop: 8 }}>−5,000万人</div>
              <div style={{ ...SANS, fontSize: 24, color: CHALK_MUTED, marginTop: 4 }}>それでも崩れない値札</div>
            </PaperScrap>
          </div>
        </Pop>

        {/* 中央：暗室の光柱に浮かぶ巨大な値札（ビクともしない） */}
        <DiegeticHangTag
          atSec={tProj + 0.1}
          x={960}
          y={45}
          price="¥1,600,000"
          label="HOW IS IT PRICED?"
          scale={1.22}
          stringLen={125}
          swing
          glow={0.78}
        />

        {/* 回転する赤い照準リング */}
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <g transform={`translate(960 440) rotate(${radarSpin.toFixed(1)})`} opacity={eo(c.sec, tHowDecide - 0.2, 0.6) * 0.72}>
            <path d={ring(0, 0, 295, 5)} fill="none" stroke={CRIMSON_BRIGHT} strokeWidth={3.5} strokeDasharray="18 12" />
          </g>
        </svg>

        {/* 右側＆下側：オープンループの2つの問い */}
        <Pop sec={c.sec} at={tHowDecide - 0.1} x={1300} y={165} rot={2.2}>
          <PaperScrap w={515} h={225} seed={248} tone={PAPER} padding="34px 32px 24px">
            <div style={{ ...MONO, fontSize: 22, color: INK_MUTED }}>QUESTION 01</div>
            <div style={{ ...SERIF, fontSize: 38, color: INK, marginTop: 12, lineHeight: 1.35, whiteSpace: 'nowrap' }}>
              崩れない値札は
              <br />
              どう決まっているのか？
            </div>
          </PaperScrap>
        </Pop>

        {c.sec >= tNextWallet - 0.15 ? (
          <Place
            x={420}
            y={645}
            w={1080}
            style={{
              transform: `scale(${(spr(c.sec, tNextWallet - 0.15, c.fps, { stiffness: 320, damping: 18 }) * nextPulse).toFixed(4)})`,
              opacity: eo(c.sec, tNextWallet - 0.15, 0.25),
            }}
          >
            <div
              style={{
                background: 'rgba(14, 11, 9, 0.9)',
                border: `4px solid ${CRIMSON_BRIGHT}`,
                padding: '26px 46px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 24px 60px rgba(0,0,0,0.72)',
              }}
            >
              <div>
                <div style={{ ...MONO, fontSize: 24, color: CRIMSON_BRIGHT, letterSpacing: '0.18em' }}>
                  NEXT TARGET // 次に狙われるのは
                </div>
                <div style={{ ...SERIF, fontSize: 66, color: PAPER, marginTop: 6 }}>誰の財布なのか？</div>
              </div>
              <div style={{ ...MONO, fontSize: 30, color: GOLD_BRIGHT, border: `2px solid ${GOLD_BRIGHT}`, padding: '10px 22px' }}>
                ▶ NEXT CHAPTER
              </div>
            </div>
          </Place>
        ) : null}
      </Window>
    </>
  );
};

/* ========================================================================== */
/* 全編 2分41秒（4,845 frames / 161.48s）Spec 定義                              */
/* ========================================================================== */

export function createLuxuryTrapV31FullInput(): PlanEDefineInput {
  return {
    id: 'AB-LuxuryTrap-v31-full-neon-high',
    themeTitle: 'ハイブランドが本当にカモにしているのは、富裕層ではない',
    scenes: [
      /* 1. 冒頭フック (0.00s - 6.46s / dark_desk) */
      {
        id: 's1_hook_showcase',
        type: 'custom',
        start: atStart(),
        surface: 'dark_desk',
        camera: {
          moves: [
            { at: at('160万円のバッグ', { chunk: 'seg_01_hook' }), zoom: 1.05, x: -18, y: -8, dur: 0.9 },
            { at: at('いちばん大事な客', { chunk: 'seg_01_hook' }), zoom: 1.04, x: 24, y: -10, dur: 0.9 },
          ],
          shakes: [at('160万円のバッグ', { chunk: 'seg_01_hook', offset: 0.08 })],
          shakeAmp: 8,
        },
        beats: [
          hit(at('もしあなたが', { chunk: 'seg_01_hook' }), 'projector_click', { id: 's1_spot', gain: 0.22 }),
          hit(at('160万円のバッグ', { chunk: 'seg_01_hook' }), 'price_ping', { id: 's1_tag', gain: 0.28 }),
          hit(at('売るなら', { chunk: 'seg_01_hook' }), 'paper_snap', { id: 's1_memo', gain: 0.24 }),
          hit(at('いちばん大事な客', { chunk: 'seg_01_hook' }), 'pen_scratch', { id: 's1_circle', gain: 0.24 }),
        ],
        backdrop: s1Backdrop,
        render: s1Render,
      },

      /* 2. VHS逆転 → 無ロゴ大富豪 → 普通の会社員 (6.46s - 20.33s) */
      {
        id: 's2_vhs_paradox',
        type: 'custom',
        start: at('普通に考えれば', { chunk: 'seg_02_vhs_flip' }),
        surface: 'dark_broll',
        surfaceShifts: [
          { at: at('ところが', { chunk: 'seg_02_vhs_flip' }), surface: 'paper' },
          { at: at('この業界を', { chunk: 'seg_02_vhs_flip' }), surface: 'charcoal' },
        ],
        camera: {
          moves: [
            { at: at('本物の大富豪ほど', { chunk: 'seg_02_vhs_flip' }), zoom: 1.03, x: -14, y: 0, dur: 0.8 },
            { at: at('この業界を', { chunk: 'seg_02_vhs_flip' }), zoom: 1.0, x: 0, y: 0, dur: 0.4 },
            { at: at('普通の会社員', { chunk: 'seg_02_vhs_flip' }), zoom: 1.06, x: 22, y: -12, dur: 0.7 },
          ],
          shakes: [
            at('ところが', { chunk: 'seg_02_vhs_flip', offset: 0.05 }),
            at('普通の会社員', { chunk: 'seg_02_vhs_flip' }),
          ],
          shakeAmp: 11,
        },
        beats: [
          hit(at('普通に考えれば', { chunk: 'seg_02_vhs_flip' }), 'vhs_pause', { id: 's2_vhs', gain: 0.28 }),
          hit(at('ところが', { chunk: 'seg_02_vhs_flip' }), 'stamp_thud', { id: 's2_flip_paper', gain: 0.3 }),
          hit(at('本物の大富豪ほど', { chunk: 'seg_02_vhs_flip' }), 'paper_snap', { id: 's2_paris', gain: 0.24 }),
          hit(at('ロゴの目立つバッグ', { chunk: 'seg_02_vhs_flip' }), 'pen_scratch', { id: 's2_cross', gain: 0.24 }),
          hit(at('この業界を', { chunk: 'seg_02_vhs_flip' }), 'whoosh', { id: 's2_pillar_chalk', gain: 0.26 }),
          hit(at('普通の会社員', { chunk: 'seg_02_vhs_flip' }), 'impact_thud', { id: 's2_salaryman', gain: 0.3 }),
        ],
        backdrop: s2Backdrop,
        render: s2Render,
      },

      /* 3. 60兆円市場の天秤 2% vs 98% (20.33s - 40.84s) */
      {
        id: 's3_market_scale',
        type: 'custom',
        start: at('世界の高級ブランド市場は', { chunk: 'seg_03_market' }),
        surface: 'whiteboard',
        surfaceShifts: [
          { at: at('ところが残りの', { chunk: 'seg_03_market' }), surface: 'dark_desk' },
        ],
        camera: {
          moves: [
            { at: at('45パーセント', { chunk: 'seg_03_market' }), zoom: 1.04, x: 26, y: -10, dur: 0.9 },
            { at: at('ところが残りの', { chunk: 'seg_03_market' }), zoom: 1.05, x: -24, y: -8, dur: 0.8 },
            { at: at('売上の半分以上', { chunk: 'seg_03_market' }), zoom: 1.0, x: 0, y: 0, dur: 0.7 },
          ],
          shakes: [
            at('ところが残りの', { chunk: 'seg_03_market', offset: 0.1 }),
            at('売上の半分以上', { chunk: 'seg_03_market' }),
          ],
          shakeAmp: 10,
        },
        beats: [
          hit(at('世界の高級ブランド市場は', { chunk: 'seg_03_market' }), 'whoosh', { id: 's3_enter', gain: 0.22 }),
          hit(at('およそ60兆円', { chunk: 'seg_03_market' }), 'chart_tick', { id: 's3_60t', gain: 0.24 }),
          hit(at('45パーセント', { chunk: 'seg_03_market' }), 'soft_pop', { id: 's3_45', gain: 0.24 }),
          hit(at('上位わずか2パーセント', { chunk: 'seg_03_market' }), 'price_ping', { id: 's3_top2', gain: 0.24 }),
          hit(at('ところが残りの', { chunk: 'seg_03_market' }), 'impact_thud', { id: 's3_shift_dark', gain: 0.3 }),
          hit(at('3億5000万人', { chunk: 'seg_03_market' }), 'paper_snap', { id: 's3_350m', gain: 0.24 }),
          hit(at('売上の半分以上', { chunk: 'seg_03_market' }), 'stamp_thud', { id: 's3_over_half', gain: 0.3 }),
        ],
        backdrop: s3Backdrop,
        render: s3Render,
      },

      /* 4. 営業利益率37.1% ＆ 値札5年で2倍の階段 (40.84s - 64.87s) */
      {
        id: 's4_margin_escalator',
        type: 'custom',
        start: at('その背伸びの代金は', { chunk: 'seg_04_margin' }),
        surface: 'dark_broll',
        surfaceShifts: [
          { at: at('ルイ・ヴィトン', { chunk: 'seg_04_margin' }), surface: 'paper' },
          { at: at('しかも値札は', { chunk: 'seg_04_margin' }), surface: 'charcoal' },
        ],
        camera: {
          moves: [
            { at: at('37.1パーセント', { chunk: 'seg_04_margin' }), zoom: 1.05, x: 24, y: -12, dur: 0.8 },
            { at: at('100円売れるたびに', { chunk: 'seg_04_margin' }), zoom: 1.04, x: -24, y: -6, dur: 0.8 },
            { at: at('しかも値札は', { chunk: 'seg_04_margin' }), zoom: 1.0, x: 0, y: 0, dur: 0.5 },
            { at: at('160万円を超えました', { chunk: 'seg_04_margin' }), zoom: 1.06, x: -28, y: -12, dur: 0.7 },
          ],
          shakes: [
            at('37.1パーセント', { chunk: 'seg_04_margin', offset: 0.1 }),
            at('160万円を超えました', { chunk: 'seg_04_margin', offset: 0.25 }),
          ],
          shakeAmp: 10,
        },
        beats: [
          hit(at('その背伸びの代金は', { chunk: 'seg_04_margin' }), 'whoosh', { id: 's4_intro', gain: 0.24 }),
          hit(at('ルイ・ヴィトン', { chunk: 'seg_04_margin' }), 'paper_snap', { id: 's4_paper_in', gain: 0.26 }),
          hit(at('37.1パーセント', { chunk: 'seg_04_margin' }), 'stamp_thud', { id: 's4_37', gain: 0.28 }),
          hit(at('100円売れるたびに', { chunk: 'seg_04_margin' }), 'soft_pop', { id: 's4_coin', gain: 0.26 }),
          hit(at('普通のアパレル', { chunk: 'seg_04_margin' }), 'pen_scratch', { id: 's4_apparel', gain: 0.24 }),
          hit(at('しかも値札は', { chunk: 'seg_04_margin' }), 'mech_slide', { id: 's4_chalk_in', gain: 0.26 }),
          hit(at('シャネルの定番バッグ', { chunk: 'seg_04_margin' }), 'chart_tick', { id: 's4_chanel', gain: 0.22 }),
          hit(at('5年でほぼ2倍', { chunk: 'seg_04_margin' }), 'price_ping', { id: 's4_double', gain: 0.26 }),
          hit(at('160万円を超えました', { chunk: 'seg_04_margin' }), 'stamp_thud', { id: 's4_160', gain: 0.3 }),
        ],
        backdrop: s4Backdrop,
        render: s4Render,
      },

      /* 5. 5000万人脱落の逆説 → 値下げ案却下 → 再値上げ (64.87s - 82.18s) */
      {
        id: 's5_dropout_paradox',
        type: 'custom',
        start: at('ここで、妙なことが起きます。', { chunk: 'seg_05_dropout' }),
        surface: 'paper',
        surfaceShifts: [
          { at: at('約5000万人', { chunk: 'seg_05_dropout' }), surface: 'dark_desk' },
          { at: at('普通なら値下げ', { chunk: 'seg_05_dropout' }), surface: 'whiteboard' },
          { at: at('ところがブランド', { chunk: 'seg_05_dropout' }), surface: 'charcoal' },
        ],
        camera: {
          moves: [
            { at: at('約5000万人', { chunk: 'seg_05_dropout' }), zoom: 1.06, x: -24, y: -10, dur: 0.7 },
            { at: at('普通なら値下げ', { chunk: 'seg_05_dropout' }), zoom: 1.0, x: 0, y: 0, dur: 0.4 },
            { at: at('もう一段の値上げ', { chunk: 'seg_05_dropout' }), zoom: 1.07, x: -16, y: -14, dur: 0.6 },
          ],
          shakes: [
            at('約5000万人', { chunk: 'seg_05_dropout' }),
            at('もう一段の値上げ', { chunk: 'seg_05_dropout' }),
          ],
          shakeAmp: 12,
        },
        beats: [
          hit(at('妙なこと', { chunk: 'seg_05_dropout' }), 'paper_snap', { id: 's5_anomaly', gain: 0.24 }),
          hit(at('2022年から', { chunk: 'seg_05_dropout' }), 'chart_tick', { id: 's5_2022', gain: 0.22 }),
          hit(at('値上げと物価高', { chunk: 'seg_05_dropout' }), 'mech_slide', { id: 's5_press', gain: 0.26 }),
          hit(at('約5000万人', { chunk: 'seg_05_dropout' }), 'impact_thud', { id: 's5_dark_drop', gain: 0.3 }),
          hit(at('市場を去りました', { chunk: 'seg_05_dropout' }), 'whoosh', { id: 's5_leave', gain: 0.26 }),
          hit(at('普通なら値下げ', { chunk: 'seg_05_dropout' }), 'pen_scratch', { id: 's5_whiteboard', gain: 0.24 }),
          hit(at('ところがブランド', { chunk: 'seg_05_dropout' }), 'error_buzzer', { id: 's5_chalk_raise', gain: 0.24 }),
          hit(at('もう一段の値上げ', { chunk: 'seg_05_dropout' }), 'stamp_thud', { id: 's5_raise', gain: 0.32 }),
        ],
        backdrop: s5Backdrop,
        render: s5Render,
      },

      /* 6. 2010年研究：4象限コルクボード → 静かな資産家 → 巨大ロゴ欲求 (82.18s - 104.58s) */
      {
        id: 's6_signaling_matrix',
        type: 'custom',
        start: at('この謎は、', { chunk: 'seg_06_paper' }),
        surface: 'corkboard',
        surfaceShifts: [
          { at: at('本当の資産家ほど', { chunk: 'seg_06_paper' }), surface: 'paper' },
          { at: at('大きなロゴを', { chunk: 'seg_06_paper' }), surface: 'dark_desk' },
        ],
        camera: {
          moves: [
            { at: at('4つに分けると', { chunk: 'seg_06_paper' }), zoom: 1.03, x: 0, y: -12, dur: 0.9 },
            { at: at('本当の資産家ほど', { chunk: 'seg_06_paper' }), zoom: 1.0, x: 0, y: 0, dur: 0.5 },
            { at: at('大きなロゴを', { chunk: 'seg_06_paper' }), zoom: 1.06, x: -20, y: -8, dur: 0.7 },
          ],
          shakes: [at('上にいると見せたい', { chunk: 'seg_06_paper', offset: 0.15 })],
          shakeAmp: 10,
        },
        beats: [
          hit(at('2010年の', { chunk: 'seg_06_paper' }), 'paper_snap', { id: 's6_study', gain: 0.24 }),
          hit(at('資産の多さ', { chunk: 'seg_06_paper' }), 'pen_scratch', { id: 's6_wealth', gain: 0.22 }),
          hit(at('見せびらかしたい気持ち', { chunk: 'seg_06_paper' }), 'pen_scratch', { id: 's6_showoff', gain: 0.22 }),
          hit(at('4つに分けると', { chunk: 'seg_06_paper' }), 'soft_pop', { id: 's6_grid', gain: 0.24 }),
          hit(at('本当の資産家ほど', { chunk: 'seg_06_paper' }), 'camera_shutter', { id: 's6_paper_quiet', gain: 0.24 }),
          hit(at('素材や仕立ての違い', { chunk: 'seg_06_paper' }), 'pen_scratch', { id: 's6_material', gain: 0.24 }),
          hit(at('大きなロゴを', { chunk: 'seg_06_paper' }), 'whoosh', { id: 's6_dark_logo', gain: 0.26 }),
          hit(at('上にいると見せたい', { chunk: 'seg_06_paper' }), 'stamp_thud', { id: 's6_biglogo', gain: 0.3 }),
        ],
        backdrop: s6Backdrop,
        render: s6Render,
      },

      /* 7. 1899年ヴェブレン理論 ＆ 価格ハードル選別門 (104.58s - 119.73s) */
      {
        id: 's7_veblen_sieve',
        type: 'custom',
        start: at('経済学者のヴェブレン', { chunk: 'seg_07_veblen' }),
        surface: 'dark_desk',
        surfaceShifts: [
          { at: at('値上げは客を', { chunk: 'seg_07_veblen' }), surface: 'paper' },
        ],
        camera: {
          moves: [
            { at: at('高いこと自体が価値', { chunk: 'seg_07_veblen' }), zoom: 1.05, x: -22, y: -8, dur: 0.8 },
            { at: at('値上げは客を', { chunk: 'seg_07_veblen' }), zoom: 1.0, x: 0, y: 0, dur: 0.5 },
            { at: at('自分はまだ買える側', { chunk: 'seg_07_veblen' }), zoom: 1.04, x: -16, y: -10, dur: 0.8 },
          ],
          shakes: [at('自分はまだ買える側', { chunk: 'seg_07_veblen', offset: 0.35 })],
          shakeAmp: 9,
        },
        beats: [
          hit(at('経済学者のヴェブレン', { chunk: 'seg_07_veblen' }), 'paper_snap', { id: 's7_book', gain: 0.24 }),
          hit(at('高いこと自体が価値', { chunk: 'seg_07_veblen' }), 'pen_scratch', { id: 's7_curve', gain: 0.24 }),
          hit(at('値上げは客を', { chunk: 'seg_07_veblen' }), 'mech_slide', { id: 's7_paper_sieve', gain: 0.26 }),
          hit(at('ふるい落としつつ', { chunk: 'seg_07_veblen' }), 'whoosh', { id: 's7_drop', gain: 0.24 }),
          hit(at('残った客に', { chunk: 'seg_07_veblen' }), 'soft_pop', { id: 's7_remain', gain: 0.24 }),
          hit(at('自分はまだ買える側', { chunk: 'seg_07_veblen' }), 'stamp_thud', { id: 's7_elite', gain: 0.3 }),
        ],
        backdrop: s7Backdrop,
        render: s7Render,
      },

      /* 8. 日本ロックオン → 銀座行列・SNS → 殺し文句3連 → 財布の罠 (119.73s - 141.84s) */
      {
        id: 's8_japan_wallet_trap',
        type: 'custom',
        start: at('日本だと、', { chunk: 'seg_08_japan' }),
        surface: 'projector',
        surfaceShifts: [
          { at: at('実質賃金が', { chunk: 'seg_08_japan' }), surface: 'dark_broll' },
          { at: at('一生もの', { chunk: 'seg_08_japan' }), surface: 'paper' },
          { at: at('バッグは無理でも', { chunk: 'seg_08_japan' }), surface: 'dark_desk' },
        ],
        camera: {
          moves: [
            { at: at('銀座の店には行列', { chunk: 'seg_08_japan' }), zoom: 1.04, x: -16, y: -6, dur: 0.8 },
            { at: at('一生もの', { chunk: 'seg_08_japan' }), zoom: 1.0, x: 0, y: 0, dur: 0.4 },
            { at: at('財布なら', { chunk: 'seg_08_japan' }), zoom: 1.06, x: -24, y: -10, dur: 0.7 },
          ],
          shakes: [
            at('来月また値上げ', { chunk: 'seg_08_japan' }),
            at('財布なら', { chunk: 'seg_08_japan', offset: 0.4 }),
          ],
          shakeAmp: 10,
        },
        beats: [
          hit(at('日本だと、', { chunk: 'seg_08_japan' }), 'projector_click', { id: 's8_proj', gain: 0.26 }),
          hit(at('もっとよく見えます', { chunk: 'seg_08_japan' }), 'radar_beep', { id: 's8_radar', gain: 0.2 }),
          hit(at('実質賃金が', { chunk: 'seg_08_japan' }), 'chart_tick', { id: 's8_broll_in', gain: 0.24 }),
          hit(at('銀座の店には行列', { chunk: 'seg_08_japan' }), 'camera_shutter', { id: 's8_ginza', gain: 0.24 }),
          hit(at('SNSには開封動画', { chunk: 'seg_08_japan' }), 'soft_pop', { id: 's8_sns', gain: 0.24 }),
          hit(at('一生もの', { chunk: 'seg_08_japan' }), 'paper_snap', { id: 's8_paper_flyer', gain: 0.26 }),
          hit(at('資産価値', { chunk: 'seg_08_japan' }), 'paper_snap', { id: 's8_asset', gain: 0.24 }),
          hit(at('自分へのご褒美', { chunk: 'seg_08_japan' }), 'paper_snap', { id: 's8_reward', gain: 0.24 }),
          hit(at('来月また値上げ', { chunk: 'seg_08_japan' }), 'error_buzzer', { id: 's8_rumor', gain: 0.22 }),
          hit(at('バッグは無理でも', { chunk: 'seg_08_japan' }), 'whoosh', { id: 's8_dark_wallet', gain: 0.26 }),
          hit(at('財布なら', { chunk: 'seg_08_japan' }), 'price_ping', { id: 's8_wallet', gain: 0.28 }),
        ],
        backdrop: s8Backdrop,
        render: s8Render,
      },

      /* 9. クライマックス＆暗室オープンループ (141.84s - 161.48s) */
      {
        id: 's9_open_loop_finale',
        type: 'custom',
        start: at('売上の半分近くは', { chunk: 'seg_09_open_loop' }),
        surface: 'dark_broll',
        surfaceShifts: [
          { at: at('ただ、憧れを', { chunk: 'seg_09_open_loop' }), surface: 'paper' },
          { at: at('では、5000万人を', { chunk: 'seg_09_open_loop' }), surface: 'projector' },
        ],
        camera: {
          moves: [
            { at: at('それを見上げる何億人', { chunk: 'seg_09_open_loop' }), zoom: 1.04, x: 0, y: -12, dur: 0.9 },
            { at: at('では、5000万人を', { chunk: 'seg_09_open_loop' }), zoom: 1.0, x: 0, y: 0, dur: 0.5 },
            { at: at('誰の財布なのか', { chunk: 'seg_09_open_loop' }), zoom: 1.07, x: 0, y: -18, dur: 1.4 },
          ],
          shakes: [at('では、5000万人を', { chunk: 'seg_09_open_loop', offset: 0.1 })],
          shakeAmp: 10,
        },
        beats: [
          hit(at('売上の半分近くは', { chunk: 'seg_09_open_loop' }), 'whoosh', { id: 's9_cash', gain: 0.24 }),
          hit(at('大富豪が払っています', { chunk: 'seg_09_open_loop' }), 'stamp_thud', { id: 's9_fact', gain: 0.26 }),
          hit(at('ただ、憧れを', { chunk: 'seg_09_open_loop' }), 'paper_snap', { id: 's9_paper_pyramid', gain: 0.26 }),
          hit(at('それを見上げる何億人', { chunk: 'seg_09_open_loop' }), 'pen_scratch', { id: 's9_lookup', gain: 0.24 }),
          hit(at('では、5000万人を', { chunk: 'seg_09_open_loop' }), 'projector_click', { id: 's9_projector_loop', gain: 0.28 }),
          hit(at('どう決まっているのか', { chunk: 'seg_09_open_loop' }), 'radar_beep', { id: 's9_q1', gain: 0.22 }),
          hit(at('誰の財布なのか', { chunk: 'seg_09_open_loop' }), 'impact_thud', { id: 's9_q2', gain: 0.3 }),
        ],
        backdrop: s9Backdrop,
        render: s9Render,
      },
    ],
  };
}

export const SPEC_INPUT = createLuxuryTrapV31FullInput();
export function buildLuxuryTrapV31FullSpec(base: PlanETimelineBase = BASE_TIMELINE) {
  return definePlanESpec(base, SPEC_INPUT);
}
export const SPEC = buildLuxuryTrapV31FullSpec();

export const ABLuxuryTrapV31FullNeonHigh: React.FC = () => <PlanEMacroEconTemplate spec={SPEC} />;
