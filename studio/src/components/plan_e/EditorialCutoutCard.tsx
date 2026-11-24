import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { SUBTITLE_SAFE_BOTTOM } from './constants';
import { RgbGlitchBurst } from './RgbGlitchBurst';
import { FONT_ECON_MONO, FONT_ECON_SANS, FONT_ECON_SERIF } from './fonts';

export interface EditorialCutoutCardProps {
  /** 左上の黒帯バッジ（例: 「急募」「計画案 ①」「号外」） */
  badge?: string;
  /** バッジ右横の補助ラベル（例: 「三行広告 | 国家プロジェクト」） */
  kicker?: string;
  /** 主見出し（明朝体・太字） */
  headline: string;
  /** 強調行（任意・赤または黒の数値・対比など） */
  highlightLine?: string;
  /** 補足1〜2行（箇条書き禁止・短文のみ） */
  footnote?: string;
  /** 押印スタンプ（例: 「却下」「無罪」「失敗」） */
  stampText?: string;
  /** スタンプ押印のローカルフレーム（startSec未指定または相対値） */
  stampAtFrame?: number;
  /** 出現ローカルフレーム */
  enterAtFrame?: number;
  /** ステージ開始時刻（グローバル秒・startSec基準でのオフセット解決用） */
  startSec?: number;
  /** startSec からの出現遅延秒（指定時は enterAtFrame より優先） */
  enterOffsetSec?: number;
  /** startSec からの押印遅延秒（指定時は stampAtFrame より優先） */
  stampOffsetSec?: number;
  /** 紙破りポリゴン形状シード */
  tornSeed?: number;
  /** 出現方向 */
  enterFrom?: 'drop' | 'left' | 'right';
  /** カードの傾き角度（deg） */
  rotateDeg?: number;
  /** 幅（px） */
  width?: number;
  /** 任意の位置スタイル */
  style?: React.CSSProperties;
}

const TORN_CLIPS = [
  'polygon(0% 1.2%, 4% 0%, 9% 1.4%, 15% 0.2%, 22% 1.3%, 30% 0%, 38% 1.1%, 47% 0.2%, 55% 1.4%, 64% 0%, 73% 1.2%, 82% 0.3%, 91% 1.3%, 97% 0%, 100% 1.2%, 99.6% 98.8%, 95% 100%, 88% 98.7%, 80% 100%, 71% 98.9%, 62% 100%, 53% 98.7%, 44% 100%, 35% 98.8%, 26% 100%, 17% 98.7%, 9% 100%, 2% 98.8%, 0% 99.6%)',
  'polygon(0% 0.6%, 6% 1.5%, 13% 0%, 20% 1.2%, 28% 0.3%, 36% 1.5%, 45% 0%, 54% 1.1%, 63% 0.2%, 71% 1.4%, 80% 0%, 89% 1.3%, 96% 0.2%, 100% 0.9%, 99.7% 99.1%, 93% 98.6%, 85% 100%, 76% 98.8%, 68% 100%, 58% 98.6%, 49% 100%, 40% 98.7%, 31% 100%, 22% 98.5%, 13% 100%, 5% 98.8%, 0% 99.4%)',
  'polygon(0% 1.4%, 5% 0.1%, 11% 1.1%, 19% 0%, 27% 1.4%, 35% 0.2%, 43% 1.2%, 52% 0%, 60% 1.3%, 69% 0.1%, 78% 1.4%, 87% 0.2%, 94% 1.2%, 100% 0.4%, 99.5% 98.5%, 94% 100%, 86% 98.8%, 77% 100%, 67% 98.6%, 57% 100%, 47% 98.9%, 38% 100%, 28% 98.7%, 18% 100%, 10% 98.6%, 3% 100%, 0% 99.0%)',
] as const;

function resolveMedia(src: string): string {
  if (/^(https?:\/\/|data:|blob:|\/)/.test(src)) {
    return src;
  }
  return staticFile(src);
}

function resolveCardTimingFrames(
  card: Pick<EditorialCutoutCardProps, 'startSec' | 'enterOffsetSec' | 'stampOffsetSec' | 'enterAtFrame' | 'stampAtFrame'>,
  fps: number,
  defaultEnterOffsetSec = 0,
): { enterFrame: number; stampFrame: number } {
  const baseSec = card.startSec ?? 0;
  const enterFrame =
    card.enterOffsetSec !== undefined
      ? Math.round((baseSec + card.enterOffsetSec) * fps)
      : card.enterAtFrame !== undefined
        ? Math.round(baseSec * fps) + card.enterAtFrame
        : Math.round((baseSec + defaultEnterOffsetSec) * fps);

  const stampFrame =
    card.stampOffsetSec !== undefined
      ? Math.round((baseSec + card.stampOffsetSec) * fps)
      : card.stampAtFrame !== undefined
        ? Math.round(baseSec * fps) + card.stampAtFrame
        : enterFrame + Math.round(0.6 * fps);

  return { enterFrame, stampFrame };
}

/**
 * 案E v2.1 標準コンポーネント（ABテスト v3 勝因昇格）:
 * ダークブルー角丸カード（AI Slop）を置き換える、物理紙面・三行広告・号外切り抜きカード＋赤判子スタンプ。
 * 実写Bロール上または紙面/コルクボード背景上に配置し、画面内「お説教ポエム見出し」ではなく実体ある紙面オブジェクトとして機能させる。
 */
export const EditorialCutoutCard: React.FC<EditorialCutoutCardProps> = ({
  badge,
  kicker,
  headline,
  highlightLine,
  footnote,
  stampText,
  stampAtFrame,
  enterAtFrame,
  startSec = 0,
  enterOffsetSec,
  stampOffsetSec,
  tornSeed = 0,
  enterFrom = 'drop',
  rotateDeg = -1.6,
  width = 760,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { enterFrame, stampFrame } = resolveCardTimingFrames(
    { startSec, enterOffsetSec, stampOffsetSec, enterAtFrame, stampAtFrame },
    fps,
    0,
  );

  const localEnterFrame = Math.max(0, frame - enterFrame);
  const enterSpr = spring({
    frame: localEnterFrame,
    fps,
    config: { stiffness: 320, damping: 24, mass: 0.72 },
  });
  const isEntered = frame >= enterFrame;
  const enterOpacity = isEntered
    ? interpolate(enterSpr, [0, 0.25, 1], [0, 1, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  const enterX =
    enterFrom === 'left'
      ? interpolate(enterSpr, [0, 1], [-120, 0])
      : enterFrom === 'right'
        ? interpolate(enterSpr, [0, 1], [120, 0])
        : 0;
  const enterY =
    enterFrom === 'drop'
      ? interpolate(enterSpr, [0, 1], [-36, 0])
      : interpolate(enterSpr, [0, 1], [18, 0]);
  const enterScale =
    enterFrom === 'drop'
      ? interpolate(enterSpr, [0, 1], [1.08, 1])
      : interpolate(enterSpr, [0, 1], [0.97, 1]);

  const stampActive = Boolean(stampText) && frame >= stampFrame;
  const stampSpr = spring({
    frame: Math.max(0, frame - stampFrame),
    fps,
    config: { stiffness: 520, damping: 18, mass: 0.55 },
  });
  const stampScale = interpolate(stampSpr, [0, 1], [2.4, 1]);
  const stampOpacity = stampActive ? interpolate(stampSpr, [0, 0.2, 1], [0, 0.92, 0.88]) : 0;

  const tornClip = TORN_CLIPS[Math.abs(Math.floor(tornSeed)) % TORN_CLIPS.length];

  return (
    <div
      style={{
        position: 'relative',
        width,
        opacity: enterOpacity,
        transform: `translate(${enterX}px, ${enterY}px) scale(${enterScale}) rotate(${rotateDeg}deg)`,
        filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.42))',
        ...style,
      }}
    >
      <div
        style={{
          backgroundColor: '#F6F2E9',
          backgroundImage:
            'radial-gradient(rgba(22,19,15,0.055) 1px, transparent 0), linear-gradient(180deg, #F8F4EC 0%, #EFE8D8 100%)',
          backgroundSize: '12px 12px, 100% 100%',
          clipPath: tornClip,
          padding: '32px 38px 34px',
          color: '#16130F',
          border: '1px solid rgba(22,19,15,0.14)',
        }}
      >
        {(badge || kicker) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              paddingBottom: 14,
              marginBottom: 18,
              borderBottom: '3px solid #16130F',
            }}
          >
            {badge && (
              <span
                style={{
                  backgroundColor: '#16130F',
                  color: '#F6F2E9',
                  fontFamily: FONT_ECON_SANS,
                  fontWeight: 900,
                  fontSize: 26,
                  padding: '4px 16px',
                  letterSpacing: '0.12em',
                  flexShrink: 0,
                }}
              >
                {badge}
              </span>
            )}
            {kicker && (
              <span
                style={{
                  fontFamily: FONT_ECON_MONO,
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#4A4238',
                  letterSpacing: '0.06em',
                }}
              >
                {kicker}
              </span>
            )}
          </div>
        )}

        <div
          style={{
            fontFamily: FONT_ECON_SERIF,
            fontWeight: 900,
            fontSize: width <= 600 ? 40 : 48,
            lineHeight: 1.24,
            color: '#16130F',
            whiteSpace: 'pre-line',
          }}
        >
          {headline}
        </div>

        {highlightLine && (
          <div
            style={{
              marginTop: 16,
              fontFamily: FONT_ECON_MONO,
              fontWeight: 900,
              fontSize: width <= 600 ? 36 : 42,
              color: '#CC0000',
              letterSpacing: '0.02em',
              whiteSpace: 'pre-line',
            }}
          >
            {highlightLine}
          </div>
        )}

        {footnote && (
          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px dashed rgba(22,19,15,0.35)',
              fontFamily: FONT_ECON_SANS,
              fontSize: 21,
              fontWeight: 600,
              color: '#4A4238',
              lineHeight: 1.45,
              whiteSpace: 'pre-line',
            }}
          >
            {footnote}
          </div>
        )}
      </div>

      {stampText && (
        <div
          style={{
            position: 'absolute',
            right: 28,
            bottom: 22,
            opacity: stampOpacity,
            transform: `scale(${stampScale}) rotate(-11deg)`,
            border: '7px solid #CC0000',
            borderRadius: 6,
            padding: '6px 22px',
            color: '#CC0000',
            fontFamily: FONT_ECON_SERIF,
            fontWeight: 900,
            fontSize: width <= 600 ? 46 : 56,
            letterSpacing: '0.18em',
            backgroundColor: 'rgba(246, 242, 233, 0.78)',
            boxShadow: 'inset 0 0 0 2px rgba(204,0,0,0.4)',
            pointerEvents: 'none',
          }}
        >
          {stampText}
        </div>
      )}
    </div>
  );
};

export interface CorkboardBackdropProps {
  children: React.ReactNode;
  /** 上部赤紐の装飾を表示するか */
  showRedString?: boolean;
  /** 画鋲と赤糸を張る座標リスト（1920x1080座標系） */
  pins?: readonly [number, number][];
}

/**
 * 案E v2.1 標準背景（ABテスト v3 勝因昇格）:
 * ダークブルー一辺倒を避け、調査ボード・容疑者比較・風刺コラージュで明確な背景極性切替を作るコルクボード背景。
 */
export const CorkboardBackdrop: React.FC<CorkboardBackdropProps> = ({
  children,
  showRedString = true,
  pins,
}) => {
  const effectivePins: readonly [number, number][] =
    pins && pins.length > 0 ? pins : [[520, 98], [1400, 98]];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#7C542F',
        backgroundImage:
          'radial-gradient(rgba(36,20,8,0.28) 1.5px, transparent 0), radial-gradient(rgba(255,224,185,0.14) 1px, transparent 0), radial-gradient(circle at 50% 42%, rgba(255,214,165,0.18) 0%, rgba(45,25,10,0.52) 100%)',
        backgroundSize: '18px 18px, 11px 11px, 100% 100%',
        backgroundPosition: '0 0, 5px 5px, 0 0',
      }}
    >
      {(showRedString || (pins && pins.length > 0)) && (
        <svg
          width={1920}
          height={1080}
          viewBox="0 0 1920 1080"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}
        >
          {showRedString &&
            effectivePins.length >= 2 &&
            effectivePins.slice(0, -1).map((p0, idx) => {
              const p1 = effectivePins[idx + 1];
              const mx = (p0[0] + p1[0]) / 2;
              const my = (p0[1] + p1[1]) / 2 + 52;
              return (
                <path
                  key={`str-${idx}`}
                  d={`M ${p0[0]} ${p0[1]} Q ${mx} ${my} ${p1[0]} ${p1[1]}`}
                  fill="none"
                  stroke="#CC0000"
                  strokeWidth={4.5}
                  strokeLinecap="round"
                  opacity={0.88}
                />
              );
            })}
          {effectivePins.map(([px, py], idx) => (
            <g key={`pin-${idx}`}>
              <circle cx={px} cy={py + 4} r={14} fill="rgba(0,0,0,0.32)" />
              <circle cx={px} cy={py} r={13} fill="#DC2626" stroke="#7F1D1D" strokeWidth={3} />
              <circle cx={px - 4} cy={py - 4} r={3.5} fill="#FCA5A5" />
            </g>
          ))}
        </svg>
      )}
      {children}
    </AbsoluteFill>
  );
};

export interface EditorialPaperBackdropProps {
  children: React.ReactNode;
  mastheadTitle?: string;
  mastheadSubtitle?: string;
}

/**
 * 新聞号外・公的紙面の明るさ極性を作るオフホワイト紙面背景。
 */
export const EditorialPaperBackdrop: React.FC<EditorialPaperBackdropProps> = ({
  children,
  mastheadTitle,
  mastheadSubtitle,
}) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#FAF8F3',
        backgroundImage:
          'radial-gradient(rgba(17, 24, 39, 0.045) 1px, transparent 0), linear-gradient(180deg, #FCFBF7 0%, #F2ECE0 100%)',
        backgroundSize: '14px 14px, 100% 100%',
      }}
    >
      {(mastheadTitle || mastheadSubtitle) && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            left: 96,
            right: 96,
            paddingBottom: 12,
            borderTop: '4px solid #16130F',
            borderBottom: '2px solid #16130F',
            boxShadow: '0 4px 0 -2px #FAF8F3, 0 5px 0 0 #16130F',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            paddingTop: 10,
            zIndex: 8,
          }}
        >
          <span
            style={{
              fontFamily: FONT_ECON_SERIF,
              fontWeight: 900,
              fontSize: 30,
              color: '#16130F',
              letterSpacing: '0.08em',
            }}
          >
            {mastheadTitle ?? ''}
          </span>
          {mastheadSubtitle && (
            <span
              style={{
                fontFamily: FONT_ECON_MONO,
                fontWeight: 700,
                fontSize: 18,
                color: '#57534E',
                letterSpacing: '0.08em',
              }}
            >
              {mastheadSubtitle}
            </span>
          )}
        </div>
      )}
      {children}
    </AbsoluteFill>
  );
};

export interface EditorialCutoutStageProps {
  startSec?: number;
  endSec?: number;
  backdrop: 'broll' | 'paper' | 'corkboard';
  cards: readonly EditorialCutoutCardProps[];
  backgroundVideoSrc?: string;
  backgroundImageSrc?: string;
  mastheadTitle?: string;
  mastheadSubtitle?: string;
  showRedString?: boolean;
  pins?: readonly [number, number][];
  glitchIntroSec?: number;
  impactShake?: boolean;
}

/**
 * 案E v2.1 宣言的紙面切り抜きステージ。
 * broll（三行広告重ね） / paper（新聞号外紙面） / corkboard（赤紐×判子比較ボード）を統一扱う。
 */
export const EditorialCutoutStage: React.FC<EditorialCutoutStageProps> = ({
  startSec = 0,
  endSec,
  backdrop,
  cards,
  backgroundVideoSrc,
  backgroundImageSrc,
  mastheadTitle,
  mastheadSubtitle,
  showRedString = true,
  pins,
  glitchIntroSec = 0,
  impactShake = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const resolvedEndSec = endSec ?? durationInFrames / fps;
  const seqFrom = Math.max(0, Math.floor(startSec * fps));
  const seqDur = Math.max(2, Math.ceil((resolvedEndSec - startSec) * fps) + 4);

  // カード叩きつけ / 赤判子押印タイミングでの微振動
  let shakeX = 0;
  let shakeY = 0;
  if (impactShake) {
    for (let idx = 0; idx < cards.length; idx++) {
      const c = cards[idx];
      const { enterFrame, stampFrame } = resolveCardTimingFrames(
        {
          startSec: c.startSec ?? startSec,
          enterOffsetSec: c.enterOffsetSec,
          stampOffsetSec: c.stampOffsetSec,
          enterAtFrame: c.enterAtFrame,
          stampAtFrame: c.stampAtFrame,
        },
        fps,
        idx * 0.55,
      );
      const de = frame - enterFrame;
      if (de >= 0 && de < 5) {
        shakeX += Math.sin(de * 2.5) * (5 - de) * 1.1;
        shakeY += Math.cos(de * 3.1) * (5 - de) * 0.7;
      }
      if (c.stampText) {
        const ds = frame - stampFrame;
        if (ds >= 0 && ds < 6) {
          shakeX += Math.sin(ds * 2.8) * (6 - ds) * 1.4;
          shakeY += Math.cos(ds * 3.4) * (6 - ds) * 1.0;
        }
      }
    }
  }

  const defaultCardWidth = cards.length <= 1 ? 820 : cards.length === 2 ? 710 : 510;
  const topPad = mastheadTitle || mastheadSubtitle ? 132 : 78;

  const contentLayer = (
    <div
      style={{
        position: 'absolute',
        top: topPad,
        left: 96,
        right: 96,
        bottom: SUBTITLE_SAFE_BOTTOM,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: cards.length >= 3 ? 28 : 48,
        transform: `translate(${shakeX.toFixed(1)}px, ${shakeY.toFixed(1)}px)`,
        zIndex: 15,
      }}
    >
      {cards.map((card, idx) => (
        <EditorialCutoutCard
          key={idx}
          {...card}
          startSec={card.startSec ?? startSec}
          enterOffsetSec={
            card.enterOffsetSec !== undefined
              ? card.enterOffsetSec
              : card.enterAtFrame !== undefined
                ? undefined
                : idx * 0.55
          }
          tornSeed={card.tornSeed ?? idx}
          rotateDeg={card.rotateDeg ?? (cards.length > 1 ? (idx % 2 === 0 ? -1.8 : 1.5) : -1.2)}
          width={card.width ?? defaultCardWidth}
        />
      ))}
    </div>
  );

  if (backdrop === 'corkboard') {
    return (
      <CorkboardBackdrop showRedString={showRedString} pins={pins}>
        {contentLayer}
        {glitchIntroSec > 0 && <RgbGlitchBurst startSec={startSec} durationSec={glitchIntroSec} />}
      </CorkboardBackdrop>
    );
  }

  if (backdrop === 'paper') {
    return (
      <EditorialPaperBackdrop mastheadTitle={mastheadTitle} mastheadSubtitle={mastheadSubtitle}>
        {contentLayer}
        {glitchIntroSec > 0 && <RgbGlitchBurst startSec={startSec} durationSec={glitchIntroSec} />}
      </EditorialPaperBackdrop>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0E1116', overflow: 'hidden' }}>
      {backgroundVideoSrc ? (
        <Sequence from={seqFrom} durationInFrames={seqDur} layout="none">
          <OffthreadVideo
            src={resolveMedia(backgroundVideoSrc)}
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Sequence>
      ) : backgroundImageSrc ? (
        <Img
          src={resolveMedia(backgroundImageSrc)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 86% 80% at 50% 45%, rgba(8,10,14,0.34) 0%, rgba(8,10,14,0.74) 100%)',
        }}
      />
      {contentLayer}
      {glitchIntroSec > 0 && <RgbGlitchBurst startSec={startSec} durationSec={glitchIntroSec} />}
    </AbsoluteFill>
  );
};
