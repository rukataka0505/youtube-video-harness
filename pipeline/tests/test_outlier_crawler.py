"""YouTube Data API v3 異常値（Outlier）発掘クローラ MVP の単体テスト。

実 API 呼び出し・実ネットワーク通信・実 .env 読込は一切行わず、
httpx.MockTransport と一時 SQLite DB を使って全ロジックを検証する。
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_SRC = REPO_ROOT / "pipeline" / "src"
PIPELINE_SCRIPTS = REPO_ROOT / "pipeline" / "scripts"
for _p in (str(PIPELINE_SRC), str(PIPELINE_SCRIPTS)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import find_outliers  # noqa: E402
from yt_engine.collector.youtube_client import (  # noqa: E402
    ChannelRecord,
    CommentRecord,
    VideoRecord,
    YouTubeCacheStore,
    YouTubeDataClient,
    derive_format_playlist_id,
    parse_iso8601_duration_seconds,
)
from yt_engine.quota import (  # noqa: E402
    QuotaCircuitOpen,
    YouTubeQuotaLedger,
    enforce_30day_ttl,
    redact_url,
)
from yt_engine.scoring.outlier import (  # noqa: E402
    ScoringConfig,
    compute_loo_outlier_score,
    compute_vpd_norm,
    compute_vsr,
    evaluate_channel_outliers,
    is_ad_boost_suspected,
    rank_outliers,
)


def _make_video_api_item(
    video_id: str,
    channel_id: str,
    *,
    title: str = "Sample Video",
    published_at: str = "2026-10-01T00:00:00Z",
    duration: str = "PT12M30S",
    views: int = 10000,
    likes: int = 400,
    comments: int | None = 50,
    channel_title: str = "Sample Channel",
) -> dict:
    stats: dict[str, str] = {
        "viewCount": str(views),
        "likeCount": str(likes),
    }
    if comments is not None:
        stats["commentCount"] = str(comments)
    return {
        "id": video_id,
        "snippet": {
            "channelId": channel_id,
            "channelTitle": channel_title,
            "title": title,
            "description": "desc",
            "publishedAt": published_at,
            "thumbnails": {"high": {"url": f"https://img.example/{video_id}.jpg"}},
        },
        "contentDetails": {"duration": duration},
        "statistics": stats,
    }


def _make_channel_api_item(
    channel_id: str,
    *,
    handle: str = "@sample",
    title: str = "Sample Channel",
    subscribers: int = 20000,
) -> dict:
    return {
        "id": channel_id,
        "snippet": {
            "title": title,
            "description": "about",
            "customUrl": handle,
            "publishedAt": "2022-01-01T00:00:00Z",
            "country": "US",
        },
        "statistics": {
            "subscriberCount": str(subscribers),
            "hiddenSubscriberCount": False,
            "viewCount": "1000000",
            "videoCount": "40",
        },
        "contentDetails": {
            "relatedPlaylists": {"uploads": "UU" + channel_id[2:]}
        },
    }


class TestPlaylistAndYouTubeClient(unittest.TestCase):
    """UULF変換＆UUフォールバック、50件バッチ、コメント、クォータ、redact_url の検証。"""

    def test_derive_format_playlist_id_and_duration_parser(self) -> None:
        ch_id = "UC1234567890abcdefghij"
        self.assertEqual(
            derive_format_playlist_id(ch_id, "long"), "UULF1234567890abcdefghij"
        )
        self.assertEqual(
            derive_format_playlist_id(ch_id, "shorts"), "UUSH1234567890abcdefghij"
        )
        self.assertEqual(
            derive_format_playlist_id(ch_id, "live"), "UULV1234567890abcdefghij"
        )
        with self.assertRaises(ValueError):
            derive_format_playlist_id("INVALID_ID", "long")
        with self.assertRaises(ValueError):
            derive_format_playlist_id(ch_id, "unknown_fmt")

        self.assertEqual(parse_iso8601_duration_seconds("PT59S"), 59)
        self.assertEqual(parse_iso8601_duration_seconds("PT3M"), 180)
        self.assertEqual(parse_iso8601_duration_seconds("PT3M1S"), 181)
        self.assertEqual(parse_iso8601_duration_seconds("PT1H2M3S"), 3723)
        self.assertEqual(parse_iso8601_duration_seconds("P0D"), 0)

    def test_uulf_primary_success_without_fallback(self) -> None:
        ch_id = "UCaaaaaaaaaaaaaaaaaaaa"
        requested_playlists: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/playlistItems"):
                pl_id = request.url.params["playlistId"]
                requested_playlists.append(pl_id)
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            {"contentDetails": {"videoId": "vid_long_1"}},
                            {"contentDetails": {"videoId": "vid_long_2"}},
                        ]
                    },
                )
            if request.url.path.endswith("/videos"):
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            _make_video_api_item("vid_long_1", ch_id, duration="PT10M"),
                            _make_video_api_item("vid_long_2", ch_id, duration="PT15M"),
                        ]
                    },
                )
            raise AssertionError(f"Unexpected path: {request.url.path}")

        http_client = httpx.Client(transport=httpx.MockTransport(handler))
        with YouTubeDataClient(
            api_key="TEST_SECRET_KEY_123",
            db_path=":memory:",
            http_client=http_client,
        ) as client:
            videos, used_fb = client.fetch_channel_long_videos(ch_id, max_items=10)
            self.assertFalse(used_fb)
            self.assertEqual(requested_playlists, ["UULF" + ch_id[2:]])
            self.assertEqual([v.video_id for v in videos], ["vid_long_1", "vid_long_2"])
            # playlistItems 1 unit + videos.list 1 unit = 2 units
            self.assertEqual(client.ledger.get_used("general"), 2)
        http_client.close()

    def test_uulf_404_falls_back_to_uu_and_filters_shorts_over_180s(self) -> None:
        ch_id = "UCbbbbbbbbbbbbbbbbbbbb"
        requested_playlists: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/playlistItems"):
                pl_id = request.url.params["playlistId"]
                requested_playlists.append(pl_id)
                if pl_id.startswith("UULF"):
                    return httpx.Response(
                        404,
                        json={
                            "error": {
                                "code": 404,
                                "message": "Playlist not found",
                                "errors": [{"reason": "playlistNotFound"}],
                            }
                        },
                    )
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            {"contentDetails": {"videoId": "short_59s"}},
                            {"contentDetails": {"videoId": "short_180s_boundary"}},
                            {"contentDetails": {"videoId": "long_181s"}},
                            {"contentDetails": {"videoId": "long_15m"}},
                        ]
                    },
                )
            if request.url.path.endswith("/videos"):
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            _make_video_api_item("short_59s", ch_id, duration="PT59S"),
                            _make_video_api_item(
                                "short_180s_boundary", ch_id, duration="PT3M"
                            ),
                            _make_video_api_item("long_181s", ch_id, duration="PT3M1S"),
                            _make_video_api_item("long_15m", ch_id, duration="PT15M"),
                        ]
                    },
                )
            raise AssertionError(f"Unexpected path: {request.url.path}")

        http_client = httpx.Client(transport=httpx.MockTransport(handler))
        with YouTubeDataClient(
            api_key="TEST_SECRET_KEY_456",
            db_path=":memory:",
            http_client=http_client,
        ) as client:
            videos, used_fb = client.fetch_channel_long_videos(ch_id, max_items=10)
            self.assertTrue(used_fb)
            self.assertEqual(
                requested_playlists,
                ["UULF" + ch_id[2:], "UU" + ch_id[2:]],
            )
            # 180秒以下（PT59S, PT3M）は除外され、181秒以上のみ残る
            self.assertEqual([v.video_id for v in videos], ["long_181s", "long_15m"])
            # UULF(1) + UU(1) + videos.list(1) = 3 units
            self.assertEqual(client.ledger.get_used("general"), 3)
        http_client.close()

    def test_resolve_handle_cache_and_videos_50_batch_chunking(self) -> None:
        ch_id = "UCcccccccccccccccccccc"
        video_batch_sizes: list[int] = []
        channel_calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal channel_calls
            if request.url.path.endswith("/channels"):
                channel_calls += 1
                self.assertEqual(request.url.params.get("forHandle"), "@easyactually")
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            _make_channel_api_item(
                                ch_id, handle="@easyactually", title="easy, actually"
                            )
                        ]
                    },
                )
            if request.url.path.endswith("/videos"):
                ids = request.url.params["id"].split(",")
                video_batch_sizes.append(len(ids))
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            _make_video_api_item(vid, ch_id, duration="PT10M")
                            for vid in ids
                        ]
                    },
                )
            raise AssertionError(f"Unexpected path: {request.url.path}")

        http_client = httpx.Client(transport=httpx.MockTransport(handler))
        with YouTubeDataClient(
            api_key="TEST_SECRET_KEY_789",
            db_path=":memory:",
            http_client=http_client,
        ) as client:
            ch1 = client.resolve_channel("@easyactually")
            ch2 = client.resolve_channel("@easyactually")  # キャッシュヒット
            self.assertEqual(ch1.channel_id, ch_id)
            self.assertEqual(ch2.channel_id, ch_id)
            self.assertEqual(channel_calls, 1)

            ids_55 = [f"vid_{i:03d}" for i in range(55)]
            fetched = client.fetch_videos_batch(ids_55)
            self.assertEqual(len(fetched), 55)
            self.assertEqual(video_batch_sizes, [50, 5])
            # channels(1) + videos(2 batches) = 3 units
            self.assertEqual(client.ledger.get_used("general"), 3)
        http_client.close()

    def test_quota_exceeded_403_halts_immediately_without_retry_and_redacts_key(self) -> None:
        secret_key = "SUPER_SECRET_YOUTUBE_API_KEY_999"
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(
                403,
                json={
                    "error": {
                        "code": 403,
                        "message": "The request cannot be completed because you have exceeded your quota.",
                        "errors": [{"reason": "quotaExceeded"}],
                    }
                },
            )

        http_client = httpx.Client(transport=httpx.MockTransport(handler))
        with YouTubeDataClient(
            api_key=secret_key,
            db_path=":memory:",
            http_client=http_client,
        ) as client:
            with self.assertRaises(QuotaCircuitOpen) as ctx:
                client.resolve_channel("@easyactually")
            # リトライせず1回で即停止
            self.assertEqual(call_count, 1)
            msg = str(ctx.exception)
            self.assertNotIn(secret_key, msg)
            self.assertIn("key=***REDACTED***", msg)
        http_client.close()

        # redact_url 単体検証
        raw = f"GET https://www.googleapis.com/youtube/v3/videos?id=abc&key={secret_key}&part=snippet failed"
        masked = redact_url(raw)
        self.assertNotIn(secret_key, masked)
        self.assertIn("key=***REDACTED***&part=snippet", masked)

    def test_comments_disabled_403_skips_safely_and_excludes_author(self) -> None:
        ch_id = "UCdddddddddddddddddddd"

        def handler(request: httpx.Request) -> httpx.Response:
            vid = request.url.params["videoId"]
            if vid == "disabled_vid":
                return httpx.Response(
                    403,
                    json={
                        "error": {
                            "code": 403,
                            "message": "The video has disabled comments.",
                            "errors": [{"reason": "commentsDisabled"}],
                        }
                    },
                )
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": "c_owner",
                            "snippet": {
                                "videoId": vid,
                                "totalReplyCount": 10,
                                "topLevelComment": {
                                    "snippet": {
                                        "authorDisplayName": "Owner",
                                        "authorChannelId": {"value": ch_id},
                                        "textOriginal": "固定コメントです",
                                        "likeCount": 500,
                                        "publishedAt": "2026-10-02T00:00:00Z",
                                    }
                                },
                            },
                        },
                        {
                            "id": "c_viewer_1",
                            "snippet": {
                                "videoId": vid,
                                "totalReplyCount": 4,
                                "topLevelComment": {
                                    "snippet": {
                                        "authorDisplayName": "Viewer1",
                                        "authorChannelId": {"value": "UC_viewer_1"},
                                        "textOriginal": "日本版でここをもっと詳しく知りたい",
                                        "likeCount": 120,
                                        "publishedAt": "2026-10-03T00:00:00Z",
                                    }
                                },
                            },
                        },
                    ]
                },
            )

        http_client = httpx.Client(transport=httpx.MockTransport(handler))
        with YouTubeDataClient(
            api_key="TEST_KEY",
            db_path=":memory:",
            http_client=http_client,
        ) as client:
            self.assertEqual(client.fetch_video_comments("disabled_vid"), [])
            comments = client.fetch_video_comments(
                "normal_vid", exclude_channel_id=ch_id
            )
            self.assertEqual(len(comments), 1)
            self.assertEqual(comments[0].comment_id, "c_viewer_1")
            self.assertGreater(comments[0].empathy_weight, 6.0)
        http_client.close()


class TestScoringAndTTL(unittest.TestCase):
    """OS_LOO・VSR・VPD_norm・広告ブースト除外・30日TTL削除の検証。"""

    def test_os_loo_vsr_vpd_norm_and_ad_boost_exclusion(self) -> None:
        now = datetime(2026, 11, 23, 0, 0, 0, tzinfo=timezone.utc)
        channel = ChannelRecord(
            channel_id="UCeeeeeeeeeeeeeeeeeeee",
            handle="@testch",
            title="Test Channel",
            description="",
            published_at="2023-01-01T00:00:00Z",
            subscriber_count=10000,
            hidden_subscriber_count=False,
            view_count=500000,
            video_count=15,
            country="JP",
            uploads_playlist_id="UUeeeeeeeeeeeeeeeeeeee",
            fetched_at=now.isoformat(),
        )

        # 通常動画 8本（各10,000再生・高評価400 = 4.0%）
        videos: list[VideoRecord] = []
        for i in range(8):
            pub = (now - timedelta(days=20 + i * 10)).isoformat()
            videos.append(
                VideoRecord(
                    video_id=f"norm_{i}",
                    channel_id=channel.channel_id,
                    channel_title=channel.title,
                    title=f"Normal Video {i}",
                    description="",
                    published_at=pub,
                    duration_iso="PT12M",
                    duration_seconds=720,
                    view_count=10000,
                    like_count=400,  # 4.0%
                    comment_count=30,
                    comments_disabled=False,
                    thumbnail_url="",
                    is_short=False,
                    fetched_at=now.isoformat(),
                )
            )

        # 本物のブレイクアウト異常値（100,000再生 = 10x、高評価4,500 = 4.5%）
        videos.append(
            VideoRecord(
                video_id="organic_outlier",
                channel_id=channel.channel_id,
                channel_title=channel.title,
                title="Organic Breakout Video",
                description="",
                published_at=(now - timedelta(days=8)).isoformat(),
                duration_iso="PT16M",
                duration_seconds=960,
                view_count=100000,
                like_count=4500,  # 4.5%
                comment_count=300,
                comments_disabled=False,
                thumbnail_url="",
                is_short=False,
                fetched_at=now.isoformat(),
            )
        )

        # 広告ブースト疑い動画（150,000再生 = 15x だが高評価率 0.5% < 4.0%*0.40 = 1.6%）
        videos.append(
            VideoRecord(
                video_id="ad_boost_fake",
                channel_id=channel.channel_id,
                channel_title=channel.title,
                title="Ad Boosted Video",
                description="",
                published_at=(now - timedelta(days=10)).isoformat(),
                duration_iso="PT14M",
                duration_seconds=840,
                view_count=150000,
                like_count=750,  # 0.5% -> 広告ブースト除外対象
                comment_count=10,
                comments_disabled=False,
                thumbnail_url="",
                is_short=False,
                fetched_at=now.isoformat(),
            )
        )

        # 公開24時間以内の新着動画（48hフィルタ対象外）＆Shorts（180s以下）は除外されること
        videos.append(
            VideoRecord(
                video_id="too_fresh_24h",
                channel_id=channel.channel_id,
                channel_title=channel.title,
                title="Too Fresh",
                description="",
                published_at=(now - timedelta(hours=24)).isoformat(),
                duration_iso="PT15M",
                duration_seconds=900,
                view_count=500000,
                like_count=20000,
                comment_count=500,
                comments_disabled=False,
                thumbnail_url="",
                is_short=False,
                fetched_at=now.isoformat(),
            )
        )
        videos.append(
            VideoRecord(
                video_id="short_video",
                channel_id=channel.channel_id,
                channel_title=channel.title,
                title="Short",
                description="",
                published_at=(now - timedelta(days=15)).isoformat(),
                duration_iso="PT50S",
                duration_seconds=50,
                view_count=999999,
                like_count=50000,
                comment_count=100,
                comments_disabled=False,
                thumbnail_url="",
                is_short=True,
                fetched_at=now.isoformat(),
            )
        )

        scored = evaluate_channel_outliers(
            channel, videos, market="jp", category="jp_macro_econ", config=ScoringConfig(), now=now
        )
        by_id = {s.video_id: s for s in scored}

        self.assertNotIn("too_fresh_24h", by_id)
        self.assertNotIn("short_video", by_id)

        # organic_outlier: peers=[10000*8, 150000] -> median=10000 -> OS_LOO=10.0
        org = by_id["organic_outlier"]
        self.assertAlmostEqual(org.os_loo, 10.0, places=3)
        self.assertAlmostEqual(org.vsr, 10.0, places=3)
        # VPD_norm = 100000 / (8 + 2)^1 = 10000.0
        self.assertAlmostEqual(org.vpd_norm, 10000.0, places=1)
        self.assertEqual(org.outlier_tier, "breakout")
        self.assertFalse(org.is_ad_boost)
        self.assertTrue(org.low_sample_confidence)  # peers=9 < 10

        # ad_boost_fake: OS_LOO=15.0 だが相対高評価率崩壊で除外判定
        ad = by_id["ad_boost_fake"]
        self.assertAlmostEqual(ad.os_loo, 15.0, places=3)
        self.assertTrue(ad.is_ad_boost)
        self.assertTrue(ad.excluded)

        ranked, excluded = rank_outliers(scored, limit=5, exclude_ad_boost=True)
        self.assertEqual(ranked[0].video_id, "organic_outlier")
        self.assertNotIn("ad_boost_fake", [r.video_id for r in ranked])
        self.assertEqual([e.video_id for e in excluded], ["ad_boost_fake"])

        # 純関数エッジケース検証（VSR フロア 100、OS_LOO、VPD_norm、広告ブースト境界）
        self.assertAlmostEqual(compute_vsr(5000, subscribers=20, floor=100), 50.0)
        self.assertAlmostEqual(compute_vpd_norm(10000, age_days=8.0, tau_days=2.0, alpha=1.0), 1000.0)
        loo_res = compute_loo_outlier_score(50000, [10000, 10000, 10000, 50000, 200000], target_index=3)
        self.assertAlmostEqual(loo_res.baseline_median, 10000.0)
        self.assertAlmostEqual(loo_res.score, 5.0)
        self.assertTrue(is_ad_boost_suspected(2.0, 5000, 50, 0.04))  # 1.0% < 1.6%
        self.assertFalse(is_ad_boost_suspected(2.0, 5000, 150, 0.04))  # 3.0% >= 1.6%

    def test_enforce_30day_ttl_deletes_records_older_than_29_days(self) -> None:
        now = datetime(2026, 11, 23, 0, 0, 0, tzinfo=timezone.utc)
        stale_ts = (now - timedelta(days=30)).isoformat()
        fresh_ts = (now - timedelta(days=10)).isoformat()

        store = YouTubeCacheStore(db_path=":memory:")
        try:
            store.save_channel(
                ChannelRecord(
                    channel_id="UC_stale",
                    handle="@stale",
                    title="Stale Ch",
                    description="",
                    published_at="",
                    subscriber_count=100,
                    hidden_subscriber_count=False,
                    view_count=1000,
                    video_count=5,
                    country="JP",
                    uploads_playlist_id="UU_stale",
                    fetched_at=stale_ts,
                )
            )
            store.save_channel(
                ChannelRecord(
                    channel_id="UC_fresh",
                    handle="@fresh",
                    title="Fresh Ch",
                    description="",
                    published_at="",
                    subscriber_count=100,
                    hidden_subscriber_count=False,
                    view_count=1000,
                    video_count=5,
                    country="JP",
                    uploads_playlist_id="UU_fresh",
                    fetched_at=fresh_ts,
                )
            )
            store.save_playlist("UULF_stale", "UC_stale", ["v_old"], False, stale_ts)
            store.save_playlist("UULF_fresh", "UC_fresh", ["v_new"], False, fresh_ts)
            store.save_videos(
                [
                    VideoRecord(
                        video_id="v_old",
                        channel_id="UC_stale",
                        channel_title="Stale",
                        title="Old",
                        description="",
                        published_at=stale_ts,
                        duration_iso="PT10M",
                        duration_seconds=600,
                        view_count=1000,
                        like_count=40,
                        comment_count=5,
                        comments_disabled=False,
                        thumbnail_url="",
                        is_short=False,
                        fetched_at=stale_ts,
                    ),
                    VideoRecord(
                        video_id="v_new",
                        channel_id="UC_fresh",
                        channel_title="Fresh",
                        title="New",
                        description="",
                        published_at=fresh_ts,
                        duration_iso="PT10M",
                        duration_seconds=600,
                        view_count=1000,
                        like_count=40,
                        comment_count=5,
                        comments_disabled=False,
                        thumbnail_url="",
                        is_short=False,
                        fetched_at=fresh_ts,
                    ),
                ]
            )
            store.save_comments(
                [
                    CommentRecord(
                        comment_id="cm_old",
                        video_id="v_old",
                        author_display_name="A",
                        author_channel_id="UC_a",
                        text="old",
                        like_count=1,
                        reply_count=0,
                        published_at=stale_ts,
                        empathy_weight=0.69,
                        fetched_at=stale_ts,
                    ),
                    CommentRecord(
                        comment_id="cm_new",
                        video_id="v_new",
                        author_display_name="B",
                        author_channel_id="UC_b",
                        text="new",
                        like_count=5,
                        reply_count=1,
                        published_at=fresh_ts,
                        empathy_weight=2.29,
                        fetched_at=fresh_ts,
                    ),
                ]
            )

            deleted = store.enforce_all_ttl(ttl_days=29, now=now)
            self.assertEqual(
                deleted,
                {
                    "channels_raw": 1,
                    "playlist_cache": 1,
                    "videos_raw": 1,
                    "comments_raw": 1,
                },
            )
            # 新鮮なレコードは残っていること
            self.assertIsNotNone(
                store.get_channel("UC_fresh", max_age_hours=24 * 20, now=now)
            )
            self.assertIsNone(
                store.get_channel("UC_stale", max_age_hours=24 * 40, now=now)
            )
            # quota.enforce_30day_ttl の直接実行でも残存0件削除
            self.assertEqual(enforce_30day_ttl(store.conn, "videos_raw", ttl_days=29, now=now), 0)
        finally:
            store.close()


class TestFindOutliersCLI(unittest.TestCase):
    """seed_channels.yaml 読み込み、CLI --dry-run、モックE2E出力の検証。"""

    def test_seed_channels_yaml_contains_overseas_and_jp_and_supports_channel_id(self) -> None:
        seeds = find_outliers.load_seed_channels()
        names = {s.name for s in seeds}
        self.assertIn("easy, actually", names)
        self.assertIn("The Paint Explainer", names)
        self.assertIn("How Money Works", names)
        markets = {s.market for s in seeds}
        self.assertIn("global_en", markets)
        self.assertIn("jp", markets)

        # channel_id 指定・@handle 指定双方パース可能か一時 YAML で検証
        with tempfile.TemporaryDirectory() as tmpdir:
            custom_yaml = Path(tmpdir) / "seeds.yaml"
            custom_yaml.write_text(
                """
schema_version: 1
channels:
  - name: "By Handle"
    handle: "@samplehandle"
    market: "global_en"
    category: "cat_a"
  - name: "By Channel ID"
    channel_id: "UC99999999999999999999"
    market: "jp"
    category: "cat_b"
""",
                encoding="utf-8",
            )
            parsed = find_outliers.load_seed_channels(seeds_path=custom_yaml)
            self.assertEqual(parsed[0].identifier, "@samplehandle")
            self.assertEqual(parsed[1].identifier, "UC99999999999999999999")

            filtered = find_outliers.load_seed_channels(
                seeds_path=custom_yaml, categories=["cat_b"]
            )
            self.assertEqual(len(filtered), 1)
            self.assertEqual(filtered[0].name, "By Channel ID")

    def test_cli_dry_run_exits_zero_without_network(self) -> None:
        buf = io.StringIO()
        with patch.dict(os.environ, {"YOUTUBE_API_KEY": "DUMMY_DRYRUN_KEY"}, clear=False):
            with redirect_stdout(buf):
                rc = find_outliers.main(["--dry-run", "--limit", "5", "--with-comments"])
        self.assertEqual(rc, 0)
        out = buf.getvalue()
        self.assertIn("Dry-Run", out)
        self.assertIn("easy, actually", out)
        self.assertIn("推定クォータ消費", out)

    def test_cli_dry_run_subprocess_invocation(self) -> None:
        proc = subprocess.run(
            [
                sys.executable,
                str(REPO_ROOT / "pipeline" / "scripts" / "find_outliers.py"),
                "--dry-run",
                "--category",
                "overseas_macro_econ",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr)
        self.assertIn("How Money Works", proc.stdout)

    def test_cli_mock_end_to_end_generates_md_and_json_with_comments(self) -> None:
        now = datetime(2026, 11, 23, 0, 0, 0, tzinfo=timezone.utc)
        ch_id = "UC11111111111111111111"

        def handler(request: httpx.Request) -> httpx.Response:
            path = request.url.path
            if path.endswith("/channels"):
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            _make_channel_api_item(
                                ch_id,
                                handle="@HowMoneyWorks",
                                title="How Money Works",
                                subscribers=50000,
                            )
                        ]
                    },
                )
            if path.endswith("/playlistItems"):
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            {"contentDetails": {"videoId": f"v_{i}"}} for i in range(7)
                        ]
                    },
                )
            if path.endswith("/videos"):
                items = []
                for i in range(5):
                    items.append(
                        _make_video_api_item(
                            f"v_{i}",
                            ch_id,
                            title=f"Baseline Video {i}",
                            published_at=(now - timedelta(days=30 + i * 10)).isoformat(),
                            duration="PT14M",
                            views=20000,
                            likes=800,
                            channel_title="How Money Works",
                        )
                    )
                # v_5: 本物の異常値（200,000再生 = 10x、高評価率 4.5%）
                items.append(
                    _make_video_api_item(
                        "v_5",
                        ch_id,
                        title="Why Everything Got So Expensive",
                        published_at=(now - timedelta(days=10)).isoformat(),
                        duration="PT18M",
                        views=200000,
                        likes=9000,
                        channel_title="How Money Works",
                    )
                )
                # v_6: 広告ブースト疑い（300,000再生 = 15x だが高評価率 0.3%）
                items.append(
                    _make_video_api_item(
                        "v_6",
                        ch_id,
                        title="Suspicious Ad Boost Video",
                        published_at=(now - timedelta(days=12)).isoformat(),
                        duration="PT12M",
                        views=300000,
                        likes=900,
                        channel_title="How Money Works",
                    )
                )
                return httpx.Response(200, json={"items": items})
            if path.endswith("/commentThreads"):
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            {
                                "id": "cmt_1",
                                "snippet": {
                                    "videoId": request.url.params["videoId"],
                                    "totalReplyCount": 3,
                                    "topLevelComment": {
                                        "snippet": {
                                            "authorDisplayName": "EconomistFan",
                                            "authorChannelId": {"value": "UC_fan"},
                                            "textOriginal": "日本の賃金停滞との比較も見てみたい！",
                                            "likeCount": 250,
                                            "publishedAt": (now - timedelta(days=9)).isoformat(),
                                        }
                                    },
                                },
                            }
                        ]
                    },
                )
            raise AssertionError(f"Unexpected path: {path}")

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            seeds_yaml = tmp / "seeds.yaml"
            seeds_yaml.write_text(
                """
schema_version: 1
channels:
  - name: "How Money Works"
    handle: "@HowMoneyWorks"
    market: "global_en"
    category: "overseas_macro_econ"
    format_plan: "plan_e"
""",
                encoding="utf-8",
            )
            out_base = tmp / "report"

            http_client = httpx.Client(transport=httpx.MockTransport(handler))
            with YouTubeDataClient(
                api_key="MOCK_TEST_KEY",
                db_path=tmp / "cache.db",
                http_client=http_client,
            ) as yt_client:
                buf = io.StringIO()
                with redirect_stdout(buf):
                    rc = find_outliers.main(
                        [
                            "--seeds",
                            str(seeds_yaml),
                            "--category",
                            "overseas_macro_econ",
                            "--limit",
                            "3",
                            "--with-comments",
                            "--out",
                            str(out_base),
                        ],
                        client=yt_client,
                        now=now,
                    )
            http_client.close()

            self.assertEqual(rc, 0)
            md_path = tmp / "report.md"
            json_path = tmp / "report.json"
            self.assertTrue(md_path.is_file())
            self.assertTrue(json_path.is_file())

            data = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertFalse(data["dry_run"])
            self.assertEqual(len(data["outliers"]), 3)
            self.assertEqual(data["outliers"][0]["video_id"], "v_5")
            self.assertEqual(data["outliers"][0]["outlier_tier"], "breakout")
            self.assertEqual(len(data["outliers"][0]["top_comments"]), 1)
            self.assertEqual(
                [e["video_id"] for e in data["excluded_videos"]], ["v_6"]
            )

            md_text = md_path.read_text(encoding="utf-8")
            self.assertIn("Why Everything Got So Expensive", md_text)
            self.assertIn("広告ブースト除外", md_text)
            self.assertIn("日本の賃金停滞との比較も見てみたい！", md_text)


if __name__ == "__main__":
    unittest.main()
