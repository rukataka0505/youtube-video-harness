"""YouTube Data API v3 投稿・メタデータ管理クライアント（安全設計・誤爆防止・クォータ台帳連携）。

主要機能:
- 動画 MP4 Resumable Upload（デフォルト公開設定: unlisted / private / public / 予約公開 publishAt）
- カスタムサムネイル設定（thumbnails.set）
- 字幕アップロード（captions.insert / captions.update）
- 再生リスト追加（playlistItems.insert）
- 既存動画メタデータ更新（videos.list で所有権検証＋差分マージ → videos.update）
- 全書き込み操作はデフォルト dry_run=True（execute=True 明示時のみ外部書き込み）
- YouTubeQuotaLedger（general バケット）への消費記録と事前サーキットブレーカー
"""

from __future__ import annotations

import json
import mimetypes
import os
import sqlite3
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

import yaml
from google.oauth2.credentials import Credentials
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

from yt_engine.collector.youtube_client import (
    QUOTA_ERROR_REASONS,
    load_quota_settings,
)
from yt_engine.config import find_repo_root
from yt_engine.publisher.auth import (
    AuthenticatedChannelInfo,
    YouTubeAuthError,
    build_youtube_service,
    collect_other_bound_channel_ids,
    fetch_authenticated_channel_info,
    load_channel_credentials,
    read_token_metadata,
)
from yt_engine.publisher.channels import (
    VALID_PRIVACY_STATUSES,
    ChannelMismatchError,
    ChannelProfile,
    ChannelsRegistry,
)
from yt_engine.quota import QuotaCircuitOpen, YouTubeQuotaLedger, redact_secrets

VIDEO_EXTENSIONS: frozenset[str] = frozenset({".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"})
THUMBNAIL_EXTENSIONS: frozenset[str] = frozenset({".png", ".jpg", ".jpeg"})
CAPTION_EXTENSIONS: frozenset[str] = frozenset({".srt", ".vtt", ".sbv", ".sub", ".ttml", ".lrc"})
DEFAULT_RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024  # 8MB


class MetadataValidationError(ValueError):
    """YouTube 動画メタデータ・ファイル・予約公開設定のバリデーションエラー。"""


class YouTubePublishError(RuntimeError):
    """YouTube 投稿・更新 API 呼び出し失敗時の例外（秘密情報はマスク済み）。"""

    def __init__(self, message: str, status_code: int | None = None, reason: str | None = None) -> None:
        super().__init__(redact_secrets(message))
        self.status_code = status_code
        self.reason = reason


@dataclass(frozen=True)
class UploadRequest:
    """動画アップロードおよび付随アセット一括設定リクエスト。"""

    channel_key: str
    video_path: Path
    title: str
    description: str = ""
    tags: tuple[str, ...] = ()
    category_id: str | None = None
    privacy_status: str | None = None  # 未指定時は unlisted（publish_at 指定時は private）
    publish_at: str | None = None
    made_for_kids: bool | None = None
    default_language: str | None = None
    default_audio_language: str | None = None
    embeddable: bool | None = None
    public_stats_viewable: bool | None = None
    notify_subscribers: bool = True
    append_footer: bool = False
    thumbnail_path: Path | None = None
    caption_path: Path | None = None
    caption_language: str = "ja"
    caption_name: str = "日本語"
    caption_is_draft: bool = False
    playlist_ids: tuple[str, ...] = ()
    format_id: str | None = None
    spec_path: Path | None = None
    episode_dir: Path | None = None


@dataclass(frozen=True)
class UpdateMetadataRequest:
    """既存動画メタデータ更新リクエスト（指定フィールドのみ差分更新）。"""

    channel_key: str
    video_id: str
    title: str | None = None
    description: str | None = None
    tags: tuple[str, ...] | None = None
    category_id: str | None = None
    privacy_status: str | None = None
    publish_at: str | None = None
    made_for_kids: bool | None = None
    default_language: str | None = None
    default_audio_language: str | None = None
    embeddable: bool | None = None
    public_stats_viewable: bool | None = None
    format_id: str | None = None
    spec_path: Path | None = None
    episode_dir: Path | None = None


@dataclass(frozen=True)
class ThumbnailRequest:
    """既存動画カスタムサムネイル設定リクエスト。"""

    channel_key: str
    video_id: str
    thumbnail_path: Path
    format_id: str | None = None
    spec_path: Path | None = None
    episode_dir: Path | None = None


@dataclass(frozen=True)
class CaptionRequest:
    """既存動画字幕アップロードリクエスト。"""

    channel_key: str
    video_id: str
    caption_path: Path
    language: str = "ja"
    name: str = "日本語"
    is_draft: bool = False
    caption_id: str | None = None  # 指定時は captions.update、未指定時は captions.insert
    format_id: str | None = None
    spec_path: Path | None = None
    episode_dir: Path | None = None


@dataclass(frozen=True)
class PlaylistAddRequest:
    """既存動画の再生リスト追加リクエスト。"""

    channel_key: str
    video_id: str
    playlist_ids: tuple[str, ...]
    position: int | None = None
    format_id: str | None = None
    spec_path: Path | None = None
    episode_dir: Path | None = None


@dataclass
class PublishResult:
    """dry-run 計画または実実行結果の構造化レポート。"""

    operation: str
    dry_run: bool
    channel_key: str
    display_name: str
    format_id: str
    video_id: str | None = None
    video_url: str | None = None
    privacy_status: str | None = None
    publish_at: str | None = None
    authenticated_channel: dict[str, Any] | None = None
    format_guard: dict[str, Any] = field(default_factory=dict)
    planned_steps: list[dict[str, Any]] = field(default_factory=list)
    executed_steps: list[dict[str, Any]] = field(default_factory=list)
    payload_preview: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    quota: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _utc_now(now: datetime | None = None) -> datetime:
    if now is None:
        return datetime.now(timezone.utc)
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc)
    return now.astimezone(timezone.utc)


def normalize_tags(tags: Sequence[str] | None) -> tuple[str, ...]:
    """タグ配列をトリムし、空文字と大文字小文字重複を除去して順序保持で返す。"""
    if not tags:
        return ()
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in tags:
        item = str(raw).strip()
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(item)
    return tuple(cleaned)


def compute_youtube_tags_char_length(tags: Sequence[str]) -> int:
    """YouTube Data API 仕様（500文字上限）に準じたタグ合計文字数を算出する。"""
    if not tags:
        return 0
    parts: list[str] = []
    for tag in tags:
        parts.append(f'"{tag}"' if " " in tag else tag)
    return len(",".join(parts))


def parse_and_validate_publish_at(
    publish_at: str | None,
    *,
    now: datetime | None = None,
) -> str | None:
    """予約公開日時（ISO-8601・タイムゾーン必須・未来時刻必須）を検証し UTC ISO-8601 (Z) へ正規化する。"""
    if publish_at is None:
        return None
    raw = publish_at.strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise MetadataValidationError(
            f"Invalid publishAt ISO-8601 timestamp '{publish_at}'. "
            "Example: '2026-12-01T18:00:00+09:00' or '2026-12-01T09:00:00Z'."
        ) from exc

    if dt.tzinfo is None or dt.utcoffset() is None:
        raise MetadataValidationError(
            f"publishAt '{publish_at}' must include an explicit timezone offset (e.g. '+09:00' or 'Z')."
        )

    dt_utc = dt.astimezone(timezone.utc)
    current_utc = _utc_now(now)
    if dt_utc <= current_utc:
        raise MetadataValidationError(
            f"publishAt '{publish_at}' ({dt_utc.isoformat()}) must be in the future "
            f"(current UTC: {current_utc.isoformat()})."
        )

    return dt_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def resolve_privacy_and_schedule(
    privacy_status: str | None,
    publish_at: str | None,
    *,
    default_privacy: str = "unlisted",
    now: datetime | None = None,
) -> tuple[str, str | None]:
    """公開設定と予約公開日時の整合性を検証・解決する。

    - デフォルトは default_privacy（unlisted）
    - publish_at 指定時に privacy_status 未指定なら自動的に 'private'（YouTube API 必須仕様）
    - publish_at 指定時に 'public' または 'unlisted' が明示された場合は矛盾エラーで停止
    """
    normalized_publish_at = parse_and_validate_publish_at(publish_at, now=now)

    if privacy_status is None or not privacy_status.strip():
        if normalized_publish_at is not None:
            return "private", normalized_publish_at
        resolved_default = default_privacy.strip().lower()
        if resolved_default not in VALID_PRIVACY_STATUSES:
            raise MetadataValidationError(f"Invalid default privacy_status: '{default_privacy}'")
        return resolved_default, None

    cleaned_privacy = privacy_status.strip().lower()
    if cleaned_privacy not in VALID_PRIVACY_STATUSES:
        raise MetadataValidationError(
            f"Invalid privacy_status '{privacy_status}'. Must be one of: private, unlisted, public."
        )

    if normalized_publish_at is not None and cleaned_privacy != "private":
        raise MetadataValidationError(
            f"YouTube API requires privacyStatus='private' when publishAt is set, "
            f"but got privacyStatus='{cleaned_privacy}' with publishAt='{publish_at}'."
        )

    return cleaned_privacy, normalized_publish_at


def validate_video_metadata(
    *,
    title: str | None,
    description: str | None,
    tags: Sequence[str] | None,
    category_id: str | None,
    registry: ChannelsRegistry,
    require_title: bool = True,
) -> list[str]:
    """タイトル・概要欄・タグ・カテゴリIDを YouTube Data API 制約に照らして検証する。"""
    warnings: list[str] = []
    defaults = registry.defaults

    if require_title:
        if title is None or not title.strip():
            raise MetadataValidationError("Video title must not be empty.")

    if title is not None:
        stripped_title = title.strip()
        if not stripped_title:
            raise MetadataValidationError("Video title must not be blank.")
        if "<" in stripped_title or ">" in stripped_title:
            raise MetadataValidationError("Video title must not contain '<' or '>'.")
        if len(stripped_title) > defaults.max_title_length:
            raise MetadataValidationError(
                f"Video title length ({len(stripped_title)}) exceeds YouTube limit ({defaults.max_title_length})."
            )

    if description is not None:
        if "<" in description or ">" in description:
            raise MetadataValidationError("Video description must not contain '<' or '>'.")
        if len(description) > defaults.max_description_length:
            raise MetadataValidationError(
                f"Video description length ({len(description)}) exceeds YouTube limit ({defaults.max_description_length})."
            )

    if tags is not None:
        cleaned_tags = normalize_tags(tags)
        for tag in cleaned_tags:
            if "<" in tag or ">" in tag:
                raise MetadataValidationError(f"Tag '{tag}' must not contain '<' or '>'.")
        total_chars = compute_youtube_tags_char_length(cleaned_tags)
        if total_chars > defaults.max_tags_total_chars:
            raise MetadataValidationError(
                f"Total tags length ({total_chars} chars) exceeds YouTube limit ({defaults.max_tags_total_chars} chars)."
            )

    if category_id is not None:
        cid = category_id.strip()
        if not cid.isdigit():
            raise MetadataValidationError(f"category_id must be numeric string, got '{category_id}'.")

    return warnings


def validate_video_file(video_path: Path) -> dict[str, Any]:
    """アップロード対象動画ファイルの存在・サイズ・拡張子を検証する。"""
    path = Path(video_path)
    if not path.is_file():
        raise MetadataValidationError(f"Video file not found: {path}")
    size = path.stat().st_size
    if size <= 0:
        raise MetadataValidationError(f"Video file is empty (0 bytes): {path}")
    ext = path.suffix.lower()
    if ext not in VIDEO_EXTENSIONS:
        raise MetadataValidationError(
            f"Unsupported video file extension '{ext}' for '{path}'. Supported: {sorted(VIDEO_EXTENSIONS)}"
        )
    return {"path": str(path), "size_bytes": size, "extension": ext}


def validate_thumbnail_file(
    thumbnail_path: Path,
    registry: ChannelsRegistry,
) -> tuple[dict[str, Any], list[str]]:
    """サムネイルファイルの存在・拡張子・サイズ上限を検証する。"""
    path = Path(thumbnail_path)
    warnings: list[str] = []
    if not path.is_file():
        raise MetadataValidationError(f"Thumbnail file not found: {path}")
    size = path.stat().st_size
    if size <= 0:
        raise MetadataValidationError(f"Thumbnail file is empty (0 bytes): {path}")
    ext = path.suffix.lower()
    if ext not in THUMBNAIL_EXTENSIONS:
        raise MetadataValidationError(
            f"Unsupported thumbnail extension '{ext}' for '{path}'. Supported: .png, .jpg, .jpeg"
        )
    if size > registry.defaults.max_thumbnail_hard_bytes:
        raise MetadataValidationError(
            f"Thumbnail file size ({size} bytes) exceeds hard limit "
            f"({registry.defaults.max_thumbnail_hard_bytes} bytes)."
        )
    if size > registry.defaults.max_thumbnail_api_bytes:
        warnings.append(
            f"Thumbnail '{path.name}' is {size / (1024 * 1024):.2f} MB (> 2.00 MB). "
            "YouTube Data API thumbnails.set は 2MB 上限でエラーになる場合があるため、API経由入稿時は JPEG 圧縮等を推奨します。"
        )
    return {"path": str(path), "size_bytes": size, "extension": ext}, warnings


def validate_caption_file(caption_path: Path, *, language: str) -> dict[str, Any]:
    """字幕ファイルの存在・拡張子・言語コードを検証する。"""
    path = Path(caption_path)
    if not path.is_file():
        raise MetadataValidationError(f"Caption file not found: {path}")
    size = path.stat().st_size
    if size <= 0:
        raise MetadataValidationError(f"Caption file is empty (0 bytes): {path}")
    ext = path.suffix.lower()
    if ext not in CAPTION_EXTENSIONS:
        raise MetadataValidationError(
            f"Unsupported caption extension '{ext}' for '{path}'. Supported: {sorted(CAPTION_EXTENSIONS)}"
        )
    if not language.strip():
        raise MetadataValidationError("Caption language code must not be empty (e.g. 'ja').")
    return {"path": str(path), "size_bytes": size, "extension": ext, "language": language.strip()}


def load_publish_metadata_file(metadata_path: Path) -> dict[str, Any]:
    """YAML/JSON の投稿メタデータファイル（00_meta.yaml 互換含む）を読み込んで正規化辞書を返す。"""
    path = Path(metadata_path)
    if not path.is_file():
        raise FileNotFoundError(f"Metadata file not found: {path}")
    raw_text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        data = json.loads(raw_text)
    else:
        data = yaml.safe_load(raw_text)
    if not isinstance(data, dict):
        raise MetadataValidationError(f"Metadata file must be a mapping/object: {path}")

    normalized: dict[str, Any] = dict(data)
    # 00_meta.yaml 形式のフォールバック補完
    package = data.get("package")
    if isinstance(package, dict):
        if not normalized.get("title") and package.get("title_candidate"):
            normalized["title"] = str(package["title_candidate"])
    schedule = data.get("schedule")
    if isinstance(schedule, dict):
        if not normalized.get("publish_at") and schedule.get("publish_at_jst"):
            normalized["publish_at"] = str(schedule["publish_at_jst"])
        if not normalized.get("video_id") and schedule.get("youtube_video_id"):
            normalized["video_id"] = str(schedule["youtube_video_id"])
    if not normalized.get("format_id") and data.get("formatId"):
        normalized["format_id"] = str(data["formatId"])
    return normalized


def _extract_http_error_info(exc: HttpError) -> tuple[int | None, str | None, str]:
    status_code: int | None = getattr(getattr(exc, "resp", None), "status", None)
    reason: str | None = None
    message = str(exc)
    raw_content = getattr(exc, "content", b"")
    if isinstance(raw_content, (bytes, bytearray)):
        try:
            payload = json.loads(raw_content.decode("utf-8", errors="replace"))
            err = payload.get("error", {}) if isinstance(payload, dict) else {}
            if err.get("message"):
                message = str(err["message"])
            errors = err.get("errors")
            if isinstance(errors, list) and errors and isinstance(errors[0], dict):
                if errors[0].get("reason"):
                    reason = str(errors[0]["reason"])
        except Exception:
            pass
    return status_code, reason, redact_secrets(message)


def open_default_quota_ledger(
    *,
    db_path: str | Path | None = None,
    configs_dir: Path | None = None,
    repo_root: Path | None = None,
) -> tuple[sqlite3.Connection, YouTubeQuotaLedger]:
    """既存 pipeline/data/pipeline.db と設定を共有する YouTubeQuotaLedger を開く。"""
    limits, _ttl_days, _shorts_sec = load_quota_settings(configs_dir=configs_dir)

    if db_path is None:
        env_db = os.environ.get("YT_ENGINE_DB_PATH", "").strip()
        if env_db:
            resolved = Path(env_db)
            if not resolved.is_absolute():
                root = repo_root or find_repo_root()
                resolved = root / resolved
        else:
            try:
                root = repo_root or find_repo_root()
                resolved = root / "pipeline" / "data" / "pipeline.db"
            except FileNotFoundError:
                resolved = Path("pipeline/data/pipeline.db")
        target = resolved
    else:
        target = db_path

    if str(target) == ":memory:":
        conn = sqlite3.connect(":memory:")
    else:
        path_obj = Path(target)
        path_obj.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(path_obj))

    ledger = YouTubeQuotaLedger(conn, limits=limits)
    return conn, ledger


class YouTubePublisher:
    """2チャンネル対応・誤爆防止・dry-run 標準・クォータ台帳連携の YouTube 投稿・管理クライアント。"""

    def __init__(
        self,
        registry: ChannelsRegistry,
        *,
        ledger: YouTubeQuotaLedger | None = None,
        db_path: str | Path | None = None,
        youtube_service_factory: Callable[[Credentials], Any] | None = None,
        media_upload_factory: Callable[..., Any] | None = None,
        refresh_request_factory: Callable[[], Any] | None = None,
        allow_unbound_channel: bool = False,
        now_provider: Callable[[], datetime] | None = None,
    ) -> None:
        self.registry = registry
        self._owns_conn = ledger is None
        if ledger is not None:
            self._conn: sqlite3.Connection | None = None
            self.ledger = ledger
        else:
            configs_dir = registry.config_path.parent
            conn, created_ledger = open_default_quota_ledger(
                db_path=db_path,
                configs_dir=configs_dir,
                repo_root=registry.repo_root,
            )
            self._conn = conn
            self.ledger = created_ledger

        self._youtube_service_factory = youtube_service_factory or build_youtube_service
        self._media_upload_factory = media_upload_factory or self._default_media_upload
        self._refresh_request_factory = refresh_request_factory
        self.allow_unbound_channel = allow_unbound_channel
        self._now_provider = now_provider or (lambda: datetime.now(timezone.utc))

    def __enter__(self) -> "YouTubePublisher":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.close()

    def close(self) -> None:
        if self._owns_conn and self._conn is not None:
            self._conn.close()
            self._conn = None

    @staticmethod
    def _default_media_upload(
        file_path: str,
        *,
        mimetype: str | None = None,
        resumable: bool = False,
        chunksize: int = DEFAULT_RESUMABLE_CHUNK_BYTES,
    ) -> MediaFileUpload:
        if resumable:
            return MediaFileUpload(file_path, mimetype=mimetype, chunksize=chunksize, resumable=True)
        return MediaFileUpload(file_path, mimetype=mimetype, resumable=False)

    def _now(self) -> datetime:
        return _utc_now(self._now_provider())

    def _cost(self, op_name: str) -> int:
        return int(self.registry.quota_costs.get(op_name, 1))

    def _consume_quota(self, op_name: str) -> int:
        units = self._cost(op_name)
        return self.ledger.consume("general", units=units, now=self._now())

    def _quota_report(self, estimated_units: int, *, consumed_units: int = 0) -> dict[str, Any]:
        now = self._now()
        used = self.ledger.get_used("general", now=now)
        limit = self.ledger.limits["general"]
        remaining = max(0, limit - used)
        return {
            "bucket": "general",
            "pt_date": self.ledger._pt_today(now),
            "estimated_units": estimated_units,
            "consumed_units": consumed_units,
            "used_after": used,
            "limit": limit,
            "remaining_after": remaining,
            "would_exceed_limit": (used + estimated_units > limit) if consumed_units == 0 else False,
        }

    def _check_local_token_binding_for_dry_run(
        self,
        profile: ChannelProfile,
        warnings: list[str],
    ) -> dict[str, Any]:
        """dry-run 時でもローカル保存トークンの誤バインド・重複を事前検知する。"""
        token_path = profile.token_path(self.registry.oauth.token_dir)
        meta = read_token_metadata(token_path)
        expected_id = profile.effective_expected_channel_id or None

        if meta is None:
            warnings.append(
                f"OAuth token not found at '{token_path}'. 実実行前に "
                f"`python pipeline/scripts/youtube_auth.py --channel {profile.key}` で認証してください。"
            )
            return {
                "source": "local_metadata",
                "token_exists": False,
                "expected_channel_id": expected_id,
                "bound_channel_id": None,
            }

        if meta.get("corrupted"):
            raise YouTubeAuthError(f"Corrupted OAuth token file detected: {token_path}")

        bound_id = str(meta.get("channel_id") or "").strip()
        if bound_id:
            other_bound = collect_other_bound_channel_ids(
                self.registry,
                exclude_channel_key=profile.key,
            )
            self.registry.validate_channel_identity(
                profile.key,
                bound_id,
                actual_title=str(meta.get("channel_title") or ""),
                require_bound=False,
                other_bound_ids=other_bound,
            )
        if not expected_id and self.registry.defaults.require_channel_id_match and not self.allow_unbound_channel:
            warnings.append(
                f"configs/channels.yaml の '{profile.key}.expected_channel_id' が未設定です。"
                f"実実行（--execute）前に `youtube_auth.py --channel {profile.key} --verify --write-channel-id` を実行してください。"
            )

        return {
            "source": "local_metadata",
            "token_exists": True,
            "expected_channel_id": expected_id,
            "bound_channel_id": bound_id or None,
            "bound_channel_title": meta.get("channel_title") or None,
        }

    def _connect_and_verify_channel(
        self,
        profile: ChannelProfile,
    ) -> tuple[Any, AuthenticatedChannelInfo, dict[str, Any]]:
        """実実行時にトークン読込 → channels.list(mine=true) → 誤爆ガード検証を行う。"""
        token_path = profile.token_path(self.registry.oauth.token_dir)
        creds, _binding, _refreshed = load_channel_credentials(
            token_path,
            scopes=self.registry.oauth.scopes,
            expected_channel_key=profile.key,
            auto_refresh=True,
            refresh_request_factory=self._refresh_request_factory,
        )
        youtube = self._youtube_service_factory(creds)
        ch_info = self._call_api(
            "channels.list(mine=true)",
            lambda: fetch_authenticated_channel_info(
                youtube,
                ledger=self.ledger,
                quota_cost=self._cost("channels_list"),
                now=self._now(),
            ),
        )
        other_bound = collect_other_bound_channel_ids(
            self.registry,
            exclude_channel_key=profile.key,
        )
        identity = self.registry.validate_channel_identity(
            profile.key,
            ch_info.channel_id,
            actual_title=ch_info.title,
            require_bound=(self.registry.defaults.require_channel_id_match and not self.allow_unbound_channel),
            other_bound_ids=other_bound,
        )
        return youtube, ch_info, identity

    def _call_api(self, label: str, fn: Callable[[], Any]) -> Any:
        try:
            return fn()
        except (QuotaCircuitOpen, ChannelMismatchError, MetadataValidationError, YouTubeAuthError):
            raise
        except HttpError as exc:
            status_code, reason, message = _extract_http_error_info(exc)
            if status_code == 403 and (reason in QUOTA_ERROR_REASONS or "quotaExceeded" in message):
                raise QuotaCircuitOpen(
                    f"YouTube API quota exceeded during {label} (reason={reason}): {message}"
                ) from exc
            raise YouTubePublishError(
                f"YouTube API error during {label} (HTTP {status_code}, reason={reason}): {message}",
                status_code=status_code,
                reason=reason,
            ) from exc
        except Exception as exc:
            raise YouTubePublishError(f"Unexpected error during {label}: {exc}") from exc

    def _fetch_and_verify_video_ownership(
        self,
        youtube: Any,
        *,
        video_id: str,
        expected_channel_id: str,
        channel_key: str,
    ) -> dict[str, Any]:
        """既存動画の所有チャンネルIDを確認し、別チャンネル動画への誤更新を防止する。"""
        self._consume_quota("videos_list")
        response = self._call_api(
            f"videos.list(id={video_id})",
            lambda: youtube.videos().list(part="snippet,status", id=video_id).execute(),
        )
        items = response.get("items") if isinstance(response, dict) else None
        if not items:
            raise YouTubePublishError(
                f"Video '{video_id}' not found or inaccessible by channel '{channel_key}'.",
                status_code=404,
            )
        item = items[0]
        owner_channel_id = str((item.get("snippet") or {}).get("channelId") or "").strip()
        if owner_channel_id and owner_channel_id != expected_channel_id:
            raise ChannelMismatchError(
                f"Video ownership guard triggered: video '{video_id}' belongs to channel "
                f"'{owner_channel_id}', not authenticated '{channel_key}' ('{expected_channel_id}')."
            )
        return item

    def _upload_thumbnail_exec(
        self,
        youtube: Any,
        *,
        video_id: str,
        thumbnail_path: Path,
    ) -> dict[str, Any]:
        mime, _ = mimetypes.guess_type(str(thumbnail_path))
        media = self._media_upload_factory(
            str(thumbnail_path),
            mimetype=mime or "image/png",
            resumable=False,
        )
        self._consume_quota("thumbnails_set")
        resp = self._call_api(
            f"thumbnails.set(videoId={video_id})",
            lambda: youtube.thumbnails().set(videoId=video_id, media_body=media).execute(),
        )
        return resp if isinstance(resp, dict) else {"raw": resp}

    def _upload_caption_exec(
        self,
        youtube: Any,
        *,
        video_id: str,
        caption_path: Path,
        language: str,
        name: str,
        is_draft: bool,
        caption_id: str | None = None,
    ) -> dict[str, Any]:
        media = self._media_upload_factory(
            str(caption_path),
            mimetype="application/octet-stream",
            resumable=False,
        )
        if caption_id:
            body = {
                "id": caption_id,
                "snippet": {
                    "isDraft": is_draft,
                },
            }
            self._consume_quota("captions_update")
            resp = self._call_api(
                f"captions.update(id={caption_id})",
                lambda: youtube.captions().update(part="snippet", body=body, media_body=media).execute(),
            )
        else:
            body = {
                "snippet": {
                    "videoId": video_id,
                    "language": language,
                    "name": name,
                    "isDraft": is_draft,
                }
            }
            self._consume_quota("captions_insert")
            resp = self._call_api(
                f"captions.insert(videoId={video_id})",
                lambda: youtube.captions().insert(part="snippet", body=body, media_body=media).execute(),
            )
        return resp if isinstance(resp, dict) else {"raw": resp}

    def _add_to_playlist_exec(
        self,
        youtube: Any,
        *,
        video_id: str,
        playlist_id: str,
        position: int | None = None,
    ) -> dict[str, Any]:
        snippet: dict[str, Any] = {
            "playlistId": playlist_id,
            "resourceId": {
                "kind": "youtube#video",
                "videoId": video_id,
            },
        }
        if position is not None:
            snippet["position"] = int(position)
        self._consume_quota("playlist_items_insert")
        resp = self._call_api(
            f"playlistItems.insert(playlistId={playlist_id}, videoId={video_id})",
            lambda: youtube.playlistItems().insert(part="snippet", body={"snippet": snippet}).execute(),
        )
        return resp if isinstance(resp, dict) else {"raw": resp}

    def upload_video(
        self,
        request: UploadRequest,
        *,
        dry_run: bool = True,
        progress_callback: Callable[[float], None] | None = None,
    ) -> PublishResult:
        """動画MP4アップロード＋任意でサムネイル・字幕・再生リスト追加を実行（既定 dry_run=True）。"""
        profile = self.registry.get_channel(request.channel_key)
        artifact_paths: list[Path] = [Path(request.video_path)]
        if request.thumbnail_path is not None:
            artifact_paths.append(Path(request.thumbnail_path))
        if request.caption_path is not None:
            artifact_paths.append(Path(request.caption_path))

        format_guard = self.registry.validate_format_guard(
            profile.key,
            format_id=request.format_id,
            spec_path=request.spec_path,
            episode_dir=request.episode_dir,
            artifact_paths=artifact_paths,
        )

        video_info = validate_video_file(request.video_path)
        warnings: list[str] = []

        thumb_info: dict[str, Any] | None = None
        if request.thumbnail_path is not None:
            thumb_info, thumb_warnings = validate_thumbnail_file(request.thumbnail_path, self.registry)
            warnings.extend(thumb_warnings)

        caption_info: dict[str, Any] | None = None
        if request.caption_path is not None:
            caption_info = validate_caption_file(request.caption_path, language=request.caption_language)

        description = request.description
        if request.append_footer and profile.description_footer:
            footer = profile.description_footer.strip()
            if footer and footer not in description:
                description = f"{description.rstrip()}\n\n{footer}".strip()

        merged_tags = normalize_tags(request.tags if request.tags else profile.default_tags)
        category_id = (request.category_id or profile.default_category_id or "27").strip()
        default_language = (request.default_language or profile.default_language or "ja").strip()
        default_audio_language = (request.default_audio_language or profile.default_audio_language or "ja").strip()
        made_for_kids = (
            self.registry.defaults.self_declared_made_for_kids
            if request.made_for_kids is None
            else bool(request.made_for_kids)
        )
        embeddable = (
            self.registry.defaults.embeddable
            if request.embeddable is None
            else bool(request.embeddable)
        )
        public_stats_viewable = (
            self.registry.defaults.public_stats_viewable
            if request.public_stats_viewable is None
            else bool(request.public_stats_viewable)
        )

        warnings.extend(
            validate_video_metadata(
                title=request.title,
                description=description,
                tags=merged_tags,
                category_id=category_id,
                registry=self.registry,
                require_title=True,
            )
        )

        privacy_status, normalized_publish_at = resolve_privacy_and_schedule(
            request.privacy_status,
            request.publish_at,
            default_privacy=profile.default_privacy_status or self.registry.defaults.privacy_status,
            now=self._now(),
        )
        if privacy_status == "public":
            warnings.append(
                "privacyStatus='public' が指定されています。通常は限定公開（unlisted）または予約公開（publishAt）で24時間前バッファを確保することを推奨します。"
            )

        resolved_playlists = tuple(profile.resolve_playlist_id(pl) for pl in request.playlist_ids)

        snippet_body: dict[str, Any] = {
            "title": request.title.strip(),
            "description": description,
            "categoryId": category_id,
            "defaultLanguage": default_language,
            "defaultAudioLanguage": default_audio_language,
        }
        if merged_tags:
            snippet_body["tags"] = list(merged_tags)

        status_body: dict[str, Any] = {
            "privacyStatus": privacy_status,
            "selfDeclaredMadeForKids": made_for_kids,
            "embeddable": embeddable,
            "publicStatsViewable": public_stats_viewable,
            "license": self.registry.defaults.license,
        }
        if normalized_publish_at is not None:
            status_body["publishAt"] = normalized_publish_at

        video_body = {"snippet": snippet_body, "status": status_body}

        planned_steps: list[dict[str, Any]] = [
            {"api": "channels.list", "purpose": "verify_channel_identity", "quota_units": self._cost("channels_list")},
            {
                "api": "videos.insert",
                "purpose": "upload_video",
                "file": video_info,
                "privacy_status": privacy_status,
                "publish_at": normalized_publish_at,
                "quota_units": self._cost("videos_insert"),
            },
        ]
        if thumb_info is not None:
            planned_steps.append(
                {
                    "api": "thumbnails.set",
                    "purpose": "set_thumbnail",
                    "file": thumb_info,
                    "quota_units": self._cost("thumbnails_set"),
                }
            )
        if caption_info is not None:
            planned_steps.append(
                {
                    "api": "captions.insert",
                    "purpose": "upload_caption",
                    "file": caption_info,
                    "name": request.caption_name,
                    "is_draft": request.caption_is_draft,
                    "quota_units": self._cost("captions_insert"),
                }
            )
        for pl_id in resolved_playlists:
            planned_steps.append(
                {
                    "api": "playlistItems.insert",
                    "purpose": "add_to_playlist",
                    "playlist_id": pl_id,
                    "quota_units": self._cost("playlist_items_insert"),
                }
            )

        estimated_units = sum(int(step["quota_units"]) for step in planned_steps)
        payload_preview = {
            "video_body": video_body,
            "video_file": video_info,
            "thumbnail_file": thumb_info,
            "caption_file": caption_info,
            "playlist_ids": list(resolved_playlists),
            "notify_subscribers": request.notify_subscribers,
        }

        if dry_run:
            local_auth = self._check_local_token_binding_for_dry_run(profile, warnings)
            quota_info = self._quota_report(estimated_units, consumed_units=0)
            if quota_info["would_exceed_limit"]:
                warnings.append(
                    f"推定クォータ消費 ({estimated_units}) が general 残余 ({quota_info['remaining_after']}) を超過します。"
                )
            return PublishResult(
                operation="upload",
                dry_run=True,
                channel_key=profile.key,
                display_name=profile.display_name,
                format_id=profile.format_id,
                privacy_status=privacy_status,
                publish_at=normalized_publish_at,
                authenticated_channel=local_auth,
                format_guard=format_guard,
                planned_steps=planned_steps,
                payload_preview=payload_preview,
                warnings=warnings,
                quota=quota_info,
            )

        # 実実行: 事前クォータ確認（不足なら1回もAPIを呼ばず停止）
        self.ledger.check_available("general", estimated_units, now=self._now())

        youtube, ch_info, identity = self._connect_and_verify_channel(profile)
        executed_steps: list[dict[str, Any]] = [
            {
                "api": "channels.list",
                "status": "ok",
                "channel_id": ch_info.channel_id,
                "channel_title": ch_info.title,
                "binding_state": identity["binding_state"],
                "quota_units": self._cost("channels_list"),
            }
        ]

        mime, _ = mimetypes.guess_type(str(request.video_path))
        media = self._media_upload_factory(
            str(request.video_path),
            mimetype=mime or "video/mp4",
            resumable=True,
            chunksize=DEFAULT_RESUMABLE_CHUNK_BYTES,
        )
        self._consume_quota("videos_insert")

        def _do_resumable_insert() -> dict[str, Any]:
            insert_req = youtube.videos().insert(
                part="snippet,status",
                body=video_body,
                media_body=media,
                notifySubscribers=request.notify_subscribers,
            )
            if hasattr(insert_req, "next_chunk"):
                response = None
                while response is None:
                    status, response = insert_req.next_chunk()
                    if status is not None and progress_callback is not None:
                        progress_callback(float(status.progress()))
                return response
            return insert_req.execute()

        upload_resp = self._call_api("videos.insert", _do_resumable_insert)
        video_id = str((upload_resp or {}).get("id") or "").strip()
        if not video_id:
            raise YouTubePublishError(f"videos.insert did not return a video ID: {upload_resp}")

        executed_steps.append(
            {
                "api": "videos.insert",
                "status": "ok",
                "video_id": video_id,
                "quota_units": self._cost("videos_insert"),
            }
        )

        if request.thumbnail_path is not None:
            thumb_resp = self._upload_thumbnail_exec(
                youtube,
                video_id=video_id,
                thumbnail_path=request.thumbnail_path,
            )
            executed_steps.append(
                {
                    "api": "thumbnails.set",
                    "status": "ok",
                    "video_id": video_id,
                    "response_keys": sorted(thumb_resp.keys()),
                    "quota_units": self._cost("thumbnails_set"),
                }
            )

        if request.caption_path is not None:
            cap_resp = self._upload_caption_exec(
                youtube,
                video_id=video_id,
                caption_path=request.caption_path,
                language=request.caption_language,
                name=request.caption_name,
                is_draft=request.caption_is_draft,
            )
            executed_steps.append(
                {
                    "api": "captions.insert",
                    "status": "ok",
                    "caption_id": cap_resp.get("id"),
                    "quota_units": self._cost("captions_insert"),
                }
            )

        for pl_id in resolved_playlists:
            pl_resp = self._add_to_playlist_exec(
                youtube,
                video_id=video_id,
                playlist_id=pl_id,
            )
            executed_steps.append(
                {
                    "api": "playlistItems.insert",
                    "status": "ok",
                    "playlist_id": pl_id,
                    "playlist_item_id": pl_resp.get("id"),
                    "quota_units": self._cost("playlist_items_insert"),
                }
            )

        consumed = sum(int(step["quota_units"]) for step in executed_steps)
        return PublishResult(
            operation="upload",
            dry_run=False,
            channel_key=profile.key,
            display_name=profile.display_name,
            format_id=profile.format_id,
            video_id=video_id,
            video_url=f"https://www.youtube.com/watch?v={video_id}",
            privacy_status=privacy_status,
            publish_at=normalized_publish_at,
            authenticated_channel=ch_info.to_dict(),
            format_guard=format_guard,
            planned_steps=planned_steps,
            executed_steps=executed_steps,
            payload_preview=payload_preview,
            warnings=warnings,
            quota=self._quota_report(estimated_units, consumed_units=consumed),
        )

    def update_video_metadata(
        self,
        request: UpdateMetadataRequest,
        *,
        dry_run: bool = True,
    ) -> PublishResult:
        """既存動画のメタデータ（snippet/status）を所有権チェック後に安全に部分更新する。"""
        profile = self.registry.get_channel(request.channel_key)
        video_id = request.video_id.strip()
        if not video_id:
            raise MetadataValidationError("video_id must not be empty.")

        format_guard = self.registry.validate_format_guard(
            profile.key,
            format_id=request.format_id,
            spec_path=request.spec_path,
            episode_dir=request.episode_dir,
        )

        has_snippet_updates = any(
            x is not None
            for x in (
                request.title,
                request.description,
                request.tags,
                request.category_id,
                request.default_language,
                request.default_audio_language,
            )
        )
        has_status_updates = any(
            x is not None
            for x in (
                request.privacy_status,
                request.publish_at,
                request.made_for_kids,
                request.embeddable,
                request.public_stats_viewable,
            )
        )
        if not has_snippet_updates and not has_status_updates:
            raise MetadataValidationError("At least one metadata field must be provided for update.")

        warnings = validate_video_metadata(
            title=request.title,
            description=request.description,
            tags=request.tags,
            category_id=request.category_id,
            registry=self.registry,
            require_title=False,
        )

        resolved_privacy: str | None = None
        normalized_publish_at: str | None = None
        if request.privacy_status is not None or request.publish_at is not None:
            resolved_privacy, normalized_publish_at = resolve_privacy_and_schedule(
                request.privacy_status,
                request.publish_at,
                default_privacy=profile.default_privacy_status or self.registry.defaults.privacy_status,
                now=self._now(),
            )

        planned_steps = [
            {"api": "channels.list", "purpose": "verify_channel_identity", "quota_units": self._cost("channels_list")},
            {"api": "videos.list", "purpose": "verify_video_ownership_and_fetch_current", "video_id": video_id, "quota_units": self._cost("videos_list")},
            {"api": "videos.update", "purpose": "update_video_metadata", "video_id": video_id, "quota_units": self._cost("videos_update")},
        ]
        estimated_units = sum(int(s["quota_units"]) for s in planned_steps)

        patch_preview: dict[str, Any] = {"video_id": video_id, "snippet_patch": {}, "status_patch": {}}
        if request.title is not None:
            patch_preview["snippet_patch"]["title"] = request.title.strip()
        if request.description is not None:
            patch_preview["snippet_patch"]["description"] = request.description
        if request.tags is not None:
            patch_preview["snippet_patch"]["tags"] = list(normalize_tags(request.tags))
        if request.category_id is not None:
            patch_preview["snippet_patch"]["categoryId"] = request.category_id.strip()
        if request.default_language is not None:
            patch_preview["snippet_patch"]["defaultLanguage"] = request.default_language.strip()
        if request.default_audio_language is not None:
            patch_preview["snippet_patch"]["defaultAudioLanguage"] = request.default_audio_language.strip()

        if resolved_privacy is not None:
            patch_preview["status_patch"]["privacyStatus"] = resolved_privacy
        if normalized_publish_at is not None:
            patch_preview["status_patch"]["publishAt"] = normalized_publish_at
        if request.made_for_kids is not None:
            patch_preview["status_patch"]["selfDeclaredMadeForKids"] = bool(request.made_for_kids)
        if request.embeddable is not None:
            patch_preview["status_patch"]["embeddable"] = bool(request.embeddable)
        if request.public_stats_viewable is not None:
            patch_preview["status_patch"]["publicStatsViewable"] = bool(request.public_stats_viewable)

        if dry_run:
            local_auth = self._check_local_token_binding_for_dry_run(profile, warnings)
            return PublishResult(
                operation="update",
                dry_run=True,
                channel_key=profile.key,
                display_name=profile.display_name,
                format_id=profile.format_id,
                video_id=video_id,
                video_url=f"https://www.youtube.com/watch?v={video_id}",
                privacy_status=resolved_privacy,
                publish_at=normalized_publish_at,
                authenticated_channel=local_auth,
                format_guard=format_guard,
                planned_steps=planned_steps,
                payload_preview=patch_preview,
                warnings=warnings,
                quota=self._quota_report(estimated_units, consumed_units=0),
            )

        self.ledger.check_available("general", estimated_units, now=self._now())
        youtube, ch_info, identity = self._connect_and_verify_channel(profile)
        current_item = self._fetch_and_verify_video_ownership(
            youtube,
            video_id=video_id,
            expected_channel_id=ch_info.channel_id,
            channel_key=profile.key,
        )

        current_snippet = dict(current_item.get("snippet") or {})
        current_status = dict(current_item.get("status") or {})

        update_parts: list[str] = []
        update_body: dict[str, Any] = {"id": video_id}

        if has_snippet_updates:
            merged_snippet: dict[str, Any] = {
                "title": current_snippet.get("title", ""),
                "description": current_snippet.get("description", ""),
                "categoryId": current_snippet.get("categoryId") or profile.default_category_id,
            }
            if "tags" in current_snippet:
                merged_snippet["tags"] = list(current_snippet["tags"])
            if current_snippet.get("defaultLanguage"):
                merged_snippet["defaultLanguage"] = current_snippet["defaultLanguage"]
            if current_snippet.get("defaultAudioLanguage"):
                merged_snippet["defaultAudioLanguage"] = current_snippet["defaultAudioLanguage"]

            merged_snippet.update(patch_preview["snippet_patch"])
            update_body["snippet"] = merged_snippet
            update_parts.append("snippet")

        if has_status_updates:
            merged_status: dict[str, Any] = {
                "privacyStatus": current_status.get("privacyStatus", "unlisted"),
            }
            for keep_key in ("embeddable", "license", "publicStatsViewable", "selfDeclaredMadeForKids", "publishAt"):
                if keep_key in current_status:
                    merged_status[keep_key] = current_status[keep_key]
            merged_status.update(patch_preview["status_patch"])
            if merged_status.get("privacyStatus") != "private" and "publishAt" in merged_status:
                merged_status.pop("publishAt", None)
            update_body["status"] = merged_status
            update_parts.append("status")

        self._consume_quota("videos_update")
        self._call_api(
            f"videos.update(id={video_id})",
            lambda: youtube.videos().update(part=",".join(update_parts), body=update_body).execute(),
        )

        executed_steps = [
            {"api": "channels.list", "status": "ok", "channel_id": ch_info.channel_id, "binding_state": identity["binding_state"], "quota_units": self._cost("channels_list")},
            {"api": "videos.list", "status": "ok", "video_id": video_id, "quota_units": self._cost("videos_list")},
            {"api": "videos.update", "status": "ok", "video_id": video_id, "parts": update_parts, "quota_units": self._cost("videos_update")},
        ]
        consumed = sum(int(s["quota_units"]) for s in executed_steps)
        return PublishResult(
            operation="update",
            dry_run=False,
            channel_key=profile.key,
            display_name=profile.display_name,
            format_id=profile.format_id,
            video_id=video_id,
            video_url=f"https://www.youtube.com/watch?v={video_id}",
            privacy_status=resolved_privacy or current_status.get("privacyStatus"),
            publish_at=normalized_publish_at,
            authenticated_channel=ch_info.to_dict(),
            format_guard=format_guard,
            planned_steps=planned_steps,
            executed_steps=executed_steps,
            payload_preview=update_body,
            warnings=warnings,
            quota=self._quota_report(estimated_units, consumed_units=consumed),
        )

    def set_thumbnail(
        self,
        request: ThumbnailRequest,
        *,
        dry_run: bool = True,
    ) -> PublishResult:
        """既存動画にカスタムサムネイルを設定する。"""
        profile = self.registry.get_channel(request.channel_key)
        video_id = request.video_id.strip()
        if not video_id:
            raise MetadataValidationError("video_id must not be empty.")

        format_guard = self.registry.validate_format_guard(
            profile.key,
            format_id=request.format_id,
            spec_path=request.spec_path,
            episode_dir=request.episode_dir,
            artifact_paths=(request.thumbnail_path,),
        )
        thumb_info, warnings = validate_thumbnail_file(request.thumbnail_path, self.registry)

        planned_steps = [
            {"api": "channels.list", "purpose": "verify_channel_identity", "quota_units": self._cost("channels_list")},
            {"api": "videos.list", "purpose": "verify_video_ownership", "video_id": video_id, "quota_units": self._cost("videos_list")},
            {"api": "thumbnails.set", "purpose": "set_thumbnail", "video_id": video_id, "file": thumb_info, "quota_units": self._cost("thumbnails_set")},
        ]
        estimated_units = sum(int(s["quota_units"]) for s in planned_steps)

        if dry_run:
            local_auth = self._check_local_token_binding_for_dry_run(profile, warnings)
            return PublishResult(
                operation="thumbnail",
                dry_run=True,
                channel_key=profile.key,
                display_name=profile.display_name,
                format_id=profile.format_id,
                video_id=video_id,
                video_url=f"https://www.youtube.com/watch?v={video_id}",
                authenticated_channel=local_auth,
                format_guard=format_guard,
                planned_steps=planned_steps,
                payload_preview={"video_id": video_id, "thumbnail_file": thumb_info},
                warnings=warnings,
                quota=self._quota_report(estimated_units, consumed_units=0),
            )

        self.ledger.check_available("general", estimated_units, now=self._now())
        youtube, ch_info, identity = self._connect_and_verify_channel(profile)
        self._fetch_and_verify_video_ownership(
            youtube,
            video_id=video_id,
            expected_channel_id=ch_info.channel_id,
            channel_key=profile.key,
        )
        resp = self._upload_thumbnail_exec(
            youtube,
            video_id=video_id,
            thumbnail_path=request.thumbnail_path,
        )
        executed_steps = [
            {"api": "channels.list", "status": "ok", "channel_id": ch_info.channel_id, "binding_state": identity["binding_state"], "quota_units": self._cost("channels_list")},
            {"api": "videos.list", "status": "ok", "video_id": video_id, "quota_units": self._cost("videos_list")},
            {"api": "thumbnails.set", "status": "ok", "video_id": video_id, "response_keys": sorted(resp.keys()), "quota_units": self._cost("thumbnails_set")},
        ]
        consumed = sum(int(s["quota_units"]) for s in executed_steps)
        return PublishResult(
            operation="thumbnail",
            dry_run=False,
            channel_key=profile.key,
            display_name=profile.display_name,
            format_id=profile.format_id,
            video_id=video_id,
            video_url=f"https://www.youtube.com/watch?v={video_id}",
            authenticated_channel=ch_info.to_dict(),
            format_guard=format_guard,
            planned_steps=planned_steps,
            executed_steps=executed_steps,
            payload_preview={"video_id": video_id, "thumbnail_file": thumb_info},
            warnings=warnings,
            quota=self._quota_report(estimated_units, consumed_units=consumed),
        )

    def upload_caption(
        self,
        request: CaptionRequest,
        *,
        dry_run: bool = True,
    ) -> PublishResult:
        """既存動画に字幕ファイルをアップロード（または更新）する。"""
        profile = self.registry.get_channel(request.channel_key)
        video_id = request.video_id.strip()
        if not video_id:
            raise MetadataValidationError("video_id must not be empty.")

        format_guard = self.registry.validate_format_guard(
            profile.key,
            format_id=request.format_id,
            spec_path=request.spec_path,
            episode_dir=request.episode_dir,
            artifact_paths=(request.caption_path,),
        )
        cap_info = validate_caption_file(request.caption_path, language=request.language)
        warnings: list[str] = []

        cap_api = "captions.update" if request.caption_id else "captions.insert"
        cap_cost_key = "captions_update" if request.caption_id else "captions_insert"
        planned_steps = [
            {"api": "channels.list", "purpose": "verify_channel_identity", "quota_units": self._cost("channels_list")},
            {"api": "videos.list", "purpose": "verify_video_ownership", "video_id": video_id, "quota_units": self._cost("videos_list")},
            {
                "api": cap_api,
                "purpose": "upload_caption",
                "video_id": video_id,
                "caption_id": request.caption_id,
                "file": cap_info,
                "name": request.name,
                "is_draft": request.is_draft,
                "quota_units": self._cost(cap_cost_key),
            },
        ]
        estimated_units = sum(int(s["quota_units"]) for s in planned_steps)
        preview = {
            "video_id": video_id,
            "caption_id": request.caption_id,
            "caption_file": cap_info,
            "name": request.name,
            "is_draft": request.is_draft,
        }

        if dry_run:
            local_auth = self._check_local_token_binding_for_dry_run(profile, warnings)
            return PublishResult(
                operation="caption",
                dry_run=True,
                channel_key=profile.key,
                display_name=profile.display_name,
                format_id=profile.format_id,
                video_id=video_id,
                video_url=f"https://www.youtube.com/watch?v={video_id}",
                authenticated_channel=local_auth,
                format_guard=format_guard,
                planned_steps=planned_steps,
                payload_preview=preview,
                warnings=warnings,
                quota=self._quota_report(estimated_units, consumed_units=0),
            )

        self.ledger.check_available("general", estimated_units, now=self._now())
        youtube, ch_info, identity = self._connect_and_verify_channel(profile)
        self._fetch_and_verify_video_ownership(
            youtube,
            video_id=video_id,
            expected_channel_id=ch_info.channel_id,
            channel_key=profile.key,
        )
        resp = self._upload_caption_exec(
            youtube,
            video_id=video_id,
            caption_path=request.caption_path,
            language=request.language,
            name=request.name,
            is_draft=request.is_draft,
            caption_id=request.caption_id,
        )
        executed_steps = [
            {"api": "channels.list", "status": "ok", "channel_id": ch_info.channel_id, "binding_state": identity["binding_state"], "quota_units": self._cost("channels_list")},
            {"api": "videos.list", "status": "ok", "video_id": video_id, "quota_units": self._cost("videos_list")},
            {"api": cap_api, "status": "ok", "caption_id": resp.get("id") or request.caption_id, "quota_units": self._cost(cap_cost_key)},
        ]
        consumed = sum(int(s["quota_units"]) for s in executed_steps)
        return PublishResult(
            operation="caption",
            dry_run=False,
            channel_key=profile.key,
            display_name=profile.display_name,
            format_id=profile.format_id,
            video_id=video_id,
            video_url=f"https://www.youtube.com/watch?v={video_id}",
            authenticated_channel=ch_info.to_dict(),
            format_guard=format_guard,
            planned_steps=planned_steps,
            executed_steps=executed_steps,
            payload_preview=preview,
            warnings=warnings,
            quota=self._quota_report(estimated_units, consumed_units=consumed),
        )

    def add_to_playlists(
        self,
        request: PlaylistAddRequest,
        *,
        dry_run: bool = True,
    ) -> PublishResult:
        """既存動画を指定再生リスト（複数可）に追加する。"""
        profile = self.registry.get_channel(request.channel_key)
        video_id = request.video_id.strip()
        if not video_id:
            raise MetadataValidationError("video_id must not be empty.")
        if not request.playlist_ids:
            raise MetadataValidationError("At least one playlist_id must be specified.")

        format_guard = self.registry.validate_format_guard(
            profile.key,
            format_id=request.format_id,
            spec_path=request.spec_path,
            episode_dir=request.episode_dir,
        )
        resolved_playlists = tuple(profile.resolve_playlist_id(pl) for pl in request.playlist_ids)
        warnings: list[str] = []

        planned_steps: list[dict[str, Any]] = [
            {"api": "channels.list", "purpose": "verify_channel_identity", "quota_units": self._cost("channels_list")},
            {"api": "videos.list", "purpose": "verify_video_ownership", "video_id": video_id, "quota_units": self._cost("videos_list")},
        ]
        for pl_id in resolved_playlists:
            planned_steps.append(
                {
                    "api": "playlistItems.insert",
                    "purpose": "add_to_playlist",
                    "video_id": video_id,
                    "playlist_id": pl_id,
                    "position": request.position,
                    "quota_units": self._cost("playlist_items_insert"),
                }
            )
        estimated_units = sum(int(s["quota_units"]) for s in planned_steps)
        preview = {
            "video_id": video_id,
            "playlist_ids": list(resolved_playlists),
            "position": request.position,
        }

        if dry_run:
            local_auth = self._check_local_token_binding_for_dry_run(profile, warnings)
            return PublishResult(
                operation="playlist",
                dry_run=True,
                channel_key=profile.key,
                display_name=profile.display_name,
                format_id=profile.format_id,
                video_id=video_id,
                video_url=f"https://www.youtube.com/watch?v={video_id}",
                authenticated_channel=local_auth,
                format_guard=format_guard,
                planned_steps=planned_steps,
                payload_preview=preview,
                warnings=warnings,
                quota=self._quota_report(estimated_units, consumed_units=0),
            )

        self.ledger.check_available("general", estimated_units, now=self._now())
        youtube, ch_info, identity = self._connect_and_verify_channel(profile)
        self._fetch_and_verify_video_ownership(
            youtube,
            video_id=video_id,
            expected_channel_id=ch_info.channel_id,
            channel_key=profile.key,
        )
        executed_steps: list[dict[str, Any]] = [
            {"api": "channels.list", "status": "ok", "channel_id": ch_info.channel_id, "binding_state": identity["binding_state"], "quota_units": self._cost("channels_list")},
            {"api": "videos.list", "status": "ok", "video_id": video_id, "quota_units": self._cost("videos_list")},
        ]
        for pl_id in resolved_playlists:
            resp = self._add_to_playlist_exec(
                youtube,
                video_id=video_id,
                playlist_id=pl_id,
                position=request.position,
            )
            executed_steps.append(
                {
                    "api": "playlistItems.insert",
                    "status": "ok",
                    "playlist_id": pl_id,
                    "playlist_item_id": resp.get("id"),
                    "quota_units": self._cost("playlist_items_insert"),
                }
            )
        consumed = sum(int(s["quota_units"]) for s in executed_steps)
        return PublishResult(
            operation="playlist",
            dry_run=False,
            channel_key=profile.key,
            display_name=profile.display_name,
            format_id=profile.format_id,
            video_id=video_id,
            video_url=f"https://www.youtube.com/watch?v={video_id}",
            authenticated_channel=ch_info.to_dict(),
            format_guard=format_guard,
            planned_steps=planned_steps,
            executed_steps=executed_steps,
            payload_preview=preview,
            warnings=warnings,
            quota=self._quota_report(estimated_units, consumed_units=consumed),
        )
