import React from 'react';
import { Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { PLAN_E_MACRO_PALETTE } from '../../../theme/tokens';
import { BreakingNewsBroadcast } from '../BreakingNewsBroadcast';
import { CausalGearLoopStage } from '../CausalGearLoopStage';
import { EditorialCutoutStage } from '../EditorialCutoutCard';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF, usePlanEFonts } from '../fonts';
import { MacroEconCanvas } from '../MacroEconCanvas';
import { ProjectorTargetMapStage } from '../ProjectorTargetMapStage';
import { RgbGlitchBurst } from '../RgbGlitchBurst';
import { VhsPauseAvatarStage } from '../VhsPauseAvatarStage';
import { VideoBrollStage } from '../VideoBrollStage';
import { WhiteboardTrendChart } from '../WhiteboardTrendChart';
import { EconChartWidget } from './EconChartWidget';
import { IncentiveLoopDiagram } from './IncentiveLoopDiagram';
import { ParadoxHookHeader } from './ParadoxHookHeader';
import { PolicyLeverBoard } from './PolicyLeverBoard';
import { ProjectorNetworkStage } from './ProjectorNetworkStage';
import { SatireCollageStage } from './SatireCollageStage';
import { SatireGagStage } from './SatireGagStage';
import { WhiteboardStage } from './WhiteboardStage';
import { WorldConnectionMap } from './WorldConnectionMap';
import {
  PlanEBackdropMode,
  PlanECustomSceneContext,
  PlanEProjectSpec,
  PlanESceneSpec,
  PlanESfxEvent,
  isPlanELightBackdrop,
} from './typesV2';

function resolveAudioSrc(src: string, isExternal?: boolean): string {
  if (isExternal || /^(https?:|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

function resolveMedia(imageMap: Record<string, string>, src?: string, key?: string): string | undefined {
  const raw = src ?? (key ? imageMap[key] : undefined);
  if (!raw) return undefined;
  if (/^(https?:\/\/|data:|blob:|\/)/.test(raw)) return raw;
  return staticFile(raw);
}

function toneToColor(tone?: 'emerald' | 'cyan' | 'gold' | 'crimson' | 'muted', isLight = false): string {
  switch (tone) {
    case 'emerald':
      return isLight ? PLAN_E_MACRO_PALETTE.emerald : PLAN_E_MACRO_PALETTE.emeraldBright;
    case 'cyan':
      return isLight ? PLAN_E_MACRO_PALETTE.dataBlue : PLAN_E_MACRO_PALETTE.dataCyan;
    case 'gold':
      return PLAN_E_MACRO_PALETTE.policyGold;
    case 'crimson':
      return PLAN_E_MACRO_PALETTE.crisisRed;
    default:
      return isLight ? '#475569' : '#94A3B8';
  }
}

function collectTemplateSfxEvents(spec: PlanEProjectSpec): PlanESfxEvent[] {
  const sfxMap = spec.sfxMap ?? {};
  if (Object.keys(sfxMap).length === 0) return [];

  const fps = spec.fps ?? 30;
  const masterEvents = spec.sfxEvents ?? [];
  const candidates: PlanESfxEvent[] = [];

  if (spec.playManifestSfxDirectly) {
    for (const ev of masterEvents) {
      candidates.push(ev);
    }
  }

  const autoEnabled = spec.autoSceneSfx !== false;

  for (const sc of spec.scenes) {
    if (sc.sfxCues) {
      for (const cue of sc.sfxCues) {
        candidates.push({
          kind: cue.kind,
          timeSec: Math.max(0, sc.startSec + cue.offsetSec),
          gain: cue.gain,
        });
      }
    }

    if (!autoEnabled) continue;

    if (sc.glitchIntroSec && sc.glitchIntroSec > 0) {
      candidates.push({ kind: 'glitch_burst', timeSec: Math.max(0, sc.startSec), gain: 0.24 });
    }

    switch (sc.type) {
      case 'editorial_cutout': {
        sc.cards.forEach((card, idx) => {
          const baseSec = card.startSec ?? sc.startSec;
          const enterSec =
            baseSec +
            (card.enterOffsetSec ??
              (card.enterAtFrame !== undefined ? card.enterAtFrame / fps : idx * 0.55));
          candidates.push({ kind: 'paper_snap', timeSec: Math.max(0, enterSec), gain: 0.24 });
          if (sc.backdrop === 'corkboard') {
            candidates.push({ kind: 'camera_shutter', timeSec: Math.max(0, enterSec + 0.04), gain: 0.18 });
          }
          if (card.stampText) {
            const stampSec =
              card.stampOffsetSec !== undefined
                ? baseSec + card.stampOffsetSec
                : card.stampAtFrame !== undefined
                  ? baseSec + card.stampAtFrame / fps
                  : enterSec + 0.6;
            candidates.push({ kind: 'stamp_thud', timeSec: Math.max(0, stampSec), gain: 0.26 });
          }
        });
        break;
      }

      case 'whiteboard_trend': {
        candidates.push({ kind: 'whoosh', timeSec: Math.max(0, sc.startSec + 0.05), gain: 0.20 });
        candidates.push({ kind: 'chart_tick', timeSec: Math.max(0, sc.startSec + 0.35), gain: 0.18 });
        if (sc.stampText) {
          const hlOff = sc.highlightOffsetSec ?? 2.5;
          candidates.push({ kind: 'stamp_thud', timeSec: Math.max(0, sc.startSec + hlOff + 0.6), gain: 0.26 });
        }
        break;
      }

      case 'causal_gear_loop': {
        const totalDur = Math.max(1.8, sc.endSec - sc.startSec);
        const rightOff = Math.min(totalDur * 0.6, sc.rightPhaseOffsetSec ?? 2.4);
        const lockOff = Math.min(totalDur - 0.45, Math.max(rightOff + 0.6, sc.lockOffsetSec ?? 5.2));
        candidates.push({ kind: 'mech_slide', timeSec: Math.max(0, sc.startSec + 0.1), gain: 0.22 });
        candidates.push({ kind: 'soft_pop', timeSec: Math.max(0, sc.startSec + rightOff), gain: 0.22 });
        candidates.push({ kind: 'impact_thud', timeSec: Math.max(0, sc.startSec + lockOff), gain: 0.28 });
        break;
      }

      case 'projector_target_map': {
        candidates.push({ kind: 'projector_click', timeSec: Math.max(0, sc.startSec + 0.05), gain: 0.24 });
        candidates.push({ kind: 'radar_beep', timeSec: Math.max(0, sc.startSec + 0.55), gain: 0.20 });
        break;
      }

      case 'video_broll': {
        if (sc.overlayCutout) {
          const oc = sc.overlayCutout;
          const base = oc.startSec ?? sc.startSec;
          const enterSec =
            base +
            (oc.enterOffsetSec ?? (oc.enterAtFrame !== undefined ? oc.enterAtFrame / fps : 0));
          candidates.push({ kind: 'paper_snap', timeSec: Math.max(0, enterSec), gain: 0.24 });
          if (oc.stampText) {
            const stampSec =
              oc.stampOffsetSec !== undefined
                ? base + oc.stampOffsetSec
                : oc.stampAtFrame !== undefined
                  ? base + oc.stampAtFrame / fps
                  : enterSec + 0.6;
            candidates.push({ kind: 'stamp_thud', timeSec: Math.max(0, stampSec), gain: 0.26 });
          }
        }
        break;
      }

      default:
        break;
    }
  }

  // master_audio.wav に焼き込み済みの sfxEvents との二重再生を防止し、登録外SFXを除外
  const filtered = candidates.filter((ev) => {
    if (!sfxMap[ev.kind]) return false;
    if (!spec.playManifestSfxDirectly) {
      const collidesWithMaster = masterEvents.some(
        (m) => m.kind === ev.kind && Math.abs(m.timeSec - ev.timeSec) <= 0.15,
      );
      if (collidesWithMaster) return false;
    }
    return true;
  });

  filtered.sort((a, b) => a.timeSec - b.timeSec);

  const deduped: PlanESfxEvent[] = [];
  for (const ev of filtered) {
    const dup = deduped.some(
      (prev) => prev.kind === ev.kind && Math.abs(prev.timeSec - ev.timeSec) <= 0.08,
    );
    if (!dup) {
      deduped.push(ev);
    }
  }
  return deduped;
}

/**
 * 案E（planE_macro_econ / How Money Works 型）データ駆動ランナーテンプレート。
 * 固定ショット順量産を禁止し、PlanEProjectSpec.scenes 配列の順序・種類・長さを
 * テーマ固有に組み替えて描画し、サブビートSFX（sfxMap）も二重再生を抑止しながら自動再生する。
 */
export const PlanEMacroEconTemplateV2: React.FC<{ spec: PlanEProjectSpec }> = ({ spec }) => {
  const fontsReady = usePlanEFonts();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const imageMap = spec.imageMap ?? {};
  const videoMap = spec.videoMap ?? {};
  const sfxMap = spec.sfxMap ?? {};
  const templateSfxEvents = React.useMemo(() => collectTemplateSfxEvents(spec), [spec]);

  const sfxAudioNodes = templateSfxEvents.map((ev, idx) => {
    const sfxSrc = sfxMap[ev.kind];
    if (!sfxSrc) return null;
    const fromFrame = Math.max(0, Math.round(ev.timeSec * fps));
    const durFrames = Math.max(15, Math.round(1.6 * fps));
    return (
      <Sequence key={`sfx-${idx}-${ev.kind}-${fromFrame}`} from={fromFrame} durationInFrames={durFrames} layout="none">
        <Audio src={resolveAudioSrc(sfxSrc)} volume={ev.gain ?? 0.32} />
      </Sequence>
    );
  });

  const activeScene: PlanESceneSpec | undefined =
    spec.scenes.find((s) => sec >= s.startSec && sec < s.endSec) ??
    (spec.scenes.length > 0
      ? sec >= spec.scenes[spec.scenes.length - 1].startSec
        ? spec.scenes[spec.scenes.length - 1]
        : spec.scenes[0]
      : undefined);

  if (!activeScene) {
    return (
      <div style={{ width: '100%', height: '100%', opacity: fontsReady ? 1 : 0.999 }}>
        {spec.audioSrc ? (
          <Audio src={resolveAudioSrc(spec.audioSrc, spec.audioIsExternalUrl)} />
        ) : null}
        {sfxAudioNodes}
        <MacroEconCanvas
          backdropMode={spec.defaultBackdropMode ?? 'slate_grid'}
          subtitles={spec.subtitles}
          sec={sec}
          citationText={spec.showLegacyCitation ? spec.defaultCitationText : undefined}
          showLegacyCitation={spec.showLegacyCitation ?? false}
        />
      </div>
    );
  }

  const backdropMode: PlanEBackdropMode =
    activeScene.backdropMode ?? spec.defaultBackdropMode ?? 'slate_grid';
  const isLight = isPlanELightBackdrop(backdropMode);
  const titleColor = isLight ? PLAN_E_MACRO_PALETTE.inkDark : PLAN_E_MACRO_PALETTE.textLight;
  const mutedColor = isLight ? '#475569' : PLAN_E_MACRO_PALETTE.textMuted;
  const panelBg = isLight ? '#FFFFFF' : '#161B22';
  const panelBorder = isLight ? '#CBD5E1' : '#334155';

  const ctx: PlanECustomSceneContext = {
    sec,
    frame,
    fps,
    scene: activeScene,
    imageMap,
    videoMap,
  };

  const isFullBleedScene =
    activeScene.type === 'video_broll' ||
    activeScene.type === 'vhs_pause_avatar' ||
    activeScene.type === 'news_broadcast' ||
    activeScene.type === 'whiteboard_stage' ||
    activeScene.type === 'satire_gag' ||
    activeScene.type === 'projector_network' ||
    activeScene.type === 'world_connection_map' ||
    activeScene.type === 'editorial_cutout' ||
    activeScene.type === 'whiteboard_trend' ||
    activeScene.type === 'causal_gear_loop' ||
    activeScene.type === 'projector_target_map';

  const subtitleLightOverride = (() => {
    if (
      activeScene.type === 'whiteboard_stage' ||
      activeScene.type === 'world_connection_map' ||
      activeScene.type === 'whiteboard_trend'
    ) {
      return true;
    }
    if (activeScene.type === 'editorial_cutout') {
      return activeScene.backdrop === 'paper';
    }
    if (activeScene.type === 'causal_gear_loop') {
      return (activeScene.surfaceTheme ?? 'paper') !== 'charcoal';
    }
    if (activeScene.type === 'projector_target_map') {
      return false;
    }
    return undefined;
  })();

  const renderSceneContent = (): React.ReactNode => {
    switch (activeScene.type) {
      case 'paradox_hook':
        return (
          <ParadoxHookHeader
            startSec={activeScene.startSec}
            endSec={activeScene.endSec}
            eyebrow={activeScene.eyebrow}
            headline={activeScene.headline}
            highlightToken={activeScene.highlightToken}
            subHeadline={activeScene.subHeadline}
            paradoxTag={activeScene.paradoxTag}
            vhsPauseEffect={activeScene.vhsPauseEffect}
            timecodeLabel={activeScene.timecodeLabel}
            backgroundImageSrc={resolveMedia(
              imageMap,
              activeScene.backgroundImageSrc,
              activeScene.backgroundImageKey,
            )}
            backgroundOpacity={activeScene.backgroundOpacity}
            backdropMode={backdropMode}
          />
        );

      case 'econ_chart': {
        const hasSide = Boolean(activeScene.sideInsightPoints && activeScene.sideInsightPoints.length > 0);
        return (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              paddingTop: 6,
              paddingBottom: 78,
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontFamily: FONT_ECON_SERIF, fontSize: 38, fontWeight: 900, color: titleColor }}>
                  {activeScene.sectionTitle}
                </div>
                {activeScene.sectionSubtitle ? (
                  <div style={{ fontSize: 19, color: mutedColor, marginTop: 4 }}>
                    {activeScene.sectionSubtitle}
                  </div>
                ) : null}
              </div>
              {activeScene.stampText ? (
                <div
                  style={{
                    border: `3px solid ${PLAN_E_MACRO_PALETTE.crisisRed}`,
                    color: PLAN_E_MACRO_PALETTE.crisisRed,
                    padding: '4px 14px',
                    fontFamily: FONT_ECON_SANS,
                    fontSize: 20,
                    fontWeight: 900,
                    transform: 'rotate(-3deg)',
                  }}
                >
                  {activeScene.stampText}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: hasSide ? '1.55fr 1fr' : '1fr',
                gap: 24,
                alignItems: 'stretch',
                flex: 1,
              }}
            >
              <EconChartWidget
                data={{ ...activeScene.chart, lightTheme: activeScene.chart.lightTheme ?? isLight }}
                startSec={activeScene.startSec}
                endSec={activeScene.endSec}
                height={520}
              />

              {hasSide ? (
                <div
                  style={{
                    backgroundColor: panelBg,
                    border: `1px solid ${panelBorder}`,
                    borderTop: `5px solid ${PLAN_E_MACRO_PALETTE.policyGold}`,
                    padding: '22px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  {activeScene.sideInsightTitle ? (
                    <div
                      style={{
                        fontFamily: FONT_ECON_SERIF,
                        fontSize: 26,
                        fontWeight: 900,
                        color: titleColor,
                        borderBottom: `1px solid ${panelBorder}`,
                        paddingBottom: 10,
                      }}
                    >
                      {activeScene.sideInsightTitle}
                    </div>
                  ) : null}
                  {activeScene.sideInsightPoints!.map((pt, idx) => {
                    const revealAt = activeScene.startSec + 0.25 + idx * 0.25;
                    const op = interpolate(sec, [revealAt, revealAt + 0.22], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    });
                    return (
                      <div
                        key={`pt-${idx}`}
                        style={{
                          opacity: op,
                          display: 'flex',
                          gap: 10,
                          alignItems: 'flex-start',
                          fontSize: 21,
                          fontWeight: 700,
                          lineHeight: 1.45,
                          color: titleColor,
                        }}
                      >
                        <span style={{ color: PLAN_E_MACRO_PALETTE.policyGold, fontFamily: FONT_ECON_MONO }}>
                          ▸
                        </span>
                        <span>{pt}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        );
      }

      case 'incentive_loop':
        return (
          <div style={{ flex: 1, paddingBottom: 72, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <IncentiveLoopDiagram
              startSec={activeScene.startSec}
              title={activeScene.title}
              subtitle={activeScene.subtitle}
              nodes={activeScene.nodes}
              edges={activeScene.edges}
              centerTag={activeScene.centerTag}
              backdropMode={backdropMode}
            />
          </div>
        );

      case 'satire_collage':
        return (
          <SatireCollageStage
            startSec={activeScene.startSec}
            headline={activeScene.headline}
            subHeadline={activeScene.subHeadline}
            cards={activeScene.cards}
            backgroundImageSrc={resolveMedia(
              imageMap,
              activeScene.backgroundImageSrc,
              activeScene.backgroundImageKey,
            )}
            backgroundOpacity={activeScene.backgroundOpacity}
            satireNote={activeScene.satireNote}
            backdropMode={backdropMode}
            imageMap={imageMap}
          />
        );

      case 'policy_lever':
        return (
          <PolicyLeverBoard
            startSec={activeScene.startSec}
            title={activeScene.title}
            subtitle={activeScene.subtitle}
            mode={activeScene.mode}
            levers={activeScene.levers}
            verdictStamp={activeScene.verdictStamp}
            backdropMode={backdropMode}
          />
        );

      case 'split_comparison': {
        const leftColor = toneToColor(activeScene.leftTone ?? 'emerald', isLight);
        const rightColor = toneToColor(activeScene.rightTone ?? 'crimson', isLight);
        return (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              paddingTop: 10,
              paddingBottom: 78,
              gap: 18,
            }}
          >
            <div style={{ fontFamily: FONT_ECON_SERIF, fontSize: 38, fontWeight: 900, color: titleColor }}>
              {activeScene.title}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                gap: 22,
                alignItems: 'stretch',
                flex: 1,
              }}
            >
              <div
                style={{
                  backgroundColor: panelBg,
                  border: `1px solid ${panelBorder}`,
                  borderTop: `8px solid ${leftColor}`,
                  padding: '24px 28px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div style={{ fontSize: 30, fontWeight: 900, color: leftColor }}>{activeScene.leftTitle}</div>
                {activeScene.leftSubtitle ? (
                  <div style={{ fontSize: 18, color: mutedColor }}>{activeScene.leftSubtitle}</div>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
                  {activeScene.leftItems.map((it, idx) => (
                    <div
                      key={`l-${idx}`}
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        lineHeight: 1.45,
                        color: titleColor,
                        borderLeft: `4px solid ${leftColor}`,
                        paddingLeft: 14,
                      }}
                    >
                      {it}
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 28,
                  fontWeight: 900,
                  color: PLAN_E_MACRO_PALETTE.policyGold,
                }}
              >
                {activeScene.centerVsLabel ?? '⇄'}
              </div>

              <div
                style={{
                  backgroundColor: panelBg,
                  border: `1px solid ${panelBorder}`,
                  borderTop: `8px solid ${rightColor}`,
                  padding: '24px 28px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div style={{ fontSize: 30, fontWeight: 900, color: rightColor }}>{activeScene.rightTitle}</div>
                {activeScene.rightSubtitle ? (
                  <div style={{ fontSize: 18, color: mutedColor }}>{activeScene.rightSubtitle}</div>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
                  {activeScene.rightItems.map((it, idx) => (
                    <div
                      key={`r-${idx}`}
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        lineHeight: 1.45,
                        color: titleColor,
                        borderLeft: `4px solid ${rightColor}`,
                        paddingLeft: 14,
                      }}
                    >
                      {it}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 'editorial_quote': {
        const lf = Math.max(0, frame - Math.round(activeScene.startSec * fps));
        const spr = spring({ frame: lf, fps, config: { stiffness: 400, damping: 26, mass: 0.7 } });
        const imgUrl = resolveMedia(imageMap, activeScene.imageSrc, activeScene.imageKey);
        const tok = activeScene.highlightToken?.trim();
        const quoteNode =
          tok && activeScene.quote.includes(tok) ? (
            <>
              <span>{activeScene.quote.slice(0, activeScene.quote.indexOf(tok))}</span>
              <span
                style={{
                  color: isLight ? PLAN_E_MACRO_PALETTE.crisisRed : PLAN_E_MACRO_PALETTE.policyGold,
                  borderBottom: `4px solid ${PLAN_E_MACRO_PALETTE.emeraldBright}`,
                }}
              >
                {tok}
              </span>
              <span>{activeScene.quote.slice(activeScene.quote.indexOf(tok) + tok.length)}</span>
            </>
          ) : (
            activeScene.quote
          );

        return (
          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: imgUrl ? '1.35fr 0.85fr' : '1fr',
              gap: 32,
              alignItems: 'center',
              paddingBottom: 78,
            }}
          >
            <div
              style={{
                borderLeft: `10px solid ${PLAN_E_MACRO_PALETTE.emeraldBright}`,
                paddingLeft: 34,
                transform: `translateY(${interpolate(spr, [0, 1], [14, 0])}px)`,
                opacity: spr,
              }}
            >
              <div
                style={{
                  fontFamily: FONT_ECON_SERIF,
                  fontSize: 44,
                  fontWeight: 900,
                  lineHeight: 1.35,
                  color: titleColor,
                }}
              >
                “{quoteNode}”
              </div>
              <div
                style={{
                  marginTop: 22,
                  fontFamily: FONT_ECON_SANS,
                  fontSize: 22,
                  fontWeight: 800,
                  color: isLight ? PLAN_E_MACRO_PALETTE.emerald : PLAN_E_MACRO_PALETTE.emeraldBright,
                }}
              >
                — {activeScene.attribution}
              </div>
              {activeScene.contextNote ? (
                <div style={{ marginTop: 10, fontSize: 19, color: mutedColor }}>
                  {activeScene.contextNote}
                </div>
              ) : null}
            </div>

            {imgUrl ? (
              <div
                style={{
                  height: 430,
                  overflow: 'hidden',
                  border: `1px solid ${panelBorder}`,
                  boxShadow: '0 20px 44px rgba(0,0,0,0.45)',
                }}
              >
                <Img src={imgUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ) : null}
          </div>
        );
      }

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
        );

      case 'whiteboard_stage':
        return (
          <WhiteboardStage
            startSec={activeScene.startSec}
            endSec={activeScene.endSec}
            mode={activeScene.mode}
            boardTitle={activeScene.boardTitle}
            boardSubtitle={activeScene.boardSubtitle}
            sourceNote={activeScene.sourceNote}
            stackedColumns={activeScene.stackedColumns}
            badges={activeScene.badges}
            avatarEmblem={activeScene.avatarEmblem}
          />
        );

      case 'satire_gag':
        return (
          <SatireGagStage
            startSec={activeScene.startSec}
            endSec={activeScene.endSec}
            mode={activeScene.mode}
            backgroundVideoSrc={resolveMedia(
              videoMap,
              activeScene.backgroundVideoSrc,
              activeScene.backgroundVideoKey,
            )}
            targetImageSrc={resolveMedia(
              imageMap,
              activeScene.targetImageSrc,
              activeScene.targetImageKey,
            )}
            transformedImageSrc={resolveMedia(
              imageMap,
              activeScene.transformedImageSrc,
              activeScene.transformedImageKey,
            )}
            propImageSrc={resolveMedia(
              imageMap,
              activeScene.propImageSrc,
              activeScene.propImageKey,
            )}
            avatarEmblem={activeScene.avatarEmblem}
          />
        );

      case 'projector_network':
        return (
          <ProjectorNetworkStage
            startSec={activeScene.startSec}
            centerLabel={activeScene.centerLabel}
            clusters={activeScene.clusters}
          />
        );

      case 'world_connection_map':
        return (
          <WorldConnectionMap
            startSec={activeScene.startSec}
            endSec={activeScene.endSec}
            originIso={activeScene.originIso}
            targetIsos={activeScene.targetIsos}
          />
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
            surfaceTheme={activeScene.surfaceTheme}
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

      case 'custom':
        return activeScene.render(ctx);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', opacity: fontsReady ? 1 : 0.999 }}>
      {spec.audioSrc ? (
        <Audio src={resolveAudioSrc(spec.audioSrc, spec.audioIsExternalUrl)} />
      ) : null}
      {sfxAudioNodes}
      <MacroEconCanvas
        backdropMode={backdropMode}
        backgroundColor={activeScene.backgroundColor}
        subtitles={spec.subtitles}
        sec={sec}
        hideSubtitle={activeScene.hideSubtitle}
        subtitleLightBgOverride={subtitleLightOverride}
        citationText={
          spec.showLegacyCitation
            ? (activeScene.citationText ?? spec.defaultCitationText)
            : undefined
        }
        showLegacyCitation={spec.showLegacyCitation ?? false}
        chapterCode={activeScene.chapterCode}
        tickerLabel={activeScene.tickerLabel}
        showTickerBar={spec.showTickerBar ?? true}
        fullBleed={isFullBleedScene}
        grainIdPrefix={`${spec.id}-grain`}
      >
        {renderSceneContent()}
        {activeScene.glitchIntroSec &&
        activeScene.glitchIntroSec > 0 &&
        activeScene.type !== 'video_broll' &&
        activeScene.type !== 'editorial_cutout' ? (
          <RgbGlitchBurst startSec={activeScene.startSec} durationSec={activeScene.glitchIntroSec} />
        ) : null}
      </MacroEconCanvas>
    </div>
  );
};
