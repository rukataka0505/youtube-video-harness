"""ベンチマーク動画の全編 Pass 2 解析＋タイムスタンプ付きチャプター分解 CLI。

規約:
- ローカルへの動画ダウンロードは一切行わず、公開 YouTube URL のみ Gemini API へ渡す。
- 全編（0s〜終了）を 0.5 FPS / Low Resolution の Static Hybrid Pass 2 仕様で解析する。
- 出力1: episodes/benchmarks/<slug>/04_pass2_macro.json (MacroWinningBlueprint 準拠)
- 出力2: episodes/benchmarks/<slug>/04b_chapter_blueprint.json (ChapterBlueprint 準拠)
- 動画単位の 400/403 制限エラーは安全に隔離・記録して残り動画を継続処理する（APIキー障害は即時停止）。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Optional, TypeVar

from google import genai
from google.genai import types
from google.genai.errors import APIError
from pydantic import BaseModel, Field, ValidationError

from yt_engine.analyzer.benchmark_pass1 import load_dotenv
from yt_engine.config import find_repo_root
from yt_engine.schemas import MacroWinningBlueprint

SchemaT = TypeVar("SchemaT", bound=BaseModel)

DEFAULT_MODEL = "gemini-4-neon"
DEFAULT_FPS = 0.5
DEFAULT_HTTP_TIMEOUT_MS = 600_000
TRANSIENT_HTTP_CODES = {429, 500, 502, 503, 504}
DEFAULT_RETRY_DELAYS_SEC: tuple[float, ...] = (5.0, 15.0)


class ChapterItem(BaseModel):
    """全編タイムライン内の1チャプター（ミニアーク／転換単位）の詳細分解。"""

    chapter_index: int = Field(ge=1, description="1始まりのチャプター連番")
    chapter_title_ja: str = Field(description="このチャプターの要約見出し（日本語）")
    start_sec: float = Field(ge=0.0, description="開始秒数")
    end_sec: float = Field(ge=0.0, description="終了秒数")
    start_mmss: str = Field(description="開始タイムスタンプ MM:SS")
    end_mmss: str = Field(description="終了タイムスタンプ MM:SS")
    duration_ratio_pct: float = Field(ge=0.0, le=100.0, description="動画全体尺に対する占有比率（%）")
    chapter_role: Literal[
        "hook_intro",
        "problem_reframe",
        "mini_arc_mechanism",
        "mini_arc_case_or_history",
        "mid_pattern_break",
        "contrarian_turn",
        "practical_method",
        "climax_payoff",
        "end_cta_bridge",
        "sponsor_or_cta",
    ] = Field(description="構成上の役割")
    opening_hook_or_rehook_en: str = Field(
        description="この章の冒頭フックまたはリフックとなる実際の英語発話（抜粋）"
    )
    opening_hook_or_rehook_ja: str = Field(
        description="上記フック/リフックの自然な日本語口語訳"
    )
    core_argument_ja: str = Field(description="この章の核心メッセージ・ミニ結論（日本語）")
    visual_pattern: Literal[
        "stick_figure_minimal",
        "collage_clipping",
        "hand_drawn_diagram",
        "broll_essay_cinematic",
        "kinetic_typography",
        "chart_or_timeline",
        "polarity_invert_reset",
        "mixed_collage_and_diagram",
    ] = Field(description="この章の主たる視覚変化・演出の型")
    visual_break_technique_ja: str = Field(
        description="中盤ダレを防ぐ具体的な視覚変化・場面転換ギミック（日本語）"
    )
    irony_or_punchline_ja: Optional[str] = Field(
        description="この章の皮肉・自虐・小オチの内容と出現秒（無ければnull）"
    )
    bgm_transition: Literal[
        "silence_hold",
        "bgm_drop_in",
        "bgm_cutout_silence",
        "bgm_track_switch",
        "bgm_intensity_lift",
        "bgm_steady_continue",
    ] = Field(description="この章でのBGM状態・転換タイプ")
    bgm_detail_ja: str = Field(
        description="BGMのジャンル感・停止/再投入タイミング・効果音の使い方（日本語）"
    )
    next_chapter_bridge_ja: Optional[str] = Field(
        description="次章へ引っ張る引き（オープンループ・予告・逆接ブリッジ）。最終章ならnull"
    )


class ChapterBlueprint(BaseModel):
    """長尺動画全編のタイムスタンプ付きチャプター構成設計図。"""

    video_title_observed: str = Field(description="動画から認識したタイトル・テーマ")
    channel_style_observed_ja: str = Field(
        description="チャンネル固有の語り口・ビジュアル調・テンポの特徴要約（日本語）"
    )
    total_duration_sec: float = Field(gt=0.0, description="動画全体の総尺（秒）")
    total_duration_mmss: str = Field(description="動画全体の総尺 MM:SS")
    mini_arc_count: int = Field(ge=1, description="本編に含まれる独立ミニアーク（小完結ブロック）数")
    avg_rehook_interval_sec: float = Field(
        gt=0.0, description="リフック（次ブロックへの引き・視点転換）の平均発生間隔（秒）"
    )
    bgm_architecture_summary_ja: str = Field(
        description="動画全体を通したBGMの引き算・投入・無音活用・再投入アーキテクチャ要約（日本語）"
    )
    irony_and_humor_rhythm_ja: str = Field(
        description="動画全体を通した皮肉・小オチ・自虐ユーモアの配置リズムと温度感（日本語）"
    )
    end_cta_mechanism_ja: str = Field(
        description="終盤30秒〜ラストのまとめ方・CTA・次動画への橋渡し（挨拶締めの有無含む）詳細（日本語）"
    )
    chapters: list[ChapterItem] = Field(
        description="0秒から動画終了までを網羅する時系列チャプター分解リスト"
    )


@dataclass(frozen=True)
class VideoTarget:
    """Pass 2 解析対象の動画指定。"""

    slug: str
    url: str


def _configure_stdio_utf8() -> None:
    """Windows cp932 環境での出力文字化け・UnicodeEncodeError を防ぐ。"""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def make_pass2_video_part(youtube_url: str, fps: float = DEFAULT_FPS) -> types.Part:
    """全編（start/end_offset 指定なし）の Static Hybrid Pass 2 用 Video Part を組み立てる。"""
    return types.Part(
        file_data=types.FileData(file_uri=youtube_url),
        video_metadata=types.VideoMetadata(fps=fps),
    )


def is_api_key_error(exc: Exception) -> bool:
    """APIキー未設定・無効など環境側の認証エラーかを判定する。"""
    msg = str(exc).lower()
    markers = (
        "api_key_invalid",
        "api key not valid",
        "invalid api key",
        "api key is missing",
        "missing api key",
        "permission_denied: api key",
    )
    return any(marker in msg for marker in markers)


def _extract_usage_dict(response: Any) -> dict[str, int]:
    """GenerateContentResponse から usage_metadata の主要トークン数を安全に抽出する。"""
    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return {
            "prompt_token_count": 0,
            "candidates_token_count": 0,
            "thoughts_token_count": 0,
            "total_token_count": 0,
        }
    return {
        "prompt_token_count": int(getattr(usage, "prompt_token_count", 0) or 0),
        "candidates_token_count": int(getattr(usage, "candidates_token_count", 0) or 0),
        "thoughts_token_count": int(getattr(usage, "thoughts_token_count", 0) or 0),
        "total_token_count": int(getattr(usage, "total_token_count", 0) or 0),
    }


def _generate_structured(
    client: Any,
    model: str,
    contents: list[Any],
    schema_cls: type[SchemaT],
    label: str,
    retry_delays: tuple[float, ...] = DEFAULT_RETRY_DELAYS_SEC,
) -> tuple[SchemaT, dict[str, int]]:
    """Structured Outputs で Gemini を呼び出し、一時障害のみリトライしてトークン実測を返す。"""
    max_attempts = len(retry_delays) + 1
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_json_schema=schema_cls.model_json_schema(),
        media_resolution=types.MediaResolution.MEDIA_RESOLUTION_LOW,
        temperature=0.2,
    )

    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            usage = _extract_usage_dict(response)
            print(
                f"  -> {label} usage: prompt={usage['prompt_token_count']}, "
                f"candidates={usage['candidates_token_count']}, "
                f"thoughts={usage['thoughts_token_count']}, "
                f"total={usage['total_token_count']}",
                flush=True,
            )
            raw_text = getattr(response, "text", None)
            if not raw_text:
                raise ValueError(f"{label}: Empty response text from Gemini")
            parsed = schema_cls.model_validate_json(raw_text)
            return parsed, usage
        except APIError as exc:
            code = getattr(exc, "code", None)
            if code in (400, 403) or is_api_key_error(exc):
                raise
            if code in TRANSIENT_HTTP_CODES and attempt < max_attempts:
                delay = retry_delays[attempt - 1]
                print(
                    f"  [RETRY] {label} hit HTTP {code}; sleeping {delay:.1f}s "
                    f"(attempt {attempt}/{max_attempts})...",
                    flush=True,
                )
                time.sleep(delay)
                continue
            raise
        except (ValidationError, ValueError) as exc:
            if attempt < max_attempts:
                delay = retry_delays[attempt - 1]
                print(
                    f"  [RETRY] {label} parse/validation failed ({type(exc).__name__}); "
                    f"sleeping {delay:.1f}s (attempt {attempt}/{max_attempts})...",
                    flush=True,
                )
                time.sleep(delay)
                continue
            raise

    raise RuntimeError(f"{label}: exhausted retries unexpectedly")


def _build_macro_prompt() -> str:
    return (
        "YouTubeのトップ視聴維持率アナリスト兼構成ディレクターとして、この動画の 0:00 から最終秒まで全編を"
        "映像（カット間隔・画面転換・図解/コラージュ・極性反転）と音声（ナレーション・BGM投入/停止/切替・効果音）"
        "の両面から厳密に分析し、指定の JSON スキーマで出力せよ。\n"
        "【厳守条件】\n"
        "1. すべての記述フィールドは必ず日本語で書け（重要な英語フレーズは適宜カッコ内に原文併記してよい）。\n"
        "2. open_loops は動画内の重要なものに厳選して最大12件以内とし、opened_at / closed_at は 'MM:SS' 形式に統一せよ。\n"
        "3. monetization_ctas は動画内のすべてのCTA・登録導線・スポンサー・他動画送客を漏れなく最大10件以内で抽出し、timestamp は 'MM:SS' 形式にせよ。\n"
        "4. body_avg_shot_len_sec と pattern_interrupt_interval_sec は必ず 0 より大きい数値で実測推定せよ。\n"
        "5. 挨拶締め・'to recap / 最後に / まとめると' 等の終了合図語の有無（has_finalizing_phrase）と、"
        "ラスト20秒での次動画・価値橋渡し（end_screen_continuous_value）を動画末尾の実発話・画面から正確に判定せよ。"
    )


def _build_chapter_prompt() -> str:
    return (
        "あなたはYouTube長尺（15〜20分）台本アーキテクト兼ビジュアルディレクターである。"
        "この動画の 0.0 秒から動画終了（total_duration_sec）まで全編を、視聴維持率を保つための"
        "意味的チャプター／ミニアーク／場面転換単位（目安 5〜15 章）で切れ目なく重複なく時系列分解し、"
        "指定の JSON スキーマで出力せよ。\n"
        "【厳守条件】\n"
        "1. chapters は 0.0 秒から動画の最終秒まで連続して網羅し、各章の duration_ratio_pct の合計がおおむね 100.0% になるようにせよ。\n"
        "2. 各章の start_sec <= end_sec を厳守し、start_mmss / end_mmss / total_duration_mmss は 'MM:SS' 形式で記載せよ。\n"
        "3. opening_hook_or_rehook_en には、その章の冒頭で視聴者を引き戻した実際の英語発話（抜粋）をそのまま書き、"
        "opening_hook_or_rehook_ja には日本語の自然な口語訳を書け。\n"
        "4. visual_break_technique_ja には中盤ダレを破壊するための具体的な視覚変化（背景色反転・実写コラージュ投下・図解比較・テンポ加速・無音黒画面など）を具体的に書け。\n"
        "5. irony_or_punchline_ja には各章に含まれる皮肉・自虐・乾いたユーモア・小オチの内容と出現秒（例: '03:42 付近で〜'）を書け（無ければ null）。\n"
        "6. bgm_transition と bgm_detail_ja には BGM の無音保持・投入・停止（カットアウト）・トラック切替・盛り上げタイミングを秒数付きで記録せよ。\n"
        "7. next_chapter_bridge_ja には次章へ引っ張るオープンループや逆接の引きを書き、最終章のみ null にせよ。終盤ラスト30秒の End-CTA 構造は end_cta_mechanism_ja に詳細記録せよ。"
    )


def _build_client(timeout_ms: int = DEFAULT_HTTP_TIMEOUT_MS) -> genai.Client:
    return genai.Client(http_options=types.HttpOptions(timeout=timeout_ms))


def _load_existing_if_valid(macro_path: Path, chapter_path: Path) -> tuple[MacroWinningBlueprint, ChapterBlueprint] | None:
    if not (macro_path.is_file() and chapter_path.is_file()):
        return None
    try:
        macro = MacroWinningBlueprint.model_validate_json(macro_path.read_text(encoding="utf-8"))
        chapters = ChapterBlueprint.model_validate_json(chapter_path.read_text(encoding="utf-8"))
        return macro, chapters
    except Exception:
        return None


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run_pass2_single(
    youtube_url: str,
    slug: str,
    model: str = DEFAULT_MODEL,
    fps: float = DEFAULT_FPS,
    *,
    skip_existing: bool = False,
    repo_root: Path | None = None,
    client: Any | None = None,
    retry_delays: tuple[float, ...] = DEFAULT_RETRY_DELAYS_SEC,
) -> dict[str, Any]:
    """1本の公開YouTube動画に対し Pass 2 解析を実行し、2種類の検証済みJSONを保存する。"""
    resolved_root = repo_root or find_repo_root(Path(__file__))
    load_dotenv(resolved_root)

    out_dir = resolved_root / "episodes" / "benchmarks" / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    macro_path = out_dir / "04_pass2_macro.json"
    chapter_path = out_dir / "04b_chapter_blueprint.json"
    error_path = out_dir / "04_pass2_error.json"

    if skip_existing:
        existing = _load_existing_if_valid(macro_path, chapter_path)
        if existing is not None:
            macro_spec, chapter_bp = existing
            print(f"[SKIP-EXISTING] {slug}: valid Pass 2 outputs already exist.", flush=True)
            return {
                "slug": slug,
                "youtube_url": youtube_url,
                "status": "skipped_existing",
                "macro_path": str(macro_path),
                "chapter_path": str(chapter_path),
                "total_duration_sec": chapter_bp.total_duration_sec,
                "total_duration_mmss": chapter_bp.total_duration_mmss,
                "chapter_count": len(chapter_bp.chapters),
                "open_loop_count": len(macro_spec.open_loops),
                "bgm_shift_count": macro_spec.bgm_shift_count,
                "usage": {
                    "macro": {"prompt_token_count": 0, "candidates_token_count": 0, "thoughts_token_count": 0, "total_token_count": 0},
                    "chapters": {"prompt_token_count": 0, "candidates_token_count": 0, "thoughts_token_count": 0, "total_token_count": 0},
                },
            }

    active_client = client or _build_client()
    video_part = make_pass2_video_part(youtube_url, fps=fps)

    print(f"[1/2] Running MacroWinningBlueprint Pass 2 ({slug}, {model}, {fps} FPS, low)...", flush=True)
    macro_spec, macro_usage = _generate_structured(
        active_client,
        model=model,
        contents=[video_part, _build_macro_prompt()],
        schema_cls=MacroWinningBlueprint,
        label=f"{slug}/macro",
        retry_delays=retry_delays,
    )
    _write_json(macro_path, macro_spec.model_dump())
    print(f"Saved: {macro_path}", flush=True)

    print(f"[2/2] Running ChapterBlueprint Pass 2 ({slug}, {model}, {fps} FPS, low)...", flush=True)
    chapter_bp, chapter_usage = _generate_structured(
        active_client,
        model=model,
        contents=[video_part, _build_chapter_prompt()],
        schema_cls=ChapterBlueprint,
        label=f"{slug}/chapters",
        retry_delays=retry_delays,
    )
    _write_json(chapter_path, chapter_bp.model_dump())
    print(f"Saved: {chapter_path}", flush=True)

    if error_path.exists():
        error_path.unlink()

    return {
        "slug": slug,
        "youtube_url": youtube_url,
        "status": "ok",
        "macro_path": str(macro_path),
        "chapter_path": str(chapter_path),
        "total_duration_sec": chapter_bp.total_duration_sec,
        "total_duration_mmss": chapter_bp.total_duration_mmss,
        "chapter_count": len(chapter_bp.chapters),
        "open_loop_count": len(macro_spec.open_loops),
        "bgm_shift_count": macro_spec.bgm_shift_count,
        "usage": {
            "macro": macro_usage,
            "chapters": chapter_usage,
        },
    }


def run_pass2_batch(
    targets: list[VideoTarget],
    model: str = DEFAULT_MODEL,
    fps: float = DEFAULT_FPS,
    *,
    skip_existing: bool = False,
    repo_root: Path | None = None,
    client: Any | None = None,
    retry_delays: tuple[float, ...] = DEFAULT_RETRY_DELAYS_SEC,
) -> list[dict[str, Any]]:
    """複数動画を順番に Pass 2 解析し、動画単位の400/403制限エラーは記録して継続する。"""
    resolved_root = repo_root or find_repo_root(Path(__file__))
    load_dotenv(resolved_root)
    active_client = client or _build_client()

    results: list[dict[str, Any]] = []
    for idx, target in enumerate(targets, start=1):
        print(f"\n=== [{idx}/{len(targets)}] {target.slug} ({target.url}) ===", flush=True)
        out_dir = resolved_root / "episodes" / "benchmarks" / target.slug
        out_dir.mkdir(parents=True, exist_ok=True)
        error_path = out_dir / "04_pass2_error.json"

        try:
            res = run_pass2_single(
                target.url,
                target.slug,
                model=model,
                fps=fps,
                skip_existing=skip_existing,
                repo_root=resolved_root,
                client=active_client,
                retry_delays=retry_delays,
            )
            results.append(res)
        except APIError as exc:
            if is_api_key_error(exc):
                raise
            code = getattr(exc, "code", None)
            if code in (400, 403):
                err_payload = {
                    "slug": target.slug,
                    "youtube_url": target.url,
                    "status": "skipped_video_restricted",
                    "code": code,
                    "reason": str(exc),
                }
                _write_json(error_path, err_payload)
                print(
                    f"[WARN] Skipped restricted/invalid video {target.slug} (HTTP {code}): {exc}",
                    flush=True,
                )
                results.append(err_payload)
                continue

            err_payload = {
                "slug": target.slug,
                "youtube_url": target.url,
                "status": "failed",
                "code": code,
                "reason": str(exc),
            }
            _write_json(error_path, err_payload)
            print(f"[ERROR] Failed {target.slug} (APIError HTTP {code}): {exc}", flush=True)
            results.append(err_payload)
        except Exception as exc:
            err_payload = {
                "slug": target.slug,
                "youtube_url": target.url,
                "status": "failed",
                "code": None,
                "reason": f"{type(exc).__name__}: {exc}",
            }
            _write_json(error_path, err_payload)
            print(f"[ERROR] Failed {target.slug} ({type(exc).__name__}): {exc}", flush=True)
            results.append(err_payload)

    _print_batch_summary(results)
    return results


def _print_batch_summary(results: list[dict[str, Any]]) -> None:
    print("\n=== Pass 2 Batch Summary ===", flush=True)
    for item in results:
        status = item.get("status")
        slug = item.get("slug")
        if status in ("ok", "skipped_existing"):
            usage = item.get("usage", {})
            total_tokens = (
                usage.get("macro", {}).get("total_token_count", 0)
                + usage.get("chapters", {}).get("total_token_count", 0)
            )
            print(
                f"  - {slug}: status={status}, duration={item.get('total_duration_mmss')}, "
                f"chapters={item.get('chapter_count')}, open_loops={item.get('open_loop_count')}, "
                f"bgm_shifts={item.get('bgm_shift_count')}, total_tokens={total_tokens}",
                flush=True,
            )
        else:
            print(
                f"  - {slug}: status={status}, code={item.get('code')}, reason={item.get('reason')}",
                flush=True,
            )


def _parse_target_spec(raw: str) -> VideoTarget:
    if "=" not in raw:
        raise argparse.ArgumentTypeError(f"--target must be SLUG=URL, got: {raw!r}")
    slug, url = raw.split("=", 1)
    slug = slug.strip()
    url = url.strip()
    if not slug or not url:
        raise argparse.ArgumentTypeError(f"--target requires non-empty SLUG and URL, got: {raw!r}")
    return VideoTarget(slug=slug, url=url)


def _load_targets_json(path: Path) -> list[VideoTarget]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"--targets-json must contain a JSON array, got {type(data).__name__}")
    loaded: list[VideoTarget] = []
    for entry in data:
        if not isinstance(entry, dict) or not entry.get("slug") or not entry.get("url"):
            raise ValueError(f"Each entry in --targets-json must have 'slug' and 'url': {entry!r}")
        loaded.append(VideoTarget(slug=str(entry["slug"]).strip(), url=str(entry["url"]).strip()))
    return loaded


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Benchmark Pass 2 (Full-Video 0.5 FPS Low-Res) Gemini Video Analyzer"
    )
    parser.add_argument("--url", help="Public YouTube video URL (single-video mode with --slug)")
    parser.add_argument("--slug", help="Benchmark slug under episodes/benchmarks/ (with --url)")
    parser.add_argument(
        "--target",
        action="append",
        default=[],
        help="Target in SLUG=URL format (repeatable for batch mode)",
    )
    parser.add_argument(
        "--targets-json",
        type=Path,
        help="Path to JSON file containing [{\"slug\": ..., \"url\": ...}, ...]",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Gemini model ID (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=DEFAULT_FPS,
        help=f"Sampling FPS for full video (default: {DEFAULT_FPS})",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip targets whose 04_pass2_macro.json and 04b_chapter_blueprint.json already validate",
    )
    return parser


def resolve_targets(args: argparse.Namespace) -> list[VideoTarget]:
    """CLI 引数から重複なしの実行ターゲットリストを組み立てる。"""
    targets: list[VideoTarget] = []
    if args.url or args.slug:
        if not (args.url and args.slug):
            raise ValueError("--url and --slug must be specified together.")
        targets.append(VideoTarget(slug=args.slug.strip(), url=args.url.strip()))

    for raw in args.target:
        targets.append(_parse_target_spec(raw))

    if args.targets_json is not None:
        targets.extend(_load_targets_json(args.targets_json))

    seen: set[str] = set()
    unique: list[VideoTarget] = []
    for item in targets:
        if item.slug not in seen:
            seen.add(item.slug)
            unique.append(item)
    return unique


def main(argv: list[str] | None = None) -> int:
    _configure_stdio_utf8()
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    try:
        targets = resolve_targets(args)
    except (ValueError, argparse.ArgumentTypeError) as exc:
        parser.error(str(exc))

    if not targets:
        parser.error("Specify at least one target via --url/--slug, --target SLUG=URL, or --targets-json.")

    results = run_pass2_batch(
        targets,
        model=args.model,
        fps=args.fps,
        skip_existing=args.skip_existing,
    )
    has_failed = any(r.get("status") == "failed" for r in results)
    ok_count = sum(1 for r in results if r.get("status") in ("ok", "skipped_existing"))
    if has_failed or ok_count == 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
