import React, { useId } from 'react';
import { Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { f2, hashRnd, sanitizeSvgId } from './paths';

export const BAKED_GRAIN_TILE_FILE = 'backgrounds/grain_tile.png';

/* ========================================================================== */
/* フォーマット中立：共通質感レイヤ（ノイズ・グレイン・紙目凹凸・字幕帯静音化）     */
/* ========================================================================== */

export const useMaterialSid = (prefix: string): string =>
  `${prefix}-${sanitizeSvgId(useId())}`;

/** 7.5fps 等の決定論的ボイルシード（30fps 環境で 4 フレームごとに 1 更新） */
export const useMaterialBoilSeed = (boilFps = 7.5, mod = 16): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stepFrames = Math.max(1, Math.round(fps / Math.max(1, boilFps)));
  return (Math.floor(frame / stepFrames) % Math.max(1, mod)) + 1;
};

export interface NoiseLayerProps {
  vw?: number;
  vh?: number;
  freq: string;
  octaves?: number;
  seed?: number;
  type?: 'fractalNoise' | 'turbulence';
  matrix?: string;
  opacity: number;
  blend?: React.CSSProperties['mixBlendMode'];
  shiftX?: number;
  shiftY?: number;
  style?: React.CSSProperties;
}

export const NoiseLayer: React.FC<NoiseLayerProps> = ({
  vw = 480,
  vh = 270,
  freq,
  octaves = 2,
  seed = 1,
  type = 'fractalNoise',
  matrix,
  opacity,
  blend = 'normal',
  shiftX = 0,
  shiftY = 0,
  style,
}) => {
  const id = useMaterialSid('nz');
  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity,
        mixBlendMode: blend,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type={type}
            baseFrequency={freq}
            numOctaves={octaves}
            seed={seed}
            result="n"
          />
          {matrix ? (
            <feColorMatrix in="n" type="matrix" values={matrix} />
          ) : (
            <feColorMatrix in="n" type="saturate" values="0" />
          )}
        </filter>
      </defs>
      <g transform={`translate(${f2(-shiftX)} ${f2(-shiftY)})`}>
        <rect x={shiftX} y={shiftY} width={vw} height={vh} filter={`url(#${id})`} />
      </g>
    </svg>
  );
};

export interface GrainLayerProps {
  opacity: number;
  blend?: React.CSSProperties['mixBlendMode'];
  freq?: number;
  animated?: boolean;
  /** 事前ベイク済みグレイン PNG タイルを使用するか（既定 true） */
  useBaked?: boolean;
}

/** 事前ベイク用：640x360 グレインタイル（320x180 の 2x2 倍面積・同一周波数） */
export const GrainTileStatic: React.FC<{ freq?: number; seed?: number }> = ({
  freq = 0.8,
  seed = 1,
}) => (
  <NoiseLayer
    vw={640}
    vh={360}
    freq={String(freq)}
    octaves={2}
    seed={seed}
    opacity={1}
    blend="normal"
  />
);

/** 7.5fps で種が変わるフィルムグレイン／紙目ボイル */
export const GrainLayer: React.FC<GrainLayerProps> = ({
  opacity,
  blend = 'multiply',
  freq = 0.8,
  animated = true,
  useBaked = true,
}) => {
  const boilSeed = useMaterialBoilSeed(7.5, 24);
  const seed = animated ? boilSeed : 1;

  if (useBaked) {
    const ox = Math.floor(hashRnd(seed * 31 + 7) * 1920);
    const oy = Math.floor(hashRnd(seed * 47 + 13) * 1080);
    const flipX = seed % 2 === 0 ? -1 : 1;
    const flipY = Math.floor(seed / 2) % 2 === 0 ? -1 : 1;
    return (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          opacity,
          mixBlendMode: blend,
          pointerEvents: 'none',
        }}
      >
        <Img
          src={staticFile(BAKED_GRAIN_TILE_FILE)}
          style={{
            position: 'absolute',
            left: -ox,
            top: -oy,
            width: 3840,
            height: 2160,
            maxWidth: 'none',
            transform: `scale(${flipX}, ${flipY})`,
            transformOrigin: 'center center',
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  return (
    <NoiseLayer
      vw={320}
      vh={180}
      freq={String(freq)}
      seed={seed}
      opacity={opacity}
      blend={blend}
    />
  );
};

export interface PaperToothLayerProps {
  opacity: number;
  freq?: number;
  seed?: number;
  surface?: number;
  azimuth?: number;
  elevation?: number;
}

/** 紙の凹凸（feDiffuseLighting による立体紙目レリーフ） */
export const PaperToothLayer: React.FC<PaperToothLayerProps> = ({
  opacity,
  freq = 0.06,
  seed = 3,
  surface = 2.4,
  azimuth = 225,
  elevation = 58,
}) => {
  const id = useMaterialSid('tooth');
  return (
    <svg
      viewBox="0 0 960 540"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity,
        mixBlendMode: 'multiply',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={freq}
            numOctaves={3}
            seed={seed}
            result="n"
          />
          <feDiffuseLighting
            in="n"
            surfaceScale={surface}
            diffuseConstant={1.05}
            lightingColor="#ffffff"
            result="l"
          >
            <feDistantLight azimuth={azimuth} elevation={elevation} />
          </feDiffuseLighting>
        </filter>
      </defs>
      <rect width={960} height={540} filter={`url(#${id})`} />
    </svg>
  );
};

export interface SubtitleCalmProps {
  /** 6桁 hex カラー（例: "#000000", "#F5F1E8"） */
  color: string;
  /** 下端の不透明度（0..1、既定 0.55） */
  strength?: number;
  /** グラデーション開始 Y 座標（px、既定 840） */
  from?: number;
  style?: React.CSSProperties;
}

/** 字幕帯の静音化：下端に向けて背景の模様・濃淡を均す */
export const SubtitleCalm: React.FC<SubtitleCalmProps> = ({
  color,
  strength = 0.55,
  from = 840,
  style,
}) => {
  const clamped = Math.max(0, Math.min(1, strength));
  const alphaHex = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: from,
        bottom: 0,
        pointerEvents: 'none',
        background: `linear-gradient(to bottom, ${color}00 0%, ${color}${alphaHex} 100%)`,
        ...style,
      }}
    />
  );
};
