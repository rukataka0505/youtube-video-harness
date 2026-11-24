import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BuguruIcon } from '../../../components/stickman_collage/brand';
import type { BuguruVariant } from '../../../components/stickman_collage/brand';

/** チャンネルアイコン 1024×1024 Still 用 */
export const BuguruIconStill: React.FC<{ variant: BuguruVariant; showCircleGuide?: boolean }> = ({
  variant,
  showCircleGuide = false,
}) => (
  <AbsoluteFill style={{ backgroundColor: variant === 'glow' ? '#030303' : '#FFFCF4' }}>
    <BuguruIcon variant={variant} showCircleGuide={showCircleGuide} />
  </AbsoluteFill>
);
