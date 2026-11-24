"""yt_engine.audio.tts_elevenlabs ＆ tts_provider 単体テスト。

有料 ElevenLabs API 呼び出し・実 .env 読込・実スリープを行わず、
モック HTTP クライアント・仮想時計・合成 WAV を使って検証する。
"""

from __future__ import annotations

import base64
import io
import json
import math
import os
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from yt_engine.audio import (
    DEFAULT_ELEVENLABS_VOICE_ID,
    DEFAULT_ELEVENLABS_VOICE_NAME,
    CharacterAlignment,
    ElevenLabsAuthError,
    ElevenLabsQuotaExceededError,
    ElevenLabsTTSClient,
    ElevenLabsVoiceInfo,
    GeminiTTSClient,
    NarrationChunk,
    TTSClientProtocol,
    align_chunks_with_character_alignment,
    create_tts_client,
    redact_elevenlabs_secret,
    resolve_elevenlabs_api_key,
    resolve_stack_tts_defaults,
    resolve_tts_cache_dir,
    resolve_tts_config,
    select_elevenlabs_voice,
)


class FakeClock:
    def __init__(self, start: float = 0.0) -> None:
        self.now = start
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, sec: float) -> None:
        self.sleeps.append(sec)
        self.now += sec


def _make_pcm_bytes_with_silence(
    *,
    lead_silence_sec: float,
    speech_segments: list[tuple[float, float]],
    tail_silence_sec: float,
    sample_rate: int = 48000,
) -> bytes:
    """無音区間＋正弦波区間を組み合わせた 16bit mono PCM バイト列を生成する。"""
    samples: list[int] = []

    def _add_silence(sec: float) -> None:
        samples.extend([0] * int(round(sec * sample_rate)))

    def _add_tone(sec: float, freq: float = 220.0, amp: float = 0.35) -> None:
        n = int(round(sec * sample_rate))
        for i in range(n):
            val = int(amp * 32767 * math.sin(2.0 * math.pi * freq * i / sample_rate))
            samples.append(val)

    _add_silence(lead_silence_sec)
    for idx, (dur, gap_after) in enumerate(speech_segments):
        _add_tone(dur, freq=210.0 + idx * 35.0)
        if gap_after > 0:
            _add_silence(gap_after)
    _add_silence(tail_silence_sec)
    return struct.pack(f"<{len(samples)}h", *samples)


class _FakeHttpResponse:
    def __init__(
        self,
        *,
        status_code: int = 200,
        json_data: dict | None = None,
        content: bytes = b"",
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self._json_data = json_data
        self.content = content
        self.headers = headers or {}
        self.text = json.dumps(json_data, ensure_ascii=False) if json_data is not None else ""

    def json(self):
        if self._json_data is None:
            raise ValueError("No JSON payload")
        return self._json_data


class _FakeHttpClient:
    def __init__(self, handler) -> None:
        self._handler = handler
        self.calls: list[dict] = []

    def get(self, url: str, *, headers=None, params=None):
        rec = {"method": "GET", "url": url, "headers": dict(headers or {}), "params": dict(params or {}), "json": None}
        self.calls.append(rec)
        return self._handler(rec)

    def post(self, url: str, *, headers=None, params=None, json=None):
        rec = {"method": "POST", "url": url, "headers": dict(headers or {}), "params": dict(params or {}), "json": json}
        self.calls.append(rec)
        return self._handler(rec)


class TestElevenLabsKeyAndVoiceSelection(unittest.TestCase):
    def test_resolve_api_key_rules(self) -> None:
        with patch("yt_engine.audio.tts_elevenlabs.load_dotenv") as mock_dotenv:
            key = resolve_elevenlabs_api_key("  sk_explicit_key_1234567890  ", load_env=True)
        mock_dotenv.assert_not_called()
        self.assertEqual(key, "sk_explicit_key_1234567890")

        with patch("yt_engine.audio.tts_elevenlabs.load_dotenv") as mock_dotenv:
            with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "sk_env_key_1234567890"}, clear=True):
                key2 = resolve_elevenlabs_api_key(None, load_env=True)
        mock_dotenv.assert_called_once()
        self.assertEqual(key2, "sk_env_key_1234567890")

        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ElevenLabsAuthError):
                resolve_elevenlabs_api_key(None, load_env=False)

    def test_voice_selection_priority(self) -> None:
        female_jp = ElevenLabsVoiceInfo(
            voice_id="v_female",
            name="Konoha JP",
            category="professional",
            is_owner=False,
            description="Calm female narrator",
            labels={"language": "ja", "gender": "female", "age": "middle_aged", "use_case": "narrative_story"},
            verified_languages=({"language": "ja", "model_id": "eleven_v4"},),
        )
        young_male_jp = ElevenLabsVoiceInfo(
            voice_id="v_young",
            name="Hinata JP",
            category="professional",
            is_owner=False,
            description="Young voice",
            labels={"language": "ja", "gender": "male", "age": "young", "use_case": "entertainment_tv"},
            verified_languages=({"language": "ja", "model_id": "eleven_v4"},),
        )
        calm_male_jp = ElevenLabsVoiceInfo(
            voice_id="v_koji",
            name="Koji - Japanese Narrator",
            category="professional",
            is_owner=False,
            description="Warm, confident, trustworthy mature Japanese male narrator for explainer videos",
            labels={
                "language": "ja",
                "gender": "male",
                "age": "middle_aged",
                "use_case": "narrative_story",
                "descriptive": "confident",
            },
            verified_languages=({"language": "ja", "model_id": "eleven_v4"},),
        )
        own_ivc = ElevenLabsVoiceInfo(
            voice_id="v_ivc",
            name="My IVC",
            category="cloned",
            is_owner=True,
            description="Own instant clone",
            labels={"language": "ja"},
            verified_languages=({"language": "ja", "model_id": "eleven_v4"},),
        )
        own_pvc = ElevenLabsVoiceInfo(
            voice_id="v_pvc",
            name="My PVC",
            category="professional",
            is_owner=True,
            description="Own professional clone",
            labels={"language": "ja"},
            verified_languages=({"language": "ja", "model_id": "eleven_v4"},),
        )

        # 1) 自声PVCが最優先、次にIVC
        self.assertEqual(
            select_elevenlabs_voice([calm_male_jp, own_ivc, own_pvc]).voice_id,
            "v_pvc",
        )
        self.assertEqual(
            select_elevenlabs_voice([calm_male_jp, own_ivc]).voice_id,
            "v_ivc",
        )
        # 2) 自声クローン不在時は日本語・落ち着いた知的解説向け男性ボイス
        self.assertEqual(
            select_elevenlabs_voice([female_jp, young_male_jp, calm_male_jp]).voice_id,
            "v_koji",
        )
        # 3) 明示指定（ID / 名前部分一致）が最優先
        self.assertEqual(
            select_elevenlabs_voice([female_jp, calm_male_jp, own_pvc], preferred_voice="Konoha").voice_id,
            "v_female",
        )
        self.assertEqual(
            select_elevenlabs_voice([young_male_jp, calm_male_jp, own_pvc], preferred_voice="v_young").voice_id,
            "v_young",
        )

    def test_default_voice_constants_and_client_precedence(self) -> None:
        self.assertEqual(DEFAULT_ELEVENLABS_VOICE_ID, "TX3LPaxmHKxFdv7VOQHJ")
        self.assertEqual(DEFAULT_ELEVENLABS_VOICE_NAME, "Liam - Energetic, Social Media Creator")

        env_clean = {k: v for k, v in os.environ.items() if k != "ELEVENLABS_VOICE_ID"}
        with patch.dict(os.environ, env_clean, clear=True):
            c_default = ElevenLabsTTSClient(api_key="sk_test_key_1234567890", load_env=False)
            self.assertEqual(c_default.voice_preference, "TX3LPaxmHKxFdv7VOQHJ")

            c_auto = ElevenLabsTTSClient(api_key="sk_test_key_1234567890", voice_id="auto", load_env=False)
            self.assertEqual(c_auto.voice_preference, "auto")

            c_explicit_id = ElevenLabsTTSClient(
                api_key="sk_test_key_1234567890",
                voice_id="W8wofKLOWnsM57L8hIx2",
                load_env=False,
            )
            self.assertEqual(c_explicit_id.voice_preference, "W8wofKLOWnsM57L8hIx2")

            c_explicit_name = ElevenLabsTTSClient(
                api_key="sk_test_key_1234567890",
                voice_name="Koji - Japanese Narrator",
                load_env=False,
            )
            self.assertEqual(c_explicit_name.voice_preference, "Koji - Japanese Narrator")

        # 環境変数 ELEVENLABS_VOICE_ID による上書きとコンストラクタ明示引数の最優先
        with patch.dict(os.environ, {**env_clean, "ELEVENLABS_VOICE_ID": "W8wofKLOWnsM57L8hIx2"}, clear=True):
            c_env = ElevenLabsTTSClient(api_key="sk_test_key_1234567890", load_env=False)
            self.assertEqual(c_env.voice_preference, "W8wofKLOWnsM57L8hIx2")

            c_override = ElevenLabsTTSClient(
                api_key="sk_test_key_1234567890",
                voice_id="auto",
                load_env=False,
            )
            self.assertEqual(c_override.voice_preference, "auto")

        with patch.dict(os.environ, {**env_clean, "ELEVENLABS_VOICE_ID": "auto"}, clear=True):
            c_env_auto = ElevenLabsTTSClient(api_key="sk_test_key_1234567890", load_env=False)
            self.assertEqual(c_env_auto.voice_preference, "auto")


class TestCharacterAlignment(unittest.TestCase):
    def test_exact_match_and_pause_midpoint(self) -> None:
        text = "市場は繊細で、暴落します。"
        # 文字ごとに時刻設定（'、' の後に 0.30s のポーズがある）
        starts = [0.00, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.90, 1.00, 1.10, 1.20, 1.30, 1.40]
        ends = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.65, 1.00, 1.10, 1.20, 1.30, 1.40, 1.45]
        align = CharacterAlignment(
            characters=tuple(text),
            start_times_sec=tuple(starts),
            end_times_sec=tuple(ends),
        )
        # char_index=7 ('暴' の位置): 直前の非句読点文字 'で' の end=0.60、次の '暴' の start=0.90
        # max(0.5*(0.60+0.90), 0.90-0.12) = 0.78
        t = align.time_at_char_index(text, 7)
        self.assertEqual(t, 0.78)

    def test_sequence_matcher_and_low_similarity_fallback(self) -> None:
        # 句読点や空白が少し違う軽微差分でも SequenceMatcher で写像
        align = CharacterAlignment(
            characters=tuple("仮説の質問です もし壊すなら"),
            start_times_sec=tuple(i * 0.1 for i in range(14)),
            end_times_sec=tuple(i * 0.1 + 0.09 for i in range(14)),
        )
        t = align.time_at_char_index("仮説の質問です。もし壊すなら", 8)
        self.assertIsNotNone(t)
        assert t is not None
        self.assertAlmostEqual(t, 0.8, delta=0.15)

        # まったく別テキスト（類似度 < 0.70）は None を返して既存フォールバックに委ねる
        self.assertIsNone(align.time_at_char_index("まったく関係ない文章です", 5))


class TestElevenLabsTTSClient(unittest.TestCase):
    def test_eleven_v4_payload_alignment_shift_cache_and_secret_redaction(self) -> None:
        secret = "sk_super_secret_test_token_abcdef123456"
        clock = FakeClock()
        pcm = _make_pcm_bytes_with_silence(
            lead_silence_sec=0.30,
            speech_segments=[(0.70, 0.28), (0.60, 0.0)],
            tail_silence_sec=0.25,
            sample_rate=48000,
        )
        text = "市場は繊細で、すぐ壊れます。"
        # 文字時刻は raw_wav 基準（0.30s から発話開始）
        chars = list(text)
        starts = [0.30 + i * 0.08 + (0.28 if i >= 7 else 0.0) for i in range(len(chars))]
        ends = [s + 0.075 for s in starts]

        def handler(rec: dict):
            if rec["method"] == "GET" and rec["url"].endswith("/voices"):
                return _FakeHttpResponse(
                    status_code=200,
                    json_data={
                        "voices": [
                            {
                                "voice_id": "W8wofKLOWnsM57L8hIx2",
                                "name": "Koji - Japanese Narrator",
                                "category": "professional",
                                "is_owner": False,
                                "description": "Warm confident mature Japanese male narrator",
                                "labels": {"language": "ja", "gender": "male", "age": "middle_aged", "use_case": "narrative_story"},
                                "verified_languages": [{"language": "ja", "model_id": "eleven_v4"}],
                            }
                        ]
                    },
                )
            if rec["method"] == "POST":
                return _FakeHttpResponse(
                    status_code=200,
                    json_data={
                        "audio_base64": base64.b64encode(pcm).decode("ascii"),
                        "alignment": {
                            "characters": chars,
                            "character_start_times_seconds": starts,
                            "character_end_times_seconds": ends,
                        },
                    },
                )
            raise AssertionError(f"Unexpected call: {rec}")

        http = _FakeHttpClient(handler)
        client = ElevenLabsTTSClient(
            api_key=secret,
            voice_id="auto",
            models=("eleven_v4", "eleven_v4_turbo"),
            language_code="ja-JP",
            voice_settings={"stability": 0.45, "similarity_boost": 0.80, "style": 0.5, "speed": 1.2, "use_speaker_boost": True},
            http_client=http,
            clock=clock,
            sleep_fn=clock.sleep,
            load_env=False,
        )

        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            res = client.synthesize_chunk(NarrationChunk("c01", text, pause_after_sec=0.3), out_dir)
            self.assertEqual(res.provider, "elevenlabs")
            self.assertEqual(res.model_used, "eleven_v4")
            self.assertEqual(res.voice_used, "W8wofKLOWnsM57L8hIx2")
            self.assertEqual(res.key_label, "elevenlabs(explicit)")
            self.assertNotIn(secret, res.key_label or "")
            self.assertIsNotNone(res.alignment)
            assert res.alignment is not None

            # 0.30s の先頭無音がトリムされているため、最初の文字開始は 0.015s 付近へシフトされる
            self.assertLess(res.alignment.start_times_sec[0], 0.08)
            self.assertGreaterEqual(res.duration_sec, 1.45)

            # eleven_v4 ペイロード仕様検証（style/speed/use_speaker_boost は除外、language_code は "ja"）
            post_calls = [c for c in http.calls if c["method"] == "POST"]
            self.assertEqual(len(post_calls), 1)
            body = post_calls[0]["json"]
            self.assertEqual(body["model_id"], "eleven_v4")
            self.assertEqual(body["language_code"], "ja")
            self.assertEqual(body["voice_settings"], {"stability": 0.45, "similarity_boost": 0.80})
            self.assertEqual(post_calls[0]["params"], {"output_format": "pcm_48000"})

            # キャッシュヒット時は HTTP リクエスト 0 回
            before_calls = len(http.calls)
            res_cached = client.synthesize_chunk(NarrationChunk("c01", text), out_dir, force=False)
            self.assertTrue(res_cached.cached)
            self.assertEqual(len(http.calls), before_calls)
            self.assertIsNotNone(res_cached.alignment)

    def test_format_fallback_timestamps_fallback_retry_and_secret_redaction(self) -> None:
        secret = "sk_secret_value_never_leak_999999"
        clock = FakeClock()
        pcm = _make_pcm_bytes_with_silence(
            lead_silence_sec=0.05,
            speech_segments=[(0.75, 0.0)],
            tail_silence_sec=0.05,
            sample_rate=44100,
        )
        post_count = {"n": 0}

        def handler(rec: dict):
            if rec["method"] == "POST":
                post_count["n"] += 1
                fmt = rec["params"]["output_format"]
                # 1回目: pcm_48000 がプラン制限 403 -> pcm_44100 へフォールバック
                if fmt == "pcm_48000":
                    return _FakeHttpResponse(
                        status_code=403,
                        json_data={"detail": {"status": "output_format_not_allowed", "message": f"pcm_48000 requires higher tier ({secret})"}},
                    )
                # 2回目: with-timestamps が 422 -> 標準エンドポイントへフォールバック
                if rec["url"].endswith("/with-timestamps"):
                    return _FakeHttpResponse(
                        status_code=422,
                        json_data={"detail": {"status": "unsupported", "message": "with-timestamps not supported"}},
                    )
                # 3回目: 429 Retry-After=2 -> リトライ
                if post_count["n"] == 3:
                    return _FakeHttpResponse(
                        status_code=429,
                        json_data={"detail": {"status": "too_many_concurrent_requests", "message": "rate limit"}},
                        headers={"Retry-After": "2"},
                    )
                # 4回目: 成功
                return _FakeHttpResponse(status_code=200, content=pcm)
            raise AssertionError(f"Unexpected: {rec}")

        http = _FakeHttpClient(handler)
        client = ElevenLabsTTSClient(
            api_key=secret,
            voice_id="W8wofKLOWnsM57L8hIx2",
            http_client=http,
            clock=clock,
            sleep_fn=clock.sleep,
            load_env=False,
        )

        with tempfile.TemporaryDirectory() as tmp:
            res = client.synthesize_chunk(NarrationChunk("c01", "テスト文です。"), Path(tmp))
            self.assertEqual(res.model_used, "eleven_v4")
            self.assertIsNone(res.alignment)
            self.assertIn(2.0, clock.sleeps)

        # 401/402 の即時停止と秘匿化確認
        def auth_fail_handler(_rec: dict):
            return _FakeHttpResponse(
                status_code=401,
                json_data={"detail": {"status": "invalid_api_key", "message": f"bad key {secret}"}},
            )

        bad_client = ElevenLabsTTSClient(
            api_key=secret,
            voice_id="W8wofKLOWnsM57L8hIx2",
            http_client=_FakeHttpClient(auth_fail_handler),
            clock=clock,
            sleep_fn=clock.sleep,
            load_env=False,
        )
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ElevenLabsAuthError) as ctx:
                bad_client.synthesize_chunk(NarrationChunk("c01", "テスト"), Path(tmp))
            self.assertNotIn(secret, str(ctx.exception))
            self.assertIn("[REDACTED]", str(ctx.exception))

        def quota_fail_handler(_rec: dict):
            return _FakeHttpResponse(
                status_code=402,
                json_data={"detail": {"status": "quota_exceeded", "message": f"no credits for {secret}"}},
            )

        quota_client = ElevenLabsTTSClient(
            api_key=secret,
            voice_id="W8wofKLOWnsM57L8hIx2",
            http_client=_FakeHttpClient(quota_fail_handler),
            clock=clock,
            sleep_fn=clock.sleep,
            load_env=False,
        )
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ElevenLabsQuotaExceededError) as ctx:
                quota_client.synthesize_chunk(NarrationChunk("c01", "テスト"), Path(tmp))
            self.assertNotIn(secret, str(ctx.exception))

        self.assertEqual(redact_elevenlabs_secret(f"xi-api-key: {secret}", secret), "xi-api-key: [REDACTED]")

    def test_default_liam_voice_direct_post_without_voices_lookup(self) -> None:
        clock = FakeClock()
        pcm = _make_pcm_bytes_with_silence(
            lead_silence_sec=0.05,
            speech_segments=[(0.75, 0.0)],
            tail_silence_sec=0.05,
            sample_rate=48000,
        )
        text = "既定ボイスのテストです。"
        chars = list(text)
        starts = [0.05 + i * 0.05 for i in range(len(chars))]
        ends = [s + 0.045 for s in starts]

        def handler(rec: dict):
            if rec["method"] == "POST" and f"/text-to-speech/{DEFAULT_ELEVENLABS_VOICE_ID}/with-timestamps" in rec["url"]:
                return _FakeHttpResponse(
                    status_code=200,
                    json_data={
                        "audio_base64": base64.b64encode(pcm).decode("ascii"),
                        "alignment": {
                            "characters": chars,
                            "character_start_times_seconds": starts,
                            "character_end_times_seconds": ends,
                        },
                    },
                )
            raise AssertionError(f"Unexpected HTTP call: {rec}")

        http = _FakeHttpClient(handler)
        env_clean = {k: v for k, v in os.environ.items() if k != "ELEVENLABS_VOICE_ID"}
        with patch.dict(os.environ, env_clean, clear=True):
            client = ElevenLabsTTSClient(
                api_key="sk_test_liam_default_1234567890",
                http_client=http,
                clock=clock,
                sleep_fn=clock.sleep,
                load_env=False,
            )
            with tempfile.TemporaryDirectory() as tmp:
                res = client.synthesize_chunk(NarrationChunk("c01", text), Path(tmp))

        self.assertEqual(res.voice_used, "TX3LPaxmHKxFdv7VOQHJ")
        self.assertEqual(res.voice_display_name, "Liam - Energetic, Social Media Creator")
        self.assertEqual([c["method"] for c in http.calls], ["POST"])
        self.assertIn("/text-to-speech/TX3LPaxmHKxFdv7VOQHJ/with-timestamps", http.calls[0]["url"])


class TestTTSProviderFactory(unittest.TestCase):
    def test_resolve_config_cache_dir_and_factory(self) -> None:
        gemini_spec = {
            "models": ["gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts"],
            "voices": ["Charon", "Orus"],
            "languageCode": "ja-JP",
            "temperature": 0.30,
        }
        # 既定プロバイダは後方互換 gemini
        cfg_gem = resolve_tts_config(gemini_spec, default_provider="gemini")
        self.assertEqual(cfg_gem.provider, "gemini")
        self.assertEqual(cfg_gem.models[0], "gemini-3.8-flash-tts")
        self.assertEqual(cfg_gem.voices, ("Charon", "Orus"))

        # CLI で elevenlabs へ切替時、Gemini 固有モデルと Charon/Orus を自動除外し既定ボイス Liam を採用する
        env_clean = {k: v for k, v in os.environ.items() if k != "ELEVENLABS_VOICE_ID"}
        with patch.dict(os.environ, env_clean, clear=True):
            cfg_el = resolve_tts_config(gemini_spec, cli_provider="elevenlabs")
        self.assertEqual(cfg_el.provider, "elevenlabs")
        self.assertEqual(cfg_el.models[0], "eleven_v4")
        self.assertEqual(cfg_el.voices, (DEFAULT_ELEVENLABS_VOICE_ID,))
        self.assertEqual(cfg_el.language_code, "ja")

        # auto は configs/stack.yaml を読む
        repo_root = Path(__file__).resolve().parents[2]
        stack_defaults = resolve_stack_tts_defaults(repo_root=repo_root)
        self.assertEqual(stack_defaults["provider"], "elevenlabs")
        self.assertEqual(stack_defaults["model"], "eleven_v4")
        self.assertEqual(stack_defaults["voice_id"], "TX3LPaxmHKxFdv7VOQHJ")
        self.assertEqual(stack_defaults["voice_name"], "Liam - Energetic, Social Media Creator")

        with patch.dict(os.environ, env_clean, clear=True):
            cfg_auto = resolve_tts_config({"provider": "auto"}, repo_root=repo_root)
        self.assertEqual(cfg_auto.provider, "elevenlabs")
        self.assertEqual(cfg_auto.models[0], "eleven_v4")
        self.assertEqual(cfg_auto.voices, ("TX3LPaxmHKxFdv7VOQHJ",))
        self.assertEqual(cfg_auto.language_code, "ja")

        # ELEVENLABS_VOICE_ID 環境変数上書き、cli_voice 最優先、Spec の明示 "auto" 維持
        with patch.dict(os.environ, {**env_clean, "ELEVENLABS_VOICE_ID": "W8wofKLOWnsM57L8hIx2"}, clear=True):
            cfg_env = resolve_tts_config({"provider": "auto"}, repo_root=repo_root)
            self.assertEqual(cfg_env.voices, ("W8wofKLOWnsM57L8hIx2",))

            cfg_cli_override = resolve_tts_config(
                {"provider": "auto"},
                cli_voice="auto",
                repo_root=repo_root,
            )
            self.assertEqual(cfg_cli_override.voices[0], "auto")

            cfg_cli_name = resolve_tts_config(
                {"provider": "auto"},
                cli_voice="Koji - Japanese Narrator",
                repo_root=repo_root,
            )
            self.assertEqual(cfg_cli_name.voices[0], "Koji - Japanese Narrator")

        with patch.dict(os.environ, {**env_clean, "ELEVENLABS_VOICE_ID": "auto"}, clear=True):
            cfg_env_auto = resolve_tts_config(gemini_spec, cli_provider="elevenlabs", repo_root=repo_root)
            self.assertEqual(cfg_env_auto.voices, ("auto",))

        with patch.dict(os.environ, env_clean, clear=True):
            cfg_spec_auto = resolve_tts_config(
                {"provider": "elevenlabs", "elevenlabs": {"voices": ["auto"]}},
                repo_root=repo_root,
            )
            self.assertEqual(cfg_spec_auto.voices, ("auto",))

            # カスタム configs/stack.yaml の voice_id 読込検証
            with tempfile.TemporaryDirectory() as tmp_repo:
                tmp_root = Path(tmp_repo)
                (tmp_root / "configs").mkdir(parents=True, exist_ok=True)
                (tmp_root / "configs" / "stack.yaml").write_text(
                    "roles:\n"
                    "  tts_primary:\n"
                    "    primary:\n"
                    "      provider: elevenlabs\n"
                    "      model: eleven_v4\n"
                    "      voice_id: j210dv0vWm7fCknyQpbA\n"
                    "      voice_name: Hinata JP\n"
                    "      required_params:\n"
                    "        language_code: ja\n",
                    encoding="utf-8",
                )
                custom_defaults = resolve_stack_tts_defaults(repo_root=tmp_root)
                self.assertEqual(custom_defaults["voice_id"], "j210dv0vWm7fCknyQpbA")
                self.assertEqual(custom_defaults["voice_name"], "Hinata JP")
                cfg_custom = resolve_tts_config({"provider": "auto"}, repo_root=tmp_root)
                self.assertEqual(cfg_custom.voices, ("j210dv0vWm7fCknyQpbA",))
                c_custom = create_tts_client("elevenlabs", api_key="el-key", repo_root=tmp_root, load_env=False)
                self.assertEqual(c_custom.voice_preference, "j210dv0vWm7fCknyQpbA")

        # キャッシュディレクトリ分離
        pub = Path("public_ep")
        self.assertEqual(resolve_tts_cache_dir(pub, "gemini"), pub / "tts")
        self.assertEqual(resolve_tts_cache_dir(pub, "elevenlabs"), pub / "tts_elevenlabs")
        self.assertEqual(resolve_tts_cache_dir(pub, "elevenlabs", variant="eleven_v4"), pub / "tts_eleven_v4")

        # プロトコル適合 & create_tts_client のボイス解決優先順位
        with patch.dict(os.environ, env_clean, clear=True):
            c_gem = create_tts_client("gemini", api_key="gem-key", load_env=False)
            c_el = create_tts_client("elevenlabs", api_key="el-key", repo_root=repo_root, load_env=False)
            c_el_auto = create_tts_client(
                "elevenlabs", api_key="el-key", voice_name="auto", repo_root=repo_root, load_env=False
            )
            c_el_koji = create_tts_client(
                "elevenlabs", api_key="el-key", voice_name="Koji", repo_root=repo_root, load_env=False
            )
        self.assertIsInstance(c_gem, GeminiTTSClient)
        self.assertIsInstance(c_el, ElevenLabsTTSClient)
        self.assertIsInstance(c_gem, TTSClientProtocol)
        self.assertIsInstance(c_el, TTSClientProtocol)
        self.assertEqual(c_el.voice_preference, "TX3LPaxmHKxFdv7VOQHJ")
        self.assertEqual(c_el_auto.voice_preference, "auto")
        self.assertEqual(c_el_koji.voice_preference, "Koji")

        with patch.dict(os.environ, {**env_clean, "ELEVENLABS_VOICE_ID": "W8wofKLOWnsM57L8hIx2"}, clear=True):
            c_el_env = create_tts_client("elevenlabs", api_key="el-key", repo_root=repo_root, load_env=False)
            self.assertEqual(c_el_env.voice_preference, "W8wofKLOWnsM57L8hIx2")


class TestElevenLabsOneTakeAndAlignment(unittest.TestCase):
    def test_align_chunks_with_character_alignment_success_and_mismatch_fallback(self) -> None:
        chunks = [
            NarrationChunk("c01", "一つ目の文です。補足もあります。"),
            NarrationChunk("c02", "二つ目の文です。"),
        ]
        separator = "\n"
        joined = "\n".join(c.text for c in chunks)
        chars = list(joined)
        starts: list[float] = []
        ends: list[float] = []
        t = 0.05
        for ch in chars:
            if ch == "\n":
                starts.append(t)
                ends.append(t + 0.02)
                t += 0.25
            else:
                starts.append(t)
                ends.append(t + 0.08)
                t += 0.09
        total_dur = t + 0.15

        pcm = _make_pcm_bytes_with_silence(
            lead_silence_sec=0.05,
            speech_segments=[(1.40, 0.25), (0.72, 0.0)],
            tail_silence_sec=0.25,
            sample_rate=48000,
        )
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = Path(tmp) / "test.wav"
            with wave.open(str(wav_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(48000)
                wf.writeframes(pcm)

            align = CharacterAlignment(
                characters=tuple(chars),
                start_times_sec=tuple(starts),
                end_times_sec=tuple(ends),
            )
            res = align_chunks_with_character_alignment(
                chunks,
                joined,
                separator,
                align,
                wav_path,
                total_duration_sec=total_dur,
            )
            self.assertIsNotNone(res)
            assert res is not None
            spans, summary = res
            self.assertEqual(summary["aligner"], "elevenlabs_char_alignment")
            self.assertEqual(summary["chunkCount"], 2)
            self.assertEqual(summary["silenceHitRate"], 1.0)
            self.assertEqual(len(spans), 2)
            self.assertEqual(spans[0].start_sec, 0.0)
            self.assertLess(spans[0].speech_end_sec, spans[1].start_sec)
            self.assertEqual(spans[0].boundary_source, "elevenlabs_char_alignment")
            self.assertEqual(len(spans[0].sentence_spans), 2)
            self.assertLess(spans[0].sentence_spans[0][1], spans[0].sentence_spans[1][0] + 0.05)

            bad_align = CharacterAlignment(
                characters=tuple("まったく一致しない別テキスト"),
                start_times_sec=tuple(i * 0.1 for i in range(14)),
                end_times_sec=tuple(i * 0.1 + 0.08 for i in range(14)),
            )
            self.assertIsNone(
                align_chunks_with_character_alignment(
                    chunks,
                    joined,
                    separator,
                    bad_align,
                    wav_path,
                    total_duration_sec=total_dur,
                )
            )

    def test_synthesize_onetake_block_alignment_cache_and_acoustic_dp_fallback(self) -> None:
        chunks = [
            NarrationChunk("c01", "最初の水星です。かなり熱いです。"),
            NarrationChunk("c02", "次は金星です。気圧が九十倍あります。"),
        ]
        joined = "\n".join(c.text for c in chunks)
        pcm = _make_pcm_bytes_with_silence(
            lead_silence_sec=0.22,
            speech_segments=[(1.45, 0.30), (1.75, 0.0)],
            tail_silence_sec=0.20,
            sample_rate=48000,
        )
        chars = list(joined)
        starts: list[float] = []
        ends: list[float] = []
        t = 0.22
        for ch in chars:
            if ch == "\n":
                starts.append(t)
                ends.append(t + 0.02)
                t += 0.30
            else:
                starts.append(t)
                ends.append(t + 0.08)
                t += 0.09

        clock = FakeClock()

        def handler_with_ts(rec: dict):
            if rec["method"] == "POST":
                return _FakeHttpResponse(
                    status_code=200,
                    json_data={
                        "audio_base64": base64.b64encode(pcm).decode("ascii"),
                        "alignment": {
                            "characters": chars,
                            "character_start_times_seconds": starts,
                            "character_end_times_seconds": ends,
                        },
                    },
                )
            raise AssertionError(f"Unexpected call: {rec}")

        http = _FakeHttpClient(handler_with_ts)
        client = ElevenLabsTTSClient(
            api_key="sk_test_onetake_1234567890",
            voice_id="TX3LPaxmHKxFdv7VOQHJ",
            http_client=http,
            clock=clock,
            sleep_fn=clock.sleep,
            load_env=False,
        )
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            res = client.synthesize_onetake_block(
                chunks,
                out_dir,
                block_id="ch01_test",
                min_expected_sec=1.5,
                max_expected_sec=10.0,
            )
            self.assertFalse(res.cached)
            self.assertEqual(res.api_calls, 1)
            self.assertEqual(res.model_used, "eleven_v4")
            self.assertEqual(res.voice_used, "TX3LPaxmHKxFdv7VOQHJ")
            self.assertEqual(res.aligner_used, "elevenlabs_char_alignment")
            self.assertIsNotNone(res.character_alignment)
            self.assertEqual(len(res.chunks), 2)
            self.assertLess(res.chunks[0].speech_end_sec, res.chunks[1].start_sec)

            # キャッシュヒット確認（API呼び出し0回）
            res_cached = client.synthesize_onetake_block(
                chunks,
                out_dir,
                block_id="ch01_test",
                min_expected_sec=1.5,
                max_expected_sec=10.0,
            )
            self.assertTrue(res_cached.cached)
            self.assertEqual(res_cached.api_calls, 0)
            self.assertEqual(res_cached.aligner_used, "elevenlabs_char_alignment")
            self.assertEqual(len(http.calls), 1)
            self.assertIsNotNone(res_cached.character_alignment)

        # アライメント欠落時は acoustic_dp へ自動フォールバックする
        def handler_no_ts(rec: dict):
            if rec["method"] == "POST":
                return _FakeHttpResponse(
                    status_code=200,
                    json_data={"audio_base64": base64.b64encode(pcm).decode("ascii")},
                )
            raise AssertionError(f"Unexpected call: {rec}")

        http_no_ts = _FakeHttpClient(handler_no_ts)
        client_no_ts = ElevenLabsTTSClient(
            api_key="sk_test_onetake_no_ts_1234567890",
            voice_id="TX3LPaxmHKxFdv7VOQHJ",
            http_client=http_no_ts,
            clock=clock,
            sleep_fn=clock.sleep,
            load_env=False,
        )
        with tempfile.TemporaryDirectory() as tmp:
            res_fb = client_no_ts.synthesize_onetake_block(
                chunks,
                Path(tmp),
                block_id="ch01_fb",
                min_expected_sec=1.5,
                max_expected_sec=10.0,
            )
            self.assertEqual(res_fb.aligner_used, "acoustic_dp")
            self.assertIsNone(res_fb.character_alignment)
            self.assertEqual(len(res_fb.chunks), 2)


if __name__ == "__main__":
    unittest.main()
