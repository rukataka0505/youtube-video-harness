import React, { createContext, useContext } from 'react';
import { Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import {
  SFX_CUSTOM_DEFAULT_DURATION_SEC,
  SFX_DEFAULT_DURATION_SEC,
  SFX_DEFAULT_VOLUME,
  resolveSfxKind,
  resolveStandardSfxSrc,
  type SfxKind,
} from './sfx';

/**
 * ショットローカル秒を扱うテンプレート（ch1 StickmanCollageTemplate 等）が
 * 現在の起点時刻を供給するためのコンテキスト。
 *
 * - ch1: `StickmanCollageTemplate` が `<SfxTimeOriginProvider baseSec={shot.startSec}>` で包むため、
 *   シーン TSX 内の `<SfxCue kind="paper_snap" atSec={cue('語句')} />` が自動で全編フレームへ変換される。
 * - ch2: `PlanEMacroEconTemplate` の `ctx.cue()` はコンポジション基準（0 始まり）のため既定値 `baseSec = 0` のまま同期する。
 */
export interface SfxTimeOrigin {
  baseSec: number;
}

const SfxTimeOriginContext = createContext<SfxTimeOrigin>({ baseSec: 0 });

export interface SfxTimeOriginProviderProps {
  /** コンポジション基準の開始秒（既定 0） */
  baseSec: number;
  children: React.ReactNode;
}

export const SfxTimeOriginProvider: React.FC<SfxTimeOriginProviderProps> = ({
  baseSec,
  children,
}) => {
  const value = React.useMemo<SfxTimeOrigin>(
    () => ({ baseSec: Number.isFinite(baseSec) ? baseSec : 0 }),
    [baseSec],
  );
  return (
    <SfxTimeOriginContext.Provider value={value}>
      {children}
    </SfxTimeOriginContext.Provider>
  );
};

export type SfxCueSourceProps =
  | {
      /** 検証済み標準 20 種の型安全指定（`studio/public/sfx/<kind>.wav` を再生） */
      kind: SfxKind;
      src?: never;
    }
  | {
      /** エピソード固有カスタム WAV の `studio/public` 相対パス（例: `episodes/<slug>/sfx/<name>.wav`）または URL */
      src: string;
      kind?: never;
    };

export type SfxCueProps = SfxCueSourceProps & {
  /**
   * 発音開始フレーム。`atSec` より優先。
   * `timeSpace="local"`（既定）時は `SfxTimeOriginProvider` の起点を自動加算する。
   */
  from?: number;
  /**
   * 発音開始秒（`cue()` や `ctx.cue()` の返り値＋相対オフセットを直結）。
   * `from` 未指定時に `Math.round((originSec + atSec) * fps)` でフレームへ変換する。
   */
  atSec?: number;
  /**
   * `from` / `atSec` の座標系。
   * - `'local'`（既定）: `SfxTimeOriginProvider` の `baseSec` を加算（ch1 ローカル秒 / ch2 0 基準の両対応）
   * - `'global'`: 起点を加算せずコンポジション絶対位置として扱う
   */
  timeSpace?: 'local' | 'global';
  /** 再生区間長（フレーム）。省略時は `durationSec` または標準 20 種の最小必要尺を使用。 */
  durationInFrames?: number;
  /** 再生区間長（秒）。`durationInFrames` 省略時に使用。 */
  durationSec?: number;
  /** 再生音量（既定 `SFX_DEFAULT_VOLUME = 0.35`、推奨上限 `0.65`）。 */
  volume?: number;
  /** 再生速度（既定 `1`）。 */
  playbackRate?: number;
  /** WAV 内の頭出し開始オフセット（秒、既定 `0`）。 */
  startFromSec?: number;
  /** `true` のときは何もマウントしない。 */
  disabled?: boolean;
  /** Remotion Studio タイムライン表示用のラベル（任意）。 */
  name?: string;
};

function resolvePlayableSfxUrl(rawSrc: string): string {
  if (/^(https?:|data:|blob:|\/)/.test(rawSrc)) {
    return rawSrc;
  }
  return staticFile(rawSrc);
}

/**
 * 全フォーマット共通（ch1 `stickman_collage` / ch2 `planE_macro_econ`）のフレーム直結 SFX コンポーネント。
 *
 * - 標準 20 種（`kind`）とエピソード固有カスタム WAV（`src`）の両方に対応。
 * - 鳴る区間だけを `<Sequence layout="none">` でラップし、長尺動画（15〜25分）でのオーディオノード負荷を抑える。
 * - 統一音圧 WAV（`SFX_TARGET_PEAK=0.78`）＋既定 `volume=0.35` により、Remotion ミックス時のクリップを防ぎつつ
 *   後段 `master_final.py`（-14.0 LUFS / -1.4 dBTP）で安全に仕上げられる。
 */
export const SfxCue: React.FC<SfxCueProps> = (props) => {
  const { fps } = useVideoConfig();
  const origin = useContext(SfxTimeOriginContext);

  const {
    from,
    atSec,
    timeSpace = 'local',
    durationInFrames,
    durationSec,
    volume = SFX_DEFAULT_VOLUME,
    playbackRate = 1,
    startFromSec = 0,
    disabled = false,
    name,
  } = props;

  if (disabled || !Number.isFinite(volume) || volume <= 0) {
    return null;
  }

  const safeFps = Math.max(1, fps);
  const safeRate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  const originSec = timeSpace === 'local' ? origin.baseSec : 0;

  let rawStartFrame: number;
  if (from !== undefined) {
    if (!Number.isFinite(from)) return null;
    const originFrame = Math.round(originSec * safeFps);
    rawStartFrame = Math.round(originFrame + from);
  } else {
    const secVal = atSec ?? 0;
    if (!Number.isFinite(secVal)) return null;
    rawStartFrame = Math.round((originSec + secVal) * safeFps);
  }

  let resolvedSrcPath: string;
  let defaultDurSec: number;
  let defaultName: string;

  if (props.kind !== undefined) {
    const resolvedKind = resolveSfxKind(props.kind);
    if (!resolvedKind) return null;
    resolvedSrcPath = resolveStandardSfxSrc(resolvedKind);
    defaultDurSec = SFX_DEFAULT_DURATION_SEC[resolvedKind] / safeRate;
    defaultName = `sfx:${resolvedKind}`;
  } else {
    const trimmed = props.src.trim();
    if (!trimmed) return null;
    resolvedSrcPath = trimmed;
    defaultDurSec = SFX_CUSTOM_DEFAULT_DURATION_SEC / safeRate;
    const baseName = trimmed.split('/').pop() ?? trimmed;
    defaultName = `sfx:${baseName}`;
  }

  const rawDurFrames =
    durationInFrames !== undefined
      ? Math.round(durationInFrames)
      : Math.max(4, Math.ceil((durationSec ?? defaultDurSec) * safeFps));

  if (!Number.isFinite(rawDurFrames) || rawDurFrames <= 0) {
    return null;
  }

  // 開始フレームが負に食い込む場合は 0f から途中再生へ安全クリップし、完全に過去ならマウントしない
  const clippedBeforeFrames = rawStartFrame < 0 ? -rawStartFrame : 0;
  const effectiveFrom = Math.max(0, rawStartFrame);
  const effectiveDuration = rawDurFrames - clippedBeforeFrames;
  if (effectiveDuration <= 0) {
    return null;
  }

  const extraTrimFrames =
    Number.isFinite(startFromSec) && startFromSec > 0
      ? Math.round(startFromSec * safeFps)
      : 0;
  const trimBefore = extraTrimFrames + clippedBeforeFrames;

  return (
    <Sequence
      from={effectiveFrom}
      durationInFrames={effectiveDuration}
      layout="none"
      name={name ?? defaultName}
    >
      <Audio
        src={resolvePlayableSfxUrl(resolvedSrcPath)}
        volume={volume}
        playbackRate={safeRate}
        trimBefore={trimBefore > 0 ? trimBefore : undefined}
      />
    </Sequence>
  );
};
