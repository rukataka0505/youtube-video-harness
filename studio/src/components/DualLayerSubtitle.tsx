import React from 'react';
import { FormatPalette, TYPOGRAPHY_SCALE } from '../theme/tokens';

export interface DualLayerSubtitleProps {
  /** 中央〜上部の図解連動キーワード（48〜64px） */
  emphasisHeadline?: string;
  /** 下段ベース字幕 1行目（14〜16文字目安） */
  baseSubtitleLine1?: string;
  /** 下段ベース字幕 2行目（最大2行まで） */
  baseSubtitleLine2?: string;
  palette: FormatPalette;
}

/**
 * 日本市場向け「2層テロップ」コンポーネント。
 * 中央の強調キーワードと下段の常時ベース字幕を明確に分離し、過剰装飾を防ぐ。
 */
export const DualLayerSubtitle: React.FC<DualLayerSubtitleProps> = ({
  emphasisHeadline,
  baseSubtitleLine1,
  baseSubtitleLine2,
  palette,
}) => {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      {/* 上〜中央：強調キーワード層 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          paddingInline: 48,
        }}
      >
        {emphasisHeadline ? (
          <h1
            style={{
              margin: 0,
              color: palette.textPrimary,
              fontSize: TYPOGRAPHY_SCALE.headlinePx,
              fontWeight: 800,
              lineHeight: 1.3,
              letterSpacing: '0.03em',
            }}
          >
            {emphasisHeadline}
          </h1>
        ) : null}
      </div>

      {/* 下段：常時ベース字幕層（背景処理は薄帯1種のみ） */}
      {baseSubtitleLine1 || baseSubtitleLine2 ? (
        <div
          style={{
            marginBottom: 12,
            backgroundColor: 'rgba(9, 13, 22, 0.85)',
            padding: '12px 28px',
            borderRadius: 10,
            textAlign: 'center',
            maxWidth: '82%',
          }}
        >
          {baseSubtitleLine1 ? (
            <div
              style={{
                color: palette.textPrimary,
                fontSize: TYPOGRAPHY_SCALE.subtitlePx,
                fontWeight: 700,
                lineHeight: 1.45,
              }}
            >
              {baseSubtitleLine1}
            </div>
          ) : null}
          {baseSubtitleLine2 ? (
            <div
              style={{
                color: palette.textPrimary,
                fontSize: TYPOGRAPHY_SCALE.subtitlePx,
                fontWeight: 700,
                lineHeight: 1.45,
              }}
            >
              {baseSubtitleLine2}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
