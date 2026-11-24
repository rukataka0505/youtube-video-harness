import React, { useId } from 'react';
import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { useBoilSeed, type StagePolarity } from '../../../../components/stickman_collage';

/**
 * v2_opus「生きた背景」— 檻ではなくスタジオ。
 *
 * 主役（棒人間・小道具・字幕）より常に2段階以上弱いコントラストで、
 * 「撮影スタジオの空気」「製図台の紙」「ノートの紙面」を常時わずかに動かす。
 *
 * - black          : 暗いスタジオ。ゆっくり呼吸するキーライト＋光の中だけ見える浮遊チリ（3層パララックス）
 *                    ＋ショットごとに拭き直される黒板の消し跡＋7.5fps フィルムグレイン＋床のライト溜まり。
 * - grid_paper     : 製図用方眼（細目28px／太目140px の2段グリッド）＋紙繊維＋卓上ランプの暖光スウェイ
 *                    ＋ショット頭に鉛筆の補助線が引かれ、セーフ枠四隅にトンボ（スタジオの目印）。
 * - cream_notebook : インディゴ罫線＋赤マージン二重線＋綴じ穴＋うっすらコーヒー染み＋微小カメラ揺れ。
 */
export interface OpusBackgroundProps {
  polarity: StagePolarity;
  enterSec: number;
  sec: number;
}

const W = 1920;
const H = 1080;

/** 決定論的ハッシュ乱数（0..1） */
const rand = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};

const DUST = Array.from({ length: 46 }, (_, i) => {
  const z = 0.25 + rand(i + 1) * 0.75; // 奥行き（大きいほど手前）
  return {
    i,
    z,
    x0: rand(i + 101) * W,
    y0: rand(i + 211) * H,
    r: 0.9 + z * 2.1,
    rise: 5 + z * 13, // px/s 上昇
    swayAmp: 6 + rand(i + 307) * 16,
    swayFreq: 0.12 + rand(i + 401) * 0.22,
    phase: rand(i + 503) * Math.PI * 2,
    twinkle: 0.6 + rand(i + 601) * 1.4,
  };
});

const CRUMBS = Array.from({ length: 9 }, (_, i) => ({
  x: 1500 + rand(i + 900) * 300,
  y: 760 + rand(i + 950) * 110,
  rot: rand(i + 990) * 180,
  s: 0.6 + rand(i + 1010) * 0.8,
}));

const sid = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, '');

/* ------------------------------------------------------------------ */
/* black : 暗いスタジオ                                                */
/* ------------------------------------------------------------------ */

const StudioBlack: React.FC<{ sec: number; since: number; shotSeed: number }> = ({ sec, since, shotSeed }) => {
  const grainSeed = useBoilSeed(7.5, 24);
  const uid = sid(useId());

  // キーライト：ゆっくり漂い、呼吸する。ショット頭は 0.35s だけ「点灯し直す」わずかな揺らぎ。
  const lx = 50 + Math.sin(sec * 0.21) * 4.2;
  const ly = 36 + Math.cos(sec * 0.17) * 3.0;
  const warmUp = since < 0.35 ? 0.82 + 0.18 * (since / 0.35) + Math.sin(since * 60) * 0.03 : 1;
  const breathe = (0.36 + Math.sin(sec * 0.85) * 0.035) * warmUp;

  const lightPx = { x: (lx / 100) * W, y: (ly / 100) * H };

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', overflow: 'hidden' }}>
      {/* 背景の壁：ごくわずかに暖色の黒 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 78% at ${lx.toFixed(2)}% ${ly.toFixed(2)}%, rgba(58, 52, 44, ${breathe.toFixed(3)}) 0%, rgba(22, 20, 18, ${(breathe * 0.55).toFixed(3)}) 46%, rgba(0, 0, 0, 0) 82%)`,
        }}
      />
      {/* 床のライト溜まり（スタジオの床＝ホリゾント感） */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 46% 9% at ${(lx + 1.5).toFixed(2)}% 84%, rgba(92, 84, 70, ${(breathe * 0.32).toFixed(3)}) 0%, rgba(0, 0, 0, 0) 100%)`,
        }}
      />

      {/* 黒板の消し跡：ショットごとに拭き直される低周波スマッジ（静止） */}
      <svg
        viewBox="0 0 480 270"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.055, mixBlendMode: 'screen' }}
      >
        <defs>
          <filter id={`ob-smudge-${uid}`} x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.0065 0.018" numOctaves={3} seed={shotSeed} result="n" />
            <feColorMatrix
              in="n"
              type="matrix"
              values="0 0 0 0 0.93  0 0 0 0 0.91  0 0 0 0 0.86  0 0 0 2.4 -1.05"
            />
          </filter>
        </defs>
        <rect width={480} height={270} filter={`url(#ob-smudge-${uid})`} />
      </svg>

      {/* 浮遊チリ：キーライトの中だけ見える（3層パララックス相当の速度差） */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {DUST.map((d) => {
          const y = ((((d.y0 - sec * d.rise) % H) + H) % H);
          const x = d.x0 + Math.sin(sec * d.swayFreq * Math.PI * 2 * 0.25 + d.phase) * d.swayAmp;
          const dx = (x - lightPx.x) / (W * 0.42);
          const dy = (y - lightPx.y) / (H * 0.55);
          const inLight = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
          const tw = 0.75 + 0.25 * Math.sin(sec * d.twinkle + d.phase);
          const op = (0.025 + inLight * inLight * 0.2) * d.z * tw * warmUp;
          if (op < 0.008) {
            return null;
          }
          return <circle key={d.i} cx={x} cy={y} r={d.r} fill="#F2EAD8" opacity={op} />;
        })}
      </svg>

      {/* 7.5fps フィルムグレイン */}
      <svg
        viewBox="0 0 320 180"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.07, mixBlendMode: 'screen' }}
      >
        <defs>
          <filter id={`ob-grain-${uid}`} x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.86" numOctaves={2} seed={grainSeed} result="g" />
            <feColorMatrix type="saturate" values="0" in="g" />
          </filter>
        </defs>
        <rect width={320} height={180} filter={`url(#ob-grain-${uid})`} />
      </svg>

      {/* 周辺減光 */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 96% 92% at 50% 46%, rgba(0, 0, 0, 0) 58%, rgba(0, 0, 0, 0.62) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* grid_paper : 製図台                                                 */
/* ------------------------------------------------------------------ */

const DraftingGrid: React.FC<{ sec: number; since: number; ty: number; shotSeed: number }> = ({
  sec,
  since,
  ty,
  shotSeed,
}) => {
  const grainSeed = useBoilSeed(7.5, 24);
  const uid = sid(useId());
  const panX = sec * 3.2;
  const panY = sec * 1.4;
  const lampX = 14 + Math.sin(sec * 0.23) * 2.5;
  const lampY = -4 + Math.cos(sec * 0.19) * 2.0;

  // ショット頭に引かれる鉛筆の補助線（2本・ショットごとに位置が変わる）
  const guides = [0, 1].map((g) => {
    const r1 = rand(shotSeed * 7 + g * 13);
    const r2 = rand(shotSeed * 11 + g * 17);
    const horizontal = g === 0;
    const p = interpolate(since, [0.15 + g * 0.35, 1.25 + g * 0.35], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const d = horizontal
      ? `M -40 ${150 + r1 * 560} Q ${W / 2} ${150 + r1 * 560 + (r2 - 0.5) * 30} ${W + 40} ${150 + r1 * 560 + (r2 - 0.5) * 14}`
      : `M ${260 + r1 * 1400} -40 Q ${260 + r1 * 1400 + (r2 - 0.5) * 40} ${H / 2} ${260 + r1 * 1400 + (r2 - 0.5) * 60} ${H + 40}`;
    return { d, p, key: g };
  });

  const corner = (x: number, y: number, sx: number, sy: number, key: string) => (
    <path
      key={key}
      d={`M ${x + sx * 34} ${y} L ${x} ${y} L ${x} ${y + sy * 34} M ${x - sx * 12} ${y} L ${x - sx * 4} ${y} M ${x} ${y - sy * 12} L ${x} ${y - sy * 4}`}
      stroke="rgba(28, 25, 23, 0.2)"
      strokeWidth={1.6}
      fill="none"
      strokeLinecap="round"
    />
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#F4F5F7', overflow: 'hidden' }}>
      {/* 2段グリッド（細目＋太目）を同期パン */}
      <AbsoluteFill
        style={{
          backgroundImage: [
            'linear-gradient(to right, rgba(44, 78, 128, 0.135) 1.4px, transparent 1.4px)',
            'linear-gradient(to bottom, rgba(44, 78, 128, 0.135) 1.4px, transparent 1.4px)',
            'linear-gradient(to right, rgba(44, 78, 128, 0.06) 1px, transparent 1px)',
            'linear-gradient(to bottom, rgba(44, 78, 128, 0.06) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '140px 140px, 140px 140px, 28px 28px, 28px 28px',
          backgroundPosition: `${panX.toFixed(2)}px ${panY.toFixed(2)}px`,
          transform: `translateY(${ty.toFixed(2)}px)`,
        }}
      />

      {/* 紙繊維（静止・異方性ノイズ） */}
      <svg
        viewBox="0 0 480 270"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.06, mixBlendMode: 'multiply' }}
      >
        <defs>
          <filter id={`og-fiber-${uid}`} x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018 0.42" numOctaves={2} seed={7} result="f" />
            <feColorMatrix type="saturate" values="0" in="f" />
          </filter>
        </defs>
        <rect width={480} height={270} filter={`url(#og-fiber-${uid})`} />
      </svg>

      {/* 7.5fps 紙目ボイル */}
      <svg
        viewBox="0 0 320 180"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04, mixBlendMode: 'multiply' }}
      >
        <defs>
          <filter id={`og-grain-${uid}`} x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves={2} seed={grainSeed} result="p" />
            <feColorMatrix type="saturate" values="0" in="p" />
          </filter>
        </defs>
        <rect width={320} height={180} filter={`url(#og-grain-${uid})`} />
      </svg>

      {/* 鉛筆の補助線・トンボ・消しゴムカス */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: `translateY(${ty.toFixed(2)}px)` }}
      >
        {guides.map((g) =>
          g.p > 0 ? (
            <path
              key={g.key}
              d={g.d}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - g.p}
              stroke="rgba(28, 25, 23, 0.1)"
              strokeWidth={1.8}
              fill="none"
              strokeLinecap="round"
            />
          ) : null,
        )}
        {corner(96, 54, 1, 1, 'tl')}
        {corner(W - 96, 54, -1, 1, 'tr')}
        {corner(96, 890, 1, -1, 'bl')}
        {corner(W - 96, 890, -1, -1, 'br')}
        {CRUMBS.map((c, i) => (
          <path
            key={i}
            d="M -5 0 C -3 -3, 2 -3, 5 -1 C 4 2, -2 3, -5 0 Z"
            transform={`translate(${c.x} ${c.y}) rotate(${c.rot}) scale(${c.s})`}
            fill="rgba(120, 112, 104, 0.18)"
          />
        ))}
      </svg>

      {/* 卓上ランプの暖光（左上からゆっくりスウェイ） */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 80% at ${lampX.toFixed(2)}% ${lampY.toFixed(2)}%, rgba(255, 226, 170, 0.16) 0%, rgba(255, 226, 170, 0) 70%)`,
          mixBlendMode: 'multiply',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 94% 92% at 50% 48%, rgba(244, 245, 247, 0) 62%, rgba(70, 60, 46, 0.11) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* cream_notebook : ノート紙面                                         */
/* ------------------------------------------------------------------ */

const NotebookPage: React.FC<{ sec: number; ty: number }> = ({ sec, ty }) => {
  const grainSeed = useBoilSeed(7.5, 24);
  const uid = sid(useId());
  const swayX = Math.sin(sec * 0.47) * 2.6;
  const swayY = Math.cos(sec * 0.39) * 2.0 + ty;
  const rot = Math.sin(sec * 0.31) * 0.08;

  return (
    <AbsoluteFill style={{ backgroundColor: '#FAF8F3', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translate(${swayX.toFixed(2)}px, ${swayY.toFixed(2)}px) rotate(${rot.toFixed(3)}deg)`,
          transformOrigin: '50% 50%',
        }}
      >
        <AbsoluteFill
          style={{
            top: -30,
            bottom: -30,
            backgroundImage: 'linear-gradient(to bottom, transparent 43px, rgba(45, 78, 138, 0.14) 44px)',
            backgroundSize: '100% 44px',
            backgroundPosition: '0px 18px',
          }}
        />
        <svg
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
        >
          {/* 赤マージン二重線（わずかに手引きの揺れ） */}
          <path d={`M 150 -30 Q 151.5 ${H / 2} 150 ${H + 30}`} stroke="rgba(185, 38, 34, 0.32)" strokeWidth={2.4} fill="none" />
          <path d={`M 157 -30 Q 158 ${H / 2} 157.5 ${H + 30}`} stroke="rgba(185, 38, 34, 0.2)" strokeWidth={1.6} fill="none" />
          {/* 綴じ穴 */}
          {[200, 540, 880].map((y) => (
            <g key={y}>
              <circle cx={52} cy={y} r={17} fill="rgba(60, 50, 38, 0.16)" />
              <circle cx={53} cy={y + 1.5} r={14} fill="rgba(30, 24, 18, 0.1)" />
            </g>
          ))}
          {/* うっすらコーヒー染み */}
          <path
            d="M 1716 742 C 1786 736, 1836 780, 1830 838 C 1824 894, 1766 922, 1710 910 C 1652 898, 1626 846, 1640 800 C 1652 764, 1680 746, 1716 742 Z"
            fill="none"
            stroke="rgba(120, 82, 40, 0.07)"
            strokeWidth={9}
          />
          <path
            d="M 1722 752 C 1782 750, 1822 786, 1818 836"
            fill="none"
            stroke="rgba(120, 82, 40, 0.06)"
            strokeWidth={4}
          />
        </svg>
      </AbsoluteFill>

      <svg
        viewBox="0 0 320 180"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.05, mixBlendMode: 'multiply' }}
      >
        <defs>
          <filter id={`on-grain-${uid}`} x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.66" numOctaves={2} seed={grainSeed} result="p" />
            <feColorMatrix type="saturate" values="0" in="p" />
          </filter>
        </defs>
        <rect width={320} height={180} filter={`url(#on-grain-${uid})`} />
      </svg>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 72% 80% at ${(16 + Math.sin(sec * 0.2) * 2).toFixed(2)}% -6%, rgba(255, 222, 160, 0.14) 0%, rgba(255, 222, 160, 0) 70%)`,
          mixBlendMode: 'multiply',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 92% 90% at 50% 50%, rgba(250, 248, 243, 0) 62%, rgba(92, 74, 48, 0.11) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

export const OpusBackground: React.FC<OpusBackgroundProps> = ({ polarity, enterSec, sec }) => {
  const { fps } = useVideoConfig();
  const since = Math.max(0, sec - enterSec);
  const shotSeed = 1 + (Math.round(enterSec * 10) % 97);
  const sp = spring({ frame: since * fps, fps, config: { stiffness: 520, damping: 26, mass: 0.6 } });
  const ty = interpolate(sp, [0, 1], [-10, 0]);

  if (polarity === 'grid_paper') {
    return <DraftingGrid sec={sec} since={since} ty={ty} shotSeed={shotSeed} />;
  }
  if (polarity === 'cream_notebook') {
    return <NotebookPage sec={sec} ty={ty} />;
  }
  return <StudioBlack sec={sec} since={since} shotSeed={shotSeed} />;
};
