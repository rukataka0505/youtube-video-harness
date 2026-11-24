"""異常値スコア（OS_LOO・VSR・VPD_norm・瞬間VPH）および広告ブースト除外ロジック。

設計根拠:
- docs/evergreen/06_outlier_methodology.md
- configs/outlier_thresholds.yaml
"""

from __future__ import annotations

import statistics
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from yt_engine.collector.youtube_client import ChannelRecord, VideoRecord
from yt_engine.config import load_yaml_config


@dataclass(frozen=True)
class OutlierScoreResult:
    """LOO異常値判定の結果コンテナ。"""

    score: float
    baseline_median: float
    sample_count: int
    low_sample_confidence: bool


@dataclass(frozen=True)
class ScoringConfig:
    """configs/outlier_thresholds.yaml に対応するスコアリングパラメータ。"""

    window_size: int = 20
    min_sample_size: int = 5
    low_confidence_threshold: int = 10
    max_age_days: int = 365
    min_post_age_hours: float = 48.0
    subscriber_floor: int = 100
    decay_tau_days: float = 2.0
    decay_alpha: float = 1.0
    shorts_max_duration_sec: int = 180

    # 広告ブースト除外（相対高評価率崩壊フィルタ）
    ad_boost_min_os_loo: float = 1.5
    ad_boost_min_views: int = 1000
    ad_boost_min_relative_like_ratio: float = 0.40

    # 絶対エンゲージメント警告/下限
    like_rate_warn: float = 0.0040
    like_rate_drop: float = 0.0025
    comments_per_1k_warn: float = 0.20
    comments_per_1k_drop: float = 0.10

    # 市場別 OS_LOO ティアしきい値
    market_tiers: Mapping[str, Mapping[str, float]] = field(
        default_factory=lambda: {
            "jp": {"candidate": 3.0, "review": 5.0, "breakout": 10.0},
            "global_en": {"candidate": 3.0, "review": 5.0, "breakout": 10.0},
        }
    )

    @classmethod
    def from_yaml(cls, configs_dir: Path | None = None) -> "ScoringConfig":
        """configs/outlier_thresholds.yaml から設定を読み込む。"""
        try:
            raw = load_yaml_config("outlier_thresholds.yaml", configs_dir=configs_dir)
        except FileNotFoundError:
            return cls()

        baseline = raw.get("baseline", {}) or {}
        ql = raw.get("quota_limits", {}) or {}
        noise = raw.get("noise_filters", {}) or {}
        ad_boost = noise.get("ad_boost", {}) or {}
        eng = noise.get("engagement_floor", {}) or {}
        markets = raw.get("markets", {}) or {}

        tiers: dict[str, dict[str, float]] = {}
        for market_key in ("jp", "global_en"):
            m_cfg = (markets.get(market_key, {}) or {}).get("long_os_loo", {}) or {}
            tiers[market_key] = {
                "candidate": float(m_cfg.get("candidate", 3.0)),
                "review": float(m_cfg.get("review", 5.0)),
                "breakout": float(m_cfg.get("breakout", 10.0)),
            }

        shorts_ms = int(ql.get("shorts_max_duration_ms", 180000))
        return cls(
            window_size=int(baseline.get("window_size", 20)),
            min_sample_size=int(baseline.get("min_sample_size", 5)),
            low_confidence_threshold=int(baseline.get("low_confidence_threshold", 10)),
            max_age_days=int(baseline.get("max_age_days", 365)),
            min_post_age_hours=float(baseline.get("min_post_age_hours", 48.0)),
            subscriber_floor=int(baseline.get("subscriber_floor", 100)),
            decay_tau_days=float(baseline.get("decay_tau_days", 2.0)),
            decay_alpha=float(baseline.get("decay_alpha", 1.0)),
            shorts_max_duration_sec=max(1, shorts_ms // 1000),
            ad_boost_min_os_loo=float(ad_boost.get("min_os_loo", 1.5)),
            ad_boost_min_views=int(ad_boost.get("min_views", 1000)),
            ad_boost_min_relative_like_ratio=float(
                ad_boost.get("min_relative_like_ratio", 0.40)
            ),
            like_rate_warn=float(eng.get("like_rate_warn", 0.0040)),
            like_rate_drop=float(eng.get("like_rate_drop", 0.0025)),
            comments_per_1k_warn=float(eng.get("comments_per_1k_warn", 0.20)),
            comments_per_1k_drop=float(eng.get("comments_per_1k_drop", 0.10)),
            market_tiers=tiers,
        )


@dataclass(frozen=True)
class ScoredVideo:
    """異常値スコアとフィルタ判定を付与した動画評価レコード。"""

    video_id: str
    url: str
    title: str
    channel_id: str
    channel_title: str
    channel_handle: str
    market: str
    category: str
    format_plan: str
    published_at: str
    age_days: float
    duration_seconds: int
    view_count: int
    like_count: int
    comment_count: int
    comments_disabled: bool
    subscriber_count: int
    os_loo: float
    baseline_median: float
    baseline_sample_count: int
    low_sample_confidence: bool
    window_relaxed: bool
    vsr: float
    vpd_norm: float
    like_rate: float
    channel_typical_like_rate: float
    comments_per_1k: float
    outlier_tier: str
    is_ad_boost: bool
    excluded: bool
    exclusion_reasons: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    top_comments: tuple[dict[str, Any], ...] = ()

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["exclusion_reasons"] = list(self.exclusion_reasons)
        data["warnings"] = list(self.warnings)
        data["top_comments"] = list(self.top_comments)
        return data


def compute_loo_outlier_score(
    target_views: int,
    peer_views_including_target: Sequence[int],
    target_index: int | None = None,
    low_confidence_threshold: int = 10,
) -> OutlierScoreResult:
    """対象動画自身を除外した同一フォーマット過去動画の中央値比（OS_LOO）を計算する。

    `target_index` を指定すると該当位置の1要素だけを除外する（同再生数の別動画を誤除外しないため）。
    `target_index` 未指定時は `target_views` と一致する最初の要素1つを除外する。
    """
    if target_views < 0:
        raise ValueError("target_views must be non-negative")

    peers = list(peer_views_including_target)
    if target_index is not None:
        if not (0 <= target_index < len(peers)):
            raise IndexError("target_index out of range")
        del peers[target_index]
    elif target_views in peers:
        peers.remove(target_views)

    if not peers:
        raise ValueError(
            "At least one peer video is required after leave-one-out exclusion."
        )

    median_val = float(statistics.median(peers))
    if median_val <= 0.0:
        score = float(target_views) if target_views > 0 else 0.0
    else:
        score = target_views / median_val

    return OutlierScoreResult(
        score=score,
        baseline_median=median_val,
        sample_count=len(peers),
        low_sample_confidence=len(peers) < low_confidence_threshold,
    )


def compute_vsr(views: int, subscribers: int, floor: int = 100) -> float:
    """登録者数非公開・極小chの発散を下限フロアで抑えた Views-to-Subscriber Ratio を計算する。"""
    if views < 0 or subscribers < 0:
        raise ValueError("views and subscribers must be non-negative")
    return views / float(max(subscribers, floor))


def compute_inst_vph(views_t1: int, views_t2: int, delta_hours: float) -> float:
    """2時点間の瞬間 VPH（Views Per Hour）を計算する。"""
    if delta_hours <= 0.0:
        raise ValueError("delta_hours must be positive")
    return (views_t2 - views_t1) / delta_hours


def compute_vpd_norm(
    views: int, age_days: float, tau_days: float = 2.0, alpha: float = 1.0
) -> float:
    """経過日数減衰を考慮した正規化視聴速度（VPD_norm）を計算する。"""
    if age_days < 0.0:
        raise ValueError("age_days must be non-negative")
    return views / ((age_days + tau_days) ** alpha)


def is_ad_boost_suspected(
    os_loo: float,
    views: int,
    like_count: int,
    channel_typical_like_rate: float,
    min_os_loo: float = 1.5,
    min_views: int = 1000,
    min_relative_ratio: float = 0.40,
) -> bool:
    """高再生倍率にもかかわらず高評価率がチャンネル通常水準から崩壊している動画（広告/購入疑い）を判定する。"""
    if views < min_views or os_loo < min_os_loo or channel_typical_like_rate <= 0.0:
        return False
    video_like_rate = like_count / float(views)
    return video_like_rate < (channel_typical_like_rate * min_relative_ratio)


def compute_typical_like_rate(
    videos: Sequence[VideoRecord],
    exclude_index: int | None = None,
) -> float:
    """同一チャンネル動画群（対象動画自身を除外）の高評価率中央値を返す。"""
    rates: list[float] = []
    for idx, video in enumerate(videos):
        if exclude_index is not None and idx == exclude_index:
            continue
        if video.view_count > 0:
            rates.append(video.like_count / float(video.view_count))
    if not rates:
        return 0.0
    return float(statistics.median(rates))


def classify_outlier_tier(
    os_loo: float,
    market: str = "global_en",
    config: ScoringConfig | None = None,
) -> str:
    """市場別しきい値に従って OS_LOO のティア（breakout/review/candidate/normal）を返す。"""
    cfg = config or ScoringConfig()
    tiers = cfg.market_tiers.get(market) or cfg.market_tiers.get("global_en") or {
        "candidate": 3.0,
        "review": 5.0,
        "breakout": 10.0,
    }
    if os_loo >= float(tiers.get("breakout", 10.0)):
        return "breakout"
    if os_loo >= float(tiers.get("review", 5.0)):
        return "review"
    if os_loo >= float(tiers.get("candidate", 3.0)):
        return "candidate"
    return "normal"


def _parse_iso_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def evaluate_channel_outliers(
    channel: ChannelRecord,
    videos: Sequence[VideoRecord],
    *,
    market: str = "global_en",
    category: str = "",
    format_plan: str = "",
    config: ScoringConfig | None = None,
    now: datetime | None = None,
) -> list[ScoredVideo]:
    """1チャンネルの長尺動画群に対し、OS_LOO・VSR・VPD_norm・広告ブースト判定を一括算出する。"""
    cfg = config or ScoringConfig()
    current = (
        datetime.now(timezone.utc)
        if now is None
        else (
            now.replace(tzinfo=timezone.utc)
            if now.tzinfo is None
            else now.astimezone(timezone.utc)
        )
    )

    # 1. 長尺動画のみ抽出＋公開日パース
    long_items: list[tuple[VideoRecord, datetime, float]] = []
    for video in videos:
        if video.duration_seconds <= cfg.shorts_max_duration_sec:
            continue
        pub_dt = _parse_iso_datetime(video.published_at)
        if pub_dt is None:
            continue
        age_hours = max(0.0, (current - pub_dt).total_seconds() / 3600.0)
        long_items.append((video, pub_dt, age_hours))

    # 公開日降順（新しい順）に整列
    long_items.sort(key=lambda item: item[1], reverse=True)

    # 2. ローリングウィンドウ選定（48h〜max_age_days、不足時は 48h 以上の全取得長尺へ緩和）
    strict_window = [
        item
        for item in long_items
        if cfg.min_post_age_hours <= item[2] <= (cfg.max_age_days * 24.0)
    ][: cfg.window_size]

    window_relaxed = False
    if len(strict_window) >= cfg.min_sample_size:
        window_items = strict_window
    else:
        relaxed_window = [
            item for item in long_items if item[2] >= cfg.min_post_age_hours
        ][: cfg.window_size]
        if len(relaxed_window) > len(strict_window):
            window_items = relaxed_window
            window_relaxed = True
        else:
            window_items = strict_window

    if len(window_items) < 2:
        return []

    window_videos = [item[0] for item in window_items]
    peer_views = [v.view_count for v in window_videos]
    subs = 0 if channel.hidden_subscriber_count else channel.subscriber_count

    scored: list[ScoredVideo] = []
    for idx, (video, _pub_dt, age_hours) in enumerate(window_items):
        age_days = age_hours / 24.0
        loo = compute_loo_outlier_score(
            target_views=video.view_count,
            peer_views_including_target=peer_views,
            target_index=idx,
            low_confidence_threshold=cfg.low_confidence_threshold,
        )
        vsr = compute_vsr(
            views=video.view_count,
            subscribers=subs,
            floor=cfg.subscriber_floor,
        )
        vpd_norm = compute_vpd_norm(
            views=video.view_count,
            age_days=age_days,
            tau_days=cfg.decay_tau_days,
            alpha=cfg.decay_alpha,
        )

        like_rate = (
            (video.like_count / float(video.view_count)) if video.view_count > 0 else 0.0
        )
        typical_like_rate = compute_typical_like_rate(window_videos, exclude_index=idx)
        comments_per_1k = (
            (video.comment_count * 1000.0 / float(video.view_count))
            if video.view_count > 0
            else 0.0
        )

        ad_boost = is_ad_boost_suspected(
            os_loo=loo.score,
            views=video.view_count,
            like_count=video.like_count,
            channel_typical_like_rate=typical_like_rate,
            min_os_loo=cfg.ad_boost_min_os_loo,
            min_views=cfg.ad_boost_min_views,
            min_relative_ratio=cfg.ad_boost_min_relative_like_ratio,
        )

        exclusion_reasons: list[str] = []
        warnings: list[str] = []

        if ad_boost:
            threshold_pct = typical_like_rate * cfg.ad_boost_min_relative_like_ratio * 100.0
            exclusion_reasons.append(
                f"ad_boost_suspected(like_rate={like_rate * 100:.2f}% < "
                f"{cfg.ad_boost_min_relative_like_ratio:.0%} of typical "
                f"{typical_like_rate * 100:.2f}% [{threshold_pct:.2f}%])"
            )

        if video.view_count >= cfg.ad_boost_min_views:
            if like_rate < cfg.like_rate_drop:
                warnings.append(f"very_low_like_rate({like_rate * 100:.2f}%)")
            elif like_rate < cfg.like_rate_warn:
                warnings.append(f"low_like_rate({like_rate * 100:.2f}%)")

            if not video.comments_disabled:
                if comments_per_1k < cfg.comments_per_1k_drop:
                    warnings.append(f"very_low_comments_per_1k({comments_per_1k:.2f})")
                elif comments_per_1k < cfg.comments_per_1k_warn:
                    warnings.append(f"low_comments_per_1k({comments_per_1k:.2f})")

        if loo.low_sample_confidence:
            warnings.append(f"low_sample_confidence(n={loo.sample_count})")
        if window_relaxed:
            warnings.append("window_relaxed_over_max_age")

        tier = classify_outlier_tier(loo.score, market=market, config=cfg)

        scored.append(
            ScoredVideo(
                video_id=video.video_id,
                url=video.url,
                title=video.title,
                channel_id=channel.channel_id,
                channel_title=channel.title or video.channel_title,
                channel_handle=channel.handle,
                market=market,
                category=category,
                format_plan=format_plan,
                published_at=video.published_at,
                age_days=round(age_days, 2),
                duration_seconds=video.duration_seconds,
                view_count=video.view_count,
                like_count=video.like_count,
                comment_count=video.comment_count,
                comments_disabled=video.comments_disabled,
                subscriber_count=subs,
                os_loo=round(loo.score, 4),
                baseline_median=round(loo.baseline_median, 2),
                baseline_sample_count=loo.sample_count,
                low_sample_confidence=loo.low_sample_confidence,
                window_relaxed=window_relaxed,
                vsr=round(vsr, 4),
                vpd_norm=round(vpd_norm, 2),
                like_rate=round(like_rate, 6),
                channel_typical_like_rate=round(typical_like_rate, 6),
                comments_per_1k=round(comments_per_1k, 4),
                outlier_tier=tier,
                is_ad_boost=ad_boost,
                excluded=bool(exclusion_reasons),
                exclusion_reasons=tuple(exclusion_reasons),
                warnings=tuple(warnings),
            )
        )

    return scored


def rank_outliers(
    scored_videos: Sequence[ScoredVideo],
    *,
    limit: int = 20,
    min_os_loo: float = 0.0,
    exclude_ad_boost: bool = True,
) -> tuple[list[ScoredVideo], list[ScoredVideo]]:
    """スコア済み動画を異常値ランキング上位と除外リストへ分離・整列する。"""
    eligible: list[ScoredVideo] = []
    excluded: list[ScoredVideo] = []

    for item in scored_videos:
        if exclude_ad_boost and item.is_ad_boost:
            excluded.append(item)
            continue
        if item.os_loo < min_os_loo:
            continue
        eligible.append(item)

    sort_key = lambda v: (v.os_loo, v.vpd_norm, v.vsr, v.view_count)
    eligible.sort(key=sort_key, reverse=True)
    excluded.sort(key=sort_key, reverse=True)

    return eligible[: max(0, limit)], excluded
