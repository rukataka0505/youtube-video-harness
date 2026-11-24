import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { FONT_SANS } from '../../components/common/fonts';
import {
  TRIGGER_LABELS_JA,
  calcZenkakuLength,
  resolveThumbnailMediaSrc,
  useThumbnailFonts,
} from '../../components/thumbnails';
import type {
  CompetitorMockCard,
  ThumbnailComparisonSheetProps,
  ThumbnailVariantSpec,
} from '../../components/thumbnails';

/**
 * 自由舞台 <Still> の実書き出し PNG を表示するプレビュー枠。
 * variantImageUrls が未提供（Remotion Studio 直接閲覧時など）の場合は、
 * Spec の配色・コピー・compositionId を示すフォールバックカードを描画する。
 */
const VariantImagePreview: React.FC<{
  variant: ThumbnailVariantSpec;
  imageUrl?: string;
  width: number;
  height: number;
  blurPx?: number;
}> = ({ variant, imageUrl, width, height, blurPx = 0 }) => {
  if (imageUrl) {
    return (
      <div
        style={{
          position: 'relative',
          width,
          height,
          overflow: 'hidden',
          backgroundColor: variant.colors.background ?? '#0B0F17',
          flexShrink: 0,
        }}
      >
        <Img
          src={imageUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
          }}
        />
      </div>
    );
  }

  const isSmall = width < 220;
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        backgroundColor: variant.colors.background ?? '#0F172A',
        color: variant.colors.primaryText,
        padding: isSmall ? '8px 10px' : '18px 22px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: isSmall ? 2 : 6 }}>
        {variant.copyLines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: isSmall ? 15 : 32,
              fontWeight: 900,
              lineHeight: 1.15,
              color: i === variant.accentLineIndex ? variant.colors.emphasisText : variant.colors.primaryText,
            }}
          >
            {line}
          </div>
        ))}
      </div>
      <div
        style={{
          fontSize: isSmall ? 9 : 13,
          color: variant.colors.emphasisText,
          opacity: 0.9,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        Still: {variant.compositionId}
      </div>
    </div>
  );
};

const CompetitorThumbnailThumb: React.FC<{
  comp: CompetitorMockCard;
  width: number;
  height: number;
}> = ({ comp, width, height }) => {
  const imgUrl = resolveThumbnailMediaSrc(comp.imageSrc);
  const bg = comp.bgColor ?? '#1F2937';
  const accent = comp.accentColor ?? '#F59E0B';
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        backgroundColor: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: width < 200 ? 6 : 16,
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {imgUrl ? (
        <Img
          src={imgUrl}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.45,
          }}
        />
      ) : null}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          color: '#FFFFFF',
          fontSize: width < 200 ? 13 : 28,
          fontWeight: 900,
          textAlign: 'center',
          lineHeight: 1.25,
          textShadow: '0 2px 8px rgba(0,0,0,0.9)',
          borderLeft: `${width < 200 ? 3 : 6}px solid ${accent}`,
          paddingLeft: width < 200 ? 6 : 12,
        }}
      >
        {comp.thumbnailLabel ?? comp.title.slice(0, 14)}
      </div>
    </div>
  );
};

interface FeedItem {
  kind: 'ours' | 'competitor';
  variant?: ThumbnailVariantSpec;
  competitor?: CompetitorMockCard;
}

const RelatedSidebarColumn: React.FC<{
  mode: 'light' | 'dark';
  items: FeedItem[];
  videoTitle: string;
  channelName: string;
  videoDurationText: string;
  variantImageUrls?: Record<string, string>;
}> = ({ mode, items, videoTitle, channelName, videoDurationText, variantImageUrls }) => {
  const isLight = mode === 'light';
  return (
    <div
      style={{
        backgroundColor: isLight ? '#FFFFFF' : '#0F0F0F',
        color: isLight ? '#0F0F0F' : '#F1F1F1',
        border: isLight ? '1px solid #CBD5E1' : '1px solid #27272A',
        borderRadius: 14,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <div style={{ fontSize: 17, fontWeight: 900 }}>
          関連動画（{isLight ? 'ライト' : 'ダーク'}・168×94 実寸）
        </div>
        <div style={{ fontSize: 12, color: isLight ? '#606060' : '#94A3B8' }}>
          {isLight ? '白背景での縁抜け確認' : '暗背景での視認性確認'}
        </div>
      </div>

      {items.map((item, idx) => {
        const isOurs = item.kind === 'ours' && item.variant;
        const titleText = isOurs ? videoTitle : item.competitor?.title ?? '';
        const chText = isOurs ? channelName : item.competitor?.channelName ?? '';
        const durText = isOurs ? videoDurationText : item.competitor?.durationText ?? '15:00';
        return (
          <div
            key={`${mode}-rel-${idx}`}
            style={{
              display: 'flex',
              gap: 10,
              padding: 5,
              borderRadius: 9,
              backgroundColor: isOurs ? (isLight ? '#EFF6FF' : 'rgba(56, 189, 248, 0.10)') : 'transparent',
              border: isOurs
                ? isLight
                  ? '1px solid #93C5FD'
                  : '1px solid rgba(56, 189, 248, 0.4)'
                : '1px solid transparent',
            }}
          >
            <div style={{ position: 'relative', width: 168, height: 94, borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
              {isOurs && item.variant ? (
                <VariantImagePreview
                  variant={item.variant}
                  imageUrl={variantImageUrls?.[item.variant.variantId]}
                  width={168}
                  height={94}
                />
              ) : item.competitor ? (
                <CompetitorThumbnailThumb comp={item.competitor} width={168} height={94} />
              ) : null}
              <div
                style={{
                  position: 'absolute',
                  right: 4,
                  bottom: 4,
                  backgroundColor: 'rgba(0,0,0,0.86)',
                  color: '#FFFFFF',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1px 4px',
                  borderRadius: 3,
                }}
              >
                {durText}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center', minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: isLight ? '#0F0F0F' : '#F1F1F1',
                  lineHeight: 1.28,
                  maxHeight: 54,
                  overflow: 'hidden',
                }}
              >
                {isOurs ? `[${item.variant?.label ?? item.variant?.variantId}] ` : ''}
                {titleText}
              </div>
              <div style={{ fontSize: 12, color: isLight ? '#606060' : '#AAAAAA' }}>
                {chText} ・ {isOurs ? 'テスト候補' : item.competitor?.viewsText}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * 2560x1600 v2 共通 YouTube模擬比較シート（ホーム[ダーク] ＋ 関連動画[ライト/ダーク 168x94実寸] ＋ 細目スクイント＆機械監査）。
 * 各エピソードの自由舞台 <Still> が書き出した実PNG（variantImageUrls）をそのまま埋め込んで比較する。
 */
export const ThumbnailFeedComparisonSheet: React.FC<ThumbnailComparisonSheetProps> = ({
  spec,
  validationSummary,
  variantImageUrls,
}) => {
  useThumbnailFonts();

  const titleZenkaku = validationSummary?.titleZenkakuLength ?? calcZenkakuLength(spec.videoTitle);
  const experimentText =
    validationSummary?.recommendedExperimentMethod ??
    (spec.workflow.dailyImpressionsTier === 'over_1000'
      ? '日次インプ1,000回以上：公式 Test & Compare（大差2〜3案）推奨'
      : '日次インプ1,000回未満：投稿タブ画像アンケート ＋ 7日順次スワップ推奨');

  // ホームフィード模擬用6枠（自案と競合を交互配置して視覚埋没をチェック）
  const homeFeedItems: FeedItem[] = [];
  const maxLen = Math.max(spec.variants.length, spec.competitors.length);
  for (let i = 0; i < maxLen && homeFeedItems.length < 6; i++) {
    if (spec.variants[i] && homeFeedItems.length < 6) {
      homeFeedItems.push({ kind: 'ours', variant: spec.variants[i] });
    }
    if (spec.competitors[i] && homeFeedItems.length < 6) {
      homeFeedItems.push({ kind: 'competitor', competitor: spec.competitors[i] });
    }
  }

  // 関連動画サイドバー用4枠（自案全案＋先頭競合1案）
  const sidebarItems: FeedItem[] = [
    ...spec.variants.slice(0, 3).map((v): FeedItem => ({ kind: 'ours', variant: v })),
    ...(spec.competitors[0] ? [{ kind: 'competitor' as const, competitor: spec.competitors[0] }] : []),
  ].slice(0, 4);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0B0F17',
        color: '#F8FAFC',
        fontFamily: FONT_SANS,
        padding: '22px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxSizing: 'border-box',
      }}
    >
      {/* 1. 監査ヘッダー */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#111827',
          border: '1px solid #334155',
          borderRadius: 14,
          padding: '14px 22px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 1660 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, color: '#94A3B8' }}>
            <span
              style={{
                backgroundColor: '#1E293B',
                color: '#38BDF8',
                padding: '2px 10px',
                borderRadius: 6,
                fontWeight: 800,
              }}
            >
              {spec.formatId} · v{spec.schemaVersion} 自由舞台
            </span>
            <span>エピソード: {spec.episodeId}</span>
            <span>|</span>
            <span>
              台本前仮確定: {spec.workflow.lockedBeforeScript ? 'ロック済み' : '未ロック'}（{spec.workflow.stage}）
            </span>
            <span>|</span>
            <span>尺: {spec.videoDurationText}</span>
          </div>
          <div style={{ fontSize: 23, fontWeight: 900, color: '#FFFFFF' }}>
            タイトル（全角換算 {titleZenkaku} 字 / 目安30字前後）: {spec.videoTitle}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div
            style={{
              backgroundColor: validationSummary?.passed === false ? '#7F1D1D' : '#064E3B',
              color: validationSummary?.passed === false ? '#FECACA' : '#6EE7B7',
              padding: '5px 14px',
              borderRadius: 8,
              fontSize: 17,
              fontWeight: 800,
            }}
          >
            {validationSummary
              ? `機械検証: ${validationSummary.passed ? '合格' : '要修正'}（Error ${validationSummary.errorCount} / Warn ${validationSummary.warningCount}）`
              : 'Remotion <Still> 自由舞台比較プレビュー'}
          </div>
          <div style={{ fontSize: 14, color: '#CBD5E1' }}>{experimentText}</div>
        </div>
      </div>

      {/* 2. YouTube ホームフィード模擬（ダークテーマ・3列×2行） */}
      <div
        style={{
          backgroundColor: '#0F0F0F',
          border: '1px solid #27272A',
          borderRadius: 16,
          padding: '12px 20px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: '#F1F5F9' }}>
            YouTube ホーム画面 模擬比較（ダークモード・自案 vs 競合）
          </div>
          <div style={{ fontSize: 14, color: '#94A3B8' }}>
            右下再生時間バッジ（{spec.videoDurationText}）との被り・視線誘導・競合内での抜け感を比較
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px 20px',
          }}
        >
          {homeFeedItems.map((item, idx) => {
            const isOurs = item.kind === 'ours' && item.variant;
            const titleText = isOurs ? spec.videoTitle : item.competitor?.title ?? '';
            const channelText = isOurs ? spec.channelName : item.competitor?.channelName ?? '';
            const metaText = isOurs
              ? '公開前テスト・4.2万回視聴・1日前'
              : `${item.competitor?.viewsText ?? ''}・${item.competitor?.publishedAgo ?? ''}`;
            const durText = isOurs ? spec.videoDurationText : item.competitor?.durationText ?? '15:00';

            return (
              <div
                key={`home-${idx}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  backgroundColor: isOurs ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                  border: isOurs ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid transparent',
                  borderRadius: 12,
                  padding: '5px 8px 7px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px' }}>
                  <span
                    style={{
                      backgroundColor: isOurs ? '#0284C7' : '#1E293B',
                      color: '#FFFFFF',
                      fontSize: 13,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 5,
                    }}
                  >
                    {isOurs ? `自案 ${item.variant?.label ?? item.variant?.variantId}` : `競合 ${idx + 1}`}
                  </span>
                  <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: isOurs ? 'ui-monospace, monospace' : undefined }}>
                    {isOurs ? item.variant?.compositionId : item.competitor?.channelName}
                  </span>
                </div>

                <div style={{ position: 'relative', width: 416, height: 234, borderRadius: 10, overflow: 'hidden', alignSelf: 'center' }}>
                  {isOurs && item.variant ? (
                    <VariantImagePreview
                      variant={item.variant}
                      imageUrl={variantImageUrls?.[item.variant.variantId]}
                      width={416}
                      height={234}
                    />
                  ) : item.competitor ? (
                    <CompetitorThumbnailThumb comp={item.competitor} width={416} height={234} />
                  ) : null}

                  <div
                    style={{
                      position: 'absolute',
                      right: 8,
                      bottom: 8,
                      backgroundColor: 'rgba(0, 0, 0, 0.86)',
                      color: '#FFFFFF',
                      fontSize: 13,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {durText}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, padding: '0 6px' }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      backgroundColor: isOurs ? '#38BDF8' : '#475569',
                      color: '#0F172A',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    {channelText.slice(0, 1) || 'C'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        lineHeight: 1.3,
                        color: '#F1F1F1',
                        height: 39,
                        overflow: 'hidden',
                      }}
                    >
                      {titleText}
                    </div>
                    <div style={{ fontSize: 12, color: '#AAAAAA' }}>
                      {channelText} ・ {metaText}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. 下段：左＝ライト/ダーク関連動画実寸168x94並列、右＝細目スクイント＆A/B差別化監査 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1120px 1fr', gap: 18, flex: 1, minHeight: 0 }}>
        {/* 左：ライト＆ダーク実寸 168x94 並列 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <RelatedSidebarColumn
            mode="light"
            items={sidebarItems}
            videoTitle={spec.videoTitle}
            channelName={spec.channelName}
            videoDurationText={spec.videoDurationText}
            variantImageUrls={variantImageUrls}
          />
          <RelatedSidebarColumn
            mode="dark"
            items={sidebarItems}
            videoTitle={spec.videoTitle}
            channelName={spec.channelName}
            videoDurationText={spec.videoDurationText}
            variantImageUrls={variantImageUrls}
          />
        </div>

        {/* 右：168x94 細目スクイント ＆ A/B差別化監査 */}
        <div
          style={{
            backgroundColor: '#111827',
            border: '1px solid #334155',
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#F8FAFC' }}>
              168×94px 縮小スクイント ＆ A/B差別化監査
            </div>
            <div style={{ fontSize: 13, color: '#94A3B8' }}>
              等倍 vs 細目ブラー ・ 推奨 3〜10字程度 / 上限20字
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {spec.variants.map((v) => {
              const joinedCopy = v.copyLines.join('') + (v.badgeText ?? '');
              const copyChars = Array.from(joinedCopy.replace(/\s+/g, '')).length;
              const trigLabels = v.triggers.map((t) => TRIGGER_LABELS_JA[t] ?? t).join(' × ');
              const imgUrl = variantImageUrls?.[v.variantId];
              return (
                <div
                  key={`squint-${v.variantId}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    backgroundColor: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: 12,
                    padding: '10px 14px',
                  }}
                >
                  {/* 等倍 168x94 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #475569' }}>
                      <VariantImagePreview variant={v} imageUrl={imgUrl} width={168} height={94} />
                    </div>
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>168×94 等倍</span>
                  </div>

                  {/* 細目スクイント 168x94 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #475569' }}>
                      <VariantImagePreview variant={v} imageUrl={imgUrl} width={168} height={94} blurPx={1.2} />
                    </div>
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>細目スクイント</span>
                  </div>

                  {/* メタ情報 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          backgroundColor: '#38BDF8',
                          color: '#0F172A',
                          fontWeight: 900,
                          fontSize: 13,
                          padding: '2px 8px',
                          borderRadius: 5,
                        }}
                      >
                        {v.label}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#FDE047' }}>
                        {trigLabels}
                      </span>
                      <span style={{ fontSize: 12, color: '#CBD5E1' }}>
                        {copyChars}字（{v.copyLines.length}行）
                      </span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#FFFFFF' }}>
                      {v.badgeText ? `[${v.badgeText}] ` : ''}
                      {v.copyLines.join(' / ')}
                    </div>
                    {v.visualHook ? (
                      <div style={{ fontSize: 13, color: '#E2E8F0' }}>視覚フック: {v.visualHook}</div>
                    ) : null}
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>
                      Still: {v.compositionId} ｜ 仮説: {v.hypothesis}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
