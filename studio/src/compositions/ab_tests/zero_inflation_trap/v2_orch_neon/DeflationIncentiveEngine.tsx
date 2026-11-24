import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  EconHostAvatar,
  FONT_ECON_MONO,
  FONT_ECON_SANS,
  FONT_ECON_SERIF,
} from '../../../../components/plan_e';

export interface DeflationIncentiveEngineProps {
  startSec: number;
  consumerPhaseSec: number;
  endSec: number;
}

/**
 * 歯車SVGパス生成ヘルパー（噛み合いギア可視化用）
 */
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

/** 二次ベジェ曲線上の点 (t in 0..1) を取得 */
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

/**
 * 目玉②: 企業 ⇔ 消費者のデフレ・インセンティブループ＆価格硬直性ロック機構。
 * - 49.44s〜53.96s: 左（企業）の値上げリスク計器が作動し、「価格凍結 ¥0 / FROZEN」に固定→上側因果パイプが右へ伸びる
 * - 53.96s〜57.20s: 右（消費者）がバネ登場し、財布防衛ゲージが「安い店のみ選択」に固定→下側因果パイプが左へ閉ループ接続
 * - 57.20s〜59.48s: 中央2連歯車が 0.0 RPM で急停止ロックされ、全体が赤の賃金凍結均衡へ切り替わる
 * - 全要素は top:54px 〜 bottom:168px のセーフ領域に収め、CleanSubtitle と非衝突
 */
export const DeflationIncentiveEngine: React.FC<DeflationIncentiveEngineProps> = ({
  startSec,
  consumerPhaseSec,
  endSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  const lockSec = Math.min(endSec - 0.6, consumerPhaseSec + 3.24); // 57.20s
  const corpFrozenSec = startSec + 2.76; // 52.20s
  const isConsumerPhase = sec >= consumerPhaseSec;
  const isLocked = sec >= lockSec;

  // 企業側の値上げリスクゲージ上昇 (49.44 -> 51.80)
  const riskGauge = interpolate(sec, [startSec + 0.3, startSec + 2.3], [0.18, 0.96], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const corpFreezeSpr = spring({
    frame: Math.max(0, frame - Math.round(corpFrozenSec * fps)),
    fps,
    config: { stiffness: 480, damping: 20, mass: 0.6 },
  });
  const corpFrozen = sec >= corpFrozenSec;

  // 消費者セクターの登場
  const consumerSpr = spring({
    frame: Math.max(0, frame - Math.round(consumerPhaseSec * fps)),
    fps,
    config: { stiffness: 400, damping: 22, mass: 0.65 },
  });
  const walletTighten = interpolate(
    sec,
    [consumerPhaseSec + 0.3, consumerPhaseSec + 2.1],
    [0.2, 0.94],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // 上下ベジェパイプの開通プログレス
  const topPipeProg = interpolate(sec, [startSec + 1.35, consumerPhaseSec + 0.15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const bottomPipeProg = interpolate(sec, [consumerPhaseSec + 0.85, lockSec], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 中央歯車の回転角：ロック時刻で回転がクランプ停止する
  const activeTime = Math.max(0, Math.min(sec, lockSec) - startSec);
  const gear1Deg = activeTime * 58;
  const gear2Deg = -activeTime * 58 + 15;

  const lockStampSpr = spring({
    frame: Math.max(0, frame - Math.round(lockSec * fps)),
    fps,
    config: { stiffness: 520, damping: 18, mass: 0.55 },
  });

  const phaseText = isLocked
    ? 'LOCKED // 賃金凍結均衡 (0.0 RPM)'
    : isConsumerPhase
      ? 'PHASE 2 // 家計：消費収縮＆安値選好'
      : 'PHASE 1 // 企業：値上げ恐怖＆価格硬直性';
  const phaseColor = isLocked ? '#EF4444' : isConsumerPhase ? '#F59E0B' : '#38BDF8';

  const topP0: [number, number] = [558, 210];
  const topP1: [number, number] = [864, 68];
  const topP2: [number, number] = [1170, 210];

  const botP0: [number, number] = [1170, 530];
  const botP1: [number, number] = [864, 672];
  const botP2: [number, number] = [558, 530];

  const gearPathA = React.useMemo(() => buildGearPath(814, 338, 86, 68, 12), []);
  const gearPathB = React.useMemo(() => buildGearPath(926, 416, 68, 52, 10), []);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0B1524', overflow: 'hidden' }}>
      {/* ブループリント精密方眼背景 */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <defs>
          <pattern id="bp-engine-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(77, 163, 255, 0.12)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1920" height="1080" fill="url(#bp-engine-grid)" />
      </svg>

      {/* 上部ヘッダー行（top: 54px セーフゾーン準拠） */}
      <div
        style={{
          position: 'absolute',
          top: 54,
          left: 96,
          right: 96,
          height: 54,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2px solid rgba(56, 189, 248, 0.28)',
          paddingBottom: 10,
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              backgroundColor: '#0284C7',
              color: '#FFFFFF',
              fontFamily: FONT_ECON_MONO,
              fontSize: 15,
              fontWeight: 900,
              padding: '4px 12px',
              letterSpacing: '0.12em',
            }}
          >
            STRUCTURAL TRAP
          </span>
          <span
            style={{
              fontFamily: FONT_ECON_SERIF,
              fontSize: 28,
              fontWeight: 900,
              color: '#F8FAFC',
            }}
          >
            企業 ⇔ 消費者のデフレ・インセンティブループ
          </span>
        </div>

        <div
          style={{
            border: `2px solid ${phaseColor}`,
            backgroundColor: isLocked ? 'rgba(220, 38, 38, 0.18)' : 'rgba(15, 23, 42, 0.85)',
            color: phaseColor,
            fontFamily: FONT_ECON_MONO,
            fontSize: 17,
            fontWeight: 900,
            padding: '5px 16px',
            letterSpacing: '0.08em',
          }}
        >
          {phaseText}
        </div>
      </div>

      {/* メイン構造キャンバス（top: 124px, bottom: 170px → CleanSubtitle と非衝突） */}
      <div
        style={{
          position: 'absolute',
          top: 124,
          left: 96,
          right: 96,
          bottom: 170,
          zIndex: 12,
        }}
      >
        {/* 左端：企業 NPC アバター */}
        <div
          style={{
            position: 'absolute',
            left: -48,
            bottom: 4,
            zIndex: 15,
          }}
        >
          <EconHostAvatar isNpc emblem="企業" pose="tented_hands" scale={0.70} />
        </div>

        {/* 右端：消費者 NPC アバター（53.96s〜バネ登場、flipXなしで文字反転防止） */}
        {isConsumerPhase ? (
          <div
            style={{
              position: 'absolute',
              right: -48,
              bottom: 4,
              zIndex: 15,
              transform: `translateX(${interpolate(consumerSpr, [0, 1], [120, 0]).toFixed(1)}px)`,
              opacity: consumerSpr,
            }}
          >
            <EconHostAvatar isNpc emblem="家計" pose="open_hands" scale={0.70} />
          </div>
        ) : null}

        {/* 高密度 SVG 機械・因果パイプキャンバス */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1728 740"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 1. 上側ベジェパイプ（企業 → 家計） */}
          <path
            d={`M ${topP0[0]} ${topP0[1]} Q ${topP1[0]} ${topP1[1]} ${topP2[0]} ${topP2[1]}`}
            fill="none"
            stroke="rgba(56, 189, 248, 0.14)"
            strokeWidth={14}
            strokeLinecap="round"
          />
          {topPipeProg > 0.01 ? (
            <g>
              <path
                d={`M ${topP0[0]} ${topP0[1]} Q ${topP1[0]} ${topP1[1]} ${topP2[0]} ${topP2[1]}`}
                fill="none"
                stroke={isLocked ? '#EF4444' : '#38BDF8'}
                strokeWidth={7}
                strokeDasharray="1000"
                strokeDashoffset={1000 * (1 - topPipeProg)}
                strokeLinecap="round"
                filter="url(#neon-glow)"
              />
              {/* 流れるインセンティブ粒子 */}
              {[0.18, 0.45, 0.72].map((offset, idx) => {
                const t = isLocked ? offset : ((sec - startSec) * 0.42 + offset) % 1;
                if (t > topPipeProg) return null;
                const [px, py] = quadPoint(topP0, topP1, topP2, t);
                return (
                  <circle
                    key={`tp-${idx}`}
                    cx={px}
                    cy={py}
                    r={7}
                    fill={isLocked ? '#FCA5A5' : '#FFFFFF'}
                    stroke={isLocked ? '#DC2626' : '#0284C7'}
                    strokeWidth={3}
                  />
                );
              })}
              {/* 上側パイプ中央ラベルチップ */}
              <g opacity={interpolate(topPipeProg, [0.35, 0.75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}>
                <rect
                  x={612}
                  y={96}
                  width={504}
                  height={44}
                  rx={6}
                  fill="#0F172A"
                  stroke={isLocked ? '#EF4444' : '#38BDF8'}
                  strokeWidth={2.5}
                />
                <text
                  x={864}
                  y={125}
                  textAnchor="middle"
                  fill={isLocked ? '#FCA5A5' : '#E0F2FE'}
                  fontFamily={FONT_ECON_SANS}
                  fontSize={20}
                  fontWeight={900}
                >
                  価格凍結 → 利益圧迫 → 賃上げ原資ゼロ
                </text>
              </g>
            </g>
          ) : null}

          {/* 2. 下側ベジェパイプ（家計 → 企業） */}
          <path
            d={`M ${botP0[0]} ${botP0[1]} Q ${botP1[0]} ${botP1[1]} ${botP2[0]} ${botP2[1]}`}
            fill="none"
            stroke="rgba(245, 158, 11, 0.14)"
            strokeWidth={14}
            strokeLinecap="round"
          />
          {bottomPipeProg > 0.01 ? (
            <g>
              <path
                d={`M ${botP0[0]} ${botP0[1]} Q ${botP1[0]} ${botP1[1]} ${botP2[0]} ${botP2[1]}`}
                fill="none"
                stroke={isLocked ? '#EF4444' : '#F59E0B'}
                strokeWidth={7}
                strokeDasharray="1000"
                strokeDashoffset={1000 * (1 - bottomPipeProg)}
                strokeLinecap="round"
                filter="url(#neon-glow)"
              />
              {[0.2, 0.5, 0.8].map((offset, idx) => {
                const t = isLocked ? offset : ((sec - consumerPhaseSec) * 0.45 + offset) % 1;
                if (t > bottomPipeProg) return null;
                const [px, py] = quadPoint(botP0, botP1, botP2, t);
                return (
                  <circle
                    key={`bp-${idx}`}
                    cx={px}
                    cy={py}
                    r={7}
                    fill={isLocked ? '#FCA5A5' : '#FEF08A'}
                    stroke={isLocked ? '#DC2626' : '#D97706'}
                    strokeWidth={3}
                  />
                );
              })}
              {/* 下側パイプ中央ラベルチップ */}
              <g opacity={interpolate(bottomPipeProg, [0.35, 0.75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}>
                <rect
                  x={598}
                  y={604}
                  width={532}
                  height={44}
                  rx={6}
                  fill="#0F172A"
                  stroke={isLocked ? '#EF4444' : '#F59E0B'}
                  strokeWidth={2.5}
                />
                <text
                  x={864}
                  y={633}
                  textAnchor="middle"
                  fill={isLocked ? '#FCA5A5' : '#FEF3C7'}
                  fontFamily={FONT_ECON_SANS}
                  fontSize={20}
                  fontWeight={900}
                >
                  財布引き締め → 激安選好 → さらに値上げ不可
                </text>
              </g>
            </g>
          ) : null}

          {/* 3. 左カラム：企業セクター インセンティブ計器 (x: 238..558, y: 170..560) */}
          <g>
            <rect
              x={238}
              y={170}
              width={320}
              height={390}
              rx={8}
              fill="#0E1A2B"
              stroke={corpFrozen ? '#38BDF8' : '#475569'}
              strokeWidth={3}
            />
            <rect x={238} y={170} width={320} height={46} rx={8} fill="#162740" />
            <text
              x={258}
              y={201}
              fill="#38BDF8"
              fontFamily={FONT_ECON_MONO}
              fontSize={17}
              fontWeight={900}
            >
              CORPORATE // 企業の合理的判断
            </text>

            {/* 上段：値上げシミュレーション危険メーター */}
            <text x={260} y={248} fill="#CBD5E1" fontFamily={FONT_ECON_SANS} fontSize={18} fontWeight={800}>
              選択肢A：値上げ (+5%) を試す
            </text>
            <rect x={260} y={264} width={276} height={24} rx={4} fill="#1E293B" stroke="#334155" strokeWidth={1.5} />
            <rect
              x={260}
              y={264}
              width={276 * riskGauge}
              height={24}
              rx={4}
              fill={riskGauge > 0.7 ? '#EF4444' : '#F59E0B'}
            />
            <text
              x={260}
              y={316}
              fill="#FCA5A5"
              fontFamily={FONT_ECON_MONO}
              fontSize={16.5}
              fontWeight={900}
            >
              顧客離脱リスク：-{Math.round(riskGauge * 32)}% （即敗退）
            </text>

            {/* 区切り */}
            <line x1={260} y1={340} x2={536} y2={340} stroke="rgba(148,163,184,0.28)" strokeDasharray="5 4" />

            {/* 下段：価格凍結スイッチ */}
            <text x={260} y={376} fill="#CBD5E1" fontFamily={FONT_ECON_SANS} fontSize={18} fontWeight={800}>
              選択肢B：価格を凍らせる（最適解）
            </text>
            <rect
              x={260}
              y={394}
              width={276}
              height={138}
              rx={6}
              fill={corpFrozen ? 'rgba(56, 189, 248, 0.14)' : '#152236'}
              stroke={corpFrozen ? '#38BDF8' : '#334155'}
              strokeWidth={corpFrozen ? 3 : 1.5}
            />
            <g transform={`translate(398, 444) scale(${corpFrozen ? interpolate(corpFreezeSpr, [0, 1], [1.22, 1.0]) : 1}) translate(-398, -444)`}>
              <text
                x={398}
                y={446}
                textAnchor="middle"
                fill={corpFrozen ? '#38BDF8' : '#94A3B8'}
                fontFamily={FONT_ECON_MONO}
                fontSize={32}
                fontWeight={900}
              >
                {corpFrozen ? 'PRICE FROZEN' : 'HOLD PRICE'}
              </text>
              <text
                x={398}
                y={484}
                textAnchor="middle"
                fill="#E0F2FE"
                fontFamily={FONT_ECON_SANS}
                fontSize={21}
                fontWeight={900}
              >
                価格凍結 ¥0 / 改定停止
              </text>
              <text
                x={398}
                y={512}
                textAnchor="middle"
                fill="#94A3B8"
                fontFamily={FONT_ECON_MONO}
                fontSize={13.5}
                fontWeight={700}
              >
                STATUS: {corpFrozen ? 'LOCKED BY COMPETITION' : 'EVALUATING...'}
              </text>
            </g>
          </g>

          {/* 4. 中央コア：噛み合い2連歯車＆ロックリング */}
          <g>
            <circle
              cx={864}
              cy={370}
              r={164}
              fill={isLocked ? 'rgba(220, 38, 38, 0.12)' : 'rgba(15, 23, 42, 0.72)'}
              stroke={isLocked ? '#EF4444' : 'rgba(56, 189, 248, 0.35)'}
              strokeWidth={isLocked ? 4 : 2.5}
              strokeDasharray={isLocked ? undefined : '10 6'}
            />
            <g transform={`translate(814, 338) rotate(${gear1Deg.toFixed(1)}) translate(-814, -338)`}>
              <path
                d={gearPathA}
                fill={isLocked ? '#450A0A' : '#162740'}
                stroke={isLocked ? '#EF4444' : '#38BDF8'}
                strokeWidth={3}
              />
              <circle cx={814} cy={338} r={26} fill="#0B1524" stroke={isLocked ? '#EF4444' : '#38BDF8'} strokeWidth={3} />
            </g>
            <g transform={`translate(926, 416) rotate(${gear2Deg.toFixed(1)}) translate(-926, -416)`}>
              <path
                d={gearPathB}
                fill={isLocked ? '#450A0A' : '#1E293B'}
                stroke={isLocked ? '#EF4444' : '#F59E0B'}
                strokeWidth={3}
              />
              <circle cx={926} cy={416} r={19} fill="#0B1524" stroke={isLocked ? '#EF4444' : '#F59E0B'} strokeWidth={3} />
            </g>

            {/* 中央ステータスバッジ */}
            <g
              transform={`translate(864, 370) scale(${isLocked ? interpolate(lockStampSpr, [0, 1], [1.25, 1.0]) : 1}) translate(-864, -370)`}
            >
              <rect
                x={734}
                y={334}
                width={260}
                height={72}
                rx={6}
                fill={isLocked ? '#991B1B' : '#0F172A'}
                stroke={isLocked ? '#FCA5A5' : '#38BDF8'}
                strokeWidth={2.5}
              />
              <text
                x={864}
                y={364}
                textAnchor="middle"
                fill="#FFFFFF"
                fontFamily={FONT_ECON_MONO}
                fontSize={16}
                fontWeight={900}
              >
                {isLocked ? 'PRICE RIGIDITY LOCK' : 'INCENTIVE CYCLE'}
              </text>
              <text
                x={864}
                y={392}
                textAnchor="middle"
                fill={isLocked ? '#FEE2E2' : '#38BDF8'}
                fontFamily={FONT_ECON_MONO}
                fontSize={22}
                fontWeight={900}
              >
                {isLocked ? '0.0 RPM // 均衡固定' : 'FEEDBACK ACTIVE'}
              </text>
            </g>
          </g>

          {/* 5. 右カラム：消費者セクター インセンティブ計器 (x: 1170..1490, y: 170..560) */}
          <g opacity={isConsumerPhase ? 1 : 0.25}>
            <rect
              x={1170}
              y={170}
              width={320}
              height={390}
              rx={8}
              fill="#0E1A2B"
              stroke={isConsumerPhase ? '#F59E0B' : '#334155'}
              strokeWidth={3}
            />
            <rect x={1170} y={170} width={320} height={46} rx={8} fill="#1F2430" />
            <text
              x={1190}
              y={201}
              fill="#F59E0B"
              fontFamily={FONT_ECON_MONO}
              fontSize={17}
              fontWeight={900}
            >
              CONSUMER // 家計の合理的防衛
            </text>

            <text x={1192} y={248} fill="#CBD5E1" fontFamily={FONT_ECON_SANS} fontSize={18} fontWeight={800}>
              前提条件：名目・実質給料の停滞
            </text>
            <rect x={1192} y={264} width={276} height={42} rx={4} fill="#1E293B" stroke="#475569" strokeWidth={1.5} />
            <text
              x={1330}
              y={292}
              textAnchor="middle"
              fill="#FCA5A5"
              fontFamily={FONT_ECON_MONO}
              fontSize={21}
              fontWeight={900}
            >
              実質賃金変化：±0.0%
            </text>

            <text x={1192} y={346} fill="#CBD5E1" fontFamily={FONT_ECON_SANS} fontSize={18} fontWeight={800}>
              防衛行動ゲージ（財布の紐）
            </text>
            <rect x={1192} y={362} width={276} height={24} rx={4} fill="#1E293B" stroke="#334155" strokeWidth={1.5} />
            <rect
              x={1192}
              y={362}
              width={276 * (isConsumerPhase ? walletTighten : 0.12)}
              height={24}
              rx={4}
              fill="#F59E0B"
            />

            <rect
              x={1192}
              y={404}
              width={276}
              height={128}
              rx={6}
              fill={isConsumerPhase ? 'rgba(245, 158, 11, 0.14)' : '#152236'}
              stroke={isConsumerPhase ? '#F59E0B' : '#334155'}
              strokeWidth={isConsumerPhase ? 3 : 1.5}
            />
            <text
              x={1330}
              y={448}
              textAnchor="middle"
              fill="#FDE047"
              fontFamily={FONT_ECON_SANS}
              fontSize={24}
              fontWeight={900}
            >
              安い店のみ選択
            </text>
            <text
              x={1330}
              y={482}
              textAnchor="middle"
              fill="#FEF3C7"
              fontFamily={FONT_ECON_SANS}
              fontSize={18.5}
              fontWeight={800}
            >
              「1円でも安く」財布を締める
            </text>
            <text
              x={1330}
              y={512}
              textAnchor="middle"
              fill="#94A3B8"
              fontFamily={FONT_ECON_MONO}
              fontSize={13.5}
              fontWeight={700}
            >
              {isLocked ? 'STATUS: LOCKED IN BARGAIN LOOP' : 'DEFENSE MODE ACTIVE'}
            </text>
          </g>
        </svg>
      </div>
    </AbsoluteFill>
  );
};
