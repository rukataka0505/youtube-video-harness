import React, { useId } from 'react';
import { AbsoluteFill, Easing, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { GrainLayer, NoiseLayer, PaperToothLayer, SubtitleCalm, type NoiseLayerProps } from './noise';
import { ChalkFilterDef, DustField, LightBeam } from './optics';
import {
  f2,
  handLine,
  hashRnd as rnd,
  ring,
  rr,
  sag,
  sanitizeSvgId,
  tornRect,
} from './paths';
import {
  BlueprintSurface,
  CorkGrainSurface,
  DraftingGridSurface,
  SunlitPaperSurface,
  WoodPlanksSurface,
} from './surfaces';

const FONT_HAND = '"Yomogi", "Zen Maru Gothic", "Noto Sans JP", sans-serif';
const FONT_SANS = '"Noto Sans JP", "Zen Maru Gothic", sans-serif';
const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const STAGE_FLOOR_Y = 812;
const D2R = Math.PI / 180;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const ramp = (sec: number, a: number, b: number): number => clamp01((sec - a) / Math.max(0.001, b - a));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const EIO = Easing.inOut(Easing.cubic);
const EO = Easing.out(Easing.cubic);
const eio = (sec: number, a: number, b: number): number => EIO(ramp(sec, a, b));
const eo = (sec: number, a: number, b: number): number => EO(ramp(sec, a, b));
const stepSec = (sec: number, fps = 7.5): number => Math.floor(sec * Math.max(1, fps)) / Math.max(1, fps);
const wob = (sec: number, at: number, amp: number, freq = 2.2, decay = 3.2): number =>
  sec < at ? 0 : amp * Math.exp(-decay * (sec - at)) * Math.sin((sec - at) * freq * Math.PI * 2);

export const STUDIO_BACKGROUND_POLARITIES = [
  'black',
  'white_sketch',
  'grid_paper',
  'wood_desk',
  'kraft_cork',
  'blueprint',
  'cream_notebook',
  'light_table',
] as const;

export type StudioBackgroundPolarity = (typeof STUDIO_BACKGROUND_POLARITIES)[number];

/** studio/public/ 配下に事前ベイクされる公式8背景の静的質感 PNG パス */
export const BAKED_BACKGROUND_FILES: Record<StudioBackgroundPolarity, string> = {
  black: 'backgrounds/black.png',
  white_sketch: 'backgrounds/white_sketch.png',
  grid_paper: 'backgrounds/grid_paper.png',
  wood_desk: 'backgrounds/wood_desk.png',
  kraft_cork: 'backgrounds/kraft_cork.png',
  blueprint: 'backgrounds/blueprint.png',
  cream_notebook: 'backgrounds/cream_notebook.png',
  light_table: 'backgrounds/light_table.png',
};

const BakedBgImg: React.FC<{
  file: string;
  style?: React.CSSProperties;
}> = ({ file, style }) => (
  <Img
    src={staticFile(file)}
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'fill',
      pointerEvents: 'none',
      ...style,
    }}
  />
);

/* ========================================================================== */
/* 公式 8 背景カタログ（stickman-collage v2.1）                                */
/*  共通質感・素地は components/_materials/ を参照し、棒人間向けジオラマを乗せる。 */
/* ========================================================================== */

export { GrainLayer, NoiseLayer, PaperToothLayer, SubtitleCalm };
export type { NoiseLayerProps };

const W = STAGE_WIDTH;
const H = STAGE_HEIGHT;
const FLOOR_Y = STAGE_FLOOR_Y;

const useSid = (prefix: string): string => `${prefix}-${sanitizeSvgId(useId())}`;

/** 描かれていく背景補助線（pathLength=1 のダッシュ送り） */
const BgDraw: React.FC<{
  d: string;
  sec: number;
  at: number;
  dur?: number;
  stroke: string;
  width: number;
  opacity?: number;
  fill?: string;
  ease?: (t: number) => number;
}> = ({
  d,
  sec,
  at,
  dur = 0.5,
  stroke,
  width,
  opacity = 1,
  fill = 'none',
  ease = EIO,
}) => {
  if (sec < at) {
    return null;
  }
  const p = ease(ramp(sec, at, at + dur));
  return (
    <path
      d={d}
      pathLength={1}
      fill={fill}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="1 1"
      strokeDashoffset={1 - p}
      opacity={opacity}
    />
  );
};

const BgSvg: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <svg
    viewBox={`0 0 ${W} ${H}`}
    aria-hidden="true"
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      overflow: 'visible',
      pointerEvents: 'none',
      ...style,
    }}
  >
    {children}
  </svg>
);

export interface BgVariantProps {
  /** セグメント／極性区間内の経過秒 */
  sec: number;
  /** 棒人間の腰 x（照明追従等に使用） */
  actorX?: number;
  animated?: boolean;
  /** 事前ベイク済み PNG を使用するか（既定 true。false で旧プロシージャル描画を比較用再現） */
  useBaked?: boolean;
}

/* ========================================================================== */
/* 01 black : 黒スタジオ・リッチ                                                */
/* ========================================================================== */

const BOKEH = [
  { x: 210, y: 210, r: 46, c: '255, 186, 102', ph: 0.2 },
  { x: 330, y: 330, r: 22, c: '255, 210, 150', ph: 1.4 },
  { x: 120, y: 420, r: 30, c: '120, 200, 220', ph: 2.2 },
  { x: 1620, y: 180, r: 38, c: '255, 196, 120', ph: 0.9 },
  { x: 1760, y: 320, r: 54, c: '110, 190, 214', ph: 2.8 },
  { x: 1500, y: 390, r: 20, c: '255, 220, 170', ph: 3.6 },
  { x: 1840, y: 140, r: 18, c: '255, 186, 102', ph: 4.4 },
];

/** 事前ベイク用：black の静的質感（チョーク消し跡ムラ＋消し残しチョーク跡＋床ホリゾント・透過 PNG） */
export const BgStudioBlackRichStatic: React.FC<{
  noiseBlend?: React.CSSProperties['mixBlendMode'];
}> = ({ noiseBlend = 'normal' }) => {
  const beamBlur = useSid('beamblur-static');
  const chalk = useSid('chalk-static');
  return (
    <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
      <NoiseLayer
        freq="0.006 0.02"
        octaves={3}
        seed={11}
        matrix="0 0 0 0 0.92  0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 2.6 -1.1"
        opacity={0.1}
        blend={noiseBlend}
      />
      <BgSvg>
        <defs>
          <filter id={beamBlur} x="-20%" y="-10%" width="140%" height="120%">
            <feGaussianBlur stdDeviation={26} />
          </filter>
          <ChalkFilterDef id={chalk} scale={5} freq={0.9} seed={9} blur={1.4} />
        </defs>

        {/* 消し残したチョーク跡（奥の壁） */}
        <g
          filter={`url(#${chalk})`}
          stroke="#EDE9DF"
          fill="none"
          strokeLinecap="round"
          opacity={0.11}
        >
          <path d="M 120 190 Q 260 150 400 196" strokeWidth={6} />
          <path d="M 380 176 L 404 196 L 374 212" strokeWidth={6} />
          <path d={ring(560, 260, 70, 3)} strokeWidth={5} />
          <path
            d="M 520 236 L 600 286 M 600 236 L 520 286"
            strokeWidth={4}
            opacity={0.6}
          />
          <path
            d="M 1330 150 C 1400 120, 1480 220, 1560 170 S 1700 130, 1760 190"
            strokeWidth={5}
          />
          <path
            d="M 1380 250 L 1700 250 M 1380 300 L 1620 300"
            strokeWidth={4}
            opacity={0.7}
          />
          <text
            x={140}
            y={330}
            fontFamily={FONT_SANS}
            fontSize={46}
            fill="#EDE9DF"
            stroke="none"
            opacity={0.8}
          >
            {'Δ = ?'}
          </text>
        </g>

        {/* 床のホリゾント：壁との境目 */}
        <rect
          x={0}
          y={FLOOR_Y - 40}
          width={W}
          height={H - FLOOR_Y + 40}
          fill="rgba(40, 37, 33, 0.35)"
          filter={`url(#${beamBlur})`}
        />
      </BgSvg>
    </AbsoluteFill>
  );
};

export const BgStudioBlackRich: React.FC<BgVariantProps> = ({
  sec,
  actorX = 960,
  animated = true,
  useBaked = true,
}) => {
  const beamBlur = useSid('beamblur');
  const bokehBlur = useSid('bokeh');

  const sTime = animated ? sec : 2.5;
  const spotX = lerp(960, actorX, 0.62) + Math.sin(sTime * 0.6) * 26;
  const warm =
    animated && sTime < 0.4
      ? 0.7 + 0.3 * (sTime / 0.4) + Math.sin(sTime * 70) * 0.05
      : 1;
  const breathe = (0.92 + Math.sin(sTime * 1.1) * 0.08) * warm;

  const srcX = spotX - 260;

  const inBeam = (x: number, y: number): number => {
    const t = Math.max(0, Math.min(1, (y + 60) / (FLOOR_Y + 90)));
    const cx = lerp(srcX, spotX, t);
    const half = lerp(70, 420, t);
    const d = Math.abs(x - cx) / half;
    return Math.max(0, 1 - d * d) * (y < FLOOR_Y + 20 ? 1 : 0);
  };

  return (
    <AbsoluteFill style={{ backgroundColor: '#030303', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 62% 70% at ${f2((spotX / W) * 100)}% 46%, rgba(46, 44, 40, ${f2(0.95 * breathe)}) 0%, rgba(20, 19, 18, 0.9) 48%, rgba(5, 5, 5, 1) 86%)`,
        }}
      />
      {useBaked ? (
        <BakedBgImg file={BAKED_BACKGROUND_FILES.black} />
      ) : (
        <BgStudioBlackRichStatic noiseBlend="screen" />
      )}

      <BgSvg>
        <defs>
          <filter id={beamBlur} x="-20%" y="-10%" width="140%" height="120%">
            <feGaussianBlur stdDeviation={26} />
          </filter>
          <filter id={bokehBlur} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={9} />
          </filter>
        </defs>

        {/* 遠景の玉ボケ（実用光） */}
        <g filter={`url(#${bokehBlur})`}>
          {BOKEH.map((b, i) => (
            <circle
              key={i}
              cx={b.x + Math.sin(sTime * 0.4 + b.ph) * 6}
              cy={b.y}
              r={b.r}
              fill={`rgba(${b.c}, ${f2(0.16 + Math.sin(sTime * 1.3 + b.ph) * 0.05)})`}
            />
          ))}
        </g>

        {/* 主役の下のライト溜まり */}
        <ellipse
          cx={spotX}
          cy={FLOOR_Y + 22}
          rx={540}
          ry={78}
          fill={`rgba(150, 134, 110, ${f2(0.26 * breathe)})`}
          filter={`url(#${beamBlur})`}
        />
      </BgSvg>

      {/* 照明の柱＋漂うヘイズ */}
      <LightBeam
        sec={sTime}
        srcX={srcX}
        spotX={spotX}
        topY={-60}
        bottomY={FLOOR_Y + 30}
        topHalf={70}
        bottomHalf={420}
        opacity={breathe}
        hazeOpacity={0.2}
        useBaked={useBaked}
      />

      {/* 浮遊チリ：柱の中で強く光る */}
      <DustField sec={sTime} inBeam={inBeam} warm={warm} />

      <GrainLayer opacity={0.1} blend="screen" freq={0.9} animated={animated} useBaked={useBaked} />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 100% 92% at 50% 44%, rgba(0, 0, 0, 0) 52%, rgba(0, 0, 0, 0.7) 100%)',
          pointerEvents: 'none',
        }}
      />
      <SubtitleCalm color="#000000" strength={0.55} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 02 white_sketch : 白い画用紙スケッチブック                                  */
/* ========================================================================== */

const LEAVES = Array.from({ length: 16 }, (_, i) => ({
  x: 980 + rnd(i + 30) * 900,
  y: 40 + rnd(i + 60) * 560,
  rx: 30 + rnd(i + 90) * 60,
  ry: 18 + rnd(i + 120) * 34,
  rot: rnd(i + 150) * 180,
  ph: rnd(i + 180) * Math.PI * 2,
  amp: 8 + rnd(i + 210) * 16,
}));

/** 事前ベイク用：white_sketch の静的質感（#FFFCF4＋立体紙目凹凸＋繊維・不透明 PNG） */
export const BgWarmWhiteSketchStatic: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: '#FFFCF4', overflow: 'hidden', pointerEvents: 'none' }}>
    <SunlitPaperSurface
      toothOpacity={0.26}
      toothFreq={0.12}
      toothSeed={5}
      toothSurface={1.8}
      fiberOpacity={0.035}
    />
  </AbsoluteFill>
);

export const BgWarmWhiteSketch: React.FC<BgVariantProps> = ({
  sec,
  animated = true,
  useBaked = true,
}) => {
  const mask = useSid('sunmask');
  const soft = useSid('sunsoft');
  const leafBlur = useSid('leafblur');
  const sTime = animated ? sec : 2.5;
  const graphite = 'rgba(70, 70, 78, 0.3)';
  const drift = Math.min(sTime, 25) * 7;
  const pane = (x: number, y: number, w: number, h: number) =>
    `M ${f2(x + drift)} ${y} L ${f2(x + w + drift)} ${y} L ${f2(x + w - h * 0.55 + drift)} ${y + h} L ${f2(x - h * 0.55 + drift)} ${y + h} Z`;
  const breeze = Math.sin(sTime * 0.9) * 0.6 + Math.sin(sTime * 2.3) * 0.4;

  return (
    <AbsoluteFill style={{ backgroundColor: '#FFFCF4', overflow: 'hidden' }}>
      {useBaked ? (
        <BakedBgImg file={BAKED_BACKGROUND_FILES.white_sketch} />
      ) : (
        <BgWarmWhiteSketchStatic />
      )}

      {/* 陽だまり：影（暖灰）を全面に敷き、窓の形と木漏れで抜く */}
      <BgSvg style={{ mixBlendMode: 'multiply' }}>
        <defs>
          <filter id={soft} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={20} />
          </filter>
          <filter id={leafBlur} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={13} />
          </filter>
          <mask id={mask}>
            <rect width={W} height={H} fill="#FFFFFF" />
            <g fill="#000000" filter={`url(#${soft})`}>
              <path d={pane(1040, -40, 330, 400)} />
              <path d={pane(1410, -40, 330, 400)} />
              <path d={pane(820, 400, 330, 420)} />
              <path d={pane(1190, 400, 330, 420)} />
            </g>
            <g fill="#FFFFFF" filter={`url(#${leafBlur})`} opacity={0.75}>
              {LEAVES.map((l, i) => (
                <ellipse
                  key={i}
                  cx={
                    l.x +
                    drift +
                    Math.sin(sTime * 1.4 + l.ph) * l.amp * (1 + breeze * 0.4)
                  }
                  cy={l.y + Math.cos(sTime * 1.1 + l.ph) * l.amp * 0.5}
                  rx={l.rx}
                  ry={l.ry}
                  transform={`rotate(${f2(l.rot + Math.sin(sTime + l.ph) * 8)} ${f2(l.x + drift)} ${l.y})`}
                />
              ))}
            </g>
          </mask>
        </defs>
        <rect
          width={W}
          height={H}
          fill="rgba(188, 164, 124, 0.24)"
          mask={`url(#${mask})`}
        />
      </BgSvg>
      {/* 陽だまりの暖かさ */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 50% 60% at ${f2(66 + Math.min(sTime, 30) * 0.3)}% 30%, rgba(255, 228, 170, 0.22) 0%, rgba(255, 228, 170, 0) 70%)`,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }}
      />

      {/* 鉛筆の下描き */}
      <BgSvg>
        <BgDraw
          d={handLine(80, FLOOR_Y + 2, 1840, FLOOR_Y - 4, 6, 3)}
          sec={sTime}
          at={0.05}
          dur={0.9}
          stroke={graphite}
          width={2.6}
        />
        <BgDraw
          d={handLine(140, FLOOR_Y + 16, 1100, FLOOR_Y + 12, 4, 4)}
          sec={sTime}
          at={0.4}
          dur={0.8}
          stroke="rgba(70,70,78,0.16)"
          width={1.8}
        />
        <g opacity={0.9}>
          <BgDraw
            d="M 220 210 L 340 170 L 450 215 L 330 258 Z"
            sec={sTime}
            at={0.3}
            dur={0.6}
            stroke={graphite}
            width={2.2}
          />
          <BgDraw
            d="M 220 210 L 222 340 L 330 388 L 330 258 M 330 388 L 448 342 L 450 215"
            sec={sTime}
            at={0.7}
            dur={0.7}
            stroke={graphite}
            width={2.2}
          />
          <BgDraw
            d="M 330 258 L 1500 120"
            sec={sTime}
            at={1.2}
            dur={0.9}
            stroke="rgba(70,70,78,0.1)"
            width={1.4}
          />
          {Array.from({ length: 9 }, (_, k) => (
            <BgDraw
              key={k}
              d={`M ${334 + k * 12} ${386 - k * 4} L ${334 + k * 12} ${262 - k * 4}`}
              sec={sTime}
              at={1.4 + k * 0.05}
              dur={0.12}
              stroke="rgba(70,70,78,0.22)"
              width={1.6}
            />
          ))}
        </g>
        {[0, 1, 2].map((k) => (
          <g key={k}>
            <BgDraw
              d={rr(1430 + k * 140, 108, 120, 78, 3, k + 2)}
              sec={sTime}
              at={0.6 + k * 0.4}
              dur={0.4}
              stroke={graphite}
              width={2}
            />
            <BgDraw
              d={`M ${1446 + k * 140} 170 Q ${1480 + k * 140} ${130 + k * 6} ${1530 + k * 140} 160`}
              sec={sTime}
              at={0.95 + k * 0.4}
              dur={0.3}
              stroke="rgba(70,70,78,0.24)"
              width={1.8}
            />
          </g>
        ))}
        {Array.from({ length: 14 }, (_, k) => (
          <BgDraw
            key={k}
            d={handLine(
              170 + k * 18,
              FLOOR_Y + 50,
              230 + k * 18,
              FLOOR_Y + 8,
              2,
              k + 40,
            )}
            sec={sTime}
            at={1.8 + k * 0.04}
            dur={0.1}
            stroke="rgba(70,70,78,0.16)"
            width={1.8}
          />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <path
            key={i}
            d="M -5 0 C -3 -3, 2 -3, 5 -1 C 4 2, -2 3, -5 0 Z"
            transform={`translate(${f2(1580 + rnd(i + 700) * 220)} ${f2(720 + rnd(i + 730) * 90)}) rotate(${f2(rnd(i + 760) * 180)}) scale(${f2(0.7 + rnd(i + 790))})`}
            fill="rgba(150, 140, 128, 0.32)"
          />
        ))}
      </BgSvg>

      <GrainLayer opacity={0.035} animated={animated} useBaked={useBaked} />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 100% 94% at 52% 46%, rgba(255,255,255,0) 64%, rgba(120, 100, 70, 0.16) 100%)',
          pointerEvents: 'none',
        }}
      />
      <SubtitleCalm color="#FBF7EE" strength={0.5} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 03 grid_paper : 製図台・方眼紙                                              */
/* ========================================================================== */

const Tape: React.FC<{ x: number; y: number; rot: number; w?: number }> = ({
  x,
  y,
  rot,
  w = 190,
}) => {
  const h = 48;
  const jag = (side: number) =>
    Array.from(
      { length: 7 },
      (_, k) =>
        `${f2(side + (rnd(k + side + x) - 0.5) * 7)} ${f2((k / 6) * h)}`,
    ).join(' L ');
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path
        d={`M 0 0 L ${w} 0 L ${jag(w)} L 0 ${h} L ${jag(0).split(' L ').reverse().join(' L ')} Z`}
        fill="rgba(232, 218, 176, 0.78)"
      />
      <path
        d={`M 6 8 L ${w - 6} 8`}
        stroke="rgba(255, 255, 255, 0.35)"
        strokeWidth={3}
      />
      <path
        d={`M 0 ${h} L ${w} ${h}`}
        stroke="rgba(120, 100, 60, 0.18)"
        strokeWidth={2}
      />
    </g>
  );
};

/** 事前ベイク用：grid_paper の静的質感（白地＋立体紙目凹凸＋繊維・multiply 合成用 PNG） */
export const BgDraftingGridStatic: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: '#FFFFFF', overflow: 'hidden', pointerEvents: 'none' }}>
    <PaperToothLayer opacity={0.28} freq={0.12} seed={2} surface={1.6} />
    <NoiseLayer freq="0.016 0.42" seed={7} opacity={0.06} blend="multiply" />
  </AbsoluteFill>
);

export const BgDraftingGrid: React.FC<BgVariantProps> = ({
  sec,
  animated = true,
  useBaked = true,
}) => {
  const sTime = animated ? sec : 2.5;
  const ink = 'rgba(30, 60, 64, 0.5)';
  const panX = sTime * 5;
  const panY = sTime * 1.8;
  const lampX = 10 + Math.sin(sTime * 0.3) * 2;
  const tri =
    'M 1806 230 L 2010 230 L 2010 640 Z M 1872 290 L 1972 290 L 1972 490 Z';
  const triY = -Math.min(sTime, 25) * 5;
  const arcStart = 200;
  const arcSweep = 150 * eio(sTime, 1.1, 4.4);
  const cx = 330;
  const cy = 330;
  const r = 150;
  const a0 = arcStart * D2R;
  const a1 = (arcStart + arcSweep) * D2R;
  const arc =
    arcSweep > 0.5
      ? `M ${f2(cx + Math.cos(a0) * r)} ${f2(cy + Math.sin(a0) * r)} A ${r} ${r} 0 ${arcSweep > 180 ? 1 : 0} 1 ${f2(cx + Math.cos(a1) * r)} ${f2(cy + Math.sin(a1) * r)}`
      : '';
  const legX = cx + Math.cos(a1) * r;
  const legY = cy + Math.sin(a1) * r;
  const arrow = (x: number, y: number, dir: 1 | -1, vertical = false) =>
    vertical
      ? `M ${x - 8} ${y + dir * 16} L ${x} ${y} L ${x + 8} ${y + dir * 16}`
      : `M ${x + dir * 16} ${y - 8} L ${x} ${y} L ${x + dir * 16} ${y + 8}`;

  return (
    <AbsoluteFill style={{ backgroundColor: '#EEF2E8', overflow: 'hidden' }}>
      {useBaked ? (
        <>
          <AbsoluteFill
            style={{
              backgroundImage: [
                'linear-gradient(to right, rgba(28, 118, 106, 0.26) 1.6px, transparent 1.6px)',
                'linear-gradient(to bottom, rgba(28, 118, 106, 0.26) 1.6px, transparent 1.6px)',
                'linear-gradient(to right, rgba(28, 118, 106, 0.1) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(28, 118, 106, 0.1) 1px, transparent 1px)',
              ].join(', '),
              backgroundSize: '120px 120px, 120px 120px, 24px 24px, 24px 24px',
              backgroundPosition: `${f2(panX)}px ${f2(panY)}px`,
              pointerEvents: 'none',
            }}
          />
          <BakedBgImg
            file={BAKED_BACKGROUND_FILES.grid_paper}
            style={{ mixBlendMode: 'multiply' }}
          />
        </>
      ) : (
        <DraftingGridSurface panX={panX} panY={panY} />
      )}

      <BgSvg>
        <g stroke="rgba(28, 98, 90, 0.55)" strokeWidth={1.6}>
          {Array.from({ length: 84 }, (_, k) => {
            const x = ((k * 24 + panX) % (84 * 24)) - 24;
            const major = Math.round((x - panX) / 24) % 5 === 0;
            return (
              <path
                key={k}
                d={`M ${f2(x)} 0 L ${f2(x)} ${major ? 20 : 9}`}
              />
            );
          })}
          {Array.from({ length: 48 }, (_, k) => {
            const y = ((k * 24 + panY) % (48 * 24)) - 24;
            const major = Math.round((y - panY) / 24) % 5 === 0;
            return y > 100 && y < 860 ? (
              <path
                key={k}
                d={`M 0 ${f2(y)} L ${major ? 20 : 9} ${f2(y)}`}
              />
            ) : null;
          })}
        </g>

        <g opacity={0.9}>
          <BgDraw d="M 300 170 L 300 120" sec={sTime} at={0.2} dur={0.2} stroke={ink} width={1.8} />
          <BgDraw d="M 1620 170 L 1620 120" sec={sTime} at={0.3} dur={0.2} stroke={ink} width={1.8} />
          <BgDraw d="M 300 140 L 900 140 M 1020 140 L 1620 140" sec={sTime} at={0.45} dur={0.6} stroke={ink} width={2} />
          <BgDraw d={arrow(300, 140, 1)} sec={sTime} at={0.95} dur={0.15} stroke={ink} width={2} />
          <BgDraw d={arrow(1620, 140, -1)} sec={sTime} at={0.95} dur={0.15} stroke={ink} width={2} />
          {sTime > 1.0 ? (
            <text
              x={960}
              y={148}
              textAnchor="middle"
              fontFamily={FONT_SANS}
              fontSize={24}
              fontWeight={700}
              fill={ink}
              opacity={eio(sTime, 1.0, 1.3)}
            >
              1320
            </text>
          ) : null}
          <BgDraw d={`M 1700 260 L 1700 ${FLOOR_Y}`} sec={sTime} at={0.9} dur={0.6} stroke={ink} width={2} />
          <BgDraw d={arrow(1700, 260, 1, true)} sec={sTime} at={1.4} dur={0.15} stroke={ink} width={2} />
          <BgDraw d={arrow(1700, FLOOR_Y, -1, true)} sec={sTime} at={1.4} dur={0.15} stroke={ink} width={2} />
          {sTime > 1.5 ? (
            <text
              x={1724}
              y={540}
              fontFamily={FONT_SANS}
              fontSize={22}
              fontWeight={700}
              fill={ink}
              opacity={eio(sTime, 1.5, 1.8)}
              transform="rotate(90 1724 540)"
            >
              H 552
            </text>
          ) : null}
        </g>

        <path
          d={`M ${cx - 14} ${cy} L ${cx + 14} ${cy} M ${cx} ${cy - 14} L ${cx} ${cy + 14}`}
          stroke={ink}
          strokeWidth={2}
        />
        {arc ? (
          <path
            d={arc}
            stroke="rgba(30, 40, 44, 0.42)"
            strokeWidth={2.2}
            fill="none"
            strokeLinecap="round"
          />
        ) : null}
        {arcSweep > 0.5 && sTime < 4.5 ? (
          <g opacity={1 - eio(sTime, 4.3, 4.6)}>
            <path
              d={`M ${cx} ${cy} L ${f2((cx + legX) / 2 + 30)} ${f2((cy + legY) / 2 - 160)} L ${f2(legX)} ${f2(legY)}`}
              stroke="rgba(60, 64, 70, 0.28)"
              strokeWidth={5}
              fill="none"
              strokeLinejoin="round"
            />
          </g>
        ) : null}
        {sTime > 2.2 ? (
          <text
            x={cx + 24}
            y={cy - 18}
            fontFamily={FONT_SANS}
            fontSize={20}
            fontWeight={700}
            fill={ink}
            opacity={eio(sTime, 2.2, 2.5)}
          >
            R150
          </text>
        ) : null}

        <BgDraw
          d={handLine(-40, 640, W + 40, 620, 14, 5)}
          sec={sTime}
          at={0.35}
          dur={1.0}
          stroke="rgba(28, 25, 23, 0.1)"
          width={1.8}
        />
        <BgDraw
          d={handLine(1320, -40, 1360, H + 40, 18, 6)}
          sec={sTime}
          at={0.7}
          dur={1.0}
          stroke="rgba(28, 25, 23, 0.08)"
          width={1.8}
        />

        <g transform={`translate(0 ${f2(triY)}) rotate(${f2(Math.sin(sTime * 0.5) * 0.6)} 1900 430)`}>
          <path
            d={tri}
            fillRule="evenodd"
            fill="rgba(120, 196, 206, 0.16)"
            stroke="rgba(40, 120, 132, 0.42)"
            strokeWidth={2.4}
          />
          <path d="M 1812 236 L 2004 236" stroke="rgba(255, 255, 255, 0.6)" strokeWidth={2} />
          {Array.from({ length: 9 }, (_, k) => (
            <path
              key={k}
              d={`M ${1820 + k * 20} 232 L ${1820 + k * 20} ${k % 5 === 0 ? 252 : 244}`}
              stroke="rgba(30, 90, 100, 0.45)"
              strokeWidth={1.4}
            />
          ))}
        </g>

        <Tape x={1760} y={-8} rot={34} />
        <Tape x={-30} y={830} rot={-32} w={170} />

        {Array.from({ length: 8 }, (_, i) => (
          <path
            key={i}
            d="M -5 0 C -3 -3, 2 -3, 5 -1 C 4 2, -2 3, -5 0 Z"
            transform={`translate(${f2(1480 + rnd(i + 900) * 180)} ${f2(780 + rnd(i + 950) * 70)}) rotate(${f2(rnd(i + 990) * 180)}) scale(${f2(0.6 + rnd(i + 1010) * 0.8)})`}
            fill="rgba(120, 112, 104, 0.24)"
          />
        ))}
      </BgSvg>

      <GrainLayer opacity={0.04} animated={animated} useBaked={useBaked} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 66% 78% at ${f2(lampX)}% -6%, rgba(255, 246, 222, 0.55) 0%, rgba(255, 246, 222, 0) 64%)`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 110% 100% at ${f2(lampX + 20)}% 10%, rgba(0,0,0,0) 46%, rgba(64, 58, 40, 0.22) 100%)`,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }}
      />
      <SubtitleCalm color="#EEF2E8" strength={0.45} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 04 wood_desk : 木目デスク                                                   */
/* ========================================================================== */

const WOOD_MUG = { x: 1770, y: 190 };

/** 事前ベイク用：wood_desk の静的質感（3枚板木目＋板溝＋木の節＋シミ＋マグ本体＋鉛筆＋クリップ・不透明 PNG） */
export const BgWoodDeskStatic: React.FC = () => {
  const shadow = useSid('mugshadow-static');
  const mug = WOOD_MUG;
  return (
    <AbsoluteFill style={{ backgroundColor: '#7A4E2D', overflow: 'hidden', pointerEvents: 'none' }}>
      <BgSvg>
        <defs>
          <filter id={shadow} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={12} />
          </filter>
        </defs>
        <WoodPlanksSurface inline />
        <ellipse cx={1460} cy={560} rx={34} ry={14} fill="rgba(50, 24, 10, 0.32)" />
        <ellipse
          cx={1460}
          cy={560}
          rx={54}
          ry={24}
          fill="none"
          stroke="rgba(50, 24, 10, 0.18)"
          strokeWidth={4}
        />
        <ellipse cx={420} cy={980} rx={26} ry={10} fill="rgba(50, 24, 10, 0.28)" />

        <path
          d={ring(1520, 300, 66, 4)}
          fill="none"
          stroke="rgba(52, 26, 10, 0.2)"
          strokeWidth={7}
        />

        {/* マグ（俯瞰・本体＋落ち影） */}
        <ellipse
          cx={mug.x + 18}
          cy={mug.y + 26}
          rx={100}
          ry={100}
          fill="rgba(20, 8, 2, 0.5)"
          filter={`url(#${shadow})`}
        />
        <path
          d={`M ${mug.x + 82} ${mug.y - 30} C ${mug.x + 150} ${mug.y - 40}, ${mug.x + 160} ${mug.y + 40}, ${mug.x + 84} ${mug.y + 34}`}
          fill="none"
          stroke="#E9E2D4"
          strokeWidth={22}
          strokeLinecap="round"
        />
        <circle cx={mug.x} cy={mug.y} r={94} fill="#EFE8DA" />
        <circle
          cx={mug.x}
          cy={mug.y}
          r={94}
          fill="none"
          stroke="rgba(120, 100, 80, 0.4)"
          strokeWidth={3}
        />
        <circle cx={mug.x} cy={mug.y} r={76} fill="#3B2112" />
        <ellipse
          cx={mug.x - 18}
          cy={mug.y - 20}
          rx={34}
          ry={16}
          fill="rgba(210, 160, 110, 0.35)"
          transform={`rotate(-30 ${mug.x} ${mug.y})`}
        />

        {/* 鉛筆 */}
        <g transform="rotate(-14 340 260)">
          <rect
            x={150}
            y={256}
            width={330}
            height={26}
            fill="rgba(20, 8, 2, 0.4)"
            filter={`url(#${shadow})`}
            transform="translate(10 16)"
          />
          <path d="M 176 244 L 470 244 L 470 270 L 176 270 Z" fill="#E7B53A" />
          <path d="M 176 252 L 470 252" stroke="rgba(255, 255, 255, 0.35)" strokeWidth={3} />
          <path d="M 176 263 L 470 263" stroke="rgba(120, 80, 10, 0.3)" strokeWidth={3} />
          <path d="M 470 244 L 524 257 L 470 270 Z" fill="#E8C9A0" />
          <path d="M 508 253 L 524 257 L 508 261 Z" fill="#2B2B2B" />
          <rect x={150} y={243} width={28} height={28} fill="#B8B2A8" />
          <rect x={124} y={244} width={28} height={26} fill="#E58C8C" />
        </g>

        {/* クリップ */}
        <g
          transform="translate(1690 650) rotate(24)"
          fill="none"
          stroke="#C9CCD2"
          strokeWidth={5}
          strokeLinecap="round"
        >
          <path d="M 0 0 L 0 -70 Q 0 -86 14 -86 Q 28 -86 28 -70 L 28 -10 Q 28 2 18 2 Q 8 2 8 -10 L 8 -60" />
        </g>
        <g
          transform="translate(1696 660) rotate(24)"
          fill="none"
          stroke="rgba(20, 8, 2, 0.35)"
          strokeWidth={5}
          strokeLinecap="round"
          filter={`url(#${shadow})`}
        >
          <path d="M 0 0 L 0 -70 Q 0 -86 14 -86 Q 28 -86 28 -70 L 28 -10" />
        </g>
      </BgSvg>
    </AbsoluteFill>
  );
};

export const BgWoodDesk: React.FC<BgVariantProps> = ({
  sec,
  animated = true,
  useBaked = true,
}) => {
  const steamBlur = useSid('steam');
  const sTime = animated ? sec : 2.5;
  const lampX = 34 + Math.sin(sTime * 0.35) * 1.6;
  const flick =
    0.94 + Math.sin(sTime * 3.1) * 0.03 + Math.sin(sTime * 7.7) * 0.015;
  const camX = Math.sin(sTime * 0.45) * 5;
  const camY = Math.cos(sTime * 0.38) * 3;
  const mug = WOOD_MUG;

  return (
    <AbsoluteFill style={{ backgroundColor: '#7A4E2D', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translate(${f2(camX)}px, ${f2(camY)}px) scale(1.012)`,
        }}
      >
        {useBaked ? (
          <BakedBgImg file={BAKED_BACKGROUND_FILES.wood_desk} />
        ) : (
          <BgWoodDeskStatic />
        )}
        <BgSvg>
          <defs>
            <filter id={steamBlur} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={7} />
            </filter>
          </defs>
          {/* マグの湯気（動的） */}
          <g filter={`url(#${steamBlur})`} fill="none" strokeLinecap="round">
            {[0, 1, 2].map((k) => {
              const t = (sTime * 0.45 + k / 3) % 1;
              const x0 = mug.x - 30 + k * 30;
              const y0 = mug.y - 20 - t * 260;
              const wv = Math.sin(sTime * 1.6 + k * 2) * 26;
              return (
                <path
                  key={k}
                  d={`M ${f2(x0)} ${f2(y0 + 80)} C ${f2(x0 + wv)} ${f2(y0 + 40)}, ${f2(x0 - wv)} ${f2(y0)}, ${f2(x0 + wv * 0.6)} ${f2(y0 - 60)}`}
                  stroke="#FFF4E6"
                  strokeWidth={16}
                  opacity={0.16 * Math.sin(t * Math.PI)}
                />
              );
            })}
          </g>
        </BgSvg>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 52% 58% at ${f2(lampX)}% 34%, rgba(255, 200, 130, ${f2(0.36 * flick)}) 0%, rgba(255, 178, 100, ${f2(0.12 * flick)}) 46%, rgba(255, 170, 90, 0) 72%)`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 96% 96% at ${f2(lampX + 8)}% 36%, rgba(0,0,0,0) 40%, rgba(22, 9, 2, 0.72) 100%)`,
          pointerEvents: 'none',
        }}
      />
      <GrainLayer opacity={0.06} blend="overlay" freq={0.7} animated={animated} useBaked={useBaked} />
      <SubtitleCalm color="#1A0C04" strength={0.6} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 05 kraft_cork : クラフト紙 × コルクボード                                   */
/* ========================================================================== */

const Pin: React.FC<{ x: number; y: number; c: string }> = ({ x, y, c }) => (
  <g>
    <ellipse cx={x + 7} cy={y + 9} rx={15} ry={11} fill="rgba(30, 14, 4, 0.45)" />
    <circle cx={x} cy={y} r={15} fill={c} />
    <circle cx={x} cy={y} r={15} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={2} />
    <ellipse cx={x - 5} cy={y - 6} rx={6} ry={4} fill="rgba(255,255,255,0.55)" />
  </g>
);

const KRAFT_SHEET_PATH = tornRect(250, 104, 1420, 760, 7, 8);

/** 事前ベイク用：kraft_cork の静的質感（#B4854F＋4層コルク＋中央クラフト紙＆落ち影＆繊維＆斑点・不透明 PNG） */
export const BgKraftCorkStatic: React.FC = () => {
  const sheetClip = useSid('kraft-static');
  const sheetShadow = useSid('kraftshadow-static');
  const fiber = useSid('kraftfiber-static');
  const speck = useSid('kraftspeck-static');
  const sheet = KRAFT_SHEET_PATH;

  return (
    <AbsoluteFill style={{ backgroundColor: '#B4854F', overflow: 'hidden', pointerEvents: 'none' }}>
      <CorkGrainSurface />
      <BgSvg>
        <defs>
          <clipPath id={sheetClip}>
            <path d={sheet} />
          </clipPath>
          <filter id={sheetShadow} x="-5%" y="-5%" width="110%" height="115%">
            <feGaussianBlur in="SourceAlpha" stdDeviation={10} />
            <feOffset dx={6} dy={12} result="o" />
            <feFlood floodColor="rgba(36, 16, 4, 0.55)" />
            <feComposite in2="o" operator="in" />
          </filter>
          <filter id={fiber} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.014 0.07"
              numOctaves={3}
              seed={14}
              result="f"
            />
            <feColorMatrix
              in="f"
              type="matrix"
              values="0 0 0 0 0.36  0 0 0 0 0.22  0 0 0 0 0.1  1.7 0 0 0 -0.72"
            />
          </filter>
          <filter id={speck} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={0.55}
              numOctaves={1}
              seed={17}
              result="s"
            />
            <feColorMatrix
              in="s"
              type="matrix"
              values="0 0 0 0 0.25  0 0 0 0 0.14  0 0 0 0 0.05  6 0 0 0 -4.1"
            />
          </filter>
        </defs>

        <g transform="rotate(-0.7 960 480)">
          <path d={sheet} fill="#000" filter={`url(#${sheetShadow})`} />
          <path d={sheet} fill="#C9A273" />
          <g clipPath={`url(#${sheetClip})`}>
            <rect x={240} y={90} width={1450} height={800} filter={`url(#${fiber})`} opacity={0.5} />
            <rect x={240} y={90} width={1450} height={800} filter={`url(#${speck})`} opacity={0.6} />
            <path d="M 250 108 L 1670 108" stroke="rgba(255, 240, 210, 0.35)" strokeWidth={3} />
          </g>
        </g>
      </BgSvg>
    </AbsoluteFill>
  );
};

export const BgKraftCork: React.FC<BgVariantProps> = ({
  sec,
  animated = true,
  useBaked = true,
}) => {
  const sTime = animated ? sec : 2.5;
  const push = 1 + eio(sTime, 0, 5) * 0.022;
  const pins = {
    tl: { x: 282, y: 136 },
    tr: { x: 1638, y: 132 },
    note: { x: 132, y: 306 },
    pola: { x: 1796, y: 212 },
    card: { x: 1786, y: 566 },
  };
  const breathe = Math.sin(sTime * 1.25) * 6;
  const noteSway = Math.sin(sTime * 1.7) * 1.6 + wob(sTime, 0.2, 3, 1.4, 1.2);

  return (
    <AbsoluteFill style={{ backgroundColor: '#B4854F', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{ transform: `scale(${f2(push)})`, transformOrigin: '52% 46%' }}
      >
        {useBaked ? (
          <BakedBgImg file={BAKED_BACKGROUND_FILES.kraft_cork} />
        ) : (
          <BgKraftCorkStatic />
        )}

        <BgSvg>

          <g transform={`rotate(${f2(-6 + noteSway)} ${pins.note.x} ${pins.note.y})`}>
            <path
              d={tornRect(44, 290, 180, 196, 31, 5)}
              fill="rgba(30, 14, 4, 0.4)"
              transform="translate(6 10)"
            />
            <path d={tornRect(44, 290, 180, 196, 31, 5)} fill="#F3EAD2" />
            {[0, 1, 2, 3].map((k) => (
              <path
                key={k}
                d={handLine(64, 342 + k * 34, 64 + 120 - (k % 2) * 40, 342 + k * 34, 3, k + 3)}
                stroke="rgba(40, 32, 26, 0.55)"
                strokeWidth={4}
                strokeLinecap="round"
                fill="none"
              />
            ))}
          </g>
          <g
            transform={`rotate(${f2(5 + Math.sin(sTime * 1.3 + 1) * 0.8)} ${pins.pola.x} ${pins.pola.y})`}
          >
            <rect
              x={1716}
              y={196}
              width={176}
              height={208}
              fill="rgba(30, 14, 4, 0.42)"
              transform="translate(7 11)"
            />
            <rect x={1716} y={196} width={176} height={208} fill="#F7F4EC" />
            <rect x={1730} y={212} width={148} height={144} fill="#4C4640" />
            {Array.from({ length: 9 }, (_, k) => (
              <path
                key={k}
                d={`M ${1730 + k * 18} 356 L ${1730 + k * 18 + 40} 212`}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={6}
              />
            ))}
            <path
              d={handLine(1738, 382, 1850, 380, 2, 4)}
              stroke="rgba(40, 32, 26, 0.5)"
              strokeWidth={4}
              strokeLinecap="round"
            />
          </g>
          <g
            transform={`rotate(${f2(-4 + Math.sin(sTime * 1.5 + 2) * 0.7)} ${pins.card.x} ${pins.card.y})`}
          >
            <rect
              x={1704}
              y={552}
              width={196}
              height={128}
              fill="rgba(30, 14, 4, 0.4)"
              transform="translate(6 10)"
            />
            <rect x={1704} y={552} width={196} height={128} fill="#FBF8F0" />
            <path d="M 1704 584 L 1900 584" stroke="rgba(214, 60, 50, 0.6)" strokeWidth={2.4} />
            {[0, 1, 2].map((k) => (
              <path
                key={k}
                d={`M 1704 ${610 + k * 22} L 1900 ${610 + k * 22}`}
                stroke="rgba(70, 110, 180, 0.3)"
                strokeWidth={1.6}
              />
            ))}
          </g>

          <g fill="none" stroke="#B3221C" strokeWidth={3.4} strokeLinecap="round">
            <path d={sag(pins.note, pins.tl, 20 + breathe * 0.5)} />
            <path d={sag(pins.tl, pins.pola, 34 + breathe)} />
            <path d={sag(pins.pola, pins.card, 10 + breathe * 0.4)} />
          </g>
          <g fill="none" stroke="rgba(30, 10, 4, 0.28)" strokeWidth={3} transform="translate(5 9)">
            <path d={sag(pins.tl, pins.pola, 34 + breathe)} />
          </g>

          <Pin x={pins.tl.x} y={pins.tl.y} c="#C8372D" />
          <Pin x={pins.tr.x} y={pins.tr.y} c="#E2B23C" />
          <Pin x={274} y={842} c="#2F6CB0" />
          <Pin x={1646} y={838} c="#3C9A5F" />
          <Pin x={pins.note.x} y={pins.note.y} c="#C8372D" />
          <Pin x={pins.pola.x} y={pins.pola.y} c="#C8372D" />
          <Pin x={pins.card.x} y={pins.card.y} c="#E2B23C" />
        </BgSvg>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 60% at ${f2(48 + Math.sin(sTime * 0.4) * 3)}% 34%, rgba(255, 222, 170, 0.22) 0%, rgba(255, 222, 170, 0) 70%)`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 100% 96% at 50% 44%, rgba(0,0,0,0) 52%, rgba(34, 16, 4, 0.55) 100%)',
          pointerEvents: 'none',
        }}
      />
      <GrainLayer opacity={0.05} blend="overlay" animated={animated} useBaked={useBaked} />
      <SubtitleCalm color="#2A160A" strength={0.5} from={866} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 06 blueprint : 深紺ブループリント                                            */
/* ========================================================================== */

/** 事前ベイク用：blueprint の静的質感（深紺グラデーション＋露光ムラ NoiseLayer・不透明 PNG） */
export const BgMidnightBlueprintStatic: React.FC = () => (
  <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse 80% 80% at 44% 40%, #17407A 0%, #0E2B55 52%, #081B37 100%)',
        pointerEvents: 'none',
      }}
    />
    <NoiseLayer
      freq="0.005"
      octaves={3}
      seed={6}
      matrix="0 0 0 0 0.55  0 0 0 0 0.76  0 0 0 0 1  1.5 0 0 0 -0.6"
      opacity={0.22}
      blend="screen"
    />
  </AbsoluteFill>
);

export const BgMidnightBlueprint: React.FC<
  BgVariantProps & { titleCode?: string }
> = ({ sec, animated = true, useBaked = true, titleCode = 'STICK-06' }) => {
  const sTime = animated ? sec : 2.5;
  const line = 'rgba(214, 236, 255, 0.46)';
  const faint = 'rgba(200, 228, 255, 0.24)';
  const glow = useSid('bpglow');
  const fl = { x: 1630, y: 250 };
  const rot = sTime * 7;
  const scanY = -160 + Math.min(1, sTime / 5) * 1240;
  const scanOp = 1 - eio(scanY, 760, 880);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {useBaked ? (
        <>
          <BakedBgImg file={BAKED_BACKGROUND_FILES.blueprint} />
          <AbsoluteFill
            style={{
              backgroundImage: [
                'linear-gradient(to right, rgba(170, 214, 255, 0.2) 1.5px, transparent 1.5px)',
                'linear-gradient(to bottom, rgba(170, 214, 255, 0.2) 1.5px, transparent 1.5px)',
                'linear-gradient(to right, rgba(150, 200, 255, 0.075) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(150, 200, 255, 0.075) 1px, transparent 1px)',
              ].join(', '),
              backgroundSize: '150px 150px, 150px 150px, 30px 30px, 30px 30px',
              backgroundPosition: `${f2(-sTime * 2)}px 0px`,
              pointerEvents: 'none',
            }}
          />
        </>
      ) : (
        <BlueprintSurface sec={sTime} />
      )}

      <BgSvg>
        <defs>
          <filter id={glow} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={3} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#${glow})`} fill="none" strokeLinecap="round">
          <BgDraw d={ring(fl.x, fl.y, 150, 2)} sec={sTime} at={0.15} dur={0.8} stroke={line} width={2.6} />
          <BgDraw d={ring(fl.x, fl.y, 58, 3)} sec={sTime} at={0.45} dur={0.5} stroke={line} width={2.4} />
          <BgDraw
            d={`M ${fl.x - 190} ${fl.y} L ${fl.x + 190} ${fl.y} M ${fl.x} ${fl.y - 190} L ${fl.x} ${fl.y + 190}`}
            sec={sTime}
            at={0.25}
            dur={0.6}
            stroke={faint}
            width={1.8}
          />
          {sTime > 0.9 ? (
            <g transform={`rotate(${f2(rot)} ${fl.x} ${fl.y})`} opacity={eio(sTime, 0.9, 1.3)}>
              <circle cx={fl.x} cy={fl.y} r={104} stroke={faint} strokeWidth={1.6} strokeDasharray="22 8 4 8" />
              {Array.from({ length: 6 }, (_, k) => {
                const a = (k / 6) * Math.PI * 2;
                return (
                  <path
                    key={k}
                    d={ring(fl.x + Math.cos(a) * 104, fl.y + Math.sin(a) * 104, 14, k + 4)}
                    stroke={line}
                    strokeWidth={2.2}
                  />
                );
              })}
            </g>
          ) : null}
          <BgDraw
            d={`M ${fl.x + 106} ${fl.y - 106} L ${fl.x + 170} ${fl.y - 170} L ${fl.x + 236} ${fl.y - 170}`}
            sec={sTime}
            at={1.3}
            dur={0.4}
            stroke={line}
            width={2}
          />
          {sTime > 1.6 ? (
            <text
              x={fl.x + 180}
              y={fl.y - 180}
              fontFamily={FONT_SANS}
              fontSize={22}
              fontWeight={700}
              fill={line}
              stroke="none"
              opacity={eio(sTime, 1.6, 1.9)}
            >
              φ300
            </text>
          ) : null}

          <BgDraw d={rr(120, 150, 330, 150, 1, 3)} sec={sTime} at={0.5} dur={0.6} stroke={line} width={2.4} />
          <BgDraw d="M 120 236 L 450 236" sec={sTime} at={0.9} dur={0.3} stroke={line} width={2} />
          {Array.from({ length: 14 }, (_, k) => (
            <BgDraw
              key={k}
              d={`M ${132 + k * 22} 298 L ${168 + k * 22} 240`}
              sec={sTime}
              at={1.1 + k * 0.03}
              dur={0.12}
              stroke={faint}
              width={1.6}
            />
          ))}
          <BgDraw
            d="M 120 330 L 450 330 M 120 318 L 120 342 M 450 318 L 450 342"
            sec={sTime}
            at={1.4}
            dur={0.4}
            stroke={faint}
            width={1.8}
          />
          {sTime > 1.7 ? (
            <g opacity={eio(sTime, 1.7, 2.0)}>
              <text
                x={285}
                y={362}
                textAnchor="middle"
                fontFamily={FONT_SANS}
                fontSize={20}
                fontWeight={700}
                fill={line}
                stroke="none"
              >
                330
              </text>
              <text
                x={120}
                y={134}
                fontFamily={FONT_SANS}
                fontSize={20}
                fontWeight={700}
                letterSpacing="0.18em"
                fill={line}
                stroke="none"
              >
                SECTION A–A
              </text>
            </g>
          ) : null}

          <BgDraw d={`M 110 470 L 110 ${FLOOR_Y}`} sec={sTime} at={0.8} dur={0.5} stroke={faint} width={1.8} />
          <BgDraw
            d={`M 96 470 L 124 470 M 96 ${FLOOR_Y} L 124 ${FLOOR_Y}`}
            sec={sTime}
            at={1.2}
            dur={0.2}
            stroke={faint}
            width={1.8}
          />

          <BgDraw d={`M 260 ${FLOOR_Y} L 1560 ${FLOOR_Y}`} sec={sTime} at={0.1} dur={0.8} stroke={line} width={2.4} />
          {Array.from({ length: 44 }, (_, k) => (
            <BgDraw
              key={k}
              d={`M ${276 + k * 30} ${FLOOR_Y + 2} L ${256 + k * 30} ${FLOOR_Y + 24}`}
              sec={sTime}
              at={0.4 + k * 0.012}
              dur={0.1}
              stroke={faint}
              width={1.6}
            />
          ))}

          <g opacity={eio(sTime, 0.6, 1.2) * 0.9}>
            <path
              d="M 1580 690 L 1860 690 L 1860 860 L 1580 860 Z M 1580 740 L 1860 740 M 1580 800 L 1860 800 M 1720 740 L 1720 860"
              stroke={faint}
              strokeWidth={1.8}
            />
            <text
              x={1596}
              y={724}
              fontFamily={FONT_SANS}
              fontSize={20}
              fontWeight={700}
              letterSpacing="0.12em"
              fill={line}
              stroke="none"
            >
              {`TITLE  ${titleCode}`}
            </text>
            <text x={1596} y={780} fontFamily={FONT_SANS} fontSize={16} fontWeight={700} fill={faint} stroke="none">
              SCALE 1:20
            </text>
            <text x={1736} y={780} fontFamily={FONT_SANS} fontSize={16} fontWeight={700} fill={faint} stroke="none">
              DWG 06
            </text>
            <text x={1596} y={840} fontFamily={FONT_SANS} fontSize={16} fontWeight={700} fill={faint} stroke="none">
              REV  A
            </text>
          </g>
        </g>
      </BgSvg>

      {scanOp > 0.005 ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: scanY - 120,
            height: 240,
            opacity: scanOp,
            pointerEvents: 'none',
            background:
              'linear-gradient(to bottom, rgba(160, 210, 255, 0) 0%, rgba(160, 210, 255, 0.09) 46%, rgba(220, 240, 255, 0.2) 50%, rgba(160, 210, 255, 0.09) 54%, rgba(160, 210, 255, 0) 100%)',
            mixBlendMode: 'screen',
          }}
        />
      ) : null}
      <GrainLayer opacity={0.07} blend="screen" freq={0.95} animated={animated} useBaked={useBaked} />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 100% 94% at 50% 44%, rgba(0,0,0,0) 56%, rgba(2, 8, 20, 0.6) 100%)',
          pointerEvents: 'none',
        }}
      />
      <SubtitleCalm color="#06142A" strength={0.5} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 07 cream_notebook : クリーム罫線ノート                                       */
/* ========================================================================== */

const NOTEBOOK_RULE0 = 206;
const NOTEBOOK_STEP = 54;
const NOTEBOOK_RULES = Array.from({ length: 17 }, (_, k) => NOTEBOOK_RULE0 + k * NOTEBOOK_STEP).filter(
  (y) => y < H + 20,
);

/** 事前ベイク用：cream_notebook の静的質感（#FBF6E8＋紙目凹凸＋ヘッダー罫線/No./Date＋17本罫線＆ドット＋赤マージン線＋スパイラルリング20個・不透明 PNG） */
export const BgRuledNotebookStatic: React.FC = () => {
  const blue = 'rgba(64, 104, 176, 0.3)';
  return (
    <AbsoluteFill style={{ backgroundColor: '#FBF6E8', overflow: 'hidden', pointerEvents: 'none' }}>
      <PaperToothLayer opacity={0.32} freq={0.13} seed={4} surface={1.4} />
      <BgSvg>
        <path
          d={`M 0 ${NOTEBOOK_RULE0 - NOTEBOOK_STEP} L ${W} ${NOTEBOOK_RULE0 - NOTEBOOK_STEP}`}
          stroke="rgba(64, 104, 176, 0.5)"
          strokeWidth={2.6}
        />
        <text
          x={1360}
          y={130}
          fontFamily={FONT_SANS}
          fontSize={24}
          fontWeight={700}
          fill="rgba(64, 104, 176, 0.62)"
        >
          No.
        </text>
        <path
          d="M 1410 134 L 1530 134"
          stroke="rgba(64, 104, 176, 0.45)"
          strokeWidth={2}
          strokeDasharray="2 6"
        />
        <text
          x={1556}
          y={130}
          fontFamily={FONT_SANS}
          fontSize={24}
          fontWeight={700}
          fill="rgba(64, 104, 176, 0.62)"
        >
          Date
        </text>
        <path
          d="M 1620 134 L 1860 134"
          stroke="rgba(64, 104, 176, 0.45)"
          strokeWidth={2}
          strokeDasharray="2 6"
        />
        <text x={1702} y={134} fontFamily={FONT_SANS} fontSize={24} fill="rgba(64, 104, 176, 0.62)">
          ・
        </text>
        <text x={1782} y={134} fontFamily={FONT_SANS} fontSize={24} fill="rgba(64, 104, 176, 0.62)">
          ・
        </text>

        {NOTEBOOK_RULES.map((y) => (
          <g key={y}>
            <path d={`M 0 ${y} L ${W} ${y}`} stroke={blue} strokeWidth={1.7} />
            {Array.from({ length: 10 }, (_, k) => (
              <circle
                key={k}
                cx={200 + k * 180}
                cy={y}
                r={2.6}
                fill="rgba(64, 104, 176, 0.38)"
              />
            ))}
          </g>
        ))}
        <path
          d={`M 200 0 Q 201.5 ${H / 2} 200 ${H}`}
          stroke="rgba(206, 64, 56, 0.36)"
          strokeWidth={2.4}
          fill="none"
        />

        {Array.from({ length: 20 }, (_, k) => {
          const y = 40 + k * NOTEBOOK_STEP;
          return (
            <g key={k}>
              <ellipse cx={40} cy={y} rx={9} ry={12} fill="rgba(46, 36, 24, 0.6)" />
              <path
                d={`M 40 ${y - 4} C 24 ${y - 30}, -6 ${y - 34}, -14 ${y - 12}`}
                stroke="#77777F"
                strokeWidth={6}
                fill="none"
                strokeLinecap="round"
              />
              <path
                d={`M 38 ${y - 8} C 24 ${y - 28}, 0 ${y - 32}, -8 ${y - 16}`}
                stroke="#D8D8DE"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </BgSvg>
    </AbsoluteFill>
  );
};

export const BgRuledNotebook: React.FC<
  BgVariantProps & { headerDate?: string; headerNote?: string }
> = ({
  sec,
  animated = true,
  useBaked = true,
  headerDate = '11   22',
  headerNote = 'きょうのメモ',
}) => {
  const sTime = animated ? sec : 2.5;
  const pen = 'rgba(38, 62, 128, 0.62)';
  const dateClip = useSid('date');
  const titleClip = useSid('title');
  const swayX = Math.sin(sTime * 0.47) * 2.4;
  const swayY = Math.cos(sTime * 0.39) * 1.8;
  const rot = Math.sin(sTime * 0.31) * 0.1;
  const stickyLift =
    1.6 + Math.sin(sTime * 2.1) * 1.4 + Math.sin(sTime * 5.3) * 0.4;

  return (
    <AbsoluteFill style={{ backgroundColor: '#FBF6E8', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translate(${f2(swayX)}px, ${f2(swayY)}px) rotate(${rot.toFixed(3)}deg)`,
        }}
      >
        {useBaked ? (
          <BakedBgImg file={BAKED_BACKGROUND_FILES.cream_notebook} />
        ) : (
          <BgRuledNotebookStatic />
        )}
        <BgSvg>
          <defs>
            <clipPath id={dateClip}>
              <rect x={1600} y={90} width={300 * eo(sTime, 0.6, 1.3)} height={60} />
            </clipPath>
            <clipPath id={titleClip}>
              <rect x={250} y={130} width={420 * eo(sTime, 1.0, 1.8)} height={70} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${dateClip})`}>
            <text x={1640} y={128} fontFamily={FONT_HAND} fontSize={40} fill={pen}>
              {headerDate}
            </text>
          </g>

          <BgDraw
            d="M 262 182 L 610 176"
            sec={sTime}
            at={0.85}
            dur={0.5}
            stroke="rgba(255, 222, 70, 0.55)"
            width={30}
          />
          <g clipPath={`url(#${titleClip})`}>
            <text x={262} y={190} fontFamily={FONT_HAND} fontSize={48} fill={pen}>
              {headerNote}
            </text>
          </g>

          <BgDraw
            d="M 120 330 L 132 360 L 164 362 L 140 382 L 148 414 L 120 396 L 92 414 L 100 382 L 76 362 L 108 360 Z"
            sec={sTime}
            at={1.4}
            dur={0.6}
            stroke={pen}
            width={3.4}
          />
          <BgDraw
            d="M 84 540 Q 130 500 168 548 M 150 532 L 168 548 L 146 560"
            sec={sTime}
            at={2.0}
            dur={0.5}
            stroke={pen}
            width={3.4}
          />
          <BgDraw
            d={ring(124, 710, 34, 6)}
            sec={sTime}
            at={2.5}
            dur={0.5}
            stroke="rgba(206, 64, 56, 0.6)"
            width={3.4}
          />
          <BgDraw
            d="M 124 690 L 124 714 M 124 728 L 124 730"
            sec={sTime}
            at={2.9}
            dur={0.2}
            stroke="rgba(206, 64, 56, 0.7)"
            width={4.4}
          />

          <g transform={`rotate(${f2(4 + stickyLift * 0.3)} 1770 250)`}>
            <path
              d="M 1770 250 L 1960 250 L 1960 432 L 1770 440 Z"
              fill="rgba(60, 40, 10, 0.18)"
              transform={`translate(${f2(4 + stickyLift * 2)} ${f2(6 + stickyLift * 3)})`}
            />
            <path d="M 1770 250 L 1960 250 L 1960 432 L 1770 440 Z" fill="#FFE27A" />
            <path d="M 1770 250 L 1960 250 L 1960 286 L 1770 286 Z" fill="rgba(255, 255, 255, 0.18)" />
            <path
              d={`M 1770 440 L 1960 432 L 1960 ${f2(424 - stickyLift * 4)} Z`}
              fill="rgba(140, 100, 20, 0.16)"
            />
            <path
              d={handLine(1792, 330, 1920, 326, 3, 2)}
              stroke="rgba(40, 32, 26, 0.45)"
              strokeWidth={4}
              strokeLinecap="round"
            />
            <path
              d={handLine(1792, 370, 1890, 368, 3, 3)}
              stroke="rgba(40, 32, 26, 0.45)"
              strokeWidth={4}
              strokeLinecap="round"
            />
          </g>
          <g transform={`rotate(${f2(-3 + Math.sin(sTime * 1.7 + 1) * 0.5)} 1810 600)`}>
            <path
              d="M 1810 600 L 1960 600 L 1960 722 L 1810 728 Z"
              fill="rgba(60, 40, 10, 0.16)"
              transform="translate(5 7)"
            />
            <path d="M 1810 600 L 1960 600 L 1960 722 L 1810 728 Z" fill="#F7A9B8" />
          </g>
        </BgSvg>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to right, rgba(90, 70, 40, 0.18) 0px, rgba(90, 70, 40, 0) 130px)',
          pointerEvents: 'none',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 72% 80% at ${f2(18 + Math.sin(sTime * 0.25) * 2)}% -8%, rgba(255, 226, 170, 0.2) 0%, rgba(255, 226, 170, 0) 70%)`,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }}
      />
      <GrainLayer opacity={0.045} animated={animated} useBaked={useBaked} />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 96% 92% at 52% 50%, rgba(0,0,0,0) 62%, rgba(92, 74, 48, 0.14) 100%)',
          pointerEvents: 'none',
        }}
      />
      <SubtitleCalm color="#FBF6E8" strength={0.45} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 08 light_table : アニメーターの透写台（ライトテーブル）                        */
/* ========================================================================== */

const GHOSTS = [
  { x: 300, y: 380, r: 40, lean: -10 },
  { x: 470, y: 330, r: 36, lean: 8 },
  { x: 1560, y: 560, r: 38, lean: 12 },
];

/** 事前ベイク用：light_table の静的質感（木枠＋光るガラス盤＋原画用紙枠2枚＋ペグバー＋紙目凹凸＋繊維・不透明 PNG） */
export const BgLightTableStatic: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: '#3A322A', overflow: 'hidden', pointerEvents: 'none' }}>
    <div
      style={{
        position: 'absolute',
        inset: 20,
        background:
          'radial-gradient(ellipse 78% 74% at 50% 54%, #FFFEF8 0%, #FAF4E6 52%, #E9DDC4 100%)',
        boxShadow:
          'inset 0 0 0 2px rgba(255,255,255,0.25), inset 0 0 60px rgba(120, 96, 60, 0.35)',
      }}
    />
    <div style={{ position: 'absolute', inset: 20, overflow: 'hidden' }}>
      <BgSvg style={{ left: -20, top: -20, width: W, height: H }}>
        <g transform="rotate(-0.9 960 540)">
          <rect
            x={60}
            y={40}
            width={1800}
            height={1100}
            fill="none"
            stroke="rgba(140, 116, 80, 0.22)"
            strokeWidth={2}
          />
        </g>
        <g transform="rotate(0.6 960 540)">
          <rect
            x={44}
            y={58}
            width={1830}
            height={1100}
            fill="none"
            stroke="rgba(140, 116, 80, 0.18)"
            strokeWidth={2}
          />
        </g>
        <rect x={700} y={36} width={520} height={44} fill="#9E988D" />
        <rect x={700} y={36} width={520} height={8} fill="rgba(255,255,255,0.4)" />
        <rect x={700} y={74} width={520} height={6} fill="rgba(0,0,0,0.22)" />
        {[
          { x: 760, w: 26 },
          { x: 960, w: 78 },
          { x: 1160, w: 26 },
        ].map((p, i) => (
          <g key={i}>
            <rect
              x={p.x - p.w / 2 - 4}
              y={84}
              width={p.w + 8}
              height={30}
              fill="rgba(90, 70, 40, 0.18)"
            />
            <rect
              x={p.x - p.w / 2}
              y={50}
              width={p.w}
              height={56}
              fill="#C9C4BA"
              stroke="rgba(0,0,0,0.25)"
              strokeWidth={2}
            />
            <rect
              x={p.x - p.w / 2 + 4}
              y={54}
              width={4}
              height={48}
              fill="rgba(255,255,255,0.55)"
            />
          </g>
        ))}
      </BgSvg>
      <PaperToothLayer opacity={0.16} freq={0.1} seed={6} surface={1.2} />
      <NoiseLayer freq="0.01 0.25" seed={19} opacity={0.035} blend="multiply" />
    </div>
  </AbsoluteFill>
);

export const BgLightTable: React.FC<
  BgVariantProps & { cutCode?: string }
> = ({ sec, animated = true, useBaked = true, cutCode = 'A-24' }) => {
  const sTime = animated ? sec : 2.5;
  const flick =
    animated && sTime < 0.45
      ? ([0.35, 0.05, 0.42, 0.12, 0, 0.18, 0, 0, 0, 0, 0, 0, 0, 0][
          Math.floor(sTime * 30)
        ] ?? 0)
      : 0;
  const breathe = 0.04 + Math.sin(sTime * 1.4) * 0.015;
  const st = stepSec(sTime);
  const jitter = (k: number) =>
    animated ? (rnd(Math.floor(st * 7.5) * 3 + k) - 0.5) * 2.4 : 0;
  const bluePencil = 'rgba(58, 111, 216, 0.24)';
  const redPencil = 'rgba(216, 67, 58, 0.5)';

  const dynamicDrawings = (
    <>
      <g stroke={bluePencil} strokeWidth={3} fill="none" strokeLinecap="round">
        {GHOSTS.map((g, i) => (
          <g
            key={i}
            transform={`translate(${f2(jitter(i))} ${f2(jitter(i + 5))})`}
          >
            <path d={ring(g.x, g.y, g.r, i + 2)} />
            <path
              d={`M ${g.x} ${g.y + g.r} Q ${g.x + g.lean} ${g.y + g.r + 70} ${g.x + g.lean * 0.6} ${g.y + g.r + 140}`}
            />
            <path
              d={`M ${g.x + g.lean * 0.6} ${g.y + g.r + 140} L ${g.x - 40} ${g.y + g.r + 250} M ${g.x + g.lean * 0.6} ${g.y + g.r + 140} L ${g.x + 50} ${g.y + g.r + 246}`}
            />
            <path
              d={`M ${g.x - 4} ${g.y + g.r + 30} L ${g.x - 70} ${g.y + g.r + 100} M ${g.x + 2} ${g.y + g.r + 30} L ${g.x + 76} ${g.y + g.r + 80}`}
            />
            <path
              d={`M ${g.x - g.r - 20} ${g.y} L ${g.x + g.r + 20} ${g.y} M ${g.x} ${g.y - g.r - 16} L ${g.x} ${g.y + g.r + 10}`}
              strokeWidth={1.6}
              opacity={0.7}
            />
          </g>
        ))}
        <path d="M 260 760 Q 760 520 1240 700" strokeDasharray="4 14" strokeWidth={2.4} />
        {[0, 1, 2, 3, 4, 5].map((k) => {
          const t = k / 5;
          const x =
            (1 - t) * (1 - t) * 260 + 2 * (1 - t) * t * 760 + t * t * 1240;
          const y =
            (1 - t) * (1 - t) * 760 + 2 * (1 - t) * t * 520 + t * t * 700;
          return (
            <path
              key={k}
              d={`M ${f2(x)} ${f2(y - 12)} L ${f2(x)} ${f2(y + 12)}`}
              strokeWidth={2.4}
            />
          );
        })}
      </g>

      <g stroke={redPencil} strokeWidth={2.6} fill="none" strokeLinecap="round">
        <BgDraw
          d="M 1700 170 L 1700 440"
          sec={sTime}
          at={0.5}
          dur={0.4}
          stroke={redPencil}
          width={2.6}
        />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => {
          const y = 170 + k * k * 3.4;
          return (
            <BgDraw
              key={k}
              d={`M 1684 ${f2(y)} L 1716 ${f2(y)}`}
              sec={sTime}
              at={0.8 + k * 0.06}
              dur={0.1}
              stroke={redPencil}
              width={2.6}
            />
          );
        })}
        <BgDraw
          d={ring(1806, 150, 46, 2)}
          sec={sTime}
          at={0.9}
          dur={0.5}
          stroke={redPencil}
          width={2.6}
        />
      </g>
      {sTime > 1.2 ? (
        <text
          x={1806}
          y={162}
          textAnchor="middle"
          fontFamily={FONT_HAND}
          fontSize={34}
          fill="rgba(216, 67, 58, 0.72)"
          opacity={eio(sTime, 1.2, 1.5)}
        >
          {cutCode}
        </text>
      ) : null}
      <text
        x={1728}
        y={186}
        fontFamily={FONT_HAND}
        fontSize={22}
        fill="rgba(216, 67, 58, 0.55)"
      >
        1
      </text>
      <text
        x={1728}
        y={448}
        fontFamily={FONT_HAND}
        fontSize={22}
        fill="rgba(216, 67, 58, 0.55)"
      >
        9
      </text>
    </>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#3A322A', overflow: 'hidden' }}>
      {useBaked ? (
        <>
          <BakedBgImg file={BAKED_BACKGROUND_FILES.light_table} />
          <div style={{ position: 'absolute', inset: 20, overflow: 'hidden' }}>
            <BgSvg style={{ left: -20, top: -20, width: W, height: H }}>
              {dynamicDrawings}
            </BgSvg>
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 20,
              background:
                'radial-gradient(ellipse 78% 74% at 50% 54%, #FFFEF8 0%, #FAF4E6 52%, #E9DDC4 100%)',
              boxShadow:
                'inset 0 0 0 2px rgba(255,255,255,0.25), inset 0 0 60px rgba(120, 96, 60, 0.35)',
            }}
          />
          <div style={{ position: 'absolute', inset: 20, overflow: 'hidden' }}>
            <BgSvg style={{ left: -20, top: -20, width: W, height: H }}>
              <g transform="rotate(-0.9 960 540)">
                <rect
                  x={60}
                  y={40}
                  width={1800}
                  height={1100}
                  fill="none"
                  stroke="rgba(140, 116, 80, 0.22)"
                  strokeWidth={2}
                />
              </g>
              <g transform="rotate(0.6 960 540)">
                <rect
                  x={44}
                  y={58}
                  width={1830}
                  height={1100}
                  fill="none"
                  stroke="rgba(140, 116, 80, 0.18)"
                  strokeWidth={2}
                />
              </g>
              {dynamicDrawings}
              <rect x={700} y={36} width={520} height={44} fill="#9E988D" />
              <rect x={700} y={36} width={520} height={8} fill="rgba(255,255,255,0.4)" />
              <rect x={700} y={74} width={520} height={6} fill="rgba(0,0,0,0.22)" />
              {[
                { x: 760, w: 26 },
                { x: 960, w: 78 },
                { x: 1160, w: 26 },
              ].map((p, i) => (
                <g key={i}>
                  <rect
                    x={p.x - p.w / 2 - 4}
                    y={84}
                    width={p.w + 8}
                    height={30}
                    fill="rgba(90, 70, 40, 0.18)"
                  />
                  <rect
                    x={p.x - p.w / 2}
                    y={50}
                    width={p.w}
                    height={56}
                    fill="#C9C4BA"
                    stroke="rgba(0,0,0,0.25)"
                    strokeWidth={2}
                  />
                  <rect
                    x={p.x - p.w / 2 + 4}
                    y={54}
                    width={4}
                    height={48}
                    fill="rgba(255,255,255,0.55)"
                  />
                </g>
              ))}
            </BgSvg>
            <PaperToothLayer opacity={0.16} freq={0.1} seed={6} surface={1.2} />
            <NoiseLayer freq="0.01 0.25" seed={19} opacity={0.035} blend="multiply" />
          </div>
        </>
      )}

      <AbsoluteFill
        style={{
          background: `rgba(255, 248, 230, ${f2(breathe)})`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />
      {flick > 0 ? (
        <AbsoluteFill
          style={{ background: `rgba(30, 24, 18, ${f2(flick)})`, pointerEvents: 'none' }}
        />
      ) : null}
      <GrainLayer opacity={0.03} animated={animated} useBaked={useBaked} />
      <SubtitleCalm color="#F4ECDA" strength={0.35} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 公式 PolarityBackground ディスパッチャ（全8背景対応）                          */
/* ========================================================================== */

export interface StudioBackgroundProps {
  polarity: StudioBackgroundPolarity;
  enterSec?: number;
  sec?: number;
  actorX?: number;
  animated?: boolean;
  /** 事前ベイク済み PNG を使用するか（既定 true） */
  useBaked?: boolean;
}

/**
 * stickman-collage v2.1 公式8背景ルーター。
 * 重い静的質感は事前ベイク PNG（studio/public/backgrounds/*.png）を <Img> で読み込み、
 * 動的演出（照明・チリ・回転フランジ・湯気・揺れる赤糸等）と SubtitleCalm を重ねる。
 */
export const StudioBackground: React.FC<StudioBackgroundProps> = ({
  polarity,
  enterSec,
  sec,
  actorX = 960,
  animated = true,
  useBaked = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = sec ?? frame / Math.max(1, fps);
  const localSec =
    enterSec !== undefined ? Math.max(0, currentSec - enterSec) : currentSec;

  switch (polarity) {
    case 'white_sketch':
      return <BgWarmWhiteSketch sec={localSec} actorX={actorX} animated={animated} useBaked={useBaked} />;
    case 'grid_paper':
      return <BgDraftingGrid sec={localSec} actorX={actorX} animated={animated} useBaked={useBaked} />;
    case 'wood_desk':
      return <BgWoodDesk sec={localSec} actorX={actorX} animated={animated} useBaked={useBaked} />;
    case 'kraft_cork':
      return <BgKraftCork sec={localSec} actorX={actorX} animated={animated} useBaked={useBaked} />;
    case 'blueprint':
      return <BgMidnightBlueprint sec={localSec} actorX={actorX} animated={animated} useBaked={useBaked} />;
    case 'cream_notebook':
      return <BgRuledNotebook sec={localSec} actorX={actorX} animated={animated} useBaked={useBaked} />;
    case 'light_table':
      return <BgLightTable sec={localSec} actorX={actorX} animated={animated} useBaked={useBaked} />;
    case 'black':
    default:
      return <BgStudioBlackRich sec={localSec} actorX={actorX} animated={animated} useBaked={useBaked} />;
  }
};

export type PolarityBackgroundProps = StudioBackgroundProps;
export const PolarityBackground = StudioBackground;
