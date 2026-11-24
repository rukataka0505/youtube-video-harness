"""2チャンネル運用設定（configs/channels.yaml）ローダーおよび誤爆防止ガード。"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Sequence

import yaml

from yt_engine.collector.youtube_client import load_dotenv_file
from yt_engine.config import find_repo_root

DEFAULT_QUOTA_COSTS: dict[str, int] = {
    "channels_list": 1,
    "videos_list": 1,
    "videos_insert": 1600,
    "videos_update": 50,
    "thumbnails_set": 50,
    "captions_insert": 400,
    "captions_update": 450,
    "playlist_items_insert": 50,
    "playlists_list": 1,
}

DEFAULT_OAUTH_SCOPES: tuple[str, ...] = (
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube.readonly",
)

VALID_PRIVACY_STATUSES: frozenset[str] = frozenset({"private", "unlisted", "public"})
CHANNEL_ID_RE = re.compile(r"^UC[A-Za-z0-9_\-]{10,}$")


class ChannelConfigError(ValueError):
    """configs/channels.yaml の定義不備または未定義チャンネル指定エラー。"""


class ChannelMismatchError(ValueError):
    """フォーマット・チャンネルID・ブランドアカウント・所有権の不一致による誤爆防止停止例外。"""


def _normalize_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.strip().lower())


def _resolve_path(raw: str | Path, repo_root: Path) -> Path:
    path = Path(raw).expanduser()
    if path.is_absolute():
        return path
    return (repo_root / path).resolve()


@dataclass(frozen=True)
class OAuthSettings:
    """OAuth 2.0 クライアントシークレット・トークン保存先・スコープ設定。"""

    client_secret_path: Path
    token_dir: Path
    scopes: tuple[str, ...] = DEFAULT_OAUTH_SCOPES


@dataclass(frozen=True)
class PublishDefaults:
    """投稿共通の安全既定値およびメタデータ制限値。"""

    privacy_status: str = "unlisted"
    made_for_kids: bool = False
    self_declared_made_for_kids: bool = False
    default_language: str = "ja"
    default_audio_language: str = "ja"
    embeddable: bool = True
    public_stats_viewable: bool = True
    license: str = "youtube"
    require_channel_id_match: bool = True
    require_format_match: bool = True
    max_title_length: int = 100
    max_description_length: int = 5000
    max_tags_total_chars: int = 500
    max_thumbnail_api_bytes: int = 2_097_152
    max_thumbnail_hard_bytes: int = 52_428_800


@dataclass(frozen=True)
class ChannelProfile:
    """1チャンネル分の設定プロファイル。"""

    key: str
    display_name: str
    format_id: str
    format_aliases: tuple[str, ...] = ()
    path_keywords: tuple[str, ...] = ()
    harness: str = ""
    theme: str = ""
    expected_channel_id: str = ""
    expected_channel_id_env: str = ""
    handle: str = ""
    token_filename: str = ""
    default_category_id: str = "27"
    default_privacy_status: str = "unlisted"
    default_language: str = "ja"
    default_audio_language: str = "ja"
    default_tags: tuple[str, ...] = ()
    playlists: Mapping[str, str] = field(default_factory=dict)
    description_footer: str = ""

    @property
    def effective_expected_channel_id(self) -> str:
        """環境変数上書きを優先した期待チャンネルID（UC...）を返す。"""
        if self.expected_channel_id_env:
            env_val = os.environ.get(self.expected_channel_id_env, "").strip()
            if env_val:
                return env_val
        return self.expected_channel_id.strip()

    @property
    def normalized_format_tokens(self) -> frozenset[str]:
        tokens = {_normalize_token(self.format_id)}
        for alias in self.format_aliases:
            norm = _normalize_token(alias)
            if norm:
                tokens.add(norm)
        return frozenset(tokens)

    def matches_format(self, format_id: str) -> bool:
        """指定された formatId がこのチャンネルに属するか判定する。"""
        norm = _normalize_token(format_id)
        if not norm:
            return False
        return norm in self.normalized_format_tokens

    def token_path(self, token_dir: Path) -> Path:
        filename = self.token_filename.strip() or f"{self.key}_token.json"
        return (token_dir / filename).resolve()

    def resolve_playlist_id(self, playlist_ref: str) -> str:
        """再生リストのエイリアス名（例: default）を実 Playlist ID へ解決する。"""
        cleaned = playlist_ref.strip()
        if not cleaned:
            raise ChannelConfigError("Playlist identifier must not be empty.")
        if cleaned in self.playlists:
            resolved = str(self.playlists[cleaned]).strip()
            if not resolved:
                raise ChannelConfigError(
                    f"Channel '{self.key}' playlist alias '{cleaned}' is empty in configs/channels.yaml."
                )
            return resolved
        return cleaned


@dataclass(frozen=True)
class ChannelsRegistry:
    """全チャンネル設定と誤爆防止バリデーションを統括するレジストリ。"""

    oauth: OAuthSettings
    defaults: PublishDefaults
    quota_costs: Mapping[str, int]
    channels: Mapping[str, ChannelProfile]
    config_path: Path
    repo_root: Path

    def get_channel(self, channel_key: str) -> ChannelProfile:
        cleaned = channel_key.strip()
        if cleaned not in self.channels:
            available = ", ".join(sorted(self.channels.keys()))
            raise ChannelConfigError(
                f"Unknown channel key '{channel_key}'. Available channels: {available}"
            )
        return self.channels[cleaned]

    def find_channel_by_format(self, format_id: str) -> ChannelProfile | None:
        for profile in self.channels.values():
            if profile.matches_format(format_id):
                return profile
        return None

    def find_channel_by_channel_id(self, channel_id: str) -> ChannelProfile | None:
        cleaned = channel_id.strip()
        if not cleaned:
            return None
        for profile in self.channels.values():
            if profile.effective_expected_channel_id == cleaned:
                return profile
        return None

    def validate_unique_bindings(self) -> None:
        """複数チャンネルに同一の expected_channel_id やトークンファイルが割り当てられていないか検証する。"""
        seen_ids: dict[str, str] = {}
        seen_tokens: dict[str, str] = {}
        for key, profile in self.channels.items():
            cid = profile.effective_expected_channel_id
            if cid:
                if not CHANNEL_ID_RE.match(cid):
                    raise ChannelConfigError(
                        f"Channel '{key}' has invalid expected_channel_id '{cid}' (must start with 'UC')."
                    )
                if cid in seen_ids:
                    raise ChannelMismatchError(
                        f"Duplicate expected_channel_id '{cid}' assigned to both "
                        f"'{seen_ids[cid]}' and '{key}'. Separate brand accounts are required."
                    )
                seen_ids[cid] = key

            token_name = (profile.token_filename or f"{key}_token.json").strip().lower()
            if token_name in seen_tokens:
                raise ChannelConfigError(
                    f"Duplicate token_filename '{token_name}' assigned to both "
                    f"'{seen_tokens[token_name]}' and '{key}'."
                )
            seen_tokens[token_name] = key

    def extract_format_from_spec(
        self,
        *,
        spec_path: Path | None = None,
        episode_dir: Path | None = None,
    ) -> tuple[str | None, Path | None]:
        """spec.json または episode_dir/spec.json から formatId を抽出する。"""
        target: Path | None = None
        if spec_path is not None:
            target = Path(spec_path)
            if not target.is_file():
                raise FileNotFoundError(f"Spec file not found: {target}")
        elif episode_dir is not None:
            candidate = Path(episode_dir) / "spec.json"
            if candidate.is_file():
                target = candidate

        if target is None:
            return None, None

        payload = json.loads(target.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ChannelConfigError(f"Spec file must be a JSON object: {target}")
        raw_format = payload.get("formatId") or payload.get("format_id")
        if raw_format is None or not str(raw_format).strip():
            return None, target
        return str(raw_format).strip(), target

    def validate_format_guard(
        self,
        channel_key: str,
        *,
        format_id: str | None = None,
        spec_path: Path | None = None,
        episode_dir: Path | None = None,
        artifact_paths: Sequence[str | Path] = (),
    ) -> dict[str, Any]:
        """フォーマットID・spec.json・ファイルパス由来の誤爆チェックを実行する。"""
        self.validate_unique_bindings()
        profile = self.get_channel(channel_key)

        spec_format, resolved_spec = self.extract_format_from_spec(
            spec_path=spec_path,
            episode_dir=episode_dir,
        )

        if format_id and spec_format:
            if _normalize_token(format_id) != _normalize_token(spec_format):
                raise ChannelMismatchError(
                    f"Conflicting format IDs: CLI --format-id='{format_id}' vs "
                    f"spec '{resolved_spec}' formatId='{spec_format}'."
                )

        detected_format = (format_id or spec_format or "").strip() or None
        if detected_format and self.defaults.require_format_match:
            if not profile.matches_format(detected_format):
                suggested = self.find_channel_by_format(detected_format)
                suggestion_msg = (
                    f" Expected channel for format '{detected_format}': '{suggested.key}' ({suggested.display_name})."
                    if suggested is not None
                    else ""
                )
                raise ChannelMismatchError(
                    f"Format mismatch guard triggered: channel '{profile.key}' ({profile.display_name}) "
                    f"only accepts format '{profile.format_id}', but got '{detected_format}'.{suggestion_msg}"
                )

        # パス名ヒューリスティック（別チャンネル固有キーワードの混入検知）
        checked_paths: list[str] = []
        all_paths: list[Path] = [Path(p) for p in artifact_paths if p]
        if episode_dir is not None:
            all_paths.append(Path(episode_dir))
        if resolved_spec is not None:
            all_paths.append(resolved_spec)

        own_keywords = tuple(k.lower() for k in profile.path_keywords if k.strip())
        other_profiles = [p for k, p in self.channels.items() if k != profile.key]

        for path_obj in all_paths:
            path_str = str(path_obj)
            checked_paths.append(path_str)
            # ファイル名と直近3階層のディレクトリ名のみ検査（上位のリポジトリ名誤検知を避ける）
            relevant_parts = path_obj.parts[-4:] if len(path_obj.parts) >= 4 else path_obj.parts
            haystack = "/".join(relevant_parts).lower()
            has_own_kw = any(kw in haystack for kw in own_keywords)
            if has_own_kw:
                continue
            for other in other_profiles:
                matched_other_kws = [
                    kw for kw in other.path_keywords if kw.strip() and kw.lower() in haystack
                ]
                if matched_other_kws:
                    raise ChannelMismatchError(
                        f"Cross-channel artifact path guard triggered: target channel is "
                        f"'{profile.key}' ({profile.display_name}), but path '{path_str}' "
                        f"matches keywords {matched_other_kws} belonging to '{other.key}' ({other.display_name})."
                    )

        return {
            "channel_key": profile.key,
            "expected_format_id": profile.format_id,
            "detected_format_id": detected_format,
            "spec_path": str(resolved_spec) if resolved_spec else None,
            "checked_paths": checked_paths,
            "status": "ok",
        }

    def validate_channel_identity(
        self,
        channel_key: str,
        actual_channel_id: str,
        *,
        actual_title: str = "",
        require_bound: bool | None = None,
        other_bound_ids: Mapping[str, str] | None = None,
    ) -> dict[str, Any]:
        """認証済みチャンネルIDと configs/channels.yaml・他チャンネル束縛情報の整合性を検証する。"""
        self.validate_unique_bindings()
        profile = self.get_channel(channel_key)
        actual_id = actual_channel_id.strip()
        if not actual_id or not CHANNEL_ID_RE.match(actual_id):
            raise ChannelMismatchError(
                f"Invalid authenticated YouTube channel ID '{actual_channel_id}' for '{profile.key}'."
            )

        # 1. 他チャンネルの設定 expected_channel_id との衝突禁止
        for other_key, other_profile in self.channels.items():
            if other_key == profile.key:
                continue
            other_expected = other_profile.effective_expected_channel_id
            if other_expected and other_expected == actual_id:
                raise ChannelMismatchError(
                    f"Brand account collision detected: authenticated channel ID '{actual_id}' "
                    f"({actual_title or 'unknown'}) belongs to '{other_key}' ({other_profile.display_name}), "
                    f"not '{profile.key}' ({profile.display_name})."
                )

        # 2. 他チャンネルの保存済みトークン紐づけIDとの衝突禁止
        if other_bound_ids:
            for other_key, other_cid in other_bound_ids.items():
                if other_key != profile.key and other_cid and other_cid.strip() == actual_id:
                    raise ChannelMismatchError(
                        f"Token brand account collision detected: authenticated channel ID '{actual_id}' "
                        f"is already bound to channel '{other_key}'. Select the distinct brand account for '{profile.key}'."
                    )

        # 3. 自チャンネルの expected_channel_id との厳密一致検証
        expected_id = profile.effective_expected_channel_id
        must_be_bound = self.defaults.require_channel_id_match if require_bound is None else require_bound

        if expected_id:
            if actual_id != expected_id:
                raise ChannelMismatchError(
                    f"Channel ID mismatch for '{profile.key}' ({profile.display_name}): "
                    f"expected '{expected_id}', but authenticated token resolved to '{actual_id}' "
                    f"({actual_title or 'unknown'}). Re-authenticate with the correct brand account."
                )
            binding_state = "matched"
        else:
            if must_be_bound:
                raise ChannelMismatchError(
                    f"Channel '{profile.key}' ({profile.display_name}) has no expected_channel_id configured. "
                    f"Run `python pipeline/scripts/youtube_auth.py --channel {profile.key} --verify --write-channel-id` "
                    f"to bind channel ID '{actual_id}', or pass --allow-unbound-channel explicitly."
                )
            binding_state = "unbound_allowed"

        return {
            "channel_key": profile.key,
            "expected_channel_id": expected_id or None,
            "actual_channel_id": actual_id,
            "actual_title": actual_title,
            "binding_state": binding_state,
        }

    def write_channel_binding(
        self,
        channel_key: str,
        channel_id: str,
        *,
        handle: str = "",
    ) -> Path:
        """検証済み channel_id（および handle）を configs/channels.yaml に安全に書き戻す。"""
        profile = self.get_channel(channel_key)
        cleaned_id = channel_id.strip()
        if not CHANNEL_ID_RE.match(cleaned_id):
            raise ChannelMismatchError(f"Refusing to write invalid channel_id: '{channel_id}'")

        # 他チャンネルとの重複書き込みを拒否
        for other_key, other_profile in self.channels.items():
            if other_key != profile.key and other_profile.effective_expected_channel_id == cleaned_id:
                raise ChannelMismatchError(
                    f"Refusing to bind channel_id '{cleaned_id}' to '{profile.key}': "
                    f"already assigned to '{other_key}'."
                )

        if not self.config_path.is_file():
            raise FileNotFoundError(f"Channel config file not found: {self.config_path}")

        raw_text = self.config_path.read_text(encoding="utf-8")
        lines = raw_text.splitlines(keepends=True)

        in_channels = False
        in_target = False
        target_indent: int | None = None
        updated_id = False
        updated_handle = False
        normalized_handle = handle.strip()
        if normalized_handle and not normalized_handle.startswith("@"):
            normalized_handle = f"@{normalized_handle}"

        out_lines: list[str] = []
        for line in lines:
            stripped = line.strip()
            indent = len(line) - len(line.lstrip(" "))
            if not in_channels:
                if stripped == "channels:":
                    in_channels = True
                out_lines.append(line)
                continue

            if stripped and not stripped.startswith("#") and indent == 0:
                in_channels = False
                in_target = False
                out_lines.append(line)
                continue

            if not in_target:
                if stripped == f"{profile.key}:":
                    in_target = True
                    target_indent = indent
                out_lines.append(line)
                continue

            # ターゲットチャンネルブロック終了判定
            if stripped and not stripped.startswith("#") and target_indent is not None and indent <= target_indent:
                in_target = False
                out_lines.append(line)
                continue

            newline = "\r\n" if line.endswith("\r\n") else ("\n" if line.endswith("\n") else "")
            if re.match(r"^\s+expected_channel_id\s*:", line):
                prefix = line[: len(line) - len(line.lstrip(" "))]
                out_lines.append(f'{prefix}expected_channel_id: "{cleaned_id}"{newline}')
                updated_id = True
                continue
            if normalized_handle and re.match(r"^\s+handle\s*:", line):
                prefix = line[: len(line) - len(line.lstrip(" "))]
                out_lines.append(f'{prefix}handle: "{normalized_handle}"{newline}')
                updated_handle = True
                continue

            out_lines.append(line)

        if not updated_id:
            # フォールバック：YAML構造として安全に更新
            data = yaml.safe_load(raw_text)
            if not isinstance(data, dict) or not isinstance(data.get("channels"), dict):
                raise ChannelConfigError(f"Invalid channels.yaml schema: {self.config_path}")
            data["channels"][profile.key]["expected_channel_id"] = cleaned_id
            if normalized_handle:
                data["channels"][profile.key]["handle"] = normalized_handle
            new_text = yaml.safe_dump(data, allow_unicode=True, sort_keys=False)
        else:
            new_text = "".join(out_lines)
            # handle行が無かった場合はそのまま（任意項目）
            _ = updated_handle

        self.config_path.write_text(new_text, encoding="utf-8")
        return self.config_path


def load_channels_registry(
    config_path: Path | None = None,
    *,
    repo_root: Path | None = None,
    load_env: bool = True,
    client_secret_override: Path | None = None,
    token_dir_override: Path | None = None,
) -> ChannelsRegistry:
    """configs/channels.yaml を読み込み ChannelsRegistry を構築する。"""
    if repo_root is None:
        if config_path is not None:
            resolved_cfg = Path(config_path).resolve()
            # config_path の親が configs/ ならその親を repo_root とみなす
            if resolved_cfg.parent.name == "configs":
                root = resolved_cfg.parent.parent
            else:
                try:
                    root = find_repo_root(resolved_cfg.parent)
                except FileNotFoundError:
                    root = resolved_cfg.parent
        else:
            root = find_repo_root()
    else:
        root = Path(repo_root).resolve()

    if load_env:
        load_dotenv_file(root / ".env")

    target_cfg = Path(config_path).resolve() if config_path is not None else (root / "configs" / "channels.yaml")
    if not target_cfg.is_file():
        raise FileNotFoundError(f"Channel config file not found: {target_cfg}")

    with target_cfg.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    if not isinstance(raw, dict):
        raise ChannelConfigError(f"Expected mapping in {target_cfg}, got {type(raw).__name__}")

    oauth_raw = raw.get("oauth") or {}
    if not isinstance(oauth_raw, dict):
        raise ChannelConfigError("Invalid 'oauth' section in channels.yaml")

    env_secret = os.environ.get("YOUTUBE_OAUTH_CLIENT_SECRET_PATH", "").strip()
    env_token_dir = os.environ.get("YOUTUBE_OAUTH_TOKEN_DIR", "").strip()

    secret_raw = (
        client_secret_override
        or (env_secret if env_secret else None)
        or oauth_raw.get("client_secret_path")
        or "pipeline/.secrets/client_secret.json"
    )
    token_dir_raw = (
        token_dir_override
        or (env_token_dir if env_token_dir else None)
        or oauth_raw.get("token_dir")
        or "pipeline/.secrets/youtube_tokens"
    )
    scopes_raw = oauth_raw.get("scopes") or list(DEFAULT_OAUTH_SCOPES)
    scopes = tuple(str(s).strip() for s in scopes_raw if str(s).strip())
    if not scopes:
        scopes = DEFAULT_OAUTH_SCOPES

    oauth_settings = OAuthSettings(
        client_secret_path=_resolve_path(secret_raw, root),
        token_dir=_resolve_path(token_dir_raw, root),
        scopes=scopes,
    )

    defaults_raw = raw.get("defaults") or {}
    default_privacy = str(defaults_raw.get("privacy_status") or "unlisted").strip().lower()
    if default_privacy not in VALID_PRIVACY_STATUSES:
        raise ChannelConfigError(f"Invalid default privacy_status: '{default_privacy}'")

    defaults = PublishDefaults(
        privacy_status=default_privacy,
        made_for_kids=bool(defaults_raw.get("made_for_kids", False)),
        self_declared_made_for_kids=bool(defaults_raw.get("self_declared_made_for_kids", False)),
        default_language=str(defaults_raw.get("default_language") or "ja"),
        default_audio_language=str(defaults_raw.get("default_audio_language") or "ja"),
        embeddable=bool(defaults_raw.get("embeddable", True)),
        public_stats_viewable=bool(defaults_raw.get("public_stats_viewable", True)),
        license=str(defaults_raw.get("license") or "youtube"),
        require_channel_id_match=bool(defaults_raw.get("require_channel_id_match", True)),
        require_format_match=bool(defaults_raw.get("require_format_match", True)),
        max_title_length=int(defaults_raw.get("max_title_length", 100)),
        max_description_length=int(defaults_raw.get("max_description_length", 5000)),
        max_tags_total_chars=int(defaults_raw.get("max_tags_total_chars", 500)),
        max_thumbnail_api_bytes=int(defaults_raw.get("max_thumbnail_api_bytes", 2_097_152)),
        max_thumbnail_hard_bytes=int(defaults_raw.get("max_thumbnail_hard_bytes", 52_428_800)),
    )

    quota_raw = raw.get("quota_costs") or {}
    quota_costs = dict(DEFAULT_QUOTA_COSTS)
    for k, v in quota_raw.items():
        quota_costs[str(k)] = int(v)

    channels_raw = raw.get("channels")
    if not isinstance(channels_raw, dict) or not channels_raw:
        raise ChannelConfigError(f"Missing or empty 'channels' mapping in {target_cfg}")

    profiles: dict[str, ChannelProfile] = {}
    for ch_key, entry in channels_raw.items():
        if not isinstance(entry, dict):
            raise ChannelConfigError(f"Channel '{ch_key}' entry must be a mapping.")
        ch_privacy = str(entry.get("default_privacy_status") or defaults.privacy_status).strip().lower()
        if ch_privacy not in VALID_PRIVACY_STATUSES:
            raise ChannelConfigError(f"Channel '{ch_key}' has invalid default_privacy_status: '{ch_privacy}'")
        format_id = str(entry.get("format_id") or "").strip()
        if not format_id:
            raise ChannelConfigError(f"Channel '{ch_key}' must define 'format_id'.")
        display_name = str(entry.get("display_name") or ch_key).strip()
        playlists_raw = entry.get("playlists") or {}
        playlists = {str(k): str(v or "") for k, v in playlists_raw.items()} if isinstance(playlists_raw, dict) else {}

        profiles[str(ch_key)] = ChannelProfile(
            key=str(ch_key),
            display_name=display_name,
            format_id=format_id,
            format_aliases=tuple(str(x).strip() for x in (entry.get("format_aliases") or []) if str(x).strip()),
            path_keywords=tuple(str(x).strip() for x in (entry.get("path_keywords") or []) if str(x).strip()),
            harness=str(entry.get("harness") or ""),
            theme=str(entry.get("theme") or ""),
            expected_channel_id=str(entry.get("expected_channel_id") or "").strip(),
            expected_channel_id_env=str(entry.get("expected_channel_id_env") or "").strip(),
            handle=str(entry.get("handle") or "").strip(),
            token_filename=str(entry.get("token_filename") or f"{ch_key}_token.json").strip(),
            default_category_id=str(entry.get("default_category_id") or "27").strip(),
            default_privacy_status=ch_privacy,
            default_language=str(entry.get("default_language") or defaults.default_language).strip(),
            default_audio_language=str(entry.get("default_audio_language") or defaults.default_audio_language).strip(),
            default_tags=tuple(str(t).strip() for t in (entry.get("default_tags") or []) if str(t).strip()),
            playlists=playlists,
            description_footer=str(entry.get("description_footer") or "").strip(),
        )

    registry = ChannelsRegistry(
        oauth=oauth_settings,
        defaults=defaults,
        quota_costs=quota_costs,
        channels=profiles,
        config_path=target_cfg,
        repo_root=root,
    )
    registry.validate_unique_bindings()
    return registry
