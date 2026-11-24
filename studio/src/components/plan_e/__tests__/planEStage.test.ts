import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { Html5Video, OffthreadVideo, useCurrentFrame } from 'remotion';
import { collectBeatSfxEvents } from '../sfx';
import {
  ChalkFilterDef,
  DARK_MEDIA_BACKDROP_DEFAULTS,
  DarkMediaBackdrop,
  DustField,
  InkFxFilterDefs,
  InkFxLayer,
  LightBeam,
  MediaPlate,
  PLAN_E_INK,
  PLAN_E_STAGE_BOTTOM,
  PlanEAnchorError,
  SfxCue,
  activeSurfaceSegmentAt,
  at,
  atStart,
  auditPlanEProjectSpec,
  auditPlanESource,
  cameraTransformAt,
  createStageContext,
  definePlanESpec,
  handLine,
  hit,
  impulses,
  normalizeMediaBackdrop,
  ring,
  rr,
  sag,
  surfaceSegments,
  tornRect,
  type PlanECustomSceneContext,
  type PlanEDefineInput,
  type PlanETimelineBase,
} from '../index';
import { BASE_TIMELINE as BASE } from '../../../compositions/ab_tests/plan_e_luxury_trap/baseTimelineData';
import {
  LUXURY_TRAP_FREE_STAGE_SPEC,
  buildLuxuryTrapFreeStageSpec,
} from '../../../compositions/golden/plan_e';

const SEG05 = { start: at('ここで、妙なことが起きます。'), end: at('この謎は、') };

test('beat SFX reads legacy manifests, resolves aliases, and falls back to shared studio/public/sfx/<kind>.wav', () => {
  const spec = definePlanESpec(
    {
      ...BASE,
      sfxMap: { paper_snap: 'paper.wav', phone_notification: 'old.wav' },
      sfxVariants: { phone_notification: ['bell-1.wav', 'bell-2.wav'] },
    },
    {
      id: 'stage-sfx-test',
      range: SEG05,
      scenes: [{
        id: 'free',
        type: 'custom',
        start: SEG05.start,
        surface: 'charcoal',
        render: () => null,
        beats: [
          hit(at('ここで、妙なことが起きます。', { offset: 0.4 }), 'phone_notification'),
          hit(SEG05.start, 'phone_notification', { gain: 0.4 }),
          hit(at('ここで、妙なことが起きます。', { offset: 0.02 }), 'phone_notification'),
          hit(at('ここで、妙なことが起きます。', { offset: 0.2 }), 'finger_snap'),
          hit(at('ここで、妙なことが起きます。', { offset: 0.8 }), 'phone_notification'),
        ],
      }],
    },
  );
  const cues = collectBeatSfxEvents(spec);
  assert.deepEqual(cues.map((cue) => cue.src), ['bell-1.wav', 'paper.wav', 'bell-2.wav', 'bell-1.wav']);
  assert.equal(cues[0].gain, 0.4);
  assert.deepEqual(collectBeatSfxEvents({ ...spec, sfxVariants: undefined }).map((cue) => cue.src),
    ['old.wav', 'paper.wav', 'old.wav', 'old.wav']);
  const standardManifest = { ...spec, sfxVariants: undefined, sfxMap: { radar_beep: 'beep.wav', paper_snap: 'snap.wav' } };
  assert.deepEqual(collectBeatSfxEvents(standardManifest).map((cue) => cue.src),
    ['beep.wav', 'snap.wav', 'beep.wav', 'beep.wav']);
  const sharedFallback = { ...spec, sfxVariants: undefined, sfxMap: {} };
  assert.deepEqual(collectBeatSfxEvents(sharedFallback).map((cue) => cue.src),
    ['sfx/radar_beep.wav', 'sfx/paper_snap.wav', 'sfx/radar_beep.wav', 'sfx/radar_beep.wav']);
  assert.equal(auditPlanEProjectSpec({ ...spec, sfxMap: { paper_snap: 'paper.wav' } }).editorial
    .some((issue) => issue.rule === 'missing_prop_sfx'), false);
});

test('direct <SfxCue> in free stage render() resolves silent_stage and catches unknown kind', () => {
  const renderWithStdSfx = (c: PlanECustomSceneContext) => {
    const times = ['妙なこと', '2022年から', '値上げと物価高', '約5000万人', '普通なら値下げ', 'ところがブランド', 'もう一段の値上げ'].map((w) => c.cue(w));
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(SfxCue, { kind: 'stamp_thud', atSec: times[3] }),
      React.createElement(SfxCue, { src: 'episodes/demo/sfx/custom_hook.wav', atSec: times[6] }),
    );
  };
  const okReport = auditPlanEProjectSpec(stageSpec(renderWithStdSfx));
  assert.equal(okReport.errors.length, 0, JSON.stringify(okReport.errors));
  assert.equal(okReport.editorial.some((e) => e.rule === 'silent_stage'), false);

  const renderWithBadSfx = (c: PlanECustomSceneContext) => {
    const t0 = c.cue('妙なこと');
    c.cue('約5000万人');
    return React.createElement(SfxCue, { kind: 'not_a_real_sfx' as never, atSec: t0 });
  };
  const badReport = auditPlanEProjectSpec(stageSpec(renderWithBadSfx));
  assert.ok(badReport.errors.some((e) => e.code === 'unknown_sfx_kind'));
});

function stageSpec(
  render: (c: PlanECustomSceneContext) => unknown,
  extra: Partial<Extract<PlanEDefineInput['scenes'][number], { type: 'custom' }>> = {},
  waivers?: PlanEDefineInput['waivers'],
) {
  return definePlanESpec(BASE, {
    id: 'stage-test',
    range: SEG05,
    scenes: [
      {
        id: 'free',
        type: 'custom',
        start: SEG05.start,
        surface: 'charcoal',
        render: render as never,
        ...extra,
      },
    ],
    ...(waivers ? { waivers } : {}),
    throwOnAuditError: false,
  });
}

test('free-stage golden passes strict audit; cues, surfaceShifts and camera feed the audit', () => {
  const rep = auditPlanEProjectSpec(LUXURY_TRAP_FREE_STAGE_SPEC);
  assert.deepEqual(rep.errors, []);
  assert.equal(rep.strictPassed, true, JSON.stringify(rep.editorial));
  assert.equal(rep.metrics.stageRatio, 1);
  assert.ok(rep.metrics.stageCueCount >= 3, `cues observed: ${rep.metrics.stageCueCount}`);
  // dark_desk → paper → charcoal の切替で暗・明が区間ごとに計上される
  assert.ok(rep.metrics.brightRatio > 0.1 && rep.metrics.brightRatio < 0.4, String(rep.metrics.brightRatio));
  assert.ok(rep.metrics.maxBeatGapSec < 3, String(rep.metrics.maxBeatGapSec));
  assert.deepEqual(rep.advice, []);
});

test('stage context: relative time, surface/ink follow surfaceShifts, media/beat/cue resolve or throw', () => {
  const spec = LUXURY_TRAP_FREE_STAGE_SPEC;
  const sc = spec.scenes[0];
  const fps = spec.fps ?? 30;
  const shift = sc.surfaceShifts![0];
  const before = createStageContext(spec, sc, Math.floor((shift.atSec - 0.2) * fps), fps);
  const after = createStageContext(spec, sc, Math.ceil((shift.atSec + 0.1) * fps), fps);
  assert.equal(before.surface, 'dark_desk');
  assert.equal(after.surface, 'paper');
  assert.equal(after.ink, PLAN_E_INK.paper);
  assert.equal(after.polarity, 'bright');
  assert.ok(after.t > before.t && after.progress > 0 && after.progress < 1);
  assert.equal(after.stage.bottom, PLAN_E_STAGE_BOTTOM);
  assert.match(after.media('tokyo_commuter_crowd'), /s03_tokyo_salaryman_crowd\.jpg$/);
  assert.throws(() => after.media('ai_generated_crowd'), /not in imageMap\/videoMap/);
  assert.equal(after.beat('stamp'), sc.beats!.find((b) => b.id === 'stamp')!.timeSec);
  // 「ところが」は台本中に複数回あるが、シーン区間内に 1 回だけなので一意に解決する
  const tBut = after.cue('ところが');
  assert.ok(tBut > shift.atSec && tBut < sc.endSec);
  assert.throws(() => after.cue('160万円のバッグ'), PlanEAnchorError);
});

test('audit probe turns stage accidents into errors: unresolved cue, unknown media, hooks, throws', () => {
  const cases: [string, (c: PlanECustomSceneContext) => unknown][] = [
    ['stage_cue_unresolved', (c) => c.cue('ヴェブレン')],
    ['stage_unknown_media', (c) => c.media('missing_key')],
    ['stage_hook_in_render', () => useCurrentFrame()],
    ['stage_render_throws', (c) => (c.t > 3 ? (null as unknown as { x: number }).x : null)],
  ];
  for (const [code, render] of cases) {
    const rep = auditPlanEProjectSpec(stageSpec(render));
    assert.ok(rep.errors.some((e) => e.code === code), `${code}: ${JSON.stringify(rep.errors)}`);
    assert.equal(rep.passed, false);
  }
});

test('surfaceShifts split polarity streaks and are validated against the scene range', () => {
  const longPaper = definePlanESpec(BASE, {
    id: 'shift-split',
    range: { start: at('ところが残りの98パーセント'), end: at('ここで、妙なことが起きます。') },
    scenes: [
      {
        id: 'paper_then_desk', type: 'custom', start: at('ところが残りの98パーセント'), surface: 'paper',
        surfaceShifts: [{ at: at('ルイ・ヴィトンを抱える'), surface: 'dark_desk' }, { at: at('しかも値札は'), surface: 'paper' }],
        beats: [hit(at('背伸びの代金'), 'paper_snap'), hit(at('37円が残る'), 'price_ping')],
        render: (c) => [c.cue('3億5000万人'), c.cue('売上の半分以上'), c.cue('営業利益率'), c.cue('普通のアパレル'), c.cue('5年でほぼ2倍')],
      },
    ],
    throwOnAuditError: false,
  });
  const rep = auditPlanEProjectSpec(longPaper);
  assert.ok(!rep.editorial.some((e) => e.rule === 'bright_streak'), JSON.stringify(rep.editorial));
  assert.ok(rep.metrics.darkRatio > 0.2);

  const bad = definePlanESpec(BASE, {
    id: 'shift-bad',
    range: SEG05,
    scenes: [
      {
        id: 'free', type: 'custom', start: SEG05.start, surface: 'charcoal',
        surfaceShifts: [{ at: at('ルイ・ヴィトンを抱える'), surface: 'paper' }],
        render: () => null,
      },
    ],
    throwOnAuditError: false,
  });
  assert.ok(auditPlanEProjectSpec(bad).errors.some((e) => e.code === 'invalid_surface_shift'));
});

test('silent_stage flags visual cues without sound; hit() or a waiver resolves it; hit with unmapped SFX is caught', () => {
  const render = (c: PlanECustomSceneContext) =>
    ['妙なこと', '2022年から', '値上げと物価高', '約5000万人', '普通なら値下げ', 'ところがブランド', 'もう一段の値上げ'].map((w) => c.cue(w));
  const silent = auditPlanEProjectSpec(stageSpec(render));
  assert.ok(silent.editorial.some((e) => e.rule === 'silent_stage'));

  const voiced = auditPlanEProjectSpec(stageSpec(render, { beats: [hit(at('約5000万人'), 'whoosh')] }));
  assert.ok(!voiced.editorial.some((e) => e.rule === 'silent_stage'));

  const waived = auditPlanEProjectSpec(
    stageSpec(render, { surfaceShifts: [{ at: at('普通なら値下げ'), surface: 'paper' }] }, [
      { rule: 'silent_stage', range: [0, 18], reason: '無音の間で喪失感を出す演出' },
    ]),
  );
  assert.ok(waived.waived.some((w) => w.rule === 'silent_stage'));
  assert.equal(waived.strictPassed, true, JSON.stringify(waived.editorial));

  const unmapped = auditPlanEProjectSpec(stageSpec(render, { beats: [hit(at('約5000万人'), 'mallet_bonk')] }));
  assert.ok(unmapped.editorial.some((e) => e.rule === 'missing_prop_sfx' && /mallet_bonk/.test(e.message)));
});

test('camera: anchor-driven moves ease in and impacts shake for a short decay', () => {
  const cam = { moves: [{ atSec: 2, zoom: 1.2, x: -40, y: 0, durSec: 0.5 }], shakes: [4], shakeAmp: 12, origin: '50% 45%' };
  assert.match(cameraTransformAt(1, cam), /scale\(1\.0000\)/);
  assert.match(cameraTransformAt(3, cam), /scale\(1\.2000\)/);
  assert.notEqual(cameraTransformAt(4.05, cam), cameraTransformAt(3.9, cam));
  assert.equal(cameraTransformAt(5, cam), cameraTransformAt(3.9, cam));
});

test('retiming the narration moves free-stage shifts, hits and cues with zero TSX edits', () => {
  const delta = 1.5;
  const seg = BASE.chunks.find((c) => c.id === 'seg_05_dropout')!;
  const splitIdx = seg.text.indexOf('普通なら');
  const segIdx = BASE.chunks.findIndex((c) => c.id === seg.id);
  const retimed: PlanETimelineBase = {
    ...BASE,
    totalDurationSec: BASE.totalDurationSec + delta,
    chunks: BASE.chunks.map((c, i) =>
      i < segIdx ? c
        : i === segIdx ? { ...c, speechEndSec: c.speechEndSec + delta, endSec: c.endSec + delta }
          : { ...c, startSec: c.startSec + delta, speechEndSec: c.speechEndSec + delta, endSec: c.endSec + delta },
    ),
    charTimes: Object.fromEntries(
      Object.entries(BASE.charTimes).map(([id, arr]) => {
        const i = BASE.chunks.findIndex((c) => c.id === id);
        if (i < segIdx) return [id, arr];
        if (i === segIdx) return [id, arr.map((t, k) => (k >= splitIdx ? +(t + delta).toFixed(3) : t))];
        return [id, arr.map((t) => +(t + delta).toFixed(3))];
      }),
    ),
  };
  const a = LUXURY_TRAP_FREE_STAGE_SPEC;
  const b = buildLuxuryTrapFreeStageSpec(retimed);
  const sa = a.scenes[0];
  const sb = b.scenes[0];
  assert.ok(Math.abs(sb.surfaceShifts![0].atSec - sa.surfaceShifts![0].atSec - delta) < 0.01);
  assert.ok(Math.abs(sb.beats!.find((x) => x.id === 'stamp')!.timeSec - sa.beats!.find((x) => x.id === 'stamp')!.timeSec - delta) < 0.01);
  assert.equal(sb.beats!.find((x) => x.id === 'crowd')!.timeSec, sa.beats!.find((x) => x.id === 'crowd')!.timeSec);
  const ca = createStageContext(a, sa, 0, 30);
  const cb = createStageContext(b, sb, 0, 30);
  assert.ok(Math.abs(cb.cue('値下げを考える') - ca.cue('値下げを考える') - delta) < 0.01);
  assert.equal(auditPlanEProjectSpec(b).strictPassed, true);
});

test('source audit bans absolute seconds, on-screen citations, manifest bypass, legacy and SaaS UI; relative offsets stay free', () => {
  const codes = (src: string) => auditPlanESource(src).map((i) => i.code);
  assert.deepEqual(codes('const s = { startSec: 12.5 };'), ['src_absolute_time']);
  assert.deepEqual(codes('<DiegeticStamp atSec={41.2} text="x" />'), ['src_absolute_time']);
  assert.deepEqual(codes("start: atStart(12.3),"), ['src_absolute_time']);
  assert.deepEqual(codes("const c = '出典：総務省';"), ['src_onscreen_citation']);
  assert.deepEqual(codes("<Img src={staticFile('x.jpg')} />"), ['src_media_bypass']);
  assert.deepEqual(codes("const u = 'https://example.com/a.mp4';"), ['src_media_bypass']);
  const generated = '// Auto-generated by pipeline/scripts/build_plan_e_assets.py\n';
  const credit = '"sourceUrl": "https://example.com/a.mp4",';
  assert.deepEqual(codes(generated + credit), []);
  assert.deepEqual(codes(credit), ['src_media_bypass']);
  assert.deepEqual(codes(generated + credit + '\nconst src = staticFile("b.jpg");'), ['src_media_bypass']);
  assert.deepEqual(codes("import { X } from '../plan_e/legacy/WhiteboardStage';"), ['src_legacy_import']);
  assert.deepEqual(codes("import { BgKraftCork } from '../../../components/stickman_collage';"), ['src_cross_format_import']);
  assert.deepEqual(codes("import { RiggedStickman } from '../../../components/stickman_collage/RiggedStickman';"), ['src_cross_format_import']);
  assert.deepEqual(codes("const m = await import('../../components/stickman_collage/fonts');"), ['src_cross_format_import']);
  assert.deepEqual(codes("import { InkFxLayer, DustField, LightBeam, tornRect, sag, impulses } from '../../../components/plan_e';"), []);
  assert.deepEqual(codes("style={{ borderLeft: '6px solid #64748B' }}"), ['src_saas_ui']);
  assert.deepEqual(codes("style={{ borderRadius: 999 }}"), ['src_saas_ui']);
  // 相対オフセット・持続秒・座標は自由
  assert.deepEqual(codes('const p = eo(c.sec, tGone + 0.8, 0.35); const q = ramp(c.sec, t0 - 0.25, 1.4);'), []);
  assert.deepEqual(codes("hit(at('普通なら値下げ', { offset: -0.3 }), 'paper_snap')"), []);
  assert.deepEqual(codes('// startSec: 12 はコメントなので対象外'), []);

  const goldenDir = path.resolve(process.cwd(), 'src/compositions/golden/plan_e');
  for (const f of readdirSync(goldenDir).filter((n) => n.endsWith('.tsx'))) {
    const issues = auditPlanESource(readFileSync(path.join(goldenDir, f), 'utf-8'), f);
    assert.deepEqual(issues, [], `${f}: ${JSON.stringify(issues)}`);
  }
});

test('free-stage scene needs no beats to define and keeps guard/living defaults; macros opt out explicitly', () => {
  const spec = definePlanESpec(BASE, {
    id: 'defaults',
    range: { start: atStart(), end: at('普通に考えれば') },
    scenes: [{ id: 's', type: 'custom', start: atStart(), surface: 'dark_broll', render: () => null }],
  });
  const sc = spec.scenes[0];
  assert.equal(sc.type, 'custom');
  if (sc.type === 'custom') {
    assert.equal(sc.guard, undefined);
    assert.equal(sc.living, undefined);
  }
  assert.ok(spec.timeline && spec.timeline.chunks.length > 0);
});

test('shared material drawers expose pure path math and optical primitives via plan_e', () => {
  assert.equal(impulses(0.5, [1, 2], 1), 0);
  assert.ok(impulses(1.0, [1, 2], 1) > 0.99);
  assert.ok(impulses(2.0, [1, 2], 1) > 1.0);
  assert.match(tornRect(10, 20, 200, 100, 7, 6), /^M .+ Z$/);
  assert.match(sag({ x: 0, y: 0 }, { x: 100, y: 0 }, 15), /^M 0 0 Q 50\.00 30\.00 100 0$/);
  assert.match(handLine(0, 0, 100, 0, 3, 1), /^M 0 0 Q /);
  assert.match(rr(0, 0, 100, 60, 2, 1), /^M .+ Z$/);
  assert.match(ring(50, 50, 30, 1), /^M .+ Z$/);
  assert.equal(typeof InkFxLayer, 'function');
  assert.equal(typeof InkFxFilterDefs, 'function');
  assert.equal(typeof ChalkFilterDef, 'function');
  assert.equal(typeof DustField, 'function');
  assert.equal(typeof LightBeam, 'function');
});

test('mediaBackdrop resolves on custom scenes and surfaceShifts, coexists with backdrop(ctx), and validates via stage_unknown_media', () => {
  const spec = definePlanESpec(BASE, {
    id: 'media-backdrop-shifts',
    range: SEG05,
    scenes: [
      {
        id: 'mixed_stage',
        type: 'custom',
        start: SEG05.start,
        surface: 'dark_broll',
        mediaBackdrop: 'luxury_boutique_broll',
        surfaceShifts: [
          { at: at('普通なら値下げ'), surface: 'paper' },
          {
            at: at('選んだのは'),
            surface: 'dark_broll',
            mediaBackdrop: { key: 'counting_cash_broll', dim: 0.52, blurPx: 2, vignette: 0.7, loop: true },
          },
        ],
        beats: [
          hit(at('妙なこと'), 'whoosh'),
          hit(at('約5000万人'), 'camera_shutter'),
          hit(at('普通なら値下げ'), 'paper_snap'),
          hit(at('もう一段の値上げ'), 'stamp_thud'),
        ],
        backdrop: (c) => (c.sec >= c.cue('約5000万人') ? React.createElement('div', null, c.media('tokyo_commuter_crowd')) : null),
        render: (c) => [c.cue('2022年から'), c.cue('値上げと物価高'), c.cue('ところがブランド')],
      },
    ],
    throwOnAuditError: false,
  });

  const rep = auditPlanEProjectSpec(spec);
  assert.deepEqual(rep.errors, []);
  assert.equal(rep.strictPassed, true, JSON.stringify(rep.editorial));

  const sc = spec.scenes[0];
  const segs = surfaceSegments(sc);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].surface, 'dark_broll');
  assert.equal(normalizeMediaBackdrop(segs[0].mediaBackdrop!).key, 'luxury_boutique_broll');
  assert.equal(segs[1].surface, 'paper');
  assert.equal(segs[1].mediaBackdrop, undefined);
  assert.equal(segs[2].surface, 'dark_broll');
  assert.deepEqual(normalizeMediaBackdrop(segs[2].mediaBackdrop!), {
    key: 'counting_cash_broll',
    dim: 0.52,
    blurPx: 2,
    vignette: 0.7,
    loop: true,
  });

  assert.equal(activeSurfaceSegmentAt(sc, sc.startSec).index, 0);
  assert.equal(activeSurfaceSegmentAt(sc, segs[1].startSec + 0.05).index, 1);
  assert.equal(activeSurfaceSegmentAt(sc, segs[2].startSec + 0.05).index, 2);

  // 未登録キーはシーン直下・surfaceShifts のいずれも既存の stage_unknown_media で検出
  const badScene = stageSpec(() => null, {
    surface: 'dark_broll',
    mediaBackdrop: 'non_existent_broll',
  });
  const badSceneRep = auditPlanEProjectSpec(badScene);
  assert.equal(badSceneRep.passed, false);
  assert.ok(badSceneRep.errors.some((e) => e.code === 'stage_unknown_media' && /mediaBackdrop/.test(e.message)));

  const badShift = stageSpec(() => null, {
    surface: 'paper',
    surfaceShifts: [
      { at: at('普通なら値下げ'), surface: 'dark_broll', mediaBackdrop: { key: 'missing_shift_clip', dim: 0.5 } },
    ],
  });
  const badShiftRep = auditPlanEProjectSpec(badShift);
  assert.equal(badShiftRep.passed, false);
  assert.ok(
    badShiftRep.errors.some((e) => e.code === 'stage_unknown_media' && /surfaceShifts\[0\]\.mediaBackdrop/.test(e.message)),
  );
});

test('DarkMediaBackdrop applies dark defaults and MediaPlate supports blurPx and vignette', () => {
  const darkEl = DarkMediaBackdrop({
    src: '/videos/sample.mp4',
    sec: 2,
    fromSec: 0,
    toSec: 10,
  });
  assert.ok(React.isValidElement(darkEl));
  assert.equal(darkEl.type, MediaPlate);
  assert.equal((darkEl.props as { dim?: number }).dim, DARK_MEDIA_BACKDROP_DEFAULTS.dim);
  assert.equal((darkEl.props as { vignette?: number }).vignette, DARK_MEDIA_BACKDROP_DEFAULTS.vignette);
  assert.equal((darkEl.props as { filter?: string }).filter, DARK_MEDIA_BACKDROP_DEFAULTS.filter);

  const plateEl = MediaPlate({
    src: '/images/sample.jpg',
    sec: 2,
    fromSec: 0,
    toSec: 10,
    blurPx: 3,
    dim: 0.4,
    vignette: 0.65,
  }) as React.ReactElement<{ children: React.ReactNode[] }>;
  assert.ok(React.isValidElement(plateEl));
  const [mediaLayer, dimLayer, vignetteLayer] = plateEl.props.children;
  assert.ok(React.isValidElement(mediaLayer));
  assert.match(String((mediaLayer.props as { style?: { filter?: string } }).style?.filter), /blur\(3px\)/);
  assert.ok(React.isValidElement(dimLayer));
  assert.ok(React.isValidElement(vignetteLayer));

  // loop 未指定時は OffthreadVideo、loop: true 時は Html5Video (loop=true) を描画
  const defaultVideoPlate = MediaPlate({
    src: '/videos/short_clip.mp4',
    sec: 2,
    fromSec: 0,
    toSec: 12,
  }) as React.ReactElement<{ children: React.ReactNode[] }>;
  const defaultSeq = (defaultVideoPlate.props.children[0] as React.ReactElement<{ children: React.ReactElement }>).props.children;
  const defaultVideo = (defaultSeq.props as { children: React.ReactElement }).children;
  assert.equal(defaultVideo.type, OffthreadVideo);

  const loopedVideoPlate = MediaPlate({
    src: '/videos/short_clip.mp4',
    sec: 2,
    fromSec: 0,
    toSec: 12,
    loop: true,
  }) as React.ReactElement<{ children: React.ReactNode[] }>;
  const loopedSeq = (loopedVideoPlate.props.children[0] as React.ReactElement<{ children: React.ReactElement }>).props.children;
  const loopedVideo = (loopedSeq.props as { children: React.ReactElement }).children;
  assert.equal(loopedVideo.type, Html5Video);
  assert.equal((loopedVideo.props as { loop?: boolean }).loop, true);
});
