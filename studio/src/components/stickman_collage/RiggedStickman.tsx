import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { clamp01 } from './beatUtils';
import {
  BACK,
  D2R,
  EIO,
  STAGE_FLOOR_Y,
  eio,
  f2,
  lerp,
  ramp,
  ring,
  stepSec,
  type Pt,
} from './motionMath';
import { InkFxLayer } from './StageEffects';
import type { PolarityTheme } from './types';

/* ========================================================================== */
/* 関節リグ棒人間エンジン（stickman-collage v2.1 純粋エンジン）                 */
/*  ※具体的な小道具や定型芝居プリセットは含めず、リグ・運動学・表情・描画のみ。  */
/* ========================================================================== */

/** 角度は「真下=0°、右=+90°、真上=180°」。肘・膝は上腕・太腿からの相対角。右向き基準。 */
export interface StickPose {
  x: number;
  y: number;
  s: number;
  lean: number;
  head: number;
  ls: number;
  le: number;
  rs: number;
  re: number;
  lh: number;
  lk: number;
  rh: number;
  rk: number;
}

export type Face =
  | 'neutral'
  | 'happy'
  | 'smug'
  | 'blank'
  | 'sad'
  | 'surprised'
  | 'think';

export const STICK_LEN = {
  torso: 104,
  neck: 8,
  headR: 30,
  upper: 56,
  fore: 52,
  thigh: 62,
  shin: 60,
} as const;

/** 直立時の腰→足裏の高さ（s = 1 基準） */
export const STICK_HIP_H = STICK_LEN.thigh + STICK_LEN.shin;

export const STAND_POSE: Omit<StickPose, 'x' | 'y' | 's'> = {
  lean: 0,
  head: 0,
  ls: -12,
  le: -6,
  rs: 14,
  re: 6,
  lh: -7,
  lk: 0,
  rh: 7,
  rk: 0,
};

/** 接地足基準で直立ポーズを生成する */
export const createStandPose = (
  x: number,
  floorY = STAGE_FLOOR_Y,
  s = 1.32,
): StickPose => ({
  x,
  y: floorY - STICK_HIP_H * s,
  s,
  ...STAND_POSE,
});

export interface StickRig {
  hip: Pt;
  sh: Pt;
  chest: Pt;
  head: Pt;
  headTop: Pt;
  lE: Pt;
  lH: Pt;
  rE: Pt;
  rH: Pt;
  handMid: Pt;
  lK: Pt;
  lF: Pt;
  rK: Pt;
  rF: Pt;
  feetY: number;
}

export interface PoseKey {
  t: number;
  d?: number;
  soft?: boolean;
  p: Partial<StickPose>;
}

const polar = (o: Pt, a: number, l: number): Pt => ({
  x: o.x + Math.sin(a * D2R) * l,
  y: o.y + Math.cos(a * D2R) * l,
});

/**
 * ポーズから全関節および頭・頭頂・胸・両手・両足先の接続座標を算出する。
 * `flip = true` の場合、`x = p.x` 軸で鏡像反転したワールド座標を返す。
 */
export const rig = (p: StickPose, flip = false): StickRig => {
  const s = p.s;
  const hip = { x: p.x, y: p.y };
  const sh = polar(hip, 180 - p.lean, STICK_LEN.torso * s);
  const chest = { x: lerp(hip.x, sh.x, 0.55), y: lerp(hip.y, sh.y, 0.55) };
  const head = polar(
    sh,
    180 - p.lean - p.head,
    (STICK_LEN.neck + STICK_LEN.headR) * s,
  );
  const headTop = polar(head, 180 - p.lean - p.head, STICK_LEN.headR * s);
  const lE = polar(sh, p.ls, STICK_LEN.upper * s);
  const lH = polar(lE, p.ls + p.le, STICK_LEN.fore * s);
  const rE = polar(sh, p.rs, STICK_LEN.upper * s);
  const rH = polar(rE, p.rs + p.re, STICK_LEN.fore * s);
  const lK = polar(hip, p.lh, STICK_LEN.thigh * s);
  const lF = polar(lK, p.lh + p.lk, STICK_LEN.shin * s);
  const rK = polar(hip, p.rh, STICK_LEN.thigh * s);
  const rF = polar(rK, p.rh + p.rk, STICK_LEN.shin * s);
  const handMid = { x: (lH.x + rH.x) / 2, y: (lH.y + rH.y) / 2 };
  const feetY = Math.max(lF.y, rF.y);

  const out: StickRig = {
    hip,
    sh,
    chest,
    head,
    headTop,
    lE,
    lH,
    rE,
    rH,
    handMid,
    lK,
    lF,
    rK,
    rF,
    feetY,
  };
  if (!flip) {
    return out;
  }
  const m = (q: Pt): Pt => ({ x: 2 * p.x - q.x, y: q.y });
  const mLH = m(lH);
  const mRH = m(rH);
  return {
    hip: m(hip),
    sh: m(sh),
    chest: m(chest),
    head: m(head),
    headTop: m(headTop),
    lE: m(lE),
    lH: mLH,
    rE: m(rE),
    rH: mRH,
    handMid: { x: (mLH.x + mRH.x) / 2, y: (mLH.y + mRH.y) / 2 },
    lK: m(lK),
    lF: m(lF),
    rK: m(rK),
    rF: m(rF),
    feetY,
  };
};

export const mixPose = (a: StickPose, b: StickPose, t: number): StickPose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  s: lerp(a.s, b.s, t),
  lean: lerp(a.lean, b.lean, t),
  head: lerp(a.head, b.head, t),
  ls: lerp(a.ls, b.ls, t),
  le: lerp(a.le, b.le, t),
  rs: lerp(a.rs, b.rs, t),
  re: lerp(a.re, b.re, t),
  lh: lerp(a.lh, b.lh, t),
  lk: lerp(a.lk, b.lk, t),
  rh: lerp(a.rh, b.rh, t),
  rk: lerp(a.rk, b.rk, t),
});

/** キー時刻ごとにポーズを積み重ねて補間（既定はバックアウトで「勢い→戻り」の物理感） */
export const track = (
  sec: number,
  base: StickPose,
  keys: readonly PoseKey[],
): StickPose => {
  let cur = { ...base };
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  for (const k of sorted) {
    if (sec < k.t) {
      break;
    }
    const raw = ramp(sec, k.t, k.t + (k.d ?? 0.32));
    const e = k.soft ? EIO(raw) : BACK(raw);
    cur = mixPose(cur, { ...cur, ...k.p }, e);
  }
  return cur;
};

/** 歩行サイクル（右向き基準）。phase はラジアン、amp は 0..1 */
export const walk = (p: StickPose, phase: number, amp = 1): StickPose => {
  if (amp <= 0) {
    return p;
  }
  const sw = Math.sin(phase);
  const cw = Math.cos(phase);
  return {
    ...p,
    lh: lerp(p.lh, 27 * sw, amp),
    rh: lerp(p.rh, -27 * sw, amp),
    lk: lerp(p.lk, -Math.max(0, cw) * 42, amp),
    rk: lerp(p.rk, -Math.max(0, -cw) * 42, amp),
    ls: lerp(p.ls, -24 * sw - 4, amp),
    le: lerp(p.le, 18, amp),
    rs: lerp(p.rs, 24 * sw + 4, amp),
    re: lerp(p.re, 18, amp),
    lean: p.lean + 5 * amp,
    y: p.y - (1 - Math.abs(sw)) * 6 * p.s * amp,
  };
};

/** 歩いて立ち止まるまでの x・歩行フェーズ・振幅減衰を算出する */
export const walkIn = (
  sec: number,
  startX: number,
  endX: number,
  dur: number,
  scale = 1.32,
): { x: number; phase: number; amp: number } => {
  const t = ramp(sec, 0, dur);
  const e =
    t < 0.75
      ? t / 0.875
      : 0.857 + (1 - Math.pow(1 - (t - 0.75) / 0.25, 2)) * 0.143;
  const x = lerp(startX, endX, Math.min(1, e));
  const travelled = Math.abs(x - startX);
  const phase = (travelled / (108 * Math.max(0.2, scale))) * Math.PI;
  const amp = 1 - eio(sec, dur - 0.3, dur + 0.05);
  return { x, phase, amp };
};

/** 自然な呼吸の揺らぎを加える */
export const breathePose = (
  p: StickPose,
  sec: number,
  amp = 1,
): StickPose => {
  if (amp <= 0) {
    return p;
  }
  return {
    ...p,
    lean: p.lean + Math.sin(sec * 2.3) * 1.1 * amp,
    ls: p.ls + Math.sin(sec * 2.3 + 1) * 1.5 * amp,
    rs: p.rs - Math.sin(sec * 2.3 + 1) * 1.5 * amp,
  };
};

/**
 * 簡易2関節IK（真下=0°・右=+90°・真上=180°座標系）。
 * `bendDir` で肘の曲がる向き（+1 / -1）を選択する。
 */
export const solveTwoBoneIK = (
  origin: Pt,
  target: Pt,
  l1: number,
  l2: number,
  bendDir: 1 | -1 = 1,
): { shoulder: number; elbow: number } => {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const minDist = Math.abs(l1 - l2) + 0.001;
  const maxDist = l1 + l2 - 0.001;
  const dist = Math.max(minDist, Math.min(maxDist, Math.hypot(dx, dy)));
  const baseRad = Math.atan2(dx, dy);
  const cosAlpha = Math.max(
    -1,
    Math.min(1, (l1 * l1 + dist * dist - l2 * l2) / Math.max(0.0001, 2 * l1 * dist)),
  );
  const cosGamma = Math.max(
    -1,
    Math.min(1, (l1 * l1 + l2 * l2 - dist * dist) / Math.max(0.0001, 2 * l1 * l2)),
  );
  const alpha = Math.acos(cosAlpha);
  const gamma = Math.acos(cosGamma);
  const shoulderRad = baseRad - bendDir * alpha;
  const elbowRad = bendDir * (Math.PI - gamma);
  return {
    shoulder: shoulderRad / D2R,
    elbow: elbowRad / D2R,
  };
};

/**
 * 指定した手（'left' | 'right'）を目標座標 `target` へ簡易2関節IKで伸ばす。
 * `flip = true` を渡すと左右反転後のワールド座標をターゲットとして解決する。
 */
export const reachHand = (
  p: StickPose,
  hand: 'left' | 'right',
  target: Pt,
  options?: { flip?: boolean; bendDir?: 1 | -1; weight?: number },
): StickPose => {
  const isFlipped = options?.flip ?? false;
  const weight = clamp01(options?.weight ?? 1);
  if (weight <= 0) {
    return p;
  }
  const localTarget = isFlipped ? { x: 2 * p.x - target.x, y: target.y } : target;
  const sh = rig(p).sh;
  const bendDir = options?.bendDir ?? (hand === 'left' ? -1 : 1);
  const solved = solveTwoBoneIK(
    sh,
    localTarget,
    STICK_LEN.upper * p.s,
    STICK_LEN.fore * p.s,
    bendDir,
  );
  if (hand === 'left') {
    return {
      ...p,
      ls: lerp(p.ls, solved.shoulder, weight),
      le: lerp(p.le, solved.elbow, weight),
    };
  }
  return {
    ...p,
    rs: lerp(p.rs, solved.shoulder, weight),
    re: lerp(p.re, solved.elbow, weight),
  };
};

const seg = (a: Pt, b: Pt, bow: number): string => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return `M ${f2(a.x)} ${f2(a.y)} Q ${f2(mx - (dy / len) * bow)} ${f2(my + (dx / len) * bow)} ${f2(b.x)} ${f2(b.y)}`;
};

export interface StickmanOnionSkinConfig {
  enabled?: boolean;
  offsets?: readonly number[];
  poseAt?: (t: number) => { pose: StickPose; flip?: boolean };
  sec?: number;
  pastColor?: string;
  futureColor?: string;
  strokeWidth?: number;
  boilFps?: number;
}

export interface OnionSkinStickmanProps {
  sec: number;
  poseAt: (t: number) => { pose: StickPose; flip?: boolean };
  offsets?: readonly number[];
  pastColor?: string;
  futureColor?: string;
  width?: number;
  boilFps?: number;
}

/**
 * 透写台（light_table）向けの前後コマ・青赤オニオンスキン描画コンポーネント。
 * 非ボイル層へ単体配置しても、RiggedStickman の onionSkin prop から併用しても使える。
 */
export const OnionSkinStickman: React.FC<OnionSkinStickmanProps> = ({
  sec,
  poseAt,
  offsets = [-2, -1, 1],
  pastColor = 'rgba(58, 111, 216, 0.34)',
  futureColor = 'rgba(216, 67, 58, 0.26)',
  width = 5,
  boilFps = 7.5,
}) => {
  const st = stepSec(sec, boilFps);
  const stepUnit = 2 / Math.max(1, boilFps);
  return (
    <>
      {offsets.map((k) => {
        const t = st + k * stepUnit;
        const g = poseAt(t);
        const ink = k < 0 ? pastColor : futureColor;
        const op = k <= -2 ? 0.55 : 1;
        return (
          <g key={k} opacity={op}>
            <RiggedStickman
              p={g.pose}
              flip={g.flip}
              ink={ink}
              headFill="none"
              width={width}
              faceless
              blink={false}
              breathe={false}
            />
          </g>
        );
      })}
    </>
  );
};

export interface RiggedStickmanProps {
  p: StickPose;
  theme?: PolarityTheme;
  ink?: string;
  headFill?: string;
  face?: Face;
  /** 視線オフセット（-1.0〜+1.0 程度、既定 0.4） */
  look?: number;
  flip?: boolean;
  width?: number;
  /** 頭の上に載せる小物。頭中心原点・未回転座標 */
  hat?: React.ReactNode;
  faceless?: boolean;
  sec?: number;
  /** 自動呼吸（boolean または振幅倍率） */
  breathe?: boolean | number;
  /** 自動まばたき */
  blink?: boolean;
  blinkSeed?: number;
  /** 明示的に渡された場合のみ単体で切り抜きシール化を適用（Stage 側と二重適用を避けるため既定未設定） */
  cutout?: string | boolean;
  /** 明示的に渡された場合のみ単体で発光を適用 */
  glow?: string | boolean;
  onionSkin?: StickmanOnionSkinConfig;
}

/**
 * 関節リグ棒人間（6表情＋think、視線移動、呼吸、自動まばたき、オニオンスキン対応）。
 * Stage のボイル層内へ配置すると 7.5fps 手描き揺らぎを自動共有する。
 */
export const RiggedStickman: React.FC<RiggedStickmanProps> = ({
  p,
  theme,
  ink,
  headFill,
  face = 'neutral',
  look = 0.4,
  flip = false,
  width = 9,
  hat,
  faceless = false,
  sec,
  breathe = false,
  blink = false,
  blinkSeed = 0,
  cutout,
  glow,
  onionSkin,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = sec ?? frame / Math.max(1, fps);

  const resolvedInk = ink ?? theme?.ink ?? '#F3EFE6';
  const resolvedHeadFill = headFill ?? theme?.headFill ?? '#0E0D0B';
  const breatheAmp = typeof breathe === 'number' ? breathe : breathe ? 1 : 0;
  const finalPose = breatheAmp > 0 ? breathePose(p, currentSec, breatheAmp) : p;

  const r = rig(finalPose);
  const s = finalPose.s;
  const w = width * s;
  const b = 2.2 * s;
  const fw = 3.4 * s;
  const ex = look * 7;

  const blinkPeriod = 3.4;
  const blinkPhase = (currentSec + (Math.abs(blinkSeed) % 7) * 0.43) % blinkPeriod;
  const isBlinking = blink && blinkPhase >= blinkPeriod - 0.13 && currentSec > 0.25;

  const renderEyes = (yOff: number, radius: number) =>
    isBlinking ? (
      <>
        <path
          d={`M ${-13 + ex} ${yOff} Q ${-8 + ex} ${yOff + 4.5} ${-3 + ex} ${yOff}`}
          stroke={resolvedInk}
          strokeWidth={fw}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M ${4 + ex} ${yOff} Q ${9 + ex} ${yOff + 4.5} ${14 + ex} ${yOff}`}
          stroke={resolvedInk}
          strokeWidth={fw}
          fill="none"
          strokeLinecap="round"
        />
      </>
    ) : (
      <>
        <circle cx={-8 + ex} cy={yOff} r={radius} fill={resolvedInk} />
        <circle cx={9 + ex} cy={yOff} r={radius} fill={resolvedInk} />
      </>
    );

  const faceEl = (() => {
    switch (face) {
      case 'happy':
        return (
          <>
            <path
              d={`M ${-14 + ex} -2 Q ${-9 + ex} -10 ${-4 + ex} -2`}
              stroke={resolvedInk}
              strokeWidth={fw}
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={`M ${5 + ex} -2 Q ${10 + ex} -10 ${15 + ex} -2`}
              stroke={resolvedInk}
              strokeWidth={fw}
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={`M ${-11 + ex} 8 Q ${0 + ex} 21 ${12 + ex} 8`}
              stroke={resolvedInk}
              strokeWidth={fw}
              fill="none"
              strokeLinecap="round"
            />
          </>
        );
      case 'smug':
        return (
          <>
            <path
              d={`M ${-15 + ex} -4 L ${-4 + ex} -3`}
              stroke={resolvedInk}
              strokeWidth={fw}
              strokeLinecap="round"
            />
            <path
              d={`M ${5 + ex} -3 L ${15 + ex} -4`}
              stroke={resolvedInk}
              strokeWidth={fw}
              strokeLinecap="round"
            />
            <path
              d={`M ${-6 + ex} 12 Q ${4 + ex} 17 ${13 + ex} 7`}
              stroke={resolvedInk}
              strokeWidth={fw}
              fill="none"
              strokeLinecap="round"
            />
          </>
        );
      case 'blank':
        return (
          <>
            {renderEyes(-3, 3.2)}
            <path
              d={`M ${-4 + ex} 12 L ${5 + ex} 12`}
              stroke={resolvedInk}
              strokeWidth={fw}
              strokeLinecap="round"
            />
          </>
        );
      case 'sad':
        return (
          <>
            {renderEyes(-2, 3.2)}
            <path
              d={`M ${-8 + ex} 15 Q ${1 + ex} 7 ${10 + ex} 15`}
              stroke={resolvedInk}
              strokeWidth={fw}
              fill="none"
              strokeLinecap="round"
            />
          </>
        );
      case 'surprised':
        return (
          <>
            {renderEyes(-4, 4.6)}
            <ellipse
              cx={1 + ex}
              cy={12}
              rx={5}
              ry={6.5}
              fill="none"
              stroke={resolvedInk}
              strokeWidth={fw}
            />
          </>
        );
      case 'think':
        return (
          <>
            {renderEyes(-5, 3.3)}
            <path
              d={`M ${-4 + ex} 12 L ${9 + ex} 10`}
              stroke={resolvedInk}
              strokeWidth={fw}
              strokeLinecap="round"
            />
          </>
        );
      case 'neutral':
      default:
        return (
          <>
            {renderEyes(-3, 3.4)}
            <path
              d={`M ${-7 + ex} 11 Q ${1 + ex} 15 ${9 + ex} 11`}
              stroke={resolvedInk}
              strokeWidth={fw}
              fill="none"
              strokeLinecap="round"
            />
          </>
        );
    }
  })();

  const body = (
    <g
      fill="none"
      stroke={resolvedInk}
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={`${seg(r.hip, r.lK, b)} ${seg(r.lK, r.lF, -b).replace('M', 'L')}`} />
      <path d={`${seg(r.hip, r.rK, -b)} ${seg(r.rK, r.rF, b).replace('M', 'L')}`} />
      <path d={seg(r.hip, r.sh, b * 1.4)} />
      <path d={`${seg(r.sh, r.lE, b)} ${seg(r.lE, r.lH, -b).replace('M', 'L')}`} />
      <path d={`${seg(r.sh, r.rE, -b)} ${seg(r.rE, r.rH, b).replace('M', 'L')}`} />
      <path d={ring(r.head.x, r.head.y, STICK_LEN.headR * s, 3)} fill={resolvedHeadFill} />
      {faceless ? null : (
        <g
          transform={`translate(${f2(r.head.x)} ${f2(r.head.y)}) rotate(${f2(finalPose.lean + finalPose.head)}) scale(${s})`}
          stroke="none"
        >
          {faceEl}
        </g>
      )}
      {hat ? (
        <g transform={`translate(${f2(r.head.x)} ${f2(r.head.y)}) scale(${s})`}>
          {hat}
        </g>
      ) : null}
    </g>
  );

  const actorNode = flip ? (
    <g transform={`translate(${f2(2 * finalPose.x)} 0) scale(-1 1)`}>{body}</g>
  ) : (
    body
  );

  const wrappedActor =
    cutout || glow ? (
      <InkFxLayer cutout={cutout} glow={glow}>
        {actorNode}
      </InkFxLayer>
    ) : (
      actorNode
    );

  const onionEnabled = Boolean(onionSkin?.enabled !== false && onionSkin?.poseAt);
  if (!onionEnabled || !onionSkin?.poseAt) {
    return wrappedActor;
  }

  return (
    <>
      <OnionSkinStickman
        sec={onionSkin.sec ?? currentSec}
        poseAt={onionSkin.poseAt}
        offsets={onionSkin.offsets}
        pastColor={onionSkin.pastColor}
        futureColor={onionSkin.futureColor}
        width={onionSkin.strokeWidth}
        boilFps={onionSkin.boilFps}
      />
      {wrappedActor}
    </>
  );
};
