"""2026年6月刷新のYouTube Data API細分化クォータ管理・30日TTL・キーマスク実装。"""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

API_KEY_RE = re.compile(r"(key=)[^&\s]+")
BEARER_TOKEN_RE = re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]+", re.IGNORECASE)
JSON_SECRET_RE = re.compile(
    r'("(?:access_token|refresh_token|client_secret|id_token|token)"\s*:\s*")[^"]*(")',
    re.IGNORECASE,
)

DEFAULT_BUCKET_LIMITS: dict[str, int] = {
    "search": 85,
    "batch_stats": 9000,
    "general": 8500,
}


def redact_url(message: object) -> str:
    """エラーメッセージやURL内の API key クエリパラメータをマスクする。"""
    return API_KEY_RE.sub(r"\1***REDACTED***", str(message))


def redact_secrets(message: object) -> str:
    """URL の API key や OAuth トークン・クライアントシークレットをログ出力前にマスクする。"""
    text = redact_url(message)
    text = BEARER_TOKEN_RE.sub(r"\1***REDACTED***", text)
    text = JSON_SECRET_RE.sub(r"\1***REDACTED***\2", text)
    return text


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


class QuotaCircuitOpen(Exception):
    """クォータバケットの安全上限到達または HTTP 403 quotaExceeded 時に送出される例外。"""


class YouTubeQuotaLedger:
    """3つの独立クォータバケット（search / batch_stats / general）をSQLiteで追跡する。

    YouTube Data API のクォータリセット時刻は毎日太平洋時間（America/Los_Angeles）00:00。
    """

    def __init__(
        self,
        conn: sqlite3.Connection,
        limits: dict[str, int] | None = None,
    ) -> None:
        self.conn = conn
        self.limits = dict(limits or DEFAULT_BUCKET_LIMITS)
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS quota_ledger (
                pt_date TEXT NOT NULL,
                bucket TEXT NOT NULL,
                units_used INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (pt_date, bucket)
            )
            """
        )
        self.conn.commit()

    @staticmethod
    def _pt_today(now: datetime | None = None) -> str:
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        else:
            current = current.astimezone(timezone.utc)
        try:
            return current.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d")
        except ZoneInfoNotFoundError:
            return current.astimezone(timezone(_us_pacific_utc_offset(current))).strftime("%Y-%m-%d")

    def get_used(self, bucket: str, now: datetime | None = None) -> int:
        """当日の太平洋時間日付における指定バケットの消費ユニット数を返す。"""
        if bucket not in self.limits:
            raise KeyError(f"Unknown quota bucket: {bucket}")
        today = self._pt_today(now)
        row = self.conn.execute(
            "SELECT units_used FROM quota_ledger WHERE pt_date = ? AND bucket = ?",
            (today, bucket),
        ).fetchone()
        return int(row[0]) if row else 0

    def get_remaining(self, bucket: str, now: datetime | None = None) -> int:
        """当日の指定バケット残余ユニット数を返す。"""
        if bucket not in self.limits:
            raise KeyError(f"Unknown quota bucket: {bucket}")
        return max(0, self.limits[bucket] - self.get_used(bucket, now=now))

    def check_available(self, bucket: str, units: int, now: datetime | None = None) -> None:
        """消費前に安全上限を超えないか事前チェックする（消費記録は行わない）。"""
        if bucket not in self.limits:
            raise KeyError(f"Unknown quota bucket: {bucket}")
        if units < 0:
            raise ValueError("units must be non-negative")
        used = self.get_used(bucket, now=now)
        limit = self.limits[bucket]
        if used + units > limit:
            raise QuotaCircuitOpen(
                f"Bucket '{bucket}' safety limit reached ({used}/{limit}, requested={units})"
            )

    def get_summary(self, now: datetime | None = None) -> dict[str, dict[str, int | str]]:
        """当日の全バケット消費・上限・残余サマリを返す。"""
        today = self._pt_today(now)
        summary: dict[str, dict[str, int | str]] = {}
        for bucket, limit in self.limits.items():
            used = self.get_used(bucket, now=now)
            summary[bucket] = {
                "pt_date": today,
                "used": used,
                "limit": limit,
                "remaining": max(0, limit - used),
            }
        return summary

    def consume(self, bucket: str, units: int = 1, now: datetime | None = None) -> int:
        """クォータ消費を記録する。安全上限を超える場合は事前にサーキットブレーカーを起動する。"""
        if bucket not in self.limits:
            raise KeyError(f"Unknown quota bucket: {bucket}")
        if units < 0:
            raise ValueError("units must be non-negative")

        today = self._pt_today(now)
        used = self.get_used(bucket, now=now)
        limit = self.limits[bucket]
        if used + units > limit:
            raise QuotaCircuitOpen(
                f"Bucket '{bucket}' safety limit reached ({used}/{limit}, requested={units})"
            )

        self.conn.execute(
            """
            INSERT INTO quota_ledger (pt_date, bucket, units_used)
            VALUES (?, ?, ?)
            ON CONFLICT(pt_date, bucket) DO UPDATE
            SET units_used = units_used + excluded.units_used
            """,
            (today, bucket, units),
        )
        self.conn.commit()
        return used + units


def enforce_30day_ttl(
    conn: sqlite3.Connection,
    table_name: str = "videos_raw",
    timestamp_column: str = "fetched_at",
    ttl_days: int = 29,
    now: datetime | None = None,
) -> int:
    """YouTube API 規約の非認可データ30暦日保持制限に従い、期限超過レコードを削除する。"""
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table_name):
        raise ValueError(f"Invalid SQLite table name: {table_name}")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", timestamp_column):
        raise ValueError(f"Invalid SQLite column name: {timestamp_column}")

    current = now or datetime.now(timezone.utc)
    cutoff = (current - timedelta(days=ttl_days)).isoformat()
    cur = conn.execute(
        f"DELETE FROM {table_name} WHERE {timestamp_column} < ?",
        (cutoff,),
    )
    conn.commit()
    return cur.rowcount
