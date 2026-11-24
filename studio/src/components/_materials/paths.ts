/* ========================================================================== */
/* フォーマット中立：純粋 SVG パス数式・物理パルス・SVG ID サニタイズ               */
/*  ※具体的な名詞・フォント・時刻契約・キャラクター概念を一切持たない。             */
/* ========================================================================== */

export interface Pt {
  x: number;
  y: number;
}

export type ImpulseDecayFn = (dt: number, index: number, at: number) => number;

/** 決定論的ハッシュ乱数（0.0〜1.0） */
export const hashRnd = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};

/** 有限数値を小数2桁に丸めた文字列へ整形 */
export const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '0.00');

/** SVG id 属性用に安全な文字種のみへサニタイズ */
export const sanitizeSvgId = (raw: string): string =>
  raw.replace(/[^a-zA-Z0-9_-]/g, '');

/**
 * 複数時刻の衝撃（着地沈み込み・連鎖揺れ等）を重ね合わせる。
 * 第3引数に数値を与えると `amp * exp(-decay * dt)` の和、
 * 関数 `(dt, index, at) => number` を与えると任意減衰波形の和を返す。
 */
export const impulses = (
  sec: number,
  times: readonly number[],
  ampOrFn: number | ImpulseDecayFn = 1,
  decay = 7,
): number => {
  let sum = 0;
  for (let i = 0; i < times.length; i += 1) {
    const at = times[i];
    if (sec >= at) {
      const dt = sec - at;
      sum +=
        typeof ampOrFn === 'function'
          ? ampOrFn(dt, i, at)
          : ampOrFn * Math.exp(-decay * dt);
    }
  }
  return sum;
};

/** わずかに歪んだ手描き矩形 SVG パス */
export const rr = (
  x: number,
  y: number,
  w: number,
  h: number,
  j = 2,
  seed = 1,
): string => {
  const o = (k: number) => (hashRnd(seed * 13 + k) - 0.5) * 2 * j;
  return [
    `M ${x + o(1)} ${y + o(2)}`,
    `Q ${x + w / 2} ${y + o(3) * 1.4} ${x + w + o(4)} ${y + o(5)}`,
    `Q ${x + w + o(6) * 1.4} ${y + h / 2} ${x + w + o(7)} ${y + h + o(8)}`,
    `Q ${x + w / 2} ${y + h + o(9) * 1.4} ${x + o(10)} ${y + h + o(11)}`,
    `Q ${x + o(12) * 1.4} ${y + h / 2} ${x + o(1)} ${y + o(2)} Z`,
  ].join(' ');
};

/** 手描きの円 SVG パス（4ベジェ・半径に微小ムラ） */
export const ring = (cx: number, cy: number, r: number, seed = 1): string => {
  const k = 0.5523;
  const [a, b, c, d] = [0, 1, 2, 3].map(
    (i) => r * (1 + (hashRnd(seed * 7 + i) - 0.5) * 0.06),
  );
  return [
    `M ${cx + a} ${cy}`,
    `C ${cx + a} ${cy + b * k} ${cx + b * k} ${cy + b} ${cx} ${cy + b}`,
    `C ${cx - c * k} ${cy + b} ${cx - c} ${cy + c * k} ${cx - c} ${cy}`,
    `C ${cx - c} ${cy - d * k} ${cx - d * k} ${cy - d} ${cx} ${cy - d}`,
    `C ${cx + a * k} ${cy - d} ${cx + a} ${cy - a * k} ${cx + a} ${cy} Z`,
  ].join(' ');
};

/** 少しだけ弓なりに曲がった手引き線 SVG パス */
export const handLine = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bow = 3,
  seed = 1,
): string => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  const b = bow * (hashRnd(seed) - 0.5) * 2;
  return `M ${x1} ${y1} Q ${mx - (dy / len) * b} ${my + (dx / len) * b} ${x2} ${y2}`;
};

/** ちぎり紙の矩形 SVG パス（下辺のギザをやや深めに取る） */
export const tornRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  seed = 7,
  jag = 6,
): string => {
  const pts: string[] = [];
  const n = 26;
  for (let i = 0; i <= n; i += 1) {
    pts.push(
      `${f2(x + (w * i) / n)} ${f2(y + (hashRnd(seed + i) - 0.5) * jag * 0.5)}`,
    );
  }
  for (let i = 1; i <= 16; i += 1) {
    pts.push(
      `${f2(x + w + (hashRnd(seed + 40 + i) - 0.5) * jag * 0.5)} ${f2(y + (h * i) / 16)}`,
    );
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    pts.push(
      `${f2(x + (w * i) / n)} ${f2(y + h + (hashRnd(seed + 80 + i) - 0.5) * jag * 2.4)}`,
    );
  }
  for (let i = 15; i >= 1; i -= 1) {
    pts.push(
      `${f2(x + (hashRnd(seed + 120 + i) - 0.5) * jag * 0.5)} ${f2(y + (h * i) / 16)}`,
    );
  }
  return `M ${pts.join(' L ')} Z`;
};

/** 2点間をたわんで結ぶ紐・赤糸の二次ベジェ SVG パス */
export const sag = (a: Pt, b: Pt, s: number): string =>
  `M ${a.x} ${a.y} Q ${f2((a.x + b.x) / 2)} ${f2((a.y + b.y) / 2 + s * 2)} ${b.x} ${b.y}`;
