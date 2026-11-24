import React from 'react';
import {
  allocation, at, atStart, definePlanESpec,
  type PlanEDefineInput, type PlanETimelineBase,
} from '../../../components/plan_e';
import { PlanEMacroEconTemplate } from '../../../templates/PlanEMacroEconTemplate';
import { BASE_TIMELINE } from '../../ab_tests/plan_e_luxury_trap/baseTimelineData';

const marginAlloc = allocation({
  idPrefix: 'lvmh_alloc',
  at: at('ルイ・ヴィトンを抱える'),
  total: {
    badge: '決算資料', code: 'LVMH 2024',
    label: 'ファッション＆\nレザーグッズ部門', value: '37.1%',
    rows: [['売上', '410.6億ユーロ'], ['営業利益', '152.3億ユーロ']],
    highlightRowIndex: 1, highlightAt: at('営業利益率が'),
    stamp: '利益率 37.1%', stampAt: at('37.1パーセント'),
  },
  recipients: [{
    label: '手元に残る利益', value: '37円', share: 0.371,
    at: at('100円売れるたびに'), valueAt: at('37円が残る'),
  }],
  benchmark: {
    label: '一般アパレル', value: '約9円', share: 0.09, note: '×数倍',
    at: at('普通のアパレルの'), noteAt: at('数倍の儲けです'),
  },
  token: 'coin',
});

export function createLuxuryTrapAllocationInput(): PlanEDefineInput {
  return {
    id: 'golden-plan-e-allocation',
    themeTitle: '決算と100円玉（配分ゴールデン）',
    range: { start: atStart(), end: at('ここで、妙なことが起きます。') },
    scenes: [
      {
        id: 'hook_tag', type: 'video_broll', start: atStart(), surface: 'dark_broll',
        imageKey: 'luxury_handbag_display', objectPosition: '23% 55%',
        motion: 'slow_zoom_in', vignetteStrength: 0.7,
        beats: [
          { id: 'hook_price_tag', at: at('160万円のバッグ'), prop: 'hang_tag', params: { x: 1290, y: 120, label: '店頭価格', price: '¥1,600,000' } },
          { id: 'hook_who_stamp', at: at('誰でしょう？'), prop: 'stamp', params: { text: '誰？', x: 1180, y: 600, size: 110, rotateDeg: -8 } },
        ],
      },
      {
        id: 'vhs_pause', type: 'vhs_pause_avatar', start: at('普通に考えれば'), surface: 'projector',
        frozenImageKey: 'luxury_handbag_display', timecodeLabel: '00:00:06', avatarEmblem: '富',
        beats: [{ id: 'vhs_click', at: at('普通に考えれば'), prop: 'custom_cue', params: { label: 'vhs_pause' }, sfx: 'vhs_pause' }],
      },
      {
        id: 'buyers_paper', type: 'diegetic_stage', start: at('ところが本物の大富豪ほど'), surface: 'paper',
        glitchIntroSec: 0.24, mastheadTitle: '号外　高級ブランドの買い手', mastheadSubtitle: 'BUYERS',
        beats: [
          { id: 'clip_rich', at: at('本物の大富豪ほど'), prop: 'photo_clip', params: { x: 400, y: 200, width: 440, height: 300, imageKey: 'ginza_luxury_street', caption: '大富豪：ロゴ小', rotateDeg: -2 } },
          { id: 'clip_logo', at: at('ロゴの目立つバッグ'), prop: 'photo_clip', params: { x: 960, y: 190, width: 440, height: 300, imageKey: 'luxury_handbag_display', objectPosition: '21% 55%', caption: '目立つロゴ', rotateDeg: 1.6 } },
          { id: 'x_logo', at: at('持ちたがりません'), prop: 'x_mark', params: { cx: 960, cy: 340, size: 140 } },
          { id: 'clip_worker', at: at('普通の会社員'), prop: 'photo_clip', params: { x: 1520, y: 215, width: 440, height: 300, imageKey: 'luxury_boutique_broll_poster', objectPosition: '50% 35%', filter: 'blur(1.2px) saturate(0.9)', caption: '普通の会社員', rotateDeg: -1.8 } },
          { id: 'stamp_buyer', at: at('ほうです'), prop: 'stamp', params: { text: '主な買い手', x: 1410, y: 400, size: 54, rotateDeg: -8 } },
        ],
      },
      {
        id: 'market_charcoal', type: 'diegetic_stage', start: at('世界の高級ブランド市場は'), surface: 'charcoal',
        badgeText: '市場構造', title: '世界の高級品市場',
        beats: [
          { id: 'cnt_60t', at: at('およそ60兆円'), prop: 'counter', params: { x: 460, y: 360, label: '2024年市場規模', valueText: '約60兆円', fontSize: 64 }, sfx: 'chart_tick' },
          { id: 'coin_2pct', at: at('45パーセント'), prop: 'coin', params: { cx: 1260, cy: 430, r: 170, frac: 0.45, face: '45%', label: '上位2%の超富裕層', valueText: '売上 45%', fillColor: '#1E8E3E' } },
        ],
      },
      {
        id: 'market_mass_paper', type: 'diegetic_stage', start: at('ところが残りの98パーセント'), surface: 'paper',
        mastheadTitle: '残り98%の内訳',
        beats: [{ id: 'cnt_350m', at: at('3億5000万人'), prop: 'counter', params: { x: 960, y: 420, label: '背伸び層', valueText: '約3.5億人（98%）', fontSize: 68 }, sfx: 'stamp_thud' }],
      },
      {
        id: 'stretch_broll', type: 'video_broll', start: at('背伸びして買う人たちが'), surface: 'dark_broll',
        videoKey: 'luxury_boutique_broll', blurPx: 5, brightness: 0.66,
        beats: [
          { id: 'cutout_55', at: at('売上の半分以上'), prop: 'cutout_card', params: { badge: '背伸び層', headline: '売上の55%', width: 620, rotateDeg: -1.6, x: 1120, y: 160 } },
          { id: 'stretch_stamp', at: at('を払っています'), prop: 'stamp', params: { text: '半分超', x: 1240, y: 520, size: 58, rotateDeg: -6 } },
        ],
      },
      {
        id: 'cash_destination', type: 'video_broll', start: at('その背伸びの代金は'), surface: 'dark_broll',
        videoKey: 'counting_cash_broll', motion: 'slow_zoom_in', grade: 'warm_night',
        beats: [{ id: 'cutout_dest', at: at('どこへ行くのか'), prop: 'cutout_card', params: { badge: '背伸びの代金', headline: '行き先は？', stampText: 'LVMH', width: 600, x: 1140, y: 140 } }],
      },
      { id: 'margin_allocation', type: 'custom', start: at('ルイ・ヴィトンを抱える'), surface: 'paper', ...marginAlloc },
      {
        id: 'price_tag_end', type: 'video_broll', start: at('しかも値札は上がり続け'), surface: 'dark_broll',
        imageKey: 'luxury_handbag_display', objectPosition: '22% 55%', blurPx: 10, brightness: 0.44, zoom: [1.14, 1.22],
        beats: [
          { id: 'stamp_2x', at: at('5年でほぼ2倍'), prop: 'stamp', params: { text: '5年で約2倍', x: 320, y: 260, size: 68, rotateDeg: -7 } },
          { id: 'tag_160m', at: at('160万円を超えました'), prop: 'hang_tag', params: { x: 1180, y: 110, label: '国内定価', price: '160万円超', scale: 1.1 } },
        ],
      },
    ],
  };
}

export const LUXURY_TRAP_ALLOCATION_INPUT = createLuxuryTrapAllocationInput();
export function buildLuxuryTrapAllocationSpec(base: PlanETimelineBase = BASE_TIMELINE) {
  return definePlanESpec(base, LUXURY_TRAP_ALLOCATION_INPUT);
}
export const LUXURY_TRAP_ALLOCATION_SPEC = buildLuxuryTrapAllocationSpec();
export const GoldenPlanEAllocation: React.FC = () => <PlanEMacroEconTemplate spec={LUXURY_TRAP_ALLOCATION_SPEC} />;
