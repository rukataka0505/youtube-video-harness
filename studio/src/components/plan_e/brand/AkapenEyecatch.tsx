import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_ECON_SANS } from '../fonts';
import { hit, shiftAnchor } from '../timeline';
import type { Anchor, PlanEBeatInput, PlanESfxKind } from '../types';
import { clamp01, easeOut, eio, eo, lerp, ramp, rnd, shakeAt, spr, wob } from '../stage/motion';
import { AKAPEN, AkapenFilterDefs, RedPenGlyph, akapenFilterIds } from './akapenInk';
import { AkapenIcon } from './AkapenIcon';
import cues from './akapenCues.json';

/**
 * ch2「経済の赤ペン」公式アイキャッチ／カットイン（3種・各1.3秒・115BPM同期・1920x1080 全面）。
 * コールドオープン直後や章転換に BGM を止めずに差し込む。音は SFX のみ（akapenCues.json が尺と SFX 配置の正本）。
 * 公式アイコン C2（penArticle＝記事×赤二重線）と共通の暗い机・生成り紙片・墨の見出し・太い赤の二重線・赤ペンで構成。
 * - swipe    : 紙片がホイップで滑り込む → 赤ペンが二重線を2連で一閃 → 拍頭で「赤ペン」が朱に反転 → カメラごと左へ振り抜く
 * - pullback : 画面いっぱいの朱（＝二重線の接写）から一気に引くと C2 アイコンが現れ、拍頭で「経済の赤ペン」が叩き込まれる → 朱で抜ける
 * - slit     : 暗転の上を赤ペンが往復して二重線を引き、拍の裏で線の間が裂けて紙面の見出しが開く → 閉じて一本線になり、横へ抜ける
 *
 * 再利用の入口:
 * - `<AkapenEyecatch variant t />`           … 区間ローカル秒 t を渡す純描画（どこにでも置ける）
 * - `<AkapenCutIn variant sec at />`         … 自由舞台 render(ctx) 内で ctx.sec と ctx.cue() の時刻を渡す
 * - `<AkapenEyecatchSequence variant from />` … 通常の Remotion タイムラインへ Sequence で挿す
 * - `akapenEyecatchBeats(variant, anchor)`   … 自由舞台 spec の beats へ同期 SFX を hit() で積む
 */
export type AkapenEyecatchVariant = 'swipe' | 'pullback' | 'slit';

/** 公式採用 3 種（1.3 秒・115BPM 同期） */
export const AKAPEN_EYECATCH_VARIANTS: readonly AkapenEyecatchVariant[] = ['swipe', 'pullback', 'slit'];
export const AKAPEN_EYECATCH_DEFAULT_VARIANT: AkapenEyecatchVariant = 'swipe';
export const AKAPEN_EYECATCH_SEC: number = cues.durationSec;
export const AKAPEN_EYECATCH_FPS: number = cues.fps;
export const AKAPEN_EYECATCH_BPM: number = cues.bpm;
export const AKAPEN_EYECATCH_FRAMES = Math.round(cues.durationSec * cues.fps);

export interface AkapenSfxCue {
  kind: PlanESfxKind;
  offset: number;
  gain: number;
  duration?: number;
  pan?: number;
  pitchStart?: number;
  pitchEnd?: number;
  f0?: number;
  f1?: number;
}

type CueVariant = { label: string; durationSec?: number; sfx: unknown[] };
const cueOf = (variant: AkapenEyecatchVariant): CueVariant =>
  (cues.variants as Record<AkapenEyecatchVariant, CueVariant>)[variant];

/** variant ごとの尺（秒） */
export const akapenEyecatchSec = (variant: AkapenEyecatchVariant = AKAPEN_EYECATCH_DEFAULT_VARIANT): number =>
  cueOf(variant).durationSec ?? cues.durationSec;

/** variant ごとの尺（フレーム） */
export const akapenEyecatchFrames = (
  variant: AkapenEyecatchVariant = AKAPEN_EYECATCH_DEFAULT_VARIANT,
  fps: number = cues.fps,
): number => Math.round(akapenEyecatchSec(variant) * fps);

/** `studio/public/` 相対の書き出し済み公式 SFX パス（staticFile() へ渡す） */
export const akapenEyecatchSfxPath = (variant: AkapenEyecatchVariant = AKAPEN_EYECATCH_DEFAULT_VARIANT): string =>
  `brand/akapen/eyecatch_${variant}_se.wav`;

export const AKAPEN_EYECATCH_LABELS: Record<AkapenEyecatchVariant, string> = {
  swipe: cueOf('swipe').label,
  pullback: cueOf('pullback').label,
  slit: cueOf('slit').label,
};

export const akapenEyecatchSfx = (variant: AkapenEyecatchVariant = AKAPEN_EYECATCH_DEFAULT_VARIANT): readonly AkapenSfxCue[] =>
  cueOf(variant).sfx as AkapenSfxCue[];

/** 自由舞台 spec の beats に積む同期 SFX（anchor = アイキャッチ開始の語句アンカー） */
export const akapenEyecatchBeats = (
  variant: AkapenEyecatchVariant,
  anchor: Anchor,
): PlanEBeatInput[] =>
  akapenEyecatchSfx(variant).map((c, i) =>
    hit(shiftAnchor(anchor, c.offset), c.kind, {
      id: `akapen-${variant}-${i}`,
      gain: c.gain,
      label: `akapen_${variant}`,
    }),
  );

/* ------------------------------------------------------------------ 共通部品 */

const FRAME = 1 / 30;
const expoOut = (u: number): number => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(u)));
const expoIn = (u: number): number => (u <= 0 ? 0 : Math.pow(2, 10 * (clamp01(u) - 1)));
/** 対数補間のズーム倍率（知覚上等速のドリー） */
const logScale = (from: number, to: number, k: number): number => Math.exp(lerp(Math.log(from), Math.log(to), k));
const inkToRed = (u: number): string => {
  const a = [0x14, 0x12, 0x10];
  const b = [0xd3, 0x17, 0x2a];
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], clamp01(u)))).join(',')})`;
};
/** アイコン C2 の紙片色（新聞寄りの生成り） */
const SLIP_PAPER = '#E4DED1';

const markerU = (id: string): string => `url(#${id}-markerU)`;

const camStyle = (x: number, y: number, s: number, rot: number, blur = 0): React.CSSProperties => ({
  transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)}) rotate(${rot.toFixed(3)}deg)`,
  transformOrigin: '960px 540px',
  filter: blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : undefined,
});

/** 折れ線（polyline）の弧長比 u 位置。ペン先を描線の先端に追従させる */
function pointAlong(pts: readonly [number, number][], u: number): [number, number] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let rest = clamp01(u) * total;
  for (let i = 0; i < seg.length; i++) {
    if (rest <= seg[i] || i === seg.length - 1) {
      const k = seg[i] > 0 ? Math.min(1, rest / seg[i]) : 0;
      return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
    }
    rest -= seg[i];
  }
  return pts[pts.length - 1];
}

const toPath = (pts: readonly [number, number][]): string =>
  `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}`;

/** 手の揺れを含む弓なりの線（点列） */
function bowLine(x1: number, y1: number, x2: number, y2: number, bow: number, seed: number, n = 24): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const w = (rnd(seed + i * 0.61) - 0.5) * 2.4;
    pts.push([lerp(x1, x2, u), lerp(y1, y2, u) - Math.sin(u * Math.PI) * bow + w]);
  }
  return pts;
}

const MarkerPath: React.FC<{
  pts: readonly [number, number][];
  p: number;
  width: number;
  color?: string;
  filter?: string;
}> = ({ pts, p, width, color = AKAPEN.red, filter }) =>
  p <= 0 ? null : (
    <g filter={filter}>
      <path
        d={toPath(pts)}
        pathLength={1}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1 1"
        strokeDashoffset={(1 - clamp01(p)).toFixed(4)}
      />
    </g>
  );

/** 速度に比例した方向ブラー（SVG 内で使う。sx/sy が小さいときは呼ばない） */
const DirBlur: React.FC<{ id: string; sx: number; sy?: number }> = ({ id, sx, sy = 0 }) => (
  <filter id={id} x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation={`${Math.max(0, sx).toFixed(1)} ${Math.max(0, sy).toFixed(1)}`} />
  </filter>
);

/** アイコン C2 の机（放射グラデ＋木目の筋＋ランプ＋粒子）を 1920x1080 へ。AkapenFilterDefs もここで定義する */
const DeskPlate: React.FC<{ id: string; style?: React.CSSProperties }> = ({ id, style }) => {
  const ids = akapenFilterIds(id);
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', ...style }}>
      <AkapenFilterDefs prefix={id} />
      <defs>
        <radialGradient id={`${id}-desk`} cx="46%" cy="40%" r="72%">
          <stop offset="0%" stopColor="#2B241D" />
          <stop offset="55%" stopColor={AKAPEN.desk} />
          <stop offset="100%" stopColor={AKAPEN.deskDeep} />
        </radialGradient>
        {/* 水平な線は幾何 bbox が薄く objectBoundingBox の filter 領域だと太さが削れるため、画面座標で領域を取る */}
        <filter id={`${id}-markerU`} filterUnits="userSpaceOnUse" x={-3000} y={-3000} width={8000} height={8000}>
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves={2} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={6} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <radialGradient id={`${id}-lamp`} cx="40%" cy="32%" r="50%">
          <stop offset="0%" stopColor="rgba(255, 214, 160, 0.10)" />
          <stop offset="100%" stopColor="rgba(255, 214, 160, 0)" />
        </radialGradient>
      </defs>
      <rect x={-600} y={-200} width={3120} height={1480} fill={`url(#${id}-desk)`} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path
          key={i}
          d={`M -600 ${110 + i * 180} C 500 ${80 + i * 190}, 1400 ${150 + i * 170}, 2520 ${100 + i * 185}`}
          stroke="rgba(0,0,0,0.22)"
          strokeWidth={4}
          fill="none"
        />
      ))}
      <rect x={-600} y={-200} width={3120} height={1480} fill={`url(#${id}-lamp)`} />
      <rect x={-600} y={-200} width={3120} height={1480} filter={`url(#${ids.grain})`} opacity={0.5} />
    </svg>
  );
};

/* ---------- 記事の紙片（アイコン C2 を 16:9 に開いたもの。原点＝紙片左上） */

const ART_W = 1240;
const ART_H = 700;
/** 1 本目（見出しの下、長い）・2 本目（少し内側から始まり手前で止まる）。アイコン C2 の u1/u2 と同じ関係 */
const ART_U1 = bowLine(78, 364, 1132, 354, 9, 21, 22);
const ART_U2 = bowLine(134, 456, 1020, 448, 6, 27, 22);
const ART_LINE_W = 78;
const ART_HEAD_SIZE = 178;
const ART_HEAD_X = 86;
const ART_HEAD_Y = 210;

const ArticleSlip: React.FC<{ id: string; u1: number; u2: number; red: number; pop: number }> = ({ id, u1, u2, red, pop }) => {
  const ids = akapenFilterIds(id);
  const step = ART_HEAD_SIZE - 2;
  const akaX = ART_HEAD_X + step * 3;
  const akaCx = akaX + step * 1.5;
  return (
    <g>
      <rect x={0} y={0} width={ART_W} height={ART_H} fill="rgba(0,0,0,0.5)" transform="translate(18 24)" />
      <rect x={0} y={0} width={ART_W} height={ART_H} fill={SLIP_PAPER} />
      <rect x={0} y={0} width={ART_W} height={ART_H} filter={`url(#${ids.grain})`} opacity={0.28} />
      <rect x={64} y={44} width={ART_W - 128} height={7} fill={AKAPEN.ink} />
      <rect x={64} y={58} width={ART_W - 128} height={2} fill={AKAPEN.ink} />
      <text x={ART_HEAD_X} y={ART_HEAD_Y} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={ART_HEAD_SIZE} letterSpacing={-2} fill={AKAPEN.ink} dominantBaseline="middle">
        経済の
      </text>
      <g transform={`translate(${akaCx} ${ART_HEAD_Y}) scale(${pop.toFixed(4)}) translate(${-akaCx} ${-ART_HEAD_Y})`}>
        <text x={akaX} y={ART_HEAD_Y} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={ART_HEAD_SIZE} letterSpacing={-2} fill={inkToRed(red)} dominantBaseline="middle">
          赤ペン
        </text>
      </g>
      <g fill={AKAPEN.ink} opacity={0.3}>
        {Array.from({ length: 4 }, (_, i) => (
          <React.Fragment key={i}>
            <rect x={ART_HEAD_X} y={540 + i * 38} width={470 - ((i * 41) % 90)} height={17} />
            <rect x={650} y={540 + i * 38} width={500 - ((i * 59) % 120)} height={17} />
          </React.Fragment>
        ))}
      </g>
      <MarkerPath pts={ART_U1} p={u1} width={ART_LINE_W} filter={markerU(id)} />
      <MarkerPath pts={ART_U2} p={u2} width={ART_LINE_W} filter={markerU(id)} />
    </g>
  );
};

/** 着弾の放射ティック（マンガの強調線を赤ペンの短い払いで） */
const HitTicks: React.FC<{ x: number; y: number; t: number; at: number; angles: readonly number[]; r0?: number; r1?: number; width?: number }> = ({
  x,
  y,
  t,
  at,
  angles,
  r0 = 54,
  r1 = 150,
  width = 10,
}) => {
  if (t < at || t > at + 0.24) return null;
  const grow = eo(t, at, 0.1);
  const fade = 1 - ramp(t, at + 0.1, 0.14);
  return (
    <g stroke={AKAPEN.red} strokeWidth={width} strokeLinecap="round" opacity={fade}>
      {angles.map((deg, i) => {
        const a = (deg * Math.PI) / 180;
        const near = lerp(r0, r0 + 40, grow);
        const far = lerp(r0 + 6, r1, grow);
        return <line key={i} x1={x + Math.cos(a) * near} y1={y + Math.sin(a) * near} x2={x + Math.cos(a) * far} y2={y + Math.sin(a) * far} />;
      })}
    </g>
  );
};

/* ------------------------------------------------------------------ swipe（二連スワイプ） */

const SW = { snap: 0.12, s1: 0.22, s2: 0.4, stroke: 0.12, hit: 0.52, out: 1.05, outDur: 0.22 } as const;
const SW_SCALE = 1.12;

const swipeSlipX = (t: number): number => {
  if (t < 0) return 2300;
  const inX = lerp(1500, 0, expoOut(ramp(t, 0, 0.2)));
  const settle = wob(t, SW.snap, -16, 3.4, 10);
  const outX = -2700 * Math.pow(ramp(t, SW.out, SW.outDur), 2.4);
  return inX + settle + outX;
};

/** ペン先（紙片ローカル座標） */
const swipePenTip = (t: number): [number, number] => {
  const a1 = ART_U1[0];
  const e1 = ART_U1[ART_U1.length - 1];
  const a2 = ART_U2[0];
  if (t < SW.s1) {
    const u = eo(t, 0.06, SW.s1 - 0.06);
    return [lerp(-520, a1[0], u), lerp(1060, a1[1], u)];
  }
  if (t < SW.s1 + SW.stroke) return pointAlong(ART_U1, eio(t, SW.s1, SW.stroke));
  if (t < SW.s2) {
    const u = eio(t, SW.s1 + SW.stroke, SW.s2 - SW.s1 - SW.stroke);
    return [lerp(e1[0], a2[0], u), lerp(e1[1], a2[1], u) - Math.sin(u * Math.PI) * 70];
  }
  if (t < SW.s2 + SW.stroke) return pointAlong(ART_U2, eio(t, SW.s2, SW.stroke));
  const end = ART_U2[ART_U2.length - 1];
  return [end[0], end[1] + wob(t, SW.hit, 7, 4, 12)];
};

const Swipe: React.FC<{ t: number; id: string }> = ({ t, id }) => {
  const x = swipeSlipX(t);
  const vx = Math.abs(x - swipeSlipX(t - FRAME));
  const slipBlur = Math.min(80, vx * 0.22);
  const rot = lerp(-13, -4, expoOut(ramp(t, 0, 0.2))) + wob(t, SW.snap, 0.9, 3, 8) - 4 * Math.pow(ramp(t, SW.out, SW.outDur), 2);

  const u1 = eio(t, SW.s1, SW.stroke);
  const u2 = eio(t, SW.s2, SW.stroke);
  const red = eo(t, SW.hit, 0.07);
  const pop = t < SW.hit ? 1 : lerp(1.2, 1, spr(t, SW.hit, 30, { stiffness: 620, damping: 17, mass: 0.5 }));

  const tip = swipePenTip(t);
  const prev = swipePenTip(t - FRAME);
  const penV = Math.hypot(tip[0] - prev[0], tip[1] - prev[1]);
  const penBlur = Math.min(40, penV * 0.12);
  const lifted = t >= SW.s1 + SW.stroke && t < SW.s2 ? Math.sin(ramp(t, SW.s1 + SW.stroke, SW.s2 - SW.s1 - SW.stroke) * Math.PI) : 0;
  const penRot = 48 + Math.sin(t * 29) * 1.6 + (t >= SW.s1 && t < SW.s2 + SW.stroke ? -5 : 0);

  const punch = t >= SW.hit ? 0.055 * Math.exp(-13 * (t - SW.hit)) : 0;
  const push = 0.035 * eio(t, SW.hit, 0.6);
  const camS = 1 + punch + push;
  const shake = shakeAt(t, [SW.snap, SW.hit], 9, 13);

  // 振り抜き：机ごと左へ（パララックス 0.35）
  const outU = Math.pow(ramp(t, SW.out, SW.outDur), 2.4);
  const deskX = -950 * outU;
  const deskBlur = Math.min(40, Math.abs(deskX - -950 * Math.pow(ramp(t - FRAME, SW.out, SW.outDur), 2.4)) * 0.3);
  const end2 = ART_U2[ART_U2.length - 1];

  return (
    <AbsoluteFill>
      <DeskPlate id={id} style={{ transform: `translateX(${deskX.toFixed(1)}px)`, filter: deskBlur > 0.5 ? `blur(${deskBlur.toFixed(1)}px)` : undefined }} />
      <AbsoluteFill style={camStyle(shake.x, shake.y, camS, shake.rot)}>
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <defs>
            {slipBlur > 0.5 ? <DirBlur id={`${id}-mb`} sx={slipBlur} sy={slipBlur * 0.06} /> : null}
            {penBlur > 0.5 ? <DirBlur id={`${id}-pb`} sx={penBlur} sy={penBlur * 0.25} /> : null}
          </defs>
          <g
            transform={`translate(${(960 + x).toFixed(1)} 548) scale(${SW_SCALE}) rotate(${rot.toFixed(3)}) translate(${-ART_W / 2} ${-ART_H / 2})`}
            filter={slipBlur > 0.5 ? `url(#${id}-mb)` : undefined}
          >
            <ArticleSlip id={id} u1={u1} u2={u2} red={red} pop={pop} />
            <HitTicks x={end2[0] + 24} y={end2[1] - 10} t={t} at={SW.hit} angles={[-105, -75, -45, -15]} r0={70} r1={210} width={15} />
            {t >= 0.06 ? (
              <g
                transform={`translate(${tip[0].toFixed(1)} ${(tip[1] - lifted * 10).toFixed(1)}) rotate(${penRot.toFixed(2)}) scale(${(1 + lifted * 0.07).toFixed(3)})`}
                filter={penBlur > 0.5 ? `url(#${id}-pb)` : undefined}
              >
                <RedPenGlyph length={780} thick={150} />
              </g>
            ) : null}
          </g>
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ pullback（赤からの引き） */

const PB = { pull: 0.05, pullDur: 0.42, seat: 0.3, word1: 0.46, word2: 0.52, line: 0.64, out: 1.04, outDur: 0.2 } as const;
const PB_ICON = { x: 250, y: 250, d: 580 } as const;
const PB_SCALE = 44;

/** アイコン内座標（1024 正方）→ 画面座標。C2 の紙片は (490,506) 中心に -6° 回っている */
const pbIconPoint = (ix: number, iy: number): [number, number] => {
  const a = (-6 * Math.PI) / 180;
  const dx = ix - 490;
  const dy = iy - 506;
  const rx = 490 + dx * Math.cos(a) - dy * Math.sin(a);
  const ry = 506 + dx * Math.sin(a) + dy * Math.cos(a);
  const k = PB_ICON.d / 1024;
  return [PB_ICON.x + rx * k, PB_ICON.y + ry * k];
};
const PB_FOCUS_IN = pbIconPoint(430, 445);
const PB_FOCUS_OUT = pbIconPoint(450, 523);
const PB_WORD_X = 896;
const PB_AKA = 262;
const PB_LINE = bowLine(PB_WORD_X - 4, 762, PB_WORD_X + PB_AKA * 3 + 10, 752, 7, 33, 20);

const pbCamera = (t: number): { s: number; tx: number; ty: number; rot: number; f: [number, number] } => {
  if (t < PB.out) {
    const k = expoOut(ramp(t, PB.pull, PB.pullDur));
    const f = PB_FOCUS_IN;
    return { s: logScale(PB_SCALE, 1, k), tx: (960 - f[0]) * (1 - k), ty: (540 - f[1]) * (1 - k), rot: 12 * (1 - k), f };
  }
  const k = expoIn(ramp(t, PB.out, PB.outDur));
  const f = PB_FOCUS_OUT;
  return { s: logScale(1, PB_SCALE, k), tx: (960 - f[0]) * k, ty: (540 - f[1]) * k, rot: -7 * k, f };
};

const Pullback: React.FC<{ t: number; id: string }> = ({ t, id }) => {
  const ids = akapenFilterIds(id);
  const cam = pbCamera(t);
  const camPrev = pbCamera(t - FRAME);
  const zoomBlur = Math.min(9, Math.abs(Math.log(cam.s) - Math.log(camPrev.s)) * 9);
  const hold = 1 + 0.028 * eio(t, PB.word2, 0.6);
  const shake = shakeAt(t, [PB.word2], 11, 13);

  const cx = PB_ICON.x + PB_ICON.d / 2;
  const cy = PB_ICON.y + PB_ICON.d / 2;
  const R = PB_ICON.d / 2;
  const seat = eo(t, PB.seat, 0.2);
  const shock = ramp(t, PB.seat, 0.28);

  const w1 = ramp(t, PB.word1, 0.09);
  const w2 = ramp(t, PB.word2, 0.1);
  const s1 = lerp(1.55, 1, expoOut(w1));
  const s2 = lerp(1.8, 1, expoOut(w2));
  const line = eio(t, PB.line, 0.12);
  const flood = t < PB.pull ? 1 : 1 - ramp(t, PB.pull, 0.02);
  const floodOut = ramp(t, PB.out + PB.outDur - 0.005, 0.005);

  const camT = `translate(${(960 * (1 - hold) + shake.x).toFixed(1)} ${(540 * (1 - hold) + shake.y).toFixed(1)}) scale(${hold.toFixed(4)}) translate(${cam.tx.toFixed(1)} ${cam.ty.toFixed(1)}) translate(${cam.f[0].toFixed(1)} ${cam.f[1].toFixed(1)}) rotate(${cam.rot.toFixed(3)}) scale(${cam.s.toFixed(4)}) translate(${(-cam.f[0]).toFixed(1)} ${(-cam.f[1]).toFixed(1)})`;

  return (
    <AbsoluteFill>
      <DeskPlate id={id} />
      <AbsoluteFill style={{ filter: zoomBlur > 0.4 ? `blur(${zoomBlur.toFixed(1)}px)` : undefined }}>
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <g transform={camT}>
            {/* 着座の衝撃輪 */}
            {shock > 0 && shock < 1 ? (
              <circle cx={cx} cy={cy} r={R + lerp(6, 150, easeOut(shock))} fill="none" stroke={AKAPEN.red} strokeWidth={lerp(14, 2, shock)} opacity={0.8 * (1 - shock)} />
            ) : null}
            <circle cx={cx + 10} cy={cy + 16} r={R} fill="rgba(0,0,0,0.5)" filter={`url(#${ids.blur})`} opacity={seat} />
            <g transform={`translate(${PB_ICON.x} ${PB_ICON.y})`}>
              <AkapenIcon variant="penArticle" size={PB_ICON.d} circle idPrefix={`${id}-icon`} />
            </g>
            {/* アイコンの縁：生成りの細い輪が一周して「座る」 */}
            <circle
              cx={cx}
              cy={cy}
              r={R + 14}
              fill="none"
              stroke={SLIP_PAPER}
              strokeWidth={5}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={(1 - seat).toFixed(4)}
              transform={`rotate(-90 ${cx} ${cy})`}
              opacity={0.85}
            />
            {w1 > 0 ? (
              <g transform={`translate(${PB_WORD_X} 410) scale(${s1.toFixed(4)}) translate(${-PB_WORD_X} -410)`} opacity={clamp01(w1 * 3)}>
                <text x={PB_WORD_X + 6} y={410} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={128} letterSpacing={12} fill={AKAPEN.white} dominantBaseline="middle">
                  経済の
                </text>
              </g>
            ) : null}
            {w2 > 0 ? (
              <g transform={`translate(${PB_WORD_X + PB_AKA * 1.5} 600) scale(${s2.toFixed(4)}) rotate(${lerp(-7, 0, expoOut(w2)).toFixed(2)}) translate(${-(PB_WORD_X + PB_AKA * 1.5)} -600)`} opacity={clamp01(w2 * 3)}>
                <text x={PB_WORD_X} y={600} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={PB_AKA} letterSpacing={-2} fill={AKAPEN.red} dominantBaseline="middle">
                  赤ペン
                </text>
              </g>
            ) : null}
            <MarkerPath pts={PB_LINE} p={line} width={40} filter={markerU(id)} />
          </g>
        </svg>
      </AbsoluteFill>
      {flood > 0 ? <AbsoluteFill style={{ backgroundColor: AKAPEN.red, opacity: flood }} /> : null}
      {floodOut > 0 ? <AbsoluteFill style={{ backgroundColor: AKAPEN.red, opacity: floodOut }} /> : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ slit（二重線スリット） */

const SL = { l1: 0, l2: 0.13, stroke: 0.13, open: 0.26, flip: 0.52, close: 1.02, closeDur: 0.13, zip: 1.15, zipDur: 0.11 } as const;
const SL_Y1 = 455;
const SL_Y2 = 625;
const SL_OPEN = 250;
const SL_L1 = bowLine(-140, 0, 2060, 0, 12, 41, 30);
const SL_L2 = bowLine(2060, 0, -140, 0, -9, 47, 30);
const SL_W = 62;

const slitEdges = (t: number): { y1: number; y2: number; o: number } => {
  const o = spr(t, SL.open, 30, { stiffness: 400, damping: 15, mass: 0.7 });
  const c = Math.pow(ramp(t, SL.close, SL.closeDur), 3);
  const y1 = lerp(lerp(SL_Y1, SL_Y1 - SL_OPEN, o), 540, c);
  const y2 = lerp(lerp(SL_Y2, SL_Y2 + SL_OPEN, o), 540, c);
  return { y1, y2, o };
};

const Slit: React.FC<{ t: number; id: string }> = ({ t, id }) => {
  const ids = akapenFilterIds(id);
  // 画面外から既に走っている一閃（頭フレームから線が見える）。減速は画面外で終わる
  const p1 = eo(t, SL.l1 - 0.025, SL.stroke + 0.03);
  const p2 = eo(t, SL.l2 - 0.01, SL.stroke + 0.02);
  const { y1, y2, o } = slitEdges(t);
  const merged = t >= SL.zip;
  const zip = Math.pow(ramp(t, SL.zip, SL.zipDur), 1.6);

  const shake = shakeAt(t, [SL.open, SL.zip], 12, 12);
  const red = eo(t, SL.flip, 0.07);
  const pop = t < SL.flip ? 1 : lerp(1.16, 1, spr(t, SL.flip, 30, { stiffness: 620, damping: 17, mass: 0.5 }));
  const contentS = lerp(1.24, 1, clamp01(o)) + 0.03 * eio(t, SL.flip, 0.5) + 0.1 * Math.pow(ramp(t, SL.close, SL.closeDur), 2);

  // ペン：1 本目は左→右（軸は左下へ）、2 本目は右→左（軸は右下へ）
  const pen =
    t < SL.l2
      ? { tip: pointAlong(SL_L1, p1), y: SL_Y1, rot: 138, prev: pointAlong(SL_L1, eo(t - FRAME, SL.l1 - 0.025, SL.stroke + 0.03)) }
      : t < SL.open
        ? { tip: pointAlong(SL_L2, p2), y: SL_Y2, rot: 42, prev: pointAlong(SL_L2, eo(t - FRAME, SL.l2 - 0.01, SL.stroke + 0.02)) }
        : null;
  const penBlur = pen ? Math.min(46, Math.abs(pen.tip[0] - pen.prev[0]) * 0.1) : 0;

  const winTop = Math.min(y1, y2);
  const winH = Math.max(0, Math.abs(y2 - y1));
  const headS = 236;

  return (
    <AbsoluteFill>
      <DeskPlate id={id} />
      <AbsoluteFill style={camStyle(shake.x, shake.y, 1 + (t >= SL.open ? 0.04 * Math.exp(-12 * (t - SL.open)) : 0), shake.rot)}>
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <defs>
            <clipPath id={`${id}-win`}>
              <rect x={-200} y={winTop} width={2320} height={winH} />
            </clipPath>
            {penBlur > 0.5 ? <DirBlur id={`${id}-pb`} sx={penBlur} sy={penBlur * 0.1} /> : null}
          </defs>
          {/* 線の間に開く紙面 */}
          {t >= SL.open && !merged && winH > 1 ? (
            <g clipPath={`url(#${id}-win)`}>
              <rect x={-200} y={-200} width={2320} height={1480} fill={SLIP_PAPER} />
              <rect x={-200} y={-200} width={2320} height={1480} filter={`url(#${ids.grain})`} opacity={0.3} />
              <g transform={`translate(960 540) scale(${contentS.toFixed(4)}) translate(-960 -540)`}>
                <rect x={200} y={318} width={1520} height={7} fill={AKAPEN.ink} />
                <rect x={200} y={332} width={1520} height={2} fill={AKAPEN.ink} />
                <text x={960} y={548} textAnchor="end" fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={headS} letterSpacing={-2} fill={AKAPEN.ink} dominantBaseline="middle">
                  経済の
                </text>
                <g transform={`translate(${960 + headS * 1.5} 548) scale(${pop.toFixed(4)}) translate(${-(960 + headS * 1.5)} -548)`}>
                  <text x={960} y={548} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={headS} letterSpacing={-2} fill={inkToRed(red)} dominantBaseline="middle">
                    赤ペン
                  </text>
                </g>
                <g fill={AKAPEN.ink} opacity={0.3}>
                  {Array.from({ length: 4 }, (_, i) => (
                    <React.Fragment key={i}>
                      <rect x={200} y={742 + i * 40} width={700 - ((i * 53) % 140)} height={18} />
                      <rect x={1000} y={742 + i * 40} width={720 - ((i * 37) % 160)} height={18} />
                    </React.Fragment>
                  ))}
                </g>
              </g>
            </g>
          ) : null}
          {/* 二重線（＝窓の縁） */}
          {!merged ? (
            <>
              <g transform={`translate(0 ${y1.toFixed(1)})`}>
                <MarkerPath pts={SL_L1} p={p1} width={SL_W} filter={markerU(id)} />
              </g>
              <g transform={`translate(0 ${y2.toFixed(1)})`}>
                <MarkerPath pts={SL_L2} p={p2} width={SL_W} filter={markerU(id)} />
              </g>
            </>
          ) : zip < 1 ? (
            <g transform="translate(0 540)" filter={markerU(id)}>
              <path
                d={toPath(SL_L1)}
                pathLength={1}
                fill="none"
                stroke={AKAPEN.red}
                strokeWidth={lerp(SL_W * 1.5, 10, zip)}
                strokeLinecap="round"
                strokeDasharray="1 1"
                strokeDashoffset={(2 - zip).toFixed(4)}
              />
            </g>
          ) : null}
          {pen ? (
            <g
              transform={`translate(${pen.tip[0].toFixed(1)} ${(pen.tip[1] + pen.y).toFixed(1)}) rotate(${pen.rot})`}
              filter={penBlur > 0.5 ? `url(#${id}-pb)` : undefined}
            >
              <RedPenGlyph length={700} thick={124} />
            </g>
          ) : null}
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 公開部品 */

export interface AkapenEyecatchProps {
  /** 既定: 'swipe'（公式3種: 'swipe' | 'pullback' | 'slit'） */
  variant?: AkapenEyecatchVariant;
  /** アイキャッチ先頭からの経過秒（0..akapenEyecatchSec(variant)） */
  t: number;
  idPrefix?: string;
}

const VARIANT_BODY: Record<AkapenEyecatchVariant, React.FC<{ t: number; id: string }>> = {
  swipe: Swipe,
  pullback: Pullback,
  slit: Slit,
};

/** 区間ローカル秒 t で描く純描画。区間外（t<0 / t>=尺）は何も描かない */
export const AkapenEyecatch: React.FC<AkapenEyecatchProps> = ({
  variant = AKAPEN_EYECATCH_DEFAULT_VARIANT,
  t,
  idPrefix,
}) => {
  if (!(t >= 0 && t < akapenEyecatchSec(variant))) return null;
  const id = idPrefix ?? `akapen-ec-${variant}`;
  const Body = VARIANT_BODY[variant];
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: AKAPEN.deskDeep }}>
      <Body t={t} id={id} />
    </AbsoluteFill>
  );
};

/** 自由舞台用：spec 秒 sec と開始時刻 at（ctx.cue() 等で得た値）を渡す */
export const AkapenCutIn: React.FC<{
  variant?: AkapenEyecatchVariant;
  sec: number;
  at: number;
  idPrefix?: string;
}> = ({ variant = AKAPEN_EYECATCH_DEFAULT_VARIANT, sec, at, idPrefix }) => (
  <AkapenEyecatch variant={variant} t={sec - at} idPrefix={idPrefix} />
);

const SequenceBody: React.FC<{ variant: AkapenEyecatchVariant; idPrefix?: string }> = ({ variant, idPrefix }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <AkapenEyecatch variant={variant} t={frame / fps} idPrefix={idPrefix} />;
};

/** 通常タイムライン用：from フレームから尺ぶん全面に差し込む（音は呼び出し側で SFX トラックへ） */
export const AkapenEyecatchSequence: React.FC<{
  variant?: AkapenEyecatchVariant;
  from: number;
  idPrefix?: string;
  children?: React.ReactNode;
}> = ({ variant = AKAPEN_EYECATCH_DEFAULT_VARIANT, from, idPrefix, children }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={from} durationInFrames={akapenEyecatchFrames(variant, fps)} name={`akapen-eyecatch-${variant}`}>
      <SequenceBody variant={variant} idPrefix={idPrefix} />
      {children}
    </Sequence>
  );
};
