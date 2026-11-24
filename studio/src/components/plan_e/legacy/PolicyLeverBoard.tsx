import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { PLAN_E_MACRO_PALETTE } from '../../../theme/tokens';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from '../fonts';
import { PlanEBackdropMode, PlanEPolicyLeverItem, isPlanELightBackdrop } from './typesV2';

export interface PolicyLeverBoardProps {
  startSec: number;
  title: string;
  subtitle?: string;
  mode?: 'levers' | 'balance_scale' | 'shield_impact';
  levers: readonly PlanEPolicyLeverItem[];
  verdictStamp?: string;
  backdropMode?: PlanEBackdropMode;
}

function severityColor(sev?: PlanEPolicyLeverItem['severity']): string {
  if (sev === 'critical') return PLAN_E_MACRO_PALETTE.crisisRed;
  if (sev === 'blocked') return PLAN_E_MACRO_PALETTE.emeraldBright;
  if (sev === 'medium') return PLAN_E_MACRO_PALETTE.policyGold;
  return PLAN_E_MACRO_PALETTE.dataCyan;
}

function severityLabel(sev?: PlanEPolicyLeverItem['severity']): string {
  if (sev === 'critical') return 'CRITICAL';
  if (sev === 'blocked') return 'DEFLECTED';
  if (sev === 'medium') return 'BACKFIRE';
  return 'ACTIVE';
}

/**
 * 案E 思考実験「破壊レバー / インセンティブ天秤 / 構造防壁（Shield Impact）」図解ボード。
 */
export const PolicyLeverBoard: React.FC<PolicyLeverBoardProps> = ({
  startSec,
  title,
  subtitle,
  mode = 'levers',
  levers,
  verdictStamp,
  backdropMode = 'slate_grid',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const isLight = isPlanELightBackdrop(backdropMode);

  const titleColor = isLight ? PLAN_E_MACRO_PALETTE.inkDark : PLAN_E_MACRO_PALETTE.textLight;
  const mutedColor = isLight ? '#475569' : PLAN_E_MACRO_PALETTE.textMuted;
  const panelBg = isLight ? '#FFFFFF' : '#161B22';
  const panelBorder = isLight ? '#CBD5E1' : '#334155';

  const stampSpr = spring({
    frame: Math.max(0, frame - Math.round((startSec + 0.55) * fps)),
    fps,
    config: { stiffness: 480, damping: 20, mass: 0.6 },
  });

  if (mode === 'shield_impact') {
    const impactProg = interpolate(sec, [startSec + 0.25, startSec + 0.9], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const rebound = Math.sin(impactProg * Math.PI) * 14;

    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          paddingTop: 8,
          paddingBottom: 78,
          gap: 18,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: FONT_ECON_SERIF, fontSize: 38, fontWeight: 900, color: titleColor }}>
            {title}
          </div>
          {subtitle ? <div style={{ fontSize: 20, color: mutedColor }}>{subtitle}</div> : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 28, alignItems: 'center', flex: 1 }}>
          {/* 左：多層シールドSVG（外部ショックを弾き返す構造図） */}
          <div
            style={{
              backgroundColor: panelBg,
              border: `1px solid ${panelBorder}`,
              padding: 20,
              height: 490,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 640 420" aria-hidden="true">
              {/* 中心コア（脆い市場） */}
              <circle
                cx={400}
                cy={210}
                r={56}
                fill="rgba(220, 38, 38, 0.16)"
                stroke={PLAN_E_MACRO_PALETTE.crisisRed}
                strokeWidth={3}
                strokeDasharray="6 4"
              />
              <text
                x={400}
                y={204}
                textAnchor="middle"
                fill={titleColor}
                fontFamily={FONT_ECON_SANS}
                fontSize={16}
                fontWeight={900}
              >
                金融市場
              </text>
              <text
                x={400}
                y={228}
                textAnchor="middle"
                fill={PLAN_E_MACRO_PALETTE.crisisRed}
                fontFamily={FONT_ECON_MONO}
                fontSize={13}
                fontWeight={800}
              >
                SOFT CORE
              </text>

              {/* 多層シールド環（外殻4層） */}
              {[96, 134, 172].map((r, i) => (
                <path
                  key={`ring-${r}`}
                  d={`M ${400 - r} ${210 - r * 0.65} A ${r} ${r} 0 0 0 ${400 - r} ${210 + r * 0.65}`}
                  fill="none"
                  stroke={
                    i === 2
                      ? PLAN_E_MACRO_PALETTE.emeraldBright
                      : i === 1
                        ? PLAN_E_MACRO_PALETTE.dataCyan
                        : PLAN_E_MACRO_PALETTE.policyGold
                  }
                  strokeWidth={6 - i}
                  strokeLinecap="round"
                  opacity={0.45 + 0.55 * impactProg}
                />
              ))}

              {/* 左からの破壊衝撃矢印と跳ね返り軌跡 */}
              <g transform={`translate(${-rebound}, 0)`}>
                <line
                  x1={42}
                  y1={210}
                  x2={205}
                  y2={210}
                  stroke={PLAN_E_MACRO_PALETTE.crisisRed}
                  strokeWidth={7}
                  strokeLinecap="round"
                />
                <polygon points="215,210 192,196 192,224" fill={PLAN_E_MACRO_PALETTE.crisisRed} />
                <text
                  x={124}
                  y={184}
                  textAnchor="middle"
                  fill={PLAN_E_MACRO_PALETTE.crisisRed}
                  fontFamily={FONT_ECON_SANS}
                  fontSize={18}
                  fontWeight={900}
                >
                  破壊ショック
                </text>
              </g>

              {/* 跳ね返りスパーク */}
              <path
                d="M 224 176 L 178 118 M 224 244 L 178 302"
                stroke={PLAN_E_MACRO_PALETTE.policyGold}
                strokeWidth={3.5}
                strokeDasharray="8 6"
                opacity={impactProg}
              />
            </svg>

            {verdictStamp ? (
              <div
                style={{
                  position: 'absolute',
                  top: 22,
                  right: 22,
                  border: `4px solid ${PLAN_E_MACRO_PALETTE.emeraldBright}`,
                  color: PLAN_E_MACRO_PALETTE.emeraldBright,
                  padding: '5px 14px',
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 20,
                  fontWeight: 900,
                  transform: `rotate(-5deg) scale(${interpolate(stampSpr, [0, 1], [1.5, 1.0])})`,
                  opacity: stampSpr,
                }}
              >
                {verdictStamp}
              </div>
            ) : null}
          </div>

          {/* 右：防壁リスト */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {levers.map((lv, idx) => {
              const revAt = startSec + (lv.revealOffsetSec ?? idx * 0.14);
              const lf = Math.max(0, frame - Math.round(revAt * fps));
              const spr = spring({ frame: lf, fps, config: { stiffness: 420, damping: 24, mass: 0.65 } });
              if (sec < revAt) return null;
              const col = severityColor(lv.severity);

              return (
                <div
                  key={lv.id}
                  style={{
                    backgroundColor: panelBg,
                    border: `1px solid ${panelBorder}`,
                    borderLeft: `8px solid ${col}`,
                    padding: '14px 20px',
                    transform: `translateX(${interpolate(spr, [0, 1], [28, 0])}px)`,
                    opacity: spr,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: FONT_ECON_SANS, fontSize: 22, fontWeight: 900, color: titleColor }}>
                      {lv.code}　{lv.label}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_ECON_MONO,
                        fontSize: 13,
                        fontWeight: 900,
                        color: col,
                        border: `1px solid ${col}`,
                        padding: '2px 8px',
                      }}
                    >
                      {severityLabel(lv.severity)}
                    </span>
                  </div>
                  <div style={{ fontSize: 16, color: mutedColor, marginTop: 6 }}>
                    狙い：{lv.intendedEffect} ／ <strong style={{ color: col }}>結果：{lv.backfireResult}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // levers / balance_scale 標準ボード
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        paddingTop: 8,
        paddingBottom: 78,
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: FONT_ECON_SERIF, fontSize: 38, fontWeight: 900, color: titleColor }}>
            {title}
          </div>
          {subtitle ? <div style={{ fontSize: 19, color: mutedColor, marginTop: 4 }}>{subtitle}</div> : null}
        </div>

        {verdictStamp ? (
          <div
            style={{
              border: `4px solid ${PLAN_E_MACRO_PALETTE.crisisRed}`,
              color: PLAN_E_MACRO_PALETTE.crisisRed,
              padding: '6px 16px',
              fontFamily: FONT_ECON_SANS,
              fontSize: 22,
              fontWeight: 900,
              transform: `rotate(-4deg) scale(${interpolate(stampSpr, [0, 1], [1.4, 1.0])})`,
              opacity: stampSpr,
            }}
          >
            {verdictStamp}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
        {levers.map((lv, idx) => {
          const revAt = startSec + (lv.revealOffsetSec ?? idx * 0.16);
          if (sec < revAt) return null;
          const lf = Math.max(0, frame - Math.round(revAt * fps));
          const spr = spring({ frame: lf, fps, config: { stiffness: 420, damping: 24, mass: 0.65 } });
          const col = severityColor(lv.severity);

          return (
            <div
              key={lv.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1.2fr 1fr 1.3fr',
                gap: 18,
                alignItems: 'center',
                backgroundColor: panelBg,
                border: `1px solid ${panelBorder}`,
                borderLeft: `8px solid ${col}`,
                padding: '16px 22px',
                transform: `translateY(${interpolate(spr, [0, 1], [16, 0])}px)`,
                opacity: spr,
              }}
            >
              <div>
                <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 15, fontWeight: 900, color: col }}>
                  {lv.code}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    display: 'inline-block',
                    padding: '3px 10px',
                    fontFamily: FONT_ECON_MONO,
                    fontSize: 12,
                    fontWeight: 800,
                    backgroundColor: lv.active ? col : 'rgba(148,163,184,0.2)',
                    color: lv.active ? '#FFFFFF' : mutedColor,
                  }}
                >
                  {severityLabel(lv.severity)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: titleColor }}>{lv.label}</div>
                <div style={{ fontSize: 15, color: mutedColor, marginTop: 4 }}>{lv.actionText}</div>
              </div>

              <div
                style={{
                  borderLeft: `1px dashed ${panelBorder}`,
                  paddingLeft: 16,
                  fontSize: 16,
                  color: mutedColor,
                }}
              >
                <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 12, color: mutedColor }}>表面の狙い</div>
                <div style={{ marginTop: 4, fontWeight: 700, color: titleColor }}>{lv.intendedEffect}</div>
              </div>

              <div
                style={{
                  borderLeft: `1px dashed ${panelBorder}`,
                  paddingLeft: 16,
                  fontSize: 16,
                }}
              >
                <div style={{ fontFamily: FONT_ECON_MONO, fontSize: 12, color: col }}>構造上の副作用・現実</div>
                <div style={{ marginTop: 4, fontWeight: 900, color: col }}>{lv.backfireResult}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
