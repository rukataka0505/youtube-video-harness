# ベンチマーク差分メモ（案E：`How Money Works` 冒頭60秒再現 & 全編17:39解析）

- **対象動画:** *If You Were TRYING To Destroy The Economy...* (`How Money Works` / `https://www.youtube.com/watch?v=OAVin6xxd8E`)
- **解析モデル:** `gemini-4-neon`（Pass 1: 冒頭60秒・`2.0 FPS high` / Pass 2: 全編 `17:39 = 1059.0s`・`0.5 FPS low`）
- **Remotion 再現対象:** [`HowMoneyWorksDestroyEconomy60s.tsx`](../../../studio/src/compositions/benchmarks/how_money_works_destroy_economy/HowMoneyWorksDestroyEconomy60s.tsx)（非公開ベンチマーク専用）

---

## 1. Gemini Pass 1 / Pass 2 実測ベンチマーク指標

### Pass 1（冒頭 0〜60秒・`01_gemini_analysis.json` / `01b_shot_breakdown.json`）
- **クリック期待回収:** `click_confirm_sec = 3.5s` / `has_greeting_or_logo_waste = false`
- **フック構造:** `hook_format = "question"` / `uses_negative_stakes = true`（「もし米国経済を壊そうとしたら？」という逆説的思考実験）
- **リズム密度:** `cut_count_0_60s = 19`, `avg_shot_len_sec = 3.0s`
- **パターン割込＆音響:** `first_interrupt_sec = 5.5s`（VHS一時停止効果＋無音間による反転）、`opening_sfx_present = true`、`vocal_energy_level = "conversational"`
- **主要カラー設計:** ダークチャコール `#121417` × 純白 `#FFFFFF` × お金エメラルド `#1E8E3E` を基軸に、暴落チャートで危機赤 `#CC0000` / `#1A0505`、IMF外貨準備チャートで白背景 `#F4F5F6` / `#E6E8EB` ＋ `#0072B2`、世界接続網で `#0E1014` ＋ `#E66C37` へ意図的に極端なコントラストを振っている。

### Pass 2（全編 17:39 = 1059.0秒・`04_pass2_macro.json` / `04b_chapter_blueprint.json`）
- **構造骨格:** 全 `11` 章 / `mini_arc_count = 7` / `open_loops = 8`（章内回収 6 本＋終盤接続 2 本）
- **平均リテンションリズム:** `avg_rehook_interval_sec = 104.7s` / `body_avg_shot_len_sec = 3.8s` / `pattern_interrupt_interval_sec = 18.5s` / `bgm_shift_count = 7`
- **収益導線＆終盤設計:** `monetization_ctas = 6`（11:06 書籍アフィリエイト / 11:24 シニカル文脈のままスポンサー橋渡し）、End-CTA は `12s`（`17:27-17:39`）で挨拶締めゼロのまま拡張ガイド次作へ直接接続＋4秒購読訴求。

---

## 2. Remotion 60秒再現の実測計測（音声先行パイプライン）

- **音声先行出力 (`benchmark_60s_spec.json`):**
  - 日本語ナレーション 11チャンク (`351` 文字、話者 `Charon`、`gemini-3.8-flash-tts` → 429時 `gemini-3.8-flash-lite-tts` 自動フェイルオーバー)、`appliedTempo = 0.92`
  - BGM/SE合成: `cynical_econ_groove_bgm`（115BPM 導入ドローン→`4.06s〜7.35s` 無音ブレイク→本線グルーヴ）＋ 12件SE (`mech_slide`, `stamp_thud`, `chart_tick`, `whoosh` 等) → 2パス `loudnorm`（入力 `-19.65 LUFS / -4.23 dBTP` → `-14.0 LUFS / -1.4 dBTP` 基準正規化）
  - タイムライン確定: `totalDurationSec = 59.133s`, `totalFrames = 1774` (`30fps`), `shotCount = 15`, `subtitleCount = 14`, B-Roll生成 4枚 (`gemini-nano-banana-2.1`)
- **動画書き出し実測（`preview_v1_60s.mp4` + `ffprobe`）:**
  - 解像度・映像: `h264`, `1920x1080`, `30/1 fps`
  - 音声: `aac`, `48000 Hz`, `2ch stereo`
  - 実尺・サイズ: `59.136s`, `9,173,789 bytes` (~8.75 MiB), `bitrate = 1,241,042 bps`

---

## 3. 視覚QAで検出・修正した差分ログ（PNG 8枚→修正後 4枚＋サムネ1枚検品）

代表8フレーム（`qa_frames/01_hook.png` 〜 `08_world_web.png`）およびサムネイル（`09_thumbnail_plan_e.png`）を書き出し直接目視検査した結果、以下3点を検出・修正した：

1. **暴落チャート注釈の背景埋没 (`03_crash_chart.png` / `EconChartWidget.tsx`)**
   - *現象:* `crash_curve` のピーク注釈「過熱」・ボトム注釈「サーキット停止」を赤裸文字で描画したところ、赤いデータ曲線・塗りつぶしと溶け合い視認性が落ちた。
   - *対策:* 各注釈背面に枠線付き不透明ピル `<rect>`（暗背景では `#0E1014`＋白文字 `#F8FAFC`）を追加し、文字がデータ線を跨がない高さへオフセットした。
2. **積み上げ棒グラフ凡例と出典の衝突 (`05_reserve_whiteboard.png` / `EconChartWidget.tsx`)**
   - *現象:* フッター1行に凡例と長い `sourceCitation` を横並び配置したため、`USD (米ド / ル)`・`EUR (ユー / ロ)` と途中改行され出典文字列と近接した。さらにカード下端が字幕上縁に近かった。
   - *対策:* `series` と `sourceCitation` が両方存在する場合は上下2段スタックに自動切替＋凡例項目へ `whiteSpace: 'nowrap'` を適用し、SVG高さを `height - 138` に抑えて字幕上部の余白を確保した。
3. **コラージュカードの不要な縦引き伸ばし (`06_industries_collage.png` / `SatireCollageStage.tsx`) & 終盤ループの遅いフェード (`08_world_web.png`)**
   - *現象:* 写真付きカードと並んだテキストカードの `alignItems: 'stretch'` により非写真カード下部に不要な空白が生まれていた。また終盤 `WorldNetworkOpenLoopScene` の問いかけ枠が `t=57.2s` 時点で半透明（約0.57）だった。
   - *対策:* `SatireCollageStage` を `alignItems: 'center'`・`justifyContent: 'center'`・`minHeight: 255` へ変更し締まりのある紙面比を回復。終盤問いかけのフェード完了を `localSec [1.1, 1.9]` に前倒ししてフル白文字表示を確認した。

---

## 4. 他フォーマットとの最終差別化定義（昇格固定）

- **対 案B (`planB_paint`):** 案Eでは案Bのような手描き棒人間および動物キャラクターは **一切使用せず**、案E専用の面構成2D進行役アバター（`EconHostAvatar`）のみを採用する。網羅リストではなく「逆説の検証→逆効果の構造分解」を軸にする。
- **対 案C路線A (`planC_collage`):** 7.5fps手描きボイル棒人間を使わず、実写動画Bロール・報道画面・木枠ホワイトボード・因果ネットワーク・風刺コラージュの組合せへ特化する。
- **対 案A (`planA_corporate_cinema`):** 個社・創業者の一代記ではなく、システムやルール設計そのものが生む構造的パラドックスに焦点を絞る。

---

## 5. v2 刷新差分（パワポ完全追放・実写動画Bロール＆本家19ショット忠実再現）

### 5.1 v1 からの構造的転換点（敗因解消）
- **v1 の敗因:** 暗背景＋角丸箇条書きカード・仮想チャート・静止画紙芝居への劣化により、本家 *How Money Works* の実写Bロール主軸のテンポ感と視覚密度を喪失していた。
- **v2 での撤廃・刷新:** パワポ・ダッシュボード風の箇条書き角丸カードおよび簡易ポリゴン世界地図を全面追放し、`01b_shot_breakdown.json` の全19ショット構成（0.0〜59.133s）を以下の実写動画Bロール＋物理演出＋実地図コンポーネント群で完全再構築した。

### 5.2 自律収集素材・音声・SFX（有料AI生成 API ゼロ追加で再現）
- **実写動画 Bロール 11本（Mixkit 自律取得・正規化）:** `01_wall_street_flag.mp4`, `03_trading_floor.mp4`, `04_crisis_box.mp4`, `05_news_anchor.mp4`, `06_park_meadow.mp4`, `09_manhattan_night.mp4`, `13_control_room.mp4`, `14_tech_campus.mp4`, `16_marketplace.mp4`, `17_intl_flags.mp4`, `18_signing_contracts.mp4` を自動取得し、FFmpeg で 1920x1080 / 30fps / H.264 / yuv420p / GOP 15 / 無音 MP4 へ正規化（ポスター画像 `01b_wall_street_poster.jpg` 併出力）。`build_plan_e_assets.py` に YouTube ドメイン（`youtube.com` / `youtu.be` / `googlevideo.com`）のコードレベル禁止検証を実装済み。
- **実写・風刺切り抜きストック 7点 & 実世界地図:** Wikimedia Commons より NYSE 実写・FRB エクルズビル・米国最高裁・SEC 本部・アンクルサム切り抜き（`849x960`）・マクシミリアン甲冑切り抜き（`460x904`）・Series 2009 `$100` 紙幣を取得・透過整形。また Wikimedia `BlankMap-World.svg` 準拠の 188 か国パス定義 `studio/src/components/plan_e/worldMapPaths.ts` を生成。
- **音声・SFX 刷新:** 既存日本語 TTS 11チャンク（キャッシュ再利用）に対し、`pipeline/src/yt_engine/audio/sfx_synth.py` へ `vhs_pause`, `glitch_burst`, `mallet_bonk`, `armor_clang`, `dizzy_spin`, `projector_click` の6種を追加し、-14.0 LUFS 2-Pass ラウドネス正規化済みマスター音声を維持。

### 5.3 ファーストクラス資産・パイプラインへの標準昇格
- **Remotion コンポーネント (`studio/src/components/plan_e/` & `PlanEMacroEconTemplate.tsx`):** `VideoBrollStage`, `VhsPauseAvatarStage`, `EconHostAvatar`, `BreakingNewsBroadcast`, `WhiteboardStage`, `SatireGagStage`, `ProjectorNetworkStage`, `WorldConnectionMap` の8コンポーネントを標準昇格し、`MacroEconCanvas` に `fullBleed` オプションとホワイトボード/世界地図用の明背景字幕自動切替を組み込んだ。
- **Spec・ビルダー・ハーネス標準化:** `pipeline/scripts/build_plan_e_assets.py` に `videoClips[]` / `stockImages[]` のスキーマ検証・自律調達・RGBA 切り抜き生成（`_cutout_stock_image_rgba`）を統合し、`episodes/_templates/plan_e_spec.example.json` および `harnesses/plan-e-macro-econ/`（`visual_system.md`, `qa_checklist.md`, `spec_contract.md`, `README.md`）へパワポカード禁止・動画Bロール比率基準・18種SFX仕様を明文化した。

### 5.4 `preview_v2_60s.mp4` 実測値＆ `qa_frames_v2/` 目視QA・修正ログ
- **`ffprobe` 実測 (`episodes/benchmarks/how-money-works-destroy-economy/preview_v2_60s.mp4`):**
  - Video: H.264 High / 1920x1080 / `yuv420p` / 30fps / `1774` frames / `59.133333s` / bitrate `4,760,211 bps`
  - Audio: AAC LC / 48,000 Hz / stereo / `59.136000s` / bitrate `317,375 bps`
  - Format: `37,599,303 bytes`（約 `37.6 MB`）/ total bitrate `5,086,485 bps`
- **目視QA (`qa_frames_v2/` 23フレーム全数確認) による検出・改修 5件:**
  1. **Shot 7b 甲冑切り抜き (`07b_knight_dizzy.png`):** 台座下端に閉じていた股下・腕間隙間の白背景と右床影残りを解消するため、`_cutout_stock_image_rgba`（`corner_bg_alpha`）へ無彩色グラデーションBFSと平坦内部背景穴の安全除去ロジックを追加し、`cropBox: [0.04, 0.0, 0.72, 0.806]`（`460x904`）と芝生下端接地（`bottom: 0, height: 775`）を適用。
  2. **Shot 10〜12 ホワイトボードペントレイ分離 (`10`, `11`, `12`):** 本体枠を `top: 28, bottom: 180` へ引き上げ、下部ペントレイと `CleanSubtitle` の重なりを解消。
  3. **Shot 11 企業ロゴ重なり解消 (`11_whiteboard_logos.png`):** 丸バッジサイズ（`192px`）と座標配置を調整し重なりゼロで盤面バランスを改善。
  4. **Shot 15 プロジェクターラベルフィット (`15_projector_network.png`):** `NETHERLANDS`（`"ETHERLAND"` への文字欠け）/ `SINGAPORE` / `SAUDI ARABIA` を半径拡張・2行 `<tspan>` 分割・文字数別縮小で円内に収め、スクリーン（`top: 38, bottom: 168`）とプロジェクターシルエット（`200x58`）を字幕から分離。
  5. **Shot 16 仲介握手構図 (`16_middleman_satire.png`):** 左右NPCを `left/right: 420, bottom: 50` へ寄せ、中央 `$?` アバターを `open_hands` にして両手の握手・仲介位置が噛み合うよう調整。
- **再抽出検品結果:** 上記改修後に再レンダリング・再抽出した6フレーム（`07b`, `10`, `11`, `12`, `15`, `16`）すべてで文字欠け・透過残り・字幕被り・幾何破綻がないことを目視確認済み。
