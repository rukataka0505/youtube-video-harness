/** 案E v3.1 監査しきい値・極性対応表・小道具既定 SFX の唯一正本。 */

import type { SfxInputKind, SfxKind } from '../sfx';

export const PLAN_E_SURFACES = [
  'paper',
  'whiteboard',
  'corkboard',
  'charcoal',
  'dark_desk',
  'dark_broll',
  'projector',
] as const;

export type PlanESurface = (typeof PLAN_E_SURFACES)[number];
export type PlanEPolarity = 'bright' | 'mid' | 'dark';

export const SURFACE_POLARITY: Record<PlanESurface, PlanEPolarity> = {
  paper: 'bright',
  whiteboard: 'bright',
  corkboard: 'mid',
  charcoal: 'dark',
  dark_desk: 'dark',
  dark_broll: 'dark',
  projector: 'dark',
};

export const PLAN_E_AUDIT_RULES = {
  MAX_DARK_STREAK_SEC: 15.0,
  MAX_BRIGHT_STREAK_SEC: 15.0,
  MAX_NON_DARK_STREAK_SEC: 22.0,
  MAX_BRIGHT_RATIO: 0.65,
  MIN_DARK_RATIO: 0.35,
  RATIO_CHECK_MIN_TOTAL_SEC: 30.0,
  MAX_BEAT_GAP_SEC: 6.0,
  POETIC_HEADLINE_MIN_CHARS: 10,
  MIN_WAIVER_REASON_CHARS: 4,
  /** 自由舞台 render() を事前実行して cue/素材/例外を検査するサンプル点数（シーン尺の等分点） */
  STAGE_PROBE_SAMPLES: 6,
  /** この尺以上の自由舞台で視覚 cue が複数あるのに可聴ビートが 0 なら silent_stage */
  SILENT_STAGE_MIN_SEC: 6.0,
  /** 助言（advice）: この総尺以上で自由舞台比率が下限未満なら stage_share_low を出す */
  STAGE_ADVICE_MIN_TOTAL_SEC: 60.0,
  MIN_STAGE_RATIO_ADVICE: 0.25,
} as const;

export { ALLOWED_SFX_KINDS } from '../sfx';
export type PlanESfxKind = SfxInputKind;

export const PROP_KINDS = [
  'hang_tag',
  'photo_clip',
  'stamp',
  'marker_write',
  'marker_circle',
  'cutout_card',
  'coin',
  'counter',
  'x_mark',
  'custom_cue',
] as const;

export type PlanEPropKind = (typeof PROP_KINDS)[number];

export const PROP_DEFAULT_SFX: Record<PlanEPropKind, SfxKind | null> = {
  hang_tag: 'price_ping',
  photo_clip: 'paper_snap',
  stamp: 'stamp_thud',
  marker_write: 'pen_scratch',
  marker_circle: 'pen_scratch',
  cutout_card: 'paper_snap',
  coin: 'soft_pop',
  counter: 'chart_tick',
  x_mark: 'impact_thud',
  custom_cue: null,
};

export function isBrightSurface(surface: PlanESurface): boolean {
  return SURFACE_POLARITY[surface] === 'bright';
}

export function isDarkSurface(surface: PlanESurface): boolean {
  return SURFACE_POLARITY[surface] === 'dark';
}
