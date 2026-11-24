export {
  FONT_ECON_MONO,
  FONT_ECON_SANS,
  FONT_ECON_SERIF,
  FONT_ECON_UI_SANS,
  PLAN_E_FONTS,
  usePlanEFonts,
} from './fonts';

export { CleanSubtitle } from '../common/CleanSubtitle';
export type { CleanSubtitleProps, SubtitleCue } from '../common/CleanSubtitle';

export { PLAN_E_MACRO_PALETTE } from '../../theme/tokens';

export {
  PLAN_E_CANVAS_HEIGHT,
  PLAN_E_CANVAS_WIDTH,
  PLAN_E_STAGE_BOTTOM,
  PROJECTOR_SAFE_BOTTOM,
  SUBTITLE_SAFE_BOTTOM,
  SUBTITLE_SAFE_BOTTOM_TIGHT,
} from './constants';

export {
  ALLOWED_SFX_KINDS,
  PLAN_E_AUDIT_RULES,
  PLAN_E_SURFACES,
  PROP_DEFAULT_SFX,
  PROP_KINDS,
  SURFACE_POLARITY,
  isBrightSurface,
  isDarkSurface,
} from './auditRules';

export {
  PlanEAnchorError,
  PlanEAuditError,
  PlanEMediaError,
  at,
  atEvent,
  atStart,
  auditLegacyV2Spec,
  definePlanESpec,
  hit,
  resolveAnchor,
  shiftAnchor,
} from './timeline';

export {
  PLAN_E_INK,
  PLAN_E_STAGE_RECT,
  activeSurfaceAt,
  activeSurfaceSegmentAt,
  normalizeMediaBackdrop,
  cameraTransformAt,
  createStageContext,
  resolveCueInWindow,
  surfaceSegments,
} from './stageContext';
export type { PlanEStageRecorder, PlanESurfaceSegment } from './stageContext';

export { auditPlanESource } from './sourceAudit';
export type { PlanESourceIssue } from './sourceAudit';

export * from './stage';
export type { PlanEDefineInput } from './timeline';

export { auditPlanEProjectSpec } from './audit';
export type {
  PlanEAuditIssue,
  PlanEAuditMetrics,
  PlanEAuditReport,
} from './audit';

export { allocation, selection } from './macros';
export type {
  AllocationMacroConfig,
  AllocationRecipientInput,
  PlanEMacroOutput,
  SelectionMacroConfig,
} from './macros';

export { MacroEconCanvas } from './MacroEconCanvas';
export type { MacroEconCanvasProps } from './MacroEconCanvas';

export { EconHostAvatar } from './EconHostAvatar';
export type { EconHostAvatarProps, EconHostPose } from './EconHostAvatar';

export { VideoBrollStage } from './VideoBrollStage';
export type { VideoBrollStageProps } from './VideoBrollStage';

export { VhsPauseAvatarStage } from './VhsPauseAvatarStage';
export type { VhsPauseAvatarStageProps } from './VhsPauseAvatarStage';

export { BreakingNewsBroadcast } from './BreakingNewsBroadcast';
export type { BreakingNewsBroadcastProps } from './BreakingNewsBroadcast';

export {
  EditorialCutoutCard,
  CorkboardBackdrop,
  EditorialPaperBackdrop,
  EditorialCutoutStage,
} from './EditorialCutoutCard';
export type {
  EditorialCutoutCardProps,
  CorkboardBackdropProps,
  EditorialPaperBackdropProps,
  EditorialCutoutStageProps,
} from './EditorialCutoutCard';

export {
  DiegeticCoin,
  DiegeticCounter,
  DiegeticHangTag,
  DiegeticMarkerText,
  DiegeticPhotoClip,
  DiegeticStamp,
  DiegeticXMark,
  MarkerEllipse,
  MarkerWriteOn,
} from './DiegeticProps';
export type {
  DiegeticCoinProps,
  DiegeticCounterProps,
  DiegeticHangTagProps,
  DiegeticMarkerTextProps,
  DiegeticPhotoClipProps,
  DiegeticStampProps,
  DiegeticXMarkProps,
  MarkerEllipseProps,
  MarkerWriteOnProps,
} from './DiegeticProps';

export {
  DiegeticBeatsLayer,
  DiegeticStage,
  WhiteboardSurfaceBackdrop,
} from './DiegeticStage';
export type { DiegeticStageProps } from './DiegeticStage';

export { WhiteboardTrendChart } from './WhiteboardTrendChart';
export type { WhiteboardTrendChartProps, WhiteboardTrendSeries } from './WhiteboardTrendChart';

export { CausalGearLoopStage } from './CausalGearLoopStage';
export type { CausalGearActorSpec, CausalGearLoopStageProps } from './CausalGearLoopStage';

export { RgbGlitchBurst } from './RgbGlitchBurst';
export type { RgbGlitchBurstProps } from './RgbGlitchBurst';

export { ProjectorTargetMapStage } from './ProjectorTargetMapStage';
export type { ProjectorTargetMapStageProps } from './ProjectorTargetMapStage';

export { WORLD_COUNTRIES, WORLD_MAP_HEIGHT, WORLD_MAP_VIEWBOX, WORLD_MAP_WIDTH } from './worldMapPaths';
export type { WorldCountryPath } from './worldMapPaths';

export type {
  Anchor,
  PlanEAssetCatalogItem,
  PlanEAssetKind,
  PlanEAssetLicense,
  PlanEAuditRuleCode,
  PlanEAuditWaiver,
  PlanEBeatInput,
  PlanEBeatParamsMap,
  PlanEBrollCut,
  PlanEBrollGrade,
  PlanEBrollMotion,
  PlanECameraInput,
  PlanECameraMoveInput,
  PlanECausalGearLoopScene,
  PlanECueOptions,
  PlanECustomResolvedSurfaceShift,
  PlanECustomScene,
  PlanECustomSurfaceShiftInput,
  PlanECustomSceneContext,
  PlanEDiegeticStageScene,
  PlanEEditorialCutoutScene,
  PlanEInk,
  PlanEMediaBackdrop,
  PlanEMediaBackdropConfig,
  PlanENewsBroadcastScene,
  PlanEPolarity,
  PlanEProjectSpec,
  PlanEProjectorTargetMapScene,
  PlanEPropKind,
  PlanEResolvedBeat,
  PlanEResolvedCamera,
  PlanEResolvedSurfaceShift,
  PlanESceneBase,
  PlanESceneInput,
  PlanESceneSpec,
  PlanESfxKind,
  PlanESpecTimeline,
  PlanEStageRect,
  PlanESurface,
  PlanESurfaceShiftInput,
  PlanETimelineAssetMeta,
  PlanETimelineBase,
  PlanETimelineChunk,
  PlanEVhsPauseAvatarScene,
  PlanEVideoBrollScene,
  PlanEWhiteboardTrendScene,
} from './types';

export {
  SfxCue,
  SfxTimeOriginProvider,
  type SfxCueProps,
  type SfxCueSourceProps,
  type SfxTimeOrigin,
  type SfxTimeOriginProviderProps,
} from '../SfxCue';

export {
  LEGACY_SFX_ALIASES,
  SFX_CUSTOM_DEFAULT_DURATION_SEC,
  SFX_DEFAULT_DURATION_SEC,
  SFX_DEFAULT_VOLUME,
  SFX_RECOMMENDED_VOLUME_RANGE,
  STANDARD_SFX_KINDS,
  resolveSfxKind,
  resolveStandardSfxSrc,
  type SfxInputKind,
  type SfxKind,
  type StandardSfxKind,
} from '../sfx';

export * from './brand';
