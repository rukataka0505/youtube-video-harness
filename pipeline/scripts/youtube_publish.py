"""2チャンネル運用 YouTube 投稿・メタデータ管理 CLI（デフォルト --dry-run / 既定限定公開 unlisted）。

安全設計:
- 全書き込み操作はデフォルト --dry-run（外部API書き込みゼロ）。--execute 明示時のみ実送信。
- 動画アップロードの既定公開設定は限定公開（unlisted）。private / public / 予約公開（--publish-at）対応。
- configs/channels.yaml に基づくフォーマット・パス・チャンネルID・動画所有権の多層誤爆防止ガード。
- 全 API クォータ消費を yt_engine.quota.YouTubeQuotaLedger（general バケット）へ記録。

使用例:
  # 1) 動画アップロード dry-run（既定: unlisted / 外部通信なし）
  python pipeline/scripts/youtube_publish.py upload --channel ch1_buguru \
    --episode-dir episodes/productions/multitask-brain-trap \
    --video episodes/productions/multitask-brain-trap/multitask_brain_trap_v21_neon.mp4 \
    --title "なぜマルチタスクが得意な人ほど脳の処理能力が落ちるのか"

  # 2) 実アップロード（限定公開 + サムネイル + 字幕 + 再生リスト）
  python pipeline/scripts/youtube_publish.py upload --channel ch1_buguru \
    --video path/to/video.mp4 --title "..." --description-file desc.txt \
    --thumbnail path/to/thumb.jpg --caption path/to/sub.srt \
    --playlist-id PLxxxx --execute

  # 3) 既存動画メタデータ更新（予約公開への切替）
  python pipeline/scripts/youtube_publish.py update --channel ch2_akapen \
    --video-id dQw4w9WgXcQ --publish-at "2026-12-01T18:00:00+09:00" --execute

  # 4) 当日クォータ残高確認
  python pipeline/scripts/youtube_publish.py quota
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

from yt_engine.publisher.auth import YouTubeAuthError
from yt_engine.publisher.channels import (
    ChannelConfigError,
    ChannelMismatchError,
    ChannelsRegistry,
    load_channels_registry,
)
from yt_engine.publisher.youtube_publisher import (
    CaptionRequest,
    MetadataValidationError,
    PlaylistAddRequest,
    PublishResult,
    ThumbnailRequest,
    UpdateMetadataRequest,
    UploadRequest,
    YouTubePublishError,
    YouTubePublisher,
    load_publish_metadata_file,
    open_default_quota_ledger,
)
from yt_engine.quota import QuotaCircuitOpen, redact_secrets


def _parse_tags_args(tags_csv: str | None, tag_items: Sequence[str] | None, meta_tags: Any = None) -> tuple[str, ...]:
    collected: list[str] = []
    if isinstance(meta_tags, list):
        collected.extend(str(t).strip() for t in meta_tags if str(t).strip())
    elif isinstance(meta_tags, str) and meta_tags.strip():
        collected.extend(t.strip() for t in meta_tags.split(",") if t.strip())

    # CLI 明示指定があればメタデータファイルのタグを上書きする
    cli_tags: list[str] = []
    if tags_csv:
        cli_tags.extend(t.strip() for t in tags_csv.split(",") if t.strip())
    if tag_items:
        cli_tags.extend(t.strip() for t in tag_items if t.strip())
    if cli_tags:
        return tuple(cli_tags)
    return tuple(collected)


def _load_description(
    description_arg: str | None,
    description_file: Path | None,
    meta_description: str | None = None,
) -> str | None:
    if description_file is not None:
        if not description_file.is_file():
            raise FileNotFoundError(f"Description file not found: {description_file}")
        return description_file.read_text(encoding="utf-8")
    if description_arg is not None:
        return description_arg
    if meta_description is not None:
        return str(meta_description)
    return None


def _add_common_options(parser: argparse.ArgumentParser, *, require_channel: bool = True) -> None:
    parser.add_argument(
        "--channel",
        required=require_channel,
        help="対象チャンネルキー（例: ch1_buguru, ch2_akapen）",
    )
    exec_group = parser.add_mutually_exclusive_group()
    exec_group.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="外部書き込みを行わず計画・検証・クォータ見積もりのみ表示する（デフォルト動作）",
    )
    exec_group.add_argument(
        "--execute",
        action="store_true",
        default=False,
        help="実際に YouTube Data API へアップロード／更新を実行する（明示指定必須）",
    )
    parser.add_argument("--format-id", default=None, help="誤爆防止検証用の formatId（例: stickman_collage, planE_macro_econ）")
    parser.add_argument("--spec", type=Path, default=None, help="誤爆防止検証用の spec.json パス")
    parser.add_argument("--episode-dir", type=Path, default=None, help="エピソードディレクトリ（配下の spec.json を自動検出）")
    parser.add_argument("--config", type=Path, default=None, help="configs/channels.yaml パス上書き")
    parser.add_argument("--client-secret", type=Path, default=None, help="client_secret.json パス上書き")
    parser.add_argument("--token-dir", type=Path, default=None, help="トークンディレクトリ上書き")
    parser.add_argument("--db-path", type=str, default=None, help="クォータ記録 SQLite DB パス上書き")
    parser.add_argument(
        "--allow-unbound-channel",
        action="store_true",
        help="expected_channel_id 未登録状態でも実行を許可する非常用フラグ（通常は非推奨）",
    )
    parser.add_argument("--json", action="store_true", help="構造化 JSON で標準出力へ出力する")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="YouTube 2チャンネル投稿・メタデータ管理 CLI（デフォルト --dry-run / 既定 unlisted）",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # upload
    p_upload = sub.add_parser("upload", help="動画MP4アップロード（サムネ・字幕・再生リスト一括指定可）")
    _add_common_options(p_upload, require_channel=True)
    p_upload.add_argument("--video", type=Path, default=None, help="アップロードする動画MP4パス")
    p_upload.add_argument("--title", default=None, help="動画タイトル（100文字以内）")
    p_upload.add_argument("--description", default=None, help="概要欄テキスト")
    p_upload.add_argument("--description-file", type=Path, default=None, help="概要欄テキスト/MDファイルパス")
    p_upload.add_argument("--tags", default=None, help="カンマ区切りタグ一覧")
    p_upload.add_argument("--tag", action="append", default=None, help="タグ（複数回指定可）")
    p_upload.add_argument("--category-id", default=None, help="YouTube カテゴリID（既定: 27=Education）")
    p_upload.add_argument("--privacy", choices=("unlisted", "private", "public"), default=None, help="公開設定（既定: unlisted）")
    p_upload.add_argument("--publish-at", default=None, help="予約公開日時（ISO-8601 タイムゾーン必須。例: 2026-12-01T18:00:00+09:00）")
    kids_u = p_upload.add_mutually_exclusive_group()
    kids_u.add_argument("--made-for-kids", action="store_true", default=False, help="子ども向けに設定")
    kids_u.add_argument("--not-made-for-kids", action="store_true", default=False, help="子ども向けでない設定（既定）")
    p_upload.add_argument("--language", default=None, help="既定言語（既定: ja）")
    p_upload.add_argument("--audio-language", default=None, help="既定音声言語（既定: ja）")
    p_upload.add_argument("--no-notify", action="store_true", help="登録者への通知を無効化")
    p_upload.add_argument("--append-footer", action="store_true", help="channels.yaml の定型フッターを概要欄末尾へ追記")
    p_upload.add_argument("--thumbnail", type=Path, default=None, help="同時に設定するカスタムサムネイル画像パス")
    p_upload.add_argument("--caption", type=Path, default=None, help="同時にアップロードする字幕ファイル（.srt/.vtt等）")
    p_upload.add_argument("--caption-language", default="ja", help="字幕の言語コード（既定: ja）")
    p_upload.add_argument("--caption-name", default="日本語", help="字幕トラック名（既定: 日本語）")
    p_upload.add_argument("--caption-draft", action="store_true", help="字幕を下書き（isDraft=true）として登録")
    p_upload.add_argument("--playlist-id", action="append", default=None, help="追加先の再生リストIDまたはエイリアス（複数回指定可）")
    p_upload.add_argument("--metadata", type=Path, default=None, help="メタデータ YAML/JSON ファイル（CLI引数で局所上書き可）")

    # update
    p_update = sub.add_parser("update", help="既存動画のメタデータ（タイトル・概要欄・タグ・公開設定等）更新")
    _add_common_options(p_update, require_channel=True)
    p_update.add_argument("--video-id", default=None, help="更新対象の YouTube 動画ID")
    p_update.add_argument("--title", default=None, help="新タイトル")
    p_update.add_argument("--description", default=None, help="新概要欄テキスト")
    p_update.add_argument("--description-file", type=Path, default=None, help="新概要欄ファイルパス")
    p_update.add_argument("--tags", default=None, help="新タグ（カンマ区切り）")
    p_update.add_argument("--tag", action="append", default=None, help="新タグ（複数回指定可）")
    p_update.add_argument("--category-id", default=None, help="新カテゴリID")
    p_update.add_argument("--privacy", choices=("unlisted", "private", "public"), default=None, help="新公開設定")
    p_update.add_argument("--publish-at", default=None, help="予約公開日時（ISO-8601 タイムゾーン必須）")
    kids_e = p_update.add_mutually_exclusive_group()
    kids_e.add_argument("--made-for-kids", action="store_true", default=False)
    kids_e.add_argument("--not-made-for-kids", action="store_true", default=False)
    p_update.add_argument("--language", default=None, help="既定言語")
    p_update.add_argument("--audio-language", default=None, help="既定音声言語")
    p_update.add_argument("--metadata", type=Path, default=None, help="メタデータ YAML/JSON ファイル")

    # thumbnail
    p_thumb = sub.add_parser("thumbnail", help="既存動画へのカスタムサムネイル設定")
    _add_common_options(p_thumb, require_channel=True)
    p_thumb.add_argument("--video-id", required=True, help="対象の YouTube 動画ID")
    p_thumb.add_argument("--thumbnail", type=Path, required=True, help="サムネイル画像パス（PNG/JPEG）")

    # caption
    p_cap = sub.add_parser("caption", help="既存動画への字幕アップロード／更新")
    _add_common_options(p_cap, require_channel=True)
    p_cap.add_argument("--video-id", required=True, help="対象の YouTube 動画ID")
    p_cap.add_argument("--caption", type=Path, required=True, help="字幕ファイルパス（.srt/.vtt等）")
    p_cap.add_argument("--language", default="ja", help="言語コード（既定: ja）")
    p_cap.add_argument("--name", default="日本語", help="字幕トラック名（既定: 日本語）")
    p_cap.add_argument("--draft", action="store_true", help="下書き（isDraft=true）として登録")
    p_cap.add_argument("--caption-id", default=None, help="既存字幕を上書き更新する場合の caption ID")

    # playlist
    p_pl = sub.add_parser("playlist", help="既存動画の再生リスト追加")
    _add_common_options(p_pl, require_channel=True)
    p_pl.add_argument("--video-id", required=True, help="対象の YouTube 動画ID")
    p_pl.add_argument("--playlist-id", action="append", required=True, help="再生リストIDまたはエイリアス（複数回指定可）")
    p_pl.add_argument("--position", type=int, default=None, help="挿入位置（0始まり、省略時は末尾）")

    # quota
    p_quota = sub.add_parser("quota", help="当日の YouTube Data API クォータ消費状況を表示")
    p_quota.add_argument("--config", type=Path, default=None)
    p_quota.add_argument("--db-path", type=str, default=None)
    p_quota.add_argument("--json", action="store_true")

    return parser


def _print_result(result: PublishResult) -> None:
    mode_tag = "DRY-RUN (外部書き込みなし)" if result.dry_run else "EXECUTED (反映完了)"
    print(f"=== YouTube Publish [{result.operation}] : {mode_tag} ===")
    print(f"  チャンネル   : {result.channel_key} ({result.display_name} / format={result.format_id})")
    if result.video_id:
        print(f"  動画ID       : {result.video_id}")
        print(f"  URL          : {result.video_url}")
    if result.privacy_status:
        sched = f" (publishAt={result.publish_at})" if result.publish_at else ""
        print(f"  公開設定     : {result.privacy_status}{sched}")

    if result.authenticated_channel:
        auth = result.authenticated_channel
        if auth.get("channel_id"):
            print(f"  認証先実体   : {auth.get('title', '')} ({auth.get('channel_id')})")
        elif auth.get("bound_channel_id"):
            print(f"  ローカル束縛 : {auth.get('bound_channel_title', '')} ({auth.get('bound_channel_id')})")

    print("  実行ステップ :")
    steps = result.planned_steps if result.dry_run else result.executed_steps
    for idx, step in enumerate(steps, start=1):
        print(f"    {idx}. {step.get('api')} (cost={step.get('quota_units')} units)")

    q = result.quota
    if q:
        print(
            f"  クォータ     : bucket={q.get('bucket')} date(PT)={q.get('pt_date')} "
            f"est={q.get('estimated_units')} consumed={q.get('consumed_units')} "
            f"used={q.get('used_after')}/{q.get('limit')} remaining={q.get('remaining_after')}"
        )

    for warn in result.warnings:
        print(f"  [WARNING] {warn}")

    if result.dry_run:
        print("  ※ 実際にアップロード／更新を実行するには --execute を明示指定してください。")


def _resolve_optional_path(cli_path: Path | None, meta_val: Any, base_dir: Path | None) -> Path | None:
    if cli_path is not None:
        return cli_path
    if meta_val and str(meta_val).strip():
        p = Path(str(meta_val).strip())
        if not p.is_absolute() and base_dir is not None:
            return (base_dir / p).resolve()
        return p
    return None


def main(
    argv: Sequence[str] | None = None,
    *,
    publisher_factory: Callable[[ChannelsRegistry, argparse.Namespace], YouTubePublisher] | None = None,
) -> int:
    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    if args.command == "quota":
        configs_dir = args.config.resolve().parent if args.config else None
        conn, ledger = open_default_quota_ledger(db_path=args.db_path, configs_dir=configs_dir)
        try:
            summary = ledger.get_summary()
            if args.json:
                print(json.dumps(summary, ensure_ascii=False, indent=2))
            else:
                print("=== YouTube Data API クォータ消費状況（PT日次） ===")
                for bucket, info in summary.items():
                    print(
                        f"  {bucket:<12}: {info['used']:>5} / {info['limit']:<5} "
                        f"(残余 {info['remaining']}, PT日付 {info['pt_date']})"
                    )
            return 0
        finally:
            conn.close()

    try:
        registry = load_channels_registry(
            config_path=args.config,
            client_secret_override=args.client_secret,
            token_dir_override=args.token_dir,
        )
    except (FileNotFoundError, ChannelConfigError, ChannelMismatchError) as exc:
        if args.json:
            print(json.dumps({"ok": False, "error": redact_secrets(exc)}, ensure_ascii=False, indent=2))
        else:
            print(f"[ERROR] チャンネル設定読込に失敗しました: {redact_secrets(exc)}", file=sys.stderr)
        return 1

    dry_run = not bool(args.execute)

    if publisher_factory is not None:
        publisher = publisher_factory(registry, args)
    else:
        publisher = YouTubePublisher(
            registry,
            db_path=args.db_path,
            allow_unbound_channel=bool(args.allow_unbound_channel),
        )

    try:
        with publisher:
            if args.command == "upload":
                meta: dict[str, Any] = {}
                meta_dir: Path | None = None
                if args.metadata is not None:
                    meta = load_publish_metadata_file(args.metadata)
                    meta_dir = args.metadata.resolve().parent

                video_path = _resolve_optional_path(args.video, meta.get("video") or meta.get("video_path"), meta_dir)
                if video_path is None:
                    raise MetadataValidationError("--video (または --metadata 内の video_path) の指定が必須です。")
                title = args.title if args.title is not None else meta.get("title")
                if not title:
                    raise MetadataValidationError("--title (または --metadata 内の title) の指定が必須です。")
                description = _load_description(args.description, args.description_file, meta.get("description")) or ""
                tags = _parse_tags_args(args.tags, args.tag, meta.get("tags"))
                category_id = args.category_id or (str(meta["category_id"]) if meta.get("category_id") else None)
                privacy = args.privacy if args.privacy is not None else meta.get("privacy_status")
                publish_at = args.publish_at if args.publish_at is not None else meta.get("publish_at")

                made_for_kids: bool | None = None
                if args.made_for_kids:
                    made_for_kids = True
                elif args.not_made_for_kids:
                    made_for_kids = False
                elif "made_for_kids" in meta:
                    made_for_kids = bool(meta["made_for_kids"])

                thumb_path = _resolve_optional_path(args.thumbnail, meta.get("thumbnail") or meta.get("thumbnail_path"), meta_dir)
                cap_path = _resolve_optional_path(args.caption, meta.get("caption") or meta.get("caption_path"), meta_dir)
                playlists = tuple(args.playlist_id or meta.get("playlists") or ())

                req = UploadRequest(
                    channel_key=args.channel,
                    video_path=video_path,
                    title=str(title),
                    description=description,
                    tags=tags,
                    category_id=category_id,
                    privacy_status=privacy,
                    publish_at=publish_at,
                    made_for_kids=made_for_kids,
                    default_language=args.language or meta.get("default_language"),
                    default_audio_language=args.audio_language or meta.get("default_audio_language"),
                    notify_subscribers=not bool(args.no_notify),
                    append_footer=bool(args.append_footer),
                    thumbnail_path=thumb_path,
                    caption_path=cap_path,
                    caption_language=args.caption_language or str(meta.get("caption_language") or "ja"),
                    caption_name=args.caption_name or str(meta.get("caption_name") or "日本語"),
                    caption_is_draft=bool(args.caption_draft),
                    playlist_ids=playlists,
                    format_id=args.format_id or meta.get("format_id"),
                    spec_path=args.spec,
                    episode_dir=args.episode_dir,
                )

                def _progress(pct: float) -> None:
                    if not args.json:
                        print(f"  [upload] {pct * 100:.1f}%", flush=True)

                result = publisher.upload_video(req, dry_run=dry_run, progress_callback=_progress)

            elif args.command == "update":
                meta = {}
                if args.metadata is not None:
                    meta = load_publish_metadata_file(args.metadata)
                video_id = args.video_id or meta.get("video_id")
                if not video_id:
                    raise MetadataValidationError("--video-id (または --metadata 内の video_id) の指定が必須です。")
                description = _load_description(args.description, args.description_file, meta.get("description"))
                has_tags = bool(args.tags or args.tag or ("tags" in meta))
                tags_val = _parse_tags_args(args.tags, args.tag, meta.get("tags")) if has_tags else None

                made_for_kids = None
                if args.made_for_kids:
                    made_for_kids = True
                elif args.not_made_for_kids:
                    made_for_kids = False
                elif "made_for_kids" in meta:
                    made_for_kids = bool(meta["made_for_kids"])

                req_u = UpdateMetadataRequest(
                    channel_key=args.channel,
                    video_id=str(video_id),
                    title=args.title if args.title is not None else meta.get("title"),
                    description=description,
                    tags=tags_val,
                    category_id=args.category_id or (str(meta["category_id"]) if meta.get("category_id") else None),
                    privacy_status=args.privacy if args.privacy is not None else meta.get("privacy_status"),
                    publish_at=args.publish_at if args.publish_at is not None else meta.get("publish_at"),
                    made_for_kids=made_for_kids,
                    default_language=args.language or meta.get("default_language"),
                    default_audio_language=args.audio_language or meta.get("default_audio_language"),
                    format_id=args.format_id or meta.get("format_id"),
                    spec_path=args.spec,
                    episode_dir=args.episode_dir,
                )
                result = publisher.update_video_metadata(req_u, dry_run=dry_run)

            elif args.command == "thumbnail":
                req_t = ThumbnailRequest(
                    channel_key=args.channel,
                    video_id=args.video_id,
                    thumbnail_path=args.thumbnail,
                    format_id=args.format_id,
                    spec_path=args.spec,
                    episode_dir=args.episode_dir,
                )
                result = publisher.set_thumbnail(req_t, dry_run=dry_run)

            elif args.command == "caption":
                req_c = CaptionRequest(
                    channel_key=args.channel,
                    video_id=args.video_id,
                    caption_path=args.caption,
                    language=args.language,
                    name=args.name,
                    is_draft=bool(args.draft),
                    caption_id=args.caption_id,
                    format_id=args.format_id,
                    spec_path=args.spec,
                    episode_dir=args.episode_dir,
                )
                result = publisher.upload_caption(req_c, dry_run=dry_run)

            elif args.command == "playlist":
                req_p = PlaylistAddRequest(
                    channel_key=args.channel,
                    video_id=args.video_id,
                    playlist_ids=tuple(args.playlist_id),
                    position=args.position,
                    format_id=args.format_id,
                    spec_path=args.spec,
                    episode_dir=args.episode_dir,
                )
                result = publisher.add_to_playlists(req_p, dry_run=dry_run)

            else:
                parser.error(f"Unknown command: {args.command}")
                return 2

        if args.json:
            print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        else:
            _print_result(result)
        return 0

    except (
        ChannelConfigError,
        ChannelMismatchError,
        MetadataValidationError,
        YouTubeAuthError,
        YouTubePublishError,
        QuotaCircuitOpen,
        FileNotFoundError,
    ) as exc:
        if args.json:
            print(json.dumps({"ok": False, "error": redact_secrets(exc)}, ensure_ascii=False, indent=2))
        else:
            print(f"[ERROR] {redact_secrets(exc)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
