import React from 'react';
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  MacroEconCanvas,
  VhsPauseAvatarStage,
  VideoBrollStage,
  usePlanEFonts,
} from '../../../../components/plan_e';
import {
  IncentiveLoopDiagram,
  PlanEBackdropMode,
  SatireCollageStage,
  SatireGagStage,
} from '../../../../components/plan_e/legacy';
import { BASE_TIMELINE } from '../baseTimelineData';
import {
  BojProjectorStage,
  DeflationStandoffStage,
  DiscountTagBrollStage,
  JapanBreakingNewsStage,
  JapanWorldMapBoardStage,
  JapanWorldOpenLoopStage,
  RejectedPlanBrollStage,
  WageWhiteboardStage,
} from './stages';

interface VariantSceneDef {
  id: string;
  shotIndex: number;
  startSec: number;
  endSec: number;
  fullBleed: boolean;
  backdropMode: PlanEBackdropMode;
  subtitleLightBg: boolean;
  hasLiveBroll: boolean;
  render: () => React.ReactNode;
}

const V = BASE_TIMELINE.videoMap;
const I = BASE_TIMELINE.imageMap;

/**
 * 案E（planE_macro_econ）ABテスト v1_neon_high：王道 How Money Works バランス型
 * - 固定変数：BASE_TIMELINE の audioSrc / totalFrames(2461) / subtitles をそのまま使用
 * - 全8ショット × 19シーン（マルチカット含め21サブビート）
 * - 実写動画Bロール比率：57.9%（フルブリード実写47.47s / 82.01s、報道UI実写キャスター枠含む62.9%）
 */
const SCENES: readonly VariantSceneDef[] = [
  /* ==========================================================================
   * Shot 1 (0.00 - 11.66s): 実写街並みBロール：給料を30年止める思考実験フック
   * ======================================================================== */
  {
    id: 's01a_tokyo_commuters_hook',
    shotIndex: 1,
    startSec: 0.0,
    endSec: 3.31,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <VideoBrollStage
        startSec={0.0}
        endSec={3.31}
        videoSrc={V.tokyo_commuters_broll}
        motion="slow_zoom_in"
        grade="cinematic_vignette"
        vignetteStrength={0.72}
        locationTag="TOKYO // 30-YEAR THOUGHT EXPERIMENT"
      />
    ),
  },
  {
    id: 's01b_counting_cash_wages',
    shotIndex: 1,
    startSec: 3.31,
    endSec: 7.6,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <VideoBrollStage
        startSec={3.31}
        endSec={7.6}
        videoSrc={V.counting_cash_broll}
        motion="slow_zoom_out"
        grade="editorial_cool"
        vignetteStrength={0.66}
        locationTag="REAL WAGES // 30 YEARS FROZEN"
      />
    ),
  },
  {
    id: 's01c_tokyo_desat_question',
    shotIndex: 1,
    startSec: 7.6,
    endSec: 11.66,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <VideoBrollStage
        startSec={7.6}
        endSec={11.66}
        videoSrc={V.tokyo_commuters_broll}
        motion="pan_left"
        grade="crisis_desat"
        vignetteStrength={0.74}
      />
    ),
  },

  /* ==========================================================================
   * Shot 2 (11.66 - 23.29s): VHS一時停止＆素朴な破壊策の即却下
   * ======================================================================== */
  {
    id: 's02a_vhs_pause_break',
    shotIndex: 2,
    startSec: 11.66,
    endSec: 15.1,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: false,
    render: () => (
      <VhsPauseAvatarStage
        startSec={11.66}
        frozenImageSrc={I.tokyo_commuters_broll_poster}
        timecodeLabel="II  00:11:20"
        avatarEmblem="¥?"
      />
    ),
  },
  {
    id: 's02b_breaking_news_backlash',
    shotIndex: 2,
    startSec: 15.1,
    endSec: 19.2,
    fullBleed: true,
    backdropMode: 'crisis_dark',
    subtitleLightBg: false,
    hasLiveBroll: false, // 右ペイン44%は実写キャスター動画（保守的に非フルブリード集計）
    render: () => (
      <JapanBreakingNewsStage
        startSec={15.1}
        endSec={19.2}
        anchorVideoSrc={V.news_studio_broll}
      />
    ),
  },
  {
    id: 's02c_rejected_plan_broll',
    shotIndex: 2,
    startSec: 19.2,
    endSec: 23.29,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <RejectedPlanBrollStage
        startSec={19.2}
        endSec={23.29}
        backgroundVideoSrc={V.tokyo_commuters_broll}
        stampSec={20.25}
      />
    ),
  },

  /* ==========================================================================
   * Shot 3 (23.29 - 33.00s): 115BPMグルーヴ解禁＆「激安の罠」逆転宣言
   * ======================================================================== */
  {
    id: 's03a_glitch_cash_pivot',
    shotIndex: 3,
    startSec: 23.29,
    endSec: 26.29,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <VideoBrollStage
        startSec={23.29}
        endSec={26.29}
        videoSrc={V.counting_cash_broll}
        motion="slow_zoom_in"
        grade="editorial_cool"
        vignetteStrength={0.62}
        glitchIntroSec={0.28}
        locationTag="THE OPPOSITE STRATEGY"
      />
    ),
  },
  {
    id: 's03b_avatar_street_talk',
    shotIndex: 3,
    startSec: 26.29,
    endSec: 29.65,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <SatireGagStage
        startSec={26.29}
        endSec={29.65}
        mode="avatar_talk"
        backgroundVideoSrc={V.tokyo_commuters_broll}
        avatarEmblem="¥?"
      />
    ),
  },
  {
    id: 's03c_discount_tags_broll',
    shotIndex: 3,
    startSec: 29.65,
    endSec: 33.0,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <DiscountTagBrollStage
        startSec={29.65}
        endSec={33.0}
        backgroundVideoSrc={V.tokyo_commuters_broll}
      />
    ),
  },

  /* ==========================================================================
   * Shot 4 (33.00 - 42.36s): 欧米実写2連カット → ホワイトボード30年実質賃金グラフ
   * ======================================================================== */
  {
    id: 's04a_us_eu_broll_montage',
    shotIndex: 4,
    startSec: 33.0,
    endSec: 36.2,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <VideoBrollStage
        startSec={33.0}
        endSec={36.2}
        grade="clean_bright"
        vignetteStrength={0.5}
        cuts={[
          {
            resolvedVideoSrc: V.supermarket_aisle_broll,
            caption: 'UNITED STATES // REAL WAGE GROWTH',
            motion: 'slow_zoom_in',
          },
          {
            resolvedVideoSrc: V.news_studio_broll,
            caption: 'EUROPE // OECD WAGE BENCHMARK',
            motion: 'slow_zoom_out',
          },
        ]}
      />
    ),
  },
  {
    id: 's04b_whiteboard_wage_chart',
    shotIndex: 4,
    startSec: 36.2,
    endSec: 42.36,
    fullBleed: true,
    backdropMode: 'whiteboard',
    subtitleLightBg: true,
    hasLiveBroll: false,
    render: () => (
      <WageWhiteboardStage
        startSec={36.2}
        endSec={42.36}
        japanHighlightSec={39.04}
      />
    ),
  },

  /* ==========================================================================
   * Shot 5 (42.36 - 49.44s): 実写問いかけ → 報道・紙面コラージュ（悪者論の否定）
   * ======================================================================== */
  {
    id: 's05a_mystery_cash_broll',
    shotIndex: 5,
    startSec: 42.36,
    endSec: 45.28,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <VideoBrollStage
        startSec={42.36}
        endSec={45.28}
        videoSrc={V.counting_cash_broll}
        motion="pan_right"
        grade="editorial_cool"
        vignetteStrength={0.62}
        locationTag="WHY DID WAGES STOP?"
      />
    ),
  },
  {
    id: 's05b_no_villain_collage',
    shotIndex: 5,
    startSec: 45.28,
    endSec: 49.44,
    fullBleed: false,
    backdropMode: 'editorial_paper',
    subtitleLightBg: true,
    hasLiveBroll: false,
    render: () => (
      <SatireCollageStage
        startSec={45.28}
        backdropMode="editorial_paper"
        imageMap={I}
        headline="よくある「犯人探し」は、どちらも外れ"
        subHeadline="個人の悪意ではなく、市場のインセンティブ構造が答えを握っている"
        cards={[
          {
            id: 'villain_firm',
            variant: 'broadsheet',
            publicationName: 'THE DAILY NARRATIVE',
            categoryLabel: 'MYTH #1',
            headline: '「悪徳企業が利益を溜め込んでいるだけ」説',
            highlightPhrase: '悪徳企業',
            subHeadline: '値上げしたくても、競合に客を奪われる恐怖から価格を動かせない',
            imageKey: 'tokyo_commuters_broll_poster',
            stampText: '犯人ではない',
            stampTone: 'crimson',
            rotateDeg: -1.6,
            revealOffsetSec: 0.15,
          },
          {
            id: 'villain_worker',
            variant: 'memo_note',
            publicationName: 'ECONOMICS DESK MEMO',
            categoryLabel: 'MYTH #2',
            headline: '「労働者が怠けている・生産性が低い」説',
            highlightPhrase: '怠けている',
            subHeadline: '現場は世界水準のサービスを維持したまま、薄利の価格競争に縛られた',
            imageKey: 'stock_ticker_broll_poster',
            stampText: '犯人ではない',
            stampTone: 'crimson',
            rotateDeg: 1.5,
            revealOffsetSec: 1.1,
          },
        ]}
      />
    ),
  },

  /* ==========================================================================
   * Shot 6 (49.44 - 59.48s): 企業×消費者のデフレ・インセンティブループ
   * ======================================================================== */
  {
    id: 's06a_firm_price_freeze_broll',
    shotIndex: 6,
    startSec: 49.44,
    endSec: 52.5,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <VideoBrollStage
        startSec={49.44}
        endSec={52.5}
        videoSrc={V.stock_ticker_broll}
        motion="slow_zoom_in"
        grade="editorial_cool"
        vignetteStrength={0.62}
        locationTag="FIRMS // PRICE FREEZE"
      />
    ),
  },
  {
    id: 's06b_standoff_satire_broll',
    shotIndex: 6,
    startSec: 52.5,
    endSec: 55.6,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <DeflationStandoffStage
        startSec={52.5}
        endSec={55.6}
        backgroundVideoSrc={V.tokyo_commuters_broll}
      />
    ),
  },
  {
    id: 's06c_deflation_incentive_loop',
    shotIndex: 6,
    startSec: 55.6,
    endSec: 59.48,
    fullBleed: false,
    backdropMode: 'blueprint_econ',
    subtitleLightBg: false,
    hasLiveBroll: false,
    render: () => (
      <div
        style={{
          flex: 1,
          paddingBottom: 78,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <IncentiveLoopDiagram
          startSec={55.6}
          backdropMode="blueprint_econ"
          title="デフレ・インセンティブループ（自己強化の罠）"
          subtitle="全員が損を避けるほど、ループは固く閉じていく"
          centerTag="DEFLATION LOCK"
          nodes={[
            {
              id: 'price_freeze',
              title: '企業が価格を凍結',
              subtitle: '値上げ＝客離れの恐怖',
              metric: 'PRICE ±0%',
              x: 240,
              y: 165,
              tone: 'crimson',
              revealOffsetSec: 0.05,
            },
            {
              id: 'no_raise',
              title: '人件費を上げられない',
              subtitle: '薄利維持・固定費圧縮',
              metric: 'WAGE ±0%',
              x: 760,
              y: 165,
              tone: 'gold',
              revealOffsetSec: 0.35,
            },
            {
              id: 'tight_wallet',
              title: '消費者が財布を締める',
              subtitle: '将来不安で節約を徹底',
              metric: 'SPENDING DOWN',
              x: 760,
              y: 440,
              tone: 'cyan',
              revealOffsetSec: 0.65,
            },
            {
              id: 'cheap_only',
              title: '「安い店」だけが勝つ',
              subtitle: 'さらなる値下げ圧力',
              metric: 'DISCOUNT RACE',
              x: 240,
              y: 440,
              tone: 'crimson',
              revealOffsetSec: 0.95,
            },
          ]}
          edges={[
            {
              from: 'price_freeze',
              to: 'no_raise',
              label: '利益が増えず',
              tone: 'gold',
              revealOffsetSec: 0.25,
            },
            {
              from: 'no_raise',
              to: 'tight_wallet',
              label: '給料が止まり',
              tone: 'cyan',
              revealOffsetSec: 0.55,
            },
            {
              from: 'tight_wallet',
              to: 'cheap_only',
              label: '激安を選好',
              tone: 'crimson',
              revealOffsetSec: 0.85,
            },
            {
              from: 'cheap_only',
              to: 'price_freeze',
              label: '値上げ不能へ',
              tone: 'crimson',
              dashed: true,
              revealOffsetSec: 1.15,
            },
          ]}
        />
      </div>
    ),
  },

  /* ==========================================================================
   * Shot 7 (59.48 - 69.19s): 合成の誤謬：実写2連カット → ホワイトボード世界比較マップ
   * ======================================================================== */
  {
    id: 's07a_fallacy_broll_montage',
    shotIndex: 7,
    startSec: 59.48,
    endSec: 64.8,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <VideoBrollStage
        startSec={59.48}
        endSec={64.8}
        grade="cinematic_vignette"
        vignetteStrength={0.64}
        cuts={[
          {
            resolvedVideoSrc: V.tokyo_commuters_broll,
            caption: 'INDIVIDUAL RATIONALITY // 個人の合理的防衛',
            motion: 'slow_zoom_in',
          },
          {
            resolvedVideoSrc: V.counting_cash_broll,
            caption: 'COLLECTIVE FREEZE // 国全体の給料停止',
            motion: 'slow_zoom_out',
          },
        ]}
      />
    ),
  },
  {
    id: 's07b_world_map_stagnation_board',
    shotIndex: 7,
    startSec: 64.8,
    endSec: 69.19,
    fullBleed: true,
    backdropMode: 'whiteboard',
    subtitleLightBg: true,
    hasLiveBroll: false,
    render: () => <JapanWorldMapBoardStage startSec={64.8} endSec={69.19} />,
  },

  /* ==========================================================================
   * Shot 8 (69.19 - 82.01s): 札束実写 → 暗室プロジェクター日銀網 → 世界地図オープンループ
   * ======================================================================== */
  {
    id: 's08a_money_printing_broll',
    shotIndex: 8,
    startSec: 69.19,
    endSec: 73.6,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: true,
    render: () => (
      <VideoBrollStage
        startSec={69.19}
        endSec={73.6}
        videoSrc={V.counting_cash_broll}
        motion="slow_zoom_in"
        grade="warm_night"
        vignetteStrength={0.62}
        locationTag="MONETARY EXPANSION // 何百兆円の緩和"
      />
    ),
  },
  {
    id: 's08b_boj_projector_network',
    shotIndex: 8,
    startSec: 73.6,
    endSec: 78.35,
    fullBleed: true,
    backdropMode: 'slate_grid',
    subtitleLightBg: false,
    hasLiveBroll: false,
    render: () => <BojProjectorStage startSec={73.6} />,
  },
  {
    id: 's08c_world_open_loop_zoomout',
    shotIndex: 8,
    startSec: 78.35,
    endSec: BASE_TIMELINE.totalDurationSec,
    fullBleed: true,
    backdropMode: 'whiteboard',
    subtitleLightBg: true,
    hasLiveBroll: false,
    render: () => (
      <JapanWorldOpenLoopStage
        startSec={78.35}
        endSec={BASE_TIMELINE.totalDurationSec}
      />
    ),
  },
];

export const ABZeroInflationTrapV1NeonHigh: React.FC = () => {
  const fontsReady = usePlanEFonts();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  const activeScene =
    SCENES.find((s) => sec >= s.startSec && sec < s.endSec) ??
    (sec >= SCENES[SCENES.length - 1].startSec ? SCENES[SCENES.length - 1] : SCENES[0]);

  return (
    <div style={{ width: '100%', height: '100%', opacity: fontsReady ? 1 : 0.999 }}>
      <Audio src={staticFile(BASE_TIMELINE.audioSrc)} />
      <MacroEconCanvas
        backdropMode={activeScene.backdropMode}
        subtitles={BASE_TIMELINE.subtitles}
        sec={sec}
        subtitleLightBgOverride={activeScene.subtitleLightBg}
        showTickerBar={false}
        fullBleed={activeScene.fullBleed}
        grainIdPrefix="ab-zero-inflation-v1-neon-high"
      >
        {activeScene.render()}
      </MacroEconCanvas>
    </div>
  );
};
