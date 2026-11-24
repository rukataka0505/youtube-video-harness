import React from 'react';
import { AbsoluteFill } from 'remotion';
import { FONT_SANS } from '../../../components/stickman_collage';
import {
  Draw,
  FLOOR_Y,
  Grain,
  H,
  Noise,
  PaperTooth,
  Stage,
  SubtitleCalm,
  W,
  eio,
  f2,
  handLine,
  lerp,
  ring,
  rnd,
  rr,
  useSid,
} from './kit';

export interface BgProps {
  /** セグメント内の経過秒（0..5） */
  sec: number;
  /** 棒人間の腰の x（照明の追従などに使う） */
  actorX: number;
}

/* ========================================================================== */
/* 01 黒スタジオ／黒板リッチ                                                   */
/*  照明の柱（ボリュームライト）が主役を追い、柱の中だけヘイズとチリが光る。     */
/*  奥の壁は消し跡の残る黒板、遠景に玉ボケの実用光、床にはライト溜まり。         */
/* ========================================================================== */

const DUST = Array.from({ length: 70 }, (_, i) => {
  const z = 0.25 + rnd(i + 1) * 0.75;
  return {
    i,
    z,
    x0: rnd(i + 101) * W,
    y0: rnd(i + 211) * H,
    r: 0.9 + z * 2.4,
    rise: 6 + z * 16,
    sway: 6 + rnd(i + 307) * 18,
    freq: 0.12 + rnd(i + 401) * 0.25,
    ph: rnd(i + 503) * Math.PI * 2,
    tw: 0.6 + rnd(i + 601) * 1.6,
  };
});

const BOKEH = [
  { x: 210, y: 210, r: 46, c: '255, 186, 102', ph: 0.2 },
  { x: 330, y: 330, r: 22, c: '255, 210, 150', ph: 1.4 },
  { x: 120, y: 420, r: 30, c: '120, 200, 220', ph: 2.2 },
  { x: 1620, y: 180, r: 38, c: '255, 196, 120', ph: 0.9 },
  { x: 1760, y: 320, r: 54, c: '110, 190, 214', ph: 2.8 },
  { x: 1500, y: 390, r: 20, c: '255, 220, 170', ph: 3.6 },
  { x: 1840, y: 140, r: 18, c: '255, 186, 102', ph: 4.4 },
];

export const BgStudioBlackRich: React.FC<BgProps> = ({ sec, actorX }) => {
  const beamGrad = useSid('beam');
  const beamBlur = useSid('beamblur');
  const beamClip = useSid('beamclip');
  const haze = useSid('haze');
  const chalk = useSid('chalk');
  const bokehBlur = useSid('bokeh');

  const spotX = lerp(960, actorX, 0.62) + Math.sin(sec * 0.6) * 26;
  const warm = sec < 0.4 ? 0.7 + 0.3 * (sec / 0.4) + Math.sin(sec * 70) * 0.05 : 1;
  const breathe = (0.92 + Math.sin(sec * 1.1) * 0.08) * warm;

  const srcX = spotX - 260;
  const beam = `M ${f2(srcX - 70)} -60 L ${f2(srcX + 70)} -60 L ${f2(spotX + 420)} ${FLOOR_Y + 30} L ${f2(spotX - 420)} ${FLOOR_Y + 30} Z`;

  const inBeam = (x: number, y: number): number => {
    const t = Math.max(0, Math.min(1, (y + 60) / (FLOOR_Y + 90)));
    const cx = lerp(srcX, spotX, t);
    const half = lerp(70, 420, t);
    const d = Math.abs(x - cx) / half;
    return Math.max(0, 1 - d * d) * (y < FLOOR_Y + 20 ? 1 : 0);
  };

  return (
    <AbsoluteFill style={{ backgroundColor: '#030303', overflow: 'hidden' }}>
      {/* 奥の壁：わずかに暖色を含んだ黒板グレー */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 62% 70% at ${f2((spotX / W) * 100)}% 46%, rgba(46, 44, 40, ${f2(0.95 * breathe)}) 0%, rgba(20, 19, 18, 0.9) 48%, rgba(5, 5, 5, 1) 86%)`,
        }}
      />
      {/* 黒板の消し跡（低周波スマッジ） */}
      <Noise
        freq="0.006 0.02"
        octaves={3}
        seed={11}
        matrix="0 0 0 0 0.92  0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 2.6 -1.1"
        opacity={0.1}
        blend="screen"
      />

      <Stage>
        <defs>
          <linearGradient id={beamGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFEFD6" stopOpacity={0.2} />
            <stop offset="60%" stopColor="#FFE9C8" stopOpacity={0.085} />
            <stop offset="100%" stopColor="#FFE2B8" stopOpacity={0.05} />
          </linearGradient>
          <filter id={beamBlur} x="-20%" y="-10%" width="140%" height="120%">
            <feGaussianBlur stdDeviation={26} />
          </filter>
          <clipPath id={beamClip}>
            <path d={beam} />
          </clipPath>
          <filter id={haze} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.008" numOctaves={3} seed={4} result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.88  0 0 0 1.8 -0.7" />
          </filter>
          <filter id={chalk} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency={0.9} numOctaves={1} seed={9} result="g" />
            <feDisplacementMap in="SourceGraphic" in2="g" scale={5} result="d" />
            <feGaussianBlur in="d" stdDeviation={1.4} />
          </filter>
          <filter id={bokehBlur} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={9} />
          </filter>
        </defs>

        {/* 消し残したチョーク跡（奥の壁） */}
        <g filter={`url(#${chalk})`} stroke="#EDE9DF" fill="none" strokeLinecap="round" opacity={0.11}>
          <path d="M 120 190 Q 260 150 400 196" strokeWidth={6} />
          <path d="M 380 176 L 404 196 L 374 212" strokeWidth={6} />
          <path d={ring(560, 260, 70, 3)} strokeWidth={5} />
          <path d="M 520 236 L 600 286 M 600 236 L 520 286" strokeWidth={4} opacity={0.6} />
          <path d="M 1330 150 C 1400 120, 1480 220, 1560 170 S 1700 130, 1760 190" strokeWidth={5} />
          <path d="M 1380 250 L 1700 250 M 1380 300 L 1620 300" strokeWidth={4} opacity={0.7} />
          <text x={140} y={330} fontFamily={FONT_SANS} fontSize={46} fill="#EDE9DF" stroke="none" opacity={0.8}>
            {'Δ = ?'}
          </text>
        </g>

        {/* 遠景の玉ボケ（実用光） */}
        <g filter={`url(#${bokehBlur})`}>
          {BOKEH.map((b, i) => (
            <circle
              key={i}
              cx={b.x + Math.sin(sec * 0.4 + b.ph) * 6}
              cy={b.y}
              r={b.r}
              fill={`rgba(${b.c}, ${f2(0.16 + Math.sin(sec * 1.3 + b.ph) * 0.05)})`}
            />
          ))}
        </g>

        {/* 床のホリゾント：壁との境目と、主役の下のライト溜まり */}
        <rect x={0} y={FLOOR_Y - 40} width={W} height={H - FLOOR_Y + 40} fill="rgba(40, 37, 33, 0.35)" filter={`url(#${beamBlur})`} />
        <ellipse cx={spotX} cy={FLOOR_Y + 22} rx={540} ry={78} fill={`rgba(150, 134, 110, ${f2(0.26 * breathe)})`} filter={`url(#${beamBlur})`} />

        {/* 照明の柱 */}
        <path d={beam} fill={`url(#${beamGrad})`} filter={`url(#${beamBlur})`} opacity={breathe} />
        <g clipPath={`url(#${beamClip})`} opacity={0.2 * breathe}>
          <g transform={`translate(${f2(sec * 22)} ${f2(-sec * 9)})`}>
            <rect x={-300} y={-200} width={W + 600} height={H + 400} filter={`url(#${haze})`} />
          </g>
        </g>

        {/* 浮遊チリ：柱の中で強く光る */}
        {DUST.map((d) => {
          const y = (((d.y0 - sec * d.rise) % H) + H) % H;
          const x = d.x0 + Math.sin(sec * d.freq * Math.PI * 0.5 + d.ph) * d.sway;
          const lit = inBeam(x, y);
          const tw = 0.7 + 0.3 * Math.sin(sec * d.tw + d.ph);
          const op = (0.03 + lit * 0.55) * d.z * tw * warm;
          return op < 0.012 ? null : <circle key={d.i} cx={x} cy={y} r={d.r} fill="#FFF3DE" opacity={op} />;
        })}
      </Stage>

      <Grain opacity={0.1} blend="screen" freq={0.9} />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse 100% 92% at 50% 44%, rgba(0, 0, 0, 0) 52%, rgba(0, 0, 0, 0.7) 100%)',
        }}
      />
      <SubtitleCalm color="#000000" strength={0.55} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 02 白い画用紙スケッチブック                                                  */
/*  冷圧水彩紙の凹凸 × 窓からの陽だまり × そよぐ木漏れ影 × 鉛筆の下描き。          */
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

export const BgWarmWhiteSketch: React.FC<BgProps> = ({ sec }) => {
  const mask = useSid('sunmask');
  const soft = useSid('sunsoft');
  const leafBlur = useSid('leafblur');
  const graphite = 'rgba(70, 70, 78, 0.3)';
  const drift = sec * 7;
  const pane = (x: number, y: number, w: number, h: number) =>
    `M ${f2(x + drift)} ${y} L ${f2(x + w + drift)} ${y} L ${f2(x + w - h * 0.55 + drift)} ${y + h} L ${f2(x - h * 0.55 + drift)} ${y + h} Z`;
  const breeze = Math.sin(sec * 0.9) * 0.6 + Math.sin(sec * 2.3) * 0.4;

  return (
    <AbsoluteFill style={{ backgroundColor: '#FFFCF4', overflow: 'hidden' }}>
      <PaperTooth opacity={0.26} freq={0.12} seed={5} surface={1.8} />
      <Noise freq="0.012 0.3" seed={8} opacity={0.035} blend="multiply" />

      {/* 陽だまり：影（暖灰）を全面に敷き、窓の形と木漏れで抜く */}
      <Stage style={{ mixBlendMode: 'multiply' }}>
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
                  cx={l.x + drift + Math.sin(sec * 1.4 + l.ph) * l.amp * (1 + breeze * 0.4)}
                  cy={l.y + Math.cos(sec * 1.1 + l.ph) * l.amp * 0.5}
                  rx={l.rx}
                  ry={l.ry}
                  transform={`rotate(${f2(l.rot + Math.sin(sec + l.ph) * 8)} ${f2(l.x + drift)} ${l.y})`}
                />
              ))}
            </g>
          </mask>
        </defs>
        <rect width={W} height={H} fill="rgba(188, 164, 124, 0.24)" mask={`url(#${mask})`} />
      </Stage>
      {/* 陽だまりの暖かさ */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 50% 60% at ${f2(66 + sec * 0.3)}% 30%, rgba(255, 228, 170, 0.22) 0%, rgba(255, 228, 170, 0) 70%)`,
          mixBlendMode: 'multiply',
        }}
      />

      {/* 鉛筆の下描き */}
      <Stage>
        <Draw d={handLine(80, FLOOR_Y + 2, 1840, FLOOR_Y - 4, 6, 3)} sec={sec} at={0.05} dur={0.9} stroke={graphite} width={2.6} />
        <Draw d={handLine(140, FLOOR_Y + 16, 1100, FLOOR_Y + 12, 4, 4)} sec={sec} at={0.4} dur={0.8} stroke="rgba(70,70,78,0.16)" width={1.8} />
        {/* 左上：立方体の構図スケッチ */}
        <g opacity={0.9}>
          <Draw d="M 220 210 L 340 170 L 450 215 L 330 258 Z" sec={sec} at={0.3} dur={0.6} stroke={graphite} width={2.2} />
          <Draw d="M 220 210 L 222 340 L 330 388 L 330 258 M 330 388 L 448 342 L 450 215" sec={sec} at={0.7} dur={0.7} stroke={graphite} width={2.2} />
          <Draw d={`M 330 258 L 1500 120`} sec={sec} at={1.2} dur={0.9} stroke="rgba(70,70,78,0.1)" width={1.4} />
          {Array.from({ length: 9 }, (_, k) => (
            <Draw
              key={k}
              d={`M ${334 + k * 12} ${386 - k * 4} L ${334 + k * 12} ${262 - k * 4}`}
              sec={sec}
              at={1.4 + k * 0.05}
              dur={0.12}
              stroke="rgba(70,70,78,0.22)"
              width={1.6}
            />
          ))}
        </g>
        {/* 右上：サムネイル（コマ割りのラフ） */}
        {[0, 1, 2].map((k) => (
          <g key={k}>
            <Draw d={rr(1430 + k * 140, 108, 120, 78, 3, k + 2)} sec={sec} at={0.6 + k * 0.4} dur={0.4} stroke={graphite} width={2} />
            <Draw
              d={`M ${1446 + k * 140} ${170} Q ${1480 + k * 140} ${130 + k * 6} ${1530 + k * 140} ${160}`}
              sec={sec}
              at={0.95 + k * 0.4}
              dur={0.3}
              stroke="rgba(70,70,78,0.24)"
              width={1.8}
            />
          </g>
        ))}
        {/* 足元の影ハッチング（左下） */}
        {Array.from({ length: 14 }, (_, k) => (
          <Draw
            key={k}
            d={handLine(170 + k * 18, FLOOR_Y + 50, 230 + k * 18, FLOOR_Y + 8, 2, k + 40)}
            sec={sec}
            at={1.8 + k * 0.04}
            dur={0.1}
            stroke="rgba(70,70,78,0.16)"
            width={1.8}
          />
        ))}
        {/* 消しゴムのカス */}
        {Array.from({ length: 7 }, (_, i) => (
          <path
            key={i}
            d="M -5 0 C -3 -3, 2 -3, 5 -1 C 4 2, -2 3, -5 0 Z"
            transform={`translate(${f2(1580 + rnd(i + 700) * 220)} ${f2(720 + rnd(i + 730) * 90)}) rotate(${f2(rnd(i + 760) * 180)}) scale(${f2(0.7 + rnd(i + 790))})`}
            fill="rgba(150, 140, 128, 0.32)"
          />
        ))}
      </Stage>

      <Grain opacity={0.035} />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse 100% 94% at 52% 46%, rgba(255,255,255,0) 64%, rgba(120, 100, 70, 0.16) 100%)',
        }}
      />
      <SubtitleCalm color="#FBF7EE" strength={0.5} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 03 製図台・方眼紙                                                           */
/*  2段グリッドと目盛りがスッと流れ、寸法線とコンパスの円弧が描かれていく。       */
/*  透明な三角定規、マスキングテープ、デスクライトの陰影。                       */
/* ========================================================================== */

const Tape: React.FC<{ x: number; y: number; rot: number; w?: number }> = ({ x, y, rot, w = 190 }) => {
  const h = 48;
  const jag = (side: number) =>
    Array.from({ length: 7 }, (_, k) => `${f2(side + (rnd(k + side + x) - 0.5) * 7)} ${f2((k / 6) * h)}`).join(' L ');
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d={`M 0 0 L ${w} 0 L ${jag(w)} L 0 ${h} L ${jag(0).split(' L ').reverse().join(' L ')} Z`} fill="rgba(232, 218, 176, 0.78)" />
      <path d={`M 6 8 L ${w - 6} 8`} stroke="rgba(255, 255, 255, 0.35)" strokeWidth={3} />
      <path d={`M 0 ${h} L ${w} ${h}`} stroke="rgba(120, 100, 60, 0.18)" strokeWidth={2} />
    </g>
  );
};

export const BgDraftingGrid: React.FC<BgProps> = ({ sec }) => {
  const ink = 'rgba(30, 60, 64, 0.5)';
  const panX = sec * 5;
  const panY = sec * 1.8;
  const lampX = 10 + Math.sin(sec * 0.3) * 2;
  const tri = `M 1806 230 L 2010 230 L 2010 640 Z M 1872 290 L 1972 290 L 1972 490 Z`;
  const triY = -sec * 5;
  const arcStart = 200;
  const arcSweep = 150 * eio(sec, 1.1, 4.4);
  const cx = 330;
  const cy = 330;
  const r = 150;
  const a0 = arcStart * (Math.PI / 180);
  const a1 = (arcStart + arcSweep) * (Math.PI / 180);
  const arc =
    arcSweep > 0.5
      ? `M ${f2(cx + Math.cos(a0) * r)} ${f2(cy + Math.sin(a0) * r)} A ${r} ${r} 0 ${arcSweep > 180 ? 1 : 0} 1 ${f2(cx + Math.cos(a1) * r)} ${f2(cy + Math.sin(a1) * r)}`
      : '';
  const legX = cx + Math.cos(a1) * r;
  const legY = cy + Math.sin(a1) * r;
  const arrow = (x: number, y: number, dir: 1 | -1, vertical = false) =>
    vertical ? `M ${x - 8} ${y + dir * 16} L ${x} ${y} L ${x + 8} ${y + dir * 16}` : `M ${x + dir * 16} ${y - 8} L ${x} ${y} L ${x + dir * 16} ${y + 8}`;

  return (
    <AbsoluteFill style={{ backgroundColor: '#EEF2E8', overflow: 'hidden' }}>
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
        }}
      />
      <PaperTooth opacity={0.28} freq={0.12} seed={2} surface={1.6} />
      <Noise freq="0.016 0.42" seed={7} opacity={0.06} blend="multiply" />

      <Stage>
        {/* 上端・左端の印刷目盛り（グリッドと同期して流れる） */}
        <g stroke="rgba(28, 98, 90, 0.55)" strokeWidth={1.6}>
          {Array.from({ length: 84 }, (_, k) => {
            const x = ((k * 24 + panX) % (84 * 24)) - 24;
            const major = Math.round((x - panX) / 24) % 5 === 0;
            return <path key={k} d={`M ${f2(x)} 0 L ${f2(x)} ${major ? 20 : 9}`} />;
          })}
          {Array.from({ length: 48 }, (_, k) => {
            const y = ((k * 24 + panY) % (48 * 24)) - 24;
            const major = Math.round((y - panY) / 24) % 5 === 0;
            return y > 100 && y < 860 ? <path key={k} d={`M 0 ${f2(y)} L ${major ? 20 : 9} ${f2(y)}`} /> : null;
          })}
        </g>

        {/* 寸法線（上） */}
        <g opacity={0.9}>
          <Draw d={`M 300 ${170} L 300 ${120}`} sec={sec} at={0.2} dur={0.2} stroke={ink} width={1.8} />
          <Draw d={`M 1620 ${170} L 1620 ${120}`} sec={sec} at={0.3} dur={0.2} stroke={ink} width={1.8} />
          <Draw d="M 300 140 L 900 140 M 1020 140 L 1620 140" sec={sec} at={0.45} dur={0.6} stroke={ink} width={2} />
          <Draw d={arrow(300, 140, 1)} sec={sec} at={0.95} dur={0.15} stroke={ink} width={2} />
          <Draw d={arrow(1620, 140, -1)} sec={sec} at={0.95} dur={0.15} stroke={ink} width={2} />
          {sec > 1.0 ? (
            <text x={960} y={148} textAnchor="middle" fontFamily={FONT_SANS} fontSize={24} fontWeight={700} fill={ink} opacity={eio(sec, 1.0, 1.3)}>
              1320
            </text>
          ) : null}
          {/* 右の縦寸法 */}
          <Draw d={`M 1700 260 L 1700 ${FLOOR_Y}`} sec={sec} at={0.9} dur={0.6} stroke={ink} width={2} />
          <Draw d={arrow(1700, 260, 1, true)} sec={sec} at={1.4} dur={0.15} stroke={ink} width={2} />
          <Draw d={arrow(1700, FLOOR_Y, -1, true)} sec={sec} at={1.4} dur={0.15} stroke={ink} width={2} />
          {sec > 1.5 ? (
            <text
              x={1724}
              y={540}
              fontFamily={FONT_SANS}
              fontSize={22}
              fontWeight={700}
              fill={ink}
              opacity={eio(sec, 1.5, 1.8)}
              transform="rotate(90 1724 540)"
            >
              H 552
            </text>
          ) : null}
        </g>

        {/* コンパスの円弧（左上）：ゆっくり描かれていく */}
        <path d={`M ${cx - 14} ${cy} L ${cx + 14} ${cy} M ${cx} ${cy - 14} L ${cx} ${cy + 14}`} stroke={ink} strokeWidth={2} />
        {arc ? <path d={arc} stroke="rgba(30, 40, 44, 0.42)" strokeWidth={2.2} fill="none" strokeLinecap="round" /> : null}
        {arcSweep > 0.5 && sec < 4.5 ? (
          <g opacity={1 - eio(sec, 4.3, 4.6)}>
            <path d={`M ${cx} ${cy} L ${f2((cx + legX) / 2 + 30)} ${f2((cy + legY) / 2 - 160)} L ${f2(legX)} ${f2(legY)}`} stroke="rgba(60, 64, 70, 0.28)" strokeWidth={5} fill="none" strokeLinejoin="round" />
          </g>
        ) : null}
        {sec > 2.2 ? (
          <text x={cx + 24} y={cy - 18} fontFamily={FONT_SANS} fontSize={20} fontWeight={700} fill={ink} opacity={eio(sec, 2.2, 2.5)}>
            R150
          </text>
        ) : null}

        {/* 鉛筆の補助線 */}
        <Draw d={handLine(-40, 640, W + 40, 620, 14, 5)} sec={sec} at={0.35} dur={1.0} stroke="rgba(28, 25, 23, 0.1)" width={1.8} />
        <Draw d={handLine(1320, -40, 1360, H + 40, 18, 6)} sec={sec} at={0.7} dur={1.0} stroke="rgba(28, 25, 23, 0.08)" width={1.8} />

        {/* 透明の三角定規（右端・ゆっくりずれる） */}
        <g transform={`translate(0 ${f2(triY)}) rotate(${f2(Math.sin(sec * 0.5) * 0.6)} 1900 430)`}>
          <path d={tri} fillRule="evenodd" fill="rgba(120, 196, 206, 0.16)" stroke="rgba(40, 120, 132, 0.42)" strokeWidth={2.4} />
          <path d="M 1812 236 L 2004 236" stroke="rgba(255, 255, 255, 0.6)" strokeWidth={2} />
          {Array.from({ length: 9 }, (_, k) => (
            <path key={k} d={`M ${1820 + k * 20} 232 L ${1820 + k * 20} ${k % 5 === 0 ? 252 : 244}`} stroke="rgba(30, 90, 100, 0.45)" strokeWidth={1.4} />
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
      </Stage>

      <Grain opacity={0.04} />
      {/* デスクライトの陰影 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 66% 78% at ${f2(lampX)}% -6%, rgba(255, 246, 222, 0.55) 0%, rgba(255, 246, 222, 0) 64%)`,
          mixBlendMode: 'screen',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 110% 100% at ${f2(lampX + 20)}% 10%, rgba(0,0,0,0) 46%, rgba(64, 58, 40, 0.22) 100%)`,
          mixBlendMode: 'multiply',
        }}
      />
      <SubtitleCalm color="#EEF2E8" strength={0.45} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 04 木目デスク                                                               */
/*  3枚板の天板（年輪は等高線化したノイズ）× 卓上ランプの暖光溜まり               */
/*  × 湯気の立つマグ・鉛筆・クリップ。主役は「切り抜きシール」として載せる。       */
/* ========================================================================== */

const PLANKS = [
  { y: 0, h: 352, seed: 21, tint: '#9C6B43' },
  { y: 352, h: 368, seed: 37, tint: '#8F5F38' },
  { y: 720, h: 360, seed: 53, tint: '#93633B' },
];

const WoodPlank: React.FC<{ y: number; h: number; seed: number; tint: string }> = ({ y, h, seed, tint }) => {
  const ringsId = useSid('rings');
  const fiberId = useSid('fiber');
  const clipId = useSid('plank');
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={y} width={W} height={h} />
        </clipPath>
        <filter id={ringsId} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0009 0.017" numOctaves={3} seed={seed} result="n" />
          <feComponentTransfer in="n" result="b">
            <feFuncR type="table" tableValues="0 1 0.15 0.95 0 1 0.15 0.95 0 1 0.15 0.95 0" />
          </feComponentTransfer>
          <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.09  0 0 0 0 0.03  0.78 0 0 0 0" />
        </filter>
        <filter id={fiberId} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0025 0.32" numOctaves={2} seed={seed + 5} result="f" />
          <feColorMatrix in="f" type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.08  0 0 0 0 0.03  1.6 0 0 0 -0.62" />
        </filter>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x={0} y={y} width={W} height={h} fill={tint} />
        <rect x={-200} y={y - 40} width={W + 400} height={h + 80} filter={`url(#${ringsId})`} transform={`rotate(-0.6 960 ${y + h / 2})`} />
        <rect x={0} y={y} width={W} height={h} filter={`url(#${fiberId})`} opacity={0.55} />
      </g>
    </g>
  );
};

export const BgWoodDesk: React.FC<BgProps> = ({ sec }) => {
  const shadow = useSid('mugshadow');
  const steamBlur = useSid('steam');
  const lampX = 34 + Math.sin(sec * 0.35) * 1.6;
  const flick = 0.94 + Math.sin(sec * 3.1) * 0.03 + Math.sin(sec * 7.7) * 0.015;
  const camX = Math.sin(sec * 0.45) * 5;
  const camY = Math.cos(sec * 0.38) * 3;
  const mug = { x: 1770, y: 190 };

  return (
    <AbsoluteFill style={{ backgroundColor: '#7A4E2D', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${f2(camX)}px, ${f2(camY)}px) scale(1.012)` }}>
        <Stage>
          <defs>
            <filter id={shadow} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={12} />
            </filter>
            <filter id={steamBlur} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={7} />
            </filter>
          </defs>
          {PLANKS.map((p) => (
            <WoodPlank key={p.seed} {...p} />
          ))}
          {/* 板の継ぎ目 */}
          {[352, 720].map((y) => (
            <g key={y}>
              <path d={`M -20 ${y} L ${W + 20} ${y + 2}`} stroke="rgba(28, 12, 4, 0.6)" strokeWidth={4} />
              <path d={`M -20 ${y + 3.5} L ${W + 20} ${y + 5.5}`} stroke="rgba(255, 220, 180, 0.14)" strokeWidth={1.6} />
            </g>
          ))}
          {/* 節 */}
          <ellipse cx={1460} cy={560} rx={34} ry={14} fill="rgba(50, 24, 10, 0.32)" />
          <ellipse cx={1460} cy={560} rx={54} ry={24} fill="none" stroke="rgba(50, 24, 10, 0.18)" strokeWidth={4} />
          <ellipse cx={420} cy={980} rx={26} ry={10} fill="rgba(50, 24, 10, 0.28)" />

          {/* コーヒー染み */}
          <path d={ring(1520, 300, 66, 4)} fill="none" stroke="rgba(52, 26, 10, 0.2)" strokeWidth={7} />

          {/* マグ（俯瞰）＋湯気 */}
          <ellipse cx={mug.x + 18} cy={mug.y + 26} rx={100} ry={100} fill="rgba(20, 8, 2, 0.5)" filter={`url(#${shadow})`} />
          <path d={`M ${mug.x + 82} ${mug.y - 30} C ${mug.x + 150} ${mug.y - 40}, ${mug.x + 160} ${mug.y + 40}, ${mug.x + 84} ${mug.y + 34}`} fill="none" stroke="#E9E2D4" strokeWidth={22} strokeLinecap="round" />
          <circle cx={mug.x} cy={mug.y} r={94} fill="#EFE8DA" />
          <circle cx={mug.x} cy={mug.y} r={94} fill="none" stroke="rgba(120, 100, 80, 0.4)" strokeWidth={3} />
          <circle cx={mug.x} cy={mug.y} r={76} fill="#3B2112" />
          <ellipse cx={mug.x - 18} cy={mug.y - 20} rx={34} ry={16} fill="rgba(210, 160, 110, 0.35)" transform={`rotate(-30 ${mug.x} ${mug.y})`} />
          <g filter={`url(#${steamBlur})`} fill="none" strokeLinecap="round">
            {[0, 1, 2].map((k) => {
              const t = (sec * 0.45 + k / 3) % 1;
              const x0 = mug.x - 30 + k * 30;
              const y0 = mug.y - 20 - t * 260;
              const wv = Math.sin(sec * 1.6 + k * 2) * 26;
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

          {/* 鉛筆（左上・対角に転がる） */}
          <g transform={`rotate(-14 340 260)`}>
            <rect x={150} y={256} width={330} height={26} fill="rgba(20, 8, 2, 0.4)" filter={`url(#${shadow})`} transform="translate(10 16)" />
            <path d="M 176 244 L 470 244 L 470 270 L 176 270 Z" fill="#E7B53A" />
            <path d="M 176 252 L 470 252" stroke="rgba(255, 255, 255, 0.35)" strokeWidth={3} />
            <path d="M 176 263 L 470 263" stroke="rgba(120, 80, 10, 0.3)" strokeWidth={3} />
            <path d="M 470 244 L 524 257 L 470 270 Z" fill="#E8C9A0" />
            <path d="M 508 253 L 524 257 L 508 261 Z" fill="#2B2B2B" />
            <rect x={150} y={243} width={28} height={28} fill="#B8B2A8" />
            <rect x={124} y={244} width={28} height={26} fill="#E58C8C" />
          </g>

          {/* クリップ */}
          <g transform="translate(1690 650) rotate(24)" fill="none" stroke="#C9CCD2" strokeWidth={5} strokeLinecap="round">
            <path d="M 0 0 L 0 -70 Q 0 -86 14 -86 Q 28 -86 28 -70 L 28 -10 Q 28 2 18 2 Q 8 2 8 -10 L 8 -60" />
          </g>
          <g transform="translate(1696 660) rotate(24)" fill="none" stroke="rgba(20, 8, 2, 0.35)" strokeWidth={5} strokeLinecap="round" filter={`url(#${shadow})`}>
            <path d="M 0 0 L 0 -70 Q 0 -86 14 -86 Q 28 -86 28 -70 L 28 -10" />
          </g>
        </Stage>
      </AbsoluteFill>

      {/* ランプの暖光溜まり */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 52% 58% at ${f2(lampX)}% 34%, rgba(255, 200, 130, ${f2(0.36 * flick)}) 0%, rgba(255, 178, 100, ${f2(0.12 * flick)}) 46%, rgba(255, 170, 90, 0) 72%)`,
          mixBlendMode: 'screen',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 96% 96% at ${f2(lampX + 8)}% 36%, rgba(0,0,0,0) 40%, rgba(22, 9, 2, 0.72) 100%)`,
        }}
      />
      <Grain opacity={0.06} blend="overlay" freq={0.7} />
      <SubtitleCalm color="#1A0C04" strength={0.6} />
    </AbsoluteFill>
  );
};
