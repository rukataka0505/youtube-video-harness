"""Gemini API YouTube URLネイティブ解析（Two-Pass Static Hybrid）骨格。

Agenticモードの思考トークン暴騰およびサイレント・フォールバックを避けるため、
Pass 1 (0-60s, 2.0 FPS, high) と Pass 2 (全編, 0.5 FPS, low) の Static Hybrid を既定とする。
注意: 有料API呼び出しはユーザー明示指示時のみ実行する。
"""

from __future__ import annotations

from typing import Any

from yt_engine.config import EngineConfig


def build_two_pass_config(config: EngineConfig | None = None) -> dict[str, Any]:
    """outlier_thresholds.yaml および stack.yaml から解析パラメータを組み立てる。"""
    cfg = config or EngineConfig.load()
    analysis_cfg = cfg.thresholds.get("gemini_video_analysis", {})
    return {
        "model": analysis_cfg.get("default_model", "gemini-3.8-flash"),
        "use_batch_api": bool(analysis_cfg.get("use_batch_api", True)),
        "pass1": dict(
            analysis_cfg.get(
                "pass1",
                {"start_offset": "0s", "end_offset": "60s", "fps": 2.0, "media_resolution": "high"},
            )
        ),
        "pass2": dict(
            analysis_cfg.get(
                "pass2",
                {"fps": 0.5, "media_resolution": "low"},
            )
        ),
    }


def analyze_outlier_video_two_pass(
    youtube_url: str,
    duration_sec: int,
    model: str | None = None,
) -> dict[str, Any]:
    """Two-Pass Static Hybrid 解析を実行し、動画単位の400/403を安全に隔離する。"""
    from google import genai
    from google.genai.errors import APIError

    from yt_engine.schemas import HookMicroSpec, MacroWinningBlueprint

    cfg = build_two_pass_config()
    selected_model = model or str(cfg["model"])
    is_short = duration_sec <= 180
    pass1_end = f"{min(60, duration_sec)}s"
    client = genai.Client()

    try:
        p1_resp = client.interactions.create(
            model=selected_model,
            input=[
                {
                    "type": "video",
                    "uri": youtube_url,
                    "media_resolution": cfg["pass1"]["media_resolution"],
                    "processing": {
                        "type": "static",
                        "start_offset": cfg["pass1"]["start_offset"],
                        "end_offset": pass1_end,
                        "fps": cfg["pass1"]["fps"],
                    },
                },
                {
                    "type": "text",
                    "text": (
                        "YouTubeのトップ視聴維持率アナリストとして、この動画の冒頭区間を"
                        "映像（カット・テロップ・図解）と音声（発話・抑揚・SFX・BGM）の両面から"
                        "厳密に分解し、指定JSONスキーマで出力せよ。"
                    ),
                },
            ],
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": HookMicroSpec.model_json_schema(),
            },
        )
        hook_spec = HookMicroSpec.model_validate_json(p1_resp.output_text)

        macro_spec: MacroWinningBlueprint | None = None
        if not is_short:
            p2_resp = client.interactions.create(
                model=selected_model,
                input=[
                    {
                        "type": "video",
                        "uri": youtube_url,
                        "media_resolution": cfg["pass2"]["media_resolution"],
                        "processing": {"type": "static", "fps": cfg["pass2"]["fps"]},
                    },
                    {
                        "type": "text",
                        "text": (
                            "この長尺動画の全編について、オープンループの開閉と回収有無、リフック周期、"
                            "映像レイヤー比率、BGM転換、CTA/案件導線の挿入文脈、終盤の離脱防止設計を"
                            "厳密に分析しJSONで出力せよ。"
                        ),
                    },
                ],
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": MacroWinningBlueprint.model_json_schema(),
                },
            )
            macro_spec = MacroWinningBlueprint.model_validate_json(p2_resp.output_text)

        return {
            "status": "ok",
            "youtube_url": youtube_url,
            "hook_micro": hook_spec.model_dump(),
            "macro_blueprint": macro_spec.model_dump() if macro_spec else None,
        }
    except APIError as exc:
        if getattr(exc, "code", None) in (400, 403):
            return {"status": "skipped_video_restricted", "youtube_url": youtube_url, "reason": str(exc)}
        raise
