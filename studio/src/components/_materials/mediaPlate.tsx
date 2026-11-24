import React from 'react';
import { AbsoluteFill, Html5Video, Img, OffthreadVideo, Sequence } from 'remotion';

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i;
const HEX6_RE = /^#([0-9a-f]{6})$/i;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const hexToRgbTuple = (hex: string): [number, number, number] => {
  const m = HEX6_RE.exec(hex.trim());
  if (!m) {
    return [5, 6, 8];
  }
  const v = Number.parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** URL・パスが動画素材（mp4 / mov / webm / m4v）かどうかを判定する。 */
export const isVideoMediaSrc = (src: string): boolean => VIDEO_EXT_RE.test(src);

export interface MediaBackdropPlateProps {
  src: string;
  /** 現在の絶対時刻（秒） */
  sec: number;
  /** 再生・ズーム開始時刻（秒） */
  fromSec: number;
  /** ズーム・パン進行の終点時刻（秒・既定 fromSec + 8） */
  toSec?: number;
  /** フレームレート（既定 30） */
  fps?: number;
  /** 動画のトリム開始秒（既定 0） */
  trimBeforeSec?: number;
  /** 動画の再生速度（既定 1） */
  playbackRate?: number;
  /** 動画が区間より短い場合にループ再生するか（既定 false） */
  loop?: boolean;
  /** CSS filter（グレード・明度調整） */
  filter?: string;
  /** 背景ぼかし px（> 0 のとき filter へ合成・既定 0） */
  blurPx?: number;
  /** 微ズーム範囲 [start, end]（既定 [1.02, 1.1]） */
  zoom?: readonly [number, number];
  /** パン [startX, endX] px（既定 [0, 0]） */
  pan?: readonly [number, number];
  /** object-position（既定 '50% 50%'） */
  objectPosition?: string;
  /** 左右反転（既定 false） */
  mirror?: boolean;
  /** 0..1 の減光（暗幕オーバーレイ・既定 0） */
  dim?: number;
  /** 暗幕・ビネットの基調色（6桁 hex 等・既定 '#050608'） */
  dimColor?: string;
  /** 外枠の背景色（省略時は dimColor 指定時に dimColor、未指定時は '#07080A'） */
  backgroundColor?: string;
  /** 0..1 の周辺ビネット強度（既定 0） */
  vignette?: number;
  style?: React.CSSProperties;
  /** 暗幕・ビネットの上へ重ねる追加レイヤー（GrainLayer / SubtitleCalm 等） */
  children?: React.ReactNode;
}

/**
 * plan_e / stickman_collage 共通の全面実写動画・画像プレート。
 * - 動画（mp4 / mov / webm / m4v）は Sequence 内で再生（既定 OffthreadVideo、loop 指定時は Html5Video loop）。
 * - 静止画は Img に微ズーム・パンを掛けて描画。
 * - CSS filter / blurPx / 暗幕オーバーレイ / 周辺ビネットを一元化する。
 */
export const MediaBackdropPlate: React.FC<MediaBackdropPlateProps> = ({
  src,
  sec,
  fromSec,
  toSec,
  fps = 30,
  trimBeforeSec = 0,
  playbackRate = 1,
  loop = false,
  filter = 'contrast(1.08) saturate(0.92) brightness(0.86)',
  blurPx = 0,
  zoom = [1.02, 1.1],
  pan = [0, 0],
  objectPosition = '50% 50%',
  mirror = false,
  dim = 0,
  dimColor,
  backgroundColor,
  vignette = 0,
  style,
  children,
}) => {
  const safeFps = Math.max(1, fps);
  const endSec = toSec ?? fromSec + 8;
  const u = clamp01((sec - fromSec) / Math.max(0.1, endSec - fromSec));
  const scale = lerp(zoom[0], zoom[1], u);
  const tx = lerp(pan[0], pan[1], u);
  const combinedFilter = blurPx > 0 ? `${filter} blur(${blurPx}px)` : filter;

  const trimmedDimColor = dimColor && dimColor.trim().length > 0 ? dimColor.trim() : undefined;
  const resolvedDimColor = trimmedDimColor ?? '#050608';
  const resolvedBgColor = backgroundColor ?? trimmedDimColor ?? '#07080A';
  const [vr, vg, vb] = hexToRgbTuple(resolvedDimColor);
  const safeDim = clamp01(dim);
  const safeVignette = clamp01(vignette);

  const fromFrame = Math.max(0, Math.floor(fromSec * safeFps));
  const trimBeforeFrames = Math.max(0, Math.round(trimBeforeSec * safeFps));
  const trimBeforeProp = trimBeforeFrames > 0 ? trimBeforeFrames : undefined;
  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition,
  };

  const mediaNode = isVideoMediaSrc(src) ? (
    <Sequence from={fromFrame} layout="none">
      {loop ? (
        <Html5Video
          src={src}
          muted
          loop
          playbackRate={playbackRate}
          trimBefore={trimBeforeProp}
          style={mediaStyle}
        />
      ) : (
        <OffthreadVideo
          src={src}
          muted
          playbackRate={playbackRate}
          trimBefore={trimBeforeProp}
          style={mediaStyle}
        />
      )}
    </Sequence>
  ) : (
    <Img src={src} style={mediaStyle} />
  );

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: resolvedBgColor, ...style }}>
      <AbsoluteFill
        style={{
          transform: `translateX(${tx.toFixed(1)}px) scale(${scale.toFixed(4)})${mirror ? ' scaleX(-1)' : ''}`,
          filter: combinedFilter,
        }}
      >
        {mediaNode}
      </AbsoluteFill>
      {safeDim > 0 ? (
        <AbsoluteFill
          style={{
            backgroundColor: resolvedDimColor,
            opacity: safeDim,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {safeVignette > 0 ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            background: `radial-gradient(ellipse 84% 78% at 50% 46%, transparent 36%, rgba(${vr}, ${vg}, ${vb}, ${safeVignette.toFixed(3)}) 100%)`,
          }}
        />
      ) : null}
      {children}
    </AbsoluteFill>
  );
};
