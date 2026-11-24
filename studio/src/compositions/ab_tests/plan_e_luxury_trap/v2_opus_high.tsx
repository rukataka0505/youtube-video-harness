/**
 * ABテスト 2026-11-22_planE_luxury-trap / バリエーション v2_opus_high（Claude Opus 5.5 effort:high）
 *
 * 共通ベース（BASE_TIMELINE / master_audio.wav / 実写素材 / SFXマップ）は読取専用で使用し、
 * 映像演出のみを本ファイルで構成する（1実験1軸のモデル比較）。
 *
 * 演出方針（案E v2.1 準拠）:
 * - 実写Bロール＋値札（三行広告）→ VHS一時停止 → 号外紙面 → 物理ホワイトボード → 決算紙面＋100円玉 →
 *   定価折れ線 → 因果ギア（0.0 RPM）＋値札オーバーレイ → コルクボード4象限 → ヴェブレン紙面 → 値上げの「ふるい」 →
 *   暗室地図 → 行列/開封動画 → チラシ切抜き → 入口商品 → 憧れのピラミッド → 値札と標的の財布（オープンループ）
 * - 暗色連続は最大約11秒（15秒以内）。映像内文字は名詞句・数値・判子語のみ。出典は概要欄のみ。
 * - master_audio.wav に焼き込み済みの sfxEvents の時刻へ視覚ビートを合わせ、追加の sfxCues で無音抜けを補う
 *   （autoSceneSfx は無効化し、二重再生を避ける）。
 * - 人物が映る実写は全面に軽いぼかしをかける。
 */
import React from 'react';
import { Img, OffthreadVideo, Sequence, interpolate, spring, staticFile } from 'remotion';
import { CausalGearLoopStage } from '../../../components/plan_e/CausalGearLoopStage';
import {
  CorkboardBackdrop,
  EditorialCutoutCard,
  EditorialPaperBackdrop,
} from '../../../components/plan_e/EditorialCutoutCard';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from '../../../components/plan_e/fonts';
import {
  PlanEMacroEconTemplateV2,
  type PlanECustomSceneContext,
  type PlanEProjectSpec,
  type PlanESceneSpec,
  type PlanESfxCue,
} from '../../../components/plan_e/legacy';
import { BASE_TIMELINE as base } from './baseTimelineData';

type Ctx = PlanECustomSceneContext;

// ---------------------------------------------------------------------------
// 共通ユーティリティ
// ---------------------------------------------------------------------------
const INK = '#16130F';
const RED = '#CC0000';
const BLUE = '#0072B2';
const GREEN = '#1E8E3E';
const GOLD = '#F59E0B';
const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const ramp = (sec: number, from: number, dur = 0.45) => interpolate(sec, [from, from + dur], [0, 1], CL);

const springAt = (
  c: Ctx,
  atSec: number,
  config: { stiffness: number; damping: number; mass: number } = { stiffness: 420, damping: 22, mass: 0.6 },
) => {
  const f0 = Math.round(atSec * c.fps);
  return c.frame < f0 ? 0 : spring({ frame: c.frame - f0, fps: c.fps, config });
};

const img = (key: string) => staticFile(base.imageMap[key]);
const vid = (key: string) => staticFile(base.videoMap[key]);
const yen = (n: number) => '¥' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 非fullBleedのカスタムシーンを1920x1080全面に広げる（セーフゾーン原点 96,54 を打ち消す） */
const FullBleed: React.FC<{ children: React.ReactNode; bg?: string }> = ({ children, bg }) => (
  <div style={{ position: 'absolute', left: -96, top: -54, width: 1920, height: 1080, overflow: 'hidden', background: bg }}>
    {children}
  </div>
);

const Abs: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => (
  <div style={{ position: 'absolute', ...style }}>{children}</div>
);

// ---------------------------------------------------------------------------
// 物理小道具コンポーネント
// ---------------------------------------------------------------------------

/** 赤判子（押印スプリング＋薄い紙地） */
const Stamp: React.FC<{
  c: Ctx;
  text: string;
  at: number;
  size?: number;
  rotate?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ c, text, at, size = 56, rotate = -9, color = RED, style }) => {
  if (c.sec < at) return null;
  const s = springAt(c, at, { stiffness: 520, damping: 18, mass: 0.55 });
  return (
    <div
      style={{
        position: 'absolute',
        border: `${Math.max(5, Math.round(size / 9))}px solid ${color}`,
        borderRadius: 8,
        padding: `${Math.round(size * 0.06)}px ${Math.round(size * 0.34)}px`,
        color,
        fontFamily: FONT_ECON_SERIF,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.15,
        letterSpacing: '0.1em',
        whiteSpace: 'nowrap',
        background: 'rgba(250,248,243,0.74)',
        boxShadow: `inset 0 0 0 2px ${color}55`,
        transform: `scale(${interpolate(s, [0, 1], [2.3, 1]).toFixed(3)}) rotate(${rotate}deg)`,
        opacity: interpolate(s, [0, 0.2, 1], [0, 0.95, 0.9]),
        zIndex: 30,
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/** 紐で吊られた値札（落下→減衰スイング） */
const HangTag: React.FC<{
  c: Ctx;
  at: number;
  x: number;
  y: number;
  label?: string;
  price: string;
  scale?: number;
  stringLen?: number;
  swing?: boolean;
  glow?: number;
}> = ({ c, at, x, y, label, price, scale = 1, stringLen = 110, swing = true, glow = 0 }) => {
  if (c.sec < at) return null;
  const t = c.sec - at;
  const drop = springAt(c, at, { stiffness: 260, damping: 16, mass: 0.8 });
  const angle = swing ? 14 * Math.exp(-t * 1.6) * Math.sin(t * 6.2) + 1.2 * Math.sin(t * 1.3) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 0,
        height: 0,
        transform: `translateY(${interpolate(drop, [0, 1], [-420, 0]).toFixed(1)}px) scale(${scale})`,
        transformOrigin: '0 0',
        zIndex: 25,
      }}
    >
      <div style={{ position: 'absolute', left: -9, top: -9, width: 18, height: 18, borderRadius: 9, background: '#B8B2A6', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, transform: `rotate(${angle.toFixed(2)}deg)`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', left: -1.5, top: 0, width: 3, height: stringLen, background: '#D9D2C3' }} />
        <div
          style={{
            position: 'absolute',
            left: -190,
            top: stringLen,
            width: 380,
            padding: '46px 30px 30px',
            background: 'linear-gradient(180deg,#FBF8F1 0%,#EFE7D6 100%)',
            clipPath: 'polygon(28% 0%, 72% 0%, 100% 14%, 100% 100%, 0% 100%, 0% 14%)',
            textAlign: 'center',
            boxShadow: glow > 0 ? `0 0 ${40 * glow}px rgba(255,255,255,${0.8 * glow})` : undefined,
            filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.55))',
          }}
        >
          <div style={{ position: 'absolute', left: '50%', top: 16, width: 18, height: 18, marginLeft: -9, borderRadius: 9, background: '#3B342B' }} />
          {label ? (
            <div style={{ fontFamily: FONT_ECON_SANS, fontWeight: 800, fontSize: 28, color: '#4A4238', letterSpacing: '0.2em', borderBottom: `2px solid ${INK}`, paddingBottom: 8, marginBottom: 10 }}>
              {label}
            </div>
          ) : null}
          <div style={{ fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 60, color: INK, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{price}</div>
        </div>
      </div>
    </div>
  );
};

/** テープ留めの写真切抜き（ポラロイド風） */
const PhotoClip: React.FC<{
  c: Ctx;
  at: number;
  x: number;
  y: number;
  w: number;
  h: number;
  src?: string;
  objectPosition?: string;
  filter?: string;
  caption?: string;
  rotate?: number;
  children?: React.ReactNode;
  highlight?: number;
  captionSize?: number;
}> = ({ c, at, x, y, w, h, src, objectPosition = '50% 50%', filter, caption, rotate = -1.5, children, highlight = 0, captionSize = 34 }) => {
  if (c.sec < at) return null;
  const s = springAt(c, at, { stiffness: 320, damping: 22, mass: 0.7 });
  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2 - 14,
        top: y,
        width: w + 28,
        padding: '14px 14px 0',
        background: '#FFFFFF',
        boxShadow: highlight > 0 ? `0 0 0 ${6 * highlight}px ${GOLD}, 0 22px 40px rgba(0,0,0,0.38)` : '0 18px 34px rgba(0,0,0,0.34)',
        opacity: interpolate(s, [0, 0.25, 1], [0, 1, 1]),
        transform: `translateY(${interpolate(s, [0, 1], [-46, 0]).toFixed(1)}px) scale(${(interpolate(s, [0, 1], [1.08, 1]) + highlight * 0.04).toFixed(3)}) rotate(${rotate}deg)`,
        zIndex: 12 + Math.round(highlight * 5),
      }}
    >
      <div style={{ position: 'absolute', left: '50%', top: -16, width: 130, height: 34, marginLeft: -65, background: 'rgba(232,220,190,0.78)', transform: 'rotate(-3deg)' }} />
      <div style={{ width: w, height: h, overflow: 'hidden', background: '#EFE9DD', position: 'relative' }}>
        {src ? <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition, filter }} /> : null}
        {children}
      </div>
      {caption ? (
        <div style={{ fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: captionSize, color: INK, textAlign: 'center', padding: '12px 0 16px', whiteSpace: 'nowrap' }}>{caption}</div>
      ) : (
        <div style={{ height: 30 }} />
      )}
    </div>
  );
};

/** ロゴのない無地バッグ（コード描画） */
const PlainBag: React.FC<{ tone?: string }> = ({ tone = '#B39573' }) => (
  <svg viewBox="0 0 400 300" style={{ width: '100%', height: '100%' }}>
    <rect width="400" height="300" fill="#F1ECE2" />
    <path d="M140 120 C140 50 260 50 260 120" fill="none" stroke="#6B5236" strokeWidth="12" strokeLinecap="round" />
    <path d="M95 120 H305 L325 260 H75 Z" fill={tone} stroke="#6B5236" strokeWidth="5" strokeLinejoin="round" />
    <path d="M95 150 H305" stroke="#8C6E4D" strokeWidth="3" />
    <rect x="188" y="140" width="24" height="18" rx="3" fill="#D8C29A" stroke="#6B5236" strokeWidth="3" />
  </svg>
);

const WalletIcon: React.FC<{ color?: string }> = ({ color = '#7A4E2D' }) => (
  <svg viewBox="0 0 300 220" style={{ width: '100%', height: '100%' }}>
    <rect x="40" y="50" width="220" height="130" rx="16" fill={color} stroke="#3B2414" strokeWidth="5" />
    <path d="M40 92 H210 Q236 92 236 116 Q236 140 210 140 H260" fill="none" stroke="#3B2414" strokeWidth="5" />
    <circle cx="212" cy="116" r="9" fill="#D8C29A" stroke="#3B2414" strokeWidth="3" />
    <path d="M56 66 H244" stroke="#9C6B45" strokeWidth="3" strokeDasharray="8 7" />
  </svg>
);

const KeyCaseIcon: React.FC = () => (
  <svg viewBox="0 0 300 220" style={{ width: '100%', height: '100%' }}>
    <circle cx="150" cy="50" r="22" fill="none" stroke="#9A8A6E" strokeWidth="7" />
    <rect x="95" y="70" width="110" height="120" rx="20" fill="#5B3A22" stroke="#2C1A0E" strokeWidth="5" />
    <path d="M110 105 H190" stroke="#8C6440" strokeWidth="3" strokeDasharray="7 6" />
    <circle cx="150" cy="150" r="8" fill="#D8C29A" />
  </svg>
);

const PerfumeIcon: React.FC = () => (
  <svg viewBox="0 0 300 220" style={{ width: '100%', height: '100%' }}>
    <rect x="128" y="20" width="44" height="36" rx="5" fill="#C9A44C" stroke="#7C6322" strokeWidth="4" />
    <rect x="140" y="54" width="20" height="16" fill="#9C8B5C" />
    <rect x="92" y="70" width="116" height="128" rx="14" fill="rgba(214,200,160,0.55)" stroke="#6D5B2E" strokeWidth="5" />
    <rect x="112" y="118" width="76" height="40" fill="#FBF8F1" stroke="#6D5B2E" strokeWidth="2" />
  </svg>
);

/** 実写Bロール層（trimBefore・ぼかし・ミラー・ケンバーンズ対応） */
const BrollLayer: React.FC<{
  c: Ctx;
  startSec: number;
  endSec: number;
  videoKey?: string;
  imageKey?: string;
  trimBeforeSec?: number;
  blur?: number;
  brightness?: number;
  saturate?: number;
  mirror?: boolean;
  zoom?: [number, number];
  objectPosition?: string;
  opacity?: number;
}> = ({ c, startSec, endSec, videoKey, imageKey, trimBeforeSec = 0, blur = 0, brightness = 0.8, saturate = 1, mirror = false, zoom = [1.05, 1.13], objectPosition = '50% 50%', opacity = 1 }) => {
  const p = interpolate(c.sec, [startSec, endSec], [0, 1], CL);
  const scale = interpolate(p, [0, 1], zoom);
  const style: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', objectPosition };
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        transform: `scale(${scale.toFixed(4)})${mirror ? ' scaleX(-1)' : ''}`,
        filter: `blur(${blur}px) brightness(${brightness}) saturate(${saturate}) contrast(1.08)`,
      }}
    >
      {videoKey ? (
        <Sequence from={Math.floor(startSec * c.fps)} durationInFrames={Math.ceil((endSec - startSec) * c.fps) + 4} layout="none">
          <OffthreadVideo muted src={vid(videoKey)} trimBefore={Math.round(trimBeforeSec * c.fps)} style={style} />
        </Sequence>
      ) : imageKey ? (
        <Img src={img(imageKey)} style={style} />
      ) : null}
    </div>
  );
};

const DarkVignette: React.FC<{ strength?: number }> = ({ strength = 0.78 }) => (
  <>
    <Abs style={{ inset: 0, background: `radial-gradient(ellipse 80% 74% at 50% 44%, transparent 30%, rgba(6,8,11,${strength}) 100%)` }} />
    <Abs style={{ inset: 0, background: 'linear-gradient(180deg, rgba(6,8,11,0.2) 0%, transparent 26%, transparent 62%, rgba(6,8,11,0.8) 100%)' }} />
  </>
);

/** オーク木枠ホワイトボード */
const Whiteboard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    <Abs style={{ inset: 0, background: 'linear-gradient(180deg, #E5E9F0 0%, #D2D9E3 64%, #A3B0C2 100%)' }} />
    <Abs
      style={{
        top: 46,
        left: 130,
        right: 130,
        bottom: 186,
        border: '18px solid #9A6332',
        borderRadius: 12,
        background: '#F8FAFC',
        boxShadow: '0 24px 54px rgba(15,23,42,0.28), inset 0 2px 10px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}
    >
      {children}
    </Abs>
    <Abs style={{ left: '34%', right: '34%', bottom: 160, height: 16, borderRadius: 4, background: 'linear-gradient(180deg,#E2E8F0,#64748B)', boxShadow: '0 4px 10px rgba(0,0,0,0.32)' }}>
      <Abs style={{ left: 40, top: -6, width: 70, height: 8, borderRadius: 3, background: '#1E293B' }} />
      <Abs style={{ left: 130, top: -6, width: 64, height: 8, borderRadius: 3, background: RED }} />
      <Abs style={{ left: 214, top: -6, width: 60, height: 8, borderRadius: 3, background: BLUE }} />
    </Abs>
  </>
);

/** SVG 内のマーカー書き込み（左→右に clip で出現） */
const WriteOn: React.FC<{ id: string; p: number; x: number; y: number; w: number; h: number; children: React.ReactNode }> = ({ id, p, x, y, w, h, children }) =>
  p <= 0 ? null : (
    <g>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={Math.max(0.1, w * p)} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </g>
  );

/** 手描き丸囲み */
const MarkerEllipse: React.FC<{ p: number; cx: number; cy: number; rx: number; ry: number; color?: string; width?: number }> = ({ p, cx, cy, rx, ry, color = RED, width = 6 }) =>
  p <= 0 ? null : (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill="none"
      stroke={color}
      strokeWidth={width}
      pathLength={1}
      strokeDasharray="1"
      strokeDashoffset={1 - p}
      strokeLinecap="round"
      transform={`rotate(-4 ${cx} ${cy})`}
    />
  );

// ---------------------------------------------------------------------------
// シーン描画
// ---------------------------------------------------------------------------

/** 0:00 フック：ショーウィンドウのバッグ＋吊り値札 → 背後に買い物客 */
const HookScene: React.FC<{ c: Ctx }> = ({ c }) => {
  const zoom = interpolate(c.sec, [0, 6.46], [1.0, 1.09], CL);
  const crowd = ramp(c.sec, 3.85, 0.7);
  return (
    <FullBleed bg="#0A0C0F">
      <BrollLayer c={c} startSec={3.85} endSec={6.46} videoKey="luxury_boutique_broll" trimBeforeSec={4.3} blur={7} brightness={0.5} saturate={0.85} opacity={crowd * 0.9} />
      <Abs style={{ inset: 0, background: 'radial-gradient(circle at 34% 40%, rgba(255,214,150,0.22) 0%, rgba(10,12,15,0) 46%)' }} />
      <Abs
        style={{
          left: 300,
          top: 96,
          width: 680,
          height: 680,
          border: '16px solid #3A3127',
          boxShadow: '0 0 0 3px #7A6648, 0 30px 80px rgba(0,0,0,0.75)',
          overflow: 'hidden',
          background: '#EDE7DC',
          opacity: interpolate(crowd, [0, 1], [1, 0.92]),
        }}
      >
        <Img src={img('luxury_handbag_display')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '23% 55%', transform: `scale(${zoom.toFixed(4)})`, filter: 'contrast(1.08) saturate(1.1) brightness(0.96)' }} />
        <Abs style={{ inset: 0, background: 'radial-gradient(ellipse 70% 60% at 50% 38%, rgba(255,230,180,0.18) 0%, rgba(20,16,10,0.42) 100%)' }} />
        <Abs style={{ inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.14) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.06) 100%)' }} />
      </Abs>
      <DarkVignette strength={0.7} />
      <HangTag c={c} at={1.5} x={1290} y={120} label="店頭価格" price="¥1,600,000" />
      <Stamp c={c} text="誰？" at={5.27} size={118} rotate={-8} style={{ left: 1180, top: 600 }} />
    </FullBleed>
  );
};

/** 0:09 号外：大富豪の好み ✕ 目立つロゴ → 主な買い手は会社員 */
const BuyersScene: React.FC<{ c: Ctx }> = ({ c }) => {
  const xP = ramp(c.sec, 13.06, 0.35);
  const arrowP = ramp(c.sec, 17.95, 0.4);
  return (
    <FullBleed>
      <EditorialPaperBackdrop>
        <Abs style={{ top: 44, left: 96, right: 96, borderTop: `4px solid ${INK}`, borderBottom: `2px solid ${INK}`, padding: '10px 0 12px', display: 'flex', alignItems: 'center', gap: 22 }}>
          <span style={{ background: INK, color: '#FAF8F3', fontFamily: FONT_ECON_SANS, fontWeight: 900, fontSize: 30, padding: '2px 18px', letterSpacing: '0.2em' }}>号外</span>
          <span style={{ fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 38, color: INK, letterSpacing: '0.08em' }}>高級ブランドの買い手</span>
        </Abs>
        <PhotoClip c={c} at={9.45} x={400} y={200} w={440} h={300} caption="大富豪の好み" rotate={-2}>
          <PlainBag />
        </PhotoClip>
        <Stamp c={c} text="ロゴ小" at={10.5} size={58} rotate={-10} style={{ left: 410, top: 390 }} />
        <PhotoClip c={c} at={11.85} x={960} y={190} w={440} h={300} src={img('luxury_handbag_display')} objectPosition="21% 55%" caption="目立つロゴ" rotate={1.6} />
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
          {xP > 0 ? (
            <g stroke={RED} strokeWidth={13} strokeLinecap="round">
              <line x1={640} y1={300} x2={640 + 80 * Math.min(1, xP * 2)} y2={300 + 80 * Math.min(1, xP * 2)} />
              {xP > 0.5 ? <line x1={720} y1={300} x2={720 - 80 * (xP - 0.5) * 2} y2={300 + 80 * (xP - 0.5) * 2} /> : null}
            </g>
          ) : null}
          {arrowP > 0 ? (
            <g>
              <path d="M1192 330 Q1252 250 1318 330" fill="none" stroke={RED} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - arrowP} />
              {arrowP > 0.95 ? <path d="M1294 312 L1320 334 L1290 344" fill="none" stroke={RED} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" /> : null}
            </g>
          ) : null}
        </svg>
        <PhotoClip c={c} at={17.45} x={1530} y={215} w={440} h={300} src={img('luxury_boutique_broll_poster')} objectPosition="50% 35%" filter="blur(1.2px) saturate(0.9)" caption="普通の会社員" rotate={-1.8} />
        <Stamp c={c} text="主な買い手" at={18.3} size={54} rotate={-8} style={{ left: 1420, top: 400 }} />
      </EditorialPaperBackdrop>
    </FullBleed>
  );
};

/** 0:20 / 2:21 ホワイトボード：人数 2%｜98% と 売上 45%｜55% */
const MarketBoard: React.FC<{ c: Ctx; t0: number; reprise?: boolean; fadeOut?: number }> = ({ c, t0, reprise = false, fadeOut = 0 }) => {
  const T = reprise
    ? { title: t0, big: t0, box: t0 + 0.2, salesOut: t0, sales45: t0 + 0.1, peopleOut: t0, people2: t0 + 0.2, link: t0 + 0.4, red: t0 + 0.5, circle98: 999, label35: t0 + 0.6, rich: 144.24 }
    : { title: 21.13, big: 24.4, box: 25.53, salesOut: 26.0, sales45: 26.2, peopleOut: 28.3, people2: 28.57, link: 29.5, red: 32.65, circle98: 33.25, label35: 34.8, rich: 999 };
  const s = c.sec;
  const x0 = 270;
  const W = 1180;
  const barH = 92;
  const yP = 300;
  const yS = 540;
  const outlineP = (at: number) => ramp(s, at, 0.35);
  const fill = (at: number) => ramp(s, at, 0.55);
  const red = fill(T.red);
  return (
    <svg viewBox="0 0 1600 780" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 1 - fadeOut }} preserveAspectRatio="xMidYMid meet">
      <WriteOn id={`mb-title-${reprise ? 'r' : 'a'}`} p={ramp(s, T.title, 0.6)} x={60} y={40} w={620} h={90}>
        <text x={80} y={112} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={50} fill="#0F172A">世界の高級品市場</text>
      </WriteOn>
      <WriteOn id={`mb-big-${reprise ? 'r' : 'a'}`} p={ramp(s, T.big, 0.55)} x={1050} y={20} w={500} h={130}>
        <text x={1530} y={122} textAnchor="end" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={96} fill={RED}>約60兆円</text>
      </WriteOn>
      {ramp(s, T.box, 0.3) > 0 ? (
        <rect x={1092} y={30} width={460} height={124} rx={14} fill="none" stroke={RED} strokeWidth={5} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - ramp(s, T.box, 0.3)} />
      ) : null}
      <line x1={70} y1={176} x2={1530} y2={176} stroke="#334155" strokeWidth={3} opacity={ramp(s, T.title, 0.6)} />

      {/* 人数 */}
      <g opacity={outlineP(T.peopleOut)}>
        <text x={80} y={yP + 64} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={46} fill="#0F172A">人数</text>
        <rect x={x0} y={yP} width={W} height={barH} fill="none" stroke="#1E293B" strokeWidth={4} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - outlineP(T.peopleOut)} />
      </g>
      <rect x={x0} y={yP} width={W * 0.02 * fill(T.people2)} height={barH} fill={GREEN} />
      <text x={x0 + 4} y={yP - 18} fontFamily={FONT_ECON_MONO} fontWeight={900} fontSize={46} fill={GREEN} opacity={fill(T.people2)}>2%</text>
      <rect x={x0 + W * 0.02 + 3} y={yP + 3} width={(W * 0.98 - 6) * red} height={barH - 6} fill="#E8A3A3" />
      <text x={x0 + W * 0.51} y={yP + 64} textAnchor="middle" fontFamily={FONT_ECON_MONO} fontWeight={900} fontSize={54} fill={RED} opacity={ramp(s, T.red + 0.3, 0.3)}>98%</text>
      <MarkerEllipse p={ramp(s, T.circle98, 0.45)} cx={x0 + W * 0.51} cy={yP + 46} rx={130} ry={64} />
      <text x={x0 + W} y={yP + barH + 58} textAnchor="end" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={42} fill={RED} opacity={ramp(s, T.label35, 0.35)}>約3.5億人</text>

      {/* 売上 */}
      <g opacity={outlineP(T.salesOut)}>
        <text x={80} y={yS + 64} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={46} fill="#0F172A">売上</text>
        <rect x={x0} y={yS} width={W} height={barH} fill="none" stroke="#1E293B" strokeWidth={4} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - outlineP(T.salesOut)} />
      </g>
      <rect x={x0} y={yS} width={W * 0.45 * fill(T.sales45)} height={barH} fill={GREEN} />
      <text x={x0 + W * 0.225} y={yS + 64} textAnchor="middle" fontFamily={FONT_ECON_MONO} fontWeight={900} fontSize={54} fill="#FFFFFF" opacity={ramp(s, T.sales45 + 0.35, 0.3)}>45%</text>
      <rect x={x0 + W * 0.45 + 3} y={yS + 3} width={(W * 0.55 - 6) * fill(T.red + 0.25)} height={barH - 6} fill="#E8A3A3" />
      <text x={x0 + W * 0.725} y={yS + 64} textAnchor="middle" fontFamily={FONT_ECON_MONO} fontWeight={900} fontSize={54} fill={RED} opacity={ramp(s, T.red + 0.6, 0.3)}>55%</text>

      {/* 2% ↔ 45% の青マーカー連結 */}
      {ramp(s, T.link, 0.45) > 0 ? (
        <g>
          <path d={`M ${x0 + 12} ${yP + barH} C ${x0 + 30} ${yP + 170}, ${x0 + W * 0.2} ${yS - 90}, ${x0 + W * 0.225} ${yS}`} fill="none" stroke={BLUE} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - ramp(s, T.link, 0.45)} />
          <text x={x0 + 300} y={yP + 172} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={34} fill={BLUE} opacity={ramp(s, T.link + 0.3, 0.3)}>超富裕層</text>
        </g>
      ) : null}

      {/* リプライズ：大富豪の45%を丸囲み */}
      <MarkerEllipse p={ramp(s, T.rich, 0.45)} cx={x0 + W * 0.225} cy={yS + 46} rx={300} ry={78} />
      <text x={x0 + W * 0.225} y={yS + barH + 74} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={44} fill={RED} opacity={ramp(s, T.rich + 0.25, 0.3)}>大富豪</text>
    </svg>
  );
};

/** 0:44 決算紙面＋100円玉 */
const coinWedge = (cx: number, cy: number, r: number, frac: number) => {
  if (frac <= 0) return '';
  const a = Math.min(0.9999, frac) * Math.PI * 2;
  const x = cx + r * Math.sin(a);
  const y = cy - r * Math.cos(a);
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
};

const Coin: React.FC<{ cx: number; cy: number; r: number; frac: number; face: string }> = ({ cx, cy, r, frac, face }) => (
  <g>
    <defs>
      <radialGradient id={`coin-${cx}`} cx="40%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#F4F6F8" />
        <stop offset="60%" stopColor="#C2C8CF" />
        <stop offset="100%" stopColor="#8B939C" />
      </radialGradient>
    </defs>
    <circle cx={cx} cy={cy + 8} r={r} fill="rgba(0,0,0,0.18)" />
    <circle cx={cx} cy={cy} r={r} fill={`url(#coin-${cx})`} stroke="#6B737C" strokeWidth={4} />
    <circle cx={cx} cy={cy} r={r * 0.86} fill="none" stroke="#9AA2AB" strokeWidth={2.5} strokeDasharray="3 6" />
    <text x={cx} y={cy + r * 0.2} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={r * 0.62} fill="#4B535C">{face}</text>
    <path d={coinWedge(cx, cy, r, frac)} fill={RED} opacity={0.82} />
  </g>
);

const MarginScene: React.FC<{ c: Ctx }> = ({ c }) => {
  const s = c.sec;
  const sheet = springAt(c, 44.2, { stiffness: 300, damping: 22, mass: 0.7 });
  const marker = ramp(s, 46.34, 0.55);
  const bigCoin = springAt(c, 51.65);
  const smallCoin = springAt(c, 54.5);
  return (
    <FullBleed>
      <EditorialPaperBackdrop>
        <Abs
          style={{
            left: 140,
            top: 110,
            width: 780,
            padding: '34px 44px 48px',
            background: '#FFFFFF',
            boxShadow: '0 22px 44px rgba(0,0,0,0.25)',
            clipPath: 'polygon(0% 1%, 6% 0%, 14% 1.2%, 25% 0.2%, 38% 1.4%, 52% 0%, 66% 1.1%, 80% 0.1%, 92% 1.3%, 100% 0.4%, 100% 99%, 90% 100%, 78% 98.8%, 64% 100%, 50% 98.9%, 36% 100%, 22% 98.7%, 10% 100%, 0% 99.2%)',
            transform: `translateY(${interpolate(sheet, [0, 1], [-60, 0]).toFixed(1)}px) rotate(-1.4deg)`,
            opacity: interpolate(sheet, [0, 0.25, 1], [0, 1, 1]),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, borderBottom: `3px solid ${INK}`, paddingBottom: 14, marginBottom: 22 }}>
            <span style={{ background: INK, color: '#FFF', fontFamily: FONT_ECON_SANS, fontWeight: 900, fontSize: 26, padding: '3px 16px', letterSpacing: '0.14em' }}>決算資料</span>
            <span style={{ fontFamily: FONT_ECON_MONO, fontWeight: 800, fontSize: 26, color: '#4A4238' }}>LVMH 2024</span>
          </div>
          <div style={{ fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 50, color: INK, lineHeight: 1.25, marginBottom: 26 }}>
            ファッション＆
            <br />
            レザーグッズ部門
          </div>
          {[
            ['売上', '410.6億ユーロ'],
            ['営業利益', '152.3億ユーロ'],
          ].map(([k, v], i) => (
            <div key={k} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', fontFamily: FONT_ECON_SANS, fontWeight: 800, fontSize: 38, color: INK, padding: '14px 6px', borderBottom: '1px dashed rgba(22,19,15,0.35)' }}>
              {i === 1 ? <div style={{ position: 'absolute', left: -6, top: 8, bottom: 8, width: `${(marker * 104).toFixed(1)}%`, background: 'rgba(250,204,21,0.55)', zIndex: 0 }} /> : null}
              <span style={{ position: 'relative' }}>{k}</span>
              <span style={{ position: 'relative', fontFamily: FONT_ECON_MONO }}>{v}</span>
            </div>
          ))}
          <div style={{ height: 120 }} />
        </Abs>
        <Stamp c={c} text="利益率 37.1%" at={49.0} size={66} rotate={-7} style={{ left: 330, top: 620 }} />

        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <g opacity={bigCoin} transform={`translate(${1310} ${430}) scale(${interpolate(bigCoin, [0, 1], [0.7, 1]).toFixed(3)}) translate(${-1310} ${-430})`}>
            <Coin cx={1310} cy={430} r={190} frac={0.371 * ramp(s, 51.95, 0.9)} face="100" />
          </g>
          <text x={1310} y={720} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={84} fill={RED} opacity={ramp(s, 52.92, 0.25)}>37円</text>
          <g opacity={smallCoin} transform={`translate(${1710} ${300}) scale(${interpolate(smallCoin, [0, 1], [0.7, 1]).toFixed(3)}) translate(${-1710} ${-300})`}>
            <Coin cx={1710} cy={300} r={84} frac={0.09 * ramp(s, 54.65, 0.5)} face="100" />
            <text x={1710} y={426} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={30} fill="#334155">一般アパレル</text>
          </g>
          <text x={1710} y={560} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={64} fill={RED} opacity={ramp(s, 55.56, 0.25)} transform="rotate(-6 1710 560)">×数倍</text>
        </svg>
      </EditorialPaperBackdrop>
    </FullBleed>
  );
};

/** 1:01 国内値札（フックの値札を回収） */
const DomesticTagScene: React.FC<{ c: Ctx }> = ({ c }) => (
  <FullBleed bg="#0A0C0F">
    <BrollLayer c={c} startSec={61.92} endSec={64.87} imageKey="luxury_handbag_display" blur={10} brightness={0.42} zoom={[1.15, 1.22]} objectPosition="22% 55%" />
    <DarkVignette strength={0.7} />
    <HangTag c={c} at={62.35} x={960} y={110} label="国内定価" price="160万円超" scale={1.15} />
  </FullBleed>
);

/** 1:04 因果ギア＋値札オーバーレイ（値下げ？→却下→再値上げ） */
const DropoutScene: React.FC<{ c: Ctx }> = ({ c }) => {
  const s = c.sec;
  const cutTag = springAt(c, 76.07);
  const reTag = springAt(c, 80.95, { stiffness: 380, damping: 16, mass: 0.6 });
  return (
    <FullBleed>
      <CausalGearLoopStage
        startSec={64.87}
        endSec={82.18}
        surfaceTheme="paper"
        title="値上げと客離れ"
        centerLockLabel="0.0 RPM"
        leftActor={{ emblem: '¥', actorLabel: 'ブランド', headline: '値上げ', meterLabel: '価格', meterPct: 92, statusBadge: '価格上昇', tone: 'amber' }}
        rightActor={{ emblem: '客', actorLabel: '背伸び層', headline: '約4億人', meterLabel: '人数', meterPct: 88, statusBadge: '市場から退出', tone: 'crimson' }}
        topFlowLabel="値上げ"
        bottomFlowLabel="購入"
        rightPhaseOffsetSec={4.5}
        lockOffsetSec={9.16}
      />
      <Stamp c={c} text="−5,000万人" at={73.07} size={60} rotate={-8} style={{ right: 140, top: 390 }} />
      {s >= 76.07 ? (
        <Abs
          style={{
            left: 760,
            top: 600,
            width: 400,
            zIndex: 32,
            transform: `translateY(${interpolate(cutTag, [0, 1], [40, 0]).toFixed(1)}px) rotate(-3deg)`,
            opacity: s >= 80.95 ? interpolate(reTag, [0, 1], [1, 0.0]) : cutTag,
          }}
        >
          <div style={{ background: '#FBF8F1', border: `4px dashed ${INK}`, padding: '14px 20px', textAlign: 'center', fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 58, color: INK, boxShadow: '0 16px 30px rgba(0,0,0,0.3)' }}>値下げ？</div>
          {s >= 78.3 ? <Stamp c={c} text="却下" at={78.3} size={62} rotate={-14} style={{ left: 250, top: -34 }} /> : null}
        </Abs>
      ) : null}
      {s >= 80.95 ? (
        <Abs style={{ left: 700, top: 580, width: 520, zIndex: 34, transform: `scale(${interpolate(reTag, [0, 1], [1.6, 1]).toFixed(3)}) rotate(-4deg)`, opacity: interpolate(reTag, [0, 0.2, 1], [0, 1, 1]) }}>
          <div style={{ background: RED, color: '#FFF', padding: '16px 24px', textAlign: 'center', fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 70, letterSpacing: '0.08em', boxShadow: '0 18px 36px rgba(0,0,0,0.35)' }}>再値上げ ↑</div>
        </Abs>
      ) : null}
    </FullBleed>
  );
};

/** 1:22 コルクボード4象限（資産 × 見せびらかし欲） */
const QuadSlip: React.FC<{
  c: Ctx;
  at: number;
  x: number;
  y: number;
  title: string;
  sub: string;
  rotate: number;
  highlight?: number;
  visual?: React.ReactNode;
}> = ({ c, at, x, y, title, sub, rotate, highlight = 0, visual }) => {
  if (c.sec < at) return null;
  const s = springAt(c, at, { stiffness: 380, damping: 22, mass: 0.6 });
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 210,
        top: y - 125,
        width: 420,
        height: 250,
        background: 'linear-gradient(180deg,#FBF8F1,#F0E9DA)',
        boxShadow: highlight > 0 ? `0 0 0 ${7 * highlight}px ${GOLD}, 0 18px 30px rgba(0,0,0,0.45)` : '0 14px 26px rgba(0,0,0,0.42)',
        transform: `translateY(${interpolate(s, [0, 1], [-36, 0]).toFixed(1)}px) scale(${(interpolate(s, [0, 1], [1.1, 1]) + 0.05 * highlight).toFixed(3)}) rotate(${rotate}deg)`,
        opacity: interpolate(s, [0, 0.2, 1], [0, 1, 1]),
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '0 22px',
        zIndex: 10 + Math.round(highlight * 4),
      }}
    >
      <div style={{ position: 'absolute', left: '50%', top: -12, width: 26, height: 26, marginLeft: -13, borderRadius: 13, background: '#DC2626', border: '3px solid #7F1D1D' }} />
      <div style={{ width: 150, height: 150, flexShrink: 0, background: '#E7E0D2', overflow: 'hidden', border: '2px solid rgba(22,19,15,0.2)' }}>{visual}</div>
      <div>
        <div style={{ fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 46, color: INK }}>{title}</div>
        <div style={{ fontFamily: FONT_ECON_MONO, fontWeight: 800, fontSize: 22, color: '#57534E', marginTop: 8, whiteSpace: 'nowrap' }}>{sub}</div>
      </div>
    </div>
  );
};

const QuadrantScene: React.FC<{ c: Ctx }> = ({ c }) => {
  const s = c.sec;
  const card = springAt(c, 82.58);
  const vAxis = ramp(s, 87.8, 0.6);
  const hAxis = ramp(s, 88.66, 0.6);
  const stringP = ramp(s, 101.0, 0.6);
  const logoVisual = (at: number) =>
    s >= at ? <Img src={img('luxury_handbag_display')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '20% 55%' }} /> : null;
  const sticky = springAt(c, 95.7);
  return (
    <FullBleed>
      <CorkboardBackdrop showRedString={false}>
        {/* 論文インデックスカード */}
        <Abs
          style={{
            left: 110,
            top: 84,
            width: 440,
            padding: '24px 28px 30px',
            background: '#FFFFFF',
            boxShadow: '0 16px 30px rgba(0,0,0,0.45)',
            transform: `translateY(${interpolate(card, [0, 1], [-40, 0]).toFixed(1)}px) rotate(-2.5deg)`,
            opacity: interpolate(card, [0, 0.2, 1], [0, 1, 1]),
            backgroundImage: 'repeating-linear-gradient(180deg, transparent 0px, transparent 43px, rgba(0,114,178,0.18) 44px)',
          }}
        >
          <div style={{ position: 'absolute', left: '50%', top: -12, width: 26, height: 26, marginLeft: -13, borderRadius: 13, background: '#DC2626', border: '3px solid #7F1D1D' }} />
          <span style={{ background: INK, color: '#FFF', fontFamily: FONT_ECON_SANS, fontWeight: 900, fontSize: 24, padding: '3px 14px', letterSpacing: '0.14em' }}>購買行動研究</span>
          <div style={{ fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 64, color: INK, marginTop: 14 }}>2010年</div>
          <div style={{ fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 34, color: INK, marginTop: 4 }}>ブランドの目立ち方</div>
          <div style={{ fontFamily: FONT_ECON_MONO, fontWeight: 700, fontSize: 21, color: '#57534E', marginTop: 10 }}>Journal of Marketing</div>
        </Abs>
        <Stamp c={c} text="査読論文" at={86.18} size={50} rotate={-10} style={{ left: 300, top: 330 }} />

        {/* 付箋：素材・仕立て → 同じ階層だけに */}
        {s >= 95.7 ? (
          <Abs style={{ left: 150, top: 520, width: 380, padding: '26px 26px 30px', background: '#FDE68A', boxShadow: '0 14px 24px rgba(0,0,0,0.4)', transform: `rotate(2deg) scale(${interpolate(sticky, [0, 1], [0.6, 1]).toFixed(3)})`, opacity: sticky }}>
            <div style={{ fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 46, color: INK }}>素材・仕立て</div>
            <div style={{ fontFamily: FONT_ECON_SANS, fontWeight: 900, fontSize: 34, color: BLUE, marginTop: 14, opacity: ramp(s, 97.5, 0.35) }}>→ 同じ階層だけに</div>
          </Abs>
        ) : null}

        {/* 軸 */}
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, zIndex: 8 }}>
          <defs>
            <marker id="qa-arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
              <path d="M0 0 L10 5 L0 10 Z" fill="#1A120A" />
            </marker>
          </defs>
          {vAxis > 0 ? <line x1={1215} y1={880} x2={1215} y2={880 - 800 * vAxis} stroke="#1A120A" strokeWidth={7} markerEnd={vAxis > 0.95 ? 'url(#qa-arrow)' : undefined} opacity={0.85} /> : null}
          {hAxis > 0 ? <line x1={640} y1={480} x2={640 + 1180 * hAxis} y2={480} stroke="#1A120A" strokeWidth={7} markerEnd={hAxis > 0.95 ? 'url(#qa-arrow)' : undefined} opacity={0.85} /> : null}
          {stringP > 0 ? (
            <path d="M1510 168 Q1560 400 1510 578" fill="none" stroke={RED} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - stringP} />
          ) : null}
        </svg>
        {vAxis > 0.9 ? <Abs style={{ left: 1240, top: 70, background: '#FBF8F1', padding: '4px 16px', fontFamily: FONT_ECON_SANS, fontWeight: 900, fontSize: 32, color: INK, transform: 'rotate(-2deg)', zIndex: 9 }}>資産 多</Abs> : null}
        {hAxis > 0.9 ? <Abs style={{ right: 70, top: 500, background: '#FBF8F1', padding: '4px 16px', fontFamily: FONT_ECON_SANS, fontWeight: 900, fontSize: 32, color: INK, transform: 'rotate(2deg)', zIndex: 9 }}>見せびらかし欲 →</Abs> : null}

        <QuadSlip c={c} at={89.95} x={930} y={290} title="貴族型" sub="資産 多 × 欲 少" rotate={-2} highlight={ramp(s, 91.68, 0.3)} visual={<PlainBag />} />
        <QuadSlip c={c} at={90.25} x={1510} y={290} title="成金型" sub="資産 多 × 欲 多" rotate={1.5} visual={logoVisual(100.5)} />
        <QuadSlip c={c} at={90.55} x={930} y={700} title="無関心型" sub="資産 少 × 欲 少" rotate={1.2} />
        <QuadSlip c={c} at={90.85} x={1510} y={700} title="背伸び型" sub="資産 少 × 欲 多" rotate={-1.6} highlight={ramp(s, 102.34, 0.3)} visual={logoVisual(100.5)} />
        <Stamp c={c} text="ロゴ小" at={92.8} size={46} rotate={-10} style={{ left: 980, top: 340 }} />
        <Stamp c={c} text="ロゴ大" at={100.6} size={46} rotate={-8} style={{ left: 1560, top: 340 }} />
        <Stamp c={c} text="ロゴ大" at={100.85} size={46} rotate={-8} style={{ left: 1560, top: 750 }} />
        <PhotoClip c={c} at={102.34} x={1800} y={560} w={180} h={120} src={img('luxury_boutique_broll_poster')} objectPosition="50% 35%" filter="blur(1px)" caption="上に見せたい" captionSize={24} rotate={4} />
      </CorkboardBackdrop>
    </FullBleed>
  );
};

/** 1:44 ヴェブレン：古い紙面＋上がる値札と欲しい度 */
const VeblenScene: React.FC<{ c: Ctx }> = ({ c }) => {
  const s = c.sec;
  const k = ramp(s, 109.08, 1.8);
  const eased = interpolate(k, [0, 1], [0, 1], { easing: (t) => t * t * (3 - 2 * t) });
  const price = 100000 + (1600000 - 100000) * eased;
  const meterVis = ramp(s, 108.6, 0.35);
  return (
    <FullBleed>
      <EditorialPaperBackdrop mastheadTitle="古典　有閑階級の理論" mastheadSubtitle="T. VEBLEN">
        <PhotoClip c={c} at={104.78} x={560} y={190} w={660} h={430} src={img('paris_champs_elysees')} filter="sepia(0.85) contrast(1.12) brightness(0.95)" caption="ヴェブレン『有閑階級の理論』" captionSize={36} rotate={-2.2} />
        <Stamp c={c} text="1899" at={106.34} size={78} rotate={-8} style={{ left: 330, top: 520 }} />
        <HangTag c={c} at={108.45} x={1250} y={180} price={yen(price)} label="値札" swing />
        {meterVis > 0 ? (
          <Abs style={{ left: 1560, top: 230, width: 120, height: 560, opacity: meterVis }}>
            <div style={{ fontFamily: FONT_ECON_SANS, fontWeight: 900, fontSize: 32, color: INK, textAlign: 'center', marginBottom: 10, whiteSpace: 'nowrap', marginLeft: -40, width: 200 }}>欲しい度</div>
            <div style={{ position: 'relative', margin: '0 auto', width: 70, height: 470, border: `5px solid ${INK}`, borderRadius: 35, background: '#FFF', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${(12 + 88 * eased).toFixed(1)}%`, background: `linear-gradient(0deg, ${RED}, #F87171)` }} />
            </div>
          </Abs>
        ) : null}
        <Stamp c={c} text="ヴェブレン財" at={111.0} size={60} rotate={-7} style={{ left: 1090, top: 640 }} />
      </EditorialPaperBackdrop>
    </FullBleed>
  );
};

/** 1:52 値上げの「ふるい」：1/8が落ち、残った客が「買える側」に */
const SIEVE_COLS = 12;
const SIEVE_ROWS = 4;
const FALL_SET = new Set([3, 8, 14, 22, 29, 41]); // 48人中6人 ≒ 4億人中5,000万人
const SieveScene: React.FC<{ c: Ctx }> = ({ c }) => {
  const s = c.sec;
  const shake = s >= 112.42 && s < 113.9 ? Math.sin((s - 112.42) * 38) * 10 * (1 - (s - 112.42) / 1.5) : 0;
  const keep = ramp(s, 114.74, 0.5);
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < SIEVE_ROWS; r++) {
    for (let col = 0; col < SIEVE_COLS; col++) {
      const i = r * SIEVE_COLS + col;
      const x0 = 560 + col * 72 + (r % 2) * 36;
      const y0 = 300 + r * 62;
      const falls = FALL_SET.has(i);
      let y = y0;
      let op = ramp(s, 112.3 + i * 0.012, 0.3);
      if (falls) {
        const tFall = s - (113.38 + (i % 5) * 0.08);
        if (tFall > 0) {
          y = y0 + 900 * tFall * tFall;
          op *= interpolate(y, [700, 900], [1, 0], CL);
        }
      }
      const fill = falls ? RED : keep > 0 ? `rgba(245,158,11,${0.35 + 0.65 * keep})` : '#475569';
      dots.push(
        <g key={i} opacity={op}>
          <circle cx={x0 + shake} cy={y - 18} r={13} fill={fill} />
          <path d={`M ${x0 + shake - 20} ${y + 22} Q ${x0 + shake} ${y - 6} ${x0 + shake + 20} ${y + 22} Z`} fill={fill} />
          {!falls && keep > 0 ? <circle cx={x0 + shake} cy={y - 18} r={17} fill="none" stroke="#B45309" strokeWidth={2} opacity={keep * 0.7} /> : null}
        </g>,
      );
    }
  }
  return (
    <FullBleed>
      <EditorialPaperBackdrop>
        <Abs style={{ top: 60, left: 96, display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ background: INK, color: '#FAF8F3', fontFamily: FONT_ECON_SANS, fontWeight: 900, fontSize: 30, padding: '3px 18px', letterSpacing: '0.16em' }}>仕組み</span>
          <span style={{ fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 42, color: INK }}>値上げのふるい</span>
        </Abs>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          {dots}
          <g transform={`translate(${shake} 0)`}>
            <rect x={500} y={560} width={920} height={26} fill="none" stroke={INK} strokeWidth={5} />
            {Array.from({ length: 23 }).map((_, i) => (
              <line key={i} x1={520 + i * 40} y1={560} x2={520 + i * 40} y2={586} stroke={INK} strokeWidth={3} />
            ))}
            <rect x={430} y={548} width={90} height={50} rx={8} fill={INK} />
            <rect x={1400} y={548} width={90} height={50} rx={8} fill={INK} />
            <text x={960} y={640} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={34} fill={INK}>値上げ</text>
          </g>
          <text x={1460} y={800} textAnchor="end" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={54} fill={RED} opacity={ramp(s, 113.7, 0.3)}>−5,000万人</text>
          <text x={560} y={240} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={44} fill="#B45309" opacity={keep}>残った客</text>
        </svg>
        <Stamp c={c} text="まだ買える側" at={116.5} size={64} rotate={-7} style={{ left: 1130, top: 170 }} />
      </EditorialPaperBackdrop>
    </FullBleed>
  );
};

/** 2:02 実写：行列（ミラー＋ぼかし）＋実質賃金の三行広告 */
const QueueScene: React.FC<{ c: Ctx }> = ({ c }) => (
  <FullBleed bg="#0A0C0F">
    <BrollLayer c={c} startSec={122.65} endSec={127.05} videoKey="luxury_boutique_broll" trimBeforeSec={2.4} blur={5} brightness={0.62} saturate={0.92} mirror zoom={[1.06, 1.12]} />
    <DarkVignette />
    <Abs style={{ top: 120, right: 110, zIndex: 20 }}>
      <EditorialCutoutCard startSec={122.65} enterOffsetSec={0.58} badge="実質賃金" headline="伸び悩み" highlightLine="それでも行列" stampText="行列" stampOffsetSec={3.24} width={600} rotateDeg={1.6} />
    </Abs>
  </FullBleed>
);

/** 2:07 SNSの開封動画：流れ続けるスマホ */
const Phone: React.FC<{ c: Ctx; at: number; x: number; y: number; scale: number; rotate: number; objectPosition: string }> = ({ c, at, x, y, scale, rotate, objectPosition }) => {
  if (c.sec < at) return null;
  const s = springAt(c, at, { stiffness: 300, damping: 22, mass: 0.7 });
  const t = c.sec - at;
  const prog = Math.min(1, t / 3.2);
  const hearts = [0.5, 1.1, 1.7, 2.3, 2.9].filter((h) => t > h);
  return (
    <div style={{ position: 'absolute', left: x - 200, top: y, width: 400, height: 760, transform: `translateY(${interpolate(s, [0, 1], [120, 0]).toFixed(1)}px) scale(${scale}) rotate(${rotate}deg)`, opacity: s, zIndex: Math.round(scale * 10) }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 54, background: '#111', border: '4px solid #3A3A3A', boxShadow: '0 30px 60px rgba(0,0,0,0.7)' }} />
      <div style={{ position: 'absolute', left: 18, right: 18, top: 18, bottom: 18, borderRadius: 40, overflow: 'hidden', background: '#000' }}>
        <Img src={img('luxury_handbag_display')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition, transform: `scale(${(1.1 + prog * 0.12).toFixed(3)})` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: '26px 24px', background: 'linear-gradient(180deg, rgba(0,0,0,0.6), transparent)', fontFamily: FONT_ECON_SANS, fontWeight: 900, fontSize: 30, color: '#FFF' }}>開封動画</div>
        <div style={{ position: 'absolute', left: '50%', top: '46%', width: 96, height: 96, marginLeft: -48, borderRadius: 48, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontSize: 46, opacity: interpolate(t, [0, 0.6], [1, 0], CL) }}>▶</div>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 30, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.35)' }}>
          <div style={{ width: `${(prog * 100).toFixed(1)}%`, height: '100%', borderRadius: 4, background: RED }} />
        </div>
        {hearts.map((h, i) => {
          const ht = t - h;
          return (
            <div key={i} style={{ position: 'absolute', right: 30 + (i % 2) * 22, bottom: 70 + ht * 160, fontSize: 44, color: '#FF4D6D', opacity: interpolate(ht, [0, 0.2, 1.4], [0, 1, 0], CL) }}>♥</div>
          );
        })}
      </div>
    </div>
  );
};

const SnsScene: React.FC<{ c: Ctx }> = ({ c }) => (
  <FullBleed bg="#0A0C0F">
    <BrollLayer c={c} startSec={127.05} endSec={130.65} imageKey="tokyo_commuter_crowd" blur={6} brightness={0.42} zoom={[1.08, 1.16]} />
    <DarkVignette strength={0.6} />
    <Phone c={c} at={128.0} x={560} y={170} scale={0.8} rotate={-6} objectPosition="78% 55%" />
    <Phone c={c} at={128.9} x={1360} y={170} scale={0.8} rotate={6} objectPosition="22% 40%" />
    <Phone c={c} at={127.12} x={960} y={90} scale={1} rotate={0} objectPosition="22% 55%" />
  </FullBleed>
);

/** 2:14 入口商品：「来月 値上げ」の噂 → バッグ✕ 財布◯ */
const ItemCard: React.FC<{ c: Ctx; at: number; x: number; label: string; children: React.ReactNode }> = ({ c, at, x, label, children }) => {
  if (c.sec < at) return null;
  const s = springAt(c, at, { stiffness: 380, damping: 22, mass: 0.6 });
  return (
    <div style={{ position: 'absolute', left: x - 160, top: 470, width: 320, transform: `translateY(${interpolate(s, [0, 1], [50, 0]).toFixed(1)}px)`, opacity: s }}>
      <div style={{ height: 230, background: '#FFFFFF', boxShadow: '0 14px 28px rgba(0,0,0,0.22)', overflow: 'hidden', border: '2px solid rgba(22,19,15,0.12)' }}>{children}</div>
      <div style={{ textAlign: 'center', fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 40, color: INK, marginTop: 14 }}>{label}</div>
    </div>
  );
};

const EntryItemsScene: React.FC<{ c: Ctx }> = ({ c }) => {
  const s = c.sec;
  const xP = ramp(s, 138.05, 0.35);
  const circleP = ramp(s, 139.17, 0.45);
  const xs = [360, 760, 1160, 1560];
  return (
    <FullBleed>
      <EditorialPaperBackdrop>
        <Stamp c={c} text="来月 値上げ" at={135.17} size={104} rotate={-5} style={{ left: 560, top: 120 }} />
        <Abs style={{ left: 1300, top: 160, fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 62, color: '#57534E', transform: 'rotate(8deg)', opacity: ramp(s, 136.69, 0.3) }}>（噂）</Abs>
        <ItemCard c={c} at={137.3} x={xs[0]} label="バッグ">
          <Img src={img('luxury_handbag_display')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '21% 55%' }} />
        </ItemCard>
        <ItemCard c={c} at={137.45} x={xs[1]} label="財布">
          <WalletIcon />
        </ItemCard>
        <ItemCard c={c} at={137.6} x={xs[2]} label="キーケース">
          <KeyCaseIcon />
        </ItemCard>
        <ItemCard c={c} at={137.75} x={xs[3]} label="香水">
          <PerfumeIcon />
        </ItemCard>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
          {xP > 0 ? (
            <g stroke={RED} strokeWidth={14} strokeLinecap="round">
              <line x1={240} y1={480} x2={240 + 240 * Math.min(1, xP * 2)} y2={480 + 220 * Math.min(1, xP * 2)} />
              {xP > 0.5 ? <line x1={480} y1={480} x2={480 - 240 * (xP - 0.5) * 2} y2={480 + 220 * (xP - 0.5) * 2} /> : null}
            </g>
          ) : null}
          <MarkerEllipse p={circleP} cx={760} cy={620} rx={210} ry={190} width={8} />
        </svg>
        <Stamp c={c} text="購入" at={140.53} size={64} rotate={-10} style={{ left: 820, top: 610 }} />
      </EditorialPaperBackdrop>
    </FullBleed>
  );
};

/** 2:21 ホワイトボード：45%リプライズ → 憧れのピラミッド */
const PyramidScene: React.FC<{ c: Ctx }> = ({ c }) => {
  const s = c.sec;
  const swap = ramp(s, 145.9, 0.4);
  const tri = ramp(s, 146.1, 0.8);
  const top = ramp(s, 146.7, 0.4);
  const baseFill = ramp(s, 150.08, 0.7);
  const arrows = ramp(s, 149.4, 0.6);
  const apexY = 150;
  const baseY = 720;
  const tipY = apexY + (baseY - apexY) * Math.sqrt(0.02 * 6); // 視認性のため上部を強調（概念図）
  const halfW = 600;
  const wAt = (y: number) => ((y - apexY) / (baseY - apexY)) * halfW;
  return (
    <FullBleed>
      <Whiteboard>
        {swap < 1 ? <MarketBoard c={c} t0={141.84} reprise fadeOut={swap} /> : null}
        {swap > 0 ? (
          <svg viewBox="0 0 1600 780" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: swap }} preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="pyr-dots" width="22" height="22" patternUnits="userSpaceOnUse">
                <circle cx="11" cy="11" r="4.2" fill="#B91C1C" opacity="0.55" />
              </pattern>
              <clipPath id="pyr-base-clip">
                <rect x={0} y={baseY - (baseY - tipY) * baseFill} width={1600} height={(baseY - tipY) * baseFill} />
              </clipPath>
            </defs>
            <polygon points={`800,${tipY} ${800 - wAt(tipY)},${tipY} ${800 - halfW},${baseY} ${800 + halfW},${baseY} ${800 + wAt(tipY)},${tipY}`} fill="#FCE4E4" clipPath="url(#pyr-base-clip)" />
            <polygon points={`800,${tipY} ${800 - wAt(tipY)},${tipY} ${800 - halfW},${baseY} ${800 + halfW},${baseY} ${800 + wAt(tipY)},${tipY}`} fill="url(#pyr-dots)" clipPath="url(#pyr-base-clip)" />
            <polygon points={`800,${apexY} ${800 - wAt(tipY)},${tipY} ${800 + wAt(tipY)},${tipY}`} fill={GREEN} opacity={top} />
            <polygon points={`800,${apexY} ${800 - halfW},${baseY} ${800 + halfW},${baseY}`} fill="none" stroke="#1E293B" strokeWidth={6} strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - tri} />
            <line x1={800 - wAt(tipY)} y1={tipY} x2={800 + wAt(tipY)} y2={tipY} stroke="#1E293B" strokeWidth={4} opacity={top} />
            <text x={800 + wAt(tipY) + 40} y={tipY - 10} fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={44} fill={GREEN} opacity={top}>大富豪 2%</text>
            <text x={800} y={590} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={60} fill={RED} opacity={ramp(s, 150.3, 0.35)}>何億人の財布</text>
            {arrows > 0
              ? [-260, 0, 260].map((dx, i) => (
                  <g key={i}>
                    <path d={`M ${800 + dx} 660 Q ${800 + dx * 0.6} 450 800 ${tipY + 40}`} fill="none" stroke={BLUE} strokeWidth={5} strokeDasharray="14 10" opacity={arrows} />
                  </g>
                ))
              : null}
            <text x={1100} y={420} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={40} fill={BLUE} opacity={ramp(s, 149.6, 0.3)}>憧れ</text>
          </svg>
        ) : null}
      </Whiteboard>
      <HangTag c={c} at={148.6} x={960} y={30} price="¥1,600,000" scale={0.62} stringLen={60} />
    </FullBleed>
  );
};

/** 2:32 オープンループ①：5,000万人が消えても崩れない値札 */
const OpenLoopTagScene: React.FC<{ c: Ctx }> = ({ c }) => {
  const s = c.sec;
  const people: React.ReactNode[] = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const x = 380 + (i % 20) * 60;
    const y = 690 + Math.floor(i / 20) * 70;
    const falls = i % 8 === 3;
    const t = s - (153.6 + (i % 5) * 0.07);
    const dy = falls && t > 0 ? 500 * t * t : 0;
    const op = (falls && t > 0 ? interpolate(dy, [0, 160], [1, 0], CL) : 1) * ramp(s, 152.8 + i * 0.008, 0.3);
    people.push(
      <g key={i} opacity={op}>
        <circle cx={x} cy={y - 14 + dy} r={10} fill={falls && t > 0 ? RED : '#94A3B8'} />
        <path d={`M ${x - 15} ${y + 18 + dy} Q ${x} ${y - 4 + dy} ${x + 15} ${y + 18 + dy} Z`} fill={falls && t > 0 ? RED : '#94A3B8'} />
      </g>,
    );
  }
  return (
    <FullBleed bg="#0A0C0F">
      <Abs style={{ inset: 0, background: 'radial-gradient(ellipse 38% 60% at 50% 30%, rgba(255,226,170,0.20) 0%, rgba(10,12,15,0) 70%)' }} />
      <HangTag c={c} at={152.85} x={960} y={60} label="定価" price="¥1,600,000" glow={ramp(s, 155.04, 0.5)} />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {people}
        <text x={1560} y={660} textAnchor="end" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={48} fill="#F87171" opacity={ramp(s, 154.0, 0.3)}>−5,000万人</text>
      </svg>
      <Stamp c={c} text="決め方は？" at={156.32} size={76} rotate={-8} style={{ left: 1240, top: 300 }} />
    </FullBleed>
  );
};

/** 2:37 オープンループ②：次に狙われる財布 */
const OpenLoopWalletScene: React.FC<{ c: Ctx }> = ({ c }) => {
  const s = c.sec;
  const xs = [360, 660, 960, 1260, 1560];
  const target = 3;
  const sweep = interpolate(s, [157.9, 159.0, 159.76], [200, 1500, xs[target]], { ...CL, easing: (t) => 1 - (1 - t) * (1 - t) });
  const locked = s >= 159.76;
  const lockS = springAt(c, 159.76, { stiffness: 480, damping: 20, mass: 0.55 });
  return (
    <FullBleed bg="#07090C">
      <Abs style={{ inset: 0, background: `radial-gradient(circle 240px at ${sweep}px 520px, rgba(255,240,200,0.30) 0%, rgba(7,9,12,0) 100%)` }} />
      {xs.map((x, i) => (
        <Abs key={i} style={{ left: x - 120, top: 420, width: 240, height: 180, opacity: (locked && i !== target ? 0.25 : 0.55 + (Math.abs(sweep - x) < 140 ? 0.4 : 0)) * ramp(s, 157.82 + i * 0.06, 0.3) }}>
          <WalletIcon color={i === target && locked ? '#8B5A33' : '#5E4632'} />
        </Abs>
      ))}
      {locked ? (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <g transform={`translate(${xs[target]} 510) scale(${interpolate(lockS, [0, 1], [1.8, 1]).toFixed(3)})`} opacity={lockS}>
            <circle r={150} fill="none" stroke={RED} strokeWidth={6} />
            <circle r={110} fill="none" stroke={RED} strokeWidth={2} strokeDasharray="10 8" />
            <line x1={-190} y1={0} x2={-120} y2={0} stroke={RED} strokeWidth={6} />
            <line x1={120} y1={0} x2={190} y2={0} stroke={RED} strokeWidth={6} />
            <line x1={0} y1={-190} x2={0} y2={-120} stroke={RED} strokeWidth={6} />
            <line x1={0} y1={120} x2={0} y2={190} stroke={RED} strokeWidth={6} />
          </g>
          <text x={xs[target]} y={300} textAnchor="middle" fontFamily={FONT_ECON_SERIF} fontWeight={900} fontSize={120} fill="#FFFFFF" opacity={ramp(s, 159.9, 0.3)}>？</text>
        </svg>
      ) : (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <circle cx={sweep} cy={510} r={150} fill="none" stroke="rgba(248,113,113,0.6)" strokeWidth={3} strokeDasharray="12 10" opacity={ramp(s, 157.85, 0.3)} />
        </svg>
      )}
      <Abs style={{ left: 120, top: 120, fontFamily: FONT_ECON_MONO, fontWeight: 900, fontSize: 30, letterSpacing: '0.2em', color: '#F87171', opacity: ramp(s, 158.1, 0.3) }}>NEXT TARGET</Abs>
    </FullBleed>
  );
};

// ---------------------------------------------------------------------------
// シーン配列（BASE_TIMELINE のショット境界・字幕・master SFX 時刻に同期）
// ---------------------------------------------------------------------------
const cues = (startSec: number, list: [string, number, number?][]): PlanESfxCue[] =>
  list.map(([kind, at, gain]) => ({ kind, offsetSec: +(at - startSec).toFixed(3), gain: gain ?? 0.22 }));

const custom = (
  id: string,
  startSec: number,
  endSec: number,
  backdropMode: 'editorial_paper' | 'whiteboard' | 'corkboard' | 'crisis_dark',
  render: (c: Ctx) => React.ReactNode,
  sfx: [string, number, number?][] = [],
  extra: Partial<{ glitchIntroSec: number }> = {},
): PlanESceneSpec => ({ id, startSec, endSec, type: 'custom', backdropMode, sfxCues: cues(startSec, sfx), render, ...extra });

const scenes: PlanESceneSpec[] = [
  // 暗 0.00–9.30（9.3s）
  custom('フック値札', 0, 6.46, 'crisis_dark', (c) => <HookScene c={c} />, [
    ['whoosh', 3.85, 0.16],
    ['stamp_thud', 5.27, 0.24],
  ]),
  { id: 'VHS静止', startSec: 6.46, endSec: 9.3, type: 'vhs_pause_avatar', frozenImageKey: 'luxury_handbag_display', timecodeLabel: '00:00:06', avatarEmblem: '富' },
  // 紙 9.30–20.33
  custom('号外_買い手', 9.3, 20.33, 'editorial_paper', (c) => <BuyersScene c={c} />, [
    ['paper_snap', 9.45],
    ['paper_snap', 11.85],
    ['pen_scratch', 13.06],
    ['paper_snap', 17.45],
    ['stamp_thud', 18.3, 0.24],
  ], { glitchIntroSec: 0.24 }),
  // 板 20.33–36.40
  custom('市場ボード', 20.33, 36.4, 'whiteboard', (c) => (
    <FullBleed>
      <Whiteboard>
        <MarketBoard c={c} t0={20.33} />
      </Whiteboard>
    </FullBleed>
  ), [
    ['pen_scratch', 24.4, 0.2],
    ['pen_scratch', 26.0, 0.2],
    ['pen_scratch', 28.3, 0.2],
    ['soft_pop', 29.55],
    ['pen_scratch', 33.25, 0.2],
    ['soft_pop', 34.8],
  ]),
  // 暗 36.40–44.16（7.8s）
  custom('背伸び層Bロール', 36.4, 40.84, 'crisis_dark', (c) => (
    <FullBleed bg="#0A0C0F">
      <BrollLayer c={c} startSec={36.4} endSec={40.84} videoKey="luxury_boutique_broll" blur={5} brightness={0.66} saturate={0.9} />
      <DarkVignette />
      <Abs style={{ top: 150, right: 110, zIndex: 20 }}>
        <EditorialCutoutCard startSec={36.4} enterOffsetSec={1.7} badge="背伸び層" headline="売上の55%" width={620} rotateDeg={-1.6} />
      </Abs>
    </FullBleed>
  ), [['paper_snap', 38.1]]),
  {
    id: '代金の行き先', startSec: 40.84, endSec: 44.16, type: 'video_broll', videoKey: 'counting_cash_broll', motion: 'slow_zoom_in', grade: 'warm_night',
    overlayCutout: { badge: '背伸びの代金', headline: '行き先は？', stampText: 'LVMH', enterOffsetSec: 0.2, stampOffsetSec: 2.8, width: 620 },
  },
  // 紙 44.16–57.04
  custom('決算と100円玉', 44.16, 57.04, 'editorial_paper', (c) => <MarginScene c={c} />, [
    ['paper_snap', 44.2],
    ['stamp_thud', 49.0, 0.25],
    ['soft_pop', 51.65],
    ['price_ping', 52.92, 0.2],
    ['soft_pop', 54.5],
    ['pen_scratch', 55.56, 0.2],
  ]),
  // 板 57.04–61.92
  {
    id: '定価推移', startSec: 57.04, endSec: 61.92, type: 'whiteboard_trend', title: '定番バッグの米国定価', subtitle: '2019年 → 2024年・ドル',
    xLabels: ['2019年', '2024年'], yMin: 4000, yMax: 12000, yTicks: [4000, 6000, 8000, 10000, 12000],
    series: [
      { id: 'base', label: '2019年水準', badgeText: '$5,800', color: '#64748B', dashed: '10 8', strokeWidth: 3.5, values: [5800, 5800] },
      { id: 'flap', label: '定番バッグ', badgeText: '$10,800', color: RED, values: [5800, 10800], isHighlight: true },
    ],
    highlightOffsetSec: 2.8, circleLastHighlight: true, gapBadgeText: '+$5,000', stampText: '約2倍', avatarEmblem: '$',
    sfxCues: cues(57.04, [
      ['whoosh', 57.06, 0.16],
      ['pen_scratch', 59.85, 0.2],
    ]),
  },
  // 暗 61.92–64.87（3.0s）
  custom('国内値札', 61.92, 64.87, 'crisis_dark', (c) => <DomesticTagScene c={c} />, [['price_ping', 62.62, 0.2]]),
  // 紙 64.87–82.18
  custom('因果ギア', 64.87, 82.18, 'editorial_paper', (c) => <DropoutScene c={c} />, [
    ['impact_thud', 74.03, 0.24],
    ['stamp_thud', 78.3, 0.25],
    ['price_ping', 80.95, 0.22],
    ['impact_thud', 81.0, 0.18],
  ]),
  // コルク 82.18–104.58
  custom('4象限ボード', 82.18, 104.58, 'corkboard', (c) => <QuadrantScene c={c} />, [
    ['pen_scratch', 87.8, 0.2],
    ['soft_pop', 89.95, 0.18],
    ['soft_pop', 90.25, 0.18],
    ['soft_pop', 90.55, 0.18],
    ['soft_pop', 90.85, 0.18],
    ['stamp_thud', 92.8, 0.24],
    ['soft_pop', 95.7],
    ['pen_scratch', 97.5, 0.2],
    ['stamp_thud', 100.6, 0.24],
    ['pen_scratch', 101.0, 0.18],
    ['camera_shutter', 102.34, 0.2],
  ]),
  // 紙 104.58–119.73
  custom('ヴェブレン', 104.58, 112.3, 'editorial_paper', (c) => <VeblenScene c={c} />, [
    ['stamp_thud', 106.34, 0.24],
    ['soft_pop', 108.45],
    ['stamp_thud', 111.0, 0.25],
  ]),
  custom('値上げのふるい', 112.3, 119.73, 'editorial_paper', (c) => <SieveScene c={c} />, [
    ['mech_slide', 112.42, 0.2],
    ['whoosh', 113.4, 0.16],
    ['soft_pop', 114.74],
    ['stamp_thud', 116.5, 0.25],
  ]),
  // 暗 119.73–130.65（10.9s）
  {
    id: '暗室地図_日本', startSec: 119.73, endSec: 122.65, type: 'projector_target_map', targetLabel: '日本', targetCountryId: 'jp', nextChapterLabel: '', avatarEmblem: '円',
    sfxCues: cues(119.73, [
      ['projector_click', 119.8, 0.22],
      ['radar_beep', 120.9, 0.2],
    ]),
  },
  custom('行列', 122.65, 127.05, 'crisis_dark', (c) => <QueueScene c={c} />, [['stamp_thud', 125.89, 0.24]]),
  custom('開封動画', 127.05, 130.65, 'crisis_dark', (c) => <SnsScene c={c} />, [
    ['camera_shutter', 127.12, 0.2],
    ['soft_pop', 128.0],
    ['soft_pop', 128.9],
  ]),
  // 紙 130.65–141.84
  {
    id: '売り文句チラシ', startSec: 130.65, endSec: 134.57, type: 'editorial_cutout', backdrop: 'paper', mastheadTitle: '広告チラシの言葉', mastheadSubtitle: 'JAPAN',
    cards: [
      { badge: '広告', headline: '一生モノ', enterOffsetSec: 0.3 },
      { badge: '広告', headline: '資産価値', enterOffsetSec: 1.16 },
      { badge: '広告', headline: '自分への\nご褒美', enterOffsetSec: 2.84, stampText: '売り文句', stampOffsetSec: 3.2 },
    ],
    sfxCues: cues(130.65, [
      ['paper_snap', 131.81],
      ['paper_snap', 133.49],
    ]),
  },
  custom('入口商品', 134.57, 141.84, 'editorial_paper', (c) => <EntryItemsScene c={c} />, [
    ['stamp_thud', 135.17, 0.26],
    ['pen_scratch', 136.69, 0.18],
    ['camera_shutter', 137.3, 0.2],
    ['pen_scratch', 138.05, 0.22],
    ['soft_pop', 139.17],
    ['stamp_thud', 140.53, 0.24],
  ]),
  // 板 141.84–152.76
  custom('憧れのピラミッド', 141.84, 152.76, 'whiteboard', (c) => <PyramidScene c={c} />, [
    ['pen_scratch', 144.24, 0.2],
    ['pen_scratch', 146.1, 0.2],
    ['soft_pop', 146.7],
    ['whoosh', 149.4, 0.14],
    ['soft_pop', 150.08],
  ]),
  // 暗 152.76–161.48（8.7s）
  custom('崩れない値札', 152.76, 157.8, 'crisis_dark', (c) => <OpenLoopTagScene c={c} />, [
    ['price_ping', 152.95, 0.2],
    ['whoosh', 153.6, 0.14],
    ['stamp_thud', 156.32, 0.25],
  ]),
  custom('次の標的', 157.8, 161.5, 'crisis_dark', (c) => <OpenLoopWalletScene c={c} />, [
    ['radar_beep', 158.3, 0.18],
    ['radar_beep', 159.0, 0.18],
    ['impact_thud', 159.76, 0.26],
  ]),
];

const spec: PlanEProjectSpec = {
  ...base,
  id: 'luxury-trap-opus',
  themeTitle: base.title,
  scenes,
  autoSceneSfx: false,
  showTickerBar: false,
  showLegacyCitation: false,
};

export const AB_LUXURY_TRAP_V2_SPEC = spec;

export const ABLuxuryTrapV2OpusHigh: React.FC = () => <PlanEMacroEconTemplateV2 spec={spec} />;
