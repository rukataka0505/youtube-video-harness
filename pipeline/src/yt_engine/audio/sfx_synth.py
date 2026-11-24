"""48kHz Stereo 合成SFX（標準20種＋エピソード固有カスタム合成）・BGM生成・YouTube最適音圧 (-14.0 LUFS) ミキサー。

共通 SFX 基盤の設計：
- 検証済みの標準 20 種波形合成 SFX を「立ち上がり 0ms・統一音圧（ピーク上限 0.78 / 有音 RMS 上限 0.22）」の
  48kHz 16-bit Stereo PCM WAV として `studio/public/sfx/<kind>.wav` へ一括書き出しする。
- 演出制作時に標準 20 種で噛み合わないフック・固有ギミック用のカスタム合成 WAV も
  `render_custom_sfx` / `export_episode_custom_sfx` で同一フォーマット・統一音圧・立ち上がり 0ms で即時生成できる。
- Remotion TSX 側は `<SfxCue>`（既定 volume=0.35）で視覚ヒットフレームへ直結配置し、
  書き出し後に `master_final.py`（2パス linear loudnorm: -14.0 LUFS / -1.4 dBTP）で最終音圧を確定する。
"""

from __future__ import annotations

import array
import math
import random
import re
import sys
import wave
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Callable, Literal, Sequence

from yt_engine.audio.tts_gemini import run_cmd


SAMPLE_RATE = 48000
REPO_ROOT = Path(__file__).resolve().parents[4]
STUDIO_PUBLIC_DIR = REPO_ROOT / "studio" / "public"
STUDIO_PUBLIC_SFX_DIR = STUDIO_PUBLIC_DIR / "sfx"

# 静的 WAV 書き出し時の音圧統一基準（Remotion <SfxCue volume={0.35}> と組んで -14 LUFS ミックスが破綻しない基準）
SFX_TARGET_PEAK = 0.78        # 約 -2.16 dBFS（クリップ防止ヘッドルーム確保）
SFX_TARGET_ACTIVE_RMS = 0.22  # 約 -13.15 dBFS（有音区間 RMS を全種別で統一）

# 検証済み標準 20 種合成 SFX カタログ（studio/src/components/sfx.ts と完全一致）
STANDARD_SFX_KINDS: tuple[str, ...] = (
    "paper_snap",
    "pen_scratch",
    "soft_pop",
    "whoosh",
    "radar_beep",
    "error_buzzer",
    "impact_thud",
    "data_chirp",
    "mech_slide",
    "question_boing",
    "stamp_thud",
    "chart_tick",
    "vhs_pause",
    "glitch_burst",
    "mallet_bonk",
    "armor_clang",
    "dizzy_spin",
    "projector_click",
    "camera_shutter",
    "price_ping",
)
ALLOWED_SFX_KINDS: frozenset[str] = frozenset(STANDARD_SFX_KINDS)

# 既存・制作中エピソードとの後方互換エイリアス（新規制作は標準 20 種またはカスタム WAV を使う）
LEGACY_SFX_ALIASES: dict[str, str] = {
    "applause": "soft_pop",
    "clock_tick": "chart_tick",
    "coin_drop": "price_ping",
    "door_knock": "impact_thud",
    "finger_snap": "paper_snap",
    "footsteps": "impact_thud",
    "heartbeat": "impact_thud",
    "keyboard_typing": "data_chirp",
    "mouse_click": "projector_click",
    "page_turn": "paper_snap",
    "phone_notification": "radar_beep",
    "phone_vibration": "vhs_pause",
    "record_scratch": "vhs_pause",
    "sparkle": "price_ping",
    "swipe": "mech_slide",
    "switch_click": "projector_click",
    "toy_squeak": "question_boing",
    "typewriter": "data_chirp",
    "water_drop": "soft_pop",
    "zipper": "mech_slide",
}


def resolve_sfx_kind(kind: str) -> str:
    """標準 20 種（または後方互換エイリアス）へ解決し、未知の種別を拒否する。"""
    resolved = LEGACY_SFX_ALIASES.get(kind, kind)
    if resolved not in ALLOWED_SFX_KINDS:
        raise ValueError(f"Unsupported SFX event kind: {kind!r}")
    return resolved


DEFAULT_PIANO_CHORDS: tuple[tuple[int, ...], ...] = (
    (48, 55, 62, 64, 71),  # Cmaj9
    (45, 52, 55, 60, 64),  # Am7
    (41, 48, 57, 60, 64),  # Fmaj7
    (43, 50, 59, 62, 64),  # G6
    (40, 47, 55, 59, 62),  # Em7
)


class StereoBuffer:
    """48kHz ステレオ浮動小数点オーディオ合成バッファ。"""

    def __init__(self, duration_sec: float, sample_rate: int = SAMPLE_RATE) -> None:
        self.sample_rate = sample_rate
        self.total_samples = max(1, int(math.ceil(duration_sec * sample_rate)))
        self.left = array.array("f", [0.0]) * self.total_samples
        self.right = array.array("f", [0.0]) * self.total_samples

    def write_wav(self, out_wav: Path, *, soft_clip: bool = False) -> Path:
        """バッファ内容を 16-bit stereo PCM WAV として保存する。"""
        out_wav.parent.mkdir(parents=True, exist_ok=True)
        pcm = array.array("h")
        for l_val, r_val in zip(self.left, self.right):
            if soft_clip:
                l_c = max(-0.98, min(0.98, math.tanh(l_val)))
                r_c = max(-0.98, min(0.98, math.tanh(r_val)))
            else:
                l_c = max(-0.98, min(0.98, l_val))
                r_c = max(-0.98, min(0.98, r_val))
            pcm.append(int(l_c * 32767))
            pcm.append(int(r_c * 32767))

        with wave.open(str(out_wav), "wb") as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(self.sample_rate)
            wf.writeframes(pcm.tobytes())
        return out_wav


def add_paper_snap(
    buf: StereoBuffer,
    t_sec: float,
    *,
    gain: float = 0.24,
    pan: float = 0.0,
    rng: random.Random | None = None,
) -> None:
    """報道紙面・切り抜きカード出現用の控えめな紙スナップ音を指定バッファへ加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(0.075 * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    local_rng = rng or random.Random(int(t_sec * 1000) + 17)
    l_g = math.cos((pan + 1.0) * math.pi * 0.25)
    r_g = math.sin((pan + 1.0) * math.pi * 0.25)
    prev = 0.0
    for i in range(n_samp):
        t = i / sr
        env = (i / 180.0) if i < 180 else math.exp(-t * 58.0)
        noise = local_rng.random() * 2.0 - 1.0
        hp = noise - 0.72 * prev
        prev = noise
        thump = math.sin(2.0 * math.pi * (165.0 - t * 900.0) * t) * math.exp(-t * 75.0)
        sample = (hp * 0.26 + thump * 0.35) * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_pen_scratch(
    buf: StereoBuffer,
    t_sec: float,
    *,
    gain: float = 0.14,
    pan: float = 0.0,
    stroke_sec: float = 0.22,
    rng: random.Random | None = None,
) -> None:
    """手描き丸囲み・T字線描画用の柔らかなペン摩擦音を指定バッファへ加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(stroke_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    local_rng = rng or random.Random(int(t_sec * 1000) + 31)
    l_g = math.cos((pan + 1.0) * math.pi * 0.25)
    r_g = math.sin((pan + 1.0) * math.pi * 0.25)
    lp = 0.0
    for i in range(n_samp):
        env = math.sin(math.pi * (i / n_samp)) ** 0.7
        noise = local_rng.random() * 2.0 - 1.0
        lp = lp * 0.78 + noise * 0.22
        sample = lp * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_soft_pop(
    buf: StereoBuffer,
    t_sec: float,
    *,
    f0: float = 180.0,
    f1: float = 300.0,
    gain: float = 0.16,
    pan: float = 0.0,
) -> None:
    """タイトル反転や要素登場時の控えめなソフトポップ音を指定バッファへ加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(0.11 * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    l_g = math.cos((pan + 1.0) * math.pi * 0.25)
    r_g = math.sin((pan + 1.0) * math.pi * 0.25)
    phase = 0.0
    for i in range(n_samp):
        t = i / sr
        freq = f0 + (f1 - f0) * min(1.0, t / 0.08)
        phase += 2.0 * math.pi * freq / sr
        env = (i / 140.0) if i < 140 else math.exp(-t * 36.0)
        sample = math.sin(phase) * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def paper_snap(
    out_wav: Path,
    *,
    duration_sec: float = 0.15,
    t_sec: float = 0.005,
    gain: float = 0.24,
    pan: float = 0.0,
    sample_rate: int = SAMPLE_RATE,
    seed: int = 20261121,
) -> Path:
    """単発の紙スナップ SFX を 48kHz stereo WAV として書き出す。"""
    buf = StereoBuffer(duration_sec, sample_rate=sample_rate)
    add_paper_snap(buf, t_sec, gain=gain, pan=pan, rng=random.Random(seed))
    return buf.write_wav(out_wav)


def pen_scratch(
    out_wav: Path,
    *,
    duration_sec: float = 0.30,
    t_sec: float = 0.01,
    gain: float = 0.14,
    pan: float = 0.0,
    stroke_sec: float = 0.22,
    sample_rate: int = SAMPLE_RATE,
    seed: int = 20261121,
) -> Path:
    """単発のペン摩擦 SFX を 48kHz stereo WAV として書き出す。"""
    buf = StereoBuffer(duration_sec, sample_rate=sample_rate)
    add_pen_scratch(
        buf, t_sec, gain=gain, pan=pan, stroke_sec=stroke_sec, rng=random.Random(seed)
    )
    return buf.write_wav(out_wav)


def soft_pop(
    out_wav: Path,
    *,
    duration_sec: float = 0.16,
    t_sec: float = 0.005,
    f0: float = 180.0,
    f1: float = 300.0,
    gain: float = 0.16,
    pan: float = 0.0,
    sample_rate: int = SAMPLE_RATE,
) -> Path:
    """単発のソフトポップ SFX を 48kHz stereo WAV として書き出す。"""
    buf = StereoBuffer(duration_sec, sample_rate=sample_rate)
    add_soft_pop(buf, t_sec, f0=f0, f1=f1, gain=gain, pan=pan)
    return buf.write_wav(out_wav)


def _midi_to_hz(midi: int) -> float:
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def _add_piano_note(
    buf: StereoBuffer,
    start_sec: float,
    midi: int,
    dur_sec: float,
    velocity: float,
    pan: float,
) -> None:
    sr = buf.sample_rate
    s0 = int(start_sec * sr)
    n_samp = min(int(dur_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    freq = _midi_to_hz(midi)
    # 弦の微細デチューン3本＋6次倍音で温かく芯のあるアコースティックピアノ音色を合成
    detunes = (0.9992, 1.0, 1.0008)
    harmonics = (1.0, 0.42, 0.20, 0.09, 0.04, 0.02)
    l_gain = math.cos((pan + 1.0) * math.pi * 0.25)
    r_gain = math.sin((pan + 1.0) * math.pi * 0.25)
    decay_base = 2.6 + (midi - 48) * 0.06
    rng = random.Random(midi * 97 + s0)

    attack_n = max(1, int(0.006 * sr))
    hammer_n = max(1, int(0.014 * sr))
    tail_fade_n = max(1, int(0.020 * sr))

    for i in range(n_samp):
        t = i / sr
        env = (i / attack_n) if i < attack_n else math.exp(-t * decay_base)
        if i > n_samp - tail_fade_n:
            env *= (n_samp - i) / float(tail_fade_n)

        val = 0.0
        for d_idx, det in enumerate(detunes):
            f_det = freq * det
            w_det = 0.40 if d_idx == 1 else 0.30
            for h_idx, h_amp in enumerate(harmonics, start=1):
                h_decay = math.exp(-t * (h_idx - 1) * 1.4)
                inharm = 1.0 + 0.00018 * (h_idx * h_idx)
                val += w_det * h_amp * h_decay * math.sin(2.0 * math.pi * f_det * h_idx * inharm * t)

        if i < hammer_n:
            h_env = (1.0 - i / hammer_n) ** 2
            val += (rng.random() * 2.0 - 1.0) * 0.06 * h_env

        sample = val * env * velocity * 0.22
        idx = s0 + i
        buf.left[idx] += sample * l_gain
        buf.right[idx] += sample * r_gain


def piano_chord_progression(
    beat_times_sec: Sequence[float],
    total_duration_sec: float,
    out_wav: Path,
    *,
    chords: Sequence[Sequence[int]] = DEFAULT_PIANO_CHORDS,
    add_offbeat_echo: bool = True,
    add_outro_chord: bool = True,
    reverb: bool = True,
    sample_rate: int = SAMPLE_RATE,
) -> Path:
    """指定ビート時刻配列に同期して倍音豊かなピアノコード進行を 48kHz stereo WAV 合成する。"""
    if not beat_times_sec:
        raise ValueError("beat_times_sec must contain at least one beat timestamp.")
    if not chords:
        raise ValueError("chords must not be empty.")

    buf = StereoBuffer(total_duration_sec, sample_rate=sample_rate)

    for idx, beat_t in enumerate(beat_times_sec):
        chord = chords[idx % len(chords)]
        for n_i, midi_note in enumerate(chord):
            pan = -0.35 + 0.7 * (n_i / max(1, len(chord) - 1))
            _add_piano_note(
                buf,
                beat_t + n_i * 0.011,
                midi_note,
                1.35,
                0.92 if n_i == 0 else 0.76,
                pan,
            )

        if add_offbeat_echo:
            next_t = (
                beat_times_sec[idx + 1]
                if idx + 1 < len(beat_times_sec)
                else (total_duration_sec - 0.15)
            )
            gap = next_t - beat_t
            if gap > 0.55:
                mid_t = beat_t + gap * 0.52
                for n_i, midi_note in enumerate(chord[2:]):
                    _add_piano_note(buf, mid_t + n_i * 0.008, midi_note + 12, 0.45, 0.42, 0.20)

    if add_outro_chord:
        last_t = beat_times_sec[-1] + 0.55
        if last_t + 0.3 < total_duration_sec:
            for n_i, midi_note in enumerate((41, 53, 60, 64, 67)):
                _add_piano_note(
                    buf,
                    last_t + n_i * 0.014,
                    midi_note,
                    max(0.3, total_duration_sec - last_t),
                    0.72,
                    -0.15 + 0.1 * n_i,
                )

    if not reverb:
        return buf.write_wav(out_wav, soft_clip=True)

    tmp_dry = out_wav.with_suffix(".dry.wav")
    buf.write_wav(tmp_dry, soft_clip=True)
    try:
        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(tmp_dry),
                "-af",
                "aecho=0.8:0.88:34:0.18,lowpass=f=5200",
                "-ar",
                str(sample_rate),
                "-ac",
                "2",
                "-c:a",
                "pcm_s16le",
                str(out_wav),
            ]
        )
    finally:
        tmp_dry.unlink(missing_ok=True)
    return out_wav


def _stereo_pan_gains(pan: float) -> tuple[float, float]:
    angle = (max(-1.0, min(1.0, pan)) + 1.0) * math.pi * 0.25
    return math.cos(angle), math.sin(angle)


def add_whoosh(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.28,
    pitch_start: float = 180.0,
    pitch_end: float = 680.0,
    gain: float = 0.20,
    pan: float = 0.0,
    rng: random.Random | None = None,
) -> None:
    """ズーム・スライド・上昇パン向けの空気感のあるスウィッシュ音を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    local_rng = rng or random.Random(int(t_sec * 1000) + 43)
    l_g, r_g = _stereo_pan_gains(pan)
    lp = 0.0
    prev_lp = 0.0
    phase = 0.0
    for i in range(n_samp):
        p = i / max(1, n_samp - 1)
        env = math.sin(math.pi * p) ** 1.15
        alpha = 0.08 + 0.28 * (p if pitch_end >= pitch_start else 1.0 - p)
        noise = local_rng.random() * 2.0 - 1.0
        lp = lp * (1.0 - alpha) + noise * alpha
        bp = lp - prev_lp * 0.65
        prev_lp = lp
        freq = pitch_start + (pitch_end - pitch_start) * (p ** 1.2)
        phase += 2.0 * math.pi * freq / sr
        tone = math.sin(phase) * 0.22
        sample = (bp * 1.4 + tone) * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_radar_beep(
    buf: StereoBuffer,
    t_sec: float,
    *,
    freq_hz: float = 1240.0,
    pulses: int = 2,
    pulse_gap_sec: float = 0.09,
    gain: float = 0.18,
    pan: float = 0.0,
) -> None:
    """衛星ロックオン・照準ターゲット演出用の電子ビープ音を加算する。"""
    sr = buf.sample_rate
    l_g, r_g = _stereo_pan_gains(pan)
    pulse_dur = 0.055
    for k in range(max(1, pulses)):
        s0 = int((t_sec + k * pulse_gap_sec) * sr)
        n_samp = min(int(pulse_dur * sr), buf.total_samples - s0)
        if n_samp <= 0 or s0 < 0:
            continue
        f = freq_hz * (1.0 + 0.12 * k)
        for i in range(n_samp):
            t = i / sr
            env = (min(1.0, i / 90.0)) * math.exp(-t * 42.0)
            osc = math.sin(2.0 * math.pi * f * t) * 0.78 + math.sin(2.0 * math.pi * f * 2.0 * t) * 0.18
            sample = osc * env * gain
            buf.left[s0 + i] += sample * l_g
            buf.right[s0 + i] += sample * r_g


def add_error_buzzer(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.26,
    gain: float = 0.22,
    pan: float = 0.0,
) -> None:
    """禁止×印・警告表示向けの二重矩形寄りブザー音を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    l_g, r_g = _stereo_pan_gains(pan)
    for i in range(n_samp):
        t = i / sr
        p = i / max(1, n_samp - 1)
        gate = 1.0 if (t < 0.11 or t >= 0.14) else 0.18
        env = min(1.0, i / 120.0) * math.exp(-max(0.0, p - 0.55) * 6.5) * gate
        w1 = math.tanh(math.sin(2.0 * math.pi * 155.0 * t) * 2.4)
        w2 = math.tanh(math.sin(2.0 * math.pi * 164.0 * t) * 2.4)
        sample = (w1 * 0.52 + w2 * 0.48) * 0.55 * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_impact_thud(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.24,
    gain: float = 0.28,
    pan: float = 0.0,
) -> None:
    """ハードカット・ロゴ切替・兵士登場用の引き締まった低音インパクトを加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    l_g, r_g = _stereo_pan_gains(pan)
    phase = 0.0
    for i in range(n_samp):
        t = i / sr
        freq = 44.0 + 96.0 * math.exp(-t * 22.0)
        phase += 2.0 * math.pi * freq / sr
        env = min(1.0, i / 90.0) * math.exp(-t * 14.0)
        click = math.sin(2.0 * math.pi * 420.0 * t) * math.exp(-t * 85.0) * 0.35
        sample = (math.sin(phase) * 0.85 + click) * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_data_chirp(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.35,
    gain: float = 0.12,
    pan: float = 0.0,
    rng: random.Random | None = None,
) -> None:
    """衛星傍受・無線データ点滅同期用の細かな電子データ通信音を加算する。"""
    sr = buf.sample_rate
    l_g, r_g = _stereo_pan_gains(pan)
    local_rng = rng or random.Random(int(t_sec * 1000) + 71)
    steps = max(3, int(round(duration_sec / 0.055)))
    step_dt = duration_sec / steps
    notes = (980.0, 1318.0, 1568.0, 1175.0, 1760.0)
    for k in range(steps):
        s0 = int((t_sec + k * step_dt) * sr)
        n_samp = min(int(0.038 * sr), buf.total_samples - s0)
        if n_samp <= 0 or s0 < 0:
            continue
        f = notes[(k + local_rng.randint(0, 2)) % len(notes)]
        for i in range(n_samp):
            t = i / sr
            env = min(1.0, i / 60.0) * math.exp(-t * 58.0)
            sample = math.sin(2.0 * math.pi * f * t) * env * gain
            buf.left[s0 + i] += sample * l_g
            buf.right[s0 + i] += sample * r_g


def add_mech_slide(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.32,
    gain: float = 0.14,
    pan: float = 0.0,
    rng: random.Random | None = None,
) -> None:
    """レドーム開閉・パラボラアンテナ回転向けの機械的スライド/サーボ音を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    local_rng = rng or random.Random(int(t_sec * 1000) + 89)
    l_g, r_g = _stereo_pan_gains(pan)
    phase = 0.0
    lp = 0.0
    for i in range(n_samp):
        t = i / sr
        p = i / max(1, n_samp - 1)
        env = math.sin(math.pi * p) ** 0.85
        freq = 210.0 + 145.0 * p
        phase += 2.0 * math.pi * freq / sr
        whir = math.sin(phase) * 0.42 + math.sin(phase * 2.0) * 0.14
        lp = lp * 0.82 + (local_rng.random() * 2.0 - 1.0) * 0.18
        ticks = 0.0
        for tick_p in (0.18, 0.48, 0.78):
            dt = t - tick_p * duration_sec
            if dt >= 0.0:
                ticks += math.sin(2.0 * math.pi * 1950.0 * dt) * math.exp(-dt * 160.0) * 0.38
        sample = (whir + lp * 0.55 + ticks) * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_question_boing(
    buf: StereoBuffer,
    t_sec: float,
    *,
    gain: float = 0.18,
    pan: float = 0.0,
) -> None:
    """疑問符「？」ポップ用の軽快なピッチ上昇ボヨヨン音を加算する。"""
    sr = buf.sample_rate
    dur = 0.22
    s0 = int(t_sec * sr)
    n_samp = min(int(dur * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    l_g, r_g = _stereo_pan_gains(pan)
    phase = 0.0
    for i in range(n_samp):
        t = i / sr
        p = i / max(1, n_samp - 1)
        freq = 270.0 + 440.0 * (p ** 0.72) + 28.0 * math.sin(2.0 * math.pi * 24.0 * t)
        phase += 2.0 * math.pi * freq / sr
        env = min(1.0, i / 110.0) * math.exp(-t * 14.5)
        sample = (math.sin(phase) * 0.82 + math.sin(phase * 2.0) * 0.18) * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def _add_synth_pluck(
    buf: StereoBuffer,
    start_sec: float,
    midi: int,
    dur_sec: float,
    amp: float,
    pan: float,
    *,
    bright_boost: float = 1.0,
) -> None:
    sr = buf.sample_rate
    s0 = int(start_sec * sr)
    n_samp = min(int(dur_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    f0 = _midi_to_hz(midi)
    l_g, r_g = _stereo_pan_gains(pan)
    attack_n = max(1, int(0.005 * sr))
    for i in range(n_samp):
        t = i / sr
        env = (i / attack_n if i < attack_n else 1.0) * math.exp(-t * 4.8)
        bright_env = math.exp(-t * 14.0) * bright_boost
        osc = (
            math.sin(2.0 * math.pi * f0 * t) * 0.68
            + math.sin(2.0 * math.pi * (f0 * 1.002) * t) * 0.24
            + math.sin(2.0 * math.pi * (f0 * 2.0) * t) * 0.22 * bright_env
            + math.sin(2.0 * math.pi * (f0 * 3.0) * t) * 0.08 * bright_env
        )
        tail = min(1.0, (dur_sec - t) / 0.025) if t > dur_sec - 0.025 else 1.0
        sample = osc * env * tail * amp
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def mysterious_synth_bgm(
    total_duration_sec: float,
    out_wav: Path,
    *,
    bpm: float = 100.0,
    tension_boost_sec: float | None = None,
    sample_rate: int = SAMPLE_RATE,
) -> Path:
    """0.0秒から開始する案B用の抑制的ミステリアス系シンセBGM（~100BPM）を 48kHz stereo WAV 合成する。"""
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    buf = StereoBuffer(total_duration_sec, sample_rate=sample_rate)

    # Am -> F -> Dm -> Esus4 の8分音符アルペジオ（1小節=8ステップ）
    progression: tuple[tuple[int, ...], ...] = (
        (57, 64, 67, 69, 64, 69, 71, 64),  # Am9
        (53, 60, 64, 69, 60, 64, 67, 60),  # Fmaj7
        (50, 57, 62, 65, 57, 62, 64, 57),  # Dm9
        (52, 57, 59, 64, 57, 59, 62, 57),  # Esus4/7
    )
    bass_roots: tuple[int, ...] = (45, 41, 38, 40)  # A2, F2, D2, E2

    eighth_sec = 60.0 / max(40.0, bpm) / 2.0
    step_idx = 0
    t_cur = 0.05
    rng = random.Random(20261121)

    while t_cur < total_duration_sec - 0.12:
        bar_idx = (step_idx // 8) % len(progression)
        note_idx = step_idx % 8
        in_tension = tension_boost_sec is not None and t_cur >= tension_boost_sec
        bright = 1.38 if in_tension else 1.0
        amp_scale = 1.18 if in_tension else 1.0

        midi = progression[bar_idx][note_idx]
        pluck_amp = (0.092 if note_idx % 4 == 0 else 0.062) * amp_scale
        pan = -0.26 if note_idx % 2 == 0 else 0.26
        _add_synth_pluck(
            buf,
            t_cur,
            midi,
            min(0.42, total_duration_sec - t_cur),
            pluck_amp,
            pan,
            bright_boost=bright,
        )

        # 1拍目・3拍目に深いサブベースパルス
        if note_idx in (0, 4):
            bass_midi = bass_roots[bar_idx] - (12 if note_idx == 0 else 0)
            bass_amp = (0.125 if note_idx == 0 else 0.085) * amp_scale
            _add_synth_pluck(
                buf,
                t_cur,
                bass_midi,
                min(0.95, total_duration_sec - t_cur),
                bass_amp,
                0.0,
                bright_boost=0.55 if not in_tension else 0.78,
            )

        # 4分拍の極小クロックティック（推進感・ミステリー感）
        if note_idx % 2 == 0:
            s0 = int(t_cur * sample_rate)
            n_tick = min(int(0.022 * sample_rate), buf.total_samples - s0)
            tick_gain = (0.040 if note_idx == 0 else 0.024) * amp_scale
            for i in range(max(0, n_tick)):
                ti = i / sample_rate
                val = (
                    math.sin(2.0 * math.pi * 2450.0 * ti) * 0.6
                    + (rng.random() * 2.0 - 1.0) * 0.25
                ) * math.exp(-ti * 190.0) * tick_gain
                buf.left[s0 + i] += val * 0.88
                buf.right[s0 + i] += val * 1.12

        step_idx += 1
        t_cur += eighth_sec

    tmp_dry = out_wav.with_suffix(".dry.wav")
    buf.write_wav(tmp_dry, soft_clip=True)
    fade_out_st = max(0.0, total_duration_sec - 0.5)
    try:
        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(tmp_dry),
                "-af",
                (
                    "lowpass=f=2400,aecho=0.8:0.85:45|85:0.20|0.12,"
                    f"afade=t=in:d=0.15,afade=t=out:st={fade_out_st:.3f}:d=0.45"
                ),
                "-ar",
                str(sample_rate),
                "-ac",
                "2",
                "-c:a",
                "pcm_s16le",
                str(out_wav),
            ]
        )
    finally:
        tmp_dry.unlink(missing_ok=True)
    return out_wav


def add_stamp_thud(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.16,
    gain: float = 0.28,
    pan: float = 0.0,
    rng: random.Random | None = None,
) -> None:
    """案E向け：風刺スタンプ押印・チェックリスト確定用の乾いた重みのある打撃音を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    local_rng = rng or random.Random(int(t_sec * 1000) + 109)
    l_g, r_g = _stereo_pan_gains(pan)
    phase = 0.0
    prev = 0.0
    for i in range(n_samp):
        t = i / sr
        freq = 56.0 + 135.0 * math.exp(-t * 36.0)
        phase += 2.0 * math.pi * freq / sr
        env = min(1.0, i / 70.0) * math.exp(-t * 22.0)
        noise = local_rng.random() * 2.0 - 1.0
        hp = noise - 0.70 * prev
        prev = noise
        wood_click = math.sin(2.0 * math.pi * 620.0 * t) * math.exp(-t * 78.0) * 0.40
        sample = (math.sin(phase) * 0.75 + wood_click + hp * 0.25 * math.exp(-t * 45.0)) * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_chart_tick(
    buf: StereoBuffer,
    t_sec: float,
    *,
    freq_hz: float = 1480.0,
    pulses: int = 3,
    step_gap_sec: float = 0.075,
    gain: float = 0.15,
    pan: float = 0.0,
) -> None:
    """案E向け：経済グラフ描画・数値ステップ点灯用のクリアなデジタルティック音を加算する。"""
    sr = buf.sample_rate
    l_g, r_g = _stereo_pan_gains(pan)
    pulse_dur = 0.042
    for k in range(max(1, pulses)):
        s0 = int((t_sec + k * step_gap_sec) * sr)
        n_samp = min(int(pulse_dur * sr), buf.total_samples - s0)
        if n_samp <= 0 or s0 < 0:
            continue
        f = freq_hz * (1.0 + 0.065 * k)
        for i in range(n_samp):
            t = i / sr
            env = min(1.0, i / 50.0) * math.exp(-t * 68.0)
            osc = math.sin(2.0 * math.pi * f * t) * 0.80 + math.sin(2.0 * math.pi * f * 2.0 * t) * 0.16
            sample = osc * env * gain
            buf.left[s0 + i] += sample * l_g
            buf.right[s0 + i] += sample * r_g


def add_vhs_pause(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.38,
    gain: float = 0.26,
    pan: float = 0.0,
    rng: random.Random | None = None,
) -> None:
    """案E向け：テープ減速ピッチ降下＋VCR一時停止メカニカルクリック＋一瞬のヒス音を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    local_rng = rng or random.Random(int(t_sec * 1000) + 211)
    l_g, r_g = _stereo_pan_gains(pan)
    phase = 0.0
    lp = 0.0
    for i in range(n_samp):
        t = i / sr
        p = i / max(1, n_samp - 1)
        # 冒頭VCR機構のカチッとしたクリック＋テープ減速トーン
        click = math.sin(2.0 * math.pi * 1180.0 * t) * math.exp(-t * 145.0) * 0.55
        clunk = math.sin(2.0 * math.pi * 135.0 * t) * math.exp(-t * 55.0) * 0.65
        slow_freq = 420.0 * (1.0 - 0.72 * (p ** 0.7))
        phase += 2.0 * math.pi * slow_freq / sr
        slow_tone = math.sin(phase) * math.exp(-t * 7.5) * 0.32
        noise = local_rng.random() * 2.0 - 1.0
        lp = lp * 0.65 + noise * 0.35
        hiss = lp * math.exp(-t * 11.0) * 0.22
        env = min(1.0, i / 40.0) * (1.0 - max(0.0, p - 0.85) / 0.15)
        sample = (click + clunk + slow_tone + hiss) * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_glitch_burst(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.18,
    gain: float = 0.24,
    pan: float = 0.0,
    rng: random.Random | None = None,
) -> None:
    """案E向け：160〜180msのデジタル走査ノイズ＆帯域切替グリッチ音を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    local_rng = rng or random.Random(int(t_sec * 1000) + 223)
    l_g, r_g = _stereo_pan_gains(pan)
    freqs = (860.0, 2140.0, 480.0, 3120.0, 1290.0)
    slice_len = max(1, n_samp // 6)
    prev = 0.0
    for i in range(n_samp):
        t = i / sr
        p = i / max(1, n_samp - 1)
        band_idx = min(len(freqs) - 1, i // slice_len)
        gate = 0.25 if (i // max(1, slice_len // 2)) % 3 == 2 else 1.0
        f = freqs[band_idx]
        buzz = math.tanh(math.sin(2.0 * math.pi * f * t) * 2.8) * 0.45
        noise = local_rng.random() * 2.0 - 1.0
        hp = noise - 0.55 * prev
        prev = noise
        env = min(1.0, i / 35.0) * math.exp(-max(0.0, p - 0.4) * 5.0) * gate
        sample = (buzz + hp * 0.55) * env * gain
        buf.left[s0 + i] += sample * l_g * (1.05 if band_idx % 2 == 0 else 0.90)
        buf.right[s0 + i] += sample * r_g * (0.90 if band_idx % 2 == 0 else 1.05)


def add_mallet_bonk(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.24,
    gain: float = 0.30,
    pan: float = 0.0,
) -> None:
    """案E向け：コミカルな空洞木槌の打撃音（ピッチ上昇木製共鳴ノック）を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    l_g, r_g = _stereo_pan_gains(pan)
    phase = 0.0
    for i in range(n_samp):
        t = i / sr
        # 打撃直後に音程がわずかに跳ね上がるカートゥーン風木槌共鳴
        freq = 165.0 + 185.0 * (1.0 - math.exp(-t * 28.0))
        phase += 2.0 * math.pi * freq / sr
        body = math.sin(phase) * 0.78 + math.sin(phase * 2.38) * 0.24
        knock = math.sin(2.0 * math.pi * 640.0 * t) * math.exp(-t * 95.0) * 0.38
        env = min(1.0, i / 45.0) * math.exp(-t * 17.5)
        sample = (body + knock) * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_armor_clang(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.45,
    gain: float = 0.28,
    pan: float = 0.0,
) -> None:
    """案E向け：金属甲冑に跳ね返る非調和金属クラング音を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    l_g, r_g = _stereo_pan_gains(pan)
    # 金属プレート特有の非整数倍音構成
    partials = (
        (520.0, 0.38, 7.5),
        (815.0, 0.32, 9.2),
        (1340.0, 0.28, 11.5),
        (2190.0, 0.20, 15.0),
        (3410.0, 0.14, 21.0),
    )
    for i in range(n_samp):
        t = i / sr
        attack = min(1.0, i / 28.0)
        val = 0.0
        for freq, amp, decay in partials:
            val += math.sin(2.0 * math.pi * freq * t) * amp * math.exp(-t * decay)
        tail = 1.0 if t < duration_sec - 0.04 else max(0.0, (duration_sec - t) / 0.04)
        sample = val * attack * tail * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_dizzy_spin(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.65,
    gain: float = 0.22,
    pan: float = 0.0,
) -> None:
    """案E向け：頭上の星が回るコミカルなFMビブラート揺らぎ音を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    l_g, r_g = _stereo_pan_gains(pan)
    phase = 0.0
    for i in range(n_samp):
        t = i / sr
        p = i / max(1, n_samp - 1)
        base_freq = 760.0 - 210.0 * p + 125.0 * math.sin(2.0 * math.pi * 6.5 * t)
        phase += 2.0 * math.pi * base_freq / sr
        # 星が左右に回転するステレオパン演出
        swirl_pan = math.sin(2.0 * math.pi * 3.2 * t) * 0.55 + pan * 0.45
        sl_g, sr_g = _stereo_pan_gains(swirl_pan)
        env = min(1.0, i / 120.0) * math.exp(-t * 3.2) * (1.0 - max(0.0, p - 0.85) / 0.15)
        tone = math.sin(phase) * 0.72 + math.sin(phase * 2.0) * 0.18
        sample = tone * env * gain
        buf.left[s0 + i] += sample * sl_g
        buf.right[s0 + i] += sample * sr_g


def add_projector_click(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.26,
    gain: float = 0.24,
    pan: float = 0.0,
    rng: random.Random | None = None,
) -> None:
    """案E向け：暗室プロジェクターのスライド切替リレー音＋柔らかな起動音を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    local_rng = rng or random.Random(int(t_sec * 1000) + 239)
    l_g, r_g = _stereo_pan_gains(pan)
    lp = 0.0
    for i in range(n_samp):
        t = i / sr
        p = i / max(1, n_samp - 1)
        relay_1 = math.sin(2.0 * math.pi * 1650.0 * t) * math.exp(-t * 160.0) * 0.55
        dt2 = t - 0.055
        relay_2 = (
            math.sin(2.0 * math.pi * 2150.0 * dt2) * math.exp(-dt2 * 145.0) * 0.48
            if dt2 >= 0.0
            else 0.0
        )
        hum = math.sin(2.0 * math.pi * 120.0 * t) * min(1.0, t / 0.04) * 0.18
        noise = local_rng.random() * 2.0 - 1.0
        lp = lp * 0.82 + noise * 0.18
        fan = lp * 0.24 * min(1.0, t / 0.05)
        env = min(1.0, i / 35.0) * (1.0 - max(0.0, p - 0.82) / 0.18)
        sample = (relay_1 + relay_2 + hum + fan) * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_camera_shutter(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.14,
    gain: float = 0.24,
    pan: float = 0.0,
    rng: random.Random | None = None,
) -> None:
    """案E向け：報道写真・WANTED・証拠切抜き貼付用の2段メカニカルシャッター音を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    local_rng = rng or random.Random(int(t_sec * 1000) + 251)
    l_g, r_g = _stereo_pan_gains(pan)
    prev = 0.0
    for i in range(n_samp):
        t = i / sr
        noise = local_rng.random() * 2.0 - 1.0
        hp = noise - 0.78 * prev
        prev = noise
        c1 = math.exp(-t * 165.0) * (math.sin(2.0 * math.pi * 2100.0 * t) * 0.50 + hp * 0.65)
        dt2 = t - 0.048
        c2 = (
            math.exp(-dt2 * 155.0) * (math.sin(2.0 * math.pi * 1720.0 * dt2) * 0.45 + hp * 0.55)
            if dt2 >= 0.0
            else 0.0
        )
        env = min(1.0, i / 25.0)
        sample = (c1 + c2) * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_price_ping(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.22,
    gain: float = 0.20,
    pan: float = 0.0,
) -> None:
    """案E向け：値札切替・数値ロック用の澄んだベル／レジピン音を加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(duration_sec * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    l_g, r_g = _stereo_pan_gains(pan)
    for i in range(n_samp):
        t = i / sr
        env = min(1.0, i / 35.0) * math.exp(-t * 19.0)
        bell = (
            math.sin(2.0 * math.pi * 1567.98 * t) * 0.65
            + math.sin(2.0 * math.pi * 3135.96 * t) * 0.26 * math.exp(-t * 12.0)
            + math.sin(2.0 * math.pi * 2349.32 * t) * 0.14 * math.exp(-t * 18.0)
        )
        tail = 1.0 if t < duration_sec - 0.025 else max(0.0, (duration_sec - t) / 0.025)
        sample = bell * env * tail * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def cynical_econ_groove_bgm(
    total_duration_sec: float,
    out_wav: Path,
    *,
    bpm: float = 115.0,
    intro_drone_end_sec: float = 5.5,
    groove_start_sec: float = 8.5,
    cutout_ranges: Sequence[tuple[float, float]] = (),
    sample_rate: int = SAMPLE_RATE,
) -> Path:
    """案E（How Money Works 型）向け：導入不穏ドローン → 無音問いかけ間 → 115BPMドライ経済グルーヴBGM。"""
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    buf = StereoBuffer(total_duration_sec, sample_rate=sample_rate)
    rng = random.Random(20261122)

    # 1) 導入不穏ドローン（0.0s〜intro_drone_end_sec、25ms物理フェードカット）
    drone_end = min(total_duration_sec, max(0.0, intro_drone_end_sec))
    drone_samples = int(drone_end * sample_rate)
    fade_n = max(1, int(0.025 * sample_rate))
    for i in range(drone_samples):
        t = i / sample_rate
        env = min(1.0, t / 0.18)
        if i > drone_samples - fade_n:
            env *= max(0.0, (drone_samples - i) / float(fade_n))
        drone = (
            math.sin(2.0 * math.pi * 41.20 * t) * 0.55
            + math.sin(2.0 * math.pi * 61.74 * t) * 0.25
            + math.sin(2.0 * math.pi * 82.41 * t) * 0.22
        )
        pulse = 0.85 + 0.15 * math.sin(2.0 * math.pi * 0.85 * t)
        val = drone * env * pulse * 0.105
        buf.left[i] += val
        buf.right[i] += val * 0.96

    # 2) Em9 -> Cmaj9 -> Am9 -> B7sus4 のタイトな115BPM経済解説グルーヴ
    progression: tuple[tuple[int, ...], ...] = (
        (52, 59, 62, 66, 59, 62, 64, 59),  # Em9
        (48, 55, 59, 62, 55, 59, 64, 55),  # Cmaj9
        (45, 52, 55, 60, 52, 55, 59, 52),  # Am9
        (47, 52, 57, 61, 52, 57, 59, 52),  # B7sus4
    )
    bass_roots: tuple[int, ...] = (40, 36, 33, 35)  # E2, C2, A1, B1

    def _in_cutout(t: float) -> bool:
        for cs, ce in cutout_ranges:
            if cs <= t < ce:
                return True
        return False

    eighth_sec = 60.0 / max(50.0, bpm) / 2.0
    step_idx = 0
    t_cur = max(0.0, groove_start_sec)

    while t_cur < total_duration_sec - 0.08:
        if not _in_cutout(t_cur):
            bar_idx = (step_idx // 8) % len(progression)
            note_idx = step_idx % 8
            midi = progression[bar_idx][note_idx]
            pluck_amp = 0.072 if note_idx % 2 == 0 else 0.048
            pan = -0.24 if note_idx % 2 == 0 else 0.24
            _add_synth_pluck(
                buf,
                t_cur,
                midi,
                min(0.28, total_duration_sec - t_cur),
                pluck_amp,
                pan,
                bright_boost=0.88,
            )

            # 1拍目・3拍目のタイトなサブベース
            if note_idx in (0, 4):
                bass_midi = bass_roots[bar_idx]
                _add_synth_pluck(
                    buf,
                    t_cur,
                    bass_midi,
                    min(0.45, total_duration_sec - t_cur),
                    0.105 if note_idx == 0 else 0.080,
                    0.0,
                    bright_boost=0.45,
                )

            # ドライなキック＋裏拍ティック（経済解説の推進感）
            s0 = int(t_cur * sample_rate)
            if note_idx in (0, 4):
                kn = min(int(0.11 * sample_rate), buf.total_samples - s0)
                k_phase = 0.0
                for ki in range(max(0, kn)):
                    kt = ki / sample_rate
                    k_freq = 48.0 + 105.0 * math.exp(-kt * 32.0)
                    k_phase += 2.0 * math.pi * k_freq / sample_rate
                    k_env = min(1.0, ki / 60.0) * math.exp(-kt * 20.0)
                    ks = math.sin(k_phase) * k_env * 0.085
                    buf.left[s0 + ki] += ks
                    buf.right[s0 + ki] += ks
            elif note_idx % 2 == 1:
                hn = min(int(0.025 * sample_rate), buf.total_samples - s0)
                prev_n = 0.0
                for hi in range(max(0, hn)):
                    ht = hi / sample_rate
                    n_val = rng.random() * 2.0 - 1.0
                    hp = n_val - 0.80 * prev_n
                    prev_n = n_val
                    hs = hp * math.exp(-ht * 130.0) * 0.026
                    buf.left[s0 + hi] += hs * 1.1
                    buf.right[s0 + hi] += hs * 0.9

        step_idx += 1
        t_cur += eighth_sec

    # 25ms 物理カットアウト適用（中盤オチ・転換での無音間）
    for cs, ce in cutout_ranges:
        c0 = max(0, int(cs * sample_rate))
        c1 = min(buf.total_samples, int(ce * sample_rate))
        for k in range(fade_n):
            p = c0 + k
            if p < c1:
                g = max(0.0, 1.0 - k / float(fade_n))
                buf.left[p] *= g
                buf.right[p] *= g
        for p in range(min(c1, c0 + fade_n), c1):
            buf.left[p] = 0.0
            buf.right[p] = 0.0

    tmp_dry = out_wav.with_suffix(".dry.wav")
    buf.write_wav(tmp_dry, soft_clip=True)
    fade_out_st = max(0.0, total_duration_sec - 0.45)
    try:
        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(tmp_dry),
                "-af",
                (
                    "lowpass=f=3200,aecho=0.8:0.84:32|64:0.14|0.08,"
                    f"afade=t=in:d=0.05,afade=t=out:st={fade_out_st:.3f}:d=0.40"
                ),
                "-ar",
                str(sample_rate),
                "-ac",
                "2",
                "-c:a",
                "pcm_s16le",
                str(out_wav),
            ]
        )
    finally:
        tmp_dry.unlink(missing_ok=True)
    return out_wav


@dataclass(frozen=True)
class SfxEvent:
    """タイムライン上に配置する 1 SFX イベント仕様。"""

    kind: str
    time_sec: float
    gain: float | None = None
    pan: float = 0.0
    f0: float = 180.0
    f1: float = 300.0
    stroke_sec: float = 0.22
    duration_sec: float | None = None
    freq_hz: float | None = None
    pulses: int = 2
    pitch_start: float | None = None
    pitch_end: float | None = None


def add_tone_sweep(
    buf: StereoBuffer,
    t_sec: float,
    *,
    f0: float = 220.0,
    f1: float = 880.0,
    duration_sec: float = 0.25,
    waveform: Literal["sine", "triangle", "square", "saw"] = "sine",
    gain: float = 0.28,
    pan: float = 0.0,
    attack_sec: float = 0.002,
    decay_rate: float = 9.0,
) -> None:
    """カスタム SFX 合成用の汎用ピッチスイープ波形を StereoBuffer へ加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(max(0.01, duration_sec) * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    l_g, r_g = _stereo_pan_gains(pan)
    attack_n = max(1, int(max(0.0005, attack_sec) * sr))
    tail_n = max(1, int(min(0.015, duration_sec * 0.2) * sr))
    phase = 0.0
    for i in range(n_samp):
        t = i / sr
        p = i / max(1, n_samp - 1)
        freq = f0 * ((f1 / max(1.0, f0)) ** p) if (f0 > 0 and f1 > 0) else (f0 + (f1 - f0) * p)
        phase += 2.0 * math.pi * max(1.0, freq) / sr
        cyc = (phase / (2.0 * math.pi)) % 1.0
        if waveform == "triangle":
            osc = 4.0 * abs(cyc - 0.5) - 1.0
        elif waveform == "square":
            osc = math.tanh(math.sin(phase) * 3.0)
        elif waveform == "saw":
            osc = 2.0 * cyc - 1.0
        else:
            osc = math.sin(phase)
        env = (i / attack_n if i < attack_n else 1.0) * math.exp(-t * max(0.0, decay_rate))
        if i > n_samp - tail_n:
            env *= max(0.0, (n_samp - i) / float(tail_n))
        sample = osc * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_noise_burst(
    buf: StereoBuffer,
    t_sec: float,
    *,
    duration_sec: float = 0.18,
    gain: float = 0.24,
    pan: float = 0.0,
    highpass: float = 0.65,
    lowpass: float = 0.30,
    decay_rate: float = 16.0,
    rng: random.Random | None = None,
) -> None:
    """カスタム SFX 合成用のフィルタ付きノイズバーストを StereoBuffer へ加算する。"""
    sr = buf.sample_rate
    s0 = int(t_sec * sr)
    n_samp = min(int(max(0.01, duration_sec) * sr), buf.total_samples - s0)
    if n_samp <= 0 or s0 < 0:
        return

    local_rng = rng or random.Random(int(t_sec * 1000) + 307)
    l_g, r_g = _stereo_pan_gains(pan)
    hp_k = max(0.0, min(0.95, highpass))
    lp_a = max(0.05, min(1.0, lowpass))
    prev = 0.0
    lp = 0.0
    attack_n = max(1, int(0.002 * sr))
    tail_n = max(1, int(min(0.012, duration_sec * 0.2) * sr))
    for i in range(n_samp):
        t = i / sr
        raw = local_rng.random() * 2.0 - 1.0
        hp = raw - hp_k * prev
        prev = raw
        lp = lp * (1.0 - lp_a) + hp * lp_a
        env = (i / attack_n if i < attack_n else 1.0) * math.exp(-t * max(0.0, decay_rate))
        if i > n_samp - tail_n:
            env *= max(0.0, (n_samp - i) / float(tail_n))
        sample = lp * env * gain
        buf.left[s0 + i] += sample * l_g
        buf.right[s0 + i] += sample * r_g


def add_sfx_event(
    buf: StereoBuffer,
    ev: SfxEvent,
    *,
    rng: random.Random | None = None,
) -> None:
    """標準 20 種（または互換エイリアス）の 1 イベントを波形合成して StereoBuffer へ加算する。"""
    kind = resolve_sfx_kind(ev.kind)
    local_rng = rng or random.Random(int(ev.time_sec * 1000) + 20261121)

    if kind == "paper_snap":
        add_paper_snap(
            buf,
            ev.time_sec,
            gain=0.24 if ev.gain is None else ev.gain,
            pan=ev.pan,
            rng=local_rng,
        )
    elif kind == "pen_scratch":
        add_pen_scratch(
            buf,
            ev.time_sec,
            gain=0.14 if ev.gain is None else ev.gain,
            pan=ev.pan,
            stroke_sec=ev.stroke_sec if ev.duration_sec is None else ev.duration_sec,
            rng=local_rng,
        )
    elif kind == "soft_pop":
        add_soft_pop(
            buf,
            ev.time_sec,
            f0=ev.f0,
            f1=ev.f1,
            gain=0.16 if ev.gain is None else ev.gain,
            pan=ev.pan,
        )
    elif kind == "whoosh":
        add_whoosh(
            buf,
            ev.time_sec,
            duration_sec=0.28 if ev.duration_sec is None else ev.duration_sec,
            pitch_start=180.0 if ev.pitch_start is None else ev.pitch_start,
            pitch_end=680.0 if ev.pitch_end is None else ev.pitch_end,
            gain=0.20 if ev.gain is None else ev.gain,
            pan=ev.pan,
            rng=local_rng,
        )
    elif kind == "radar_beep":
        add_radar_beep(
            buf,
            ev.time_sec,
            freq_hz=1240.0 if ev.freq_hz is None else ev.freq_hz,
            pulses=ev.pulses,
            gain=0.18 if ev.gain is None else ev.gain,
            pan=ev.pan,
        )
    elif kind == "error_buzzer":
        add_error_buzzer(
            buf,
            ev.time_sec,
            duration_sec=0.26 if ev.duration_sec is None else ev.duration_sec,
            gain=0.22 if ev.gain is None else ev.gain,
            pan=ev.pan,
        )
    elif kind == "impact_thud":
        add_impact_thud(
            buf,
            ev.time_sec,
            duration_sec=0.24 if ev.duration_sec is None else ev.duration_sec,
            gain=0.28 if ev.gain is None else ev.gain,
            pan=ev.pan,
        )
    elif kind == "data_chirp":
        add_data_chirp(
            buf,
            ev.time_sec,
            duration_sec=0.35 if ev.duration_sec is None else ev.duration_sec,
            gain=0.12 if ev.gain is None else ev.gain,
            pan=ev.pan,
            rng=local_rng,
        )
    elif kind == "mech_slide":
        add_mech_slide(
            buf,
            ev.time_sec,
            duration_sec=0.32 if ev.duration_sec is None else ev.duration_sec,
            gain=0.14 if ev.gain is None else ev.gain,
            pan=ev.pan,
            rng=local_rng,
        )
    elif kind == "question_boing":
        add_question_boing(
            buf,
            ev.time_sec,
            gain=0.18 if ev.gain is None else ev.gain,
            pan=ev.pan,
        )
    elif kind == "stamp_thud":
        add_stamp_thud(
            buf,
            ev.time_sec,
            duration_sec=0.16 if ev.duration_sec is None else ev.duration_sec,
            gain=0.28 if ev.gain is None else ev.gain,
            pan=ev.pan,
            rng=local_rng,
        )
    elif kind == "chart_tick":
        add_chart_tick(
            buf,
            ev.time_sec,
            freq_hz=1480.0 if ev.freq_hz is None else ev.freq_hz,
            pulses=ev.pulses,
            gain=0.15 if ev.gain is None else ev.gain,
            pan=ev.pan,
        )
    elif kind == "vhs_pause":
        add_vhs_pause(
            buf,
            ev.time_sec,
            duration_sec=0.38 if ev.duration_sec is None else ev.duration_sec,
            gain=0.26 if ev.gain is None else ev.gain,
            pan=ev.pan,
            rng=local_rng,
        )
    elif kind == "glitch_burst":
        add_glitch_burst(
            buf,
            ev.time_sec,
            duration_sec=0.18 if ev.duration_sec is None else ev.duration_sec,
            gain=0.24 if ev.gain is None else ev.gain,
            pan=ev.pan,
            rng=local_rng,
        )
    elif kind == "mallet_bonk":
        add_mallet_bonk(
            buf,
            ev.time_sec,
            duration_sec=0.24 if ev.duration_sec is None else ev.duration_sec,
            gain=0.30 if ev.gain is None else ev.gain,
            pan=ev.pan,
        )
    elif kind == "armor_clang":
        add_armor_clang(
            buf,
            ev.time_sec,
            duration_sec=0.45 if ev.duration_sec is None else ev.duration_sec,
            gain=0.28 if ev.gain is None else ev.gain,
            pan=ev.pan,
        )
    elif kind == "dizzy_spin":
        add_dizzy_spin(
            buf,
            ev.time_sec,
            duration_sec=0.65 if ev.duration_sec is None else ev.duration_sec,
            gain=0.22 if ev.gain is None else ev.gain,
            pan=ev.pan,
        )
    elif kind == "projector_click":
        add_projector_click(
            buf,
            ev.time_sec,
            duration_sec=0.26 if ev.duration_sec is None else ev.duration_sec,
            gain=0.24 if ev.gain is None else ev.gain,
            pan=ev.pan,
            rng=local_rng,
        )
    elif kind == "camera_shutter":
        add_camera_shutter(
            buf,
            ev.time_sec,
            duration_sec=0.14 if ev.duration_sec is None else ev.duration_sec,
            gain=0.24 if ev.gain is None else ev.gain,
            pan=ev.pan,
            rng=local_rng,
        )
    elif kind == "price_ping":
        add_price_ping(
            buf,
            ev.time_sec,
            duration_sec=0.22 if ev.duration_sec is None else ev.duration_sec,
            gain=0.20 if ev.gain is None else ev.gain,
            pan=ev.pan,
        )
    else:
        raise ValueError(f"Unsupported SFX event kind: {ev.kind!r}")


def finalize_sfx_buffer(
    buf: StereoBuffer,
    *,
    target_peak: float = SFX_TARGET_PEAK,
    target_rms: float = SFX_TARGET_ACTIVE_RMS,
    trim_leading_silence: bool = True,
    trim_trailing_silence: bool = True,
    silence_threshold: float = 0.002,
    fade_out_sec: float = 0.004,
) -> StereoBuffer:
    """単発 SFX バッファを「立ち上がり 0ms・統一音圧（ピーク/有音RMS正規化）・クリック防止」へ仕上げる。"""
    n = buf.total_samples
    sr = buf.sample_rate
    raw_peak = 0.0
    for i in range(n):
        a = max(abs(buf.left[i]), abs(buf.right[i]))
        if a > raw_peak:
            raw_peak = a
    if raw_peak <= 1e-7:
        raise ValueError("Synthesized SFX buffer is silent.")

    start_idx = 0
    if trim_leading_silence:
        onset_thresh = max(silence_threshold, raw_peak * 0.015)
        first_idx = 0
        for i in range(n):
            if max(abs(buf.left[i]), abs(buf.right[i])) >= onset_thresh:
                first_idx = i
                break
        # 立ち上がり直前の極小マージン（最大 0.25ms = 12 サンプル）のみ残してクリックを防ぎつつ 0ms 立ち上がりを保証
        start_idx = max(0, first_idx - min(12, first_idx))

    end_idx = n
    if trim_trailing_silence:
        tail_thresh = max(silence_threshold * 0.5, raw_peak * 0.004)
        last_idx = n - 1
        for i in range(n - 1, start_idx, -1):
            if max(abs(buf.left[i]), abs(buf.right[i])) >= tail_thresh:
                last_idx = i
                break
        tail_pad = int(0.020 * sr)
        min_len = max(1, int(0.040 * sr))
        end_idx = min(n, max(start_idx + min_len, last_idx + 1 + tail_pad))

    out_len = max(1, end_idx - start_idx)
    out = StereoBuffer(out_len / sr, sample_rate=sr)
    out.total_samples = out_len
    out.left = array.array("f", buf.left[start_idx:end_idx])
    out.right = array.array("f", buf.right[start_idx:end_idx])

    # ピークと有音区間 RMS を算出して全種別を統一音圧へ揃える
    peak = 0.0
    for i in range(out_len):
        a = max(abs(out.left[i]), abs(out.right[i]))
        if a > peak:
            peak = a
    active_thresh = peak * 0.05
    sq_sum = 0.0
    active_count = 0
    for i in range(out_len):
        lv = out.left[i]
        rv = out.right[i]
        if max(abs(lv), abs(rv)) >= active_thresh:
            sq_sum += lv * lv + rv * rv
            active_count += 2
    active_rms = math.sqrt(sq_sum / active_count) if active_count > 0 else peak

    scale = target_peak / peak
    if active_rms > 1e-9:
        scale = min(scale, target_rms / active_rms)

    fade_n = min(int(fade_out_sec * sr), max(1, out_len // 4))
    for i in range(out_len):
        g = scale
        if i >= out_len - fade_n:
            g *= max(0.0, (out_len - 1 - i) / float(fade_n))
        out.left[i] *= g
        out.right[i] *= g

    return out


def render_sfx_track(
    total_duration_sec: float,
    events: Sequence[SfxEvent],
    out_wav: Path,
    *,
    sample_rate: int = SAMPLE_RATE,
    seed: int = 20261121,
) -> Path:
    """複数 SFX イベントを標準 20 種波形合成で 1 本の 48kHz stereo WAV トラックへ合成する。"""
    buf = StereoBuffer(total_duration_sec, sample_rate=sample_rate)
    rng = random.Random(seed)
    for ev in events:
        add_sfx_event(buf, ev, rng=rng)
    return buf.write_wav(out_wav)


PLAN_E_SFX_LIBRARY_KINDS: tuple[str, ...] = STANDARD_SFX_KINDS

_SINGLE_SFX_DURATION_SEC: dict[str, float] = {
    "paper_snap": 0.14,
    "pen_scratch": 0.28,
    "soft_pop": 0.16,
    "whoosh": 0.34,
    "radar_beep": 0.28,
    "error_buzzer": 0.32,
    "impact_thud": 0.30,
    "data_chirp": 0.42,
    "mech_slide": 0.38,
    "question_boing": 0.28,
    "stamp_thud": 0.22,
    "chart_tick": 0.34,
    "vhs_pause": 0.44,
    "glitch_burst": 0.24,
    "mallet_bonk": 0.30,
    "armor_clang": 0.50,
    "dizzy_spin": 0.72,
    "projector_click": 0.32,
    "camera_shutter": 0.20,
    "price_ping": 0.28,
}


def export_single_sfx(
    kind: str,
    out_wav: Path,
    *,
    sample_rate: int = SAMPLE_RATE,
    gain: float | None = None,
    normalize: bool = True,
    seed: int = 20261121,
) -> Path:
    """Remotion <SfxCue> 連携用：標準 20 種の単発 SFX を立ち上がり 0ms・統一音圧の 48kHz stereo WAV として書き出す。"""
    resolved = resolve_sfx_kind(kind)
    dur = _SINGLE_SFX_DURATION_SEC.get(resolved, 0.45)
    buf = StereoBuffer(dur, sample_rate=sample_rate)
    ev = SfxEvent(
        kind=resolved,
        time_sec=0.0,
        gain=gain,
        pulses=3 if resolved == "chart_tick" else 2,
    )
    add_sfx_event(buf, ev, rng=random.Random(seed))
    if normalize:
        buf = finalize_sfx_buffer(buf)
    return buf.write_wav(out_wav)


def export_sfx_library(
    out_dir: Path = STUDIO_PUBLIC_SFX_DIR,
    kinds: Sequence[str] = STANDARD_SFX_KINDS,
    *,
    force: bool = False,
    sample_rate: int = SAMPLE_RATE,
) -> dict[str, Path]:
    """Remotion <SfxCue> 用の標準合成 SFX WAV を指定ディレクトリ（既定 studio/public/sfx）へ一括書き出しする。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    result: dict[str, Path] = {}
    for kind in dict.fromkeys(map(resolve_sfx_kind, kinds)):
        wav_path = out_dir / f"{kind}.wav"
        if force or not wav_path.is_file() or wav_path.stat().st_size < 1000:
            with TemporaryDirectory(dir=out_dir) as temp_dir:
                staged = export_single_sfx(
                    kind,
                    Path(temp_dir) / wav_path.name,
                    sample_rate=sample_rate,
                )
                staged.replace(wav_path)
        result[kind] = wav_path
    return result


def render_custom_sfx(
    out_wav: Path,
    *,
    duration_sec: float = 0.60,
    layers: Sequence[SfxEvent] = (),
    builder: Callable[[StereoBuffer], None] | None = None,
    sample_rate: int = SAMPLE_RATE,
    seed: int = 20261121,
    normalize: bool = True,
    target_peak: float = SFX_TARGET_PEAK,
    target_rms: float = SFX_TARGET_ACTIVE_RMS,
    trim_leading_silence: bool = True,
    trim_trailing_silence: bool = True,
) -> Path:
    """エピソード固有カスタム合成 SFX を標準 20 種と同一フォーマット・統一音圧・立ち上がり 0ms で生成する。

    - `layers`: 標準 20 種（パラメータ変更可）の多段レイヤー合成
    - `builder`: `StereoBuffer` へ直接波形を書き込む自由合成コールバック（`add_tone_sweep` / `add_noise_burst` 併用可）
    """
    if not layers and builder is None:
        raise ValueError("render_custom_sfx requires at least one layer or a builder callback.")
    if duration_sec <= 0.0:
        raise ValueError(f"duration_sec must be positive, got: {duration_sec}")

    buf = StereoBuffer(duration_sec, sample_rate=sample_rate)
    rng = random.Random(seed)
    for ev in layers:
        add_sfx_event(buf, ev, rng=rng)
    if builder is not None:
        builder(buf)
    if normalize:
        buf = finalize_sfx_buffer(
            buf,
            target_peak=target_peak,
            target_rms=target_rms,
            trim_leading_silence=trim_leading_silence,
            trim_trailing_silence=trim_trailing_silence,
        )

    out_wav.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=out_wav.parent) as temp_dir:
        staged = buf.write_wav(Path(temp_dir) / out_wav.name)
        staged.replace(out_wav)
    return out_wav


_SAFE_SFX_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def export_episode_custom_sfx(
    slug: str,
    name: str,
    *,
    duration_sec: float = 0.60,
    layers: Sequence[SfxEvent] = (),
    builder: Callable[[StereoBuffer], None] | None = None,
    public_dir: Path | None = None,
    public_root: Path = STUDIO_PUBLIC_DIR,
    sample_rate: int = SAMPLE_RATE,
    seed: int = 20261121,
    normalize: bool = True,
) -> tuple[Path, str]:
    """エピソード固有カスタム合成 SFX を `studio/public/episodes/<slug>/sfx/<name>.wav` へ配置し、(絶対Path, public相対src) を返す。"""
    clean_slug = slug.strip().strip("/\\")
    clean_name = name.strip().removesuffix(".wav")
    if not clean_slug or ".." in clean_slug or "/" in clean_slug or "\\" in clean_slug:
        raise ValueError(f"Invalid episode slug: {slug!r}")
    if not _SAFE_SFX_NAME_RE.match(clean_name):
        raise ValueError(
            f"Invalid custom SFX name {name!r} (lowercase letters, digits, '-' or '_' only)."
        )

    target_dir = (public_dir / "sfx") if public_dir is not None else (public_root / "episodes" / clean_slug / "sfx")
    out_wav = target_dir / f"{clean_name}.wav"
    render_custom_sfx(
        out_wav,
        duration_sec=duration_sec,
        layers=layers,
        builder=builder,
        sample_rate=sample_rate,
        seed=seed,
        normalize=normalize,
    )
    try:
        public_src = out_wav.resolve().relative_to(public_root.resolve()).as_posix()
    except ValueError:
        public_src = f"episodes/{clean_slug}/sfx/{clean_name}.wav"
    return out_wav, public_src


def measure_sfx_wav(wav_path: Path) -> dict[str, float]:
    """書き出し済み SFX WAV の尺・ピーク・有音RMS・立ち上がり遅延(ms)を計測する。"""
    with wave.open(str(wav_path), "rb") as wf:
        sr = wf.getframerate()
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        nframes = wf.getnframes()
        pcm = array.array("h", wf.readframes(nframes))
    if sys.byteorder != "little":
        pcm.byteswap()
    if ch != 2 or sw != 2 or len(pcm) != nframes * 2:
        raise ValueError(f"Expected 16-bit stereo PCM WAV: {wav_path}")

    floats = [s / 32768.0 for s in pcm]
    peak = max((abs(v) for v in floats), default=0.0)
    onset_thresh = max(0.002, peak * 0.05)
    onset_frame = nframes
    for f_idx in range(nframes):
        if max(abs(floats[f_idx * 2]), abs(floats[f_idx * 2 + 1])) >= onset_thresh:
            onset_frame = f_idx
            break

    active_thresh = peak * 0.05
    sq_sum = 0.0
    active_count = 0
    for f_idx in range(nframes):
        lv = floats[f_idx * 2]
        rv = floats[f_idx * 2 + 1]
        if max(abs(lv), abs(rv)) >= active_thresh:
            sq_sum += lv * lv + rv * rv
            active_count += 2
    active_rms = math.sqrt(sq_sum / active_count) if active_count > 0 else 0.0
    full_rms = math.sqrt(sum(v * v for v in floats) / max(1, len(floats)))

    return {
        "sampleRate": float(sr),
        "durationSec": round(nframes / float(sr), 4),
        "peak": round(peak, 4),
        "activeRms": round(active_rms, 4),
        "fullRms": round(full_rms, 4),
        "onsetMs": round((onset_frame / float(sr)) * 1000.0, 3),
    }


def _merge_narration_batch(
    batch: Sequence[tuple[Path, float]],
    total_duration_sec: float,
    out_wav: Path,
    *,
    sample_rate: int,
) -> None:
    inputs: list[str] = [
        "-f",
        "lavfi",
        "-i",
        f"anullsrc=r={sample_rate}:cl=stereo:d={total_duration_sec:.4f}",
    ]
    filter_parts: list[str] = []
    mix_labels: list[str] = ["[0:a]"]

    for idx, (wav_path, start_sec) in enumerate(batch, start=1):
        inputs.extend(["-i", str(wav_path)])
        delay_ms = max(0, int(round(start_sec * 1000)))
        lbl = f"[n{idx}]"
        filter_parts.append(
            f"[{idx}:a]pan=stereo|c0=c0|c1=c0,adelay={delay_ms}|{delay_ms}{lbl}"
        )
        mix_labels.append(lbl)

    filter_parts.append(
        f"{''.join(mix_labels)}amix=inputs={len(mix_labels)}:normalize=0:duration=first[outb]"
    )
    run_cmd(
        [
            "ffmpeg",
            "-y",
            *inputs,
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            "[outb]",
            "-t",
            f"{total_duration_sec:.4f}",
            "-ar",
            str(sample_rate),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            str(out_wav),
        ]
    )


def assemble_narration_track(
    chunk_wav_starts: Sequence[tuple[Path, float]],
    total_duration_sec: float,
    out_wav: Path,
    *,
    sample_rate: int = SAMPLE_RATE,
    highpass_hz: int = 85,
    apply_compressor: bool = True,
    batch_size: int = 32,
) -> Path:
    """複数ナレーションWAVを指定開始時刻（秒）へ厳密遅延配置し、ハイパス＋軽コンプで統合する。"""
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    if not chunk_wav_starts:
        return StereoBuffer(total_duration_sec, sample_rate=sample_rate).write_wav(out_wav)

    post_filters: list[str] = []
    if highpass_hz > 0:
        post_filters.append(f"highpass=f={highpass_hz}")
    if apply_compressor:
        post_filters.append("acompressor=threshold=-18dB:ratio=2.4:attack=10:release=120")
    post_chain = ",".join(post_filters) if post_filters else "anull"

    if len(chunk_wav_starts) <= batch_size:
        raw_mix = out_wav.with_suffix(".rawmix.wav")
        try:
            _merge_narration_batch(
                chunk_wav_starts, total_duration_sec, raw_mix, sample_rate=sample_rate
            )
            run_cmd(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(raw_mix),
                    "-af",
                    post_chain,
                    "-t",
                    f"{total_duration_sec:.4f}",
                    "-ar",
                    str(sample_rate),
                    "-ac",
                    "2",
                    "-c:a",
                    "pcm_s16le",
                    str(out_wav),
                ]
            )
        finally:
            raw_mix.unlink(missing_ok=True)
        return out_wav

    # 長尺動画（大量チャンク）対応の2段階バッチマージ
    batch_wavs: list[Path] = []
    try:
        for b_idx in range(0, len(chunk_wav_starts), batch_size):
            b_wav = out_wav.with_suffix(f".batch{b_idx}.wav")
            _merge_narration_batch(
                chunk_wav_starts[b_idx : b_idx + batch_size],
                total_duration_sec,
                b_wav,
                sample_rate=sample_rate,
            )
            batch_wavs.append(b_wav)

        inputs: list[str] = []
        labels: list[str] = []
        for idx, b_wav in enumerate(batch_wavs):
            inputs.extend(["-i", str(b_wav)])
            labels.append(f"[{idx}:a]")
        filter_expr = (
            f"{''.join(labels)}amix=inputs={len(batch_wavs)}:normalize=0:duration=first,"
            f"{post_chain}[outn]"
        )
        run_cmd(
            [
                "ffmpeg",
                "-y",
                *inputs,
                "-filter_complex",
                filter_expr,
                "-map",
                "[outn]",
                "-t",
                f"{total_duration_sec:.4f}",
                "-ar",
                str(sample_rate),
                "-ac",
                "2",
                "-c:a",
                "pcm_s16le",
                str(out_wav),
            ]
        )
    finally:
        for b_wav in batch_wavs:
            b_wav.unlink(missing_ok=True)
    return out_wav


def mix_master_audio(
    out_path: Path,
    total_duration_sec: float,
    *,
    narration_wav: Path | None = None,
    sfx_wav: Path | None = None,
    piano_wav: Path | None = None,
    bgm_wav: Path | None = None,
    narration_gain: float = 1.0,
    sfx_gain: float = 0.45,
    piano_gain: float = 0.38,
    bgm_gain: float = 0.28,
    duck_bgm_on_narration: bool = False,
    target_lufs: float = -14.0,
    true_peak_dbtp: float = -1.0,
    lra: float = 9.0,
    sample_rate: int = SAMPLE_RATE,
    bitrate: str = "256k",
) -> Path:
    """ナレーション＋SFX＋ピアノ（＋任意BGM）を統合し、loudnorm で YouTube 最適音圧に仕上げる。"""
    tracks: list[tuple[Path, float, str]] = []
    if narration_wav is not None:
        tracks.append((narration_wav, narration_gain, "n"))
    if piano_wav is not None:
        tracks.append((piano_wav, piano_gain, "p"))
    if sfx_wav is not None:
        tracks.append((sfx_wav, sfx_gain, "s"))
    if bgm_wav is not None:
        tracks.append((bgm_wav, bgm_gain, "b"))

    if not tracks:
        raise ValueError("At least one audio track must be provided to mix_master_audio.")

    out_path.parent.mkdir(parents=True, exist_ok=True)

    inputs: list[str] = [
        "-f",
        "lavfi",
        "-i",
        f"anullsrc=r={sample_rate}:cl=stereo:d={total_duration_sec:.4f}",
    ]
    filter_parts: list[str] = []
    mix_labels: list[str] = ["[0:a]"]

    use_ducking = duck_bgm_on_narration and narration_wav is not None and bgm_wav is not None
    narr_sc_label: str | None = None

    for idx, (path, gain, tag) in enumerate(tracks, start=1):
        inputs.extend(["-i", str(path)])
        lbl = f"[{tag}{idx}]"
        if use_ducking and tag == "n":
            pre_lbl = f"[npre{idx}]"
            sc_lbl = f"[nsc{idx}]"
            filter_parts.append(f"[{idx}:a]volume={gain:.4f},asplit=2{lbl}{sc_lbl}")
            narr_sc_label = sc_lbl
            mix_labels.append(lbl)
        elif use_ducking and tag == "b" and narr_sc_label is not None:
            pre_lbl = f"[bpre{idx}]"
            filter_parts.append(f"[{idx}:a]volume={gain:.4f}{pre_lbl}")
            filter_parts.append(
                f"{pre_lbl}{narr_sc_label}sidechaincompress=threshold=0.025:ratio=2.8:attack=15:release=220{lbl}"
            )
            mix_labels.append(lbl)
        else:
            filter_parts.append(f"[{idx}:a]volume={gain:.4f}{lbl}")
            mix_labels.append(lbl)

    filter_parts.append(
        f"{''.join(mix_labels)}amix=inputs={len(mix_labels)}:normalize=0:duration=first,"
        f"loudnorm=I={target_lufs:.1f}:TP={true_peak_dbtp:.1f}:LRA={lra:.1f}[out]"
    )

    codec_args = (
        ["-c:a", "pcm_s16le"]
        if out_path.suffix.lower() == ".wav"
        else ["-b:a", bitrate]
    )

    run_cmd(
        [
            "ffmpeg",
            "-y",
            *inputs,
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            "[out]",
            "-t",
            f"{total_duration_sec:.4f}",
            "-ar",
            str(sample_rate),
            "-ac",
            "2",
            *codec_args,
            str(out_path),
        ]
    )
    return out_path
