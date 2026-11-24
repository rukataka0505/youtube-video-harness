"""2チャンネル分離 YouTube OAuth 2.0 認証・投稿・メタデータ管理基盤の単体テスト。

実 API 通信・実ブラウザ起動・実 .env 読込は一切行わず、モック YouTube サービスと
一時ディレクトリ・インメモリ SQLite クォータ台帳を使って全安全ガードと動作を検証する。
"""

from __future__ import annotations

import io
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from google.oauth2.credentials import Credentials

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_SRC = REPO_ROOT / "pipeline" / "src"
PIPELINE_SCRIPTS = REPO_ROOT / "pipeline" / "scripts"
for _p in (str(PIPELINE_SRC), str(PIPELINE_SCRIPTS)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import youtube_auth  # noqa: E402
import youtube_publish  # noqa: E402
from yt_engine.publisher.auth import (  # noqa: E402
    AuthenticatedChannelInfo,
    YouTubeAuthError,
    authenticate_channel,
    get_all_channel_auth_statuses,
    load_channel_credentials,
    revoke_channel_token,
    save_channel_token,
    verify_channel_auth,
)
from yt_engine.publisher.channels import (  # noqa: E402
    ChannelMismatchError,
    ChannelsRegistry,
    load_channels_registry,
)
from yt_engine.publisher.youtube_publisher import (  # noqa: E402
    CaptionRequest,
    MetadataValidationError,
    PlaylistAddRequest,
    ThumbnailRequest,
    UpdateMetadataRequest,
    UploadRequest,
    YouTubePublisher,
    resolve_privacy_and_schedule,
    validate_video_metadata,
)
from yt_engine.quota import QuotaCircuitOpen, YouTubeQuotaLedger, redact_secrets  # noqa: E402

CH1_ID = "UC1111111111111111111111"
CH2_ID = "UC2222222222222222222222"
FIXED_NOW = datetime(2026, 11, 23, 12, 0, 0, tzinfo=timezone.utc)


def _make_dummy_credentials(
    token: str = "ya29.dummy-access",
    refresh_token: str = "1//dummy-refresh",
    *,
    expired: bool = False,
) -> Credentials:
    expiry = datetime(2020, 1, 1, 0, 0, 0) if expired else datetime(2099, 1, 1, 0, 0, 0)
    return Credentials(
        token=token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id="dummy-client-id.apps.googleusercontent.com",
        client_secret="dummy-client-secret-value",
        scopes=[
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube",
            "https://www.googleapis.com/auth/youtube.force-ssl",
            "https://www.googleapis.com/auth/youtube.readonly",
        ],
        expiry=expiry,
    )


class _FakeUploadStatus:
    def __init__(self, pct: float) -> None:
        self._pct = pct

    def progress(self) -> float:
        return self._pct


class _FakeResumableRequest:
    def __init__(self, response: dict[str, Any]) -> None:
        self._response = response
        self._calls = 0

    def next_chunk(self) -> tuple[Any, dict[str, Any] | None]:
        self._calls += 1
        if self._calls == 1:
            return _FakeUploadStatus(0.5), None
        return _FakeUploadStatus(1.0), self._response


class _FakeExecRequest:
    def __init__(self, response: dict[str, Any]) -> None:
        self._response = response

    def execute(self) -> dict[str, Any]:
        return self._response


class FakeYouTubeService:
    """YouTube Data API v3 リソースのインメモリモック。呼び出し履歴をすべて記録する。"""

    def __init__(
        self,
        *,
        channel_id: str,
        channel_title: str,
        handle: str = "@sample",
        existing_videos: dict[str, dict[str, Any]] | None = None,
        next_video_id: str = "VID_NEW_001",
    ) -> None:
        self.channel_id = channel_id
        self.channel_title = channel_title
        self.handle = handle
        self.existing_videos = dict(existing_videos or {})
        self.next_video_id = next_video_id
        self.calls: list[dict[str, Any]] = []

    def channels(self) -> "_FakeChannelsResource":
        return _FakeChannelsResource(self)

    def videos(self) -> "_FakeVideosResource":
        return _FakeVideosResource(self)

    def thumbnails(self) -> "_FakeThumbnailsResource":
        return _FakeThumbnailsResource(self)

    def captions(self) -> "_FakeCaptionsResource":
        return _FakeCaptionsResource(self)

    def playlistItems(self) -> "_FakePlaylistItemsResource":  # noqa: N802
        return _FakePlaylistItemsResource(self)


class _FakeChannelsResource:
    def __init__(self, parent: FakeYouTubeService) -> None:
        self.parent = parent

    def list(self, **kwargs: Any) -> _FakeExecRequest:
        self.parent.calls.append({"api": "channels.list", "kwargs": kwargs})
        return _FakeExecRequest(
            {
                "items": [
                    {
                        "id": self.parent.channel_id,
                        "snippet": {
                            "title": self.parent.channel_title,
                            "customUrl": self.parent.handle,
                        },
                        "statistics": {
                            "subscriberCount": "1234",
                            "videoCount": "12",
                        },
                    }
                ]
            }
        )


class _FakeVideosResource:
    def __init__(self, parent: FakeYouTubeService) -> None:
        self.parent = parent

    def list(self, **kwargs: Any) -> _FakeExecRequest:
        self.parent.calls.append({"api": "videos.list", "kwargs": kwargs})
        vid = str(kwargs.get("id", ""))
        item = self.parent.existing_videos.get(vid)
        return _FakeExecRequest({"items": [item] if item else []})

    def insert(self, **kwargs: Any) -> _FakeResumableRequest:
        self.parent.calls.append({"api": "videos.insert", "kwargs": kwargs})
        return _FakeResumableRequest({"id": self.parent.next_video_id})

    def update(self, **kwargs: Any) -> _FakeExecRequest:
        self.parent.calls.append({"api": "videos.update", "kwargs": kwargs})
        return _FakeExecRequest(kwargs.get("body", {}))


class _FakeThumbnailsResource:
    def __init__(self, parent: FakeYouTubeService) -> None:
        self.parent = parent

    def set(self, **kwargs: Any) -> _FakeExecRequest:
        self.parent.calls.append({"api": "thumbnails.set", "kwargs": kwargs})
        return _FakeExecRequest({"items": [{"default": {"url": "https://i.ytimg.com/vi/thumb.jpg"}}]})


class _FakeCaptionsResource:
    def __init__(self, parent: FakeYouTubeService) -> None:
        self.parent = parent

    def insert(self, **kwargs: Any) -> _FakeExecRequest:
        self.parent.calls.append({"api": "captions.insert", "kwargs": kwargs})
        return _FakeExecRequest({"id": "CAP_001"})

    def update(self, **kwargs: Any) -> _FakeExecRequest:
        self.parent.calls.append({"api": "captions.update", "kwargs": kwargs})
        return _FakeExecRequest({"id": kwargs.get("body", {}).get("id", "CAP_UPD")})


class _FakePlaylistItemsResource:
    def __init__(self, parent: FakeYouTubeService) -> None:
        self.parent = parent

    def insert(self, **kwargs: Any) -> _FakeExecRequest:
        self.parent.calls.append({"api": "playlistItems.insert", "kwargs": kwargs})
        return _FakeExecRequest({"id": "PLI_001"})


def _write_test_channels_yaml(
    base_dir: Path,
    *,
    ch1_expected_id: str = CH1_ID,
    ch2_expected_id: str = CH2_ID,
) -> Path:
    configs_dir = base_dir / "configs"
    configs_dir.mkdir(parents=True, exist_ok=True)
    secret_path = base_dir / "pipeline" / ".secrets" / "client_secret.json"
    secret_path.parent.mkdir(parents=True, exist_ok=True)
    secret_path.write_text(
        json.dumps(
            {
                "installed": {
                    "client_id": "dummy-client-id.apps.googleusercontent.com",
                    "client_secret": "dummy-client-secret-value",
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            }
        ),
        encoding="utf-8",
    )

    cfg = {
        "schema_version": 1,
        "oauth": {
            "client_secret_path": str(secret_path),
            "token_dir": str(base_dir / "pipeline" / ".secrets" / "youtube_tokens"),
            "scopes": [
                "https://www.googleapis.com/auth/youtube.upload",
                "https://www.googleapis.com/auth/youtube",
                "https://www.googleapis.com/auth/youtube.force-ssl",
                "https://www.googleapis.com/auth/youtube.readonly",
            ],
        },
        "defaults": {
            "privacy_status": "unlisted",
            "made_for_kids": False,
            "self_declared_made_for_kids": False,
            "default_language": "ja",
            "default_audio_language": "ja",
            "require_channel_id_match": True,
            "require_format_match": True,
            "max_title_length": 100,
            "max_description_length": 5000,
            "max_tags_total_chars": 500,
            "max_thumbnail_api_bytes": 2_097_152,
            "max_thumbnail_hard_bytes": 52_428_800,
        },
        "quota_costs": {
            "channels_list": 1,
            "videos_list": 1,
            "videos_insert": 1600,
            "videos_update": 50,
            "thumbnails_set": 50,
            "captions_insert": 400,
            "captions_update": 450,
            "playlist_items_insert": 50,
        },
        "channels": {
            "ch1_buguru": {
                "display_name": "バグる棒人間",
                "format_id": "stickman_collage",
                "format_aliases": ["stickman-collage", "buguru"],
                "path_keywords": ["stickman", "buguru"],
                "expected_channel_id": ch1_expected_id,
                "expected_channel_id_env": "TEST_YT_CH1_ID_UNUSED",
                "handle": "@buguru",
                "token_filename": "ch1_buguru_token.json",
                "default_category_id": "27",
                "default_privacy_status": "unlisted",
                "default_tags": ["バグる棒人間", "行動科学"],
                "playlists": {"default": "PL_BUGURU_MAIN"},
                "description_footer": "※出典は概要欄参照",
            },
            "ch2_akapen": {
                "display_name": "経済の赤ペン",
                "format_id": "planE_macro_econ",
                "format_aliases": ["plan-e", "plan_e", "akapen"],
                "path_keywords": ["plane", "plan-e", "plan_e", "akapen"],
                "expected_channel_id": ch2_expected_id,
                "expected_channel_id_env": "TEST_YT_CH2_ID_UNUSED",
                "handle": "@akapen",
                "token_filename": "ch2_akapen_token.json",
                "default_category_id": "27",
                "default_privacy_status": "unlisted",
                "default_tags": ["経済の赤ペン", "経済学"],
                "playlists": {"default": "PL_AKAPEN_MAIN"},
                "description_footer": "※特定の金融商品推奨ではありません",
            },
        },
    }
    cfg_path = configs_dir / "channels.yaml"
    cfg_path.write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return cfg_path


class TestRepoConfigAndSecurity(unittest.TestCase):
    """リポジトリ実設定（configs/channels.yaml・.gitignore・redact_secrets）の検証。"""

    def test_real_channels_yaml_defines_both_channels_with_unlisted_default(self) -> None:
        registry = load_channels_registry(load_env=False)
        self.assertIn("ch1_buguru", registry.channels)
        self.assertIn("ch2_akapen", registry.channels)
        self.assertEqual(registry.channels["ch1_buguru"].format_id, "stickman_collage")
        self.assertEqual(registry.channels["ch2_akapen"].format_id, "planE_macro_econ")
        self.assertEqual(registry.defaults.privacy_status, "unlisted")
        self.assertEqual(registry.channels["ch1_buguru"].default_privacy_status, "unlisted")
        self.assertEqual(registry.channels["ch2_akapen"].default_privacy_status, "unlisted")
        self.assertNotEqual(
            registry.channels["ch1_buguru"].token_filename,
            registry.channels["ch2_akapen"].token_filename,
        )

    def test_gitignore_protects_secrets_and_tokens(self) -> None:
        gitignore = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
        for expected_pattern in ("pipeline/.secrets/", "client_secret*.json", "*_token.json", "youtube_tokens/"):
            self.assertIn(expected_pattern, gitignore)

    def test_redact_secrets_masks_api_key_and_oauth_tokens(self) -> None:
        sample = (
            'url=https://api.example?key=AIzaSecret123 Authorization: Bearer ya29.SuperSecret '
            '{"refresh_token": "1//SecretRefresh", "client_secret": "GOCSPX-Secret"}'
        )
        redacted = redact_secrets(sample)
        self.assertNotIn("AIzaSecret123", redacted)
        self.assertNotIn("ya29.SuperSecret", redacted)
        self.assertNotIn("1//SecretRefresh", redacted)
        self.assertNotIn("GOCSPX-Secret", redacted)


class TestChannelMispostGuards(unittest.TestCase):
    """フォーマット不一致・パス混入・チャンネルID重複/不一致・所有権ガードの検証。"""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.cfg_path = _write_test_channels_yaml(self.base)
        self.registry = load_channels_registry(self.cfg_path, repo_root=self.base, load_env=False)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_format_mismatch_via_cli_and_spec_json_is_blocked(self) -> None:
        # ch1_buguru (stickman_collage) へ planE_macro_econ を渡すと拒否
        with self.assertRaises(ChannelMismatchError):
            self.registry.validate_format_guard("ch1_buguru", format_id="planE_macro_econ")

        # spec.json の formatId が別チャンネルのものなら拒否
        ep_dir = self.base / "episodes" / "ep01"
        ep_dir.mkdir(parents=True)
        (ep_dir / "spec.json").write_text(json.dumps({"formatId": "stickman_collage"}), encoding="utf-8")
        with self.assertRaises(ChannelMismatchError):
            self.registry.validate_format_guard("ch2_akapen", episode_dir=ep_dir)

        # 一致時は通過
        ok = self.registry.validate_format_guard("ch1_buguru", episode_dir=ep_dir)
        self.assertEqual(ok["status"], "ok")
        self.assertEqual(ok["detected_format_id"], "stickman_collage")

    def test_cross_channel_artifact_path_guard_blocks_wrong_file(self) -> None:
        wrong_video = self.base / "episodes" / "2026-11-23_akapen_ep01" / "final.mp4"
        with self.assertRaises(ChannelMismatchError):
            self.registry.validate_format_guard("ch1_buguru", artifact_paths=(wrong_video,))

        wrong_video_2 = self.base / "episodes" / "stickman_self_help" / "final.mp4"
        with self.assertRaises(ChannelMismatchError):
            self.registry.validate_format_guard("ch2_akapen", artifact_paths=(wrong_video_2,))

    def test_duplicate_expected_channel_id_in_yaml_is_rejected(self) -> None:
        dup_cfg = _write_test_channels_yaml(
            self.base / "dup",
            ch1_expected_id=CH1_ID,
            ch2_expected_id=CH1_ID,
        )
        with self.assertRaises(ChannelMismatchError):
            load_channels_registry(dup_cfg, repo_root=self.base / "dup", load_env=False)

    def test_brand_account_collision_during_auth_prevents_saving_token(self) -> None:
        # まず ch1_buguru を CH1_ID で正常認証
        cfg_unbound = _write_test_channels_yaml(self.base / "unbound", ch1_expected_id="", ch2_expected_id="")
        reg = load_channels_registry(cfg_unbound, repo_root=self.base / "unbound", load_env=False)
        ch1_service = FakeYouTubeService(channel_id=CH1_ID, channel_title="バグる棒人間", handle="@buguru")

        res1 = authenticate_channel(
            reg,
            "ch1_buguru",
            auth_flow_runner=lambda *a, **kw: _make_dummy_credentials("tok1"),
            youtube_service_factory=lambda _c: ch1_service,
        )
        self.assertEqual(res1.channel_info.channel_id, CH1_ID)
        self.assertTrue(Path(res1.token_path).is_file())

        # ch2_akapen で誤って同じ CH1_ID のブランドアカウントを選んでしまった場合 → 拒否＆トークン未保存
        with self.assertRaises(ChannelMismatchError):
            authenticate_channel(
                reg,
                "ch2_akapen",
                auth_flow_runner=lambda *a, **kw: _make_dummy_credentials("tok2"),
                youtube_service_factory=lambda _c: ch1_service,
            )
        ch2_token = reg.channels["ch2_akapen"].token_path(reg.oauth.token_dir)
        self.assertFalse(ch2_token.exists())


class TestTwoChannelOAuthAndVerify(unittest.TestCase):
    """2チャンネル分離 OAuth 認証・検証・書き戻し・リフレッシュ・ステータス・削除の検証。"""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.cfg_path = _write_test_channels_yaml(self.base, ch1_expected_id="", ch2_expected_id="")
        self.registry = load_channels_registry(self.cfg_path, repo_root=self.base, load_env=False)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_separate_auth_write_channel_id_and_verify_both_channels(self) -> None:
        conn = sqlite3.connect(":memory:")
        ledger = YouTubeQuotaLedger(conn)
        try:
            svc1 = FakeYouTubeService(channel_id=CH1_ID, channel_title="バグる棒人間", handle="@buguru")
            svc2 = FakeYouTubeService(channel_id=CH2_ID, channel_title="経済の赤ペン", handle="@akapen")

            r1 = authenticate_channel(
                self.registry,
                "ch1_buguru",
                write_channel_id=True,
                ledger=ledger,
                auth_flow_runner=lambda *a, **kw: _make_dummy_credentials("tok-ch1"),
                youtube_service_factory=lambda _c: svc1,
            )
            r2 = authenticate_channel(
                self.registry,
                "ch2_akapen",
                write_channel_id=True,
                ledger=ledger,
                auth_flow_runner=lambda *a, **kw: _make_dummy_credentials("tok-ch2"),
                youtube_service_factory=lambda _c: svc2,
            )
            self.assertTrue(r1.wrote_channel_id)
            self.assertTrue(r2.wrote_channel_id)
            self.assertNotEqual(r1.token_path, r2.token_path)

            # YAML へ書き戻された channel_id が再ロードで反映される
            reloaded = load_channels_registry(self.cfg_path, repo_root=self.base, load_env=False)
            self.assertEqual(reloaded.channels["ch1_buguru"].expected_channel_id, CH1_ID)
            self.assertEqual(reloaded.channels["ch2_akapen"].expected_channel_id, CH2_ID)

            # verify でクォータが計上され一致検証を通過する
            v1 = verify_channel_auth(
                reloaded,
                "ch1_buguru",
                require_bound=True,
                ledger=ledger,
                youtube_service_factory=lambda _c: svc1,
            )
            self.assertEqual(v1.binding_state, "matched")
            self.assertEqual(v1.channel_info.title, "バグる棒人間")
            self.assertEqual(ledger.get_used("general"), 3)  # auth x2 + verify x1

            # ステータス確認と revoke
            statuses = get_all_channel_auth_statuses(reloaded)
            self.assertTrue(all(s["state"] == "authenticated" for s in statuses))

            revoked = revoke_channel_token(reloaded, "ch1_buguru")
            self.assertTrue(revoked["deleted"])
            self.assertFalse(Path(r1.token_path).exists())
            self.assertTrue(Path(r2.token_path).exists())
        finally:
            conn.close()

    def test_verify_detects_mismatched_channel_id(self) -> None:
        cfg_bound = _write_test_channels_yaml(self.base / "bound", ch1_expected_id=CH1_ID, ch2_expected_id=CH2_ID)
        reg = load_channels_registry(cfg_bound, repo_root=self.base / "bound", load_env=False)
        token_path = reg.channels["ch1_buguru"].token_path(reg.oauth.token_dir)
        save_channel_token(token_path, channel_key="ch1_buguru", credentials=_make_dummy_credentials())

        wrong_svc = FakeYouTubeService(channel_id="UC9999999999999999999999", channel_title="別チャンネル")
        with self.assertRaises(ChannelMismatchError):
            verify_channel_auth(reg, "ch1_buguru", require_bound=True, youtube_service_factory=lambda _c: wrong_svc)

    def test_load_credentials_rejects_missing_or_wrong_channel_key_token(self) -> None:
        missing = self.registry.channels["ch1_buguru"].token_path(self.registry.oauth.token_dir)
        with self.assertRaises(YouTubeAuthError):
            load_channel_credentials(missing, scopes=self.registry.oauth.scopes, expected_channel_key="ch1_buguru")

        # 別チャンネルのトークンファイルを手動コピーして置いた場合も channel_key 不一致で検知
        save_channel_token(missing, channel_key="ch2_akapen", credentials=_make_dummy_credentials())
        with self.assertRaises(ChannelMismatchError):
            load_channel_credentials(missing, scopes=self.registry.oauth.scopes, expected_channel_key="ch1_buguru")

    def test_expired_token_auto_refreshes_and_persists_without_network(self) -> None:
        token_path = self.registry.channels["ch1_buguru"].token_path(self.registry.oauth.token_dir)
        save_channel_token(
            token_path,
            channel_key="ch1_buguru",
            credentials=_make_dummy_credentials("ya29.old-expired", expired=True),
            channel_info=AuthenticatedChannelInfo(channel_id=CH1_ID, title="バグる棒人間", handle="@buguru"),
        )

        class _MockAuthResponse:
            status = 200
            data = json.dumps({"access_token": "ya29.fresh-token", "expires_in": 3600}).encode("utf-8")

        def _mock_request(url: str, method: str = "GET", body: Any = None, headers: Any = None, **kw: Any) -> Any:
            return _MockAuthResponse()

        creds, binding, refreshed = load_channel_credentials(
            token_path,
            scopes=self.registry.oauth.scopes,
            expected_channel_key="ch1_buguru",
            auto_refresh=True,
            refresh_request_factory=lambda: _mock_request,
        )
        self.assertTrue(refreshed)
        self.assertEqual(creds.token, "ya29.fresh-token")
        self.assertEqual(binding["channel_id"], CH1_ID)

        # リフレッシュ後のトークンがディスクへ永続化されていること
        persisted = json.loads(token_path.read_text(encoding="utf-8"))
        self.assertEqual(persisted["credentials"]["token"], "ya29.fresh-token")

    def test_unbound_channel_is_blocked_on_execute_unless_explicitly_allowed(self) -> None:
        token_path = self.registry.channels["ch1_buguru"].token_path(self.registry.oauth.token_dir)
        save_channel_token(
            token_path,
            channel_key="ch1_buguru",
            credentials=_make_dummy_credentials("tok1"),
        )
        vid = self.base / "buguru_vid.mp4"
        vid.write_bytes(b"FAKE_MP4" * 10)
        svc = FakeYouTubeService(channel_id=CH1_ID, channel_title="バグる棒人間")
        conn = sqlite3.connect(":memory:")
        ledger = YouTubeQuotaLedger(conn)
        try:
            pub_strict = YouTubePublisher(
                self.registry,
                ledger=ledger,
                youtube_service_factory=lambda _c: svc,
                media_upload_factory=lambda path, **kw: {"path": path},
                allow_unbound_channel=False,
                now_provider=lambda: FIXED_NOW,
            )
            with self.assertRaises(ChannelMismatchError):
                pub_strict.upload_video(
                    UploadRequest(channel_key="ch1_buguru", video_path=vid, title="未バインド拒否テスト"),
                    dry_run=False,
                )
            self.assertNotIn("videos.insert", [c["api"] for c in svc.calls])
        finally:
            conn.close()


class TestMetadataValidationAndSchedule(unittest.TestCase):
    """メタデータ検証・デフォルト限定公開・予約公開 publishAt 整合性のテスト。"""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.cfg_path = _write_test_channels_yaml(self.base)
        self.registry = load_channels_registry(self.cfg_path, repo_root=self.base, load_env=False)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_default_privacy_is_unlisted_and_publish_at_forces_private(self) -> None:
        privacy, sched = resolve_privacy_and_schedule(None, None, default_privacy="unlisted", now=FIXED_NOW)
        self.assertEqual(privacy, "unlisted")
        self.assertIsNone(sched)

        # 予約公開指定時（privacy 未指定）→ private + UTC Z へ正規化
        privacy2, sched2 = resolve_privacy_and_schedule(
            None,
            "2026-12-01T18:00:00+09:00",
            default_privacy="unlisted",
            now=FIXED_NOW,
        )
        self.assertEqual(privacy2, "private")
        self.assertEqual(sched2, "2026-12-01T09:00:00Z")

    def test_invalid_publish_at_combinations_are_rejected(self) -> None:
        # publish_at + public/unlisted は矛盾エラー
        with self.assertRaises(MetadataValidationError):
            resolve_privacy_and_schedule("public", "2026-12-01T18:00:00+09:00", now=FIXED_NOW)
        with self.assertRaises(MetadataValidationError):
            resolve_privacy_and_schedule("unlisted", "2026-12-01T18:00:00+09:00", now=FIXED_NOW)
        # タイムゾーンなしはエラー
        with self.assertRaises(MetadataValidationError):
            resolve_privacy_and_schedule(None, "2026-12-01T18:00:00", now=FIXED_NOW)
        # 過去日時はエラー
        with self.assertRaises(MetadataValidationError):
            resolve_privacy_and_schedule(None, "2026-11-22T00:00:00Z", now=FIXED_NOW)

    def test_metadata_limits_and_forbidden_chars(self) -> None:
        # 101文字タイトル拒否
        with self.assertRaises(MetadataValidationError):
            validate_video_metadata(
                title="あ" * 101,
                description="ok",
                tags=("tag1",),
                category_id="27",
                registry=self.registry,
            )
        # < > 混入拒否
        with self.assertRaises(MetadataValidationError):
            validate_video_metadata(
                title="ダメな<タイトル>",
                description="ok",
                tags=("tag1",),
                category_id="27",
                registry=self.registry,
            )
        # 500文字超タグ拒否
        with self.assertRaises(MetadataValidationError):
            validate_video_metadata(
                title="正常タイトル",
                description="ok",
                tags=tuple(f"longtag{i:03d}_abcdefg" for i in range(40)),
                category_id="27",
                registry=self.registry,
            )
        # 非数値カテゴリID拒否
        with self.assertRaises(MetadataValidationError):
            validate_video_metadata(
                title="正常タイトル",
                description="ok",
                tags=("tag1",),
                category_id="Education",
                registry=self.registry,
            )


class TestYouTubePublisherDryRunExecuteAndQuota(unittest.TestCase):
    """dry-run 安全性・--execute 実行・クォータ記録・所有権チェック・CLI 統合テスト。"""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.cfg_path = _write_test_channels_yaml(self.base)
        self.registry = load_channels_registry(self.cfg_path, repo_root=self.base, load_env=False)

        # 両チャンネルのトークンを事前保存
        save_channel_token(
            self.registry.channels["ch1_buguru"].token_path(self.registry.oauth.token_dir),
            channel_key="ch1_buguru",
            credentials=_make_dummy_credentials("tok1"),
            channel_info=AuthenticatedChannelInfo(channel_id=CH1_ID, title="バグる棒人間", handle="@buguru"),
        )
        save_channel_token(
            self.registry.channels["ch2_akapen"].token_path(self.registry.oauth.token_dir),
            channel_key="ch2_akapen",
            credentials=_make_dummy_credentials("tok2"),
            channel_info=AuthenticatedChannelInfo(channel_id=CH2_ID, title="経済の赤ペン", handle="@akapen"),
        )

        # ダミーメディアファイル作成
        ep_dir = self.base / "episodes" / "buguru_ep01"
        ep_dir.mkdir(parents=True)
        (ep_dir / "spec.json").write_text(json.dumps({"formatId": "stickman_collage"}), encoding="utf-8")
        self.video_path = ep_dir / "final.mp4"
        self.video_path.write_bytes(b"FAKE_MP4_DATA" * 100)
        self.thumb_path = ep_dir / "thumb.png"
        self.thumb_path.write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 512)
        self.caption_path = ep_dir / "sub.srt"
        self.caption_path.write_text("1\n00:00:00,000 --> 00:00:02,000\nこんにちは\n", encoding="utf-8")
        self.ep_dir = ep_dir

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_upload_dry_run_makes_zero_api_calls_zero_quota_and_defaults_unlisted(self) -> None:
        conn = sqlite3.connect(":memory:")
        ledger = YouTubeQuotaLedger(conn)
        factory_called = False

        def _forbidden_factory(_creds: Credentials) -> Any:
            nonlocal factory_called
            factory_called = True
            raise AssertionError("dry-run must not initialize YouTube API service")

        try:
            pub = YouTubePublisher(
                self.registry,
                ledger=ledger,
                youtube_service_factory=_forbidden_factory,
                media_upload_factory=lambda *a, **kw: {"mock_media": a[0]},
                now_provider=lambda: FIXED_NOW,
            )
            res = pub.upload_video(
                UploadRequest(
                    channel_key="ch1_buguru",
                    video_path=self.video_path,
                    title="マルチタスクの罠",
                    description="解説概要欄",
                    thumbnail_path=self.thumb_path,
                    caption_path=self.caption_path,
                    playlist_ids=("default",),
                    episode_dir=self.ep_dir,
                ),
                dry_run=True,
            )
            self.assertTrue(res.dry_run)
            self.assertFalse(factory_called)
            self.assertEqual(res.privacy_status, "unlisted")
            self.assertEqual(res.quota["consumed_units"], 0)
            self.assertEqual(res.quota["estimated_units"], 1 + 1600 + 50 + 400 + 50)
            self.assertEqual(ledger.get_used("general", now=FIXED_NOW), 0)
            self.assertEqual(res.payload_preview["playlist_ids"], ["PL_BUGURU_MAIN"])
        finally:
            conn.close()

    def test_upload_execute_runs_all_steps_and_records_exact_quota(self) -> None:
        conn = sqlite3.connect(":memory:")
        ledger = YouTubeQuotaLedger(conn)
        svc = FakeYouTubeService(channel_id=CH1_ID, channel_title="バグる棒人間", handle="@buguru", next_video_id="VID_OK_999")
        progress_seen: list[float] = []

        try:
            pub = YouTubePublisher(
                self.registry,
                ledger=ledger,
                youtube_service_factory=lambda _c: svc,
                media_upload_factory=lambda path, **kw: {"path": path, **kw},
                now_provider=lambda: FIXED_NOW,
            )
            res = pub.upload_video(
                UploadRequest(
                    channel_key="ch1_buguru",
                    video_path=self.video_path,
                    title="マルチタスクの罠",
                    description="概要欄テスト",
                    append_footer=True,
                    thumbnail_path=self.thumb_path,
                    caption_path=self.caption_path,
                    playlist_ids=("default",),
                    episode_dir=self.ep_dir,
                ),
                dry_run=False,
                progress_callback=progress_seen.append,
            )
            self.assertFalse(res.dry_run)
            self.assertEqual(res.video_id, "VID_OK_999")
            self.assertEqual(res.privacy_status, "unlisted")
            self.assertEqual(progress_seen, [0.5, 1.0])

            called_apis = [c["api"] for c in svc.calls]
            self.assertEqual(
                called_apis,
                ["channels.list", "videos.insert", "thumbnails.set", "captions.insert", "playlistItems.insert"],
            )
            insert_body = svc.calls[1]["kwargs"]["body"]
            self.assertEqual(insert_body["status"]["privacyStatus"], "unlisted")
            self.assertFalse(insert_body["status"]["selfDeclaredMadeForKids"])
            self.assertIn("※出典は概要欄参照", insert_body["snippet"]["description"])

            expected_units = 1 + 1600 + 50 + 400 + 50
            self.assertEqual(res.quota["consumed_units"], expected_units)
            self.assertEqual(ledger.get_used("general", now=FIXED_NOW), expected_units)
        finally:
            conn.close()

    def test_upload_execute_halts_before_api_call_when_quota_insufficient(self) -> None:
        conn = sqlite3.connect(":memory:")
        ledger = YouTubeQuotaLedger(conn, limits={"search": 85, "batch_stats": 9000, "general": 1000})
        svc = FakeYouTubeService(channel_id=CH1_ID, channel_title="バグる棒人間")
        try:
            pub = YouTubePublisher(
                self.registry,
                ledger=ledger,
                youtube_service_factory=lambda _c: svc,
                media_upload_factory=lambda path, **kw: {"path": path},
                now_provider=lambda: FIXED_NOW,
            )
            with self.assertRaises(QuotaCircuitOpen):
                pub.upload_video(
                    UploadRequest(channel_key="ch1_buguru", video_path=self.video_path, title="クォータ超過テスト"),
                    dry_run=False,
                )
            self.assertEqual(svc.calls, [])
            self.assertEqual(ledger.get_used("general", now=FIXED_NOW), 0)
        finally:
            conn.close()

    def test_update_verifies_video_ownership_and_merges_existing_snippet(self) -> None:
        conn = sqlite3.connect(":memory:")
        ledger = YouTubeQuotaLedger(conn)
        svc = FakeYouTubeService(
            channel_id=CH2_ID,
            channel_title="経済の赤ペン",
            existing_videos={
                "VID_OWN": {
                    "id": "VID_OWN",
                    "snippet": {
                        "channelId": CH2_ID,
                        "title": "旧タイトル",
                        "description": "旧概要欄",
                        "categoryId": "27",
                        "tags": ["既存タグ"],
                    },
                    "status": {"privacyStatus": "unlisted", "embeddable": True},
                },
                "VID_OTHER": {
                    "id": "VID_OTHER",
                    "snippet": {
                        "channelId": CH1_ID,  # 別チャンネルの動画
                        "title": "他チャンネル動画",
                        "categoryId": "27",
                    },
                    "status": {"privacyStatus": "unlisted"},
                },
            },
        )
        try:
            pub = YouTubePublisher(
                self.registry,
                ledger=ledger,
                youtube_service_factory=lambda _c: svc,
                now_provider=lambda: FIXED_NOW,
            )
            # 別チャンネルの動画更新は所有権ガードで拒否（videos.update は呼ばれない）
            with self.assertRaises(ChannelMismatchError):
                pub.update_video_metadata(
                    UpdateMetadataRequest(channel_key="ch2_akapen", video_id="VID_OTHER", title="乗っ取り変更"),
                    dry_run=False,
                )
            self.assertNotIn("videos.update", [c["api"] for c in svc.calls])

            # 自チャンネル動画の予約公開＋タイトル更新 → 旧概要欄やカテゴリIDを維持しつつ更新
            res = pub.update_video_metadata(
                UpdateMetadataRequest(
                    channel_key="ch2_akapen",
                    video_id="VID_OWN",
                    title="新タイトル",
                    publish_at="2026-12-01T18:00:00+09:00",
                ),
                dry_run=False,
            )
            update_call = [c for c in svc.calls if c["api"] == "videos.update"][-1]
            body = update_call["kwargs"]["body"]
            self.assertEqual(body["snippet"]["title"], "新タイトル")
            self.assertEqual(body["snippet"]["description"], "旧概要欄")
            self.assertEqual(body["snippet"]["categoryId"], "27")
            self.assertEqual(body["status"]["privacyStatus"], "private")
            self.assertEqual(body["status"]["publishAt"], "2026-12-01T09:00:00Z")
            self.assertEqual(res.quota["consumed_units"], 1 + 1 + 50)
        finally:
            conn.close()

    def test_standalone_thumbnail_caption_playlist_and_2mb_warning(self) -> None:
        conn = sqlite3.connect(":memory:")
        ledger = YouTubeQuotaLedger(conn)
        big_thumb = self.ep_dir / "big_thumb.png"
        big_thumb.write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * (2_100_000))
        svc = FakeYouTubeService(
            channel_id=CH1_ID,
            channel_title="バグる棒人間",
            existing_videos={
                "VID_1": {"id": "VID_1", "snippet": {"channelId": CH1_ID, "title": "t", "categoryId": "27"}, "status": {"privacyStatus": "unlisted"}}
            },
        )
        try:
            pub = YouTubePublisher(
                self.registry,
                ledger=ledger,
                youtube_service_factory=lambda _c: svc,
                media_upload_factory=lambda path, **kw: {"path": path},
                now_provider=lambda: FIXED_NOW,
            )
            t_res = pub.set_thumbnail(
                ThumbnailRequest(channel_key="ch1_buguru", video_id="VID_1", thumbnail_path=big_thumb),
                dry_run=False,
            )
            self.assertTrue(any("2.00 MB" in w for w in t_res.warnings))

            c_res = pub.upload_caption(
                CaptionRequest(channel_key="ch1_buguru", video_id="VID_1", caption_path=self.caption_path),
                dry_run=False,
            )
            self.assertEqual(c_res.quota["consumed_units"], 1 + 1 + 400)

            p_res = pub.add_to_playlists(
                PlaylistAddRequest(channel_key="ch1_buguru", video_id="VID_1", playlist_ids=("default", "PL_EXTRA")),
                dry_run=False,
            )
            self.assertEqual(p_res.quota["consumed_units"], 1 + 1 + 100)
            self.assertEqual(ledger.get_used("general", now=FIXED_NOW), (1 + 1 + 50) + (1 + 1 + 400) + (1 + 1 + 100))
        finally:
            conn.close()

    def test_cli_defaults_to_dry_run_and_executes_only_with_flag(self) -> None:
        db_file = self.base / "quota.db"
        svc = FakeYouTubeService(channel_id=CH1_ID, channel_title="バグる棒人間", next_video_id="VID_CLI_01")

        def _factory(reg: ChannelsRegistry, args: Any) -> YouTubePublisher:
            return YouTubePublisher(
                reg,
                db_path=args.db_path,
                youtube_service_factory=lambda _c: svc,
                media_upload_factory=lambda path, **kw: {"path": path},
                now_provider=lambda: FIXED_NOW,
            )

        # 1) デフォルト（--execute なし）→ dry-run
        buf_dry = io.StringIO()
        with redirect_stdout(buf_dry):
            rc_dry = youtube_publish.main(
                [
                    "upload",
                    "--channel",
                    "ch1_buguru",
                    "--config",
                    str(self.cfg_path),
                    "--db-path",
                    str(db_file),
                    "--episode-dir",
                    str(self.ep_dir),
                    "--video",
                    str(self.video_path),
                    "--title",
                    "CLI dry-run テスト",
                    "--json",
                ],
                publisher_factory=_factory,
            )
        self.assertEqual(rc_dry, 0)
        dry_json = json.loads(buf_dry.getvalue())
        self.assertTrue(dry_json["dry_run"])
        self.assertEqual(dry_json["privacy_status"], "unlisted")
        self.assertEqual(svc.calls, [])

        # 2) --execute 明示時 → 実アップロード
        buf_exec = io.StringIO()
        with redirect_stdout(buf_exec):
            rc_exec = youtube_publish.main(
                [
                    "upload",
                    "--channel",
                    "ch1_buguru",
                    "--config",
                    str(self.cfg_path),
                    "--db-path",
                    str(db_file),
                    "--episode-dir",
                    str(self.ep_dir),
                    "--video",
                    str(self.video_path),
                    "--title",
                    "CLI execute テスト",
                    "--execute",
                    "--json",
                ],
                publisher_factory=_factory,
            )
        self.assertEqual(rc_exec, 0)
        exec_json = json.loads(buf_exec.getvalue())
        self.assertFalse(exec_json["dry_run"])
        self.assertEqual(exec_json["video_id"], "VID_CLI_01")
        self.assertEqual(exec_json["quota"]["consumed_units"], 1601)

        # 3) フォーマット不一致は CLI でも非0終了
        buf_err = io.StringIO()
        with redirect_stdout(buf_err), redirect_stderr(io.StringIO()):
            rc_bad = youtube_publish.main(
                [
                    "upload",
                    "--channel",
                    "ch2_akapen",
                    "--config",
                    str(self.cfg_path),
                    "--db-path",
                    str(db_file),
                    "--episode-dir",
                    str(self.ep_dir),  # stickman_collage のエピソード
                    "--video",
                    str(self.video_path),
                    "--title",
                    "誤爆テスト",
                    "--json",
                ],
                publisher_factory=_factory,
            )
        self.assertEqual(rc_bad, 1)
        self.assertFalse(json.loads(buf_err.getvalue())["ok"])

    def test_cli_subprocess_smoke_status_and_quota(self) -> None:
        proc_auth = subprocess.run(
            [
                sys.executable,
                str(REPO_ROOT / "pipeline" / "scripts" / "youtube_auth.py"),
                "--status",
                "--config",
                str(self.cfg_path),
                "--json",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc_auth.returncode, 0, msg=proc_auth.stderr)
        payload = json.loads(proc_auth.stdout)
        self.assertEqual(len(payload["channels"]), 2)

        proc_quota = subprocess.run(
            [
                sys.executable,
                str(REPO_ROOT / "pipeline" / "scripts" / "youtube_publish.py"),
                "quota",
                "--db-path",
                str(self.base / "smoke_quota.db"),
                "--json",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc_quota.returncode, 0, msg=proc_quota.stderr)
        quota_payload = json.loads(proc_quota.stdout)
        self.assertIn("general", quota_payload)


if __name__ == "__main__":
    unittest.main()
