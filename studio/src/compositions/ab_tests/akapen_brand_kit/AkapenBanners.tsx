import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AKAPEN, RedPenGlyph, akapenLoopPath, usePlanEFonts } from '../../../components/plan_e';
import { FONT_ECON_SANS } from '../../../components/plan_e/fonts';
import { FONT_HAND } from '../../../components/common/fonts';

/**
 * ch2「経済の赤ペン」YouTube チャンネルバナー比較案（2560x1440・PNG）。
 * - A articleStrip : 【採用】公式アイコン C2 を横に開いた「机に置いた記事片」。見出し＋赤の二重線＋赤ペン（タグラインなし）
 * - B redStroke    : デスクトップ帯を端から端まで貫く太い朱の一筆。被写界深度で奥の資料をぼかす
 * - C proofSheet   : 全面の新聞紙面に赤入れ（二重線訂正・丸囲み・書き込み）。中央の囲み記事に名前
 * どの案も 名前・赤ペン（B/C はタグラインも）を全デバイス共通のセーフエリア（中央 1546x423）に収める。
 */
export type AkapenBannerVariant = 'articleStrip' | 'redStroke' | 'proofSheet';

export const AKAPEN_BANNER_VARIANTS: readonly AkapenBannerVariant[] = ['articleStrip', 'redStroke', 'proofSheet'];
export const AKAPEN_BANNER_CODES: Record<AkapenBannerVariant, string> = {
  articleStrip: 'A-ArticleStrip',
  redStroke: 'B-RedStroke',
  proofSheet: 'C-ProofSheet',
};
export const AKAPEN_BANNER_LABELS: Record<AkapenBannerVariant, string> = {
  articleStrip: '案A 記事帯',
  redStroke: '案B 朱一閃',
  proofSheet: '案C 校正紙',
};

export const BANNER_W = 2560;
export const BANNER_H = 1440;
type Box = { x: number; y: number; w: number; h: number };
export const BANNER_TV: Box = { x: 0, y: 0, w: BANNER_W, h: BANNER_H };
export const BANNER_DESKTOP: Box = { x: 0, y: 508.5, w: BANNER_W, h: 423 };
export const BANNER_SAFE: Box = { x: 507, y: 508.5, w: 1546, h: 423 };

const TAGLINE = '世の中の「お金の仕組み」に、赤を入れる。';
const SLIP = '#E4DED1';

/* ------------------------------------------------------------------ 小道具 */

const hash = (n: number): number => {
  const s = Math.sin(n * 12.9898 + 4.1) * 43758.5453;
  return s - Math.floor(s);
};

/** 手の揺れを含む弓なりの線 */
const bowPath = (x1: number, y1: number, x2: number, y2: number, bow: number, seed: number, n = 28): string => {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const w = (hash(seed + i * 0.61) - 0.5) * 2.6;
    const x = x1 + (x2 - x1) * u;
    const y = y1 + (y2 - y1) * u - Math.sin(u * Math.PI) * bow + w;
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M ${pts.join(' L ')}`;
};

type Ids = { grain: string; marker: string; rough: string; blur: string; desk: string; lamp: string; vignette: string };
const idsOf = (p: string): Ids => ({
  grain: `${p}-grain`,
  marker: `${p}-marker`,
  rough: `${p}-rough`,
  blur: `${p}-blur`,
  desk: `${p}-desk`,
  lamp: `${p}-lamp`,
  vignette: `${p}-vig`,
});

/** 全フィルタを画面座標で定義（細い水平線でも bbox で太さが削れない） */
const Defs: React.FC<{ ids: Ids; deskCx?: string; deskCy?: string }> = ({ ids, deskCx = '50%', deskCy = '46%' }) => (
  <defs>
    <filter id={ids.grain} filterUnits="userSpaceOnUse" x={0} y={0} width={BANNER_W} height={BANNER_H}>
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={11} result="g" />
      <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.32" />
    </filter>
    <filter id={ids.marker} filterUnits="userSpaceOnUse" x={-200} y={-200} width={BANNER_W + 400} height={BANNER_H + 400}>
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={7} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={7} xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <filter id={ids.rough} filterUnits="userSpaceOnUse" x={-200} y={-200} width={BANNER_W + 400} height={BANNER_H + 400}>
      <feTurbulence type="fractalNoise" baseFrequency="0.022 0.06" numOctaves={3} seed={5} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={22} xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <filter id={ids.blur} filterUnits="userSpaceOnUse" x={-200} y={-200} width={BANNER_W + 400} height={BANNER_H + 400}>
      <feGaussianBlur stdDeviation="9" />
    </filter>
    <radialGradient id={ids.desk} cx={deskCx} cy={deskCy} r="70%">
      <stop offset="0%" stopColor="#2B241D" />
      <stop offset="55%" stopColor={AKAPEN.desk} />
      <stop offset="100%" stopColor={AKAPEN.deskDeep} />
    </radialGradient>
    <radialGradient id={ids.lamp} cx="42%" cy="40%" r="48%">
      <stop offset="0%" stopColor="rgba(255, 214, 160, 0.10)" />
      <stop offset="100%" stopColor="rgba(255, 214, 160, 0)" />
    </radialGradient>
    <radialGradient id={ids.vignette} cx="50%" cy="50%" r="75%">
      <stop offset="60%" stopColor="rgba(0,0,0,0)" />
      <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
    </radialGradient>
  </defs>
);

/** アイコン C2 の机（放射グラデ＋木目の筋＋ランプ＋粒子）を 2560x1440 へ */
const Desk: React.FC<{ ids: Ids }> = ({ ids }) => (
  <>
    <rect width={BANNER_W} height={BANNER_H} fill={`url(#${ids.desk})`} />
    {Array.from({ length: 8 }, (_, i) => (
      <path
        key={i}
        d={`M -40 ${90 + i * 185} C 800 ${60 + i * 195}, 1700 ${140 + i * 175}, 2600 ${80 + i * 190}`}
        stroke="rgba(0,0,0,0.22)"
        strokeWidth={5}
        fill="none"
      />
    ))}
    <rect width={BANNER_W} height={BANNER_H} fill={`url(#${ids.lamp})`} />
    <rect width={BANNER_W} height={BANNER_H} filter={`url(#${ids.grain})`} opacity={0.5} />
  </>
);

/** 本文の行（灰の帯） */
const TextLines: React.FC<{ x: number; y: number; w: number; n: number; seed: number; gap?: number; h?: number; opacity?: number }> = ({
  x,
  y,
  w,
  n,
  seed,
  gap = 34,
  h = 14,
  opacity = 0.3,
}) => (
  <g fill={AKAPEN.ink} opacity={opacity}>
    {Array.from({ length: n }, (_, i) => {
      const last = i === n - 1;
      const ww = last ? w * (0.35 + hash(seed + i) * 0.3) : w * (0.86 + hash(seed + i) * 0.14);
      return <rect key={i} x={x} y={y + i * gap} width={ww} height={h} />;
    })}
  </g>
);

/** 墨の小さな棒グラフ（基線つき） */
const MiniBars: React.FC<{ x: number; y: number; w: number; h: number; values: number[] }> = ({ x, y, w, h, values }) => {
  const bw = (w / values.length) * 0.62;
  const step = w / values.length;
  return (
    <g>
      <rect x={x - 8} y={y + h} width={w + 16} height={4} fill={AKAPEN.ink} opacity={0.75} />
      {values.map((v, i) => (
        <rect key={i} x={x + i * step + (step - bw) / 2} y={y + h - h * v} width={bw} height={h * v} fill={AKAPEN.ink} opacity={0.62} />
      ))}
    </g>
  );
};

/** 机に置いた資料片（新聞寄りの生成り色）。中心回転 */
const Slip: React.FC<{ ids: Ids; x: number; y: number; w: number; h: number; rot: number; children?: React.ReactNode }> = ({
  ids,
  x,
  y,
  w,
  h,
  rot,
  children,
}) => (
  <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
    <rect x={x} y={y} width={w} height={h} fill="rgba(0,0,0,0.5)" transform="translate(18 24)" />
    <rect x={x} y={y} width={w} height={h} fill={SLIP} />
    <rect x={x} y={y} width={w} height={h} filter={`url(#${ids.grain})`} opacity={0.28} />
    {children}
  </g>
);

const RedLoop: React.FC<{ ids: Ids; cx: number; cy: number; rx: number; ry: number; rot?: number; seed?: number; width?: number }> = ({
  ids,
  cx,
  cy,
  rx,
  ry,
  rot = -8,
  seed = 3,
  width = 14,
}) => (
  <path
    d={akapenLoopPath(cx, cy, rx, ry, rot, seed)}
    fill="none"
    stroke={AKAPEN.red}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    filter={`url(#${ids.marker})`}
  />
);

const RedStrike: React.FC<{ ids: Ids; x: number; y: number; w: number; gap?: number; width?: number; seed?: number }> = ({
  ids,
  x,
  y,
  w,
  gap = 16,
  width = 9,
  seed = 31,
}) => (
  <g filter={`url(#${ids.marker})`} stroke={AKAPEN.red} strokeWidth={width} strokeLinecap="round" fill="none">
    <path d={bowPath(x, y - gap / 2, x + w, y - gap / 2 - 4, 3, seed, 10)} />
    <path d={bowPath(x + 6, y + gap / 2, x + w + 4, y + gap / 2 - 3, 3, seed + 5, 10)} />
  </g>
);

const RedCheck: React.FC<{ ids: Ids; x: number; y: number; s?: number; width?: number }> = ({ ids, x, y, s = 1, width = 13 }) => (
  <path
    d={`M ${x} ${y} L ${x + 26 * s} ${y + 34 * s} L ${x + 86 * s} ${y - 46 * s}`}
    fill="none"
    stroke={AKAPEN.red}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    filter={`url(#${ids.marker})`}
  />
);

const RedNote: React.FC<{ x: number; y: number; size: number; rot?: number; anchor?: 'start' | 'middle' | 'end'; children: string }> = ({
  x,
  y,
  size,
  rot = -4,
  anchor = 'start',
  children,
}) => (
  <text
    x={x}
    y={y}
    transform={`rotate(${rot} ${x} ${y})`}
    fontFamily={FONT_HAND}
    fontSize={size}
    fill={AKAPEN.red}
    stroke={AKAPEN.red}
    strokeWidth={size * 0.035}
    textAnchor={anchor}
    dominantBaseline="middle"
  >
    {children}
  </text>
);

/** 着弾の放射ティック（アイキャッチと同じ「赤ペンの短い払い」） */
const Ticks: React.FC<{ ids: Ids; x: number; y: number; r0: number; r1: number; angles: number[]; color?: string; width?: number }> = ({
  ids,
  x,
  y,
  r0,
  r1,
  angles,
  color = AKAPEN.red,
  width = 12,
}) => (
  <g stroke={color} strokeWidth={width} strokeLinecap="round" filter={`url(#${ids.marker})`}>
    {angles.map((a) => {
      const r = (a * Math.PI) / 180;
      return <line key={a} x1={x + Math.cos(r) * r0} y1={y + Math.sin(r) * r0} x2={x + Math.cos(r) * r1} y2={y + Math.sin(r) * r1} />;
    })}
  </g>
);

/* ------------------------------------------------------------------ 案A 記事帯 */

const ArticleStrip: React.FC<{ ids: Ids }> = ({ ids }) => {
  // 採用版（タグラインなし）：見出し＋二重線の塊をセーフエリア（中央 1546x423）の上下中央・左右中央へ
  const headX = 616;
  const headY = 660;
  const u1 = bowPath(592, 806, 1968, 796, 9, 21);
  const u2 = bowPath(656, 868, 1712, 858, 6, 27);
  return (
    <>
      <Desk ids={ids} />
      {/* TV で見える奥の資料片 */}
      <Slip ids={ids} x={40} y={-120} w={560} h={420} rot={7}>
        <rect x={90} y={-60} width={340} height={30} fill={AKAPEN.ink} opacity={0.8} />
        <MiniBars x={110} y={10} w={380} h={190} values={[0.35, 0.5, 0.42, 0.9, 0.6]} />
        <RedLoop ids={ids} cx={392} cy={90} rx={62} ry={130} rot={4} seed={9} width={13} />
      </Slip>
      <Slip ids={ids} x={1960} y={1090} w={640} h={460} rot={-6}>
        <rect x={2010} y={1140} width={420} height={30} fill={AKAPEN.ink} opacity={0.8} />
        <TextLines x={2010} y={1200} w={520} n={6} seed={41} />
        <RedStrike ids={ids} x={2010} y={1255} w={360} />
      </Slip>
      <Slip ids={ids} x={-90} y={1130} w={520} h={380} rot={-11}>
        <TextLines x={-40} y={1180} w={420} n={7} seed={61} />
        <RedCheck ids={ids} x={290} y={1260} />
      </Slip>
      <rect width={BANNER_W} height={BANNER_H} fill={`url(#${ids.vignette})`} />

      {/* 主役の記事帯（C2 アイコンの紙片を横に開いたもの） */}
      <g transform="rotate(-1 1280 720)">
        <rect x={250} y={402} width={2060} height={640} fill="rgba(0,0,0,0.5)" transform="translate(20 28)" />
        <rect x={250} y={402} width={2060} height={640} fill={SLIP} />
        <rect x={250} y={402} width={2060} height={640} filter={`url(#${ids.grain})`} opacity={0.28} />
        {/* 紙面上部の罫（TV で見える） */}
        <rect x={300} y={446} width={1960} height={7} fill={AKAPEN.ink} />
        <rect x={300} y={460} width={1960} height={2} fill={AKAPEN.ink} />
        {/* 左の袖：棒グラフに赤丸 */}
        <MiniBars x={300} y={566} w={170} h={170} values={[0.3, 0.45, 0.95, 0.55]} />
        <RedLoop ids={ids} cx={407} cy={606} rx={42} ry={86} rot={3} seed={5} width={10} />
        <TextLines x={300} y={790} w={170} n={4} seed={3} gap={30} h={12} />
        {/* 右の袖：本文と赤入れ */}
        <TextLines x={2090} y={540} w={170} n={11} seed={17} gap={30} h={12} />
        <RedStrike ids={ids} x={2090} y={636} w={130} gap={12} width={7} />
        <RedNote x={2110} y={600} size={40} rot={-8}>
          逆では？
        </RedNote>
        {/* 紙面下部の本文（TV で見える） */}
        {[300, 790, 1280, 1770].map((x, i) => (
          <TextLines key={x} x={x} y={952} w={440} n={3} seed={70 + i * 7} gap={32} h={13} />
        ))}

        {/* 名前・二重線・赤ペン（セーフエリア内） */}
        <text
          x={headX}
          y={headY}
          fontFamily={FONT_ECON_SANS}
          fontWeight={900}
          fontSize={226}
          letterSpacing={-2}
          fill={AKAPEN.ink}
          dominantBaseline="middle"
        >
          経済の<tspan fill={AKAPEN.red}>赤ペン</tspan>
        </text>
        <g filter={`url(#${ids.marker})`} fill="none" stroke={AKAPEN.red} strokeWidth={50} strokeLinecap="round">
          <path d={u1} />
          <path d={u2} />
        </g>
        <g transform="translate(1712 858) rotate(30)">
          <RedPenGlyph length={760} thick={124} />
        </g>
      </g>
    </>
  );
};

/* ------------------------------------------------------------------ 案B 朱一閃 */

const RedStroke: React.FC<{ ids: Ids }> = ({ ids }) => {
  const tipX = 1716;
  const tipY = 712;
  const stroke = bowPath(-160, 724, tipX, 712, 14, 11, 36);
  return (
    <>
      <Desk ids={ids} />
      <rect width={BANNER_W} height={BANNER_H} fill="rgba(0,0,0,0.22)" />
      {/* 奥の資料（被写界深度でぼかす。TV で見える） */}
      <g filter={`url(#${ids.blur})`} opacity={0.62}>
        <Slip ids={ids} x={120} y={-90} w={760} h={440} rot={-5}>
          <rect x={170} y={-30} width={460} height={34} fill={AKAPEN.ink} />
          <MiniBars x={190} y={70} w={520} h={200} values={[0.4, 0.62, 0.5, 0.82, 0.3, 0.95]} />
          <RedLoop ids={ids} cx={658} cy={150} rx={56} ry={150} rot={3} seed={6} width={16} />
        </Slip>
        <Slip ids={ids} x={1700} y={1070} w={760} h={460} rot={6}>
          <rect x={1750} y={1120} width={480} height={34} fill={AKAPEN.ink} />
          <TextLines x={1750} y={1190} w={640} n={7} seed={13} />
          <RedStrike ids={ids} x={1750} y={1259} w={420} />
          <RedCheck ids={ids} x={2290} y={1330} s={1.3} />
        </Slip>
        <Slip ids={ids} x={2060} y={-60} w={560} h={360} rot={9}>
          <TextLines x={2110} y={0} w={440} n={7} seed={29} />
        </Slip>
      </g>
      <rect width={BANNER_W} height={BANNER_H} fill={`url(#${ids.vignette})`} />

      {/* 端から端へ貫く太い朱の一筆（毛筋つき） */}
      <g filter={`url(#${ids.rough})`}>
        <path d={stroke} fill="none" stroke={AKAPEN.red} strokeWidth={282} strokeLinecap="round" />
      </g>
      <g filter={`url(#${ids.marker})`} fill="none" strokeLinecap="round">
        {[
          [-92, AKAPEN.redHi, 0.45, 10],
          [-60, AKAPEN.redHi, 0.3, 6],
          [70, AKAPEN.redDeep, 0.5, 14],
          [104, AKAPEN.redDeep, 0.6, 9],
          [-118, AKAPEN.redDeep, 0.35, 5],
        ].map(([dy, c, o, w], i) => (
          <path
            key={i}
            d={bowPath(-160, 724 + (dy as number), tipX - 120 - i * 40, 712 + (dy as number), 14, 40 + i * 3, 36)}
            stroke={c as string}
            strokeWidth={w as number}
            opacity={o as number}
          />
        ))}
      </g>

      {/* 名前（朱の上）とタグライン（帯の下） */}
      <text
        x={590}
        y={712}
        fontFamily={FONT_ECON_SANS}
        fontWeight={900}
        fontSize={180}
        letterSpacing={-1}
        fill={AKAPEN.white}
        dominantBaseline="middle"
      >
        経済の<tspan fill={AKAPEN.ink}>赤ペン</tspan>
      </text>
      <text
        x={596}
        y={900}
        fontFamily={FONT_ECON_SANS}
        fontWeight={900}
        fontSize={48}
        letterSpacing={3}
        fill={AKAPEN.white}
        opacity={0.92}
        dominantBaseline="middle"
      >
        {TAGLINE}
      </text>
      <Ticks ids={ids} x={tipX + 10} y={tipY - 40} r0={150} r1={210} angles={[-112, -88, -64]} />

      {/* 一筆を引き終えた赤ペン（太い芯の大判マーカー） */}
      <g transform={`translate(${tipX} ${tipY}) rotate(36)`}>
        <RedPenGlyph length={1200} thick={190} />
      </g>
    </>
  );
};

/* ------------------------------------------------------------------ 案C 校正紙 */

const COLS = [80, 486, 892, 1298, 1704, 2110];
const COL_W = 370;

const ProofSheet: React.FC<{ ids: Ids }> = ({ ids }) => {
  const boxX = 484;
  const boxY = 524;
  const boxW = 1592;
  const boxH = 392;
  const headCx = 1240;
  return (
    <>
      <rect width={BANNER_W} height={BANNER_H} fill={SLIP} />
      <rect width={BANNER_W} height={BANNER_H} filter={`url(#${ids.grain})`} opacity={0.34} />
      <rect width={BANNER_W} height={BANNER_H} fill={`url(#${ids.vignette})`} opacity={0.5} />

      {/* 上段（TV で見える）：題字罫・見出し・本文・赤入れ */}
      <rect x={80} y={64} width={2400} height={9} fill={AKAPEN.ink} />
      <rect x={80} y={80} width={2400} height={3} fill={AKAPEN.ink} />
      {COLS.map((x, i) => (
        <React.Fragment key={x}>
          <rect x={x} y={130} width={COL_W * (0.7 + hash(i + 2) * 0.28)} height={36} fill={AKAPEN.ink} opacity={0.85} />
          <TextLines x={x} y={196} w={COL_W} n={i === 1 || i === 4 ? 3 : 8} seed={100 + i * 9} />
        </React.Fragment>
      ))}
      {/* 列2：数字の二重線訂正 */}
      <text x={486} y={352} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={96} fill={AKAPEN.ink} dominantBaseline="middle">
        +3.2%
      </text>
      <RedStrike ids={ids} x={480} y={352} w={290} gap={22} width={11} />
      <RedNote x={640} y={442} size={58} rot={-5}>
        実質は −0.8%
      </RedNote>
      {/* 列5：グラフに丸 */}
      <MiniBars x={1724} y={300} w={330} h={150} values={[0.3, 0.42, 0.38, 0.55, 0.98]} />
      <RedLoop ids={ids} cx={1996} cy={340} rx={50} ry={112} rot={4} seed={8} width={12} />
      <RedNote x={1880} y={262} size={50} rot={-6} anchor="end">
        ここだけ？
      </RedNote>

      {/* 中段の袖（デスクトップ帯で見える） */}
      <TextLines x={80} y={540} w={COL_W} n={11} seed={201} />
      <RedStrike ids={ids} x={80} y={642} w={250} gap={13} width={8} />
      <RedNote x={150} y={606} size={44} rot={-7}>
        誰が得する？
      </RedNote>
      <TextLines x={2110} y={540} w={COL_W} n={11} seed={233} />
      <RedLoop ids={ids} cx={2230} cy={778} rx={130} ry={40} rot={-3} seed={12} width={9} />
      <RedCheck ids={ids} x={2370} y={880} s={0.9} width={11} />

      {/* 下段（TV で見える） */}
      <rect x={80} y={966} width={2400} height={3} fill={AKAPEN.ink} />
      {COLS.map((x, i) => (
        <React.Fragment key={`b${x}`}>
          <rect x={x} y={1004} width={COL_W * (0.55 + hash(i + 9) * 0.4)} height={32} fill={AKAPEN.ink} opacity={0.85} />
          <TextLines x={x} y={1066} w={COL_W} n={i === 3 ? 3 : 9} seed={300 + i * 11} />
        </React.Fragment>
      ))}
      <text x={1298} y={1228} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={84} fill={AKAPEN.ink} dominantBaseline="middle">
        金利 0.5%
      </text>
      <RedLoop ids={ids} cx={1500} cy={1228} rx={210} ry={70} rot={-4} seed={15} width={12} />
      <RedNote x={1300} y={1340} size={54} rot={-4}>
        住宅ローンへの効き方は？
      </RedNote>
      <RedCheck ids={ids} x={560} y={1330} s={1.1} />

      {/* 囲み記事（セーフエリア）：名前・丸囲み・赤ペン・手書きのタグライン */}
      <rect x={boxX} y={boxY} width={boxW} height={boxH} fill={SLIP} />
      <rect x={boxX} y={boxY} width={boxW} height={boxH} fill="none" stroke={AKAPEN.ink} strokeWidth={6} />
      <rect x={boxX + 12} y={boxY + 12} width={boxW - 24} height={boxH - 24} fill="none" stroke={AKAPEN.ink} strokeWidth={2} />
      <text
        x={headCx}
        y={676}
        textAnchor="middle"
        fontFamily={FONT_ECON_SANS}
        fontWeight={900}
        fontSize={200}
        letterSpacing={-2}
        fill={AKAPEN.ink}
        dominantBaseline="middle"
      >
        経済の<tspan fill={AKAPEN.red}>赤ペン</tspan>
      </text>
      <RedLoop ids={ids} cx={1546} cy={668} rx={322} ry={108} rot={-3} seed={3} width={18} />
      <RedNote x={headCx - 40} y={868} size={60} rot={-1.5} anchor="middle">
        {TAGLINE}
      </RedNote>
      <g transform="translate(1900 778) rotate(32)">
        <RedPenGlyph length={760} thick={112} />
      </g>
    </>
  );
};

/* ------------------------------------------------------------------ 本体 */

export interface AkapenBannerProps {
  variant: AkapenBannerVariant;
  /** 同一画面に複数並べるときの SVG id 衝突回避 */
  idPrefix?: string;
  /** 切り出す範囲（バナー座標）。既定は全体 */
  view?: Box;
  width?: number;
  height?: number;
  /** デスクトップ帯（破線）とセーフエリア（実線）の補助線 */
  guides?: boolean;
}

export const AkapenBanner: React.FC<AkapenBannerProps> = ({ variant, idPrefix = `bn-${variant}`, view = BANNER_TV, width, height, guides = false }) => {
  const ids = idsOf(idPrefix);
  const w = width ?? view.w;
  const h = height ?? (w * view.h) / view.w;
  return (
    <svg width={w} height={h} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} style={{ display: 'block' }}>
      <Defs ids={ids} />
      {variant === 'articleStrip' ? <ArticleStrip ids={ids} /> : null}
      {variant === 'redStroke' ? <RedStroke ids={ids} /> : null}
      {variant === 'proofSheet' ? <ProofSheet ids={ids} /> : null}
      {guides ? (
        <g fill="none" stroke="#00B4D8" strokeWidth={view.w / 400}>
          <rect x={BANNER_DESKTOP.x} y={BANNER_DESKTOP.y} width={BANNER_DESKTOP.w} height={BANNER_DESKTOP.h} strokeDasharray={`${view.w / 90} ${view.w / 140}`} />
          <rect x={BANNER_SAFE.x} y={BANNER_SAFE.y} width={BANNER_SAFE.w} height={BANNER_SAFE.h} />
        </g>
      ) : null}
    </svg>
  );
};

/* ------------------------------------------------------------------ Still 用 */

export const AkapenBannerStill: React.FC<{ variant: AkapenBannerVariant }> = ({ variant }) => {
  const ready = usePlanEFonts();
  return <AbsoluteFill style={{ backgroundColor: '#000' }}>{ready ? <AkapenBanner variant={variant} /> : null}</AbsoluteFill>;
};

const SHEET_BG = '#1B1B1D';
const Label: React.FC<{ children: React.ReactNode; size?: number; dim?: boolean }> = ({ children, size = 30, dim = false }) => (
  <div style={{ fontFamily: FONT_ECON_SANS, fontWeight: 700, fontSize: size, color: dim ? '#9A9AA0' : '#F2F2F2', marginBottom: 14, lineHeight: 1.2 }}>
    {children}
  </div>
);

export const AKAPEN_BANNER_SHEET = { width: 2400, height: 1420 } as const;

/** 1 案のスマホ／デスクトップ／TV 3 クロップ確認シート */
export const AkapenBannerSheet: React.FC<{ variant: AkapenBannerVariant }> = ({ variant }) => {
  const ready = usePlanEFonts();
  if (!ready) return <AbsoluteFill style={{ backgroundColor: SHEET_BG }} />;
  const p = (s: string) => `${variant}-${s}`;
  return (
    <AbsoluteFill style={{ backgroundColor: SHEET_BG, padding: '44px 60px' }}>
      <Label size={44}>
        {AKAPEN_BANNER_LABELS[variant]}　<span style={{ color: '#9A9AA0', fontSize: 30 }}>経済の赤ペン チャンネルバナー 2560×1440 ／ 3クロップ確認</span>
      </Label>
      <div style={{ marginTop: 18 }}>
        <Label>デスクトップ（2560×423 帯）</Label>
        <AkapenBanner variant={variant} idPrefix={p('desk')} view={BANNER_DESKTOP} width={2280} />
      </div>
      <div style={{ display: 'flex', gap: 60, marginTop: 40 }}>
        <div>
          <Label>TV（全体 2560×1440）　<span style={{ color: '#7FD3E6' }}>破線＝デスクトップ帯　実線＝セーフエリア</span></Label>
          <AkapenBanner variant={variant} idPrefix={p('tv')} view={BANNER_TV} width={1280} guides />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Label>スマホ（中央 1546×423）</Label>
          <AkapenBanner variant={variant} idPrefix={p('mob')} view={BANNER_SAFE} width={940} />
          <div style={{ marginTop: 48 }}>
            <Label dim>スマホ表示の実寸目安（幅 390px）</Label>
            <div style={{ width: 430, padding: '22px 20px 120px', backgroundColor: '#0F0F0F', borderRadius: 36, border: '3px solid #3A3A3E' }}>
              <div style={{ borderRadius: 12, overflow: 'hidden' }}>
                <AkapenBanner variant={variant} idPrefix={p('mobs')} view={BANNER_SAFE} width={390} />
              </div>
              <div style={{ marginTop: 22, height: 26, width: 220, backgroundColor: '#2A2A2E' }} />
              <div style={{ marginTop: 14, height: 18, width: 300, backgroundColor: '#222226' }} />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const AKAPEN_BANNER_COMPARE = { width: 2400, height: 1000 } as const;

/** 3 案の横並び比較（上段 TV 全体＋補助線、下段 スマホ中央） */
export const AkapenBannerCompare: React.FC = () => {
  const ready = usePlanEFonts();
  if (!ready) return <AbsoluteFill style={{ backgroundColor: SHEET_BG }} />;
  return (
    <AbsoluteFill style={{ backgroundColor: SHEET_BG, padding: '44px 60px' }}>
      <Label size={44}>経済の赤ペン チャンネルバナー 3案比較</Label>
      <div style={{ display: 'flex', gap: 57, marginTop: 24 }}>
        {AKAPEN_BANNER_VARIANTS.map((v) => (
          <div key={v} style={{ width: 742 }}>
            <Label>{AKAPEN_BANNER_LABELS[v]}</Label>
            <AkapenBanner variant={v} idPrefix={`cmp-tv-${v}`} view={BANNER_TV} width={742} guides />
            <div style={{ height: 36 }} />
            <Label dim>スマホ中央</Label>
            <AkapenBanner variant={v} idPrefix={`cmp-mob-${v}`} view={BANNER_SAFE} width={742} />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
