import React from 'react';
import { AbsoluteFill, Audio, Composition, Still, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  AKAPEN_EYECATCH_FPS,
  AKAPEN_ICON_SIZE,
  AkapenEyecatch,
  akapenEyecatchFrames,
  akapenEyecatchSfxPath,
  usePlanEFonts,
  type AkapenEyecatchVariant,
} from '../../../components/plan_e';
import { AkapenIconStill } from './AkapenIconStills';
import {
  AKAPEN_BANNER_CODES,
  AKAPEN_BANNER_COMPARE,
  AKAPEN_BANNER_SHEET,
  AKAPEN_BANNER_VARIANTS,
  AkapenBannerCompare,
  AkapenBannerSheet,
  AkapenBannerStill,
  BANNER_H,
  BANNER_W,
} from './AkapenBanners';

/**
 * ch2「経済の赤ペン」公式ブランド資産（公式アイコン C2: penArticle / 公式1.3秒アイキャッチ3種: swipe, pullback, slit）。
 * チャンネルバナー比較案（A 記事帯 / B 朱一閃 / C 校正紙）は AkapenBanners.tsx。
 * 音は pipeline/scripts/build_akapen_brand_sfx.py が書き出す studio/public/brand/akapen/*.wav。
 * Remotion ID に `_` 不使用。
 */

const EyecatchSolo: React.FC<{ variant: AkapenEyecatchVariant }> = ({ variant }) => {
  const ready = usePlanEFonts();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {ready ? <AkapenEyecatch variant={variant} t={frame / fps} /> : null}
      <Audio src={staticFile(akapenEyecatchSfxPath(variant))} />
    </AbsoluteFill>
  );
};

export const AkapenBrandKitCompositions: React.FC = () => (
  <>
    <Still
      id="Brand-AkapenIcon"
      component={AkapenIconStill}
      width={AKAPEN_ICON_SIZE}
      height={AKAPEN_ICON_SIZE}
      defaultProps={{ variant: 'penArticle' as const }}
    />
    {(
      [
        ['Swipe', 'swipe'],
        ['Pullback', 'pullback'],
        ['Slit', 'slit'],
      ] as const
    ).map(([code, variant]) => (
      <Composition
        key={code}
        id={`Brand-AkapenEyecatch-${code}`}
        component={EyecatchSolo}
        durationInFrames={akapenEyecatchFrames(variant)}
        fps={AKAPEN_EYECATCH_FPS}
        width={1920}
        height={1080}
        defaultProps={{ variant }}
      />
    ))}
    {AKAPEN_BANNER_VARIANTS.map((variant) => (
      <React.Fragment key={variant}>
        <Still
          id={`Brand-AkapenBanner-${AKAPEN_BANNER_CODES[variant]}`}
          component={AkapenBannerStill}
          width={BANNER_W}
          height={BANNER_H}
          defaultProps={{ variant }}
        />
        <Still
          id={`Brand-AkapenBannerSheet-${AKAPEN_BANNER_CODES[variant]}`}
          component={AkapenBannerSheet}
          width={AKAPEN_BANNER_SHEET.width}
          height={AKAPEN_BANNER_SHEET.height}
          defaultProps={{ variant }}
        />
      </React.Fragment>
    ))}
    <Still
      id="Brand-AkapenBannerCompare"
      component={AkapenBannerCompare}
      width={AKAPEN_BANNER_COMPARE.width}
      height={AKAPEN_BANNER_COMPARE.height}
    />
  </>
);
