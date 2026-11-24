# `yt_engine.audio` — 路線A 共通音声・SFX・ミキシングモジュール

海外バズ再現（`easy, actually` 路線A）で確立した**「音声先行タイムライン × 静寂と転換点ピアノビートの緩急 × -14.0 LUFS YouTube最適音圧」**を、全エピソードで再利用できる Python パッケージです。

## モジュール構成

| ファイル | 役割 |
| :--- | :--- |
| `tts_provider.py` | 全ハーネス共通のプロバイダ抽象化・設定解決（`resolve_tts_config` / `resolve_tts_cache_dir` / `create_tts_client`） |
| `tts_elevenlabs.py` | ElevenLabs `eleven_v4` TTS（`language_code="ja"`, `with-timestamps` 文字単位同期, 既定ボイス Liam `TX3LPaxmHKxFdv7VOQHJ`＋明示 `"auto"` 指定時の自声PVC/IVC優先または日本語知的男性ボイス自動選定, `output_format` 段階フォールバック, 非破壊前後トリム） |
| `tts_gemini.py` | Gemini `v1beta` TTS（`gemini-3.8-flash-tts` 等）呼び出し、2キー自動フェイルオーバー＆レート制御、429原因判別＆サーキットブレーカー、純日本語整形、`silenceremove` 無音圧縮、`atempo` 微調整、`ffprobe` 実尺計測、JSON / TS タイムライン出力 |
| `sfx_synth.py` | 48 kHz ステレオ合成 SFX（標準 20 種＋エピソード固有カスタム合成）、立ち上がり 0ms・統一音圧 WAV 出力、BGM 生成、`ffmpeg loudnorm` マスターミキサー |
| `__init__.py` | 主要クラス・関数・プリセットの一括エクスポート |

---

## SFX カタログ（標準 20 種＋カスタム合成）

ch1（`stickman-collage`）・ch2（`plan-e-macro-econ`）共通で、検証済みの **標準 20 種合成 SFX** を `studio/public/sfx/<kind>.wav`（48kHz / 16-bit Stereo PCM・立ち上がり 0ms・統一音圧）として常設し、Remotion TSX 側から共通 `<SfxCue>` で視覚ヒットフレームへ直結配置する。定番 20 種で噛み合わないフックや固有ギミックでは、演出担当がその場でエピソード固有のカスタム合成 WAV を自作・配置する。

| 用途カテゴリ | `kind`（標準 20 種：`STANDARD_SFX_KINDS`） |
| :--- | :--- |
| 紙・文具・軽ポップ | `paper_snap`（紙スナップ）、`pen_scratch`（ペン摩擦）、`soft_pop`（ソフトポップ） |
| 移動・機械・切替 | `whoosh`（風切り）、`mech_slide`（機械スライド）、`projector_click`（プロジェクター切替）、`camera_shutter`（シャッター） |
| 打撃・確定・強調 | `impact_thud`（低音インパクト）、`stamp_thud`（スタンプ押印）、`mallet_bonk`（木槌ノック）、`armor_clang`（金属クラング） |
| 数値・通知・通信 | `chart_tick`（グラフ点灯）、`price_ping`（値札ベル）、`radar_beep`（照準ビープ）、`data_chirp`（データ通信） |
| 警告・異常・コミカル | `error_buzzer`（警告ブザー）、`vhs_pause`（VHS 停止）、`glitch_burst`（グリッチ）、`question_boing`（疑問ボヨヨン）、`dizzy_spin`（回転めまい） |

- **標準 20 種一括書き出し**: `.\pipeline\.venv\Scripts\python.exe pipeline/scripts/build_sfx.py export-standard --force`
  （`studio/public/sfx/<kind>.wav` へ一括生成。立ち上がり 0ms・ピーク上限 `SFX_TARGET_PEAK=0.78`・有音 RMS 上限 `SFX_TARGET_ACTIVE_RMS=0.22` で統一）
- **エピソード固有カスタム合成**: `.\pipeline\.venv\Scripts\python.exe pipeline/scripts/build_sfx.py custom --slug <slug> --name <name> --layer "impact_thud@0.0:1.0" --sweep "640:140:0.22:0.02:0.4:triangle"`
  または Python の `render_custom_sfx()` / `export_episode_custom_sfx()` で `studio/public/episodes/<slug>/sfx/<name>.wav` へ同フォーマット・統一音圧で生成し、`<SfxCue src="episodes/<slug>/sfx/<name>.wav" atSec={...} />` で直結配置する。
- **TSX 配置・音圧設計（-14.0 LUFS 保証）**:
  - 共通コンポーネント [`studio/src/components/SfxCue.tsx`](../../../../studio/src/components/SfxCue.tsx)（ch1/ch2 の `index.ts` から再公開）は鳴る区間のみ `<Sequence layout="none">` でラップし長尺負荷を抑える。
  - 既定音量 `SFX_DEFAULT_VOLUME = 0.35`（控えめ `0.24` / 強調 `0.48` / 上限目安 `0.65`）により `-14 LUFS` ナレーション上でのクリップを防ぎ、Remotion 書き出し後に `pipeline/scripts/master_final.py`（`-c:v copy`＋2パス `loudnorm -14.0 LUFS / -1.4 dBTP`）で最終音圧を確定する。
- **後方互換・テスト**: 旧エピソードの `spec.json` の `sfx` 指定や互換エイリアス（`LEGACY_SFX_ALIASES`）は `resolve_sfx_kind()` で標準 20 種へ自動解決される。検証: `.\pipeline\.venv\Scripts\python.exe -m unittest discover -s pipeline/tests -p test_sfx_library.py`。

---

## クイック使用例

```python
from pathlib import Path
from yt_engine.audio import (
    GeminiTTSClient,
    NarrationChunk,
    SfxEvent,
    assemble_narration_track,
    build_audio_first_timeline,
    export_timeline_manifest,
    mix_master_audio,
    piano_chord_progression,
    render_sfx_track,
)

# 1. 純日本語ナレーションチャンクを定義（英語指示文は絶対に入れない）
chunks = [
    NarrationChunk("c01", "最初に結論からお伝えします。", pause_after_sec=0.35),
    NarrationChunk("c02", "多くの人が見落としているのは、この一点です。", pause_after_sec=0.45),
]

# 2. Gemini TTS 生成＆ffprobe実尺取得（※有料APIコールのため実行許可後に呼ぶ）
tts_dir = Path("work/tts")
client = GeminiTTSClient(voice_name="Charon")
results, used_model = client.synthesize_chunks(chunks, tts_dir)
durations = {r.chunk_id: r.duration_sec for r in results}

# 3. 音声先行タイムライン確定 & JSON / TS 書き出し
timeline = build_audio_first_timeline(chunks, durations, tts_dir)
export_timeline_manifest(timeline, Path("work/timeline.json"), Path("work/timelineData.ts"))

# 4. ナレーション・SFX・転換点ピアノを合成し -14.0 LUFS へ仕上げる
total_dur = timeline["totalDurationSec"]
narr_wav = assemble_narration_track(
    [(Path(info["pacedWav"]), info["startSec"]) for info in timeline["chunks"].values()],
    total_dur,
    Path("work/narration.wav"),
)
sfx_wav = render_sfx_track(
    total_dur,
    [SfxEvent("paper_snap", time_sec=timeline["chunks"]["c02"]["startSec"], pan=-0.15)],
    Path("work/sfx.wav"),
)
piano_wav = piano_chord_progression([5.0, 6.0], total_dur, Path("work/piano.wav"))

mix_master_audio(
    Path("work/master_audio.mp3"),
    total_dur,
    narration_wav=narr_wav,
    sfx_wav=sfx_wav,
    piano_wav=piano_wav,
)
```

---

## 2キー自動フェイルオーバー・レート制御・サーキットブレーカー (`GeminiKeyPool`)

Paid Tier 1 の TTS レート制限（10 RPM = 約 6 秒に 1 回）での 429 バックオフ滞留を防ぐため、`tts_gemini.py` の `GeminiKeyPool` / `GeminiTTSClient` は以下の制御を標準で行います。

1. **環境変数（後方互換維持）:**
   - メインキー: `GEMINI_API_KEY`
   - サブキー: `GEMINI_API_KEY_FALLBACK`（任意。未設定時は単一キーで動作）
   - 重複キーおよび空文字は `resolve_gemini_api_keys()` により自動除外されます。
2. **キー単位ペーシング（最小 6.5 秒間隔）:**
   - 送信開始時刻ベースで各キーの `cooldown_until` を管理します（デフォルト `DEFAULT_KEY_MIN_INTERVAL_SEC = 6.5` 秒）。
   - API 応答時間や後処理時間が自動で差し引かれるため、不要なスリープが発生しません。
   - 2 キー運用時はメインキーがクールダウン中でもサブキーが待機可能であれば待機ゼロで即座に切り替えます。
3. **429 (`RESOURCE_EXHAUSTED`) 原因判別とサーキットブレーカー:**
   - **日次クォータ枯渇（`PerDay` / `daily` / `limit: 0` 等）:** `(key_index, model_name)` をセッション内で当日枯渇として記憶（サーキットブレーク）し、以降のチャンクでは再試行やバックオフを行わず即座にスキップします。
   - **毎分上限（`PerMinute` / `RPM` / 一時的 429）:** 例外内の `retryDelay`（例: `"12s"` / `Please retry in ...`）を優先採用してクールダウンを設定し、別キーが空いていれば即フェイルオーバーします（`retryDelay` が無い場合はジッター付き短バックオフ）。
4. **声質統一の保護:**
   - 途中から別モデルへ切り替わって声質が混ざるのを防ぐため、まず同一モデルで設定済み全キーを試行し、全キーでそのモデルが利用不可になった場合にのみ次モデルへフォールバックします。

---

## ElevenLabs `eleven_v4` ＆ 全ハーネス共通切替 (`tts_provider.py` / `tts_elevenlabs.py`)

全フォーマットビルダー（案A / 案B / 案C / 案E）から共通利用できる `create_tts_client` / `resolve_tts_config` を提供しています。

```python
from pathlib import Path
from yt_engine.audio import (
    NarrationChunk,
    create_tts_client,
    resolve_tts_cache_dir,
    resolve_tts_config,
)

cfg = resolve_tts_config(cli_provider="elevenlabs", cli_model="eleven_v4", cli_language="ja")
tts_dir = resolve_tts_cache_dir(Path("work"), cfg.provider, variant="eleven_v4")
client = create_tts_client(
    provider=cfg.provider,
    voice_name=cfg.voices[0],
    models=cfg.models,
    language_code=cfg.language_code,
    voice_settings=cfg.voice_settings,
    output_formats=cfg.output_formats,
    use_timestamps=cfg.use_timestamps,
)
results, model_used = client.synthesize_chunks(
    [NarrationChunk("c01", "仮説の質問です。")],
    tts_dir,
)
```

- **APIキー:** `.env` または環境変数 `ELEVENLABS_API_KEY` を自動参照します（ログ・JSON出力時は自動マスク）。
- **ボイス選定:** 未指定時は `configs/stack.yaml` 既定の **`Liam - Energetic, Social Media Creator`**（`TX3LPaxmHKxFdv7VOQHJ`）を使用します。環境変数 `ELEVENLABS_VOICE_ID` や `--tts-voice`（`voice_name` / `voice_id`）で上書きでき、明示的に `voice_id="auto"` を指定した場合はアカウント内の自声クローン（PVC / IVC）を最優先し、未登録時は日本語の落ち着いた知的解説向け男性ボイスを自動選定します。
- **`eleven_v4` 制約対応:** 非対応の `style` / `speed` / `use_speaker_boost` は送信せず、`language_code="ja"` と `stability` / `similarity_boost` を送信します。`with-timestamps` 取得時は内部無音を削らない非破壊前後トリムにより文字境界時刻の厳密同期を維持します。

---

## 運用上の絶対ルール

1. **純日本語テキストのみ送信:** Gemini TTS に `"Speak calmly:"` や `[pause]` 等の英語・ト書きを混ぜるとそのまま発話されるため、`sanitize_japanese_text` 経由の純日本語のみ渡すこと。
2. **有料API呼び出し注意:** `GeminiTTSClient.synthesize_chunk(s)` は有料APIを使用するため、ユーザーの明示的な許可なしに自動大量実行しない（`sfx_synth.py` はローカル処理のため API コスト不要）。
3. **音声ライセンス順守:** `gemini-3.8-flash-tts` は SynthID 透かし付与・無料枠商用不可。本番公開時は `configs/stack.yaml` の規約（自声クローンまたは許諾済み商用音声）を確認すること。
