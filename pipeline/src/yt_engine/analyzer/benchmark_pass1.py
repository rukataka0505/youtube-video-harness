"""ベンチマーク動画の冒頭60秒 Pass 1 解析＋ショット分解 CLI。

規約:
- ローカルへの動画ダウンロードは一切行わず、公開 YouTube URL のみ Gemini API へ渡す。
- 冒頭 0s〜60s を 2.0 FPS / High Resolution の Static Hybrid 仕様で解析する。
- 出力1: episodes/benchmarks/<slug>/01_gemini_analysis.json (HookMicroSpec 準拠)
- 出力2: episodes/benchmarks/<slug>/01b_shot_breakdown.json (Remotion再現用ショット分解)
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Literal, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from yt_engine.schemas import HookMicroSpec


class ShotItem(BaseModel):
    """冒頭60秒内の1ショット（視覚変化単位）の詳細分解。"""

    shot_index: int = Field(ge=1, description="1始まりのショット連番")
    start_sec: float = Field(ge=0.0, le=60.0, description="開始秒数")
    end_sec: float = Field(ge=0.0, le=60.0, description="終了秒数")
    narrative_role: Literal[
        "scroll_stop_hook",
        "context_lean_in",
        "pivot_contrast",
        "contrarian_claim",
        "open_loop",
        "example_illustration",
        "transition",
    ] = Field(description="冒頭構成上の役割")
    narration_en: str = Field(description="この区間の英語ナレーション書き起こし")
    narration_ja: str = Field(description="日本語の自然な口語訳（敬体ベース）")
    on_screen_text: Optional[str] = Field(
        description="画面に表示されている文字・キーワード（無ければnull）"
    )
    visual_description_ja: str = Field(
        description="画面の構図・図解・キャラ・アイコンの具体的な視覚描写（日本語）"
    )
    motion_type: Literal[
        "hard_cut",
        "fade",
        "slide_in",
        "scale_pop",
        "draw_stroke",
        "camera_zoom",
        "camera_pan",
        "kinetic_text",
        "static_hold",
    ] = Field(description="主なアニメーション・トランジション種別")
    bg_color_hex: str = Field(description="背景の概算HEXカラー（例: #0B0D12, #F5F3EE）")
    accent_color_hex: Optional[str] = Field(
        description="強調色・アクセントの概算HEXカラー（無ければnull）"
    )
    sfx_and_audio_ja: str = Field(
        description="この区間の効果音・BGM変化・声のトーンや間（日本語）"
    )


class BenchmarkShotBreakdown(BaseModel):
    """Remotion 再現用の冒頭60秒完全タイムライン設計図。"""

    video_title_observed: str = Field(description="動画から認識したタイトル・テーマ")
    overall_visual_style_ja: str = Field(
        description="動画全体のビジュアル設計（配色・線画/図解テイスト・タイポグラフィ・余白率）の要約"
    )
    overall_pacing_and_audio_ja: str = Field(
        description="全体テンポ・カット間隔・BGMのBPM感・声のテンション・間の取り方の要約"
    )
    palette_bg_hex: str = Field(description="基調背景色HEX")
    palette_fg_hex: str = Field(description="基調文字/線画色HEX")
    palette_accent_hex: str = Field(description="主要アクセント色HEX")
    shots: list[ShotItem] = Field(
        description="0秒から60秒までを網羅するショット分解リスト（時系列順）"
    )


def load_dotenv(repo_root: Path) -> None:
    """リポジトリ直下の .env を安全に環境変数へ読み込む。"""
    env_path = repo_root / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, val = stripped.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and val and key not in os.environ:
            os.environ[key] = val


def make_video_part(youtube_url: str, start_offset: str = "0s", end_offset: str = "60s", fps: float = 2.0) -> types.Part:
    return types.Part(
        file_data=types.FileData(file_uri=youtube_url),
        video_metadata=types.VideoMetadata(
            start_offset=start_offset,
            end_offset=end_offset,
            fps=fps,
        ),
    )


def run_pass1(youtube_url: str, slug: str, model: str, fps: float = 2.0) -> tuple[Path, Path]:
    repo_root = Path(__file__).resolve().parents[4]
    load_dotenv(repo_root)

    out_dir = repo_root / "episodes" / "benchmarks" / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    client = genai.Client()
    video_part = make_video_part(youtube_url, start_offset="0s", end_offset="60s", fps=fps)

    # 1) HookMicroSpec (規約スキーマ準拠)
    print(f"[1/2] Running HookMicroSpec Pass 1 ({model}, 0-60s, {fps} FPS, high)...")
    resp1 = client.models.generate_content(
        model=model,
        contents=[
            video_part,
            (
                "YouTubeのトップ視聴維持率アナリストとして、この動画の冒頭0〜60秒を"
                "映像（カット・テロップ・図解）と音声（発話・抑揚・SFX・BGM）の両面から"
                "厳密に分解し、指定JSONスキーマで出力せよ。記述フィールドは必ず日本語で書け。"
            ),
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=HookMicroSpec.model_json_schema(),
            media_resolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
            temperature=0.2,
        ),
    )
    hook_spec = HookMicroSpec.model_validate_json(resp1.text)
    hook_path = out_dir / "01_gemini_analysis.json"
    hook_path.write_text(
        json.dumps(hook_spec.model_dump(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Saved: {hook_path}")

    # 2) Shot Breakdown (Remotion 再現用タイムライン)
    print(f"[2/2] Running Shot Breakdown Pass 1 ({model}, 0-60s, {fps} FPS, high)...")
    resp2 = client.models.generate_content(
        model=model,
        contents=[
            video_part,
            (
                "あなたは2Dモーショングラフィックス（Remotion）のリードディレクターである。"
                "この動画の冒頭0〜60秒をRemotionで構造・テンポ・図解レイアウトごと再現できるよう、"
                "0.0秒から60.0秒まで切れ目なくショット（視覚変化・画面切替・重要モーション）単位で分解せよ。"
                "各ショットの英語発話、自然な日本語訳、画面上の文字、図解/棒人間/アイコンの具体的な配置と動き、"
                "背景色・アクセント色（HEX）、効果音/BGM/間の演出を厳密にJSONで出力せよ。"
            ),
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=BenchmarkShotBreakdown.model_json_schema(),
            media_resolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
            temperature=0.2,
        ),
    )
    breakdown = BenchmarkShotBreakdown.model_validate_json(resp2.text)
    breakdown_path = out_dir / "01b_shot_breakdown.json"
    breakdown_path.write_text(
        json.dumps(breakdown.model_dump(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Saved: {breakdown_path}")
    return hook_path, breakdown_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Pass 1 (0-60s) Gemini Video Analyzer")
    parser.add_argument("--url", required=True, help="Public YouTube video URL")
    parser.add_argument("--slug", required=True, help="Benchmark slug under episodes/benchmarks/")
    parser.add_argument("--model", default="gemini-4-neon", help="Gemini model ID (default: gemini-4-neon)")
    parser.add_argument("--fps", type=float, default=2.0, help="Sampling FPS for 0-60s (default: 2.0)")
    args = parser.parse_args()
    run_pass1(args.url, args.slug, args.model, args.fps)


if __name__ == "__main__":
    main()
