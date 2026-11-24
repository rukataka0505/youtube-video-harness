import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AKAPEN_ICON_DEFAULT_VARIANT, AkapenIcon, usePlanEFonts, type AkapenIconVariant } from '../../../components/plan_e';

/** 1024×1024 公式アイコン単体（YouTube へそのまま上げる正方 PNG。円形トリミングは YouTube 側） */
export const AkapenIconStill: React.FC<{ variant?: AkapenIconVariant; showCircleGuide?: boolean }> = ({
  variant = AKAPEN_ICON_DEFAULT_VARIANT,
  showCircleGuide = false,
}) => {
  const ready = usePlanEFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {ready ? <AkapenIcon variant={variant} showCircleGuide={showCircleGuide} /> : null}
    </AbsoluteFill>
  );
};
