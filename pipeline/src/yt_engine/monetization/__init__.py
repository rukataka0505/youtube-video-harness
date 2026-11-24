"""概要欄マネタイズ導線抽出・SSRF防御付きURL検査・4信号統合骨格。"""

from __future__ import annotations

import hashlib
import ipaddress
import re
import socket
from urllib.parse import urlparse

JP_MONETIZATION_DOMAINS: dict[str, tuple[str, ...]] = {
    "affiliate": (
        "px.a8.net",
        "ck.jp.ap.valuecommerce.com",
        "t.afi-b.com",
        "af.moshimo.com",
        "t.felmat.net",
        "h.accesstrade.net",
        "linksynergy.com",
        "trafficgate.net",
        "amzn.to",
        "amazon.co.jp",
        "rakuten.co.jp",
    ),
    "line_funnel": (
        "lin.ee",
        "line.me",
        "liff.line.me",
        "lstep.app",
        "s.lmes.jp",
        "step.lme.jp",
        "utage-system.com",
    ),
    "owned_product": (
        "note.com",
        "stan.store",
        "skool.com",
        "beacons.ai",
    ),
}

JP_PR_MARKERS = re.compile(
    r"(【PR】|#PR|#広告|#プロモーション|提供[:：]|タイアップ|商品提供を受けて|sponsored|#ad|paid link)",
    re.IGNORECASE,
)

URL_EXTRACT_RE = re.compile(r"https?://[^\s<>\"')\]]+")


def extract_urls(description: str) -> list[str]:
    """動画概要欄テキストから外部URLを重複排除して抽出する。"""
    seen: set[str] = set()
    urls: list[str] = []
    for match in URL_EXTRACT_RE.findall(description):
        if match not in seen:
            seen.add(match)
            urls.append(match)
    return urls


def classify_description_signals(description: str) -> dict[str, list[str] | bool]:
    """概要欄内の導線カテゴリ別URLとPR表記の有無を静的分類する（ネットワーク通信なし）。"""
    urls = extract_urls(description)
    found: dict[str, list[str] | bool] = {
        "affiliate": [],
        "line_funnel": [],
        "owned_product": [],
        "has_pr_disclosure": bool(JP_PR_MARKERS.search(description)),
    }
    for url in urls:
        host = (urlparse(url).hostname or "").lower()
        for category, domains in JP_MONETIZATION_DOMAINS.items():
            if any(host == d or host.endswith("." + d) for d in domains):
                found[category].append(url)  # type: ignore[union-attr]
    return found


def sponsorblock_hash_prefix(video_id: str) -> str:
    """SponsorBlock 公開API向けの SHA-256 先頭4文字ハッシュを生成する。"""
    return hashlib.sha256(video_id.encode("utf-8")).hexdigest()[:4]


def is_safe_public_url(url: str, resolve_dns: bool = False) -> bool:
    """リダイレクト展開時のSSRFを防ぐため、公開HTTP/HTTPSかつ非プライベートIPであるか検証する。"""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False

    hostname = parsed.hostname.lower()
    if hostname in {"localhost", "localhost.localdomain"}:
        return False

    def _is_public_ip(ip_str: str) -> bool:
        addr = ipaddress.ip_address(ip_str)
        return not (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_multicast
            or addr.is_reserved
            or addr.is_unspecified
        )

    try:
        return _is_public_ip(hostname)
    except ValueError:
        if not resolve_dns:
            return True
        infos = socket.getaddrinfo(hostname, None)
        return all(_is_public_ip(str(info[4][0])) for info in infos)
