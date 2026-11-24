"""YouTube Data API v3 異常値（Outlier）発掘クローラ MVP CLI。

機能:
- configs/seed_channels.yaml のシードチャンネルを低クォータ巡回（UULF優先＋UUフォールバック）
- OS_LOO（自身除外中央値比）・VSR・VPD_norm・広告ブースト除外（相対高評価率崩壊フィルタ）でランキング算出
- Markdown レポート＆JSON 出力（--with-comments で上位異常値動画の高共感コメント抽出）
- --dry-run で外部通信ゼロの設定検証＆推定クォータ見積もり

使用例:
  python pipeline/scripts/find_outliers.py --dry-run
  python pipeline/scripts/find_outliers.py --category overseas_macro_econ --limit 15 --out pipeline/data/reports/macro
  python pipeline/scripts/find_outliers.py --limit 10 --with-comments
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

# pipeline/src をモジュール検索パスへ補完
REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_SRC = REPO_ROOT / "pipeline" / "src"
if str(PIPELINE_SRC) not in sys.path:
    sys.path.insert(0, str(PIPELINE_SRC))

import yaml

from yt_engine.collector.youtube_client import (
    YouTubeApiError,
    YouTubeDataClient,
    load_dotenv_file,
    load_quota_settings,
)
from yt_engine.quota import QuotaCircuitOpen, redact_url
from yt_engine.scoring.outlier import (
    ScoredVideo,
    ScoringConfig,
    evaluate_channel_outliers,
    rank_outliers,
)

DEFAULT_SEEDS_PATH = REPO_ROOT / "configs" / "seed_channels.yaml"
DEFAULT_REPORTS_DIR = REPO_ROOT / "pipeline" / "data" / "reports"


@dataclass(frozen=True)
class SeedChannel:
    """configs/seed_channels.yaml の1シードチャンネル定義。"""

    name: str
    identifier: str
    channel_id: str
    handle: str
    market: str
    category: str
    format_plan: str
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


def load_seed_channels(
    seeds_path: Path | None = None,
    categories: Sequence[str] | None = None,
    market: str | None = None,
) -> list[SeedChannel]:
    """seed_channels.yaml を読み込み、@handle / channel_id 両対応で正規化する。"""
    target = seeds_path or DEFAULT_SEEDS_PATH
    if not target.is_file():
        raise FileNotFoundError(f"Seed channels file not found: {target}")

    with target.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict) or not isinstance(data.get("channels"), list):
        raise ValueError(f"Invalid seed_channels.yaml schema in {target}")

    allowed_categories: set[str] | None = None
    if categories:
        allowed_categories = set()
        for raw in categories:
            for item in raw.split(","):
                cleaned = item.strip().lower()
                if cleaned:
                    allowed_categories.add(cleaned)

    market_filter = market.strip().lower() if market else None

    seeds: list[SeedChannel] = []
    for idx, entry in enumerate(data["channels"], start=1):
        if not isinstance(entry, dict):
            raise ValueError(f"Channel entry #{idx} must be a mapping.")
        channel_id = str(entry.get("channel_id") or "").strip()
        handle = str(entry.get("handle") or "").strip()
        if handle and not handle.startswith("@"):
            handle = f"@{handle}"

        identifier = channel_id or handle
        if not identifier:
            raise ValueError(
                f"Channel entry #{idx} ({entry.get('name', 'unknown')}) must specify "
                "'channel_id' or 'handle'."
            )

        ch_market = str(entry.get("market") or "global_en").strip()
        ch_category = str(entry.get("category") or "uncategorized").strip()
        if allowed_categories is not None and ch_category.lower() not in allowed_categories:
            continue
        if market_filter is not None and ch_market.lower() != market_filter:
            continue

        seeds.append(
            SeedChannel(
                name=str(entry.get("name") or identifier),
                identifier=identifier,
                channel_id=channel_id,
                handle=handle,
                market=ch_market,
                category=ch_category,
                format_plan=str(entry.get("format_plan") or ""),
                notes=str(entry.get("notes") or ""),
            )
        )

    return seeds


def resolve_output_paths(
    out_arg: str | None,
    now: datetime,
    default_dir: Path = DEFAULT_REPORTS_DIR,
) -> tuple[Path, Path]:
    """--out 引数から (markdown_path, json_path) を決定する。"""
    stamp = now.strftime("%Y%m%d_%H%M%S")
    if not out_arg:
        base = default_dir / f"outliers_{stamp}"
        return base.with_suffix(".md"), base.with_suffix(".json")

    raw = Path(out_arg)
    if out_arg.endswith(("/", "\\")) or raw.is_dir():
        base = raw / f"outliers_{stamp}"
        return base.with_suffix(".md"), base.with_suffix(".json")

    if raw.suffix.lower() in {".md", ".markdown"}:
        return raw, raw.with_suffix(".json")
    if raw.suffix.lower() == ".json":
        return raw.with_suffix(".md"), raw
    return raw.with_suffix(".md"), raw.with_suffix(".json")


def estimate_quota_units(
    seed_count: int,
    *,
    with_comments: bool = False,
    limit: int = 20,
) -> dict[str, int]:
    """シード件数からキャッシュ未ヒット時の推定クォータ消費量（units）を算出する。"""
    channels_units = seed_count  # channels.list: 1 unit/ch
    playlist_units = seed_count  # playlistItems.list(UULF): 1 unit/ch（404時は最大2）
    videos_units = seed_count  # videos.list(50件バッチ): 1 unit/ch
    comments_units = limit if with_comments else 0
    total_best = channels_units + playlist_units + videos_units + comments_units
    total_worst_fallback = total_best + seed_count  # 全ch UUフォールバック時の上限見積り
    return {
        "channels_list": channels_units,
        "playlist_items_list": playlist_units,
        "videos_list": videos_units,
        "comment_threads_list": comments_units,
        "estimated_total_units": total_best,
        "estimated_max_with_uu_fallback_units": total_worst_fallback,
    }


def _format_duration(seconds: int) -> str:
    minutes, sec = divmod(max(0, int(seconds)), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{sec:02d}"
    return f"{minutes}:{sec:02d}"


def _format_int(value: int | float) -> str:
    return f"{int(round(value)):,}"


def _escape_md_cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\r", " ").replace("\n", " ").strip()


def render_markdown_report(payload: dict[str, Any]) -> str:
    """異常値ランキング結果ペイロードから日本語 Markdown レポートを生成する。"""
    lines: list[str] = []
    is_dry = bool(payload.get("dry_run"))
    title_suffix = "（Dry-Run 実行計画）" if is_dry else ""
    lines.append(f"# YouTube 異常値（Outlier）発掘レポート{title_suffix}")
    lines.append("")
    lines.append(f"- 生成日時（UTC）: `{payload['generated_at']}`")
    lines.append(f"- 対象シードチャンネル数: `{payload['seed_count']}`")

    filters = payload.get("filters") or {}
    if filters.get("categories"):
        lines.append(f"- カテゴリ指定: `{', '.join(filters['categories'])}`")
    if filters.get("market"):
        lines.append(f"- 市場指定: `{filters['market']}`")
    lines.append(f"- ランキング上限: `Top {filters.get('limit', 20)}`")
    lines.append(f"- コメント取得: `{'有効' if filters.get('with_comments') else '無効'}`")

    if is_dry:
        est = payload.get("quota_estimate") or {}
        lines.append(
            f"- 推定クォータ消費（キャッシュ未ヒット時）: "
            f"`{est.get('estimated_total_units', 0)} units` "
            f"（全ch UUフォールバック最大 `{est.get('estimated_max_with_uu_fallback_units', 0)} units`）"
        )
        lines.append(
            f"- `YOUTUBE_API_KEY` 設定状態: "
            f"`{'設定済み' if payload.get('api_key_configured') else '未設定'}`"
        )
        lines.append("")
        lines.append("## 対象シードチャンネル一覧")
        lines.append("")
        lines.append("| # | チャンネル名 | 識別子 | 市場 | カテゴリ | フォーマット |")
        lines.append("| ---: | :--- | :--- | :--- | :--- | :--- |")
        for idx, seed in enumerate(payload.get("seeds") or [], start=1):
            lines.append(
                f"| {idx} | {_escape_md_cell(seed['name'])} | `{seed['identifier']}` | "
                f"`{seed['market']}` | `{seed['category']}` | `{seed.get('format_plan', '')}` |"
            )
        lines.append("")
        return "\n".join(lines)

    quota_info = payload.get("quota_usage") or {}
    ttl_deleted = payload.get("ttl_deleted") or {}
    lines.append(
        f"- 処理完了チャンネル: `{len(payload.get('channels_processed') or [])}` / "
        f"失敗・スキップ: `{len(payload.get('channels_failed') or [])}`"
    )
    lines.append(
        f"- クォータ使用量（本日PT general）: "
        f"`{quota_info.get('general_used', 0)} / {quota_info.get('general_limit', 8500)} units`"
    )
    if payload.get("quota_halted"):
        lines.append(
            f"- **警告（クォータ停止）**: `{payload.get('quota_halt_reason', 'quotaExceeded')}`"
        )
    total_ttl = sum(int(v) for v in ttl_deleted.values())
    lines.append(f"- 30日TTL（29日基準）削除レコード合計: `{total_ttl}` 件")
    lines.append("")

    outliers: list[dict[str, Any]] = payload.get("outliers") or []
    lines.append(f"## 異常値ランキング（Top {len(outliers)}）")
    lines.append("")
    if not outliers:
        lines.append("_条件に合致する異常値動画が見つかりませんでした。_")
        lines.append("")
    else:
        lines.append(
            "| 順位 | ティア | チャンネル | 動画タイトル | OS_LOO | VSR | VPD_norm | 再生数 | 中央値 | 高評価率 | 尺 | 公開日 | メモ |"
        )
        lines.append(
            "| ---: | :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- | :--- |"
        )
        for rank, item in enumerate(outliers, start=1):
            pub_date = str(item.get("published_at") or "")[:10]
            title_link = f"[{_escape_md_cell(item['title'])}]({item['url']})"
            notes = ", ".join(item.get("warnings") or [])
            lines.append(
                f"| {rank} | `{item['outlier_tier']}` | "
                f"{_escape_md_cell(item['channel_title'])} | {title_link} | "
                f"**{item['os_loo']:.2f}x** | {item['vsr']:.2f} | "
                f"{item['vpd_norm']:.1f} | {_format_int(item['view_count'])} | "
                f"{_format_int(item['baseline_median'])} | {item['like_rate'] * 100:.2f}% | "
                f"{_format_duration(item['duration_seconds'])} | {pub_date} | "
                f"{_escape_md_cell(notes)} |"
            )
        lines.append("")

    # コメント抜粋（--with-comments 時）
    commented = [item for item in outliers if item.get("top_comments")]
    if commented:
        lines.append("## 高共感コメント抜粋（上位異常値動画）")
        lines.append("")
        for item in commented:
            lines.append(f"### {item['channel_title']} — {item['title']}（OS_LOO {item['os_loo']:.2f}x）")
            for c in item["top_comments"][:5]:
                snippet_text = _escape_md_cell(str(c.get("text") or ""))[:180]
                lines.append(
                    f"- 👍 {c.get('like_count', 0)} / 💬 {c.get('reply_count', 0)} "
                    f"（重み `{c.get('empathy_weight', 0):.2f}`）: {snippet_text}"
                )
            lines.append("")

    # 広告ブースト等で除外された動画
    excluded: list[dict[str, Any]] = payload.get("excluded_videos") or []
    if excluded:
        lines.append(f"## 広告ブースト除外・ノイズ隔離（{len(excluded)} 件）")
        lines.append("")
        lines.append("| チャンネル | 動画タイトル | OS_LOO | 再生数 | 高評価率 | チャンネル通常高評価率 | 除外理由 |")
        lines.append("| :--- | :--- | ---: | ---: | ---: | ---: | :--- |")
        for item in excluded[:30]:
            title_link = f"[{_escape_md_cell(item['title'])}]({item['url']})"
            reasons = "; ".join(item.get("exclusion_reasons") or [])
            lines.append(
                f"| {_escape_md_cell(item['channel_title'])} | {title_link} | "
                f"{item['os_loo']:.2f}x | {_format_int(item['view_count'])} | "
                f"{item['like_rate'] * 100:.2f}% | "
                f"{item['channel_typical_like_rate'] * 100:.2f}% | "
                f"{_escape_md_cell(reasons)} |"
            )
        lines.append("")

    # 失敗チャンネル
    failed: list[dict[str, Any]] = payload.get("channels_failed") or []
    if failed:
        lines.append(f"## 取得スキップ・エラーチャンネル（{len(failed)} 件）")
        lines.append("")
        for err in failed:
            lines.append(
                f"- `{err['identifier']}`（{err['name']}）: {_escape_md_cell(err['error'])}"
            )
        lines.append("")

    return "\n".join(lines)


def run_outlier_crawl(
    *,
    seeds_path: Path | None = None,
    categories: Sequence[str] | None = None,
    market: str | None = None,
    limit: int = 20,
    max_videos_per_channel: int = 30,
    min_os_loo: float = 0.0,
    with_comments: bool = False,
    comments_per_video: int = 20,
    include_ad_boost: bool = False,
    dry_run: bool = False,
    refresh: bool = False,
    db_path: str | Path | None = None,
    configs_dir: Path | None = None,
    client: YouTubeDataClient | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """シードチャンネル巡回〜異常値ランキング算出のコア実行関数。"""
    current = (
        datetime.now(timezone.utc)
        if now is None
        else (
            now.replace(tzinfo=timezone.utc)
            if now.tzinfo is None
            else now.astimezone(timezone.utc)
        )
    )
    seeds = load_seed_channels(
        seeds_path=seeds_path,
        categories=categories,
        market=market,
    )
    scoring_cfg = ScoringConfig.from_yaml(configs_dir=configs_dir)
    quota_limits, ttl_days, _shorts_sec = load_quota_settings(configs_dir=configs_dir)

    filter_meta = {
        "categories": list(categories or []),
        "market": market or "",
        "limit": limit,
        "max_videos_per_channel": max_videos_per_channel,
        "min_os_loo": min_os_loo,
        "with_comments": with_comments,
        "include_ad_boost": include_ad_boost,
    }

    if dry_run:
        # 外部通信ゼロで .env / 環境変数の存在のみ安全確認
        key_present = bool(os.environ.get("YOUTUBE_API_KEY", "").strip())
        if not key_present:
            load_dotenv_file(REPO_ROOT / ".env")
            key_present = bool(os.environ.get("YOUTUBE_API_KEY", "").strip())

        return {
            "generated_at": current.isoformat(),
            "dry_run": True,
            "api_key_configured": key_present,
            "ttl_days": ttl_days,
            "quota_limits": quota_limits,
            "quota_estimate": estimate_quota_units(
                len(seeds), with_comments=with_comments, limit=limit
            ),
            "filters": filter_meta,
            "seed_count": len(seeds),
            "seeds": [s.to_dict() for s in seeds],
            "outliers": [],
            "excluded_videos": [],
        }

    owns_client = client is None
    active_client = (
        client
        if client is not None
        else YouTubeDataClient(
            db_path=db_path,
            configs_dir=configs_dir,
            enforce_ttl_on_init=False,
        )
    )

    channels_processed: list[dict[str, Any]] = []
    channels_failed: list[dict[str, Any]] = []
    all_scored: list[ScoredVideo] = []
    quota_halted = False
    quota_halt_reason = ""

    try:
        ttl_deleted = active_client.enforce_ttl(now=current)

        for seed in seeds:
            try:
                ch = active_client.resolve_channel(
                    seed.identifier, use_cache=not refresh, now=current
                )
                videos, used_fallback = active_client.fetch_channel_long_videos(
                    ch.channel_id,
                    max_items=max_videos_per_channel,
                    use_cache=not refresh,
                    now=current,
                )
                scored = evaluate_channel_outliers(
                    ch,
                    videos,
                    market=seed.market,
                    category=seed.category,
                    format_plan=seed.format_plan,
                    config=scoring_cfg,
                    now=current,
                )
                all_scored.extend(scored)
                channels_processed.append(
                    {
                        "name": seed.name,
                        "identifier": seed.identifier,
                        "channel_id": ch.channel_id,
                        "title": ch.title,
                        "subscriber_count": ch.subscriber_count,
                        "long_videos_fetched": len(videos),
                        "videos_scored": len(scored),
                        "used_uu_fallback": used_fallback,
                    }
                )
            except QuotaCircuitOpen as exc:
                quota_halted = True
                quota_halt_reason = redact_url(exc)
                channels_failed.append(
                    {
                        "name": seed.name,
                        "identifier": seed.identifier,
                        "error": quota_halt_reason,
                    }
                )
                break
            except YouTubeApiError as exc:
                channels_failed.append(
                    {
                        "name": seed.name,
                        "identifier": seed.identifier,
                        "error": redact_url(exc),
                    }
                )

        ranked, excluded = rank_outliers(
            all_scored,
            limit=limit,
            min_os_loo=min_os_loo,
            exclude_ad_boost=not include_ad_boost,
        )

        # 任意: 上位異常値動画のコメント収集
        if with_comments and not quota_halted:
            enriched: list[ScoredVideo] = []
            for item in ranked:
                if quota_halted:
                    enriched.append(item)
                    continue
                try:
                    comments = active_client.fetch_video_comments(
                        item.video_id,
                        max_results=comments_per_video,
                        exclude_channel_id=item.channel_id,
                        use_cache=not refresh,
                        now=current,
                    )
                    top_dicts = tuple(c.to_dict() for c in comments[:10])
                    enriched.append(dataclasses.replace(item, top_comments=top_dicts))
                except QuotaCircuitOpen as exc:
                    quota_halted = True
                    quota_halt_reason = redact_url(exc)
                    enriched.append(item)
                except YouTubeApiError:
                    enriched.append(item)
            ranked = enriched

        general_used = active_client.ledger.get_used("general", now=current)
        general_limit = active_client.ledger.limits.get("general", 8500)

        return {
            "generated_at": current.isoformat(),
            "dry_run": False,
            "filters": filter_meta,
            "seed_count": len(seeds),
            "ttl_deleted": ttl_deleted,
            "quota_usage": {
                "general_used": general_used,
                "general_limit": general_limit,
            },
            "quota_halted": quota_halted,
            "quota_halt_reason": quota_halt_reason,
            "channels_processed": channels_processed,
            "channels_failed": channels_failed,
            "outliers": [v.to_dict() for v in ranked],
            "excluded_videos": [v.to_dict() for v in excluded],
        }
    finally:
        if owns_client:
            active_client.close()


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="YouTube Data API v3 異常値（Outlier）発掘クローラ MVP"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="外部API通信を行わず、シード一覧・設定・推定クォータ消費のみ検証して終了する",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="ランキング出力件数（Top N、デフォルト: 20）",
    )
    parser.add_argument(
        "--category",
        action="append",
        default=None,
        help="対象カテゴリフィルタ（カンマ区切りまたは複数指定可）",
    )
    parser.add_argument(
        "--market",
        type=str,
        default=None,
        help="対象市場フィルタ（global_en / jp）",
    )
    parser.add_argument(
        "--with-comments",
        action="store_true",
        help="ランキング上位動画の関連順コメント（commentThreads.list）を追加収集する",
    )
    parser.add_argument(
        "--comments-per-video",
        type=int,
        default=20,
        help="--with-comments 時に1動画あたり取得するコメント件数（デフォルト: 20）",
    )
    parser.add_argument(
        "--out",
        type=str,
        default=None,
        help="レポート出力パス（ベース名 / .md / .json / ディレクトリ指定可）",
    )
    parser.add_argument(
        "--seeds",
        type=str,
        default=None,
        help="シードチャンネル YAML パス上書き（デフォルト: configs/seed_channels.yaml）",
    )
    parser.add_argument(
        "--max-videos-per-channel",
        type=int,
        default=30,
        help="1チャンネルあたりの直近長尺動画取得上限（デフォルト: 30、最大50）",
    )
    parser.add_argument(
        "--min-os-loo",
        type=float,
        default=0.0,
        help="ランキング掲載の最小 OS_LOO 倍率（デフォルト: 0.0）",
    )
    parser.add_argument(
        "--include-ad-boost",
        action="store_true",
        help="広告ブースト疑い動画もランキングから除外せず含める",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="SQLite キャッシュを無視して API から最新データを再取得する",
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=None,
        help="SQLite キャッシュ DB パス上書き",
    )
    return parser


def main(
    argv: Sequence[str] | None = None,
    *,
    client: YouTubeDataClient | None = None,
    now: datetime | None = None,
) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    parser = build_arg_parser()
    args = parser.parse_args(argv)

    current = now or datetime.now(timezone.utc)
    seeds_path = Path(args.seeds) if args.seeds else None

    payload = run_outlier_crawl(
        seeds_path=seeds_path,
        categories=args.category,
        market=args.market,
        limit=max(1, args.limit),
        max_videos_per_channel=max(2, min(50, args.max_videos_per_channel)),
        min_os_loo=args.min_os_loo,
        with_comments=args.with_comments,
        comments_per_video=max(1, min(100, args.comments_per_video)),
        include_ad_boost=args.include_ad_boost,
        dry_run=args.dry_run,
        refresh=args.refresh,
        db_path=args.db_path,
        client=client,
        now=current,
    )

    md_text = render_markdown_report(payload)

    # 通常実行時は常に出力、dry-run時は --out 明示時のみファイル出力
    if not args.dry_run or args.out:
        md_path, json_path = resolve_output_paths(args.out, now=current)
        md_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text(md_text, encoding="utf-8")
        json_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"[Saved MD]   {md_path}")
        print(f"[Saved JSON] {json_path}")

    print(md_text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
