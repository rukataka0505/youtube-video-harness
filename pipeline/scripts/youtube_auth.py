"""2チャンネル分離 YouTube OAuth 2.0 認証・検証 CLI。

同一 Google アカウント配下のブランドアカウント2つ（ch1_buguru / ch2_akapen）を
個別にブラウザ認証し、チャンネル別トークンを .gitignore 対象の秘匿ディレクトリへ保存する。

使用例:
  python pipeline/scripts/youtube_auth.py --status
  python pipeline/scripts/youtube_auth.py --channel ch1_buguru --write-channel-id
  python pipeline/scripts/youtube_auth.py --channel ch2_akapen --write-channel-id
  python pipeline/scripts/youtube_auth.py --channel ch1_buguru --verify
  python pipeline/scripts/youtube_auth.py --verify-all
  python pipeline/scripts/youtube_auth.py --channel ch1_buguru --revoke
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Callable, Sequence

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_SRC = REPO_ROOT / "pipeline" / "src"
if str(PIPELINE_SRC) not in sys.path:
    sys.path.insert(0, str(PIPELINE_SRC))

from yt_engine.publisher.auth import (
    ChannelAuthResult,
    YouTubeAuthError,
    authenticate_channel,
    get_all_channel_auth_statuses,
    revoke_channel_token,
    verify_channel_auth,
)
from yt_engine.publisher.channels import (
    ChannelConfigError,
    ChannelMismatchError,
    ChannelsRegistry,
    load_channels_registry,
)
from yt_engine.publisher.youtube_publisher import open_default_quota_ledger
from yt_engine.quota import QuotaCircuitOpen, redact_secrets


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="2チャンネル分離 YouTube OAuth 2.0 認証・チャンネル検証 CLI",
    )
    parser.add_argument(
        "--channel",
        help="対象チャンネルキー（例: ch1_buguru, ch2_akapen）",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--verify",
        action="store_true",
        help="保存済みトークンで channels.list(mine=true) を照合し、接続先チャンネル名・IDを検証する",
    )
    mode.add_argument(
        "--verify-all",
        action="store_true",
        help="configs/channels.yaml の全チャンネルについて保存済みトークンを API 照合する",
    )
    mode.add_argument(
        "--status",
        action="store_true",
        help="外部API通信なしで全チャンネルのローカル認証・バインド状態を一覧表示する",
    )
    mode.add_argument(
        "--revoke",
        action="store_true",
        help="指定チャンネルのローカル保存トークンを削除する",
    )
    parser.add_argument(
        "--revoke-remote",
        action="store_true",
        help="--revoke 時に Google OAuth 側のトークン失効 API も併せて呼び出す",
    )
    parser.add_argument(
        "--write-channel-id",
        action="store_true",
        help="認証・検証で確認した channel_id / handle を configs/channels.yaml へ安全に書き戻す",
    )
    parser.add_argument(
        "--require-bound",
        action="store_true",
        help="--verify / --verify-all 時に expected_channel_id 未設定をエラー扱いとする",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="OAuth コールバック待機ポート（0 で空きポート自動選択、既定: 0）",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="ブラウザを自動起動せず認証URLをターミナルへ表示する",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="チャンネル設定 YAML パス（既定: configs/channels.yaml）",
    )
    parser.add_argument(
        "--client-secret",
        type=Path,
        default=None,
        help="Google OAuth client_secret.json パス（既定: configs/channels.yaml または環境変数）",
    )
    parser.add_argument(
        "--token-dir",
        type=Path,
        default=None,
        help="チャンネル別トークン保存ディレクトリ（既定: pipeline/.secrets/youtube_tokens）",
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=None,
        help="クォータ記録用 SQLite DB パス（既定: YT_ENGINE_DB_PATH または pipeline/data/pipeline.db）",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="結果を JSON 形式で標準出力へ出力する",
    )
    return parser


def _print_auth_result(result: ChannelAuthResult, *, action_label: str) -> None:
    info = result.channel_info
    print(f"[{action_label} OK] {result.channel_key} ({result.display_name} / format={result.format_id})")
    print(f"  接続先チャンネル名 : {info.title}")
    print(f"  チャンネルID       : {info.channel_id}")
    if info.handle:
        print(f"  ハンドル           : {info.handle}")
    print(f"  登録者数 / 動画数  : {info.subscriber_count:,} / {info.video_count:,}")
    print(f"  バインド状態       : {result.binding_state} (expected={result.expected_channel_id or '未設定'})")
    print(f"  トークン保存先     : {result.token_path}")
    if result.token_refreshed:
        print("  トークン更新       : 期限切れトークンを自動リフレッシュ済み")
    if result.wrote_channel_id:
        print("  設定ファイル更新   : configs/channels.yaml の expected_channel_id を更新しました")
    elif not result.expected_channel_id:
        print(
            f"  [ヒント] 誤爆防止を確定させるには以下を実行してください:\n"
            f"    python pipeline/scripts/youtube_auth.py --channel {result.channel_key} --verify --write-channel-id"
        )


def _print_statuses(statuses: list[dict[str, Any]], registry: ChannelsRegistry) -> None:
    secret_exists = registry.oauth.client_secret_path.is_file()
    print("=== YouTube 2チャンネル OAuth 2.0 ステータス ===")
    print(f"  client_secret : {registry.oauth.client_secret_path} ({'OK' if secret_exists else '未配置'})")
    print(f"  token_dir     : {registry.oauth.token_dir}")
    print("")
    for item in statuses:
        print(f"- {item['channel_key']} ({item['display_name']} / format={item['format_id']})")
        print(f"    状態            : {item['state']}")
        print(f"    トークン        : {'あり' if item['token_exists'] else 'なし'} ({item['token_path']})")
        print(f"    expected_id     : {item['expected_channel_id'] or '(未設定)'}")
        if item["bound_channel_id"]:
            print(
                f"    紐づけ実績      : {item['bound_channel_title'] or '-'} "
                f"({item['bound_channel_id']} {item['bound_handle'] or ''})".rstrip()
            )
        for warn in item["warnings"]:
            print(f"    [WARNING] {warn}")


def main(
    argv: Sequence[str] | None = None,
    *,
    auth_flow_runner: Callable[..., Any] | None = None,
    youtube_service_factory: Callable[[Any], Any] | None = None,
) -> int:
    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        registry = load_channels_registry(
            config_path=args.config,
            client_secret_override=args.client_secret,
            token_dir_override=args.token_dir,
        )
    except (FileNotFoundError, ChannelConfigError, ChannelMismatchError) as exc:
        print(f"[ERROR] チャンネル設定読込に失敗しました: {redact_secrets(exc)}", file=sys.stderr)
        return 1

    # 1. ローカルステータス確認（オフライン）
    if args.status:
        statuses = get_all_channel_auth_statuses(registry)
        if args.json:
            print(
                json.dumps(
                    {
                        "client_secret_path": str(registry.oauth.client_secret_path),
                        "client_secret_exists": registry.oauth.client_secret_path.is_file(),
                        "token_dir": str(registry.oauth.token_dir),
                        "channels": statuses,
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
        else:
            _print_statuses(statuses, registry)
        has_error_state = any(
            s["state"] in {"corrupted_token", "channel_id_mismatch", "brand_account_collision"}
            for s in statuses
        )
        return 1 if has_error_state else 0

    # 2. トークン削除（revoke）
    if args.revoke:
        if not args.channel:
            print("[ERROR] --revoke には --channel の指定が必須です。", file=sys.stderr)
            return 2
        try:
            res = revoke_channel_token(
                registry,
                args.channel,
                revoke_remote=args.revoke_remote,
            )
        except ChannelConfigError as exc:
            print(f"[ERROR] {redact_secrets(exc)}", file=sys.stderr)
            return 1
        if args.json:
            print(json.dumps(res, ensure_ascii=False, indent=2))
        else:
            if res["deleted"]:
                print(f"[OK] トークンを削除しました: {res['token_path']} (remote_revoked={res['remote_revoked']})")
            else:
                print(f"[INFO] 削除対象のトークンは存在しませんでした: {res['token_path']}")
        return 0

    # クォータ台帳を開く（channels.list の 1 unit を正確に記録）
    conn, ledger = open_default_quota_ledger(
        db_path=args.db_path,
        configs_dir=registry.config_path.parent,
        repo_root=registry.repo_root,
    )
    try:
        # 3. 全チャンネル検証
        if args.verify_all:
            results: list[dict[str, Any]] = []
            exit_code = 0
            for ch_key in registry.channels:
                try:
                    res = verify_channel_auth(
                        registry,
                        ch_key,
                        require_bound=args.require_bound,
                        write_channel_id=args.write_channel_id,
                        ledger=ledger,
                        youtube_service_factory=youtube_service_factory,
                    )
                    results.append({"ok": True, **res.to_dict()})
                    if not args.json:
                        _print_auth_result(res, action_label="VERIFY")
                except (YouTubeAuthError, ChannelMismatchError, QuotaCircuitOpen) as exc:
                    exit_code = 1
                    results.append({"ok": False, "channel_key": ch_key, "error": redact_secrets(exc)})
                    if not args.json:
                        print(f"[VERIFY FAILED] {ch_key}: {redact_secrets(exc)}", file=sys.stderr)
            if args.json:
                print(json.dumps({"results": results}, ensure_ascii=False, indent=2))
            return exit_code

        # 4. 単一チャンネル検証 または 新規ブラウザ認証
        if not args.channel:
            print(
                "[ERROR] --channel <ch1_buguru|ch2_akapen>（または --status / --verify-all）を指定してください。",
                file=sys.stderr,
            )
            return 2

        profile = registry.get_channel(args.channel)
        if args.verify:
            res = verify_channel_auth(
                registry,
                profile.key,
                require_bound=args.require_bound,
                write_channel_id=args.write_channel_id,
                ledger=ledger,
                youtube_service_factory=youtube_service_factory,
            )
            if args.json:
                print(json.dumps(res.to_dict(), ensure_ascii=False, indent=2))
            else:
                _print_auth_result(res, action_label="VERIFY")
            return 0

        if not args.json:
            print("=" * 64)
            print(f"認証対象チャンネル : {profile.key} ({profile.display_name})")
            print(f"対応フォーマット   : {profile.format_id}")
            print(f"期待チャンネルID   : {profile.effective_expected_channel_id or '(初回未設定)'}")
            print(
                f"ブラウザの Google / ブランドアカウント選択画面で、必ず「{profile.display_name}」を"
                "選択してください。"
            )
            print("=" * 64)

        res = authenticate_channel(
            registry,
            profile.key,
            port=args.port,
            open_browser=not args.no_browser,
            write_channel_id=args.write_channel_id,
            ledger=ledger,
            auth_flow_runner=auth_flow_runner,
            youtube_service_factory=youtube_service_factory,
        )
        if args.json:
            print(json.dumps(res.to_dict(), ensure_ascii=False, indent=2))
        else:
            _print_auth_result(res, action_label="AUTH")
        return 0

    except (ChannelConfigError, ChannelMismatchError, YouTubeAuthError, QuotaCircuitOpen, FileNotFoundError) as exc:
        if args.json:
            print(json.dumps({"ok": False, "error": redact_secrets(exc)}, ensure_ascii=False, indent=2))
        else:
            print(f"[ERROR] {redact_secrets(exc)}", file=sys.stderr)
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
