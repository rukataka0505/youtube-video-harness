import React from 'react';
import { StickmanCollageTemplate } from '../../../../templates/StickmanCollageTemplate';
import { V1_NEON_4CUT_SCENES } from './scenes';
import { STICKMAN_COLLAGE_TIMELINE } from './v1NeonTimeline';

export const V1Neon4CutComp: React.FC = () => (
  <StickmanCollageTemplate
    spec={STICKMAN_COLLAGE_TIMELINE}
    customScenes={V1_NEON_4CUT_SCENES}
  />
);

export const ABStickmanV24CutNeon = V1Neon4CutComp;
