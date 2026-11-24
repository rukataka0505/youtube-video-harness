"""ABテスト制作動画（ローカル MP4）を Gemini Files API 経由で横並び比較解析する CLI。

- ローカル制作動画（variants/*/*.mp4 等）を Gemini Files API へアップロードし、
  Static 動画メタデータ（既定 1.0 FPS / MEDIA_RESOLUTION_LOW）で定量・定性比較を実行する。
- モデルは既定 `gemini-4-neon` を試行し、404 / 429 等で失敗時は `gemini-3.8-flash` へフォールバックする。
- 解析後は `finally` ブロックで必ず Gemini Files API 上のアップロードファイルを全削除する。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types
from google.genai.errors import APIError
from pydantic import BaseModel, Field

from yt_engine.analyzer.benchmark_pass1 import load_dotenv
from yt_engine.config import find_repo_root

DEFAULT_MODELS: tuple[str, ...] = ("gemini-4-neon", "gemini-3.8-flash")
DEFAULT_FPS = 1.0
UPLOAD_POLL_INTERVAL_SEC = 2.0
UPLOAD_POLL_TIMEOUT_SEC = 180.0
HTTP_TIMEOUT_MS = 600_000


def _configure_stdio_utf8() -> None:
    """Windows cp932 環境での標準入出力エンコード例外を防ぐ。"""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


class VariantVideoEval(BaseModel):
    """1バリエーション動画に対する定量・定性評価。"""

    variant_id: str = Field(description="バリエーション識別子（例: v1_pure_c, v2_dark_merge, v3_polarity_merge）")
    visual_rhythm_score_10: float = Field(ge=0.0, le=10.0, description="視覚リズム・テンポの気持ちよさ（10点満点）")
    eye_guidance_score_10: float = Field(ge=0.0, le=10.0, description="視線誘導の明瞭さ・迷わなさ（10点満点）")
    layout_balance_score_10: float = Field(ge=0.0, le=10.0, description="空間配置・余白・要素整理バランス（10点満点）")
    handdrawn_photo_harmony_score_10: float = Field(ge=0.0, le=10.0, description="手描き要素と実写/紙面要素の噛み合い（10点満点）")
    background_variety_score_10: float = Field(ge=0.0, le=10.0, description="背景変化・飽き防止力（10点満点）")
    audio_cohesion_score_10: float = Field(ge=0.0, le=10.0, description="語り・効果音・BGM/無音間の統一感（10点満点）")
    avg_visual_change_interval_sec: float = Field(gt=0.0, description="実視聴で体感される視覚変化・モーションの平均間隔（秒）")
    strongest_moments: list[str] = Field(description="特に優れていた瞬間（MM:SS と具体理由、3〜5件）")
    weakest_moments_or_glitches: list[str] = Field(description="違和感・チープさ・文字干渉・間延び・音響の浮き等（MM:SS と具体理由、3〜5件）")


class ABComparisonAnalysis(BaseModel):
    """ABテスト動画複数本の横並び比較解析レポート（stickman_collage 用）。"""

    variants: list[VariantVideoEval] = Field(description="各バリエーションごとの評価一覧")
    why_v3_wins_ja: str = Field(description="v3が最もセンス良く見えた映像・テンポ・背景切替・モーションの根拠（日本語）")
    what_v2_does_better_than_v3_ja: str = Field(description="v2の空間配置・余白・視線誘導・整理感がv3より優れていた具体的ポイント（日本語）")
    handdrawn_vs_real_photo_boundary_ja: str = Field(description="手書きSVG vs 実写写真の棲み分けで実映像から見えた具体例と改善点（日本語）")
    polarity_switch_pacing_ja: str = Field(description="黒・方眼紙・クリームノートの切替頻度・最適な持続尺・切替時の視認性所見（日本語）")
    subtitle_and_safezone_findings_ja: str = Field(description="下段字幕と図解の縦方向干渉・明暗コントラスト・90%セーフゾーン視認性の実測所見（日本語）")
    audio_and_sfx_findings_ja: str = Field(description="1:26以降の合成ピアノの浮き具合、効果音の間・音量感・無音活用の実測所見（日本語）")
    actionable_rules_for_stickman_collage: list[str] = Field(
        description="新ハーネス stickman-collage のテンプレート・コンポーネント・機械バリデータへ反映すべき具体ルール（5〜8件）"
    )


class PlanEVariantEval(BaseModel):
    """案E（planE_macro_econ）1バリエーション動画に対する定量・定性評価。"""

    variant_id: str = Field(description="バリエーション識別子 (例: v1_neon_high, v2_orch_neon, v3_opus_high)")
    visual_rhythm_score_10: float = Field(ge=0.0, le=10.0, description="視覚リズム・緩急・カットテンポの気持ちよさ（10点満点）")
    backdrop_polarity_score_10: float = Field(ge=0.0, le=10.0, description="背景極性切替・物理マテリアル多様性・飽き防止力（10点満点）")
    data_chart_clarity_score_10: float = Field(ge=0.0, le=10.0, description="グラフ・データ図解・因果可視化の視認性と説得力（10点満点）")
    sfx_audio_sync_score_10: float = Field(ge=0.0, le=10.0, description="紙面出現・判子・切替・ズーム等に対する効果音同期の充実度（10点満点）")
    anti_ai_slop_score_10: float = Field(ge=0.0, le=10.0, description="脱AI Slop度：ダークブルー方眼4箱カードや映像内ポエム大見出しの排除度（10点満点）")
    subtitle_safezone_score_10: float = Field(ge=0.0, le=10.0, description="下段字幕の可読性・図解/ニュース帯との非干渉・90%セーフゾーン遵守度（10点満点）")
    avg_visual_change_interval_sec: float = Field(gt=0.0, description="実視聴で体感される視覚変化・ビート展開の平均間隔（秒）")
    strongest_moments: list[str] = Field(description="特に優れていた瞬間（MM:SS と具体理由、3〜5件）")
    weakest_moments_and_ai_slop: list[str] = Field(description="AI Slop残存・SFX無音抜け・文字過多・視認性破綻等（MM:SS と具体理由、3〜5件）")


class PlanEABAnalysis(BaseModel):
    """案E（planE_macro_econ）ABテスト動画複数本の横並び比較解析レポート。"""

    variants: list[PlanEVariantEval] = Field(description="各バリエーションの個別評価一覧")
    visual_rhythm_and_polarity_ja: str = Field(description="視覚リズム・背景極性切替（暗色・紙面・コルク・ホワイトボード・暗室プロジェクター）と飽き防止の比較所見")
    data_chart_and_causal_motion_ja: str = Field(description="経済グラフ視認性・RGBグリッチ転換・因果ループモーションと文字量バランスの比較所見")
    sfx_sync_deficits_ja: str = Field(description="紙面・判子・切抜き出現やズーム・切替で効果音が鳴っておらず物足りない具体タイムスタンプと原因所見")
    ai_slop_residual_audit_ja: str = Field(description="残存したAI Slop表現（ダークブルー方眼＋4角丸カード矢印、映像内ポエム大見出し＋横線バー、文字過多等）の具体タイムスタンプ監査")
    subtitle_and_layout_audit_ja: str = Field(description="下段字幕と図解・ニュース帯・ホワイトボード・紙面オブジェクトの干渉およびコントラスト実測所見")
    harness_upgrade_recommendations: list[str] = Field(
        description="案Eハーネス（Remotionコンポーネント・PlanEMacroEconTemplate・SFX連携・機械バリデータ）へ定着すべき具体構造ルール（5〜8件）"
    )


def _parse_variant_arg(raw: str) -> tuple[str, Path]:
    if "=" not in raw:
        raise argparse.ArgumentTypeError(f"--variant must be LABEL=PATH, got: {raw!r}")
    label, path_str = raw.split("=", 1)
    label = label.strip()
    path = Path(path_str.strip()).resolve()
    if not label:
        raise argparse.ArgumentTypeError(f"--variant requires non-empty LABEL: {raw!r}")
    if not path.is_file():
        raise argparse.ArgumentTypeError(f"Variant video file not found: {path}")
    return label, path


def _resolve_api_keys() -> list[str]:
    keys: list[str] = []
    for env_name in ("GEMINI_API_KEY", "GEMINI_API_KEY_FALLBACK"):
        val = (os.environ.get(env_name) or "").strip()
        if val and val not in keys:
            keys.append(val)
    if not keys:
        raise RuntimeError("GEMINI_API_KEY (or GEMINI_API_KEY_FALLBACK) is not set in environment or .env.")
    return keys


def _resolve_media_resolution(name: str) -> types.MediaResolution:
    key = name.strip().lower()
    if key == "high":
        return types.MediaResolution.MEDIA_RESOLUTION_HIGH
    if key == "medium":
        return types.MediaResolution.MEDIA_RESOLUTION_MEDIUM
    return types.MediaResolution.MEDIA_RESOLUTION_LOW


def _file_state_name(file_obj: Any) -> str:
    state = getattr(file_obj, "state", None)
    if state is None:
        return ""
    name = getattr(state, "name", None)
    return str(name if name is not None else state).upper()


def _upload_and_wait(client: genai.Client, label: str, mp4_path: Path) -> Any:
    print(f"[UPLOAD] {label}: {mp4_path.name} ({mp4_path.stat().st_size / (1024 * 1024):.2f} MB)...", flush=True)
    uploaded = client.files.upload(
        file=str(mp4_path),
        config=types.UploadFileConfig(mime_type="video/mp4", display_name=label),
    )
    deadline = time.monotonic() + UPLOAD_POLL_TIMEOUT_SEC
    cur = uploaded
    while time.monotonic() < deadline:
        st = _file_state_name(cur)
        if st == "ACTIVE" or (not st and getattr(cur, "uri", None)):
            print(f"[ACTIVE] {label}: name={cur.name}", flush=True)
            return cur
        if st == "FAILED":
            err = getattr(cur, "error", None)
            raise RuntimeError(f"Gemini file processing FAILED for {label}: {err}")
        time.sleep(UPLOAD_POLL_INTERVAL_SEC)
        cur = client.files.get(name=cur.name)
    raise TimeoutError(f"Timed out waiting for uploaded file to become ACTIVE: {label} ({cur.name})")


def _build_prompt(labels: list[str]) -> str:
    joined = ", ".join(labels)
    return (
        "あなたはYouTube長尺解説動画（2D棒人間×コラージュ／図解系）のトップクリエイティブディレクター兼UXアナリストである。\n"
        f"今回、同一の音声・字幕・尺で映像表現や演出構成を変えた {len(labels)} 本のABテスト動画（{joined}）を"
        "添付順に提示した。全案を横並びで実際に視聴・比較し、コード上の設計意図ではなく『実際の映像と音として視聴者にどう見えるか』を厳密に分析して、"
        "指定 JSON スキーマで出力せよ。\n\n"
        "【重点観察ポイント】\n"
        "1. 視線誘導・配置バランス: 画面内のどこに目が向くか、文字・図解・棒人間・実写素材の距離感や整理感において各案にどんな差があるか。\n"
        "2. モーション・リズム: 描画モーション、カット切替の密度、発話・ビート同期の気持ちよさと間延びの有無。\n"
        "3. 背景極性切替: 明背景・暗背景・質感背景の切替によって、飽きにくさ・可読性・場面転換のテンポ感はどう違うか。\n"
        "4. 手書き vs 実写境界: 実在人物・具体物（実写素材）と手書き棒人間・図解の棲み分けが自然で分かりやすいか。\n"
        "5. 下段字幕とセーフゾーン: 各背景上で下段字幕が図解やカードと縦方向に干渉していないか、縁取りコントラストは十分か。\n"
        "6. 音響: 効果音（SFX）の同期・音量バランス・間（呼吸）の設計、およびBGMとの馴染み方の実視聴評価。\n\n"
        "【厳守条件】\n"
        "- すべての記述は必ず日本語で行うこと。\n"
        "- 具体的なタイムスタンプ（MM:SS）やシーン内容に触れ、抽象論で終わらせず『stickman-collage』の実装・検証改善へ落とし込むこと。"
    )


def _build_plan_e_prompt(labels: list[str]) -> str:
    joined = ", ".join(labels)
    return (
        "あなたはYouTube長尺解説動画（インセンティブ・構造解剖系：実写Bロール×図解×自由舞台演出）のトップクリエイティブディレクター兼映像UXアナリストである。\n"
        f"今回、同一の日本語ナレーション音声・字幕・尺で映像表現だけを変えた {len(labels)} 本のABテスト動画（{joined}）を添付順に提示した。\n"
        "横並びで実際に視聴・聴取し、『実際の映像と音として視聴者にどう見え、どう聞こえるか』を厳密に横断解剖し、指定 JSON スキーマで日本語出力せよ。\n\n"
        "【重点観察ポイント】\n"
        "1. 視覚リズム＆背景極性切替: 明暗や質感の切替、シーン展開の緩急によって飽きを防げているか、テーマ固有の絵作りになっているか。\n"
        "2. グラフ・データ図解・構造モーション: 図解・数値の視認性、ラベル重なり有無、因果・対比の伝わりやすさと文字量バランス。\n"
        "3. SFX（効果音）同期不足の監査: 視覚的な出現・強調・切替・ズーム等のサブビートに対して効果音が鳴っておらず無音抜けしている具体タイムスタンプ（MM:SS）。\n"
        "4. AI Slop 残存箇所の監査: 均等カード羅列、文字過多ダッシュボード、下段字幕があるのに映像内へ載る冗長な説明見出し等の具体タイムスタンプ（MM:SS）。\n"
        "5. 下段字幕とセーフゾーン: 画面下部のUI・図解・カードと下段字幕の縦方向干渉および明暗コントラスト。\n\n"
        "【厳守条件】\n"
        "- すべての記述は必ず日本語で行い、具体的なタイムスタンプ（MM:SS）を明記すること。"
    )


def run_ab_compare(
    variants: list[tuple[str, Path]],
    out_path: Path,
    *,
    format_id: str = "stickman_collage",
    models: tuple[str, ...] = DEFAULT_MODELS,
    fps: float = DEFAULT_FPS,
    resolution: str = "low",
) -> ABComparisonAnalysis | PlanEABAnalysis:
    repo_root = find_repo_root(Path(__file__))
    load_dotenv(repo_root)
    api_keys = _resolve_api_keys()
    media_res = _resolve_media_resolution(resolution)
    is_plan_e = format_id == "planE_macro_econ"
    schema_cls: type[ABComparisonAnalysis] | type[PlanEABAnalysis] = (
        PlanEABAnalysis if is_plan_e else ABComparisonAnalysis
    )
    prompt_text = (
        _build_plan_e_prompt([lbl for lbl, _ in variants])
        if is_plan_e
        else _build_prompt([lbl for lbl, _ in variants])
    )

    last_exc: Exception | None = None
    for key_idx, api_key in enumerate(api_keys, start=1):
        client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=HTTP_TIMEOUT_MS),
        )
        uploaded_files: list[tuple[str, Any]] = []
        try:
            for label, mp4_path in variants:
                fobj = _upload_and_wait(client, label, mp4_path)
                uploaded_files.append((label, fobj))

            contents: list[Any] = []
            for label, fobj in uploaded_files:
                contents.append(f"=== バリエーション: {label} ===")
                contents.append(
                    types.Part(
                        file_data=types.FileData(
                            file_uri=fobj.uri,
                            mime_type=getattr(fobj, "mime_type", None) or "video/mp4",
                        ),
                        video_metadata=types.VideoMetadata(fps=fps),
                    )
                )
            contents.append(prompt_text)

            for model_name in models:
                print(
                    f"[ANALYZE] key#{key_idx}, format={format_id}, model={model_name}, fps={fps}, resolution={media_res.name}...",
                    flush=True,
                )
                try:
                    resp = client.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_json_schema=schema_cls.model_json_schema(),
                            media_resolution=media_res,
                            temperature=0.2,
                        ),
                    )
                    usage = getattr(resp, "usage_metadata", None)
                    if usage is not None:
                        print(
                            f"  -> usage: prompt={getattr(usage, 'prompt_token_count', 0)}, "
                            f"candidates={getattr(usage, 'candidates_token_count', 0)}, "
                            f"thoughts={getattr(usage, 'thoughts_token_count', 0)}, "
                            f"total={getattr(usage, 'total_token_count', 0)}",
                            flush=True,
                        )
                    raw_text = getattr(resp, "text", None)
                    if not raw_text:
                        raise ValueError(f"Empty response text from model={model_name}")
                    parsed = schema_cls.model_validate_json(raw_text)
                    payload = {
                        "format_id": format_id,
                        "analyzed_with_model": model_name,
                        "fps": fps,
                        "media_resolution": media_res.name,
                        "variants_input": [
                            {"variant_id": lbl, "file": str(p.relative_to(repo_root)) if p.is_relative_to(repo_root) else str(p)}
                            for lbl, p in variants
                        ],
                        **parsed.model_dump(),
                    }
                    out_path.parent.mkdir(parents=True, exist_ok=True)
                    out_path.write_text(
                        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
                    print(f"[SAVED] {out_path}", flush=True)
                    return parsed
                except APIError as exc:
                    last_exc = exc
                    code = getattr(exc, "code", None)
                    print(f"[WARN] model={model_name} APIError (code={code}): {exc}", flush=True)
                    if code in (404, 429, 500, 502, 503, 504):
                        continue
                    # 認証・クォータ系なら次のキーを試す
                    if code in (400, 401, 403):
                        break
                    continue
                except Exception as exc:
                    last_exc = exc
                    print(f"[WARN] model={model_name} failed ({type(exc).__name__}): {exc}", flush=True)
                    continue
        finally:
            for label, fobj in uploaded_files:
                fname = getattr(fobj, "name", None)
                if fname:
                    try:
                        client.files.delete(name=fname)
                        print(f"[CLEANUP] Deleted uploaded file {label}: {fname}", flush=True)
                    except Exception as del_exc:
                        print(f"[WARN] Cleanup failed for {fname}: {del_exc}", flush=True)

    raise RuntimeError(f"All Gemini API attempts failed for AB comparison: {last_exc}")


def main(argv: list[str] | None = None) -> int:
    _configure_stdio_utf8()
    parser = argparse.ArgumentParser(description="Compare AB-test local MP4 videos via Gemini Files API")
    parser.add_argument(
        "--variant",
        action="append",
        required=True,
        help="LABEL=MP4_PATH (repeatable, e.g. v1_pure_c=path/to/v1.mp4)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Output JSON path for comparison report",
    )
    parser.add_argument(
        "--model",
        action="append",
        default=[],
        help="Model(s) to try in order (default: gemini-4-neon, gemini-3.8-flash)",
    )
    parser.add_argument(
        "--format",
        dest="format_id",
        choices=("stickman_collage", "planE_macro_econ"),
        default="stickman_collage",
        help="Target format schema/prompt (default: stickman_collage)",
    )
    parser.add_argument("--fps", type=float, default=DEFAULT_FPS, help=f"Sampling FPS (default: {DEFAULT_FPS})")
    parser.add_argument(
        "--resolution",
        choices=("low", "medium", "high"),
        default="low",
        help="MediaResolution for comparison (default: low)",
    )
    args = parser.parse_args(argv)

    variants = [_parse_variant_arg(v) for v in args.variant]
    models = tuple(args.model) if args.model else DEFAULT_MODELS
    out_path = args.out.resolve()

    run_ab_compare(
        variants,
        out_path,
        format_id=args.format_id,
        models=models,
        fps=args.fps,
        resolution=args.resolution,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
