import React from 'react';
import { PlanEProjectSpec, PlanEMacroEconTemplateV2 } from '../../../components/plan_e/legacy';
import { PlanETimelineData, TIMELINE } from './timelineData';
import { TIMELINE_ELEVEN_V4 } from './timelineDataElevenV4';

const ev = (timeline: PlanETimelineData, key: string, fallback: number): number => {
  const val = timeline.events[key];
  return typeof val === 'number' ? val : fallback;
};

export function buildHowMoneyWorksBenchmarkSpec(timeline: PlanETimelineData): PlanEProjectSpec {
  const T = {
    hookStart: ev(timeline, 'hookStartSec', 0.0),
    vhsPause: ev(timeline, 'vhsPauseSec', 4.0638),
    grooveStart: ev(timeline, 'grooveStartSec', 7.3549),
    crisisBox: ev(timeline, 'crisisBoxSec', 8.9549),
    crashNews: ev(timeline, 'crashNewsSec', 10.5105),
    pivotStart: ev(timeline, 'pivotStartSec', 13.7602),
    shield: ev(timeline, 'shieldSec', 18.0859),
    institutions: ev(timeline, 'institutionsSec', 21.8698),
    skyline: ev(timeline, 'skylineSec', 24.6112),
    reserveChart: ev(timeline, 'reserveChartSec', 26.6122),
    industries: ev(timeline, 'industriesSec', 30.1835),
    worldMapBoard: ev(timeline, 'worldMapBoardSec', 32.64),
    talent: ev(timeline, 'talentSec', 35.9806),
    techCampus: ev(timeline, 'techCampusSec', 38.3865),
    geopolitics: ev(timeline, 'geopoliticsSec', 40.9483),
    middleman: ev(timeline, 'middlemanSec', 46.7188),
    bureaucracy: ev(timeline, 'bureaucracySec', 51.0352),
    signing: ev(timeline, 'signingSec', 52.5104),
    worldWeb: ev(timeline, 'worldWebSec', 54.1393),
    total: ev(timeline, 'totalDurationSec', timeline.totalDurationSec),
  };

  return {
    id: 'how-money-works-destroy-economy',
    themeTitle: timeline.title,
    fps: timeline.fps,
    totalDurationSec: T.total,
    audioSrc: timeline.audioSrc,
    imageMap: timeline.imageMap,
    videoMap: timeline.videoMap,
    subtitles: timeline.subtitles,
    defaultBackdropMode: 'slate_grid',
    showTickerBar: false,
    scenes: [
    // Shot 1 (0.0 - 4.06s): 実写ウォール街（NYSE外観実写→星条旗Bロール動画）＋強めビネット
    {
      id: 'shot01_wallstreet_broll',
      type: 'video_broll',
      startSec: T.hookStart,
      endSec: T.vhsPause,
      grade: 'cinematic_vignette',
      vignetteStrength: 0.72,
      cuts: [
        { imageKey: 'nyse_facade_real', motion: 'slow_zoom_in' },
        { videoKey: 'wall_street_flag', motion: 'slow_zoom_out' },
      ],
    },
    // Shot 2 (4.06 - 7.35s): 暗室プロジェクター一時停止＋背面スクリーン＋リモコン持ち $? アバター
    {
      id: 'shot02_vhs_pause_avatar',
      type: 'vhs_pause_avatar',
      startSec: T.vhsPause,
      endSec: T.grooveStart,
      frozenImageKey: 'wall_street_flag_poster',
      timecodeLabel: 'II  00:00:00',
      avatarEmblem: '$?',
    },
    // Shot 3 (7.35 - 8.95s): グリッチ突入 → トレーダー＆株価モニター実写動画Bロール
    {
      id: 'shot03_traders_broll',
      type: 'video_broll',
      startSec: T.grooveStart,
      endSec: T.crisisBox,
      videoKey: 'trading_floor_vid',
      motion: 'slow_zoom_in',
      grade: 'editorial_cool',
      vignetteStrength: 0.64,
      glitchIntroSec: 0.24,
    },
    // Shot 4 (8.95 - 10.51s): 金融危機・段ボール箱を片付けるビジネスマン実写動画Bロール
    {
      id: 'shot04_crisis_box_broll',
      type: 'video_broll',
      startSec: T.crisisBox,
      endSec: T.crashNews,
      videoKey: 'crisis_box_vid',
      motion: 'pan_right',
      grade: 'crisis_desat',
      vignetteStrength: 0.68,
    },
    // Shot 5 (10.51 - 13.76s): CNN風 株価暴落速報ニュース画面（急落チャート＋実写キャスター＋速報帯）
    {
      id: 'shot05_breaking_news_cnn',
      type: 'news_broadcast',
      startSec: T.crashNews,
      endSec: T.pivotStart,
      anchorVideoKey: 'news_anchor_vid',
      networkTag: 'MARKET NEWS NETWORK',
      breakingLabel: 'BREAKING NEWS',
      headline: 'DOW FREEFALLS 2,997 PTS AMID MARKET TURMOIL',
      tickerCode: 'DJI',
      indexValueStart: 23185.62,
      indexValueEnd: 20188.52,
      changeValueText: '-2,997.10',
      changePercentText: '-12.93%',
    },
    // Shot 6 (13.76 - 18.09s): 晴天芝生公園動画背景＋ $? アバター登場（人差し指→両手広げ）
    {
      id: 'shot06_park_avatar',
      type: 'satire_gag',
      startSec: T.pivotStart,
      endSec: T.shield,
      mode: 'avatar_talk',
      backgroundVideoKey: 'park_meadow_vid',
      avatarEmblem: '$?',
    },
    // Shot 7 (18.09 - 21.87s): 芝生背景＋アンクル・サム→巨大木槌打撃→甲冑騎士変身→めまい星
    {
      id: 'shot07_mallet_knight_gag',
      type: 'satire_gag',
      startSec: T.shield,
      endSec: T.institutions,
      mode: 'mallet_knight',
      backgroundVideoKey: 'park_meadow_vid',
      targetImageKey: 'uncle_sam_cutout',
      transformedImageKey: 'knight_armor_cutout',
      avatarEmblem: '$?',
    },
    // Shot 8 (21.87 - 24.61s): FRB・最高裁判所・SEC本部 3連高速実写カット（0.9秒間隔）
    {
      id: 'shot08_institutions_montage',
      type: 'video_broll',
      startSec: T.institutions,
      endSec: T.skyline,
      grade: 'cinematic_vignette',
      vignetteStrength: 0.62,
      cuts: [
        { imageKey: 'frb_eccles', caption: 'FEDERAL RESERVE BOARD', motion: 'slow_zoom_in' },
        { imageKey: 'us_supreme_court', caption: 'SUPREME COURT OF THE UNITED STATES', motion: 'slow_zoom_out' },
        { imageKey: 'sec_hq', caption: 'U.S. SECURITIES AND EXCHANGE COMMISSION', motion: 'slow_zoom_in' },
      ],
    },
    // Shot 9 (24.61 - 26.61s): 夜のマンハッタン金融街実写動画Bロール
    {
      id: 'shot09_manhattan_night',
      type: 'video_broll',
      startSec: T.skyline,
      endSec: T.reserveChart,
      videoKey: 'manhattan_night_vid',
      motion: 'slow_zoom_out',
      grade: 'warm_night',
      vignetteStrength: 0.58,
    },
    // Shot 10 (26.61 - 30.18s): 木枠ホワイトボード IMF外貨準備高積み上げ棒グラフ＋指示棒アバター
    {
      id: 'shot10_whiteboard_imf',
      type: 'whiteboard_stage',
      startSec: T.reserveChart,
      endSec: T.industries,
      backdropMode: 'whiteboard',
      mode: 'stacked_chart',
      boardTitle: 'Figure 2. Foreign exchange reserves',
      boardSubtitle: '世界の公式外貨準備シェア（%）— 圧倒的基軸「U.S. dollar」',
      sourceNote: 'IMF COFER Data',
      avatarEmblem: '$?',
    },
    // Shot 11 (30.18 - 32.64s): 木枠ホワイトボード＋右移動アバター＋主要企業バッジ順次ポップイン
    {
      id: 'shot11_whiteboard_logos',
      type: 'whiteboard_stage',
      startSec: T.industries,
      endSec: T.worldMapBoard,
      backdropMode: 'whiteboard',
      mode: 'logo_pop',
      boardTitle: '世界を牽引する多様な産業基盤',
      boardSubtitle: '金融・半導体・メディア・航空防衛の同時寡占',
      avatarEmblem: '$?',
    },
    // Shot 12 (32.64 - 35.98s): 木枠ホワイトボード緑世界地図＋グローバルブランド世界各地出現
    {
      id: 'shot12_whiteboard_world_pins',
      type: 'whiteboard_stage',
      startSec: T.worldMapBoard,
      endSec: T.talent,
      backdropMode: 'whiteboard',
      mode: 'world_map_pins',
      boardTitle: '地球規模で課金する多国籍ネットワーク',
      avatarEmblem: '$?',
    },
    // Shot 13 (35.98 - 38.39s): 大型モニター管制室＆エンジニア実写動画（ゆっくりズームイン）
    {
      id: 'shot13_control_room',
      type: 'video_broll',
      startSec: T.talent,
      endSec: T.techCampus,
      videoKey: 'control_room_vid',
      motion: 'slow_zoom_in',
      grade: 'editorial_cool',
      vignetteStrength: 0.58,
      locationTag: 'ASSET MANAGER // GLOBAL OPERATIONS',
    },
    // Shot 14 (38.39 - 40.95s): ガラス張り現代企業社屋＆従業員実写動画Bロール
    {
      id: 'shot14_tech_campus',
      type: 'video_broll',
      startSec: T.techCampus,
      endSec: T.geopolitics,
      videoKey: 'tech_campus_vid',
      motion: 'pan_left',
      grade: 'clean_bright',
      vignetteStrength: 0.45,
    },
    // Shot 15 (40.95 - 46.72s): 暗室プロジェクター投影（米国旗中心×各国色別バブルネットワーク）
    {
      id: 'shot15_projector_network',
      type: 'projector_network',
      startSec: T.geopolitics,
      endSec: T.middleman,
      centerLabel: 'United States',
    },
    // Shot 16 (46.72 - 51.04s): 市場実写動画＋左右グレーNPC100ドル握手＋中央 $? 仲介役アバター
    {
      id: 'shot16_middleman_satire',
      type: 'satire_gag',
      startSec: T.middleman,
      endSec: T.bureaucracy,
      mode: 'middleman_handshake',
      backgroundVideoKey: 'marketplace_vid',
      propImageKey: 'us_dollar_bill',
      avatarEmblem: '$?',
    },
    // Shot 17 (51.04 - 52.51s): 各国国旗＆国際協調実写動画Bロール
    {
      id: 'shot17_intl_flags',
      type: 'video_broll',
      startSec: T.bureaucracy,
      endSec: T.signing,
      videoKey: 'intl_flags_vid',
      motion: 'slow_zoom_in',
      grade: 'cinematic_vignette',
      vignetteStrength: 0.52,
    },
    // Shot 18 (52.51 - 54.14s): 会議テーブルで契約書署名クローズアップ実写動画Bロール
    {
      id: 'shot18_signing_contracts',
      type: 'video_broll',
      startSec: T.signing,
      endSec: T.worldWeb,
      videoKey: 'signing_contracts_vid',
      motion: 'slow_zoom_in',
      grade: 'clean_bright',
      vignetteStrength: 0.48,
    },
    // Shot 19 (54.14 - 59.13s): 白背景・緑米国から世界地図へズームアウト＋無数黒弧線＆対象国緑点灯
    {
      id: 'shot19_world_connection_map',
      type: 'world_connection_map',
      startSec: T.worldWeb,
      endSec: T.total,
      backdropMode: 'whiteboard',
      originIso: 'us',
    },
  ],
  };
}

export const HOW_MONEY_WORKS_BENCHMARK_SPEC: PlanEProjectSpec =
  buildHowMoneyWorksBenchmarkSpec(TIMELINE);

export const HOW_MONEY_WORKS_BENCHMARK_ELEVEN_V4_SPEC: PlanEProjectSpec =
  buildHowMoneyWorksBenchmarkSpec(TIMELINE_ELEVEN_V4);

export const HowMoneyWorksDestroyEconomy60s: React.FC = () => {
  return <PlanEMacroEconTemplateV2 spec={HOW_MONEY_WORKS_BENCHMARK_SPEC} />;
};

export const HowMoneyWorksDestroyEconomy60sElevenV4: React.FC = () => {
  return <PlanEMacroEconTemplateV2 spec={HOW_MONEY_WORKS_BENCHMARK_ELEVEN_V4_SPEC} />;
};
