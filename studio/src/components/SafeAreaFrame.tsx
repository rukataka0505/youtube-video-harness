import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TYPOGRAPHY_SCALE, VIDEO_SPEC } from '../theme/tokens';

export interface SafeAreaFrameProps {
  children: React.ReactNode;
  backgroundColor?: string;
  /** @deprecated 現行共通方針では出典・クレジットは概要欄のみに集約するため通常は未指定（レガシー互換用） */
  citationText?: string;
  /** 開発時の90%セーフゾーン可視化ガイド表示 */
  showGuideBorder?: boolean;
}

/**
 * CTVオーバースキャン対策の内側90%セーフゾーンを標準化するラッパー（出典クレジットは原則概要欄集約・特例互換の citationText のみ任意対応）。
 */
export const SafeAreaFrame: React.FC<SafeAreaFrameProps> = ({
  children,
  backgroundColor = '#0F172A',
  citationText,
  showGuideBorder = false,
}) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        paddingLeft: VIDEO_SPEC.safeMarginX,
        paddingRight: VIDEO_SPEC.safeMarginX,
        paddingTop: VIDEO_SPEC.safeMarginY,
        paddingBottom: VIDEO_SPEC.safeMarginY,
        fontFamily: TYPOGRAPHY_SCALE.fontFamily,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          border: showGuideBorder ? '1px dashed rgba(255,255,255,0.25)' : 'none',
          boxSizing: 'border-box',
        }}
      >
        {children}

        {citationText ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.82)',
              color: '#CBD5E1',
              fontSize: TYPOGRAPHY_SCALE.citationPx,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              maxWidth: '55%',
              lineHeight: 1.4,
            }}
          >
            {citationText}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
