export type ThumbnailFormatId = 'stickman_collage' | 'planE_macro_econ';

export type PsychologicalTrigger =
  | 'numbers'
  | 'loss_avoidance'
  | 'surprise'
  | 'self_relevance';

export type ThumbnailWorkflowStage =
  | 'pre_script_draft'
  | 'pre_script_locked'
  | 'final_qa';

export type ThumbnailCopyZone =
  | 'top_left'
  | 'left'
  | 'top_center'
  | 'top_right'
  | 'bottom_left'
  | 'bottom_right';

export type ThumbnailFocalZone =
  | 'bottom_right'
  | 'right'
  | 'center_right'
  | 'split_right'
  | 'center'
  | 'top_left';

export type ThumbnailAssetSourceType =
  | 'existing_public'
  | 'public_domain'
  | 'commercial_stock'
  | 'ai_generated'
  | 'none';

export interface ThumbnailAssetRef {
  sourceType: ThumbnailAssetSourceType;
  pathOrCatalogId?: string | null;
  prompt?: string | null;
  generatorModel?: string | null;
  containsAiBakedText?: boolean;
  strictlyNoTextEnforced?: boolean;
  objectPosition?: string;
  creditShort?: string | null;
}

export interface ThumbnailColorsSpec {
  background?: string;
  /** ちぎり紙・帯など文字背面の座布団色（任意） */
  textBacking?: string | null;
  primaryText: string;
  emphasisText: string;
  recedingAccent: string;
  /** 文字の外側ストローク色（任意・太縁取り時の実効コントラスト判定にも使用） */
  strokeColor?: string | null;
}

export interface ThumbnailVariantSpec {
  variantId: string;
  label: string;
  hypothesis: string;
  /** 1行で言語化した視覚フック（比較シート表示・A/B大差監査用） */
  visualHook?: string | null;
  /** v2 正式ルート：ThumbnailRoot.tsx に登録した自由舞台 <Still> の id */
  compositionId: string;
  /** 自由舞台 <Still> へ渡す追加 props（任意） */
  stillProps?: Record<string, unknown> | null;
  /** 自由舞台 <Still> が textless prop に対応しているか（既定 true） */
  supportsTextless?: boolean;
  copyLines: string[];
  highlightToken?: string | null;
  accentLineIndex?: number | null;
  badgeText?: string | null;
  triggers: PsychologicalTrigger[];
  /** 旧v1互換または構図メモ用の任意タグ */
  layoutPreset?: string | null;
  copyZone: ThumbnailCopyZone;
  focalZone: ThumbnailFocalZone;
  colors: ThumbnailColorsSpec;
  backgroundAsset?: ThumbnailAssetRef | null;
  secondaryAsset?: ThumbnailAssetRef | null;
  citationText?: string | null;
  showCitation?: boolean;
  formatOptions?: Record<string, unknown> | null;
}

export interface ThumbnailWorkflowSpec {
  stage: ThumbnailWorkflowStage;
  lockedBeforeScript: boolean;
  researchBriefRef: string;
  clickConfirmPromise: string;
  abTestMode: 'test_and_compare' | 'sequential_swap' | 'single';
  dailyImpressionsTier: 'under_1000' | 'over_1000';
  /** @deprecated 後方互換用。新規制作ではコピー固定を使わず、各案に最適なコピーを振ることを推奨 */
  copyLockedAcrossVariants?: boolean;
}

export interface ThumbnailComplianceSpec {
  primarySourcesCount: number;
  noOfficialImpersonation: boolean;
  usesUnauthorizedTrademarkAsOfficial: boolean;
  hasMisleadingBreakingUi: boolean;
  noAiSlop3Ng: boolean;
  silOflFontsOnly: boolean;
  aiDisclosureRequired: boolean;
}

export interface ThumbnailRenderSpec {
  width: number;
  height: number;
  squintWidth: number;
  squintHeight: number;
  comparisonSheetWidth: number;
  comparisonSheetHeight: number;
  maxFileSizeMb: number;
  exportTextlessBase: boolean;
}

export interface CompetitorMockCard {
  channelName: string;
  title: string;
  viewsText: string;
  publishedAgo: string;
  durationText: string;
  thumbnailLabel?: string;
  bgColor?: string;
  accentColor?: string;
  imageSrc?: string | null;
}

export interface ThumbnailPackageSpec {
  schemaVersion: number;
  episodeId: string;
  formatId: ThumbnailFormatId;
  channelName: string;
  videoTitle: string;
  videoDurationText: string;
  comparisonSheetCompositionId?: string;
  workflow: ThumbnailWorkflowSpec;
  fonts: string[];
  compliance: ThumbnailComplianceSpec;
  render: ThumbnailRenderSpec;
  competitors: CompetitorMockCard[];
  variants: ThumbnailVariantSpec[];
}

/**
 * 自由舞台サムネイル <Still> コンポーネントが受け取る標準 props。
 * すべてのエピソード専用サムネイル <Still> はこのインターフェースに対応させる。
 */
export interface FreeStageThumbnailStillProps {
  /** true のとき主コピー層のみ非表示にし、背景・キャラ・図解骨格だけの文字抜きベースを出力する */
  textless?: boolean;
  /** true のとき 90% セーフゾーンと右下 YouTube 再生時間バッジ回避領域を重ねる */
  showSafeGuides?: boolean;
}

export interface ThumbnailValidationSummary {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  recommendedExperimentMethod: string;
  titleZenkakuLength: number;
  variantMetrics?: Array<{
    variantId: string;
    copyCharCount: number;
    lineCount: number;
    contrastPrimary?: number | null;
    contrastEmphasis?: number | null;
    lcsOverlapLen?: number;
    bigramOverlapRatio?: number;
    overlapWarning: boolean;
  }>;
}

export interface ThumbnailComparisonSheetProps {
  spec: ThumbnailPackageSpec;
  validationSummary?: ThumbnailValidationSummary;
  /**
   * ビルド時に書き出した各バリアント PNG の配信 URL（variantId -> URL）。
   * render_thumbnails.mjs のローカル一時 HTTP サーバーから自動注入される。
   */
  variantImageUrls?: Record<string, string>;
}
