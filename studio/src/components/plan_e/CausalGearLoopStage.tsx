import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { SUBTITLE_SAFE_BOTTOM } from './constants';
import { EconHostAvatar } from './EconHostAvatar';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from './fonts';

export interface CausalGearActorSpec {
  emblem: string;
  actorLabel: string;
  headline: string;
  meterLabel?: string;
  meterPct?: number;
  statusBadge: string;
  tone?: 'cyan' | 'amber' | 'crimson' | 'emerald';
}

export interface CausalGearLoopStageProps {
  startSec: number;
  endSec: number;
  surfaceTheme?: 'paper' | 'whiteboard' | 'charcoal';
  title: string;
  centerLockLabel?: string;
  leftActor: CausalGearActorSpec;
  rightActor: CausalGearActorSpec;
  topFlowLabel: string;
  bottomFlowLabel: string;
  rightPhaseOffsetSec?: number;
  lockOffsetSec?: number;
}

function buildGearPath(cx: number, cy: number, rOuter: number, rInner: number, teeth: number): string {
  const pts: string[] = [];
  const step = (Math.PI * 2) / (teeth * 2);
  for (let i = 0; i < teeth * 2; i++) {
    const a1 = i * step;
    const a2 = a1 + step * 0.45;
    const r = i % 2 === 0 ? rOuter : rInner;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const x2 = cx + Math.cos(a2) * r;
    const y2 = cy + Math.sin(a2) * r;
    pts.push(`${i === 0 ? 'M' : 'L'} ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }
  return `${pts.join(' ')} Z`;
}

function quadPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  t: number,
): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  ];
}

function resolveToneAccent(
  tone: CausalGearActorSpec['tone'] | undefined,
  isLight: boolean,
  fallback: 'left' | 'right',
): string {
  const eff = tone ?? (fallback === 'left' ? 'cyan' : 'amber');
  switch (eff) {
    case 'emerald':
      return isLight ? '#1E8E3E' : '#22C55E';
    case 'crimson':
      return '#CC0000';
    case 'amber':
      return isLight ? '#B45309' : '#F59E0B';
    default:
      return isLight ? '#0072B2' : '#38BDF8';
  }
}

/**
 * 案E v2.1 標準コンポーネント（ABテスト v2 因果ギア＋脱ダークブルーAI Slop昇格版）:
 * 左右NPCアバター＋上下ベジェパイプ＋粒子＋中央2連噛み合い歯車が lockOffsetSec で 0.0 RPM 停止。
 * 既定 surfaceTheme='paper' によりダークブルー方眼を回避し、各アクターカードも最大4要素に整理する。
 */
export const CausalGearLoopStage: React.FC<CausalGearLoopStageProps> = ({
  startSec,
  endSec,
  surfaceTheme = 'paper',
  title,
  centerLockLabel = '0.0 RPM // 均衡固定',
  leftActor,
  rightActor,
  topFlowLabel,
  bottomFlowLabel,
  rightPhaseOffsetSec = 2.4,
  lockOffsetSec = 5.2,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  const isLight = surfaceTheme !== 'charcoal';
  const totalDur = Math.max(1.8, endSec - startSec);
  const resolvedRightSec = startSec + Math.min(totalDur * 0.6, rightPhaseOffsetSec);
  const resolvedLockSec = startSec + Math.min(totalDur - 0.45, Math.max(rightPhaseOffsetSec + 0.6, lockOffsetSec));

  const isRightActive = sec >= resolvedRightSec;
  const isLocked = sec >= resolvedLockSec;

  const palette =
    surfaceTheme === 'whiteboard'
      ? {
          bg: '#F4F6F9',
          panelBg: '#FFFFFF',
          panelHeadBg: '#E2E8F0',
          panelBorder: '#1E293B',
          textMain: '#0F172A',
          textMuted: '#475569',
          trackBg: 'rgba(15, 23, 42, 0.08)',
          chipBg: '#FFFFFF',
          gearFill: '#E2E8F0',
          gearCore: '#F8FAFC',
          badgeBg: '#0F172A',
          badgeText: '#F8FAFC',
          dotStroke: 'rgba(15, 23, 42, 0.08)',
        }
      : surfaceTheme === 'charcoal'
        ? {
            bg: '#16191F',
            panelBg: '#1F242D',
            panelHeadBg: '#2A303B',
            panelBorder: '#475569',
            textMain: '#F8FAFC',
            textMuted: '#94A3B8',
            trackBg: 'rgba(148, 163, 184, 0.14)',
            chipBg: '#111318',
            gearFill: '#262B35',
            gearCore: '#16191F',
            badgeBg: '#F8FAFC',
            badgeText: '#111318',
            dotStroke: 'rgba(148, 163, 184, 0.08)',
          }
        : {
            bg: '#FAF8F3',
            panelBg: '#FFFFFF',
            panelHeadBg: '#EFEAE0',
            panelBorder: '#16130F',
            textMain: '#16130F',
            textMuted: '#57534E',
            trackBg: 'rgba(22, 19, 15, 0.09)',
            chipBg: '#FFFFFF',
            gearFill: '#ECE6DA',
            gearCore: '#FAF8F3',
            badgeBg: '#16130F',
            badgeText: '#FAF8F3',
            dotStroke: 'rgba(22, 19, 15, 0.075)',
          };

  const leftColor = resolveToneAccent(leftActor.tone, isLight, 'left');
  const rightColor = resolveToneAccent(rightActor.tone, isLight, 'right');
  const lockColor = isLight ? '#CC0000' : '#EF4444';

  const leftMeterProg = interpolate(
    sec,
    [startSec + 0.15, Math.min(resolvedRightSec, startSec + 1.7)],
    [0.14, (leftActor.meterPct ?? 88) / 100],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const topPipeProg = interpolate(sec, [startSec + 0.75, resolvedRightSec + 0.1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rightSpr = spring({
    frame: Math.max(0, frame - Math.round(resolvedRightSec * fps)),
    fps,
    config: { stiffness: 400, damping: 22, mass: 0.65 },
  });
  const rightMeterProg = interpolate(
    sec,
    [resolvedRightSec + 0.2, Math.max(resolvedRightSec + 0.65, resolvedLockSec - 0.3)],
    [0.14, (rightActor.meterPct ?? 90) / 100],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const bottomPipeProg = interpolate(sec, [resolvedRightSec + 0.55, resolvedLockSec], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 歯車回転角（ロック時刻に 0.0 RPM でピタリと止まる）
  const activeTime = Math.max(0, Math.min(sec, resolvedLockSec) - startSec);
  const gear1Deg = activeTime * 56;
  const gear2Deg = -activeTime * 56 + 15;
  const lockStampSpr = spring({
    frame: Math.max(0, frame - Math.round(resolvedLockSec * fps)),
    fps,
    config: { stiffness: 520, damping: 18, mass: 0.55 },
  });

  const topP0: [number, number] = [558, 224];
  const topP1: [number, number] = [864, 72];
  const topP2: [number, number] = [1170, 224];

  const botP0: [number, number] = [1170, 516];
  const botP1: [number, number] = [864, 668];
  const botP2: [number, number] = [558, 516];

  const gearPathA = React.useMemo(() => buildGearPath(814, 338, 86, 68, 12), []);
  const gearPathB = React.useMemo(() => buildGearPath(926, 416, 68, 52, 10), []);

  const phaseText = isLocked
    ? 'LOCKED // 均衡固定'
    : isRightActive
      ? 'FEEDBACK // 連鎖反応'
      : 'TRIGGER // 合理選択';
  const phaseBorderColor = isLocked ? lockColor : isRightActive ? rightColor : leftColor;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.bg,
        backgroundImage: `radial-gradient(${palette.dotStroke} 1.2px, transparent 0)`,
        backgroundSize: '20px 20px',
        overflow: 'hidden',
      }}
    >
      {/* 上部エディトリアル見出し帯（top: 52px セーフゾーン準拠） */}
      <div
        style={{
          position: 'absolute',
          top: 52,
          left: 96,
          right: 96,
          height: 54,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `3px solid ${palette.panelBorder}`,
          paddingBottom: 10,
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              backgroundColor: palette.badgeBg,
              color: palette.badgeText,
              fontFamily: FONT_ECON_MONO,
              fontSize: 15,
              fontWeight: 900,
              padding: '4px 12px',
              letterSpacing: '0.12em',
            }}
          >
            CAUSAL LOOP
          </span>
          <span
            style={{
              fontFamily: FONT_ECON_SERIF,
              fontSize: 30,
              fontWeight: 900,
              color: palette.textMain,
            }}
          >
            {title}
          </span>
        </div>

        <div
          style={{
            border: `2.5px solid ${phaseBorderColor}`,
            backgroundColor: isLocked ? (isLight ? '#FEE2E2' : 'rgba(220,38,38,0.18)') : palette.panelBg,
            color: phaseBorderColor,
            fontFamily: FONT_ECON_MONO,
            fontSize: 17,
            fontWeight: 900,
            padding: '4px 16px',
            letterSpacing: '0.08em',
          }}
        >
          {phaseText}
        </div>
      </div>

      {/* メイン構造キャンバス（bottom: 176px -> CleanSubtitle 非衝突） */}
      <div
        style={{
          position: 'absolute',
          top: 118,
          left: 96,
          right: 96,
          bottom: SUBTITLE_SAFE_BOTTOM,
          zIndex: 12,
        }}
      >
        {/* 左NPCアバター */}
        <div style={{ position: 'absolute', left: -42, bottom: 4, zIndex: 15 }}>
          <EconHostAvatar isNpc emblem={leftActor.emblem} pose="tented_hands" scale={0.7} />
        </div>

        {/* 右NPCアバター */}
        {isRightActive ? (
          <div
            style={{
              position: 'absolute',
              right: -42,
              bottom: 4,
              zIndex: 15,
              transform: `translateX(${interpolate(rightSpr, [0, 1], [110, 0]).toFixed(1)}px)`,
              opacity: rightSpr,
            }}
          >
            <EconHostAvatar isNpc emblem={rightActor.emblem} pose="open_hands" scale={0.7} />
          </div>
        ) : null}

        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1728 740"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {/* 1. 上側ベジェパイプ */}
          <path
            d={`M ${topP0[0]} ${topP0[1]} Q ${topP1[0]} ${topP1[1]} ${topP2[0]} ${topP2[1]}`}
            fill="none"
            stroke={palette.trackBg}
            strokeWidth={14}
            strokeLinecap="round"
          />
          {topPipeProg > 0.01 ? (
            <g>
              <path
                d={`M ${topP0[0]} ${topP0[1]} Q ${topP1[0]} ${topP1[1]} ${topP2[0]} ${topP2[1]}`}
                fill="none"
                stroke={isLocked ? lockColor : leftColor}
                strokeWidth={7}
                strokeDasharray="1000"
                strokeDashoffset={1000 * (1 - topPipeProg)}
                strokeLinecap="round"
              />
              {[0.18, 0.48, 0.78].map((offset, idx) => {
                const t = isLocked ? offset : ((sec - startSec) * 0.42 + offset) % 1;
                if (t > topPipeProg) return null;
                const [px, py] = quadPoint(topP0, topP1, topP2, t);
                return (
                  <circle
                    key={`tp-${idx}`}
                    cx={px}
                    cy={py}
                    r={7}
                    fill="#FFFFFF"
                    stroke={isLocked ? lockColor : leftColor}
                    strokeWidth={3}
                  />
                );
              })}
              <g
                opacity={interpolate(topPipeProg, [0.3, 0.72], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })}
              >
                <rect
                  x={608}
                  y={96}
                  width={512}
                  height={44}
                  rx={4}
                  fill={palette.chipBg}
                  stroke={isLocked ? lockColor : leftColor}
                  strokeWidth={2.5}
                />
                <text
                  x={864}
                  y={125}
                  textAnchor="middle"
                  fill={isLocked ? lockColor : palette.textMain}
                  fontFamily={FONT_ECON_SANS}
                  fontSize={21}
                  fontWeight={900}
                >
                  {topFlowLabel}
                </text>
              </g>
            </g>
          ) : null}

          {/* 2. 下側ベジェパイプ */}
          <path
            d={`M ${botP0[0]} ${botP0[1]} Q ${botP1[0]} ${botP1[1]} ${botP2[0]} ${botP2[1]}`}
            fill="none"
            stroke={palette.trackBg}
            strokeWidth={14}
            strokeLinecap="round"
          />
          {bottomPipeProg > 0.01 ? (
            <g>
              <path
                d={`M ${botP0[0]} ${botP0[1]} Q ${botP1[0]} ${botP1[1]} ${botP2[0]} ${botP2[1]}`}
                fill="none"
                stroke={isLocked ? lockColor : rightColor}
                strokeWidth={7}
                strokeDasharray="1000"
                strokeDashoffset={1000 * (1 - bottomPipeProg)}
                strokeLinecap="round"
              />
              {[0.2, 0.5, 0.8].map((offset, idx) => {
                const t = isLocked ? offset : ((sec - resolvedRightSec) * 0.45 + offset) % 1;
                if (t > bottomPipeProg) return null;
                const [px, py] = quadPoint(botP0, botP1, botP2, t);
                return (
                  <circle
                    key={`bp-${idx}`}
                    cx={px}
                    cy={py}
                    r={7}
                    fill="#FFFFFF"
                    stroke={isLocked ? lockColor : rightColor}
                    strokeWidth={3}
                  />
                );
              })}
              <g
                opacity={interpolate(bottomPipeProg, [0.3, 0.72], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })}
              >
                <rect
                  x={608}
                  y={602}
                  width={512}
                  height={44}
                  rx={4}
                  fill={palette.chipBg}
                  stroke={isLocked ? lockColor : rightColor}
                  strokeWidth={2.5}
                />
                <text
                  x={864}
                  y={631}
                  textAnchor="middle"
                  fill={isLocked ? lockColor : palette.textMain}
                  fontFamily={FONT_ECON_SANS}
                  fontSize={21}
                  fontWeight={900}
                >
                  {bottomFlowLabel}
                </text>
              </g>
            </g>
          ) : null}

          {/* 3. 左アクターパネル（最大4要素のスリム構成） */}
          <g>
            <rect
              x={236}
              y={192}
              width={322}
              height={346}
              rx={4}
              fill={palette.panelBg}
              stroke={isLocked ? lockColor : leftColor}
              strokeWidth={3.5}
            />
            <rect x={236} y={192} width={322} height={46} rx={2} fill={palette.panelHeadBg} />
            <text
              x={256}
              y={222}
              fill={palette.textMain}
              fontFamily={FONT_ECON_MONO}
              fontSize={18}
              fontWeight={900}
            >
              {leftActor.actorLabel}
            </text>

            <text
              x={397}
              y={292}
              textAnchor="middle"
              fill={palette.textMain}
              fontFamily={FONT_ECON_SERIF}
              fontSize={28}
              fontWeight={900}
            >
              {leftActor.headline}
            </text>

            {leftActor.meterLabel && (
              <g>
                <text
                  x={260}
                  y={346}
                  fill={palette.textMuted}
                  fontFamily={FONT_ECON_SANS}
                  fontSize={17}
                  fontWeight={800}
                >
                  {leftActor.meterLabel}
                </text>
                <rect x={260} y={362} width={274} height={22} rx={3} fill={palette.trackBg} />
                <rect
                  x={260}
                  y={362}
                  width={274 * leftMeterProg}
                  height={22}
                  rx={3}
                  fill={isLocked ? lockColor : leftColor}
                />
              </g>
            )}

            <rect
              x={260}
              y={422}
              width={274}
              height={82}
              rx={4}
              fill={isLocked ? (isLight ? '#FEF2F2' : 'rgba(220,38,38,0.16)') : palette.panelHeadBg}
              stroke={isLocked ? lockColor : leftColor}
              strokeWidth={2.5}
            />
            <text
              x={397}
              y={472}
              textAnchor="middle"
              fill={isLocked ? lockColor : leftColor}
              fontFamily={FONT_ECON_SANS}
              fontSize={24}
              fontWeight={900}
            >
              {leftActor.statusBadge}
            </text>
          </g>

          {/* 4. 中央コア：噛み合い2連歯車＆ロックスタンプ */}
          <g>
            <circle
              cx={864}
              cy={370}
              r={158}
              fill="none"
              stroke={isLocked ? lockColor : palette.panelBorder}
              strokeWidth={isLocked ? 4 : 2.2}
              strokeDasharray={isLocked ? undefined : '10 6'}
              opacity={isLocked ? 0.9 : 0.35}
            />
            <g transform={`translate(814, 338) rotate(${gear1Deg.toFixed(1)}) translate(-814, -338)`}>
              <path
                d={gearPathA}
                fill={isLocked ? (isLight ? '#FEE2E2' : '#450A0A') : palette.gearFill}
                stroke={isLocked ? lockColor : leftColor}
                strokeWidth={3}
              />
              <circle cx={814} cy={338} r={24} fill={palette.gearCore} stroke={isLocked ? lockColor : leftColor} strokeWidth={3} />
            </g>
            <g transform={`translate(926, 416) rotate(${gear2Deg.toFixed(1)}) translate(-926, -416)`}>
              <path
                d={gearPathB}
                fill={isLocked ? (isLight ? '#FEE2E2' : '#450A0A') : palette.gearFill}
                stroke={isLocked ? lockColor : rightColor}
                strokeWidth={3}
              />
              <circle cx={926} cy={416} r={18} fill={palette.gearCore} stroke={isLocked ? lockColor : rightColor} strokeWidth={3} />
            </g>

            <g
              transform={`translate(864, 370) scale(${isLocked ? interpolate(lockStampSpr, [0, 1], [1.24, 1]) : 1}) translate(-864, -370)`}
            >
              <rect
                x={728}
                y={336}
                width={272}
                height={68}
                rx={4}
                fill={isLocked ? '#991B1B' : palette.badgeBg}
                stroke={isLocked ? '#FECACA' : palette.panelBorder}
                strokeWidth={2.5}
              />
              <text
                x={864}
                y={378}
                textAnchor="middle"
                fill={isLocked ? '#FFFFFF' : palette.badgeText}
                fontFamily={FONT_ECON_MONO}
                fontSize={22}
                fontWeight={900}
              >
                {isLocked ? centerLockLabel : 'GEAR SYNC ACTIVE'}
              </text>
            </g>
          </g>

          {/* 5. 右アクターパネル（最大4要素のスリム構成） */}
          <g opacity={isRightActive ? 1 : 0.22}>
            <rect
              x={1170}
              y={192}
              width={322}
              height={346}
              rx={4}
              fill={palette.panelBg}
              stroke={isLocked ? lockColor : isRightActive ? rightColor : palette.panelBorder}
              strokeWidth={3.5}
            />
            <rect x={1170} y={192} width={322} height={46} rx={2} fill={palette.panelHeadBg} />
            <text
              x={1190}
              y={222}
              fill={palette.textMain}
              fontFamily={FONT_ECON_MONO}
              fontSize={18}
              fontWeight={900}
            >
              {rightActor.actorLabel}
            </text>

            <text
              x={1331}
              y={292}
              textAnchor="middle"
              fill={palette.textMain}
              fontFamily={FONT_ECON_SERIF}
              fontSize={28}
              fontWeight={900}
            >
              {rightActor.headline}
            </text>

            {rightActor.meterLabel && (
              <g>
                <text
                  x={1194}
                  y={346}
                  fill={palette.textMuted}
                  fontFamily={FONT_ECON_SANS}
                  fontSize={17}
                  fontWeight={800}
                >
                  {rightActor.meterLabel}
                </text>
                <rect x={1194} y={362} width={274} height={22} rx={3} fill={palette.trackBg} />
                <rect
                  x={1194}
                  y={362}
                  width={274 * (isRightActive ? rightMeterProg : 0.14)}
                  height={22}
                  rx={3}
                  fill={isLocked ? lockColor : rightColor}
                />
              </g>
            )}

            <rect
              x={1194}
              y={422}
              width={274}
              height={82}
              rx={4}
              fill={isLocked ? (isLight ? '#FEF2F2' : 'rgba(220,38,38,0.16)') : palette.panelHeadBg}
              stroke={isLocked ? lockColor : rightColor}
              strokeWidth={2.5}
            />
            <text
              x={1331}
              y={472}
              textAnchor="middle"
              fill={isLocked ? lockColor : rightColor}
              fontFamily={FONT_ECON_SANS}
              fontSize={24}
              fontWeight={900}
            >
              {rightActor.statusBadge}
            </text>
          </g>
        </svg>
      </div>
    </AbsoluteFill>
  );
};
