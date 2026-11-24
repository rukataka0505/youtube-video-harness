import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Freeze,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from '../../../../components/plan_e';
import { BASE_TIMELINE } from '../baseTimelineData';

/**
 * v3_opus_high 専用の演出キット（シニカル報道＆風刺コラージュ）。
 * 実写Bロール・新聞切り抜き・判子・速報帯・VHS一時停止といった「実体のある」部品だけで構成し、
 * 角丸ダークカード＋箇条書きのパワポ表現は一切持たない。
 */

export const FPS = BASE_TIMELINE.fps;

export const C = {
  paper: '#F6F2E9',
  paperDeep: '#ECE3CF',
  newsprint: '#EFE9DC',
  ink: '#16130F',
  inkSoft: '#4A4238',
  slate: '#121417',
  crisis: '#1A0505',
  crimson: '#CC0000',
  red: '#EF4444',
  gold: '#F59E0B',
  goldDeep: '#D97706',
  emerald: '#1E8E3E',
  emeraldBright: '#22C55E',
  cyan: '#38BDF8',
  blue: '#0072B2',
  white: '#F8FAFC',
} as const;

export const SERIF = FONT_ECON_SERIF;
export const SANS = FONT_ECON_SANS;
export const MONO = FONT_ECON_MONO;

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

export type ClipKey = 'street' | 'news' | 'cash' | 'boat' | 'studio';

const VM = BASE_TIMELINE.videoMap;
const IM = BASE_TIMELINE.imageMap;

// 注意: base 素材のファイル名と実内容が一部ずれているため、実内容で命名し直して参照する。
export const CLIP_SRC: Record<ClipKey, string> = {
  street: VM.tokyo_commuters_broll, // 東京の雑踏（8s）
  news: VM.news_studio_broll, // EU旗背景の報道スタジオ（実効 ~5.9s）
  cash: VM.counting_cash_broll, // 紙幣を数える手元（7s）
  boat: VM.supermarket_aisle_broll, // 星条旗を掲げるボートの若者（7s）
  studio: VM.stock_ticker_broll, // 明るい撮影スタジオ（7s）
};

export const POSTER_SRC: Record<ClipKey, string> = {
  street: IM.tokyo_commuters_broll_poster,
  news: IM.news_studio_broll_poster,
  cash: IM.counting_cash_broll_poster,
  boat: IM.supermarket_aisle_broll_poster,
  studio: IM.stock_ticker_broll_poster,
};

export const media = (p: string): string => staticFile(p);

export type Grade = 'cool' | 'desat' | 'warm' | 'bright' | 'emerald' | 'mono' | 'icy' | 'crisis' | 'none';

export const GRADE: Record<Grade, string> = {
  cool: 'contrast(1.12) saturate(0.8) brightness(0.86) hue-rotate(-6deg)',
  desat: 'contrast(1.2) saturate(0.32) brightness(0.8)',
  warm: 'contrast(1.08) saturate(1.08) brightness(0.9) sepia(0.14)',
  bright: 'contrast(1.03) saturate(1.06) brightness(1.0)',
  emerald: 'contrast(1.16) saturate(0.7) brightness(0.74) sepia(0.25) hue-rotate(55deg)',
  mono: 'grayscale(1) contrast(1.28) brightness(0.84)',
  icy: 'grayscale(0.55) sepia(0.2) hue-rotate(165deg) saturate(1.35) contrast(1.12) brightness(0.84)',
  crisis: 'contrast(1.25) saturate(0.25) brightness(0.62) sepia(0.35) hue-rotate(-18deg)',
  none: '',
};

/** ビート内ローカルフレームと、絶対秒→ローカルフレーム変換を返す。 */
export const useBeat = (t0: number) => {
  const frame = useCurrentFrame();
  const at = (absSec: number): number => Math.round((absSec - t0) * FPS);
  return { frame, at };
};

/** 着弾フレーム群に対して減衰する画面揺れ（判子・罠の衝撃）。 */
export function impactShake(frame: number, impacts: readonly number[], amp = 14): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const f0 of impacts) {
    const d = frame - f0;
    if (d >= 0 && d < 10) {
      const k = (1 - d / 10) * amp;
      x += Math.sin(d * 2.9 + f0) * k;
      y += Math.cos(d * 3.7 + f0) * k * 0.6;
    }
  }
  return { x, y };
}

/* -------------------------------------------------------------------------- */
/* 実写動画 B-Roll                                                             */
/* -------------------------------------------------------------------------- */

export interface ClipProps {
  clip: ClipKey;
  durFrames: number;
  trimSec?: number;
  rate?: number;
  grade?: Grade;
  zoom?: readonly [number, number];
  pan?: readonly [number, number];
  panY?: readonly [number, number];
  origin?: string;
  mirror?: boolean;
  freeze?: boolean;
  extraFilter?: string;
  objectPosition?: string;
}

export const Clip: React.FC<ClipProps> = ({
  clip,
  durFrames,
  trimSec = 0,
  rate = 1,
  grade = 'cool',
  zoom = [1.02, 1.08],
  pan = [0, 0],
  panY = [0, 0],
  origin = '50% 50%',
  mirror = false,
  freeze = false,
  extraFilter = '',
  objectPosition = '50% 50%',
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, Math.max(1, durFrames)], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.sin) });
  const z = interpolate(p, [0, 1], [zoom[0], zoom[1]]);
  const x = interpolate(p, [0, 1], [pan[0], pan[1]]);
  const y = interpolate(p, [0, 1], [panY[0], panY[1]]);

  const video = (
    <OffthreadVideo
      src={media(CLIP_SRC[clip])}
      muted
      trimBefore={Math.round(trimSec * FPS)}
      playbackRate={rate}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition,
        transform: mirror ? 'scaleX(-1)' : undefined,
      }}
    />
  );

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#050505' }}>
      <AbsoluteFill
        style={{
          transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${z.toFixed(4)})`,
          transformOrigin: origin,
          filter: `${GRADE[grade]} ${extraFilter}`.trim() || undefined,
        }}
      >
        {freeze ? <Freeze frame={0}>{video}</Freeze> : video}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{ strength?: number; color?: string }> = ({ strength = 0.62, color = '8,10,14' }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `radial-gradient(ellipse 86% 80% at 50% 46%, transparent 40%, rgba(${color}, ${strength}) 100%)`,
    }}
  />
);

/** 下段字幕の可読性確保用の下部シェード（字幕帯ボックスは使わない）。 */
export const SubShade: React.FC<{ strength?: number }> = ({ strength = 0.62 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `linear-gradient(180deg, rgba(6,8,10,0.28) 0%, transparent 22%, transparent 66%, rgba(6,8,10,${strength}) 100%)`,
    }}
  />
);

/** カット頭数フレームのRGBずれグリッチ（緩急の「急」側）。 */
export const CutGlitch: React.FC<{ frames?: number; flash?: boolean }> = ({ frames = 6, flash = false }) => {
  const frame = useCurrentFrame();
  if (frame >= frames) return null;
  const k = 1 - frame / frames;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 30 }}>
      {flash && frame < 2 ? <AbsoluteFill style={{ backgroundColor: `rgba(255,255,255,${0.75 * k})` }} /> : null}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const top = ((i * 23 + frame * 17) % 88) + 2;
        const h = 10 + ((i * 13 + frame * 5) % 40);
        const dx = (i % 2 === 0 ? 1 : -1) * (30 + ((frame * 11 + i * 7) % 60)) * k;
        return (
          <div
            key={`cg-${i}`}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${top}%`,
              height: h,
              transform: `translateX(${dx.toFixed(1)}px)`,
              background: i % 2 === 0 ? 'rgba(239,68,68,0.34)' : 'rgba(56,189,248,0.3)',
              mixBlendMode: 'screen',
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* 紙面・切り抜き・判子                                                          */
/* -------------------------------------------------------------------------- */

export const PaperBg: React.FC<{ tone?: string; dots?: boolean }> = ({ tone = C.paper, dots = true }) => (
  <AbsoluteFill style={{ backgroundColor: tone }}>
    {dots ? (
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(rgba(70,48,24,0.075) 1px, transparent 1.3px)',
          backgroundSize: '7px 7px',
        }}
      />
    ) : null}
    <AbsoluteFill
      style={{
        backgroundImage:
          'repeating-linear-gradient(93deg, rgba(120,90,50,0.035) 0px, rgba(120,90,50,0.035) 1px, transparent 1px, transparent 23px)',
      }}
    />
    <AbsoluteFill
      style={{
        background: 'radial-gradient(ellipse 82% 74% at 50% 44%, transparent 52%, rgba(96,64,30,0.2) 100%)',
      }}
    />
  </AbsoluteFill>
);

/** 上下が手で破いたようにギザつく切り抜き用 clip-path（左右はハサミの直線）。 */
export function tornClip(seed: number, amp = 1.6): string {
  const n = 28;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const xp = (i / n) * 100;
    const yp = amp * (0.5 + 0.5 * Math.sin(seed * 13.7 + i * 2.31) * Math.cos(seed * 3.1 + i * 1.17));
    pts.push(`${xp.toFixed(2)}% ${yp.toFixed(2)}%`);
  }
  for (let i = n; i >= 0; i--) {
    const xp = (i / n) * 100;
    const yp = 100 - amp * (0.5 + 0.5 * Math.sin(seed * 7.3 + i * 1.91) * Math.cos(seed * 2.3 + i * 0.77));
    pts.push(`${xp.toFixed(2)}% ${yp.toFixed(2)}%`);
  }
  return `polygon(${pts.join(', ')})`;
}

export interface ClippingProps {
  x: number;
  y: number;
  w: number;
  h?: number;
  rotate?: number;
  enterFrame?: number;
  from?: 'left' | 'right' | 'top' | 'drop';
  seed?: number;
  tone?: string;
  padding?: string;
  children?: React.ReactNode;
}

/** 新聞・広告の切り抜き紙片（破れ縁＋落ち影）。 */
export const Clipping: React.FC<ClippingProps> = ({
  x,
  y,
  w,
  h,
  rotate = 0,
  enterFrame = 0,
  from = 'drop',
  seed = 1,
  tone = C.newsprint,
  padding = '34px 38px',
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < enterFrame) return null;
  const s = spring({ frame: frame - enterFrame, fps, config: { damping: 17, stiffness: 240, mass: 0.75 } });
  let dx = 0;
  let dy = 0;
  let sc = 1;
  if (from === 'left') dx = (1 - s) * -1100;
  if (from === 'right') dx = (1 - s) * 1100;
  if (from === 'top') dy = (1 - s) * -900;
  if (from === 'drop') sc = interpolate(s, [0, 1], [1.35, 1]);
  const op = from === 'drop' ? interpolate(frame - enterFrame, [0, 3], [0, 1], CLAMP) : 1;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        opacity: op,
        transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${(rotate + (1 - s) * 5).toFixed(2)}deg) scale(${sc.toFixed(3)})`,
        filter: 'drop-shadow(0 16px 20px rgba(0,0,0,0.36))',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: h ? '100%' : undefined,
          boxSizing: 'border-box',
          backgroundColor: tone,
          backgroundImage:
            'radial-gradient(rgba(80,60,30,0.06) 1px, transparent 1.2px), linear-gradient(180deg, rgba(255,255,255,0.35), rgba(0,0,0,0.03))',
          backgroundSize: '5px 5px, 100% 100%',
          clipPath: tornClip(seed),
          padding,
          color: C.ink,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export interface StampProps {
  text: string;
  x: number;
  y: number;
  enterFrame: number;
  color?: string;
  size?: number;
  rotate?: number;
  blend?: boolean;
  vertical?: boolean;
}

/** 朱肉判子（着弾スケール＋多重枠）。x,y は中心座標。 */
export const Stamp: React.FC<StampProps> = ({
  text,
  x,
  y,
  enterFrame,
  color = C.crimson,
  size = 96,
  rotate = -12,
  blend = true,
  vertical = false,
}) => {
  const frame = useCurrentFrame();
  const lf = frame - enterFrame;
  if (lf < 0) return null;
  const sc = interpolate(lf, [0, 4], [2.5, 1], { ...CLAMP, easing: Easing.in(Easing.quad) });
  const op = interpolate(lf, [0, 2], [0, 0.93], CLAMP);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${sc.toFixed(3)})`,
        opacity: op,
        mixBlendMode: blend ? 'multiply' : 'normal',
        zIndex: 20,
      }}
    >
      <div
        style={{
          border: `${Math.round(size * 0.08)}px solid ${color}`,
          outline: `${Math.max(2, Math.round(size * 0.03))}px solid ${color}`,
          outlineOffset: Math.round(size * 0.06),
          padding: vertical ? `${size * 0.12}px ${size * 0.16}px` : `${size * 0.06}px ${size * 0.28}px`,
          color,
          fontFamily: SERIF,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1.05,
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
          writingMode: vertical ? 'vertical-rl' : undefined,
          backgroundColor: blend ? 'transparent' : 'rgba(255,255,255,0.0)',
          WebkitMaskImage:
            'radial-gradient(circle at 22% 30%, #000 0 55%, rgba(0,0,0,0.78) 70%), radial-gradient(circle at 80% 70%, #000 0 50%, rgba(0,0,0,0.85) 80%)',
          maskImage:
            'radial-gradient(circle at 22% 30%, #000 0 55%, rgba(0,0,0,0.78) 70%), radial-gradient(circle at 80% 70%, #000 0 50%, rgba(0,0,0,0.85) 80%)',
          textShadow: blend ? 'none' : '0 2px 10px rgba(0,0,0,0.4)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 報道UI                                                                     */
/* -------------------------------------------------------------------------- */

export const NewsBug: React.FC<{ desk?: string; clock?: string }> = ({ desk = '思考実験ニュース', clock = 'LIVE' }) => {
  const frame = useCurrentFrame();
  const blink = Math.floor(frame / 12) % 2 === 0;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 62,
          left: 96,
          display: 'flex',
          alignItems: 'stretch',
          height: 46,
          zIndex: 22,
          boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            backgroundColor: C.crimson,
            color: '#fff',
            fontFamily: MONO,
            fontWeight: 900,
            fontSize: 20,
            letterSpacing: '0.14em',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ opacity: blink ? 1 : 0.35 }}>●</span> LIVE
        </div>
        <div
          style={{
            backgroundColor: 'rgba(10,10,12,0.88)',
            color: C.white,
            fontFamily: SANS,
            fontWeight: 900,
            fontSize: 22,
            letterSpacing: '0.06em',
            padding: '0 18px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {desk}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 66,
          right: 96,
          zIndex: 22,
          fontFamily: MONO,
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: '0.12em',
          color: 'rgba(248,250,252,0.92)',
          textShadow: '0 2px 8px rgba(0,0,0,0.8)',
        }}
      >
        {clock}
      </div>
    </>
  );
};

export interface NewsChyronProps {
  label: string;
  headline: string;
  ticker: readonly string[];
  enterFrame?: number;
}

/** 下部速報帯（字幕の上 bottom:196px に固定）。 */
export const NewsChyron: React.FC<NewsChyronProps> = ({ label, headline, ticker, enterFrame = 0 }) => {
  const frame = useCurrentFrame();
  const lf = frame - enterFrame;
  if (lf < 0) return null;
  const wipe = interpolate(lf, [0, 8], [100, 0], { ...CLAMP, easing: EASE_OUT });
  const headWipe = interpolate(lf, [4, 13], [100, 0], { ...CLAMP, easing: EASE_OUT });
  const tick = (lf * 4.2) % 1400;
  return (
    <div
      style={{
        position: 'absolute',
        left: 96,
        right: 96,
        bottom: 196,
        zIndex: 24,
        boxShadow: '0 14px 34px rgba(0,0,0,0.6)',
        clipPath: `inset(0 ${wipe.toFixed(1)}% 0 0)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', height: 78 }}>
        <div
          style={{
            backgroundColor: C.crimson,
            color: '#fff',
            fontFamily: SANS,
            fontWeight: 900,
            fontSize: 36,
            letterSpacing: '0.1em',
            padding: '0 28px',
            display: 'flex',
            alignItems: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        <div
          style={{
            flex: 1,
            backgroundColor: '#FBFAF7',
            color: C.ink,
            fontFamily: SANS,
            fontWeight: 900,
            fontSize: 38,
            letterSpacing: '0.02em',
            padding: '0 28px',
            display: 'flex',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            clipPath: `inset(0 ${headWipe.toFixed(1)}% 0 0)`,
          }}
        >
          {headline}
        </div>
      </div>
      <div
        style={{
          height: 40,
          backgroundColor: '#0B0B0D',
          borderTop: `3px solid ${C.crimson}`,
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 54,
            whiteSpace: 'nowrap',
            fontFamily: SANS,
            fontSize: 21,
            fontWeight: 800,
            color: '#FDE047',
            paddingLeft: 24,
            transform: `translateX(${(-tick).toFixed(1)}px)`,
          }}
        >
          {[...ticker, ...ticker, ...ticker].map((t, i) => (
            <span key={`tk-${i}`}>◆ {t}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* VHS                                                                         */
/* -------------------------------------------------------------------------- */

export const VhsOverlay: React.FC<{ label?: string; timecode?: string; dim?: number }> = ({
  label = 'II PAUSE',
  timecode = 'SP  00:00:10',
  dim = 0.0,
}) => {
  const frame = useCurrentFrame();
  const band = ((frame * 2.6) % 120) - 10;
  const jitter = frame % 9 === 0 ? 4 : frame % 13 === 0 ? -3 : 0;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 26 }}>
      {dim > 0 ? <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${dim})` }} /> : null}
      <AbsoluteFill
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.055) 3px, rgba(255,255,255,0.055) 5px)',
          backgroundPositionY: (frame * 3) % 10,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${band}%`,
          height: 34,
          background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.14), transparent)',
          transform: `translateX(${jitter}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 78,
          fontFamily: MONO,
          fontSize: 58,
          fontWeight: 900,
          color: '#FFFFFF',
          letterSpacing: '0.12em',
          textShadow: '3px 0 rgba(239,68,68,0.7), -3px 0 rgba(56,189,248,0.7), 0 0 18px rgba(0,0,0,0.6)',
          transform: `translateX(${jitter}px)`,
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: 'absolute',
          right: 110,
          top: 90,
          fontFamily: MONO,
          fontSize: 34,
          fontWeight: 800,
          color: '#FFFFFF',
          letterSpacing: '0.1em',
          textShadow: '2px 0 rgba(239,68,68,0.6), -2px 0 rgba(56,189,248,0.6)',
        }}
      >
        {timecode}
      </div>
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* コピー（皮肉ライン）                                                         */
/* -------------------------------------------------------------------------- */

export const TypeLine: React.FC<{
  text: string;
  startFrame: number;
  cps?: number;
  style?: React.CSSProperties;
  caretColor?: string;
}> = ({ text, startFrame, cps = 16, style, caretColor = C.red }) => {
  const frame = useCurrentFrame();
  const lf = frame - startFrame;
  if (lf < 0) return null;
  const chars = Math.min(text.length, Math.floor((lf * cps) / FPS) + 1);
  const caretOn = Math.floor(frame / 8) % 2 === 0 || chars < text.length;
  return (
    <div style={{ position: 'absolute', whiteSpace: 'nowrap', ...style }}>
      {text.slice(0, chars)}
      <span style={{ color: caretColor, opacity: caretOn ? 1 : 0 }}>▍</span>
    </div>
  );
};

export interface KickerProps {
  text: string;
  x: number;
  y: number;
  enterFrame: number;
  size?: number;
  color?: string;
  tag?: string;
  tagColor?: string;
  shadow?: boolean;
  underline?: string;
}

/** 実写/紙面上に載る雑誌見出し調の皮肉コピー（下からマスクリビール）。 */
export const Kicker: React.FC<KickerProps> = ({
  text,
  x,
  y,
  enterFrame,
  size = 78,
  color = '#FFFFFF',
  tag,
  tagColor = C.crimson,
  shadow = true,
  underline,
}) => {
  const frame = useCurrentFrame();
  const lf = frame - enterFrame;
  if (lf < 0) return null;
  const rise = interpolate(lf, [0, 9], [100, 0], { ...CLAMP, easing: EASE_OUT });
  const ul = interpolate(lf, [6, 16], [0, 100], { ...CLAMP, easing: EASE_OUT });
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 21 }}>
      {tag ? (
        <div
          style={{
            display: 'inline-block',
            backgroundColor: tagColor,
            color: '#fff',
            fontFamily: SANS,
            fontWeight: 900,
            fontSize: Math.round(size * 0.32),
            letterSpacing: '0.16em',
            padding: '4px 12px',
            marginBottom: 10,
            opacity: interpolate(lf, [0, 4], [0, 1], CLAMP),
          }}
        >
          {tag}
        </div>
      ) : null}
      <div style={{ overflow: 'hidden', paddingBottom: 6 }}>
        <div
          style={{
            transform: `translateY(${rise.toFixed(1)}%)`,
            fontFamily: SERIF,
            fontWeight: 900,
            fontSize: size,
            lineHeight: 1.18,
            letterSpacing: '0.02em',
            color,
            whiteSpace: 'nowrap',
            textShadow: shadow ? '0 4px 22px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,0.9)' : 'none',
          }}
        >
          {text}
        </div>
      </div>
      {underline ? (
        <div style={{ height: Math.max(5, size * 0.08), width: `${ul}%`, backgroundColor: underline, marginTop: 2 }} />
      ) : null}
    </div>
  );
};
