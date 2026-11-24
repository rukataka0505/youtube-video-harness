import React, { useId } from 'react';
import { Easing, interpolate } from 'remotion';
import {
  DrawPath,
  FONT_HAND,
  FONT_MARU,
  PhotoScrap,
  snapAt,
  useBoilSeed,
  type StickmanSceneProps,
} from '../../../../components/stickman_collage';

/* ========================================================================== */
/* v2_opus 4カット：手描き小道具 × 関節リグ棒人間 × 物理モーション           */
/*  - すべての時刻は cue("語句", fallback) で実音声の語単位に同期（ショット内相対秒）  */
/*  - 線画は 7.5fps ボイル（feTurbulence）、文字・スタンプはボイルなしで可読性優先   */
/*  - 放物線（重力）・減衰バネ（ぐらつき）・押しつぶし（着地）で「物が在る」感を出す */
/* ========================================================================== */

const D2R = Math.PI / 180;
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const ramp = (sec: number, a: number, b: number): number => clamp01((sec - a) / Math.max(0.001, b - a));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const EIO = Easing.inOut(Easing.cubic);
const EO = Easing.out(Easing.cubic);
const BACK = Easing.out(Easing.back(1.6));
const eio = (sec: number, a: number, b: number): number => EIO(ramp(sec, a, b));
const eo = (sec: number, a: number, b: number): number => EO(ramp(sec, a, b));
const rnd = (n: number): number => {
  const x = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
};

/** 減衰振動（ぐらつき・揺れ戻し）。sec<at は 0 */
const wob = (sec: number, at: number, amp: number, freq = 2.2, decay = 3.2): number =>
  sec < at ? 0 : amp * Math.exp(-decay * (sec - at)) * Math.sin((sec - at) * freq * Math.PI * 2);

/** 着地の押しつぶし量（0→1→0 の速い減衰） */
const squash = (sec: number, at: number, decay = 9): number =>
  sec < at ? 0 : Math.exp(-decay * (sec - at)) * Math.cos((sec - at) * 16);

/** 重力放物線で a→b へ飛ぶ（水平等速・lift は頂点の持ち上げ量） */
const fly = (
  sec: number,
  t0: number,
  dur: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
  lift: number,
): { x: number; y: number; u: number } => {
  const u = clamp01((sec - t0) / Math.max(0.001, dur));
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) - lift * 4 * u * (1 - u), u };
};

/** 1回きりのバネ出現（0→1、オーバーシュートあり） */
const pop = (sec: number, at: number, stiffness = 420, damping = 18): number =>
  snapAt(sec, at, 30, stiffness, damping, 0.62);

/* ---------- 手描きパス ---------- */

/** わずかに歪んだ手描き矩形 */
const rr = (x: number, y: number, w: number, h: number, j = 2, seed = 1): string => {
  const o = (k: number) => (rnd(seed * 13 + k) - 0.5) * 2 * j;
  return [
    `M ${x + o(1)} ${y + o(2)}`,
    `Q ${x + w / 2} ${y + o(3) * 1.4} ${x + w + o(4)} ${y + o(5)}`,
    `Q ${x + w + o(6) * 1.4} ${y + h / 2} ${x + w + o(7)} ${y + h + o(8)}`,
    `Q ${x + w / 2} ${y + h + o(9) * 1.4} ${x + o(10)} ${y + h + o(11)}`,
    `Q ${x + o(12) * 1.4} ${y + h / 2} ${x + o(1)} ${y + o(2)} Z`,
  ].join(' ');
};

/** 手描きの円（4ベジェ・半径に微小ムラ） */
const ring = (cx: number, cy: number, r: number, seed = 1): string => {
  const k = 0.5523;
  const rs = [0, 1, 2, 3].map((i) => r * (1 + (rnd(seed * 7 + i) - 0.5) * 0.06));
  const [a, b, c, d] = rs;
  return [
    `M ${cx + a} ${cy}`,
    `C ${cx + a} ${cy + b * k} ${cx + b * k} ${cy + b} ${cx} ${cy + b}`,
    `C ${cx - c * k} ${cy + b} ${cx - c} ${cy + c * k} ${cx - c} ${cy}`,
    `C ${cx - c} ${cy - d * k} ${cx - d * k} ${cy - d} ${cx} ${cy - d}`,
    `C ${cx + a * k} ${cy - d} ${cx + a} ${cy - a * k} ${cx + a} ${cy} Z`,
  ].join(' ');
};

/** 雲形（楕円上の点をアーチでつなぐ） */
const cloud = (cx: number, cy: number, rx: number, ry: number, bumps = 11): string => {
  const pts = Array.from({ length: bumps }, (_, i) => {
    const a = (i / bumps) * Math.PI * 2;
    const jit = 1 + (rnd(i + 3) - 0.5) * 0.08;
    return { x: cx + Math.cos(a) * rx * jit, y: cy + Math.sin(a) * ry * jit };
  });
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i <= bumps; i += 1) {
    const p = pts[i % bumps];
    const r = (rx + ry) / bumps * 1.25;
    d += ` A ${r} ${r} 0 0 1 ${p.x} ${p.y}`;
  }
  return `${d} Z`;
};

/** 4点キラ */
const sparkPath = (x: number, y: number, r: number): string =>
  `M ${x} ${y - r} Q ${x + r * 0.16} ${y - r * 0.16} ${x + r} ${y} Q ${x + r * 0.16} ${y + r * 0.16} ${x} ${y + r} Q ${x - r * 0.16} ${y + r * 0.16} ${x - r} ${y} Q ${x - r * 0.16} ${y - r * 0.16} ${x} ${y - r} Z`;

/* ---------- 7.5fps ボイル ---------- */

const useBoil = (scale = 2.6, freq = 0.024): { url: string; defs: React.ReactNode } => {
  const seed = useBoilSeed(7.5, 16);
  const id = `opb-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return {
    url: `url(#${id})`,
    defs: (
      <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={2} seed={seed} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={scale} />
      </filter>
    ),
  };
};

/* ---------- パレット ---------- */

interface Inks {
  line: string;
  muted: string;
  yellow: string;
  red: string;
  blue: string;
  paper: string;
  headFill: string;
}

const inksFor = (isLight: boolean): Inks =>
  isLight
    ? {
        line: '#1C1917',
        muted: '#57534E',
        yellow: '#F2B705',
        red: '#E62E2D',
        blue: '#0077CC',
        paper: '#FFFFFF',
        headFill: '#F4F5F7',
      }
    : {
        line: '#F3EFE6',
        muted: '#B8B2A6',
        yellow: '#FFCC00',
        red: '#FF5A4E',
        blue: '#3DA5FF',
        paper: '#FAF8F3',
        headFill: '#0B0A09',
      };

/* ========================================================================== */
/* 関節リグ棒人間                                                              */
/* ========================================================================== */

/** 角度は「真下=0°、右=+90°、真上=180°」。肘・膝は上腕・太腿からの相対角。右向き基準。 */
interface StickPose {
  x: number;
  y: number;
  s: number;
  lean: number;
  head: number;
  ls: number;
  le: number;
  rs: number;
  re: number;
  lh: number;
  lk: number;
  rh: number;
  rk: number;
}

type Face = 'neutral' | 'happy' | 'smug' | 'blank' | 'sad' | 'surprised';

const STAND: Omit<StickPose, 'x' | 'y' | 's'> = {
  lean: 0,
  head: 0,
  ls: -12,
  le: -6,
  rs: 14,
  re: 6,
  lh: -7,
  lk: 0,
  rh: 7,
  rk: 0,
};

const LEN = { torso: 104, neck: 8, headR: 30, upper: 56, fore: 52, thigh: 62, shin: 60 };
/** 直立時の腰→足裏の高さ（s=1） */
const HIP_H = LEN.thigh + LEN.shin;

type Pt = { x: number; y: number };
const polar = (o: Pt, a: number, l: number): Pt => ({ x: o.x + Math.sin(a * D2R) * l, y: o.y + Math.cos(a * D2R) * l });

interface Rig {
  hip: Pt;
  sh: Pt;
  head: Pt;
  lE: Pt;
  lH: Pt;
  rE: Pt;
  rH: Pt;
  lK: Pt;
  lF: Pt;
  rK: Pt;
  rF: Pt;
}

const rig = (p: StickPose, flip = false): Rig => {
  const s = p.s;
  const hip = { x: p.x, y: p.y };
  const sh = polar(hip, 180 - p.lean, LEN.torso * s);
  const head = polar(sh, 180 - p.lean - p.head, (LEN.neck + LEN.headR) * s);
  const lE = polar(sh, p.ls, LEN.upper * s);
  const lH = polar(lE, p.ls + p.le, LEN.fore * s);
  const rE = polar(sh, p.rs, LEN.upper * s);
  const rH = polar(rE, p.rs + p.re, LEN.fore * s);
  const lK = polar(hip, p.lh, LEN.thigh * s);
  const lF = polar(lK, p.lh + p.lk, LEN.shin * s);
  const rK = polar(hip, p.rh, LEN.thigh * s);
  const rF = polar(rK, p.rh + p.rk, LEN.shin * s);
  const out: Rig = { hip, sh, head, lE, lH, rE, rH, lK, lF, rK, rF };
  if (!flip) {
    return out;
  }
  const m = (q: Pt): Pt => ({ x: 2 * p.x - q.x, y: q.y });
  return {
    hip: m(hip),
    sh: m(sh),
    head: m(head),
    lE: m(lE),
    lH: m(lH),
    rE: m(rE),
    rH: m(rH),
    lK: m(lK),
    lF: m(lF),
    rK: m(rK),
    rF: m(rF),
  };
};

const mixPose = (a: StickPose, b: StickPose, t: number): StickPose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  s: lerp(a.s, b.s, t),
  lean: lerp(a.lean, b.lean, t),
  head: lerp(a.head, b.head, t),
  ls: lerp(a.ls, b.ls, t),
  le: lerp(a.le, b.le, t),
  rs: lerp(a.rs, b.rs, t),
  re: lerp(a.re, b.re, t),
  lh: lerp(a.lh, b.lh, t),
  lk: lerp(a.lk, b.lk, t),
  rh: lerp(a.rh, b.rh, t),
  rk: lerp(a.rk, b.rk, t),
});

interface PoseKey {
  t: number;
  d?: number;
  soft?: boolean;
  p: Partial<StickPose>;
}

/** キー時刻ごとにポーズを積み重ねて補間（既定はバックアウトで「勢い→戻り」の物理感） */
const track = (sec: number, base: StickPose, keys: PoseKey[]): StickPose => {
  let cur = { ...base };
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  for (const k of sorted) {
    if (sec < k.t) {
      break;
    }
    const raw = ramp(sec, k.t, k.t + (k.d ?? 0.32));
    const e = k.soft ? EIO(raw) : BACK(raw);
    cur = mixPose(cur, { ...cur, ...k.p }, e);
  }
  return cur;
};

/** 歩行サイクル（右向き）。phase はラジアン */
const walk = (p: StickPose, phase: number, amp = 1): StickPose => {
  const sw = Math.sin(phase);
  const cw = Math.cos(phase);
  return {
    ...p,
    lh: 27 * sw * amp,
    rh: -27 * sw * amp,
    lk: -Math.max(0, cw) * 42 * amp,
    rk: -Math.max(0, -cw) * 42 * amp,
    ls: -24 * sw * amp - 4,
    le: 18 * amp,
    rs: 24 * sw * amp + 4,
    re: 18 * amp,
    lean: p.lean + 5 * amp,
    y: p.y - (1 - Math.abs(sw)) * 6 * p.s * amp,
  };
};

const seg = (a: Pt, b: Pt, bow: number): string => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return `M ${a.x} ${a.y} Q ${mx - (dy / len) * bow} ${my + (dx / len) * bow} ${b.x} ${b.y}`;
};

interface StickProps {
  p: StickPose;
  ink: string;
  headFill: string;
  face?: Face;
  look?: number;
  flip?: boolean;
  width?: number;
  /** 頭の上に載せる小物（王冠など）。頭中心原点・未回転座標 */
  hat?: React.ReactNode;
}

const Stick: React.FC<StickProps> = ({ p, ink, headFill, face = 'neutral', look = 0.4, flip = false, width = 9, hat }) => {
  const r = rig(p);
  const s = p.s;
  const w = width * s;
  const b = 2.2 * s;
  const fw = 3.4 * s;
  const ex = look * 7;
  const faceEl = (() => {
    switch (face) {
      case 'happy':
        return (
          <>
            <path d={`M ${-14 + ex} -2 Q ${-9 + ex} -10 ${-4 + ex} -2`} stroke={ink} strokeWidth={fw} fill="none" strokeLinecap="round" />
            <path d={`M ${5 + ex} -2 Q ${10 + ex} -10 ${15 + ex} -2`} stroke={ink} strokeWidth={fw} fill="none" strokeLinecap="round" />
            <path d={`M ${-11 + ex} 8 Q ${0 + ex} 21 ${12 + ex} 8`} stroke={ink} strokeWidth={fw} fill="none" strokeLinecap="round" />
          </>
        );
      case 'smug':
        return (
          <>
            <path d={`M ${-15 + ex} -4 L ${-4 + ex} -3`} stroke={ink} strokeWidth={fw} strokeLinecap="round" />
            <path d={`M ${5 + ex} -3 L ${15 + ex} -4`} stroke={ink} strokeWidth={fw} strokeLinecap="round" />
            <path d={`M ${-6 + ex} 12 Q ${4 + ex} 17 ${13 + ex} 7`} stroke={ink} strokeWidth={fw} fill="none" strokeLinecap="round" />
          </>
        );
      case 'blank':
        return (
          <>
            <circle cx={-8 + ex} cy={-3} r={3.2} fill={ink} />
            <circle cx={9 + ex} cy={-3} r={3.2} fill={ink} />
            <path d={`M ${-4 + ex} 12 L ${5 + ex} 12`} stroke={ink} strokeWidth={fw} strokeLinecap="round" />
          </>
        );
      case 'sad':
        return (
          <>
            <circle cx={-8 + ex} cy={-2} r={3.2} fill={ink} />
            <circle cx={9 + ex} cy={-2} r={3.2} fill={ink} />
            <path d={`M ${-8 + ex} 15 Q ${1 + ex} 7 ${10 + ex} 15`} stroke={ink} strokeWidth={fw} fill="none" strokeLinecap="round" />
          </>
        );
      case 'surprised':
        return (
          <>
            <circle cx={-9 + ex} cy={-4} r={4.6} fill={ink} />
            <circle cx={10 + ex} cy={-4} r={4.6} fill={ink} />
            <ellipse cx={1 + ex} cy={12} rx={5} ry={6.5} fill="none" stroke={ink} strokeWidth={fw} />
          </>
        );
      case 'neutral':
      default:
        return (
          <>
            <circle cx={-8 + ex} cy={-3} r={3.4} fill={ink} />
            <circle cx={9 + ex} cy={-3} r={3.4} fill={ink} />
            <path d={`M ${-7 + ex} 11 Q ${1 + ex} 15 ${9 + ex} 11`} stroke={ink} strokeWidth={fw} fill="none" strokeLinecap="round" />
          </>
        );
    }
  })();

  const body = (
    <g fill="none" stroke={ink} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      <path d={`${seg(r.hip, r.lK, b)} ${seg(r.lK, r.lF, -b).replace('M', 'L')}`} />
      <path d={`${seg(r.hip, r.rK, -b)} ${seg(r.rK, r.rF, b).replace('M', 'L')}`} />
      <path d={seg(r.hip, r.sh, b * 1.4)} />
      <path d={`${seg(r.sh, r.lE, b)} ${seg(r.lE, r.lH, -b).replace('M', 'L')}`} />
      <path d={`${seg(r.sh, r.rE, -b)} ${seg(r.rE, r.rH, b).replace('M', 'L')}`} />
      <path d={ring(r.head.x, r.head.y, LEN.headR * s, 3)} fill={headFill} />
      <g transform={`translate(${r.head.x} ${r.head.y}) rotate(${p.lean + p.head}) scale(${s})`} stroke="none">
        {faceEl}
      </g>
      {hat ? <g transform={`translate(${r.head.x} ${r.head.y}) scale(${s})`}>{hat}</g> : null}
    </g>
  );

  return flip ? <g transform={`translate(${2 * p.x} 0) scale(-1 1)`}>{body}</g> : body;
};

/* ========================================================================== */
/* 手描き小道具                                                                */
/* ========================================================================== */

interface BookSpec {
  color: string;
  title: string;
  titleInk: string;
}

/** 横置きの本（背表紙ビュー）。原点中心 */
const BookSlab: React.FC<{ w: number; h: number; book: BookSpec; ink: string; seed?: number }> = ({ w, h, book, ink, seed = 1 }) => (
  <g>
    <path d={rr(-w / 2, -h / 2, w, h, 1.6, seed)} fill={book.color} stroke={ink} strokeWidth={4} strokeLinejoin="round" />
    <path d={`M ${-w / 2 + 14} ${-h / 2 + 5} L ${-w / 2 + 14} ${h / 2 - 5}`} stroke={book.titleInk} strokeOpacity={0.4} strokeWidth={3} />
    <path d={`M ${w / 2 - 14} ${-h / 2 + 5} L ${w / 2 - 14} ${h / 2 - 5}`} stroke={book.titleInk} strokeOpacity={0.4} strokeWidth={3} />
    {book.title ? (
      <text
        x={0}
        y={h * 0.17}
        textAnchor="middle"
        fontFamily={FONT_HAND}
        fontWeight={700}
        fontSize={Math.min(h * 0.5, (w - 44) / Math.max(1, book.title.length))}
        fill={book.titleInk}
      >
        {book.title}
      </text>
    ) : null}
  </g>
);

const BOOKS: BookSpec[] = [
  { color: '#FFCC00', title: '人生が変わる習慣', titleInk: '#111111' },
  { color: '#3DA5FF', title: '最強の朝活', titleInk: '#0B0A09' },
  { color: '#FF5A4E', title: '超・継続力', titleInk: '#0B0A09' },
];

/** 手描きのサラダチキン（真空パック）。原点中心・幅約 220 */
const ChickenPack: React.FC<{ ink: string }> = ({ ink }) => (
  <g>
    <path
      d="M -110 -62 C -60 -72, 60 -72, 110 -62 C 118 -20, 118 30, 108 66 C 50 76, -50 76, -108 66 C -118 30, -118 -20, -110 -62 Z"
      fill="rgba(250, 248, 243, 0.92)"
      stroke={ink}
      strokeWidth={5}
      strokeLinejoin="round"
    />
    {/* 鶏むね肉 */}
    <path
      d="M -78 18 C -86 -14, -56 -40, -10 -38 C 40 -36, 86 -20, 84 8 C 82 34, 40 46, -6 44 C -46 42, -72 38, -78 18 Z"
      fill="#F2C9A0"
      stroke="#8A5A33"
      strokeWidth={4}
    />
    <path d="M -50 4 C -30 -8, 10 -10, 46 0" stroke="#C98E5E" strokeWidth={4} fill="none" strokeLinecap="round" />
    <path d="M -40 22 C -16 14, 20 14, 50 20" stroke="#C98E5E" strokeWidth={3.5} fill="none" strokeLinecap="round" />
    {/* ハーブ */}
    {[
      [-40, -14],
      [8, -22],
      [34, 10],
      [-14, 28],
      [58, -6],
    ].map(([x, y], i) => (
      <path key={i} d={`M ${x - 4} ${y} Q ${x} ${y - 5} ${x + 4} ${y} Q ${x} ${y + 4} ${x - 4} ${y} Z`} fill="#4E9A3A" />
    ))}
    {/* ラベル帯 */}
    <path d="M -96 -60 C -40 -66, 40 -66, 96 -60 L 94 -36 C 40 -42, -40 -42, -94 -36 Z" fill="#3E9C5A" stroke={ink} strokeWidth={3} />
    <text x={0} y={-42} textAnchor="middle" fontFamily={FONT_MARU} fontWeight={900} fontSize={22} fill="#FFFFFF">
      サラダチキン
    </text>
  </g>
);

/** スマートフォン（原点中心・縦） */
const Phone: React.FC<{ ink: string; sec: number }> = ({ ink, sec }) => {
  const scroll = (sec * 40) % 22;
  return (
    <g>
      <path d={rr(-22, -40, 44, 80, 1.2, 5)} fill="#1A1A1A" stroke={ink} strokeWidth={3.5} />
      <rect x={-17} y={-33} width={34} height={64} fill="#7FC8FF" opacity={0.9} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={-13} y={-30 + ((i * 22 - scroll + 88) % 88) * 0.7} width={26} height={6} fill="#FFFFFF" opacity={0.75} />
      ))}
    </g>
  );
};

/** ゆらめく炎（原点中心） */
const Flame: React.FC<{ sec: number; scale?: number }> = ({ sec, scale = 1 }) => {
  const f = Math.sin(sec * 9) * 6;
  const g = Math.cos(sec * 7) * 5;
  return (
    <g transform={`scale(${scale})`}>
      <path
        d={`M 0 ${-92 - g} C ${30 + f} -50, 64 -20, 56 24 C 50 62, 22 80, 0 80 C -24 80, -52 62, -56 24 C -60 -12, ${-26 + f} -36, 0 ${-92 - g} Z`}
        fill="#F59E2A"
        stroke="#C2410C"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path
        d={`M 0 ${-30 - f * 0.6} C 18 -6, 30 14, 26 36 C 22 56, 10 64, 0 64 C -12 64, -26 54, -26 34 C -26 12, -10 -4, 0 ${-30 - f * 0.6} Z`}
        fill="#FDE047"
      />
    </g>
  );
};

/** SVG スタンプ（叩きつけ＋インク二重枠）。ボイル外で可読性優先 */
const SvgStamp: React.FC<{
  sec: number;
  at: number;
  x: number;
  y: number;
  text: string;
  color: string;
  rot?: number;
  size?: number;
}> = ({ sec, at, x, y, text, color, rot = -8, size = 60 }) => {
  if (sec < at) {
    return null;
  }
  const sp = snapAt(sec, at, 30, 620, 20, 0.7);
  const sc = interpolate(sp, [0, 1], [2.4, 1]);
  const op = interpolate(sp, [0, 0.25], [0, 0.94], { extrapolateRight: 'clamp' });
  const w = text.length * size * 1.04 + size * 0.95;
  const h = size * 1.6;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot + (1 - sp) * 10}) scale(${sc})`} opacity={op}>
      <path d={rr(-w / 2, -h / 2, w, h, 3, 9)} fill="rgba(255,255,255,0.06)" stroke={color} strokeWidth={size * 0.09} strokeLinejoin="round" />
      <path
        d={rr(-w / 2 + size * 0.16, -h / 2 + size * 0.16, w - size * 0.32, h - size * 0.32, 2, 11)}
        fill="none"
        stroke={color}
        strokeWidth={size * 0.035}
      />
      <text x={0} y={size * 0.36} textAnchor="middle" fontFamily={FONT_MARU} fontWeight={900} fontSize={size} fill={color} letterSpacing={2}>
        {text}
      </text>
    </g>
  );
};

/** 手書き文字（SVG）。可読性のため背景色の縁取り付き */
const Hand: React.FC<{
  x: number;
  y: number;
  text: string;
  size: number;
  fill: string;
  edge?: string;
  anchor?: 'start' | 'middle' | 'end';
  rot?: number;
  opacity?: number;
  font?: string;
}> = ({ x, y, text, size, fill, edge, anchor = 'middle', rot = 0, opacity = 1, font = FONT_HAND }) => (
  <text
    x={x}
    y={y}
    textAnchor={anchor}
    fontFamily={font}
    fontWeight={700}
    fontSize={size}
    fill={fill}
    stroke={edge}
    strokeWidth={edge ? size * 0.14 : 0}
    paintOrder="stroke"
    strokeLinejoin="round"
    opacity={opacity}
    transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}
  >
    {text}
  </text>
);

/** 放射状のキラ（at から 0.7s） */
const Burst: React.FC<{ sec: number; at: number; x: number; y: number; r: number; color: string; n?: number }> = ({
  sec,
  at,
  x,
  y,
  r,
  color,
  n = 8,
}) => {
  if (sec < at || sec > at + 0.8) {
    return null;
  }
  const u = ramp(sec, at, at + 0.7);
  const e = EO(u);
  return (
    <g opacity={1 - u}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.3;
        const r0 = r * (0.45 + 0.55 * e);
        const r1 = r0 + r * 0.32 * (1 - u * 0.6);
        return (
          <path
            key={i}
            d={`M ${x + Math.cos(a) * r0} ${y + Math.sin(a) * r0} L ${x + Math.cos(a) * r1} ${y + Math.sin(a) * r1}`}
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
};

/** 土ぼこり（at から 0.9s） */
const Puff: React.FC<{ sec: number; at: number; x: number; y: number; color: string; spread?: number }> = ({
  sec,
  at,
  x,
  y,
  color,
  spread = 120,
}) => {
  if (sec < at || sec > at + 1.0) {
    return null;
  }
  const u = ramp(sec, at, at + 0.9);
  const e = EO(u);
  return (
    <g opacity={0.55 * (1 - u)}>
      {[-1, -0.55, -0.15, 0.2, 0.6, 1].map((k, i) => (
        <path key={i} d={ring(x + k * spread * e, y - 10 - Math.abs(k) * 12 * e, 10 + 16 * e * (1 - Math.abs(k) * 0.3), i + 2)} fill="none" stroke={color} strokeWidth={3.5} />
      ))}
    </g>
  );
};

/** 手描き本屋：棚の背表紙（3段） */
const STORE_SPINES = (() => {
  const out: { x: number; w: number; h: number; row: number; color: string; idx: number }[] = [];
  const palette = ['#C2503F', '#3F6E9A', '#D8B23A', '#5E8A54', '#8A5E8A', '#D9D2C2', '#B5713A', '#4F5D73'];
  let idx = 0;
  [0, 1, 2].forEach((row) => {
    let x = 196;
    while (x < 800) {
      const w = 16 + Math.round(rnd(idx + 500) * 18);
      const h = 52 + Math.round(rnd(idx + 600) * 30);
      if (x + w > 806) {
        break;
      }
      out.push({ x, w, h, row, color: palette[Math.floor(rnd(idx + 700) * palette.length)], idx });
      x += w + 2 + (rnd(idx + 800) > 0.86 ? 14 : 0);
      idx += 1;
    }
  });
  return out;
})();

/** 平台の面陳（表紙）。bookIdx は c01 で手に取られる BOOKS の番号 */
const STORE_COVERS: { x: number; lines: string[]; color: string; ink: string; bookIdx?: number }[] = [
  { x: 214, lines: ['年収', '10倍'], color: '#D9D2C2', ink: '#111111' },
  { x: 346, lines: ['人生が', '変わる', '習慣'], color: '#FFCC00', ink: '#111111', bookIdx: 0 },
  { x: 478, lines: ['一流の', '朝'], color: '#F3EFE6', ink: '#C2503F' },
  { x: 610, lines: ['最強の', '朝活'], color: '#3DA5FF', ink: '#0B0A09', bookIdx: 1 },
  { x: 742, lines: ['超・', '継続力'], color: '#FF5A4E', ink: '#0B0A09', bookIdx: 2 },
];
const COVER_Y = 478;

/* ========================================================================== */
/* c01 本屋で3冊まとめ買い（black）                                           */
/* ========================================================================== */

export const OpusBookstoreHigh: React.FC<StickmanSceneProps> = ({ sec, cue, theme }) => {
  const boil = useBoil(2.8);
  const ink = inksFor(theme.isLight);
  const T = {
    store: cue('本屋', 0.35),
    corner: cue('ビジネス書コーナー', 0.91),
    book1: cue('人生が変わる習慣', 2.51),
    mitai: cue('みたいな本を', 3.95),
    three: cue('さんさつ', 5.07),
    matome: cue('まとめて', 5.47),
    katta: cue('買った', 5.95),
    yoru: cue('夜って', 6.19),
    myou: cue('みょうに', 6.99),
    kibun: cue('気分がいい', 7.47),
    yone: cue('ですよね', 7.95),
  };
  // カメラ：『みたいな本を』で本の山へ寄り、『夜って』で引いて夜空を見せる
  const push = eio(sec, T.mitai - 0.2, T.mitai + 0.9) * (1 - eio(sec, T.yoru - 0.15, T.yoru + 0.85));
  const camS = 1 + 0.06 * push + Math.sin(sec * 0.55) * 0.004;
  const camTx = -70 * push;
  const camTy = 24 * push;

  // 棒人間（左向き＝flip）。物理：着地のたびに膝が沈み、『みょうに』で足が地面から離れる
  const G = 800;
  const S = 1.5;
  const HX = 1380;
  const land = [T.book1 + 0.62, T.three + 0.42, T.three + 0.72];
  const dip = land.reduce((acc, t) => acc + (sec >= t ? 13 * Math.exp(-7 * (sec - t)) : 0), 0);
  const floatK = eio(sec, T.myou, T.myou + 1.1);
  const hover = floatK * (54 + Math.sin((sec - T.myou) * 2.7) * 8);

  const base: StickPose = { x: HX, y: G - HIP_H * S, s: S, ...STAND };
  let pose = track(sec, base, [
    { t: 0, p: { head: -4 } },
    { t: T.book1 - 0.28, d: 0.26, p: { ls: 78, le: 28, rs: 64, re: 34, lean: 7, head: -8 } },
    { t: T.book1 + 0.58, d: 0.36, p: { ls: 38, le: 50, rs: 26, re: 62, lean: -5, head: 4 } },
    { t: T.three + 0.7, d: 0.4, p: { lean: -10, head: 8, lk: 8, rk: 8 } },
    { t: T.myou, d: 0.9, soft: true, p: { lh: 10, lk: -32, rh: -8, rk: -20, lean: -4, head: 2 } },
    { t: T.yone, d: 0.25, p: { head: 12 } },
    { t: T.yone + 0.3, d: 0.3, p: { head: 2 } },
  ]);
  pose = { ...pose, y: pose.y + dip - hover, head: pose.head + (sec > T.kibun ? Math.sin((sec - T.kibun) * 3.2) * 6 : 0) };
  const R = rig(pose, true);

  // 本の山：手の上に乗り、手と一緒に動く（浮けば本も浮く）
  const bw = 250;
  const bh = 54;
  const handY = (R.lH.y + R.rH.y) / 2;
  const stackCX = Math.min(R.lH.x, R.rH.x) - 54;
  const stackWob = land.reduce((acc, t) => acc + wob(sec, t, 2.6, 1.7, 2.4), 0) + (floatK > 0 ? Math.sin(sec * 2.1) * 1.2 * floatK : 0);
  const slot = (i: number): Pt => ({ x: stackCX + stackWob * i * 2.2, y: handY - bh / 2 - i * bh + 3 });
  const launch = [T.book1, T.three, T.three + 0.3];
  const flightDur = [0.62, 0.42, 0.42];
  const finalRot = [-2, 3, -1.5];
  const srcOf = (i: number): Pt => {
    const cv = STORE_COVERS.find((c) => c.bookIdx === i);
    return { x: cv ? cv.x : 480, y: COVER_Y };
  };
  const storeIn = eo(sec, T.store, T.store + 0.5);
  const plateSwing = sec < T.corner ? 0 : 0.5 * Math.exp(-1.8 * (sec - T.corner)) * Math.cos((sec - T.corner) * 6.2);

  const face: Face = sec < T.book1 + 0.6 ? 'neutral' : sec < T.mitai ? 'happy' : sec < T.myou ? 'smug' : 'happy';
  const look = sec < T.yone ? 0.6 : 0.1;

  // 夜
  const night = eio(sec, T.yoru, T.yoru + 0.8);
  const moonY = lerp(250, 120, eo(sec, T.yoru, T.yoru + 1.2));

  // 購入タグの振り子
  const tagTheta = sec < T.katta ? 0 : 0.9 * Math.exp(-1.5 * (sec - T.katta)) * Math.cos((sec - T.katta) * 5.4) + Math.sin(sec * 1.8) * 0.05;
  const tagPivot = { x: stackCX - bw / 2 + 26 + stackWob * 0.5, y: handY + 2 };

  return (
    <div style={{ position: 'absolute', inset: 0, transform: `translate(${camTx}px, ${camTy}px) scale(${camS})`, transformOrigin: '62% 55%' }}>

      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>{boil.defs}</defs>

        {/* 夜空：月と星 */}
        {night > 0 ? (
          <g filter={boil.url} opacity={night}>
            <path
              d={`M 1650 ${moonY - 62} C 1610 ${moonY - 50}, 1592 ${moonY + 30}, 1650 ${moonY + 62} C 1580 ${moonY + 70}, 1548 ${moonY - 10}, 1580 ${moonY - 46} C 1598 ${moonY - 62}, 1626 ${moonY - 66}, 1650 ${moonY - 62} Z`}
              fill={ink.yellow}
              stroke={ink.yellow}
              strokeWidth={3}
            />
            {[
              [1180, 110],
              [1320, 190],
              [1460, 90],
              [1760, 230],
              [1040, 210],
              [1820, 120],
            ].map(([x, y], i) => {
              const sp = pop(sec, T.yoru + 0.2 + i * 0.12);
              const tw = 0.75 + 0.25 * Math.sin(sec * 4 + i * 1.7);
              return sp > 0 ? <path key={i} d={sparkPath(x, y, 15 * sp * tw)} fill={ink.line} /> : null;
            })}
          </g>
        ) : null}

        {/* 床・影（ボイル） */}
        <g filter={boil.url}>
          <DrawPath d={`M 110 ${G + 2} Q 960 ${G - 6} 1780 ${G + 1}`} sec={sec} at={0.12} dur={0.6} stroke={ink.muted} width={5} />
          <ellipse
            cx={HX}
            cy={G + 6}
            rx={92 * (1 - 0.45 * floatK)}
            ry={12 * (1 - 0.4 * floatK)}
            fill={ink.line}
            opacity={0.16 * (1 - 0.5 * floatK)}
          />
        </g>

        {/* 手描きの本屋：棚（背表紙が詰まっていく）＋平台の面陳＋吊り看板 */}
        {sec >= T.store ? (
          <g opacity={1 - 0.45 * night}>
            {/* 店内の暖色灯（夜で落ちる） */}
            <path d="M 160 120 L 840 120 L 920 800 L 80 800 Z" fill="#FFD98A" opacity={0.06 * storeIn * (1 - night * 0.8)} />
            <g filter={boil.url}>
              <path d="M 180 200 L 820 200 L 820 520 L 180 520 Z" fill="#1E1A16" opacity={0.8 * storeIn} />
              <DrawPath d="M 180 200 L 820 200 L 820 520 L 180 520 Z" sec={sec} at={T.store} dur={0.4} stroke={ink.line} width={6} />
              {[300, 410].map((by) => (
                <DrawPath key={by} d={`M 180 ${by} L 820 ${by}`} sec={sec} at={T.store + 0.15} dur={0.25} stroke={ink.line} width={5} />
              ))}
              {STORE_SPINES.map((sp) => {
                const t0 = T.store + 0.2 + sp.idx * 0.006;
                if (sec < t0) {
                  return null;
                }
                const baseY = [300, 410, 520][sp.row];
                const drop = (1 - eo(sec, t0, t0 + 0.12)) * 18;
                return (
                  <path
                    key={sp.idx}
                    d={rr(sp.x, baseY - sp.h - drop, sp.w, sp.h, 0.8, sp.idx + 3)}
                    fill={sp.color}
                    stroke="#0B0A09"
                    strokeWidth={2.5}
                    opacity={0.9}
                  />
                );
              })}
              {/* 平台 */}
              <path d="M 120 560 L 880 560 L 900 600 L 100 600 Z" fill="#3A2E24" opacity={storeIn} />
              <DrawPath d="M 120 560 L 880 560 L 900 600 L 100 600 Z" sec={sec} at={T.store + 0.3} dur={0.35} stroke={ink.line} width={5} />
              <path d={`M 130 600 L 134 ${G} M 870 600 L 866 ${G}`} stroke={ink.line} strokeWidth={6} opacity={storeIn} strokeLinecap="round" />
              {STORE_COVERS.map((cv, k) => {
                const t0 = T.store + 0.35 + k * 0.07;
                if (sec < t0 || (cv.bookIdx !== undefined && sec >= launch[cv.bookIdx])) {
                  return null;
                }
                const sp = pop(sec, t0, 520, 18);
                return (
                  <g key={k} transform={`translate(${cv.x} ${COVER_Y}) rotate(${(k - 2) * 1.6}) scale(${sp})`}>
                    <path d={rr(-56, -78, 112, 156, 1.4, 40 + k)} fill={cv.color} stroke="#0B0A09" strokeWidth={3.5} />
                    <path d="M -56 -78 L -46 -78 L -46 78 L -56 78" fill="#0B0A09" opacity={0.18} />
                  </g>
                );
              })}
            </g>
            {/* 表紙タイトル（ボイル外で可読） */}
            {STORE_COVERS.map((cv, k) => {
              const t0 = T.store + 0.35 + k * 0.07;
              if (sec < t0 || (cv.bookIdx !== undefined && sec >= launch[cv.bookIdx])) {
                return null;
              }
              const sp = pop(sec, t0, 520, 18);
              return (
                <g key={k} transform={`translate(${cv.x} ${COVER_Y}) rotate(${(k - 2) * 1.6}) scale(${sp})`}>
                  {cv.lines.map((ln, li) => (
                    <Hand key={li} x={4} y={-34 + li * 32 + (3 - cv.lines.length) * 14} text={ln} size={28} fill={cv.ink} font={FONT_MARU} />
                  ))}
                </g>
              );
            })}
            {/* POP『話題！』 */}
            {sec >= T.store + 0.7 ? (
              <g transform={`translate(${346 + 40} 372) rotate(${-10 + wob(sec, T.store + 0.7, 8, 2, 3)}) scale(${pop(sec, T.store + 0.7)})`}>
                <path d="M 0 40 L 0 96" stroke={ink.line} strokeWidth={4} />
                <path d="M -52 -30 L -20 -40 L 0 -64 L 20 -40 L 52 -30 L 30 -4 L 40 34 L 0 20 L -40 34 L -30 -4 Z" fill={ink.red} stroke="#0B0A09" strokeWidth={3} />
                <Hand x={0} y={6} text="話題！" size={26} fill="#FFFFFF" />
              </g>
            ) : null}
            {/* 吊り看板『ビジネス書コーナー』（振り子で揺れて止まる） */}
            {sec >= T.corner ? (
              <g transform={`translate(500 58) rotate(${(plateSwing * 180) / Math.PI})`}>
                <g transform={`translate(0 ${(1 - pop(sec, T.corner, 380, 16)) * -120})`}>
                  <path d="M -150 0 L -150 70 M 150 0 L 150 70" stroke={ink.muted} strokeWidth={3} />
                  <path d={rr(-205, 70, 410, 76, 2, 77)} fill={ink.paper} stroke="#0B0A09" strokeWidth={4} filter={boil.url} />
                  <Hand x={0} y={122} text="ビジネス書コーナー" size={42} fill="#0B0A09" font={FONT_MARU} />
                </g>
              </g>
            ) : null}
          </g>
        ) : null}

        {/* 飛んでくる本 → 手の上の山 */}
        <g filter={boil.url}>
          {BOOKS.map((book, i) => {
            const t0 = launch[i];
            if (sec < t0) {
              return null;
            }
            const target = slot(i);
            const f = fly(sec, t0, flightDur[i], srcOf(i), target, i === 0 ? 260 : 190);
            const landed = f.u >= 1;
            const sq = landed ? squash(sec, t0 + flightDur[i]) * 0.12 : 0;
            const rot = landed ? finalRot[i] + stackWob * (i + 1) * 0.7 : lerp(i === 0 ? -300 : -220, finalRot[i], EO(f.u));
            const sc = landed ? 1 : lerp(0.7, 1, EO(f.u));
            return (
              <g key={i} transform={`translate(${f.x} ${f.y}) rotate(${rot}) scale(${sc * (1 + sq)} ${sc * (1 - sq)})`}>
                <BookSlab w={bw} h={bh} book={book} ink="#0B0A09" seed={i + 2} />
              </g>
            );
          })}
        </g>

        {/* 『まとめて』×3 */}
        {sec >= T.matome ? (
          <g transform={`translate(${stackCX - 250} ${handY - 120}) scale(${pop(sec, T.matome, 520, 14)}) rotate(-8)`}>
            <Hand x={0} y={0} text="×3" size={104} fill={ink.yellow} edge="#000000" />
          </g>
        ) : null}

        {/* 『買った』購入タグ（振り子） */}
        {sec >= T.katta ? (
          <g transform={`translate(${tagPivot.x} ${tagPivot.y}) rotate(${(tagTheta * 180) / Math.PI})`} opacity={pop(sec, T.katta, 500, 20)}>
            <path d="M 0 0 L 0 62" stroke={ink.line} strokeWidth={3} />
            <path d={rr(-80, 62, 160, 52, 1.5, 7)} fill={ink.paper} stroke="#0B0A09" strokeWidth={3} />
            <Hand x={0} y={98} text="購入済 ✓" size={28} fill="#0B0A09" />
          </g>
        ) : null}

        {/* 棒人間 */}
        <g filter={boil.url}>
          <Stick p={pose} ink={ink.line} headFill={ink.headFill} face={face} look={look} flip />
        </g>

        {/* 『気分がいい』キラ＋音符 */}
        <Burst sec={sec} at={T.myou + 0.35} x={R.head.x} y={R.head.y} r={120} color={ink.yellow} n={10} />
        {[0, 1, 2].map((i) => {
          const t0 = T.kibun + i * 0.28;
          if (sec < t0 || sec > t0 + 1.6) {
            return null;
          }
          const u = ramp(sec, t0, t0 + 1.5);
          return (
            <Hand
              key={i}
              x={R.head.x - 10 - i * 46 + Math.sin(u * 7 + i) * 14}
              y={R.head.y - 90 - u * 140}
              text="♪"
              size={52}
              fill={i === 1 ? ink.blue : ink.yellow}
              opacity={Math.min(1, u * 5) * (1 - u)}
            />
          );
        })}
        {sec >= T.yone ? (
          <g opacity={pop(sec, T.yone)}>
            <path d={cloud(R.head.x + 90, R.head.y - 165, 86, 44, 9)} fill="#0B0A09" stroke={ink.line} strokeWidth={4} filter={boil.url} />
            <Hand x={R.head.x + 90} y={R.head.y - 153} text="ふふっ" size={38} fill={ink.line} />
          </g>
        ) : null}
      </svg>
    </div>
  );
};

/* ========================================================================== */
/* c02 行動0ページ＋サラダチキン（black）                                     */
/* ========================================================================== */

export const OpusSaladChickenVictory: React.FC<StickmanSceneProps> = ({ sec, cue, theme }) => {
  const boil = useBoil(2.8);
  const ink = inksFor(theme.isLight);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const T = {
    mada: cue('まだ', 0.12),
    page: cue('1ページも', 0.44),
    koudou: cue('行動していない', 1.08),
    kaeri: cue('帰り道', 2.28),
    conv: cue('コンビニ', 2.84),
    nazeka: cue('なぜか', 3.56),
    chicken: cue('サラダチキン', 4.04),
    erande: cue('選んでしまう', 4.72),
    kurai: cue('くらい', 5.32),
    nounai: cue('脳内では', 6.04),
    seikou: cue('成功者', 7.08),
  };
  const G = 800;

  // カメラ：『帰り道』で世界ごと右へ流す（1500px パン）
  const panU = eio(sec, T.kaeri, T.conv + 0.4);
  const WX = -1500 * panU;

  // 棒人間：机の横（ドヤ顔で腰に手）→ 帰り道を小走り → コンビニ前で停止
  const S = 1.3;
  const startX = 1120;
  const stopX = 2440;
  const runU = eio(sec, T.kaeri - 0.05, T.conv + 0.5);
  const worldX = lerp(startX, stopX, runU);
  const running = sec > T.kaeri - 0.05 && runU < 1;
  const facingLeft = sec < T.kaeri - 0.05;
  let pose: StickPose = track(sec, { x: worldX, y: G - HIP_H * S, s: S, ...STAND }, [
    { t: 0, d: 0.3, p: { ls: -40, le: 112, rs: 40, re: -112, lean: -3, head: -6 } },
    { t: T.page + 0.1, d: 0.2, p: { head: 6 } },
    { t: T.koudou + 0.1, d: 0.3, p: { head: -4 } },
    { t: T.conv + 0.5, d: 0.3, p: { ls: -14, le: -6, rs: 14, re: 6, lean: 0, head: 0 } },
    { t: T.nazeka, d: 0.25, p: { head: -14 } },
    { t: T.chicken - 0.05, d: 0.25, p: { ls: 72, le: 20, rs: 60, re: 28, head: 0, lean: 6 } },
    { t: T.chicken + 0.42, d: 0.38, p: { ls: -130, le: -30, rs: 130, re: 30, lean: -4, head: -10, lk: 6, rk: 6 } },
    { t: T.nounai, d: 0.4, soft: true, p: { head: -16, lean: -9 } },
  ]);
  if (running) {
    const dist = (stopX - startX) * runU;
    pose = walk(pose, dist / 150 * Math.PI, 1.25);
    pose.lean += 9;
  }
  const hoistBob = sec > T.chicken + 0.8 ? Math.sin((sec - T.chicken) * 6) * 3 : 0;
  pose = { ...pose, y: pose.y + hoistBob };
  const screenPose = { ...pose, x: pose.x + WX };
  const R = rig(screenPose, facingLeft);

  // ページ数ドラム：『1ページも』で 1 になりかけて 0 に戻る
  const tryRoll = sec < T.page ? 0 : Math.sin(Math.PI * ramp(sec, T.page, T.page + 0.55)) * 0.5 + wob(sec, T.page + 0.55, 0.12, 3.2, 5);
  const redFlash = sec > T.koudou + 0.55 && sec < T.koudou + 1.25 && Math.floor((sec - T.koudou) * 7) % 2 === 0;

  // サラダチキン：店のドアから手元へ飛び、掲げられる
  const door = { x: 2990 + WX, y: 640 };
  const handMid = { x: (R.lH.x + R.rH.x) / 2, y: (R.lH.y + R.rH.y) / 2 };
  const packF = fly(sec, T.chicken, 0.4, door, { x: handMid.x, y: handMid.y - 50 }, 180);
  const packHeld = sec >= T.chicken + 0.4;
  const packPos = packHeld ? { x: handMid.x, y: handMid.y - 56 } : { x: packF.x, y: packF.y };
  const packRot = packHeld ? wob(sec, T.chicken + 0.4, 8, 1.8, 3) + Math.sin(sec * 3) * 2 : lerp(-260, 0, EO(packF.u));
  const spotK = eio(sec, T.chicken + 0.38, T.chicken + 0.7);

  // 付箋『0ページ』が体に貼りつく
  const noteF = fly(sec, T.kurai, 0.36, { x: 160, y: 120 }, { x: (R.sh.x + R.hip.x) / 2, y: (R.sh.y + R.hip.y) / 2 }, 120);
  const noteStuck = sec >= T.kurai + 0.36;

  // 脳内の表彰台（思考雲）
  const cloudK = pop(sec, T.nounai + 0.25, 260, 15);
  const CX = 495;
  const CY = 300;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          {boil.defs}
          <clipPath id={`odo-${uid}`}>
            <rect x={-150} y={-48} width={300} height={96} />
          </clipPath>
          <clipPath id={`cloud-${uid}`}>
            <path d={cloud(CX, CY, 330, 178, 12)} />
          </clipPath>
        </defs>

        {/* ===== ワールド（パンする層） ===== */}
        <g transform={`translate(${WX} 0)`}>
          <g filter={boil.url}>
            {/* 地面 */}
            <DrawPath d={`M 200 ${G + 2} Q 1800 ${G - 6} 3500 ${G + 2}`} sec={sec} at={0.05} dur={0.5} stroke={ink.muted} width={5} />
            {/* 机 */}
            <path d={`M 400 700 Q 650 696 900 700 M 440 700 L 452 ${G} M 860 700 L 848 ${G}`} stroke={ink.line} strokeWidth={7} fill="none" strokeLinecap="round" />
            {/* 本の山（c01 と同じ3冊）＋開いた本 */}
            {BOOKS.map((b, i) => (
              <g key={i} transform={`translate(${650 + (i - 1) * 8} ${700 - 27 - i * 54}) rotate(${[-1.5, 2, -1][i]})`}>
                <BookSlab w={250} h={54} book={b} ink="#0B0A09" seed={i + 2} />
              </g>
            ))}
            <path d="M 650 528 C 600 506, 540 506, 520 520 L 520 534 C 560 526, 610 528, 650 548 Z" fill={ink.paper} stroke="#0B0A09" strokeWidth={3.5} />
            <path d="M 650 528 C 700 506, 760 506, 780 520 L 780 534 C 740 526, 690 528, 650 548 Z" fill={ink.paper} stroke="#0B0A09" strokeWidth={3.5} />
            {/* くもの巣（『行動していない』） */}
            <DrawPath d="M 872 704 L 778 534" sec={sec} at={T.koudou + 0.05} dur={0.25} stroke={ink.muted} width={2.5} />
            <DrawPath d="M 872 704 L 812 560 M 872 704 L 840 548" sec={sec} at={T.koudou + 0.15} dur={0.25} stroke={ink.muted} width={2.5} />
            <DrawPath d="M 826 620 Q 842 612 856 622 M 806 584 Q 830 572 850 588 M 846 660 Q 856 654 864 662" sec={sec} at={T.koudou + 0.3} dur={0.35} stroke={ink.muted} width={2.5} />
            {/* 街灯 */}
            {[1760, 2170].map((lx, i) => (
              <g key={lx}>
                <path d={`M ${lx} ${G} L ${lx + 4} 330 Q ${lx + 6} 300 ${lx + 40} 304`} stroke={ink.muted} strokeWidth={6} fill="none" strokeLinecap="round" />
                <path d={`M ${lx + 26} 310 L ${lx + 56} 310 L ${lx + 50} 326 L ${lx + 32} 326 Z`} fill={ink.yellow} opacity={0.9} />
                <path d={`M ${lx + 30} 326 L ${lx - 50 - i * 6} ${G} L ${lx + 130} ${G} L ${lx + 52} 326 Z`} fill={ink.yellow} opacity={0.07} />
              </g>
            ))}
            {/* コンビニ */}
            <path d={rr(2660, 400, 660, 400, 3, 21)} fill="#0B0A09" stroke={ink.line} strokeWidth={6} />
            <path d={rr(2660, 400, 660, 64, 2, 22)} fill="#2F8F6A" stroke={ink.line} strokeWidth={5} />
            <path d="M 2660 470 L 3320 470" stroke={ink.yellow} strokeWidth={9} />
            <path d={rr(2700, 500, 220, 220, 2, 23)} fill="rgba(255, 236, 160, 0.82)" stroke={ink.line} strokeWidth={4} />
            {[548, 604, 660].map((sy) => (
              <path key={sy} d={`M 2712 ${sy} L 2908 ${sy}`} stroke="#8A6E2E" strokeWidth={4} />
            ))}
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <path key={k} d={rr(2722 + k * 30, 528 + (k % 3) * 56, 20, 18, 1, 30 + k)} fill={['#FF5A4E', '#3DA5FF', '#4E9A3A'][k % 3]} />
            ))}
            {/* 自動ドア（到着で開く） */}
            {(() => {
              const open = eio(sec, T.conv + 0.45, T.conv + 0.9) * 46;
              return (
                <g>
                  <path d="M 2940 520 L 3040 520 L 3040 800 L 2940 800 Z" fill="rgba(255, 244, 196, 0.9)" />
                  <path d={rr(2940 - open, 520, 50, 280, 1.5, 24)} fill="rgba(255, 236, 160, 0.55)" stroke={ink.line} strokeWidth={4} />
                  <path d={rr(2990 + open, 520, 50, 280, 1.5, 25)} fill="rgba(255, 236, 160, 0.55)" stroke={ink.line} strokeWidth={4} />
                </g>
              );
            })()}
            <path d={`M 2930 800 L 2840 ${G + 1} L 3150 ${G + 1} L 3050 800 Z`} fill={ink.yellow} opacity={0.12} />
            <path d={rr(3080, 500, 200, 220, 2, 26)} fill="rgba(255, 236, 160, 0.78)" stroke={ink.line} strokeWidth={4} />
          </g>
          {/* 文字（ボイル外） */}
          <Hand x={2990} y={446} text="コンビニ" size={44} fill="#FFFFFF" />
          <Hand x={3180} y={448} text="24h" size={30} fill={ink.yellow} />

          {/* ページ数ドラム */}
          <g transform="translate(650 330) rotate(-2)">
            <path d={rr(-190, -110, 380, 196, 2.5, 41)} fill={ink.paper} stroke="#0B0A09" strokeWidth={4} filter={boil.url} />
            <Hand x={0} y={-62} text="読んだページ" size={34} fill="#0B0A09" />
            <g clipPath={`url(#odo-${uid})`} transform="translate(0 22)">
              {[0, 1, 2].map((k) => {
                const off = k === 2 ? tryRoll : 0;
                const col = redFlash ? '#E62E2D' : '#0B0A09';
                return (
                  <g key={k} transform={`translate(${(k - 1) * 96} 0)`}>
                    <path d={rr(-40, -46, 80, 92, 1.5, 50 + k)} fill="#F3EFE6" stroke="#0B0A09" strokeWidth={3} />
                    <g transform={`translate(0 ${-off * 96})`}>
                      <Hand x={0} y={26} text="0" size={76} fill={col} font={FONT_MARU} />
                      <Hand x={0} y={122} text="1" size={76} fill="#0B0A09" font={FONT_MARU} />
                    </g>
                  </g>
                );
              })}
            </g>
          </g>
          {sec >= T.koudou + 0.5 ? (
            <g filter={boil.url}>
              <DrawPath
                d="M 440 250 C 470 170, 860 160, 880 260 C 900 360, 520 420, 450 330 C 420 290, 440 240, 520 220"
                sec={sec}
                at={T.koudou + 0.5}
                dur={0.45}
                stroke={ink.red}
                width={8}
              />
            </g>
          ) : null}
        </g>

        {/* ===== スクリーン固定層 ===== */}
        {/* 走りのスピード線 */}
        {running && panU > 0.05 && panU < 0.95 ? (
          <g opacity={0.6}>
            {[0, 1, 2, 3].map((k) => (
              <path
                key={k}
                d={`M ${R.hip.x - 90 - k * 30} ${R.hip.y - 120 + k * 46} L ${R.hip.x - 260 - k * 40} ${R.hip.y - 120 + k * 46}`}
                stroke={ink.line}
                strokeWidth={4}
                strokeLinecap="round"
              />
            ))}
          </g>
        ) : null}

        {/* スポットライト（掲げた瞬間） */}
        {spotK > 0 ? (
          <path
            d={`M ${R.head.x - 40} -20 L ${R.head.x + 40} -20 L ${R.head.x + 230} ${G + 4} L ${R.head.x - 230} ${G + 4} Z`}
            fill={ink.yellow}
            opacity={0.14 * spotK}
          />
        ) : null}

        {/* 『なぜか』？ */}
        {sec >= T.nazeka && sec < T.chicken + 0.2 ? (
          <g opacity={pop(sec, T.nazeka)} transform={`translate(${R.head.x + 30} ${R.head.y - 90}) rotate(${wob(sec, T.nazeka, 14, 2.5, 3)})`}>
            <Hand x={0} y={0} text="？" size={88} fill={ink.yellow} />
          </g>
        ) : null}

        {/* 棒人間 */}
        <g filter={boil.url}>
          <Stick
            p={screenPose}
            ink={ink.line}
            headFill={ink.headFill}
            face={sec < T.kaeri ? 'smug' : sec < T.chicken + 0.4 ? 'neutral' : 'happy'}
            look={0.5}
            flip={facingLeft}
          />
        </g>

        {/* 付箋『0ページ』 */}
        {sec >= T.kurai ? (
          <g
            transform={`translate(${noteStuck ? (R.sh.x + R.hip.x) / 2 : noteF.x} ${noteStuck ? (R.sh.y + R.hip.y) / 2 : noteF.y}) rotate(${noteStuck ? -8 + wob(sec, T.kurai + 0.36, 10, 2.4, 3) : lerp(-90, -8, noteF.u)})`}
          >
            <path d={rr(-62, -36, 124, 72, 1.5, 61)} fill="#FDE047" stroke="#0B0A09" strokeWidth={3} />
            <Hand x={0} y={12} text="0ページ" size={30} fill="#0B0A09" />
          </g>
        ) : null}

        {/* サラダチキン */}
        {sec >= T.chicken ? (
          <g transform={`translate(${packPos.x} ${packPos.y}) rotate(${packRot}) scale(${packHeld ? 0.8 : lerp(0.45, 0.8, packF.u)})`}>
            <ChickenPack ink="#0B0A09" />
          </g>
        ) : null}
        <Burst sec={sec} at={T.chicken + 0.45} x={packPos.x} y={packPos.y} r={170} color={ink.yellow} n={12} />
        {sec >= T.erande ? (
          <g>
            <g filter={boil.url}>
              <DrawPath
                d={`M ${packPos.x - 150} ${packPos.y - 30} C ${packPos.x - 150} ${packPos.y - 120}, ${packPos.x + 160} ${packPos.y - 120}, ${packPos.x + 150} ${packPos.y + 10} C ${packPos.x + 140} ${packPos.y + 110}, ${packPos.x - 160} ${packPos.y + 100}, ${packPos.x - 140} ${packPos.y - 40}`}
                sec={sec}
                at={T.erande}
                dur={0.4}
                stroke={ink.yellow}
                width={6}
              />
            </g>
            <g opacity={pop(sec, T.erande + 0.25)}>
              <Hand x={packPos.x + 250} y={packPos.y + 20} text="ヘルシー！" size={44} fill={ink.yellow} edge="#000000" rot={8} />
            </g>
          </g>
        ) : null}

        {/* 脳内の表彰台 */}
        {sec >= T.nounai ? (
          <g>
            {[0, 1, 2].map((k) => {
              const sp = pop(sec, T.nounai + k * 0.08, 500, 18);
              const bx = lerp(R.head.x - 50, CX + 250, (k + 1) / 4);
              const by = lerp(R.head.y - 60, CY + 150, (k + 1) / 4);
              return <path key={k} d={ring(bx, by, (10 + k * 7) * sp, k + 4)} fill="#0B0A09" stroke={ink.line} strokeWidth={4} />;
            })}
            <g transform={`translate(${CX} ${CY}) scale(${cloudK}) translate(${-CX} ${-CY})`}>
              <path d={cloud(CX, CY, 330, 178, 12)} fill="#0B0A09" stroke={ink.line} strokeWidth={5} filter={boil.url} />
              <g clipPath={`url(#cloud-${uid})`}>
                <g filter={boil.url}>
                  {/* 表彰台 2-1-3 */}
                  <path d={rr(CX - 190, CY + 70, 120, 90, 2, 71)} fill="#B8B2A6" stroke={ink.line} strokeWidth={4} />
                  <path d={rr(CX - 70, CY + 30, 140, 130, 2, 72)} fill={ink.yellow} stroke={ink.line} strokeWidth={4} />
                  <path d={rr(CX + 70, CY + 96, 120, 64, 2, 73)} fill="#C98E5E" stroke={ink.line} strokeWidth={4} />
                  {(() => {
                    const mini: StickPose = {
                      x: CX,
                      y: CY + 30 - HIP_H * 0.55 - Math.abs(Math.sin((sec - T.nounai) * 5)) * 10,
                      s: 0.55,
                      ...STAND,
                      ls: -165,
                      le: 10,
                      rs: 165,
                      re: -10,
                      lh: -12,
                      rh: 12,
                    };
                    const mr = rig(mini);
                    const crown = (
                      <path d="M -26 -26 L -22 -52 L -10 -38 L 0 -58 L 10 -38 L 22 -52 L 26 -26 Z" fill={ink.yellow} stroke={ink.line} strokeWidth={4} strokeLinejoin="round" />
                    );
                    return (
                      <>
                        <Stick p={mini} ink={ink.line} headFill="#0B0A09" face="happy" look={0} hat={crown} width={10} />
                        <g transform={`translate(${(mr.lH.x + mr.rH.x) / 2} ${mr.lH.y - 22}) scale(0.34)`}>
                          <ChickenPack ink="#0B0A09" />
                        </g>
                      </>
                    );
                  })()}
                </g>
                <Hand x={CX - 130} y={CY + 140} text="2" size={44} fill="#0B0A09" font={FONT_MARU} />
                <Hand x={CX} y={CY + 122} text="1" size={60} fill="#0B0A09" font={FONT_MARU} />
                <Hand x={CX + 130} y={CY + 145} text="3" size={40} fill="#0B0A09" font={FONT_MARU} />
                {/* 紙吹雪（重力＋ひらひら） */}
                {Array.from({ length: 26 }, (_, i) => {
                  const t0 = T.nounai + 0.35 + rnd(i) * 0.5;
                  if (sec < t0) {
                    return null;
                  }
                  const t = sec - t0;
                  const x = CX - 300 + rnd(i + 40) * 600 + Math.sin(t * 5 + i) * 18;
                  const y = CY - 200 + t * 90 + 0.5 * 160 * t * t;
                  const col = [ink.yellow, ink.red, ink.blue, '#4ADE80'][i % 4];
                  return (
                    <rect
                      key={i}
                      x={x}
                      y={y}
                      width={12}
                      height={7 + Math.abs(Math.sin(t * 8 + i)) * 7}
                      fill={col}
                      transform={`rotate(${t * 300 + i * 40} ${x + 6} ${y + 5})`}
                    />
                  );
                })}
              </g>
            </g>
          </g>
        ) : null}
        <SvgStamp sec={sec} at={T.seikou} x={CX - 30} y={CY + 245} text="成功者（脳内）" color={ink.red} rot={-6} size={58} />
      </svg>
    </div>
  );
};

/* ========================================================================== */
/* c03 積ん読タワーに吸収 → 元の生活（black）                                 */
/* ========================================================================== */

const TOWER = Array.from({ length: 13 }, (_, k) => ({
  w: 170 + Math.round(rnd(k + 200) * 80),
  dx: Math.round((rnd(k + 300) - 0.5) * 22),
  rot: (rnd(k + 400) - 0.5) * 4,
  color: ['#7C6A58', '#5E7A8C', '#8C5E5E', '#6B7F5A', '#9A8A6A', '#4F5D73', '#7A5C7A'][k % 7],
}));

export const OpusTsundokuAbsorb: React.FC<StickmanSceneProps> = ({ sec, cue, theme }) => {
  const boil = useBoil(2.8);
  const ink = inksFor(theme.isLight);
  const T = {
    tokoro: cue('ところが', 0.12),
    week: cue('1週間後', 0.6),
    sonohon: cue('その本は', 1.64),
    bed: cue('ベッドわき', 2.44),
    tower: cue('つんどくタワー', 3.16),
    kyuu: cue('吸収され', 4.12),
    moto: cue('元の生活', 5.16),
    kirei: cue('きれいに', 6.12),
    fukkatsu: cue('復活します', 6.6),
  };
  const G = 800;

  // 日めくり：7枚が重力でちぎれ落ちて「1週間後」
  const flipStart = T.tokoro + 0.05;
  const flipEnd = Math.max(flipStart + 0.7, T.week + 0.7);
  const flipStep = (flipEnd - flipStart) / 7;
  const flipsDone = sec < flipStart ? 0 : Math.min(7, Math.floor((sec - flipStart) / flipStep) + 1);
  const calK = eio(sec, T.sonohon, T.sonohon + 0.55);
  const calX = lerp(960, 230, calK);
  const calY = lerp(250, 165, calK);
  const calS = lerp(1, 0.5, calK);

  // 床の3冊（c01 の本）→ タワーへ吸収
  const floor = BOOKS.map((b, i) => ({ b, x: 640 + (i - 1) * 6, y: G - 22 - i * 44, rot: [-3, 2, -1.5][i] }));
  const TX = 1150;
  const towerTop = G - TOWER.length * 34;
  const absorbAt = [T.kyuu, T.kyuu + 0.16, T.kyuu + 0.32];
  const absorbDur = 0.42;
  const lastLand = absorbAt[2] + absorbDur;
  const gulp = sec < lastLand ? 0 : Math.exp(-3.2 * (sec - lastLand)) * Math.cos((sec - lastLand) * 11);
  const towerSY = 1 - 0.08 * gulp - absorbAt.reduce((acc, t) => acc + (sec >= t + absorbDur ? squash(sec, t + absorbDur) * 0.04 : 0), 0);
  const towerRot = wob(sec, lastLand, 4.5, 0.85, 0.75) + Math.sin(sec * 1.3) * 0.5;

  // ソファ＋スマホの棒人間
  const sofaK = pop(sec, T.moto, 300, 20);
  const sofaX = lerp(-520, 0, sofaK);
  const S = 1.25;
  const lounge: StickPose = {
    x: 420 + sofaX,
    y: 690,
    s: S,
    lean: -36,
    head: 12 + Math.sin(sec * 1.6) * 3,
    ls: 108 + Math.sin(sec * 5) * 2,
    le: 64,
    rs: 98,
    re: 76,
    lh: 84,
    lk: 4,
    rh: 88,
    rk: -6,
  };
  const LR = rig(lounge);
  const phonePos = { x: (LR.lH.x + LR.rH.x) / 2 + 8, y: (LR.lH.y + LR.rH.y) / 2 - 18 };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>{boil.defs}</defs>

        <g filter={boil.url}>
          <DrawPath d={`M 160 ${G + 2} Q 960 ${G - 6} 1800 ${G + 2}`} sec={sec} at={0.05} dur={0.5} stroke={ink.muted} width={5} />
        </g>

        {/* 日めくりカレンダー */}
        <g transform={`translate(${calX} ${calY}) scale(${calS})`}>
          <g filter={boil.url}>
            <path d="M 0 -170 L 0 -146" stroke={ink.muted} strokeWidth={5} />
            <path d={rr(-140, -150, 280, 320, 2.5, 81)} fill="#2A2724" stroke={ink.line} strokeWidth={5} />
            <path d={rr(-124, -110, 248, 264, 2, 82)} fill={ink.paper} stroke="#0B0A09" strokeWidth={3} />
            {[-80, -27, 27, 80].map((rx) => (
              <path key={rx} d={ring(rx, -128, 9, rx)} fill="none" stroke={ink.line} strokeWidth={4} />
            ))}
          </g>
          {flipsDone < 7 ? (
            <>
              <Hand x={0} y={60} text={String(flipsDone + 1)} size={150} fill="#0B0A09" font={FONT_MARU} />
              <Hand x={0} y={-62} text="日目" size={34} fill="#57534E" />
            </>
          ) : (
            <g transform={`scale(${pop(sec, flipStart + 7 * flipStep - flipStep, 520, 14)})`}>
              <Hand x={0} y={-20} text="1週間" size={64} fill="#E62E2D" font={FONT_MARU} />
              <Hand x={0} y={70} text="後" size={74} fill="#E62E2D" font={FONT_MARU} />
            </g>
          )}
          {/* ちぎれて落ちるページ（重力） */}
          {Array.from({ length: 7 }, (_, k) => {
            const t0 = flipStart + k * flipStep;
            if (sec < t0 || sec > t0 + 1.0) {
              return null;
            }
            const t = sec - t0;
            const vx = (rnd(k + 90) - 0.3) * 520;
            const x = vx * t;
            const y = -40 * t + 0.5 * 2400 * t * t;
            const rot = (rnd(k + 70) - 0.5) * 900 * t;
            return (
              <g key={k} transform={`translate(${x} ${y + 20}) rotate(${rot})`} opacity={1 - ramp(sec, t0 + 0.5, t0 + 1.0)}>
                <path d={rr(-124, -130, 248, 264, 2, 83 + k)} fill={ink.paper} stroke="#0B0A09" strokeWidth={3} />
                <Hand x={0} y={40} text={String(k + 1)} size={150} fill="#0B0A09" font={FONT_MARU} />
              </g>
            );
          })}
        </g>

        {/* ベッド（スライドイン） */}
        {sec >= T.bed ? (
          <g transform={`translate(${lerp(640, 0, pop(sec, T.bed, 260, 22))} 0)`} filter={boil.url}>
            <path d={rr(1290, 660, 500, 70, 2, 91)} fill="#2A2724" stroke={ink.line} strokeWidth={5} />
            <path d="M 1300 664 C 1400 640, 1520 676, 1620 650 C 1680 636, 1720 650, 1730 664" stroke={ink.blue} strokeWidth={6} fill="none" />
            <path d={rr(1640, 616, 120, 48, 2, 92)} fill={ink.paper} stroke={ink.line} strokeWidth={4} />
            <path d="M 1772 560 L 1782 800 M 1300 730 L 1296 800 M 1772 560 Q 1790 556 1796 572 L 1798 800" stroke={ink.line} strokeWidth={7} fill="none" strokeLinecap="round" />
          </g>
        ) : null}

        {/* 積ん読タワー（下から積み上がり、吸収でゴクン・ぐらり） */}
        {sec >= T.bed + 0.2 ? (
          <g transform={`translate(${TX} ${G}) rotate(${towerRot}) scale(1 ${towerSY})`} filter={boil.url}>
            {TOWER.map((bk, k) => {
              const t0 = T.bed + 0.25 + k * 0.065;
              if (sec < t0) {
                return null;
              }
              const drop = 1 - eo(sec, t0, t0 + 0.16);
              const y = -17 - k * 34 - drop * 90;
              return (
                <g key={k} transform={`translate(${bk.dx} ${y}) rotate(${bk.rot})`} opacity={Math.min(1, (sec - t0) * 10)}>
                  <path d={rr(-bk.w / 2, -16, bk.w, 32, 1.4, 100 + k)} fill={bk.color} stroke="#0B0A09" strokeWidth={3.5} />
                  <path d={`M ${-bk.w / 2 + 12} -10 L ${-bk.w / 2 + 12} 10 M ${bk.w / 2 - 12} -10 L ${bk.w / 2 - 12} 10`} stroke="#0B0A09" strokeOpacity={0.35} strokeWidth={2.5} />
                </g>
              );
            })}
            {/* 吸収された3冊（タワー最上段に合流） */}
            {floor.map((f, i) => {
              const k = 2 - i;
              const landAt = absorbAt[k] + absorbDur;
              if (sec < landAt) {
                return null;
              }
              return (
                <g key={i} transform={`translate(${(k - 1) * 8} ${-TOWER.length * 34 - 22 - k * 44}) rotate(${[1.5, -2, 2.5][k]})`}>
                  <BookSlab w={220} h={44} book={f.b} ink="#0B0A09" seed={i + 2} />
                </g>
              );
            })}
          </g>
        ) : null}

        {/* 床の3冊 → 放物線でタワーへ */}
        <g filter={boil.url}>
          {floor.map((f, i) => {
            const k = 2 - i;
            const t0 = absorbAt[k];
            if (sec >= t0 + absorbDur) {
              return null;
            }
            const target = { x: TX + (k - 1) * 8, y: G + (-TOWER.length * 34 - 22 - k * 44) };
            const fl = fly(sec, t0, absorbDur, { x: f.x, y: f.y }, target, 260);
            const moving = sec >= t0;
            const rot = moving ? lerp(f.rot, f.rot + 360, EO(fl.u)) : f.rot;
            const x = moving ? fl.x : f.x;
            const y = moving ? fl.y : f.y;
            return (
              <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`} opacity={Math.min(1, sec * 6)}>
                <BookSlab w={220} h={44} book={f.b} ink="#0B0A09" seed={i + 2} />
              </g>
            );
          })}
          {/* 『その本は』チョーク丸 */}
          {sec < T.kyuu ? (
            <DrawPath
              d="M 470 690 C 470 610, 820 600, 820 690 C 822 770, 520 790, 480 740 C 466 720, 470 690, 500 676"
              sec={sec}
              at={T.sonohon + 0.1}
              dur={0.4}
              stroke={ink.yellow}
              width={6}
            />
          ) : null}
        </g>
        <Puff sec={sec} at={lastLand} x={TX} y={G} color={ink.muted} spread={170} />

        {/* ラベル・擬音 */}
        {sec >= T.tower ? (
          <g opacity={pop(sec, T.tower)}>
            <g filter={boil.url}>
              <DrawPath d={`M 1430 430 C 1380 420, 1330 410, ${TX + 110} ${towerTop + 40}`} sec={sec} at={T.tower + 0.1} dur={0.3} stroke={ink.yellow} width={6} />
            </g>
            <Hand x={1560} y={450} text="積ん読タワー" size={50} fill={ink.yellow} edge="#000000" rot={-3} />
          </g>
        ) : null}
        {sec >= lastLand && sec < lastLand + 1.4 ? (
          <g transform={`translate(${TX - 230} ${towerTop - 90}) scale(${pop(sec, lastLand, 520, 12)}) rotate(-12)`} opacity={1 - ramp(sec, lastLand + 1.0, lastLand + 1.4)}>
            <Hand x={0} y={0} text="ゴクン" size={70} fill={ink.line} edge="#000000" />
          </g>
        ) : null}

        {/* ソファ＋スマホ（元の生活） */}
        {sec >= T.moto ? (
          <g>
            <g filter={boil.url}>
              <g transform={`translate(${sofaX} 0)`}>
                <path d={rr(230, 690, 470, 70, 2, 111)} fill="#5A3E36" stroke={ink.line} strokeWidth={5} />
                <path d={rr(200, 600, 90, 160, 2, 112)} fill="#6B4A40" stroke={ink.line} strokeWidth={5} />
                <path d={rr(640, 650, 80, 110, 2, 113)} fill="#6B4A40" stroke={ink.line} strokeWidth={5} />
                <path d="M 240 760 L 236 798 M 690 760 L 694 798" stroke={ink.line} strokeWidth={7} strokeLinecap="round" />
              </g>
              <Stick p={lounge} ink={ink.line} headFill={ink.headFill} face="blank" look={0.9} />
            </g>
            {/* スマホの光が顔を照らす */}
            <path
              d={`M ${phonePos.x - 10} ${phonePos.y - 30} L ${LR.head.x - 20} ${LR.head.y - 40} L ${LR.head.x - 10} ${LR.head.y + 40} L ${phonePos.x - 10} ${phonePos.y + 30} Z`}
              fill="#7FC8FF"
              opacity={0.16 + Math.sin(sec * 7) * 0.03}
            />
            <g transform={`translate(${phonePos.x} ${phonePos.y}) rotate(-28)`}>
              <Phone ink={ink.line} sec={sec} />
            </g>
          </g>
        ) : null}

        {/* 『きれいに』キラ＋復元矢印 */}
        {sec >= T.kirei ? (
          <g>
            {[
              [300, 820],
              [560, 640],
              [760, 600],
              [180, 560],
            ].map(([x, y], i) => {
              const sp = pop(sec, T.kirei + i * 0.1);
              const tw = 0.7 + 0.3 * Math.sin(sec * 6 + i * 2);
              return <path key={i} d={sparkPath(x, y, 22 * sp * tw)} fill={ink.yellow} />;
            })}
            <g filter={boil.url}>
              <DrawPath d="M 760 520 C 700 420, 260 420, 190 540 C 150 610, 170 700, 220 760" sec={sec} at={T.kirei + 0.1} dur={0.5} stroke={ink.yellow} width={7} />
              <DrawPath d="M 196 736 L 222 768 L 250 738" sec={sec} at={T.kirei + 0.6} dur={0.15} stroke={ink.yellow} width={7} />
            </g>
          </g>
        ) : null}
        <SvgStamp sec={sec} at={T.fukkatsu} x={560} y={360} text="元の生活・復活" color={ink.red} rot={-7} size={56} />
      </svg>
    </div>
  );
};

/* ========================================================================== */
/* c10 94研究メタ分析 ＆ If-Then（grid_paper）                                */
/* ========================================================================== */

export const OpusIfThenMeta: React.FC<StickmanSceneProps> = ({ sec, cue, theme, resolveAsset }) => {
  const boil = useBoil(2.2, 0.022);
  const ink = inksFor(theme.isLight);
  const T = {
    golw: cue('ゴルヴィッツァー', 0.0),
    sheeran: cue('シーラン', 0.8),
    n94: cue('94の研究', 1.68),
    matome: cue('まとめた', 2.8),
    meta: cue('メタ分析', 3.28),
    goal: cue('目標達成率', 4.96),
    ookiku: cue('大きく', 6.24),
    oshi: cue('押し上げた', 6.56),
    moti: cue('モチベーション', 7.52),
    dewanaku: cue('ではなく', 8.8),
    moshi: cue('もしエックス', 9.76),
    okitara: cue('起きたら', 10.72),
    wai: cue('ワイをする', 11.28),
    gutai: cue('具体的な', 12.72),
    jouken: cue('条件分岐', 13.44),
    sekkei: cue('設計でした', 14.16),
    deshita: cue('でした', 14.4),
  };
  const photo = resolveAsset('person_gollwitzer');

  // フェーズ1 → 2：出典クラスタを左上へ縮めて「根拠」として常駐
  const shrink = eio(sec, T.goal - 0.5, T.goal + 0.2);
  const ph = {
    x: lerp(170, 104, shrink),
    y: lerp(120, 64, shrink),
    w: lerp(340, 232, shrink),
    h: lerp(420, 292, shrink),
  };
  const cardT = `translate(${lerp(0, 450 - 730, shrink)} ${lerp(0, 160 - 300, shrink)})`;
  const cardS = lerp(1, 0.5, shrink);
  const bundleK = lerp(1, 0.34, shrink);
  const bundleTx = lerp(0, 650 - 1350 * 0.34, shrink);
  const bundleTy = lerp(0, 150 - 330 * 0.34, shrink);

  // 94 枚の論文シート
  const COLS = 14;
  const sheetAt = (i: number) => T.n94 + i * 0.011;
  const gatherAt = (i: number) => T.matome + i * 0.004;
  const BUNDLE = { x: 1350, y: 330 };

  // ゲージ（目標達成率）
  const tubeX = 1540;
  const tubeTop = 190;
  const tubeBot = 790;
  const pumpK = eio(sec, T.moti + 0.5, T.moti + 1.2) * (1 - eio(sec, T.dewanaku - 0.2, T.dewanaku + 0.3));
  const surge = BACK(ramp(sec, T.gutai, T.gutai + 0.9));
  const level = (sec < T.goal + 0.3 ? 0 : 0.18) + 0.07 * pumpK + Math.sin(sec * 9) * 0.006 * pumpK + 0.7 * surge;
  const liquidTop = tubeBot - level * (tubeBot - tubeTop - 20);

  // フローチャート
  const DIA = { x: 560, y: 610, hw: 190, hh: 120 };
  const BOX = { x: 900, y: 545, w: 340, h: 130 };

  // 小さな棒人間：入口の線を歩き → 『起きたら』で立ち止まり → 菱形（IF）の稜線をよじ登って越え → YES 矢印を渡って Y の前へ
  const S = 0.6;
  const lineY = DIA.y;
  const pathB: Pt[] = [
    { x: DIA.x - DIA.hw - 8, y: DIA.y },
    { x: DIA.x, y: DIA.y - DIA.hh },
    { x: DIA.x + DIA.hw, y: DIA.y },
    { x: BOX.x - 34, y: DIA.y },
  ];
  const segLens = pathB.slice(1).map((q, k) => Math.hypot(q.x - pathB[k].x, q.y - pathB[k].y));
  const pathLen = segLens.reduce((a, b) => a + b, 0);
  const uA = eio(sec, T.moshi + 0.4, T.okitara);
  const uB = eio(sec, T.wai, T.gutai);
  const distA = (pathB[0].x - 230) * uA;
  let feet: Pt = { x: lerp(230, pathB[0].x, uA), y: lineY };
  let slope = 0;
  if (sec >= T.wai) {
    let rem = uB * pathLen;
    let k = 0;
    while (k < segLens.length - 1 && rem > segLens[k]) {
      rem -= segLens[k];
      k += 1;
    }
    const a = pathB[k];
    const b = pathB[k + 1];
    const t = segLens[k] > 0 ? Math.min(1, rem / segLens[k]) : 1;
    feet = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    slope = uB > 0 && uB < 1 ? (b.y - a.y) / Math.max(1, Math.abs(b.x - a.x)) : 0;
  }
  const walking = (sec > T.moshi + 0.4 && sec < T.okitara) || (sec > T.wai && sec < T.gutai);
  let mini: StickPose = track(sec, { x: feet.x, y: feet.y - HIP_H * S, s: S, ...STAND }, [
    { t: T.okitara, d: 0.25, p: { head: -12, ls: -40, rs: 40 } },
    { t: T.wai, d: 0.2, p: { head: 0, ls: -12, rs: 14 } },
    { t: T.deshita, d: 0.35, p: { ls: -165, le: 8, rs: 165, re: -8, head: -10 } },
  ]);
  if (walking) {
    mini = walk(mini, ((distA + uB * pathLen) / 70) * Math.PI, 1);
    mini.lean += -slope * 14;
  }
  if (sec > T.deshita) {
    mini.y -= Math.abs(Math.sin((sec - T.deshita) * 6.5)) * 18 * Math.exp(-0.6 * (sec - T.deshita));
  }
  const showMini = sec >= T.moshi + 0.3;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {photo ? (
        <PhotoScrap
          src={photo.src}
          sec={sec}
          at={T.golw + 0.05}
          x={ph.x}
          y={ph.y}
          w={ph.w}
          h={ph.h}
          rot={-4}
          polarity="grid_paper"
          labelJa="ゴルヴィッツァー"
          objectPosition={photo.item.objectPosition}
          durationSec={16}
          z={2}
        />
      ) : null}

      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, overflow: 'visible', zIndex: 3 }}>
        <defs>{boil.defs}</defs>

        {/* ---------- フェーズ1：シーラン名札 ---------- */}
        {sec >= T.sheeran ? (
          <g transform={`${cardT} translate(730 300) scale(${cardS * pop(sec, T.sheeran)}) rotate(3) translate(-730 -300)`}>
            <Hand x={560} y={318} text="&" size={80} fill={ink.muted} />
            <g filter={boil.url}>
              <path d={rr(600, 200, 260, 200, 2, 121)} fill={ink.paper} stroke={ink.line} strokeWidth={4} />
              {[268, 300, 332, 364].map((y) => (
                <path key={y} d={`M 616 ${y} L 844 ${y}`} stroke={ink.blue} strokeOpacity={0.25} strokeWidth={2} />
              ))}
              <path d="M 600 232 L 860 232" stroke={ink.red} strokeOpacity={0.45} strokeWidth={2.5} />
            </g>
            <Hand x={730} y={316} text="シーラン" size={52} fill={ink.line} />
          </g>
        ) : null}

        {/* ---------- フェーズ1：94枚 → 束ねる → メタ分析 ---------- */}
        <g transform={`translate(${bundleTx} ${bundleTy}) scale(${bundleK})`}>
          <g filter={boil.url}>
            {Array.from({ length: 94 }, (_, i) => {
              const t0 = sheetAt(i);
              if (sec < t0) {
                return null;
              }
              const c = i % COLS;
              const r = Math.floor(i / COLS);
              const home = { x: 960 + c * 58, y: 140 + r * 62 };
              const appear = eo(sec, t0, t0 + 0.14);
              const g0 = gatherAt(i);
              const gf = fly(sec, g0, 0.38, home, { x: BUNDLE.x + (rnd(i) - 0.5) * 4, y: BUNDLE.y - i * 0.9 }, 80);
              const gathered = sec >= g0;
              const x = gathered ? gf.x : home.x;
              const y = gathered ? gf.y : home.y - (1 - appear) * 20;
              const rot = gathered ? lerp((rnd(i + 5) - 0.5) * 14, (rnd(i + 9) - 0.5) * 1.2, gf.u) : (rnd(i + 5) - 0.5) * 14;
              const sc = gathered ? lerp(1, 4.2, EO(gf.u)) : appear;
              return (
                <g key={i} transform={`translate(${x} ${y}) rotate(${rot}) scale(${sc})`}>
                  <path
                    d="M -19 -24 C -6 -25, 9 -25, 19 -23 C 20 -7, 20 9, 19 24 C 6 25, -7 25, -19 23 C -20 7, -20 -9, -19 -24 Z"
                    fill={ink.paper}
                    stroke={gathered && gf.u >= 1 && i < 93 ? '#A39C92' : ink.line}
                    strokeWidth={(gathered && gf.u >= 1 && i < 93 ? 1.2 : 2.6) / Math.max(1, sc * 0.6)}
                  />
                  <path d="M -11 -11 L 11 -11 M -11 -1 L 11 -1 M -11 9 L 5 9" stroke={ink.muted} strokeWidth={2.2 / Math.max(1, sc * 0.6)} />
                </g>
              );
            })}
            {/* ダブルクリップ */}
            {sec >= T.matome + 0.78 ? (
              <g transform={`translate(${BUNDLE.x} ${BUNDLE.y - 190 - (1 - pop(sec, T.matome + 0.78, 600, 18)) * 60})`}>
                <path d="M -50 0 L 50 0 L 40 34 L -40 34 Z" fill={ink.line} stroke={ink.line} strokeWidth={3} />
                <path d="M -30 0 C -40 -40, -10 -56, 0 -40 M 30 0 C 40 -40, 10 -56, 0 -40" stroke={ink.muted} strokeWidth={5} fill="none" />
              </g>
            ) : null}
          </g>
          {sec >= T.n94 + 0.15 ? (
            <g transform={`translate(${BUNDLE.x} ${sec >= T.matome ? 620 : 660}) scale(${pop(sec, T.n94 + 0.15, 520, 15)})`}>
              <Hand x={-60} y={0} text="94" size={150} fill={ink.red} font={FONT_MARU} edge="#F4F5F7" />
              <Hand x={110} y={-6} text="の研究" size={52} fill={ink.line} edge="#F4F5F7" />
            </g>
          ) : null}
          {sec >= T.meta ? (
            <g transform={`translate(${BUNDLE.x + 210} ${BUNDLE.y - 40}) rotate(${6 + wob(sec, T.meta, 10, 2, 3)}) scale(${pop(sec, T.meta)})`}>
              <path d="M -116 -14 L 0 -14" stroke={ink.line} strokeWidth={3} />
              <path d={rr(0, -46, 200, 70, 1.5, 131)} fill="#FDE68A" stroke={ink.line} strokeWidth={3.5} />
              <Hand x={100} y={2} text="メタ分析" size={42} fill={ink.line} />
            </g>
          ) : null}
        </g>

        {/* ---------- フェーズ2：目標達成率ゲージ ---------- */}
        {sec >= T.goal ? (
          <g>
            <g filter={boil.url}>
              <DrawPath
                d={`M ${tubeX - 60} ${tubeTop} L ${tubeX - 60} ${tubeBot - 40} C ${tubeX - 60} ${tubeBot + 20}, ${tubeX + 60} ${tubeBot + 20}, ${tubeX + 60} ${tubeBot - 40} L ${tubeX + 60} ${tubeTop}`}
                sec={sec}
                at={T.goal}
                dur={0.5}
                stroke={ink.line}
                width={6}
              />
              {Array.from({ length: 9 }, (_, k) => (
                <DrawPath
                  key={k}
                  d={`M ${tubeX - 60} ${tubeBot - 60 - k * 62} L ${tubeX - 34 + (k % 2 === 0 ? 8 : 0)} ${tubeBot - 60 - k * 62}`}
                  sec={sec}
                  at={T.goal + 0.3 + k * 0.03}
                  dur={0.12}
                  stroke={ink.muted}
                  width={3}
                />
              ))}
            </g>
            {level > 0 ? (
              <g>
                <path
                  d={`M ${tubeX - 54} ${liquidTop} Q ${tubeX - 27} ${liquidTop - 6 + Math.sin(sec * 6) * 4} ${tubeX} ${liquidTop} T ${tubeX + 54} ${liquidTop} L ${tubeX + 54} ${tubeBot - 40} C ${tubeX + 54} ${tubeBot + 12}, ${tubeX - 54} ${tubeBot + 12}, ${tubeX - 54} ${tubeBot - 40} Z`}
                  fill={ink.blue}
                  opacity={0.5}
                />
                {Array.from({ length: 7 }, (_, k) => {
                  const cyc = (sec * (0.5 + rnd(k) * 0.4) + rnd(k + 20)) % 1;
                  const by = lerp(tubeBot - 20, liquidTop + 10, cyc);
                  return by > liquidTop + 6 ? (
                    <path key={k} d={ring(tubeX - 36 + rnd(k + 30) * 72, by, 4 + rnd(k + 40) * 4, k)} fill="none" stroke="#FFFFFF" strokeWidth={2.5} opacity={0.8} />
                  ) : null;
                })}
              </g>
            ) : null}
            <g opacity={pop(sec, T.goal + 0.1)}>
              <Hand x={tubeX} y={150} text="目標達成率" size={46} fill={ink.line} edge="#F4F5F7" />
            </g>
          </g>
        ) : null}

        {/* 『大きく』押し上げたのは？ ghost 矢印 */}
        {sec >= T.ookiku && sec < T.moshi + 0.4 ? (
          <g opacity={1 - ramp(sec, T.moshi, T.moshi + 0.4)}>
            <g filter={boil.url}>
              <DrawPath d={`M ${tubeX + 150} 720 C ${tubeX + 170} 560, ${tubeX + 160} 400, ${tubeX + 150} 250`} sec={sec} at={T.ookiku} dur={0.5} stroke={ink.muted} width={6} dash="16 14" />
              <DrawPath d={`M ${tubeX + 120} 286 L ${tubeX + 150} 246 L ${tubeX + 182} 284`} sec={sec} at={T.ookiku + 0.45} dur={0.15} stroke={ink.muted} width={6} />
            </g>
            <g transform={`translate(${tubeX + 210} 230) rotate(${wob(sec, T.oshi, 16, 2.4, 2.2)}) scale(${pop(sec, T.ookiku + 0.4)})`}>
              <Hand x={0} y={0} text="？" size={96} fill={ink.red} />
            </g>
          </g>
        ) : null}

        {/* モチベーション（炎）→ ポンプしても少ししか上がらない → ✕ → 落下 */}
        {sec >= T.moti && sec < T.dewanaku + 1.6 ? (
          (() => {
            const fallT = Math.max(0, sec - (T.dewanaku + 0.45));
            const fy = 0.5 * 2600 * fallT * fallT;
            const frot = fallT * 60;
            const fop = 1 - ramp(sec, T.dewanaku + 0.9, T.dewanaku + 1.5);
            const pumpS = 1 + (sec > T.moti + 0.4 && sec < T.dewanaku ? Math.abs(Math.sin((sec - T.moti) * 9)) * 0.08 : 0);
            return (
              <g opacity={fop}>
                {/* ホース */}
                {fallT === 0 ? (
                  <g filter={boil.url}>
                    <DrawPath d={`M 1180 470 C 1300 470, 1330 700, ${tubeX - 60} 700`} sec={sec} at={T.moti + 0.3} dur={0.35} stroke={ink.muted} width={9} />
                  </g>
                ) : null}
                <g transform={`translate(980 ${460 + fy}) rotate(${frot}) scale(${pop(sec, T.moti, 360, 16)})`}>
                  <g filter={boil.url}>
                    <path d={rr(-200, -170, 400, 330, 2.5, 141)} fill={ink.paper} stroke={ink.line} strokeWidth={4.5} />
                    <g transform={`translate(0 -30) scale(${pumpS})`}>
                      <Flame sec={sec} scale={0.95} />
                    </g>
                  </g>
                  <Hand x={0} y={124} text="モチベーション" size={42} fill={ink.line} />
                  {sec >= T.dewanaku ? (
                    <g filter={boil.url}>
                      <DrawPath d="M -170 -140 L 170 140" sec={sec} at={T.dewanaku} dur={0.18} stroke={ink.red} width={16} />
                      <DrawPath d="M 170 -140 L -170 140" sec={sec} at={T.dewanaku + 0.16} dur={0.18} stroke={ink.red} width={16} />
                    </g>
                  ) : null}
                </g>
              </g>
            );
          })()
        ) : null}

        {/* ---------- フェーズ3：If-Then 条件分岐 ---------- */}
        {sec >= T.moshi ? (
          <g>
            <g filter={boil.url}>
              <DrawPath d={`M 200 ${lineY} L ${DIA.x - DIA.hw} ${lineY}`} sec={sec} at={T.moshi} dur={0.3} stroke={ink.line} width={6} />
              <path
                d={`M ${DIA.x} ${DIA.y - DIA.hh} L ${DIA.x + DIA.hw} ${DIA.y} L ${DIA.x} ${DIA.y + DIA.hh} L ${DIA.x - DIA.hw} ${DIA.y} Z`}
                fill="#FFFFFF"
                opacity={eo(sec, T.moshi + 0.15, T.moshi + 0.5)}
              />
              <DrawPath
                d={`M ${DIA.x - DIA.hw} ${DIA.y} L ${DIA.x} ${DIA.y - DIA.hh} L ${DIA.x + DIA.hw} ${DIA.y} L ${DIA.x} ${DIA.y + DIA.hh} Z`}
                sec={sec}
                at={T.moshi + 0.1}
                dur={0.55}
                stroke={ink.line}
                width={6}
              />
            </g>
            <g opacity={pop(sec, T.moshi + 0.2)}>
              <Hand x={270} y={DIA.y + 62} text="もし" size={46} fill={ink.red} rot={-8} edge="#F4F5F7" />
            </g>
            {sec >= T.okitara - 0.35 ? (
              <g opacity={eo(sec, T.okitara - 0.35, T.okitara)}>
                <Hand x={DIA.x - 64} y={DIA.y + 18} text="X" size={66} fill={ink.red} font={FONT_MARU} />
                <Hand x={DIA.x + 46} y={DIA.y + 14} text="が起きた？" size={38} fill={ink.line} />
              </g>
            ) : null}
            <Burst sec={sec} at={T.okitara} x={DIA.x - DIA.hw - 18} y={lineY - 150} r={46} color={ink.red} n={7} />
          </g>
        ) : null}

        {/* 小さな棒人間（菱形の稜線を越えていく） */}
        {showMini ? (
          <g filter={boil.url} opacity={pop(sec, T.moshi + 0.3)}>
            <Stick p={mini} ink={ink.line} headFill={ink.headFill} face={sec >= T.deshita ? 'happy' : sec >= T.okitara ? 'surprised' : 'neutral'} look={0.6} width={11} />
          </g>
        ) : null}

        {sec >= T.wai - 0.1 ? (
          <g>
            <g filter={boil.url}>
              <DrawPath d={`M ${DIA.x + DIA.hw} ${lineY} L ${BOX.x - 6} ${lineY}`} sec={sec} at={T.wai - 0.1} dur={0.3} stroke={ink.red} width={7} />
              <DrawPath d={`M ${BOX.x - 34} ${lineY - 20} L ${BOX.x - 6} ${lineY} L ${BOX.x - 34} ${lineY + 20}`} sec={sec} at={T.wai + 0.18} dur={0.12} stroke={ink.red} width={7} />
              {sec >= T.gutai ? (
                <path
                  d={rr(BOX.x + 8, BOX.y + 10, (BOX.w - 16) * eo(sec, T.gutai, T.gutai + 0.35), BOX.h - 20, 2, 151)}
                  fill="#FDE047"
                  opacity={0.8}
                />
              ) : null}
              <DrawPath d={rr(BOX.x, BOX.y, BOX.w, BOX.h, 2, 152)} sec={sec} at={T.wai + 0.1} dur={0.45} stroke={ink.line} width={6} />
              {sec >= T.gutai ? (
                <DrawPath d={`M ${BOX.x + BOX.w} ${lineY} C ${BOX.x + BOX.w + 120} ${lineY}, ${tubeX - 170} ${lineY + 10}, ${tubeX - 60} ${lineY + 10}`} sec={sec} at={T.gutai} dur={0.35} stroke={ink.blue} width={9} />
              ) : null}
            </g>
            <g opacity={eo(sec, T.wai + 0.15, T.wai + 0.4)}>
              <Hand x={BOX.x + 110} y={lineY + 22} text="Y" size={66} fill={ink.red} font={FONT_MARU} />
              <Hand x={BOX.x + 220} y={lineY + 18} text="をする" size={44} fill={ink.line} />
              <Hand x={(DIA.x + DIA.hw + BOX.x) / 2} y={lineY - 26} text="なら" size={34} fill={ink.red} edge="#F4F5F7" />
            </g>
          </g>
        ) : null}

        {/* 『具体的な条件分岐の設計』＝製図の寸法線 */}
        {sec >= T.jouken ? (
          <g>
            <g filter={boil.url}>
              <DrawPath d={`M ${DIA.x - DIA.hw} 395 L ${BOX.x + BOX.w} 395`} sec={sec} at={T.jouken} dur={0.4} stroke={ink.blue} width={3} />
              <DrawPath d={`M ${DIA.x - DIA.hw} 379 L ${DIA.x - DIA.hw} 411 M ${BOX.x + BOX.w} 379 L ${BOX.x + BOX.w} 411`} sec={sec} at={T.jouken + 0.05} dur={0.15} stroke={ink.blue} width={3} />
              <DrawPath d={`M ${DIA.x - DIA.hw} ${DIA.y} L ${DIA.x - DIA.hw} 411 M ${BOX.x + BOX.w} ${BOX.y} L ${BOX.x + BOX.w} 411`} sec={sec} at={T.jouken + 0.1} dur={0.3} stroke={ink.blue} width={2} dash="6 8" />
            </g>
            <g opacity={eo(sec, T.jouken + 0.2, T.jouken + 0.45)}>
              <Hand x={(DIA.x - DIA.hw + BOX.x + BOX.w) / 2} y={383} text="条件 → 行動" size={32} fill={ink.blue} edge="#F4F5F7" />
            </g>
          </g>
        ) : null}
        <Burst sec={sec} at={T.gutai + 0.6} x={tubeX} y={liquidTop - 30} r={90} color={ink.yellow} n={10} />
        <SvgStamp sec={sec} at={T.sekkei} x={985} y={300} text="条件分岐の設計" color={ink.red} rot={-5} size={54} />
        <Burst sec={sec} at={T.deshita + 0.1} x={mini.x} y={mini.y - 140 * S} r={60} color={ink.red} n={8} />
      </svg>
    </div>
  );
};

/* ========================================================================== */
/* customScenes レジストリ                                                     */
/* ========================================================================== */

export const OPUS_SCENES: Record<string, React.FC<StickmanSceneProps>> = {
  OpusBookstoreHigh,
  OpusSaladChickenVictory,
  OpusTsundokuAbsorb,
  OpusIfThenMeta,
};
