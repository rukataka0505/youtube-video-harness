import React from 'react';
import { useVideoConfig } from 'remotion';
import {
  GrainLayer,
  MediaBackdropPlate,
  SubtitleCalm,
  isVideoMediaSrc,
} from '../_materials';
import { clamp01 } from './beatUtils';
import {
  STICKMAN_MEDIA_BACKDROP_DEFAULTS,
  normalizeStickmanMediaBackdrop,
  resolveMediaBackdropTheme,
  type StagePolarity,
  type StickmanMediaBackdropConfig,
  type StickmanRuntimeShot,
} from './types';

const HEX6_RE = /^#([0-9a-f]{6})$/i;

/** URL・パスが動画素材（mp4 / mov / webm / m4v）かどうかを判定する。 */
export const isStickmanVideoSrc = isVideoMediaSrc;

/** polarity に応じた暗幕オーバーレイの既定 6 桁 hex カラーを返す。 */
export const resolveMediaBackdropDimColor = (
  polarity: StagePolarity,
  customDimColor?: string,
): string => {
  if (customDimColor && customDimColor.trim().length > 0) {
    return customDimColor.trim();
  }
  switch (polarity) {
    case 'blueprint':
      return '#06142A';
    case 'wood_desk':
      return '#140A04';
    case 'kraft_cork':
      return '#1A0E06';
    default:
      return '#050608';
  }
};

const isSameBackdropTrack = (
  a: StickmanMediaBackdropConfig | undefined,
  aPolarity: StagePolarity | undefined,
  b: StickmanMediaBackdropConfig | undefined,
  bPolarity: StagePolarity | undefined,
): boolean => {
  if (!a || !b) {
    return false;
  }
  return (
    a.assetId === b.assetId &&
    aPolarity === bPolarity &&
    (a.trimBeforeSec ?? STICKMAN_MEDIA_BACKDROP_DEFAULTS.trimBeforeSec) ===
      (b.trimBeforeSec ?? STICKMAN_MEDIA_BACKDROP_DEFAULTS.trimBeforeSec) &&
    (a.playbackRate ?? STICKMAN_MEDIA_BACKDROP_DEFAULTS.playbackRate) ===
      (b.playbackRate ?? STICKMAN_MEDIA_BACKDROP_DEFAULTS.playbackRate) &&
    (a.loop ?? STICKMAN_MEDIA_BACKDROP_DEFAULTS.loop) ===
      (b.loop ?? STICKMAN_MEDIA_BACKDROP_DEFAULTS.loop)
  );
};

export interface MediaBackdropBlock {
  startIdx: number;
  endIdx: number;
  startSec: number;
  endSec: number;
  config: StickmanMediaBackdropConfig;
}

export interface MediaBackdropIntermissionAnchor {
  firstShotChunkId?: string;
  cutSec: number;
}

/**
 * 連続するショットで同一の mediaBackdrop（同一 assetId・polarity・trimBeforeSec・playbackRate・loop）が
 * 指定されている区間を 1 ブロックとして結合し、動画再生・微ズームがショット境界で途切れないようにする。
 * 章間アイキャッチ直後のブロックは cutSec を開始点にしてアイキャッチ明けのちらつきを防ぐ。
 */
export const resolveMediaBackdropBlock = (
  shots: readonly StickmanRuntimeShot[],
  activeIndex: number,
  intermissions: readonly MediaBackdropIntermissionAnchor[] = [],
): MediaBackdropBlock | undefined => {
  const activeShot = shots[activeIndex];
  if (!activeShot) {
    return undefined;
  }
  const activeCfg = normalizeStickmanMediaBackdrop(activeShot.mediaBackdrop);
  if (!activeCfg) {
    return undefined;
  }
  const activePolarity = activeShot.polarity ?? 'black';

  let startIdx = activeIndex;
  while (startIdx > 0) {
    const boundaryShot = shots[startIdx];
    if (intermissions.some((im) => im.firstShotChunkId === boundaryShot?.chunkId)) {
      break;
    }
    const prevShot = shots[startIdx - 1];
    const prevCfg = normalizeStickmanMediaBackdrop(prevShot?.mediaBackdrop);
    if (!isSameBackdropTrack(prevCfg, prevShot?.polarity ?? 'black', activeCfg, activePolarity)) {
      break;
    }
    startIdx -= 1;
  }

  let endIdx = activeIndex;
  while (endIdx + 1 < shots.length) {
    const nextShot = shots[endIdx + 1];
    if (intermissions.some((im) => im.firstShotChunkId === nextShot?.chunkId)) {
      break;
    }
    const nextCfg = normalizeStickmanMediaBackdrop(nextShot?.mediaBackdrop);
    if (!isSameBackdropTrack(nextCfg, nextShot?.polarity ?? 'black', activeCfg, activePolarity)) {
      break;
    }
    endIdx += 1;
  }

  const startShot = shots[startIdx];
  const endShot = shots[endIdx];
  const leadingIntermission = intermissions.find(
    (im) => im.firstShotChunkId === startShot?.chunkId,
  );
  const startSec = leadingIntermission ? leadingIntermission.cutSec : startShot.startSec;
  const endSec = Math.max(startSec + 0.1, endShot.endSec);

  return {
    startIdx,
    endIdx,
    startSec,
    endSec,
    config: activeCfg,
  };
};

export interface StickmanMediaBackdropLayerProps {
  /** 解決済みメディア URL（resolveStickmanMediaSrc 済み） */
  src: string;
  /** 動画全体の現在秒（絶対秒） */
  sec: number;
  /** この背景ブロックの開始秒（絶対秒） */
  fromSec: number;
  /** この背景ブロックの終了秒（絶対秒・ズーム／パン終点） */
  toSec?: number;
  polarity?: StagePolarity;
  dim?: number;
  dimColor?: string;
  vignette?: number;
  blurPx?: number;
  filter?: string;
  zoom?: readonly [number, number];
  pan?: readonly [number, number];
  trimBeforeSec?: number;
  playbackRate?: number;
  loop?: boolean;
  objectPosition?: string;
  mirror?: boolean;
  subtitleCalmStrength?: number;
  grainOpacity?: number;
  /** 動画プレビュー・テスト向けに fps を明示上書きする場合に使用 */
  fps?: number;
  style?: React.CSSProperties;
}

/**
 * stickman-collage 用：暗幕フィルター付き全面実写動画・画像背景レイヤー。
 * - 動画・画像プレート描画は共通 MediaBackdropPlate に委譲し、
 *   暗幕・ビネット・微ズーム・微グレイン・下段 SubtitleCalm を適用する。
 * - 推奨組み合わせは black / blueprint（暗極性）。
 */
export const StickmanMediaBackdropLayer: React.FC<StickmanMediaBackdropLayerProps> = ({
  src,
  sec,
  fromSec,
  toSec,
  polarity = 'black',
  dim = STICKMAN_MEDIA_BACKDROP_DEFAULTS.dim,
  dimColor,
  vignette = STICKMAN_MEDIA_BACKDROP_DEFAULTS.vignette,
  blurPx = STICKMAN_MEDIA_BACKDROP_DEFAULTS.blurPx,
  filter = STICKMAN_MEDIA_BACKDROP_DEFAULTS.filter,
  zoom = STICKMAN_MEDIA_BACKDROP_DEFAULTS.zoom,
  pan = STICKMAN_MEDIA_BACKDROP_DEFAULTS.pan,
  trimBeforeSec = STICKMAN_MEDIA_BACKDROP_DEFAULTS.trimBeforeSec,
  playbackRate = STICKMAN_MEDIA_BACKDROP_DEFAULTS.playbackRate,
  loop = STICKMAN_MEDIA_BACKDROP_DEFAULTS.loop,
  objectPosition = STICKMAN_MEDIA_BACKDROP_DEFAULTS.objectPosition,
  mirror = STICKMAN_MEDIA_BACKDROP_DEFAULTS.mirror,
  subtitleCalmStrength,
  grainOpacity = STICKMAN_MEDIA_BACKDROP_DEFAULTS.grainOpacity,
  fps: fpsProp,
  style,
}) => {
  const { fps: videoFps } = useVideoConfig();
  const safeFps = Math.max(1, fpsProp ?? videoFps);
  const resolvedDimColor = resolveMediaBackdropDimColor(polarity, dimColor);
  const theme = resolveMediaBackdropTheme(polarity);
  const calmHex = HEX6_RE.test(theme.calmColor) ? theme.calmColor : '#050608';
  const calmStrength = subtitleCalmStrength ?? theme.calmStrength;
  const safeGrain = clamp01(grainOpacity);

  return (
    <MediaBackdropPlate
      src={src}
      sec={sec}
      fromSec={fromSec}
      toSec={toSec}
      fps={safeFps}
      trimBeforeSec={trimBeforeSec}
      playbackRate={playbackRate}
      loop={loop}
      filter={filter}
      blurPx={blurPx}
      zoom={zoom}
      pan={pan}
      objectPosition={objectPosition}
      mirror={mirror}
      dim={dim}
      dimColor={resolvedDimColor}
      vignette={vignette}
      style={style}
    >
      {safeGrain > 0 ? <GrainLayer opacity={safeGrain} blend="screen" useBaked /> : null}
      <SubtitleCalm color={calmHex} strength={calmStrength} from={820} />
    </MediaBackdropPlate>
  );
};
