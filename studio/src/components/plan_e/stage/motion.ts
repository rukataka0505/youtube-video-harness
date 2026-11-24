import { spring } from 'remotion';
export {
  handLine,
  impulses,
  ring,
  rr,
  sag,
  tornRect,
  type ImpulseDecayFn,
  type Pt,
} from '../../_materials';

/**
 * 案E 自由舞台の運動プリミティブ（純関数）。
 * 引数の時刻はすべて spec 時刻（秒）= `ctx.sec` / `ctx.cue()` / `ctx.beat()` と同じ座標系。
 * 「いつ」は語句アンカーから取り、「どれだけ・どう動くか」（相対オフセット・持続秒・振幅）は自由に書く。
 */

export const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/** 決定的な疑似乱数 0..1（seed が同じなら毎フレーム同じ値） */
export const rnd = (seed: number): number => {
  const x = Math.sin(seed * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
};

/** at から dur 秒で 0→1 に進む線形ランプ */
export const ramp = (sec: number, at: number, dur = 0.4): number =>
  clamp01((sec - at) / Math.max(0.001, dur));

export const easeOut = (u: number): number => 1 - Math.pow(1 - clamp01(u), 3);
export const easeInOut = (u: number): number => {
  const x = clamp01(u);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeBack = (u: number, overshoot = 1.7): number => {
  const x = clamp01(u);
  const c3 = overshoot + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + overshoot * Math.pow(x - 1, 2);
};

export const eo = (sec: number, at: number, dur = 0.4): number => easeOut(ramp(sec, at, dur));
export const eio = (sec: number, at: number, dur = 0.6): number => easeInOut(ramp(sec, at, dur));

/** at から発火するバネ（at 以前は 0）。押印・着地・出現の手触りに使う */
export const spr = (
  sec: number,
  at: number,
  fps = 30,
  config: { stiffness?: number; damping?: number; mass?: number } = {},
): number => {
  if (!Number.isFinite(sec) || sec < at) return 0;
  return spring({
    frame: (sec - at) * fps,
    fps,
    config: { stiffness: config.stiffness ?? 420, damping: config.damping ?? 20, mass: config.mass ?? 0.6 },
  });
};

/** 減衰振動（揺れ戻し・ぐらつき）。at 以前は 0 */
export const wob = (sec: number, at: number, amp: number, freq = 2.2, decay = 3.2): number =>
  sec < at ? 0 : amp * Math.exp(-decay * (sec - at)) * Math.sin((sec - at) * freq * Math.PI * 2);

/** 着地の押しつぶし量（1→0 の速い減衰） */
export const squash = (sec: number, at: number, decay = 9): number =>
  sec < at ? 0 : Math.exp(-decay * (sec - at)) * Math.cos((sec - at) * 16);

/** 重力放物線で a→b へ飛ぶ（lift は頂点の持ち上げ量 px） */
export const fly = (
  sec: number,
  at: number,
  dur: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
  lift = 120,
): { x: number; y: number; u: number } => {
  const u = ramp(sec, at, dur);
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) - lift * 4 * u * (1 - u), u };
};

/** 着弾シェイク（複数の着弾時刻を合成） */
export const shakeAt = (
  sec: number,
  impacts: readonly number[],
  amp = 12,
  decay = 9,
): { x: number; y: number; rot: number } => {
  let x = 0;
  let y = 0;
  let rot = 0;
  for (const t0 of impacts) {
    const dt = sec - t0;
    if (dt < 0 || dt > 0.6) continue;
    const env = amp * Math.exp(-decay * dt);
    x += env * Math.sin(dt * 71);
    y += env * 0.7 * Math.cos(dt * 57);
    rot += env * 0.03 * Math.sin(dt * 43);
  }
  return { x, y, rot };
};

/** at から dur 秒で from→to へ数え上げる（イーズアウト） */
export const countUp = (sec: number, at: number, dur: number, from: number, to: number): number =>
  lerp(from, to, eo(sec, at, dur));

/** i 番目の要素の出現時刻（at + i * step） */
export const stagger = (at: number, i: number, step = 0.08): number => at + i * step;

/** 7.5fps 相当で段付きに変わる値（紙・線のボイル用 seed） */
export const boilSeed = (frame: number, mod = 16, everyFrames = 4): number =>
  (Math.floor(frame / everyFrames) % mod) + 1;
