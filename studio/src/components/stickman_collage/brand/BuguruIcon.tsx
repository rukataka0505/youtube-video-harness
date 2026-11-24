import React, { useId } from 'react';
import { BoilFilterDef } from '../../_materials';
import { f2, sanitizeSvgId } from '../motionMath';
import { rig } from '../RiggedStickman';
import {
  BUGURU_PALETTE,
  BuguruCharacter,
  BuguruGlowFilter,
  BuguruPaperFilter,
  ColorSplit,
  GlitchBlocks,
  SvgSlices,
  TwitchMarks,
  buguruPoseAtHead,
  type BuguruVariant,
  type GlitchBand,
} from './buguruCore';

/* ========================================================================== */
/* 「バグる棒人間」チャンネルアイコン（1024×1024・円形トリミング前提）           */
/*  案A glow  : 暗盤バグ発光（黒スタジオ光柱＋RGBずれ＋スライス＋破損ピクセル）   */
/*  案B sketch: 明盤スケッチ（白スケッチ紙＋鉛筆下描き＋赤青版ズレ＋紙片ずれ）★正式採用 */
/*  主要要素は中心半径 ~420px（円の内側 82%）に収め、48px 表示でも               */
/*  「大きな頭の輪＋×目＋両手上げ＋横ずれ」のシルエットが残るよう太線で構成する。 */
/* ========================================================================== */

export const BUGURU_ICON_SIZE = 1024;

export interface BuguruIconProps {
  variant: BuguruVariant;
  /** 円形トリミングのガイド表示（確認用） */
  showCircleGuide?: boolean;
}

const HEAD_X = 500;
const HEAD_Y = 392;
const ICON_S = 5.5;

/** 案A：暗盤バグ発光 */
const IconGlow: React.FC<{ uid: string }> = ({ uid }) => {
  const pal = BUGURU_PALETTE.glow;
  const pose = buguruPoseAtHead(HEAD_X, HEAD_Y, ICON_S);
  const r = rig(pose);
  const glowId = `bi-glow-${uid}`;
  const bugGlowId = `bi-bugglow-${uid}`;
  const boilId = `bi-boil-${uid}`;
  const fadeId = `bi-fade-${uid}`;
  const fadeMaskId = `bi-fadem-${uid}`;

  // 頭頂・顎下・腕・胴の4本スライス（目と口の行は避けて表情を守る）
  const bands: GlitchBand[] = [
    { y0: 236, y1: 286, dx: 46 },
    { y0: 486, y1: 520, dx: -40 },
    { y0: 640, y1: 676, dx: 30 },
    { y0: 812, y1: 840, dx: -24 },
  ];

  const figure = (
    <ColorSplit
      palette={pal}
      dx={13}
      dy={2}
      opacity={0.92}
      render={(ink, ghost) => (
        <BuguruCharacter
          pose={pose}
          palette={pal}
          ink={ink}
          ghost={ghost}
          bugFilter={`url(#${bugGlowId})`}
          width={9.4}
        />
      )}
    />
  );

  return (
    <>
      <defs>
        <radialGradient id={`bi-bg-${uid}`} cx="50%" cy="40%" r="72%">
          <stop offset="0%" stopColor="#1B1C21" />
          <stop offset="48%" stopColor="#0A0A0C" />
          <stop offset="100%" stopColor="#020202" />
        </radialGradient>
        <linearGradient id={`bi-beam-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255, 238, 205, 0.20)" />
          <stop offset="70%" stopColor="rgba(255, 238, 205, 0.05)" />
          <stop offset="100%" stopColor="rgba(255, 238, 205, 0)" />
        </linearGradient>
        <radialGradient id={`bi-halo-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(34, 228, 255, 0.20)" />
          <stop offset="55%" stopColor="rgba(34, 228, 255, 0.06)" />
          <stop offset="100%" stopColor="rgba(34, 228, 255, 0)" />
        </radialGradient>
        <radialGradient id={`bi-vig-${uid}`} cx="50%" cy="48%" r="62%">
          <stop offset="62%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.72)" />
        </radialGradient>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.72" stopColor="#fff" stopOpacity={1} />
          <stop offset="1" stopColor="#fff" stopOpacity={0.35} />
        </linearGradient>
        <mask id={fadeMaskId} maskUnits="userSpaceOnUse" x={0} y={0} width={1024} height={1024}>
          <rect x={-200} y={0} width={1424} height={1024} fill={`url(#${fadeId})`} />
        </mask>
        <pattern id={`bi-scan-${uid}`} width={8} height={8} patternUnits="userSpaceOnUse">
          <rect x={0} y={0} width={8} height={2} fill="rgba(255,255,255,0.045)" />
        </pattern>
        <BuguruGlowFilter id={glowId} std={8} strength={0.95} />
        <BuguruGlowFilter id={bugGlowId} std={6} strength={1.4} />
        <BoilFilterDef id={boilId} seed={5} scale={3.2} freq={0.018} octaves={2} />
      </defs>

      <rect x={0} y={0} width={1024} height={1024} fill={`url(#bi-bg-${uid})`} />
      {/* 黒スタジオの光柱（背景カタログ black と同じ世界観） */}
      <path
        d={`M ${HEAD_X - 120} -20 L ${HEAD_X + 120} -20 L ${HEAD_X + 400} 1044 L ${HEAD_X - 400} 1044 Z`}
        fill={`url(#bi-beam-${uid})`}
      />
      <circle cx={r.head.x} cy={r.head.y + 40} r={360} fill={`url(#bi-halo-${uid})`} />

      {/* 背面の破損ピクセル（スライス帯に沿って散らす） */}
      <GlitchBlocks
        seed={3}
        count={7}
        x0={640}
        y0={236}
        x1={860}
        y1={286}
        colors={[pal.splitA, pal.splitB, 'rgba(243,239,230,0.85)']}
        minSize={10}
        maxSize={36}
        opacity={0.85}
      />
      <GlitchBlocks
        seed={11}
        count={6}
        x0={150}
        y0={486}
        x1={360}
        y1={520}
        colors={[pal.splitA, pal.splitB, 'rgba(243,239,230,0.85)']}
        minSize={10}
        maxSize={32}
        opacity={0.8}
      />

      <g mask={`url(#${fadeMaskId})`}>
        <g filter={`url(#${glowId})`}>
          <g filter={`url(#${boilId})`}>
            <SvgSlices bands={bands}>{figure}</SvgSlices>
          </g>
        </g>
      </g>

      {/* ピクッ線（バグ発生の合図） */}
      <g filter={`url(#${bugGlowId})`}>
        <TwitchMarks pose={pose} color={pal.bug} width={5.2} />
      </g>

      {/* スライス境界のシアン／マゼンタ走査線 */}
      <g style={{ mixBlendMode: 'screen' }} opacity={0.9}>
        <rect x={HEAD_X - 250} y={236} width={520} height={4} fill={pal.splitA} />
        <rect x={HEAD_X - 300} y={518} width={380} height={4} fill={pal.splitB} />
        <rect x={HEAD_X - 40} y={674} width={360} height={3} fill={pal.splitA} />
      </g>

      <rect x={0} y={0} width={1024} height={1024} fill={`url(#bi-scan-${uid})`} />
      <rect x={0} y={0} width={1024} height={1024} fill={`url(#bi-vig-${uid})`} />
    </>
  );
};

/**
 * 案B（正式採用）の本番レイアウト。円形トリミング実機確認により
 * 「両手の外接中心を円の中心へ寄せる（+28px）」「48/36px 表示で顔が潰れないよう頭を約5%拡大」
 * の最小調整を入れた。紙片ずれ帯は頭中心からの相対オフセット（S=5.5 基準）で定義する。
 */
const SK_HEAD_X = 528;
const SK_HEAD_Y = 404;
const SK_S = 5.8;
const SK_BAND_OFFSETS: readonly GlitchBand[] = [
  { y0: -148, y1: -102, dx: 40 },
  { y0: 96, y1: 140, dx: -44 },
  { y0: 324, y1: 360, dx: 26 },
];

/** 案B：明盤スケッチ（正式採用） */
const IconSketch: React.FC<{ uid: string }> = ({ uid }) => {
  const pal = BUGURU_PALETTE.sketch;
  const pose = buguruPoseAtHead(SK_HEAD_X, SK_HEAD_Y, SK_S);
  const r = rig(pose);
  const R = 30 * SK_S;
  const k = SK_S / 5.5;
  const paperId = `bi-paper-${uid}`;
  const boilId = `bi-sboil-${uid}`;
  const boil2Id = `bi-sboil2-${uid}`;
  const shadowId = `bi-shadow-${uid}`;

  // 紙片ずれ（切り抜いた紙帯が横にずれている）
  const bands: GlitchBand[] = SK_BAND_OFFSETS.map((b) => ({
    y0: SK_HEAD_Y + b.y0 * k,
    y1: SK_HEAD_Y + b.y1 * k,
    dx: b.dx * k,
  }));

  const paper = (
    <rect x={-120} y={-40} width={1264} height={1104} fill={pal.bg} filter={`url(#${paperId})`} />
  );

  const construction = (
    <g
      fill="none"
      stroke={pal.graphite}
      strokeWidth={4}
      strokeLinecap="round"
      filter={`url(#${boil2Id})`}
    >
      <ellipse cx={r.head.x + 10} cy={r.head.y - 6} rx={R + 22} ry={R + 12} />
      <path d={`M ${r.head.x - R - 40} ${r.head.y - 2} Q ${r.head.x} ${r.head.y + 18} ${r.head.x + R + 46} ${r.head.y - 8}`} />
      <path d={`M ${r.head.x + 4} ${r.head.y - R - 44} Q ${r.head.x + 26} ${r.head.y} ${r.head.x + 30} ${r.head.y + R + 30}`} />
      <path d={`M ${r.sh.x - 230} ${r.sh.y + 6} L ${r.sh.x + 236} ${r.sh.y - 4}`} />
      <circle cx={r.lE.x} cy={r.lE.y} r={18} />
      <circle cx={r.rE.x} cy={r.rE.y} r={18} />
    </g>
  );

  const figure = (
    <ColorSplit
      palette={pal}
      dx={14}
      dy={7}
      opacity={0.78}
      render={(ink, ghost) => (
        <BuguruCharacter pose={pose} palette={pal} ink={ink} ghost={ghost} width={9.4} />
      )}
    />
  );

  const sheet = (
    <g>
      {paper}
      {construction}
      <g filter={`url(#${boilId})`}>{figure}</g>
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
        <radialGradient id={`bi-sun-${uid}`} cx="22%" cy="12%" r="70%">
          <stop offset="0%" stopColor="rgba(255, 226, 160, 0.30)" />
          <stop offset="60%" stopColor="rgba(255, 226, 160, 0.05)" />
          <stop offset="100%" stopColor="rgba(255, 226, 160, 0)" />
        </radialGradient>
        <radialGradient id={`bi-svig-${uid}`} cx="50%" cy="48%" r="64%">
          <stop offset="66%" stopColor="rgba(120, 88, 48, 0)" />
          <stop offset="100%" stopColor="rgba(120, 88, 48, 0.20)" />
        </radialGradient>
      </defs>

      {/* 下地（ずれた紙帯の下から覗く少し暗い台紙） */}
      <rect x={0} y={0} width={1024} height={1024} fill="#E9E0CC" />
      {sheet}
      {/* ずれた紙帯：影付きで上に重ねる */}
      {bands.map((b, i) => (
        <g key={i} filter={`url(#${shadowId})`}>
          <SvgSlices bands={[b]} onlyBands>
            {sheet}
          </SvgSlices>
        </g>
      ))}
      {/* 紙帯の切り口（鉛筆の切り取り線） */}
      <g stroke="rgba(28, 25, 23, 0.55)" strokeWidth={2.5} strokeDasharray="10 9" fill="none">
        {bands.map((b, i) => (
          <path key={i} d={`M -20 ${b.y0} L 1044 ${b.y0}`} transform={`translate(${f2(b.dx)} 0)`} />
        ))}
      </g>

      {/* ピクッ線（赤マーカー） */}
      <g filter={`url(#${boilId})`}>
        <TwitchMarks pose={pose} color={pal.bug} width={5.2} />
      </g>

      <rect x={0} y={0} width={1024} height={1024} fill={`url(#bi-sun-${uid})`} />
      <rect x={0} y={0} width={1024} height={1024} fill={`url(#bi-svig-${uid})`} />
    </>
  );
};

/** 「バグる棒人間」チャンネルアイコン（SVG・1024 viewBox）。親要素サイズへフィット */
export const BuguruIcon: React.FC<BuguruIconProps> = ({ variant, showCircleGuide = false }) => {
  const uid = sanitizeSvgId(useId());
  return (
    <svg
      viewBox={`0 0 ${BUGURU_ICON_SIZE} ${BUGURU_ICON_SIZE}`}
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      {variant === 'glow' ? <IconGlow uid={uid} /> : <IconSketch uid={uid} />}
      {showCircleGuide ? (
        <g fill="none" strokeWidth={4} strokeDasharray="14 10">
          <circle cx={512} cy={512} r={510} stroke="rgba(255,0,128,0.8)" />
          <circle cx={512} cy={512} r={420} stroke="rgba(0,200,255,0.8)" />
        </g>
      ) : null}
    </svg>
  );
};
