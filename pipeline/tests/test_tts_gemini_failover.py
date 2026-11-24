"""yt_engine.audio.tts_gemini および関連ビルダーの 2キーフェイルオーバー・レート制御・429判別単体テスト。

有料 Gemini API 呼び出し・実 .env 読込・実スリープを一切行わず、モックと仮想時計で検証する。
"""

from __future__ import annotations

import importlib.util
import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from google.genai.errors import APIError

from yt_engine.audio.tts_gemini import (
    DEFAULT_KEY_MIN_INTERVAL_SEC,
    GeminiKeyPool,
    GeminiQuotaExhaustedError,
    GeminiTTSClient,
    NarrationChunk,
    classify_gemini_error,
    parse_retry_delay_sec,
    resolve_gemini_api_keys,
)


class FakeClock:
    """仮想時計とスリープ履歴を記録するテスト用クロック。"""

    def __init__(self, start: float = 0.0) -> None:
        self.now = start
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, sec: float) -> None:
        self.sleeps.append(sec)
        self.now += sec

    def advance(self, sec: float) -> None:
        self.now += sec


def _make_audio_response(pcm_byte: bytes = b"\x01\x00" * 4800) -> SimpleNamespace:
    part = SimpleNamespace(inline_data=SimpleNamespace(data=pcm_byte, mime_type="audio/L16;rate=24000"))
    cand = SimpleNamespace(content=SimpleNamespace(parts=[part]))
    return SimpleNamespace(candidates=[cand])


def _make_fake_client_factory(handler, clock: FakeClock | None = None, api_latency_sec: float = 0.0):
    """(api_key, api_version) ごとに呼び出し履歴を記録するフェイククライアントファクトリ。"""
    calls: list[tuple[str, str, str, object]] = []

    class _FakeModels:
        def __init__(self, key: str) -> None:
            self._key = key

        def generate_content(self, *, model: str, contents: object, config: object):
            if clock is not None and api_latency_sec > 0:
                clock.advance(api_latency_sec)
            calls.append((self._key, model, str(contents), config))
            return handler(self._key, model, contents, config)

    def _factory(api_key: str, _api_version: str):
        return SimpleNamespace(models=_FakeModels(api_key))

    return _factory, calls


class TestResolveGeminiApiKeys(unittest.TestCase):
    def test_single_key_backward_compatible(self) -> None:
        env = {"GEMINI_API_KEY": "primary-only-key"}
        with patch.dict(os.environ, env, clear=True):
            keys = resolve_gemini_api_keys(load_env=False)
        self.assertEqual(keys, ["primary-only-key"])

    def test_two_keys_order_dedupe_and_blank_filtering(self) -> None:
        env = {
            "GEMINI_API_KEY": "  key-primary  ",
            "GEMINI_API_KEY_FALLBACK": "  key-fallback  ",
        }
        with patch.dict(os.environ, env, clear=True):
            keys = resolve_gemini_api_keys(load_env=False)
        self.assertEqual(keys, ["key-primary", "key-fallback"])

        # 重複キーと空白文字列の自動除外
        dup_keys = resolve_gemini_api_keys(
            api_keys=["", "   ", "key-a", " key-a ", "key-b", "key-a"],
            load_env=False,
        )
        self.assertEqual(dup_keys, ["key-a", "key-b"])

        # プライマリ未設定でもフォールバックのみ設定されていれば動作する
        with patch.dict(os.environ, {"GEMINI_API_KEY": "  ", "GEMINI_API_KEY_FALLBACK": "fb-only"}, clear=True):
            fb_keys = resolve_gemini_api_keys(load_env=False)
        self.assertEqual(fb_keys, ["fb-only"])

    def test_explicit_api_key_does_not_load_dotenv(self) -> None:
        with patch("yt_engine.audio.tts_gemini.load_dotenv") as mock_dotenv:
            with patch.dict(os.environ, {"GEMINI_API_KEY_FALLBACK": ""}, clear=True):
                keys = resolve_gemini_api_keys("explicit-key", load_env=True)
        mock_dotenv.assert_not_called()
        self.assertEqual(keys, ["explicit-key"])


class TestRetryDelayAndErrorClassification(unittest.TestCase):
    def test_parse_retry_delay_formats(self) -> None:
        err_str_delay = APIError(
            429,
            {
                "error": {
                    "code": 429,
                    "status": "RESOURCE_EXHAUSTED",
                    "message": "Rate limit exceeded",
                    "details": [{"retryDelay": "12.5s"}],
                }
            },
        )
        self.assertAlmostEqual(parse_retry_delay_sec(err_str_delay), 12.5)

        err_dict_delay = APIError(
            429,
            {
                "error": {
                    "status": "RESOURCE_EXHAUSTED",
                    "details": [{"retry_delay": {"seconds": 15, "nanos": 500_000_000}}],
                }
            },
        )
        self.assertAlmostEqual(parse_retry_delay_sec(err_dict_delay), 15.5)

        self.assertAlmostEqual(parse_retry_delay_sec("Please retry in 18.5s."), 18.5)
        self.assertAlmostEqual(parse_retry_delay_sec("Please retry in 500ms"), 0.5)
        self.assertAlmostEqual(parse_retry_delay_sec("retryDelay: '9s'"), 9.0)
        self.assertAlmostEqual(parse_retry_delay_sec("retryDelay: '1m30s'"), 90.0)

        resp_err = RuntimeError("429 Too Many Requests")
        resp_err.response = SimpleNamespace(headers={"Retry-After": "11"})  # type: ignore[attr-defined]
        self.assertAlmostEqual(parse_retry_delay_sec(resp_err), 11.0)

    def test_classify_429_rpm_vs_rpd_and_auth(self) -> None:
        rpm_err = APIError(
            429,
            {
                "error": {
                    "status": "RESOURCE_EXHAUSTED",
                    "message": "Quota exceeded for quota metric 'GenerateRequestsPerMinutePerProjectPerModel'. Please retry in 14s.",
                    "details": [{"retryDelay": "14s"}],
                }
            },
        )
        cls_rpm = classify_gemini_error(rpm_err)
        self.assertEqual(cls_rpm.kind, "rate_limit")
        self.assertAlmostEqual(cls_rpm.retry_delay_sec, 14.0)

        for daily_err in (
            APIError(
                429,
                {
                    "error": {
                        "status": "RESOURCE_EXHAUSTED",
                        "message": "Quota exceeded for GenerateRequestsPerDayPerProjectPerModel-FreeTier",
                    }
                },
            ),
            RuntimeError("429 RESOURCE_EXHAUSTED: daily quota exhausted"),
            APIError(
                429,
                {
                    "error": {
                        "status": "RESOURCE_EXHAUSTED",
                        "message": "Quota exceeded, limit: 0",
                        "details": [{"violations": [{"quotaMetric": "tts_requests", "quotaValue": "0"}]}],
                    }
                },
            ),
        ):
            cls_daily = classify_gemini_error(daily_err)
            self.assertEqual(cls_daily.kind, "daily_quota")

        auth_err = APIError(400, {"error": {"status": "INVALID_ARGUMENT", "message": "API_KEY_INVALID"}})
        self.assertEqual(classify_gemini_error(auth_err).kind, "auth")


class TestGeminiTTSFailoverAndPacing(unittest.TestCase):
    def test_single_key_pacing_subtracts_api_latency(self) -> None:
        clock = FakeClock(start=0.0)
        factory, calls = _make_fake_client_factory(
            lambda _k, _m, _c, _cfg: _make_audio_response(),
            clock=clock,
            api_latency_sec=2.0,
        )
        client = GeminiTTSClient(
            api_keys=["single-key"],
            models=("gemini-3.8-flash-tts",),
            request_interval_sec=DEFAULT_KEY_MIN_INTERVAL_SEC,
            client_factory=factory,
            clock=clock,
            sleep_fn=clock.sleep,
            jitter_fn=lambda a, _b: a,
        )

        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            chunks = [
                NarrationChunk("c01", "テストチャンク一です。"),
                NarrationChunk("c02", "テストチャンク二です。"),
                NarrationChunk("c03", "テストチャンク三です。"),
            ]
            with patch("yt_engine.audio.tts_gemini.trim_and_resample_tts", return_value=1.5):
                results, used = client.synthesize_chunks(chunks, out_dir)

        self.assertEqual(len(results), 3)
        self.assertEqual(used, "gemini-3.8-flash-tts")
        self.assertEqual([c[0] for c in calls], ["single-key", "single-key", "single-key"])
        # API 応答時間 2.0s が差し引かれるため、各チャンク間の待機は 6.5 - 2.0 = 4.5s のみ
        self.assertEqual(len(clock.sleeps), 2)
        self.assertAlmostEqual(clock.sleeps[0], 4.5)
        self.assertAlmostEqual(clock.sleeps[1], 4.5)

    def test_single_key_no_sleep_when_latency_exceeds_interval(self) -> None:
        clock = FakeClock(start=0.0)
        factory, _ = _make_fake_client_factory(
            lambda _k, _m, _c, _cfg: _make_audio_response(),
            clock=clock,
            api_latency_sec=7.0,
        )
        client = GeminiTTSClient(
            api_keys=["single-key"],
            models=("gemini-3.8-flash-tts",),
            client_factory=factory,
            clock=clock,
            sleep_fn=clock.sleep,
            jitter_fn=lambda a, _b: a,
        )

        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            chunks = [NarrationChunk("c01", "一番目。"), NarrationChunk("c02", "二番目。")]
            with patch("yt_engine.audio.tts_gemini.trim_and_resample_tts", return_value=1.5):
                client.synthesize_chunks(chunks, out_dir)

        self.assertEqual(clock.sleeps, [])

    def test_rpm_429_immediately_fails_over_to_fallback_same_model(self) -> None:
        clock = FakeClock(start=0.0)

        def handler(key: str, model: str, _contents: object, _cfg: object):
            if key == "primary-secret" and model == "gemini-3.8-flash-tts":
                raise APIError(
                    429,
                    {
                        "error": {
                            "status": "RESOURCE_EXHAUSTED",
                            "message": "PerMinute RPM exceeded",
                            "details": [{"retryDelay": "12s"}],
                        }
                    },
                )
            return _make_audio_response()

        factory, calls = _make_fake_client_factory(handler, clock=clock, api_latency_sec=0.2)
        client = GeminiTTSClient(
            api_keys=["primary-secret", "fallback-secret"],
            models=("gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts"),
            client_factory=factory,
            clock=clock,
            sleep_fn=clock.sleep,
            jitter_fn=lambda a, _b: a,
        )

        stdout_buf = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp:
            with patch("yt_engine.audio.tts_gemini.trim_and_resample_tts", return_value=1.4), redirect_stdout(stdout_buf):
                res = client.synthesize_chunk(NarrationChunk("c01", "声質統一のテストです。"), Path(tmp))

        # 待機ゼロで同一モデルのサブキーへ即切替（別モデルへ逃げない）
        self.assertEqual(res.model_used, "gemini-3.8-flash-tts")
        self.assertEqual(clock.sleeps, [])
        self.assertEqual(
            [(c[0], c[1]) for c in calls],
            [
                ("primary-secret", "gemini-3.8-flash-tts"),
                ("fallback-secret", "gemini-3.8-flash-tts"),
            ],
        )
        # ログにAPIキー生文字列が出力されていないことを検証
        logs = stdout_buf.getvalue()
        self.assertNotIn("primary-secret", logs)
        self.assertNotIn("fallback-secret", logs)

    def test_daily_quota_circuit_breaker_skips_exhausted_key_across_chunks(self) -> None:
        clock = FakeClock(start=0.0)

        def handler(key: str, model: str, _contents: object, _cfg: object):
            if key == "primary-secret":
                raise APIError(
                    429,
                    {
                        "error": {
                            "status": "RESOURCE_EXHAUSTED",
                            "message": "GenerateRequestsPerDayPerProjectPerModel exceeded",
                        }
                    },
                )
            return _make_audio_response()

        factory, calls = _make_fake_client_factory(handler, clock=clock, api_latency_sec=0.5)
        client = GeminiTTSClient(
            api_keys=["primary-secret", "fallback-secret"],
            models=("gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts"),
            client_factory=factory,
            clock=clock,
            sleep_fn=clock.sleep,
            jitter_fn=lambda a, _b: a,
        )

        with tempfile.TemporaryDirectory() as tmp:
            chunks = [
                NarrationChunk("c01", "チャンク一。"),
                NarrationChunk("c02", "チャンク二。"),
                NarrationChunk("c03", "チャンク三。"),
            ]
            with patch("yt_engine.audio.tts_gemini.trim_and_resample_tts", return_value=1.2):
                results, used = client.synthesize_chunks(chunks, Path(tmp))

        self.assertEqual(used, "gemini-3.8-flash-tts")
        self.assertTrue(all(r.model_used == "gemini-3.8-flash-tts" for r in results))
        # primary は c01 の 1回のみで当日枯渇が記憶され、c02, c03 では一切呼ばれない
        self.assertEqual(
            [c[0] for c in calls],
            ["primary-secret", "fallback-secret", "fallback-secret", "fallback-secret"],
        )
        # c01 は即フェイルオーバー(sleep 0)、c02/c03 は fallback 6.5s ペーシング - 0.5s応答 = 6.0s
        self.assertEqual(len(clock.sleeps), 2)
        self.assertAlmostEqual(clock.sleeps[0], 6.0)
        self.assertAlmostEqual(clock.sleeps[1], 6.0)

    def test_model_fallback_only_after_all_keys_exhausted_and_skips_model_thereafter(self) -> None:
        clock = FakeClock(start=0.0)

        def handler(_key: str, model: str, _contents: object, _cfg: object):
            if model == "gemini-3.8-flash-tts":
                raise APIError(
                    429,
                    {
                        "error": {
                            "status": "RESOURCE_EXHAUSTED",
                            "message": "Daily quota limit: 0",
                        }
                    },
                )
            return _make_audio_response()

        factory, calls = _make_fake_client_factory(handler, clock=clock, api_latency_sec=0.5)
        client = GeminiTTSClient(
            api_keys=["k1", "k2"],
            models=("gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"),
            client_factory=factory,
            clock=clock,
            sleep_fn=clock.sleep,
            jitter_fn=lambda a, _b: a,
        )

        with tempfile.TemporaryDirectory() as tmp:
            chunks = [NarrationChunk("c01", "一発目。"), NarrationChunk("c02", "二発目。")]
            with patch("yt_engine.audio.tts_gemini.trim_and_resample_tts", return_value=1.2):
                results, used = client.synthesize_chunks(chunks, Path(tmp))

        self.assertEqual(used, "gemini-3.8-flash-lite-tts")
        self.assertEqual([r.model_used for r in results], ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-lite-tts"])
        # c01: k1@3.8 -> k2@3.8 (両方枯渇) -> k1@lite
        # c02: 3.8は即スキップされ、k2@lite (k1がクールダウン中のためk2を即選択)
        self.assertEqual(
            [(c[0], c[1]) for c in calls],
            [
                ("k1", "gemini-3.8-flash-tts"),
                ("k2", "gemini-3.8-flash-tts"),
                ("k1", "gemini-3.8-flash-lite-tts"),
                ("k2", "gemini-3.8-flash-lite-tts"),
            ],
        )
        # k1 は c01 冒頭の 3.8 失敗から 6.5s ペーシングで 1度だけ 5.5s 待機し、その後は k2 と交互稼働で待機なし
        self.assertEqual(len(clock.sleeps), 1)
        self.assertAlmostEqual(clock.sleeps[0], 5.5)

    def test_single_key_rate_limit_respects_retry_delay_and_jitter_fallback(self) -> None:
        # 1) retryDelay 指定あり: 指定秒数(12s)を優先して待機
        clock1 = FakeClock(start=0.0)
        attempts1 = {"n": 0}

        def handler_with_delay(_k: str, _m: str, _c: object, _cfg: object):
            attempts1["n"] += 1
            if attempts1["n"] == 1:
                raise APIError(
                    429,
                    {
                        "error": {
                            "status": "RESOURCE_EXHAUSTED",
                            "message": "RPM limit",
                            "details": [{"retryDelay": "12s"}],
                        }
                    },
                )
            return _make_audio_response()

        factory1, _ = _make_fake_client_factory(handler_with_delay, clock=clock1, api_latency_sec=0.0)
        pool1 = GeminiKeyPool(
            api_keys=["only-key"],
            client_factory=factory1,
            clock=clock1,
            sleep_fn=clock1.sleep,
            jitter_fn=lambda a, _b: a,
        )
        res1, idx1 = pool1.call_with_failover("gemini-3.8-flash-tts", lambda c, _i: c.models.generate_content(model="gemini-3.8-flash-tts", contents="x", config=None))
        self.assertIsNotNone(res1)
        self.assertEqual(idx1, 0)
        self.assertEqual(len(clock1.sleeps), 1)
        self.assertAlmostEqual(clock1.sleeps[0], 12.0)

        # 2) retryDelay なし: 短いジッター付きバックオフ（7.0 + jitter(0.5) = 7.5s）
        clock2 = FakeClock(start=0.0)
        attempts2 = {"n": 0}

        def handler_no_delay(_k: str, _m: str, _c: object, _cfg: object):
            attempts2["n"] += 1
            if attempts2["n"] == 1:
                raise RuntimeError("429 RESOURCE_EXHAUSTED temporary spike")
            return _make_audio_response()

        factory2, _ = _make_fake_client_factory(handler_no_delay, clock=clock2, api_latency_sec=0.0)
        pool2 = GeminiKeyPool(
            api_keys=["only-key"],
            rate_limit_fallback_delay_sec=7.0,
            client_factory=factory2,
            clock=clock2,
            sleep_fn=clock2.sleep,
            jitter_fn=lambda _a, _b: 0.5,
        )
        pool2.call_with_failover("gemini-3.8-flash-tts", lambda c, _i: c.models.generate_content(model="gemini-3.8-flash-tts", contents="x", config=None))
        self.assertEqual(len(clock2.sleeps), 1)
        self.assertAlmostEqual(clock2.sleeps[0], 7.5)

    def test_two_key_alternating_pacing_respects_min_interval_per_key(self) -> None:
        clock = FakeClock(start=0.0)
        factory, calls = _make_fake_client_factory(
            lambda _k, _m, _c, _cfg: _make_audio_response(),
            clock=clock,
            api_latency_sec=1.0,
        )
        pool = GeminiKeyPool(
            api_keys=["k1", "k2"],
            min_interval_sec=6.5,
            client_factory=factory,
            clock=clock,
            sleep_fn=clock.sleep,
            jitter_fn=lambda a, _b: a,
        )

        # t=0.0: k1 実行 -> t=1.0 (k1 cooldown=6.5)
        # t=1.0: k2 即実行 -> t=2.0 (k2 cooldown=7.5)
        # t=2.0: 両方クールダウン中のため最早の k1(6.5) まで 4.5s だけ待機して k1 実行 -> t=7.5
        for _ in range(3):
            pool.call_with_failover(
                "gemini-3.8-flash-tts",
                lambda c, _i: c.models.generate_content(model="gemini-3.8-flash-tts", contents="x", config=None),
            )

        self.assertEqual([c[0] for c in calls], ["k1", "k2", "k1"])
        self.assertEqual(len(clock.sleeps), 1)
        self.assertAlmostEqual(clock.sleeps[0], 4.5)

    def test_language_code_invalid_argument_retries_without_language_code(self) -> None:
        clock = FakeClock(start=0.0)
        configs_seen: list[object] = []

        def handler(_key: str, _model: str, _contents: object, cfg: object):
            configs_seen.append(cfg)
            speech_cfg = getattr(cfg, "speech_config", None)
            if getattr(speech_cfg, "language_code", None):
                raise APIError(400, {"error": {"status": "INVALID_ARGUMENT", "message": "language_code not supported"}})
            return _make_audio_response()

        factory, calls = _make_fake_client_factory(handler, clock=clock, api_latency_sec=0.0)
        client = GeminiTTSClient(
            api_keys=["k1"],
            models=("gemini-3.8-flash-tts",),
            request_interval_sec=0.0,
            client_factory=factory,
            clock=clock,
            sleep_fn=clock.sleep,
            jitter_fn=lambda a, _b: a,
        )

        with tempfile.TemporaryDirectory() as tmp:
            with patch("yt_engine.audio.tts_gemini.trim_and_resample_tts", return_value=1.2):
                res1 = client.synthesize_chunk(NarrationChunk("c01", "一文目。"), Path(tmp))
                res2 = client.synthesize_chunk(NarrationChunk("c02", "二文目。"), Path(tmp))

        self.assertEqual(res1.model_used, "gemini-3.8-flash-tts")
        self.assertEqual(res2.model_used, "gemini-3.8-flash-tts")
        # 1回目で language_code 非対応を記憶し、2回目は最初から language_code 抜きで 1発成功
        self.assertEqual(len(calls), 3)
        self.assertIsNotNone(configs_seen[0].speech_config.language_code)  # type: ignore[union-attr]
        self.assertIsNone(configs_seen[1].speech_config.language_code)  # type: ignore[union-attr]
        self.assertIsNone(configs_seen[2].speech_config.language_code)  # type: ignore[union-attr]



if __name__ == "__main__":
    unittest.main()
