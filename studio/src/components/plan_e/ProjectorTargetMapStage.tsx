import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { PROJECTOR_SAFE_BOTTOM, SUBTITLE_SAFE_BOTTOM } from './constants';
import { EconHostAvatar } from './EconHostAvatar';
import { FONT_ECON_MONO, FONT_ECON_SANS } from './fonts';
import { WORLD_COUNTRIES, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from './worldMapPaths';

export interface ProjectorTargetMapStageProps {
  /** 左上の黒帯見出し（例: 「解剖対象：日本経済」） */
  targetLabel: string;
  /** ハイライトする国コード（ISO-3166 alpha-2 / worldMapPaths id。既定: 'jp'） */
  targetCountryId?: string;
  /** 照準の中心座標（1000x432.3 SVG座標系。未指定時は WORLD_COUNTRIES 重心から自動算出） */
  targetPoint?: readonly [number, number];
  /** 右下チャプター進行ラベル（例: 「▶ PLAY  CHAPTER 1 | 罠の仕組み」） */
  nextChapterLabel?: string;
  /** ズーム倍率 [開始, 終了] */
  zoomRange?: readonly [number, number];
  /** シーン開始時刻（グローバル秒・Template直挿し対応） */
  startSec?: number;
  /** シーン終了時刻（グローバル秒） */
  endSec?: number;
  avatarEmblem?: string;
}

/**
 * 案E v2.1 標準コンポーネント（ABテスト v3 勝因昇格）:
 * 暗室プロジェクター投射スクリーン上に188ヶ国実測世界地図を描画し、
 * 対象国へ赤照準＆緩やかなズームインで本編チャプターへ繋ぐオープンループ締めステージ。
 */
export const ProjectorTargetMapStage: React.FC<ProjectorTargetMapStageProps> = ({
  targetLabel,
  targetCountryId = 'jp',
  targetPoint,
  nextChapterLabel = '▶ PLAY  CHAPTER 1 | 罠の仕組み',
  zoomRange = [1.08, 1.88],
  startSec = 0,
  endSec,
  avatarEmblem = '¥?',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const normalizedId = targetCountryId.trim().toLowerCase();
  const matchedCountry = WORLD_COUNTRIES.find((c) => c.id === normalizedId);
  const resolvedPoint: readonly [number, number] =
    targetPoint ?? (matchedCountry ? [matchedCountry.cx, matchedCountry.cy] : [829.2, 133.1]);

  const startF = Math.round(startSec * fps);
  const endF = endSec !== undefined ? Math.round(endSec * fps) : durationInFrames;
  const durF = Math.max(30, endF - startF - 8);
  const localF = Math.max(0, frame - startF);

  const progress = interpolate(localF, [0, durF], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const zoom = interpolate(progress, [0, 1], [zoomRange[0], zoomRange[1]]);
  const [tx, ty] = resolvedPoint;

  // ズーム中心を対象国へ滑らかに寄せる viewBox 計算
  const vw = WORLD_MAP_WIDTH / zoom;
  const vh = WORLD_MAP_HEIGHT / zoom;
  const cx = interpolate(progress, [0, 1], [WORLD_MAP_WIDTH * 0.56, tx - vw * 0.05]);
  const cy = interpolate(progress, [0, 1], [WORLD_MAP_HEIGHT * 0.45, ty + vh * 0.02]);
  const vx = Math.max(0, Math.min(WORLD_MAP_WIDTH - vw, cx - vw / 2));
  const vy = Math.max(0, Math.min(WORLD_MAP_HEIGHT - vh, cy - vh / 2));

  const pulse = 1 + Math.sin(localF * 0.18) * 0.09;

  return (
    <AbsoluteFill style={{ backgroundColor: '#050608' }}>
      {/* 下部プロジェクター光コーン */}
      <div
        style={{
          position: 'absolute',
          left: '34%',
          right: '34%',
          bottom: 0,
          height: 290,
          background:
            'linear-gradient(0deg, rgba(226,232,240,0.22) 0%, rgba(226,232,240,0.04) 75%, transparent 100%)',
          clipPath: 'polygon(42% 100%, 58% 100%, 100% 0%, 0% 0%)',
        }}
      />

      {/* 暗室プロジェクタースクリーン（世界地図比率維持＋字幕セーフ204px上） */}
      <div
        style={{
          position: 'absolute',
          top: 86,
          left: 396,
          right: 96,
          bottom: PROJECTOR_SAFE_BOTTOM,
          backgroundColor: '#F8FAFC',
          border: '6px solid #1E293B',
          boxShadow: '0 0 80px rgba(248,250,252,0.18), 0 28px 60px rgba(0,0,0,0.75)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          viewBox={`${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`}
          preserveAspectRatio="xMidYMid slice"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <rect x={0} y={0} width={WORLD_MAP_WIDTH} height={WORLD_MAP_HEIGHT} fill="#F8FAFC" />
          {WORLD_COUNTRIES.map((c) => {
            const isTarget = c.id === normalizedId;
            return (
              <path
                key={c.id}
                d={c.d}
                fill={isTarget ? '#CC0000' : '#CBD5E1'}
                stroke="#F8FAFC"
                strokeWidth={isTarget ? 0.9 : 0.55}
              />
            );
          })}

          {/* 対象国への赤照準レティクル */}
          <g transform={`translate(${tx}, ${ty}) scale(${pulse / Math.sqrt(zoom)})`}>
            <circle cx={0} cy={0} r={34} fill="none" stroke="#CC0000" strokeWidth={2.4} strokeDasharray="6 4" />
            <circle cx={0} cy={0} r={22} fill="none" stroke="#CC0000" strokeWidth={2.6} />
            <line x1={-44} y1={0} x2={-26} y2={0} stroke="#CC0000" strokeWidth={2.5} />
            <line x1={26} y1={0} x2={44} y2={0} stroke="#CC0000" strokeWidth={2.5} />
            <line x1={0} y1={-44} x2={0} y2={-26} stroke="#CC0000" strokeWidth={2.5} />
            <line x1={0} y1={26} x2={0} y2={44} stroke="#CC0000" strokeWidth={2.5} />
          </g>
        </svg>

        {/* 投射スキャンライン＆スクリーン四隅ビネット */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage:
              'repeating-linear-gradient(0deg, rgba(15,23,42,0.03) 0px, rgba(15,23,42,0.03) 1px, transparent 1px, transparent 4px)',
            boxShadow: 'inset 0 0 64px rgba(15,23,42,0.16)',
          }}
        />

        {/* 左上対象バッジ */}
        <div
          style={{
            position: 'absolute',
            top: 26,
            left: 28,
            backgroundColor: '#0F172A',
            color: '#F8FAFC',
            borderLeft: '7px solid #CC0000',
            padding: '10px 22px',
            fontFamily: FONT_ECON_SANS,
            fontWeight: 900,
            fontSize: 30,
            letterSpacing: '0.06em',
          }}
        >
          {targetLabel}
        </div>

        {/* 右下チャプター遷移ラベル */}
        {nextChapterLabel && (
          <div
            style={{
              position: 'absolute',
              right: 28,
              bottom: 22,
              backgroundColor: 'rgba(248, 250, 252, 0.88)',
              padding: '6px 14px',
              borderRadius: 4,
              fontFamily: FONT_ECON_MONO,
              fontWeight: 900,
              fontSize: 26,
              color: '#0F172A',
              letterSpacing: '0.08em',
            }}
          >
            {nextChapterLabel}
          </div>
        )}
      </div>

      {/* 左側 指示棒アバター */}
      <div style={{ position: 'absolute', left: 32, bottom: SUBTITLE_SAFE_BOTTOM - 14 }}>
        <EconHostAvatar emblem={avatarEmblem} pose="pointer_stick" scale={0.8} />
      </div>
    </AbsoluteFill>
  );
};
