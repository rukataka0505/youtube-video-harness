import React, { useId } from 'react';
import { BoilFilterDef } from '../../_materials';
import { FONT_MARU, useStickmanCollageFonts } from '../fonts';
import { f2, sanitizeSvgId } from '../motionMath';
import { RiggedStickman, STAND_POSE, rig, type StickPose } from '../RiggedStickman';
import {
  BUGURU_CHANNEL_NAME,
  BUGURU_PALETTE,
  BuguruCharacter,
  BuguruGlowFilter,
  BuguruPaperFilter,
  ColorSplit,
  GlitchBlocks,
  SvgSlices,
  TwitchMarks,
  buguruPoseAtHead,
  type BuguruPalette,
  type GlitchBand,
} from './buguruCore';

/* ========================================================================== */
/* 「バグる棒人間」チャンネルバナー（2560×1440・YouTube 推奨規格）               */
/*  全デバイス共通セーフエリア＝中央 1546×423（x 507–2053 / y 508.5–931.5）に   */
/*  チャンネル名・主役キャラ・タグラインを収め、デスクトップ帯（2560×423）と     */
/*  TV 全面（2560×1440）では帯の外側へ世界観を広げる。                          */
/*                                                                            */
/*  slices … 明盤スケッチ。正式アイコンの紙片ずれを横長に引き伸ばした本命路線     */
/*  glitch … 暗盤 glow。光柱の下で発光キャラと RGB ずれロゴ、全幅の走査線        */
/*  lineup … 明盤ノート。整列した普通の棒人間の中で 1 人だけバグっている         */
/* ========================================================================== */

export const BUGURU_BANNER_W = 2560;
export const BUGURU_BANNER_H = 1440;
/** 全デバイス共通セーフエリア（スマホ表示範囲） */
export const BUGURU_BANNER_SAFE = { x: 507, y: 508.5, w: 1546, h: 423 } as const;
export const BUGURU_BANNER_TAGLINE = 'この世界は、バグだらけ。';

export type BuguruBannerVariant = 'slices' | 'glitch' | 'lineup';
export const BUGURU_BANNER_VARIANTS: readonly BuguruBannerVariant[] = ['slices', 'glitch', 'lineup'];

const W = BUGURU_BANNER_W;
const H = BUGURU_BANNER_H;

/* -------------------------------------------------------------------------- */
/* 共通部品                                                                    */
/* -------------------------------------------------------------------------- */

/** チャンネル名（「バグる」＝バグ色、「棒人間」＝墨）。stacked で 2 段組 */
const NameText: React.FC<{
  x: number;
  baseline: number;
  size: number;
  fill: string;
  accent: string;
  stacked?: boolean;
  lineGap?: number;
}> = ({ x, baseline, size, fill, accent, stacked = false, lineGap = 1.06 }) =>
  stacked ? (
    <g fontFamily={FONT_MARU} fontWeight={900} fontSize={size}>
      <text x={x} y={baseline - size * lineGap} fill={accent}>
        {BUGURU_CHANNEL_NAME.slice(0, 3)}
      </text>
      <text x={x} y={baseline} fill={fill}>
        {BUGURU_CHANNEL_NAME.slice(3)}
      </text>
    </g>
  ) : (
    <text x={x} y={baseline} fontFamily={FONT_MARU} fontWeight={900} fontSize={size} fill={fill}>
      <tspan fill={accent}>{BUGURU_CHANNEL_NAME.slice(0, 3)}</tspan>
      <tspan>{BUGURU_CHANNEL_NAME.slice(3)}</tspan>
    </text>
  );

/** 版ズレ刷り（色版 2 枚＋墨版）のチャンネル名。アイキャッチ NamePrint と同じ刷り方 */
const NamePrint: React.FC<{
  pal: BuguruPalette;
  x: number;
  baseline: number;
  size: number;
  split: number;
  stacked?: boolean;
  ghostOpacity?: number;
  inkFilter?: string;
}> = ({ pal, x, baseline, size, split, stacked, ghostOpacity = 0.7, inkFilter }) => (
  <g>
    <g transform={`translate(${f2(-split)} ${f2(-split * 0.25)})`} style={{ mixBlendMode: pal.blend }} opacity={ghostOpacity}>
      <NameText x={x} baseline={baseline} size={size} fill={pal.splitA} accent={pal.splitA} stacked={stacked} />
    </g>
    <g transform={`translate(${f2(split)} ${f2(split * 0.2)})`} style={{ mixBlendMode: pal.blend }} opacity={ghostOpacity}>
      <NameText x={x} baseline={baseline} size={size} fill={pal.splitB} accent={pal.splitB} stacked={stacked} />
    </g>
    <g filter={inkFilter}>
      <NameText x={x} baseline={baseline} size={size} fill={pal.ink} accent={pal.bug} stacked={stacked} />
    </g>
  </g>
);

/** タグライン「この世界は、バグだらけ。」（「バグ」のみバグ色） */
const Tagline: React.FC<{
  x: number;
  baseline: number;
  size: number;
  ink: string;
  accent: string;
  anchor?: 'start' | 'middle' | 'end';
  filter?: string;
}> = ({ x, baseline, size, ink, accent, anchor = 'start', filter }) => (
  <text
    x={x}
    y={baseline}
    fontFamily={FONT_MARU}
    fontWeight={900}
    fontSize={size}
    fill={ink}
    textAnchor={anchor}
    filter={filter}
  >
    この世界は、<tspan fill={accent}>バグ</tspan>だらけ。
  </text>
);

/* ---- 鉛筆の落書き（多ジャンルの手掛かり）：帯の外側＝デスクトップ / TV 専用 ---- */

type DoodleKind = 'dna' | 'gear' | 'dice' | 'bulb' | 'hourglass' | 'atom' | 'bubble';

interface DoodleSpec {
  kind: DoodleKind;
  x: number;
  y: number;
  s: number;
  rot?: number;
  /** バグ（赤×）を添える */
  bug?: boolean;
}

const DoodleShape: React.FC<{ kind: DoodleKind }> = ({ kind }) => {
  switch (kind) {
    case 'dna': {
      const pts = (phase: number) =>
        Array.from({ length: 25 }, (_, i) => {
          const y = -100 + i * (200 / 24);
          const x = Math.sin((i / 24) * Math.PI * 2.2 + phase) * 34;
          return `${i === 0 ? 'M' : 'L'} ${f2(x)} ${f2(y)}`;
        }).join(' ');
      return (
        <g>
          <path d={pts(0)} />
          <path d={pts(Math.PI)} />
          {Array.from({ length: 8 }, (_, i) => {
            const t = (i + 0.5) / 8;
            const y = -100 + t * 200;
            const x = Math.sin(t * Math.PI * 2.2) * 34;
            return <path key={i} d={`M ${f2(x)} ${f2(y)} L ${f2(-x)} ${f2(y)}`} strokeWidth={3} />;
          })}
        </g>
      );
    }
    case 'gear': {
      const teeth = Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        const a0 = a - 0.16;
        const a1 = a + 0.16;
        const p = (ang: number, r: number) => `${f2(Math.cos(ang) * r)} ${f2(Math.sin(ang) * r)}`;
        return `M ${p(a0, 60)} L ${p(a0, 80)} L ${p(a1, 80)} L ${p(a1, 60)}`;
      }).join(' ');
      return (
        <g>
          <circle r={60} />
          <circle r={22} />
          <path d={teeth} />
        </g>
      );
    }
    case 'dice':
      return (
        <g>
          <rect x={-58} y={-58} width={116} height={116} rx={18} />
          {[
            [-28, -28],
            [28, -28],
            [0, 0],
            [-28, 28],
            [28, 28],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={8} fill="currentColor" stroke="none" />
          ))}
        </g>
      );
    case 'bulb':
      return (
        <g>
          <path d="M -26 34 C -60 6 -54 -72 0 -74 C 54 -72 60 6 26 34 Z" />
          <path d="M -24 50 L 24 50 M -20 64 L 20 64 M -12 78 L 12 78" />
          <path d="M -14 34 L -14 4 Q 0 -14 14 4 L 14 34" strokeWidth={3} />
        </g>
      );
    case 'hourglass':
      return (
        <g>
          <path d="M -50 -84 L 50 -84 M -50 84 L 50 84" />
          <path d="M -40 -84 C -40 -30 -6 -14 -6 0 C -6 14 -40 30 -40 84 M 40 -84 C 40 -30 6 -14 6 0 C 6 14 40 30 40 84" />
          <path d="M -22 64 Q 0 40 22 64 Z" fill="currentColor" stroke="none" opacity={0.6} />
        </g>
      );
    case 'atom':
      return (
        <g>
          <ellipse rx={84} ry={30} />
          <ellipse rx={84} ry={30} transform="rotate(60)" />
          <ellipse rx={84} ry={30} transform="rotate(-60)" />
          <circle r={10} fill="currentColor" stroke="none" />
        </g>
      );
    case 'bubble':
      return (
        <g>
          <path d="M -80 -50 Q -80 -76 -54 -76 L 54 -76 Q 80 -76 80 -50 L 80 20 Q 80 46 54 46 L -6 46 L -40 78 L -32 46 L -54 46 Q -80 46 -80 20 Z" />
          <text
            x={0}
            y={14}
            textAnchor="middle"
            fontFamily={FONT_MARU}
            fontWeight={900}
            fontSize={84}
            fill="currentColor"
            stroke="none"
          >
            ?
          </text>
        </g>
      );
    default:
      return null;
  }
};

const Doodles: React.FC<{ items: readonly DoodleSpec[]; color: string; bug: string; filter?: string }> = ({
  items,
  color,
  bug,
  filter,
}) => (
  <g filter={filter}>
    {items.map((d, i) => (
      <g
        key={i}
        transform={`translate(${f2(d.x)} ${f2(d.y)}) rotate(${f2(d.rot ?? 0)}) scale(${f2(d.s)})`}
        fill="none"
        stroke={color}
        color={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <DoodleShape kind={d.kind} />
        {d.bug ? (
          <path d="M 52 -96 L 84 -64 M 84 -96 L 52 -64" stroke={bug} strokeWidth={9} />
        ) : null}
      </g>
    ))}
  </g>
);

/* ========================================================================== */
/* 案A slices：明盤スケッチ × 紙片ずれ（正式アイコンの横長展開）                 */
/* ========================================================================== */

/* 最終入稿版：タグラインなし。キャラ（頭＋上げた両手）とチャンネル名 1 行を   */
/* セーフエリア縦中央（y=720）に揃え、左右の塊もセーフ中央へ寄せる。          */
/* 横幅（1546px）が律速のため、キャラ左端（紙片ずれ込み）〜名前右端を          */
/* セーフ内左右マージン約 36–47px に収める寸法で最大化している。               */
const A_S = 3.4;
const A_HEAD_X = 841;
/** 頭頂ピクッ線〜上げた両手の塊の中心を y=720 に置く */
const A_HEAD_Y = 747;
const A_NAME_X = 1106;
const A_NAME_SIZE = 150;
/** 字面（baseline −0.85em〜+0.09em）の中心を y≈730（頭の中心寄り）に置く */
const A_NAME_BASELINE = 787;

const A_BANDS: readonly GlitchBand[] = [
  { y0: 250, y1: 290, dx: -34 },
  { y0: 612, y1: 646, dx: 40 },
  { y0: 812, y1: 846, dx: -46 },
  { y0: 902, y1: 930, dx: 26 },
  { y0: 1170, y1: 1208, dx: 34 },
];

const A_DOODLES: readonly DoodleSpec[] = [
  { kind: 'dna', x: 250, y: 712, s: 1.25, rot: -8 },
  { kind: 'gear', x: 2290, y: 768, s: 1.0, bug: true },
  { kind: 'dice', x: 2400, y: 860, s: 0.8, rot: 14 },
  { kind: 'bulb', x: 470, y: 250, s: 1.0, rot: -10 },
  { kind: 'hourglass', x: 1450, y: 220, s: 0.9, rot: 8 },
  { kind: 'atom', x: 2120, y: 300, s: 1.05, rot: -6, bug: true },
  { kind: 'bubble', x: 1700, y: 1180, s: 1.05, rot: 4 },
  { kind: 'dice', x: 2300, y: 1210, s: 0.85, rot: -12 },
  { kind: 'atom', x: 230, y: 1190, s: 0.9, rot: 20 },
];

const SlicesBanner: React.FC<{ uid: string }> = ({ uid }) => {
  const pal = BUGURU_PALETTE.sketch;
  const pose = buguruPoseAtHead(A_HEAD_X, A_HEAD_Y, A_S);
  const r = rig(pose);
  const R = 30 * A_S;
  const paperId = `bb-a-paper-${uid}`;
  const boilId = `bb-a-boil-${uid}`;
  const boil2Id = `bb-a-boil2-${uid}`;
  const shadowId = `bb-a-shadow-${uid}`;
  const nameW = A_NAME_SIZE * BUGURU_CHANNEL_NAME.length;

  const construction = (
    <g fill="none" stroke={pal.graphite} strokeWidth={4} strokeLinecap="round" filter={`url(#${boil2Id})`}>
      <ellipse cx={r.head.x + 8} cy={r.head.y - 5} rx={R + 16} ry={R + 9} />
      <path d={`M ${f2(r.head.x - R - 30)} ${f2(r.head.y - 2)} Q ${f2(r.head.x)} ${f2(r.head.y + 14)} ${f2(r.head.x + R + 34)} ${f2(r.head.y - 6)}`} />
      <path d={`M ${f2(r.head.x + 3)} ${f2(r.head.y - R - 32)} Q ${f2(r.head.x + 20)} ${f2(r.head.y)} ${f2(r.head.x + 22)} ${f2(r.head.y + R + 22)}`} />
      <path d={`M ${f2(r.sh.x - 190)} ${f2(r.sh.y + 4)} L ${f2(r.sh.x + 196)} ${f2(r.sh.y - 3)}`} />
      {/* 名前・タグラインの割付け線（鉛筆） */}
      <path d={`M ${A_NAME_X - 24} ${A_NAME_BASELINE + 20} L ${A_NAME_X + nameW + 10} ${A_NAME_BASELINE + 14}`} />
      <path d={`M ${A_NAME_X - 30} ${A_NAME_BASELINE - A_NAME_SIZE + 6} L ${A_NAME_X + nameW} ${A_NAME_BASELINE - A_NAME_SIZE}`} />
    </g>
  );

  const figure = (
    <ColorSplit
      palette={pal}
      dx={9}
      dy={4.5}
      opacity={0.78}
      render={(ink, ghost) => <BuguruCharacter pose={pose} palette={pal} ink={ink} ghost={ghost} width={9.4} />}
    />
  );

  const renderSheet = (y0 = -40, y1 = H + 40) => (
    <g>
      <rect x={-200} y={y0 - 12} width={W + 400} height={y1 - y0 + 24} fill={pal.bg} filter={`url(#${paperId})`} />
      {construction}
      <Doodles items={A_DOODLES} color="rgba(87, 83, 78, 0.42)" bug={pal.bug} filter={`url(#${boil2Id})`} />
      <g filter={`url(#${boilId})`}>{figure}</g>
      <NamePrint pal={pal} x={A_NAME_X} baseline={A_NAME_BASELINE} size={A_NAME_SIZE} split={6} />
    </g>
  );

  return (
    <>
      <defs>
        <BuguruPaperFilter id={paperId} seed={9} />
        <BoilFilterDef id={boilId} seed={3} scale={4.2} freq={0.02} octaves={2} />
        <BoilFilterDef id={boil2Id} seed={8} scale={6} freq={0.016} octaves={2} />
        <filter id={shadowId} x="-10%" y="-40%" width="120%" height="180%">
          <feDropShadow dx={0} dy={7} stdDeviation={5} floodColor="rgba(60, 40, 20, 0.38)" />
        </filter>
        <radialGradient id={`bb-a-sun-${uid}`} cx="14%" cy="6%" r="80%">
          <stop offset="0%" stopColor="rgba(255, 226, 160, 0.30)" />
          <stop offset="60%" stopColor="rgba(255, 226, 160, 0.05)" />
          <stop offset="100%" stopColor="rgba(255, 226, 160, 0)" />
        </radialGradient>
        <radialGradient id={`bb-a-vig-${uid}`} cx="50%" cy="50%" r="72%">
          <stop offset="68%" stopColor="rgba(120, 88, 48, 0)" />
          <stop offset="100%" stopColor="rgba(120, 88, 48, 0.20)" />
        </radialGradient>
      </defs>

      <rect x={0} y={0} width={W} height={H} fill="#E9E0CC" />
      {renderSheet()}
      {A_BANDS.map((b, i) => (
        <g key={i} filter={`url(#${shadowId})`}>
          <SvgSlices bands={[b]} onlyBands>
            {renderSheet(b.y0, b.y1)}
          </SvgSlices>
        </g>
      ))}
      <g stroke="rgba(28, 25, 23, 0.55)" strokeWidth={2.5} strokeDasharray="10 9" fill="none">
        {A_BANDS.map((b, i) => (
          <path key={i} d={`M -40 ${b.y0} L ${W + 40} ${b.y0}`} transform={`translate(${f2(b.dx)} 0)`} />
        ))}
      </g>
      <g filter={`url(#${boilId})`}>
        <TwitchMarks pose={pose} color={pal.bug} width={5.2} />
      </g>
      <rect x={0} y={0} width={W} height={H} fill={`url(#bb-a-sun-${uid})`} />
      <rect x={0} y={0} width={W} height={H} fill={`url(#bb-a-vig-${uid})`} />
    </>
  );
};

/* ========================================================================== */
/* 案B glitch：暗盤 glow × 全幅走査線（アイキャッチ glitch の焼き付きを静止画化）  */
/* ========================================================================== */

const B_S = 2.8;
const B_HEAD_X = 1780;
const B_HEAD_Y = 676;
const B_NAME_X = 560;
const B_NAME_BASELINE = 720;
const B_NAME_SIZE = 150;
const B_TAG_BASELINE = 850;
const B_TAG_SIZE = 66;

/** キャラのスライス帯（顔の目・口の行は避ける） */
const B_FIG_BANDS: readonly GlitchBand[] = [
  { y0: 590, y1: 616, dx: 30 },
  { y0: 742, y1: 770, dx: -34 },
  { y0: 846, y1: 868, dx: 22 },
  { y0: 1040, y1: 1062, dx: -18 },
];
/** 名前のスライス帯（字形が読める程度の小さなずれ） */
const B_NAME_BANDS: readonly GlitchBand[] = [
  { y0: 690, y1: 699, dx: -6 },
];
/** 全幅の走査線（デスクトップ帯の左右端まで世界観を延ばす） */
const B_SCAN_LINES: readonly { y: number; h: number; c: 'A' | 'B'; x0: number; x1: number }[] = [
  { y: 540, h: 3, c: 'A', x0: 0, x1: W },
  { y: 590, h: 4, c: 'B', x0: 1280, x1: W },
  { y: 770, h: 4, c: 'A', x0: 0, x1: W },
  { y: 902, h: 3, c: 'B', x0: 0, x1: W },
  { y: 300, h: 2, c: 'A', x0: 400, x1: 2200 },
  { y: 1180, h: 2, c: 'B', x0: 200, x1: 2400 },
];

const GlitchBanner: React.FC<{ uid: string }> = ({ uid }) => {
  const pal = BUGURU_PALETTE.glow;
  const pose = buguruPoseAtHead(B_HEAD_X, B_HEAD_Y, B_S);
  const r = rig(pose);
  const glowId = `bb-b-glow-${uid}`;
  const bugGlowId = `bb-b-bugglow-${uid}`;
  const nameGlowId = `bb-b-nglow-${uid}`;
  const boilId = `bb-b-boil-${uid}`;
  const colors = [pal.splitA, pal.splitB, 'rgba(243,239,230,0.85)'];

  const figure = (
    <ColorSplit
      palette={pal}
      dx={9}
      dy={1.5}
      opacity={0.92}
      render={(ink, ghost) => (
        <BuguruCharacter pose={pose} palette={pal} ink={ink} ghost={ghost} bugFilter={`url(#${bugGlowId})`} width={9.4} />
      )}
    />
  );

  return (
    <>
      <defs>
        <radialGradient id={`bb-b-bg-${uid}`} cx="62%" cy="44%" r="70%">
          <stop offset="0%" stopColor="#1B1C21" />
          <stop offset="46%" stopColor="#0A0A0C" />
          <stop offset="100%" stopColor="#020202" />
        </radialGradient>
        <linearGradient id={`bb-b-beam-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255, 238, 205, 0.20)" />
          <stop offset="70%" stopColor="rgba(255, 238, 205, 0.05)" />
          <stop offset="100%" stopColor="rgba(255, 238, 205, 0)" />
        </linearGradient>
        <radialGradient id={`bb-b-halo-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(34, 228, 255, 0.18)" />
          <stop offset="55%" stopColor="rgba(34, 228, 255, 0.05)" />
          <stop offset="100%" stopColor="rgba(34, 228, 255, 0)" />
        </radialGradient>
        <radialGradient id={`bb-b-vig-${uid}`} cx="50%" cy="50%" r="72%">
          <stop offset="58%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.75)" />
        </radialGradient>
        <linearGradient id={`bb-b-floor-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(243,239,230,0)" />
          <stop offset="50%" stopColor="rgba(243,239,230,0.35)" />
          <stop offset="100%" stopColor="rgba(243,239,230,0)" />
        </linearGradient>
        <pattern id={`bb-b-scan-${uid}`} width={8} height={8} patternUnits="userSpaceOnUse">
          <rect x={0} y={0} width={8} height={2} fill="rgba(255,255,255,0.04)" />
        </pattern>
        <BuguruGlowFilter id={glowId} std={8} strength={0.95} />
        <BuguruGlowFilter id={bugGlowId} std={6} strength={1.4} />
        <BuguruGlowFilter id={nameGlowId} std={6} strength={0.5} />
        <BoilFilterDef id={boilId} seed={5} scale={3.2} freq={0.018} octaves={2} />
      </defs>

      <rect x={0} y={0} width={W} height={H} fill={`url(#bb-b-bg-${uid})`} />
      {/* 黒スタジオの光柱（キャラ上） */}
      <path
        d={`M ${B_HEAD_X - 150} -20 L ${B_HEAD_X + 150} -20 L ${B_HEAD_X + 560} ${H + 20} L ${B_HEAD_X - 560} ${H + 20} Z`}
        fill={`url(#bb-b-beam-${uid})`}
      />
      <circle cx={r.head.x} cy={r.head.y + 60} r={420} fill={`url(#bb-b-halo-${uid})`} />
      {/* 床の光（TV で見える足元） */}
      <rect x={B_HEAD_X - 700} y={1398} width={1400} height={3} fill={`url(#bb-b-floor-${uid})`} />

      {/* 破損ピクセル：走査線に沿って全幅へ散らす（中央ほど密） */}
      <GlitchBlocks seed={3} count={9} x0={1960} y0={584} x1={2480} y1={612} colors={colors} minSize={10} maxSize={34} opacity={0.85} />
      <GlitchBlocks seed={11} count={8} x0={60} y0={762} x1={520} y1={790} colors={colors} minSize={10} maxSize={30} opacity={0.75} />
      <GlitchBlocks seed={17} count={6} x0={2090} y0={894} x1={2500} y1={916} colors={colors} minSize={8} maxSize={26} opacity={0.7} />
      <GlitchBlocks seed={23} count={5} x0={80} y0={530} x1={440} y1={552} colors={colors} minSize={8} maxSize={24} opacity={0.6} />
      <GlitchBlocks seed={29} count={6} x0={300} y0={1160} x1={1300} y1={1200} colors={colors} minSize={8} maxSize={22} opacity={0.45} />
      <GlitchBlocks seed={31} count={6} x0={800} y0={280} x1={2000} y1={320} colors={colors} minSize={8} maxSize={22} opacity={0.45} />

      {/* キャラ（発光＋スライス） */}
      <g filter={`url(#${glowId})`}>
        <g filter={`url(#${boilId})`}>
          <SvgSlices bands={B_FIG_BANDS}>{figure}</SvgSlices>
        </g>
      </g>
      <g filter={`url(#${bugGlowId})`}>
        <TwitchMarks pose={pose} color={pal.bug} width={5.2} />
      </g>

      {/* チャンネル名（RGB 分離・発光） */}
      <SvgSlices bands={B_NAME_BANDS}>
        <NamePrint
          pal={pal}
          x={B_NAME_X}
          baseline={B_NAME_BASELINE}
          size={B_NAME_SIZE}
          split={6}
          ghostOpacity={0.75}
          inkFilter={`url(#${nameGlowId})`}
        />
      </SvgSlices>
      <Tagline x={B_NAME_X + 4} baseline={B_TAG_BASELINE} size={B_TAG_SIZE} ink={pal.ink} accent={pal.bug} />

      {/* 全幅の走査線 */}
      <g style={{ mixBlendMode: 'screen' }} opacity={0.85}>
        {B_SCAN_LINES.map((l, i) => (
          <rect key={i} x={l.x0} y={l.y} width={l.x1 - l.x0} height={l.h} fill={l.c === 'A' ? pal.splitA : pal.splitB} />
        ))}
      </g>

      <rect x={0} y={0} width={W} height={H} fill={`url(#bb-b-scan-${uid})`} />
      <rect x={0} y={0} width={W} height={H} fill={`url(#bb-b-vig-${uid})`} />
    </>
  );
};

/* ========================================================================== */
/* 案C lineup：明盤ノート × 整列（普通の棒人間の列で 1 人だけバグっている）       */
/* ========================================================================== */

const C_FLOOR_Y = 922;
const C_LOOP_TOP = 516;
const C_LOOP_BOTTOM = 929;
const C_S = 1.1;
const C_BUG_S = 1.3;
const C_NAME_X = 560;
const C_NAME_BASELINE = 800;
const C_NAME_SIZE = 140; // 2 段組（行送り 1.06em）
const C_TAG_BASELINE = 890;
const C_TAG_SIZE = 60;
const C_RULE_STEP = 74;
const C_MARGIN_X = 452;
/** 列に並ぶ普通の棒人間（x と首の向き）。bug は 1 人だけ */
const C_ROW: readonly { x: number; head?: number; look?: number }[] = [
  { x: 110, head: 2 },
  { x: 318, head: -2 },
  { x: 1392, head: 3 },
  { x: 1580, head: 8, look: 0.9 },
  { x: 2000, head: -10, look: -0.9 },
  { x: 2200, head: -2 },
  { x: 2400, head: 2 },
];
const C_BUG_X = 1790;
const C_DOODLES: readonly DoodleSpec[] = [
  { kind: 'bulb', x: 820, y: 250, s: 0.9, rot: -8 },
  { kind: 'dna', x: 1720, y: 260, s: 0.95, rot: 10 },
  { kind: 'gear', x: 2280, y: 230, s: 0.8, bug: true },
  { kind: 'hourglass', x: 1100, y: 1180, s: 0.85, rot: -6 },
  { kind: 'bubble', x: 2040, y: 1190, s: 0.95, rot: 5 },
  { kind: 'dice', x: 210, y: 240, s: 0.75, rot: 12 },
];

/** 赤ペンの丸囲み：1.1 周して書き終わりが少し外へ逃げる手描き楕円 */
const redPenLoop = (cx: number, cy: number, rx: number, ry: number): string => {
  const n = 64;
  const a0 = -0.32 * Math.PI;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const a = a0 + t * Math.PI * 2 * 1.1;
    const grow = 1 + 0.06 * t;
    const x = cx + Math.cos(a) * rx * grow;
    const y = cy + Math.sin(a) * ry * (1 - 0.012 * t);
    return `${i === 0 ? 'M' : 'L'} ${f2(x)} ${f2(Math.max(cy - ry, y))}`;
  }).join(' ');
};

const LineupBanner: React.FC<{ uid: string }> = ({ uid }) => {
  const pal = BUGURU_PALETTE.sketch;
  const paperId = `bb-c-paper-${uid}`;
  const boilId = `bb-c-boil-${uid}`;
  const boil2Id = `bb-c-boil2-${uid}`;
  const shadowId = `bb-c-shadow-${uid}`;

  const standPose = (x: number, head = 0): StickPose => {
    const base: StickPose = { x, y: 0, s: C_S, ...STAND_POSE, head };
    return { ...base, y: C_FLOOR_Y - rig(base).feetY - 6 };
  };

  // バグった 1 人：ブランド基準の肩すくめ。足裏を床へ合わせる
  const bugBase = buguruPoseAtHead(0, 0, C_BUG_S);
  const bugRig = rig({ ...bugBase, x: 0, y: 0 });
  const bugPose: StickPose = { ...bugBase, x: C_BUG_X, y: C_FLOOR_Y - bugRig.feetY - 6 };
  const br = rig(bugPose);
  const k = C_BUG_S / 5.5;
  // アイコンと同じ相対位置の紙片ずれ（頭頂・顎下・腰）＋足元
  const bugBands: GlitchBand[] = [
    { y0: br.head.y + 96 * k, y1: br.head.y + 140 * k, dx: -24 },
    { y0: br.head.y + 324 * k, y1: br.head.y + 360 * k, dx: 16 },
    { y0: C_FLOOR_Y - 22, y1: C_FLOOR_Y + 10, dx: -14 },
  ];
  const sliceX0 = C_BUG_X - 130;
  const sliceW = 260;

  const rules = (
    <g>
      {Array.from({ length: Math.ceil(H / C_RULE_STEP) + 1 }, (_, i) => {
        const y = C_FLOOR_Y - Math.round(C_FLOOR_Y / C_RULE_STEP) * C_RULE_STEP + i * C_RULE_STEP;
        return y === C_FLOOR_Y ? null : (
          <rect key={i} x={-200} y={y} width={W + 400} height={2} fill="rgba(47, 111, 216, 0.17)" />
        );
      })}
      {/* ノートの赤い余白線（ブランドのバグ赤） */}
      <rect x={C_MARGIN_X} y={-40} width={3} height={H + 80} fill="rgba(230, 46, 45, 0.42)" />
      <rect x={C_MARGIN_X + 10} y={-40} width={2} height={H + 80} fill="rgba(230, 46, 45, 0.28)" />
    </g>
  );

  const crowd = (
    <g filter={`url(#${boilId})`}>
      {C_ROW.map((m, i) => (
        <RiggedStickman
          key={i}
          p={standPose(m.x, m.head)}
          ink={pal.ink}
          headFill={pal.bg}
          face="neutral"
          look={m.look ?? 0}
          width={9}
          blink={false}
          breathe={false}
        />
      ))}
    </g>
  );

  const bugFigure = (
    <ColorSplit
      palette={pal}
      dx={6}
      dy={3}
      opacity={0.8}
      render={(ink, ghost) => <BuguruCharacter pose={bugPose} palette={pal} ink={ink} ghost={ghost} width={9.4} />}
    />
  );

  const renderSheet = (y0 = -40, y1 = H + 40) => (
    <g>
      <rect x={-200} y={y0 - 12} width={W + 400} height={y1 - y0 + 24} fill={pal.bg} filter={`url(#${paperId})`} />
      {rules}
      {/* 床（鉛筆の太線） */}
      <path
        d={`M -20 ${C_FLOOR_Y} L ${W + 20} ${C_FLOOR_Y - 4}`}
        stroke="rgba(28, 25, 23, 0.7)"
        strokeWidth={5}
        strokeLinecap="round"
        filter={`url(#${boil2Id})`}
      />
      <Doodles items={C_DOODLES} color="rgba(87, 83, 78, 0.38)" bug={pal.bug} filter={`url(#${boil2Id})`} />
      {crowd}
      <g filter={`url(#${boilId})`}>{bugFigure}</g>
      <NamePrint pal={pal} x={C_NAME_X} baseline={C_NAME_BASELINE} size={C_NAME_SIZE} split={6} stacked />
    </g>
  );

  return (
    <>
      <defs>
        <BuguruPaperFilter id={paperId} seed={13} />
        <BoilFilterDef id={boilId} seed={3} scale={3.4} freq={0.022} octaves={2} />
        <BoilFilterDef id={boil2Id} seed={8} scale={5} freq={0.016} octaves={2} />
        <filter id={shadowId} x="-10%" y="-60%" width="120%" height="220%">
          <feDropShadow dx={0} dy={5} stdDeviation={4} floodColor="rgba(60, 40, 20, 0.36)" />
        </filter>
        <radialGradient id={`bb-c-sun-${uid}`} cx="70%" cy="4%" r="82%">
          <stop offset="0%" stopColor="rgba(255, 226, 160, 0.26)" />
          <stop offset="60%" stopColor="rgba(255, 226, 160, 0.04)" />
          <stop offset="100%" stopColor="rgba(255, 226, 160, 0)" />
        </radialGradient>
        <radialGradient id={`bb-c-vig-${uid}`} cx="50%" cy="50%" r="72%">
          <stop offset="68%" stopColor="rgba(120, 88, 48, 0)" />
          <stop offset="100%" stopColor="rgba(120, 88, 48, 0.18)" />
        </radialGradient>
        <clipPath id={`bb-c-clip-${uid}`}>
          <rect x={sliceX0} y={-40} width={sliceW} height={H + 80} />
        </clipPath>
      </defs>

      <rect x={0} y={0} width={W} height={H} fill="#E9E0CC" />
      {renderSheet()}
      {/* バグった 1 人の周りだけ紙片がずれる */}
      <g clipPath={`url(#bb-c-clip-${uid})`}>
        {bugBands.map((b, i) => (
          <g key={i} filter={`url(#${shadowId})`}>
            <SvgSlices bands={[b]} onlyBands>
              {renderSheet(b.y0, b.y1)}
            </SvgSlices>
          </g>
        ))}
        <g stroke="rgba(28, 25, 23, 0.55)" strokeWidth={2.5} strokeDasharray="10 9" fill="none">
          {bugBands.map((b, i) => (
            <path key={i} d={`M ${sliceX0 - 40} ${f2(b.y0)} L ${sliceX0 + sliceW + 40} ${f2(b.y0)}`} transform={`translate(${f2(b.dx)} 0)`} />
          ))}
        </g>
      </g>
      <g filter={`url(#${boilId})`}>
        <TwitchMarks pose={bugPose} color={pal.bug} width={5.2} />
      </g>
      {/* 赤ペンの丸囲み（「この 1 人だけおかしい」）。セーフエリア内に収まる手描きの楕円 */}
      <g filter={`url(#${boil2Id})`} fill="none" stroke={pal.bug} strokeLinecap="round" opacity={0.85}>
        <path d={redPenLoop(C_BUG_X, (C_LOOP_TOP + C_LOOP_BOTTOM) / 2, 158, (C_LOOP_BOTTOM - C_LOOP_TOP) / 2)} strokeWidth={6} />
      </g>
      <Tagline x={C_NAME_X + 2} baseline={C_TAG_BASELINE} size={C_TAG_SIZE} ink={pal.ink} accent={pal.bug} />
      <rect x={0} y={0} width={W} height={H} fill={`url(#bb-c-sun-${uid})`} />
      <rect x={0} y={0} width={W} height={H} fill={`url(#bb-c-vig-${uid})`} />
    </>
  );
};

/* ========================================================================== */

export interface BuguruBannerProps {
  variant: BuguruBannerVariant;
}

/** 「バグる棒人間」チャンネルバナー（SVG・2560×1440 viewBox）。親要素サイズへフィット */
export const BuguruBanner: React.FC<BuguruBannerProps> = ({ variant }) => {
  useStickmanCollageFonts();
  const uid = sanitizeSvgId(useId());
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      {variant === 'slices' ? <SlicesBanner uid={uid} /> : null}
      {variant === 'glitch' ? <GlitchBanner uid={uid} /> : null}
      {variant === 'lineup' ? <LineupBanner uid={uid} /> : null}
    </svg>
  );
};
