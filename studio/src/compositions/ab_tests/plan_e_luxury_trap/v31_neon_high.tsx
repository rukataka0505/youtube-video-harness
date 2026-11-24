import React from 'react';
import { AbsoluteFill } from 'remotion';
import {
  CountUp,
  DiegeticCoin,
  DiegeticHangTag,
  DiegeticStamp,
  EconHostAvatar,
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
  definePlanESpec,
  eo,
  eio,
  fly,
  hit,
  inkCirclePath,
  lerp,
  ramp,
  rnd,
  spr,
  stagger,
  wob,
  type PlanECustomSceneContext,
  type PlanEDefineInput,
  type PlanETimelineBase,
} from '../../../components/plan_e';
import { PlanEMacroEconTemplate } from '../../../templates/PlanEMacroEconTemplate';
import { BASE_TIMELINE } from './baseTimelineData';

/**
 * 案E v3.1（「固い床 × 自由な舞台」）実戦バリエーション: v31_neon_high
 * テーマ: 「高級ブランドの罠」冒頭約65秒（0.00s〜64.87s / 1,946 frames）
 *
 * 4つの連続した自由舞台で、闇の鑑定台 → 紙面の通説反転 → 60兆円非対称解剖 → 札束・37.1%利益・160万円値札回収までを描く。
 * 素材は contact_sheet 目視検品済みの5点のみ使用（ミスマッチ素材は完全排除）。
 */

const SERIF: React.CSSProperties = { fontFamily: FONT_ECON_SERIF, fontWeight: 900 };
const SANS: React.CSSProperties = { fontFamily: FONT_ECON_SANS, fontWeight: 800 };
const MONO: React.CSSProperties = { fontFamily: FONT_ECON_MONO, fontWeight: 700 };

const INK_DARK = '#16130F';
const INK_MUTED = '#5E554A';
const INK_RED = '#C8102E';
const INK_CRIMSON = '#FF5A4E';
const INK_GOLD = '#E8B931';
const INK_AMBER = '#B77B14';
const PAPER_WARM = '#FBF6EA';
const PAPER_CREAM = '#F3EAD5';
const PAPER_AGED = '#E5DAC1';

/** チョーク黒板用の3.5億人群衆ドット群（決定的配置） */
const CHALK_CROWD_DOTS = Array.from({ length: 78 }, (_, i) => {
  const col = i % 13;
  const row = Math.floor(i / 13);
  return {
    x: 740 + col * 80 + (rnd(i * 3 + 1) - 0.5) * 34,
    y: 255 + row * 94 + (rnd(i * 7 + 5) - 0.5) * 30,
    r: 5 + Math.round(rnd(i * 11 + 2) * 4),
    delay: rnd(i * 13 + 7) * 1.15,
  };
});

/** 100円玉から利益ポケットへ飛ぶ硬貨トークン */
const PROFIT_TOKENS = [0, 1, 2, 3].map((i) => ({
  idx: i,
  delay: i * 0.16,
  lift: 88 + i * 22,
  endX: 735 + i * 54,
  endY: 702 + (i % 2) * 20,
}));

/** 5段の値札階段（Scene 4 後半） */
const PRICE_STEPS = [
  { x: 210, y: 745, year: '5年前', tag: '¥80万' },
  { x: 438, y: 680, year: '4年前', tag: '¥96万' },
  { x: 666, y: 585, year: '3年前', tag: '¥115万' },
  { x: 894, y: 465, year: '2年前', tag: '¥138万' },
  { x: 1120, y: 328, year: '現在', tag: '¥160万+' },
] as const;

/** 小道具SVG：アンティーク王冠エンブレム */
const CrownEmblem: React.FC<{ size?: number; color?: string }> = ({ size = 84, color = INK_GOLD }) => (
  <svg width={size} height={Math.round(size * 0.68)} viewBox="0 0 120 82" style={{ display: 'block' }}>
    <path
      d="M 14 68 L 8 24 L 38 42 L 60 10 L 82 42 L 112 24 L 106 68 Z"
      fill={color}
      stroke={INK_DARK}
      strokeWidth={4}
      strokeLinejoin="round"
    />
    <rect x={14} y={68} width={92} height={10} fill={INK_AMBER} stroke={INK_DARK} strokeWidth={3.5} />
    <circle cx={60} cy={10} r={5} fill={INK_RED} stroke={INK_DARK} strokeWidth={2.5} />
    <circle cx={8} cy={22} r={4.5} fill={PAPER_WARM} stroke={INK_DARK} strokeWidth={2.5} />
    <circle cx={112} cy={22} r={4.5} fill={PAPER_WARM} stroke={INK_DARK} strokeWidth={2.5} />
  </svg>
);

/** 小道具SVG：顧客カルテ用の黒塗りVIPシルエット */
const VipSilhouette: React.FC = () => (
  <svg width="260" height="270" viewBox="0 0 260 270" style={{ display: 'block', margin: '0 auto' }}>
    <rect x="8" y="8" width="244" height="254" fill="#E6DEC8" stroke={INK_DARK} strokeWidth={3} strokeDasharray="8 6" />
    <g fill="#221D17">
      <ellipse cx="130" cy="96" rx="44" ry="50" />
      <path d="M 42 258 C 46 196, 80 166, 130 166 C 180 166, 214 196, 218 258 Z" />
      <polygon points="112,168 148,168 130,224" fill={PAPER_WARM} />
      <polygon points="124,174 136,174 139,232 130,248 121,232" fill={INK_RED} />
    </g>
  </svg>
);

/* ==========================================================================
 * Scene 1: 闇の鑑定台と吊り下げられた160万円の値札 (0.00s - 6.46s)
 * ========================================================================== */

const scene1Backdrop = (c: PlanECustomSceneContext) => {
  const tBag = c.cue('160万円のバッグ');
  const tCustomer = c.cue('いちばん大事な客');
  const lampPan = eio(c.sec, tCustomer, 0.8);
  const lampX = lerp(760, 1380, lampPan);
  const lampY = lerp(380, 420, lampPan);
  const lampR = lerp(120, 440, eo(c.sec, tBag - 0.8, 0.9));

  return (
    <>
      <MediaPlate
        src={c.media('paris_champs_elysees')}
        sec={c.sec}
        fromSec={c.scene.startSec}
        toSec={c.scene.endSec}
        filter="grayscale(0.95) contrast(1.22) brightness(0.38)"
        zoom={[1.03, 1.13]}
        dim={0.44}
      />
      <AbsoluteFill style={{ opacity: 0.66 }}>
        <LivingSurface surface="dark_desk" intensity={0.85} />
      </AbsoluteFill>
      <Spotlight x={lampX} y={lampY} r={lampR} strength={0.78} />
    </>
  );
};

const scene1Render = (c: PlanECustomSceneContext) => {
  const tOpen = c.cue('もしあなたが');
  const tBag = c.cue('160万円のバッグ');
  const tCustomer = c.cue('いちばん大事な客');
  const tWho = c.cue('誰でしょう');

  return (
    <>
      {/* 左：実写モノグラムバッグの鑑定プリント */}
      <Pop sec={c.sec} at={tOpen} x={112} y={136} rot={-3.5} from={1.16} dropY={-26}>
        <PhotoPrint
          src={c.media('luxury_handbag_display')}
          w={430}
          h={490}
          objectPosition="22% 50%"
          caption="高級レザーバッグ"
          captionSize={30}
          filter="contrast(1.08) saturate(1.05)"
        />
      </Pop>

      {/* 中央：天井から物理落下して揺れる160万円の値札 */}
      <DiegeticHangTag
        atSec={tBag}
        x={835}
        y={48}
        price="¥1,600,000"
        label="店頭定価"
        scale={1.22}
        stringLen={128}
        swing
        glow={0.62}
      />

      {/* 値札の価格を前面から朱の墨で強調囲み */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 28, pointerEvents: 'none' }}>
        <InkStroke
          sec={c.sec}
          at={tBag + 0.55}
          dur={0.48}
          color={INK_RED}
          width={9}
          d={inkCirclePath(835, 366, 206, 56, 5)}
        />
      </div>

      {/* 下部メモ：問いの前提 */}
      <Pop sec={c.sec} at={tBag + 0.35} x={615} y={608} rot={1.8} from={0.82}>
        <PaperScrap w={450} tone={PAPER_CREAM} seed={9} padding="18px 26px">
          <div style={{ ...SANS, fontSize: 30, color: INK_MUTED, textAlign: 'center', letterSpacing: '0.06em' }}>
            あなたが売り手なら
          </div>
          <div style={{ ...SERIF, fontSize: 44, color: INK_DARK, textAlign: 'center', marginTop: 4 }}>
            誰に売るべきか？
          </div>
        </PaperScrap>
      </Pop>

      {/* 右：VIP 顧客カルテ */}
      <Pop sec={c.sec} at={tCustomer} x={1185} y={102} rot={2.4} from={1.14} dropY={-34}>
        <PaperScrap w={585} h={685} tone={PAPER_WARM} seed={14} tape="corners" padding="32px 34px">
          <div style={{ ...MONO, fontSize: 24, color: INK_RED, letterSpacing: '0.14em' }}>
            CASE FILE / 01
          </div>
          <div style={{ ...SERIF, fontSize: 50, color: INK_DARK, marginTop: 6, lineHeight: 1.15 }}>
            いちばん大事な客
          </div>
          <div style={{ height: 4, background: INK_DARK, margin: '16px 0 24px' }} />
          <div style={{ position: 'relative' }}>
            <VipSilhouette />
            {c.sec >= tWho ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `scale(${lerp(2.1, 1, spr(c.sec, tWho, c.fps, { stiffness: 460, damping: 16 })).toFixed(3)}) rotate(-6deg)`,
                }}
              >
                <span
                  style={{
                    ...SERIF,
                    fontSize: 225,
                    color: INK_RED,
                    lineHeight: 1,
                    textShadow: '0 8px 24px rgba(251,246,234,0.9)',
                  }}
                >
                  ？
                </span>
              </div>
            ) : null}
          </div>
          <div
            style={{
              ...SANS,
              fontSize: 32,
              color: INK_MUTED,
              textAlign: 'center',
              marginTop: 22,
              letterSpacing: '0.08em',
            }}
          >
            TARGET CUSTOMER
          </div>
        </PaperScrap>
      </Pop>

      {/* 顧客見出しの赤下線 */}
      <InkStroke
        sec={c.sec}
        at={tCustomer + 0.3}
        dur={0.4}
        color={INK_RED}
        width={9}
        d="M 1222 232 C 1380 226 1540 236 1710 226"
      />

      {/* 問いかけ着弾スタンプ */}
      <DiegeticStamp
        text="誰でしょう"
        atSec={tWho}
        size={62}
        rotateDeg={-10}
        style={{ left: 1320, top: 655 }}
      />
    </>
  );
};

/* ==========================================================================
 * Scene 2: 紙面の通説を打ち消し、暗闇から「普通の会社員」の土台が反転 (6.46s - 20.33s)
 * ========================================================================== */

const scene2Backdrop = (c: PlanECustomSceneContext) => {
  const tSupport = c.cue('この業界を太く支えている');
  const tSalaryman = c.cue('普通の会社員');
  const slideIn = eo(c.sec, c.scene.startSec, 0.28);
  const pullOut = eo(c.sec, tSupport, 0.34);

  return (
    <>
      {/* 下層（紙が抜けた後に現れる暗闇＋街の買い物客実写） */}
      <MediaPlate
        src={c.media('luxury_boutique_broll')}
        sec={c.sec}
        fromSec={tSupport}
        toSec={c.scene.endSec}
        filter="grayscale(0.75) contrast(1.2) brightness(0.42)"
        zoom={[1.02, 1.1]}
        dim={0.54}
      />
      <AbsoluteFill style={{ opacity: 0.62 }}>
        <LivingSurface surface="dark_desk" intensity={0.8} />
      </AbsoluteFill>
      <Spotlight
        x={lerp(960, 1020, eo(c.sec, tSalaryman, 0.6))}
        y={lerp(420, 560, eo(c.sec, tSalaryman, 0.6))}
        r={460}
        strength={0.76}
      />

      {/* 上層：紙の調査シート（右から滑り込み、tSupport で左へ引き抜かれる） */}
      {pullOut < 1 ? (
        <AbsoluteFill
          style={{
            transform: `translateX(${(lerp(1920, 0, slideIn) - 1980 * pullOut).toFixed(1)}px) rotate(${(lerp(2.2, 0, slideIn) - 2.4 * pullOut).toFixed(2)}deg)`,
            boxShadow: '-36px 0 64px rgba(0,0,0,0.48)',
          }}
        >
          <LivingSurface surface="paper" intensity={1.05} />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const scene2Render = (c: PlanECustomSceneContext) => {
  const tThink = c.cue('普通に考えれば');
  const tRich = c.cue('お金持ちです');
  const tFlip = c.cue('ところが本物の大富豪');
  const tLogo = c.cue('ロゴの目立つバッグ');
  const tReject = c.cue('持ちたがりません');
  const tSupport = c.cue('この業界を太く支えている');
  const tWantLook = c.cue('お金持ちに見られたい');
  const tSalaryman = c.cue('普通の会社員');

  const richDim = eo(c.sec, tFlip, 0.25);
  const pillarRise = eo(c.sec, tSupport + 0.14, 0.55);
  const crownRock = wob(c.sec, tSalaryman, 5.5, 2.4, 3.0);

  return (
    <>
      {/* 前半：紙の上での通説破壊 */}
      <Window sec={c.sec} from={tThink} to={tSupport + 0.18}>
        {/* 左上ヘッダ紙 */}
        <Pop sec={c.sec} at={tThink + 0.05} x={102} y={56} rot={-1.5} from={0.9}>
          <PaperScrap w={420} tone={PAPER_AGED} seed={17} tape={false} padding="14px 26px">
            <div style={{ ...SERIF, fontSize: 38, color: INK_DARK }}>通説の答え</div>
          </PaperScrap>
        </Pop>

        {/* 左端：進行役アバター（知的コメンテーター） */}
        <Pop sec={c.sec} at={tThink + 0.1} x={58} y={408} rot={0} from={0.86} dropY={50}>
          <EconHostAvatar pose={c.sec >= tFlip ? 'open_hands' : 'tented_hands'} emblem="¥" scale={0.96} />
        </Pop>

        {/* 中央左：通説カード「お金持ち」 */}
        <Pop sec={c.sec} at={tRich} x={432} y={148} rot={-2.5} from={1.18}>
          <div style={{ opacity: lerp(1, 0.42, richDim), filter: `grayscale(${(richDim * 0.8).toFixed(2)})` }}>
            <PaperScrap w={495} h={520} tone="#FFFDF6" seed={21} tape="top" padding="42px 32px">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                <CrownEmblem size={108} />
              </div>
              <div style={{ ...SANS, fontSize: 30, color: INK_MUTED, textAlign: 'center', letterSpacing: '0.1em' }}>
                ふつうの連想
              </div>
              <div style={{ ...SERIF, fontSize: 82, color: INK_DARK, textAlign: 'center', marginTop: 14, lineHeight: 1.1 }}>
                お金持ち
              </div>
              <div
                style={{
                  ...SANS,
                  fontSize: 30,
                  color: INK_AMBER,
                  textAlign: 'center',
                  marginTop: 22,
                  borderTop: `2px dashed ${INK_MUTED}`,
                  paddingTop: 18,
                }}
              >
                富裕層が買うはず？
              </div>
            </PaperScrap>
          </div>
        </Pop>

        {/* 通説への赤丸（一度肯定する振り） */}
        <InkStroke
          sec={c.sec}
          at={tRich + 0.25}
          dur={0.42}
          color={INK_AMBER}
          width={9}
          opacity={lerp(0.9, 0.25, richDim)}
          d={inkCirclePath(680, 412, 222, 108, 12)}
        />

        {/* 反転：極太の赤バツで通説を斬り捨てる */}
        <InkStroke
          sec={c.sec}
          at={tFlip}
          dur={0.18}
          color={INK_RED}
          width={22}
          d="M 465 215 L 895 605"
        />
        <InkStroke
          sec={c.sec}
          at={tFlip + 0.14}
          dur={0.18}
          color={INK_RED}
          width={22}
          d="M 895 210 L 460 605"
        />

        {/* 右上：本物の大富豪の反応 */}
        <Pop sec={c.sec} at={tFlip + 0.3} x={1035} y={64} rot={1.5} from={1.12}>
          <PaperScrap w={755} tone={PAPER_CREAM} seed={25} tape={false} padding="16px 28px">
            <div style={{ ...SERIF, fontSize: 44, color: INK_DARK }}>
              本物の大富豪ほど… <span style={{ color: INK_RED }}>ロゴを避ける</span>
            </div>
          </PaperScrap>
        </Pop>

        {/* 右：ロゴの目立つバッグ写真 */}
        <Pop sec={c.sec} at={tLogo} x={1065} y={196} rot={2.2} from={1.2}>
          <PhotoPrint
            src={c.media('luxury_handbag_display')}
            w={620}
            h={440}
            objectPosition="50% 62%"
            caption="ロゴの目立つバッグ"
            captionSize={34}
          />
        </Pop>

        {/* バッグ写真の上へ「持たない」の赤判子押印 */}
        <DiegeticStamp
          text="持たない"
          atSec={tReject}
          size={92}
          rotateDeg={-12}
          style={{ left: 1125, top: 345 }}
        />
      </Window>

      {/* 後半：紙が抜けて現れる暗闇の構造図（普通の会社員が業界の土台） */}
      <Window sec={c.sec} from={tSupport + 0.14}>
        {/* 上部：業界の王冠プレート（土台の上に載る構造） */}
        <Place
          x={650}
          y={lerp(20, 74, pillarRise)}
          w={620}
          rot={crownRock}
          style={{ opacity: pillarRise }}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #272017 0%, #15110C 100%)',
              border: `4px solid ${INK_GOLD}`,
              padding: '22px 32px',
              boxShadow: '0 20px 44px rgba(0,0,0,0.68)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
            }}
          >
            <CrownEmblem size={76} />
            <div>
              <div style={{ ...MONO, fontSize: 22, color: INK_GOLD, letterSpacing: '0.16em' }}>
                LUXURY INDUSTRY
              </div>
              <div style={{ ...SERIF, fontSize: 48, color: PAPER_WARM, lineHeight: 1.15 }}>
                高級ブランド業界
              </div>
            </div>
          </div>
        </Place>

        {/* 中央下：業界を太く支える建築的石柱（SVG） */}
        <svg
          width="1920"
          height="1080"
          viewBox="0 0 1920 1080"
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
        >
          <g
            transform={`translate(0, ${lerp(360, 0, pillarRise).toFixed(1)})`}
            opacity={pillarRise}
          >
            {/* 柱頭 */}
            <rect x={690} y={258} width={540} height={38} fill="#D5C8AE" stroke={INK_DARK} strokeWidth={4} />
            <rect x={730} y={296} width={460} height={24} fill="#BBAE93" stroke={INK_DARK} strokeWidth={3.5} />
            {/* 柱身（太く支える柱） */}
            <rect x={760} y={320} width={400} height={540} fill="#E6DAC2" stroke={INK_DARK} strokeWidth={4} />
            {/* 縦フルーティング（彫り筋） */}
            {[812, 872, 932, 992, 1052, 1112].map((lx) => (
              <line key={lx} x1={lx} y1={336} x2={lx} y2={850} stroke="#B8A98B" strokeWidth={8} />
            ))}
          </g>
        </svg>

        {/* 左：渋谷の群衆（普通の会社員たち）実写プリント */}
        <Pop sec={c.sec} at={tWantLook} x={108} y={310} rot={-3.5} from={1.16}>
          <PhotoPrint
            src={c.media('tokyo_commuter_crowd')}
            w={495}
            h={335}
            caption="街のふつうの層"
            captionSize={30}
          />
        </Pop>

        {/* 右上：欲望の本音付箋 */}
        <Pop sec={c.sec} at={tWantLook + 0.15} x={1315} y={196} rot={3.2} from={1.18}>
          <PaperScrap w={495} tone={PAPER_WARM} seed={33} tape="top" padding="24px 28px">
            <div style={{ ...SANS, fontSize: 28, color: INK_MUTED }}>本音のモチベーション</div>
            <div style={{ ...SERIF, fontSize: 48, color: INK_RED, marginTop: 8, lineHeight: 1.25 }}>
              「お金持ちに
              <br />
              見られたい」
            </div>
          </PaperScrap>
        </Pop>

        {/* 群衆から土台へ結ぶ赤い流れ矢印 */}
        <InkStroke
          sec={c.sec}
          at={tWantLook + 0.45}
          dur={0.42}
          color={INK_GOLD}
          width={11}
          d="M 630 505 C 675 510 705 530 742 545 M 708 518 L 748 548 L 702 562"
        />

        {/* 中央柱の前面：主役札「普通の会社員」 */}
        <Pop sec={c.sec} at={tSalaryman} x={612} y={482} rot={-1.8} from={1.25}>
          <PaperScrap w={700} h={235} tone={PAPER_WARM} seed={39} tape="corners" padding="32px 30px">
            <div style={{ ...SANS, fontSize: 30, color: INK_MUTED, textAlign: 'center', letterSpacing: '0.1em' }}>
              業界を太く支える主役
            </div>
            <div style={{ ...SERIF, fontSize: 94, color: INK_DARK, textAlign: 'center', marginTop: 10, whiteSpace: 'nowrap' }}>
              普通の会社員
            </div>
          </PaperScrap>
        </Pop>

        {/* 主役札への二重赤線 */}
        <InkStroke
          sec={c.sec}
          at={tSalaryman + 0.28}
          dur={0.34}
          color={INK_RED}
          width={11}
          d="M 678 684 L 1244 674 M 692 699 L 1230 691"
        />

        {/* 決定スタンプ */}
        <DiegeticStamp
          text="太く支える"
          atSec={tSalaryman + 0.2}
          size={60}
          rotateDeg={-7}
          style={{ left: 1335, top: 555 }}
        />
      </Window>
    </>
  );
};

/* ==========================================================================
 * Scene 3: 60兆円市場を真っ二つに割る「2% vs 98%」の非対称解剖 (20.33s - 40.84s)
 * ========================================================================== */

const scene3Backdrop = (c: PlanECustomSceneContext) => {
  const t45 = c.cue('45パーセント');
  const t350M = c.cue('3億5000万人');
  const boardIn = eo(c.sec, t45, 0.3);

  return (
    <>
      {c.sec < t350M ? (
        <>
          <LivingSurface surface="corkboard" intensity={1.0} />
          {c.sec >= t45 ? (
            <AbsoluteFill
              style={{
                transform: `translateY(${lerp(1080, 0, boardIn).toFixed(1)}px)`,
                boxShadow: '0 -24px 48px rgba(0,0,0,0.42)',
              }}
            >
              <LivingSurface surface="whiteboard" intensity={1.0} />
            </AbsoluteFill>
          ) : null}
        </>
      ) : (
        <>
          <LivingSurface surface="charcoal" intensity={1.05} />
          <Spotlight x={1120} y={420} r={540} strength={0.55} />
        </>
      )}
    </>
  );
};

const scene3Render = (c: PlanECustomSceneContext) => {
  const tMarket = c.cue('世界の高級ブランド市場');
  const t60T = c.cue('2024年でおよそ60兆円');
  const t45 = c.cue('45パーセント');
  const t2Pct = c.cue('上位わずか2パーセント');
  const tUltra = c.cue('超富裕層');
  const t98Pct = c.cue('ところが残りの98パーセント');
  const t350M = c.cue('3億5000万人');
  const tStretch = c.cue('背伸びして買う人たち');
  const tOverHalf = c.cue('売上の半分以上');

  const barW = 1500;
  const barX = 210;
  const w45 = Math.round(barW * 0.45 * eo(c.sec, t45 + 0.12, 0.72));
  const w2 = Math.max(28, Math.round(barW * 0.02));
  const p2 = eo(c.sec, t2Pct, 0.4);
  const pUltra = eo(c.sec, tUltra, 0.45);
  const w98 = Math.round((barW - w2) * eo(c.sec, t98Pct + 0.08, 0.75));
  const pHalfBar = eo(c.sec, tOverHalf, 0.62);

  return (
    <>
      {/* 第1幕：コルクボード上の「世界市場60兆円」ファイル */}
      <Window sec={c.sec} from={tMarket} to={t45 + 0.16}>
        <Pop sec={c.sec} at={tMarket} x={122} y={145} rot={-3.2} from={1.15}>
          <PhotoPrint
            src={c.media('paris_champs_elysees')}
            w={540}
            h={385}
            caption="世界の高級ブランド市場"
            captionSize={30}
            filter="contrast(1.12)"
          />
        </Pop>

        {/* 赤い画鋲ピン */}
        <Pop sec={c.sec} at={tMarket + 0.15} x={392} y={128} from={1.8}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              background: INK_RED,
              border: `3px solid ${INK_DARK}`,
              boxShadow: '0 6px 10px rgba(0,0,0,0.45)',
            }}
          />
        </Pop>

        {/* 60兆円の新聞切り抜き */}
        <Pop sec={c.sec} at={t60T} x={800} y={142} rot={1.8} from={1.18} dropY={-32}>
          <PaperScrap w={980} h={520} tone={PAPER_WARM} seed={43} tape="corners" padding="42px 48px">
            <div style={{ ...MONO, fontSize: 28, color: INK_RED, letterSpacing: '0.14em' }}>
              GLOBAL LUXURY MARKET / 2024
            </div>
            <div style={{ ...SANS, fontSize: 38, color: INK_MUTED, marginTop: 10 }}>
              世界の高級ブランド市場規模
            </div>
            <div style={{ marginTop: 22, textAlign: 'center' }}>
              <CountUp
                sec={c.sec}
                at={t60T}
                dur={1.35}
                to={60}
                format={(n) => `約${Math.round(n)}兆円`}
                style={{ ...SERIF, fontSize: 164, color: INK_DARK, lineHeight: 1.05 }}
              />
            </div>
            <div
              style={{
                ...SANS,
                fontSize: 32,
                color: INK_MUTED,
                textAlign: 'right',
                marginTop: 48,
              }}
            >
              2024年推計
            </div>
          </PaperScrap>
        </Pop>

        {/* コルクボードの赤い捜査糸（写真 → 60兆円） */}
        <InkStroke
          sec={c.sec}
          at={t60T + 0.15}
          dur={0.42}
          color={INK_RED}
          width={8}
          d="M 408 144 C 580 185 690 210 822 194"
        />
        {/* 60兆円の二重下線 */}
        <InkStroke
          sec={c.sec}
          at={t60T + 0.85}
          dur={0.42}
          color={INK_RED}
          width={11}
          d="M 940 526 L 1640 516 M 960 544 L 1620 534"
        />
      </Window>

      {/* 第2幕：ホワイトボード「人数 2% vs 売上 45% → 残り 98%」非対称バー解剖 */}
      <Window sec={c.sec} from={t45 + 0.12} to={t350M + 0.05}>
        <Place x={120} y={48}>
          <div style={{ ...SERIF, fontSize: 52, color: INK_DARK }}>
            60兆円の内訳：<span style={{ color: INK_AMBER }}>人数</span> と{' '}
            <span style={{ color: INK_RED }}>売上</span> のズレ
          </div>
        </Place>

        <svg
          width="1920"
          height="1080"
          viewBox="0 0 1920 1080"
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
        >
          <defs>
            <pattern id="hatch-gold" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <rect width="14" height="14" fill="#E4AD2F" />
              <line x1="0" y1="0" x2="0" y2="14" stroke="#B77B14" strokeWidth="5" />
            </pattern>
            <pattern id="hatch-red" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
              <rect width="16" height="16" fill="#C8102E" />
              <line x1="0" y1="0" x2="0" y2="16" stroke="#9B0B22" strokeWidth="5" />
            </pattern>
          </defs>

          {/* 2%の極細スリットから下段45%へ広がる扇形バンド */}
          {pUltra > 0 ? (
            <polygon
              points={`${barX},${436} ${barX + w2},${436} ${barX + w45},${574} ${barX},${574}`}
              fill="rgba(228, 173, 47, 0.28)"
              stroke={INK_AMBER}
              strokeWidth={3}
              strokeDasharray="10 6"
              opacity={pUltra}
            />
          ) : null}

          {/* 上段バーラベル：買い手の人数 */}
          <text x={barX + 78} y={302} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={30} fill={INK_MUTED}>
            買い手の人数（全100%）
          </text>
          {/* 上段バー外枠 */}
          <rect x={barX} y={318} width={barW} height={118} fill="#F5F2EA" stroke={INK_DARK} strokeWidth={5} />

          {/* 上段：左端わずか2%のスリット */}
          {p2 > 0 ? (
            <rect x={barX + 2} y={320} width={w2 * p2} height={114} fill="url(#hatch-gold)" />
          ) : null}

          {/* 上段：残り98%の圧倒的な赤壁 */}
          {w98 > 0 ? (
            <>
              <rect x={barX + w2} y={320} width={w98} height={114} fill="url(#hatch-red)" />
              <text
                x={barX + w2 + Math.min(w98 / 2, 720)}
                y={398}
                textAnchor="middle"
                fontFamily={FONT_ECON_SERIF}
                fontWeight={900}
                fontSize={66}
                fill="#FFFDF6"
                opacity={eo(c.sec, t98Pct + 0.35, 0.35)}
              >
                残り 98%
              </text>
            </>
          ) : null}

          {/* 下段バーラベル：市場の売上 */}
          <text x={barX} y={554} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={30} fill={INK_MUTED}>
            市場の売上（60兆円）
          </text>
          {/* 下段バー外枠 */}
          <rect x={barX} y={574} width={barW} height={134} fill="#F5F2EA" stroke={INK_DARK} strokeWidth={5} />

          {/* 下段：売上45%（超富裕層） */}
          {w45 > 0 ? (
            <>
              <rect x={barX + 2} y={576} width={w45} height={130} fill="url(#hatch-gold)" />
              <text
                x={barX + w45 / 2}
                y={664}
                textAnchor="middle"
                fontFamily={FONT_ECON_SERIF}
                fontWeight={900}
                fontSize={72}
                fill={INK_DARK}
                opacity={eo(c.sec, t45 + 0.35, 0.35)}
              >
                45%
              </text>
            </>
          ) : null}

          {/* 下段右側：55% への予告点線枠（98%登場時） */}
          {c.sec >= t98Pct + 0.45 ? (
            <g opacity={eo(c.sec, t98Pct + 0.45, 0.35)}>
              <rect
                x={barX + Math.round(barW * 0.45) + 8}
                y={584}
                width={Math.round(barW * 0.55) - 16}
                height={114}
                fill="rgba(200, 16, 46, 0.1)"
                stroke={INK_RED}
                strokeWidth={4}
                strokeDasharray="14 8"
              />
              <text
                x={barX + Math.round(barW * 0.725)}
                y={660}
                textAnchor="middle"
                fontFamily={FONT_ECON_SERIF}
                fontWeight={900}
                fontSize={58}
                fill={INK_RED}
              >
                残りの 55% は…？
              </text>
            </g>
          ) : null}
        </svg>

        {/* 上位2%の引き出しラベル */}
        <InkStroke
          sec={c.sec}
          at={t2Pct + 0.1}
          dur={0.35}
          color={INK_AMBER}
          width={8}
          d="M 225 314 L 225 182 L 315 182"
        />
        <Pop sec={c.sec} at={t2Pct + 0.12} x={324} y={132} rot={-1.2} from={1.2}>
          <PaperScrap w={470} tone={PAPER_WARM} seed={49} tape={false} padding="14px 24px">
            <div style={{ ...SERIF, fontSize: 46, color: INK_AMBER, whiteSpace: 'nowrap' }}>
              上位わずか <span style={{ color: INK_RED, fontSize: 56 }}>2%</span>
            </div>
          </PaperScrap>
        </Pop>

        {/* 超富裕層タグ */}
        <Pop sec={c.sec} at={tUltra} x={225} y={736} rot={-1.5} from={1.15}>
          <PaperScrap w={565} tone={PAPER_CREAM} seed={53} tape="top" padding="16px 26px">
            <div style={{ ...SERIF, fontSize: 42, color: INK_DARK, textAlign: 'center', whiteSpace: 'nowrap' }}>
              超富裕層 ＝ 売上 45%
            </div>
          </PaperScrap>
        </Pop>
      </Window>

      {/* 第3幕：黒板反転「3億5000万人の背伸びが、売上の半分以上を払う」 */}
      <Window sec={c.sec} from={t350M}>
        {/* 背景のチョーク群衆ドット（78人が波のように灯る） */}
        <svg
          width="1920"
          height="1080"
          viewBox="0 0 1920 1080"
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
        >
          {CHALK_CROWD_DOTS.map((d, idx) => {
            const p = eo(c.sec, t350M + d.delay * 0.7, 0.25);
            if (p <= 0) return null;
            return (
              <g key={idx} opacity={p * 0.34}>
                <circle cx={d.x} cy={d.y - d.r * 1.4} r={d.r * 0.65} fill="#F1EEE6" />
                <path
                  d={`M ${d.x - d.r * 1.1} ${d.y + d.r * 1.1} Q ${d.x} ${d.y - d.r * 0.4} ${d.x + d.r * 1.1} ${d.y + d.r * 1.1}`}
                  fill="none"
                  stroke="#F1EEE6"
                  strokeWidth={2.5}
                />
              </g>
            );
          })}
        </svg>

        {/* 左：渋谷の群衆実写 */}
        <Pop sec={c.sec} at={t350M + 0.08} x={108} y={136} rot={-3} from={1.16}>
          <PhotoPrint
            src={c.media('tokyo_commuter_crowd')}
            w={540}
            h={365}
            caption="残り98%の買い手たち"
            captionSize={30}
          />
        </Pop>

        {/* 左下：背伸びして買う層ラベル */}
        <Pop sec={c.sec} at={tStretch} x={112} y={626} rot={1.8} from={1.14}>
          <PaperScrap w={560} tone={PAPER_WARM} seed={57} tape="top" padding="20px 26px">
            <div style={{ ...SERIF, fontSize: 44, color: INK_RED, textAlign: 'center', whiteSpace: 'nowrap' }}>
              背伸びして買う人たち
            </div>
            <div style={{ ...SANS, fontSize: 27, color: INK_MUTED, textAlign: 'center', marginTop: 8, whiteSpace: 'nowrap' }}>
              1人ずつは小さくても、数が桁違い
            </div>
          </PaperScrap>
        </Pop>

        {/* 右上：巨大チョーク数字「3億5,000万人+」 */}
        <Pop sec={c.sec} at={t350M + 0.14} x={736} y={108} rot={-1} from={0.85}>
          <div style={{ ...SANS, fontSize: 34, color: '#D4CEC0', letterSpacing: '0.08em' }}>
            残りの 98% ＝
          </div>
          <CountUp
            sec={c.sec}
            at={t350M + 0.14}
            dur={1.35}
            to={35000}
            format={(n) => {
              const v = Math.round(n);
              const oku = Math.floor(v / 10000);
              const man = v % 10000;
              return oku > 0 ? `${oku}億${man.toLocaleString('ja-JP')}万人超` : `${man.toLocaleString('ja-JP')}万人`;
            }}
            style={{
              ...SERIF,
              fontSize: 112,
              color: INK_GOLD,
              display: 'block',
              marginTop: 6,
              textShadow: '0 6px 24px rgba(0,0,0,0.65)',
              whiteSpace: 'nowrap',
            }}
          />
        </Pop>

        {/* 群衆から売上バーへ向かうチョーク矢印 */}
        <InkStroke
          sec={c.sec}
          at={tStretch + 0.25}
          dur={0.42}
          color={INK_GOLD}
          width={10}
          d="M 656 540 C 705 510 738 492 778 486 M 748 468 L 785 486 L 750 510"
        />

        {/* 右中段：売上の半分以上（55%）が燃え上がる黒板バー */}
        <Place x={755} y={405} w={1040}>
          <div style={{ ...SANS, fontSize: 32, color: '#EAE4D6', marginBottom: 14 }}>
            60兆円の売上のうち…
          </div>
          <div
            style={{
              width: 1020,
              height: 132,
              border: '4px solid #EAE4D6',
              display: 'flex',
              background: 'rgba(255,255,255,0.06)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '45%',
                height: '100%',
                background: 'rgba(232, 185, 49, 0.26)',
                borderRight: '4px dashed #EAE4D6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...SERIF,
                fontSize: 42,
                color: '#C7BEAA',
              }}
            >
              富裕層 45%
            </div>
            <div style={{ width: '55%', height: '100%', position: 'relative' }}>
              <div
                style={{
                  width: `${(pHalfBar * 100).toFixed(1)}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${INK_RED} 0%, ${INK_CRIMSON} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <span style={{ ...SERIF, fontSize: 64, color: '#FFFDF6', whiteSpace: 'nowrap' }}>
                  55% 以上！
                </span>
              </div>
            </div>
          </div>
        </Place>

        {/* 赤判子：売上の半分超 */}
        <DiegeticStamp
          text="売上の半分超"
          atSec={tOverHalf + 0.18}
          size={80}
          rotateDeg={-7}
          style={{ left: 1090, top: 615 }}
        />
      </Window>
    </>
  );
};

/* ==========================================================================
 * Scene 4: 札束の行方 → LVMH 37.1% & 100円玉37円 → 5年で2倍・160万円回収 (40.84s - 64.87s)
 * ========================================================================== */

const scene4Backdrop = (c: PlanECustomSceneContext) => {
  const tLV = c.cue('ルイ・ヴィトン');
  const tPriceUp = c.cue('しかも値札は上がり続け');
  const t160M = c.cue('日本では160万円');

  const paperDrop = eo(c.sec, tLV, 0.32);
  const paperPull = eo(c.sec, tPriceUp, 0.32);

  return (
    <>
      {/* 第1幕：100ドル札をめくり続ける実写 Bロール */}
      {c.sec < tLV + 0.35 ? (
        <MediaPlate
          src={c.media('counting_cash_broll')}
          sec={c.sec}
          fromSec={c.scene.startSec}
          toSec={tLV + 0.35}
          filter="contrast(1.18) saturate(0.88) brightness(0.76)"
          zoom={[1.03, 1.12]}
          dim={0.32}
        />
      ) : null}

      {/* 第3幕：闇の鑑定台＋スローモーション札束 */}
      {c.sec >= tPriceUp - 0.05 ? (
        <>
          <MediaPlate
            src={c.media('counting_cash_broll')}
            sec={c.sec}
            fromSec={tPriceUp}
            toSec={c.scene.endSec}
            playbackRate={0.75}
            filter="grayscale(0.72) contrast(1.22) brightness(0.36)"
            zoom={[1.04, 1.14]}
            dim={0.6}
          />
          <AbsoluteFill style={{ opacity: 0.68 }}>
            <LivingSurface surface="dark_desk" intensity={0.85} />
          </AbsoluteFill>
          <Spotlight
            x={lerp(720, 1460, eo(c.sec, t160M - 0.3, 0.8))}
            y={lerp(520, 380, eo(c.sec, t160M - 0.3, 0.8))}
            r={lerp(420, 490, eo(c.sec, t160M, 0.6))}
            strength={0.76}
          />
        </>
      ) : null}

      {/* 第2幕：分厚い決算書紙面（上から落ちて、最後に右へ引き抜かれる） */}
      {c.sec >= tLV && paperPull < 1 ? (
        <AbsoluteFill
          style={{
            transform: `translate(${(1980 * paperPull).toFixed(1)}px, ${lerp(-1080, 0, paperDrop).toFixed(1)}px) rotate(${(2.4 * paperPull).toFixed(2)}deg)`,
            boxShadow: '0 30px 60px rgba(0,0,0,0.45)',
          }}
        >
          <LivingSurface surface="paper" intensity={1.0} />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const scene4Render = (c: PlanECustomSceneContext) => {
  const tPayment = c.cue('その背伸びの代金');
  const tWhere = c.cue('どこへ行くのか');
  const tLV = c.cue('ルイ・ヴィトン');
  const tLVMH = c.cue('エルブイエムエイチ');
  const tMargin = c.cue('営業利益率が37.1パーセント');
  const t100Yen = c.cue('100円売れるたびに');
  const t37Yen = c.cue('37円が残る');
  const tApparel = c.cue('普通のアパレルの数倍');
  const tPriceUp = c.cue('しかも値札は上がり続け');
  const tChanel = c.cue('シャネルの定番バッグ');
  const tDouble = c.cue('5年でほぼ2倍');
  const t160M = c.cue('日本では160万円');

  const pApparel = eo(c.sec, tApparel, 0.65);

  return (
    <>
      {/* 第1幕：札束Bロール上の問いかけ */}
      <Window sec={c.sec} from={tPayment} to={tLV + 0.14}>
        <Pop sec={c.sec} at={tPayment} x={140} y={268} rot={-2.5} from={1.15}>
          <PaperScrap w={670} tone={PAPER_WARM} seed={61} tape="corners" padding="32px 36px">
            <div style={{ ...SANS, fontSize: 30, color: INK_MUTED }}>3億5000万人が払った</div>
            <div style={{ ...SERIF, fontSize: 72, color: INK_DARK, marginTop: 8, whiteSpace: 'nowrap' }}>
              背伸びの代金
            </div>
          </PaperScrap>
        </Pop>

        <InkStroke
          sec={c.sec}
          at={tPayment + 0.75}
          dur={0.45}
          color={INK_GOLD}
          width={14}
          d="M 836 392 C 930 380 1015 385 1104 395 M 1062 362 L 1112 396 L 1058 426"
        />

        <Pop sec={c.sec} at={tWhere} x={1140} y={288} rot={3} from={1.24}>
          <PaperScrap w={620} tone={INK_RED} seed={67} tape="corners" padding="34px 36px">
            <div style={{ ...SERIF, fontSize: 78, color: '#FFFDF6', textAlign: 'center', whiteSpace: 'nowrap' }}>
              どこへ行く？
            </div>
          </PaperScrap>
        </Pop>
      </Window>

      {/* 第2幕：紙の決算書（LVMH 37.1% & 100円玉から37円 + アパレル比較） */}
      <Window sec={c.sec} from={tLV + 0.14} to={tPriceUp + 0.12}>
        {/* 左上：モノグラムバッグ（革製品部門） */}
        <Pop sec={c.sec} at={tLV + 0.14} x={98} y={66} rot={-3} from={1.12}>
          <PhotoPrint
            src={c.media('luxury_handbag_display')}
            w={290}
            h={270}
            objectPosition="78% 50%"
            caption="革製品部門"
            captionSize={26}
          />
        </Pop>

        {/* 中央上：LVMH 決算ヘッダー */}
        <Pop sec={c.sec} at={tLVMH} x={464} y={78} rot={0} from={0.9}>
          <div style={{ width: 530 }}>
            <div style={{ ...MONO, fontSize: 26, color: INK_RED, letterSpacing: '0.16em' }}>
              FINANCIAL REPORT
            </div>
            <div style={{ ...SERIF, fontSize: 92, color: INK_DARK, lineHeight: 1.05, marginTop: 4 }}>
              LVMH
            </div>
            <div style={{ ...SANS, fontSize: 32, color: INK_MUTED, marginTop: 8 }}>
              ファッション＆革製品部門
            </div>
            <div style={{ height: 4, background: INK_DARK, marginTop: 14, width: 470 }} />
          </div>
        </Pop>

        {/* 右上：営業利益率 37.1% の巨大数値 */}
        <Pop sec={c.sec} at={tMargin} x={1035} y={64} rot={1.4} from={1.16}>
          <PaperScrap w={760} h={310} tone="#FFFDF6" seed={71} tape="corners" padding="28px 36px">
            <div style={{ ...SANS, fontSize: 34, color: INK_MUTED }}>営業利益率</div>
            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <CountUp
                sec={c.sec}
                at={tMargin}
                dur={1.15}
                to={37.1}
                format={(n) => `${n.toFixed(1)}%`}
                style={{ ...SERIF, fontSize: 152, color: INK_RED, lineHeight: 1.02 }}
              />
            </div>
          </PaperScrap>
        </Pop>

        {/* 37.1% を赤丸囲み */}
        <InkStroke
          sec={c.sec}
          at={tMargin + 0.95}
          dur={0.45}
          color={INK_RED}
          width={10}
          d={inkCirclePath(1415, 255, 286, 94, 7)}
        />

        {/* 下段左：物理100円玉から37円が赤く切り取られる（SVG） */}
        <svg
          width="1920"
          height="1080"
          viewBox="0 0 1920 1080"
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
        >
          <DiegeticCoin
            atSec={t100Yen}
            cx={345}
            cy={615}
            r={110}
            frac={0.371}
            face="100"
            label="売上 100円"
            valueText="利益 37円"
            fillColor={INK_RED}
            fillDelaySec={0.65}
            fillDurSec={0.85}
          />
        </svg>

        {/* コインから利益メモへ飛ぶ赤い利益トークン */}
        {c.sec >= t37Yen
          ? PROFIT_TOKENS.map((tk) => {
              const f = fly(
                c.sec,
                t37Yen + tk.delay,
                0.58,
                { x: 420, y: 585 },
                { x: tk.endX, y: tk.endY },
                tk.lift,
              );
              if (f.u <= 0) return null;
              return (
                <div
                  key={tk.idx}
                  style={{
                    position: 'absolute',
                    left: f.x - 20,
                    top: f.y - 20,
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    background: INK_GOLD,
                    border: `3px solid ${INK_DARK}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...SERIF,
                    fontSize: 22,
                    color: INK_DARK,
                    boxShadow: '0 6px 12px rgba(0,0,0,0.28)',
                    opacity: f.u < 1 ? 1 : 0.94,
                    zIndex: 16,
                  }}
                >
                  ¥
                </div>
              );
            })
          : null}

        {/* コイン→メモの赤矢印と解説札 */}
        <InkStroke
          sec={c.sec}
          at={t37Yen}
          dur={0.36}
          color={INK_RED}
          width={9}
          d="M 488 612 C 555 594 608 594 662 608 M 632 584 L 668 610 L 626 626"
        />
        <Pop sec={c.sec} at={t37Yen + 0.12} x={682} y={482} rot={-2} from={1.12}>
          <PaperScrap w={305} tone={PAPER_CREAM} seed={73} tape="top" padding="18px 22px">
            <div style={{ ...SERIF, fontSize: 44, color: INK_RED, textAlign: 'center', lineHeight: 1.2 }}>
              37円が残る
            </div>
            <div style={{ ...SANS, fontSize: 24, color: INK_MUTED, textAlign: 'center', marginTop: 8 }}>
              異常な高収益
            </div>
          </PaperScrap>
        </Pop>

        {/* 下段右：普通のアパレル vs LVMH 高さ比較（物理紙面グラフ） */}
        <Pop sec={c.sec} at={tApparel - 0.08} x={1035} y={434} rot={0} from={0.94}>
          <PaperScrap w={760} h={410} tone="#FFFDF6" seed={79} tape={false} padding="24px 32px">
            <div style={{ ...SANS, fontSize: 30, color: INK_DARK, marginBottom: 12 }}>
              営業利益率の比較
            </div>
            <svg width="696" height="310" viewBox="0 0 696 310" style={{ display: 'block' }}>
              {/* 基準線 */}
              <line x1={30} y1={250} x2={666} y2={250} stroke={INK_DARK} strokeWidth={4} />
              {/* 普通のアパレル（約7%想定の低さ） */}
              <rect
                x={110}
                y={250 - Math.round(48 * pApparel)}
                width={150}
                height={Math.round(48 * pApparel)}
                fill="#7D7466"
                stroke={INK_DARK}
                strokeWidth={3.5}
              />
              <text x={185} y={240 - Math.round(48 * pApparel)} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={32} fill={INK_MUTED}>
                約5〜10%
              </text>
              <text x={185} y={292} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={800} fontSize={28} fill={INK_DARK}>
                普通のアパレル
              </text>

              {/* LVMH 革製品（37.1% の圧倒的高さ） */}
              <rect
                x={415}
                y={250 - Math.round(215 * pApparel)}
                width={170}
                height={Math.round(215 * pApparel)}
                fill={INK_RED}
                stroke={INK_DARK}
                strokeWidth={4}
              />
              <text x={500} y={238 - Math.round(215 * pApparel)} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={44} fill={INK_RED}>
                37.1%
              </text>
              <text x={500} y={292} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={28} fill={INK_RED}>
                LVMH 革製品
              </text>
            </svg>
          </PaperScrap>
        </Pop>

        {/* 数倍の儲けスタンプ */}
        <DiegeticStamp
          text="数倍の儲け"
          atSec={tApparel + 0.35}
          size={58}
          rotateDeg={-8}
          style={{ left: 1095, top: 525 }}
        />
      </Window>

      {/* 第3幕：闇の鑑定台へ帰還「5年でほぼ2倍 → 日本では160万円超」 */}
      <Window sec={c.sec} from={tPriceUp + 0.14}>
        {/* 左上見出し札 */}
        <Pop sec={c.sec} at={tPriceUp + 0.16} x={134} y={76} rot={-1.6} from={1.1}>
          <PaperScrap w={600} tone={PAPER_WARM} seed={83} tape="top" padding="18px 28px">
            <div style={{ ...MONO, fontSize: 22, color: INK_RED, letterSpacing: '0.14em' }}>
              PRICE ESCALATION
            </div>
            <div style={{ ...SERIF, fontSize: 44, color: INK_DARK, marginTop: 4, whiteSpace: 'nowrap' }}>
              止まらない値上げの階段
            </div>
          </PaperScrap>
        </Pop>

        {/* 右肩上がりの値札階段ライン（5段の金色チャート） */}
        <InkStroke
          sec={c.sec}
          at={tPriceUp + 0.22}
          dur={1.35}
          color={INK_GOLD}
          width={14}
          d="M 210 745 L 438 680 L 666 585 L 894 465 L 1120 328"
        />

        {/* 各年のノードと価格チップ */}
        {PRICE_STEPS.map((st, idx) => {
          const atNode = stagger(tPriceUp + 0.32, idx, 0.28);
          if (c.sec < atNode) return null;
          const isLast = idx === PRICE_STEPS.length - 1;
          return (
            <Pop key={st.year} sec={c.sec} at={atNode} x={st.x - 16} y={st.y - 16} from={1.8}>
              <div
                style={{
                  width: isLast ? 36 : 26,
                  height: isLast ? 36 : 26,
                  borderRadius: 18,
                  background: isLast ? INK_CRIMSON : INK_GOLD,
                  border: `4px solid ${PAPER_WARM}`,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.65)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: -46,
                  top: 38,
                  width: 120,
                  textAlign: 'center',
                  ...SANS,
                  fontSize: 26,
                  color: '#D7CEBD',
                }}
              >
                {st.year}
              </div>
            </Pop>
          );
        })}

        {/* 左中段：シャネル定番バッグの5年前価格タグ */}
        <Pop sec={c.sec} at={tChanel} x={156} y={358} rot={-2.5} from={1.16}>
          <PaperScrap w={395} tone={PAPER_AGED} seed={89} tape="top" padding="20px 24px">
            <div style={{ ...SANS, fontSize: 26, color: INK_MUTED, whiteSpace: 'nowrap' }}>定番バッグ（5年前）</div>
            <div style={{ ...SERIF, fontSize: 64, color: INK_DARK, marginTop: 6, whiteSpace: 'nowrap' }}>
              約 80万円
            </div>
          </PaperScrap>
        </Pop>

        {/* 5年でほぼ2倍の上昇矢印＋特大赤判子 */}
        <InkStroke
          sec={c.sec}
          at={tDouble}
          dur={0.42}
          color={INK_CRIMSON}
          width={15}
          d="M 565 445 C 740 398 920 335 1104 268 M 1054 256 L 1114 264 L 1072 308"
        />
        <DiegeticStamp
          text="5年でほぼ2倍"
          atSec={tDouble + 0.14}
          size={72}
          rotateDeg={-8}
          style={{ left: 605, top: 204 }}
        />

        {/* 伏線回収のクライマックス：特大160万円の吊り下げ値札 */}
        <DiegeticHangTag
          atSec={t160M}
          x={1495}
          y={52}
          price="¥1,600,000"
          label="日本定価"
          scale={1.28}
          stringLen={130}
          swing
          glow={0.95}
        />

        {/* 160万円超の決定ラベル */}
        <Pop sec={c.sec} at={t160M + 0.32} x={1282} y={554} rot={-2.2} from={1.22}>
          <PaperScrap w={435} tone={INK_RED} seed={97} tape="corners" padding="20px 26px">
            <div style={{ ...SERIF, fontSize: 54, color: '#FFFDF6', textAlign: 'center', whiteSpace: 'nowrap' }}>
              160万円を突破
            </div>
          </PaperScrap>
        </Pop>
      </Window>
    </>
  );
};

/* ==========================================================================
 * Spec 定義（全4シーン・自由舞台100%・語句アンカー＆カメラ＆SFX完全同期）
 * ========================================================================== */

export function createLuxuryTrapV31NeonHighInput(): PlanEDefineInput {
  return {
    id: 'ab-luxury-trap-v31-neon-high',
    themeTitle: 'ハイブランドが本当にカモにしているのは、富裕層ではない（v31_neon_high）',
    range: {
      start: atStart(),
      end: at('ここで、妙なことが起きます。'),
    },
    scenes: [
      {
        id: 'hook_auction_spotlight',
        type: 'custom',
        start: atStart(),
        surface: 'dark_desk',
        camera: {
          moves: [
            { at: at('160万円のバッグ'), zoom: 1.05, x: 35, y: 10, dur: 0.7 },
            { at: at('いちばん大事な客'), zoom: 1.08, x: -75, y: -10, dur: 0.75 },
          ],
          shakes: [at('160万円のバッグ'), at('誰でしょう')],
          shakeAmp: 10,
        },
        beats: [
          hit(at('もしあなたが'), 'projector_click', { id: 'open', gain: 0.24 }),
          hit(at('160万円のバッグ'), 'price_ping', { id: 'tag_drop', gain: 0.28 }),
          hit(at('いちばん大事な客'), 'paper_snap', { id: 'vip_file', gain: 0.25 }),
          hit(at('誰でしょう'), 'impact_thud', { id: 'who_hit', gain: 0.28 }),
        ],
        backdrop: scene1Backdrop,
        render: scene1Render,
      },
      {
        id: 'flip_quiet_vs_logo',
        type: 'custom',
        start: at('普通に考えれば'),
        surface: 'paper',
        surfaceShifts: [
          { at: at('この業界を太く支えている'), surface: 'dark_desk' },
        ],
        camera: {
          moves: [
            { at: at('ところが本物の大富豪'), zoom: 1.04, x: -28, y: 0, dur: 0.45 },
            { at: at('この業界を太く支えている'), zoom: 1, x: 0, y: 0, dur: 0.35 },
            { at: at('普通の会社員'), zoom: 1.07, x: -16, y: -22, dur: 0.55 },
          ],
          shakes: [at('ところが本物の大富豪'), at('持ちたがりません'), at('普通の会社員')],
          shakeAmp: 11,
        },
        beats: [
          hit(at('普通に考えれば'), 'paper_snap', { id: 'paper_slide_in', gain: 0.24 }),
          hit(at('お金持ちです'), 'pen_scratch', { id: 'rich_circle', gain: 0.22 }),
          hit(at('ところが本物の大富豪'), 'impact_thud', { id: 'flip_x', gain: 0.28 }),
          hit(at('ロゴの目立つバッグ'), 'camera_shutter', { id: 'logo_photo', gain: 0.22 }),
          hit(at('持ちたがりません'), 'stamp_thud', { id: 'reject_stamp', gain: 0.28 }),
          hit(at('この業界を太く支えている'), 'whoosh', { id: 'paper_pull', gain: 0.26 }),
          hit(at('お金持ちに見られたい'), 'paper_snap', { id: 'crowd_photo', gain: 0.24 }),
          hit(at('普通の会社員'), 'stamp_thud', { id: 'salaryman_stamp', gain: 0.3 }),
        ],
        backdrop: scene2Backdrop,
        render: scene2Render,
      },
      {
        id: 'market_60t_scale_split',
        type: 'custom',
        start: at('世界の高級ブランド市場'),
        surface: 'corkboard',
        surfaceShifts: [
          { at: at('45パーセント'), surface: 'whiteboard' },
          { at: at('3億5000万人'), surface: 'charcoal' },
        ],
        camera: {
          moves: [
            { at: at('2024年でおよそ60兆円'), zoom: 1.05, x: -42, y: 10, dur: 0.6 },
            { at: at('45パーセント'), zoom: 1, x: 0, y: 0, dur: 0.3 },
            { at: at('ところが残りの98パーセント'), zoom: 1.05, x: -55, y: 16, dur: 0.65 },
            { at: at('3億5000万人'), zoom: 1, x: 0, y: 0, dur: 0.25 },
            { at: at('売上の半分以上'), zoom: 1.07, x: -48, y: -20, dur: 0.55 },
          ],
          shakes: [at('2024年でおよそ60兆円'), at('売上の半分以上')],
          shakeAmp: 11,
        },
        beats: [
          hit(at('世界の高級ブランド市場'), 'paper_snap', { id: 'cork_in', gain: 0.24 }),
          hit(at('2024年でおよそ60兆円'), 'chart_tick', { id: 'market_60t', gain: 0.26 }),
          hit(at('45パーセント'), 'mech_slide', { id: 'board_in', gain: 0.26 }),
          hit(at('上位わずか2パーセント'), 'pen_scratch', { id: 'slit_2pct', gain: 0.24 }),
          hit(at('ところが残りの98パーセント'), 'whoosh', { id: 'wall_98pct', gain: 0.26 }),
          hit(at('3億5000万人'), 'projector_click', { id: 'chalk_flip', gain: 0.26 }),
          hit(at('背伸びして買う人たち'), 'camera_shutter', { id: 'crowd_snap', gain: 0.22 }),
          hit(at('売上の半分以上'), 'stamp_thud', { id: 'half_stamp', gain: 0.3 }),
        ],
        backdrop: scene3Backdrop,
        render: scene3Render,
      },
      {
        id: 'margin_cash_machine_and_price_surge',
        type: 'custom',
        start: at('その背伸びの代金'),
        surface: 'dark_broll',
        surfaceShifts: [
          { at: at('ルイ・ヴィトン'), surface: 'paper' },
          { at: at('しかも値札は上がり続け'), surface: 'dark_desk' },
        ],
        camera: {
          moves: [
            { at: at('どこへ行くのか'), zoom: 1.07, x: -50, y: 0, dur: 0.65 },
            { at: at('ルイ・ヴィトン'), zoom: 1, x: 0, y: 0, dur: 0.3 },
            { at: at('営業利益率が37.1パーセント'), zoom: 1.05, x: -45, y: 24, dur: 0.6 },
            { at: at('100円売れるたびに'), zoom: 1.04, x: 38, y: -32, dur: 0.55 },
            { at: at('普通のアパレルの数倍'), zoom: 1.05, x: -42, y: -32, dur: 0.55 },
            { at: at('しかも値札は上がり続け'), zoom: 1, x: 0, y: 0, dur: 0.3 },
            { at: at('日本では160万円'), zoom: 1.03, x: -18, y: -6, dur: 0.7 },
          ],
          shakes: [at('営業利益率が37.1パーセント'), at('5年でほぼ2倍'), at('日本では160万円')],
          shakeAmp: 12,
        },
        beats: [
          hit(at('その背伸びの代金'), 'whoosh', { id: 'cash_in', gain: 0.24 }),
          hit(at('どこへ行くのか'), 'paper_snap', { id: 'where_card', gain: 0.25 }),
          hit(at('ルイ・ヴィトン'), 'paper_snap', { id: 'report_drop', gain: 0.26 }),
          hit(at('営業利益率が37.1パーセント'), 'price_ping', { id: 'margin_hit', gain: 0.28 }),
          hit(at('100円売れるたびに'), 'soft_pop', { id: 'coin_in', gain: 0.26 }),
          hit(at('37円が残る'), 'chart_tick', { id: 'coin_37', gain: 0.24 }),
          hit(at('普通のアパレルの数倍'), 'stamp_thud', { id: 'margin_stamp', gain: 0.28 }),
          hit(at('しかも値札は上がり続け'), 'whoosh', { id: 'desk_return', gain: 0.25 }),
          hit(at('シャネルの定番バッグ'), 'paper_snap', { id: 'old_price', gain: 0.24 }),
          hit(at('5年でほぼ2倍'), 'stamp_thud', { id: 'double_stamp', gain: 0.28 }),
          hit(at('日本では160万円'), 'price_ping', { id: 'final_tag', gain: 0.3 }),
        ],
        backdrop: scene4Backdrop,
        render: scene4Render,
      },
    ],
  };
}

export const LUXURY_TRAP_V31_NEON_HIGH_INPUT = createLuxuryTrapV31NeonHighInput();

export function buildLuxuryTrapV31NeonHighSpec(base: PlanETimelineBase = BASE_TIMELINE) {
  return definePlanESpec(base, LUXURY_TRAP_V31_NEON_HIGH_INPUT);
}

export const SPEC = buildLuxuryTrapV31NeonHighSpec();

export const ABLuxuryTrapV31NeonHigh: React.FC = () => <PlanEMacroEconTemplate spec={SPEC} />;
