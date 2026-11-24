/**
 * 共通 SFX カタログ（pipeline/src/yt_engine/audio/sfx_synth.py の STANDARD_SFX_KINDS と完全同期）。
 *
 * - 標準 20 種は `studio/public/sfx/<kind>.wav`（48kHz Stereo 16-bit PCM・立ち上がり 0ms・統一音圧）として常設。
 * - 既存・制作中エピソードとの後方互換のため LEGACY_SFX_ALIASES で旧種別名も標準 20 種へ解決する。
 */

export const STANDARD_SFX_KINDS = [
  'paper_snap',
  'pen_scratch',
  'soft_pop',
  'whoosh',
  'radar_beep',
  'error_buzzer',
  'impact_thud',
  'data_chirp',
  'mech_slide',
  'question_boing',
  'stamp_thud',
  'chart_tick',
  'vhs_pause',
  'glitch_burst',
  'mallet_bonk',
  'armor_clang',
  'dizzy_spin',
  'projector_click',
  'camera_shutter',
  'price_ping',
] as const;

/** 音声パイプラインの ALLOWED_SFX_KINDS と同期する標準 20 種カタログ。 */
export const ALLOWED_SFX_KINDS = STANDARD_SFX_KINDS;

export type SfxKind = (typeof STANDARD_SFX_KINDS)[number];
export type StandardSfxKind = SfxKind;

/** 既存・制作中エピソードの旧種別名を標準 20 種へ読み替える後方互換テーブル。 */
export const LEGACY_SFX_ALIASES = {
  applause: 'soft_pop',
  clock_tick: 'chart_tick',
  coin_drop: 'price_ping',
  door_knock: 'impact_thud',
  finger_snap: 'paper_snap',
  footsteps: 'impact_thud',
  heartbeat: 'impact_thud',
  keyboard_typing: 'data_chirp',
  mouse_click: 'projector_click',
  page_turn: 'paper_snap',
  phone_notification: 'radar_beep',
  phone_vibration: 'vhs_pause',
  record_scratch: 'vhs_pause',
  sparkle: 'price_ping',
  swipe: 'mech_slide',
  switch_click: 'projector_click',
  toy_squeak: 'question_boing',
  typewriter: 'data_chirp',
  water_drop: 'soft_pop',
  zipper: 'mech_slide',
} as const satisfies Record<string, SfxKind>;

export type SfxInputKind = SfxKind | keyof typeof LEGACY_SFX_ALIASES;

/**
 * 標準 20 種静的 WAV の実尺に基づく最小必要再生尺（秒）。
 * `<SfxCue>` が長尺動画で鳴る区間だけ `<Sequence>` マウントするための既定長。
 */
export const SFX_DEFAULT_DURATION_SEC: Record<SfxKind, number> = {
  paper_snap: 0.22,
  pen_scratch: 0.36,
  soft_pop: 0.25,
  whoosh: 0.42,
  radar_beep: 0.30,
  error_buzzer: 0.40,
  impact_thud: 0.38,
  data_chirp: 0.48,
  mech_slide: 0.46,
  question_boing: 0.36,
  stamp_thud: 0.30,
  chart_tick: 0.34,
  vhs_pause: 0.52,
  glitch_burst: 0.32,
  mallet_bonk: 0.38,
  armor_clang: 0.60,
  dizzy_spin: 0.80,
  projector_click: 0.40,
  camera_shutter: 0.24,
  price_ping: 0.35,
};

/** カスタム WAV の `durationSec` / `durationInFrames` 省略時の既定再生尺（秒）。 */
export const SFX_CUSTOM_DEFAULT_DURATION_SEC = 2.0;

/**
 * Remotion ミックス時の既定 SFX 音量。
 * 統一音圧 WAV（Peak <= 0.78 / Active RMS <= 0.22）と組み合わせ、-14 LUFS ナレーションを
 * 潰さずクリップも起こさず抜けるバランスに設定（最終音圧は master_final.py で確定）。
 */
export const SFX_DEFAULT_VOLUME = 0.35;

export const SFX_RECOMMENDED_VOLUME_RANGE = {
  subtle: 0.24,
  default: SFX_DEFAULT_VOLUME,
  punch: 0.48,
  max: 0.65,
} as const;

const SFX_KINDS = new Set<string>(STANDARD_SFX_KINDS);

export function resolveSfxKind(kind: string): SfxKind | undefined {
  if (SFX_KINDS.has(kind)) return kind as SfxKind;
  if (Object.hasOwn(LEGACY_SFX_ALIASES, kind)) {
    return LEGACY_SFX_ALIASES[kind as keyof typeof LEGACY_SFX_ALIASES];
  }
  return undefined;
}

/** 標準 20 種（または互換エイリアス）の `studio/public` 相対パス（`sfx/<kind>.wav`）を返す。 */
export function resolveStandardSfxSrc(kind: SfxInputKind): string {
  const resolved = resolveSfxKind(kind) ?? kind;
  return `sfx/${resolved}.wav`;
}
