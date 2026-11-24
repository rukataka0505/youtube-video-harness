/* ========================================================================== */
/* ch1『バグる棒人間』/ ch2『経済の赤ペン』ブランド資産＆パス関数の統一パレット    */
/* ========================================================================== */

// 共通手描きパス関数
export {
  f2,
  handLine,
  hashRnd,
  ring,
  rr,
  sanitizeSvgId,
  tornRect,
} from '../_materials/paths';

// フォント定数
export {
  FONT_HAND,
  FONT_MARU,
  FONT_SANS,
  FONT_SERIF,
  useStickmanCollageFonts,
} from '../stickman_collage/fonts';
export {
  FONT_ECON_MONO,
  FONT_ECON_SANS,
  FONT_ECON_SERIF,
  usePlanEFonts,
} from '../plan_e/fonts';

// ch1『バグる棒人間』キャラ＆グリッチ資産
export {
  RiggedStickman,
  createStandPose,
  reachHand,
  rig,
} from '../stickman_collage/RiggedStickman';
export type { Face as StickmanFace, StickPose } from '../stickman_collage/RiggedStickman';

export {
  BUGURU_CHANNEL_NAME,
  BUGURU_PALETTE,
  BUGURU_SHRUG,
  BuguruCharacter,
  BuguruFace,
  BuguruGlowFilter,
  BuguruPaperFilter,
  ColorSplit,
  GlitchBlocks,
  SvgSlices,
  TwitchMarks,
  buguruPoseAtHead,
  randomBands,
} from '../stickman_collage/brand/buguruCore';
export type {
  BuguruCharacterProps,
  BuguruFaceProps,
  BuguruPalette,
  BuguruVariant,
  GlitchBand,
} from '../stickman_collage/brand/buguruCore';

// ch2『経済の赤ペン』ブランドインク・赤ペン本体・フィルタ資産
export {
  AKAPEN,
  AkapenFilterDefs,
  RedPenGlyph,
  akapenFilterIds,
  akapenLoopPath,
} from '../plan_e/brand/akapenInk';
export type { AkapenFilterIds } from '../plan_e/brand/akapenInk';
