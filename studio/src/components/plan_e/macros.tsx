import React from 'react';
import { AbsoluteFill, interpolate, spring } from 'remotion';
import { SURFACE_POLARITY } from './auditRules';
import { SUBTITLE_SAFE_BOTTOM } from './constants';
import { DiegeticCoin, DiegeticStamp } from './DiegeticProps';
import { EditorialPaperBackdrop } from './EditorialCutoutCard';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from './fonts';
import { shiftAnchor } from './timeline';
import type { Anchor, PlanEBeatInput, PlanECustomSceneContext } from './types';

const INK = '#16130F';
const RED = '#CC0000';
const BLUE = '#0072B2';
const GREEN = '#1E8E3E';
const GOLD = '#F59E0B';
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const ramp = (sec: number, from: number, dur = 0.45) =>
  interpolate(sec, [from, from + dur], [0, 1], CLAMP);

const springAt = (
  c: PlanECustomSceneContext,
  atSec: number,
  config = { stiffness: 360, damping: 22, mass: 0.65 },
) => {
  const f0 = Math.round(atSec * c.fps);
  return c.frame < f0 ? 0 : spring({ frame: c.frame - f0, fps: c.fps, config });
};

export interface AllocationRecipientInput {
  label: string;
  value: string;
  share?: number;
  color?: string;
  face?: string;
  at?: Anchor;
  valueAt?: Anchor;
}

export interface AllocationMacroConfig {
  idPrefix?: string;
  at: Anchor;
  total: {
    label: string;
    value: string;
    badge?: string;
    code?: string;
    rows?: readonly [string, string][];
    highlightRowIndex?: number;
    highlightAt?: Anchor;
    stamp?: string;
    stampAt?: Anchor;
    at?: Anchor;
  };
  recipients: readonly AllocationRecipientInput[];
  token: 'coin' | 'bill' | 'bar';
  benchmark?: {
    label: string;
    value: string;
    share: number;
    note?: string;
    at?: Anchor;
    noteAt?: Anchor;
  };
}

export interface PlanEMacroOutput {
  beats: PlanEBeatInput[];
  render: (ctx: PlanECustomSceneContext) => React.ReactNode;
  /** マクロは自前で全面の地を描き、字幕帯回避も SUBTITLE_SAFE_BOTTOM で内蔵済み */
  guard: 'none';
  living: false;
}

/**
 * 経済動作マクロ ①：配分（`allocation`）
 * 総額・原資がどの割合で誰へ渡るかを、硬貨ウェッジ／紙幣束／横バーで示す。
 */
export function allocation(cfg: AllocationMacroConfig): PlanEMacroOutput {
  const prefix = cfg.idPrefix ?? 'alloc';
  const baseAt = cfg.total.at ?? cfg.at;
  const sheetId = `${prefix}_sheet`;
  const hlId = `${prefix}_highlight`;
  const stampId = `${prefix}_stamp`;
  const benchId = `${prefix}_bench`;
  const benchNoteId = `${prefix}_bench_note`;

  const beats: PlanEBeatInput[] = [
    {
      id: sheetId,
      at: baseAt,
      prop: 'cutout_card',
      params: { headline: cfg.total.label, badge: cfg.total.badge },
      sfx: 'paper_snap',
    },
  ];

  if (cfg.total.highlightRowIndex !== undefined) {
    beats.push({
      id: hlId,
      at: cfg.total.highlightAt ?? shiftAnchor(baseAt, 2.0),
      prop: 'marker_write',
      params: { text: cfg.total.value, x: 200, y: 400 },
      sfx: 'pen_scratch',
    });
  }

  if (cfg.total.stamp) {
    beats.push({
      id: stampId,
      at: cfg.total.stampAt ?? shiftAnchor(baseAt, 4.5),
      prop: 'stamp',
      params: { text: cfg.total.stamp, x: 330, y: 620 },
      sfx: 'stamp_thud',
    });
  }

  cfg.recipients.forEach((rec, idx) => {
    const recAt = rec.at ?? shiftAnchor(baseAt, 6.5 + idx * 2.4);
    if (cfg.token === 'bar') {
      beats.push({
        id: `${prefix}_rec_${idx}`,
        at: recAt,
        prop: 'counter',
        params: { x: 1280, y: 360 + idx * 140, valueText: rec.value, label: rec.label },
        sfx: 'soft_pop',
      });
    } else {
      beats.push({
        id: `${prefix}_rec_${idx}`,
        at: recAt,
        prop: 'coin',
        params: { cx: 1310, cy: 430, r: 190, frac: rec.share ?? 0.371, face: rec.face ?? '100' },
        sfx: 'soft_pop',
      });
    }
    if (rec.valueAt) {
      beats.push({
        id: `${prefix}_rec_val_${idx}`,
        at: rec.valueAt,
        prop: 'hang_tag',
        params: { x: 1310, y: 720, price: rec.value, label: rec.label },
        sfx: 'price_ping',
      });
    }
  });

  if (cfg.benchmark) {
    const bAt = cfg.benchmark.at ?? shiftAnchor(baseAt, 9.5);
    beats.push({
      id: benchId,
      at: bAt,
      prop: 'coin',
      params: {
        cx: 1710,
        cy: 300,
        r: 84,
        frac: cfg.benchmark.share,
        face: '100',
        label: cfg.benchmark.label,
      },
      sfx: 'soft_pop',
    });
    if (cfg.benchmark.note) {
      beats.push({
        id: benchNoteId,
        at: cfg.benchmark.noteAt ?? shiftAnchor(bAt, 1.0),
        prop: 'marker_write',
        params: { text: cfg.benchmark.note, x: 1710, y: 560 },
        sfx: 'pen_scratch',
      });
    }
  }

  const render = (ctx: PlanECustomSceneContext): React.ReactNode => {
    const isLight = SURFACE_POLARITY[ctx.scene.surface] === 'bright';
    const tSheet = ctx.beat(sheetId);
    const sheetSpr = springAt(ctx, tSheet, { stiffness: 300, damping: 22, mass: 0.7 });
    const hlProg =
      cfg.total.highlightRowIndex !== undefined ? ramp(ctx.sec, ctx.beat(hlId), 0.55) : 0;
    const tStamp = cfg.total.stamp ? ctx.beat(stampId) : undefined;
    const rows = cfg.total.rows ?? [[cfg.total.label, cfg.total.value]];

    const sheetCard = (
      <>
        <div
          style={{
            position: 'absolute',
            left: 140,
            top: 110,
            width: 780,
            padding: '34px 44px 48px',
            background: '#FFFFFF',
            boxShadow: '0 22px 44px rgba(0,0,0,0.25)',
            clipPath:
              'polygon(0% 1%, 6% 0%, 14% 1.2%, 25% 0.2%, 38% 1.4%, 52% 0%, 66% 1.1%, 80% 0.1%, 92% 1.3%, 100% 0.4%, 100% 99%, 90% 100%, 78% 98.8%, 64% 100%, 50% 98.9%, 36% 100%, 22% 98.7%, 10% 100%, 0% 99.2%)',
            transform: `translateY(${interpolate(sheetSpr, [0, 1], [-60, 0]).toFixed(1)}px) rotate(-1.4deg)`,
            opacity: interpolate(sheetSpr, [0, 0.25, 1], [0, 1, 1]),
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              borderBottom: `3px solid ${INK}`,
              paddingBottom: 14,
              marginBottom: 22,
            }}
          >
            <span
              style={{
                background: INK,
                color: '#FFF',
                fontFamily: FONT_ECON_SANS,
                fontWeight: 900,
                fontSize: 26,
                padding: '3px 16px',
                letterSpacing: '0.14em',
              }}
            >
              {cfg.total.badge ?? '配分内訳'}
            </span>
            {cfg.total.code ? (
              <span style={{ fontFamily: FONT_ECON_MONO, fontWeight: 800, fontSize: 26, color: '#4A4238' }}>
                {cfg.total.code}
              </span>
            ) : null}
          </div>
          <div
            style={{
              fontFamily: FONT_ECON_SERIF,
              fontWeight: 900,
              fontSize: 48,
              color: INK,
              lineHeight: 1.25,
              marginBottom: 24,
              whiteSpace: 'pre-line',
            }}
          >
            {cfg.total.label}
          </div>
          {rows.map(([k, v], i) => (
            <div
              key={`${k}-${i}`}
              style={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: FONT_ECON_SANS,
                fontWeight: 800,
                fontSize: 36,
                color: INK,
                padding: '14px 6px',
                borderBottom: '1px dashed rgba(22,19,15,0.35)',
              }}
            >
              {i === cfg.total.highlightRowIndex ? (
                <div
                  style={{
                    position: 'absolute',
                    left: -6,
                    top: 8,
                    bottom: 8,
                    width: `${(hlProg * 104).toFixed(1)}%`,
                    background: 'rgba(250,204,21,0.55)',
                    zIndex: 0,
                  }}
                />
              ) : null}
              <span style={{ position: 'relative' }}>{k}</span>
              <span style={{ position: 'relative', fontFamily: FONT_ECON_MONO }}>{v}</span>
            </div>
          ))}
          <div style={{ height: 110 }} />
        </div>
        {cfg.total.stamp && tStamp !== undefined ? (
          <DiegeticStamp
            text={cfg.total.stamp}
            atSec={tStamp}
            size={64}
            rotateDeg={-7}
            style={{ left: 330, top: 615 }}
          />
        ) : null}
      </>
    );

    const tokenStage = (
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {cfg.token === 'coin' &&
          cfg.recipients.map((rec, idx) => {
            const tRec = ctx.beat(`${prefix}_rec_${idx}`);
            const tVal = rec.valueAt ? ctx.beat(`${prefix}_rec_val_${idx}`) : tRec + 0.9;
            const cx = cfg.recipients.length === 1 ? 1310 : 1220 + idx * 280;
            const cy = 430;
            const valOp = ramp(ctx.sec, tVal, 0.25);
            return (
              <g key={`coin-rec-${idx}`}>
                <DiegeticCoin
                  atSec={tRec}
                  cx={cx}
                  cy={cy}
                  r={cfg.recipients.length === 1 ? 190 : 120}
                  frac={rec.share ?? 0.371}
                  face={rec.face ?? '100'}
                  fillColor={rec.color ?? RED}
                  fillDelaySec={0.25}
                  fillDurSec={0.85}
                />
                <text
                  x={cx}
                  y={720}
                  textAnchor="middle"
                  fontFamily={FONT_ECON_SERIF}
                  fontWeight={900}
                  fontSize={82}
                  fill={rec.color ?? RED}
                  opacity={valOp}
                >
                  {rec.value}
                </text>
              </g>
            );
          })}

        {cfg.token === 'bill' &&
          cfg.recipients.map((rec, idx) => {
            const tRec = ctx.beat(`${prefix}_rec_${idx}`);
            const spr = springAt(ctx, tRec);
            const y = 260 + idx * 210;
            const share = Math.max(0.05, Math.min(1, rec.share ?? 0.5));
            return (
              <g key={`bill-${idx}`} opacity={spr} transform={`translate(0 ${((1 - spr) * 30).toFixed(1)})`}>
                <rect x={1040} y={y} width={680} height={132} rx={12} fill="#EFE9DA" stroke={INK} strokeWidth={4} />
                <rect x={1040} y={y} width={680 * share} height={132} rx={10} fill={rec.color ?? GREEN} opacity={0.85} />
                <text x={1070} y={y + 56} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={32} fill={INK}>
                  {rec.label}
                </text>
                <text x={1690} y={y + 84} textAnchor="end" fontFamily={FONT_ECON_MONO} fontWeight={900} fontSize={44} fill={INK}>
                  {rec.value}
                </text>
              </g>
            );
          })}

        {cfg.token === 'bar' &&
          cfg.recipients.map((rec, idx) => {
            const tRec = ctx.beat(`${prefix}_rec_${idx}`);
            const fillP = ramp(ctx.sec, tRec, 0.6);
            const y = 270 + idx * 170;
            const share = Math.max(0.02, Math.min(1, rec.share ?? 0.4));
            return (
              <g key={`bar-${idx}`} opacity={ramp(ctx.sec, tRec, 0.25)}>
                <text x={1040} y={y - 16} fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={32} fill={isLight ? INK : '#F8FAFC'}>
                  {rec.label}
                </text>
                <rect x={1040} y={y} width={720} height={64} rx={8} fill={isLight ? '#E2E8F0' : '#1E293B'} stroke={isLight ? INK : '#475569'} strokeWidth={3} />
                <rect x={1040} y={y} width={720 * share * fillP} height={64} rx={8} fill={rec.color ?? RED} />
                <text x={1750} y={y + 46} textAnchor="end" fontFamily={FONT_ECON_MONO} fontWeight={900} fontSize={38} fill={rec.color ?? RED}>
                  {rec.value}
                </text>
              </g>
            );
          })}

        {cfg.benchmark && (() => {
          const tB = ctx.beat(benchId);
          const tNote = cfg.benchmark.note ? ctx.beat(benchNoteId) : tB + 0.8;
          return (
            <g>
              <DiegeticCoin
                atSec={tB}
                cx={1710}
                cy={300}
                r={84}
                frac={cfg.benchmark.share}
                face="100"
                label={cfg.benchmark.label}
                fillColor={RED}
                fillDelaySec={0.15}
                fillDurSec={0.5}
              />
              {cfg.benchmark.note ? (
                <text
                  x={1710}
                  y={560}
                  textAnchor="middle"
                  fontFamily={FONT_ECON_SERIF}
                  fontWeight={900}
                  fontSize={64}
                  fill={RED}
                  opacity={ramp(ctx.sec, tNote, 0.25)}
                  transform="rotate(-6 1710 560)"
                >
                  {cfg.benchmark.note}
                </text>
              ) : null}
            </g>
          );
        })()}
      </svg>
    );

    if (isLight) {
      return (
        <EditorialPaperBackdrop>
          {sheetCard}
          {tokenStage}
        </EditorialPaperBackdrop>
      );
    }
    return (
      <AbsoluteFill style={{ backgroundColor: '#11141A' }}>
        {sheetCard}
        {tokenStage}
      </AbsoluteFill>
    );
  };

  return { beats, render, guard: 'none', living: false };
}

export interface SelectionMacroConfig {
  idPrefix?: string;
  at: Anchor;
  title?: string;
  badge?: string;
  population: { label: string; count: string; subLabel?: string };
  criterion: { label: string; at: Anchor };
  kept: { label: string; count: string; stamp?: string; at?: Anchor; stampAt?: Anchor };
  dropped: { label: string; count: string; at?: Anchor };
  device: 'sieve' | 'gate';
  dotCount?: number;
  dropRatio?: number;
}

/**
 * 経済動作マクロ ②：選別（`selection`）
 * 母集団が基準（ふるい／ゲート）を通過して「残った側」と「落ちた側」に分かれる因果を描く。
 */
export function selection(cfg: SelectionMacroConfig): PlanEMacroOutput {
  const prefix = cfg.idPrefix ?? 'sel';
  const enterId = `${prefix}_enter`;
  const critId = `${prefix}_criterion`;
  const dropId = `${prefix}_drop`;
  const keepId = `${prefix}_keep`;
  const stampId = `${prefix}_stamp`;

  const tDropAt = cfg.dropped.at ?? shiftAnchor(cfg.criterion.at, 1.0);
  const tKeepAt = cfg.kept.at ?? shiftAnchor(tDropAt, 1.4);

  const beats: PlanEBeatInput[] = [
    {
      id: enterId,
      at: cfg.at,
      prop: 'counter',
      params: { x: 420, y: 200, valueText: cfg.population.count, label: cfg.population.label },
      sfx: 'mech_slide',
    },
    {
      id: critId,
      at: cfg.criterion.at,
      prop: 'marker_write',
      params: { text: cfg.criterion.label, x: 960, y: 640 },
      sfx: 'pen_scratch',
    },
    {
      id: dropId,
      at: tDropAt,
      prop: 'x_mark',
      params: { cx: 1360, cy: 760, size: 80 },
      sfx: 'whoosh',
    },
    {
      id: keepId,
      at: tKeepAt,
      prop: 'coin',
      params: { cx: 960, cy: 360, r: 90, frac: 1 - (cfg.dropRatio ?? 0.125) },
      sfx: 'soft_pop',
    },
  ];

  if (cfg.kept.stamp) {
    beats.push({
      id: stampId,
      at: cfg.kept.stampAt ?? shiftAnchor(tKeepAt, 1.6),
      prop: 'stamp',
      params: { text: cfg.kept.stamp, x: 1130, y: 170 },
      sfx: 'stamp_thud',
    });
  }

  const render = (ctx: PlanECustomSceneContext): React.ReactNode => {
    const isLight = SURFACE_POLARITY[ctx.scene.surface] === 'bright';
    const inkColor = isLight ? INK : '#F8FAFC';
    const tEnter = ctx.beat(enterId);
    const tCrit = ctx.beat(critId);
    const tDrop = ctx.beat(dropId);
    const tKeep = ctx.beat(keepId);
    const tStamp = cfg.kept.stamp ? ctx.beat(stampId) : undefined;

    const s = ctx.sec;
    const shake =
      s >= tCrit && s < tCrit + 1.5
        ? Math.sin((s - tCrit) * 38) * 10 * (1 - (s - tCrit) / 1.5)
        : 0;
    const keepP = ramp(s, tKeep, 0.5);
    const dropLabelOp = ramp(s, tDrop + 0.3, 0.3);

    const cols = 12;
    const rows = 4;
    const totalDots = cfg.dotCount ?? cols * rows;
    const dropStep = Math.max(3, Math.round(1 / (cfg.dropRatio ?? 0.125)));

    const dots: React.ReactNode[] = [];
    for (let i = 0; i < totalDots; i++) {
      const r = Math.floor(i / cols);
      const col = i % cols;
      const x0 =
        cfg.device === 'gate'
          ? 280 + col * 58 + (r % 2) * 28
          : 560 + col * 72 + (r % 2) * 36;
      const y0 = cfg.device === 'gate' ? 350 + r * 74 : 300 + r * 62;
      const falls = i % dropStep === 3 % dropStep;
      let x = x0 + (cfg.device === 'sieve' ? shake : 0);
      let y = y0;
      let op = ramp(s, tEnter + i * 0.012, 0.3);

      if (cfg.device === 'gate') {
        const shiftP = ramp(s, tCrit, 0.9);
        if (falls) {
          const tFall = s - (tDrop + (i % 4) * 0.08);
          if (tFall > 0) {
            y = y0 + 520 * tFall * tFall;
            op *= interpolate(y, [680, 880], [1, 0], CLAMP);
          }
        } else {
          x = x0 + shiftP * 560;
        }
      } else if (falls) {
        const tFall = s - (tDrop + (i % 5) * 0.08);
        if (tFall > 0) {
          y = y0 + 900 * tFall * tFall;
          op *= interpolate(y, [700, 900], [1, 0], CLAMP);
        }
      }

      const fill = falls
        ? RED
        : keepP > 0
          ? `rgba(245,158,11,${0.35 + 0.65 * keepP})`
          : isLight
            ? '#475569'
            : '#94A3B8';

      dots.push(
        <g key={`dot-${i}`} opacity={op}>
          <circle cx={x} cy={y - 18} r={13} fill={fill} />
          <path d={`M ${x - 20} ${y + 22} Q ${x} ${y - 6} ${x + 20} ${y + 22} Z`} fill={fill} />
          {!falls && keepP > 0 ? (
            <circle cx={x} cy={y - 18} r={17} fill="none" stroke="#B45309" strokeWidth={2} opacity={keepP * 0.7} />
          ) : null}
        </g>,
      );
    }

    const body = (
      <>
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: 96,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            zIndex: 20,
          }}
        >
          <span
            style={{
              background: isLight ? INK : RED,
              color: '#FAF8F3',
              fontFamily: FONT_ECON_SANS,
              fontWeight: 900,
              fontSize: 30,
              padding: '3px 18px',
              letterSpacing: '0.16em',
            }}
          >
            {cfg.badge ?? '仕組み'}
          </span>
          <span style={{ fontFamily: FONT_ECON_SERIF, fontWeight: 900, fontSize: 42, color: inkColor }}>
            {cfg.title ?? `${cfg.population.label}の選別`}
          </span>
        </div>

        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          {dots}
          {cfg.device === 'sieve' ? (
            <g transform={`translate(${shake} 0)`}>
              <rect x={500} y={560} width={920} height={26} fill="none" stroke={inkColor} strokeWidth={5} />
              {Array.from({ length: 23 }).map((_, i) => (
                <line key={i} x1={520 + i * 40} y1={560} x2={520 + i * 40} y2={586} stroke={inkColor} strokeWidth={3} />
              ))}
              <rect x={430} y={548} width={90} height={50} rx={8} fill={inkColor} />
              <rect x={1400} y={548} width={90} height={50} rx={8} fill={inkColor} />
              <text x={960} y={640} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={34} fill={inkColor}>
                {cfg.criterion.label}
              </text>
            </g>
          ) : (
            <g>
              <line
                x1={920}
                y1={250}
                x2={920}
                y2={Math.min(720, 250 + 470 * ramp(s, tCrit, 0.4))}
                stroke={BLUE}
                strokeWidth={10}
                strokeDasharray="16 10"
              />
              <text x={920} y={760} textAnchor="middle" fontFamily={FONT_ECON_SANS} fontWeight={900} fontSize={34} fill={BLUE}>
                {cfg.criterion.label}
              </text>
            </g>
          )}

          <text
            x={1460}
            y={Math.min(820, 1080 - SUBTITLE_SAFE_BOTTOM - 90)}
            textAnchor="end"
            fontFamily={FONT_ECON_SERIF}
            fontWeight={900}
            fontSize={52}
            fill={RED}
            opacity={dropLabelOp}
          >
            {cfg.dropped.count} {cfg.dropped.label}
          </text>
          <text
            x={cfg.device === 'gate' ? 1140 : 560}
            y={240}
            fontFamily={FONT_ECON_SERIF}
            fontWeight={900}
            fontSize={44}
            fill={isLight ? '#B45309' : GOLD}
            opacity={keepP}
          >
            {cfg.kept.label}（{cfg.kept.count}）
          </text>
        </svg>

        {cfg.kept.stamp && tStamp !== undefined ? (
          <DiegeticStamp
            text={cfg.kept.stamp}
            atSec={tStamp}
            size={62}
            rotateDeg={-7}
            style={{ left: 1130, top: 170 }}
          />
        ) : null}
      </>
    );

    if (isLight) {
      return <EditorialPaperBackdrop>{body}</EditorialPaperBackdrop>;
    }
    return <AbsoluteFill style={{ backgroundColor: '#0D1117' }}>{body}</AbsoluteFill>;
  };

  return { beats, render, guard: 'none', living: false };
}
