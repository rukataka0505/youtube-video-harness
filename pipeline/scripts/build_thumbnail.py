"""Remotion <Still> 主軸 サムネイル検証＆一括ビルド CLI ラッパースクリプト。"""

from __future__ import annotations

import sys

from yt_engine.thumbnail_builder import main


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
