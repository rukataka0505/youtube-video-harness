import React from 'react';
import { interpolate, spring, useVideoConfig } from 'remotion';
import {
  BoilSvg,
  DrawPath,
  FONT_HAND,
  FONT_MARU,
  FONT_SANS,
  HandDrawnFrame,
  PhotoScrap,
  Place,
  PolarityStamp,
  Pop,
  Scribble,
  StaggeredItemGrid,
  StickmanBubble,
  Window,
  beatProgress,
  clamp01,
  clampLerp,
  snapAt,
  type StickmanSceneProps,
} from '../../../../components/stickman_collage';

/* -------------------------------------------------------------------------- */
/* 共通手描き小道具・物理モーションヘルパー                                       */
/* -------------------------------------------------------------------------- */

/**
 * 重力落下＋着地時のスカッシュ＆ストレッチを返す物理バウンドヘルパー。
 */
const useDropPhysics = (
  sec: number,
  at: number,
  fps: number,
  dropHeight = 320,
): { visible: boolean; dy: number; scaleX: number; scaleY: number; impactP: number; landed: boolean } => {
  if (sec < at) {
    return { visible: false, dy: -dropHeight, scaleX: 1, scaleY: 1, impactP: 0, landed: false };
  }
  const t = sec - at;
  const fallDur = 0.22;
  if (t < fallDur) {
    const p = t / fallDur;
    // 等加速度落下（y ~ p^2）
    const dy = -dropHeight * (1 - p * p);
    const stretch = 1 + p * 0.12;
    return {
      visible: true,
      dy,
      scaleX: 1 / Math.sqrt(stretch),
      scaleY: stretch,
      impactP: 0,
      landed: false,
    };
  }
  const landT = t - fallDur;
  const sp = spring({
    frame: Math.max(0, landT * fps),
    fps,
    config: { stiffness: 460, damping: 16, mass: 0.55 },
  });
  // 着地瞬間だけ横に潰れて縦に縮み、バネで復元
  const squashEnvelope = Math.exp(-landT * 9.5) * Math.cos(landT * 26);
  const scaleX = 1 + 0.16 * squashEnvelope;
  const scaleY = 1 - 0.14 * squashEnvelope;
  const bounceY = -Math.max(0, Math.sin(Math.min(1, landT / 0.24) * Math.PI)) * (1 - sp) * 18;
  const impactP = clamp01(landT / 0.36);
  return {
    visible: true,
    dy: bounceY,
    scaleX,
    scaleY,
    impactP,
    landed: true,
  };
};

interface HandBookProp {
  title: string;
  obiText: string;
  coverFill: string;
  spineFill: string;
  obiFill: string;
  obiInk?: string;
  inkColor?: string;
  width?: number;
  height?: number;
  desaturate?: number;
}

/**
 * 7.5fps 手描きボイルのハードカバー自己啓発本（帯付き・斜め積み用平置きフォルム）。
 */
const HandDrawnBook: React.FC<HandBookProp> = ({
  title,
  obiText,
  coverFill,
  spineFill,
  obiFill,
  obiInk = '#1C1917',
  inkColor = '#F7F5EE',
  width = 390,
  height = 104,
  desaturate = 0,
}) => (
  <div style={{ filter: desaturate > 0 ? `saturate(${(1 - desaturate * 0.85).toFixed(2)}) brightness(${(1 - desaturate * 0.38).toFixed(2)})` : undefined }}>
    <BoilSvg width={width} height={height} viewBox="0 0 390 104" scale={2.6}>
      {/* 右側の小口（ページ束） */}
      <path
        d="M 342 18 C 358 18, 372 20, 382 24 C 384 44, 383 68, 380 86 C 368 90, 354 91, 340 90 Z"
        fill="#F3EFE4"
        stroke={inkColor}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path d="M 348 36 C 361 36, 372 37, 379 39" stroke="#78716C" strokeWidth={2.2} fill="none" />
      <path d="M 348 54 C 361 54, 372 55, 379 57" stroke="#78716C" strokeWidth={2.2} fill="none" />
      <path d="M 348 72 C 360 72, 371 73, 378 75" stroke="#78716C" strokeWidth={2.2} fill="none" />

      {/* 背表紙 */}
      <path
        d="M 10 18 C 24 14, 46 13, 66 15 C 68 42, 67 68, 65 92 C 44 94, 24 92, 11 88 C 7 65, 8 40, 10 18 Z"
        fill={spineFill}
        stroke={inkColor}
        strokeWidth={4.5}
        strokeLinejoin="round"
      />

      {/* 表紙本体 */}
      <path
        d="M 65 15 C 155 12, 255 13, 344 17 C 347 42, 346 68, 342 91 C 252 94, 154 93, 64 92 Z"
        fill={coverFill}
        stroke={inkColor}
        strokeWidth={4.5}
        strokeLinejoin="round"
      />

      {/* ド派手な帯 */}
      <path
        d="M 12 60 C 122 57, 236 58, 345 61 C 346 72, 344 82, 342 91 C 236 93, 122 93, 12 88 Z"
        fill={obiFill}
        stroke={inkColor}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />

      {/* 背の装飾ライン */}
      <path d="M 18 32 C 32 30, 48 30, 58 32" stroke="#FAF8F3" strokeWidth={3} strokeLinecap="round" opacity={0.75} />

      {/* タイトル＆帯コピー */}
      <text
        x={204}
        y={46}
        textAnchor="middle"
        fill="#FAF8F3"
        fontFamily={FONT_MARU}
        fontWeight={900}
        fontSize={24}
      >
        {title}
      </text>
      <text
        x={204}
        y={82}
        textAnchor="middle"
        fill={obiInk}
        fontFamily={FONT_HAND}
        fontWeight={700}
        fontSize={19}
      >
        {obiText}
      </text>
    </BoilSvg>
  </div>
);

/**
 * 着地衝撃のエフェクト線（パッと広がって消えるチョーク閃光）。
 */
const ImpactBurst: React.FC<{ progress: number; color?: string; width?: number }> = ({
  progress,
  color = '#FFCC00',
  width = 430,
}) => {
  if (progress <= 0 || progress >= 1) {
    return null;
  }
  const op = interpolate(progress, [0, 0.25, 1], [0.95, 0.9, 0], { extrapolateRight: 'clamp' });
  const spread = interpolate(progress, [0, 1], [0.45, 1.15]);
  return (
    <svg
      width={width}
      height={76}
      viewBox="0 0 430 76"
      aria-hidden="true"
      style={{ overflow: 'visible', opacity: op, pointerEvents: 'none' }}
    >
      <g transform={`translate(215 44) scale(${spread}) translate(-215 -44)`}>
        <path d="M 32 48 C 20 40, 10 34, 2 28" stroke={color} strokeWidth={5} strokeLinecap="round" fill="none" />
        <path d="M 46 60 C 30 62, 16 64, 4 68" stroke={color} strokeWidth={4.5} strokeLinecap="round" fill="none" />
        <path d="M 398 48 C 410 40, 420 34, 428 28" stroke={color} strokeWidth={5} strokeLinecap="round" fill="none" />
        <path d="M 384 60 C 400 62, 414 64, 426 68" stroke={color} strokeWidth={4.5} strokeLinecap="round" fill="none" />
        <path d="M 96 68 C 110 72, 124 72, 138 69" stroke="#FAF8F3" strokeWidth={3.5} strokeLinecap="round" fill="none" opacity={0.75} />
        <path d="M 292 69 C 306 72, 320 72, 334 68" stroke="#FAF8F3" strokeWidth={3.5} strokeLinecap="round" fill="none" opacity={0.75} />
      </g>
    </svg>
  );
};

/* -------------------------------------------------------------------------- */
/* CUT 1: c01 — 本屋のビジネス書コーナーで3冊まとめ買い（black）                 */
/* -------------------------------------------------------------------------- */

export const C01BookstoreHook: React.FC<StickmanSceneProps> = ({
  sec,
  shotDurationSec,
  cue,
  resolveAsset,
}) => {
  const { fps } = useVideoConfig();
  const bookstore = resolveAsset('photo_bookstore');

  const tBookstore = cue('本屋', 0.35);
  const tHabit = cue('人生が変わる習慣', 2.45);
  const tThree = cue('さんさつ', 5.0);
  const tBought = cue('まとめて買った', 5.65);
  const tMood = cue('みょうに気分がいい', 6.95);

  const drop1 = useDropPhysics(sec, tHabit, fps, 340);
  const drop2 = useDropPhysics(sec, tThree, fps, 360);
  const drop3 = useDropPhysics(sec, tThree + 0.28, fps, 380);

  // 2冊目・3冊目が落ちた瞬間に下の本が少し沈む振動
  const stackShake =
    (drop2.landed ? Math.exp(-(sec - (tThree + 0.22)) * 12) * Math.sin((sec - (tThree + 0.22)) * 38) * 6 : 0) +
    (drop3.landed ? Math.exp(-(sec - (tThree + 0.5)) * 12) * Math.sin((sec - (tThree + 0.5)) * 38) * 7 : 0);

  // 浮かれ棒人間のぴょんぴょん跳ねる物理サイクル
  const moodSp = snapAt(sec, tMood, fps, 380, 15, 0.58);
  const happyBounce = sec >= tMood ? Math.abs(Math.sin((sec - tMood) * 6.2)) * -18 : 0;
  const bagSwing = sec >= tMood ? Math.sin((sec - tMood) * 6.2) * 11 : 0;

  // レシートのシュルッと伸びる高さ
  const receiptH = clampLerp(sec, [tBought, tBought + 0.55], [0, 224]);

  return (
    <div style={{ position: 'relative', width: 1920, height: 890 }}>
      {/* 夜空の三日月と星（買った夜の空気感） */}
      <Pop x={1658} y={66} sec={sec} at={tBought} rot={-8} from={0.3}>
        <BoilSvg width={150} height={130} viewBox="0 0 150 130" scale={2.2}>
          <path
            d="M 88 18 C 52 24, 34 56, 46 88 C 58 116, 94 124, 118 106 C 90 108, 70 90, 70 62 C 70 42, 78 28, 88 18 Z"
            fill="#FDE047"
            stroke="#FAF8F3"
            strokeWidth={3.5}
            strokeLinejoin="round"
          />
          <path d="M 24 30 L 30 16 L 36 30 L 50 35 L 36 40 L 30 54 L 24 40 L 10 35 Z" fill="#FDE047" opacity={0.9} />
          <path d="M 122 36 L 125 28 L 128 36 L 136 39 L 128 42 L 125 50 L 122 42 L 114 39 Z" fill="#FAF8F3" opacity={0.85} />
        </BoilSvg>
      </Pop>

      {/* 左：本屋の平台コーナー実写スクラップ（本当に活きる1枚） */}
      {bookstore ? (
        <PhotoScrap
          src={bookstore.src}
          sec={sec}
          at={tBookstore}
          x={110}
          y={150}
          w={570}
          h={430}
          rot={-2.8}
          tape
          polarity="black"
          objectPosition={bookstore.item.objectPosition ?? '50% 45%'}
          durationSec={Math.max(2, shotDurationSec - tBookstore)}
          z={5}
        />
      ) : null}

      {/* 本屋スクラップ上のチョーク手描き見出し＆矢印 */}
      <Pop x={124} y={76} sec={sec} at={tBookstore + 0.2} rot={-2.2} z={8}>
        <Scribble text="夜のビジネス書コーナー" size={44} polarity="black" color="#FFCC00" outline />
      </Pop>
      <Place x={165} y={594} z={8}>
        <BoilSvg width={480} height={105} viewBox="0 0 480 105" scale={2.4}>
          <DrawPath
            d="M 22 18 C 82 58, 178 72, 326 42"
            sec={sec}
            at={tBookstore + 0.45}
            dur={0.48}
            stroke="#FFCC00"
            width={5}
          />
          <DrawPath
            d="M 308 32 L 330 41 L 314 57"
            sec={sec}
            at={tBookstore + 0.85}
            dur={0.18}
            stroke="#FFCC00"
            width={5}
          />
        </BoilSvg>
      </Place>
      <Pop x={220} y={658} sec={sec} at={tBookstore + 0.7} rot={-1.8} z={8}>
        <Scribble text="平積みがまぶしい…" size={34} polarity="black" color="#D6D1C4" />
      </Pop>

      {/* 中央〜やや右：手描きテーブル線と、重力落下して積まれる3冊の自己啓発本 */}
      <Place x={720} y={640} z={4}>
        <BoilSvg width={520} height={60} viewBox="0 0 520 60" scale={2.2}>
          <DrawPath
            d="M 18 32 C 145 27, 365 29, 502 33"
            sec={sec}
            at={tHabit - 0.15}
            dur={0.35}
            stroke="#D6D1C4"
            width={5.5}
          />
        </BoilSvg>
      </Place>

      {/* 本の山コンテナ */}
      <Place x={755} y={554 + stackShake} z={10}>
        {/* 1冊目（最下段） */}
        {drop1.visible ? (
          <div
            style={{
              position: 'relative',
              transform: `translateY(${drop1.dy}px) rotate(-1.8deg) scale(${drop1.scaleX}, ${drop1.scaleY})`,
              transformOrigin: '50% 90%',
            }}
          >
            <HandDrawnBook
              title="人生が変わる習慣"
              obiText="★100万部突破!! 読むだけで激変★"
              coverFill="#C2410C"
              spineFill="#9A3412"
              obiFill="#FDE047"
            />
          </div>
        ) : null}
        <div style={{ position: 'absolute', left: -18, top: 44 }}>
          <ImpactBurst progress={drop1.impactP} color="#FFCC00" />
        </div>
      </Place>

      <Place x={776} y={454 + stackShake * 0.7} z={11}>
        {/* 2冊目（中段） */}
        {drop2.visible ? (
          <div
            style={{
              position: 'relative',
              transform: `translateY(${drop2.dy}px) rotate(2.1deg) scale(${drop2.scaleX}, ${drop2.scaleY})`,
              transformOrigin: '50% 90%',
            }}
          >
            <HandDrawnBook
              title="朝5時起きの極意"
              obiText="成功者の99%が実践する最強メソッド"
              coverFill="#1D4ED8"
              spineFill="#1E3A8A"
              obiFill="#FAF8F3"
            />
          </div>
        ) : null}
        <div style={{ position: 'absolute', left: -18, top: 44 }}>
          <ImpactBurst progress={drop2.impactP} color="#38BDF8" />
        </div>
      </Place>

      <Place x={748} y={352} z={12}>
        {/* 3冊目（最上段） */}
        {drop3.visible ? (
          <div
            style={{
              position: 'relative',
              transform: `translateY(${drop3.dy}px) rotate(-3.2deg) scale(${drop3.scaleX}, ${drop3.scaleY})`,
              transformOrigin: '50% 90%',
            }}
          >
            <HandDrawnBook
              title="最強のルーティン大全"
              obiText="今日からあなたは生まれ変わる!!"
              coverFill="#B91C1C"
              spineFill="#7F1D1D"
              obiFill="#FDE047"
            />
          </div>
        ) : null}
        <div style={{ position: 'absolute', left: -18, top: 44 }}>
          <ImpactBurst progress={drop3.impactP} color="#FF5A5F" />
        </div>
      </Place>

      {/* 「3冊まとめ買い！」チョーク強調ラベル */}
      <Pop x={775} y={196} sec={sec} at={tThree + 0.35} rot={-3.5} z={14}>
        <Scribble text="3冊 まとめ買い!!" size={54} polarity="black" color="#FFCC00" font={FONT_MARU} weight={900} outline />
      </Pop>

      {/* レシートがシュルッと伸びる */}
      {sec >= tBought ? (
        <Place x={1172} y={248} rot={3.2} z={9}>
          <div style={{ height: receiptH, overflow: 'hidden' }}>
            <BoilSvg width={196} height={224} viewBox="0 0 196 224" scale={1.8}>
              <path
                d="M 10 8 L 186 8 L 184 208 L 166 196 L 148 210 L 130 196 L 112 210 L 94 196 L 76 210 L 58 196 L 40 210 L 22 196 L 10 208 Z"
                fill="#FAF8F3"
                stroke="#1C1917"
                strokeWidth={3.5}
                strokeLinejoin="round"
              />
              <text x={98} y={40} textAnchor="middle" fill="#1C1917" fontFamily={FONT_SANS} fontWeight={900} fontSize={18}>
                領収書 / 書店
              </text>
              <path d="M 24 54 L 172 54" stroke="#78716C" strokeWidth={2} strokeDasharray="5 5" />
              <text x={26} y={84} fill="#1C1917" fontFamily={FONT_HAND} fontWeight={700} fontSize={18}>
                習慣本 × 3冊
              </text>
              <text x={26} y={114} fill="#57534E" fontFamily={FONT_HAND} fontWeight={700} fontSize={16}>
                やる気税　 ¥0
              </text>
              <path d="M 24 130 L 172 130" stroke="#1C1917" strokeWidth={2.5} />
              <text x={98} y={166} textAnchor="middle" fill="#DC2626" fontFamily={FONT_MARU} fontWeight={900} fontSize={26}>
                計 ¥4,950
              </text>
            </BoilSvg>
          </div>
        </Place>
      ) : null}

      {/* 右：紙袋を持ってルンルン弾むカスタムボイル棒人間（妙に気分がいい！） */}
      {sec >= tMood ? (
        <Place x={1358} y={288 + happyBounce} z={15}>
          <div
            style={{
              transform: `scale(${interpolate(moodSp, [0, 1], [0.4, 1])})`,
              transformOrigin: '50% 80%',
            }}
          >
            {/* 吹き出し */}
            <div style={{ marginLeft: 18, marginBottom: 4 }}>
              <StickmanBubble
                text="明日から別人だ！"
                subText="気分だけは最高♪"
                tailDirection="bottom-left"
                polarity="black"
                fontSize={30}
                maxWidth={340}
              />
            </div>

            {/* 紙袋をぶら下げてスキップする手描きボイル棒人間 */}
            <BoilSvg width={360} height={360} viewBox="0 0 360 360" scale={3.2}>
              {/* 音符と高揚キラキラ */}
              <path d="M 52 72 L 52 28 L 86 20 L 86 60" stroke="#FFCC00" strokeWidth={5.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 42 74 C 48 68, 58 68, 56 78 C 54 84, 42 84, 42 74 Z" fill="#FFCC00" />
              <path d="M 76 62 C 82 56, 92 56, 90 66 C 88 72, 76 72, 76 62 Z" fill="#FFCC00" />
              <path d="M 278 44 L 296 28 M 292 66 L 316 62 M 266 28 L 274 10" stroke="#FDE047" strokeWidth={5} strokeLinecap="round" />

              {/* 頭（ニッコリ上向き） */}
              <path
                d="M 168 62 C 194 58, 212 76, 208 100 C 204 124, 182 134, 160 130 C 138 126, 126 106, 130 84 C 134 66, 150 64, 168 62 Z"
                fill="none"
                stroke="#FFCC00"
                strokeWidth={11}
                strokeLinecap="round"
              />
              {/* 笑顔の目（^ ^）と大きな口 */}
              <path d="M 152 88 C 156 80, 164 80, 168 88" stroke="#FFCC00" strokeWidth={5.5} strokeLinecap="round" fill="none" />
              <path d="M 178 88 C 182 80, 190 80, 194 88" stroke="#FFCC00" strokeWidth={5.5} strokeLinecap="round" fill="none" />
              <path d="M 156 104 C 166 120, 184 120, 194 103" stroke="#FFCC00" strokeWidth={6} strokeLinecap="round" fill="none" />

              {/* 胴体（軽やかに前傾） */}
              <path d="M 168 132 C 172 168, 168 202, 164 234" stroke="#FFCC00" strokeWidth={11.5} strokeLinecap="round" fill="none" />

              {/* 左腕（バンザイ気味に上へ） */}
              <path d="M 168 158 C 136 144, 114 120, 98 96" stroke="#FFCC00" strokeWidth={10.5} strokeLinecap="round" fill="none" />

              {/* 右腕（書店紙袋をブラブラ持つ） */}
              <path d="M 170 160 C 204 166, 232 178, 252 194" stroke="#FFCC00" strokeWidth={10.5} strokeLinecap="round" fill="none" />

              {/* 書店の紙袋（揺れる！） */}
              <g transform={`translate(252 194) rotate(${bagSwing})`}>
                <path d="M -14 0 C -12 -18, 12 -18, 14 0" stroke="#FAF8F3" strokeWidth={4.5} fill="none" strokeLinecap="round" />
                <path
                  d="M -30 4 L 30 4 L 36 82 L -36 82 Z"
                  fill="#D99B58"
                  stroke="#FAF8F3"
                  strokeWidth={4.5}
                  strokeLinejoin="round"
                />
                <text x={0} y={48} textAnchor="middle" fill="#1C1917" fontFamily={FONT_MARU} fontWeight={900} fontSize={20}>
                  書店
                </text>
                <text x={0} y={70} textAnchor="middle" fill="#7F1D1D" fontFamily={FONT_HAND} fontWeight={700} fontSize={16}>
                  3冊入
                </text>
              </g>

              {/* スキップしている足 */}
              <path d="M 164 234 C 140 264, 118 286, 98 308" stroke="#FFCC00" strokeWidth={11} strokeLinecap="round" fill="none" />
              <path d="M 164 234 C 194 256, 214 278, 232 272" stroke="#FFCC00" strokeWidth={11} strokeLinecap="round" fill="none" />
            </BoilSvg>
          </div>
        </Place>
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* CUT 2: c02 — 行動0ページ＋帰り道のコンビニでサラダチキン＋脳内成功者（black）  */
/* -------------------------------------------------------------------------- */

export const C02SaladChickenIllusion: React.FC<StickmanSceneProps> = ({
  sec,
  shotDurationSec,
  cue,
  resolveAsset,
}) => {
  const { fps } = useVideoConfig();
  const saladPhoto = resolveAsset('photo_salad_chicken');

  const tZero = cue('1ページも', 0.2);
  const tNoAct = cue('行動していない', 1.0);
  const tKonbini = cue('帰り道のコンビニ', 2.35);
  const tSalad = cue('サラダチキン', 4.0);
  const tBrain = cue('脳内では', 6.05);
  const tWinner = cue('成功者', 6.85);

  const haloRot = sec >= tBrain ? (sec - tBrain) * 28 : 0;
  const heroSp = snapAt(sec, tBrain, fps, 360, 17, 0.62);
  const crownDrop = useDropPhysics(sec, tBrain + 0.22, fps, 140);

  return (
    <div style={{ position: 'relative', width: 1920, height: 890 }}>
      {/* 左エリア：開いたまま真っ白な「進捗 0ページ」の手描き本＆空チェックリスト */}
      <Pop x={106} y={136} sec={sec} at={tZero} rot={-2.6} z={6}>
        <BoilSvg width={440} height={350} viewBox="0 0 440 350" scale={2.6}>
          {/* 見開きの本（左ページ・右ページ） */}
          <path
            d="M 26 78 C 86 64, 154 66, 214 84 L 214 294 C 154 276, 86 274, 24 288 Z"
            fill="#FAF8F3"
            stroke="#F7F5EE"
            strokeWidth={5}
            strokeLinejoin="round"
          />
          <path
            d="M 214 84 C 274 66, 342 64, 404 78 L 406 288 C 344 274, 276 276, 214 294 Z"
            fill="#F3EFE4"
            stroke="#F7F5EE"
            strokeWidth={5}
            strokeLinejoin="round"
          />
          {/* 本の中央綴じ線 */}
          <path d="M 214 84 C 212 154, 216 224, 214 294" stroke="#78716C" strokeWidth={4} fill="none" />

          {/* 左ページ：真っ白＋「p.1」 */}
          <text x={118} y={128} textAnchor="middle" fill="#78716C" fontFamily={FONT_HAND} fontWeight={700} fontSize={24}>
            第1章：行動編
          </text>
          <text x={118} y={204} textAnchor="middle" fill="#A8A29E" fontFamily={FONT_HAND} fontWeight={700} fontSize={28}>
            （まっさら）
          </text>
          <text x={118} y={258} textAnchor="middle" fill="#78716C" fontFamily={FONT_SANS} fontWeight={700} fontSize={20}>
            p. 001
          </text>

          {/* 右ページ：空っぽの行動チェックリスト */}
          <text x={308} y={122} textAnchor="middle" fill="#1C1917" fontFamily={FONT_MARU} fontWeight={900} fontSize={22}>
            実践チェック
          </text>
          {[156, 198, 240].map((cy, idx) => (
            <g key={idx}>
              <path
                d={`M 242 ${cy - 12} L 266 ${cy - 13} L 267 ${cy + 11} L 241 ${cy + 12} Z`}
                fill="none"
                stroke="#1C1917"
                strokeWidth={3.2}
              />
              <path
                d={`M 280 ${cy} C 312 ${cy - 2}, 346 ${cy + 1}, 376 ${cy - 1}`}
                stroke="#78716C"
                strokeWidth={4}
                strokeLinecap="round"
                fill="none"
              />
            </g>
          ))}

          {/* 「行動していない」で赤ペン特大「0」＋グルグル斜線 */}
          <DrawPath
            d="M 52 130 C 122 108, 186 154, 174 218 C 162 272, 62 276, 48 214 C 36 164, 86 118, 146 132"
            sec={sec}
            at={tNoAct}
            dur={0.42}
            stroke="#FF4D4D"
            width={7}
          />
          <DrawPath
            d="M 244 252 C 296 208, 344 166, 386 134"
            sec={sec}
            at={tNoAct + 0.25}
            dur={0.28}
            stroke="#FF4D4D"
            width={7}
          />
        </BoilSvg>
      </Pop>

      {/* 「実践: 0ページ」赤チョーク注釈 */}
      <Pop x={136} y={498} sec={sec} at={tNoAct + 0.15} rot={-3} z={8}>
        <Scribble text="実践：まだ 0 ページ" size={44} polarity="black" color="#FF5A5F" font={FONT_MARU} weight={900} outline />
      </Pop>

      {/* 左から中央へ繋がる帰り道の点線と手描きコンビニ看板 */}
      <Place x={450} y={532} z={5}>
        <BoilSvg width={290} height={150} viewBox="0 0 290 150" scale={2.2}>
          <DrawPath
            d="M 14 78 C 86 112, 168 106, 258 46"
            sec={sec}
            at={tKonbini}
            dur={0.55}
            stroke="#D6D1C4"
            width={5}
            dash="10 12"
          />
          <DrawPath
            d="M 238 42 L 262 44 L 250 64"
            sec={sec}
            at={tKonbini + 0.45}
            dur={0.18}
            stroke="#D6D1C4"
            width={5}
          />
        </BoilSvg>
      </Place>

      {/* 中央上部：手描きコンビニ看板（24H） */}
      <Pop x={662} y={70} sec={sec} at={tKonbini + 0.1} rot={1.8} z={9}>
        <BoilSvg width={430} height={116} viewBox="0 0 430 116" scale={2.3}>
          <path
            d="M 16 20 C 138 14, 294 15, 412 20 C 416 48, 415 78, 410 100 C 288 104, 142 103, 18 98 C 14 72, 15 44, 16 20 Z"
            fill="#FAF8F3"
            stroke="#1C1917"
            strokeWidth={4.5}
          />
          {/* コンビニ3色ストライプ（手描き線） */}
          <path d="M 20 26 L 408 26" stroke="#0099FF" strokeWidth={11} strokeLinecap="round" />
          <path d="M 20 39 L 408 39" stroke="#22C55E" strokeWidth={9} strokeLinecap="round" />
          <path d="M 20 50 L 408 50" stroke="#F97316" strokeWidth={7} strokeLinecap="round" />
          <text x={214} y={88} textAnchor="middle" fill="#1C1917" fontFamily={FONT_MARU} fontWeight={900} fontSize={32}>
            帰り道のコンビニ 24H
          </text>
        </BoilSvg>
      </Pop>

      {/* 中央主役：サラダチキン実写スクラップ（シュールな共感ポイント） */}
      {saladPhoto ? (
        <PhotoScrap
          src={saladPhoto.src}
          sec={sec}
          at={tSalad}
          x={634}
          y={204}
          w={496}
          h={372}
          rot={2.4}
          tape
          polarity="black"
          labelJa="なぜかサラダチキン"
          objectPosition={saladPhoto.item.objectPosition ?? '50% 45%'}
          durationSec={Math.max(2, shotDurationSec - tSalad)}
          z={10}
        />
      ) : null}

      {/* サラダチキン下のツッコミ手描き（カップ麺に赤バツ→高タンパク） */}
      <Pop x={646} y={606} sec={sec} at={tSalad + 0.45} rot={-1.5} z={11}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <BoilSvg width={120} height={110} viewBox="0 0 120 110" scale={2.4}>
            {/* 手描きカップ麺 */}
            <path
              d="M 22 30 L 98 30 L 86 94 L 34 94 Z"
              fill="#FAF8F3"
              stroke="#F7F5EE"
              strokeWidth={4}
              strokeLinejoin="round"
            />
            <path d="M 18 28 C 46 24, 76 24, 102 28" stroke="#FF5A5F" strokeWidth={6} strokeLinecap="round" />
            <text x={60} y={68} textAnchor="middle" fill="#1C1917" fontFamily={FONT_HAND} fontWeight={700} fontSize={18}>
              唐揚げ
            </text>
            {/* 赤いバツ */}
            <DrawPath d="M 16 18 L 104 98" sec={sec} at={tSalad + 0.55} dur={0.22} stroke="#FF4D4D" width={8} />
            <DrawPath d="M 104 18 L 16 98" sec={sec} at={tSalad + 0.72} dur={0.22} stroke="#FF4D4D" width={8} />
          </BoilSvg>
          <Scribble text={"意識だけ\n高タンパク"} size={38} polarity="black" color="#4ADE80" outline />
        </div>
      </Pop>

      {/* 右：黄金の後光＋王冠をかぶってドヤ顔する「脳内成功者」棒人間 */}
      {sec >= tBrain ? (
        <Place x={1210} y={120} z={14}>
          {/* 回転する黄金の後光（チョーク放射線） */}
          <div
            style={{
              position: 'absolute',
              left: 74,
              top: 120,
              width: 440,
              height: 440,
              transform: `rotate(${haloRot}deg) scale(${interpolate(heroSp, [0, 1], [0.3, 1])})`,
              opacity: interpolate(heroSp, [0, 0.4], [0, 0.85], { extrapolateRight: 'clamp' }),
              pointerEvents: 'none',
            }}
          >
            <BoilSvg width={440} height={440} viewBox="0 0 440 440" scale={2.0}>
              {Array.from({ length: 12 }).map((_, i) => {
                const ang = (i * 30 * Math.PI) / 180;
                const x1 = 220 + Math.cos(ang) * 110;
                const y1 = 220 + Math.sin(ang) * 110;
                const x2 = 220 + Math.cos(ang) * (i % 2 === 0 ? 205 : 172);
                const y2 = 220 + Math.sin(ang) * (i % 2 === 0 ? 205 : 172);
                return (
                  <path
                    key={i}
                    d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`}
                    stroke={i % 2 === 0 ? '#FFCC00' : '#FDE047'}
                    strokeWidth={i % 2 === 0 ? 6 : 4}
                    strokeLinecap="round"
                    opacity={0.78}
                  />
                );
              })}
            </BoilSvg>
          </div>

          {/* 脳内妄想クラウド */}
          <div
            style={{
              position: 'relative',
              marginLeft: 62,
              marginBottom: -28,
              transform: `scale(${interpolate(heroSp, [0, 1], [0.5, 1])})`,
              transformOrigin: '50% 80%',
            }}
          >
            <BoilSvg width={460} height={192} viewBox="0 0 460 192" scale={2.5}>
              <path
                d="M 86 142 C 42 142, 24 110, 46 84 C 38 46, 84 22, 126 38 C 154 12, 224 12, 256 36 C 296 14, 362 28, 376 66 C 422 68, 438 118, 396 144 C 362 162, 134 162, 86 142 Z"
                fill="#FAF8F3"
                stroke="#FFCC00"
                strokeWidth={5.5}
                strokeLinejoin="round"
              />
              {/* 思考の小さな泡 */}
              <path d="M 224 164 C 234 162, 240 172, 232 178 C 224 182, 218 172, 224 164 Z" fill="#FAF8F3" stroke="#FFCC00" strokeWidth={3.5} />
              <text x={228} y={82} textAnchor="middle" fill="#57534E" fontFamily={FONT_HAND} fontWeight={700} fontSize={26}>
                脳内ステータス
              </text>
              <text x={228} y={128} textAnchor="middle" fill="#B91C1C" fontFamily={FONT_MARU} fontWeight={900} fontSize={44}>
                年収UP＆早起き完了
              </text>
            </BoilSvg>
          </div>

          {/* ドヤ顔で腰に手を当てて胸を張る成功者棒人間＋落下王冠 */}
          <div
            style={{
              position: 'relative',
              marginLeft: 138,
              marginTop: 14,
              transform: `scale(${interpolate(heroSp, [0, 1], [0.45, 1])})`,
              transformOrigin: '50% 85%',
            }}
          >
            {/* 頭に落ちてくる黄金の王冠 */}
            {crownDrop.visible ? (
              <div
                style={{
                  position: 'absolute',
                  left: 102,
                  top: -26 + crownDrop.dy,
                  transform: `rotate(-7deg) scale(${crownDrop.scaleX}, ${crownDrop.scaleY})`,
                  zIndex: 5,
                }}
              >
                <BoilSvg width={114} height={74} viewBox="0 0 114 74" scale={2.2}>
                  <path
                    d="M 14 60 L 10 18 L 36 38 L 57 8 L 78 38 L 104 18 L 98 60 Z"
                    fill="#FFCC00"
                    stroke="#FAF8F3"
                    strokeWidth={4.5}
                    strokeLinejoin="round"
                  />
                  <path d="M 54 44 L 60 44 L 57 52 Z" fill="#FF4D4D" />
                </BoilSvg>
              </div>
            ) : null}

            <BoilSvg width={320} height={360} viewBox="0 0 320 360" scale={3.2}>
              {/* 頭 */}
              <path
                d="M 160 66 C 188 64, 206 82, 204 108 C 202 134, 180 146, 156 144 C 132 142, 118 122, 120 98 C 122 76, 138 68, 160 66 Z"
                fill="none"
                stroke="#FFCC00"
                strokeWidth={11.5}
                strokeLinecap="round"
              />
              {/* ドヤ顔サングラス＆ニヤリ口 */}
              <path d="M 126 94 L 158 94 L 154 110 L 130 110 Z" fill="#1C1917" stroke="#FAF8F3" strokeWidth={3.5} />
              <path d="M 166 94 L 198 94 L 194 110 L 170 110 Z" fill="#1C1917" stroke="#FAF8F3" strokeWidth={3.5} />
              <path d="M 158 100 L 166 100" stroke="#FAF8F3" strokeWidth={3.5} />
              <path d="M 148 124 C 160 132, 174 130, 184 120" stroke="#FFCC00" strokeWidth={6} strokeLinecap="round" fill="none" />

              {/* 堂々と胸を張る胴体 */}
              <path d="M 160 146 C 164 182, 162 216, 160 250" stroke="#FFCC00" strokeWidth={12} strokeLinecap="round" fill="none" />
              {/* 両手を腰に当てるポーズ */}
              <path d="M 160 170 C 118 182, 102 204, 154 222" stroke="#FFCC00" strokeWidth={11} strokeLinecap="round" fill="none" />
              <path d="M 160 170 C 204 182, 220 204, 166 222" stroke="#FFCC00" strokeWidth={11} strokeLinecap="round" fill="none" />
              {/* 仁王立ちの足 */}
              <path d="M 160 250 C 138 282, 124 312, 114 336" stroke="#FFCC00" strokeWidth={11.5} strokeLinecap="round" fill="none" />
              <path d="M 160 250 C 184 282, 198 312, 208 336" stroke="#FFCC00" strokeWidth={11.5} strokeLinecap="round" fill="none" />
            </BoilSvg>
          </div>
        </Place>
      ) : null}

      {/* 「もう成功者」赤スタンプをドンッと叩き込む */}
      <Place x={1256} y={626} z={20}>
        <PolarityStamp
          text="もう成功者"
          sec={sec}
          at={tWinner}
          polarity="black"
          color="#FF4D4D"
          rotateDeg={-8}
          fontSize={74}
        />
      </Place>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* CUT 3: c03 — 1週間後、積ん読タワーに吸収→元の生活が復活（black）              */
/* -------------------------------------------------------------------------- */

export const C03TsundokuRevival: React.FC<StickmanSceneProps> = ({
  sec,
  shotDurationSec,
  cue,
  resolveAsset,
}) => {
  const { fps } = useVideoConfig();
  const stackPhoto = resolveAsset('photo_book_stack_room');

  const tOneWeek = cue('1週間後', 0.25);
  const tBedside = cue('ベッドわき', 1.85);
  const tTower = cue('つんどくタワー', 3.0);
  const tAbsorb = cue('吸収され', 3.9);
  const tOldLife = cue('元の生活', 5.2);
  const tRevive = cue('復活します', 6.4);

  // 日めくりカレンダーの1日目→7日目高速めくり
  const dayNum = Math.min(7, Math.max(1, Math.floor(clampLerp(sec, [tOneWeek, tOneWeek + 1.35], [1, 7.99]))));
  const tearProgress = clamp01((sec - tOneWeek) / 1.35);

  // 3冊が上から積ん読タワーに落ちて同化（色が褪せて沈む）
  const absorbDrop = useDropPhysics(sec, tAbsorb, fps, 280);
  const fadeRatio = clampLerp(sec, [tAbsorb + 0.35, tAbsorb + 1.2], [0, 1]);
  const towerSquash = absorbDrop.landed
    ? 1 - Math.exp(-(sec - (tAbsorb + 0.22)) * 8) * Math.cos((sec - (tAbsorb + 0.22)) * 22) * 0.08
    : 1;

  // ホコリ雲パフ
  const dustP = clamp01((sec - (tAbsorb + 0.2)) / 0.85);

  // 怠惰スマホ棒人間の出現とスマホ画面の青い瞬き
  const lazySp = snapAt(sec, tOldLife + 0.25, fps, 340, 20, 0.68);
  const screenGlow = 0.22 + Math.sin(sec * 7.5) * 0.07;

  return (
    <div style={{ position: 'relative', width: 1920, height: 890 }}>
      {/* 左上：手描き日めくりカレンダー（1→7日へページが千切れ飛ぶ） */}
      <Pop x={112} y={76} sec={sec} at={tOneWeek} rot={-3.5} z={12}>
        <div style={{ position: 'relative' }}>
          <BoilSvg width={216} height={224} viewBox="0 0 216 224" scale={2.4}>
            {/* 台紙 */}
            <path
              d="M 18 28 C 76 24, 144 25, 198 28 C 202 92, 200 156, 196 206 C 138 210, 74 208, 20 205 C 15 150, 16 90, 18 28 Z"
              fill="#FAF8F3"
              stroke="#1C1917"
              strokeWidth={4.5}
              strokeLinejoin="round"
            />
            {/* 上部赤いヘッダー帯 */}
            <path
              d="M 18 28 C 76 24, 144 25, 198 28 L 198 72 L 18 72 Z"
              fill="#DC2626"
              stroke="#1C1917"
              strokeWidth={4}
            />
            {/* 金具リング2つ */}
            <path d="M 62 12 C 62 24, 62 34, 62 42" stroke="#D6D1C4" strokeWidth={7} strokeLinecap="round" />
            <path d="M 154 12 C 154 24, 154 34, 154 42" stroke="#D6D1C4" strokeWidth={7} strokeLinecap="round" />
            <text x={108} y={58} textAnchor="middle" fill="#FAF8F3" fontFamily={FONT_MARU} fontWeight={900} fontSize={22}>
              {dayNum === 7 ? '1週間後' : 'DAY'}
            </text>
            <text
              x={108}
              y={166}
              textAnchor="middle"
              fill={dayNum === 7 ? '#DC2626' : '#1C1917'}
              fontFamily={FONT_MARU}
              fontWeight={900}
              fontSize={86}
            >
              {dayNum}
            </text>
            <text x={162} y={176} textAnchor="middle" fill="#57534E" fontFamily={FONT_HAND} fontWeight={700} fontSize={24}>
              日目
            </text>
          </BoilSvg>

          {/* 千切れ飛ぶ過去ページ片（tearProgress 中のみ） */}
          {tearProgress > 0.05 && tearProgress < 0.98 ? (
            <div
              style={{
                position: 'absolute',
                left: 110 + tearProgress * 140,
                top: 40 - Math.sin(tearProgress * Math.PI) * 58 + tearProgress * 120,
                transform: `rotate(${tearProgress * 72}deg)`,
                opacity: 1 - tearProgress,
                pointerEvents: 'none',
              }}
            >
              <BoilSvg width={92} height={96} viewBox="0 0 92 96" scale={1.8}>
                <path d="M 8 10 L 82 6 L 86 86 L 12 90 Z" fill="#FAF8F3" stroke="#1C1917" strokeWidth={3.5} />
                <text x={48} y={62} textAnchor="middle" fill="#78716C" fontFamily={FONT_MARU} fontWeight={900} fontSize={36}>
                  {Math.max(1, dayNum - 1)}
                </text>
              </BoilSvg>
            </div>
          ) : null}
        </div>
      </Pop>

      {/* 左中〜下：現実感を刺すベッド脇の積ん読実写スクラップ */}
      {stackPhoto ? (
        <PhotoScrap
          src={stackPhoto.src}
          sec={sec}
          at={tBedside}
          x={116}
          y={408}
          w={420}
          h={312}
          rot={-2.4}
          tape
          dim={0.14}
          polarity="black"
          labelJa="ベッド脇の現実"
          objectPosition={stackPhoto.item.objectPosition ?? '50% 62%'}
          durationSec={Math.max(2, shotDurationSec - tBedside)}
          z={6}
        />
      ) : null}

      {/* 中央左寄り：手描き巨大「積ん読タワー」＋上から落下して色が褪せて吸収される3冊 */}
      <Pop x={556} y={406} sec={sec} at={tTower - 0.3} rot={0} z={10}>
        <div style={{ transform: `scaleY(${towerSquash})`, transformOrigin: '50% 100%' }}>
          <BoilSvg width={430} height={365} viewBox="0 0 430 365" scale={2.8}>
            {/* 床ライン */}
            <path d="M 14 344 C 138 340, 294 342, 418 345" stroke="#A8A29E" strokeWidth={5} strokeLinecap="round" fill="none" />

            {/* 古い積ん読本たち（くすんだ茶・灰・オリーブ） */}
            {[
              { y: 294, x: 54, w: 320, fill: '#3F3B36', rot: -0.6 },
              { y: 248, x: 66, w: 300, fill: '#4A453F', rot: 1.4 },
              { y: 202, x: 48, w: 312, fill: '#36332F', rot: -1.8 },
              { y: 158, x: 74, w: 286, fill: '#524B42', rot: 1.2 },
              { y: 114, x: 60, w: 294, fill: '#3F3B36', rot: -1.1 },
            ].map((b, i) => (
              <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${b.rot})`}>
                <path
                  d={`M 0 0 L ${b.w} 2 L ${b.w - 4} 42 L 4 44 Z`}
                  fill={b.fill}
                  stroke="#D6D1C4"
                  strokeWidth={3.8}
                  strokeLinejoin="round"
                />
                <path d={`M 36 0 L 38 42`} stroke="#D6D1C4" strokeWidth={3} opacity={0.6} />
                <path d={`M 74 20 L ${b.w - 46} 21`} stroke="#A8A29E" strokeWidth={3} strokeLinecap="round" opacity={0.55} />
              </g>
            ))}

            {/* 隅のクモの巣（放置感） */}
            <path d="M 354 158 C 378 136, 396 126, 412 122" stroke="#A8A29E" strokeWidth={2} opacity={0.65} fill="none" />
            <path d="M 358 176 C 384 166, 402 162, 418 162" stroke="#A8A29E" strokeWidth={2} opacity={0.65} fill="none" />
            <path d="M 378 142 C 382 152, 382 162, 378 172" stroke="#A8A29E" strokeWidth={1.8} opacity={0.6} fill="none" />
          </BoilSvg>
        </div>
      </Pop>

      {/* c01 のピカピカ3冊が落下してタワー上へドスン→退色吸収！ */}
      {absorbDrop.visible ? (
        <Place x={604} y={322 + absorbDrop.dy} z={13}>
          <div
            style={{
              transform: `scale(${absorbDrop.scaleX}, ${absorbDrop.scaleY})`,
              transformOrigin: '50% 95%',
            }}
          >
            <div style={{ transform: 'scale(0.76) rotate(-2.5deg)', transformOrigin: 'top left', marginBottom: -30 }}>
              <HandDrawnBook
                title="最強のルーティン大全"
                obiText="未開封…"
                coverFill="#B91C1C"
                spineFill="#7F1D1D"
                obiFill="#FDE047"
                desaturate={fadeRatio}
              />
            </div>
            <div style={{ transform: 'scale(0.78) rotate(1.8deg)', transformOrigin: 'top left', marginBottom: -30 }}>
              <HandDrawnBook
                title="朝5時起きの極意"
                obiText="しおり0枚…"
                coverFill="#1D4ED8"
                spineFill="#1E3A8A"
                obiFill="#FAF8F3"
                desaturate={fadeRatio}
              />
            </div>
            <div style={{ transform: 'scale(0.8) rotate(-1deg)', transformOrigin: 'top left' }}>
              <HandDrawnBook
                title="人生が変わる習慣"
                obiText="積ん読へ合流"
                coverFill="#C2410C"
                spineFill="#9A3412"
                obiFill="#FDE047"
                desaturate={fadeRatio}
              />
            </div>
          </div>
        </Place>
      ) : null}

      {/* 吸収時のホコリ雲パフ */}
      {dustP > 0 && dustP < 1 ? (
        <Place x={548} y={482} z={14} style={{ opacity: 1 - dustP, pointerEvents: 'none' }}>
          <BoilSvg width={440} height={88} viewBox="0 0 440 88" scale={2.4}>
            <g transform={`translate(${-dustP * 32} ${-dustP * 14})`}>
              <path d="M 38 56 C 22 44, 34 24, 54 30 C 66 18, 92 26, 86 48 C 92 64, 54 68, 38 56 Z" fill="#D6D1C4" opacity={0.55} />
            </g>
            <g transform={`translate(${dustP * 34} ${-dustP * 16})`}>
              <path d="M 352 54 C 340 36, 362 20, 382 28 C 398 20, 418 36, 404 56 C 392 68, 362 66, 352 54 Z" fill="#D6D1C4" opacity={0.55} />
            </g>
          </BoilSvg>
        </Place>
      ) : null}

      <Pop x={600} y={136} sec={sec} at={tAbsorb + 0.15} rot={-2.2} z={14}>
        <Scribble text={"積ん読タワーに\n吸収…"} size={44} polarity="black" color="#D6D1C4" align="center" outline />
      </Pop>

      {/* 中央→右：元に戻る手描きループ矢印 */}
      <Place x={988} y={248} z={8}>
        <BoilSvg width={240} height={240} viewBox="0 0 240 240" scale={2.4}>
          <DrawPath
            d="M 28 164 C 46 66, 152 38, 206 106 C 228 134, 214 186, 174 198 C 138 208, 108 188, 108 158 C 108 124, 152 108, 202 124"
            sec={sec}
            at={tOldLife}
            dur={0.7}
            stroke="#FFCC00"
            width={6.5}
          />
          <DrawPath
            d="M 184 110 L 208 125 L 182 138"
            sec={sec}
            at={tOldLife + 0.62}
            dur={0.18}
            stroke="#FFCC00"
            width={6.5}
          />
        </BoilSvg>
      </Place>

      {/* 右：ベッドで横になってスマホを見る「元の生活」棒人間 */}
      {sec >= tOldLife + 0.2 ? (
        <Place x={1196} y={228} z={12}>
          <div style={{ transform: `scale(${interpolate(lazySp, [0, 1], [0.55, 1])})`, transformOrigin: '50% 70%' }}>
            <BoilSvg width={610} height={410} viewBox="0 0 610 410" scale={3.0}>
              {/* スマホ画面の青い照り返し光 */}
              <path
                d="M 294 128 L 194 166 L 236 258 L 328 176 Z"
                fill="#38BDF8"
                opacity={screenGlow}
              />

              {/* Zzz＆ダラダラ注釈 */}
              <text x={118} y={132} fill="#A8A29E" fontFamily={FONT_HAND} fontWeight={700} fontSize={32} transform="rotate(-12 118 132)">
                ゴロゴロ…
              </text>
              <text x={368} y={102} fill="#38BDF8" fontFamily={FONT_MARU} fontWeight={900} fontSize={30} transform="rotate(6 368 102)">
                スマホ 2時間
              </text>

              {/* ベッドフレーム＆布団 */}
              <path
                d="M 48 296 C 198 290, 412 292, 562 296 C 566 322, 564 344, 560 356 L 50 356 Z"
                fill="#3F3B36"
                stroke="#D6D1C4"
                strokeWidth={5}
                strokeLinejoin="round"
              />
              <path d="M 64 356 L 62 392 M 544 356 L 546 392" stroke="#D6D1C4" strokeWidth={7} strokeLinecap="round" />
              {/* 枕 */}
              <path
                d="M 68 258 C 102 246, 152 248, 178 264 C 182 280, 174 294, 156 296 L 74 296 C 62 292, 60 272, 68 258 Z"
                fill="#FAF8F3"
                stroke="#D6D1C4"
                strokeWidth={4}
              />

              {/* 仰向けで寝転ぶ棒人間 */}
              {/* 頭 */}
              <path
                d="M 164 210 C 188 206, 206 222, 204 244 C 202 266, 182 276, 162 274 C 142 272, 130 256, 132 236 C 134 218, 148 212, 164 210 Z"
                fill="none"
                stroke="#FFCC00"
                strokeWidth={10.5}
              />
              {/* 眠そうな半目 */}
              <path d="M 162 232 L 178 232 M 184 232 L 196 232" stroke="#FFCC00" strokeWidth={4.5} strokeLinecap="round" />
              <path d="M 176 252 C 182 252, 188 253, 192 252" stroke="#FFCC00" strokeWidth={4.5} strokeLinecap="round" />
              {/* 寝転んだ胴体と曲げた脚 */}
              <path d="M 204 258 C 258 264, 318 268, 376 270" stroke="#FFCC00" strokeWidth={11} strokeLinecap="round" fill="none" />
              <path d="M 376 270 C 424 236, 462 248, 496 290" stroke="#FFCC00" strokeWidth={11} strokeLinecap="round" fill="none" />
              <path d="M 376 270 C 434 268, 488 278, 534 288" stroke="#FFCC00" strokeWidth={10.5} strokeLinecap="round" fill="none" />
              {/* スマホを顔の前に掲げる腕 */}
              <path d="M 236 262 C 254 222, 276 190, 304 166" stroke="#FFCC00" strokeWidth={10} strokeLinecap="round" fill="none" />
              {/* 手描きスマホ本体 */}
              <path
                d="M 296 124 L 326 134 L 310 182 L 280 172 Z"
                fill="#1C1917"
                stroke="#38BDF8"
                strokeWidth={4.5}
                strokeLinejoin="round"
              />
            </BoilSvg>
          </div>
        </Place>
      ) : null}

      {/* 「完全復活」スタンプ */}
      <Place x={1326} y={628} z={20}>
        <PolarityStamp
          text="元の生活 復活"
          sec={sec}
          at={tRevive}
          polarity="black"
          color="#FF4D4D"
          rotateDeg={-7}
          fontSize={62}
        />
      </Place>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* CUT 4: c10 — 94研究メタ分析＆If-Then条件分岐ブループリント（grid_paper）      */
/* -------------------------------------------------------------------------- */

export const C10MetaIfThenBlueprint: React.FC<StickmanSceneProps> = ({
  sec,
  shotDurationSec,
  cue,
  resolveAsset,
}) => {
  const { fps } = useVideoConfig();
  const gollwitzer = resolveAsset('person_gollwitzer');

  // 15.7秒の長尺カットを全8語句キューで2幕構成（前半: 94研究＆やる気✕ / 後半: If-Then 設計図起動）
  const tGollwitzer = cue('ゴルヴィッツァー', 0.12);
  const tStudies94 = cue('94の研究', 1.45);
  const tMeta = cue('メタ分析', 3.3);
  const tGoalRate = cue('目標達成率', 4.95);
  const tMotivation = cue('モチベーション', 7.25);
  const tNotMotiv = cue('高さではなく', 8.4);
  const tIfX = cue('もしエックス', 9.75);
  const tThenY = cue('ワイをする', 11.4);
  const tDesign = cue('条件分岐の設計', 13.35);

  // 後半（If-Then 登場）に入ったら前半の証拠パートをすっきり上にスライド＆縮小して設計図を主役化
  const act2P = beatProgress(sec, tIfX - 0.15, tIfX + 0.42, true);
  const evidenceScale = interpolate(act2P, [0, 1], [1, 0.78]);
  const evidenceY = interpolate(act2P, [0, 1], [0, -28]);
  const evidenceOpacity = interpolate(act2P, [0, 1], [1, 0.72]);

  // やる気ゲージの針（上昇してから赤バツでガクッと折れる！）
  const gaugeUp = beatProgress(sec, tMotivation, tMotivation + 0.65, true);
  const gaugeCrash = beatProgress(sec, tNotMotiv + 0.18, tNotMotiv + 0.55, true);
  const gaugeAngle = interpolate(gaugeUp, [0, 1], [-68, 52]) - gaugeCrash * 112;
  const gaugeOpacity = interpolate(act2P, [0, 0.65], [1, 0], { extrapolateRight: 'clamp' });

  // 後半の棒人間・If-Then スプリング
  const ifSp = snapAt(sec, tIfX, fps, 420, 20, 0.6);
  const thenSp = snapAt(sec, tThenY, fps, 420, 20, 0.6);
  const pointerSp = snapAt(sec, tDesign - 0.2, fps, 380, 18, 0.62);

  return (
    <div style={{ position: 'relative', width: 1920, height: 890 }}>
      {/* ==================== 上段：一次エビデンス帯（ゴルヴィッツァー実写＋94論文連打） ==================== */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateY(${evidenceY}px) scale(${evidenceScale})`,
          transformOrigin: '50% 10%',
          opacity: evidenceOpacity,
        }}
      >
        {/* 左上：ピーター・ゴルヴィッツァー教授 本人実写ポラロイド */}
        {gollwitzer ? (
          <PhotoScrap
            src={gollwitzer.src}
            sec={sec}
            at={tGollwitzer}
            x={108}
            y={72}
            w={280}
            h={320}
            rot={-2.6}
            tape
            polarity="grid_paper"
            labelJa="P. ゴルヴィッツァー"
            objectPosition={gollwitzer.item.objectPosition ?? '50% 20%'}
            durationSec={Math.max(2, shotDurationSec - tGollwitzer)}
            z={8}
          />
        ) : null}

        {/* 上部見出し＆鉛筆アンダーライン */}
        <Pop x={428} y={66} sec={sec} at={tGollwitzer + 0.18} rot={-0.8} z={8}>
          <Scribble
            text="ゴルヴィッツァー ＆ シーランのメタ分析"
            size={42}
            polarity="grid_paper"
            color="#1C1917"
            font={FONT_MARU}
            weight={900}
          />
        </Pop>
        <Place x={422} y={118} z={7}>
          <BoilSvg width={780} height={32} viewBox="0 0 780 32" scale={2.0}>
            <DrawPath
              d="M 8 18 C 220 12, 540 20, 760 14"
              sec={sec}
              at={tGollwitzer + 0.35}
              dur={0.45}
              stroke="#1D4ED8"
              width={4.5}
            />
          </BoilSvg>
        </Place>

        {/* 左中：特大赤インク数字「94」 */}
        <Pop x={428} y={156} sec={sec} at={tStudies94 + 0.3} rot={-3} z={10}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div
              style={{
                fontFamily: FONT_MARU,
                fontSize: 126,
                fontWeight: 900,
                lineHeight: 0.95,
                color: '#E62E2D',
                textShadow: '4px 5px 0 rgba(28, 25, 23, 0.14)',
              }}
            >
              94
            </div>
            <Scribble text="の独立研究を統合" size={32} polarity="grid_paper" color="#1C1917" />
          </div>
        </Pop>

        {/* 右上：94枚の論文シート実体連打（StaggeredItemGrid） */}
        <Place x={756} y={144} z={9}>
          <StaggeredItemGrid
            count={94}
            itemShape="paper_sheet"
            highlightCount={0}
            columns={16}
            sec={sec}
            startSec={tStudies94}
            spanSec={2.0}
            polarity="grid_paper"
            width={1030}
            height={270}
            boil
          />
        </Place>

        {/* メタ分析の赤ペン統合ブラケット */}
        <Place x={744} y={398} z={10}>
          <BoilSvg width={1050} height={74} viewBox="0 0 1050 74" scale={2.2}>
            <DrawPath
              d="M 16 8 C 24 38, 490 22, 524 52 C 558 22, 1024 38, 1034 8"
              sec={sec}
              at={tMeta}
              dur={0.55}
              stroke="#E62E2D"
              width={5}
            />
          </BoilSvg>
        </Place>
        <Pop x={1152} y={448} sec={sec} at={tMeta + 0.38} rot={-1.2} z={11}>
          <Scribble text="メタ分析で判明！" size={34} polarity="grid_paper" color="#E62E2D" font={FONT_MARU} weight={900} />
        </Pop>
      </div>

      {/* ==================== 第1幕後半（4.95s〜9.8s）：やる気ゲージ → 赤ペン大バツで叩き斬る ==================== */}
      <Window sec={sec} from={tGoalRate} to={tIfX + 0.45}>
        <div style={{ position: 'absolute', inset: 0, opacity: gaugeOpacity }}>
          {/* 問いかけタグ */}
          <Pop x={128} y={488} sec={sec} at={tGoalRate} rot={-1.5} z={12}>
            <HandDrawnFrame polarity="grid_paper" bg="#FAF8F3" borderColor="#1C1917" tape padding="16px 28px">
              <div style={{ fontFamily: FONT_MARU, fontSize: 38, fontWeight: 900, color: '#1C1917' }}>
                目標達成率を押し上げたのは…？
              </div>
            </HandDrawnFrame>
          </Pop>

          {/* 中央〜右：手描き「モチベーション（気合）メーター」＆巨大赤バツ */}
          <Pop x={790} y={482} sec={sec} at={tMotivation} rot={1.2} z={12}>
            <div style={{ position: 'relative' }}>
              <BoilSvg width={560} height={330} viewBox="0 0 560 330" scale={2.6}>
                {/* 半円メーター枠 */}
                <path
                  d="M 76 238 C 76 112, 174 52, 280 52 C 386 52, 484 112, 484 238"
                  fill="#FAF8F3"
                  stroke="#1C1917"
                  strokeWidth={6}
                  strokeLinecap="round"
                />
                <path d="M 60 238 L 500 238" stroke="#1C1917" strokeWidth={5.5} strokeLinecap="round" />
                {/* 目盛り */}
                <path d="M 122 146 L 142 160 M 280 62 L 280 86 M 438 146 L 418 160" stroke="#57534E" strokeWidth={5} strokeLinecap="round" />
                <text x={118} y={220} fill="#57534E" fontFamily={FONT_HAND} fontWeight={700} fontSize={22}>
                  低
                </text>
                <text x={428} y={220} fill="#DC2626" fontFamily={FONT_MARU} fontWeight={900} fontSize={24}>
                  MAX!!
                </text>

                {/* 動くメーター針 */}
                <g transform={`translate(280 236) rotate(${gaugeAngle})`}>
                  <path d="M 0 0 L 0 -142" stroke="#E62E2D" strokeWidth={9} strokeLinecap="round" />
                  <path d="M -14 0 C -14 -14, 14 -14, 14 0 C 14 14, -14 14, -14 0 Z" fill="#1C1917" />
                </g>

                <text x={280} y={292} textAnchor="middle" fill="#1C1917" fontFamily={FONT_MARU} fontWeight={900} fontSize={38}>
                  モチベーションの高さ
                </text>

                {/* 「高さではなく」で巨大赤ペンバツが2画で叩き斬る！ */}
                <DrawPath
                  d="M 88 54 C 210 132, 336 206, 474 286"
                  sec={sec}
                  at={tNotMotiv}
                  dur={0.22}
                  stroke="#E62E2D"
                  width={16}
                />
                <DrawPath
                  d="M 472 54 C 350 132, 224 206, 86 286"
                  sec={sec}
                  at={tNotMotiv + 0.18}
                  dur={0.22}
                  stroke="#E62E2D"
                  width={16}
                />
              </BoilSvg>
            </div>
          </Pop>

          {/* 右端で首を傾げる濃墨棒人間 */}
          <Pop x={1418} y={506} sec={sec} at={tNotMotiv + 0.15} rot={0} z={13}>
            <BoilSvg width={250} height={280} viewBox="0 0 250 280" scale={2.8}>
              <path d="M 118 54 C 142 52, 156 68, 154 90 C 152 112, 134 122, 114 120 C 94 118, 84 100, 86 80 C 88 62, 102 56, 118 54 Z" fill="none" stroke="#1C1917" strokeWidth={10} />
              <path d="M 104 82 L 114 86 M 136 82 L 126 86" stroke="#1C1917" strokeWidth={4.5} strokeLinecap="round" />
              <path d="M 106 104 C 116 98, 126 98, 134 104" stroke="#1C1917" strokeWidth={4.5} strokeLinecap="round" fill="none" />
              <path d="M 118 122 C 116 156, 118 188, 116 218" stroke="#1C1917" strokeWidth={10.5} strokeLinecap="round" fill="none" />
              <path d="M 118 148 C 146 154, 154 134, 136 118" stroke="#1C1917" strokeWidth={9.5} strokeLinecap="round" fill="none" />
              <path d="M 118 148 C 88 164, 84 186, 104 188" stroke="#1C1917" strokeWidth={9.5} strokeLinecap="round" fill="none" />
              <path d="M 116 218 C 102 244, 92 262, 86 274 M 116 218 C 132 244, 142 262, 148 274" stroke="#1C1917" strokeWidth={10} strokeLinecap="round" fill="none" />
              <text x={182} y={70} fill="#E62E2D" fontFamily={FONT_HAND} fontWeight={700} fontSize={36}>
                違う!?
              </text>
            </BoilSvg>
          </Pop>
        </div>
      </Window>

      {/* ==================== 第2幕（9.75s〜15.7s）：If-Then 条件分岐ブループリント起動 ==================== */}
      {sec >= tIfX ? (
        <>
          {/* 左：IF 紙片カード（もし X が起きたら） */}
          <Place x={122} y={406} z={15}>
            <div
              style={{
                transform: `translateY(${interpolate(ifSp, [0, 1], [34, 0])}px) rotate(-1.6deg) scale(${interpolate(ifSp, [0, 1], [0.7, 1])})`,
                opacity: interpolate(ifSp, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
              }}
            >
              <HandDrawnFrame
                width={540}
                polarity="grid_paper"
                bg="#FAF8F3"
                borderColor="#1C1917"
                strokeWidth={5}
                tape
                tapeColor="rgba(59, 130, 246, 0.42)"
                padding="24px 28px"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
                  <span style={{ fontFamily: FONT_SANS, fontWeight: 900, fontSize: 32, color: '#1D4ED8', letterSpacing: '0.06em' }}>
                    IF
                  </span>
                  <span style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 28, color: '#57534E' }}>
                    （きっかけ・トリガー）
                  </span>
                </div>
                <div style={{ fontFamily: FONT_MARU, fontWeight: 900, fontSize: 50, color: '#1C1917', lineHeight: 1.2 }}>
                  もし <span style={{ color: '#1D4ED8' }}>X</span> が起きたら
                </div>
              </HandDrawnFrame>
            </div>
          </Place>

          {/* 中央：分岐ひし形ノード ◇ と手描き赤矢印（DrawPath） */}
          <Place x={654} y={432} z={16}>
            <BoilSvg width={296} height={164} viewBox="0 0 296 164" scale={2.4}>
              {/* 入口線 */}
              <DrawPath d="M 10 82 C 36 80, 62 82, 86 82" sec={sec} at={tIfX + 0.55} dur={0.28} stroke="#1C1917" width={6} />
              {/* 条件分岐のひし形 ◇ */}
              <DrawPath
                d="M 142 22 L 198 82 L 142 142 L 86 82 Z"
                sec={sec}
                at={tIfX + 0.78}
                dur={0.45}
                stroke="#E62E2D"
                width={6}
                fill="#FEF9C3"
              />
              {sec >= tIfX + 1.05 ? (
                <text x={142} y={91} textAnchor="middle" fill="#1C1917" fontFamily={FONT_MARU} fontWeight={900} fontSize={26}>
                  条件
                </text>
              ) : null}
              {/* 出口の太赤矢印 */}
              <DrawPath d="M 198 82 C 228 80, 256 82, 282 82" sec={sec} at={tThenY - 0.15} dur={0.3} stroke="#E62E2D" width={7} />
              <DrawPath d="M 262 66 L 284 82 L 262 98" sec={sec} at={tThenY + 0.08} dur={0.18} stroke="#E62E2D" width={7} />
            </BoilSvg>
          </Place>

          {/* 右：THEN 紙片カード（Y をする） */}
          {sec >= tThenY ? (
            <Place x={946} y={406} z={15}>
              <div
                style={{
                  transform: `translateY(${interpolate(thenSp, [0, 1], [34, 0])}px) rotate(1.4deg) scale(${interpolate(thenSp, [0, 1], [0.7, 1])})`,
                  opacity: interpolate(thenSp, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
                }}
              >
                <HandDrawnFrame
                  width={540}
                  polarity="grid_paper"
                  bg="#ECFDF5"
                  borderColor="#15803D"
                  strokeWidth={5}
                  tape
                  tapeColor="rgba(34, 197, 94, 0.42)"
                  padding="24px 28px"
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontFamily: FONT_SANS, fontWeight: 900, fontSize: 32, color: '#15803D', letterSpacing: '0.06em' }}>
                        THEN
                      </span>
                      <span style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 28, color: '#57534E' }}>
                        （固定アクション）
                      </span>
                    </div>
                    <BoilSvg width={48} height={44} viewBox="0 0 48 44" scale={1.8}>
                      <DrawPath d="M 8 24 L 20 36 L 42 8" sec={sec} at={tThenY + 0.35} dur={0.32} stroke="#15803D" width={7} />
                    </BoilSvg>
                  </div>
                  <div style={{ fontFamily: FONT_MARU, fontWeight: 900, fontSize: 50, color: '#1C1917', lineHeight: 1.2 }}>
                    <span style={{ color: '#15803D' }}>Y</span> を実行する
                  </div>
                </HandDrawnFrame>
              </div>
            </Place>
          ) : null}

          {/* 右端：目標達成率がグイッと上がるミニ手描きグラフ */}
          <Place x={1512} y={404} z={15}>
            <BoilSvg width={296} height={224} viewBox="0 0 296 224" scale={2.2}>
              {/* 軸線 */}
              <DrawPath d="M 34 24 L 34 184 L 274 184" sec={sec} at={tThenY + 0.45} dur={0.38} stroke="#1C1917" width={5} />
              {/* 気合だけの点線（横ばい） */}
              <DrawPath d="M 40 162 C 110 156, 180 158, 256 154" sec={sec} at={tThenY + 0.65} dur={0.4} stroke="#78716C" width={3.5} dash="8 8" />
              {/* If-Then 急上昇カーブ */}
              <DrawPath
                d="M 40 162 C 102 152, 166 112, 252 38"
                sec={sec}
                at={tDesign - 0.45}
                dur={0.62}
                stroke="#E62E2D"
                width={8}
              />
              <DrawPath d="M 232 36 L 256 35 L 252 58" sec={sec} at={tDesign + 0.12} dur={0.18} stroke="#E62E2D" width={7} />
              {sec >= tDesign ? (
                <text x={154} y={214} textAnchor="middle" fill="#E62E2D" fontFamily={FONT_MARU} fontWeight={900} fontSize={24}>
                  目標達成率 UP!
                </text>
              ) : null}
            </BoilSvg>
          </Place>

          {/* 下段左：条件分岐を指差す濃墨棒人間 */}
          {sec >= tDesign - 0.2 ? (
            <Place x={198} y={606} z={16}>
              <div style={{ transform: `scale(${interpolate(pointerSp, [0, 1], [0.55, 1])})`, transformOrigin: '50% 85%' }}>
                <BoilSvg width={220} height={236} viewBox="0 0 220 236" scale={2.6}>
                  <path d="M 88 38 C 108 36, 120 50, 118 68 C 116 86, 102 96, 84 94 C 68 92, 58 78, 60 60 C 62 46, 74 40, 88 38 Z" fill="none" stroke="#1C1917" strokeWidth={9.5} />
                  <path d="M 96 62 L 98 63 M 108 62 L 110 63" stroke="#1C1917" strokeWidth={5.5} strokeLinecap="round" />
                  <path d="M 92 78 C 98 84, 106 83, 112 77" stroke="#1C1917" strokeWidth={4.5} strokeLinecap="round" fill="none" />
                  <path d="M 88 96 C 90 124, 88 152, 88 176" stroke="#1C1917" strokeWidth={10} strokeLinecap="round" fill="none" />
                  {/* 上（If-Then設計図）を指す右腕 */}
                  <path d="M 90 116 C 122 104, 148 82, 174 58" stroke="#1C1917" strokeWidth={9.5} strokeLinecap="round" fill="none" />
                  <path d="M 160 54 L 178 54 L 176 72" stroke="#1C1917" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <path d="M 88 120 C 64 132, 60 150, 76 158" stroke="#1C1917" strokeWidth={9} strokeLinecap="round" fill="none" />
                  <path d="M 88 176 C 74 200, 66 216, 62 228 M 88 176 C 102 200, 110 216, 116 228" stroke="#1C1917" strokeWidth={9.5} strokeLinecap="round" fill="none" />
                </BoilSvg>
              </div>
            </Place>
          ) : null}

          {/* 下段中央〜右：「具体的な条件分岐の設計」スタンプ＆結論 */}
          <Pop x={448} y={662} sec={sec} at={tDesign - 0.1} rot={-0.8} z={16}>
            <Scribble
              text="気合ではなく、あらかじめ「回路」を組む"
              size={38}
              polarity="grid_paper"
              color="#1C1917"
              font={FONT_HAND}
              weight={700}
            />
          </Pop>

          <Place x={1196} y={668} z={20}>
            <PolarityStamp
              text="条件分岐の設計"
              sec={sec}
              at={tDesign + 0.35}
              polarity="grid_paper"
              color="#E62E2D"
              rotateDeg={-6}
              fontSize={66}
            />
          </Place>
        </>
      ) : null}
    </div>
  );
};

export const V1_NEON_4CUT_SCENES: Record<string, React.FC<StickmanSceneProps>> = {
  C01BookstoreHook,
  C02SaladChickenIllusion,
  C03TsundokuRevival,
  C10MetaIfThenBlueprint,
};
