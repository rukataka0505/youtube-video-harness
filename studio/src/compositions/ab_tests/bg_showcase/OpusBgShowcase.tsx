import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  CollageSubtitle,
  FONT_MARU,
  STICKMAN_CONTENT_BOTTOM,
  useStickmanCollageFonts,
} from '../../../components/stickman_collage';
import {
  FloorShadow,
  InkLayer,
  PropBars,
  PropBooks,
  PropBulb,
  PropGears,
  PropHeart,
  PropMagnifier,
  PropPlant,
  PropStar,
  StickBody,
  actAt,
  type ActSpec,
  type ActorInk,
  type PropProps,
} from './actor';
import { BgDraftingGrid, BgStudioBlackRich, BgWarmWhiteSketch, BgWoodDesk, type BgProps } from './backgroundsA';
import { BgKraftCork, BgLightTable, BgMidnightBlueprint, BgRuledNotebook } from './backgroundsB';
import { H, W, stepSec } from './kit';

/**
 * Opus 5.5「生きた背景ショーケース」— stickman-collage 背景バリエーション比較用。
 * 8背景 × 各5秒（150f）＝ 1200f / 1920x1080 / 30fps。
 * 各背景に「関節リグ棒人間の芝居＋手描き小道具1つ＋下段テスト字幕」を載せ、
 * 主役と字幕が乗った状態での映え・視認性を一目で比較できるようにする。
 * Composition 登録（Root.tsx）は親が行う。
 */

export const OPUS_BG_SHOWCASE_FRAMES = 1200;
const SEG = 150;

interface Segment {
  id: string;
  name: string;
  Bg: React.FC<BgProps>;
  ink: ActorInk;
  act: ActSpec;
  Prop: React.FC<PropProps>;
  propX: number;
  sub: string;
  /** 字幕の明暗（true = 黒字＋白縁） */
  lightSub: boolean;
  /** 札の配色 */
  tag: 'paper' | 'dark';
  /** 前後コマのオニオンスキン（透写台） */
  onion?: boolean;
}

const LIGHT_INK = {
  line: '#1C1917',
  muted: '#57534E',
  shadow: 'rgba(60, 48, 32, 0.16)',
};

const SEGMENTS: Segment[] = [
  {
    id: '01_studio_black_rich',
    name: '黒スタジオ・リッチ',
    Bg: BgStudioBlackRich,
    ink: {
      line: '#F3EFE6',
      headFill: '#0E0D0B',
      accent: '#FFCC00',
      accent2: '#3DA5FF',
      muted: '#B8B2A6',
      shadow: 'rgba(0, 0, 0, 0.6)',
      glow: '#FFF2D6',
    },
    act: { kind: 'walk_point', dir: 1, standX: 740 },
    Prop: PropBulb,
    propX: 1190,
    sub: '黒い舞台は、主役の線がいちばん光る',
    lightSub: false,
    tag: 'dark',
  },
  {
    id: '02_warm_white_sketch',
    name: '白スケッチブック',
    Bg: BgWarmWhiteSketch,
    ink: { ...LIGHT_INK, headFill: '#FFFCF4', accent: '#E8794A', accent2: '#7BB661' },
    act: { kind: 'walk_point', dir: -1, standX: 1160 },
    Prop: PropPlant,
    propX: 690,
    sub: '白い紙には、陽だまりの温度がある',
    lightSub: true,
    tag: 'paper',
  },
  {
    id: '03_drafting_grid',
    name: '製図台・方眼',
    Bg: BgDraftingGrid,
    ink: { ...LIGHT_INK, headFill: '#EEF2E8', accent: '#E62E2D', accent2: '#2F8F86' },
    act: { kind: 'drop_present', dir: 1, standX: 720 },
    Prop: PropBars,
    propX: 1270,
    sub: '製図台なら、理屈がまっすぐ届く',
    lightSub: true,
    tag: 'paper',
  },
  {
    id: '04_wood_desk',
    name: '木目デスク',
    Bg: BgWoodDesk,
    ink: {
      line: '#1C1917',
      headFill: '#FBF7EE',
      accent: '#E62E2D',
      accent2: '#2F4F7F',
      muted: '#57534E',
      shadow: 'rgba(0, 0, 0, 0)',
      cutout: '#FBF7EE',
    },
    act: { kind: 'walk_think_point', dir: 1, standX: 760 },
    Prop: PropBooks,
    propX: 1250,
    sub: '木の机は、話を手元に引き寄せる',
    lightSub: false,
    tag: 'paper',
  },
  {
    id: '05_kraft_cork_scrap',
    name: 'クラフト紙×コルク',
    Bg: BgKraftCork,
    ink: {
      line: '#1A140F',
      headFill: '#CBA375',
      accent: '#F5EFE2',
      accent2: '#B3221C',
      muted: '#4A3A2A',
      shadow: 'rgba(50, 26, 8, 0.28)',
    },
    act: { kind: 'walk_think_point', dir: -1, standX: 1170 },
    Prop: PropMagnifier,
    propX: 660,
    sub: 'コルクの上で、手がかりをつなぐ',
    lightSub: false,
    tag: 'paper',
  },
  {
    id: '06_midnight_blueprint',
    name: '深紺ブループリント',
    Bg: BgMidnightBlueprint,
    ink: {
      line: '#EAF6FF',
      headFill: '#0F2C55',
      accent: '#FFD666',
      accent2: '#7FC8FF',
      muted: '#9FB8D6',
      shadow: 'rgba(2, 10, 26, 0.45)',
      glow: '#9FD3FF',
    },
    act: { kind: 'drop_present', dir: 1, standX: 700 },
    Prop: PropGears,
    propX: 1240,
    sub: '青焼きの夜は、構造がよく見える',
    lightSub: false,
    tag: 'dark',
  },
  {
    id: '07_ruled_notebook',
    name: 'クリーム罫線ノート',
    Bg: BgRuledNotebook,
    ink: {
      line: '#1F2A48',
      headFill: '#FBF6E8',
      accent: '#E64B4B',
      accent2: '#4068B0',
      muted: '#4A5470',
      shadow: 'rgba(60, 50, 30, 0.14)',
    },
    act: { kind: 'walk_nod_cheer', dir: 1, standX: 780 },
    Prop: PropHeart,
    propX: 1270,
    sub: 'ノートの上なら、本音も書ける',
    lightSub: true,
    tag: 'paper',
  },
  {
    id: '08_opus_wildcard',
    name: 'Opus自由枠・透写台',
    Bg: BgLightTable,
    ink: {
      line: '#26262B',
      headFill: '#FBF8F0',
      accent: '#FFC93C',
      accent2: '#3A6FD8',
      muted: '#55555C',
      shadow: 'rgba(90, 70, 40, 0.16)',
    },
    act: { kind: 'stroll_jump', dir: 1, standX: 1000 },
    Prop: PropStar,
    propX: 1430,
    sub: '透写台の上で、線は生きて動き出す',
    lightSub: true,
    tag: 'paper',
    onion: true,
  },
];

/** 左上の控えめな札（紙片＋マステ。角丸UIは使わない） */
const ShowcaseTag: React.FC<{ index: number; name: string; tone: 'paper' | 'dark' }> = ({ index, name, tone }) => {
  const dark = tone === 'dark';
  return (
    <div
      style={{
        position: 'absolute',
        left: 96,
        top: 44,
        transform: 'rotate(-1.4deg)',
        padding: '8px 18px 9px',
        background: dark ? 'rgba(18, 18, 20, 0.62)' : 'rgba(250, 246, 236, 0.86)',
        color: dark ? 'rgba(243, 239, 230, 0.88)' : 'rgba(28, 25, 23, 0.82)',
        fontFamily: FONT_MARU,
        fontWeight: 700,
        fontSize: 24,
        letterSpacing: '0.06em',
        boxShadow: dark ? '0 0 0 1px rgba(243, 239, 230, 0.16)' : '3px 4px 0 rgba(40, 30, 20, 0.14)',
        zIndex: 50,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -18,
          top: -10,
          width: 64,
          height: 20,
          background: 'rgba(232, 218, 176, 0.72)',
          transform: 'rotate(-28deg)',
        }}
      />
      <span style={{ opacity: 0.7 }}>{String(index + 1).padStart(2, '0')} / </span>
      {name}
    </div>
  );
};

const SegmentView: React.FC<{ seg: Segment; index: number }> = ({ seg, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const st = actAt(sec, seg.act);
  const { Bg, Prop } = seg;

  const onionInk = (k: number) => (k < 0 ? 'rgba(58, 111, 216, 0.34)' : 'rgba(216, 67, 58, 0.26)');
  const onion = seg.onion
    ? [-2, -1, 1].map((k) => {
        const t = stepSec(sec) + k * (2 / 7.5);
        const g = actAt(t, seg.act);
        return (
          <g key={k} opacity={k === -2 ? 0.55 : 1}>
            <StickBody p={g.pose} flip={g.flip} ink={onionInk(k)} headFill="none" width={5} faceless />
          </g>
        );
      })
    : null;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Bg sec={sec} actorX={st.pose.x} />

      {/* 主役レイヤー：字幕帯（STICKMAN_CONTENT_BOTTOM 以下）を clipPath で保護 */}
      <AbsoluteFill style={{ clipPath: `inset(0px 0px ${H - STICKMAN_CONTENT_BOTTOM}px 0px)` }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {onion}
          {seg.ink.cutout ? null : <FloorShadow x={st.pose.x} ground={st.ground} color={seg.ink.shadow} />}
          <InkLayer ink={seg.ink}>
            <Prop sec={sec} x={seg.propX} ink={seg.ink} />
            <StickBody p={st.pose} flip={st.flip} face={st.face} ink={seg.ink.line} headFill={seg.ink.headFill} />
          </InkLayer>
        </svg>
      </AbsoluteFill>

      <CollageSubtitle
        cues={[{ startSec: 0.3, endSec: 4.9, line1: seg.sub }]}
        sec={sec}
        lightBg={seg.lightSub}
        fontSize={42}
        bottomOffset={70}
        maxWidth="90%"
      />
      <ShowcaseTag index={index} name={seg.name} tone={seg.tag} />
    </AbsoluteFill>
  );
};

export const OpusBgShowcase: React.FC = () => {
  useStickmanCollageFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {SEGMENTS.map((seg, i) => (
        <Sequence key={seg.id} from={i * SEG} durationInFrames={SEG} name={seg.id}>
          <SegmentView seg={seg} index={i} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const OPUS_BG_SHOWCASE_SEGMENTS = SEGMENTS.map((s, i) => ({
  id: s.id,
  name: s.name,
  from: i * SEG,
  durationInFrames: SEG,
}));
