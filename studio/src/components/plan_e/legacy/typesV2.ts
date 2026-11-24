import type React from 'react';
import type { SubtitleCue } from '../../common/CleanSubtitle';
import type { CausalGearActorSpec } from '../CausalGearLoopStage';
import type { EditorialCutoutCardProps } from '../EditorialCutoutCard';
import type { WhiteboardTrendSeries } from '../WhiteboardTrendChart';

export type PlanEBackdropMode =
  | 'slate_grid'
  | 'editorial_paper'
  | 'crisis_dark'
  | 'whiteboard'
  | 'corkboard'
  | /** @deprecated ダークブルー方眼 AI Slop につき新規禁止（互換維持のみ） */ 'blueprint_econ';

export interface PlanESfxCue {
  kind: string;
  offsetSec: number;
  gain?: number;
}

export interface PlanESfxEvent {
  kind: string;
  timeSec: number;
  gain?: number;
}

export type PlanEAssetKind =
  | 'photo_broll'
  | 'news_clipping'
  | 'official_chart'
  | 'editorial_collage'

export type PlanEAssetLicense =
  | 'public_domain'
  | 'cc0'
  | 'cc_by'
  | 'pdl_1_0'
  | 'royalty_free'
  | 'short_quotation'

export interface PlanEAssetCatalogItem {
  id: string;
  kind: PlanEAssetKind;
  src: string;
  labelJa: string;
  license: PlanEAssetLicense;
  /** YouTube概要欄転記用の出典メモ（動画画面内・サムネイル内には原則表示しない） */
  creditShort: string;
  sourceUrl?: string;
  objectPosition?: string;
}

export type PlanEChartKind =
  | 'line'
  | 'bar'
  | 'dual_compare'
  | 'crash_curve'
  | 'stacked_bar';

export interface PlanEChartPoint {
  label: string;
  value: number;
  secondaryValue?: number;
  highlight?: boolean;
  annotation?: string;
}

export interface PlanEChartSeries {
  name: string;
  color?: string;
  values: readonly number[];
}

export interface PlanEChartData {
  kind: PlanEChartKind;
  title: string;
  subtitle?: string;
  unit?: string;
  /** @deprecated 現行共通方針ではグラフ内に出典を表示せず概要欄へ集約（既存ベンチマーク互換用） */
  sourceCitation?: string;
  lightTheme?: boolean;
  labels?: readonly string[];
  points?: readonly PlanEChartPoint[];
  series?: readonly PlanEChartSeries[];
  highlightBandLabel?: string;
  highlightIndex?: number;
  calloutBadge?: string;
  yMin?: number;
  yMax?: number;
}

export interface PlanEIncentiveNode {
  id: string;
  title: string;
  subtitle?: string;
  metric?: string;
  x: number; // 0..1000 論理座標
  y: number; // 0..600 論理座標
  tone?: 'neutral' | 'emerald' | 'crimson' | 'gold' | 'cyan';
  revealOffsetSec?: number;
}

export interface PlanEIncentiveEdge {
  from: string;
  to: string;
  label?: string;
  tone?: 'emerald' | 'crimson' | 'gold' | 'cyan' | 'muted';
  dashed?: boolean;
  revealOffsetSec?: number;
}

export interface PlanEPolicyLeverItem {
  id: string;
  code: string;
  label: string;
  actionText: string;
  intendedEffect: string;
  backfireResult: string;
  severity?: 'low' | 'medium' | 'critical' | 'blocked';
  active?: boolean;
  revealOffsetSec?: number;
}

export interface PlanECollageCard {
  id: string;
  variant: 'broadsheet' | 'ticker_alert' | 'memo_note' | 'photo_frame';
  publicationName: string;
  categoryLabel?: string;
  headline: string;
  subHeadline?: string;
  highlightPhrase?: string;
  stampText?: string;
  stampTone?: 'crimson' | 'emerald' | 'gold';
  imageKey?: string;
  imageSrc?: string;
  /** @deprecated 現行共通方針ではカード内に出典を表示せず概要欄へ集約（既存ベンチマーク互換用） */
  citation?: string;
  rotateDeg?: number;
  revealOffsetSec?: number;
}

export interface PlanESceneBase {
  id: string;
  startSec: number;
  endSec: number;
  backdropMode?: PlanEBackdropMode;
  backgroundColor?: string;
  hideSubtitle?: boolean;
  /** @deprecated 現行共通方針では動画画面内に出典を表示せず概要欄へ集約（既存ベンチマーク互換用） */
  citationText?: string;
  tickerLabel?: string;
  chapterCode?: string;
  /** シーン冒頭へ差し込む RGB グリッチバースト継続秒数 */
  glitchIntroSec?: number;
  /** シーン開始からの相対オフセットで発火するSFXキュー */
  sfxCues?: readonly PlanESfxCue[];
}

export interface PlanEParadoxHookScene extends PlanESceneBase {
  type: 'paradox_hook';
  eyebrow?: string;
  headline: string;
  highlightToken?: string;
  subHeadline?: string;
  paradoxTag?: string;
  vhsPauseEffect?: boolean;
  timecodeLabel?: string;
  backgroundImageKey?: string;
  backgroundImageSrc?: string;
  backgroundOpacity?: number;
}

export interface PlanEEconChartScene extends PlanESceneBase {
  type: 'econ_chart';
  sectionTitle: string;
  sectionSubtitle?: string;
  chart: PlanEChartData;
  sideInsightTitle?: string;
  sideInsightPoints?: readonly string[];
  stampText?: string;
}

export interface PlanEIncentiveLoopScene extends PlanESceneBase {
  type: 'incentive_loop';
  title: string;
  subtitle?: string;
  nodes: readonly PlanEIncentiveNode[];
  edges: readonly PlanEIncentiveEdge[];
  centerTag?: string;
}

export interface PlanESatireCollageScene extends PlanESceneBase {
  type: 'satire_collage';
  headline?: string;
  subHeadline?: string;
  cards: readonly PlanECollageCard[];
  backgroundImageKey?: string;
  backgroundImageSrc?: string;
  backgroundOpacity?: number;
  satireNote?: string;
}

export interface PlanEPolicyLeverScene extends PlanESceneBase {
  type: 'policy_lever';
  title: string;
  subtitle?: string;
  mode: 'levers' | 'balance_scale' | 'shield_impact';
  levers: readonly PlanEPolicyLeverItem[];
  verdictStamp?: string;
}

export interface PlanESplitComparisonScene extends PlanESceneBase {
  type: 'split_comparison';
  title: string;
  leftTitle: string;
  leftSubtitle?: string;
  leftItems: readonly string[];
  leftTone?: 'emerald' | 'cyan' | 'gold';
  rightTitle: string;
  rightSubtitle?: string;
  rightItems: readonly string[];
  rightTone?: 'crimson' | 'gold' | 'muted';
  centerVsLabel?: string;
}

export interface PlanEEditorialQuoteScene extends PlanESceneBase {
  type: 'editorial_quote';
  quote: string;
  highlightToken?: string;
  attribution: string;
  contextNote?: string;
  imageKey?: string;
  imageSrc?: string;
}

export interface PlanECustomSceneContext {
  sec: number;
  frame: number;
  fps: number;
  scene: PlanESceneSpec;
  imageMap: Record<string, string>;
  videoMap: Record<string, string>;
}

export interface PlanECustomScene extends PlanESceneBase {
  type: 'custom';
  render: (ctx: PlanECustomSceneContext) => React.ReactNode;
}

export type PlanEBrollMotion = 'static' | 'slow_zoom_in' | 'slow_zoom_out' | 'pan_left' | 'pan_right';
export type PlanEBrollGrade =
  | 'cinematic_vignette'
  | 'crisis_desat'
  | 'warm_night'
  | 'clean_bright'
  | 'editorial_cool';
export type PlanESatireGagMode = 'avatar_talk' | 'mallet_knight' | 'middleman_handshake';

export interface PlanEBrollCut {
  videoKey?: string;
  videoSrc?: string;
  imageKey?: string;
  imageSrc?: string;
  caption?: string;
  motion?: PlanEBrollMotion;
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
  glitchIntroSec?: number;
  locationTag?: string;
  playbackRate?: number;
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

export interface PlanEWhiteboardStackedColumn {
  year: string;
  usd: number;
  eur: number;
  other: number;
}

export interface PlanEWhiteboardBadge {
  id: string;
  label: string;
  subLabel?: string;
  accentColor: string;
  textColor?: string;
  xPct: number;
  yPct: number;
  revealOffsetSec?: number;
}

export interface PlanEWhiteboardScene extends PlanESceneBase {
  type: 'whiteboard_stage';
  mode: 'stacked_chart' | 'logo_pop' | 'world_map_pins';
  boardTitle?: string;
  boardSubtitle?: string;
  sourceNote?: string;
  stackedColumns?: readonly PlanEWhiteboardStackedColumn[];
  badges?: readonly PlanEWhiteboardBadge[];
  avatarEmblem?: string;
}

export interface PlanESatireGagScene extends PlanESceneBase {
  type: 'satire_gag';
  mode: PlanESatireGagMode;
  backgroundVideoKey?: string;
  backgroundVideoSrc?: string;
  targetImageKey?: string;
  targetImageSrc?: string;
  transformedImageKey?: string;
  transformedImageSrc?: string;
  propImageKey?: string;
  propImageSrc?: string;
  avatarEmblem?: string;
}

export interface PlanEProjectorClusterNode {
  id: string;
  label: string;
  group: string;
  color: string;
  x: number;
  y: number;
  r: number;
  revealOffsetSec?: number;
}

export interface PlanEProjectorNetworkScene extends PlanESceneBase {
  type: 'projector_network';
  centerLabel?: string;
  clusters?: readonly PlanEProjectorClusterNode[];
}

export interface PlanEWorldConnectionMapScene extends PlanESceneBase {
  type: 'world_connection_map';
  originIso?: string;
  targetIsos?: readonly string[];
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

export type PlanESceneSpec =
  | PlanEParadoxHookScene
  | PlanEEconChartScene
  | PlanEIncentiveLoopScene
  | PlanESatireCollageScene
  | PlanEPolicyLeverScene
  | PlanESplitComparisonScene
  | PlanEEditorialQuoteScene
  | PlanEVideoBrollScene
  | PlanEVhsPauseAvatarScene
  | PlanENewsBroadcastScene
  | PlanEWhiteboardScene
  | PlanESatireGagScene
  | PlanEProjectorNetworkScene
  | PlanEWorldConnectionMapScene
  | PlanEEditorialCutoutScene
  | PlanEWhiteboardTrendScene
  | PlanECausalGearLoopScene
  | PlanEProjectorTargetMapScene
  | PlanECustomScene;

export interface PlanEProjectSpec {
  id: string;
  themeTitle: string;
  fps?: number;
  totalDurationSec: number;
  audioSrc?: string;
  audioIsExternalUrl?: boolean;
  imageMap?: Record<string, string>;
  videoMap?: Record<string, string>;
  /** 単発効果音アセットパス（例: { paper_snap: "episodes/.../sfx/paper_snap.wav" }） */
  sfxMap?: Record<string, string>;
  /** マスター音声に焼き込み済みのSFXイベント時刻表 */
  sfxEvents?: readonly PlanESfxEvent[];
  /** シーン内サブビートの自動SFX発火を有効にするか（既定 true） */
  autoSceneSfx?: boolean;
  /** sfxEvents も直接 Remotion <Audio> 再生するか（既定 false：master_audio.wav との二重再生防止） */
  playManifestSfxDirectly?: boolean;
  /** 互換用：明示的に true の場合のみ画面内 citationText を描画（既定 false） */
  showLegacyCitation?: boolean;
  subtitles: readonly SubtitleCue[];
  scenes: readonly PlanESceneSpec[];
  defaultCitationText?: string;
  defaultBackdropMode?: PlanEBackdropMode;
  showTickerBar?: boolean;
}

export interface PlanEShotSpec {
  shotIndex: number;
  chunkId: string;
  targetDurationSec: number;
  narrativeRole: string;
  backdropMode: PlanEBackdropMode;
  lightBg: boolean;
  motionType: string;
  visualType: PlanESceneSpec['type'];
  headline?: string;
  /** @deprecated 現行共通方針では動画画面内に出典を表示せず概要欄へ集約（既存ベンチマーク互換用） */
  citationText?: string;
  hideSubtitle?: boolean;
  subtitle?: {
    line1: string;
    line2?: string;
  };
}

export interface PlanEEpisodeSpec {
  slug: string;
  title: string;
  formatId: 'planE_macro_econ';
  blueprintRef: string;
  harnessRef?: string;
  video: {
    width: number;
    height: number;
    fps: number;
  };
  legalChecklist: {
    primarySources: readonly { title: string; url: string; publisher?: string }[];
    usesAcmlVoiceForCriticism: boolean;
    usesAiExpertAdvice: boolean;
    noFinancialAdviceClaim: boolean;
    fontsLicense: string;
  };
  assetCatalog?: readonly PlanEAssetCatalogItem[];
  chapters: readonly {
    chapterId: string;
    titleJa: string;
    role: string;
    targetDurationSec: number;
    shots: readonly PlanEShotSpec[];
  }[];
  endCta: {
    durationSec: number;
    hasFinalizingPhrase: boolean;
    bridgeTopicJa: string;
  };
}

export function isPlanELightBackdrop(mode?: PlanEBackdropMode): boolean {
  return mode === 'editorial_paper' || mode === 'whiteboard';
}
