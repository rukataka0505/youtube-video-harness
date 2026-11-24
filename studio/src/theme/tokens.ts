/**
 * 1080p CTV/モバイル両立のための共通映像・タイポグラフィ規格トークン。
 * 根拠: docs/evergreen/03_production_workflow.md および configs/style_guide.md
 */

export const VIDEO_SPEC = {
  width: 1920,
  height: 1080,
  fps: 30,
  // CTVオーバースキャン回避のための内側90%タイトルセーフゾーン（上下54px / 左右96px）
  safeMarginX: 96,
  safeMarginY: 54,
} as const;

export const TYPOGRAPHY_SCALE = {
  headlinePx: 56, // 規格: 48〜64px
  lowerThirdPx: 40, // 規格: 36〜48px
  subtitlePx: 28, // 規格: 24〜32px（1行14〜16文字目安・最大2行）
  ctaPx: 44, // 規格: 40px以上
  citationPx: 18, // レガシー互換・特例時用小文字テロップ下限（現行標準は概要欄集約）
  fontFamily: '"Noto Sans JP", sans-serif', // SIL OFL / Apache 2.0 限定
} as const;

export interface FormatPalette {
  id: string;
  background: string;
  surface: string;
  textPrimary: string;
  textMuted: string;
  accentPrimary: string;
  accentPrimaryBright?: string;
  accentWarning: string;
  accentSecondary?: string;
  accentOlive?: string;
  flashLight?: string;
  sandstone?: string;
  cyberGlow?: string;
  paperBg?: string;
  paperBroadsheetBg?: string;
  paperAccentRed?: string;
  highlightYellow?: string;
  voidBlack?: string;
  amberGold?: string;
  warmAmber?: string;
  crimsonSeal?: string;
  blueprintBg?: string;
  blueprintDeep?: string;
  blueprintAccent?: string;
  blueprintLine?: string;
  spaceNavy?: string;
  cyberBlue?: string;
  cyanGlow?: string;
  crtScreen?: string;
  crtGreen?: string;
  deskDark?: string;
  deskWarm?: string;
  paperCream?: string;
  paperSepia?: string;
  inkDark?: string;
  voidBg?: string;
  outlineBlack?: string;
  accentNeonGreen?: string;
  accentCallGreen?: string;
  desertOchre?: string;
  podiumWood?: string;
  spaceBlack?: string;
  airspaceRed?: string;
  missileOrange?: string;
  camoOlive?: string;
  mapGreen?: string;
  iceBlueBg?: string;
  invertBlack?: string;
  slateBg?: string;
  whiteboardBg?: string;
  chartPanelLight?: string;
  econEmerald?: string;
  econEmeraldBright?: string;
  crisisRed?: string;
  crisisDarkBg?: string;
  dataBlue?: string;
  dataCyan?: string;
  policyGold?: string;
  networkOrange?: string;
}

export type FormatPaletteId = 'planE_macro_econ';

export const FORMAT_PALETTES: Record<FormatPaletteId, FormatPalette> = {
  // ch2『経済の赤ペン』：案E（How Money Works 型：逆説・シニカル経済／マクロ構造解剖）
  planE_macro_econ: {
    id: 'planE_macro_econ',
    background: '#121417',
    surface: '#1B1F24',
    textPrimary: '#F8FAFC',
    textMuted: '#94A3B8',
    accentPrimary: '#22C55E',
    accentWarning: '#DC2626',
    accentSecondary: '#38BDF8',
    slateBg: '#121417',
    voidBg: '#0E1014',
    spaceNavy: '#0E1A2B',
    whiteboardBg: '#F4F5F6',
    chartPanelLight: '#E6E8EB',
    paperBg: '#FAF8F3',
    paperBroadsheetBg: '#F3EFE4',
    inkDark: '#111827',
    econEmerald: '#1E8E3E',
    econEmeraldBright: '#22C55E',
    crisisRed: '#CC0000',
    crisisDarkBg: '#1A0505',
    dataBlue: '#0072B2',
    dataCyan: '#4DA3FF',
    policyGold: '#F59E0B',
    amberGold: '#D4AF37',
    networkOrange: '#E66C37',
    highlightYellow: 'rgba(250, 204, 21, 0.85)',
  },
};

export const PLAN_E_MACRO_PALETTE = {
  bg: FORMAT_PALETTES.planE_macro_econ.background,
  surface: FORMAT_PALETTES.planE_macro_econ.surface,
  voidBg: FORMAT_PALETTES.planE_macro_econ.voidBg!,
  financeNavy: FORMAT_PALETTES.planE_macro_econ.spaceNavy!,
  whiteboardBg: FORMAT_PALETTES.planE_macro_econ.whiteboardBg!,
  chartPanelLight: FORMAT_PALETTES.planE_macro_econ.chartPanelLight!,
  editorialPaper: FORMAT_PALETTES.planE_macro_econ.paperBg!,
  broadsheetPaper: FORMAT_PALETTES.planE_macro_econ.paperBroadsheetBg!,
  textLight: FORMAT_PALETTES.planE_macro_econ.textPrimary,
  textMuted: FORMAT_PALETTES.planE_macro_econ.textMuted,
  inkDark: FORMAT_PALETTES.planE_macro_econ.inkDark!,
  emerald: FORMAT_PALETTES.planE_macro_econ.econEmerald!,
  emeraldBright: FORMAT_PALETTES.planE_macro_econ.econEmeraldBright!,
  crisisRed: FORMAT_PALETTES.planE_macro_econ.crisisRed!,
  crisisWarning: FORMAT_PALETTES.planE_macro_econ.accentWarning,
  crisisDarkBg: FORMAT_PALETTES.planE_macro_econ.crisisDarkBg!,
  dataBlue: FORMAT_PALETTES.planE_macro_econ.dataBlue!,
  dataCyan: FORMAT_PALETTES.planE_macro_econ.dataCyan!,
  policyGold: FORMAT_PALETTES.planE_macro_econ.policyGold!,
  amberGold: FORMAT_PALETTES.planE_macro_econ.amberGold!,
  networkOrange: FORMAT_PALETTES.planE_macro_econ.networkOrange!,
  highlightYellow: FORMAT_PALETTES.planE_macro_econ.highlightYellow!,
} as const;

/**
 * サムネイル共通技術・A/Bテスト・安全領域規格トークン。
 * 根拠: docs/evergreen/02_format_and_localization.md / 03_production_workflow.md / 04_growth_and_analytics.md
 */
export const THUMBNAIL_SPEC = {
  width: 3840,
  height: 2160,
  logicalWidth: 1920,
  logicalHeight: 1080,
  minAbWidth: 1280,
  minAbHeight: 720,
  squintWidth: 168,
  squintHeight: 94,
  comparisonSheetWidth: 2560,
  comparisonSheetHeight: 1600,
  maxFileSizeMb: 50,
  // 1920x1080論理座標におけるYouTube右下再生時間バッジ回避領域
  durationBadgeSafeZone: {
    right: 32,
    bottom: 28,
    width: 220,
    height: 84,
  },
} as const;
