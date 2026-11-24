import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  PLAN_E_AUDIT_RULES,
  PlanEAnchorError,
  PlanEAuditError,
  allocation,
  at,
  atEvent,
  atStart,
  auditLegacyV2Spec,
  auditPlanEProjectSpec,
  auditPlanESource,
  definePlanESpec,
  resolveAnchor,
  selection,
  type PlanETimelineBase,
} from '../index';
import { BASE_TIMELINE as LUXURY_TRAP_BASE } from '../../../compositions/ab_tests/plan_e_luxury_trap/baseTimelineData';
import { AB_LUXURY_TRAP_V2_SPEC } from '../../../compositions/ab_tests/plan_e_luxury_trap/v2_opus_high';
import {
  LUXURY_TRAP_ALLOCATION_SPEC,
  LUXURY_TRAP_SELECTION_SPEC,
  buildLuxuryTrapAllocationSpec,
} from '../../../compositions/golden/plan_e';

test('v2_opus_high wrapped via definePlanESpec reproduces postmortem bright 27.1s and non-dark 54.9s violations within ±0.5s', () => {
  const report = auditLegacyV2Spec(AB_LUXURY_TRAP_V2_SPEC, LUXURY_TRAP_BASE);
  assert.equal(report.passed, true);
  assert.equal(report.strictPassed, false);
  assert.ok(
    Math.abs(report.metrics.maxBrightStreakSec - 27.1) <= 0.5,
    `Expected maxBrightStreakSec ≈ 27.1s, got ${report.metrics.maxBrightStreakSec}s`,
  );
  assert.ok(
    Math.abs(report.metrics.maxNonDarkStreakSec - 54.9) <= 0.5,
    `Expected maxNonDarkStreakSec ≈ 54.9s, got ${report.metrics.maxNonDarkStreakSec}s`,
  );
  assert.ok(report.editorial.some((e) => e.rule === 'bright_streak' && e.startSec !== undefined));
  assert.ok(report.editorial.some((e) => e.rule === 'non_dark_streak' && e.startSec !== undefined));
});

test('resolveAnchor resolves unique text, end edge, events, and throws on missing or ambiguous anchors', () => {
  const tStart = resolveAnchor(LUXURY_TRAP_BASE, at('もしあなたが'));
  const tEnd = resolveAnchor(LUXURY_TRAP_BASE, at('もしあなたが', { edge: 'end' }));
  assert.ok(tEnd > tStart, `Expected end (${tEnd}) > start (${tStart})`);
  assert.equal(resolveAnchor(LUXURY_TRAP_BASE, atEvent('vhsPauseSec')), 6.46);
  assert.equal(resolveAnchor(LUXURY_TRAP_BASE, atStart(0.2)), 0.2);

  assert.throws(() => resolveAnchor(LUXURY_TRAP_BASE, at('存在しないフレーズ')), PlanEAnchorError);
  // 「160万円」は seg_01_hook と seg_04_margin に複数回出現するため未指定は曖昧エラー
  assert.throws(() => resolveAnchor(LUXURY_TRAP_BASE, at('160万円')), PlanEAnchorError);
  assert.doesNotThrow(() => resolveAnchor(LUXURY_TRAP_BASE, at('160万円', { nth: 2 })));
  assert.doesNotThrow(() => resolveAnchor(LUXURY_TRAP_BASE, at('160万円', { chunk: 'seg_04_margin' })));
  assert.throws(() => resolveAnchor(LUXURY_TRAP_BASE, atEvent('unknownEvent')), PlanEAnchorError);
});

test('definePlanESpec derives endSec seamlessly, handles explicit silence, waivers, and release asset gates', () => {
  const spec = definePlanESpec(LUXURY_TRAP_BASE, {
    id: 'test-seamless',
    range: { start: atStart(), end: at('普通に考えれば') },
    scenes: [
      {
        id: 's1',
        type: 'diegetic_stage',
        start: atStart(),
        surface: 'dark_broll',
        beats: [
          {
            id: 'silent_tag',
            at: at('160万円のバッグ'),
            prop: 'hang_tag',
            params: { x: 100, y: 100, price: '¥1,600,000' },
            sfx: null,
          },
        ],
      },
      {
        id: 's2',
        type: 'diegetic_stage',
        start: at('誰でしょう？'),
        surface: 'paper',
      },
    ],
  });

  assert.equal(spec.scenes.length, 2);
  assert.equal(spec.scenes[0].startSec, 0);
  assert.equal(spec.scenes[0].endSec, spec.scenes[1].startSec);
  assert.equal(spec.scenes[1].endSec, spec.totalDurationSec);
  assert.equal(spec.scenes[0].beats?.[0].sfx, null);
  assert.equal(spec.scenes[0].beats?.[0].explicitSilence, true);

  const report = auditPlanEProjectSpec(spec);
  assert.equal(report.strictPassed, true);
  assert.equal(report.metrics.sfxCoverageRatio, 1);

  // 明色連続違反への waiver 免除と短い reason 拒否
  const badWave = definePlanESpec(LUXURY_TRAP_BASE, {
    id: 'test-waive',
    range: { start: atStart(), end: at('ここで、妙なことが起きます。') },
    scenes: [
      { id: 'all_paper', type: 'diegetic_stage', start: atStart(), surface: 'paper' },
    ],
    waivers: [{ rule: 'bright_streak', range: [0, 65], reason: '演出上の意図的な静止構成' }],
    throwOnAuditError: false,
  });
  const wRep = auditPlanEProjectSpec(badWave);
  assert.ok(wRep.waived.some((w) => w.rule === 'bright_streak'));
  assert.ok(!wRep.editorial.some((e) => e.rule === 'bright_streak'));

  assert.throws(
    () =>
      definePlanESpec(LUXURY_TRAP_BASE, {
        id: 'test-short-waiver',
        range: { start: atStart(), end: at('普通に考えれば') },
        scenes: [{ id: 's1', type: 'diegetic_stage', start: atStart(), surface: 'dark_broll' }],
        waivers: [{ rule: 'beat_gap', range: [0, 5], reason: 'ok' }],
      }),
    PlanEAuditError,
  );

  // release=true で未検品アセットをエラー扱い
  const relRep = auditPlanEProjectSpec(
    {
      ...spec,
      assets: {
        sample: { kind: 'videoClips', filename: 'x.mp4', verified: false },
      },
    },
    { release: true },
  );
  assert.equal(relRep.passed, false);
  assert.ok(relRep.errors.some((e) => e.code === 'unverified_asset'));
});

test('allocation and selection macros support all token/device variants without direct seconds', () => {
  const aBill = allocation({
    at: at('ルイ・ヴィトンを抱える'),
    total: { label: 'テスト総額', value: '100億円' },
    recipients: [{ label: '取り分', value: '37%', share: 0.37 }],
    token: 'bill',
  });
  const aBar = allocation({
    at: at('ルイ・ヴィトンを抱える'),
    total: { label: 'テスト総額', value: '100億円' },
    recipients: [{ label: '取り分', value: '37%', share: 0.37 }],
    token: 'bar',
  });
  const sGate = selection({
    at: at('値上げは客を'),
    population: { label: '母集団', count: '100人' },
    criterion: { label: '足切り', at: at('値上げは客を', { offset: 0.2 }) },
    dropped: { label: '脱落', count: '20人', at: at('ふるい落としつつ') },
    kept: { label: '残存', count: '80人', stamp: '合格', at: at('残った客に') },
    device: 'gate',
  });

  assert.ok(aBill.beats.length >= 2 && typeof aBill.render === 'function');
  assert.ok(aBar.beats.length >= 2 && typeof aBar.render === 'function');
  assert.ok(sGate.beats.length >= 4 && typeof sGate.render === 'function');

  const spec = definePlanESpec(LUXURY_TRAP_BASE, {
    id: 'macro-test',
    range: { start: at('ルイ・ヴィトンを抱える'), end: at('日本だと、もっとよく見えます。') },
    scenes: [
      { id: 'bill', type: 'custom', start: at('ルイ・ヴィトンを抱える'), surface: 'paper', ...aBill },
      { id: 'bar', type: 'custom', start: at('ここで、妙なことが起きます。'), surface: 'charcoal', ...aBar },
      { id: 'gate', type: 'custom', start: at('値上げは客を'), surface: 'paper', ...sGate },
    ],
  });
  const rep = auditPlanEProjectSpec(spec);
  assert.equal(rep.errors.length, 0);
  assert.equal(rep.metrics.sfxCoverageRatio, 1);
});

test('golden compositions pass strict audit with 100% SFX coverage and 0 absolute-second literals', () => {
  const repAlloc = auditPlanEProjectSpec(LUXURY_TRAP_ALLOCATION_SPEC);
  assert.equal(repAlloc.passed, true, JSON.stringify(repAlloc.errors));
  assert.equal(repAlloc.strictPassed, true, JSON.stringify(repAlloc.editorial));
  assert.equal(repAlloc.metrics.sfxCoverageRatio, 1);

  const repSel = auditPlanEProjectSpec(LUXURY_TRAP_SELECTION_SPEC);
  assert.equal(repSel.passed, true, JSON.stringify(repSel.errors));
  assert.equal(repSel.strictPassed, true, JSON.stringify(repSel.editorial));
  assert.equal(repSel.metrics.sfxCoverageRatio, 1);

  // v3.1: 行数上限（簡潔さの強制）は撤廃。禁止するのは絶対秒の直書き等の事故パターンのみ。
  const goldenDir = path.resolve(process.cwd(), 'src/compositions/golden/plan_e');
  for (const f of ['luxuryTrapAllocation.tsx', 'luxuryTrapSelection.tsx']) {
    const issues = auditPlanESource(readFileSync(path.join(goldenDir, f), 'utf-8'), f);
    assert.deepEqual(issues, [], `${f}: ${JSON.stringify(issues)}`);
  }
});

test('v3.0 acceptance: inserting 1 sentence before seg_04_margin shifts scenes/beats/SFX automatically with zero TSX edits', () => {
  const addedSentence = '実際に街へ出れば、その光景はすぐに目に入ります。';
  const deltaSec = 4.2;

  const newChunks = LUXURY_TRAP_BASE.chunks.map((c, idx) => {
    if (c.id === 'seg_03_market') {
      return {
        ...c,
        text: c.text + addedSentence,
        speechEndSec: +(c.speechEndSec + deltaSec).toFixed(4),
        endSec: +(c.endSec + deltaSec).toFixed(4),
      };
    }
    if (idx > 2) {
      return {
        ...c,
        startSec: +(c.startSec + deltaSec).toFixed(4),
        speechEndSec: +(c.speechEndSec + deltaSec).toFixed(4),
        endSec: +(c.endSec + deltaSec).toFixed(4),
      };
    }
    return c;
  });

  const newCharTimes: Record<string, number[]> = {};
  for (const [cid, arr] of Object.entries(LUXURY_TRAP_BASE.charTimes)) {
    if (cid === 'seg_03_market') {
      const seg03 = LUXURY_TRAP_BASE.chunks.find((c) => c.id === 'seg_03_market')!;
      const extraTimes = Array.from({ length: addedSentence.length }, (_, i) =>
        +(seg03.speechEndSec + ((i + 1) / addedSentence.length) * deltaSec).toFixed(3),
      );
      newCharTimes[cid] = [...arr, ...extraTimes];
    } else {
      const cIdx = LUXURY_TRAP_BASE.chunks.findIndex((c) => c.id === cid);
      newCharTimes[cid] = cIdx > 2 ? arr.map((t) => +(t + deltaSec).toFixed(3)) : [...arr];
    }
  }

  const shiftedBase: PlanETimelineBase = {
    ...LUXURY_TRAP_BASE,
    totalDurationSec: +(LUXURY_TRAP_BASE.totalDurationSec + deltaSec).toFixed(3),
    chunks: newChunks,
    charTimes: newCharTimes,
    subtitles: LUXURY_TRAP_BASE.subtitles.map((sub) =>
      sub.startSec >= 40.8
        ? {
            ...sub,
            startSec: +(sub.startSec + deltaSec).toFixed(4),
            endSec: +(sub.endSec + deltaSec).toFixed(4),
          }
        : sub,
    ),
  };

  // TSX 入力定義を一切変更せず再ビルド
  const origSpec = LUXURY_TRAP_ALLOCATION_SPEC;
  const shiftedSpec = buildLuxuryTrapAllocationSpec(shiftedBase);
  const shiftedReport = auditPlanEProjectSpec(shiftedSpec);

  assert.equal(shiftedReport.errors.length, 0);
  assert.equal(shiftedReport.strictPassed, true, JSON.stringify(shiftedReport.editorial));

  const origMarginScene = origSpec.scenes.find((s) => s.id === 'margin_allocation')!;
  const shiftedMarginScene = shiftedSpec.scenes.find((s) => s.id === 'margin_allocation')!;
  assert.ok(
    Math.abs(shiftedMarginScene.startSec - origMarginScene.startSec - deltaSec) < 0.01,
    `Expected margin_allocation startSec to shift by +${deltaSec}s`,
  );

  const origCoinBeat = origMarginScene.beats!.find((b) => b.id === 'lvmh_alloc_rec_0')!;
  const shiftedCoinBeat = shiftedMarginScene.beats!.find((b) => b.id === 'lvmh_alloc_rec_0')!;
  assert.ok(
    Math.abs(shiftedCoinBeat.timeSec - origCoinBeat.timeSec - deltaSec) < 0.01,
    `Expected coin beat & SFX timeSec to shift by +${deltaSec}s`,
  );

  // 紙面チャンク（seg_04_margin）に長文を追加して 15s 超になった場合、bright_streak が時刻付きで報告されること
  const longAdded = 'さらに世界中の店舗で価格改定が繰り返され、消費者の購入ハードルは毎年上がり続けています。';
  const paperDelta = 3.5;
  const bloatedBase: PlanETimelineBase = {
    ...shiftedBase,
    totalDurationSec: +(shiftedBase.totalDurationSec + paperDelta).toFixed(3),
    chunks: shiftedBase.chunks.map((c, idx) =>
      c.id === 'seg_04_margin'
        ? {
            ...c,
            text: c.text.replace('しかも値札は上がり続け', longAdded + 'しかも値札は上がり続け'),
            speechEndSec: +(c.speechEndSec + paperDelta).toFixed(4),
            endSec: +(c.endSec + paperDelta).toFixed(4),
          }
        : idx > 3
          ? {
              ...c,
              startSec: +(c.startSec + paperDelta).toFixed(4),
              speechEndSec: +(c.speechEndSec + paperDelta).toFixed(4),
              endSec: +(c.endSec + paperDelta).toFixed(4),
            }
          : c,
    ),
    charTimes: (() => {
      const out = { ...shiftedBase.charTimes };
      const seg04 = shiftedBase.chunks.find((c) => c.id === 'seg_04_margin')!;
      const splitIdx = seg04.text.indexOf('しかも値札は上がり続け');
      const oldTimes = shiftedBase.charTimes['seg_04_margin'];
      const tAtSplit = oldTimes[splitIdx];
      const extra = Array.from({ length: longAdded.length }, (_, i) =>
        +(tAtSplit + (i / longAdded.length) * paperDelta).toFixed(3),
      );
      out['seg_04_margin'] = [
        ...oldTimes.slice(0, splitIdx),
        ...extra,
        ...oldTimes.slice(splitIdx).map((t) => +(t + paperDelta).toFixed(3)),
      ];
      return out;
    })(),
  };

  const bloatedSpec = buildLuxuryTrapAllocationSpec(bloatedBase);
  const bloatedReport = auditPlanEProjectSpec(bloatedSpec);
  const brightIssue = bloatedReport.editorial.find((e) => e.rule === 'bright_streak');
  assert.ok(
    brightIssue && brightIssue.startSec !== undefined && brightIssue.endSec !== undefined,
    `Expected bright_streak with startSec/endSec, got ${JSON.stringify(bloatedReport.editorial)}`,
  );
  assert.ok(brightIssue.durationSec! > PLAN_E_AUDIT_RULES.MAX_BRIGHT_STREAK_SEC);
});
