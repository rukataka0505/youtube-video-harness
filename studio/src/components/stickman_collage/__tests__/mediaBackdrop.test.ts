import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { Html5Video, OffthreadVideo } from 'remotion';
import { MediaBackdropPlate } from '../../_materials';
import {
  STICKMAN_MEDIA_BACKDROP_DEFAULTS,
  isStickmanVideoSrc,
  normalizeStickmanMediaBackdrop,
  resolveMediaBackdropBlock,
  resolveMediaBackdropDimColor,
  resolveMediaBackdropTheme,
  type StickmanRuntimeShot,
} from '../index';

const makeShot = (
  idx: number,
  startSec: number,
  endSec: number,
  overrides: Partial<StickmanRuntimeShot> = {},
): StickmanRuntimeShot => ({
  shotIndex: idx + 1,
  chunkId: `c${String(idx + 1).padStart(2, '0')}`,
  chapterIndex: 1,
  topicId: 'ch01',
  narrativeRole: 'example_illustration',
  polarity: 'black',
  narrationJa: 'テスト',
  startSec,
  endSec,
  durationSec: endSec - startSec,
  startFrame: Math.round(startSec * 30),
  endFrame: Math.round(endSec * 30),
  ...overrides,
});

test('normalizeStickmanMediaBackdrop handles string, object, and empty inputs', () => {
  assert.deepEqual(normalizeStickmanMediaBackdrop('city_night'), { assetId: 'city_night' });
  assert.deepEqual(normalizeStickmanMediaBackdrop('  city_night  '), { assetId: 'city_night' });
  assert.deepEqual(
    normalizeStickmanMediaBackdrop({
      assetId: 'rain_clip',
      dim: 0.52,
      blurPx: 2,
      trimBeforeSec: 4,
      loop: true,
    }),
    { assetId: 'rain_clip', dim: 0.52, blurPx: 2, trimBeforeSec: 4, loop: true },
  );
  assert.equal(normalizeStickmanMediaBackdrop('   '), undefined);
  assert.equal(normalizeStickmanMediaBackdrop(undefined), undefined);
  assert.equal(normalizeStickmanMediaBackdrop({ assetId: ' ' }), undefined);
});

test('isStickmanVideoSrc recognizes mp4/webm/mov/m4v and rejects images', () => {
  assert.equal(isStickmanVideoSrc('episodes/ep01/assets/city.mp4'), true);
  assert.equal(isStickmanVideoSrc('https://example.com/clip.webm?v=1'), true);
  assert.equal(isStickmanVideoSrc('/static/rain.MOV'), true);
  assert.equal(isStickmanVideoSrc('episodes/ep01/assets/city.m4v'), true);
  assert.equal(isStickmanVideoSrc('episodes/ep01/assets/photo.jpg'), false);
  assert.equal(isStickmanVideoSrc('episodes/ep01/assets/photo.png'), false);
});

test('resolveMediaBackdropTheme adjusts subtitle and calm band without injecting ineffective cutout overrides', () => {
  const darkBlack = resolveMediaBackdropTheme('black');
  assert.equal(darkBlack.subtitleIsLight, false);
  assert.equal(darkBlack.glow, '#FFF2D6');
  assert.equal(darkBlack.cutout, undefined);
  assert.ok(darkBlack.calmStrength >= STICKMAN_MEDIA_BACKDROP_DEFAULTS.subtitleCalmStrength);

  const darkBlueprint = resolveMediaBackdropTheme('blueprint');
  assert.equal(darkBlueprint.subtitleIsLight, false);
  assert.equal(darkBlueprint.glow, '#9FD3FF');
  assert.equal(darkBlueprint.calmColor, '#06142A');
  assert.equal(darkBlueprint.cutout, undefined);
  assert.equal(resolveMediaBackdropDimColor('blueprint'), '#06142A');

  // 中間極性・明極性に対して効いていない cutout を強制注入しない
  const midWood = resolveMediaBackdropTheme('wood_desk');
  assert.equal(midWood.cutout, '#FBF7EE');
  const midCork = resolveMediaBackdropTheme('kraft_cork');
  assert.equal(midCork.subtitleIsLight, false);
  assert.equal(midCork.cutout, undefined);

  const lightSketch = resolveMediaBackdropTheme('white_sketch');
  assert.equal(lightSketch.subtitleIsLight, false);
  assert.equal(lightSketch.subtitleColor, '#FFFFFF');
  assert.equal(lightSketch.subtitleOutline, '#000000');
  assert.equal(lightSketch.calmColor, '#050608');
  assert.equal(lightSketch.cutout, undefined);

  assert.equal(resolveMediaBackdropDimColor('black', '#101820'), '#101820');
});

test('resolveMediaBackdropBlock merges contiguous identical tracks and splits on polarity, trim, loop, or intermission', () => {
  const shots: StickmanRuntimeShot[] = [
    makeShot(0, 0, 5, { polarity: 'black', mediaBackdrop: 'city_night' }),
    makeShot(1, 5, 11, { polarity: 'black', mediaBackdrop: { assetId: 'city_night', dim: 0.6 } }),
    makeShot(2, 11, 16, { polarity: 'blueprint', mediaBackdrop: 'city_night' }),
    makeShot(3, 16, 21, { polarity: 'blueprint', mediaBackdrop: { assetId: 'city_night', trimBeforeSec: 8 } }),
    makeShot(4, 21, 26, { polarity: 'blueprint', mediaBackdrop: { assetId: 'city_night', trimBeforeSec: 8, loop: true } }),
    makeShot(5, 26, 32),
    makeShot(6, 34, 40, { chapterIndex: 2, polarity: 'black', mediaBackdrop: 'city_night' }),
  ];
  const intermissions = [{ firstShotChunkId: 'c07', cutSec: 32.4 }];

  const b0 = resolveMediaBackdropBlock(shots, 0, intermissions);
  const b1 = resolveMediaBackdropBlock(shots, 1, intermissions);
  assert.equal(b0?.startIdx, 0);
  assert.equal(b0?.endIdx, 1);
  assert.equal(b0?.startSec, 0);
  assert.equal(b0?.endSec, 11);
  assert.equal(b1?.startIdx, 0);
  assert.equal(b1?.endIdx, 1);
  assert.equal(b1?.config.dim, 0.6);

  // polarity が変わると別ブロックに分割される
  const b2 = resolveMediaBackdropBlock(shots, 2, intermissions);
  assert.equal(b2?.startIdx, 2);
  assert.equal(b2?.endIdx, 2);
  assert.equal(b2?.startSec, 11);
  assert.equal(b2?.endSec, 16);

  // trimBeforeSec が変わると別ブロックに分割される
  const b3 = resolveMediaBackdropBlock(shots, 3, intermissions);
  assert.equal(b3?.startIdx, 3);
  assert.equal(b3?.endIdx, 3);
  assert.equal(b3?.startSec, 16);
  assert.equal(b3?.endSec, 21);

  // loop が変わると別ブロックに分割される
  const b4 = resolveMediaBackdropBlock(shots, 4, intermissions);
  assert.equal(b4?.startIdx, 4);
  assert.equal(b4?.endIdx, 4);
  assert.equal(b4?.config.loop, true);

  // mediaBackdrop 未指定は undefined
  assert.equal(resolveMediaBackdropBlock(shots, 5, intermissions), undefined);

  // 章間アイキャッチ直後のブロックは cutSec から開始する
  const b6 = resolveMediaBackdropBlock(shots, 6, intermissions);
  assert.equal(b6?.startIdx, 6);
  assert.equal(b6?.startSec, 32.4);
  assert.equal(b6?.endSec, 40);
});

test('shared MediaBackdropPlate switches between OffthreadVideo and Html5Video loop and preserves dimColor', () => {
  const normal = MediaBackdropPlate({
    src: '/videos/rain.mp4',
    sec: 1,
    fromSec: 0,
    toSec: 10,
    dim: 0.48,
    dimColor: '#06142A',
    vignette: 0.64,
  }) as React.ReactElement<{ style?: React.CSSProperties; children: React.ReactNode[] }>;
  assert.equal(normal.props.style?.backgroundColor, '#06142A');
  const normalSeq = (normal.props.children[0] as React.ReactElement<{ children: React.ReactElement }>).props.children;
  const normalVideo = (normalSeq.props as { children: React.ReactElement }).children;
  assert.equal(normalVideo.type, OffthreadVideo);

  const looped = MediaBackdropPlate({
    src: '/videos/rain.mp4',
    sec: 1,
    fromSec: 0,
    toSec: 10,
    loop: true,
    dim: 0.48,
    dimColor: '#06142A',
    vignette: 0.64,
  }) as React.ReactElement<{ children: React.ReactNode[] }>;
  const loopedSeq = (looped.props.children[0] as React.ReactElement<{ children: React.ReactElement }>).props.children;
  const loopedVideo = (loopedSeq.props as { children: React.ReactElement }).children;
  assert.equal(loopedVideo.type, Html5Video);
  assert.equal((loopedVideo.props as { loop?: boolean }).loop, true);
});
