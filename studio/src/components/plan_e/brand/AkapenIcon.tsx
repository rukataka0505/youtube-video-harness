import React from 'react';
import { AKAPEN, AkapenFilterDefs, RedPenGlyph, akapenFilterIds } from './akapenInk';

/**
 * ch2「経済の赤ペン」公式チャンネルアイコン（viewBox 1024 正方、要素は内接円 r≈420 内に収める）。
 * - penArticle（公式採用・案C2）: 暗い机 × 斜めの生成り記事片 × 墨の見出し帯に赤の二重下線 × 赤ペン本体
 */
export type AkapenIconVariant = 'penArticle';

export const AKAPEN_ICON_DEFAULT_VARIANT: AkapenIconVariant = 'penArticle';
export const AKAPEN_ICON_VARIANTS: readonly AkapenIconVariant[] = ['penArticle'];

export const AKAPEN_ICON_LABELS: Record<AkapenIconVariant, string> = {
  penArticle: '記事×赤二重線',
};

export const AKAPEN_ICON_SIZE = 1024;

export interface AkapenIconProps {
  /** 既定: 'penArticle'（公式採用・案C2） */
  variant?: AkapenIconVariant;
  /** 描画ピクセル（ベクタのまま縮小するので 48px でも実寸の見え方になる） */
  size?: number;
  /** 同一画面に複数並べるときの SVG id 衝突回避 */
  idPrefix?: string;
  /** YouTube の円形トリミングで切り抜く */
  circle?: boolean;
  /** 円形トリミング位置の補助線（制作確認用） */
  showCircleGuide?: boolean;
}

const C = 512;

const DeskGround: React.FC<{ grain: string; lamp?: string }> = ({ grain, lamp = '255, 214, 160' }) => (
  <>
    <defs>
      <radialGradient id={`${grain}-desk`} cx="44%" cy="38%" r="72%">
        <stop offset="0%" stopColor="#2B241D" />
        <stop offset="55%" stopColor={AKAPEN.desk} />
        <stop offset="100%" stopColor={AKAPEN.deskDeep} />
      </radialGradient>
      <radialGradient id={`${grain}-lamp`} cx="38%" cy="30%" r="50%">
        <stop offset="0%" stopColor={`rgba(${lamp}, 0.10)`} />
        <stop offset="100%" stopColor={`rgba(${lamp}, 0)`} />
      </radialGradient>
    </defs>
    <rect width="1024" height="1024" fill={`url(#${grain}-desk)`} />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <path
        key={i}
        d={`M -20 ${130 + i * 160} C 300 ${100 + i * 170}, 700 ${170 + i * 150}, 1050 ${120 + i * 165}`}
        stroke="rgba(0,0,0,0.22)"
        strokeWidth={3}
        fill="none"
      />
    ))}
    <rect width="1024" height="1024" fill={`url(#${grain}-lamp)`} />
    <rect width="1024" height="1024" filter={`url(#${grain})`} opacity={0.5} />
  </>
);

/** 机に置いた資料片（新聞紙寄りの生成り色） */
const PaperSlip: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  grain: string;
  children?: React.ReactNode;
}> = ({ x, y, w, h, rot, grain, children }) => {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`}>
      <rect x={x} y={y} width={w} height={h} fill="rgba(0,0,0,0.5)" transform="translate(14 18)" />
      <rect x={x} y={y} width={w} height={h} fill="#E4DED1" />
      <rect x={x} y={y} width={w} height={h} filter={`url(#${grain})`} opacity={0.28} />
      {children}
    </g>
  );
};

const PenArticle: React.FC<{ ids: ReturnType<typeof akapenFilterIds> }> = ({ ids }) => {
  const u1 = 'M 196 456 C 330 440, 520 436, 690 446';
  const u2 = 'M 230 532 C 380 520, 540 516, 668 524';
  return (
    <>
      <DeskGround grain={ids.grain} />
      <PaperSlip x={140} y={196} w={700} h={620} rot={-6} grain={ids.grain}>
        {/* 見出し 2 段（太い墨の帯） */}
        <rect x={192} y={252} width={540} height={74} fill={AKAPEN.ink} />
        <rect x={192} y={342} width={392} height={74} fill={AKAPEN.ink} />
        {/* 本文の行（極小では面としてだけ残る） */}
        <g fill={AKAPEN.ink} opacity={0.3}>
          {Array.from({ length: 6 }, (_, i) => (
            <React.Fragment key={i}>
              <rect x={192} y={574 + i * 36} width={286 - ((i * 41) % 70)} height={16} />
              <rect x={504} y={574 + i * 36} width={276 - ((i * 59) % 90)} height={16} />
            </React.Fragment>
          ))}
        </g>
        <g filter={`url(#${ids.marker})`}>
          <path d={u1} fill="none" stroke={AKAPEN.red} strokeWidth={60} strokeLinecap="round" />
          <path d={u2} fill="none" stroke={AKAPEN.red} strokeWidth={60} strokeLinecap="round" />
        </g>
        <g transform={`translate(668 524) rotate(${48 + 6})`}>
          <RedPenGlyph length={600} thick={118} />
        </g>
      </PaperSlip>
    </>
  );
};

export const AkapenIcon: React.FC<AkapenIconProps> = ({
  variant = AKAPEN_ICON_DEFAULT_VARIANT,
  size = AKAPEN_ICON_SIZE,
  idPrefix = `akapen-${variant}`,
  circle = false,
  showCircleGuide = false,
}) => {
  const ids = akapenFilterIds(idPrefix);
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" style={{ display: 'block' }}>
      <AkapenFilterDefs prefix={idPrefix} />
      <defs>
        <clipPath id={`${idPrefix}-circle`}>
          <circle cx={C} cy={C} r={512} />
        </clipPath>
      </defs>
      <g clipPath={circle ? `url(#${idPrefix}-circle)` : undefined}>
        <PenArticle ids={ids} />
      </g>
      {showCircleGuide ? (
        <circle cx={C} cy={C} r={510} fill="none" stroke="#00B4D8" strokeWidth={4} strokeDasharray="18 12" />
      ) : null}
    </svg>
  );
};
