import type { SfxInputKind } from '../sfx';

export const STICKMAN_CONTENT_BOTTOM = 890;

export const STAGE_POLARITIES = [
  'black',
  'white_sketch',
  'grid_paper',
  'wood_desk',
  'kraft_cork',
  'blueprint',
  'cream_notebook',
  'light_table',
] as const;

export type StagePolarity = (typeof STAGE_POLARITIES)[number];

export type StagePolarityTone = 'dark' | 'light' | 'mid';

/**
 * 盤面インクが濃墨系になる極性か（black / blueprint 以外は true）。
 */
export const isLightStagePolarity = (polarity: StagePolarity): boolean =>
  polarity !== 'black' && polarity !== 'blueprint';

/**
 * 字幕帯が明地（黒字＋白縁）になる極性か。
 * wood_desk / kraft_cork のような中間明度（下段に暗めの静音帯が入る舞台）と
 * black / blueprint（暗地）は白字＋黒縁（false）となる。
 */
export const isLightSubtitlePolarity = (polarity: StagePolarity): boolean =>
  polarity === 'white_sketch' ||
  polarity === 'grid_paper' ||
  polarity === 'cream_notebook' ||
  polarity === 'light_table';

export const resolvePolarityBgHex = (polarity: StagePolarity): string => {
  switch (polarity) {
    case 'white_sketch':
      return '#FFFCF4';
    case 'grid_paper':
      return '#EEF2E8';
    case 'wood_desk':
      return '#7A4E2D';
    case 'kraft_cork':
      return '#C9A273';
    case 'blueprint':
      return '#0E2B55';
    case 'cream_notebook':
      return '#FBF6E8';
    case 'light_table':
      return '#FAF4E6';
    case 'black':
    default:
      return '#030303';
  }
};

export interface PolarityTheme {
  polarity: StagePolarity;
  tone: StagePolarityTone;
  isLight: boolean;
  subtitleIsLight: boolean;
  subtitleColor: string;
  subtitleOutline: string;
  bg: string;
  ink: string;
  headFill: string;
  mutedInk: string;
  accentPrimary: string;
  accentSecondary: string;
  accentWarning: string;
  accentGreen: string;
  accentOlive: string;
  paperBg: string;
  paperBroadsheetBg: string;
  cardBg: string;
  cardInk: string;
  cardBorder: string;
  outlineColor: string;
  stampBg: string;
  highlightYellow: string;
  shadow: string;
  shadowCss: string;
  /** 紙の切り抜きシール化（木目など中間調の背景向け）。紙色 */
  cutout?: string;
  /** 暗い背景での線の発光色 */
  glow?: string;
  /** 透写台向け前後コマオニオンスキン標準ON */
  onionSkin?: boolean;
  /** 字幕帯の静音化グラデーション基調色と強さ */
  calmColor: string;
  calmStrength: number;
}

/**
 * 公式8背景極性に応じた統一コントラスト・字幕・質感パレットを返す。
 * SaaS ダークカード色（#0F172A / #1E293B 等）および Tailwind slate 系グレーは使用しない。
 */
export const resolvePolarityTheme = (polarity: StagePolarity): PolarityTheme => {
  switch (polarity) {
    case 'white_sketch':
      return {
        polarity,
        tone: 'light',
        isLight: true,
        subtitleIsLight: true,
        subtitleColor: '#111111',
        subtitleOutline: '#FFFFFF',
        bg: '#FFFCF4',
        ink: '#1C1917',
        headFill: '#FFFCF4',
        mutedInk: '#57534E',
        accentPrimary: '#E8794A',
        accentSecondary: '#7BB661',
        accentWarning: '#DC2626',
        accentGreen: '#16A34A',
        accentOlive: '#787814',
        paperBg: '#FFFFFF',
        paperBroadsheetBg: '#F3EFE4',
        cardBg: '#FFFFFF',
        cardInk: '#111111',
        cardBorder: '#111111',
        outlineColor: '#FFFFFF',
        stampBg: 'rgba(255, 255, 255, 0.94)',
        highlightYellow: 'rgba(253, 224, 71, 0.88)',
        shadow: 'rgba(60, 48, 32, 0.16)',
        shadowCss: '8px 8px 0 rgba(17, 17, 17, 0.22)',
        calmColor: '#FBF7EE',
        calmStrength: 0.5,
      };

    case 'grid_paper':
      return {
        polarity,
        tone: 'light',
        isLight: true,
        subtitleIsLight: true,
        subtitleColor: '#111111',
        subtitleOutline: '#FFFFFF',
        bg: '#EEF2E8',
        ink: '#1C1917',
        headFill: '#EEF2E8',
        mutedInk: '#57534E',
        accentPrimary: '#E62E2D',
        accentSecondary: '#2F8F86',
        accentWarning: '#DC2626',
        accentGreen: '#16A34A',
        accentOlive: '#787814',
        paperBg: '#FFFFFF',
        paperBroadsheetBg: '#F3EFE4',
        cardBg: '#FFFFFF',
        cardInk: '#111111',
        cardBorder: '#111111',
        outlineColor: '#FFFFFF',
        stampBg: 'rgba(255, 255, 255, 0.94)',
        highlightYellow: 'rgba(253, 224, 71, 0.88)',
        shadow: 'rgba(60, 48, 32, 0.16)',
        shadowCss: '8px 8px 0 rgba(17, 17, 17, 0.22)',
        calmColor: '#EEF2E8',
        calmStrength: 0.45,
      };

    case 'wood_desk':
      return {
        polarity,
        tone: 'mid',
        isLight: true,
        subtitleIsLight: false,
        subtitleColor: '#FFFFFF',
        subtitleOutline: '#000000',
        bg: '#7A4E2D',
        ink: '#1C1917',
        headFill: '#FBF7EE',
        mutedInk: '#57534E',
        accentPrimary: '#E62E2D',
        accentSecondary: '#2F4F7F',
        accentWarning: '#DC2626',
        accentGreen: '#16A34A',
        accentOlive: '#787814',
        paperBg: '#FFFFFF',
        paperBroadsheetBg: '#F3EFE4',
        cardBg: '#FFFFFF',
        cardInk: '#111111',
        cardBorder: '#111111',
        outlineColor: '#FBF7EE',
        stampBg: 'rgba(255, 255, 255, 0.94)',
        highlightYellow: 'rgba(253, 224, 71, 0.88)',
        shadow: 'rgba(0, 0, 0, 0)',
        shadowCss: '0 16px 36px rgba(26, 12, 4, 0.48)',
        cutout: '#FBF7EE',
        calmColor: '#1A0C04',
        calmStrength: 0.6,
      };

    case 'kraft_cork':
      return {
        polarity,
        tone: 'mid',
        isLight: true,
        subtitleIsLight: false,
        subtitleColor: '#FFFFFF',
        subtitleOutline: '#000000',
        bg: '#C9A273',
        ink: '#1A140F',
        headFill: '#CBA375',
        mutedInk: '#4A3A2A',
        accentPrimary: '#F5EFE2',
        accentSecondary: '#B3221C',
        accentWarning: '#B3221C',
        accentGreen: '#16A34A',
        accentOlive: '#787814',
        paperBg: '#FFFFFF',
        paperBroadsheetBg: '#F3EFE4',
        cardBg: '#FFFFFF',
        cardInk: '#111111',
        cardBorder: '#111111',
        outlineColor: '#F5EFE2',
        stampBg: 'rgba(255, 255, 255, 0.94)',
        highlightYellow: 'rgba(253, 224, 71, 0.88)',
        shadow: 'rgba(50, 26, 8, 0.28)',
        shadowCss: '0 16px 36px rgba(26, 12, 4, 0.48)',
        calmColor: '#2A160A',
        calmStrength: 0.5,
      };

    case 'blueprint':
      return {
        polarity,
        tone: 'dark',
        isLight: false,
        subtitleIsLight: false,
        subtitleColor: '#FFFFFF',
        subtitleOutline: '#000000',
        bg: '#0E2B55',
        ink: '#EAF6FF',
        headFill: '#0F2C55',
        mutedInk: '#9FB8D6',
        accentPrimary: '#FFD666',
        accentSecondary: '#7FC8FF',
        accentWarning: '#FF6B6B',
        accentGreen: '#4ADE80',
        accentOlive: '#A8A81E',
        paperBg: '#FAF8F3',
        paperBroadsheetBg: '#F3EFE4',
        cardBg: '#FAF8F3',
        cardInk: '#111111',
        cardBorder: '#DDD6C7',
        outlineColor: '#081B37',
        stampBg: 'rgba(10, 10, 14, 0.90)',
        highlightYellow: 'rgba(253, 224, 71, 0.88)',
        shadow: 'rgba(2, 10, 26, 0.45)',
        shadowCss: '0 26px 60px rgba(0, 0, 0, 0.85)',
        glow: '#9FD3FF',
        calmColor: '#06142A',
        calmStrength: 0.5,
      };

    case 'cream_notebook':
      return {
        polarity,
        tone: 'light',
        isLight: true,
        subtitleIsLight: true,
        subtitleColor: '#111111',
        subtitleOutline: '#FFFFFF',
        bg: '#FBF6E8',
        ink: '#1F2A48',
        headFill: '#FBF6E8',
        mutedInk: '#4A5470',
        accentPrimary: '#E64B4B',
        accentSecondary: '#4068B0',
        accentWarning: '#DC2626',
        accentGreen: '#16A34A',
        accentOlive: '#787814',
        paperBg: '#FFFFFF',
        paperBroadsheetBg: '#F3EFE4',
        cardBg: '#FFFFFF',
        cardInk: '#111111',
        cardBorder: '#111111',
        outlineColor: '#FFFFFF',
        stampBg: 'rgba(255, 255, 255, 0.94)',
        highlightYellow: 'rgba(253, 224, 71, 0.88)',
        shadow: 'rgba(60, 50, 30, 0.14)',
        shadowCss: '8px 8px 0 rgba(17, 17, 17, 0.22)',
        calmColor: '#FBF6E8',
        calmStrength: 0.45,
      };

    case 'light_table':
      return {
        polarity,
        tone: 'light',
        isLight: true,
        subtitleIsLight: true,
        subtitleColor: '#111111',
        subtitleOutline: '#FFFFFF',
        bg: '#FAF4E6',
        ink: '#26262B',
        headFill: '#FBF8F0',
        mutedInk: '#55555C',
        accentPrimary: '#FFC93C',
        accentSecondary: '#3A6FD8',
        accentWarning: '#D8433A',
        accentGreen: '#16A34A',
        accentOlive: '#787814',
        paperBg: '#FFFFFF',
        paperBroadsheetBg: '#F3EFE4',
        cardBg: '#FFFFFF',
        cardInk: '#111111',
        cardBorder: '#111111',
        outlineColor: '#FFFFFF',
        stampBg: 'rgba(255, 255, 255, 0.94)',
        highlightYellow: 'rgba(253, 224, 71, 0.88)',
        shadow: 'rgba(90, 70, 40, 0.16)',
        shadowCss: '8px 8px 0 rgba(17, 17, 17, 0.22)',
        onionSkin: true,
        calmColor: '#F4ECDA',
        calmStrength: 0.35,
      };

    case 'black':
    default:
      return {
        polarity: 'black',
        tone: 'dark',
        isLight: false,
        subtitleIsLight: false,
        subtitleColor: '#FFFFFF',
        subtitleOutline: '#000000',
        bg: '#030303',
        ink: '#F3EFE6',
        headFill: '#0E0D0B',
        mutedInk: '#B8B2A6',
        accentPrimary: '#FFCC00',
        accentSecondary: '#3DA5FF',
        accentWarning: '#FF5A4E',
        accentGreen: '#4ADE80',
        accentOlive: '#A8A81E',
        paperBg: '#FAF8F3',
        paperBroadsheetBg: '#F3EFE4',
        cardBg: '#FAF8F3',
        cardInk: '#111111',
        cardBorder: '#DDD6C7',
        outlineColor: '#000000',
        stampBg: 'rgba(10, 10, 14, 0.90)',
        highlightYellow: 'rgba(253, 224, 71, 0.88)',
        shadow: 'rgba(0, 0, 0, 0.6)',
        shadowCss: '0 26px 60px rgba(0, 0, 0, 0.85)',
        glow: '#FFF2D6',
        calmColor: '#000000',
        calmStrength: 0.55,
      };
  }
};

export type StickmanAssetKind =
  | 'person_photo'
  | 'object_photo'
  | 'scene_photo'
  | 'scene_video'
  | 'broll_video'
  | 'photo_cutout'
  | 'news_clipping'
  | 'public_document';

export type StickmanAssetLicense =
  | 'public_domain'
  | 'cc0'
  | 'cc_by'
  | 'pdl_1_0'
  | 'royalty_free'
  | 'short_quotation';

export interface StickmanAssetCatalogItem {
  id: string;
  kind: StickmanAssetKind;
  src: string;
  cutoutSrc?: string;
  labelJa: string;
  /** 人名・施設名・商品名など、台本照合用の被写体名 */
  subjectNameJa?: string;
  tags?: string[];
  license: StickmanAssetLicense;
  /** YouTube概要欄転記用の出典メモ（動画画面内・サムネイル内には表示しない） */
  creditShort: string;
  sourceUrl?: string;
  objectPosition?: string;
}

export interface StickmanRealAssetTarget {
  labelJa: string;
  category:
    | 'person'
    | 'specific_place'
    | 'document'
    | 'specific_product'
    | 'place'
    | 'object';
  assetId?: string;
  chunkIds?: string[];
  allowHandDrawnFallback?: boolean;
  reasonIfOmitted?: string;
}

export type StickmanLayoutArchetype =
  | 'tsx_scene'
  | 'full_canvas_diagram'
  | 'collage_stage'
  | 'center_hero_photo'
  | 'newspaper_focus'
  | 'split_balanced'
  | 'stat_spotlight'
  | 'skit_stage'
  | 'end_cta';

export type StickmanPhotoVariant =
  | 'tape_scrap'
  | 'cutout'
  | 'polaroid_person'
  | 'vignette_blend';

export type StickmanPhotoPlacement =
  | 'center_hero'
  | 'left_card'
  | 'right_card';

export interface StickmanPhotoLayerSpec {
  assetId: string;
  variant?: StickmanPhotoVariant;
  placement?: StickmanPhotoPlacement;
  rotateDeg?: number;
  kenBurnsScaleFrom?: number;
  kenBurnsScaleTo?: number;
  objectPosition?: string;
  /** 人物ポラロイド下ラベル等（出典表記は禁止） */
  labelJa?: string;
  tape?: boolean;
  dim?: number;
  beatIndex?: number;
  triggerOffsetSec?: number;
}

export type StickmanPose =
  | 'sitting_desk'
  | 'grad_unhappy'
  | 'homeless_sign'
  | 'celebrate'
  | 'talking_yellow'
  | 'listening_blue'
  | 'nerd_glasses'
  | 'stick_legs_only'
  | 'pointing'
  | 'thinking';

export interface StickmanFigureSpec {
  id: string;
  pose: StickmanPose;
  color?: string;
  position: 'left' | 'center' | 'right' | 'bottom_left_corner' | 'bottom_right_corner';
  size?: number;
  flipX?: boolean;
  boilScale?: number;
  beatIndex?: number;
  triggerOffsetSec?: number;
  bubbleTextJa?: string;
  bubbleSubText?: string;
  bubbleTail?: 'bottom-left' | 'bottom-right' | 'left' | 'right' | 'none';
  signPrimary?: string;
  signSecondary?: string;
}

export type StickmanDiagramKind =
  | 'big_stat'
  | 'bar_chart'
  | 'staggered_grid'
  | 'equation_flow'
  | 'compare_cards'
  | 'matrix_2x2'
  | 'comparison_table'
  | 'kinetic_list'
  | 'newspaper_card'
  | 'ruler_gauge'
  | 'red_circle_mark'
  | 'arrow_flow'
  | 'stamp_reveal'
  | 'custom_demo';

export interface StickmanDiagramSpec {
  kind: StickmanDiagramKind;
  demoKey?: string;
  params?: Record<string, unknown>;
}

/**
 * pipeline/src/yt_engine/audio/sfx_synth.py の render_sfx_track と完全一致する効果音種別。
 */
export type StickmanSfxKind = SfxInputKind;

export type StickmanNarrativeRole =
  | 'scroll_stop_hook'
  | 'context_lean_in'
  | 'contrarian_claim'
  | 'pivot_contrast'
  | 'example_illustration'
  | 'open_loop'
  | 'comic_punchline'
  | 'rehook'
  | 'transition'
  | 'end_cta';

export interface StickmanShotBeatSpec {
  beatIndex: number;
  offsetSec?: number;
  timeSec?: number;
  phraseJa?: string;
  action:
    | 'reveal_photo'
    | 'reveal_diagram'
    | 'draw_stroke'
    | 'highlight_ring'
    | 'animate_metric'
    | 'pop_callout'
    | 'pop_figure'
    | 'pop_bubble'
    | 'stamp'
    | 'stagger_grid';
  targetId?: string;
  noteJa?: string;
}

export interface StickmanCalloutSpec {
  textJa: string;
  color?: string;
  fontSize?: number;
  rotateDeg?: number;
  position?: 'top' | 'bottom' | 'top_left' | 'top_right' | 'center';
  triggerOffsetSec?: number;
  beatIndex?: number;
}

export interface StickmanStampSpec {
  text: string;
  color?: string;
  rotateDeg?: number;
  fontSize?: number;
  position?: 'top_right' | 'bottom_right' | 'center' | 'bottom_left';
  triggerOffsetSec?: number;
  beatIndex?: number;
}

export interface StickmanSfxTriggerSpec {
  kind: StickmanSfxKind;
  offsetSec: number;
  gain?: number;
  pan?: number;
  durationSec?: number;
  notes?: string;
}

export interface StickmanSubtitleSpec {
  line1: string;
  line2?: string;
}

export interface StickmanPhraseCue {
  text: string;
  startSec: number;
  endSec: number;
}

export interface StickmanShotAlignment {
  text: string;
  characters: string[];
  charStartSec: number[];
  charEndSec: number[];
  phrases?: StickmanPhraseCue[];
  source?: string;
}

export interface StickmanSceneSpec {
  mode: 'preset' | 'tsx';
  component?: string;
  params?: Record<string, unknown>;
  assetIds?: string[];
}

export interface StickmanSafeRect {
  x: number;
  y: number;
  width: number;
  height: number;
  stageWidth: number;
  stageHeight: number;
  contentBottom: number;
  safeMarginX: number;
  safeMarginY: number;
}

export interface StickmanResolvedAsset {
  src: string;
  item: StickmanAssetCatalogItem;
}

export interface StickmanSceneProps {
  /** ショット内相対時刻（0..shotDurationSec） */
  sec: number;
  /** 動画全体の絶対時刻（秒） */
  globalSec: number;
  shotDurationSec: number;
  /** ショット先頭基準の相対ビート時刻配列 */
  beats: readonly number[];
  /** 実音声アライメントから語・フレーズのショット内相対秒を引く */
  cue: (phrase: string, fallbackSec?: number) => number;
  polarity: StagePolarity;
  theme: PolarityTheme;
  safeRect: StickmanSafeRect;
  resolveAsset: (assetId: string) => StickmanResolvedAsset | undefined;
  shot: StickmanRuntimeShot;
  params: Record<string, unknown>;
}

export const STICKMAN_MEDIA_BACKDROP_DEFAULTS = {
  filter: 'contrast(1.08) saturate(0.76) brightness(0.74)',
  dim: 0.48,
  vignette: 0.64,
  blurPx: 0,
  zoom: [1.04, 1.12] as readonly [number, number],
  pan: [0, 0] as readonly [number, number],
  trimBeforeSec: 0,
  playbackRate: 1,
  loop: false,
  objectPosition: '50% 50%',
  mirror: false,
  subtitleCalmStrength: 0.68,
  grainOpacity: 0.04,
} as const;

export interface StickmanMediaBackdropConfig {
  /** assetCatalog 登録済みの素材 ID（実写動画 mp4/webm/mov/m4v または静止画） */
  assetId: string;
  /** 暗幕オーバーレイの不透明度（0..1、既定 0.48） */
  dim?: number;
  /** 暗幕オーバーレイの基調色（6桁 hex 等。省略時は polarity に合わせた暗色） */
  dimColor?: string;
  /** 周辺ビネットの強さ（0..1、既定 0.64） */
  vignette?: number;
  /** 背景ぼかし px（既定 0） */
  blurPx?: number;
  /** CSS filter（既定: 暗色シネマティック調） */
  filter?: string;
  /** 微ズーム範囲 [start, end]（既定 [1.04, 1.12]） */
  zoom?: readonly [number, number];
  /** パン [startX, endX] px（既定 [0, 0]） */
  pan?: readonly [number, number];
  /** 動画のトリム開始秒（既定 0） */
  trimBeforeSec?: number;
  /** 動画の再生速度（既定 1） */
  playbackRate?: number;
  /** 動画が区間より短い場合にループ再生するか（既定 false） */
  loop?: boolean;
  /** object-position（省略時は assetCatalog.objectPosition または '50% 50%'） */
  objectPosition?: string;
  /** 左右反転（既定 false） */
  mirror?: boolean;
  /** 下段字幕帯静音化（SubtitleCalm）の強さ（0..1、既定 0.68） */
  subtitleCalmStrength?: number;
  /** フィルムグレイン重畳の不透明度（0..1、既定 0.04、0 で無効） */
  grainOpacity?: number;
}

/**
 * assetCatalog 登録済みの素材 ID 文字列、または暗幕・ビネット・ぼかし・微ズーム・トリム等を
 * 調整した設定オブジェクト。既存の動く壁紙（polarity）と並列で全面背景に敷ける。
 */
export type StickmanMediaBackdrop = string | StickmanMediaBackdropConfig;

/**
 * `mediaBackdrop` の文字列／オブジェクト表記を設定オブジェクトへ正規化する。
 */
export const normalizeStickmanMediaBackdrop = (
  backdrop: StickmanMediaBackdrop | undefined | null,
): StickmanMediaBackdropConfig | undefined => {
  if (!backdrop) {
    return undefined;
  }
  if (typeof backdrop === 'string') {
    const trimmed = backdrop.trim();
    return trimmed ? { assetId: trimmed } : undefined;
  }
  const trimmed = typeof backdrop.assetId === 'string' ? backdrop.assetId.trim() : '';
  if (!trimmed) {
    return undefined;
  }
  return trimmed === backdrop.assetId ? backdrop : { ...backdrop, assetId: trimmed };
};

/**
 * 暗幕付き実写背景（mediaBackdrop）使用時のテーマを解決する。
 * 推奨組み合わせは暗極性（black / blueprint）。
 * 暗幕上での字幕可読性を保つため、白字＋黒縁字幕と暗色 SubtitleCalm のみを整える。
 */
export const resolveMediaBackdropTheme = (polarity: StagePolarity): PolarityTheme => {
  const base = resolvePolarityTheme(polarity);
  return {
    ...base,
    subtitleIsLight: false,
    subtitleColor: '#FFFFFF',
    subtitleOutline: '#000000',
    calmColor: base.tone === 'light' ? '#050608' : base.calmColor,
    calmStrength: Math.max(base.calmStrength, STICKMAN_MEDIA_BACKDROP_DEFAULTS.subtitleCalmStrength),
  };
};

export interface StickmanShotSpec {
  shotIndex: number;
  chunkId: string;
  targetDurationSec?: number;
  narrativeRole: StickmanNarrativeRole;
  polarity: StagePolarity;
  /** 動く壁紙（PolarityBackground）の代わりに全面へ敷く暗幕付き実写動画・画像背景（assetCatalog ID または設定オブジェクト） */
  mediaBackdrop?: StickmanMediaBackdrop;
  lightBg?: boolean;
  polarityShiftReason?: string;
  layoutArchetype?: StickmanLayoutArchetype;
  scene?: StickmanSceneSpec;
  photoLayer?: StickmanPhotoLayerSpec;
  /** @deprecated 描画されない旧フィールド。v1タイムライン互換用。新規Specでは使用禁止。 */
  secondaryPhotoLayers?: StickmanPhotoLayerSpec[];
  diagram?: StickmanDiagramSpec;
  beats?: StickmanShotBeatSpec[];
  stickFigures?: StickmanFigureSpec[];
  callout?: StickmanCalloutSpec;
  stamp?: StickmanStampSpec;
  handNote?: string;
  visualNotesJa?: string;
  narrationJa: string;
  /** このショットの発話後に挿入する演出の「間」（秒・最大3.0）。読み上げ原稿にト書きを入れずに結論・反転・オチ前の間を作る。章の最終ショットでは無効 */
  pauseAfterSec?: number;
  subtitle?: StickmanSubtitleSpec;
  subtitleSegments?: StickmanSubtitleSpec[];
  sfx?: StickmanSfxTriggerSpec[];
  openLoopAction?: 'open' | 'close' | 'none';
  comicPunchline?: boolean;
  showOnScreenCitation?: false;
}

export type StickmanChapterEyecatchVariant = 'strips' | 'zoom' | 'glitch';

export interface StickmanChapterEyecatchSpec {
  /** false を明示するとその章のアイキャッチを無効化 */
  enabled?: boolean;
  /** アイキャッチ演出種別（既定 'strips'） */
  variant?: StickmanChapterEyecatchVariant;
  /** チャンネル名を刷るか（既定 true・全章転換で原則 true 統一） */
  showName?: boolean;
  /** 専用 SE を自動再生するか（既定 true） */
  withSfx?: boolean;
  /** SE 音量（0..2、既定 1） */
  sfxVolume?: number;
  /** 前章発話終了〜アイキャッチ開始までの余韻（秒、既定 0.25s） */
  leadInSec?: number;
  /** アイキャッチ本体の尺（秒、既定 1.0s） */
  durationSec?: number;
  /** アイキャッチ完全終了〜次章ナレーション・字幕・シーン開始までの無音間（秒、既定 0.25s、最小 0.15s） */
  postPauseSec?: number;
}

export interface StickmanRuntimeChapterEyecatch {
  variant: StickmanChapterEyecatchVariant;
  showName: boolean;
  withSfx: boolean;
  sfxVolume: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  startFrame: number;
  endFrame: number;
  leadInSec: number;
  postPauseSec: number;
}

export interface StickmanChapterSpec {
  chapterIndex: number;
  topicId: string;
  titleJa: string;
  defaultPolarity?: StagePolarity;
  targetDurationSec?: number;
  openLoopQuestionJa?: string;
  /** 章頭（前章からの転換点）に専用無音スロットで差し込む公式アイキャッチ設定 */
  eyecatch?: StickmanChapterEyecatchSpec | null;
  shots: StickmanShotSpec[];
}

export interface StickmanEndCtaSpec {
  enabled?: boolean;
  durationSec?: number;
  hasFinalizingPhrase?: false;
  linkLabelJa?: string;
  headlineJa?: string;
  narrationJa?: string;
  subtitle?: StickmanSubtitleSpec;
  communityPromptJa?: string;
  endCardLabels?: [string, string];
}

export interface StickmanTtsConfigSpec {
  provider: 'elevenlabs' | 'gemini';
  models: string[];
  voices: string[];
  languageCode: string;
  useTimestamps?: boolean;
  targetTempoMin?: number;
  targetTempoMax?: number;
}

export interface StickmanAudioCutoutWindow {
  startSec: number;
  durationMs?: number;
}

export interface StickmanAudioConfigSpec {
  /** 合成ピアノ piano_chord_progression は廃止。無音＋SFX または 権利クリア済みBGMファイルのみ。 */
  mode: 'silent_sfx_only' | 'licensed_bgm_file';
  leadingSilenceSec?: number;
  bgmFile?: string;
  bgmLicenseNote?: string;
  bgmStartSec?: number;
  bgmGain?: number;
  sfxGain?: number;
  duckBgmOnNarration?: boolean;
  cutoutWindowsSec?: StickmanAudioCutoutWindow[];
  targetLufs: number;
  truePeakDbtp: number;
  lra: number;
}

export interface StickmanLegalChecklistSpec {
  primarySources: string[];
  usesAcmlVoiceForCriticism: false;
  usesAiExpertAdvice: false;
  fontsLicense: string;
}

export interface StickmanCollageEpisodeSpec {
  slug: string;
  compositionId: string;
  title: string;
  formatId: 'stickman_collage';
  blueprintRef?: string;
  harnessRef?: string;
  video: {
    width: number;
    height: number;
    fps: number;
    safeMarginX?: number;
    safeMarginY?: number;
  };
  realAssetTargets?: StickmanRealAssetTarget[];
  assetCatalog: StickmanAssetCatalogItem[];
  chapters: StickmanChapterSpec[];
  endCta?: StickmanEndCtaSpec | null;
  tts: StickmanTtsConfigSpec;
  audio: StickmanAudioConfigSpec;
  legalChecklist: StickmanLegalChecklistSpec;
}

export interface StickmanRuntimeSubtitleCue {
  startSec: number;
  endSec: number;
  line1: string;
  line2?: string | null;
}

export interface StickmanRuntimeShot extends StickmanShotSpec {
  chapterIndex: number;
  topicId: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  startFrame: number;
  endFrame: number;
  beatTimesSec?: number[];
  alignment?: StickmanShotAlignment;
}

export interface StickmanRuntimeChapter {
  chapterIndex: number;
  topicId: string;
  titleJa: string;
  defaultPolarity?: StagePolarity;
  openLoopQuestionJa?: string | null;
  startSec: number;
  endSec: number;
  durationSec: number;
  eyecatch?: StickmanRuntimeChapterEyecatch | null;
}

export interface StickmanCollageRuntimeSpec {
  slug: string;
  compositionId: string;
  title: string;
  formatId: 'stickman_collage';
  fps: number;
  width: number;
  height: number;
  totalDurationSec: number;
  totalFrames: number;
  masterAudioMp3: string;
  assetCatalog: StickmanAssetCatalogItem[];
  chapters: StickmanRuntimeChapter[];
  shots: StickmanRuntimeShot[];
  subtitles: StickmanRuntimeSubtitleCue[];
  endCta?: StickmanEndCtaSpec | null;
  apiCalls?: number;
  ttsVoiceDisplayName?: string;
  ttsModel?: string;
}

export interface StickmanCollageDemoRenderProps {
  sec: number;
  startSec: number;
  endSec: number;
  beats: readonly number[];
  polarity: StagePolarity;
  theme: PolarityTheme;
  params?: Record<string, unknown>;
  assetCatalog?: readonly StickmanAssetCatalogItem[];
}

/**
 * assetCatalog から指定 ID の素材パスとメタ情報を解決する。
 */
export const resolveStickmanAssetSrc = (
  catalog: readonly StickmanAssetCatalogItem[] | undefined,
  assetId: string | undefined,
): { src: string; item: StickmanAssetCatalogItem } | undefined => {
  if (!catalog || !assetId) {
    return undefined;
  }
  const item = catalog.find((entry) => entry.id === assetId);
  if (!item) {
    return undefined;
  }
  return {
    src: item.cutoutSrc ?? item.src,
    item,
  };
};
