import React from 'react';
import { StickmanCollageTemplate } from '../../../../templates/StickmanCollageTemplate';
import { OpusBackground } from './OpusBackground';
import { OPUS_SCENES } from './scenes';
import { STICKMAN_COLLAGE_TIMELINE } from './v2OpusTimeline';

/**
 * stickman-collage v2 4カット先行試作（Opus 5.5 版）。
 * Composition ID: AB-StickmanV2-4Cut-Opus（Root.tsx 登録は親が実施）
 */
export const ABStickmanV2FourCutOpus: React.FC = () => (
  <StickmanCollageTemplate
    spec={STICKMAN_COLLAGE_TIMELINE}
    customScenes={OPUS_SCENES}
    customBackground={OpusBackground}
  />
);

export const AB_STICKMAN_V2_4CUT_OPUS_TIMELINE = STICKMAN_COLLAGE_TIMELINE;
