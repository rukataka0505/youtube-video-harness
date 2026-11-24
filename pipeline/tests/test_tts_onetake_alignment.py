"""yt_engine.audio.tts_gemini のワンテイク一括生成＋自動アライメント単体テスト。

有料 Gemini API 呼び出し・実 .env 読込・実スリープを行わず、
モッククライアントと合成 48kHz PCM WAV を用いて検証する。
"""

from __future__ import annotations

import array
import math
import tempfile
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from google.genai.errors import APIError

from yt_engine.audio.tts_gemini import (
    AlignedChunkSpan,
    GeminiTTSClient,
    NarrationChunk,
    align_chunks_acoustic_dp,
    build_onetake_timeline,
    compose_onetake_prompt,
    detect_silence_intervals,
    estimate_japanese_morae,
    ffprobe_duration,
    locate_text_timestamp_in_chunk,
    split_japanese_sentences,
    trim_onetake_tts,
)


class _FakeClock:
    def __init__(self, start: float = 0.0) -> None:
        self.now = start
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, sec: float) -> None:
        self.sleeps.append(sec)
        self.now += sec


def _make_audio_response(duration_sec: float = 10.0, sample_rate: int = 24000) -> SimpleNamespace:
    n_samples = int(duration_sec * sample_rate)
    pcm = (b"\x00\x10" * n_samples)
    part = SimpleNamespace(inline_data=SimpleNamespace(data=pcm, mime_type=f"audio/L16;rate={sample_rate}"))
    cand = SimpleNamespace(content=SimpleNamespace(parts=[part]))
    return SimpleNamespace(candidates=[cand])


def _make_fake_client_factory(handler):
    calls: list[tuple[str, str, str, object]] = []

    class _FakeModels:
        def __init__(self, key: str) -> None:
            self._key = key

        def generate_content(self, *, model: str, contents: object, config: object):
            calls.append((self._key, model, str(contents), config))
            return handler(self._key, model, contents, config)

    def _factory(api_key: str, _api_version: str):
        return SimpleNamespace(models=_FakeModels(api_key))

    return _factory, calls


def _synthesize_japanese_like_wav(
    wav_path: Path,
    chunks: list[NarrationChunk],
    *,
    sample_rate: int = 48000,
    mora_sec: float = 0.115,
    missing_silence_boundary_idx: int | None = None,
    valley_only_boundary_idx: int | None = None,
) -> tuple[list[tuple[str, float, float, float]], list[tuple[float, float, str]]]:
    """既知グランドトゥルース境界を持つ 48kHz モノラル PCM WAV を合成する。

    returns:
        (chunk_truths: [(chunk_id, start_sec, speech_end_sec, end_sec)],
         sentence_truths: [(start_sec, end_sec, sentence_text)])
    """
    samples = array.array("h")
    sent_truths: list[tuple[float, float, str]] = []
    chunk_truths: list[tuple[str, float, float, float]] = []

    def _append_tone(dur_sec: float, amp: float = 11000.0, freq: float = 280.0) -> None:
        n = max(1, int(round(dur_sec * sample_rate)))
        for i in range(n):
            t = i / sample_rate
            env = min(1.0, i / 120.0) * min(1.0, (n - 1 - i) / 120.0)
            val = int(round(amp * env * math.sin(2.0 * math.pi * freq * t)))
            samples.append(max(-32767, min(32767, val)))

    def _append_silence(dur_sec: float, amp: float = 0.0) -> None:
        n = max(0, int(round(dur_sec * sample_rate)))
        if amp <= 0.0:
            samples.extend([0] * n)
        else:
            for i in range(n):
                t = i / sample_rate
                samples.append(int(round(amp * math.sin(2.0 * math.pi * 220.0 * t))))

    cur_t = 0.0
    global_sent_idx = 0

    for c_idx, chunk in enumerate(chunks):
        sents = split_japanese_sentences(chunk.text)
        c_start = cur_t
        c_speech_end = cur_t

        for s_idx, stext in enumerate(sents):
            s_start = cur_t
            mora = estimate_japanese_morae(stext)
            # リアルな発話速度ゆらぎ (±7%) を付与してテストの頑健性を確認
            jitter = 1.0 + 0.07 * math.sin(global_sent_idx * 1.7)
            s_dur = max(0.35, mora * mora_sec * jitter)

            # 読点があれば途中に 110ms の息継ぎ谷を作る
            if "、" in stext:
                head, tail = stext.split("、", 1)
                head_frac = estimate_japanese_morae(head) / max(0.5, mora)
                d1 = max(0.18, (s_dur - 0.11) * head_frac)
                d2 = max(0.18, (s_dur - 0.11) - d1)
                _append_tone(d1, freq=260.0 + 15.0 * (s_idx % 3))
                _append_silence(0.11)
                _append_tone(d2, freq=290.0 + 15.0 * (s_idx % 3))
            else:
                _append_tone(s_dur, freq=275.0 + 18.0 * (c_idx % 4))

            cur_t = len(samples) / sample_rate
            c_speech_end = cur_t
            sent_truths.append((s_start, cur_t, stext))

            is_last_overall = (c_idx == len(chunks) - 1) and (s_idx == len(sents) - 1)
            if not is_last_overall:
                is_chunk_boundary = s_idx == len(sents) - 1
                if missing_silence_boundary_idx is not None and global_sent_idx == missing_silence_boundary_idx:
                    # 無音・谷なしの連続発話境界
                    pass
                elif valley_only_boundary_idx is not None and global_sent_idx == valley_only_boundary_idx:
                    # 完全無音ではなく -16dB 落ち込む息継ぎ谷
                    _append_silence(0.12, amp=1600.0)
                else:
                    pause = chunk.pause_after_sec if is_chunk_boundary else 0.24
                    _append_silence(pause)
                cur_t = len(samples) / sample_rate

            global_sent_idx += 1

        c_end = cur_t
        chunk_truths.append((chunk.chunk_id, c_start, c_speech_end, c_end))

    wav_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(samples.tobytes())

    return chunk_truths, sent_truths


class TestOneTakeSynthesisAndFailover(unittest.TestCase):
    def test_onetake_single_api_call_and_single_model_lock(self) -> None:
        clock = _FakeClock(start=0.0)
        factory, calls = _make_fake_client_factory(
            lambda _k, _m, _c, _cfg: _make_audio_response(duration_sec=22.0)
        )
        client = GeminiTTSClient(
            api_keys=["k1", "k2"],
            models=("gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"),
            voice_name="Charon",
            request_interval_sec=0.0,
            client_factory=factory,
            clock=clock,
            sleep_fn=clock.sleep,
        )

        chunks = [
            NarrationChunk("c01", "Read calmly in Japanese: 太陽系の惑星に、生身で降りたらどうなるか。"),
            NarrationChunk("c02", "まずは水星。[pause]"),
            NarrationChunk("c03", "重力は地球の四割ほど。体重六十キロの人なら、二十三キロほどになります。"),
            NarrationChunk("c04", "昼の地面は最高で四百三十度。鉛もとける熱さです。"),
            NarrationChunk("c05", "ところが、いちばん熱い惑星は、となりの金星です。"),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            with (
                patch("yt_engine.audio.tts_gemini.trim_onetake_tts", return_value=22.0),
                patch("yt_engine.audio.tts_gemini.ffprobe_duration", return_value=22.0),
            ):
                # ダミーWAVに音響データが無いため aligner は fallback となるが、構造と API コール数を検証する
                res = client.synthesize_onetake_block(chunks, out_dir, block_id="ch01")

        self.assertEqual(len(calls), 1)
        self.assertEqual(res.api_calls, 1)
        self.assertFalse(res.cached)
        self.assertEqual(res.model_used, "gemini-3.8-flash-tts")
        self.assertEqual(res.voice_used, "Charon")
        self.assertEqual(len(res.chunks), 5)

        sent_prompt = calls[0][2]
        self.assertNotIn("Read calmly", sent_prompt)
        self.assertNotIn("[pause]", sent_prompt)
        self.assertIn("太陽系の惑星に、生身で降りたらどうなるか。", sent_prompt)
        self.assertIn("ところが、いちばん熱い惑星は、となりの金星です。", sent_prompt)

    def test_onetake_conflicting_voices_rejected(self) -> None:
        chunks = [
            NarrationChunk("c01", "一文目です。", voice_name="Charon"),
            NarrationChunk("c02", "二文目です。", voice_name="Orus"),
        ]
        with self.assertRaises(ValueError):
            compose_onetake_prompt(chunks, default_voice="Charon")

        # 一部だけ別ボイス指定でもエラーになること
        partial = [
            NarrationChunk("c01", "一文目です。"),
            NarrationChunk("c02", "二文目です。", voice_name="Orus"),
        ]
        with self.assertRaises(ValueError):
            compose_onetake_prompt(partial, default_voice="Charon")

    def test_onetake_cache_hit_and_invalidation_on_text_change(self) -> None:
        clock = _FakeClock()
        factory, calls = _make_fake_client_factory(
            lambda _k, _m, _c, _cfg: _make_audio_response(duration_sec=8.0)
        )
        client = GeminiTTSClient(
            api_keys=["k1"],
            models=("gemini-3.8-flash-tts",),
            request_interval_sec=0.0,
            client_factory=factory,
            clock=clock,
            sleep_fn=clock.sleep,
        )

        chunks_v1 = [
            NarrationChunk("c01", "一文目のテストです。"),
            NarrationChunk("c02", "二文目のテストです。"),
        ]
        chunks_v2 = [
            NarrationChunk("c01", "一文目のテストです。"),
            NarrationChunk("c02", "二文目を変更しました。"),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            with (
                patch("yt_engine.audio.tts_gemini.trim_onetake_tts", return_value=8.0),
                patch("yt_engine.audio.tts_gemini.ffprobe_duration", return_value=8.0),
            ):
                r1 = client.synthesize_onetake_block(chunks_v1, out_dir, block_id="ch01")
                self.assertEqual(len(calls), 1)
                self.assertFalse(r1.cached)
                self.assertEqual(r1.api_calls, 1)

                # 2回目同一原稿 -> キャッシュヒットで API コール 0 回
                r2 = client.synthesize_onetake_block(chunks_v1, out_dir, block_id="ch01")
                self.assertEqual(len(calls), 1)
                self.assertTrue(r2.cached)
                self.assertEqual(r2.api_calls, 0)
                self.assertEqual(r2.model_used, "gemini-3.8-flash-tts")

                # 3回目原稿変更 -> キャッシュ無効化され再生成 (+1 APIコール)
                r3 = client.synthesize_onetake_block(chunks_v2, out_dir, block_id="ch01")
                self.assertEqual(len(calls), 2)
                self.assertFalse(r3.cached)
                self.assertEqual(r3.api_calls, 1)

    def test_onetake_daily_quota_failover_switches_whole_block_model(self) -> None:
        clock = _FakeClock()

        def handler(_key: str, model: str, _contents: object, _cfg: object):
            if model == "gemini-3.8-flash-tts":
                raise APIError(
                    429,
                    {"error": {"status": "RESOURCE_EXHAUSTED", "message": "GenerateRequestsPerDay limit: 0"}},
                )
            return _make_audio_response(duration_sec=10.0)

        factory, calls = _make_fake_client_factory(handler)
        client = GeminiTTSClient(
            api_keys=["primary", "fallback"],
            models=("gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"),
            request_interval_sec=0.0,
            client_factory=factory,
            clock=clock,
            sleep_fn=clock.sleep,
        )

        chunks = [
            NarrationChunk("c01", "テストの一文目です。"),
            NarrationChunk("c02", "テストの二文目です。"),
            NarrationChunk("c03", "テストの三文目です。"),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            with (
                patch("yt_engine.audio.tts_gemini.trim_onetake_tts", return_value=10.0),
                patch("yt_engine.audio.tts_gemini.ffprobe_duration", return_value=10.0),
            ):
                res = client.synthesize_onetake_block(chunks, Path(tmp), block_id="ch01")

        self.assertEqual(res.model_used, "gemini-3.8-flash-lite-tts")
        self.assertEqual(res.api_calls, 1)
        self.assertEqual(
            [(c[0], c[1]) for c in calls],
            [
                ("primary", "gemini-3.8-flash-tts"),
                ("fallback", "gemini-3.8-flash-tts"),
                ("primary", "gemini-3.8-flash-lite-tts"),
            ],
        )


class TestAcousticDPAlignmentAndTimeline(unittest.TestCase):
    def test_acoustic_dp_alignment_accuracy_on_synthetic_japanese_wav(self) -> None:
        chunks = [
            NarrationChunk("c01_hook", "太陽系の惑星に、生身で降りたらどうなるか。", pause_after_sec=0.35),
            NarrationChunk("c02_mercury_intro", "まずは水星。", pause_after_sec=0.32),
            NarrationChunk(
                "c03_gravity",
                "重力は地球の四割ほど。体重六十キロの人なら、二十三キロほどになります。",
                pause_after_sec=0.38,
            ),
            NarrationChunk("c04_jump", "体が軽くて喜べるのは、着地するまでです。", pause_after_sec=0.40),
            NarrationChunk("c05_day_temp", "昼の地面は最高で四百三十度。鉛もとける熱さです。", pause_after_sec=0.38),
            NarrationChunk("c06_venus", "ところが、いちばん熱い惑星は、となりの金星です。", pause_after_sec=0.30),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            wav_path = Path(tmp) / "synthetic_onetake.wav"
            chunk_truths, sent_truths = _synthesize_japanese_like_wav(wav_path, chunks)
            spans, summary = align_chunks_acoustic_dp(chunks, wav_path)

        self.assertEqual(len(spans), len(chunks))
        self.assertEqual(summary["aligner"], "acoustic_dp")
        self.assertGreaterEqual(summary["silenceHitRate"], 0.99)
        self.assertEqual(summary["passes"], 2)

        for span, (cid, true_start, true_speech_end, true_end) in zip(spans, chunk_truths):
            self.assertEqual(span.chunk_id, cid)
            self.assertEqual(span.boundary_source, "silence_boundary")
            self.assertLessEqual(
                abs(span.start_sec - true_start),
                0.06,
                f"{cid} start mismatch: got={span.start_sec}, truth={true_start}",
            )
            self.assertLessEqual(
                abs(span.speech_end_sec - true_speech_end),
                0.06,
                f"{cid} speech_end mismatch: got={span.speech_end_sec}, truth={true_speech_end}",
            )
            self.assertLessEqual(
                abs(span.end_sec - true_end),
                0.06,
                f"{cid} end mismatch: got={span.end_sec}, truth={true_end}",
            )

        # チャンク内2文目頭の時刻（例: c03 の「体重」、c05 の「鉛」）が文境界に高精度一致すること
        c03_span = spans[2]
        c05_span = spans[4]
        weight_t = locate_text_timestamp_in_chunk(c03_span, "体重")
        lead_t = locate_text_timestamp_in_chunk(c05_span, "鉛")
        # sent_truths: 0=c01, 1=c02, 2=c03_1, 3=c03_2("体重..."), 4=c04, 5=c05_1, 6=c05_2("鉛...")
        self.assertLessEqual(abs(weight_t - sent_truths[3][0]), 0.06)
        self.assertLessEqual(abs(lead_t - sent_truths[6][0]), 0.06)

    def test_acoustic_dp_handles_missing_silence_with_valley_or_fallback(self) -> None:
        chunks = [
            NarrationChunk("c01", "太陽系の惑星に降りたらどうなるか。", pause_after_sec=0.35),
            NarrationChunk("c02", "まずは水星から見ていきます。", pause_after_sec=0.35),
            NarrationChunk("c03", "昼の地面は四百三十度です。", pause_after_sec=0.35),
            NarrationChunk("c04", "となりの金星はさらに熱い星です。", pause_after_sec=0.35),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            # ケースA: 境界1番目が息継ぎ谷（-16dB減衰のみ、完全無音なし）
            wav_valley = Path(tmp) / "valley.wav"
            _synthesize_japanese_like_wav(wav_valley, chunks, valley_only_boundary_idx=1)
            spans_v, _ = align_chunks_acoustic_dp(chunks, wav_valley)
            self.assertEqual(len(spans_v), 4)
            for i in range(len(spans_v) - 1):
                self.assertLess(spans_v[i].start_sec, spans_v[i].speech_end_sec)
                self.assertLessEqual(spans_v[i].speech_end_sec, spans_v[i + 1].start_sec)

            # ケースB: 境界1番目が無音も谷もゼロの完全連続
            wav_cont = Path(tmp) / "continuous.wav"
            _synthesize_japanese_like_wav(wav_cont, chunks, missing_silence_boundary_idx=1)
            spans_c, _ = align_chunks_acoustic_dp(chunks, wav_cont)
            self.assertEqual(len(spans_c), 4)
            for i in range(len(spans_c) - 1):
                self.assertLess(spans_c[i].start_sec, spans_c[i].speech_end_sec)
                self.assertLessEqual(spans_c[i].speech_end_sec, spans_c[i + 1].start_sec)

    def test_build_onetake_timeline_preserves_schema_and_tempo_bounds(self) -> None:
        chunks = [
            NarrationChunk("c01", "太陽系の惑星に、生身で降りたらどうなるか。", pause_after_sec=0.30),
            NarrationChunk("c02", "まずは水星。", pause_after_sec=0.25),
            NarrationChunk("c03", "昼の地面は四百三十度。鉛もとける熱さです。", pause_after_sec=0.35),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            clean_wav = tmp_dir / "onetake_block.wav"
            _synthesize_japanese_like_wav(clean_wav, chunks)

            clock = _FakeClock()
            # raw_wav を経由せず synthesize_onetake_block と同じ戻り値型を手動構築して timeline 変換を直接検証
            raw_bytes = clean_wav.read_bytes()
            part = SimpleNamespace(inline_data=SimpleNamespace(data=raw_bytes, mime_type="audio/wav"))
            resp = SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))])
            factory, calls = _make_fake_client_factory(lambda *_a: resp)
            client = GeminiTTSClient(
                api_keys=["k1"],
                models=("gemini-3.8-flash-tts",),
                request_interval_sec=0.0,
                client_factory=factory,
                clock=clock,
                sleep_fn=clock.sleep,
            )
            res = client.synthesize_onetake_block(chunks, tmp_dir, block_id="ep_ch1")
            self.assertEqual(len(calls), 1)

            target_sec = round(res.total_duration_sec * 0.96 + 0.37, 2)
            timeline = build_onetake_timeline(
                res,
                tmp_dir,
                leading_silence_sec=0.12,
                target_total_sec=target_sec,
                min_tempo=0.95,
                max_tempo=1.08,
            )

        self.assertEqual(timeline["ttsMode"], "onetake")
        self.assertEqual(timeline["ttsApiCalls"], 1)
        self.assertEqual(timeline["ttsModel"], "gemini-3.8-flash-tts")
        self.assertGreaterEqual(timeline["appliedTempo"], 0.95)
        self.assertLessEqual(timeline["appliedTempo"], 1.08)
        self.assertEqual(timeline["totalFrames"], math.ceil(timeline["totalDurationSec"] * 30))

        prev_end = 0.0
        for cid in ("c01", "c02", "c03"):
            entry = timeline["chunks"][cid]
            for key in (
                "text",
                "startSec",
                "speechEndSec",
                "endSec",
                "startFrame",
                "endFrame",
                "durationSec",
                "pauseSec",
                "internalPausesSec",
                "sentenceSpans",
                "pacedWav",
            ):
                self.assertIn(key, entry)
            self.assertGreaterEqual(entry["startSec"], prev_end - 1e-4)
            self.assertGreater(entry["speechEndSec"], entry["startSec"])
            self.assertGreaterEqual(entry["endSec"], entry["speechEndSec"])
            prev_end = entry["endSec"]

    def test_trim_onetake_tts_caps_internal_silence_without_double_adding(self) -> None:
        chunks = [
            NarrationChunk("c01", "一文目のテストです。", pause_after_sec=1.20),
            NarrationChunk("c02", "二文目のテストです。", pause_after_sec=1.20),
            NarrationChunk("c03", "三文目のテストです。", pause_after_sec=0.10),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            raw_wav = tmp_dir / "raw.wav"
            clean_wav = tmp_dir / "clean.wav"
            _synthesize_japanese_like_wav(raw_wav, chunks)
            raw_dur = ffprobe_duration(raw_wav)
            clean_dur = trim_onetake_tts(raw_wav, clean_wav, max_internal_silence_sec=0.25)
            silences = detect_silence_intervals(clean_wav, min_duration_sec=0.10)

        self.assertLess(clean_dur, raw_dur - 1.5)
        for sil in silences:
            self.assertLessEqual(sil.duration_sec, 0.32)


if __name__ == "__main__":
    unittest.main()
