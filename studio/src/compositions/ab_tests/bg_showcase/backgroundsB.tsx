import React from 'react';
import { AbsoluteFill } from 'remotion';
import { FONT_HAND, FONT_SANS } from '../../../components/stickman_collage';
import type { BgProps } from './backgroundsA';
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
  eo,
  f2,
  handLine,
  ring,
  rnd,
  rr,
  stepSec,
  useSid,
  wob,
} from './kit';

/* ========================================================================== */
/* 05 クラフト紙 × コルクボード                                                */
/*  コルク粒の質感に、ちぎったクラフト紙を画鋲留め。余白にメモ・ポラ枠・索引カード、  */
/*  それらを赤糸がつなぐ（推理ボード）。糸は呼吸するようにたわみ、紙片は揺れる。      */
/* ========================================================================== */

const Pin: React.FC<{ x: number; y: number; c: string }> = ({ x, y, c }) => (
  <g>
    <ellipse cx={x + 7} cy={y + 9} rx={15} ry={11} fill="rgba(30, 14, 4, 0.45)" />
    <circle cx={x} cy={y} r={15} fill={c} />
    <circle cx={x} cy={y} r={15} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={2} />
    <ellipse cx={x - 5} cy={y - 6} rx={6} ry={4} fill="rgba(255,255,255,0.55)" />
  </g>
);

const tornRect = (x: number, y: number, w: number, h: number, seed: number, jag = 6): string => {
  const pts: string[] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    pts.push(`${f2(x + (w * i) / n)} ${f2(y + (rnd(seed + i) - 0.5) * jag * 0.5)}`);
  }
  for (let i = 1; i <= 16; i++) {
    pts.push(`${f2(x + w + (rnd(seed + 40 + i) - 0.5) * jag * 0.5)} ${f2(y + (h * i) / 16)}`);
  }
  for (let i = n - 1; i >= 0; i--) {
    pts.push(`${f2(x + (w * i) / n)} ${f2(y + h + (rnd(seed + 80 + i) - 0.5) * jag * 2.4)}`);
  }
  for (let i = 15; i >= 1; i--) {
    pts.push(`${f2(x + (rnd(seed + 120 + i) - 0.5) * jag * 0.5)} ${f2(y + (h * i) / 16)}`);
  }
  return `M ${pts.join(' L ')} Z`;
};

const sag = (a: { x: number; y: number }, b: { x: number; y: number }, s: number): string =>
  `M ${a.x} ${a.y} Q ${f2((a.x + b.x) / 2)} ${f2((a.y + b.y) / 2 + s * 2)} ${b.x} ${b.y}`;

export const BgKraftCork: React.FC<BgProps> = ({ sec }) => {
  const sheetClip = useSid('kraft');
  const sheetShadow = useSid('kraftshadow');
  const fiber = useSid('kraftfiber');
  const speck = useSid('kraftspeck');
  const push = 1 + eio(sec, 0, 5) * 0.022;
  const sheet = tornRect(250, 104, 1420, 760, 7, 8);
  const pins = {
    tl: { x: 282, y: 136 },
    tr: { x: 1638, y: 132 },
    note: { x: 132, y: 306 },
    pola: { x: 1796, y: 212 },
    card: { x: 1786, y: 566 },
  };
  const breathe = Math.sin(sec * 1.25) * 6;
  const noteSway = Math.sin(sec * 1.7) * 1.6 + wob(sec, 0.2, 3, 1.4, 1.2);

  return (
    <AbsoluteFill style={{ backgroundColor: '#B4854F', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${f2(push)})`, transformOrigin: '52% 46%' }}>
        {/* コルク：大きなムラ → 暗い粒 → 明るい粒 */}
        <Noise freq="0.006" octaves={3} seed={3} opacity={0.3} blend="multiply" />
        <Noise vw={960} vh={540} freq="0.11" octaves={3} seed={5} matrix="0 0 0 0 0.3  0 0 0 0 0.17  0 0 0 0 0.07  4.2 0 0 0 -2.25" opacity={0.75} />
        <Noise vw={960} vh={540} freq="0.16" octaves={2} seed={9} matrix="0 0 0 0 0.92  0 0 0 0 0.74  0 0 0 0 0.5  0 4.4 0 0 -2.5" opacity={0.5} />
        <Noise vw={960} vh={540} freq="0.45" octaves={1} seed={12} matrix="0 0 0 0 0.2  0 0 0 0 0.1  0 0 0 0 0.04  5 0 0 0 -3.1" opacity={0.55} />

        <Stage>
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
              <feTurbulence type="fractalNoise" baseFrequency="0.014 0.07" numOctaves={3} seed={14} result="f" />
              <feColorMatrix in="f" type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.22  0 0 0 0 0.1  1.7 0 0 0 -0.72" />
            </filter>
            <filter id={speck} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency={0.55} numOctaves={1} seed={17} result="s" />
              <feColorMatrix in="s" type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.14  0 0 0 0 0.05  6 0 0 0 -4.1" />
            </filter>
          </defs>

          {/* クラフト紙（ちぎり端・落ち影・繊維・斑点） */}
          <g transform="rotate(-0.7 960 480)">
            <path d={sheet} fill="#000" filter={`url(#${sheetShadow})`} />
            <path d={sheet} fill="#C9A273" />
            <g clipPath={`url(#${sheetClip})`}>
              <rect x={240} y={90} width={1450} height={800} filter={`url(#${fiber})`} opacity={0.5} />
              <rect x={240} y={90} width={1450} height={800} filter={`url(#${speck})`} opacity={0.6} />
              <path d="M 250 108 L 1670 108" stroke="rgba(255, 240, 210, 0.35)" strokeWidth={3} />
            </g>
          </g>

          {/* 余白の紙片 */}
          <g transform={`rotate(${f2(-6 + noteSway)} ${pins.note.x} ${pins.note.y})`}>
            <path d={tornRect(44, 290, 180, 196, 31, 5)} fill="rgba(30, 14, 4, 0.4)" transform="translate(6 10)" />
            <path d={tornRect(44, 290, 180, 196, 31, 5)} fill="#F3EAD2" />
            {[0, 1, 2, 3].map((k) => (
              <path key={k} d={handLine(64, 342 + k * 34, 64 + 120 - (k % 2) * 40, 342 + k * 34, 3, k + 3)} stroke="rgba(40, 32, 26, 0.55)" strokeWidth={4} strokeLinecap="round" fill="none" />
            ))}
          </g>
          <g transform={`rotate(${f2(5 + Math.sin(sec * 1.3 + 1) * 0.8)} ${pins.pola.x} ${pins.pola.y})`}>
            <rect x={1716} y={196} width={176} height={208} fill="rgba(30, 14, 4, 0.42)" transform="translate(7 11)" />
            <rect x={1716} y={196} width={176} height={208} fill="#F7F4EC" />
            <rect x={1730} y={212} width={148} height={144} fill="#4C4640" />
            {Array.from({ length: 9 }, (_, k) => (
              <path key={k} d={`M ${1730 + k * 18} 356 L ${1730 + k * 18 + 40} 212`} stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
            ))}
            <path d={handLine(1738, 382, 1850, 380, 2, 4)} stroke="rgba(40, 32, 26, 0.5)" strokeWidth={4} strokeLinecap="round" />
          </g>
          <g transform={`rotate(${f2(-4 + Math.sin(sec * 1.5 + 2) * 0.7)} ${pins.card.x} ${pins.card.y})`}>
            <rect x={1704} y={552} width={196} height={128} fill="rgba(30, 14, 4, 0.4)" transform="translate(6 10)" />
            <rect x={1704} y={552} width={196} height={128} fill="#FBF8F0" />
            <path d="M 1704 584 L 1900 584" stroke="rgba(214, 60, 50, 0.6)" strokeWidth={2.4} />
            {[0, 1, 2].map((k) => (
              <path key={k} d={`M 1704 ${610 + k * 22} L 1900 ${610 + k * 22}`} stroke="rgba(70, 110, 180, 0.3)" strokeWidth={1.6} />
            ))}
          </g>

          {/* 赤糸 */}
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
        </Stage>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 60% at ${f2(48 + Math.sin(sec * 0.4) * 3)}% 34%, rgba(255, 222, 170, 0.22) 0%, rgba(255, 222, 170, 0) 70%)`,
          mixBlendMode: 'screen',
        }}
      />
      <AbsoluteFill
        style={{ background: 'radial-gradient(ellipse 100% 96% at 50% 44%, rgba(0,0,0,0) 52%, rgba(34, 16, 4, 0.55) 100%)' }}
      />
      <Grain opacity={0.05} blend="overlay" />
      <SubtitleCalm color="#2A160A" strength={0.5} from={866} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 06 深紺ブループリント（青焼き図面）                                          */
/*  露光ムラのある紺地に白線の図面。フランジがゆっくり回り、寸法が引かれ、         */
/*  複写機の露光バーが上から下へ一度だけ走る。                                   */
/* ========================================================================== */

export const BgMidnightBlueprint: React.FC<BgProps> = ({ sec }) => {
  const line = 'rgba(214, 236, 255, 0.46)';
  const faint = 'rgba(200, 228, 255, 0.24)';
  const glow = useSid('bpglow');
  const fl = { x: 1630, y: 250 };
  const rot = sec * 7;
  const scanY = -160 + (sec / 5) * 1240;
  const scanOp = 1 - eio(scanY, 760, 880);

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(ellipse 80% 80% at 44% 40%, #17407A 0%, #0E2B55 52%, #081B37 100%)',
        overflow: 'hidden',
      }}
    >
      <Noise
        freq="0.005"
        octaves={3}
        seed={6}
        matrix="0 0 0 0 0.55  0 0 0 0 0.76  0 0 0 0 1  1.5 0 0 0 -0.6"
        opacity={0.22}
        blend="screen"
        shiftX={sec * 3}
      />
      <AbsoluteFill
        style={{
          backgroundImage: [
            'linear-gradient(to right, rgba(170, 214, 255, 0.2) 1.5px, transparent 1.5px)',
            'linear-gradient(to bottom, rgba(170, 214, 255, 0.2) 1.5px, transparent 1.5px)',
            'linear-gradient(to right, rgba(150, 200, 255, 0.075) 1px, transparent 1px)',
            'linear-gradient(to bottom, rgba(150, 200, 255, 0.075) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '150px 150px, 150px 150px, 30px 30px, 30px 30px',
          backgroundPosition: `${f2(-sec * 2)}px 0px`,
        }}
      />

      <Stage>
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
          {/* 右上：回るフランジ */}
          <Draw d={ring(fl.x, fl.y, 150, 2)} sec={sec} at={0.15} dur={0.8} stroke={line} width={2.6} />
          <Draw d={ring(fl.x, fl.y, 58, 3)} sec={sec} at={0.45} dur={0.5} stroke={line} width={2.4} />
          <Draw d={`M ${fl.x - 190} ${fl.y} L ${fl.x + 190} ${fl.y} M ${fl.x} ${fl.y - 190} L ${fl.x} ${fl.y + 190}`} sec={sec} at={0.25} dur={0.6} stroke={faint} width={1.8} />
          {sec > 0.9 ? (
            <g transform={`rotate(${f2(rot)} ${fl.x} ${fl.y})`} opacity={eio(sec, 0.9, 1.3)}>
              <circle cx={fl.x} cy={fl.y} r={104} stroke={faint} strokeWidth={1.6} strokeDasharray="22 8 4 8" />
              {Array.from({ length: 6 }, (_, k) => {
                const a = (k / 6) * Math.PI * 2;
                return <path key={k} d={ring(fl.x + Math.cos(a) * 104, fl.y + Math.sin(a) * 104, 14, k + 4)} stroke={line} strokeWidth={2.2} />;
              })}
            </g>
          ) : null}
          <Draw d={`M ${fl.x + 106} ${fl.y - 106} L ${fl.x + 170} ${fl.y - 170} L ${fl.x + 236} ${fl.y - 170}`} sec={sec} at={1.3} dur={0.4} stroke={line} width={2} />
          {sec > 1.6 ? (
            <text x={fl.x + 180} y={fl.y - 180} fontFamily={FONT_SANS} fontSize={22} fontWeight={700} fill={line} stroke="none" opacity={eio(sec, 1.6, 1.9)}>
              φ300
            </text>
          ) : null}

          {/* 左上：断面図 A–A */}
          <Draw d={rr(120, 150, 330, 150, 1, 3)} sec={sec} at={0.5} dur={0.6} stroke={line} width={2.4} />
          <Draw d="M 120 236 L 450 236" sec={sec} at={0.9} dur={0.3} stroke={line} width={2} />
          {Array.from({ length: 14 }, (_, k) => (
            <Draw key={k} d={`M ${132 + k * 22} 298 L ${168 + k * 22} 240`} sec={sec} at={1.1 + k * 0.03} dur={0.12} stroke={faint} width={1.6} />
          ))}
          <Draw d="M 120 330 L 450 330 M 120 318 L 120 342 M 450 318 L 450 342" sec={sec} at={1.4} dur={0.4} stroke={faint} width={1.8} />
          {sec > 1.7 ? (
            <g opacity={eio(sec, 1.7, 2.0)}>
              <text x={285} y={362} textAnchor="middle" fontFamily={FONT_SANS} fontSize={20} fontWeight={700} fill={line} stroke="none">
                330
              </text>
              <text x={120} y={134} fontFamily={FONT_SANS} fontSize={20} fontWeight={700} letterSpacing="0.18em" fill={line} stroke="none">
                SECTION A–A
              </text>
            </g>
          ) : null}

          {/* 左の縦寸法 */}
          <Draw d={`M 110 470 L 110 ${FLOOR_Y}`} sec={sec} at={0.8} dur={0.5} stroke={faint} width={1.8} />
          <Draw d={`M 96 470 L 124 470 M 96 ${FLOOR_Y} L 124 ${FLOOR_Y}`} sec={sec} at={1.2} dur={0.2} stroke={faint} width={1.8} />

          {/* 地面記号（主役の床） */}
          <Draw d={`M 260 ${FLOOR_Y} L 1560 ${FLOOR_Y}`} sec={sec} at={0.1} dur={0.8} stroke={line} width={2.4} />
          {Array.from({ length: 44 }, (_, k) => (
            <Draw key={k} d={`M ${276 + k * 30} ${FLOOR_Y + 2} L ${256 + k * 30} ${FLOOR_Y + 24}`} sec={sec} at={0.4 + k * 0.012} dur={0.1} stroke={faint} width={1.6} />
          ))}

          {/* 表題欄（右下・字幕帯より上） */}
          <g opacity={eio(sec, 0.6, 1.2) * 0.9}>
            <path d="M 1580 690 L 1860 690 L 1860 860 L 1580 860 Z M 1580 740 L 1860 740 M 1580 800 L 1860 800 M 1720 740 L 1720 860" stroke={faint} strokeWidth={1.8} />
            <text x={1596} y={724} fontFamily={FONT_SANS} fontSize={20} fontWeight={700} letterSpacing="0.12em" fill={line} stroke="none">
              TITLE  STICK-06
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
      </Stage>

      {/* 露光バー（上→下へ一度だけ） */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: scanY - 120,
          height: 240,
          opacity: scanOp,
          background:
            'linear-gradient(to bottom, rgba(160, 210, 255, 0) 0%, rgba(160, 210, 255, 0.09) 46%, rgba(220, 240, 255, 0.2) 50%, rgba(160, 210, 255, 0.09) 54%, rgba(160, 210, 255, 0) 100%)',
          mixBlendMode: 'screen',
        }}
      />
      <Grain opacity={0.07} blend="screen" freq={0.95} />
      <AbsoluteFill
        style={{ background: 'radial-gradient(ellipse 100% 94% at 50% 44%, rgba(0,0,0,0) 56%, rgba(2, 8, 20, 0.6) 100%)' }}
      />
      <SubtitleCalm color="#06142A" strength={0.5} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 07 クリーム罫線ノート                                                       */
/*  ドット入り罫線・ヘッダー（No./Date）・リング綴じ・余白の落書き・蛍光ペン・      */
/*  端でめくれかける付箋。紙面全体がかすかに呼吸する。                            */
/* ========================================================================== */

export const BgRuledNotebook: React.FC<BgProps> = ({ sec }) => {
  const blue = 'rgba(64, 104, 176, 0.3)';
  const pen = 'rgba(38, 62, 128, 0.62)';
  const dateClip = useSid('date');
  const titleClip = useSid('title');
  const swayX = Math.sin(sec * 0.47) * 2.4;
  const swayY = Math.cos(sec * 0.39) * 1.8;
  const rot = Math.sin(sec * 0.31) * 0.1;
  const RULE0 = 206;
  const STEP = 54;
  const rules = Array.from({ length: 17 }, (_, k) => RULE0 + k * STEP).filter((y) => y < H + 20);
  const stickyLift = 1.6 + Math.sin(sec * 2.1) * 1.4 + Math.sin(sec * 5.3) * 0.4;

  return (
    <AbsoluteFill style={{ backgroundColor: '#FBF6E8', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${f2(swayX)}px, ${f2(swayY)}px) rotate(${rot.toFixed(3)}deg)` }}>
        <PaperTooth opacity={0.32} freq={0.13} seed={4} surface={1.4} />
        <Stage>
          <defs>
            <clipPath id={dateClip}>
              <rect x={1600} y={90} width={300 * eo(sec, 0.6, 1.3)} height={60} />
            </clipPath>
            <clipPath id={titleClip}>
              <rect x={250} y={130} width={420 * eo(sec, 1.0, 1.8)} height={70} />
            </clipPath>
          </defs>
          {/* ヘッダー */}
          <path d={`M 0 ${RULE0 - STEP} L ${W} ${RULE0 - STEP}`} stroke="rgba(64, 104, 176, 0.5)" strokeWidth={2.6} />
          <text x={1360} y={130} fontFamily={FONT_SANS} fontSize={24} fontWeight={700} fill="rgba(64, 104, 176, 0.62)">
            No.
          </text>
          <path d="M 1410 134 L 1530 134" stroke="rgba(64, 104, 176, 0.45)" strokeWidth={2} strokeDasharray="2 6" />
          <text x={1556} y={130} fontFamily={FONT_SANS} fontSize={24} fontWeight={700} fill="rgba(64, 104, 176, 0.62)">
            Date
          </text>
          <path d="M 1620 134 L 1860 134" stroke="rgba(64, 104, 176, 0.45)" strokeWidth={2} strokeDasharray="2 6" />
          <text x={1702} y={134} fontFamily={FONT_SANS} fontSize={24} fill="rgba(64, 104, 176, 0.62)">
            ・
          </text>
          <text x={1782} y={134} fontFamily={FONT_SANS} fontSize={24} fill="rgba(64, 104, 176, 0.62)">
            ・
          </text>
          <g clipPath={`url(#${dateClip})`}>
            <text x={1640} y={128} fontFamily={FONT_HAND} fontSize={40} fill={pen}>
              11   22
            </text>
          </g>

          {/* 罫線＋ドット */}
          {rules.map((y) => (
            <g key={y}>
              <path d={`M 0 ${y} L ${W} ${y}`} stroke={blue} strokeWidth={1.7} />
              {Array.from({ length: 10 }, (_, k) => (
                <circle key={k} cx={200 + k * 180} cy={y} r={2.6} fill="rgba(64, 104, 176, 0.38)" />
              ))}
            </g>
          ))}
          {/* 赤マージン */}
          <path d={`M 200 0 Q 201.5 ${H / 2} 200 ${H}`} stroke="rgba(206, 64, 56, 0.36)" strokeWidth={2.4} fill="none" />

          {/* タイトル行：蛍光ペン → 手書き */}
          <Draw d="M 262 182 L 610 176" sec={sec} at={0.85} dur={0.5} stroke="rgba(255, 222, 70, 0.55)" width={30} />
          <g clipPath={`url(#${titleClip})`}>
            <text x={262} y={190} fontFamily={FONT_HAND} fontSize={48} fill={pen}>
              きょうのメモ
            </text>
          </g>

          {/* 余白の落書き */}
          <Draw d="M 120 330 L 132 360 L 164 362 L 140 382 L 148 414 L 120 396 L 92 414 L 100 382 L 76 362 L 108 360 Z" sec={sec} at={1.4} dur={0.6} stroke={pen} width={3.4} />
          <Draw d="M 84 540 Q 130 500 168 548 M 150 532 L 168 548 L 146 560" sec={sec} at={2.0} dur={0.5} stroke={pen} width={3.4} />
          <Draw d={ring(124, 710, 34, 6)} sec={sec} at={2.5} dur={0.5} stroke="rgba(206, 64, 56, 0.6)" width={3.4} />
          <Draw d="M 124 690 L 124 714 M 124 728 L 124 730" sec={sec} at={2.9} dur={0.2} stroke="rgba(206, 64, 56, 0.7)" width={4.4} />

          {/* リング綴じ（左端） */}
          {Array.from({ length: 20 }, (_, k) => {
            const y = 40 + k * STEP;
            return (
              <g key={k}>
                <ellipse cx={40} cy={y} rx={9} ry={12} fill="rgba(46, 36, 24, 0.6)" />
                <path d={`M 40 ${y - 4} C 24 ${y - 30}, -6 ${y - 34}, -14 ${y - 12}`} stroke="#77777F" strokeWidth={6} fill="none" strokeLinecap="round" />
                <path d={`M 38 ${y - 8} C 24 ${y - 28}, 0 ${y - 32}, -8 ${y - 16}`} stroke="#D8D8DE" strokeWidth={2} fill="none" strokeLinecap="round" />
              </g>
            );
          })}

          {/* 付箋（右端・めくれかけ） */}
          <g transform={`rotate(${f2(4 + stickyLift * 0.3)} 1770 250)`}>
            <path d="M 1770 250 L 1960 250 L 1960 432 L 1770 440 Z" fill="rgba(60, 40, 10, 0.18)" transform={`translate(${f2(4 + stickyLift * 2)} ${f2(6 + stickyLift * 3)})`} />
            <path d="M 1770 250 L 1960 250 L 1960 432 L 1770 440 Z" fill="#FFE27A" />
            <path d="M 1770 250 L 1960 250 L 1960 286 L 1770 286 Z" fill="rgba(255, 255, 255, 0.18)" />
            <path d={`M 1770 440 L 1960 432 L 1960 ${f2(424 - stickyLift * 4)} Z`} fill="rgba(140, 100, 20, 0.16)" />
            <path d={handLine(1792, 330, 1920, 326, 3, 2)} stroke="rgba(40, 32, 26, 0.45)" strokeWidth={4} strokeLinecap="round" />
            <path d={handLine(1792, 370, 1890, 368, 3, 3)} stroke="rgba(40, 32, 26, 0.45)" strokeWidth={4} strokeLinecap="round" />
          </g>
          <g transform={`rotate(${f2(-3 + Math.sin(sec * 1.7 + 1) * 0.5)} 1810 600)`}>
            <path d="M 1810 600 L 1960 600 L 1960 722 L 1810 728 Z" fill="rgba(60, 40, 10, 0.16)" transform="translate(5 7)" />
            <path d="M 1810 600 L 1960 600 L 1960 722 L 1810 728 Z" fill="#F7A9B8" />
          </g>
        </Stage>
      </AbsoluteFill>

      {/* 綴じ側の湾曲陰影・陽光 */}
      <AbsoluteFill style={{ background: 'linear-gradient(to right, rgba(90, 70, 40, 0.18) 0px, rgba(90, 70, 40, 0) 130px)' }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 72% 80% at ${f2(18 + Math.sin(sec * 0.25) * 2)}% -8%, rgba(255, 226, 170, 0.2) 0%, rgba(255, 226, 170, 0) 70%)`,
          mixBlendMode: 'multiply',
        }}
      />
      <Grain opacity={0.045} />
      <AbsoluteFill
        style={{ background: 'radial-gradient(ellipse 96% 92% at 52% 50%, rgba(0,0,0,0) 62%, rgba(92, 74, 48, 0.14) 100%)' }}
      />
      <SubtitleCalm color="#FBF6E8" strength={0.45} />
    </AbsoluteFill>
  );
};

/* ========================================================================== */
/* 08 Opus 自由枠：アニメーターの透写台（ライトテーブル）                        */
/*  下から光る作画机。タップ穴とタップ（ペグバー）、透けて見える下の動画用紙の      */
/*  青鉛筆ラフ、赤鉛筆のタイムチャート。主役の前後コマがオニオンスキンで透ける。     */
/*  ＝「手描き棒人間が“いま描かれて動いている”」ことそのものを背景にする。           */
/* ========================================================================== */

const GHOSTS = [
  { x: 300, y: 380, r: 40, lean: -10 },
  { x: 470, y: 330, r: 36, lean: 8 },
  { x: 1560, y: 560, r: 38, lean: 12 },
];

export const BgLightTable: React.FC<BgProps> = ({ sec }) => {
  const flick = sec < 0.45 ? [0.35, 0.05, 0.42, 0.12, 0, 0.18, 0, 0, 0, 0, 0, 0, 0, 0][Math.floor(sec * 30)] ?? 0 : 0;
  const breathe = 0.04 + Math.sin(sec * 1.4) * 0.015;
  const st = stepSec(sec);
  const jitter = (k: number) => (rnd(Math.floor(st * 7.5) * 3 + k) - 0.5) * 2.4;
  const bluePencil = 'rgba(58, 111, 216, 0.24)';
  const redPencil = 'rgba(216, 67, 58, 0.5)';

  return (
    <AbsoluteFill style={{ backgroundColor: '#3A322A', overflow: 'hidden' }}>
      {/* 発光面 */}
      <div
        style={{
          position: 'absolute',
          inset: 20,
          background: 'radial-gradient(ellipse 78% 74% at 50% 54%, #FFFEF8 0%, #FAF4E6 52%, #E9DDC4 100%)',
          boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.25), inset 0 0 60px rgba(120, 96, 60, 0.35)',
        }}
      />
      <div style={{ position: 'absolute', inset: 20, overflow: 'hidden' }}>
        {/* 下の用紙のエッジ（ずれて重なる） */}
        <Stage style={{ left: -20, top: -20, width: W, height: H }}>
          <g transform="rotate(-0.9 960 540)">
            <rect x={60} y={40} width={1800} height={1100} fill="none" stroke="rgba(140, 116, 80, 0.22)" strokeWidth={2} />
          </g>
          <g transform="rotate(0.6 960 540)">
            <rect x={44} y={58} width={1830} height={1100} fill="none" stroke="rgba(140, 116, 80, 0.18)" strokeWidth={2} />
          </g>

          {/* 透けて見える下絵（青鉛筆のラフ・7.5fps で線がふるえる） */}
          <g stroke={bluePencil} strokeWidth={3} fill="none" strokeLinecap="round">
            {GHOSTS.map((g, i) => (
              <g key={i} transform={`translate(${f2(jitter(i))} ${f2(jitter(i + 5))})`}>
                <path d={ring(g.x, g.y, g.r, i + 2)} />
                <path d={`M ${g.x} ${g.y + g.r} Q ${g.x + g.lean} ${g.y + g.r + 70} ${g.x + g.lean * 0.6} ${g.y + g.r + 140}`} />
                <path d={`M ${g.x + g.lean * 0.6} ${g.y + g.r + 140} L ${g.x - 40} ${g.y + g.r + 250} M ${g.x + g.lean * 0.6} ${g.y + g.r + 140} L ${g.x + 50} ${g.y + g.r + 246}`} />
                <path d={`M ${g.x - 4} ${g.y + g.r + 30} L ${g.x - 70} ${g.y + g.r + 100} M ${g.x + 2} ${g.y + g.r + 30} L ${g.x + 76} ${g.y + g.r + 80}`} />
                <path d={`M ${g.x - g.r - 20} ${g.y} L ${g.x + g.r + 20} ${g.y} M ${g.x} ${g.y - g.r - 16} L ${g.x} ${g.y + g.r + 10}`} strokeWidth={1.6} opacity={0.7} />
              </g>
            ))}
            {/* 動きの軌道（アーク） */}
            <path d="M 260 760 Q 760 520 1240 700" strokeDasharray="4 14" strokeWidth={2.4} />
            {[0, 1, 2, 3, 4, 5].map((k) => {
              const t = k / 5;
              const x = (1 - t) * (1 - t) * 260 + 2 * (1 - t) * t * 760 + t * t * 1240;
              const y = (1 - t) * (1 - t) * 760 + 2 * (1 - t) * t * 520 + t * t * 700;
              return <path key={k} d={`M ${f2(x)} ${f2(y - 12)} L ${f2(x)} ${f2(y + 12)}`} strokeWidth={2.4} />;
            })}
          </g>

          {/* 赤鉛筆のタイムチャート＋コマ番号（右上） */}
          <g stroke={redPencil} strokeWidth={2.6} fill="none" strokeLinecap="round">
            <Draw d="M 1700 170 L 1700 440" sec={sec} at={0.5} dur={0.4} stroke={redPencil} width={2.6} />
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => {
              const y = 170 + k * k * 3.4;
              return <Draw key={k} d={`M 1684 ${f2(y)} L 1716 ${f2(y)}`} sec={sec} at={0.8 + k * 0.06} dur={0.1} stroke={redPencil} width={2.6} />;
            })}
            <Draw d={ring(1806, 150, 46, 2)} sec={sec} at={0.9} dur={0.5} stroke={redPencil} width={2.6} />
          </g>
          {sec > 1.2 ? (
            <text x={1806} y={162} textAnchor="middle" fontFamily={FONT_HAND} fontSize={34} fill="rgba(216, 67, 58, 0.72)" opacity={eio(sec, 1.2, 1.5)}>
              A-24
            </text>
          ) : null}
          <text x={1728} y={186} fontFamily={FONT_HAND} fontSize={22} fill="rgba(216, 67, 58, 0.55)">
            1
          </text>
          <text x={1728} y={448} fontFamily={FONT_HAND} fontSize={22} fill="rgba(216, 67, 58, 0.55)">
            9
          </text>

          {/* タップ穴＋ペグバー（上辺中央） */}
          <rect x={700} y={36} width={520} height={44} fill="#9E988D" />
          <rect x={700} y={36} width={520} height={8} fill="rgba(255,255,255,0.4)" />
          <rect x={700} y={74} width={520} height={6} fill="rgba(0,0,0,0.22)" />
          {[
            { x: 760, w: 26 },
            { x: 960, w: 78 },
            { x: 1160, w: 26 },
          ].map((p, i) => (
            <g key={i}>
              <rect x={p.x - p.w / 2 - 4} y={84} width={p.w + 8} height={30} fill="rgba(90, 70, 40, 0.18)" />
              <rect x={p.x - p.w / 2} y={50} width={p.w} height={56} fill="#C9C4BA" stroke="rgba(0,0,0,0.25)" strokeWidth={2} />
              <rect x={p.x - p.w / 2 + 4} y={54} width={4} height={48} fill="rgba(255,255,255,0.55)" />
            </g>
          ))}
        </Stage>
        <PaperTooth opacity={0.16} freq={0.1} seed={6} surface={1.2} />
        <Noise freq="0.01 0.25" seed={19} opacity={0.035} blend="multiply" />
      </div>

      {/* 光の呼吸と点灯時のフリッカ */}
      <AbsoluteFill style={{ background: `rgba(255, 248, 230, ${f2(breathe)})`, mixBlendMode: 'screen' }} />
      {flick > 0 ? <AbsoluteFill style={{ background: `rgba(30, 24, 18, ${f2(flick)})` }} /> : null}
      <Grain opacity={0.03} />
      <SubtitleCalm color="#F4ECDA" strength={0.35} />
    </AbsoluteFill>
  );
};

