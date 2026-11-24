import { Easing, interpolate, spring, staticFile } from 'remotion';
import type { StickmanRuntimeShot } from './types';

/**
 * 数値を 0.0〜1.0 にクランプする（NaN / Infinity 安全）。
 */
export const clamp01 = (v: number): number => {
  if (!Number.isFinite(v)) {
    return 0;
  }
  return Math.max(0, Math.min(1, v));
};

/**
 * range=[fromSec, toSec] を out=[fromVal, toVal] へ安全にクランプ補間する。
 */
export const clampLerp = (
  sec: number,
  range: [number, number],
  out: [number, number],
): number => {
  const [in0, in1] = range;
  const [out0, out1] = out;
  if (!Number.isFinite(sec) || !Number.isFinite(in0) || !Number.isFinite(in1)) {
    return out0;
  }
  if (in1 <= in0) {
    return sec >= in1 ? out1 : out0;
  }
  return interpolate(sec, [in0, in1], [out0, out1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

/**
 * 指定時刻 at から発火する spring 値（0→1付近）を返す。
 */
export const snapAt = (
  sec: number,
  at: number,
  fps = 30,
  stiffness = 440,
  damping = 22,
  mass = 0.6,
): number => {
  if (!Number.isFinite(sec) || !Number.isFinite(at) || sec < at) {
    return 0;
  }
  const safeFps = Math.max(1, fps);
  return spring({
    frame: Math.max(0, (sec - at) * safeFps),
    fps: safeFps,
    config: { stiffness, damping, mass },
  });
};

/**
 * ビート配列から指定インデックスの絶対時刻（秒）を取得する。
 */
export const beatAt = (
  beats: readonly number[] | undefined,
  index: number,
  fallbackSec: number,
): number => {
  if (!beats || beats.length === 0) {
    return fallbackSec;
  }
  const safeIdx = Math.max(0, Math.min(beats.length - 1, Math.trunc(index)));
  const val = beats[safeIdx];
  return Number.isFinite(val) ? val : fallbackSec;
};

/**
 * startSec〜endSec 区間の進行度（0.0〜1.0）を返す。
 * interpolate の inputRange 単調増加を Math.max(startSec + 0.001, endSec) で保証する。
 */
export const beatProgress = (
  sec: number,
  startSec: number,
  endSec: number,
  eased = true,
): number => {
  if (!Number.isFinite(sec) || !Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    return 0;
  }
  const safeEnd = Math.max(startSec + 0.001, endSec);
  const raw = clamp01(
    interpolate(sec, [startSec, safeEnd], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  return eased ? Easing.inOut(Easing.cubic)(raw) : raw;
};

/**
 * ショット内のフレーズ／ビート時刻配列を解決する（未指定時は 1.5〜2.5 秒刻み目安で自動配置）。
 */
export const resolveShotBeats = (
  startSec: number,
  endSec: number,
  beats?: readonly number[],
): number[] => {
  if (beats && beats.length > 0) {
    return [...beats];
  }
  const dur = Math.max(0.2, endSec - startSec);
  if (dur <= 3.2) {
    return [startSec + 0.08, startSec + dur * 0.48];
  }
  const step = Math.min(2.3, Math.max(1.5, dur / 3));
  const out: number[] = [startSec + 0.08];
  let cursor = startSec + step;
  while (cursor < endSec - 0.35) {
    out.push(Number(cursor.toFixed(3)));
    cursor += step;
  }
  return out;
};

/**
 * ショット先頭 startSec 基準の相対ビート時刻配列（秒）を返す。
 */
export const resolveRelativeBeats = (shot: StickmanRuntimeShot): number[] => {
  const absBeats = resolveShotBeats(shot.startSec, shot.endSec, shot.beatTimesSec);
  return absBeats.map((b) => Number(Math.max(0, b - shot.startSec).toFixed(4)));
};

const KANJI_DIGIT_VALUE: Record<string, number> = {
  '〇': 0,
  '一': 1,
  '二': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
};

const KANJI_UNIT_VALUE: Record<string, number> = {
  '十': 10,
  '百': 100,
  '千': 1000,
};

const parseKanjiNumeralToken = (token: string): string => {
  if (!/[十百千]/.test(token)) {
    return [...token].map((ch) => String(KANJI_DIGIT_VALUE[ch] ?? ch)).join('');
  }
  let total = 0;
  let current = 0;
  for (const ch of token) {
    if (ch in KANJI_DIGIT_VALUE) {
      current = KANJI_DIGIT_VALUE[ch];
    } else if (ch in KANJI_UNIT_VALUE) {
      const unit = KANJI_UNIT_VALUE[ch];
      total += (current === 0 ? 1 : current) * unit;
      current = 0;
    }
  }
  total += current;
  return String(total);
};

const STRIP_NOISE_RE = /[\s、。！？・「」『』（）()【】[\]:：\-—~〜!?,.'"\u2026%％¥$円]/;

const katakanaToHiragana = (ch: string): string => {
  const code = ch.charCodeAt(0);
  if (code >= 0x30a1 && code <= 0x30f6) {
    return String.fromCharCode(code - 0x60);
  }
  return ch;
};

/**
 * 文字列を正規化し、正規化文字列と元インデックス対応表（normToOrig）を返す。
 */
const normalizeWithIndexMap = (
  raw: string,
): { norm: string; normToOrig: number[] } => {
  const chars = [...String(raw || '')];
  const normChars: string[] = [];
  const normToOrig: number[] = [];
  let idx = 0;

  while (idx < chars.length) {
    const ch = chars[idx];
    if (ch in KANJI_DIGIT_VALUE || ch in KANJI_UNIT_VALUE) {
      const start = idx;
      let token = '';
      while (
        idx < chars.length &&
        (chars[idx] in KANJI_DIGIT_VALUE || chars[idx] in KANJI_UNIT_VALUE)
      ) {
        token += chars[idx];
        idx += 1;
      }
      const digits = parseKanjiNumeralToken(token);
      for (const d of digits) {
        normChars.push(d);
        normToOrig.push(start);
      }
      continue;
    }

    const nfkc = ch.normalize('NFKC').toLowerCase();
    for (const subCh of nfkc) {
      if (!STRIP_NOISE_RE.test(subCh)) {
        normChars.push(katakanaToHiragana(subCh));
        normToOrig.push(idx);
      }
    }
    idx += 1;
  }

  return { norm: normChars.join(''), normToOrig };
};

const joinShotSubtitleText = (shot: StickmanRuntimeShot): string => {
  const parts: string[] = [];
  if (shot.subtitle) {
    if (shot.subtitle.line1) parts.push(shot.subtitle.line1);
    if (shot.subtitle.line2) parts.push(shot.subtitle.line2);
  }
  if (Array.isArray(shot.subtitleSegments)) {
    for (const seg of shot.subtitleSegments) {
      if (seg?.line1) parts.push(seg.line1);
      if (seg?.line2) parts.push(seg.line2);
    }
  }
  return parts.join('');
};

const safeNonNeg = (v: number): number =>
  Number.isFinite(v) ? Number(Math.max(0, v).toFixed(4)) : 0;

/**
 * 実音声アライメント（ElevenLabs 文字単位タイムスタンプ）から語・フレーズの
 * ショット内相対開始秒（秒）を解決する cue() 関数を生成する。
 */
export const createShotCueResolver = (
  shot: StickmanRuntimeShot,
): ((phrase: string, fallbackSec?: number) => number) => {
  const shotDur = Math.max(0.1, shot.durationSec || shot.endSec - shot.startSec || 1);
  const align = shot.alignment;
  const alignChars = align?.characters ?? [];
  const alignStarts = align?.charStartSec ?? [];
  const alignRawText = alignChars.length > 0 ? alignChars.join('') : align?.text ?? '';
  const alignNormInfo = alignRawText ? normalizeWithIndexMap(alignRawText) : null;

  const subtitleText = joinShotSubtitleText(shot);
  const subtitleNormInfo = subtitleText ? normalizeWithIndexMap(subtitleText) : null;

  const narrationText = String(shot.narrationJa || '');
  const narrationNormInfo = narrationText ? normalizeWithIndexMap(narrationText) : null;

  const relBeats = resolveRelativeBeats(shot);

  const timeFromAlignCharIdx = (origIdx: number): number | undefined => {
    if (alignStarts.length === 0) return undefined;
    const clamped = Math.max(0, Math.min(alignStarts.length - 1, origIdx));
    const t = alignStarts[clamped];
    return Number.isFinite(t) ? safeNonNeg(t) : undefined;
  };

  return (phrase: string, fallbackSec?: number): number => {
    const safeFallback = safeNonNeg(fallbackSec ?? 0);
    const rawQuery = String(phrase || '').trim();
    if (!rawQuery) {
      return safeFallback;
    }

    const queryNorm = normalizeWithIndexMap(rawQuery).norm;

    // 1. alignment 生テキストへの完全部分一致
    if (alignRawText && alignStarts.length > 0) {
      const exactIdx = alignRawText.indexOf(rawQuery);
      if (exactIdx >= 0) {
        const resolved = timeFromAlignCharIdx(exactIdx);
        if (resolved !== undefined) return resolved;
      }

      // 2. alignment 正規化テキストへの完全部分一致
      if (alignNormInfo && queryNorm) {
        const normIdx = alignNormInfo.norm.indexOf(queryNorm);
        if (normIdx >= 0) {
          const origIdx = alignNormInfo.normToOrig[normIdx] ?? 0;
          const resolved = timeFromAlignCharIdx(origIdx);
          if (resolved !== undefined) return resolved;
        }

        // 3. alignment 正規化テキストへの前方プレフィックス一致（「まとめ買い」→「まとめて買った」等）
        if (queryNorm.length >= 2) {
          const minPref = Math.max(2, Math.ceil(queryNorm.length * 0.5));
          for (let plen = queryNorm.length - 1; plen >= minPref; plen -= 1) {
            const prefix = queryNorm.slice(0, plen);
            const pIdx = alignNormInfo.norm.indexOf(prefix);
            if (pIdx >= 0) {
              const origIdx = alignNormInfo.normToOrig[pIdx] ?? 0;
              const resolved = timeFromAlignCharIdx(origIdx);
              if (resolved !== undefined) return resolved;
            }
          }
        }
      }
    }

    // 4. 字幕テキスト経由の線形写像フォールバック（読み仮名/漢字差吸収：「3冊」vs「さんさつ」）
    if (subtitleNormInfo && queryNorm && subtitleNormInfo.norm.length > 0) {
      let subIdx = subtitleNormInfo.norm.indexOf(queryNorm);
      if (subIdx < 0 && queryNorm.length >= 2) {
        const minPref = Math.max(2, Math.ceil(queryNorm.length * 0.5));
        for (let plen = queryNorm.length - 1; plen >= minPref; plen -= 1) {
          const pIdx = subtitleNormInfo.norm.indexOf(queryNorm.slice(0, plen));
          if (pIdx >= 0) {
            subIdx = pIdx;
            break;
          }
        }
      }
      if (subIdx >= 0) {
        const ratio = Math.max(0, Math.min(1, subIdx / Math.max(1, subtitleNormInfo.norm.length)));
        if (alignStarts.length > 0) {
          const mappedIdx = Math.min(
            alignStarts.length - 1,
            Math.round(ratio * Math.max(0, alignStarts.length - 1)),
          );
          const resolved = timeFromAlignCharIdx(mappedIdx);
          if (resolved !== undefined) return resolved;
        }
        return safeNonNeg(ratio * shotDur);
      }
    }

    // 5. alignment 未存在時のフォールバック：beats[].phraseJa → narrationJa 割合
    if (Array.isArray(shot.beats) && shot.beats.length > 0) {
      for (let i = 0; i < shot.beats.length; i += 1) {
        const b = shot.beats[i];
        const bPhrase = String(b?.phraseJa || '');
        if (!bPhrase) continue;
        const bNorm = normalizeWithIndexMap(bPhrase).norm;
        if (
          bPhrase.includes(rawQuery) ||
          (queryNorm && bNorm && (bNorm.includes(queryNorm) || queryNorm.includes(bNorm)))
        ) {
          if (i < relBeats.length) {
            return safeNonNeg(relBeats[i]);
          }
        }
      }
    }

    if (narrationNormInfo && queryNorm && narrationNormInfo.norm.length > 0) {
      const nIdx = narrationNormInfo.norm.indexOf(queryNorm);
      if (nIdx >= 0) {
        const ratio = Math.max(0, Math.min(1, nIdx / Math.max(1, narrationNormInfo.norm.length)));
        return safeNonNeg(ratio * shotDur);
      }
    }

    return safeFallback;
  };
};

/**
 * 相対アセットパス（studio/public/ 配下）を staticFile() へ変換し、外部URL/データURIはそのまま返す。
 */
export const resolveStickmanMediaSrc = (src: string): string => {
  if (/^(https?:|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
};
