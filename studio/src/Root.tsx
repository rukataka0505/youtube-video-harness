import React from 'react';
import { Composition } from 'remotion';
import {
  HowMoneyWorksDestroyEconomy60s,
  HowMoneyWorksDestroyEconomy60sElevenV4,
  TIMELINE as HOW_MONEY_WORKS_TIMELINE,
  TIMELINE_ELEVEN_V4 as HOW_MONEY_WORKS_ELEVEN_V4_TIMELINE,
} from './compositions/benchmarks/how_money_works_destroy_economy';
import { BASE_TIMELINE as AB_ZERO_INFLATION_BASE_TIMELINE } from './compositions/ab_tests/zero_inflation_trap/baseTimelineData';
import { ABZeroInflationTrapV1NeonHigh } from './compositions/ab_tests/zero_inflation_trap/v1_neon_high';
import { ABZeroInflationTrapV2OrchNeon } from './compositions/ab_tests/zero_inflation_trap/v2_orch_neon';
import { ABZeroInflationTrapV3OpusHigh } from './compositions/ab_tests/zero_inflation_trap/v3_opus_high';
import { BASE_TIMELINE as AB_LUXURY_TRAP_BASE_TIMELINE } from './compositions/ab_tests/plan_e_luxury_trap/baseTimelineData';
import { ABLuxuryTrapV1AstraHigh } from './compositions/ab_tests/plan_e_luxury_trap/v1_astra_high';
import { ABLuxuryTrapV2OpusHigh } from './compositions/ab_tests/plan_e_luxury_trap/v2_opus_high';
import { ABLuxuryTrapV31NeonHigh } from './compositions/ab_tests/plan_e_luxury_trap/v31_neon_high';
import { ABLuxuryTrapV31OpusHigh } from './compositions/ab_tests/plan_e_luxury_trap/v31_opus_high';
import { ABLuxuryTrapV31FullNeonHigh } from './compositions/ab_tests/plan_e_luxury_trap/v31_full_neon_high';
import {
  GoldenPlanEAllocation,
  GoldenPlanEFreeStage,
  GoldenPlanESelection,
  LUXURY_TRAP_ALLOCATION_SPEC,
  LUXURY_TRAP_FREE_STAGE_SPEC,
  LUXURY_TRAP_SELECTION_SPEC,
} from './compositions/golden/plan_e';
import { ABStickmanSelfHelpV2Neon } from './compositions/ab_tests/stickman_self_help/V2NeonComp';
import { STICKMAN_COLLAGE_TIMELINE as STICKMAN_SELF_HELP_V2_NEON_TL } from './compositions/ab_tests/stickman_self_help/v2NeonTimeline';
import { ABStickmanSelfHelpV1Opus } from './compositions/ab_tests/stickman_self_help/V1OpusComp';
import { STICKMAN_COLLAGE_TIMELINE as STICKMAN_SELF_HELP_V1_OPUS_TL } from './compositions/ab_tests/stickman_self_help/v1OpusTimeline';
import { ABStickmanV24CutNeon } from './compositions/ab_tests/stickman_v2_4cut/v1_neon/V1Neon4CutComp';
import { STICKMAN_COLLAGE_TIMELINE as STICKMAN_V2_4CUT_NEON_TL } from './compositions/ab_tests/stickman_v2_4cut/v1_neon/v1NeonTimeline';
import {
  ABStickmanV2FourCutOpus,
  AB_STICKMAN_V2_4CUT_OPUS_TIMELINE as STICKMAN_V2_4CUT_OPUS_TL,
} from './compositions/ab_tests/stickman_v2_4cut/v2_opus/V2Opus4CutComp';
import {
  OpusBgShowcase,
  OPUS_BG_SHOWCASE_FRAMES,
} from './compositions/ab_tests/bg_showcase/OpusBgShowcase';
import { VIDEO_SPEC } from './theme/tokens';
import { ThumbnailStills } from './ThumbnailRoot';
import { BuguruBrandKitCompositions } from './compositions/ab_tests/buguru_brand_kit/BuguruBrandKitRoot';
import { AkapenBrandKitCompositions } from './compositions/ab_tests/akapen_brand_kit/AkapenBrandKitRoot';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Plan E 基準ベンチマーク */}
      <Composition
        id="HowMoneyWorksDestroyEconomy60s"
        component={HowMoneyWorksDestroyEconomy60s}
        durationInFrames={HOW_MONEY_WORKS_TIMELINE.totalFrames}
        fps={VIDEO_SPEC.fps}
        width={VIDEO_SPEC.width}
        height={VIDEO_SPEC.height}
      />
      <Composition
        id="HowMoneyWorksDestroyEconomy60s-ElevenV4"
        component={HowMoneyWorksDestroyEconomy60sElevenV4}
        durationInFrames={HOW_MONEY_WORKS_ELEVEN_V4_TIMELINE.totalFrames}
        fps={HOW_MONEY_WORKS_ELEVEN_V4_TIMELINE.fps}
        width={VIDEO_SPEC.width}
        height={VIDEO_SPEC.height}
      />

      {/* Plan E ABテスト＆ゴールデン */}
      <Composition
        id="AB-ZeroInflationTrap-v1-neon-high"
        component={ABZeroInflationTrapV1NeonHigh}
        durationInFrames={AB_ZERO_INFLATION_BASE_TIMELINE.totalFrames}
        fps={AB_ZERO_INFLATION_BASE_TIMELINE.fps}
        width={AB_ZERO_INFLATION_BASE_TIMELINE.width}
        height={AB_ZERO_INFLATION_BASE_TIMELINE.height}
      />
      <Composition
        id="AB-ZeroInflationTrap-v2-orch-neon"
        component={ABZeroInflationTrapV2OrchNeon}
        durationInFrames={AB_ZERO_INFLATION_BASE_TIMELINE.totalFrames}
        fps={AB_ZERO_INFLATION_BASE_TIMELINE.fps}
        width={AB_ZERO_INFLATION_BASE_TIMELINE.width}
        height={AB_ZERO_INFLATION_BASE_TIMELINE.height}
      />
      <Composition
        id="AB-ZeroInflationTrap-v3-opus-high"
        component={ABZeroInflationTrapV3OpusHigh}
        durationInFrames={AB_ZERO_INFLATION_BASE_TIMELINE.totalFrames}
        fps={AB_ZERO_INFLATION_BASE_TIMELINE.fps}
        width={AB_ZERO_INFLATION_BASE_TIMELINE.width}
        height={AB_ZERO_INFLATION_BASE_TIMELINE.height}
      />
      <Composition
        id="AB-LuxuryTrap-v1-astra-high"
        component={ABLuxuryTrapV1AstraHigh}
        durationInFrames={AB_LUXURY_TRAP_BASE_TIMELINE.totalFrames}
        fps={AB_LUXURY_TRAP_BASE_TIMELINE.fps}
        width={AB_LUXURY_TRAP_BASE_TIMELINE.width}
        height={AB_LUXURY_TRAP_BASE_TIMELINE.height}
      />
      <Composition
        id="AB-LuxuryTrap-v2-opus-high"
        component={ABLuxuryTrapV2OpusHigh}
        durationInFrames={AB_LUXURY_TRAP_BASE_TIMELINE.totalFrames}
        fps={AB_LUXURY_TRAP_BASE_TIMELINE.fps}
        width={AB_LUXURY_TRAP_BASE_TIMELINE.width}
        height={AB_LUXURY_TRAP_BASE_TIMELINE.height}
      />
      <Composition
        id="AB-LuxuryTrap-v31-neon-high"
        component={ABLuxuryTrapV31NeonHigh}
        durationInFrames={1946}
        fps={AB_LUXURY_TRAP_BASE_TIMELINE.fps}
        width={AB_LUXURY_TRAP_BASE_TIMELINE.width}
        height={AB_LUXURY_TRAP_BASE_TIMELINE.height}
      />
      <Composition
        id="AB-LuxuryTrap-v31-opus-high"
        component={ABLuxuryTrapV31OpusHigh}
        durationInFrames={1946}
        fps={AB_LUXURY_TRAP_BASE_TIMELINE.fps}
        width={AB_LUXURY_TRAP_BASE_TIMELINE.width}
        height={AB_LUXURY_TRAP_BASE_TIMELINE.height}
      />
      <Composition
        id="AB-LuxuryTrap-v31-full-neon-high"
        component={ABLuxuryTrapV31FullNeonHigh}
        durationInFrames={AB_LUXURY_TRAP_BASE_TIMELINE.totalFrames}
        fps={AB_LUXURY_TRAP_BASE_TIMELINE.fps}
        width={AB_LUXURY_TRAP_BASE_TIMELINE.width}
        height={AB_LUXURY_TRAP_BASE_TIMELINE.height}
      />
      <Composition
        id="Golden-PlanE-Allocation"
        component={GoldenPlanEAllocation}
        durationInFrames={Math.ceil(LUXURY_TRAP_ALLOCATION_SPEC.totalDurationSec * (LUXURY_TRAP_ALLOCATION_SPEC.fps ?? 30))}
        fps={LUXURY_TRAP_ALLOCATION_SPEC.fps ?? 30}
        width={AB_LUXURY_TRAP_BASE_TIMELINE.width}
        height={AB_LUXURY_TRAP_BASE_TIMELINE.height}
      />
      <Composition
        id="Golden-PlanE-Selection"
        component={GoldenPlanESelection}
        durationInFrames={Math.ceil(LUXURY_TRAP_SELECTION_SPEC.totalDurationSec * (LUXURY_TRAP_SELECTION_SPEC.fps ?? 30))}
        fps={LUXURY_TRAP_SELECTION_SPEC.fps ?? 30}
        width={AB_LUXURY_TRAP_BASE_TIMELINE.width}
        height={AB_LUXURY_TRAP_BASE_TIMELINE.height}
      />
      <Composition
        id="Golden-PlanE-FreeStage"
        component={GoldenPlanEFreeStage}
        durationInFrames={Math.ceil(LUXURY_TRAP_FREE_STAGE_SPEC.totalDurationSec * (LUXURY_TRAP_FREE_STAGE_SPEC.fps ?? 30))}
        fps={LUXURY_TRAP_FREE_STAGE_SPEC.fps ?? 30}
        width={AB_LUXURY_TRAP_BASE_TIMELINE.width}
        height={AB_LUXURY_TRAP_BASE_TIMELINE.height}
      />

      {/* stickman-collage ABテスト＆本番エピソード */}
      <Composition
        id="AB-StickmanSelfHelp-v2-neon-high"
        component={ABStickmanSelfHelpV2Neon}
        durationInFrames={STICKMAN_SELF_HELP_V2_NEON_TL.totalFrames}
        fps={STICKMAN_SELF_HELP_V2_NEON_TL.fps}
        width={STICKMAN_SELF_HELP_V2_NEON_TL.width}
        height={STICKMAN_SELF_HELP_V2_NEON_TL.height}
      />
      <Composition
        id="AB-StickmanSelfHelp-v1-opus-high"
        component={ABStickmanSelfHelpV1Opus}
        durationInFrames={STICKMAN_SELF_HELP_V1_OPUS_TL.totalFrames}
        fps={STICKMAN_SELF_HELP_V1_OPUS_TL.fps}
        width={STICKMAN_SELF_HELP_V1_OPUS_TL.width}
        height={STICKMAN_SELF_HELP_V1_OPUS_TL.height}
      />
      <Composition
        id="AB-StickmanV2-4Cut-Neon"
        component={ABStickmanV24CutNeon}
        durationInFrames={STICKMAN_V2_4CUT_NEON_TL.totalFrames}
        fps={STICKMAN_V2_4CUT_NEON_TL.fps}
        width={STICKMAN_V2_4CUT_NEON_TL.width}
        height={STICKMAN_V2_4CUT_NEON_TL.height}
      />
      <Composition
        id="AB-StickmanV2-4Cut-Opus"
        component={ABStickmanV2FourCutOpus}
        durationInFrames={STICKMAN_V2_4CUT_OPUS_TL.totalFrames}
        fps={STICKMAN_V2_4CUT_OPUS_TL.fps}
        width={STICKMAN_V2_4CUT_OPUS_TL.width}
        height={STICKMAN_V2_4CUT_OPUS_TL.height}
      />
      <Composition
        id="AB-OpusBgShowcase"
        component={OpusBgShowcase}
        durationInFrames={OPUS_BG_SHOWCASE_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />

      <ThumbnailStills />

      {/* ch1「バグる棒人間」ブランドキット（アイコン2案＋公式1.0秒アイキャッチ3種） */}
      <BuguruBrandKitCompositions />

      {/* ch2「経済の赤ペン」公式ブランド資産（公式アイコンC2＋1.3秒アイキャッチ3種） */}
      <AkapenBrandKitCompositions />

      {/* 個別エピソード制作時（studio/src/compositions/episodes/<slugCamel>/ は .gitignore 対象）はここに <Composition> を追加 */}
    </>
  );
};
