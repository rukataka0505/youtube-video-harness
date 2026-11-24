import React, { useId } from 'react';
import { f2, lerp, rnd, sanitizeSvgId } from '../motionMath';
import { RiggedStickman, rig, type StickPose } from '../RiggedStickman';

/* ========================================================================== */
/* 「バグる棒人間」ブランドキット共通コア（ch1 / stickman-collage v2.1）           */
/*  - ブランドキャラ（肩すくめ “は？” ポーズ＋×目＋ギザ口）                      */
/*  - ブランドモチーフ「水平スライスずれ（バグ）」と RGB / 版ズレ分離             */
/*  アイコン（BuguruIcon）と 1.0 秒アイキャッチ（BuguruEyecatch）で共有する。     */
/* ========================================================================== */

export const BUGURU_CHANNEL_NAME = 'バグる棒人間';

export type BuguruVariant = 'glow' | 'sketch';

export interface BuguruPalette {
  bg: string;
  bgLift: string;
  ink: string;
  headFill: string;
  /** ×目・ピクつき線などの「バグ」アクセント */
  bug: string;
  /** 色分離ゴースト（暗盤＝RGBシアン／明盤＝青版ズレ） */
  splitA: string;
  /** 色分離ゴースト（暗盤＝RGBマゼンタ／明盤＝赤版ズレ） */
  splitB: string;
  /** 分離ゴーストの合成モード */
  blend: 'screen' | 'multiply';
  /** 下描き鉛筆・補助線 */
  graphite: string;
}

export const BUGURU_PALETTE: Record<BuguruVariant, BuguruPalette> = {
  glow: {
    bg: '#030303',
    bgLift: '#15161A',
    ink: '#F3EFE6',
    headFill: '#050506',
    bug: '#FF2E63',
    splitA: '#22E4FF',
    splitB: '#FF2E63',
    blend: 'screen',
    graphite: 'rgba(243, 239, 230, 0.16)',
  },
  sketch: {
    bg: '#FFFCF4',
    bgLift: '#F3ECDD',
    ink: '#1C1917',
    headFill: '#FFFCF4',
    bug: '#E62E2D',
    splitA: '#2F6FD8',
    splitB: '#E62E2D',
    blend: 'multiply',
    graphite: 'rgba(87, 83, 78, 0.32)',
  },
};

/* -------------------------------------------------------------------------- */
/* ブランドキャラ・ポーズ                                                      */
/* -------------------------------------------------------------------------- */

/** ブランド基準ポーズ：両手を上げた肩すくめ「は？（自分でも意味不明）」 */
export const BUGURU_SHRUG: Omit<StickPose, 'x' | 'y' | 's'> = {
  lean: 0,
  head: 9,
  ls: -42,
  le: -108,
  rs: 44,
  re: 112,
  lh: -12,
  lk: 4,
  rh: 12,
  rk: -4,
};

/** 頭の中心座標を基準にブランドポーズを配置する（バスト構図で扱いやすくするため） */
export const buguruPoseAtHead = (
  headX: number,
  headY: number,
  s: number,
  over: Partial<Omit<StickPose, 'x' | 'y' | 's'>> = {},
): StickPose => {
  const base: StickPose = { x: 0, y: 0, s, ...BUGURU_SHRUG, ...over };
  const r = rig(base);
  return { ...base, x: headX - r.head.x, y: headY - r.head.y };
};

export interface BuguruFaceProps {
  pose: StickPose;
  ink: string;
  bug: string;
  /** 0 = 両目ふつう（ドット）、1 = 右目が×（バグ発生） */
  bugged?: number;
  /** ×目の横ズレ（グリッチ時のピクつき） */
  eyeJitter?: number;
  /** ×目のみに掛けるフィルタ（暗盤の発光等） */
  bugFilter?: string;
  /** 線の太さ倍率 */
  weight?: number;
}

/** ブランド顔：左目ドット＋右目×（バグ）＋ギザギザ口。頭ローカル座標（headR=30 基準） */
export const BuguruFace: React.FC<BuguruFaceProps> = ({
  pose,
  ink,
  bug,
  bugged = 1,
  eyeJitter = 0,
  bugFilter,
  weight = 1,
}) => {
  const r = rig(pose);
  const rot = pose.lean + pose.head;
  const sw = 5 * weight;
  const xScale = Math.max(0, Math.min(1.25, bugged));
  return (
    <g
      transform={`translate(${f2(r.head.x)} ${f2(r.head.y)}) rotate(${f2(rot)}) scale(${f2(pose.s)})`}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      {/* 左目（正常） */}
      <circle cx={-11} cy={-4} r={4.8 * weight} fill={ink} stroke="none" />
      {/* 右目：正常ドット → ×（バグ） */}
      {bugged < 0.5 ? (
        <circle cx={11} cy={-4} r={4.8 * weight} fill={ink} stroke="none" />
      ) : null}
      {bugged > 0 ? (
        <g
          transform={`translate(${f2(11 + eyeJitter)} -4) scale(${f2(xScale)})`}
          filter={bugFilter}
        >
          <path d="M -6.2 -6.2 L 6.2 6.2 M 6.2 -6.2 L -6.2 6.2" stroke={bug} strokeWidth={sw * 1.05} />
        </g>
      ) : null}
      {/* 口：ギザギザ（混乱・誤作動） */}
      <path
        d="M -10 13.5 L -6 9.5 L -2 13.5 L 2 9.5 L 6 13.5 L 9.5 10.5"
        stroke={ink}
        strokeWidth={sw * 0.82}
      />
    </g>
  );
};

export interface BuguruCharacterProps {
  pose: StickPose;
  palette: BuguruPalette;
  /** 線色の上書き（色分離ゴースト描画用） */
  ink?: string;
  bugged?: number;
  eyeJitter?: number;
  bugFilter?: string;
  /** ゴースト描画時は顔の×も同色にする */
  ghost?: boolean;
  width?: number;
}

/** ブランドキャラ本体（RiggedStickman faceless ＋ BuguruFace） */
export const BuguruCharacter: React.FC<BuguruCharacterProps> = ({
  pose,
  palette,
  ink,
  bugged = 1,
  eyeJitter = 0,
  bugFilter,
  ghost = false,
  width = 9,
}) => {
  const lineInk = ink ?? palette.ink;
  return (
    <g>
      <RiggedStickman
        p={pose}
        ink={lineInk}
        headFill={ghost ? 'none' : palette.headFill}
        faceless
        width={width}
        blink={false}
        breathe={false}
      />
      <BuguruFace
        pose={pose}
        ink={lineInk}
        bug={ghost ? lineInk : palette.bug}
        bugged={bugged}
        eyeJitter={eyeJitter}
        bugFilter={ghost ? undefined : bugFilter}
      />
    </g>
  );
};

/** 頭の右上に出る「ピクッ」線（3本）。progress 0..1 で伸びる */
export const TwitchMarks: React.FC<{
  pose: StickPose;
  color: string;
  progress?: number;
  width?: number;
}> = ({ pose, color, progress = 1, width = 4.5 }) => {
  if (progress <= 0) {
    return null;
  }
  const r = rig(pose);
  const R = 30 * pose.s;
  // 頭頂から時計回りの角度（右上方向へ放射）
  const rays = [24, 50, 76];
  return (
    <g stroke={color} strokeWidth={width * pose.s * 0.62} strokeLinecap="round" fill="none">
      {rays.map((deg, i) => {
        const a = ((deg + pose.head + pose.lean) * Math.PI) / 180;
        const r0 = R * 1.3;
        const r1 = R * (1.3 + 0.4 * Math.min(1, progress * (1.25 - i * 0.12)));
        return (
          <path
            key={deg}
            d={`M ${f2(r.head.x + Math.sin(a) * r0)} ${f2(r.head.y - Math.cos(a) * r0)} L ${f2(r.head.x + Math.sin(a) * r1)} ${f2(r.head.y - Math.cos(a) * r1)}`}
          />
        );
      })}
    </g>
  );
};

/* -------------------------------------------------------------------------- */
/* ブランドモチーフ：水平スライスずれ／色分離                                   */
/* -------------------------------------------------------------------------- */

export interface GlitchBand {
  y0: number;
  y1: number;
  dx: number;
  opacity?: number;
}

/** 指定帯を除く隙間を dx=0 の帯で埋め、全高を覆う帯リストに正規化する */
export const fillBands = (
  bands: readonly GlitchBand[],
  top = -4000,
  bottom = 6000,
): GlitchBand[] => {
  const sorted = [...bands]
    .filter((b) => b.y1 > b.y0)
    .sort((a, b) => a.y0 - b.y0);
  const out: GlitchBand[] = [];
  let cur = top;
  for (const b of sorted) {
    const y0 = Math.max(cur, b.y0);
    if (y0 > cur) {
      out.push({ y0: cur, y1: y0, dx: 0 });
    }
    if (b.y1 > y0) {
      out.push({ ...b, y0 });
      cur = b.y1;
    }
  }
  if (cur < bottom) {
    out.push({ y0: cur, y1: bottom, dx: 0 });
  }
  return out;
};

export interface SvgSlicesProps {
  bands: readonly GlitchBand[];
  children: React.ReactNode;
  /** true の場合、指定帯以外（隙間）は描画しない */
  onlyBands?: boolean;
}

/** SVG 内で children を水平帯ごとに切り、帯ごとに横ずらしする（ブランドの“バグ”表現） */
export const SvgSlices: React.FC<SvgSlicesProps> = ({ bands, children, onlyBands = false }) => {
  const uid = sanitizeSvgId(useId());
  const active = bands.some((b) => b.dx !== 0 || (b.opacity ?? 1) !== 1);
  if (!active && !onlyBands) {
    return <g>{children}</g>;
  }
  const list = onlyBands ? [...bands] : fillBands(bands);
  return (
    <g>
      <defs>
        {list.map((b, i) => (
          <clipPath key={i} id={`bg-sl-${uid}-${i}`} clipPathUnits="userSpaceOnUse">
            <rect x={-6000} y={b.y0} width={14000} height={Math.max(0, b.y1 - b.y0)} />
          </clipPath>
        ))}
      </defs>
      {list.map((b, i) =>
        (b.opacity ?? 1) <= 0 ? null : (
          <g key={i} clipPath={`url(#bg-sl-${uid}-${i})`} opacity={b.opacity ?? 1}>
            <g transform={b.dx ? `translate(${f2(b.dx)} 0)` : undefined}>{children}</g>
          </g>
        ),
      )}
    </g>
  );
};

export interface ColorSplitProps {
  /** ink を受け取り描画する関数（ゴーストは ghost=true で呼ばれる） */
  render: (ink: string | undefined, ghost: boolean) => React.ReactNode;
  palette: BuguruPalette;
  dx: number;
  dy?: number;
  opacity?: number;
}

/** 色分離（暗盤＝RGBずれ screen／明盤＝版ズレ multiply）＋本体 */
export const ColorSplit: React.FC<ColorSplitProps> = ({
  render,
  palette,
  dx,
  dy = 0,
  opacity = 0.9,
}) => (
  <g>
    {Math.abs(dx) + Math.abs(dy) > 0.2 ? (
      <>
        <g
          transform={`translate(${f2(-dx)} ${f2(-dy)})`}
          opacity={opacity}
          style={{ mixBlendMode: palette.blend }}
        >
          {render(palette.splitA, true)}
        </g>
        <g
          transform={`translate(${f2(dx)} ${f2(dy * 0.6)})`}
          opacity={opacity}
          style={{ mixBlendMode: palette.blend }}
        >
          {render(palette.splitB, true)}
        </g>
      </>
    ) : null}
    {render(undefined, false)}
  </g>
);

/** フレーム単位で乱数シードを固定したランダム帯（デジタルノイズ） */
export const randomBands = (
  seed: number,
  count: number,
  yMin: number,
  yMax: number,
  hMin: number,
  hMax: number,
  dxMax: number,
): GlitchBand[] =>
  Array.from({ length: count }, (_, i) => {
    const y0 = lerp(yMin, yMax, rnd(seed * 31 + i * 7 + 1));
    const h = lerp(hMin, hMax, rnd(seed * 17 + i * 11 + 3));
    const dir = rnd(seed * 13 + i * 5 + 9) > 0.5 ? 1 : -1;
    const mag = lerp(0.35, 1, rnd(seed * 23 + i * 3 + 5));
    return { y0, y1: y0 + h, dx: dir * mag * dxMax };
  });

export interface GlitchBlocksProps {
  seed: number;
  count: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  colors: readonly string[];
  minSize?: number;
  maxSize?: number;
  opacity?: number;
  blend?: 'screen' | 'multiply' | 'normal';
}

/** 破損ピクセル（矩形ブロック）。乱数シード固定 */
export const GlitchBlocks: React.FC<GlitchBlocksProps> = ({
  seed,
  count,
  x0,
  y0,
  x1,
  y1,
  colors,
  minSize = 8,
  maxSize = 40,
  opacity = 1,
  blend = 'normal',
}) => (
  <g opacity={opacity} style={blend === 'normal' ? undefined : { mixBlendMode: blend }}>
    {Array.from({ length: count }, (_, i) => {
      const w = lerp(minSize, maxSize * 2.2, rnd(seed * 41 + i * 13 + 2));
      const h = lerp(minSize * 0.5, maxSize * 0.55, rnd(seed * 19 + i * 29 + 4));
      const x = lerp(x0, x1, rnd(seed * 7 + i * 37 + 6));
      const y = lerp(y0, y1, rnd(seed * 53 + i * 3 + 8));
      const c = colors[Math.floor(rnd(seed * 11 + i * 17 + 1) * colors.length) % colors.length];
      return <rect key={i} x={f2(x)} y={f2(y)} width={f2(w)} height={f2(h)} fill={c} />;
    })}
  </g>
);

/** 暗盤の発光（ブルーム）フィルタ定義 */
export const BuguruGlowFilter: React.FC<{ id: string; std?: number; strength?: number }> = ({
  id,
  std = 9,
  strength = 1,
}) => (
  <filter id={id} x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur in="SourceGraphic" stdDeviation={std} result="b1" />
    <feGaussianBlur in="SourceGraphic" stdDeviation={std * 3} result="b2" />
    <feComponentTransfer in="b2" result="b2s">
      <feFuncA type="linear" slope={0.7 * strength} />
    </feComponentTransfer>
    <feComponentTransfer in="b1" result="b1s">
      <feFuncA type="linear" slope={1.1 * strength} />
    </feComponentTransfer>
    <feMerge>
      <feMergeNode in="b2s" />
      <feMergeNode in="b1s" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
);

/** 紙の歯（明盤用の紙テクスチャ）フィルタ定義：矩形に適用する */
export const BuguruPaperFilter: React.FC<{ id: string; seed?: number }> = ({ id, seed = 7 }) => (
  <filter id={id} x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed} result="fine" />
    <feColorMatrix
      in="fine"
      type="matrix"
      values="0 0 0 0 0.42  0 0 0 0 0.33  0 0 0 0 0.22  0 0 0 0.11 0"
      result="fineA"
    />
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves={3} seed={seed + 3} result="blot" />
    <feColorMatrix
      in="blot"
      type="matrix"
      values="0 0 0 0 0.55  0 0 0 0 0.43  0 0 0 0 0.28  0 0 0 0.16 -0.03"
      result="blotA"
    />
    <feMerge>
      <feMergeNode in="SourceGraphic" />
      <feMergeNode in="blotA" />
      <feMergeNode in="fineA" />
    </feMerge>
  </filter>
);
