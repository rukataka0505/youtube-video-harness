import React from 'react';
import { AbsoluteFill } from 'remotion';
import {
  CountUp, DiegeticHangTag, DiegeticStamp, FONT_ECON_SANS, FONT_ECON_SERIF, InkStroke, LivingSurface,
  PaperScrap, PhotoPrint, Place, Pop, Spotlight, Window, at, definePlanESpec, eo, fly, hit, lerp, ramp, rnd,
  type PlanECustomSceneContext, type PlanEDefineInput, type PlanETimelineBase,
} from '../../../components/plan_e';
import { PlanEMacroEconTemplate } from '../../../templates/PlanEMacroEconTemplate';
import { BASE_TIMELINE } from '../../ab_tests/plan_e_luxury_trap/baseTimelineData';

/**
 * 自由舞台ゴールデン（技法見本。雛形コピー禁止）
 * 「5000万人が去ったのに、もう一段の値上げ」を 1 つの連続した舞台で語る。
 * - 時刻は ctx.cue()（区間内の語句）と ctx.beat()（hit の音ビート）だけから取る。相対秒・座標・振幅は自由。
 * - 暗い机 → 紙が滑り込む → 紙が抜けて黒板、を surfaceShifts で宣言し監査・字幕の明暗も追従させる。
 * - 全面の地は backdrop、字幕帯にかかってはならない物は render（PLAN_E_STAGE_BOTTOM で物理 clip）。
 */

const CROWD = Array.from({ length: 42 }, (_, i) => ({
  x: 730 + (i % 14) * 38 + rnd(i) * 10,
  y: 330 + Math.floor(i / 14) * 70 + rnd(i + 9) * 16,
  delay: rnd(i + 31) * 0.9,
}));

const backdrop = (c: PlanECustomSceneContext) => {
  const paperIn = c.beat('paper_in');
  const paperOut = c.beat('paper_out');
  const slideIn = eo(c.sec, paperIn, 0.32);
  const slideOut = eo(c.sec, paperOut, 0.3);
  const lamp = { x: lerp(1500, 1040, eo(c.sec, c.cue('約5000万人'), 0.9)), y: lerp(250, 380, eo(c.sec, c.cue('約5000万人'), 0.9)) };
  return (
    <>
      <LivingSurface surface={c.sec < paperOut ? 'dark_desk' : 'charcoal'} />
      {c.sec < paperOut ? (
        <Spotlight x={lamp.x} y={lamp.y} r={lerp(80, 420, eo(c.sec, c.beat('lamp'), 0.25))} strength={0.72} />
      ) : null}
      {c.sec >= paperIn && slideOut < 1 ? (
        <AbsoluteFill
          style={{
            transform: `translateX(${lerp(1920, 0, slideIn) - 1980 * slideOut}px) rotate(${lerp(2.5, 0, slideIn)}deg)`,
            boxShadow: '-30px 0 60px rgba(0,0,0,0.45)',
          }}
        >
          <LivingSurface surface="paper" />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const render = (c: PlanECustomSceneContext) => {
  const tOpen = c.cue('妙なこと');
  const tYears = c.beat('years');
  const tRise = c.cue('値上げと物価高');
  const tLeave = c.beat('crowd');
  const tGone = c.beat('leave');
  const tCut = c.beat('arrow_down');
  const tBut = c.beat('x_out');
  const tMore = c.beat('stamp');
  const paperIn = c.beat('paper_in');
  const paperOut = c.beat('paper_out');
  const drain = ramp(c.sec, tGone, 1.4);
  const serif = { fontFamily: FONT_ECON_SERIF, fontWeight: 900 } as const;

  return (
    <>
      <Window sec={c.sec} from={tOpen} to={paperIn + 0.3}>
        <DiegeticHangTag atSec={tOpen} x={1590} y={60} price="¥1,600,000" label="定番バッグ" swing />
        <Pop sec={c.sec} at={tYears} x={170} y={140} rot={-3}>
          <PaperScrap w={430} h={250} seed={3}>
            <CountUp sec={c.sec} at={tYears} dur={1.3} from={2022} to={2024} format={(n) => String(Math.round(n))}
              style={{ ...serif, fontFamily: FONT_ECON_SERIF, fontSize: 120, color: '#16130F', display: 'block', textAlign: 'center' }} />
            <div style={{ ...serif, fontSize: 40, color: '#C8102E', textAlign: 'center' }}>たった2年</div>
          </PaperScrap>
        </Pop>
        {['値上げ', '物価高'].map((w, i) => (
          <Pop key={w} sec={c.sec} at={tRise + i * 0.32} x={130 + i * 260} y={480 + i * 100} rot={i ? 5 : -6} from={1.6}>
            <PaperScrap w={250} seed={11 + i} tape={false} padding="14px 22px" tone="#F4EBD8">
              <div style={{ ...serif, fontSize: 64, color: '#C8102E', textAlign: 'center', whiteSpace: 'nowrap' }}>{w}</div>
            </PaperScrap>
          </Pop>
        ))}
        <Pop sec={c.sec} at={tLeave} x={700} y={200} rot={-2} from={1.25}>
          <div style={{ opacity: lerp(1, 0.38, drain), filter: `grayscale(${drain})` }}>
            <PhotoPrint src={c.media('tokyo_commuter_crowd')} w={560} h={360} caption="高級品を買っていた人たち" />
          </div>
        </Pop>
        {c.sec >= tGone
          ? CROWD.map((p, i) => {
              const f = fly(c.sec, tGone + p.delay * 0.8, 0.7, { x: p.x, y: p.y }, { x: p.x + (rnd(i + 5) - 0.5) * 260, y: 980 }, 90);
              return (
                <div key={i} style={{ position: 'absolute', left: f.x, top: f.y, width: 16, height: 16, borderRadius: 8,
                  background: c.ink.accent, opacity: f.u < 1 ? 0.9 : 0 }} />
              );
            })
          : null}
        <Pop sec={c.sec} at={tLeave + 0.2} x={1370} y={470} rot={-4}>
          <CountUp sec={c.sec} at={tLeave + 0.2} dur={1.6} to={5000}
            format={(n) => `−${Math.round(n).toLocaleString('ja-JP')}万人`}
            style={{ ...serif, fontFamily: FONT_ECON_SERIF, fontSize: 92, color: c.ink.accent, textShadow: '0 4px 18px rgba(0,0,0,0.6)' }} />
          <div style={{ fontFamily: FONT_ECON_SANS, fontWeight: 800, fontSize: 34, color: c.ink.ink, marginTop: 6 }}>市場から退場</div>
        </Pop>
      </Window>

      <Window sec={c.sec} from={paperIn + 0.18} to={paperOut + 0.05}>
        <Pop sec={c.sec} at={paperIn + 0.18} x={300} y={240} rot={-2}>
          <PaperScrap w={860} h={300} seed={21} tone="#FFFDF7">
            <div style={{ fontFamily: FONT_ECON_SANS, fontWeight: 800, fontSize: 34, color: '#5E554A' }}>客が去ったら、ふつうは</div>
            <div style={{ ...serif, fontSize: 124, color: '#16130F', whiteSpace: 'nowrap' }}>¥1,600,000</div>
          </PaperScrap>
        </Pop>
        <InkStroke sec={c.sec} at={tCut} dur={0.4} width={14} d="M 1250 250 C 1262 380 1240 520 1252 650 M 1196 590 L 1252 660 L 1306 590" />
        <Pop sec={c.sec} at={tCut + 0.25} x={1330} y={480} rot={6}>
          <div style={{ ...serif, fontSize: 88, color: '#C8102E' }}>値下げ？</div>
        </Pop>
        <InkStroke sec={c.sec} at={tBut} dur={0.18} width={18} color="#16130F" d="M 1310 470 L 1720 620" />
        <InkStroke sec={c.sec} at={tBut + 0.12} dur={0.18} width={18} color="#16130F" d="M 1710 465 L 1320 625" />
      </Window>

      <Window sec={c.sec} from={paperOut + 0.1}>
        <Pop sec={c.sec} at={paperOut + 0.1} x={260} y={250} rot={-3}>
          <PaperScrap w={860} h={250} seed={21} tone="#FFFDF7">
            <div style={{ ...serif, fontSize: 124, color: '#16130F', whiteSpace: 'nowrap' }}>¥1,600,000</div>
          </PaperScrap>
        </Pop>
        <InkStroke sec={c.sec} at={tMore - 0.25} dur={0.35} width={16} color={c.ink.highlight}
          d="M 1600 720 C 1588 580 1622 420 1604 200 M 1548 270 L 1604 190 L 1660 270" />
        <DiegeticStamp text="さらに値上げ" atSec={tMore} size={96} rotateDeg={-8} style={{ left: 880, top: 600 }} />
      </Window>
    </>
  );
};

export function createLuxuryTrapFreeStageInput(): PlanEDefineInput {
  return {
    id: 'golden-plan-e-free-stage',
    themeTitle: '去った5000万人ともう一段の値上げ（自由舞台ゴールデン）',
    range: { start: at('ここで、妙なことが起きます。'), end: at('この謎は、') },
    scenes: [
      {
        id: 'dropout_free_stage', type: 'custom', start: at('ここで、妙なことが起きます。'), surface: 'dark_desk',
        surfaceShifts: [
          { at: at('普通なら値下げ'), surface: 'paper' },
          { at: at('選んだのは'), surface: 'charcoal' },
        ],
        camera: {
          moves: [
            { at: at('約5000万人'), zoom: 1.07, x: -30, y: -12, dur: 0.9 },
            { at: at('普通なら値下げ', { offset: -0.3 }), zoom: 1, x: 0, y: 0, dur: 0.35 },
          ],
          shakes: [at('もう一段の値上げ', { offset: 0.1 })],
        },
        beats: [
          hit(at('妙なこと'), 'projector_click', { id: 'lamp' }),
          hit(at('2022年から'), 'chart_tick', { id: 'years' }),
          hit(at('値上げと物価高'), 'paper_snap', { id: 'labels' }),
          hit(at('約5000万人'), 'camera_shutter', { id: 'crowd' }),
          hit(at('市場を去りました'), 'whoosh', { id: 'leave' }),
          hit(at('普通なら値下げ', { offset: -0.3 }), 'paper_snap', { id: 'paper_in' }),
          hit(at('値下げを考える'), 'pen_scratch', { id: 'arrow_down' }),
          hit(at('ところがブランド'), 'impact_thud', { id: 'x_out' }),
          hit(at('選んだのは'), 'whoosh', { id: 'paper_out', gain: 0.24 }),
          hit(at('もう一段の値上げ'), 'stamp_thud', { id: 'stamp' }),
        ],
        backdrop,
        render,
      },
    ],
  };
}

export const LUXURY_TRAP_FREE_STAGE_INPUT = createLuxuryTrapFreeStageInput();
export function buildLuxuryTrapFreeStageSpec(base: PlanETimelineBase = BASE_TIMELINE) {
  return definePlanESpec(base, LUXURY_TRAP_FREE_STAGE_INPUT);
}
export const LUXURY_TRAP_FREE_STAGE_SPEC = buildLuxuryTrapFreeStageSpec();
export const GoldenPlanEFreeStage: React.FC = () => <PlanEMacroEconTemplate spec={LUXURY_TRAP_FREE_STAGE_SPEC} />;
