"""2チャンネル分離 Google OAuth 2.0 認証・トークン管理・チャンネル検証モジュール。

特徴:
- 同一 Google アカウント配下のブランドアカウント2つを安全に分離認証（prompt="select_account consent"）
- 認証直後に channels.list(mine=true) で実チャンネルIDを確認し、他チャンネルとの重複や不一致時は保存せず拒否
- google-auth-oauthlib 優先利用 + 未導入環境向け標準ライブラリ/httpx PKCE Loopback フォールバック
- トークンは .gitignore 対象のローカル秘匿ディレクトリへチャンネル別ファイルでアトミック保存
"""

from __future__ import annotations

import base64
import hashlib
import http.server
import json
import os
import secrets
import threading
import urllib.parse
import webbrowser
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

import httpx
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from yt_engine.publisher.channels import (
    ChannelConfigError,
    ChannelMismatchError,
    ChannelProfile,
    ChannelsRegistry,
)
from yt_engine.quota import YouTubeQuotaLedger, redact_secrets

TOKEN_SCHEMA_VERSION = 1
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"


class YouTubeAuthError(RuntimeError):
    """OAuth 2.0 認証・トークン読込・チャンネル検証失敗時の例外（秘密情報はマスク済み）。"""

    def __init__(self, message: str) -> None:
        super().__init__(redact_secrets(message))


@dataclass(frozen=True)
class AuthenticatedChannelInfo:
    """channels.list(mine=true) で取得した認証済みチャンネルの実体情報。"""

    channel_id: str
    title: str
    handle: str
    subscriber_count: int = 0
    video_count: int = 0
    verified_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ChannelAuthResult:
    """認証または検証の結果サマリ。"""

    channel_key: str
    display_name: str
    format_id: str
    token_path: str
    channel_info: AuthenticatedChannelInfo
    binding_state: str
    expected_channel_id: str | None
    scopes: tuple[str, ...]
    token_refreshed: bool = False
    wrote_channel_id: bool = False

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["channel_info"] = self.channel_info.to_dict()
        data["scopes"] = list(self.scopes)
        return data


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def validate_client_secret_file(client_secret_path: Path) -> dict[str, Any]:
    """Google OAuth 2.0 client_secret.json の存在と構造を検証してクライアント設定辞書を返す。"""
    if not client_secret_path.is_file():
        raise YouTubeAuthError(
            f"OAuth client secret file not found: {client_secret_path}\n"
            "Google Cloud Console からデスクトップアプリ用 OAuth 2.0 クライアント JSON を取得し、"
            f"'{client_secret_path}' へ配置（または YOUTUBE_OAUTH_CLIENT_SECRET_PATH で指定）してください。"
        )
    try:
        raw = json.loads(client_secret_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise YouTubeAuthError(f"Failed to parse client_secret JSON '{client_secret_path}': {exc}") from exc

    if not isinstance(raw, dict):
        raise YouTubeAuthError(f"client_secret JSON must be an object: {client_secret_path}")

    section = raw.get("installed") or raw.get("web")
    if not isinstance(section, dict):
        raise YouTubeAuthError(
            f"Invalid Google OAuth client_secret JSON (missing 'installed' or 'web' section): {client_secret_path}"
        )

    for required_key in ("client_id", "client_secret", "auth_uri", "token_uri"):
        if not str(section.get(required_key) or "").strip():
            raise YouTubeAuthError(
                f"Invalid client_secret JSON: missing required field '{required_key}'."
            )
    return section


def _chmod_owner_only(path: Path) -> None:
    try:
        os.chmod(path, 0o600)
    except OSError:
        # Windows 等で POSIX chmod が制限される場合は無視
        pass


def save_channel_token(
    token_path: Path,
    *,
    channel_key: str,
    credentials: Credentials,
    channel_info: AuthenticatedChannelInfo | None = None,
) -> Path:
    """チャンネル別 OAuth トークンを 2層JSON 形式でアトミック保存する。"""
    token_path.parent.mkdir(parents=True, exist_ok=True)
    cred_payload = json.loads(credentials.to_json())
    wrapper: dict[str, Any] = {
        "schema_version": TOKEN_SCHEMA_VERSION,
        "channel_key": channel_key,
        "updated_at": _utc_now_iso(),
        "channel_binding": channel_info.to_dict() if channel_info is not None else {},
        "credentials": cred_payload,
    }
    tmp_path = token_path.with_suffix(token_path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(wrapper, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _chmod_owner_only(tmp_path)
    os.replace(tmp_path, token_path)
    _chmod_owner_only(token_path)
    return token_path


def read_token_metadata(token_path: Path) -> dict[str, Any] | None:
    """トークンファイルからシークレットを除いたメタデータのみを安全に読み出す。"""
    if not token_path.is_file():
        return None
    try:
        raw = json.loads(token_path.read_text(encoding="utf-8"))
    except Exception:
        return {"corrupted": True, "token_path": str(token_path)}
    if not isinstance(raw, dict):
        return {"corrupted": True, "token_path": str(token_path)}

    cred_obj = raw.get("credentials") if isinstance(raw.get("credentials"), dict) else raw
    binding = raw.get("channel_binding") if isinstance(raw.get("channel_binding"), dict) else {}
    return {
        "corrupted": False,
        "token_path": str(token_path),
        "channel_key": str(raw.get("channel_key") or ""),
        "updated_at": str(raw.get("updated_at") or ""),
        "channel_id": str(binding.get("channel_id") or ""),
        "channel_title": str(binding.get("title") or ""),
        "handle": str(binding.get("handle") or ""),
        "verified_at": str(binding.get("verified_at") or ""),
        "has_refresh_token": bool(cred_obj.get("refresh_token")),
        "expiry": str(cred_obj.get("expiry") or ""),
        "scopes": list(cred_obj.get("scopes") or []),
    }


def load_channel_credentials(
    token_path: Path,
    *,
    scopes: Sequence[str],
    expected_channel_key: str | None = None,
    auto_refresh: bool = True,
    refresh_request_factory: Callable[[], Any] | None = None,
) -> tuple[Credentials, dict[str, Any], bool]:
    """チャンネル別トークンファイルから Credentials を復元し、必要ならリフレッシュして保存する。"""
    if not token_path.is_file():
        hint = (
            f" Run `python pipeline/scripts/youtube_auth.py --channel {expected_channel_key}` first."
            if expected_channel_key
            else ""
        )
        raise YouTubeAuthError(f"OAuth token file not found: {token_path}.{hint}")

    try:
        raw = json.loads(token_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise YouTubeAuthError(f"Failed to read token file '{token_path}': {exc}") from exc

    if not isinstance(raw, dict):
        raise YouTubeAuthError(f"Token file must contain a JSON object: {token_path}")

    stored_key = str(raw.get("channel_key") or "").strip()
    if expected_channel_key and stored_key and stored_key != expected_channel_key:
        raise ChannelMismatchError(
            f"Token file '{token_path}' belongs to channel_key '{stored_key}', "
            f"not '{expected_channel_key}'."
        )

    cred_info = raw.get("credentials") if isinstance(raw.get("credentials"), dict) else raw
    binding = raw.get("channel_binding") if isinstance(raw.get("channel_binding"), dict) else {}

    try:
        creds = Credentials.from_authorized_user_info(cred_info, scopes=list(scopes))
    except Exception as exc:
        raise YouTubeAuthError(f"Invalid OAuth credentials in '{token_path}': {exc}") from exc

    refreshed = False
    if auto_refresh and (not creds.valid) and creds.expired and creds.refresh_token:
        req = refresh_request_factory() if refresh_request_factory is not None else GoogleAuthRequest()
        try:
            creds.refresh(req)
        except Exception as exc:
            raise YouTubeAuthError(
                f"Failed to refresh expired OAuth token for '{expected_channel_key or token_path.name}': {exc}"
            ) from exc
        refreshed = True
        info_obj = (
            AuthenticatedChannelInfo(
                channel_id=str(binding.get("channel_id") or ""),
                title=str(binding.get("title") or ""),
                handle=str(binding.get("handle") or ""),
                subscriber_count=int(binding.get("subscriber_count") or 0),
                video_count=int(binding.get("video_count") or 0),
                verified_at=str(binding.get("verified_at") or ""),
            )
            if binding.get("channel_id")
            else None
        )
        save_channel_token(
            token_path,
            channel_key=expected_channel_key or stored_key or token_path.stem,
            credentials=creds,
            channel_info=info_obj,
        )

    return creds, binding, refreshed


def collect_other_bound_channel_ids(
    registry: ChannelsRegistry,
    *,
    exclude_channel_key: str,
) -> dict[str, str]:
    """他チャンネルの保存済みトークンメタデータから channel_id 一覧を収集する。"""
    others: dict[str, str] = {}
    for key, profile in registry.channels.items():
        if key == exclude_channel_key:
            continue
        meta = read_token_metadata(profile.token_path(registry.oauth.token_dir))
        if meta and not meta.get("corrupted") and meta.get("channel_id"):
            others[key] = str(meta["channel_id"])
    return others


def build_youtube_service(credentials: Credentials) -> Any:
    """googleapiclient で YouTube Data API v3 クライアントを構築する。"""
    return build("youtube", "v3", credentials=credentials, cache_discovery=False)


def fetch_authenticated_channel_info(
    youtube_service: Any,
    *,
    ledger: YouTubeQuotaLedger | None = None,
    quota_cost: int = 1,
    now: datetime | None = None,
) -> AuthenticatedChannelInfo:
    """channels.list(mine=true) で現在の OAuth トークンに紐づくチャンネル情報を取得する。"""
    if ledger is not None and quota_cost > 0:
        ledger.consume("general", units=quota_cost, now=now)

    try:
        response = (
            youtube_service.channels()
            .list(part="id,snippet,statistics", mine=True)
            .execute()
        )
    except Exception as exc:
        raise YouTubeAuthError(f"Failed to query channels.list(mine=true): {exc}") from exc

    items = response.get("items") if isinstance(response, dict) else None
    if not items:
        raise YouTubeAuthError(
            "No YouTube channel found for the authenticated Google/brand account. "
            "ブランドアカウント側に YouTube チャンネルが作成されているか確認してください。"
        )

    item = items[0]
    snippet = item.get("snippet") or {}
    stats = item.get("statistics") or {}
    custom_url = str(snippet.get("customUrl") or "").strip()
    if custom_url and not custom_url.startswith("@"):
        custom_url = f"@{custom_url}"

    return AuthenticatedChannelInfo(
        channel_id=str(item.get("id") or "").strip(),
        title=str(snippet.get("title") or "").strip(),
        handle=custom_url,
        subscriber_count=int(stats.get("subscriberCount") or 0),
        video_count=int(stats.get("videoCount") or 0),
        verified_at=_utc_now_iso(),
    )


def _run_pkce_loopback_oauth_flow(
    client_secret_path: Path,
    scopes: Sequence[str],
    *,
    port: int = 0,
    open_browser: bool = True,
    timeout_sec: float = 300.0,
) -> Credentials:
    """google-auth-oauthlib 未導入時用の RFC 8252 + PKCE (S256) Loopback OAuth 2.0 実装。"""
    cfg = validate_client_secret_file(client_secret_path)
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode("ascii")).digest())
        .decode("ascii")
        .rstrip("=")
    )
    state = secrets.token_urlsafe(24)

    result: dict[str, str] = {}
    done_event = threading.Event()

    class _CallbackHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            if "error" in params:
                result["error"] = params["error"][0]
            elif "code" in params:
                result["code"] = params["code"][0]
                result["state"] = params.get("state", [""])[0]
            else:
                self.send_response(404)
                self.end_headers()
                return

            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                (
                    "<html><body style='font-family:sans-serif;padding:24px;'>"
                    "<h2>YouTube OAuth 認証コードを受信しました</h2>"
                    "<p>このタブを閉じてターミナルへ戻ってください。</p>"
                    "</body></html>"
                ).encode("utf-8")
            )
            done_event.set()

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            return

    server = http.server.HTTPServer(("127.0.0.1", port), _CallbackHandler)
    actual_port = server.server_address[1]
    redirect_uri = f"http://127.0.0.1:{actual_port}/"

    auth_params = {
        "client_id": cfg["client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "select_account consent",
        "include_granted_scopes": "false",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    auth_url = f"{cfg['auth_uri']}?{urllib.parse.urlencode(auth_params)}"

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        print(f"\n[OAuth URL] {auth_url}\n")
        if open_browser:
            webbrowser.open(auth_url, new=1, autoraise=True)
        if not done_event.wait(timeout=timeout_sec):
            raise YouTubeAuthError(
                f"OAuth browser callback timed out after {int(timeout_sec)} seconds."
            )
    finally:
        server.shutdown()
        server.server_close()

    if "error" in result:
        raise YouTubeAuthError(f"OAuth authorization rejected: {result['error']}")
    if result.get("state") != state:
        raise YouTubeAuthError("OAuth state mismatch detected. Aborting for security.")
    auth_code = result.get("code", "")
    if not auth_code:
        raise YouTubeAuthError("OAuth authorization code was not received.")

    token_resp = httpx.post(
        cfg["token_uri"],
        data={
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "code": auth_code,
            "code_verifier": code_verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        },
        timeout=30.0,
    )
    if token_resp.status_code >= 400:
        raise YouTubeAuthError(
            f"OAuth token exchange failed (HTTP {token_resp.status_code}): {token_resp.text[:300]}"
        )

    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    if not access_token:
        raise YouTubeAuthError("OAuth token response missing access_token.")

    expires_in = token_data.get("expires_in")
    expiry: datetime | None = None
    if expires_in is not None:
        try:
            expiry = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=int(expires_in))
        except (TypeError, ValueError):
            expiry = None

    return Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri=cfg["token_uri"],
        client_id=cfg["client_id"],
        client_secret=cfg["client_secret"],
        scopes=list(scopes),
        expiry=expiry,
    )


def run_browser_oauth_flow(
    client_secret_path: Path,
    scopes: Sequence[str],
    *,
    port: int = 0,
    open_browser: bool = True,
) -> Credentials:
    """google-auth-oauthlib 優先でブラウザ OAuth 2.0 認証を実行する。"""
    validate_client_secret_file(client_secret_path)
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow  # type: ignore[import-not-found]
    except ImportError:
        return _run_pkce_loopback_oauth_flow(
            client_secret_path,
            scopes,
            port=port,
            open_browser=open_browser,
        )

    flow = InstalledAppFlow.from_client_secrets_file(
        str(client_secret_path),
        scopes=list(scopes),
    )
    return flow.run_local_server(
        host="127.0.0.1",
        port=port,
        access_type="offline",
        prompt="select_account consent",
        include_granted_scopes="false",
        open_browser=open_browser,
    )


def authenticate_channel(
    registry: ChannelsRegistry,
    channel_key: str,
    *,
    port: int = 0,
    open_browser: bool = True,
    write_channel_id: bool = False,
    ledger: YouTubeQuotaLedger | None = None,
    auth_flow_runner: Callable[..., Credentials] | None = None,
    youtube_service_factory: Callable[[Credentials], Any] | None = None,
) -> ChannelAuthResult:
    """指定チャンネルをブラウザ認証し、実チャンネルID検証通過後にトークンを保存する。"""
    profile: ChannelProfile = registry.get_channel(channel_key)
    runner = auth_flow_runner or run_browser_oauth_flow
    creds = runner(
        registry.oauth.client_secret_path,
        registry.oauth.scopes,
        port=port,
        open_browser=open_browser,
    )

    service_factory = youtube_service_factory or build_youtube_service
    youtube = service_factory(creds)
    channel_info = fetch_authenticated_channel_info(
        youtube,
        ledger=ledger,
        quota_cost=registry.quota_costs.get("channels_list", 1),
    )

    other_bound = collect_other_bound_channel_ids(registry, exclude_channel_key=profile.key)
    # 認証段階では未バインド(expected_channel_id空)を許容するが、
    # 既設定IDとの不一致や他チャンネルとのブランドアカウント衝突は厳格に拒否して保存しない
    identity = registry.validate_channel_identity(
        profile.key,
        channel_info.channel_id,
        actual_title=channel_info.title,
        require_bound=False,
        other_bound_ids=other_bound,
    )

    token_path = profile.token_path(registry.oauth.token_dir)
    save_channel_token(
        token_path,
        channel_key=profile.key,
        credentials=creds,
        channel_info=channel_info,
    )

    wrote_id = False
    if write_channel_id:
        registry.write_channel_binding(
            profile.key,
            channel_info.channel_id,
            handle=channel_info.handle,
        )
        wrote_id = True

    granted_scopes = tuple(creds.scopes or registry.oauth.scopes)
    return ChannelAuthResult(
        channel_key=profile.key,
        display_name=profile.display_name,
        format_id=profile.format_id,
        token_path=str(token_path),
        channel_info=channel_info,
        binding_state="matched" if wrote_id else str(identity["binding_state"]),
        expected_channel_id=channel_info.channel_id if wrote_id else identity["expected_channel_id"],
        scopes=granted_scopes,
        token_refreshed=False,
        wrote_channel_id=wrote_id,
    )


def verify_channel_auth(
    registry: ChannelsRegistry,
    channel_key: str,
    *,
    require_bound: bool = False,
    write_channel_id: bool = False,
    ledger: YouTubeQuotaLedger | None = None,
    youtube_service_factory: Callable[[Credentials], Any] | None = None,
    refresh_request_factory: Callable[[], Any] | None = None,
) -> ChannelAuthResult:
    """保存済みトークンで channels.list(mine=true) を照合し、チャンネル名・ID・誤爆整合性を検証する。"""
    profile = registry.get_channel(channel_key)
    token_path = profile.token_path(registry.oauth.token_dir)
    creds, _binding, refreshed = load_channel_credentials(
        token_path,
        scopes=registry.oauth.scopes,
        expected_channel_key=profile.key,
        auto_refresh=True,
        refresh_request_factory=refresh_request_factory,
    )

    service_factory = youtube_service_factory or build_youtube_service
    youtube = service_factory(creds)
    channel_info = fetch_authenticated_channel_info(
        youtube,
        ledger=ledger,
        quota_cost=registry.quota_costs.get("channels_list", 1),
    )

    other_bound = collect_other_bound_channel_ids(registry, exclude_channel_key=profile.key)
    identity = registry.validate_channel_identity(
        profile.key,
        channel_info.channel_id,
        actual_title=channel_info.title,
        require_bound=require_bound,
        other_bound_ids=other_bound,
    )

    # 検証できた最新のチャンネル情報をトークンメタデータにも同期保存
    save_channel_token(
        token_path,
        channel_key=profile.key,
        credentials=creds,
        channel_info=channel_info,
    )

    wrote_id = False
    if write_channel_id:
        registry.write_channel_binding(
            profile.key,
            channel_info.channel_id,
            handle=channel_info.handle,
        )
        wrote_id = True

    granted_scopes = tuple(creds.scopes or registry.oauth.scopes)
    return ChannelAuthResult(
        channel_key=profile.key,
        display_name=profile.display_name,
        format_id=profile.format_id,
        token_path=str(token_path),
        channel_info=channel_info,
        binding_state="matched" if wrote_id else str(identity["binding_state"]),
        expected_channel_id=channel_info.channel_id if wrote_id else identity["expected_channel_id"],
        scopes=granted_scopes,
        token_refreshed=refreshed,
        wrote_channel_id=wrote_id,
    )


def get_all_channel_auth_statuses(registry: ChannelsRegistry) -> list[dict[str, Any]]:
    """外部API通信なしで全チャンネルのローカル認証・トークン・バインド状態を一覧診断する。"""
    statuses: list[dict[str, Any]] = []
    seen_token_channel_ids: dict[str, str] = {}

    for key, profile in registry.channels.items():
        token_path = profile.token_path(registry.oauth.token_dir)
        meta = read_token_metadata(token_path)
        expected_id = profile.effective_expected_channel_id or None
        bound_id = str(meta.get("channel_id") or "") if meta and not meta.get("corrupted") else ""

        warnings: list[str] = []
        if meta is None:
            state = "not_authenticated"
        elif meta.get("corrupted"):
            state = "corrupted_token"
            warnings.append("トークンJSONが破損しています。再認証してください。")
        else:
            state = "authenticated"
            if expected_id and bound_id and expected_id != bound_id:
                state = "channel_id_mismatch"
                warnings.append(
                    f"expected_channel_id ({expected_id}) と保存トークンの channel_id ({bound_id}) が不一致です。"
                )
            elif not expected_id:
                warnings.append(
                    "expected_channel_id が未設定です。--verify --write-channel-id で確定してください。"
                )
            if bound_id:
                if bound_id in seen_token_channel_ids:
                    state = "brand_account_collision"
                    warnings.append(
                        f"ブランドアカウント重複: '{seen_token_channel_ids[bound_id]}' と同一の channel_id ({bound_id}) です。"
                    )
                else:
                    seen_token_channel_ids[bound_id] = key

        statuses.append(
            {
                "channel_key": key,
                "display_name": profile.display_name,
                "format_id": profile.format_id,
                "expected_channel_id": expected_id,
                "token_path": str(token_path),
                "token_exists": token_path.is_file(),
                "state": state,
                "bound_channel_id": bound_id or None,
                "bound_channel_title": (meta or {}).get("channel_title") or None,
                "bound_handle": (meta or {}).get("handle") or None,
                "has_refresh_token": bool((meta or {}).get("has_refresh_token", False)),
                "verified_at": (meta or {}).get("verified_at") or None,
                "warnings": warnings,
            }
        )
    return statuses


def revoke_channel_token(
    registry: ChannelsRegistry,
    channel_key: str,
    *,
    revoke_remote: bool = False,
    http_post: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    """指定チャンネルのローカル保存トークンを削除する（任意で Google 側 revoke も送信）。"""
    profile = registry.get_channel(channel_key)
    token_path = profile.token_path(registry.oauth.token_dir)
    if not token_path.is_file():
        return {
            "channel_key": profile.key,
            "token_path": str(token_path),
            "deleted": False,
            "remote_revoked": False,
        }

    remote_revoked = False
    if revoke_remote:
        try:
            creds, _binding, _refreshed = load_channel_credentials(
                token_path,
                scopes=registry.oauth.scopes,
                expected_channel_key=profile.key,
                auto_refresh=False,
            )
            token_to_revoke = creds.refresh_token or creds.token
            if token_to_revoke:
                post_fn = http_post or httpx.post
                resp = post_fn(
                    GOOGLE_REVOKE_URL,
                    params={"token": token_to_revoke},
                    headers={"content-type": "application/x-www-form-urlencoded"},
                    timeout=15.0,
                )
                remote_revoked = getattr(resp, "status_code", 0) == 200
        except Exception:
            remote_revoked = False

    token_path.unlink(missing_ok=True)
    return {
        "channel_key": profile.key,
        "token_path": str(token_path),
        "deleted": True,
        "remote_revoked": remote_revoked,
    }
