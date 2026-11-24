import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BuguruBanner, type BuguruBannerVariant } from '../../../components/stickman_collage/brand';

/** チャンネルバナー 2560×1440 Still 用 */
export const BuguruBannerStill: React.FC<{ variant: BuguruBannerVariant }> = ({ variant }) => (
  <AbsoluteFill style={{ backgroundColor: variant === 'glitch' ? '#030303' : '#FFFCF4' }}>
    <BuguruBanner variant={variant} />
  </AbsoluteFill>
);
