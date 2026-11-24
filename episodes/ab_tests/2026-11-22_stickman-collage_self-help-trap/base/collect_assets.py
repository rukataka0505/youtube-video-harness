"""Phase 1: stickman-collage ABテスト用の共通実写素材7枚を収集・配置する（AI画像生成不使用）。"""

from __future__ import annotations

import json
import shutil
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
OLD_ASSETS = REPO_ROOT / "episodes" / "ab_tests" / "2026-11-22_planC_self-help-trap" / "base" / "assets"
AB_DIR = Path(__file__).resolve().parents[1]
BASE_ASSETS = AB_DIR / "base" / "assets"
PUBLIC_DIR = REPO_ROOT / "studio" / "public" / "ab_tests" / AB_DIR.name

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) YouTubeVideoEngineABTest/2.0"}


def dl_url(url: str, name: str) -> None:
    req = urllib.request.Request(url, headers=HEADERS)
    data = urllib.request.urlopen(req, timeout=25).read()
    (BASE_ASSETS / name).write_bytes(data)
    shutil.copy2(BASE_ASSETS / name, PUBLIC_DIR / name)
    print(f"[ok] {name} ({len(data)} bytes)")


def dl_wiki_title(title: str, name: str) -> None:
    u = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
        {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|size",
            "iiurlwidth": "1280",
            "format": "json",
        }
    )
    d = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=HEADERS), timeout=20).read().decode())
    p = next(iter(d["query"]["pages"].values()))
    info = p["imageinfo"][0]
    dl_url(info.get("thumburl") or info["url"], name)


def main() -> None:
    BASE_ASSETS.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    # 1周目の良質実写3枚を継承
    for fname in ("bookstore.jpg", "smartphone_night.jpg", "desk_notebook.jpg"):
        src = OLD_ASSETS / fname
        if src.exists():
            data = src.read_bytes()
            if not (BASE_ASSETS / fname).exists():
                (BASE_ASSETS / fname).write_bytes(data)
            if not (PUBLIC_DIR / fname).exists():
                (PUBLIC_DIR / fname).write_bytes(data)
            print(f"[copied] {fname}")

    # 1. ピーター・ゴルヴィッツァー本人写真（NYU公式）
    dl_url(
        "https://as.nyu.edu/content/dam/nyu-as/faculty/images/PeterGollwitzer.jpg",
        "peter_gollwitzer.jpg",
    )

    # 2. 日本のコンビニ実写
    dl_wiki_title("File:LAWSON STORE 100 Ibaraki Motomachi.JPG", "convenience_store.jpg")

    # 3. 室内の積み本実写
    dl_wiki_title("File:Stack of Books for decor.jpg", "book_stack_room.jpg")

    # 4. サラダチキン実写（Wikimedia検索）
    for q in ("サラダチキン", "salad chicken", "cooked chicken breast"):
        u = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
            {
                "action": "query",
                "list": "search",
                "srnamespace": "6",
                "srsearch": q,
                "srlimit": "8",
                "format": "json",
            }
        )
        res = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=HEADERS), timeout=20).read().decode())
        chosen = None
        for it in res.get("query", {}).get("search", []):
            t = str(it["title"])
            if t.lower().endswith((".jpg", ".jpeg", ".png")):
                chosen = t
                break
        if chosen:
            print(f"[salad] matched {chosen} for query={q}")
            dl_wiki_title(chosen, "salad_chicken.jpg")
            break

    print(f"[done] total photos in public dir: {len(list(PUBLIC_DIR.glob('*.*')))}")


if __name__ == "__main__":
    main()
