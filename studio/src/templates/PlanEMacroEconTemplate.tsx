import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { SubtitleCalm } from '../components/_materials';
import {
  AKAPEN,
  AkapenEyecatch,
  akapenEyecatchSfxPath,
  BreakingNewsBroadcast,
  DarkMediaBackdrop,
  LivingSurface,
  PLAN_E_CANVAS_HEIGHT,
  PLAN_E_STAGE_BOTTOM,
  activeSurfaceAt,
  activeSurfaceSegmentAt,
  cameraTransformAt,
  createStageContext,
  normalizeMediaBackdrop,
  CausalGearLoopStage,
  DiegeticBeatsLayer,
  DiegeticStage,
  EditorialCutoutStage,
  MacroEconCanvas,
  PLAN_E_MACRO_PALETTE,
  PlanECustomScene,
  PlanECustomSceneContext,
  PlanEProjectSpec,
  PlanEResolvedCamera,
  PlanESceneSpec,
  PlanESurface,
  ProjectorTargetMapStage,
  RgbGlitchBurst,
  SURFACE_POLARITY,
  VhsPauseAvatarStage,
  VideoBrollStage,
  WhiteboardTrendChart,
  usePlanEFonts,
} from '../components/plan_e';
import { SFX_DEFAULT_VOLUME } from '../components/sfx';
import { collectBeatSfxEvents } from '../components/plan_e/sfx';

/** 字幕直下の静音帯（カメラ変換の外で activeSurface に連動させ、紙破り・板移動に追従させない） */
const SURFACE_SUBTITLE_CALM: Record<PlanESurface, { color: string; strength: number }> = {
  paper: { color: '#F5F1E8', strength: 0.45 },
  whiteboard: { color: '#F8F9FA', strength: 0.42 },
  corkboard: { color: '#2A180B', strength: 0.5 },
  charcoal: { color: '#111315', strength: 0.52 },
  dark_desk: { color: '#0E0A07', strength: 0.56 },
  dark_broll: { color: '#060709', strength: 0.58 },
  projector: { color: '#050608', strength: 0.55 },
};

function resolveAudioSrc(src: string, isExternal?: boolean): string {
  if (isExternal || /^(https?:|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

function resolveMedia(map: Record<string, string>, src?: string, key?: string): string | undefined {
  const raw = src ?? (key ? map[key] : undefined);
  if (!raw) return undefined;
  if (/^(https?:\/\/|data:|blob:|\/)/.test(raw)) return raw;
  return staticFile(raw);
}

const STAGE_GUARD_CLIP = `inset(0px 0px ${PLAN_E_CANVAS_HEIGHT - PLAN_E_STAGE_BOTTOM}px 0px)`;

const CameraLayer: React.FC<{ camera?: PlanEResolvedCamera; sec: number; children: React.ReactNode }> = ({
  camera,
  sec,
  children,
}) =>
  camera ? (
    <AbsoluteFill style={{ transform: cameraTransformAt(sec, camera), transformOrigin: camera.origin }}>
      {children}
    </AbsoluteFill>
  ) : (
    <>{children}</>
  );

/**
 * 自由舞台（custom）の層構成:
 *   地（現在区間の mediaBackdrop があれば DarkMediaBackdrop、なければ backdrop 未指定時に LivingSurface）
 *   → backdrop（任意のカスタム全面層・非 clip）
 *   → render（字幕帯の上で物理 clip）
 * カメラは暗幕実写・backdrop・render に同一変換を掛け、clip 枠と字幕には掛けない。
 */
const FreeStageLayers: React.FC<{
  scene: PlanECustomScene;
  ctx: PlanECustomSceneContext;
  overlay?: React.ReactNode;
}> = ({ scene, ctx, overlay }) => {
  const guarded = (scene.guard ?? 'subtitle') === 'subtitle';
  const seg = activeSurfaceSegmentAt(scene, ctx.sec);
  const mediaCfg = seg.mediaBackdrop ? normalizeMediaBackdrop(seg.mediaBackdrop) : null;
  const showLiving = scene.living !== false && !mediaCfg && !scene.backdrop;
  const hasBackdropLayer = Boolean(mediaCfg || scene.backdrop);
  const mediaProps = mediaCfg ? (() => {
    const { key, ...rest } = mediaCfg;
    return { key, rest };
  })() : null;
  return (
    <>
      {showLiving ? <LivingSurface surface={ctx.surface} /> : null}
      {hasBackdropLayer ? (
        <CameraLayer camera={scene.camera} sec={ctx.sec}>
          {mediaProps ? (
            <DarkMediaBackdrop
              key={`mb-${seg.index}-${mediaProps.key}`}
              {...mediaProps.rest}
              src={ctx.media(mediaProps.key)}
              sec={ctx.sec}
              fromSec={seg.startSec}
              toSec={seg.endSec}
              fps={ctx.fps}
            />
          ) : null}
          {scene.backdrop ? <AbsoluteFill>{scene.backdrop(ctx)}</AbsoluteFill> : null}
        </CameraLayer>
      ) : null}
      <AbsoluteFill style={guarded ? { clipPath: STAGE_GUARD_CLIP } : undefined}>
        <CameraLayer camera={scene.camera} sec={ctx.sec}>
          {scene.render(ctx)}
          {overlay}
        </CameraLayer>
      </AbsoluteFill>
    </>
  );
};

/**
 * 案E v3.1（planE_macro_econ）タイムライン駆動テンプレート。
 * - 章間は専用区間に公式映像と SE を置き、BGM 入りマスター音声を継続再生する。
 * - custom シーン＝自由舞台。文脈は createStageContext（監査 probe と共通実装）で生成する。
 * - scenes[0] への無言フォールバックを持たない。
 */
export const PlanEMacroEconTemplate: React.FC<{ spec: PlanEProjectSpec }> = ({ spec }) => {
  const fontsReady = usePlanEFonts();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const slot = spec.eyecatches?.find(ec => sec >= ec.startSec && sec < ec.resumeSec);
  return (
    <AbsoluteFill style={{ opacity: fontsReady ? 1 : 0.999 }}>
      {spec.audioSrc ? (
        <Audio
          src={resolveAudioSrc(spec.audioSrc, spec.audioIsExternalUrl)}
          trimBefore={Math.round((spec.audioTrimBeforeSec ?? 0) * fps)}
        />
      ) : null}
      {spec.eyecatches?.map(ec => {
        const from = Math.ceil(ec.startSec * fps);
        return (
          <Sequence key={ec.startSec} from={from} durationInFrames={Math.ceil(ec.resumeSec * fps) - from} layout="none">
            <Audio src={staticFile(akapenEyecatchSfxPath(ec.variant))} />
          </Sequence>
        );
      })}
      {slot ? (
        <AbsoluteFill style={{ backgroundColor: AKAPEN.deskDeep }}>
          <AkapenEyecatch variant={slot.variant} t={sec - slot.startSec} />
        </AbsoluteFill>
      ) : <PlanEScenes spec={spec} />}
    </AbsoluteFill>
  );
};

const PlanEScenes: React.FC<{ spec: PlanEProjectSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const imageMap = spec.imageMap ?? {};
  const videoMap = spec.videoMap ?? {};
  const beatSfxEvents = React.useMemo(() => collectBeatSfxEvents(spec), [spec]);

  const sfxAudioNodes = beatSfxEvents.map((ev, idx) => {
    const fromFrame = Math.max(0, Math.round(ev.timeSec * fps));
    const durFrames = Math.max(15, Math.round(1.6 * fps));
    return (
      <Sequence
        key={`sfx-${idx}-${ev.kind}-${fromFrame}`}
        from={fromFrame}
        durationInFrames={durFrames}
        layout="none"
      >
        <Audio src={resolveAudioSrc(ev.src)} volume={ev.gain ?? SFX_DEFAULT_VOLUME} />
      </Sequence>
    );
  });

  const activeScene: PlanESceneSpec | undefined =
    spec.scenes.find((s) => sec >= s.startSec && sec < s.endSec) ??
    (spec.scenes.length > 0 && sec >= spec.scenes[spec.scenes.length - 1].startSec
      ? spec.scenes[spec.scenes.length - 1]
      : undefined);

  if (!activeScene) {
    return (
      <div style={{ width: '100%', height: '100%' }}>
        {sfxAudioNodes}
        <MacroEconCanvas
          surface="charcoal"
          subtitles={spec.subtitles}
          sec={sec}
          showTickerBar={spec.showTickerBar ?? false}
          showLegacyCitation={false}
        />
      </div>
    );
  }

  const ctx: PlanECustomSceneContext = createStageContext(spec, activeScene, frame, fps);
  const activeSurface = activeSurfaceAt(activeScene, sec);

  const isFullBleedScene =
    activeScene.type === 'custom' ? activeScene.fullBleed !== false : true;
  const subtitleLightOverride = SURFACE_POLARITY[activeSurface] === 'bright';
  const subtitleCalm = SURFACE_SUBTITLE_CALM[activeSurface];

  const renderSceneContent = (): React.ReactNode => {
    switch (activeScene.type) {
      case 'video_broll': {
        const resolvedCuts = activeScene.cuts?.map((c) => ({
          ...c,
          resolvedVideoSrc: c.videoSrc ?? (c.videoKey ? videoMap[c.videoKey] : undefined),
          resolvedImageSrc: c.imageSrc ?? (c.imageKey ? imageMap[c.imageKey] : undefined),
        }));
        return (
          <VideoBrollStage
            startSec={activeScene.startSec}
            endSec={activeScene.endSec}
            videoSrc={resolveMedia(videoMap, activeScene.videoSrc, activeScene.videoKey)}
            imageSrc={resolveMedia(imageMap, activeScene.imageSrc, activeScene.imageKey)}
            cuts={resolvedCuts}
            motion={activeScene.motion}
            grade={activeScene.grade}
            vignetteStrength={activeScene.vignetteStrength}
            glitchIntroSec={activeScene.glitchIntroSec}
            locationTag={activeScene.locationTag}
            playbackRate={activeScene.playbackRate}
            trimBeforeSec={activeScene.trimBeforeSec}
            blurPx={activeScene.blurPx}
            brightness={activeScene.brightness}
            saturate={activeScene.saturate}
            mirror={activeScene.mirror}
            objectPosition={activeScene.objectPosition}
            zoom={activeScene.zoom}
            overlayCutout={activeScene.overlayCutout}
          />
        );
      }

      case 'vhs_pause_avatar':
        return (
          <VhsPauseAvatarStage
            startSec={activeScene.startSec}
            frozenImageSrc={resolveMedia(
              imageMap,
              activeScene.frozenImageSrc,
              activeScene.frozenImageKey,
            )}
            timecodeLabel={activeScene.timecodeLabel}
            avatarEmblem={activeScene.avatarEmblem}
          />
        );

      case 'news_broadcast':
        return (
          <div style={{ width: '100%', height: '100%', backgroundColor: PLAN_E_MACRO_PALETTE.bg }}>
            <BreakingNewsBroadcast
              startSec={activeScene.startSec}
              endSec={activeScene.endSec}
              anchorVideoSrc={resolveMedia(
                videoMap,
                activeScene.anchorVideoSrc,
                activeScene.anchorVideoKey,
              )}
              networkTag={activeScene.networkTag}
              breakingLabel={activeScene.breakingLabel}
              headline={activeScene.headline}
              tickerCode={activeScene.tickerCode}
              indexValueStart={activeScene.indexValueStart}
              indexValueEnd={activeScene.indexValueEnd}
              changeValueText={activeScene.changeValueText}
              changePercentText={activeScene.changePercentText}
              tickerItems={activeScene.tickerItems}
            />
          </div>
        );

      case 'editorial_cutout':
        return (
          <EditorialCutoutStage
            startSec={activeScene.startSec}
            endSec={activeScene.endSec}
            backdrop={activeScene.backdrop}
            cards={activeScene.cards}
            backgroundVideoSrc={resolveMedia(
              videoMap,
              activeScene.backgroundVideoSrc,
              activeScene.backgroundVideoKey,
            )}
            backgroundImageSrc={resolveMedia(
              imageMap,
              activeScene.backgroundImageSrc,
              activeScene.backgroundImageKey,
            )}
            mastheadTitle={activeScene.mastheadTitle}
            mastheadSubtitle={activeScene.mastheadSubtitle}
            showRedString={activeScene.showRedString}
            pins={activeScene.pins}
            glitchIntroSec={activeScene.glitchIntroSec}
            impactShake={activeScene.impactShake}
          />
        );

      case 'whiteboard_trend':
        return (
          <WhiteboardTrendChart
            startSec={activeScene.startSec}
            endSec={activeScene.endSec}
            title={activeScene.title}
            subtitle={activeScene.subtitle}
            xLabels={activeScene.xLabels}
            yTicks={activeScene.yTicks}
            yMin={activeScene.yMin}
            yMax={activeScene.yMax}
            baselineTick={activeScene.baselineTick}
            series={activeScene.series}
            highlightOffsetSec={activeScene.highlightOffsetSec}
            circleLastHighlight={activeScene.circleLastHighlight}
            gapBadgeText={activeScene.gapBadgeText}
            stampText={activeScene.stampText}
            avatarEmblem={activeScene.avatarEmblem}
          />
        );

      case 'causal_gear_loop':
        return (
          <CausalGearLoopStage
            startSec={activeScene.startSec}
            endSec={activeScene.endSec}
            surfaceTheme={
              activeScene.surfaceTheme ??
              (activeScene.surface === 'charcoal' ||
              activeScene.surface === 'whiteboard' ||
              activeScene.surface === 'paper'
                ? activeScene.surface
                : 'paper')
            }
            title={activeScene.title}
            centerLockLabel={activeScene.centerLockLabel}
            leftActor={activeScene.leftActor}
            rightActor={activeScene.rightActor}
            topFlowLabel={activeScene.topFlowLabel}
            bottomFlowLabel={activeScene.bottomFlowLabel}
            rightPhaseOffsetSec={activeScene.rightPhaseOffsetSec}
            lockOffsetSec={activeScene.lockOffsetSec}
          />
        );

      case 'projector_target_map':
        return (
          <ProjectorTargetMapStage
            startSec={activeScene.startSec}
            endSec={activeScene.endSec}
            targetLabel={activeScene.targetLabel}
            targetCountryId={activeScene.targetCountryId}
            targetPoint={activeScene.targetPoint}
            nextChapterLabel={activeScene.nextChapterLabel}
            zoomRange={activeScene.zoomRange}
            avatarEmblem={activeScene.avatarEmblem}
          />
        );

      case 'diegetic_stage':
        return (
          <DiegeticStage
            startSec={activeScene.startSec}
            endSec={activeScene.endSec}
            surface={activeScene.surface}
            beats={activeScene.beats}
            imageMap={imageMap}
            videoMap={videoMap}
            mastheadTitle={activeScene.mastheadTitle}
            mastheadSubtitle={activeScene.mastheadSubtitle}
            badgeText={activeScene.badgeText}
            title={activeScene.title}
            showRedString={activeScene.showRedString}
            pins={activeScene.pins}
            backgroundImageKey={activeScene.backgroundImageKey}
            backgroundImageSrc={activeScene.backgroundImageSrc}
            backgroundVideoKey={activeScene.backgroundVideoKey}
            backgroundVideoSrc={activeScene.backgroundVideoSrc}
            backgroundBlurPx={activeScene.backgroundBlurPx}
            backgroundBrightness={activeScene.backgroundBrightness}
          />
        );

      case 'custom':
        return (
          <FreeStageLayers
            scene={activeScene}
            ctx={ctx}
            overlay={
              activeScene.overlayBeats && activeScene.beats && activeScene.beats.length > 0 ? (
                <DiegeticBeatsLayer beats={activeScene.beats} imageMap={imageMap} />
              ) : null
            }
          />
        );
    }
  };

  const shouldOverlayBeats =
    activeScene.type !== 'diegetic_stage' &&
    activeScene.type !== 'custom' &&
    Boolean(activeScene.beats && activeScene.beats.length > 0);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {sfxAudioNodes}
      <MacroEconCanvas
        surface={activeSurface}
        backgroundColor={activeScene.backgroundColor}
        subtitles={spec.subtitles}
        sec={sec}
        hideSubtitle={activeScene.hideSubtitle}
        subtitleLightBgOverride={subtitleLightOverride}
        showLegacyCitation={false}
        chapterCode={activeScene.chapterCode}
        tickerLabel={activeScene.tickerLabel}
        showTickerBar={spec.showTickerBar ?? false}
        fullBleed={isFullBleedScene}
        grainIdPrefix={`${spec.id}-grain`}
      >
        {activeScene.type === 'custom' ? (
          renderSceneContent()
        ) : (
          <CameraLayer camera={activeScene.camera} sec={sec}>
            {renderSceneContent()}
            {shouldOverlayBeats ? (
              <DiegeticBeatsLayer beats={activeScene.beats!} imageMap={imageMap} />
            ) : null}
          </CameraLayer>
        )}
        {activeScene.glitchIntroSec &&
        activeScene.glitchIntroSec > 0 &&
        activeScene.type !== 'video_broll' &&
        activeScene.type !== 'editorial_cutout' ? (
          <RgbGlitchBurst startSec={activeScene.startSec} durationSec={activeScene.glitchIntroSec} />
        ) : null}
        {!activeScene.hideSubtitle ? (
          <SubtitleCalm
            color={subtitleCalm.color}
            strength={subtitleCalm.strength}
            from={PLAN_E_STAGE_BOTTOM - 44}
          />
        ) : null}
      </MacroEconCanvas>
    </div>
  );
};
