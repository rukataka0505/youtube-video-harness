import React, { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile, useVideoConfig } from 'remotion';
import { THUMBNAIL_SPEC } from '../../theme/tokens';
import { ensureCommonFontsLoaded } from '../common/fonts';
import type { PsychologicalTrigger, ThumbnailVariantSpec } from './types';

export const THUMB_W = THUMBNAIL_SPEC.logicalWidth;
export const THUMB_H = THUMBNAIL_SPEC.logicalHeight;

export const TRIGGER_LABELS_JA: Record<PsychologicalTrigger, string> = {
  numbers: '具体数字',
  loss_avoidance: '損失回避',
  surprise: '意外性',
  self_relevance: '自分ごと化',
};

/**
 * 外部URL・studio/public配下パスを <Img> 用URLへ解決する。
 */
export function resolveThumbnailMediaSrc(pathOrCatalogId?: string | null): string | null {
  if (!pathOrCatalogId) {
    return null;
  }
  const trimmed = pathOrCatalogId.trim();
  if (!trimmed) {
    return null;
  }
  if (/^(https?:\/\/|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }
  let normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.startsWith('studio/public/')) {
    normalized = normalized.slice('studio/public/'.length);
  }
  return staticFile(normalized);
}

/**
 * サムネイル <Still> 描画前に SIL OFL 1.1 フォント全系統を待機するフック。
 */
export const useThumbnailFonts = (): boolean => {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('Load SIL OFL fonts for Thumbnail Still'));

  useEffect(() => {
    let cancelled = false;
    ensureCommonFontsLoaded()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
        continueRender(handle);
      });

    return () => {
      cancelled = true;
    };
  }, [handle]);

  return ready;
};

/**
 * 1920x1080 論理座標系から現在のレンダー解像度（3840x2160 等）へのスケーリング値を返す。
 */
export function useThumbnailScale(): {
  scale: number;
  width: number;
  height: number;
  px: (logicalPx: number) => number;
} {
  const { width, height } = useVideoConfig();
  const scale = width / THUMBNAIL_SPEC.logicalWidth;
  return {
    scale,
    width,
    height,
    px: (logicalPx: number) => Math.round(logicalPx * scale),
  };
}

/**
 * Spec から指定 variantId（未指定時は先頭）のバリアントを取得する。
 */
export function selectThumbnailVariant(
  variants: readonly ThumbnailVariantSpec[],
  variantId?: string,
): ThumbnailVariantSpec {
  if (variants.length === 0) {
    throw new Error('ThumbnailPackageSpec.variants が空です。');
  }
  if (!variantId) {
    return variants[0];
  }
  return variants.find((v) => v.variantId === variantId) ?? variants[0];
}

/**
 * 全角換算文字数（半角0.5、全角1.0）の簡易算出。
 */
export function calcZenkakuLength(text: string): number {
  let total = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x00ff || (code >= 0xff61 && code <= 0xff9f)) {
      total += 0.5;
    } else {
      total += 1.0;
    }
  }
  return Math.round(total * 10) / 10;
}

/**
 * デバッグ・目視QA用の 90% セーフゾーン ＋ YouTube 右下再生時間バッジ回避ガイド。
 */
export const ThumbnailSafeGuidesOverlay: React.FC<{
  scale?: number;
  visible?: boolean;
}> = ({ scale = 1, visible = false }) => {
  if (!visible) {
    return null;
  }
  const marginX = Math.round(96 * scale);
  const marginY = Math.round(54 * scale);
  const badge = THUMBNAIL_SPEC.durationBadgeSafeZone;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 90,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: marginX,
          right: marginX,
          top: marginY,
          bottom: marginY,
          border: `${Math.max(2, Math.round(2 * scale))}px dashed rgba(56, 189, 248, 0.72)`,
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: Math.round(badge.right * scale),
          bottom: Math.round(badge.bottom * scale),
          width: Math.round(badge.width * scale),
          height: Math.round(badge.height * scale),
          border: `${Math.max(2, Math.round(2 * scale))}px solid rgba(239, 68, 68, 0.85)`,
          backgroundColor: 'rgba(239, 68, 68, 0.22)',
          borderRadius: Math.round(10 * scale),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          fontSize: Math.round(20 * scale),
          fontWeight: 800,
        }}
      >
        再生時間回避
      </div>
    </div>
  );
};

export interface ThumbStageFrameProps {
  /** 単一 1920x1080 SVG 内に描画する自由舞台シーン */
  children: React.ReactNode;
  /** SVG の背面に実写画像（<Img>）等を敷きたい場合のHTMLスロット */
  backdrop?: React.ReactNode;
  /** SVG の前面にHTML要素を重ねたい場合のスロット */
  overlay?: React.ReactNode;
  /** ベース背景色（既定 #000000） */
  background?: string;
  /** true のとき 90% セーフゾーンと右下再生時間回避ガイドを重ね焼きする */
  showSafeGuides?: boolean;
}

/**
 * 自由舞台サムネイル <Still> 用の「固い床」ラッパー。
 * - SIL OFL フォント読み込み待機を自動実行
 * - 論理 1920x1080 SVG 座標系を提供（レンダー時は render_thumbnails.mjs が scale=2 で 3840x2160 へ出力）
 * - showSafeGuides でセーフゾーン＆右下再生時間回避枠をワンタッチ表示
 * 構図・色・文字配置には一切介入しない。
 */
export const ThumbStageFrame: React.FC<ThumbStageFrameProps> = ({
  children,
  backdrop,
  overlay,
  background = '#000000',
  showSafeGuides = false,
}) => {
  useThumbnailFonts();
  return (
    <div
      style={{
        position: 'relative',
        width: THUMB_W,
        height: THUMB_H,
        overflow: 'hidden',
        background,
      }}
    >
      {backdrop ? (
        <div style={{ position: 'absolute', inset: 0, width: THUMB_W, height: THUMB_H }}>
          {backdrop}
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
        width={THUMB_W}
        height={THUMB_H}
        style={{ position: 'relative', display: 'block' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {children}
      </svg>
      {overlay ? (
        <div style={{ position: 'absolute', inset: 0, width: THUMB_W, height: THUMB_H }}>
          {overlay}
        </div>
      ) : null}
      <ThumbnailSafeGuidesOverlay scale={1} visible={showSafeGuides} />
    </div>
  );
};
