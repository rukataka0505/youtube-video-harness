"""YouTube Data API v3 軽量クライアント・SQLiteキャッシュ・30日TTL管理実装。

設計原則:
- 参照: docs/evergreen/06_outlier_methodology.md / configs/outlier_thresholds.yaml
- UULF 自動プレイリスト優先取得（1 unit/ch）、404時のみ UU フォールバック＋duration > 180s フィルタ
- videos.list 50件バッチ（1 unit/50件）、channels.list（@handle / UC... 解決）、commentThreads.list（任意）
- SQLite キャッシュ保存＋29日基準の enforce_30day_ttl()（YouTube API 30暦日保持規約遵守）
- quota.py 連携（クォータ消費記録、HTTP 403 quotaExceeded はリトライせず即停止、redact_url() で key= マスク）
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import sqlite3
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from yt_engine.config import find_repo_root, load_yaml_config
from yt_engine.quota import (
    DEFAULT_BUCKET_LIMITS,
    QuotaCircuitOpen,
    YouTubeQuotaLedger,
    enforce_30day_ttl,
    redact_url,
)

logger = logging.getLogger(__name__)

YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3"

FORMAT_PLAYLIST_PREFIX: dict[str, str] = {
    "long": "UULF",
    "shorts": "UUSH",
    "live": "UULV",
    "all": "UU",
}

DEFAULT_SHORTS_MAX_DURATION_SEC = 180
DEFAULT_NON_AUTHORIZED_TTL_DAYS = 29
DEFAULT_CACHE_FRESH_HOURS = 24.0

ISO8601_DURATION_RE = re.compile(
    r"^P(?:(?P<days>\d+)D)?(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$"
)

QUOTA_ERROR_REASONS = frozenset(
    {
        "quotaExceeded",
        "dailyLimitExceeded",
        "dailyLimitExceededUnreg",
        "quotaExceeded402",
    }
)

CACHE_TABLES: tuple[str, ...] = (
    "channels_raw",
    "playlist_cache",
    "videos_raw",
    "comments_raw",
)


class YouTubeApiError(RuntimeError):
    """YouTube Data API v3 呼び出し失敗時に送出される例外（APIキーは必ずマスク済み）。"""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        reason: str | None = None,
    ) -> None:
        super().__init__(redact_url(message))
        self.status_code = status_code
        self.reason = reason


@dataclass(frozen=True)
class ChannelRecord:
    """正規化済み YouTube チャンネル情報。"""

    channel_id: str
    handle: str
    title: str
    description: str
    published_at: str
    subscriber_count: int
    hidden_subscriber_count: bool
    view_count: int
    video_count: int
    country: str
    uploads_playlist_id: str
    fetched_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class VideoRecord:
    """正規化済み YouTube 動画メタデータ＆統計情報。"""

    video_id: str
    channel_id: str
    channel_title: str
    title: str
    description: str
    published_at: str
    duration_iso: str
    duration_seconds: int
    view_count: int
    like_count: int
    comment_count: int
    comments_disabled: bool
    thumbnail_url: str
    is_short: bool
    fetched_at: str

    @property
    def url(self) -> str:
        return f"https://www.youtube.com/watch?v={self.video_id}"

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["url"] = self.url
        return data


@dataclass(frozen=True)
class CommentRecord:
    """正規化済み YouTube コメントスレッド（トップレベルコメント）。"""

    comment_id: str
    video_id: str
    author_display_name: str
    author_channel_id: str
    text: str
    like_count: int
    reply_count: int
    published_at: str
    empathy_weight: float
    fetched_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def derive_format_playlist_id(channel_id: str, fmt: str = "long") -> str:
    """UC... 形式のチャンネルIDからフォーマット専用自動生成プレイリストIDを導出する。"""
    cleaned = channel_id.strip()
    if not cleaned.startswith("UC") or len(cleaned) < 4:
        raise ValueError(f"Expected channel ID starting with 'UC', got: {channel_id}")
    if fmt not in FORMAT_PLAYLIST_PREFIX:
        raise ValueError(
            f"Unsupported format '{fmt}'. Expected one of {tuple(FORMAT_PLAYLIST_PREFIX)}"
        )
    return FORMAT_PLAYLIST_PREFIX[fmt] + cleaned[2:]


def parse_iso8601_duration_seconds(duration: str | None) -> int:
    """YouTube API contentDetails.duration（ISO-8601）を秒数へ変換する。"""
    if not duration:
        return 0
    match = ISO8601_DURATION_RE.match(duration.strip().upper())
    if not match:
        return 0
    days = int(match.group("days") or 0)
    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or 0)
    seconds = int(match.group("seconds") or 0)
    return days * 86400 + hours * 3600 + minutes * 60 + seconds


def normalize_channel_identifier(identifier: str) -> tuple[str, str]:
    """チャンネル識別子（UC... / @handle / YouTube URL）を ('id'|'handle', 正規化値) へ正規化する。"""
    raw = identifier.strip()
    if not raw:
        raise ValueError("Channel identifier must not be empty.")

    # URL 形式への簡易対応
    if "youtube.com/" in raw:
        path = raw.split("youtube.com/", 1)[1].split("?", 1)[0].strip("/")
        if path.startswith("channel/"):
            raw = path.split("/", 2)[1]
        elif path.startswith("@"):
            raw = path.split("/", 1)[0]

    if raw.startswith("UC") and not raw.startswith("@") and "/" not in raw:
        return ("id", raw)

    handle = raw if raw.startswith("@") else f"@{raw}"
    return ("handle", handle)


def load_dotenv_file(env_path: Path) -> None:
    """標準ライブラリのみで .env を os.environ へ読み込む（既存環境変数は上書きしない）。"""
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and val and key not in os.environ:
            os.environ[key] = val


def resolve_youtube_api_key(
    api_key: str | None = None,
    repo_root: Path | None = None,
) -> str:
    """YOUTUBE_API_KEY を解決する。明示キー指定時は .env を読み込まない。"""
    if api_key is not None and api_key.strip():
        return api_key.strip()

    env_val = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if env_val:
        return env_val

    try:
        root = repo_root or find_repo_root()
        load_dotenv_file(root / ".env")
    except FileNotFoundError:
        pass

    env_val = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not env_val:
        raise ValueError(
            "YOUTUBE_API_KEY is missing in environment variables or .env file."
        )
    return env_val


def load_quota_settings(
    configs_dir: Path | None = None,
) -> tuple[dict[str, int], int, int]:
    """configs/outlier_thresholds.yaml からクォータ上限・TTL日数・Shorts上限秒を読み込む。"""
    try:
        cfg = load_yaml_config("outlier_thresholds.yaml", configs_dir=configs_dir)
    except FileNotFoundError:
        return (
            dict(DEFAULT_BUCKET_LIMITS),
            DEFAULT_NON_AUTHORIZED_TTL_DAYS,
            DEFAULT_SHORTS_MAX_DURATION_SEC,
        )

    ql = cfg.get("quota_limits", {})
    limits = {
        "search": int(ql.get("search", DEFAULT_BUCKET_LIMITS["search"])),
        "batch_stats": int(ql.get("batch_stats", DEFAULT_BUCKET_LIMITS["batch_stats"])),
        "general": int(ql.get("general", DEFAULT_BUCKET_LIMITS["general"])),
    }
    ttl_days = int(
        cfg.get("compliance", {}).get(
            "non_authorized_ttl_days", DEFAULT_NON_AUTHORIZED_TTL_DAYS
        )
    )
    shorts_ms = int(
        ql.get("shorts_max_duration_ms", DEFAULT_SHORTS_MAX_DURATION_SEC * 1000)
    )
    shorts_sec = max(1, shorts_ms // 1000)
    return limits, ttl_days, shorts_sec


def _utc_now(now: datetime | None = None) -> datetime:
    if now is None:
        return datetime.now(timezone.utc)
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc)
    return now.astimezone(timezone.utc)


def _us_pacific_utc_offset(current_utc: datetime) -> timedelta:
    """米国現行DST規則（3月第2日曜 02:00 PST〜11月第1日曜 02:00 PDT）に基づくPTオフセット。"""
    year = current_utc.year
    march_1 = datetime(year, 3, 1, tzinfo=timezone.utc)
    march_second_sunday = 1 + (6 - march_1.weekday()) % 7 + 7
    dst_start_utc = datetime(year, 3, march_second_sunday, 10, 0, tzinfo=timezone.utc)

    nov_1 = datetime(year, 11, 1, tzinfo=timezone.utc)
    nov_first_sunday = 1 + (6 - nov_1.weekday()) % 7
    dst_end_utc = datetime(year, 11, nov_first_sunday, 9, 0, tzinfo=timezone.utc)

    if dst_start_utc <= current_utc < dst_end_utc:
        return timedelta(hours=-7)
    return timedelta(hours=-8)


class SafeYouTubeQuotaLedger(YouTubeQuotaLedger):
    """Windows 等で tzdata 未導入時でも America/Los_Angeles (PST/PDT) を解決できるクォータ台帳。"""

    @staticmethod
    def _pt_today(now: datetime | None = None) -> str:
        current = _utc_now(now)
        try:
            return current.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d")
        except ZoneInfoNotFoundError:
            return current.astimezone(timezone(_us_pacific_utc_offset(current))).strftime("%Y-%m-%d")


def _is_fresh(fetched_at_iso: str, max_age_hours: float, now: datetime) -> bool:
    if max_age_hours <= 0:
        return False
    try:
        fetched = datetime.fromisoformat(fetched_at_iso.replace("Z", "+00:00"))
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    return (now - fetched) <= timedelta(hours=max_age_hours)


def _extract_google_error_reason(resp: httpx.Response) -> tuple[str | None, str]:
    """YouTube Data API の JSON エラーボディから reason とメッセージを抽出する。"""
    reason: str | None = None
    message = ""
    try:
        payload = resp.json()
        err = payload.get("error", {}) if isinstance(payload, dict) else {}
        message = str(err.get("message") or "")
        errors = err.get("errors")
        if isinstance(errors, list) and errors:
            first = errors[0]
            if isinstance(first, dict) and first.get("reason"):
                reason = str(first["reason"])
    except Exception:
        message = resp.text[:500]
    return reason, redact_url(message)


def _parse_channel_item(item: dict[str, Any], fetched_at: str) -> ChannelRecord:
    snippet = item.get("snippet", {}) or {}
    stats = item.get("statistics", {}) or {}
    content = item.get("contentDetails", {}) or {}
    related = content.get("relatedPlaylists", {}) or {}
    channel_id = str(item.get("id", ""))
    custom_url = str(snippet.get("customUrl") or "")
    if custom_url and not custom_url.startswith("@"):
        custom_url = f"@{custom_url}"
    uploads_pl = str(related.get("uploads") or "")
    if not uploads_pl and channel_id.startswith("UC"):
        uploads_pl = "UU" + channel_id[2:]

    return ChannelRecord(
        channel_id=channel_id,
        handle=custom_url,
        title=str(snippet.get("title") or ""),
        description=str(snippet.get("description") or ""),
        published_at=str(snippet.get("publishedAt") or ""),
        subscriber_count=int(stats.get("subscriberCount") or 0),
        hidden_subscriber_count=bool(stats.get("hiddenSubscriberCount", False)),
        view_count=int(stats.get("viewCount") or 0),
        video_count=int(stats.get("videoCount") or 0),
        country=str(snippet.get("country") or ""),
        uploads_playlist_id=uploads_pl,
        fetched_at=fetched_at,
    )


def _parse_video_item(
    item: dict[str, Any],
    fetched_at: str,
    shorts_max_duration_sec: int = DEFAULT_SHORTS_MAX_DURATION_SEC,
) -> VideoRecord:
    snippet = item.get("snippet", {}) or {}
    stats = item.get("statistics", {}) or {}
    content = item.get("contentDetails", {}) or {}
    thumbs = snippet.get("thumbnails", {}) or {}
    thumb_url = ""
    for key in ("maxres", "standard", "high", "medium", "default"):
        if key in thumbs and isinstance(thumbs[key], dict) and thumbs[key].get("url"):
            thumb_url = str(thumbs[key]["url"])
            break

    duration_iso = str(content.get("duration") or "")
    duration_sec = parse_iso8601_duration_seconds(duration_iso)
    comments_disabled = "commentCount" not in stats

    return VideoRecord(
        video_id=str(item.get("id", "")),
        channel_id=str(snippet.get("channelId") or ""),
        channel_title=str(snippet.get("channelTitle") or ""),
        title=str(snippet.get("title") or ""),
        description=str(snippet.get("description") or ""),
        published_at=str(snippet.get("publishedAt") or ""),
        duration_iso=duration_iso,
        duration_seconds=duration_sec,
        view_count=int(stats.get("viewCount") or 0),
        like_count=int(stats.get("likeCount") or 0),
        comment_count=int(stats.get("commentCount") or 0),
        comments_disabled=comments_disabled,
        thumbnail_url=thumb_url,
        is_short=(0 < duration_sec <= shorts_max_duration_sec),
        fetched_at=fetched_at,
    )


def _parse_comment_item(
    item: dict[str, Any],
    video_id: str,
    fetched_at: str,
) -> CommentRecord:
    snippet = item.get("snippet", {}) or {}
    top = snippet.get("topLevelComment", {}) or {}
    top_snippet = top.get("snippet", {}) or {}
    author_ch = top_snippet.get("authorChannelId", {}) or {}
    like_count = int(top_snippet.get("likeCount") or 0)
    reply_count = int(snippet.get("totalReplyCount") or 0)
    empathy = math.log1p(max(0, like_count)) + 0.5 * max(0, reply_count)

    return CommentRecord(
        comment_id=str(item.get("id") or top.get("id") or ""),
        video_id=str(snippet.get("videoId") or video_id),
        author_display_name=str(top_snippet.get("authorDisplayName") or ""),
        author_channel_id=str(author_ch.get("value") or ""),
        text=str(top_snippet.get("textOriginal") or top_snippet.get("textDisplay") or ""),
        like_count=like_count,
        reply_count=reply_count,
        published_at=str(top_snippet.get("publishedAt") or ""),
        empathy_weight=round(empathy, 4),
        fetched_at=fetched_at,
    )


class YouTubeCacheStore:
    """YouTube Data API レスポンスの SQLite キャッシュ＆29日基準TTL管理ストア。"""

    def __init__(
        self,
        db_path: str | Path | None = None,
        conn: sqlite3.Connection | None = None,
    ) -> None:
        self._owns_conn = conn is None
        if conn is not None:
            self.conn = conn
            self.db_path: Path | None = None
        else:
            if db_path is None:
                env_db = os.environ.get("YT_ENGINE_DB_PATH", "").strip()
                if env_db:
                    resolved = Path(env_db)
                    if not resolved.is_absolute():
                        try:
                            resolved = find_repo_root() / resolved
                        except FileNotFoundError:
                            pass
                else:
                    try:
                        resolved = find_repo_root() / "pipeline" / "data" / "pipeline.db"
                    except FileNotFoundError:
                        resolved = Path("pipeline/data/pipeline.db")
                db_path = resolved

            if str(db_path) == ":memory:":
                self.db_path = None
                self.conn = sqlite3.connect(":memory:")
            else:
                path_obj = Path(db_path)
                path_obj.parent.mkdir(parents=True, exist_ok=True)
                self.db_path = path_obj
                self.conn = sqlite3.connect(str(path_obj))

        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS channels_raw (
                channel_id TEXT PRIMARY KEY,
                handle TEXT NOT NULL DEFAULT '',
                handle_lower TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                subscriber_count INTEGER NOT NULL DEFAULT 0,
                view_count INTEGER NOT NULL DEFAULT 0,
                video_count INTEGER NOT NULL DEFAULT 0,
                published_at TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL,
                fetched_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_channels_handle_lower ON channels_raw(handle_lower);
            CREATE INDEX IF NOT EXISTS idx_channels_fetched_at ON channels_raw(fetched_at);

            CREATE TABLE IF NOT EXISTS playlist_cache (
                playlist_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                video_ids_json TEXT NOT NULL,
                used_fallback INTEGER NOT NULL DEFAULT 0,
                fetched_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_playlist_fetched_at ON playlist_cache(fetched_at);

            CREATE TABLE IF NOT EXISTS videos_raw (
                video_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                published_at TEXT NOT NULL DEFAULT '',
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                view_count INTEGER NOT NULL DEFAULT 0,
                like_count INTEGER NOT NULL DEFAULT 0,
                comment_count INTEGER NOT NULL DEFAULT 0,
                payload_json TEXT NOT NULL,
                fetched_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_videos_channel_id ON videos_raw(channel_id);
            CREATE INDEX IF NOT EXISTS idx_videos_fetched_at ON videos_raw(fetched_at);

            CREATE TABLE IF NOT EXISTS comments_raw (
                comment_id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                author_channel_id TEXT NOT NULL DEFAULT '',
                like_count INTEGER NOT NULL DEFAULT 0,
                reply_count INTEGER NOT NULL DEFAULT 0,
                published_at TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL,
                fetched_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments_raw(video_id);
            CREATE INDEX IF NOT EXISTS idx_comments_fetched_at ON comments_raw(fetched_at);
            """
        )
        self.conn.commit()

    def close(self) -> None:
        if self._owns_conn:
            self.conn.close()

    def enforce_all_ttl(
        self,
        ttl_days: int = DEFAULT_NON_AUTHORIZED_TTL_DAYS,
        now: datetime | None = None,
    ) -> dict[str, int]:
        """全キャッシュテーブルに対して29日基準の30暦日TTL削除を実行する。"""
        current = _utc_now(now)
        deleted: dict[str, int] = {}
        for table in CACHE_TABLES:
            deleted[table] = enforce_30day_ttl(
                self.conn,
                table_name=table,
                timestamp_column="fetched_at",
                ttl_days=ttl_days,
                now=current,
            )
        return deleted

    def save_channel(
        self,
        record: ChannelRecord,
        raw_item: dict[str, Any] | None = None,
        requested_handle: str | None = None,
    ) -> None:
        handle = record.handle or (requested_handle or "")
        if handle and not handle.startswith("@"):
            handle = f"@{handle}"
        payload = json.dumps(raw_item or record.to_dict(), ensure_ascii=False)
        self.conn.execute(
            """
            INSERT INTO channels_raw (
                channel_id, handle, handle_lower, title, subscriber_count,
                view_count, video_count, published_at, payload_json, fetched_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(channel_id) DO UPDATE SET
                handle = excluded.handle,
                handle_lower = excluded.handle_lower,
                title = excluded.title,
                subscriber_count = excluded.subscriber_count,
                view_count = excluded.view_count,
                video_count = excluded.video_count,
                published_at = excluded.published_at,
                payload_json = excluded.payload_json,
                fetched_at = excluded.fetched_at
            """,
            (
                record.channel_id,
                handle,
                handle.lower(),
                record.title,
                record.subscriber_count,
                record.view_count,
                record.video_count,
                record.published_at,
                payload,
                record.fetched_at,
            ),
        )
        self.conn.commit()

    def get_channel(
        self,
        identifier: str,
        max_age_hours: float = DEFAULT_CACHE_FRESH_HOURS,
        now: datetime | None = None,
    ) -> ChannelRecord | None:
        kind, value = normalize_channel_identifier(identifier)
        if kind == "id":
            row = self.conn.execute(
                "SELECT payload_json, fetched_at FROM channels_raw WHERE channel_id = ?",
                (value,),
            ).fetchone()
        else:
            row = self.conn.execute(
                "SELECT payload_json, fetched_at FROM channels_raw WHERE handle_lower = ?",
                (value.lower(),),
            ).fetchone()

        if not row:
            return None
        current = _utc_now(now)
        if not _is_fresh(str(row["fetched_at"]), max_age_hours, current):
            return None
        payload = json.loads(row["payload_json"])
        if "snippet" in payload:
            return _parse_channel_item(payload, str(row["fetched_at"]))
        return ChannelRecord(
            channel_id=str(payload["channel_id"]),
            handle=str(payload.get("handle", "")),
            title=str(payload.get("title", "")),
            description=str(payload.get("description", "")),
            published_at=str(payload.get("published_at", "")),
            subscriber_count=int(payload.get("subscriber_count", 0)),
            hidden_subscriber_count=bool(payload.get("hidden_subscriber_count", False)),
            view_count=int(payload.get("view_count", 0)),
            video_count=int(payload.get("video_count", 0)),
            country=str(payload.get("country", "")),
            uploads_playlist_id=str(payload.get("uploads_playlist_id", "")),
            fetched_at=str(row["fetched_at"]),
        )

    def save_playlist(
        self,
        playlist_id: str,
        channel_id: str,
        video_ids: Sequence[str],
        used_fallback: bool,
        fetched_at: str,
    ) -> None:
        self.conn.execute(
            """
            INSERT INTO playlist_cache (
                playlist_id, channel_id, video_ids_json, used_fallback, fetched_at
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(playlist_id) DO UPDATE SET
                channel_id = excluded.channel_id,
                video_ids_json = excluded.video_ids_json,
                used_fallback = excluded.used_fallback,
                fetched_at = excluded.fetched_at
            """,
            (
                playlist_id,
                channel_id,
                json.dumps(list(video_ids), ensure_ascii=False),
                int(used_fallback),
                fetched_at,
            ),
        )
        self.conn.commit()

    def get_playlist(
        self,
        playlist_id: str,
        max_age_hours: float = DEFAULT_CACHE_FRESH_HOURS,
        now: datetime | None = None,
    ) -> tuple[list[str], bool] | None:
        row = self.conn.execute(
            "SELECT video_ids_json, used_fallback, fetched_at FROM playlist_cache WHERE playlist_id = ?",
            (playlist_id,),
        ).fetchone()
        if not row:
            return None
        if not _is_fresh(str(row["fetched_at"]), max_age_hours, _utc_now(now)):
            return None
        return (list(json.loads(row["video_ids_json"])), bool(row["used_fallback"]))

    def save_videos(
        self,
        records: Sequence[VideoRecord],
        raw_items_by_id: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        raw_map = raw_items_by_id or {}
        rows = []
        for rec in records:
            payload = json.dumps(raw_map.get(rec.video_id) or rec.to_dict(), ensure_ascii=False)
            rows.append(
                (
                    rec.video_id,
                    rec.channel_id,
                    rec.title,
                    rec.published_at,
                    rec.duration_seconds,
                    rec.view_count,
                    rec.like_count,
                    rec.comment_count,
                    payload,
                    rec.fetched_at,
                )
            )
        self.conn.executemany(
            """
            INSERT INTO videos_raw (
                video_id, channel_id, title, published_at, duration_seconds,
                view_count, like_count, comment_count, payload_json, fetched_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(video_id) DO UPDATE SET
                channel_id = excluded.channel_id,
                title = excluded.title,
                published_at = excluded.published_at,
                duration_seconds = excluded.duration_seconds,
                view_count = excluded.view_count,
                like_count = excluded.like_count,
                comment_count = excluded.comment_count,
                payload_json = excluded.payload_json,
                fetched_at = excluded.fetched_at
            """,
            rows,
        )
        self.conn.commit()

    def get_videos(
        self,
        video_ids: Sequence[str],
        max_age_hours: float = DEFAULT_CACHE_FRESH_HOURS,
        shorts_max_duration_sec: int = DEFAULT_SHORTS_MAX_DURATION_SEC,
        now: datetime | None = None,
    ) -> dict[str, VideoRecord]:
        if not video_ids:
            return {}
        placeholders = ",".join("?" for _ in video_ids)
        rows = self.conn.execute(
            f"SELECT video_id, payload_json, fetched_at FROM videos_raw WHERE video_id IN ({placeholders})",
            tuple(video_ids),
        ).fetchall()
        current = _utc_now(now)
        found: dict[str, VideoRecord] = {}
        for row in rows:
            fetched_at = str(row["fetched_at"])
            if not _is_fresh(fetched_at, max_age_hours, current):
                continue
            payload = json.loads(row["payload_json"])
            if "snippet" in payload:
                rec = _parse_video_item(
                    payload,
                    fetched_at=fetched_at,
                    shorts_max_duration_sec=shorts_max_duration_sec,
                )
            else:
                duration_sec = int(payload.get("duration_seconds", 0))
                rec = VideoRecord(
                    video_id=str(payload["video_id"]),
                    channel_id=str(payload.get("channel_id", "")),
                    channel_title=str(payload.get("channel_title", "")),
                    title=str(payload.get("title", "")),
                    description=str(payload.get("description", "")),
                    published_at=str(payload.get("published_at", "")),
                    duration_iso=str(payload.get("duration_iso", "")),
                    duration_seconds=duration_sec,
                    view_count=int(payload.get("view_count", 0)),
                    like_count=int(payload.get("like_count", 0)),
                    comment_count=int(payload.get("comment_count", 0)),
                    comments_disabled=bool(payload.get("comments_disabled", False)),
                    thumbnail_url=str(payload.get("thumbnail_url", "")),
                    is_short=(0 < duration_sec <= shorts_max_duration_sec),
                    fetched_at=fetched_at,
                )
            found[rec.video_id] = rec
        return found

    def save_comments(
        self,
        comments: Sequence[CommentRecord],
        raw_items_by_id: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        if not comments:
            return
        raw_map = raw_items_by_id or {}
        rows = []
        for rec in comments:
            payload = json.dumps(raw_map.get(rec.comment_id) or rec.to_dict(), ensure_ascii=False)
            rows.append(
                (
                    rec.comment_id,
                    rec.video_id,
                    rec.author_channel_id,
                    rec.like_count,
                    rec.reply_count,
                    rec.published_at,
                    payload,
                    rec.fetched_at,
                )
            )
        self.conn.executemany(
            """
            INSERT INTO comments_raw (
                comment_id, video_id, author_channel_id, like_count,
                reply_count, published_at, payload_json, fetched_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(comment_id) DO UPDATE SET
                video_id = excluded.video_id,
                author_channel_id = excluded.author_channel_id,
                like_count = excluded.like_count,
                reply_count = excluded.reply_count,
                published_at = excluded.published_at,
                payload_json = excluded.payload_json,
                fetched_at = excluded.fetched_at
            """,
            rows,
        )
        self.conn.commit()

    def get_comments(
        self,
        video_id: str,
        max_age_hours: float = DEFAULT_CACHE_FRESH_HOURS,
        now: datetime | None = None,
    ) -> list[CommentRecord] | None:
        rows = self.conn.execute(
            """
            SELECT payload_json, fetched_at FROM comments_raw
            WHERE video_id = ?
            ORDER BY like_count DESC
            """,
            (video_id,),
        ).fetchall()
        if not rows:
            return None
        current = _utc_now(now)
        results: list[CommentRecord] = []
        for row in rows:
            fetched_at = str(row["fetched_at"])
            if not _is_fresh(fetched_at, max_age_hours, current):
                return None
            payload = json.loads(row["payload_json"])
            if "snippet" in payload:
                results.append(_parse_comment_item(payload, video_id, fetched_at))
            else:
                results.append(
                    CommentRecord(
                        comment_id=str(payload["comment_id"]),
                        video_id=str(payload.get("video_id", video_id)),
                        author_display_name=str(payload.get("author_display_name", "")),
                        author_channel_id=str(payload.get("author_channel_id", "")),
                        text=str(payload.get("text", "")),
                        like_count=int(payload.get("like_count", 0)),
                        reply_count=int(payload.get("reply_count", 0)),
                        published_at=str(payload.get("published_at", "")),
                        empathy_weight=float(payload.get("empathy_weight", 0.0)),
                        fetched_at=fetched_at,
                    )
                )
        return results


class YouTubeDataClient:
    """YouTube Data API v3 軽量クライアント（UULF優先・50件バッチ・SQLiteキャッシュ・TTL・クォータ保護）。"""

    def __init__(
        self,
        api_key: str | None = None,
        cache: YouTubeCacheStore | None = None,
        ledger: YouTubeQuotaLedger | None = None,
        http_client: httpx.Client | None = None,
        db_path: str | Path | None = None,
        configs_dir: Path | None = None,
        cache_fresh_hours: float = DEFAULT_CACHE_FRESH_HOURS,
        timeout_sec: float = 20.0,
        enforce_ttl_on_init: bool = True,
    ) -> None:
        self.api_key = resolve_youtube_api_key(api_key=api_key)
        limits, ttl_days, shorts_sec = load_quota_settings(configs_dir=configs_dir)
        self.ttl_days = ttl_days
        self.shorts_max_duration_sec = shorts_sec
        self.cache_fresh_hours = cache_fresh_hours

        self._owns_cache = cache is None
        self.cache = cache if cache is not None else YouTubeCacheStore(db_path=db_path)
        self.ledger = (
            ledger
            if ledger is not None
            else SafeYouTubeQuotaLedger(self.cache.conn, limits=limits)
        )
        self._owns_http = http_client is None
        self.http_client = (
            http_client
            if http_client is not None
            else httpx.Client(timeout=timeout_sec)
        )
        self.last_ttl_deleted: dict[str, int] = {}
        if enforce_ttl_on_init:
            self.last_ttl_deleted = self.enforce_ttl()

    def __enter__(self) -> "YouTubeDataClient":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.close()

    def close(self) -> None:
        if self._owns_http:
            self.http_client.close()
        if self._owns_cache:
            self.cache.close()

    def enforce_ttl(self, now: datetime | None = None) -> dict[str, int]:
        """29日基準の30暦日TTL削除を全キャッシュテーブルへ適用する。"""
        deleted = self.cache.enforce_all_ttl(ttl_days=self.ttl_days, now=now)
        self.last_ttl_deleted = deleted
        return deleted

    def _get(
        self,
        endpoint: str,
        params: dict[str, Any],
        bucket: str = "general",
        units: int = 1,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        """クォータ消費を記録して GET リクエストを実行する。403 quotaExceeded は即停止。"""
        self.ledger.consume(bucket, units=units, now=now)
        url = f"{YOUTUBE_API_BASE_URL}/{endpoint.lstrip('/')}"
        req_params = {k: v for k, v in params.items() if v is not None}
        req_params["key"] = self.api_key

        try:
            resp = self.http_client.get(url, params=req_params)
        except httpx.HTTPError as exc:
            safe_err = redact_url(exc)
            logger.error("HTTP transport error on %s: %s", endpoint, safe_err)
            raise YouTubeApiError(
                f"HTTP transport error on {endpoint}: {safe_err}"
            ) from exc

        if resp.status_code >= 400:
            reason, message = _extract_google_error_reason(resp)
            safe_url = redact_url(resp.request.url if resp.request else url)
            if resp.status_code == 403 and (
                reason in QUOTA_ERROR_REASONS or "quotaExceeded" in resp.text
            ):
                logger.error(
                    "Quota exceeded on %s (%s): %s", endpoint, safe_url, message
                )
                raise QuotaCircuitOpen(
                    f"YouTube API 403 {reason or 'quotaExceeded'} on {endpoint} "
                    f"({safe_url}): {message} — halting without retry until 00:00 PT."
                )

            raise YouTubeApiError(
                f"YouTube API HTTP {resp.status_code} ({reason or 'unknown'}) on "
                f"{safe_url}: {message}",
                status_code=resp.status_code,
                reason=reason,
            )

        return dict(resp.json())

    def resolve_channel(
        self,
        channel_id_or_handle: str,
        use_cache: bool = True,
        now: datetime | None = None,
    ) -> ChannelRecord:
        """channels.list で @handle または UC... からチャンネル情報（UC... ID 含む）を取得する。"""
        current = _utc_now(now)
        if use_cache:
            cached = self.cache.get_channel(
                channel_id_or_handle,
                max_age_hours=self.cache_fresh_hours,
                now=current,
            )
            if cached is not None:
                return cached

        kind, value = normalize_channel_identifier(channel_id_or_handle)
        params: dict[str, Any] = {
            "part": "id,snippet,statistics,contentDetails",
        }
        requested_handle: str | None = None
        if kind == "id":
            params["id"] = value
        else:
            # YouTube Data API v3 channels.list(forHandle=...) は @ 付き/なし両対応だが @ 付きで統一
            params["forHandle"] = value
            requested_handle = value

        data = self._get("channels", params=params, bucket="general", units=1, now=current)
        items = data.get("items") or []
        if not items:
            raise YouTubeApiError(
                f"Channel not found for identifier: {channel_id_or_handle}",
                status_code=404,
                reason="channelNotFound",
            )

        raw_item = items[0]
        record = _parse_channel_item(raw_item, fetched_at=current.isoformat())
        if not record.handle and requested_handle:
            record = ChannelRecord(
                channel_id=record.channel_id,
                handle=requested_handle,
                title=record.title,
                description=record.description,
                published_at=record.published_at,
                subscriber_count=record.subscriber_count,
                hidden_subscriber_count=record.hidden_subscriber_count,
                view_count=record.view_count,
                video_count=record.video_count,
                country=record.country,
                uploads_playlist_id=record.uploads_playlist_id,
                fetched_at=record.fetched_at,
            )
        self.cache.save_channel(record, raw_item=raw_item, requested_handle=requested_handle)
        return record

    def _fetch_playlist_ids(
        self,
        playlist_id: str,
        max_items: int,
        now: datetime,
    ) -> list[str]:
        video_ids: list[str] = []
        page_token: str | None = None
        while len(video_ids) < max_items:
            page_size = min(50, max_items - len(video_ids))
            data = self._get(
                "playlistItems",
                params={
                    "part": "contentDetails",
                    "playlistId": playlist_id,
                    "maxResults": page_size,
                    "pageToken": page_token,
                },
                bucket="general",
                units=1,
                now=now,
            )
            for item in data.get("items") or []:
                vid = (item.get("contentDetails") or {}).get("videoId")
                if vid and vid not in video_ids:
                    video_ids.append(str(vid))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
        return video_ids

    def fetch_channel_video_ids(
        self,
        channel_id: str,
        fmt: str = "long",
        max_items: int = 50,
        use_cache: bool = True,
        now: datetime | None = None,
    ) -> tuple[list[str], bool]:
        """UULF（長尺）等を 1 unit で優先取得し、404 時のみ UU へフォールバックする。

        Returns:
            (video_ids, used_fallback)
        """
        current = _utc_now(now)
        target_pl = derive_format_playlist_id(channel_id, fmt=fmt)
        if use_cache:
            cached = self.cache.get_playlist(
                target_pl, max_age_hours=self.cache_fresh_hours, now=current
            )
            if cached is not None:
                ids, used_fb = cached
                return ids[:max_items], used_fb

        used_fallback = False
        try:
            video_ids = self._fetch_playlist_ids(target_pl, max_items=max_items, now=current)
        except YouTubeApiError as exc:
            if exc.status_code == 404 and fmt != "all":
                logger.info(
                    "Playlist %s returned 404 for %s; falling back to UU.",
                    target_pl,
                    channel_id,
                )
                used_fallback = True
                fallback_pl = derive_format_playlist_id(channel_id, fmt="all")
                try:
                    video_ids = self._fetch_playlist_ids(
                        fallback_pl, max_items=max_items, now=current
                    )
                except YouTubeApiError as fb_exc:
                    if fb_exc.status_code == 404:
                        video_ids = []
                    else:
                        raise
            else:
                raise

        self.cache.save_playlist(
            playlist_id=target_pl,
            channel_id=channel_id,
            video_ids=video_ids,
            used_fallback=used_fallback,
            fetched_at=current.isoformat(),
        )
        return video_ids, used_fallback

    def fetch_videos_batch(
        self,
        video_ids: Sequence[str],
        chunk_size: int = 50,
        use_cache: bool = True,
        now: datetime | None = None,
    ) -> list[VideoRecord]:
        """videos.list を 50件バッチ（1 unit/50件）で取得し、入力順を保って返す。"""
        current = _utc_now(now)
        dedup_ids: list[str] = []
        seen: set[str] = set()
        for vid in video_ids:
            cleaned = vid.strip()
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                dedup_ids.append(cleaned)

        if not dedup_ids:
            return []

        found: dict[str, VideoRecord] = {}
        if use_cache:
            found.update(
                self.cache.get_videos(
                    dedup_ids,
                    max_age_hours=self.cache_fresh_hours,
                    shorts_max_duration_sec=self.shorts_max_duration_sec,
                    now=current,
                )
            )

        missing = [vid for vid in dedup_ids if vid not in found]
        effective_chunk = max(1, min(50, chunk_size))
        for idx in range(0, len(missing), effective_chunk):
            batch = missing[idx : idx + effective_chunk]
            data = self._get(
                "videos",
                params={
                    "part": "id,snippet,statistics,contentDetails",
                    "id": ",".join(batch),
                },
                bucket="general",
                units=1,
                now=current,
            )
            batch_records: list[VideoRecord] = []
            raw_by_id: dict[str, dict[str, Any]] = {}
            for item in data.get("items") or []:
                rec = _parse_video_item(
                    item,
                    fetched_at=current.isoformat(),
                    shorts_max_duration_sec=self.shorts_max_duration_sec,
                )
                batch_records.append(rec)
                raw_by_id[rec.video_id] = item
                found[rec.video_id] = rec

            if batch_records:
                self.cache.save_videos(batch_records, raw_items_by_id=raw_by_id)

        return [found[vid] for vid in dedup_ids if vid in found]

    def fetch_channel_long_videos(
        self,
        channel_id: str,
        max_items: int = 30,
        use_cache: bool = True,
        now: datetime | None = None,
    ) -> tuple[list[VideoRecord], bool]:
        """チャンネルの直近長尺動画を取得する（UULF優先、UUフォールバック時は duration > 180s フィルタ適用）。"""
        current = _utc_now(now)
        # UUフォールバック時に Shorts が混ざることを想定し、上限50件まで多めにIDを取ってフィルタする
        fetch_count = min(50, max(max_items, 30))
        video_ids, used_fallback = self.fetch_channel_video_ids(
            channel_id=channel_id,
            fmt="long",
            max_items=fetch_count,
            use_cache=use_cache,
            now=current,
        )
        if not video_ids:
            return [], used_fallback

        videos = self.fetch_videos_batch(
            video_ids, chunk_size=50, use_cache=use_cache, now=current
        )
        if used_fallback:
            videos = [
                v for v in videos if v.duration_seconds > self.shorts_max_duration_sec
            ]
        else:
            # UULF であっても尺0（配信予定・ライブ中）や境界Shortsを念のため除外
            videos = [
                v for v in videos if v.duration_seconds > self.shorts_max_duration_sec
            ]

        return videos[:max_items], used_fallback

    def fetch_video_comments(
        self,
        video_id: str,
        max_results: int = 50,
        order: str = "relevance",
        exclude_channel_id: str | None = None,
        use_cache: bool = True,
        now: datetime | None = None,
    ) -> list[CommentRecord]:
        """commentThreads.list で関連順コメントを取得する（403 commentsDisabled は安全スキップ）。"""
        current = _utc_now(now)
        if use_cache:
            cached = self.cache.get_comments(
                video_id, max_age_hours=self.cache_fresh_hours, now=current
            )
            if cached is not None:
                items = cached
                if exclude_channel_id:
                    items = [
                        c for c in items if c.author_channel_id != exclude_channel_id
                    ]
                return items[:max_results]

        try:
            data = self._get(
                "commentThreads",
                params={
                    "part": "snippet",
                    "videoId": video_id,
                    "order": order,
                    "maxResults": max(1, min(100, max_results)),
                    "textFormat": "plainText",
                },
                bucket="general",
                units=1,
                now=current,
            )
        except YouTubeApiError as exc:
            if exc.status_code == 403 and exc.reason == "commentsDisabled":
                logger.info("Comments disabled on video %s; skipping.", video_id)
                return []
            raise

        comments: list[CommentRecord] = []
        raw_by_id: dict[str, dict[str, Any]] = {}
        for item in data.get("items") or []:
            rec = _parse_comment_item(item, video_id=video_id, fetched_at=current.isoformat())
            comments.append(rec)
            raw_by_id[rec.comment_id] = item

        if comments:
            self.cache.save_comments(comments, raw_items_by_id=raw_by_id)

        if exclude_channel_id:
            comments = [c for c in comments if c.author_channel_id != exclude_channel_id]

        comments.sort(key=lambda c: (c.empathy_weight, c.like_count), reverse=True)
        return comments[:max_results]
