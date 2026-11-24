import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { BASE_TIMELINE } from '../baseTimelineData';
import { ABZeroInflationTrapV1NeonHigh } from './index';

const V1NeonHighRoot: React.FC = () => {
  return (
    <Composition
      id="AB-ZeroInflationTrap-v1-neon-high"
      component={ABZeroInflationTrapV1NeonHigh}
      durationInFrames={BASE_TIMELINE.totalFrames}
      fps={BASE_TIMELINE.fps}
      width={BASE_TIMELINE.width}
      height={BASE_TIMELINE.height}
    />
  );
};

registerRoot(V1NeonHighRoot);
