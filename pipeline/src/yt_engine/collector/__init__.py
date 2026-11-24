"""YouTube Data API v3 低クォータ収集クライアントパッケージ。"""

from __future__ import annotations

import logging
from typing import Iterable

from yt_engine.collector.youtube_client import (
    CACHE_TABLES,
    DEFAULT_CACHE_FRESH_HOURS,
    DEFAULT_NON_AUTHORIZED_TTL_DAYS,
    DEFAULT_SHORTS_MAX_DURATION_SEC,
    FORMAT_PLAYLIST_PREFIX,
    YOUTUBE_API_BASE_URL,
    ChannelRecord,
    CommentRecord,
    SafeYouTubeQuotaLedger,
    VideoRecord,
    YouTubeApiError,
    YouTubeCacheStore,
    YouTubeDataClient,
    derive_format_playlist_id,
    load_dotenv_file,
    load_quota_settings,
    normalize_channel_identifier,
    parse_iso8601_duration_seconds,
    resolve_youtube_api_key,
)
from yt_engine.quota import QuotaCircuitOpen, YouTubeQuotaLedger, redact_url

logger = logging.getLogger(__name__)


class YouTubeCollector2026:
    """2026年6月細分化クォータ対応 YouTube Data API v3 コレクター（後方互換ラッパー）。"""

    def __init__(self, api_key: str, ledger: YouTubeQuotaLedger) -> None:
        if not api_key:
            raise ValueError("YOUTUBE_API_KEY must be provided.")
        self.api_key = api_key
        self.ledger = ledger

    def fetch_recent_format_video_ids(
        self,
        channel_id: str,
        fmt: str = "long",
        max_items: int = 50,
    ) -> tuple[list[str], bool]:
        """UULF/UUSH で1ユニット50件取得を試み、404時は UU へフォールバックする。"""
        from googleapiclient.discovery import build
        from googleapiclient.errors import HttpError

        yt = build("youtube", "v3", developerKey=self.api_key)
        target_pl = derive_format_playlist_id(channel_id, fmt)
        try:
            return self._fetch_playlist_ids(yt, target_pl, max_items), False
        except HttpError as exc:
            if exc.resp.status == 404:
                logger.info(
                    "Playlist prefix unavailable for %s; falling back to UU.", channel_id
                )
                return self._fetch_playlist_ids(yt, "UU" + channel_id[2:], max_items), True
            self._handle_http_error(exc, "general")
            raise

    def _fetch_playlist_ids(
        self, yt: object, playlist_id: str, max_items: int
    ) -> list[str]:
        video_ids: list[str] = []
        page_token: str | None = None
        while len(video_ids) < max_items:
            self.ledger.consume("general", 1)
            res = (
                yt.playlistItems()  # type: ignore[attr-defined]
                .list(
                    part="contentDetails",
                    playlistId=playlist_id,
                    maxResults=min(50, max_items - len(video_ids)),
                    pageToken=page_token,
                )
                .execute()
            )
            video_ids.extend(
                item["contentDetails"]["videoId"] for item in res.get("items", [])
            )
            page_token = res.get("nextPageToken")
            if not page_token:
                break
        return video_ids

    def batch_get_stats_vph(
        self, video_ids: Iterable[str], chunk_size: int = 50
    ) -> list[dict]:
        """videos.batchGetStats 専用バケットを使って統計スナップショットを一括取得する。"""
        import httpx

        ids = list(video_ids)
        results: list[dict] = []
        with httpx.Client(timeout=15.0) as client:
            for i in range(0, len(ids), chunk_size):
                batch = ids[i : i + chunk_size]
                self.ledger.consume("batch_stats", 1)
                resp = client.get(
                    "https://www.googleapis.com/youtube/v3/videos:batchGetStats",
                    params={
                        "part": "id,snippet,statistics,contentDetails",
                        "id": ",".join(batch),
                        "key": self.api_key,
                    },
                )
                if resp.status_code == 403 and "quotaExceeded" in resp.text:
                    raise QuotaCircuitOpen(
                        "videos.batchGetStats bucket exhausted; halt until 00:00 PT."
                    )
                resp.raise_for_status()
                results.extend(resp.json().get("items", []))
        return results

    @staticmethod
    def _handle_http_error(exc: Exception, bucket: str) -> None:
        safe_msg = redact_url(exc)
        if "quotaExceeded" in str(exc):
            logger.error("Quota exceeded on %s: %s", bucket, safe_msg)
            raise QuotaCircuitOpen(f"Bucket {bucket} exhausted") from exc
        logger.warning("API error on %s: %s", bucket, safe_msg)


__all__ = [
    "CACHE_TABLES",
    "DEFAULT_CACHE_FRESH_HOURS",
    "DEFAULT_NON_AUTHORIZED_TTL_DAYS",
    "DEFAULT_SHORTS_MAX_DURATION_SEC",
    "FORMAT_PLAYLIST_PREFIX",
    "YOUTUBE_API_BASE_URL",
    "ChannelRecord",
    "CommentRecord",
    "SafeYouTubeQuotaLedger",
    "VideoRecord",
    "YouTubeApiError",
    "YouTubeCacheStore",
    "YouTubeCollector2026",
    "YouTubeDataClient",
    "derive_format_playlist_id",
    "load_dotenv_file",
    "load_quota_settings",
    "normalize_channel_identifier",
    "parse_iso8601_duration_seconds",
    "resolve_youtube_api_key",
]
