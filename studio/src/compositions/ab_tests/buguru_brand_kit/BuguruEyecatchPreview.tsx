import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  PolarityBackground,
  RiggedStickman,
  Stage,
  createStandPose,
  resolvePolarityTheme,
  type StagePolarity,
} from '../../../components/stickman_collage';
import { BuguruEyecatch, type BuguruEyecatchVariant } from '../../../components/stickman_collage/brand';

/** 確認用の前後シーン（本編ショットの代役：背景＋棒人間1体） */
const SampleShot: React.FC<{ polarity: StagePolarity; x: number; face: 'neutral' | 'surprised' }> = ({
  polarity,
  x,
  face,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const theme = resolvePolarityTheme(polarity);
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <PolarityBackground polarity={polarity} sec={sec} actorX={x} />
      <Stage sec={sec} theme={theme} fx="auto" horizon>
        <RiggedStickman p={createStandPose(x, undefined, 1.5)} theme={theme} face={face} sec={sec} />
      </Stage>
    </AbsoluteFill>
  );
};

/** variant ごとの確認用前後シーン（盤面の明暗を変えて、どの舞台からでも繋がることを見る） */
const PREVIEW_SCENES: Record<BuguruEyecatchVariant, { from: StagePolarity; to: StagePolarity }> = {
  strips: { from: 'black', to: 'grid_paper' },
  zoom: { from: 'cream_notebook', to: 'black' },
  glitch: { from: 'white_sketch', to: 'blueprint' },
};

/** 1.0 秒アイキャッチ確認用（variant 既定 strips：前シーン black → 次シーン grid_paper） */
export const BuguruEyecatchPreview: React.FC<{ withScenes: boolean; variant?: BuguruEyecatchVariant }> = ({
  withScenes,
  variant = 'strips',
}) => {
  const scenes = PREVIEW_SCENES[variant];
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <BuguruEyecatch
        variant={variant}
        outgoing={withScenes ? <SampleShot polarity={scenes.from} x={960} face="neutral" /> : undefined}
        incoming={withScenes ? <SampleShot polarity={scenes.to} x={1240} face="surprised" /> : undefined}
      />
    </AbsoluteFill>
  );
};
