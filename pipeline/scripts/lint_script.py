"""全フォーマット横断の台本機械リンター（固い床ERROR検証 × 任意の推敲WARNING × 参考メトリクス）。

設計原則（固い床 × 自由舞台）:
- 固い床（ERROR / 終了コード1）:
  02_script_display.md / 03_script_reading.md の2ファイル分離とチャンクID・内容整合、
  読み上げ原稿へのト書き・英語指示・Markdown装飾混入ゼロ、
  冒頭挨拶・登録依頼ゼロ、末尾の終了合図語・禁止語尾ゼロ。
- TTS 前処理ヒント（WARNING / 通常は終了コード0）:
  読み上げ原稿の誤読しやすい漢字・未カタカナ化英単語・桁カンマ・%記号など、聴感事故の予防のみ。
  語彙レベルの NG 語リスト（AI臭・翻訳調フレーズ集）は設けない（文体はモデルの日本語表現力に委ねる）。
- 参考メトリクス（非強制・AB比較用）:
  推定尺・文字数・文長・短文連続・漢字率・冒頭フック信号・リフック間隔・具体例密度・「間」の手がかり数。
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import unicodedata
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

STANDARD_CHARS_PER_MIN = 340.0

SUPPORTED_FORMATS = ("stickman_collage", "planE")

OPENING_GREETING_PATTERNS: tuple[tuple[str, str], ...] = (
    ("こんにちは", "挨拶「こんにちは」"),
    ("こんばんは", "挨拶「こんばんは」"),
    ("おはようございます", "挨拶「おはようございます」"),
    ("どうも", "冒頭挨拶「どうも」"),
    ("ようこそ", "冒頭挨拶「ようこそ」"),
    ("はじめまして", "自己紹介「はじめまして」"),
    ("初めまして", "自己紹介「初めまして」"),
    ("今回の動画では", "導入前置き「今回の動画では」"),
    ("今日の動画では", "導入前置き「今日の動画では」"),
    ("この動画では", "導入前置き「この動画では」"),
    ("チャンネル登録", "冒頭の登録依頼「チャンネル登録」"),
    ("高評価", "冒頭の高評価依頼「高評価」"),
    ("ゆっくりしていって", "定型挨拶「ゆっくりしていって」"),
)

FORBIDDEN_ENDING_PATTERNS: tuple[tuple[str, str], ...] = (
    ("いかがでしたでしょうか", "終了合図語「いかがでしたでしょうか」"),
    ("いかがだったでしょうか", "終了合図語「いかがだったでしょうか」"),
    ("ご視聴ありがとうございました", "終了挨拶「ご視聴ありがとうございました」"),
    ("ご視聴ありがとうございます", "終了挨拶「ご視聴ありがとうございます」"),
    ("最後までご覧いただきありがとう", "終了挨拶「最後までご覧いただきありがとう」"),
    ("最後まで見てくれてありがとう", "終了挨拶「最後まで見てくれてありがとう」"),
    ("それではまた次回の動画で", "終了挨拶「それではまた次回の動画で」"),
    ("また次回の動画でお会いしましょう", "終了挨拶「また次回の動画でお会いしましょう」"),
    ("以上、まとめでした", "終了合図語「以上、まとめでした」"),
    ("今回は以上になります", "終了合図語「今回は以上になります」"),
    ("本日の動画は以上", "終了合図語「本日の動画は以上」"),
    ("だぜ", "禁止語尾「だぜ」"),
    ("なのぜ", "禁止語尾「なのぜ」"),
)

# 読み上げ原稿で「間」を生む書き言葉の手がかり（ト書きではなく本文の句読点・記号として TTS がそのまま解釈する）。
# 参考メトリクスとして数えるだけで、多寡は強制しない。
PAUSE_CUE_RE = re.compile(r"…{1,}|‥{1,}|―{2,}|──|—{2,}")

DIGIT_COMMA_RE = re.compile(r"\d,\d{3}")
PERCENT_SIGN_RE = re.compile(r"[%％]")

READING_STAGE_DIRECTION_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"\[(?:pause|beat|sfx|bgm|whisper|laugh|sigh|music|cut|fade|note)[^\]]*\]",
            re.IGNORECASE,
        ),
        "英語/演出タグの混入",
    ),
    (re.compile(r"（※[^）\n]*）"), "注釈ト書き（※...）の混入"),
    (re.compile(r"[（(]\s*(?:SE|BGM|無音|間|ポーズ|効果音|テロップ|演出)[^）)\n]*[）)]", re.IGNORECASE), "演出ト書き括弧の混入"),
    (re.compile(r"【\s*(?:SE|BGM|演出|テロップ|注|間)[^】\n]*】", re.IGNORECASE), "演出ト書き隅括弧【...】の混入"),
    (re.compile(r"<br\s*/?>", re.IGNORECASE), "HTML改行タグ <br> の混入"),
    (re.compile(r"\*\*[^*\n]+\*\*"), "Markdown太字記法 **...** の混入"),
    (re.compile(r"`[^`\n]+`"), "Markdownインラインコード記法 `...` の混入"),
    (re.compile(r"\[[^\]\n]+\]\([^)\n]+\)"), "Markdownリンク記法の混入"),
)

ENGLISH_DIRECTION_PATTERN = re.compile(
    r"(?:\b[A-Za-z]{2,}\b(?:\s+[A-Za-z]{2,}){2,})|(?:^(?:Tone|Voice|Cue|Pause|Note|Style)\s*:)",
    re.IGNORECASE | re.MULTILINE,
)

AMBIGUOUS_KANJI_IN_READING: tuple[tuple[str, str], ...] = (
    ("人気", "ひとけ/にんき"),
    ("最中", "さいちゅう/もなか"),
    ("十分", "じゅうぶん/じゅっぷん"),
    ("明日", "あした/あす"),
    ("施行", "しこう/せこう"),
    ("早急", "さっきゅう/そうきゅう"),
    ("重複", "ちょうふく/じゅうふく"),
    ("代替", "だいたい/だいがえ"),
    ("凡例", "はんれい/ぼんれい"),
    ("有無", "うむ"),
    ("何時", "いつ/なんじ"),
)

ASCII_WHITELIST: frozenset[str] = frozenset(
    {
        "SNS",
        "AI",
        "GDP",
        "OECD",
        "FRB",
        "IMF",
        "VHS",
        "QR",
        "CTA",
        "IT",
        "PC",
        "URL",
        "CEO",
        "CM",
        "PR",
        "NG",
        "OK",
        "VS",
        "TV",
        "YouTube",
        "Notion",
        "iPhone",
        "X",
        "Y",
        "CTV",
        "B",
        "A",
        "C",
        "E",
        "EDINET",
        "API",
        "NISA",
        "iDeCo",
        "ETF",
        "KPI",
        "ROI",
        "B2B",
        "B2C",
        "NASA",
        "WHO",
        "JR",
        "NHK",
    }
)

REHOOK_KEYWORDS: tuple[str, ...] = (
    "ところが",
    "じゃあ",
    "実は",
    "じつは",
    "なぜ",
    "しかし",
    "問題は",
    "一方で",
    "ところがどっこい",
    "では",
)

IRONY_CONCRETE_MARKERS: tuple[str, ...] = (
    "コンビニ",
    "サラダチキン",
    "ベッド",
    "深夜",
    "スマホ",
    "ショート動画",
    "積ん読",
    "つんどく",
    "現実逃避",
    "コスパ",
    "丸投げ",
    "カン違い",
    "勘違い",
    "気まずい",
    "意地悪",
    "税金",
    "大企業",
    "激安",
    "給料",
    "財布",
    "電車",
    "カフェ",
    "本屋",
    "ノート",
    "手帳",
    "会社員",
    "値札",
    "ご褒美",
    "ごほうび",
    "開封動画",
    "見せびらか",
    "買える側",
    "100円",
)

KANJI_RE = re.compile(r"[一-龥々〆ヵヶ]")
SENTENCE_SPLIT_RE = re.compile(r"[^。！？\n]+[。！？]?")
ASCII_WORD_RE = re.compile(r"\b[A-Za-z][A-Za-z0-9_-]*\b")
TIMESTAMP_RANGE_RE = re.compile(r"(\d+):(\d{2})\s*[〜~\-–]\s*(\d+):(\d{2})")
CHUNK_BULLET_RE = re.compile(
    r"^\s*[-*]\s+\*\*([A-Za-z0-9_-]+)\s*(?:\[([^\]]*)\])?\*\*\s*(.*)$"
)
READING_NUMBERED_CHUNK_RE = re.compile(
    r"^\s*(?:\d+\.|-|\*)\s*`?([A-Za-z0-9_-]+)`?(?:\s*\([^)]*\))?\s*$"
)
READING_HEADING_CHUNK_RE = re.compile(r"^#{2,4}\s*\[([A-Za-z0-9_-]+)\]\s*$")
READING_PREFIX_CHUNK_RE = re.compile(r"^\s*([A-Za-z0-9_-]+)\s*[:：]\s*(.+)$")


def _configure_stdio_utf8() -> None:
    """Windows cp932 環境での標準入出力エンコード例外を防ぐ。"""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


@dataclass
class ScriptSegment:
    """パースされた台本の1チャンク／1ブロック。"""

    chunk_id: str | None
    text: str
    line_no: int
    tags: list[str] = field(default_factory=list)


@dataclass
class ParsedScript:
    """パース済み台本データ。"""

    kind: str
    style: str
    segments: list[ScriptSegment] = field(default_factory=list)
    estimated_target_sec: float | None = None
    detected_format: str | None = None
    has_explicit_rehook_tags: int = 0

    @property
    def full_text(self) -> str:
        return "\n".join(seg.text for seg in self.segments if seg.text.strip())

    @property
    def chunk_ids(self) -> list[str]:
        return [seg.chunk_id for seg in self.segments if seg.chunk_id]


@dataclass
class LintIssue:
    """検知された単一 Lint 指摘。"""

    severity: str  # "ERROR" | "WARNING"
    code: str
    file: str
    line: int | None
    message: str
    snippet: str = ""


@dataclass
class ScriptMetrics:
    """単一バリエーションの定量指標。"""

    name: str
    format_id: str
    display_style: str
    reading_style: str
    display_chars: int
    reading_chars: int
    length_ratio: float
    content_similarity: float
    target_sec: float | None
    estimated_sec: float
    sentence_count: int
    avg_sentence_len: float
    max_sentence_len: int
    long_sentences_70: int
    short_sentence_max_streak: int
    opening_15s_chars: int
    opening_15s_sentences: int
    opening_15s_hook_signals: int
    rehook_count: int
    rehook_avg_interval_sec: float | None
    concrete_irony_count: int
    concrete_irony_per_min: float
    display_kanji_ratio: float
    reading_kanji_ratio: float
    pause_cue_count: int
    stage_direction_hits: int
    error_count: int
    warning_count: int
    passed: bool


@dataclass
class LintResult:
    """単一ターゲットに対する Lint 結果全体。"""

    target: str
    display_path: str | None
    reading_path: str | None
    metrics: ScriptMetrics
    issues: list[LintIssue] = field(default_factory=list)


def _strip_for_count(text: str) -> str:
    """空白・改行・記号類を除いた実発話文字列を返す。"""
    cleaned = re.sub(r"[\s\u3000、。,.!?！？「」『』（）()［］\[\]【】…・―—〜~\-:：;；\"'`]", "", text)
    return cleaned


def _strip_for_similarity(text: str) -> str:
    """表記揺れ吸収のため NFKC 正規化＋空白句読点除去を行う。"""
    normalized = unicodedata.normalize("NFKC", text)
    return _strip_for_count(normalized).lower()


def _kanji_ratio(text: str) -> float:
    base = _strip_for_count(text)
    if not base:
        return 0.0
    kanji_count = len(KANJI_RE.findall(base))
    return kanji_count / len(base)


def _split_sentences_from_segments(segments: list[ScriptSegment]) -> list[tuple[str, int]]:
    """各セグメントの元ファイル行番号を保ちつつ文単位に分割する。"""
    sentences: list[tuple[str, int]] = []
    for seg in segments:
        buf = ""
        for raw_line in seg.text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            buf = f"{buf}{line}"
            if buf.endswith(("。", "！", "!", "？", "?")):
                for match in SENTENCE_SPLIT_RE.finditer(buf):
                    sent = match.group(0).strip()
                    if sent:
                        sentences.append((sent, seg.line_no))
                buf = ""
        if buf:
            for match in SENTENCE_SPLIT_RE.finditer(buf):
                sent = match.group(0).strip()
                if sent:
                    sentences.append((sent, seg.line_no))
    return sentences


def _split_sentences(text: str) -> list[tuple[str, int]]:
    """本文を文単位（文文字列, 1始まり近似行番号）に分割する。"""
    return _split_sentences_from_segments(
        [ScriptSegment(chunk_id=None, text=line, line_no=idx) for idx, line in enumerate(text.splitlines(), start=1) if line.strip()]
    )


def _detect_format_hint(text: str, path_hint: str = "") -> str | None:
    mapping = (
        ("stickman_collage", ("stickman_collage", "stickman-collage")),
        ("planE", ("plane_macro_econ", "plan-e-macro-econ", "plane", "案e")),
    )
    # まずパス名・明示フォーマット行を優先
    path_lower = path_hint.lower()
    for fmt, keywords in mapping:
        if any(kw in path_lower for kw in keywords):
            return fmt
    head_lower = text[:1500].lower()
    for line in head_lower.splitlines()[:15]:
        if "フォーマット" in line or "format" in line:
            for fmt, keywords in mapping:
                if any(kw in line for kw in keywords):
                    return fmt
    for fmt, keywords in mapping:
        if any(kw in head_lower for kw in keywords):
            return fmt
    return None


def _estimate_target_sec_from_header(text: str) -> float | None:
    head = text[:2000]
    for pattern in (
        r"(?:対象尺|想定尺)[^\n]{0,20}?約?\s*(\d{2,4})\s*(?:〜\s*(\d{2,4}))?\s*秒",
        r"(?:冒頭|対象尺|想定尺)[^\n]{0,20}?約?\s*(\d{2,4})\s*(?:〜\s*(\d{2,4}))?\s*秒",
    ):
        sec_match = re.search(pattern, head)
        if sec_match:
            low = float(sec_match.group(1))
            high = float(sec_match.group(2)) if sec_match.group(2) else low
            return (low + high) / 2.0

    min_match = re.search(r"(?:対象尺|想定尺|長尺)[^\n]{0,20}?約?\s*(\d{1,2})\s*(?:〜\s*(\d{1,2}))?\s*分", head)
    if min_match:
        low = float(min_match.group(1)) * 60.0
        high = float(min_match.group(2)) * 60.0 if min_match.group(2) else low
        return (low + high) / 2.0

    max_end = 0.0
    for m in TIMESTAMP_RANGE_RE.finditer(text):
        end_sec = int(m.group(3)) * 60 + int(m.group(4))
        if end_sec > max_end:
            max_end = float(end_sec)
    if max_end >= 20.0:
        return max_end

    sec_sum = 0.0
    for m in re.finditer(r"\*\*想定秒数:\*\*\s*(\d+(?:\.\d+)?)\s*s", text):
        sec_sum += float(m.group(1))
    if sec_sum >= 15.0:
        return sec_sum
    return None


def _is_display_meta_heading(heading: str) -> bool:
    h = heading.strip()
    meta_tokens = (
        "パッケージ仮確定",
        "一次情報ソース",
        "一次ソース",
        "出典",
        "概要欄",
        "前提",
        "比較軸",
        "メタ",
    )
    return any(tok in h for tok in meta_tokens)


def parse_display_script(text: str, path_hint: str = "") -> ParsedScript:
    """表示用台本 `02_script_display.md` からメタ・映像指示を除いた発話本文を抽出する。"""
    lines = text.splitlines()
    target_sec = _estimate_target_sec_from_header(text)
    detected_format = _detect_format_hint(text, path_hint)

    # 1. Markdown表型（ナレーション/発話列を自動特定）
    for idx in range(len(lines) - 1):
        line = lines[idx].strip()
        next_line = lines[idx + 1].strip()
        if line.startswith("|") and next_line.startswith("|") and "---" in next_line:
            headers = [cell.strip() for cell in line.strip("|").split("|")]
            narr_col: int | None = None
            id_col: int | None = None
            for col_i, h in enumerate(headers):
                if any(k in h for k in ("ナレーション", "表示文", "発話", "セリフ")):
                    narr_col = col_i
                if any(k in h.lower() for k in ("chunk", "id", "セグメント")):
                    if id_col is None:
                        id_col = col_i
            if narr_col is not None:
                segments: list[ScriptSegment] = []
                row_idx = idx + 2
                while row_idx < len(lines) and lines[row_idx].strip().startswith("|"):
                    cells = [c.strip() for c in lines[row_idx].strip().strip("|").split("|")]
                    if narr_col < len(cells):
                        raw_cell = re.sub(r"<br\s*/?>", "\n", cells[narr_col], flags=re.IGNORECASE)
                        raw_cell = raw_cell.replace("`", "").strip()
                        cid = (
                            cells[id_col].replace("`", "").strip()
                            if id_col is not None and id_col < len(cells)
                            else None
                        )
                        if raw_cell and not raw_cell.startswith("（※"):
                            segments.append(
                                ScriptSegment(chunk_id=cid or None, text=raw_cell, line_no=row_idx + 1)
                            )
                    row_idx += 1
                if segments:
                    return ParsedScript(
                        kind="display",
                        style="markdown_table",
                        segments=segments,
                        estimated_target_sec=target_sec,
                        detected_format=detected_format,
                    )

    # 2. チャンク箇条書き型 (- **c01 [タグ]** \n インデント本文)
    chunk_segments: list[ScriptSegment] = []
    explicit_rehooks = 0
    i = 0
    while i < len(lines):
        m = CHUNK_BULLET_RE.match(lines[i])
        if m:
            cid = m.group(1).strip()
            tag_str = (m.group(2) or "").strip()
            tags = [t.strip() for t in re.split(r"[/・,|]", tag_str) if t.strip()] if tag_str else []
            if any("リフック" in t for t in tags):
                explicit_rehooks += 1
            inline_rest = m.group(3).strip()
            body_lines: list[str] = [inline_rest] if inline_rest else []
            j = i + 1
            while j < len(lines):
                nxt = lines[j]
                if not nxt.strip():
                    break
                if CHUNK_BULLET_RE.match(nxt) or nxt.lstrip().startswith("#"):
                    break
                if nxt.startswith("  ") or nxt.startswith("\t"):
                    body_lines.append(nxt.strip())
                    j += 1
                else:
                    break
            joined = "\n".join(bl for bl in body_lines if bl)
            if joined:
                chunk_segments.append(
                    ScriptSegment(chunk_id=cid, text=joined, line_no=i + 1, tags=tags)
                )
            i = j
            continue
        i += 1
    if chunk_segments:
        return ParsedScript(
            kind="display",
            style="chunk_bullets",
            segments=chunk_segments,
            estimated_target_sec=target_sec,
            detected_format=detected_format,
            has_explicit_rehook_tags=explicit_rehooks,
        )

    # 3. テンプレート引用型 (発話指定配下の > 引用行)
    quote_segments: list[ScriptSegment] = []
    in_speech_quote = False
    for line_no, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if any(
            k in stripped
            for k in (
                "**発話（表示用）：**",
                "**発話：**",
                "**下段ベース字幕",
                "LINK → CURIOSITY GAP",
            )
        ):
            in_speech_quote = True
            continue
        if in_speech_quote:
            if stripped.startswith(">"):
                q_text = stripped.lstrip(">").strip()
                if q_text and not re.fullmatch(r"（?※[^）]*）?", q_text):
                    quote_segments.append(ScriptSegment(chunk_id=None, text=q_text, line_no=line_no))
                continue
            if stripped == "" or stripped.startswith("-") or stripped.startswith("#"):
                in_speech_quote = False

    if quote_segments:
        return ParsedScript(
            kind="display",
            style="template_quotes",
            segments=quote_segments,
            estimated_target_sec=target_sec,
            detected_format=detected_format,
        )

    # 4. セクション散文型（メタ領域・単独ト書き・箇条書きメタを除外）
    prose_segments: list[ScriptSegment] = []
    in_meta_section = False
    has_seen_hr = "---" not in lines
    for line_no, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if stripped == "---":
            has_seen_hr = True
            in_meta_section = False
            continue
        if stripped.startswith("# "):
            continue
        if stripped.startswith("## "):
            in_meta_section = _is_display_meta_heading(stripped)
            has_seen_hr = True
            continue
        if not has_seen_hr or in_meta_section:
            continue
        if not stripped:
            continue
        if stripped.startswith("- ") or stripped.startswith("* ") or re.match(r"^\d+\.\s", stripped):
            continue
        if stripped.startswith(">"):
            continue
        if re.fullmatch(r"[（(]※[^）)]*[）)]", stripped):
            continue
        if re.fullmatch(r"\[[^\]]+\]", stripped):
            continue
        prose_segments.append(ScriptSegment(chunk_id=None, text=stripped, line_no=line_no))

    return ParsedScript(
        kind="display",
        style="section_prose",
        segments=prose_segments,
        estimated_target_sec=target_sec,
        detected_format=detected_format,
    )


def parse_reading_script(text: str, path_hint: str = "") -> ParsedScript:
    """読み上げ用台本 `03_script_reading.md` から運用メタを除いた読み上げ本文を抽出する。"""
    lines = text.splitlines()
    segments: list[ScriptSegment] = []
    current_chunk_id: str | None = None
    in_skip_section = False
    in_top_blockquote = True
    style = "plain_reading"

    for line_no, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if not stripped:
            continue
        if stripped.startswith("# ") and line_no <= 5:
            continue
        if stripped == "---":
            in_skip_section = False
            in_top_blockquote = False
            continue
        if stripped.startswith(">") and in_top_blockquote:
            continue
        in_top_blockquote = False

        if re.match(r"^#{2,4}\s+", stripped):
            heading_chunk = READING_HEADING_CHUNK_RE.match(stripped)
            if heading_chunk:
                current_chunk_id = heading_chunk.group(1)
                style = "segment_headings"
                in_skip_section = False
                continue
            if any(
                k in stripped
                for k in ("前処理チェック", "Gate 3", "耳チェック", "修正ログ", "運用規約")
            ):
                in_skip_section = True
                continue
            if any(k in stripped for k in ("セグメント別", "チャンク一覧")):
                in_skip_section = False
                continue
            in_skip_section = False
            continue

        if in_skip_section:
            continue
        if re.match(r"^[-*]\s*\[[ xX]\]", stripped):
            continue

        num_chunk = READING_NUMBERED_CHUNK_RE.match(stripped)
        if num_chunk:
            current_chunk_id = num_chunk.group(1)
            style = "numbered_chunks"
            continue

        prefix_chunk = READING_PREFIX_CHUNK_RE.match(stripped)
        if prefix_chunk and not re.match(r"^(?:Tone|Voice|Cue|Pause|Note|Style)$", prefix_chunk.group(1), re.I):
            cid = prefix_chunk.group(1)
            body = prefix_chunk.group(2).strip()
            style = "prefixed_chunks"
            if body and not body.startswith("（ここに読み上げ専用テキスト"):
                segments.append(ScriptSegment(chunk_id=cid, text=body, line_no=line_no))
            current_chunk_id = None
            continue

        if stripped.startswith("（ここに読み上げ専用テキスト"):
            continue

        segments.append(ScriptSegment(chunk_id=current_chunk_id, text=stripped, line_no=line_no))
        current_chunk_id = None

    return ParsedScript(
        kind="reading",
        style=style,
        segments=segments,
        detected_format=_detect_format_hint(text, path_hint),
    )


def _check_common_prose_rules(
    *,
    parsed: ParsedScript,
    file_label: str,
    issues: list[LintIssue],
) -> None:
    """固い床（空台本・冒頭挨拶・終了合図語/禁止語尾）のみを検査する。

    語彙レベルの NG 語リスト（AI臭・翻訳調フレーズ集）や文長・語尾・漢字率などの表現縛りは設けず、
    自由舞台としてモデルの自然な日本語表現力に委ねる（文体系は参考メトリクスでのみ計測）。
    """
    full_text = parsed.full_text
    if not full_text.strip():
        issues.append(
            LintIssue("ERROR", "empty_script", file_label, 1, "本文テキストが抽出できません（空台本）。")
        )
        return

    # 1. [固い床 ERROR] 冒頭挨拶・導入前置き・登録依頼（冒頭120文字）
    opening_slice = full_text[:120]
    for token, desc in OPENING_GREETING_PATTERNS:
        if token in opening_slice:
            issues.append(
                LintIssue("ERROR", "opening_greeting", file_label, 1, f"冒頭120文字以内に{desc}があります。", token)
            )

    # 2. [固い床 ERROR] 終了合図語・禁止語尾（全文）
    for token, desc in FORBIDDEN_ENDING_PATTERNS:
        if token in full_text:
            issues.append(
                LintIssue("ERROR", "forbidden_ending_phrase", file_label, None, f"禁止された{desc}が含まれています。", token)
            )


def _check_reading_specific_rules(
    parsed_reading: ParsedScript, issues: list[LintIssue]
) -> int:
    """読み上げ原稿へのト書き・英語指示・誤読漢字・未カナ化英単語混入を検査する。"""
    stage_hits = 0
    for seg in parsed_reading.segments:
        txt = seg.text
        for pattern, desc in READING_STAGE_DIRECTION_PATTERNS:
            for m in pattern.finditer(txt):
                stage_hits += 1
                issues.append(
                    LintIssue(
                        "ERROR",
                        "reading_stage_direction",
                        "03_script_reading.md",
                        seg.line_no,
                        f"読み上げ原稿にト書き/装飾が混入しています（{desc}）。",
                        m.group(0),
                    )
                )

        eng_match = ENGLISH_DIRECTION_PATTERN.search(txt)
        if eng_match:
            stage_hits += 1
            issues.append(
                LintIssue(
                    "ERROR",
                    "reading_english_direction",
                    "03_script_reading.md",
                    seg.line_no,
                    "読み上げ原稿に英語の演技指示文が混入しています（純日本語のみ許可）。",
                    eng_match.group(0),
                )
            )

        for kanji, reading_hint in AMBIGUOUS_KANJI_IN_READING:
            if kanji in txt:
                issues.append(
                    LintIssue(
                        "WARNING",
                        "reading_ambiguous_kanji",
                        "03_script_reading.md",
                        seg.line_no,
                        f"TTS誤読しやすい語「{kanji}」（{reading_hint}）が残っています。ひらがな化を推奨。",
                        kanji,
                    )
                )

        for m in ASCII_WORD_RE.finditer(txt):
            word = m.group(0)
            if word in ASCII_WHITELIST or word.upper() in ASCII_WHITELIST:
                continue
            if re.fullmatch(r"[A-Z]{2,5}", word):
                continue
            issues.append(
                LintIssue(
                    "WARNING",
                    "reading_raw_ascii",
                    "03_script_reading.md",
                    seg.line_no,
                    f"読み上げ原稿に未カタカナ化英単語「{word}」が残っています。",
                    word,
                )
            )

        for m in DIGIT_COMMA_RE.finditer(txt):
            issues.append(
                LintIssue(
                    "WARNING",
                    "reading_digit_comma",
                    "03_script_reading.md",
                    seg.line_no,
                    "読み上げ原稿に桁カンマが残っています（5,000→5000 の前処理を推奨）。",
                    m.group(0),
                )
            )
        if PERCENT_SIGN_RE.search(txt):
            issues.append(
                LintIssue(
                    "WARNING",
                    "reading_percent_sign",
                    "03_script_reading.md",
                    seg.line_no,
                    "読み上げ原稿に % 記号が残っています（「パーセント」表記を推奨）。",
                    "%",
                )
            )

    return stage_hits


def _compute_metrics(
    *,
    name: str,
    format_id: str,
    parsed_display: ParsedScript | None,
    parsed_reading: ParsedScript | None,
    target_sec: float | None,
    issues: list[LintIssue],
    stage_hits: int,
) -> ScriptMetrics:
    d_text = parsed_display.full_text if parsed_display else ""
    r_text = parsed_reading.full_text if parsed_reading else ""
    d_chars = len(_strip_for_count(d_text))
    r_chars = len(_strip_for_count(r_text))

    length_ratio = (r_chars / d_chars) if d_chars > 0 else 0.0
    sim = (
        difflib.SequenceMatcher(None, _strip_for_similarity(d_text), _strip_for_similarity(r_text)).ratio()
        if d_chars > 0 and r_chars > 0
        else 0.0
    )

    primary_text = r_text if r_chars > 0 else d_text
    primary_chars = r_chars if r_chars > 0 else d_chars
    estimated_sec = (primary_chars / STANDARD_CHARS_PER_MIN) * 60.0 if primary_chars > 0 else 0.0

    primary_segments = (
        parsed_reading.segments
        if (parsed_reading and r_chars > 0)
        else (parsed_display.segments if parsed_display else [])
    )
    sentences = _split_sentences_from_segments(primary_segments)
    sent_lengths = [len(_strip_for_count(s)) for s, _ in sentences if _strip_for_count(s)]
    sent_count = len(sent_lengths)
    avg_len = (sum(sent_lengths) / sent_count) if sent_count > 0 else 0.0
    max_len = max(sent_lengths) if sent_lengths else 0
    long_70 = sum(1 for ln in sent_lengths if ln > 70)

    short_streak = 0
    short_max_streak = 0
    for ln in sent_lengths:
        if 0 < ln < 20:
            short_streak += 1
            if short_streak > short_max_streak:
                short_max_streak = short_streak
        else:
            short_streak = 0

    # 冒頭15秒密度（約85文字基準）
    opening_buf = ""
    opening_sent_count = 0
    for s, _ in sentences:
        opening_buf += s
        opening_sent_count += 1
        if len(_strip_for_count(opening_buf)) >= 85:
            break
    opening_chars = len(_strip_for_count(opening_buf))
    hook_signals = opening_buf.count("？") + opening_buf.count("?") + sum(
        1 for kw in ("もし", "なぜ", "実は", "じつは", "ところが", "真逆", "罠") if kw in opening_buf
    )

    # リフック回数と平均間隔
    rehook_count = parsed_display.has_explicit_rehook_tags if parsed_display else 0
    for s, _ in sentences:
        if "？" in s or "?" in s or any(s.startswith(k) for k in REHOOK_KEYWORDS):
            rehook_count += 1
    rehook_interval = (estimated_sec / rehook_count) if rehook_count > 0 and estimated_sec > 0 else None

    # 皮肉・具体例密度
    concrete_hits = len(re.findall(r"\d+(?:\.\d+)?(?:％|%|倍|億|万|兆|年|時|分|秒|冊|円|ドル|件|人|割|ページ)?", primary_text))
    concrete_hits += sum(primary_text.count(m) for m in IRONY_CONCRETE_MARKERS)
    est_min = estimated_sec / 60.0 if estimated_sec > 0 else 0.0
    concrete_per_min = (concrete_hits / est_min) if est_min > 0 else 0.0

    # 「間」の手がかり（……・――）の数。結論・反転・オチ前の呼吸が本文に書かれているかの参考値
    pause_cues = len(PAUSE_CUE_RE.findall(r_text if r_chars > 0 else d_text))

    err_count = sum(1 for iss in issues if iss.severity == "ERROR")
    warn_count = sum(1 for iss in issues if iss.severity == "WARNING")

    return ScriptMetrics(
        name=name,
        format_id=format_id,
        display_style=parsed_display.style if parsed_display else "missing",
        reading_style=parsed_reading.style if parsed_reading else "missing",
        display_chars=d_chars,
        reading_chars=r_chars,
        length_ratio=round(length_ratio, 3),
        content_similarity=round(sim, 3),
        target_sec=round(target_sec, 1) if target_sec is not None else None,
        estimated_sec=round(estimated_sec, 1),
        sentence_count=sent_count,
        avg_sentence_len=round(avg_len, 1),
        max_sentence_len=max_len,
        long_sentences_70=long_70,
        short_sentence_max_streak=short_max_streak,
        opening_15s_chars=opening_chars,
        opening_15s_sentences=opening_sent_count,
        opening_15s_hook_signals=hook_signals,
        rehook_count=rehook_count,
        rehook_avg_interval_sec=round(rehook_interval, 1) if rehook_interval is not None else None,
        concrete_irony_count=concrete_hits,
        concrete_irony_per_min=round(concrete_per_min, 1),
        display_kanji_ratio=round(_kanji_ratio(d_text), 3),
        reading_kanji_ratio=round(_kanji_ratio(r_text), 3),
        pause_cue_count=pause_cues,
        stage_direction_hits=stage_hits,
        error_count=err_count,
        warning_count=warn_count,
        passed=(err_count == 0),
    )


def lint_script_pair(
    *,
    display_path: Path | None,
    reading_path: Path | None,
    name: str | None = None,
    format_id: str = "auto",
    target_sec: float | None = None,
    mode: str = "auto",
) -> LintResult:
    """表示用・読み上げ用台本ペアを解析・機械検証する。"""
    issues: list[LintIssue] = []
    target_label = name or (
        display_path.parent.name if display_path else (reading_path.parent.name if reading_path else "unknown")
    )

    display_exists = display_path is not None and display_path.is_file()
    reading_exists = reading_path is not None and reading_path.is_file()

    if not display_exists:
        issues.append(
            LintIssue("ERROR", "missing_pair_file", "02_script_display.md", None, "表示用台本 02_script_display.md が見つかりません。")
        )
    if not reading_exists:
        issues.append(
            LintIssue("ERROR", "missing_pair_file", "03_script_reading.md", None, "読み上げ原稿 03_script_reading.md が見つかりません。")
        )

    parsed_display = (
        parse_display_script(display_path.read_text(encoding="utf-8"), str(display_path))
        if display_exists and display_path is not None
        else None
    )
    parsed_reading = (
        parse_reading_script(reading_path.read_text(encoding="utf-8"), str(reading_path))
        if reading_exists and reading_path is not None
        else None
    )

    resolved_format = format_id
    if resolved_format == "auto":
        resolved_format = (
            (parsed_display.detected_format if parsed_display else None)
            or (parsed_reading.detected_format if parsed_reading else None)
            or "unknown"
        )

    resolved_target_sec = target_sec
    if resolved_target_sec is None and parsed_display is not None:
        resolved_target_sec = parsed_display.estimated_target_sec

    stage_hits = 0

    seen_prose_keys: set[tuple[str, str]] = set()
    if parsed_display is not None:
        before_idx = len(issues)
        _check_common_prose_rules(
            parsed=parsed_display,
            file_label="02_script_display.md",
            issues=issues,
        )
        for iss in issues[before_idx:]:
            seen_prose_keys.add((iss.code, iss.snippet))

    if parsed_reading is not None:
        reading_prose_issues: list[LintIssue] = []
        _check_common_prose_rules(
            parsed=parsed_reading,
            file_label="03_script_reading.md",
            issues=reading_prose_issues,
        )
        for iss in reading_prose_issues:
            key = (iss.code, iss.snippet)
            if key in seen_prose_keys:
                continue
            seen_prose_keys.add(key)
            issues.append(iss)
        stage_hits = _check_reading_specific_rules(parsed_reading, issues)

    # ペア整合検査
    if parsed_display is not None and parsed_reading is not None:
        d_ids = parsed_display.chunk_ids
        r_ids = parsed_reading.chunk_ids
        if d_ids and r_ids and d_ids != r_ids:
            issues.append(
                LintIssue(
                    "ERROR",
                    "chunk_id_mismatch",
                    "pair",
                    None,
                    f"表示台本と読み上げ原稿のチャンクID順/集合が不一致です（display={len(d_ids)}件, reading={len(r_ids)}件）。",
                )
            )

        d_clean = _strip_for_similarity(parsed_display.full_text)
        r_clean = _strip_for_similarity(parsed_reading.full_text)
        if d_clean and r_clean:
            ratio = len(r_clean) / len(d_clean)
            if ratio < 0.78 or ratio > 1.38:
                issues.append(
                    LintIssue(
                        "ERROR",
                        "display_reading_length_mismatch",
                        "pair",
                        None,
                        f"表示/読み上げの文字数比が大きく乖離しています（ratio={ratio:.2f}、許容 0.78〜1.38）。",
                    )
                )
            elif ratio < 0.85 or ratio > 1.28:
                issues.append(
                    LintIssue(
                        "WARNING",
                        "display_reading_length_drift",
                        "pair",
                        None,
                        f"表示/読み上げの文字数比にやや乖離があります（ratio={ratio:.2f}、推奨 0.85〜1.28）。",
                    )
                )

            sim = difflib.SequenceMatcher(None, d_clean, r_clean).ratio()
            if sim < 0.50:
                issues.append(
                    LintIssue(
                        "ERROR",
                        "display_reading_content_divergence",
                        "pair",
                        None,
                        f"表示台本と読み上げ原稿の内容類似度が低すぎます（similarity={sim:.2f} < 0.50）。",
                    )
                )
            elif sim < 0.65:
                issues.append(
                    LintIssue(
                        "WARNING",
                        "display_reading_content_drift",
                        "pair",
                        None,
                        f"表示台本と読み上げ原稿の内容乖離が大きめです（similarity={sim:.2f} < 0.65）。",
                    )
                )

    # 尺・文字数レンジは強制しない（AGENTS.md 準拠：目安としてメトリクスにのみ算出）
    _ = mode  # 後方互換引数（非強制）

    metrics = _compute_metrics(
        name=target_label,
        format_id=resolved_format,
        parsed_display=parsed_display,
        parsed_reading=parsed_reading,
        target_sec=resolved_target_sec,
        issues=issues,
        stage_hits=stage_hits,
    )
    return LintResult(
        target=target_label,
        display_path=str(display_path) if display_path else None,
        reading_path=str(reading_path) if reading_path else None,
        metrics=metrics,
        issues=issues,
    )


def _resolve_pair_from_target(target: Path) -> tuple[Path | None, Path | None, str]:
    if target.is_dir():
        d = target / "02_script_display.md"
        r = target / "03_script_reading.md"
        name = target.parent.name if target.name == "base" else target.name
        return (d if d.is_file() else None, r if r.is_file() else None, name)
    if target.is_file():
        parent = target.parent
        d = parent / "02_script_display.md"
        r = parent / "03_script_reading.md"
        if target.name == "02_script_display.md":
            return (target, r if r.is_file() else None, parent.name)
        if target.name == "03_script_reading.md":
            return (d if d.is_file() else None, target, parent.name)
        return (target, None, target.stem)
    return (None, None, target.name)


def _expand_compare_targets(raw_targets: list[Path]) -> list[Path]:
    """親ディレクトリ（variants/ 等）が渡された場合、配下の台本フォルダを自動収集する。"""
    expanded: list[Path] = []
    for t in raw_targets:
        if t.is_dir():
            has_direct = (t / "02_script_display.md").is_file() or (t / "03_script_reading.md").is_file()
            if has_direct:
                expanded.append(t)
                continue
            variants_sub = t / "variants"
            search_root = variants_sub if variants_sub.is_dir() else t
            children = sorted(
                p
                for p in search_root.iterdir()
                if p.is_dir()
                and ((p / "02_script_display.md").is_file() or (p / "03_script_reading.md").is_file())
            )
            if children:
                expanded.extend(children)
            else:
                expanded.append(t)
        else:
            expanded.append(t)
    return expanded


def format_single_report(result: LintResult) -> str:
    m = result.metrics
    status = "PASS" if m.passed else "FAIL"
    lines = [
        f"=== 台本Lintレポート: {m.name} [{status}] ===",
        f"フォーマット: {m.format_id} | 書式: display={m.display_style}, reading={m.reading_style}",
        (
            f"[参考メトリクス] 文字数: display={m.display_chars}字 / reading={m.reading_chars}字 "
            f"(比={m.length_ratio:.2f}, 類似度={m.content_similarity:.2f}, 推定尺={m.estimated_sec:.1f}s"
            + (f" / 目安={m.target_sec:.0f}s)" if m.target_sec is not None else ")")
        ),
        (
            f"[参考メトリクス] 文リズム: {m.sentence_count}文 (平均={m.avg_sentence_len:.1f}字, 最大={m.max_sentence_len}字, "
            f"70字超={m.long_sentences_70}, 短文最大連続={m.short_sentence_max_streak}) | "
            f"漢字率: display={m.display_kanji_ratio:.1%}, reading={m.reading_kanji_ratio:.1%}"
        ),
        (
            f"[参考メトリクス] 密度目安: 冒頭15s={m.opening_15s_chars}字/{m.opening_15s_sentences}文(フック信号={m.opening_15s_hook_signals}), "
            f"リフック={m.rehook_count}回"
            + (f"(平均{m.rehook_avg_interval_sec:.1f}s間隔)" if m.rehook_avg_interval_sec else "")
            + f", 具体例/皮肉={m.concrete_irony_per_min:.1f}件/分, 間の手がかり(……/――)={m.pause_cue_count}"
        ),
        f"[検証サマリ] 固い床ERROR={m.error_count}, 推敲WARNING={m.warning_count} (ト書き={m.stage_direction_hits})",
    ]
    if result.issues:
        lines.append("--- 指摘一覧 ---")
        for iss in result.issues:
            loc = f"{iss.file}:{iss.line}" if iss.line else iss.file
            snip = f" [{iss.snippet}]" if iss.snippet else ""
            lines.append(f"[{iss.severity}] {iss.code} ({loc}): {iss.message}{snip}")
    return "\n".join(lines)


def format_compare_report(results: list[LintResult]) -> str:
    headers = [
        "案",
        "判定",
        "読上字数",
        "推定尺(s)",
        "平均文長",
        "最大文長",
        "冒頭15s(字/信)",
        "リフック(回/s)",
        "具体・皮肉/分",
        "漢字率(読)",
        "間/ト書",
        "E/W",
    ]
    rows: list[list[str]] = []
    for res in results:
        m = res.metrics
        rehook_str = (
            f"{m.rehook_count}/{m.rehook_avg_interval_sec:.0f}s"
            if m.rehook_avg_interval_sec is not None
            else f"{m.rehook_count}/-"
        )
        rows.append(
            [
                m.name,
                "PASS" if m.passed else "FAIL",
                str(m.reading_chars),
                f"{m.estimated_sec:.0f}",
                f"{m.avg_sentence_len:.1f}",
                str(m.max_sentence_len),
                f"{m.opening_15s_chars}/{m.opening_15s_hook_signals}",
                rehook_str,
                f"{m.concrete_irony_per_min:.1f}",
                f"{m.reading_kanji_ratio:.1%}",
                f"{m.pause_cue_count}/{m.stage_direction_hits}",
                f"{m.error_count}/{m.warning_count}",
            ]
        )

    lines = [
        "## 台本AB 定量比較レポート",
        "",
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join([":---"] + ["---:"] * (len(headers) - 1)) + " |",
    ]
    for r in rows:
        lines.append("| " + " | ".join(r) + " |")

    for res in results:
        if res.issues:
            lines.append("")
            lines.append(f"### {res.metrics.name} 指摘 ({res.metrics.error_count}E / {res.metrics.warning_count}W)")
            for iss in res.issues:
                loc = f"{iss.file}:{iss.line}" if iss.line else iss.file
                snip = f" (`{iss.snippet}`)" if iss.snippet else ""
                lines.append(f"- **[{iss.severity}] {iss.code}** ({loc}): {iss.message}{snip}")
    return "\n".join(lines)


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="全フォーマット横断 台本機械リンター（固い床ERROR検証 / --compare 参考メトリクス比較）"
    )
    parser.add_argument(
        "targets",
        nargs="*",
        type=Path,
        help="台本ディレクトリ（02/03を含む）またはファイル。--compare時は複数または親ディレクトリを指定",
    )
    parser.add_argument("--display", type=Path, help="表示用台本 02_script_display.md の明示パス")
    parser.add_argument("--reading", type=Path, help="読み上げ原稿 03_script_reading.md の明示パス")
    parser.add_argument(
        "--compare",
        action="store_true",
        help="複数バリエーションの参考メトリクスと指摘を横並び比較する",
    )
    parser.add_argument(
        "--format",
        choices=("auto", *SUPPORTED_FORMATS),
        default="auto",
        help="対象フォーマット（既定: auto）",
    )
    parser.add_argument("--target-sec", type=float, default=None, help="参考表示用の目安尺（秒・非強制）")
    parser.add_argument(
        "--mode",
        choices=("auto", "ab_pilot", "longform"),
        default="auto",
        help="後方互換オプション（尺レンジ強制は廃止済み）",
    )
    parser.add_argument("--json", action="store_true", help="JSON形式で出力する")
    parser.add_argument("--out", type=Path, default=None, help="出力先ファイルパス")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="任意: 推敲WARNINGも終了コード1として扱う（通常運用は固い床ERROR 0で合格）",
    )
    parser.add_argument(
        "--fail-on-error",
        action="store_true",
        help="--compare モード時でも Error があれば終了コード 1 を返す",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    _configure_stdio_utf8()
    parser = _build_arg_parser()
    args = parser.parse_args(argv)

    if args.compare:
        if not args.targets:
            parser.error("--compare には1つ以上の比較対象または親ディレクトリを指定してください。")
        expanded = _expand_compare_targets(args.targets)
        results: list[LintResult] = []
        for t in expanded:
            d_path, r_path, label = _resolve_pair_from_target(t)
            results.append(
                lint_script_pair(
                    display_path=d_path,
                    reading_path=r_path,
                    name=label,
                    format_id=args.format,
                    target_sec=args.target_sec,
                    mode=args.mode,
                )
            )
        if args.json:
            payload: dict[str, Any] = {
                "compare": [
                    {"metrics": asdict(r.metrics), "issues": [asdict(i) for i in r.issues]}
                    for r in results
                ]
            }
            output_text = json.dumps(payload, ensure_ascii=False, indent=2)
        else:
            output_text = format_compare_report(results)

        print(output_text)
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(output_text + "\n", encoding="utf-8")

        if args.fail_on_error:
            has_err = any(r.metrics.error_count > 0 for r in results)
            has_warn = any(r.metrics.warning_count > 0 for r in results)
            if has_err or (args.strict and has_warn):
                return 1
        return 0

    if args.display or args.reading:
        d_path = args.display
        r_path = args.reading
        label = (d_path or r_path).parent.name  # type: ignore[union-attr]
    elif len(args.targets) == 1:
        d_path, r_path, label = _resolve_pair_from_target(args.targets[0])
    else:
        parser.error("単体検証では1つの対象パス、または --display / --reading を指定してください。")

    result = lint_script_pair(
        display_path=d_path,
        reading_path=r_path,
        name=label,
        format_id=args.format,
        target_sec=args.target_sec,
        mode=args.mode,
    )

    if args.json:
        output_text = json.dumps(
            {"metrics": asdict(result.metrics), "issues": [asdict(i) for i in result.issues]},
            ensure_ascii=False,
            indent=2,
        )
    else:
        output_text = format_single_report(result)

    print(output_text)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(output_text + "\n", encoding="utf-8")

    if result.metrics.error_count > 0:
        return 1
    if args.strict and result.metrics.warning_count > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
