/** 案E（planE_macro_econ v3.1）キャンバスおよび字幕セーフ領域の共通定数。 */
export const PLAN_E_CANVAS_WIDTH = 1920;
export const PLAN_E_CANVAS_HEIGHT = 1080;

/** 下部 CleanSubtitle との干渉を確実に防ぐ最小ボトム余白 (px)。 */
export const SUBTITLE_SAFE_BOTTOM = 176;
export const SUBTITLE_SAFE_BOTTOM_TIGHT = 168;
export const PROJECTOR_SAFE_BOTTOM = 204;

/**
 * 自由舞台（custom シーン）の主舞台下端 (px)。`guard: 'subtitle'` 時はこれより下を clipPath で物理遮断する。
 * 全面を覆う地（紙・写真・映像）は `backdrop` 層に置き、字幕帯の下まで敷く。
 */
export const PLAN_E_STAGE_BOTTOM = PLAN_E_CANVAS_HEIGHT - SUBTITLE_SAFE_BOTTOM;
