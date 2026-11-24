"""棒人間ハーネスの字幕境界を、ショット内の文字タイムスタンプから求める。"""
from __future__ import annotations

from typing import Any

from yt_engine.audio.tts_elevenlabs import CharacterAlignment


def aligned_subtitles(shot: dict[str, Any]) -> list[dict[str, Any]]:
    segments = shot.get("subtitleSegments") or ([shot["subtitle"]] if shot.get("subtitle") else [])
    if not segments:
        return []
    timing = shot["alignment"]
    alignment = CharacterAlignment(
        tuple(timing["characters"]), tuple(timing["charStartSec"]), tuple(timing["charEndSec"]),
    )
    parts = [seg["line1"] + (seg.get("line2") or "") for seg in segments]
    # 全文の文字位置で照合し、繰り返す語や「ZIP／ジップ」も発話順に対応させる。
    display = "".join(parts)
    offset = 0
    boundaries = []
    for part in parts:
        onset = alignment.start_times_sec[0] if offset == 0 else alignment.onset_at_char_index(display, offset)
        if onset is None:
            raise ValueError(f"{shot['chunkId']}: 字幕の開始位置を発話に対応づけられません: {part!r}")
        boundaries.append(round(shot["startSec"] + onset, 4))
        offset += len(part)

    boundaries.append(min(shot["endSec"], round(shot["startSec"] + alignment.end_times_sec[-1], 4)))
    if any(start >= end for start, end in zip(boundaries, boundaries[1:])):
        raise ValueError(f"{shot['chunkId']}: 字幕の発話区間が空または逆順です")
    return [
        {"startSec": start, "endSec": end, "line1": seg["line1"], "line2": seg.get("line2")}
        for seg, start, end in zip(segments, boundaries, boundaries[1:])
    ]
