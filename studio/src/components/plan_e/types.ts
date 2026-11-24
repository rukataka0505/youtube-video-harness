import type React from 'react';
import type { SubtitleCue } from '../common/CleanSubtitle';
import type {
  PlanEPolarity,
  PlanEPropKind,
  PlanESfxKind,
  PlanESurface,
} from './auditRules';
import type { CausalGearActorSpec } from './CausalGearLoopStage';
import type { EditorialCutoutCardProps } from './EditorialCutoutCard';
import type { WhiteboardTrendSeries } from './WhiteboardTrendChart';

export type { PlanEPolarity, PlanEPropKind, PlanESfxKind, PlanESurface };

export type PlanEAssetKind =
  | 'photo_broll'
  | 'news_clipping'
  | 'official_chart'
  | 'editorial_collage';

export type PlanEAssetLicense =
  | 'public_domain'
  | 'cc0'
  | 'cc_by'
  | 'pdl_1_0'
  | 'royalty_free'
  | 'short_quotation';

export interface PlanEAssetCatalogItem {
  id: string;
  kind: PlanEAssetKind;
  src: string;
  labelJa: string;
  license: PlanEAssetLicense;
  creditShort: string;
  sourceUrl?: string;
  objectPosition?: string;
}

export interface PlanETimelineChunk {
  id: string;
  text: string;
  startSec: number;
  speechEndSec: number;
  endSec: number;
}

export interface PlanETimelineAssetMeta {
  kind: string;
  filename: string;
  intent?: string;
  sourceUrl?: string;
  sha256?: string;
  verified: boolean;
}

export interface PlanEEyecatchSlot {
  variant: 'swipe' | 'pullback' | 'slit';
  startSec: number;
  endSec: number;
  resumeSec: number;
}

export interface PlanETimelineBase {
  eyecatches?: readonly PlanEEyecatchSlot[];
  slug: string;
  title: string;
  fps: number;
  width: number;
  height: number;
  totalDurationSec: number;
  totalFrames: number;
  audioSrc: string;
  imageMap: Record<string, string>;
  videoMap: Record<string, string>;
  sfxMap?: Record<string, string>;
  sfxVariants?: Record<string, readonly string[]>;
  chunks: readonly PlanETimelineChunk[];
  charTimes: Record<string, readonly number[]>;
  assets?: Record<string, PlanETimelineAssetMeta>;
  subtitles: readonly SubtitleCue[];
  events: Record<string, number | number[]>;
}

/** 秒の直書きを型レベルで禁止するタイムラインアンカー。 */
export type Anchor =
  | {
      kind?: 'text';
      text: string;
      chunk?: string;
      nth?: number;
      edge?: 'start' | 'end';
      offset?: number;
    }
  | {
      kind: 'event';
      event: string;
      offset?: number;
    }
  | {
      kind: 'start';
      start: true;
      offset?: number;
    };

export interface PlanEBeatParamsMap {
  hang_tag: {
    x: number;
    y: number;
    price: string;
    label?: string;
    scale?: number;
    stringLen?: number;
    swing?: boolean;
    glow?: number;
  };
  photo_clip: {
    x: number;
    y: number;
    width: number;
    height: number;
    imageKey?: string;
    src?: string;
    caption?: string;
    captionSize?: number;
    rotateDeg?: number;
    objectPosition?: string;
    filter?: string;
    highlight?: number;
  };
  stamp: {
    text: string;
    x: number;
    y: number;
    size?: number;
    rotateDeg?: number;
    color?: string;
  };
  marker_write: {
    text: string;
    x: number;
    y: number;
    width?: number;
    fontSize?: number;
    color?: string;
    align?: 'left' | 'center' | 'right';
    durationSec?: number;
  };
  marker_circle: {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    color?: string;
    strokeWidth?: number;
    durationSec?: number;
  };
  cutout_card: Omit<EditorialCutoutCardProps, 'startSec' | 'enterOffsetSec'> & {
    x?: number;
    y?: number;
  };
  coin: {
    cx: number;
    cy: number;
    r: number;
    frac: number;
    face?: string;
    label?: string;
    valueText?: string;
    fillColor?: string;
    fillDelaySec?: number;
    fillDurSec?: number;
  };
  counter: {
    x: number;
    y: number;
    valueText: string;
    label?: string;
    color?: string;
    fontSize?: number;
  };
  x_mark: {
    cx: number;
    cy: number;
    size?: number;
    color?: string;
    strokeWidth?: number;
    durationSec?: number;
  };
  custom_cue: {
    label?: string;
    [key: string]: unknown;
  };
}

export type PlanEBeatInput<P extends PlanEPropKind = PlanEPropKind> = P extends PlanEPropKind
  ? {
      id?: string;
      at: Anchor;
      prop: P;
      params: PlanEBeatParamsMap[P];
      /** 未指定は prop 既定 SFX、null は明示的な無音（意図的な静けさ） */
      sfx?: PlanESfxKind | null;
      gain?: number;
    }
  : never;

export type PlanEResolvedBeat<P extends PlanEPropKind = PlanEPropKind> = P extends PlanEPropKind
  ? {
      id?: string;
      timeSec: number;
      prop: P;
      params: PlanEBeatParamsMap[P];
      sfx: PlanESfxKind | null;
      explicitSilence: boolean;
      gain?: number;
    }
  : never;

/** 自由舞台の暗幕付き実写背景（MediaPlate 相当の暗色・ビネット・微ズームを既定適用）。 */
export interface PlanEMediaBackdropConfig {
  /** imageMap / videoMap に登録された素材キー */
  key: string;
  /** 暗幕オーバーレイの濃さ（0..1、既定 0.44） */
  dim?: number;
  /** 周辺ビネットの強さ（0..1、既定 0.62） */
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
  /** object-position（既定 '50% 50%'） */
  objectPosition?: string;
  /** 左右反転（既定 false） */
  mirror?: boolean;
}

/** 登録済みメディアキー文字列、または暗幕・ズーム等を調整した設定オブジェクト。 */
export type PlanEMediaBackdrop = string | PlanEMediaBackdropConfig;

/** シーン途中の地（surface）切替。監査の極性連続・字幕の明暗も切替点で追従する。 */
export interface PlanESurfaceShiftInput {
  at: Anchor;
  surface: PlanESurface;
}

/** 自由舞台（type: 'custom'）用の地切替。区間ごとに暗幕付き実写背景を指定できる（未指定時は引き継がず解除）。 */
export interface PlanECustomSurfaceShiftInput extends PlanESurfaceShiftInput {
  mediaBackdrop?: PlanEMediaBackdrop;
}

export interface PlanEResolvedSurfaceShift {
  atSec: number;
  surface: PlanESurface;
}

export interface PlanECustomResolvedSurfaceShift extends PlanEResolvedSurfaceShift {
  mediaBackdrop?: PlanEMediaBackdrop;
}

/** 語句アンカー駆動のカメラ（背景層・舞台層へ同一変換を掛ける。字幕には掛けない）。 */
export interface PlanECameraMoveInput {
  at: Anchor;
  /** 目標ズーム（1 = 等倍） */
  zoom?: number;
  /** 目標平行移動 (px, 1920x1080 基準) */
  x?: number;
  y?: number;
  /** 前状態からの遷移秒（相対） */
  dur?: number;
}

export interface PlanECameraInput {
  moves?: readonly PlanECameraMoveInput[];
  /** 着弾シェイク（判子・落下物など） */
  shakes?: readonly Anchor[];
  shakeAmp?: number;
  /** 変換原点（CSS transform-origin） */
  origin?: string;
}

export interface PlanEResolvedCamera {
  moves: readonly { atSec: number; zoom: number; x: number; y: number; durSec: number }[];
  shakes: readonly number[];
  shakeAmp: number;
  origin: string;
}

export interface PlanESceneBase {
  id: string;
  startSec: number;
  endSec: number;
  surface: PlanESurface;
  surfaceShifts?: readonly PlanEResolvedSurfaceShift[];
  camera?: PlanEResolvedCamera;
  beats?: readonly PlanEResolvedBeat[];
  backgroundColor?: string;
  hideSubtitle?: boolean;
  tickerLabel?: string;
  chapterCode?: string;
  glitchIntroSec?: number;
  /** @deprecated 旧互換のみ */
  showLegacyCitation?: boolean;
  /** @deprecated 旧互換のみ */
  citationText?: string;
}

export type PlanEBrollMotion =
  | 'static'
  | 'slow_zoom_in'
  | 'slow_zoom_out'
  | 'pan_left'
  | 'pan_right';

export type PlanEBrollGrade =
  | 'cinematic_vignette'
  | 'crisis_desat'
  | 'warm_night'
  | 'clean_bright'
  | 'editorial_cool';

export interface PlanEBrollCut {
  videoKey?: string;
  videoSrc?: string;
  imageKey?: string;
  imageSrc?: string;
  caption?: string;
  motion?: PlanEBrollMotion;
  trimBeforeSec?: number;
  blurPx?: number;
  brightness?: number;
  saturate?: number;
  mirror?: boolean;
  objectPosition?: string;
  zoom?: readonly [number, number];
}

export interface PlanEVideoBrollScene extends PlanESceneBase {
  type: 'video_broll';
  videoKey?: string;
  videoSrc?: string;
  imageKey?: string;
  imageSrc?: string;
  cuts?: readonly PlanEBrollCut[];
  motion?: PlanEBrollMotion;
  grade?: PlanEBrollGrade;
  vignetteStrength?: number;
  locationTag?: string;
  playbackRate?: number;
  trimBeforeSec?: number;
  blurPx?: number;
  brightness?: number;
  saturate?: number;
  mirror?: boolean;
  objectPosition?: string;
  zoom?: readonly [number, number];
  overlayCutout?: EditorialCutoutCardProps;
}

export interface PlanEVhsPauseAvatarScene extends PlanESceneBase {
  type: 'vhs_pause_avatar';
  frozenImageKey?: string;
  frozenImageSrc?: string;
  timecodeLabel?: string;
  avatarEmblem?: string;
}

export interface PlanENewsBroadcastScene extends PlanESceneBase {
  type: 'news_broadcast';
  anchorVideoKey?: string;
  anchorVideoSrc?: string;
  networkTag?: string;
  breakingLabel?: string;
  headline: string;
  tickerCode?: string;
  indexValueStart?: number;
  indexValueEnd?: number;
  changeValueText?: string;
  changePercentText?: string;
  tickerItems?: readonly string[];
}

export interface PlanEEditorialCutoutScene extends PlanESceneBase {
  type: 'editorial_cutout';
  backdrop: 'broll' | 'paper' | 'corkboard';
  cards: readonly EditorialCutoutCardProps[];
  backgroundVideoKey?: string;
  backgroundVideoSrc?: string;
  backgroundImageKey?: string;
  backgroundImageSrc?: string;
  mastheadTitle?: string;
  mastheadSubtitle?: string;
  showRedString?: boolean;
  pins?: readonly [number, number][];
  impactShake?: boolean;
}

export interface PlanEWhiteboardTrendScene extends PlanESceneBase {
  type: 'whiteboard_trend';
  title: string;
  subtitle?: string;
  xLabels: readonly string[];
  yTicks?: readonly number[];
  yMin?: number;
  yMax?: number;
  baselineTick?: number | null;
  series: readonly WhiteboardTrendSeries[];
  highlightOffsetSec?: number;
  circleLastHighlight?: boolean;
  gapBadgeText?: string;
  stampText?: string;
  avatarEmblem?: string;
}

export interface PlanECausalGearLoopScene extends PlanESceneBase {
  type: 'causal_gear_loop';
  surfaceTheme?: 'paper' | 'whiteboard' | 'charcoal';
  title: string;
  centerLockLabel?: string;
  leftActor: CausalGearActorSpec;
  rightActor: CausalGearActorSpec;
  topFlowLabel: string;
  bottomFlowLabel: string;
  rightPhaseOffsetSec?: number;
  lockOffsetSec?: number;
}

export interface PlanEProjectorTargetMapScene extends PlanESceneBase {
  type: 'projector_target_map';
  targetLabel: string;
  targetCountryId?: string;
  targetPoint?: readonly [number, number];
  nextChapterLabel?: string;
  zoomRange?: readonly [number, number];
  avatarEmblem?: string;
}

export interface PlanEDiegeticStageScene extends PlanESceneBase {
  type: 'diegetic_stage';
  mastheadTitle?: string;
  mastheadSubtitle?: string;
  badgeText?: string;
  title?: string;
  showRedString?: boolean;
  pins?: readonly [number, number][];
  backgroundImageKey?: string;
  backgroundImageSrc?: string;
  backgroundVideoKey?: string;
  backgroundVideoSrc?: string;
  backgroundBlurPx?: number;
  backgroundBrightness?: number;
}

/** 自由舞台の地に連動したインク色（SaaS 系グレーを使わない紙・墨・朱の配色）。 */
export interface PlanEInk {
  ground: string;
  ink: string;
  muted: string;
  accent: string;
  highlight: string;
  paper: string;
  tape: string;
  isLight: boolean;
}

/** 字幕帯より上の主舞台矩形（`PLAN_E_STAGE_BOTTOM` が下端）。 */
export interface PlanEStageRect {
  x: number;
  y: number;
  width: number;
  height: number;
  bottom: number;
}

export interface PlanECueOptions {
  nth?: number;
  edge?: 'start' | 'end';
  offset?: number;
  chunk?: string;
}

/**
 * 自由舞台（custom）へ渡す文脈。時刻はすべて spec 時刻（秒）で統一し、`t` / `progress` のみシーン内相対。
 * `cue()` / `media()` / `beat()` は未解決時に例外を投げ、`audit` の事前実行（probe）で検出される。
 */
export interface PlanECustomSceneContext {
  /** spec 時刻（秒）。DiegeticStamp 等の `atSec` と同じ座標系 */
  sec: number;
  frame: number;
  fps: number;
  scene: PlanESceneSpec;
  imageMap: Record<string, string>;
  videoMap: Record<string, string>;
  /** ビートIDから解決済み時刻（spec 秒）を返す。未解決時はエラーを投げる。 */
  beat: (id: string) => number;
  /** シーン内相対秒（0..durationSec） */
  t: number;
  durationSec: number;
  /** シーン進行度 0..1 */
  progress: number;
  /** surfaceShifts 適用後の現在の地 */
  surface: PlanESurface;
  polarity: PlanEPolarity;
  ink: PlanEInk;
  stage: PlanEStageRect;
  /** このシーン区間内の語句の発話時刻（spec 秒）。区間外・未出現・曖昧は例外 */
  cue: (text: string, opts?: PlanECueOptions) => number;
  /** 素材マニフェスト（imageMap / videoMap）のキーから再生可能 src を返す。未登録は例外 */
  media: (key: string) => string;
}

export interface PlanECustomScene extends PlanESceneBase {
  type: 'custom';
  /** シーン途中の地切替（区間ごとに暗幕付き実写背景を指定可。未指定区間は引き継がず解除） */
  surfaceShifts?: readonly PlanECustomResolvedSurfaceShift[];
  /** 既定 true（1920x1080 全面描画） */
  fullBleed?: boolean;
  /** custom 描画に加えて beats の小道具も自動オーバーレイするか（既定 false） */
  overlayBeats?: boolean;
  /** 主舞台（字幕帯より上）。hooks は呼ばず、必要ならコンポーネントに切り出す */
  render: (ctx: PlanECustomSceneContext) => React.ReactNode;
  /**
   * 暗幕付き実写背景（登録済みメディアキーまたは設定）。
   * 未指定かつ backdrop 未指定の区間は LivingSurface が敷かれる。
   * backdrop(ctx) と併用すると暗幕実写の上に backdrop(ctx) が重なる。
   */
  mediaBackdrop?: PlanEMediaBackdrop;
  /** 全面のカスタム背景（実写・紙・机）。字幕帯の下まで敷かれ clip されない */
  backdrop?: (ctx: PlanECustomSceneContext) => React.ReactNode;
  /** 既定 'subtitle'（PLAN_E_STAGE_BOTTOM 以下を物理遮断）。'none' は全面描画を自己責任で行う */
  guard?: 'subtitle' | 'none';
  /** mediaBackdrop / backdrop 未指定時に地の生きた質感（LivingSurface）を敷く（既定 true） */
  living?: boolean;
}

export type PlanESceneSpec =
  | PlanEVideoBrollScene
  | PlanEVhsPauseAvatarScene
  | PlanENewsBroadcastScene
  | PlanEEditorialCutoutScene
  | PlanEWhiteboardTrendScene
  | PlanECausalGearLoopScene
  | PlanEProjectorTargetMapScene
  | PlanEDiegeticStageScene
  | PlanECustomScene;

export type PlanESceneInput<S extends PlanESceneSpec = PlanESceneSpec> = S extends PlanESceneSpec
  ? Omit<S, 'startSec' | 'endSec' | 'beats' | 'surfaceShifts' | 'camera'> & {
      start: Anchor;
      beats?: readonly PlanEBeatInput[];
      surfaceShifts?: S extends PlanECustomScene
        ? readonly PlanECustomSurfaceShiftInput[]
        : readonly PlanESurfaceShiftInput[];
      camera?: PlanECameraInput;
    }
  : never;

export type PlanEAuditRuleCode =
  | 'bright_streak'
  | 'non_dark_streak'
  | 'dark_streak'
  | 'bright_ratio'
  | 'dark_ratio'
  | 'beat_gap'
  | 'missing_prop_sfx'
  | 'poetic_headline'
  | 'legacy_citation_shown'
  | 'silent_stage';

export interface PlanEAuditWaiver {
  rule: PlanEAuditRuleCode;
  range: readonly [number, number];
  reason: string;
}

/** 自由舞台の `ctx.cue()` 解決用に spec へ同梱する文字時刻（spec 時刻 = 絶対時刻 − originSec）。 */
export interface PlanESpecTimeline {
  originSec: number;
  chunks: readonly PlanETimelineChunk[];
  charTimes: Record<string, readonly number[]>;
}

export interface PlanEProjectSpec {
  eyecatches?: readonly PlanEEyecatchSlot[];
  id: string;
  themeTitle: string;
  fps?: number;
  totalDurationSec: number;
  audioSrc?: string;
  audioIsExternalUrl?: boolean;
  audioTrimBeforeSec?: number;
  rangeOriginSec?: number;
  imageMap?: Record<string, string>;
  videoMap?: Record<string, string>;
  sfxMap?: Record<string, string>;
  sfxVariants?: Record<string, readonly string[]>;
  assets?: Record<string, PlanETimelineAssetMeta>;
  subtitles: readonly SubtitleCue[];
  scenes: readonly PlanESceneSpec[];
  timeline?: PlanESpecTimeline;
  waivers?: readonly PlanEAuditWaiver[];
  showTickerBar?: boolean;
  showLegacyCitation?: boolean;
  defaultCitationText?: string;
}
