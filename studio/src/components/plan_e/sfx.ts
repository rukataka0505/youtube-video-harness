import { LEGACY_SFX_ALIASES, resolveSfxKind, resolveStandardSfxSrc } from '../sfx';
import type { PlanEProjectSpec, PlanESfxKind } from './types';

interface SfxCueEvent {
  kind: PlanESfxKind;
  timeSec: number;
  gain?: number;
}

/**
 * Plan E ビート SFX の音源パスを解決する。
 *
 * 1. エピソード個別マニフェスト（`sfxVariants` / `sfxMap`）が非空で登録されていればそれを優先（後方互換）。
 * 2. マニフェスト未定義または空（共通静的 SFX 運用）の場合は `studio/public/sfx/<resolved>.wav` を返す。
 */
export function resolvePlanESfxSource(
  spec: Pick<PlanEProjectSpec, 'sfxMap' | 'sfxVariants'>,
  kind: PlanESfxKind,
  occurrence = 0,
): string | undefined {
  const resolved = resolveSfxKind(kind);
  if (!resolved) return undefined;

  const hasExplicitManifest =
    (spec.sfxMap !== undefined && Object.keys(spec.sfxMap).length > 0) ||
    (spec.sfxVariants !== undefined && Object.keys(spec.sfxVariants).length > 0);

  if (!hasExplicitManifest) {
    return resolveStandardSfxSrc(resolved);
  }

  const sourceFor = (key: string) => {
    const variants = spec.sfxVariants?.[key];
    return (variants?.length ? variants[occurrence % variants.length] : undefined) || spec.sfxMap?.[key];
  };

  // 旧ビートは記録済みの音を使い、標準20種で発行したマニフェストでも再生する。
  const source = sourceFor(kind) ?? sourceFor(resolved);
  if (source || kind !== resolved) return source;

  // 標準20種へ更新した小道具の既定値を、旧エイリアスキーのみのマニフェストでも再生する。
  for (const [legacy, target] of Object.entries(LEGACY_SFX_ALIASES)) {
    if (target !== resolved) continue;
    const legacySource = sourceFor(legacy);
    if (legacySource) return legacySource;
  }
  return undefined;
}

/** 時刻順にビートを並べ、同じ解決種別の近接イベント（60ms 以内）をまとめる。 */
export function collectBeatSfxEvents(spec: PlanEProjectSpec): (SfxCueEvent & { src: string })[] {
  const candidates: SfxCueEvent[] = [];
  for (const scene of spec.scenes) {
    if (scene.glitchIntroSec && scene.glitchIntroSec > 0) {
      candidates.push({ kind: 'glitch_burst', timeSec: Math.max(0, scene.startSec), gain: 0.28 });
    }
    for (const beat of scene.beats ?? []) {
      if (beat.sfx === null) continue;
      candidates.push({ kind: beat.sfx, timeSec: Math.max(0, beat.timeSec), gain: beat.gain });
    }
  }

  candidates.sort((a, b) => a.timeSec - b.timeSec);
  const events: (SfxCueEvent & { src: string })[] = [];
  const lastTime = new Map<string, number>();
  const occurrences = new Map<PlanESfxKind, number>();
  for (const cue of candidates) {
    const canonicalKind = resolveSfxKind(cue.kind);
    if (!canonicalKind) continue;
    const previous = lastTime.get(canonicalKind);
    if (previous !== undefined && cue.timeSec - previous <= 0.06) continue;
    const occurrence = occurrences.get(cue.kind) ?? 0;
    const src = resolvePlanESfxSource(spec, cue.kind, occurrence);
    if (!src) continue;
    events.push({ ...cue, src });
    lastTime.set(canonicalKind, cue.timeSec);
    occurrences.set(cue.kind, occurrence + 1);
  }
  return events;
}
