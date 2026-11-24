import React from 'react';
import {
  at, definePlanESpec, selection,
  type PlanEDefineInput, type PlanETimelineBase,
} from '../../../components/plan_e';
import { PlanEMacroEconTemplate } from '../../../templates/PlanEMacroEconTemplate';
import { BASE_TIMELINE } from '../../ab_tests/plan_e_luxury_trap/baseTimelineData';

const priceSieve = selection({
  idPrefix: 'veblen_sieve',
  at: at('値上げは客を'),
  badge: '仕組み',
  title: '値上げのふるい',
  population: { label: '高級品市場', count: '約4億人' },
  criterion: { label: '値上げ', at: at('値上げは客を', { offset: 0.25 }) },
  dropped: { label: '脱落', count: '−5,000万人', at: at('ふるい落としつつ') },
  kept: {
    label: '残った客', count: '買える側', stamp: 'まだ買える側',
    at: at('残った客に'), stampAt: at('買える側だ'),
  },
  device: 'sieve',
});

export function createLuxuryTrapSelectionInput(): PlanEDefineInput {
  return {
    id: 'golden-plan-e-selection',
    themeTitle: 'ヴェブレン＋値上げのふるい（選別ゴールデン）',
    range: { start: at('経済学者のヴェブレン'), end: at('日本だと、もっとよく見えます。') },
    scenes: [
      {
        id: 'veblen_paper', type: 'diegetic_stage', start: at('経済学者のヴェブレン'), surface: 'paper',
        mastheadTitle: '古典　有閑階級の理論', mastheadSubtitle: 'T. VEBLEN',
        beats: [
          { id: 'veblen_clip', at: at('経済学者のヴェブレン'), prop: 'photo_clip', params: { x: 560, y: 190, width: 660, height: 430, imageKey: 'paris_champs_elysees', filter: 'sepia(0.85) contrast(1.12) brightness(0.95)', caption: 'ヴェブレン『有閑階級の理論』', captionSize: 36, rotateDeg: -2.2 } },
          { id: 'veblen_1899', at: at('1899年に'), prop: 'stamp', params: { text: '1899', x: 330, y: 520, size: 78, rotateDeg: -8 } },
          { id: 'veblen_tag', at: at('高いこと自体が'), prop: 'hang_tag', params: { x: 1250, y: 180, label: '値札', price: '¥1,600,000', swing: true } },
          { id: 'veblen_stamp', at: at('価値になる品が'), prop: 'stamp', params: { text: 'ヴェブレン財', x: 1090, y: 640, size: 60, rotateDeg: -7 } },
        ],
      },
      { id: 'veblen_price_sieve', type: 'custom', start: at('値上げは客を'), surface: 'charcoal', ...priceSieve },
    ],
  };
}

export const LUXURY_TRAP_SELECTION_INPUT = createLuxuryTrapSelectionInput();
export function buildLuxuryTrapSelectionSpec(base: PlanETimelineBase = BASE_TIMELINE) {
  return definePlanESpec(base, LUXURY_TRAP_SELECTION_INPUT);
}
export const LUXURY_TRAP_SELECTION_SPEC = buildLuxuryTrapSelectionSpec();
export const GoldenPlanESelection: React.FC = () => <PlanEMacroEconTemplate spec={LUXURY_TRAP_SELECTION_SPEC} />;
