import React, { useId } from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BoilFilterDef } from '../../_materials';
import { clamp01 } from '../beatUtils';
import { FONT_MARU, useStickmanCollageFonts } from '../fonts';
import { D2R, eo, f2, lerp, ramp, rnd, sanitizeSvgId } from '../motionMath';
import { rig, type StickPose } from '../RiggedStickman';
import {
  BUGURU_CHANNEL_NAME,
  BUGURU_PALETTE,
  BuguruCharacter,
  BuguruGlowFilter,
  BuguruPaperFilter,
  ColorSplit,
  GlitchBlocks,
  SvgSlices,
  TwitchMarks,
  buguruPoseAtHead,
  randomBands,
  type BuguruPalette,
  type GlitchBand,
} from './buguruCore';

/* ========================================================================== */
/* 「バグる棒人間」1.0 秒アイキャッチ＝キャラ連動トランジション（3種）           */
/*  3種とも 1.0 秒・30fps・ヒット／カット点 0.40s・API（outgoing / incoming /    */
/*  showName / withSfx）を共通にし、variant で切り替える。SE は variant ごとに  */
/*  専用 WAV を自動で鳴らす（pipeline/scripts/build_buguru_brand_sfx.py で生成）。 */
/*                                                                            */
/*  strips（既定・明盤スケッチ）… 6枚の紙帯が差し込まれ、0.40s でバグって反対側へ抜ける */
/*  zoom  （明盤スケッチ）…… 前シーンに描かれた赤い×へ飛び込み、0.40s で一気に引くと */
/*                           棒人間の右目だったと分かる → 画面ごと×に裂けて抜ける    */
/*  glitch（暗盤 glow）……… 前シーンが RGB 分離・破損ピクセルでシステムダウン暗転し、 */
/*                           0.40s で発光する棒人間と RGB 版ズレロゴが焼き付く →     */
/*                           走査線が中央へ収束して抜ける                            */
/*                                                                            */
/*  共通の使い方：                                                              */
/*   - 本編章転換（標準）：spec.json の chapters[].eyecatch で宣言する。           */
/*     build_stickman_collage_assets.py が専用無音スロット（1.0s＋後間0.25s）を   */
/*     確保し、StickmanCollageTemplate が自動描画する（アイキャッチ中は次章の     */
/*     ナレーション・字幕・映像シーンを一切開始せず、0.40s の裏で背景極性のみ切替）。 */
/*   - 単体プレビュー：outgoing / incoming に前後シーンを渡して単体確認できる。    */
/* ========================================================================== */

/* -------------------------------------------------------------------------- */
/* strips（紙帯スライス）のタイムライン                                         */
/*  0.00  前シーンに走査ずれ（SE 頭のチッ）                                     */
/*  0.03〜0.27  スケッチ紙が6枚の紙帯になって左右から差し込まれ、棒人間が組み上がる */
/*  0.40  バグ発生（SE のヒット）：右目が赤い×、ポーズが肩すくめへ飛び、          */
/*        紙帯が横ずれ・赤青版ズレ・ピクッ線、チャンネル名が版ズレで刷られる       */
/*  0.40〜0.72  アイコンと同じ静止構図で名前を読ませる（微グリッチのみ）           */
/*  0.72〜0.96  紙帯が逆方向へ抜けて次シーンを露出                               */
/* -------------------------------------------------------------------------- */

export type BuguruEyecatchVariant = 'strips' | 'zoom' | 'glitch';

/** 公式採用 3 種（各 1.0 秒・カット点 0.40s） */
export const BUGURU_EYECATCH_VARIANTS: readonly BuguruEyecatchVariant[] = ['strips', 'zoom', 'glitch'];
export const BUGURU_EYECATCH_DEFAULT_VARIANT: BuguruEyecatchVariant = 'strips';
export const BUGURU_EYECATCH_LABELS: Record<BuguruEyecatchVariant, string> = {
  strips: '紙帯スライス（明盤スケッチ）',
  zoom: '×目ドリーアウト（明盤スケッチ）',
  glitch: 'システムダウン焼き付き（暗盤 glow）',
};

export const BUGURU_EYECATCH_DURATION_SEC = 1.0;
export const BUGURU_EYECATCH_FPS = 30;
export const BUGURU_EYECATCH_FRAMES = Math.round(BUGURU_EYECATCH_DURATION_SEC * BUGURU_EYECATCH_FPS);
/** SE のヒット（バグ発生）位置。3種共通 */
export const BUGURU_EYECATCH_HIT_SEC = 0.4;
/** 全面が完全に覆われている内部カット点（背景極性の裏切替位置・3種共通） */
export const BUGURU_EYECATCH_CUT_SEC = 0.4;
/** 章間アイキャッチ直前の前章語尾余韻（秒・既定値） */
export const BUGURU_EYECATCH_DEFAULT_LEAD_IN_SEC = 0.25;
/** 章間アイキャッチ完全終了後〜次章開始までの自然な無音間（秒・既定値、SE残響0.25sと整合） */
export const BUGURU_EYECATCH_DEFAULT_POST_PAUSE_SEC = 0.25;
/** 章間アイキャッチ完全終了後の最小無音間（秒・バリデータ契約下限） */
export const BUGURU_EYECATCH_MIN_POST_PAUSE_SEC = 0.15;

const SFX_FILE: Record<BuguruEyecatchVariant, string> = {
  strips: 'eyecatch_sketch_se.wav',
  zoom: 'eyecatch_zoom_se.wav',
  glitch: 'eyecatch_glitch_se.wav',
};

/** studio/public 基準の variant 別 SE パス（episodes/ab_tests/2026-11-23_buguru-brand-kit/sfx と同一音源） */
export const buguruEyecatchSfxPath = (
  variant: BuguruEyecatchVariant = BUGURU_EYECATCH_DEFAULT_VARIANT,
): string => `brand/buguru/${SFX_FILE[variant]}`;

/** strips（既定）の SE パス。後方互換用 */
export const BUGURU_EYECATCH_SFX = buguruEyecatchSfxPath('strips');

export interface BuguruEyecatchProps {
  /** 演出の種類（既定 'strips'） */
  variant?: BuguruEyecatchVariant;
  /** 前シーン（HTML / AbsoluteFill 可）。未指定なら透明（テンプレートの章間スロット下地を使用） */
  outgoing?: React.ReactNode;
  /** 次シーン（HTML / AbsoluteFill 可）。未指定なら透明（テンプレートの章間スロット下地を使用） */
  incoming?: React.ReactNode;
  /** チャンネル名を刷るか（既定 true・本編の章転換でも原則 true 統一） */
  showName?: boolean;
  /** SE を内蔵再生するか */
  withSfx?: boolean;
  sfxVolume?: number;
  /**
   * 入り・抜けの透過区間で背後を遮蔽したい場合の任意下地色。
   * 省略時は透明（StickmanCollageTemplate の章間スロット下地や outgoing/incoming を透過）。
   */
  backdropColor?: string;
  /** 時刻の上書き（秒）。未指定時は useCurrentFrame() / fps（Sequence 内では相対） */
  sec?: number;
  /** 映像本体の尺（秒、既定 1.0s）。この尺以降は映像を描かず SE 残響のみ鳴らし切る */
  durationSec?: number;
}

const W = 1920;
const H = 1080;
const PAL = BUGURU_PALETTE.sketch;

/* --- キャラ配置（左にバスト、右に名前） ------------------------------------ */
const HEAD_X = 572;
const HEAD_Y = 418;
const S = 5.0;
const K = S / 5.5; // アイコン（S=5.5）基準の比率

/** 腰に手（バグ前の平常ポーズ）。ヒットで BUGURU_SHRUG（両手上げ）へ飛ぶ */
const PRE_POSE = { lean: 0, head: -3, ls: -38, le: 70, rs: 40, re: -72 };

/** アイコンと同じ「頭頂・顎下・肘」の3本の紙片ずれ（頭中心からの相対） */
const BUG_BANDS: readonly GlitchBand[] = [
  { y0: -148, y1: -102, dx: 40 },
  { y0: 96, y1: 140, dx: -44 },
  { y0: 324, y1: 360, dx: 26 },
].map((b) => ({ y0: HEAD_Y + b.y0 * K, y1: HEAD_Y + b.y1 * K, dx: b.dx * K }));

/* --- 名前 ----------------------------------------------------------------- */
/* 頭頂帯と顎下帯のあいだ（顔の高さ）に置き、保持中は帯で文字が切れないようにする */
const NAME_X = 990;
const NAME_BASELINE = 488;
const NAME_SIZE = 132;

/* --- 画面を覆う紙帯（不揃いな切り口） --------------------------------------- */
const STRIP_EDGES = [0, 168, 352, 486, 664, 842, 1080];
const IN_ORDER = [2, 0, 4, 1, 5, 3];
const OUT_ORDER = [3, 1, 5, 0, 4, 2];
const IN_START = 0.03;
const IN_STEP = 0.024;
const IN_DUR = 0.12;
const OUT_START = 0.72;
const OUT_STEP = 0.027;
const OUT_DUR = 0.1;
const TRAVEL = 2150;

const stripDx = (i: number, sec: number): number => {
  const dirIn = i % 2 === 0 ? -1 : 1;
  const t0 = IN_START + IN_ORDER[i] * IN_STEP;
  const inDx = dirIn * (1 - eo(sec, t0, t0 + IN_DUR)) * TRAVEL;
  const t1 = OUT_START + OUT_ORDER[i] * OUT_STEP;
  const u = ramp(sec, t1, t1 + OUT_DUR);
  // 入ってきた側へ抜けず、反対側へ抜ける（紙が横に引き抜かれる）
  const outDx = -dirIn * u * u * TRAVEL;
  return inDx + outDx;
};

const fullyCovered = (sec: number): boolean =>
  sec >= IN_START + 5 * IN_STEP + IN_DUR && sec < OUT_START;
const fullyGone = (sec: number): boolean =>
  sec >= OUT_START + 5 * OUT_STEP + OUT_DUR || sec < IN_START;

/* --- HTML 前シーン用の走査ずれ ----------------------------------------------- */
const HtmlSlices: React.FC<{ bands: readonly GlitchBand[]; children: React.ReactNode }> = ({
  bands,
  children,
}) => (
  <AbsoluteFill>
    <AbsoluteFill>{children}</AbsoluteFill>
    {bands.map((b, i) => (
      <AbsoluteFill
        key={i}
        style={{
          clipPath: `inset(${f2(b.y0)}px 0px ${f2(H - b.y1)}px 0px)`,
          transform: `translateX(${f2(b.dx)}px)`,
        }}
      >
        {children}
      </AbsoluteFill>
    ))}
    {/* ずれ帯の縁に赤青の版ズレ線 */}
    <AbsoluteFill style={{ mixBlendMode: 'multiply' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {bands.map((b, i) => (
          <g key={i}>
            <rect x={0} y={b.y0} width={W} height={4} fill={PAL.splitA} opacity={0.75} />
            <rect x={0} y={b.y1 - 4} width={W} height={4} fill={PAL.splitB} opacity={0.75} />
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  </AbsoluteFill>
);

/** variant 本体に渡す共通入力 */
interface BodyProps {
  sec: number;
  uid: string;
  outgoing?: React.ReactNode;
  incoming?: React.ReactNode;
  showName: boolean;
}

/** strips：紙帯スライス（明盤スケッチ・既定） */
const StripsBody: React.FC<BodyProps> = ({ sec, uid, outgoing, incoming, showName }) => {
  const f = Math.floor(sec * 30 + 1e-6); // 乱数シード用の 30fps フレーム番号

  const hit = sec >= BUGURU_EYECATCH_HIT_SEC;
  const sinceHit = sec - BUGURU_EYECATCH_HIT_SEC;
  const settle = 1 - eo(sec, BUGURU_EYECATCH_HIT_SEC, BUGURU_EYECATCH_HIT_SEC + 0.18);

  /* ---- 棒人間の状態 ---- */
  const tremble = sec >= 0.3 && !hit ? (rnd(f * 7 + 3) - 0.5) * 6 : 0;
  const pose: StickPose = hit
    ? buguruPoseAtHead(HEAD_X, HEAD_Y, S)
    : buguruPoseAtHead(HEAD_X + tremble, HEAD_Y, S, PRE_POSE);
  const bugged = hit ? 1 + 0.25 * settle : 0;
  const eyeJitter = hit && sinceHit < 0.1 ? (rnd(f * 3 + 1) - 0.5) * 8 : 0;
  // 紙が動いている間と、ヒット直後は版ズレが大きい
  const covering = fullyCovered(sec);
  const motionSplit = covering ? 0 : 10;
  const splitDx = hit ? 14 + 34 * settle : 7 + motionSplit;
  const splitDy = hit ? 7 + 8 * settle : 3;

  /* ---- 帯 ---- */
  const bugBands: GlitchBand[] = hit
    ? BUG_BANDS.map((b) => ({ ...b, dx: b.dx * (1 + 1.6 * settle) }))
    : [];
  // ヒット直後2コマの全面ノイズ／バグ前の予兆／保持中の微グリッチ
  let noiseBands: GlitchBand[] = [];
  if (hit && sinceHit < 0.066) {
    noiseBands = randomBands(f + 11, 6, 60, 1020, 14, 64, 110);
  } else if ((f === 10 || f === 11) && !hit) {
    noiseBands = randomBands(f + 5, 3, 120, 980, 10, 30, 22);
  } else if (f === 19 || f === 20) {
    noiseBands = randomBands(f + 29, 3, 120, 980, 8, 26, 18);
  }
  const shakeX = hit && sinceHit < 0.066 ? (rnd(f * 5 + 2) - 0.5) * 22 : 0;
  const shakeY = hit && sinceHit < 0.066 ? (rnd(f * 9 + 4) - 0.5) * 10 : 0;

  /* ---- 名前（ヒットで版ズレ刷り：1コマ目は色版だけ、2コマ目から墨が乗る） ---- */
  const nameVisible = showName && hit;
  const nameInk = sinceHit >= 0.03;
  const nameSplit = 4 + 30 * settle;
  const namePop = 1 + 0.07 * (1 - eo(sec, BUGURU_EYECATCH_HIT_SEC + 0.03, BUGURU_EYECATCH_HIT_SEC + 0.14));

  /* ---- ID ---- */
  const paperId = `be-paper-${uid}`;
  const boilId = `be-boil-${uid}`;
  const boil2Id = `be-boil2-${uid}`;
  const shadowId = `be-shadow-${uid}`;
  const stripShadowId = `be-sshadow-${uid}`;
  const boilSeed = 3 + Math.floor(sec * 7.5);

  const r = rig(pose);
  const R = 30 * S;

  const nameText = (fill: string, accent: string) => (
    <text
      x={NAME_X}
      y={NAME_BASELINE}
      fontFamily={FONT_MARU}
      fontWeight={900}
      fontSize={NAME_SIZE}
      fill={fill}
    >
      <tspan fill={accent}>{BUGURU_CHANNEL_NAME.slice(0, 3)}</tspan>
      <tspan>{BUGURU_CHANNEL_NAME.slice(3)}</tspan>
    </text>
  );

  const name = nameVisible ? (
    <g
      transform={`translate(${f2(NAME_X + 410)} ${f2(NAME_BASELINE - 48)}) scale(${f2(namePop)}) translate(${f2(-(NAME_X + 410))} ${f2(-(NAME_BASELINE - 48))})`}
    >
      <g transform={`translate(${f2(-nameSplit)} ${f2(-nameSplit * 0.25)})`} style={{ mixBlendMode: 'multiply' }} opacity={0.7}>
        {nameText(PAL.splitA, PAL.splitA)}
      </g>
      <g transform={`translate(${f2(nameSplit)} ${f2(nameSplit * 0.2)})`} style={{ mixBlendMode: 'multiply' }} opacity={0.7}>
        {nameText(PAL.splitB, PAL.splitB)}
      </g>
      {nameInk ? nameText(PAL.ink, PAL.bug) : null}
    </g>
  ) : null;

  const construction = (
    <g fill="none" stroke={PAL.graphite} strokeWidth={4} strokeLinecap="round" filter={`url(#${boil2Id})`}>
      <ellipse cx={r.head.x + 10} cy={r.head.y - 6} rx={R + 22} ry={R + 12} />
      <path d={`M ${f2(r.head.x - R - 40)} ${f2(r.head.y - 2)} Q ${f2(r.head.x)} ${f2(r.head.y + 18)} ${f2(r.head.x + R + 46)} ${f2(r.head.y - 8)}`} />
      <path d={`M ${f2(r.head.x + 4)} ${f2(r.head.y - R - 44)} Q ${f2(r.head.x + 26)} ${f2(r.head.y)} ${f2(r.head.x + 30)} ${f2(r.head.y + R + 30)}`} />
      <path d={`M ${f2(r.sh.x - 210)} ${f2(r.sh.y + 6)} L ${f2(r.sh.x + 216)} ${f2(r.sh.y - 4)}`} />
      {/* 名前の割付け線（鉛筆） */}
      <path d={`M ${NAME_X - 20} ${NAME_BASELINE + 22} L ${NAME_X + 812} ${NAME_BASELINE + 16}`} />
      <path d={`M ${NAME_X - 26} ${NAME_BASELINE - NAME_SIZE + 4} L ${NAME_X + 800} ${NAME_BASELINE - NAME_SIZE - 2}`} />
    </g>
  );

  const figure = (
    <ColorSplit
      palette={PAL}
      dx={splitDx}
      dy={splitDy}
      opacity={0.78}
      render={(ink, ghost) => (
        <BuguruCharacter
          pose={pose}
          palette={PAL}
          ink={ink}
          ghost={ghost}
          bugged={bugged}
          eyeJitter={eyeJitter}
          width={9.4}
        />
      )}
    />
  );

  /**
   * 紙1枚分（紙・下描き・キャラ・名前）。
   * 帯の複製では紙テクスチャ（全面 feTurbulence）を帯の高さだけに限定し、
   * 1 コマあたりのフィルタ負荷を抑える（全面複製を重ねると Chrome が帯を描き落とすため）。
   */
  const renderSheet = (y0 = -40, y1 = H + 40) => (
    <g>
      <rect x={-200} y={y0 - 12} width={W + 400} height={y1 - y0 + 24} fill={PAL.bg} filter={`url(#${paperId})`} />
      {construction}
      <g filter={`url(#${boilId})`}>{figure}</g>
      {name}
    </g>
  );

  const overlaps = (b: GlitchBand, y0: number, y1: number) => b.y1 > y0 && b.y0 < y1;

  /**
   * 指定範囲（紙帯）ぶんの完成画：土台の紙＋バグ帯（影付き紙片ずれ）＋走査ノイズ帯＋切り取り線。
   * 帯は入れ子にせず、範囲に掛かるものだけを1段で重ねる。
   */
  const renderComposite = (y0 = -40, y1 = H + 40) => {
    const bb = bugBands.filter((b) => overlaps(b, y0, y1));
    const nb = noiseBands.filter((b) => overlaps(b, y0, y1));
    return (
      <g>
        {renderSheet(y0, y1)}
        {bb.map((b, i) => (
          <g key={`b${i}`} filter={`url(#${shadowId})`}>
            <SvgSlices bands={[b]} onlyBands>
              {renderSheet(b.y0, b.y1)}
            </SvgSlices>
          </g>
        ))}
        {bb.length > 0 ? (
          <g stroke="rgba(28, 25, 23, 0.55)" strokeWidth={2.5} strokeDasharray="10 9" fill="none">
            {bb.map((b, i) => (
              <path key={i} d={`M -40 ${f2(b.y0)} L ${W + 40} ${f2(b.y0)}`} transform={`translate(${f2(b.dx)} 0)`} />
            ))}
          </g>
        ) : null}
        {hit ? (
          <g filter={`url(#${boilId})`}>
            <TwitchMarks pose={pose} color={PAL.bug} width={5.2} progress={eo(sec, BUGURU_EYECATCH_HIT_SEC, BUGURU_EYECATCH_HIT_SEC + 0.07)} />
          </g>
        ) : null}
        {/* 走査ノイズ帯：紙片ずれの上からさらに横へ飛ぶ */}
        {nb.map((b, i) => (
          <SvgSlices key={`n${i}`} bands={[b]} onlyBands>
            {renderSheet(b.y0, b.y1)}
          </SvgSlices>
        ))}
        {/* 窓の陽だまり（アイコンと同じ光） */}
        <rect x={0} y={0} width={W} height={H} fill={`url(#be-sun-${uid})`} />
      </g>
    );
  };

  /* ---- 紙帯（入り／抜け） ---- */
  let paperLayer: React.ReactNode = null;
  if (covering) {
    paperLayer = renderComposite();
  } else if (!fullyGone(sec)) {
    paperLayer = STRIP_EDGES.slice(0, -1).map((y0, i) => {
      const y1 = STRIP_EDGES[i + 1];
      const dx = stripDx(i, sec);
      if (Math.abs(dx) >= W + 60) {
        return null;
      }
      return (
        <g key={i} filter={`url(#${stripShadowId})`}>
          <SvgSlices bands={[{ y0, y1, dx }]} onlyBands>
            {renderComposite(y0, y1)}
          </SvgSlices>
        </g>
      );
    });
  }

  /* ---- 前シーンの走査ずれ（0.00〜0.12） ---- */
  const outBands: GlitchBand[] =
    sec < 0.12 ? randomBands(f + 3, f < 2 ? 2 : 3, 60, 1000, 18, 80, lerp(70, 30, ramp(sec, 0, 0.12))) : [];
  const showOutgoing = outgoing != null && sec < IN_START + 5 * IN_STEP + IN_DUR;
  const showIncoming = incoming != null && sec >= OUT_START;

  return (
    <>
      {showOutgoing ? (
        outBands.length > 0 ? <HtmlSlices bands={outBands}>{outgoing}</HtmlSlices> : <AbsoluteFill>{outgoing}</AbsoluteFill>
      ) : null}
      {showIncoming ? <AbsoluteFill>{incoming}</AbsoluteFill> : null}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <BuguruPaperFilter id={paperId} seed={9} />
          <BoilFilterDef id={boilId} seed={boilSeed} scale={4.2} freq={0.02} octaves={2} />
          <BoilFilterDef id={boil2Id} seed={boilSeed + 5} scale={6} freq={0.016} octaves={2} />
          <filter id={shadowId} x="-10%" y="-40%" width="120%" height="180%">
            <feDropShadow dx={0} dy={7} stdDeviation={5} floodColor="rgba(60, 40, 20, 0.38)" />
          </filter>
          <filter id={stripShadowId} x="-5%" y="-20%" width="110%" height="140%">
            <feDropShadow dx={0} dy={9} stdDeviation={7} floodColor="rgba(40, 28, 16, 0.42)" />
          </filter>
          <radialGradient id={`be-sun-${uid}`} cx="18%" cy="8%" r="80%">
            <stop offset="0%" stopColor="rgba(255, 226, 160, 0.26)" />
            <stop offset="60%" stopColor="rgba(255, 226, 160, 0.04)" />
            <stop offset="100%" stopColor="rgba(255, 226, 160, 0)" />
          </radialGradient>
        </defs>
        <g transform={shakeX || shakeY ? `translate(${f2(shakeX)} ${f2(shakeY)})` : undefined}>{paperLayer}</g>
      </svg>
    </>
  );
};

/* ========================================================================== */
/* 共通部品（zoom / glitch）                                                   */
/* ========================================================================== */

const CX = W / 2;
const CY = H / 2;
const HIT = BUGURU_EYECATCH_HIT_SEC;

/** 指数イーズ（k が大きいほど「一気に」動いて長く余韻を残す） */
const expoOut = (u: number, k = 10): number => (u >= 1 ? 1 : 1 - Math.pow(2, -k * clamp01(u)));
const expoIn = (u: number, k = 10): number => (u <= 0 ? 0 : Math.pow(2, k * (clamp01(u) - 1)));
/** 対数補間（ズーム倍率を知覚上等速で動かす） */
const logLerp = (a: number, b: number, k: number): number => Math.exp(lerp(Math.log(a), Math.log(b), k));

/** 画面座標で領域を固定した線ゆらぎ（カメラ拡大下でもフィルタ領域が膨らまない） */
const ScreenBoilDef: React.FC<{ id: string; seed: number; scale: number; freq: number }> = ({
  id,
  seed,
  scale,
  freq,
}) => (
  <filter id={id} filterUnits="userSpaceOnUse" x={-80} y={-80} width={W + 160} height={H + 160}>
    <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={2} seed={seed} result="n" />
    <feDisplacementMap in="SourceGraphic" in2="n" scale={scale} />
  </filter>
);

/** 版ズレ刷りのチャンネル名（色版 2 枚＋墨版）。ink=false のコマは色版だけ */
const NamePrint: React.FC<{
  pal: BuguruPalette;
  split: number;
  ink: boolean;
  pop: number;
  ghostOpacity?: number;
  inkFilter?: string;
}> = ({ pal, split, ink, pop, ghostOpacity = 0.7, inkFilter }) => {
  const text = (fill: string, accent: string) => (
    <text x={NAME_X} y={NAME_BASELINE} fontFamily={FONT_MARU} fontWeight={900} fontSize={NAME_SIZE} fill={fill}>
      <tspan fill={accent}>{BUGURU_CHANNEL_NAME.slice(0, 3)}</tspan>
      <tspan>{BUGURU_CHANNEL_NAME.slice(3)}</tspan>
    </text>
  );
  const ox = NAME_X + 410;
  const oy = NAME_BASELINE - 48;
  return (
    <g transform={`translate(${f2(ox)} ${f2(oy)}) scale(${f2(pop)}) translate(${f2(-ox)} ${f2(-oy)})`}>
      <g transform={`translate(${f2(-split)} ${f2(-split * 0.25)})`} style={{ mixBlendMode: pal.blend }} opacity={ghostOpacity}>
        {text(pal.splitA, pal.splitA)}
      </g>
      <g transform={`translate(${f2(split)} ${f2(split * 0.2)})`} style={{ mixBlendMode: pal.blend }} opacity={ghostOpacity}>
        {text(pal.splitB, pal.splitB)}
      </g>
      {ink ? <g filter={inkFilter}>{text(pal.ink, pal.bug)}</g> : null}
    </g>
  );
};

/** ブランド基準ポーズ（肩すくめ）での右目×の中心（ワールド座標）と回転角 */
const eyeAnchor = (pose: StickPose): { x: number; y: number; rot: number } => {
  const r = rig(pose);
  const rot = pose.lean + pose.head;
  const a = rot * D2R;
  const lx = 11 * pose.s;
  const ly = -4 * pose.s;
  return {
    x: r.head.x + lx * Math.cos(a) - ly * Math.sin(a),
    y: r.head.y + lx * Math.sin(a) + ly * Math.cos(a),
    rot,
  };
};

/* ========================================================================== */
/* zoom：×目ドリーアウト（明盤スケッチ）                                       */
/*  0.02〜0.085  前シーンの中央に赤マーカーの×が2画で描かれる（SE: カリカリ）      */
/*  0.08〜0.18  ×へカメラごと飛び込む（前シーンはブラーで流れ、紙へすり替わる）    */
/*  0.18〜0.40  画面いっぱいの×の超接写（紙の繊維・マーカーのにじみ・版ズレ）      */
/*  0.40        ヒット：カメラが一気に引き、×が棒人間の右目だったと分かる          */
/*  0.53        チャンネル名が版ズレで刷られる                                    */
/*  0.72〜0.795 画面全体に赤マーカーの大きな×が2画で引かれる                       */
/*  0.80〜0.95  紙が×の切り口で4片に裂け、四方へ抜けて次シーンを露出             */
/* ========================================================================== */

const ZM = {
  draw1: [0.02, 0.055] as const,
  draw2: [0.05, 0.085] as const,
  dive0: 0.08,
  dive1: 0.18,
  paper0: 0.12,
  pull1: 0.66,
  name: 0.53,
  slash1: [0.72, 0.755] as const,
  slash2: [0.75, 0.795] as const,
  split0: 0.8,
  split1: 0.95,
};
/** 描き始めの×の倍率（×が約 260px 幅で前シーンに乗る） */
const Z_START = 4.2;
/** 紙にすり替わる時点の倍率（×が画面を埋める） */
const Z_COVER = 22;
/** ヒット直前の倍率（超接写のじわ寄り終点） */
const Z_HOLD = 25;

const zoomAt = (sec: number): number => {
  if (sec < ZM.dive0) {
    return Z_START * (1 + 0.05 * eo(sec, 0, ZM.dive0));
  }
  if (sec < ZM.dive1) {
    return logLerp(Z_START * 1.05, Z_COVER, expoIn(ramp(sec, ZM.dive0, ZM.dive1), 6));
  }
  if (sec < HIT) {
    return logLerp(Z_COVER, Z_HOLD, ramp(sec, ZM.dive1, HIT));
  }
  return logLerp(Z_HOLD, 1, expoOut(ramp(sec, HIT, ZM.pull1), 7));
};

type Box = readonly [number, number, number, number];

/** ×で裂ける4片（上・右・下・左）。dir は抜ける向き、box は紙テクスチャを敷く範囲 */
const ZOOM_PIECES: readonly {
  pts: readonly (readonly [number, number])[];
  dir: readonly [number, number];
  dist: number;
  rot: number;
  box: Box;
}[] = [
  { pts: [[-60, -60], [W + 60, -60], [CX, CY]], dir: [0, -1], dist: 760, rot: -7, box: [-60, -60, W + 60, CY + 20] },
  { pts: [[W + 60, -60], [W + 60, H + 60], [CX, CY]], dir: [1, 0], dist: 1180, rot: 6, box: [CX - 20, -60, W + 60, H + 60] },
  { pts: [[W + 60, H + 60], [-60, H + 60], [CX, CY]], dir: [0, 1], dist: 760, rot: 8, box: [-60, CY - 20, W + 60, H + 60] },
  { pts: [[-60, H + 60], [-60, -60], [CX, CY]], dir: [-1, 0], dist: 1180, rot: -5, box: [-60, -60, CX + 20, H + 60] },
];

/** 画面対角に沿う手描きの大きな×（2画） */
const SLASH_PATHS = [
  `M -90 -50 Q ${CX + 26} ${CY - 34} ${W + 90} ${H + 50}`,
  `M ${W + 90} -50 Q ${CX - 22} ${CY - 30} -90 ${H + 50}`,
];

const ZoomBody: React.FC<BodyProps> = ({ sec, uid, outgoing, incoming, showName }) => {
  const f = Math.floor(sec * 30 + 1e-6);
  const hit = sec >= HIT;
  const sinceHit = sec - HIT;
  const settle = 1 - eo(sec, HIT, HIT + 0.2);

  const pose = buguruPoseAtHead(HEAD_X, HEAD_Y, S);
  const eye = eyeAnchor(pose);
  const z = zoomAt(sec);

  /* ---- カメラ：ヒットまでは右目を画面中央に固定し、引きながら本来の構図へ戻す ---- */
  const w = hit ? clamp01(Math.log(z) / Math.log(Z_HOLD)) : 1;
  const tremble = sec >= 0.3 && !hit ? 5 : 0;
  const shakeX = hit && sinceHit < 0.066 ? (rnd(f * 5 + 2) - 0.5) * 26 : (rnd(f * 7 + 3) - 0.5) * tremble;
  const shakeY = hit && sinceHit < 0.066 ? (rnd(f * 9 + 4) - 0.5) * 12 : (rnd(f * 3 + 9) - 0.5) * tremble * 0.5;
  const tx = eye.x * (1 - z) + (CX - eye.x) * w + shakeX;
  const ty = eye.y * (1 - z) + (CY - eye.y) * w + shakeY;
  const cam = `translate(${f2(tx)} ${f2(ty)}) scale(${z.toFixed(4)})`;

  /* ---- 版ズレは画面上の量で決め、ワールド量へ換算する ---- */
  const splitScreen = hit ? 10 + 34 * settle : 8;
  const bugged = hit ? 1 + 0.25 * settle : 1;
  const eyeJitter = hit && sinceHit < 0.1 ? (rnd(f * 3 + 1) - 0.5) * 8 : 0;
  const macro = clamp01((z - 1.5) / 18); // 超接写の度合い
  const boilScale = 4.2 + 10 * macro;

  const paperId = `bz-paper-${uid}`;
  const boilId = `bz-boil-${uid}`;
  const boil2Id = `bz-boil2-${uid}`;
  const grainId = `bz-grain-${uid}`;
  const shadowId = `bz-shadow-${uid}`;
  const boilSeed = 3 + Math.floor(sec * 7.5);

  const r = rig(pose);
  const R = 30 * S;
  const construction = (
    <g fill="none" stroke={PAL.graphite} strokeWidth={4 / z} strokeLinecap="round">
      <ellipse cx={r.head.x + 10} cy={r.head.y - 6} rx={R + 22} ry={R + 12} />
      <path d={`M ${f2(r.head.x - R - 40)} ${f2(r.head.y - 2)} Q ${f2(r.head.x)} ${f2(r.head.y + 18)} ${f2(r.head.x + R + 46)} ${f2(r.head.y - 8)}`} />
      <path d={`M ${f2(r.head.x + 4)} ${f2(r.head.y - R - 44)} Q ${f2(r.head.x + 26)} ${f2(r.head.y)} ${f2(r.head.x + 30)} ${f2(r.head.y + R + 30)}`} />
      <path d={`M ${f2(r.sh.x - 210)} ${f2(r.sh.y + 6)} L ${f2(r.sh.x + 216)} ${f2(r.sh.y - 4)}`} />
      <path d={`M ${NAME_X - 20} ${NAME_BASELINE + 22} L ${NAME_X + 812} ${NAME_BASELINE + 16}`} />
      <path d={`M ${NAME_X - 26} ${NAME_BASELINE - NAME_SIZE + 4} L ${NAME_X + 800} ${NAME_BASELINE - NAME_SIZE - 2}`} />
    </g>
  );

  const figure = (
    <ColorSplit
      palette={PAL}
      dx={splitScreen / z}
      dy={(splitScreen * 0.5) / z}
      opacity={0.78}
      render={(ink, ghost) => (
        <BuguruCharacter pose={pose} palette={PAL} ink={ink} ghost={ghost} bugged={bugged} eyeJitter={eyeJitter} width={9.4} />
      )}
    />
  );

  const nameSettle = 1 - eo(sec, ZM.name, ZM.name + 0.16);
  const name =
    showName && sec >= ZM.name ? (
      <NamePrint
        pal={PAL}
        split={4 + 28 * nameSettle}
        ink={sec - ZM.name >= 0.03}
        pop={1 + 0.07 * (1 - eo(sec, ZM.name + 0.03, ZM.name + 0.14))}
      />
    ) : null;

  /* ---- 画面全体の×（退場の切り口） ---- */
  const slashU = [eo(sec, ...ZM.slash1), eo(sec, ...ZM.slash2)];
  const slash =
    sec >= ZM.slash1[0] ? (
      <g fill="none" strokeLinecap="round" filter={`url(#${boilId})`}>
        {SLASH_PATHS.map((d, i) =>
          slashU[i] > 0 ? (
            <g key={i}>
              <path
                d={d}
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={1 - slashU[i]}
                stroke={PAL.splitA}
                strokeWidth={34}
                opacity={0.6}
                transform="translate(-9 -5)"
                style={{ mixBlendMode: 'multiply' }}
              />
              <path d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - slashU[i]} stroke={PAL.bug} strokeWidth={34} />
            </g>
          ) : null,
        )}
      </g>
    ) : null;

  /** 紙1枚分。紙テクスチャは画面座標の box に限定し、絵柄だけカメラで動かす */
  const renderSheet = (box: Box = [-60, -60, W + 60, H + 60]) => {
    const bw = box[2] - box[0];
    const bh = box[3] - box[1];
    return (
      <g>
        <rect x={box[0]} y={box[1]} width={bw} height={bh} fill={PAL.bg} filter={`url(#${paperId})`} />
        <g filter={`url(#${boil2Id})`}>
          <g transform={cam}>{construction}</g>
        </g>
        <g filter={`url(#${boilId})`}>
          <g transform={cam}>
            {figure}
            {hit ? <TwitchMarks pose={pose} color={PAL.bug} width={5.2} progress={eo(sec, HIT + 0.03, HIT + 0.12)} /> : null}
          </g>
        </g>
        <g transform={cam}>{name}</g>
        {/* 超接写時の紙の繊維（拡大された紙目がマーカーの上にも乗る） */}
        {macro > 0.02 ? (
          <rect x={box[0]} y={box[1]} width={bw} height={bh} fill="#000" filter={`url(#${grainId})`} opacity={macro} style={{ mixBlendMode: 'multiply' }} />
        ) : null}
        {slash}
        <rect x={box[0]} y={box[1]} width={bw} height={bh} fill={`url(#bz-sun-${uid})`} />
      </g>
    );
  };

  /* ---- ヒット直後2コマの走査ノイズ帯／保持中の微グリッチ ---- */
  const noiseBands: GlitchBand[] =
    hit && sinceHit < 0.066
      ? randomBands(f + 17, 5, 60, 1020, 16, 70, 120)
      : f === 20 || f === 21
        ? randomBands(f + 31, 3, 140, 980, 8, 24, 18)
        : [];

  let sheetLayer: React.ReactNode = null;
  if (sec >= ZM.paper0 && sec < ZM.split1) {
    if (sec < ZM.dive1) {
      // 飛び込み中は紙だけを敷く（頭の輪や左目が透けて見えると種明かしが早まるため）。×は diveX が描く
      sheetLayer = (
        <rect x={-60} y={-60} width={W + 120} height={H + 120} fill={PAL.bg} filter={`url(#${paperId})`} opacity={ramp(sec, ZM.paper0, ZM.dive1)} />
      );
    } else if (sec < ZM.split0) {
      sheetLayer = (
        <g opacity={ramp(sec, ZM.paper0, ZM.dive1)}>
          {renderSheet()}
          {noiseBands.map((b, i) => (
            <SvgSlices key={i} bands={[b]} onlyBands>
              {renderSheet([-60, b.y0 - 4, W + 60, b.y1 + 4])}
            </SvgSlices>
          ))}
        </g>
      );
    } else {
      const u = ramp(sec, ZM.split0, ZM.split1);
      const crack = 14 * eo(sec, ZM.split0, ZM.split0 + 0.04);
      const d = u * u;
      sheetLayer = ZOOM_PIECES.map((p, i) => {
        const off = crack + d * p.dist;
        const pcx = (p.pts[0][0] + p.pts[1][0] + p.pts[2][0]) / 3;
        const pcy = (p.pts[0][1] + p.pts[1][1] + p.pts[2][1]) / 3;
        return (
          <g
            key={i}
            transform={`translate(${f2(p.dir[0] * off)} ${f2(p.dir[1] * off)}) rotate(${f2(p.rot * d)} ${f2(pcx)} ${f2(pcy)})`}
            filter={`url(#${shadowId})`}
          >
            <g clipPath={`url(#bz-piece-${uid}-${i})`}>{renderSheet(p.box)}</g>
          </g>
        );
      });
    }
  }

  /* ---- 前シーン：×が描かれ、その×ごとカメラが飛び込む ---- */
  const showOutgoing = outgoing != null && sec < ZM.dive1;
  const outScale = z / Z_START;
  const outBlur = 18 * expoIn(ramp(sec, ZM.dive0, ZM.dive1), 5);
  const zs = z * S;
  const diveX =
    sec < ZM.dive1 ? (
      <g transform={`translate(${CX} ${CY}) rotate(${f2(eye.rot)}) scale(${zs.toFixed(4)})`} fill="none" strokeLinecap="round" filter={`url(#${boilId})`}>
        {[
          { c: PAL.splitA, ox: -8, oy: -4, op: 0.78, blend: true },
          { c: PAL.splitB, ox: 8, oy: 2.4, op: 0.78, blend: true },
          { c: PAL.bug, ox: 0, oy: 0, op: 1, blend: false },
        ].map((l, i) => (
          <g
            key={i}
            transform={`translate(${(l.ox / zs).toFixed(4)} ${(l.oy / zs).toFixed(4)})`}
            opacity={l.op}
            style={l.blend ? { mixBlendMode: 'multiply' } : undefined}
          >
            {[
              { d: 'M -6.2 -6.2 L 6.2 6.2', u: eo(sec, ...ZM.draw1) },
              { d: 'M 6.2 -6.2 L -6.2 6.2', u: eo(sec, ...ZM.draw2) },
            ].map((s, j) =>
              s.u > 0 ? (
                <path key={j} d={s.d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - s.u} stroke={l.c} strokeWidth={5.25} />
              ) : null,
            )}
          </g>
        ))}
      </g>
    ) : null;

  const pullBlur = hit && sinceHit > 0.02 && sec < HIT + 0.13 ? 7 * (1 - ramp(sec, HIT, HIT + 0.13)) : 0;
  const showIncoming = incoming != null && sec >= ZM.split0;

  return (
    <>
      {showOutgoing ? (
        <AbsoluteFill
          style={{
            transform: `scale(${outScale.toFixed(4)})`,
            transformOrigin: `${CX}px ${CY}px`,
            filter: outBlur > 0.3 ? `blur(${outBlur.toFixed(1)}px)` : undefined,
          }}
        >
          {outgoing}
        </AbsoluteFill>
      ) : null}
      {showIncoming ? <AbsoluteFill>{incoming}</AbsoluteFill> : null}
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ position: 'absolute', inset: 0, filter: pullBlur > 0.3 ? `blur(${pullBlur.toFixed(1)}px)` : undefined }}
      >
        <defs>
          <BuguruPaperFilter id={paperId} seed={9} />
          <ScreenBoilDef id={boilId} seed={boilSeed} scale={boilScale} freq={lerp(0.02, 0.009, macro)} />
          <ScreenBoilDef id={boil2Id} seed={boilSeed + 5} scale={6} freq={0.016} />
          <filter id={grainId} filterUnits="userSpaceOnUse" x={-60} y={-60} width={W + 120} height={H + 120}>
            <feTurbulence type="fractalNoise" baseFrequency="0.045 0.11" numOctaves={3} seed={13} result="g" />
            <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.26  0 0 0 0.5 -0.12" />
          </filter>
          <filter id={shadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx={0} dy={10} stdDeviation={9} floodColor="rgba(40, 28, 16, 0.45)" />
          </filter>
          <radialGradient id={`bz-sun-${uid}`} cx="18%" cy="8%" r="80%">
            <stop offset="0%" stopColor="rgba(255, 226, 160, 0.26)" />
            <stop offset="60%" stopColor="rgba(255, 226, 160, 0.04)" />
            <stop offset="100%" stopColor="rgba(255, 226, 160, 0)" />
          </radialGradient>
          {ZOOM_PIECES.map((p, i) => (
            <clipPath key={i} id={`bz-piece-${uid}-${i}`} clipPathUnits="userSpaceOnUse">
              <polygon points={p.pts.map(([x, y]) => `${x},${y}`).join(' ')} />
            </clipPath>
          ))}
        </defs>
        {sheetLayer}
        {diveX}
      </svg>
    </>
  );
};

/* ========================================================================== */
/* glitch：システムダウン焼き付き（暗盤 glow）                                  */
/*  0.00〜0.20  前シーンが RGB 分離・横ずれ・破損ピクセルで壊れていく（SE: ザザッ）  */
/*  0.20〜0.27  ブラウン管の電源断：上下から潰れて白い横線に                        */
/*  0.27〜0.36  横線が点に縮み、残光が消える（暗転）                               */
/*  0.40        ヒット：黒地に発光する棒人間と RGB 版ズレのチャンネル名が焼き付く    */
/*  0.72〜0.94  画面が走査線に裂け、線が中央の1本へ収束して消える → 次シーン        */
/* ========================================================================== */

const GPAL = BUGURU_PALETTE.glow;
const GL = {
  down0: 0.2,
  line: 0.27,
  dot: 0.31,
  dotEnd: 0.36,
  exit0: 0.72,
  conv0: 0.8,
  conv1: 0.88,
  lineEnd: 0.94,
};
const SCAN_N = 16;
const SCAN_H = H / SCAN_N;

/** アイコン案A と同じ「頭頂・顎下・腕・胴」4本のスライス（頭中心からの相対・S=5.5 基準） */
const GLOW_BANDS: readonly GlitchBand[] = [
  { y0: -156, y1: -106, dx: 46 },
  { y0: 94, y1: 128, dx: -40 },
  { y0: 248, y1: 284, dx: 30 },
  { y0: 420, y1: 448, dx: -24 },
].map((b) => ({ y0: HEAD_Y + b.y0 * K, y1: HEAD_Y + b.y1 * K, dx: b.dx * K }));

const GlitchBody: React.FC<BodyProps> = ({ sec, uid, outgoing, incoming, showName }) => {
  const f = Math.floor(sec * 30 + 1e-6);
  const hit = sec >= HIT;
  const sinceHit = sec - HIT;
  const settle = 1 - eo(sec, HIT, HIT + 0.22);

  const rOnlyId = `bg-r-${uid}`;
  const gbOnlyId = `bg-gb-${uid}`;
  const glowId = `bg-glow-${uid}`;
  const bugGlowId = `bg-bugglow-${uid}`;
  const lineGlowId = `bg-lglow-${uid}`;
  const boilId = `bg-boil-${uid}`;
  const scanClipId = `bg-scan-${uid}`;

  /* ---- 前シーンの破壊（0.00〜0.20）→ 電源断（0.20〜0.31） ---- */
  const breakU = ramp(sec, 0, GL.down0);
  const rgb = lerp(4, 30, breakU) * (0.7 + 0.6 * rnd(f * 13 + 1));
  const yj = (rnd(f * 7 + 5) - 0.5) * lerp(2, 10, breakU);
  const outBands = sec < GL.down0 ? randomBands(f + 41, f < 3 ? 2 : 4, 40, 1020, 10, 70, lerp(40, 130, breakU)) : [];
  const flicker = f === 3 ? 1.5 : f === 5 ? 0.55 : 1;
  const uDown = ramp(sec, GL.down0, GL.line);
  const uLine = ramp(sec, GL.line, GL.dot);
  const sy = sec < GL.down0 ? 1 : lerp(1, 0.004, uDown * uDown);
  const sx = sec < GL.line ? 1 : lerp(1, 0.003, uLine * uLine);
  const bright = flicker * (1 + 3 * uDown);
  const crtOn = sec < GL.dot;

  const pixelCount = Math.round(lerp(3, 46, ramp(sec, 0.03, GL.down0)));
  const breaking =
    sec < GL.line ? (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        {/* 走査ずれの色帯 */}
        {outBands.map((b, i) => (
          <rect key={i} x={0} y={b.y0} width={W} height={3} fill={i % 2 ? GPAL.splitA : GPAL.splitB} opacity={0.8} />
        ))}
        {/* 破損ピクセル（色ブロック＋死んだ黒ブロック） */}
        <GlitchBlocks
          seed={f * 3 + 7}
          count={pixelCount}
          x0={0}
          y0={0}
          x1={W - 60}
          y1={H - 20}
          colors={[GPAL.splitA, GPAL.splitB, GPAL.ink, '#000000', '#000000']}
          minSize={lerp(6, 18, breakU)}
          maxSize={lerp(20, 64, breakU)}
        />
      </svg>
    ) : null;

  const outgoingLayer = crtOn ? (
    <AbsoluteFill
      style={{
        transform: `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`,
        transformOrigin: `${CX}px ${CY}px`,
        filter: bright !== 1 ? `brightness(${bright.toFixed(2)})` : undefined,
      }}
    >
      {outgoing != null ? (
        <>
          <AbsoluteFill style={{ backgroundColor: '#000' }} />
          <AbsoluteFill style={{ filter: `url(#${rOnlyId})`, transform: `translate(${f2(-rgb)}px, ${f2(yj)}px)` }}>{outgoing}</AbsoluteFill>
          <AbsoluteFill style={{ filter: `url(#${gbOnlyId})`, transform: `translate(${f2(rgb)}px, ${f2(-yj)}px)`, mixBlendMode: 'screen' }}>
            {outgoing}
          </AbsoluteFill>
          {outBands.map((b, i) => (
            <AbsoluteFill
              key={i}
              style={{ clipPath: `inset(${f2(b.y0)}px 0px ${f2(H - b.y1)}px 0px)`, transform: `translateX(${f2(b.dx)}px)` }}
            >
              {outgoing}
            </AbsoluteFill>
          ))}
        </>
      ) : null}
      {breaking}
    </AbsoluteFill>
  ) : null;

  /* 電源断の黒：中央に潰れていく窓だけ残す（下地がある場合は窓から前シーン静止画が見える） */
  const hw = (W * sx) / 2;
  const hh = (H * sy) / 2;
  const blackPanel =
    sec >= GL.down0 && sec < HIT + 0.034 ? (
      <path
        d={
          crtOn
            ? `M -20 -20 H ${W + 20} V ${H + 20} H -20 Z M ${f2(CX - hw)} ${f2(CY - hh)} V ${f2(CY + hh)} H ${f2(CX + hw)} V ${f2(CY - hh)} Z`
            : `M -20 -20 H ${W + 20} V ${H + 20} H -20 Z`
        }
        fill="#000"
        fillRule="evenodd"
      />
    ) : null;
  const crtLine =
    sec >= GL.line - 0.02 && sec < GL.dot ? (
      <rect
        x={f2(CX - hw)}
        y={f2(CY - Math.max(2, hh))}
        width={f2(hw * 2)}
        height={f2(Math.max(4, hh * 2))}
        fill={GPAL.ink}
        filter={`url(#${lineGlowId})`}
      />
    ) : null;
  const crtDot =
    sec >= GL.dot && sec < GL.dotEnd ? (
      <circle
        cx={CX}
        cy={CY}
        r={f2(lerp(7, 2, ramp(sec, GL.dot, GL.dotEnd)))}
        fill={GPAL.ink}
        opacity={1 - ramp(sec, GL.dot, GL.dotEnd)}
        filter={`url(#${lineGlowId})`}
      />
    ) : null;

  /* ---- 焼き付き（0.40〜） ---- */
  const pose = buguruPoseAtHead(HEAD_X, HEAD_Y, S);
  const r = rig(pose);
  const burn = 1 + 1.8 * (1 - eo(sec, HIT, HIT + 0.18));
  const micro = f === 19 || f === 20 || f === 23;
  const splitDx = 12 + 42 * settle + (micro ? 14 : 0);
  const bands: GlitchBand[] = GLOW_BANDS.map((b) => ({ ...b, dx: b.dx * (1 + 1.8 * settle) }));
  const eyeJitter = hit && sinceHit < 0.1 ? (rnd(f * 3 + 1) - 0.5) * 8 : 0;
  const preBurn = f === 11; // ヒット直前1コマだけ残像がちらつく

  const figure = (ghostOnly = false) => (
    <ColorSplit
      palette={GPAL}
      dx={splitDx}
      dy={2 + 6 * settle}
      opacity={0.92}
      render={(ink, ghost) =>
        ghostOnly && !ghost ? null : (
          <BuguruCharacter
            pose={pose}
            palette={GPAL}
            ink={ink}
            ghost={ghost}
            bugged={1 + 0.25 * settle}
            eyeJitter={eyeJitter}
            bugFilter={`url(#${bugGlowId})`}
            width={9.4}
          />
        )
      }
    />
  );

  const name = showName ? (
    <NamePrint
      pal={GPAL}
      split={6 + 34 * settle + (micro ? 10 : 0)}
      ink={sinceHit >= 0.03}
      pop={1 + 0.06 * (1 - eo(sec, HIT + 0.03, HIT + 0.14))}
      ghostOpacity={0.9}
      inkFilter={`url(#${glowId})`}
    />
  ) : null;

  const blockSeed = f <= 13 || micro ? f : 7;
  const inkLayer = (
    <g>
      <GlitchBlocks
        seed={blockSeed * 5 + 3}
        count={hit && sinceHit < 0.066 ? 16 : 7}
        x0={HEAD_X + 120}
        y0={bands[0].y0}
        x1={HEAD_X + 380}
        y1={bands[0].y1}
        colors={[GPAL.splitA, GPAL.splitB, 'rgba(243,239,230,0.85)']}
        minSize={10}
        maxSize={34}
        opacity={0.85}
      />
      <GlitchBlocks
        seed={blockSeed * 7 + 11}
        count={hit && sinceHit < 0.066 ? 14 : 6}
        x0={HEAD_X - 380}
        y0={bands[1].y0}
        x1={HEAD_X - 140}
        y1={bands[1].y1}
        colors={[GPAL.splitA, GPAL.splitB, 'rgba(243,239,230,0.85)']}
        minSize={10}
        maxSize={30}
        opacity={0.8}
      />
      <g filter={`url(#${glowId})`}>
        <g filter={`url(#${boilId})`}>
          <SvgSlices bands={bands}>{figure()}</SvgSlices>
        </g>
      </g>
      <g filter={`url(#${bugGlowId})`}>
        <TwitchMarks pose={pose} color={GPAL.bug} width={5.2} progress={eo(sec, HIT, HIT + 0.07)} />
      </g>
      {name}
      {/* スライス境界のシアン／マゼンタ走査線 */}
      <g style={{ mixBlendMode: 'screen' }} opacity={0.9}>
        <rect x={HEAD_X - 300} y={bands[0].y0} width={620} height={4} fill={GPAL.splitA} />
        <rect x={HEAD_X - 360} y={bands[1].y1 - 4} width={440} height={4} fill={GPAL.splitB} />
        <rect x={HEAD_X - 40} y={bands[2].y1 - 3} width={420} height={3} fill={GPAL.splitA} />
      </g>
    </g>
  );

  const noiseBands: GlitchBand[] =
    hit && sinceHit < 0.066 ? randomBands(f + 11, 5, 120, 1000, 14, 60, 110) : micro ? randomBands(f + 29, 3, 160, 960, 8, 26, 22) : [];

  /* ---- 退場：走査線へ裂けて中央へ収束 ---- */
  const exiting = sec >= GL.exit0;
  const scan = Array.from({ length: SCAN_N }, (_, i) => {
    const yc = (i + 0.5) * SCAN_H;
    const far = Math.abs(yc - CY) / CY; // 外側ほど先に閉じる
    const t0 = GL.exit0 + (1 - far) * 0.05;
    const u = ramp(sec, t0, t0 + 0.075);
    return { yc, h: SCAN_H * Math.pow(1 - u, 1.4), u };
  });
  const conv = expoIn(ramp(sec, GL.conv0, GL.conv1), 5);
  const lineFade = 1 - ramp(sec, GL.conv1 + 0.02, GL.lineEnd);
  const lineW = W * (1 - eo(sec, GL.conv1 - 0.02, GL.lineEnd));

  const burnLayer =
    hit && sec < GL.conv1 ? (
      <g clipPath={exiting ? `url(#${scanClipId})` : undefined}>
        <rect x={0} y={0} width={W} height={H} fill={`url(#bg-bg-${uid})`} />
        <g opacity={eo(sec, HIT, HIT + 0.14)}>
          <path
            d={`M ${HEAD_X - 160} -20 L ${HEAD_X + 160} -20 L ${HEAD_X + 560} ${H + 20} L ${HEAD_X - 560} ${H + 20} Z`}
            fill={`url(#bg-beam-${uid})`}
          />
          <circle cx={r.head.x} cy={r.head.y + 60} r={520} fill={`url(#bg-halo-${uid})`} />
        </g>
        {inkLayer}
        {noiseBands.map((b, i) => (
          <SvgSlices key={i} bands={[b]} onlyBands>
            <rect x={-200} y={b.y0} width={W + 400} height={b.y1 - b.y0} fill="#050506" />
            {inkLayer}
          </SvgSlices>
        ))}
        <rect x={0} y={0} width={W} height={H} fill={`url(#bg-scanp-${uid})`} />
        <rect x={0} y={0} width={W} height={H} fill={`url(#bg-vig-${uid})`} />
        {/* 焼き付きの白飛び（ヒット1コマ目） */}
        {sinceHit < 0.034 ? (
          <rect x={0} y={0} width={W} height={H} fill="rgba(210, 250, 255, 0.22)" style={{ mixBlendMode: 'screen' }} />
        ) : null}
      </g>
    ) : null;

  const scanLines = exiting ? (
    <g filter={`url(#${lineGlowId})`} opacity={lineFade}>
      {scan.map((s, i) =>
        s.u > 0.05 ? (
          <rect
            key={i}
            x={f2(CX - lineW / 2)}
            y={f2(lerp(s.yc, CY, conv) - 1.5)}
            width={f2(lineW)}
            height={3}
            fill={i % 2 ? GPAL.splitA : GPAL.splitB}
            opacity={Math.min(1, s.u * 1.6) * (conv > 0.9 ? 0.4 : 1)}
          />
        ) : null,
      )}
      {conv > 0.6 ? <rect x={f2(CX - lineW / 2)} y={CY - 2} width={f2(lineW)} height={4} fill={GPAL.ink} /> : null}
    </g>
  ) : null;

  const showIncoming = incoming != null && sec >= GL.exit0;

  return (
    <>
      {/* HTML 前シーン用の RGB チャンネル分離フィルタ */}
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <defs>
          <filter id={rOnlyId} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
          </filter>
          <filter id={gbOnlyId} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>
      {showIncoming ? <AbsoluteFill>{incoming}</AbsoluteFill> : null}
      {outgoingLayer}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <BuguruGlowFilter id={glowId} std={10} strength={burn} />
          <BuguruGlowFilter id={bugGlowId} std={7} strength={1.4 * burn} />
          <BuguruGlowFilter id={lineGlowId} std={6} strength={1.6} />
          <BoilFilterDef id={boilId} seed={5 + Math.floor(sec * 7.5)} scale={3.2} freq={0.018} octaves={2} />
          <radialGradient id={`bg-bg-${uid}`} cx="34%" cy="40%" r="78%">
            <stop offset="0%" stopColor="#1B1C21" />
            <stop offset="48%" stopColor="#0A0A0C" />
            <stop offset="100%" stopColor="#020202" />
          </radialGradient>
          <linearGradient id={`bg-beam-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255, 238, 205, 0.18)" />
            <stop offset="70%" stopColor="rgba(255, 238, 205, 0.05)" />
            <stop offset="100%" stopColor="rgba(255, 238, 205, 0)" />
          </linearGradient>
          <radialGradient id={`bg-halo-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(34, 228, 255, 0.18)" />
            <stop offset="55%" stopColor="rgba(34, 228, 255, 0.05)" />
            <stop offset="100%" stopColor="rgba(34, 228, 255, 0)" />
          </radialGradient>
          <radialGradient id={`bg-vig-${uid}`} cx="50%" cy="48%" r="70%">
            <stop offset="60%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.7)" />
          </radialGradient>
          <pattern id={`bg-scanp-${uid}`} width={8} height={6} patternUnits="userSpaceOnUse">
            <rect x={0} y={0} width={8} height={2} fill="rgba(255,255,255,0.045)" />
          </pattern>
          <clipPath id={scanClipId} clipPathUnits="userSpaceOnUse">
            {scan.map((s, i) => (s.h > 0.3 ? <rect key={i} x={-20} y={f2(s.yc - s.h / 2)} width={W + 40} height={f2(s.h)} /> : null))}
          </clipPath>
        </defs>
        {blackPanel}
        {crtLine}
        {crtDot}
        {/* 暗転中：走査線の地紋とヒット直前の残像 */}
        {sec >= GL.dot && !hit ? <rect x={0} y={0} width={W} height={H} fill={`url(#bg-scanp-${uid})`} /> : null}
        {preBurn ? <g opacity={0.2}>{figure(true)}</g> : null}
        {burnLayer}
        {scanLines}
      </svg>
    </>
  );
};

/* ========================================================================== */
/* 公開コンポーネント                                                          */
/* ========================================================================== */

const VARIANT_BODY: Record<BuguruEyecatchVariant, React.FC<BodyProps>> = {
  strips: StripsBody,
  zoom: ZoomBody,
  glitch: GlitchBody,
};

/**
 * 「バグる棒人間」1.0 秒アイキャッチ（1920×1080・30fps 想定・variant 別 SE 同梱）。
 * 本編の場面転換でもそのまま再利用できるキャラ連動トランジション。
 */
export const BuguruEyecatch: React.FC<BuguruEyecatchProps> = ({
  variant = BUGURU_EYECATCH_DEFAULT_VARIANT,
  outgoing,
  incoming,
  showName = true,
  withSfx = true,
  sfxVolume = 1,
  backdropColor,
  sec: secOverride,
  durationSec = BUGURU_EYECATCH_DURATION_SEC,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fontsReady = useStickmanCollageFonts();
  const uid = sanitizeSvgId(useId());
  const rawSec = secOverride ?? frame / fps;
  const visualDur = Math.max(0.1, durationSec);
  const showVisual = rawSec >= 0 && rawSec < visualDur;
  const normalizedSec = showVisual ? (rawSec / visualDur) * BUGURU_EYECATCH_DURATION_SEC : 0;
  const Body = VARIANT_BODY[variant];
  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity: fontsReady ? 1 : 0.999 }}>
      {withSfx ? <Audio src={staticFile(buguruEyecatchSfxPath(variant))} volume={sfxVolume} /> : null}
      {showVisual && backdropColor ? <AbsoluteFill style={{ backgroundColor: backdropColor }} /> : null}
      {showVisual ? (
        <Body sec={normalizedSec} uid={uid} outgoing={outgoing} incoming={incoming} showName={showName} />
      ) : null}
    </AbsoluteFill>
  );
};
