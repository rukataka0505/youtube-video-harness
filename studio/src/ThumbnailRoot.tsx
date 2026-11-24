import React from 'react';
import { Still } from 'remotion';
import { THUMBNAIL_SPEC } from './theme/tokens';
import type { ThumbnailComparisonSheetProps } from './components/thumbnails';
import {
  DEFAULT_STICKMAN_COLLAGE_THUMBNAIL_SPEC,
  ThumbnailFeedComparisonSheet,
} from './templates/thumbnails';

type ComparisonSheetStillProps = ThumbnailComparisonSheetProps & Record<string, unknown>;

const ComparisonSheetStill: React.FC<ComparisonSheetStillProps> = (props) => (
  <ThumbnailFeedComparisonSheet {...props} />
);

/**
 * サムネイル v2（固い床 × 自由舞台 <Still> TSX）登録ルート。
 *
 * - 共通比較シート: ThumbnailFeedComparisonSheet (2560x1600)
 * - 個別エピソード専用自由舞台 <Still> (論理 1920x1080 → 書き出し時 scale=2 で 3840x2160 4K PNG)
 *   studio/src/compositions/episodes/<slugCamel>/thumbnails/ 配下（.gitignore 対象）に作成し、
 *   命名規約 `Thumb-<EpisodePascal>-<A|B|C>` でここへ登録して書き出す。
 */
export const ThumbnailStills: React.FC = () => {
  return (
    <>
      {/* 共通インフラ：YouTube ホーム（ダーク）＋関連動画（ライト/ダーク 168x94 実寸）模擬比較シート */}
      <Still
        id="ThumbnailFeedComparisonSheet"
        component={ComparisonSheetStill}
        width={THUMBNAIL_SPEC.comparisonSheetWidth}
        height={THUMBNAIL_SPEC.comparisonSheetHeight}
        defaultProps={{
          spec: DEFAULT_STICKMAN_COLLAGE_THUMBNAIL_SPEC,
        }}
      />
    </>
  );
};
