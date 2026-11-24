import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { CleanSubtitle, FONT_ECON_SANS, usePlanEFonts } from '../../../../components/plan_e';
import { BASE_TIMELINE } from '../baseTimelineData';
import {
  B01Hook,
  B02WantedAd,
  B03PayStub,
  B04Question,
  B04bFreeze,
  B05Vhs,
  B06Plans,
  B07Backlash,
  B08Rejected,
  B09Reversal,
  B10Flyer,
  B11Grateful,
  B12SplitWest,
  B13Whiteboard,
  BeatProps,
} from './beatsA';
import {
  B14Special,
  B15Wanted,
  B16PriceFreeze,
  B17Wallet,
  B18Loop,
  B19Rational,
  B20Fallacy,
  B21Trap,
  B22Printing,
  B23Stuck,
  B24Projector,
} from './beatsB';

/**
 * AB_ZeroInflationTrap_v3_opus_high
 * 演出方針: シニカル報道＆風刺コラージュ・緩急重視型。
 * - 固定変数: BASE_TIMELINE の音声・総尺(2461f)・字幕をそのまま使用（再生成なし）。
 * - 8ショット × 25サブビート。サブビート境界はナレーション無音区間（ffmpeg silencedetect）に合わせて切る。
 * - 「急」= 実写Bロール＋速報帯／判子の着弾／チラシの連打、「緩」= VHS一時停止・フリーズ・暗室プロジェクター。
 * - 明（紙面・チラシ・ホワイトボード・撮影スタジオ）⇔ 暗（報道・暗室・罠）を交互に打ち、単調化を避ける。
 */

type BrollKind = 'full' | 'split' | 'freeze' | 'none';

interface Beat {
  id: string;
  shot: number;
  startSec: number;
  Comp: React.FC<BeatProps>;
  /** 字幕を「明背景用（濃色文字＋白縁）」に切り替える */
  light?: boolean;
  /** 実写Bロール比率の算定区分（full/split = 実写動画が画面全面を占有） */
  broll: BrollKind;
}

const BEATS: readonly Beat[] = [
  // Shot 1 — 思考実験フック
  { id: 'b01_hook_street', shot: 1, startSec: 0.0, Comp: B01Hook, broll: 'full' },
  { id: 'b02_wanted_ad', shot: 1, startSec: 3.38, Comp: B02WantedAd, broll: 'full' },
  { id: 'b03_paystub_years', shot: 1, startSec: 6.6, Comp: B03PayStub, broll: 'full' },
  { id: 'b04_question_crashzoom', shot: 1, startSec: 9.78, Comp: B04Question, broll: 'full' },
  { id: 'b04b_freeze_pause', shot: 1, startSec: 10.88, Comp: B04bFreeze, broll: 'freeze' },
  // Shot 2 — VHS一時停止＆派手な策の却下
  { id: 'b05_vhs_projector', shot: 2, startSec: 11.66, Comp: B05Vhs, broll: 'none' },
  { id: 'b06_plan_clippings', shot: 2, startSec: 12.7, Comp: B06Plans, broll: 'none', light: true },
  { id: 'b07_news_backlash', shot: 2, startSec: 16.99, Comp: B07Backlash, broll: 'full' },
  { id: 'b08_rejected_stamps', shot: 2, startSec: 21.0, Comp: B08Rejected, broll: 'none', light: true },
  // Shot 3 — 「真逆」＆じわじわ値下げ
  { id: 'b09_reversal_tag', shot: 3, startSec: 23.29, Comp: B09Reversal, broll: 'full' },
  { id: 'b10_flyer_slash', shot: 3, startSec: 26.4, Comp: B10Flyer, broll: 'none', light: true },
  { id: 'b11_grateful_studio', shot: 3, startSec: 29.69, Comp: B11Grateful, broll: 'full', light: true },
  // Shot 4 — 欧米 vs 日本
  { id: 'b12_split_west', shot: 4, startSec: 33.0, Comp: B12SplitWest, broll: 'split' },
  { id: 'b13_whiteboard_wages', shot: 4, startSec: 36.9, Comp: B13Whiteboard, broll: 'none', light: true },
  // Shot 5 — 犯人探し
  { id: 'b14_news_special', shot: 5, startSec: 42.36, Comp: B14Special, broll: 'full' },
  { id: 'b15_wanted_posters', shot: 5, startSec: 45.37, Comp: B15Wanted, broll: 'none' },
  // Shot 6 — インセンティブループ
  { id: 'b16_price_freeze', shot: 6, startSec: 49.44, Comp: B16PriceFreeze, broll: 'full' },
  { id: 'b17_wallet_zip', shot: 6, startSec: 53.9, Comp: B17Wallet, broll: 'full' },
  { id: 'b18_loop_split', shot: 6, startSec: 57.0, Comp: B18Loop, broll: 'split' },
  // Shot 7 — 合成の誤謬
  { id: 'b19_rational_checks', shot: 7, startSec: 59.48, Comp: B19Rational, broll: 'full' },
  { id: 'b20_fallacy_freeze', shot: 7, startSec: 65.14, Comp: B20Fallacy, broll: 'freeze' },
  // Shot 8 — 激安の罠 → 解剖へ
  { id: 'b21_mousetrap', shot: 8, startSec: 69.19, Comp: B21Trap, broll: 'none' },
  { id: 'b22_money_printing', shot: 8, startSec: 73.15, Comp: B22Printing, broll: 'full' },
  { id: 'b23_still_stuck', shot: 8, startSec: 76.07, Comp: B23Stuck, broll: 'full' },
  { id: 'b24_projector_openloop', shot: 8, startSec: 78.4, Comp: B24Projector, broll: 'none' },
];

const FPS = BASE_TIMELINE.fps;
const TOTAL = BASE_TIMELINE.totalFrames;

const RESOLVED = BEATS.map((b, i) => {
  const from = Math.round(b.startSec * FPS);
  const to = i + 1 < BEATS.length ? Math.round(BEATS[i + 1].startSec * FPS) : TOTAL;
  return { ...b, from, dur: Math.max(1, to - from) };
});

/** QA 用定量指標（実写動画が全面を占有するフレーム比率）。 */
export const V3_OPUS_HIGH_METRICS = (() => {
  const live = RESOLVED.filter((b) => b.broll === 'full' || b.broll === 'split').reduce((a, b) => a + b.dur, 0);
  const freeze = RESOLVED.filter((b) => b.broll === 'freeze').reduce((a, b) => a + b.dur, 0);
  return {
    shots: new Set(BEATS.map((b) => b.shot)).size,
    subBeats: BEATS.length,
    liveVideoFrames: live,
    liveVideoRatio: live / TOTAL,
    liveIncludingFreezeRatio: (live + freeze) / TOTAL,
  };
})();

export const ABZeroInflationTrapV3OpusHigh: React.FC = () => {
  const fontsReady = usePlanEFonts();
  const frame = useCurrentFrame();
  const active = RESOLVED.find((b) => frame >= b.from && frame < b.from + b.dur) ?? RESOLVED[RESOLVED.length - 1];

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', opacity: fontsReady ? 1 : 0.999 }}>
      <Audio src={staticFile(BASE_TIMELINE.audioSrc)} />
      {RESOLVED.map((b) => (
        <Sequence key={b.id} name={b.id} from={b.from} durationInFrames={b.dur}>
          <b.Comp t0={b.from / FPS} dur={b.dur} />
        </Sequence>
      ))}
      <CleanSubtitle
        cues={BASE_TIMELINE.subtitles}
        lightBg={Boolean(active.light)}
        fontSize={42}
        bottomOffset={60}
        maxWidth="88%"
        fontFamily={FONT_ECON_SANS}
      />
    </AbsoluteFill>
  );
};
