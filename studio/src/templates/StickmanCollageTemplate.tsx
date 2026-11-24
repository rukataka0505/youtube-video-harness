import React, { useCallback, useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { SfxTimeOriginProvider } from '../components/SfxCue';
import {
  BUGURU_EYECATCH_CUT_SEC,
  BUGURU_EYECATCH_DURATION_SEC,
  BuguruEyecatch,
  ClippingCard,
  CollageSubtitle,
  HandNote,
  PhotoCollageFrame,
  PolarityArrowCallout,
  PolarityBackground,
  PolarityBarChart,
  PolarityBigStat,
  PolarityCompareCards,
  PolarityComparisonTable,
  PolarityEquationFlow,
  PolarityKineticList,
  PolarityMatrix2x2,
  PolarityRedCircle,
  PolarityRulerGauge,
  PolarityStamp,
  PolarityTransitionFlash,
  STICKMAN_CONTENT_BOTTOM,
  ScalePop,
  StaggeredItemGrid,
  StickmanBubble,
  StickmanEndCtaStage,
  StickmanFigure,
  StickmanMediaBackdropLayer,
  beatAt,
  createShotCueResolver,
  normalizeStickmanMediaBackdrop,
  resolveMediaBackdropBlock,
  resolveMediaBackdropTheme,
  resolvePolarityTheme,
  resolveRelativeBeats,
  resolveShotBeats,
  resolveStickmanAssetSrc,
  resolveStickmanMediaSrc,
  useStickmanCollageFonts,
  type ClippingVariant,
  type CollageSubtitleCue,
  type MediaBackdropBlock,
  type PolarityBarChartItem,
  type PolarityBigStatItem,
  type PolarityCompareCardItem,
  type PolarityComparisonTableItem,
  type PolarityEquationNode,
  type PolarityKineticItem,
  type PolarityMatrixHighlightCell,
  type StagePolarity,
  type StaggeredItemShape,
  type StickmanCollageDemoRenderProps,
  type StickmanCollageRuntimeSpec,
  type StickmanFigureSpec,
  type StickmanPhotoLayerSpec,
  type StickmanResolvedAsset,
  type StickmanRuntimeChapterEyecatch,
  type StickmanRuntimeShot,
  type StickmanSafeRect,
  type StickmanSceneProps,
} from '../components/stickman_collage';
import { VIDEO_SPEC } from '../theme/tokens';

export interface StickmanCollageTemplateProps {
  spec: StickmanCollageRuntimeSpec;
  customScenes?: Record<string, React.FC<StickmanSceneProps>>;
  customDemos?: Record<string, React.FC<StickmanCollageDemoRenderProps>>;
  customBackground?: React.FC<{ polarity: StagePolarity; enterSec: number; sec: number; actorX?: number }>;
  showSafeGuide?: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

const asOptString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

const asNumber = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const asOptNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const asBool = (v: unknown, fallback = false): boolean =>
  typeof v === 'boolean' ? v : fallback;

const asStringTuple2 = (v: unknown, fallback: [string, string]): [string, string] => {
  if (Array.isArray(v) && v.length >= 2) {
    return [asString(v[0], fallback[0]), asString(v[1], fallback[1])];
  }
  return fallback;
};

const asCells2x2 = (v: unknown): [[string, string], [string, string]] => {
  if (Array.isArray(v) && v.length >= 2 && Array.isArray(v[0]) && Array.isArray(v[1])) {
    return [
      [asString(v[0][0]), asString(v[0][1])],
      [asString(v[1][0]), asString(v[1][1])],
    ];
  }
  return [
    ['', ''],
    ['', ''],
  ];
};

const renderPhotoNode = (
  photo: StickmanPhotoLayerSpec,
  spec: StickmanCollageRuntimeSpec,
  sec: number,
  shot: StickmanRuntimeShot,
  beats: readonly number[],
  polarity: StagePolarity,
  width: number,
  height: number,
): React.ReactNode => {
  const resolved = resolveStickmanAssetSrc(spec.assetCatalog, photo.assetId);
  if (!resolved) {
    return null;
  }
  const t0 = shot.startSec;
  const triggerSec =
    photo.triggerOffsetSec !== undefined
      ? t0 + photo.triggerOffsetSec
      : beatAt(beats, photo.beatIndex ?? 0, t0 + 0.04);

  const defaultVariant =
    resolved.item.kind === 'person_photo'
      ? 'polaroid_person'
      : resolved.item.kind === 'photo_cutout'
        ? 'cutout'
        : 'tape_scrap';

  const variant = photo.variant ?? defaultVariant;
  const labelJa =
    photo.labelJa ??
    (variant === 'polaroid_person' ? resolved.item.subjectNameJa ?? resolved.item.labelJa : undefined);

  return (
    <PhotoCollageFrame
      src={resolved.src}
      variant={variant}
      polarity={polarity}
      width={width}
      height={height}
      rotateDeg={photo.rotateDeg ?? -2.0}
      zoomFrom={photo.kenBurnsScaleFrom ?? 1.02}
      zoomTo={photo.kenBurnsScaleTo ?? 1.08}
      objectPosition={photo.objectPosition ?? resolved.item.objectPosition}
      labelJa={labelJa}
      tape={photo.tape ?? variant !== 'cutout'}
      dim={photo.dim ?? 0}
      sec={sec}
      triggerSec={triggerSec}
      durationSec={Math.max(0.8, shot.endSec - triggerSec)}
    />
  );
};

const renderDiagramNode = (
  shot: StickmanRuntimeShot,
  sec: number,
  polarity: StagePolarity,
  spec: StickmanCollageRuntimeSpec,
  customDemos?: Record<string, React.FC<StickmanCollageDemoRenderProps>>,
): React.ReactNode => {
  const diag = shot.diagram;
  if (!diag) {
    return null;
  }

  const t0 = shot.startSec;
  const t1 = shot.endSec;
  const beats = resolveShotBeats(t0, t1, shot.beatTimesSec);
  const p = isRecord(diag.params) ? diag.params : {};
  const theme = resolvePolarityTheme(polarity);

  switch (diag.kind) {
    case 'big_stat': {
      const rawItems = Array.isArray(p.items) ? p.items : [];
      const items: PolarityBigStatItem[] = rawItems.filter(isRecord).map((it) => ({
        text: asString(it.text),
        sub: asOptString(it.sub),
        color: asOptString(it.color),
        at: asOptNumber(it.at),
        beatIndex: asOptNumber(it.beatIndex),
      }));
      return <PolarityBigStat items={items} sec={sec} beats={beats} t0={t0} polarity={polarity} />;
    }

    case 'bar_chart': {
      const rawBars = Array.isArray(p.bars) ? p.bars : [];
      const bars: PolarityBarChartItem[] = rawBars.filter(isRecord).map((b) => ({
        label: asString(b.label),
        value: asNumber(b.value, 0),
        color: asOptString(b.color),
        at: asOptNumber(b.at),
        beatIndex: asOptNumber(b.beatIndex),
      }));
      const baseAtIdx = asOptNumber(p.baselineBeatIndex);
      const baselineAt =
        asOptNumber(p.baselineAt) ??
        (baseAtIdx !== undefined ? beatAt(beats, baseAtIdx, t0 + 0.9) : undefined);

      return (
        <PolarityBarChart
          bars={bars}
          sec={sec}
          beats={beats}
          t0={t0}
          max={asNumber(p.max, 100)}
          unit={asString(p.unit, '%')}
          baseline={asOptNumber(p.baseline)}
          baselineLabel={asOptString(p.baselineLabel)}
          baselineAt={baselineAt}
          polarity={polarity}
        />
      );
    }

    case 'staggered_grid': {
      const count = asNumber(p.count, 24);
      const rawShape = asString(p.itemShape, 'paper_sheet');
      const itemShape: StaggeredItemShape =
        rawShape === 'book' || rawShape === 'person' || rawShape === 'coin' || rawShape === 'dot'
          ? rawShape
          : 'paper_sheet';
      const startAt =
        asOptNumber(p.startSec) ?? beatAt(beats, asNumber(p.beatIndex, 0), t0 + 0.12);
      const spanSec = asNumber(p.spanSec, Math.max(1.2, Math.min(2.6, t1 - t0 - 0.6)));
      const statOverlay = isRecord(p.statOverlay) ? p.statOverlay : undefined;

      if (statOverlay) {
        const statItem: PolarityBigStatItem = {
          text: asString(statOverlay.text, String(count)),
          sub: asOptString(statOverlay.sub),
          color: asOptString(statOverlay.color),
          at: asOptNumber(statOverlay.at) ?? startAt + Math.min(0.9, spanSec * 0.45),
        };
        return (
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 36,
              paddingInline: 12,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ width: '36%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PolarityBigStat items={[statItem]} sec={sec} beats={beats} t0={t0} polarity={polarity} />
            </div>
            <div style={{ width: '62%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <StaggeredItemGrid
                count={count}
                itemShape={itemShape}
                highlightCount={asNumber(p.highlightCount, 0)}
                columns={asOptNumber(p.columns)}
                sec={sec}
                startSec={startAt}
                spanSec={spanSec}
                polarity={polarity}
                highlightColor={asOptString(p.highlightColor)}
                width={980}
                height={520}
                boil={asBool(p.boil, false)}
              />
            </div>
          </div>
        );
      }

      return (
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <StaggeredItemGrid
            count={count}
            itemShape={itemShape}
            highlightCount={asNumber(p.highlightCount, 0)}
            columns={asOptNumber(p.columns)}
            sec={sec}
            startSec={startAt}
            spanSec={spanSec}
            polarity={polarity}
            highlightColor={asOptString(p.highlightColor)}
            width={1260}
            height={540}
            boil={asBool(p.boil, false)}
          />
        </div>
      );
    }

    case 'equation_flow': {
      const rawNodes = Array.isArray(p.nodes) ? p.nodes : [];
      const nodes: PolarityEquationNode[] = rawNodes.filter(isRecord).map((n) => ({
        text: asString(n.text),
        isOperator: asBool(n.isOperator, false),
        bg: asOptString(n.bg),
        color: asOptString(n.color),
        at: asOptNumber(n.at),
        beatIndex: asOptNumber(n.beatIndex),
      }));
      const noteBeat = asOptNumber(p.handNoteBeat);
      return (
        <PolarityEquationFlow
          nodes={nodes}
          sec={sec}
          beats={beats}
          t0={t0}
          handNote={asOptString(p.handNote)}
          handNoteAt={noteBeat !== undefined ? beatAt(beats, noteBeat, t0 + 0.2) : undefined}
          polarity={polarity}
        />
      );
    }

    case 'compare_cards': {
      const rawCards = Array.isArray(p.cards) ? p.cards : [];
      const cards: PolarityCompareCardItem[] = rawCards.filter(isRecord).map((c) => {
        const assetId = asOptString(c.assetId);
        const resolved = assetId ? resolveStickmanAssetSrc(spec.assetCatalog, assetId) : undefined;
        const crossBeat = asOptNumber(c.crossedOutBeatIndex);
        return {
          title: asString(c.title),
          body: asOptString(c.body),
          badge: asOptString(c.badge),
          imageSrc: resolved?.src ?? asOptString(c.imageSrc),
          highlight: asBool(c.highlight, false),
          bg: asOptString(c.bg),
          tiltDeg: asOptNumber(c.tiltDeg),
          at: asOptNumber(c.at),
          beatIndex: asOptNumber(c.beatIndex),
          crossedOutAt:
            asOptNumber(c.crossedOutAt) ??
            (crossBeat !== undefined ? beatAt(beats, crossBeat, t0 + 1.4) : undefined),
        };
      });
      return <PolarityCompareCards cards={cards} sec={sec} beats={beats} t0={t0} polarity={polarity} />;
    }

    case 'matrix_2x2': {
      const rawHl = isRecord(p.highlightCell) ? p.highlightCell : undefined;
      const highlightCell: PolarityMatrixHighlightCell | undefined = rawHl
        ? {
            row: asNumber(rawHl.row, 0) === 1 ? 1 : 0,
            col: asNumber(rawHl.col, 0) === 1 ? 1 : 0,
            startSec:
              asOptNumber(rawHl.startSec) ??
              beatAt(beats, asNumber(rawHl.beatIndex, 1), t0 + 1.0),
            annotation: asOptString(rawHl.annotation),
            color: asOptString(rawHl.color),
          }
        : undefined;

      return (
        <PolarityMatrix2x2
          topAxisTitle={asOptString(p.topAxisTitle)}
          topLabels={asStringTuple2(p.topLabels, ['A', 'B'])}
          leftAxisTitle={asOptString(p.leftAxisTitle)}
          leftLabels={asStringTuple2(p.leftLabels, ['1', '2'])}
          cells={asCells2x2(p.cells)}
          revealCellsSec={asNumber(p.revealCellsSec, t0 + 0.35)}
          highlightCell={highlightCell}
          sec={sec}
          polarity={polarity}
        />
      );
    }

    case 'comparison_table': {
      const mapItems = (raw: unknown, defaultOffset: number): PolarityComparisonTableItem[] => {
        if (!Array.isArray(raw)) {
          return [];
        }
        return raw.filter(isRecord).map((it, idx) => ({
          text: asString(it.text),
          triggerSec:
            asOptNumber(it.triggerSec) ??
            beatAt(beats, asNumber(it.beatIndex, idx), t0 + defaultOffset + idx * 0.55),
          highlight: asBool(it.highlight, false),
          color: asOptString(it.color),
        }));
      };
      return (
        <PolarityComparisonTable
          leftTitle={asString(p.leftTitle, 'A')}
          rightTitle={asString(p.rightTitle, 'B')}
          leftTitleColor={asOptString(p.leftTitleColor)}
          rightTitleColor={asOptString(p.rightTitleColor)}
          lineStartSec={asNumber(p.lineStartSec, t0 + 0.08)}
          leftItems={mapItems(p.leftItems, 0.45)}
          rightItems={mapItems(p.rightItems, 0.75)}
          sec={sec}
          polarity={polarity}
          itemFontSize={asNumber(p.itemFontSize, 38)}
        />
      );
    }

    case 'kinetic_list': {
      const rawItems = Array.isArray(p.items) ? p.items : [];
      const items: PolarityKineticItem[] = rawItems.filter(isRecord).map((it, idx) => ({
        id: asOptString(it.id),
        triggerSec:
          asOptNumber(it.triggerSec) ??
          beatAt(beats, asNumber(it.beatIndex, idx), t0 + 0.1 + idx * 0.5),
        text: asString(it.text),
        color: asOptString(it.color),
        fontSize: asOptNumber(it.fontSize),
        serif: asBool(it.serif, false),
        width: asOptNumber(it.width),
        rotateDeg: asOptNumber(it.rotateDeg),
        accentColor: asOptString(it.accentColor),
        isConclusion: asBool(it.isConclusion, false),
      }));
      // 旧タイムライン互換のため clip_cards は paper_notes へフォールバック
      const variant = p.variant === 'paper_notes' || p.variant === 'clip_cards' ? 'paper_notes' : 'formula';
      const align = p.align === 'center' ? 'center' : 'left';
      return (
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <PolarityKineticList items={items} sec={sec} polarity={polarity} variant={variant} align={align} />
        </div>
      );
    }

    case 'newspaper_card': {
      const rawVariant = asString(p.variant, 'editorial_serif');
      const variant: ClippingVariant =
        rawVariant === 'broadsheet' || rawVariant === 'web_news' ? rawVariant : 'editorial_serif';
      const imgAssetId = asOptString(p.imageAssetId);
      const resolvedImg = imgAssetId ? resolveStickmanAssetSrc(spec.assetCatalog, imgAssetId) : undefined;
      const startAt =
        asOptNumber(p.startSec) ?? beatAt(beats, asNumber(p.beatIndex, 0), t0 + 0.04);

      return (
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <ClippingCard
            variant={variant}
            polarity={polarity}
            publicationName={asString(p.publicationName, 'RESEARCH DIGEST')}
            categoryLabel={asOptString(p.categoryLabel)}
            headline={asOptString(p.headline)}
            headlinePrefix={asOptString(p.headlinePrefix)}
            highlightedHeadline={asOptString(p.highlightedHeadline)}
            headlineSuffix={asOptString(p.headlineSuffix)}
            subHeadline={asOptString(p.subHeadline)}
            excerpt={asOptString(p.excerpt)}
            imageSrc={resolvedImg?.src}
            imagePosition={p.imagePosition === 'left' ? 'left' : 'right'}
            imageHeight={asNumber(p.imageHeight, 210)}
            startSec={startAt}
            sec={sec}
            rotateDeg={asNumber(p.rotateDeg, -1.4)}
            width={asNumber(p.width, 960)}
            highlightDelaySec={asNumber(p.highlightDelaySec, 0.4)}
            highlightDurationSec={asNumber(p.highlightDurationSec, 0.55)}
          />
        </div>
      );
    }

    case 'ruler_gauge': {
      const variant = p.variant === 'battery' ? 'battery' : 'ruler';
      const atSec = asOptNumber(p.at) ?? beatAt(beats, asNumber(p.beatIndex, 0), t0 + 0.15);
      const animAt =
        asOptNumber(p.animateAt) ??
        beatAt(beats, asNumber(p.animateBeatIndex, 1), atSec + 0.45);
      return (
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <PolarityRulerGauge
            variant={variant}
            label={asString(p.label, variant === 'battery' ? '行動エネルギー' : '効果量 d')}
            sec={sec}
            at={atSec}
            animateAt={animAt}
            fromValue={asOptNumber(p.fromValue)}
            toValue={asOptNumber(p.toValue)}
            min={asNumber(p.min, 0)}
            max={asNumber(p.max, variant === 'battery' ? 100 : 1)}
            polarity={polarity}
          />
        </div>
      );
    }

    case 'red_circle_mark': {
      const atSec = beatAt(beats, asNumber(p.beatIndex, 1), t0 + 0.45);
      return (
        <PolarityRedCircle
          sec={sec}
          at={atSec}
          cx={asNumber(p.cx, 864)}
          cy={asNumber(p.cy, 400)}
          rx={asNumber(p.rx, 165)}
          ry={asNumber(p.ry, 115)}
          dashed={asBool(p.dashed, false)}
          color={asOptString(p.color)}
          polarity={polarity}
        />
      );
    }

    case 'arrow_flow': {
      const atSec = beatAt(beats, asNumber(p.beatIndex, 1), t0 + 0.35);
      return (
        <PolarityArrowCallout
          sec={sec}
          at={atSec}
          fromX={asNumber(p.fromX, 420)}
          fromY={asNumber(p.fromY, 420)}
          toX={asNumber(p.toX, 1260)}
          toY={asNumber(p.toY, 340)}
          curveOffsetY={asNumber(p.curveOffsetY, -110)}
          color={asOptString(p.color)}
          label={asOptString(p.label)}
          polarity={polarity}
        />
      );
    }

    case 'stamp_reveal': {
      const atSec = beatAt(beats, asNumber(p.beatIndex, 1), t0 + 0.55);
      return (
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <PolarityStamp
            text={asString(p.text, '重要')}
            sec={sec}
            at={atSec}
            polarity={polarity}
            color={asOptString(p.color)}
            rotateDeg={asNumber(p.rotateDeg, -10)}
            fontSize={asNumber(p.fontSize, 86)}
          />
        </div>
      );
    }

    case 'custom_demo': {
      const demoKey = diag.demoKey;
      const DemoComp = demoKey && customDemos ? customDemos[demoKey] : undefined;
      if (!DemoComp) {
        return null;
      }
      return (
        <DemoComp
          sec={sec}
          startSec={t0}
          endSec={t1}
          beats={beats}
          polarity={polarity}
          theme={theme}
          params={p}
          assetCatalog={spec.assetCatalog}
        />
      );
    }

    default:
      return null;
  }
};

const renderFigureWithBubble = (
  fig: StickmanFigureSpec,
  sec: number,
  t0: number,
  beats: readonly number[],
  polarity: StagePolarity,
  defaultSize = 270,
): React.ReactNode => {
  const triggerAt =
    fig.triggerOffsetSec !== undefined
      ? t0 + fig.triggerOffsetSec
      : beatAt(beats, fig.beatIndex ?? 0, t0 + 0.08);
  const bubbleAt = triggerAt + 0.16;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {fig.bubbleTextJa ? (
        <ScalePop sec={sec} triggerSec={bubbleAt}>
          <StickmanBubble
            text={fig.bubbleTextJa}
            subText={fig.bubbleSubText}
            tailDirection={fig.bubbleTail ?? 'bottom-left'}
            polarity={polarity}
            fontSize={26}
            maxWidth={380}
          />
        </ScalePop>
      ) : null}
      <ScalePop sec={sec} triggerSec={triggerAt}>
        <StickmanFigure
          pose={fig.pose}
          polarity={polarity}
          color={fig.color}
          size={fig.size ?? defaultSize}
          flipX={fig.flipX}
          boilScale={fig.boilScale}
          signPrimary={fig.signPrimary}
          signSecondary={fig.signSecondary}
        />
      </ScalePop>
    </div>
  );
};

const CALLOUT_SLOTS: Record<'top' | 'bottom' | 'top_left' | 'top_right' | 'center', React.CSSProperties> = {
  top: { left: 40, right: 40, top: 8, display: 'flex', justifyContent: 'center' },
  bottom: { left: 40, right: 40, bottom: 16, display: 'flex', justifyContent: 'center' },
  top_left: { left: 36, top: 14 },
  top_right: { right: 36, top: 14 },
  center: { left: 40, right: 40, top: '42%', display: 'flex', justifyContent: 'center' },
};

const STAMP_SLOTS: Record<'top_right' | 'bottom_right' | 'center' | 'bottom_left', React.CSSProperties> = {
  top_right: { right: 64, top: 36 },
  bottom_right: { right: 64, bottom: 32 },
  bottom_left: { left: 64, bottom: 32 },
  center: { left: '50%', top: '46%', transform: 'translate(-50%, -50%)' },
};

interface ResolvedChapterIntermission {
  chapterIndex: number;
  eyecatch: StickmanRuntimeChapterEyecatch;
  startSec: number;
  endSec: number;
  durationSec: number;
  cutSec: number;
  resumeSec: number;
  startFrame: number;
  endFrame: number;
  cutFrame: number;
  resumeFrame: number;
  prevShot?: StickmanRuntimeShot;
  prevShotIdx: number;
  firstShotIdx: number;
  firstShotChunkId?: string;
  prevPolarity: StagePolarity;
  nextPolarity: StagePolarity;
}

const resolveNormalShotIndex = (shots: readonly StickmanRuntimeShot[], sec: number): number => {
  if (shots.length === 0) {
    return -1;
  }
  const exact = shots.findIndex((sh) => sec >= sh.startSec && sec < sh.endSec);
  if (exact >= 0) {
    return exact;
  }
  if (sec < shots[0].startSec) {
    return 0;
  }
  if (sec >= shots[shots.length - 1].endSec) {
    return shots.length - 1;
  }
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    if (shots[i].startSec <= sec) {
      return i;
    }
  }
  return 0;
};

/**
 * stickman_collage ハイブリッドテンプレート（固い基盤 × 自由なTSXシーン演出）：
 * - 基盤（音声・字幕物理保護・公式8背景の事前ベイクPNG＋動的演出・章間アイキャッチ専用スロット・3f遷移・語単位 cue() 解決）を自動保証。
 * - 章間アイキャッチ区間（eyecatch.startSec .. 次章 startSec）は次章の映像要素・字幕・フラッシュを完全遮断し、
 *   全面覆い点（BUGURU_EYECATCH_CUT_SEC）の裏で背景極性のみ次章へ切り替えてから、アイキャッチ完全終了＋後間を経て次章を開始する。
 * - scene.mode === 'tsx' のショットは字幕帯より上（0..STICKMAN_CONTENT_BOTTOM）を clipPath 保護付きで一括所有。
 * - 標準プリセットショット（研究比較・図解・実写カード）も併用可能。
 */
export const StickmanCollageTemplate: React.FC<StickmanCollageTemplateProps> = ({
  spec,
  customScenes,
  customDemos,
  customBackground: CustomBackground,
  showSafeGuide = false,
}) => {
  const fontsReady = useStickmanCollageFonts();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const safeFps = Math.max(1, fps);
  const sec = frame / safeFps;

  const subtitles: CollageSubtitleCue[] = useMemo(
    () =>
      spec.subtitles.map((s) => ({
        startSec: s.startSec,
        endSec: s.endSec,
        line1: s.line1,
        line2: s.line2 ?? undefined,
      })),
    [spec.subtitles],
  );

  const intermissions: ResolvedChapterIntermission[] = useMemo(() => {
    const out: ResolvedChapterIntermission[] = [];
    for (const ch of spec.chapters) {
      const ec = ch.eyecatch;
      if (!ec) {
        continue;
      }
      const startSec = ec.startSec;
      const durationSec = Math.max(
        0.1,
        ec.durationSec ?? (ec.endSec - ec.startSec || BUGURU_EYECATCH_DURATION_SEC),
      );
      const endSec = ec.endSec > startSec ? ec.endSec : startSec + durationSec;
      const startFrame = ec.startFrame ?? Math.round(startSec * safeFps);
      const endFrame = Math.max(startFrame + 1, ec.endFrame ?? Math.round(endSec * safeFps));
      const cutRatio = BUGURU_EYECATCH_CUT_SEC / BUGURU_EYECATCH_DURATION_SEC;
      const cutFrame = Math.min(endFrame, startFrame + Math.round(durationSec * cutRatio * safeFps));
      const cutSec = Math.min(endSec, startSec + durationSec * cutRatio);

      const firstShotIdx = spec.shots.findIndex((s) => s.chapterIndex === ch.chapterIndex);
      const firstShot = firstShotIdx >= 0 ? spec.shots[firstShotIdx] : undefined;
      const resumeSec = firstShot ? Math.max(endSec, firstShot.startSec) : Math.max(endSec, ch.startSec);
      const resumeFrame = Math.max(endFrame, firstShot?.startFrame ?? Math.round(resumeSec * safeFps));

      let prevShot: StickmanRuntimeShot | undefined;
      let prevShotIdx = -1;
      for (let si = 0; si < spec.shots.length; si += 1) {
        const s = spec.shots[si];
        const sEndFrame = s.endFrame ?? Math.round(s.endSec * safeFps);
        if (sEndFrame <= startFrame || s.endSec <= startSec + 0.02) {
          prevShot = s;
          prevShotIdx = si;
        }
      }
      const prevChapter = prevShot
        ? spec.chapters.find((c) => c.chapterIndex === prevShot.chapterIndex)
        : undefined;
      const nextPolarity: StagePolarity = firstShot?.polarity ?? ch.defaultPolarity ?? 'black';
      const prevPolarity: StagePolarity =
        prevShot?.polarity ?? prevChapter?.defaultPolarity ?? nextPolarity;

      out.push({
        chapterIndex: ch.chapterIndex,
        eyecatch: ec,
        startSec,
        endSec,
        durationSec,
        cutSec,
        resumeSec,
        startFrame,
        endFrame,
        cutFrame,
        resumeFrame,
        prevShot,
        prevShotIdx,
        firstShotIdx,
        firstShotChunkId: firstShot?.chunkId,
        prevPolarity,
        nextPolarity,
      });
    }
    return out;
  }, [spec.chapters, spec.shots, safeFps]);

  const activeIntermission = intermissions.find(
    (im) => frame >= im.startFrame && frame < im.resumeFrame,
  );
  const isIntermissionPreCut = Boolean(activeIntermission && frame < activeIntermission.cutFrame);
  const isIntermissionPostCut = Boolean(activeIntermission && frame >= activeIntermission.cutFrame);

  // 秒の丸め差で、再開の先頭フレームに前章のショットが戻らないようにする。
  const resumingIntermission = intermissions.find((im) => frame === im.resumeFrame);
  const normalIdx = resolveNormalShotIndex(spec.shots, resumingIntermission?.resumeSec ?? sec);
  const normalShot = normalIdx >= 0 ? spec.shots[normalIdx] : undefined;
  const effectiveShot = isIntermissionPreCut
    ? activeIntermission?.prevShot
    : isIntermissionPostCut
      ? undefined
      : normalShot;

  const resolveAsset = useCallback(
    (assetId: string): StickmanResolvedAsset | undefined => {
      const found = resolveStickmanAssetSrc(spec.assetCatalog, assetId);
      if (!found) {
        return undefined;
      }
      return {
        src: resolveStickmanMediaSrc(found.src),
        item: found.item,
      };
    },
    [spec.assetCatalog],
  );

  const safeRect: StickmanSafeRect = useMemo(
    () => ({
      x: VIDEO_SPEC.safeMarginX,
      y: VIDEO_SPEC.safeMarginY,
      width: VIDEO_SPEC.width - VIDEO_SPEC.safeMarginX * 2,
      height: STICKMAN_CONTENT_BOTTOM - VIDEO_SPEC.safeMarginY,
      stageWidth: VIDEO_SPEC.width,
      stageHeight: VIDEO_SPEC.height,
      contentBottom: STICKMAN_CONTENT_BOTTOM,
      safeMarginX: VIDEO_SPEC.safeMarginX,
      safeMarginY: VIDEO_SPEC.safeMarginY,
    }),
    [],
  );

  const cueResolver = useMemo(
    () => (effectiveShot ? createShotCueResolver(effectiveShot) : (_phrase: string, fallbackSec = 0) => fallbackSec),
    [effectiveShot],
  );

  const relBeats = useMemo(
    () => (effectiveShot ? resolveRelativeBeats(effectiveShot) : []),
    [effectiveShot],
  );

  const renderEyecatchSequences = () =>
    intermissions.map((im) => {
      // SE WAV は本体 1.0s + 残響 0.25s のため、後間（resumeFrame）まで Sequence を保持し
      // BuguruEyecatch 側で durationSec 終了後に映像のみ消して SE 残響を自然に鳴らし切る。
      const seqFrames = Math.max(1, im.resumeFrame - im.startFrame);
      return (
        <Sequence
          key={`chapter-eyecatch-${im.chapterIndex}`}
          from={im.startFrame}
          durationInFrames={seqFrames}
          name={`buguru-eyecatch-ch${im.chapterIndex}`}
          style={{ zIndex: 100 }}
        >
          <BuguruEyecatch
            variant={im.eyecatch.variant}
            showName={im.eyecatch.showName}
            withSfx={im.eyecatch.withSfx}
            sfxVolume={im.eyecatch.sfxVolume}
            durationSec={im.durationSec}
          />
        </Sequence>
      );
    });

  const renderMediaBackdropNode = (
    block: MediaBackdropBlock | undefined,
    bgPolarity: StagePolarity,
    bgSec: number,
  ): React.ReactNode => {
    if (!block) {
      return null;
    }
    const found = resolveStickmanAssetSrc(spec.assetCatalog, block.config.assetId);
    if (!found) {
      return null;
    }
    return (
      <StickmanMediaBackdropLayer
        key={`mb-${block.startIdx}-${block.config.assetId}`}
        src={resolveStickmanMediaSrc(found.item.src)}
        sec={bgSec}
        fromSec={block.startSec}
        toSec={block.endSec}
        polarity={bgPolarity}
        dim={block.config.dim}
        dimColor={block.config.dimColor}
        vignette={block.config.vignette}
        blurPx={block.config.blurPx}
        filter={block.config.filter}
        zoom={block.config.zoom}
        pan={block.config.pan}
        trimBeforeSec={block.config.trimBeforeSec}
        playbackRate={block.config.playbackRate}
        loop={block.config.loop}
        objectPosition={block.config.objectPosition ?? found.item.objectPosition}
        mirror={block.config.mirror}
        subtitleCalmStrength={block.config.subtitleCalmStrength}
        grainOpacity={block.config.grainOpacity}
        fps={safeFps}
      />
    );
  };

  // 章間アイキャッチのカット点以降（退場〜後間）または前章ショット無しの入り区間：
  // 背景極性（または次章先頭の実写動画背景）のみを表示し、次章の映像要素・字幕・フラッシュを一切描画しない。
  if (activeIntermission && (isIntermissionPostCut || !effectiveShot)) {
    const bgPolarity = isIntermissionPostCut
      ? activeIntermission.nextPolarity
      : activeIntermission.prevPolarity;
    const bgShotIdx = isIntermissionPostCut
      ? activeIntermission.firstShotIdx
      : activeIntermission.prevShotIdx;
    const bgMediaBlock =
      bgShotIdx >= 0 ? resolveMediaBackdropBlock(spec.shots, bgShotIdx, intermissions) : undefined;
    const bgMediaNode = renderMediaBackdropNode(bgMediaBlock, bgPolarity, sec);
    const bgTheme = bgMediaNode
      ? resolveMediaBackdropTheme(bgPolarity)
      : resolvePolarityTheme(bgPolarity);
    const bgEnterSec = isIntermissionPostCut ? activeIntermission.cutSec : activeIntermission.startSec;
    return (
      <AbsoluteFill style={{ backgroundColor: bgTheme.bg, opacity: fontsReady ? 1 : 0.999, overflow: 'hidden' }}>
        {bgMediaNode ? (
          bgMediaNode
        ) : CustomBackground ? (
          <CustomBackground polarity={bgPolarity} enterSec={bgEnterSec} sec={sec} />
        ) : (
          <PolarityBackground polarity={bgPolarity} enterSec={bgEnterSec} sec={sec} />
        )}
        {spec.masterAudioMp3 ? <Audio src={resolveStickmanMediaSrc(spec.masterAudioMp3)} /> : null}
        {renderEyecatchSequences()}
      </AbsoluteFill>
    );
  }

  if (!effectiveShot) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000000' }}>
        {spec.masterAudioMp3 ? <Audio src={resolveStickmanMediaSrc(spec.masterAudioMp3)} /> : null}
        {renderEyecatchSequences()}
      </AbsoluteFill>
    );
  }

  const activeShot = effectiveShot;
  const resolvedIdx = isIntermissionPreCut
    ? Math.max(0, spec.shots.findIndex((s) => s.chunkId === activeShot.chunkId))
    : normalIdx;
  const renderSec =
    isIntermissionPreCut && activeIntermission
      ? Math.max(activeShot.startSec, (activeIntermission.startFrame - 1) / safeFps)
      : sec;

  const prevShot = resolvedIdx > 0 ? spec.shots[resolvedIdx - 1] : undefined;
  const activeChapter = spec.chapters.find((c) => c.chapterIndex === activeShot.chapterIndex);
  const activePolarity: StagePolarity =
    activeShot.polarity ?? activeChapter?.defaultPolarity ?? 'black';
  const prevPolarity: StagePolarity | undefined = prevShot
    ? prevShot.polarity ?? spec.chapters.find((c) => c.chapterIndex === prevShot.chapterIndex)?.defaultPolarity ?? 'black'
    : undefined;
  const activeMediaBlock = resolveMediaBackdropBlock(spec.shots, resolvedIdx, intermissions);
  const activeMediaNode = renderMediaBackdropNode(activeMediaBlock, activePolarity, renderSec);
  const activeTheme = activeMediaNode
    ? resolveMediaBackdropTheme(activePolarity)
    : resolvePolarityTheme(activePolarity);

  const isTsxScene = activeShot.scene?.mode === 'tsx';
  const isEndCtaShot =
    activeShot.layoutArchetype === 'end_cta' || activeShot.narrativeRole === 'end_cta';
  const endCtaEnabled = Boolean(spec.endCta && spec.endCta.enabled !== false);

  const t0 = activeShot.startSec;
  const t1 = activeShot.endSec;
  const localSec = Math.max(0, renderSec - t0);
  const shotDurationSec = Math.max(0.05, t1 - t0);
  const beats = resolveShotBeats(t0, t1, activeShot.beatTimesSec);
  const figures = activeShot.stickFigures ?? [];
  const cornerFigures = figures.filter(
    (f) => f.position === 'bottom_left_corner' || f.position === 'bottom_right_corner',
  );
  const stageFigures = figures.filter(
    (f) => f.position !== 'bottom_left_corner' && f.position !== 'bottom_right_corner',
  );

  const renderTsxSceneLayer = (): React.ReactNode => {
    const sceneKey = activeShot.scene?.component;
    const SceneComp = sceneKey && customScenes ? customScenes[sceneKey] : undefined;
    if (!sceneKey || !SceneComp) {
      throw new Error(
        `Unregistered TSX scene component "${sceneKey ?? ''}" for shot "${activeShot.chunkId}". Register it in customScenes.`,
      );
    }

    return (
      <SfxTimeOriginProvider baseSec={t0}>
        <AbsoluteFill
          style={{
            clipPath: `inset(0px 0px ${VIDEO_SPEC.height - STICKMAN_CONTENT_BOTTOM}px 0px)`,
            zIndex: 10,
          }}
        >
          <SceneComp
            sec={localSec}
            globalSec={renderSec}
            shotDurationSec={shotDurationSec}
            beats={relBeats}
            cue={cueResolver}
            polarity={activePolarity}
            theme={activeTheme}
            safeRect={safeRect}
            resolveAsset={resolveAsset}
            shot={activeShot}
            params={isRecord(activeShot.scene?.params) ? activeShot.scene.params : {}}
          />
        </AbsoluteFill>
      </SfxTimeOriginProvider>
    );
  };

  const renderMainStage = (): React.ReactNode => {
    if (isEndCtaShot && endCtaEnabled && spec.endCta) {
      return (
        <StickmanEndCtaStage
          sec={renderSec}
          t0={t0}
          polarity={activePolarity}
          linkLabelJa={spec.endCta.linkLabelJa}
          headlineJa={spec.endCta.headlineJa}
          communityPromptJa={spec.endCta.communityPromptJa}
          endCardLabels={spec.endCta.endCardLabels}
        />
      );
    }

    const diagramNode = renderDiagramNode(activeShot, renderSec, activePolarity, spec, customDemos);
    const hasPhoto = Boolean(activeShot.photoLayer?.assetId);
    const hasDiagram = Boolean(diagramNode);
    const arch = activeShot.layoutArchetype ?? 'full_canvas_diagram';

    if (arch === 'skit_stage' && !hasDiagram && !hasPhoto) {
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 88,
          }}
        >
          {stageFigures.map((fig, idx) => (
            <React.Fragment key={fig.id || `skit-${idx}`}>
              {renderFigureWithBubble(fig, renderSec, t0, beats, activePolarity, 310)}
            </React.Fragment>
          ))}
        </div>
      );
    }

    if ((arch === 'split_balanced' || arch === 'collage_stage') && hasPhoto && activeShot.photoLayer) {
      const photoOnRight = activeShot.photoLayer.placement === 'right_card';
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: photoOnRight ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            gap: 36,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ flex: 0.95, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {renderPhotoNode(activeShot.photoLayer, spec, renderSec, activeShot, beats, activePolarity, 690, 520)}
          </div>
          <div
            style={{
              flex: 1.05,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 20,
            }}
          >
            {diagramNode}
            {stageFigures.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 36 }}>
                {stageFigures.map((fig, idx) => (
                  <React.Fragment key={fig.id || `split-fig-${idx}`}>
                    {renderFigureWithBubble(fig, renderSec, t0, beats, activePolarity, 260)}
                  </React.Fragment>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    // full_canvas_diagram / newspaper_focus / center_hero_photo / stat_spotlight
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 48,
          padding: '12px 24px',
          boxSizing: 'border-box',
        }}
      >
        {hasDiagram ? (
          <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {diagramNode}
          </div>
        ) : hasPhoto && activeShot.photoLayer ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {renderPhotoNode(activeShot.photoLayer, spec, renderSec, activeShot, beats, activePolarity, 840, 560)}
          </div>
        ) : null}

        {stageFigures.length > 0 && !(arch === 'full_canvas_diagram' && hasDiagram) ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 36 }}>
            {stageFigures.map((fig, idx) => (
              <React.Fragment key={fig.id || `stage-fig-${idx}`}>
                {renderFigureWithBubble(fig, renderSec, t0, beats, activePolarity, 280)}
              </React.Fragment>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const hasResolvedMediaBackdrop = (shot: StickmanRuntimeShot | undefined): boolean => {
    const cfg = normalizeStickmanMediaBackdrop(shot?.mediaBackdrop);
    if (!cfg) {
      return false;
    }
    return Boolean(resolveStickmanAssetSrc(spec.assetCatalog, cfg.assetId));
  };

  const activeHasMediaBackdrop = Boolean(activeMediaNode);
  let blockStartIdx = resolvedIdx;
  while (blockStartIdx > 0) {
    const curS = spec.shots[blockStartIdx - 1];
    const curCh = spec.chapters.find((c) => c.chapterIndex === curS.chapterIndex);
    const curPol: StagePolarity = curS.polarity ?? curCh?.defaultPolarity ?? 'black';
    if (curPol !== activePolarity || hasResolvedMediaBackdrop(curS) !== activeHasMediaBackdrop) {
      break;
    }
    // 章間にアイキャッチを挟む場合はここで極性ブロックの開始を区切る
    const hasIntermissionBefore = intermissions.some(
      (im) => im.firstShotChunkId === spec.shots[blockStartIdx]?.chunkId,
    );
    if (hasIntermissionBefore) {
      break;
    }
    blockStartIdx -= 1;
  }
  const blockStartShot = spec.shots[blockStartIdx];
  const leadingIntermission = intermissions.find(
    (im) => im.firstShotChunkId === blockStartShot?.chunkId,
  );
  const polarityEnterSec = leadingIntermission ? leadingIntermission.cutSec : blockStartShot?.startSec ?? t0;
  const bgActorX = asOptNumber(activeShot.scene?.params?.bgActorX);
  const startedAfterIntermission = intermissions.some(
    (im) => im.firstShotChunkId === activeShot.chunkId,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: activeTheme.bg, opacity: fontsReady ? 1 : 0.999, overflow: 'hidden' }}>
      {activeMediaNode ? (
        activeMediaNode
      ) : CustomBackground ? (
        <CustomBackground polarity={activePolarity} enterSec={t0} sec={renderSec} actorX={bgActorX} />
      ) : (
        <PolarityBackground
          polarity={activePolarity}
          enterSec={polarityEnterSec}
          sec={renderSec}
          actorX={bgActorX}
        />
      )}

      {spec.masterAudioMp3 ? <Audio src={resolveStickmanMediaSrc(spec.masterAudioMp3)} /> : null}

      {isTsxScene ? renderTsxSceneLayer() : null}

      {/* 内側90%セーフゾーン (左右96px / 上下54px) */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          padding: `${VIDEO_SPEC.safeMarginY}px ${VIDEO_SPEC.safeMarginX}px`,
          boxSizing: 'border-box',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            border: showSafeGuide ? '1px dashed rgba(168, 162, 158, 0.45)' : 'none',
            boxSizing: 'border-box',
          }}
        >
          {/* 標準プリセット用図解・コラージュステージ（下部136pxを字幕帯用に完全分離） */}
          {!isTsxScene ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 136,
                overflow: 'hidden',
              }}
            >
              {renderMainStage()}

              {/* 隅リアクター棒人間（最大size<=220で控えめ配置） */}
              {cornerFigures.map((fig, idx) => {
                const isLeft = fig.position === 'bottom_left_corner';
                return (
                  <div
                    key={fig.id || `corner-${idx}`}
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      [isLeft ? 'left' : 'right']: 20,
                      zIndex: 25,
                      pointerEvents: 'none',
                    }}
                  >
                    {renderFigureWithBubble(fig, renderSec, t0, beats, activePolarity, Math.min(220, fig.size ?? 200))}
                  </div>
                );
              })}

              {/* 手描き注釈 */}
              {activeShot.handNote ? (
                <div style={{ position: 'absolute', left: 32, top: 12, zIndex: 28, pointerEvents: 'none' }}>
                  <ScalePop sec={renderSec} triggerSec={beatAt(beats, 0, t0 + 0.14)}>
                    <HandNote text={activeShot.handNote} polarity={activePolarity} size={38} />
                  </ScalePop>
                </div>
              ) : null}

              {/* コールアウト */}
              {activeShot.callout?.textJa ? (
                <div
                  style={{
                    position: 'absolute',
                    zIndex: 30,
                    pointerEvents: 'none',
                    ...CALLOUT_SLOTS[activeShot.callout.position ?? 'top'],
                  }}
                >
                  <ScalePop
                    sec={renderSec}
                    triggerSec={
                      activeShot.callout.triggerOffsetSec !== undefined
                        ? t0 + activeShot.callout.triggerOffsetSec
                        : beatAt(beats, activeShot.callout.beatIndex ?? 1, t0 + 0.25)
                    }
                  >
                    <HandNote
                      text={activeShot.callout.textJa}
                      polarity={activePolarity}
                      color={activeShot.callout.color}
                      size={activeShot.callout.fontSize ?? 48}
                      rotateDeg={activeShot.callout.rotateDeg ?? 0}
                    />
                  </ScalePop>
                </div>
              ) : null}

              {/* スタンプ（左右見切れ防止のため内側余白内に配置） */}
              {activeShot.stamp?.text ? (
                <div
                  style={{
                    position: 'absolute',
                    zIndex: 32,
                    pointerEvents: 'none',
                    ...STAMP_SLOTS[activeShot.stamp.position ?? 'bottom_right'],
                  }}
                >
                  <PolarityStamp
                    text={activeShot.stamp.text}
                    sec={renderSec}
                    at={
                      activeShot.stamp.triggerOffsetSec !== undefined
                        ? t0 + activeShot.stamp.triggerOffsetSec
                        : beatAt(beats, activeShot.stamp.beatIndex ?? 1, t0 + 0.65)
                    }
                    polarity={activePolarity}
                    color={activeShot.stamp.color}
                    rotateDeg={activeShot.stamp.rotateDeg ?? -9}
                    fontSize={activeShot.stamp.fontSize ?? 64}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {!activeIntermission ? (
            <CollageSubtitle
              cues={subtitles}
              sec={sec}
              polarity={activePolarity}
              lightBg={activeTheme.subtitleIsLight}
              fontSize={38}
              bottomOffset={10}
              maxWidth="90%"
            />
          ) : null}
        </div>
      </div>

      {!activeIntermission && !startedAfterIntermission ? (
        <PolarityTransitionFlash
          prevPolarity={prevPolarity}
          currentPolarity={activePolarity}
          segmentStartFrame={activeShot.startFrame ?? Math.round(t0 * safeFps)}
          transitionFrames={3}
        />
      ) : null}

      {renderEyecatchSequences()}
    </AbsoluteFill>
  );
};
