import React from 'react';
import { Still } from 'remotion';
import {
  BgDraftingGridStatic,
  BgKraftCorkStatic,
  BgLightTableStatic,
  BgMidnightBlueprintStatic,
  BgRuledNotebookStatic,
  BgStudioBlackRichStatic,
  BgWarmWhiteSketchStatic,
  BgWoodDeskStatic,
  GrainTileStatic,
  LightBeamHazeStatic,
} from './components/_materials';
import {
  PolarityBackground,
  useStickmanCollageFonts,
  type StagePolarity,
} from './components/stickman_collage';

const WithFonts: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useStickmanCollageFonts();
  return <>{children}</>;
};

const BakeBlack: React.FC = () => (
  <WithFonts>
    <BgStudioBlackRichStatic noiseBlend="normal" />
  </WithFonts>
);

const BakeWhiteSketch: React.FC = () => (
  <WithFonts>
    <BgWarmWhiteSketchStatic />
  </WithFonts>
);

const BakeGridPaper: React.FC = () => (
  <WithFonts>
    <BgDraftingGridStatic />
  </WithFonts>
);

const BakeWoodDesk: React.FC = () => (
  <WithFonts>
    <BgWoodDeskStatic />
  </WithFonts>
);

const BakeKraftCork: React.FC = () => (
  <WithFonts>
    <BgKraftCorkStatic />
  </WithFonts>
);

const BakeBlueprint: React.FC = () => (
  <WithFonts>
    <BgMidnightBlueprintStatic />
  </WithFonts>
);

const BakeCreamNotebook: React.FC = () => (
  <WithFonts>
    <BgRuledNotebookStatic />
  </WithFonts>
);

const BakeLightTable: React.FC = () => (
  <WithFonts>
    <BgLightTableStatic />
  </WithFonts>
);

const BakeLightBeamHaze: React.FC = () => <LightBeamHazeStatic />;

const BakeGrainTile: React.FC = () => <GrainTileStatic />;

export type CompareBgPreviewProps = {
  polarity: StagePolarity;
  sec: number;
  actorX: number;
  useBaked: boolean;
  animated: boolean;
};

const CompareBgPreview: React.FC<CompareBgPreviewProps> = ({
  polarity,
  sec,
  actorX,
  useBaked,
  animated,
}) => (
  <WithFonts>
    <PolarityBackground
      polarity={polarity}
      sec={sec}
      actorX={actorX}
      animated={animated}
      useBaked={useBaked}
    />
  </WithFonts>
);

export const BakeBackgroundsRoot: React.FC = () => (
  <>
    <Still id="BakeBg-black" component={BakeBlack} width={1920} height={1080} />
    <Still id="BakeBg-white-sketch" component={BakeWhiteSketch} width={1920} height={1080} />
    <Still id="BakeBg-grid-paper" component={BakeGridPaper} width={1920} height={1080} />
    <Still id="BakeBg-wood-desk" component={BakeWoodDesk} width={1920} height={1080} />
    <Still id="BakeBg-kraft-cork" component={BakeKraftCork} width={1920} height={1080} />
    <Still id="BakeBg-blueprint" component={BakeBlueprint} width={1920} height={1080} />
    <Still id="BakeBg-cream-notebook" component={BakeCreamNotebook} width={1920} height={1080} />
    <Still id="BakeBg-light-table" component={BakeLightTable} width={1920} height={1080} />
    <Still id="BakeBg-light-beam-haze" component={BakeLightBeamHaze} width={1920} height={1080} />
    <Still id="BakeBg-grain-tile" component={BakeGrainTile} width={640} height={360} />

    <Still
      id="CompareBg-Preview"
      component={CompareBgPreview}
      width={1920}
      height={1080}
      defaultProps={{
        polarity: 'black',
        sec: 2.5,
        actorX: 760,
        useBaked: true,
        animated: true,
      }}
    />
  </>
);
