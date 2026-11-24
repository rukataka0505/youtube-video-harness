import React from 'react';
import { Composition, Still } from 'remotion';
import {
  BUGURU_BANNER_H,
  BUGURU_BANNER_VARIANTS,
  BUGURU_BANNER_W,
  BUGURU_EYECATCH_DURATION_SEC,
  BUGURU_EYECATCH_VARIANTS,
  BUGURU_ICON_SIZE,
} from '../../../components/stickman_collage/brand';
import { BuguruBannerStill } from './BuguruBannerStill';
import { BuguruEyecatchPreview } from './BuguruEyecatchPreview';
import { BuguruIconStill } from './BuguruIconStill';

/** ch1「バグる棒人間」ブランドキット Composition / Still 一括登録（Remotion ID に `_` 不使用） */
export const BuguruBrandKitCompositions: React.FC = () => (
  <>
    <Still
      id="Brand-BuguruIcon-A-Glow"
      component={BuguruIconStill}
      width={BUGURU_ICON_SIZE}
      height={BUGURU_ICON_SIZE}
      defaultProps={{ variant: 'glow' as const, showCircleGuide: false }}
    />
    <Still
      id="Brand-BuguruIcon-B-Sketch"
      component={BuguruIconStill}
      width={BUGURU_ICON_SIZE}
      height={BUGURU_ICON_SIZE}
      defaultProps={{ variant: 'sketch' as const, showCircleGuide: false }}
    />
    {/* チャンネルバナー 3 案（A slices / B glitch / C lineup） */}
    {BUGURU_BANNER_VARIANTS.map((variant, i) => (
      <Still
        key={variant}
        id={`Brand-BuguruBanner-${'ABC'[i]}-${variant[0].toUpperCase()}${variant.slice(1)}`}
        component={BuguruBannerStill}
        width={BUGURU_BANNER_W}
        height={BUGURU_BANNER_H}
        defaultProps={{ variant }}
      />
    ))}
    {/* 既定 strips は従来 ID のまま。zoom / glitch は ID 末尾で区別する */}
    {BUGURU_EYECATCH_VARIANTS.map((variant) => (
      <Composition
        key={variant}
        id={variant === 'strips' ? 'Brand-BuguruEyecatch' : `Brand-BuguruEyecatch-${variant[0].toUpperCase()}${variant.slice(1)}`}
        component={BuguruEyecatchPreview}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={Math.round(BUGURU_EYECATCH_DURATION_SEC * 30)}
        defaultProps={{ withScenes: true, variant }}
      />
    ))}
  </>
);
