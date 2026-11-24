"""Remotion <Still> 主軸 サムネイル v2（固い床 × 自由舞台 <Still> TSX）契約・機械バリデータ・一括ビルドパイプライン。

機能:
1. Pydantic v2 スキーマ（ThumbnailPackageSpec v2）で台本前仮確定・現行2フォーマット
   （stickman_collage / planE_macro_econ）・エピソード専用自由舞台 compositionId・コンプライアンスを検証。
2. 文字数（推奨3〜10字程度・上限20字・2行以内）・タイトル丸写し防止（主題語1〜2語の共有は推奨）・心理トリガー最大2種・
   大差バリアント（compositionId重複禁止）・右下再生時間バッジ回避・WCAGコントラスト（太縁取り/座布団考慮）・
   AI画像生成禁止・公式誤認加工禁止・出力解像度（本番4K / A/B最低720p / 168x94）・50MB上限を機械検証。
3. --validate-only / --dry-run モード（完全無料・APIコールゼロ・副作用ゼロ）。
4. 本番ビルド: studio/scripts/render_thumbnails.mjs 経由で各自由舞台 <Still> の 4K PNG・文字抜きベースPNG・
   実書き出し画像を自動埋め込みしたライト/ダーク YouTube模擬比較シートPNGを一括生成し、
   ffmpeg Lanczos で 168x94px スクイント画像を生成後、出力全PNGの実解像度と50MB上限を最終検証する。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from yt_engine.config import find_repo_root


FORBIDDEN_MODEL_TOKENS: tuple[str, ...] = ("imagen-4", "imagen4", "veo", "sora", "nijivoice", "にじボイス")
FORBIDDEN_FONT_TOKENS: tuple[str, ...] = ("morisawa", "adobe", "helvetica", "hiragino", "meiryo", "yu gothic")
REMOTION_ID_RE = re.compile(r"^[A-Za-z0-9-]+$")
STILL_ID_SCAN_RE = re.compile(r"<Still\b[^>]*?\bid\s*=\s*[\"']([A-Za-z0-9-]+)[\"']", re.DOTALL)


ThumbnailFormatId = Literal[
    "stickman_collage",
    "planE_macro_econ",
]

PsychologicalTrigger = Literal[
    "numbers",
    "loss_avoidance",
    "surprise",
    "self_relevance",
]

ThumbnailWorkflowStage = Literal[
    "pre_script_draft",
    "pre_script_locked",
    "final_qa",
]

ThumbnailCopyZone = Literal[
    "top_left",
    "left",
    "top_center",
    "top_right",
    "center",
    "right",
    "bottom_left",
    "bottom_center",
    "bottom_right",
]

ThumbnailFocalZone = Literal[
    "bottom_right",
    "right",
    "center_right",
    "split_right",
    "center",
    "top_left",
    "left",
    "top_center",
    "top_right",
    "bottom_left",
    "bottom_center",
    "full",
]

ThumbnailAssetSourceType = Literal[
    "existing_public",
    "public_domain",
    "commercial_stock",
    "ai_generated",
    "none",
]

FORMAT_DEFAULT_BACKGROUNDS: dict[str, str] = {
    "stickman_collage": "#000000",
    "planE_macro_econ": "#121417",
}

IMPERSONATION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"【\s*公式\s*】"),
    re.compile(r"公式チャンネル"),
    re.compile(r"公認チャンネル"),
    re.compile(r"公式コラボ"),
    re.compile(r"公式提携"),
    re.compile(r"公式認定"),
    re.compile(r"公式監修"),
    re.compile(r"\bofficial\s+channel\b", re.IGNORECASE),
)

# 否定表現（NO text 等）を取り除いた上でチェックするAI画像内テキスト指示パターン
AI_NEGATIVE_TEXT_CLAUSES: tuple[re.Pattern[str], ...] = (
    re.compile(r"strictly\s+no\s+(?:text|letters|words|numbers|typography|titles?|captions?|logos?)(?:\s*,\s*no\s+\w+)*", re.IGNORECASE),
    re.compile(r"\bno\s+(?:text|letters|words|numbers|typography|titles?|captions?|logos?|watermarks?)\b", re.IGNORECASE),
    re.compile(r"\bwithout\s+(?:any\s+)?(?:text|letters|words|numbers|typography|captions?)\b", re.IGNORECASE),
    re.compile(r"文字(?:なし|無し|入れない|を含めない|を描かない|禁止)"),
    re.compile(r"テキスト(?:なし|無し|不要|禁止)"),
)

AI_BAKED_TEXT_REQUEST_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(?:with|add|include|render|write|draw|display|put)\s+(?:bold\s+|big\s+|large\s+)?(?:text|title|headline|words|letters|caption|subtitle|typography)\b", re.IGNORECASE),
    re.compile(r"\btext\s+overlay\b", re.IGNORECASE),
    re.compile(r"\btypography\s+poster\b", re.IGNORECASE),
    re.compile(r"(?:文字入り|テキスト入り|タイトル文字|見出し文字|文字を描|文字を入れ|テキストを入れ|テロップを入れ)"),
)

OVERLAP_STRIP_RE = re.compile(
    r"[\s　【】「」『』（）()\[\]［］{}｛｝<>＜＞!?！？、。・，．.,:：;；/／\\\-―—~〜\"'’“”#＃]+"
)


# ==============================================================================
# 1. Pydantic v2 スキーマ定義（v2 自由舞台 <Still> 正式ルート）
# ==============================================================================
class ThumbnailAssetRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceType: ThumbnailAssetSourceType
    pathOrCatalogId: str | None = None
    prompt: str | None = None
    generatorModel: str | None = None
    containsAiBakedText: bool = False
    strictlyNoTextEnforced: bool = True
    objectPosition: str = "center center"
    creditShort: str | None = None


class ThumbnailColorsSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    background: str | None = None
    textBacking: str | None = None
    primaryText: str
    emphasisText: str
    recedingAccent: str | None = None
    strokeColor: str | None = None


class ThumbnailVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variantId: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    hypothesis: str = Field(..., min_length=1)
    visualHook: str | None = None
    compositionId: str | None = None
    stillProps: dict[str, Any] | None = None
    supportsTextless: bool = True
    copyLines: list[str]
    highlightToken: str | None = None
    accentLineIndex: int | None = None
    badgeText: str | None = None
    triggers: list[PsychologicalTrigger]
    layoutPreset: str | None = None
    copyZone: ThumbnailCopyZone | None = None
    focalZone: ThumbnailFocalZone | None = None
    colors: ThumbnailColorsSpec
    backgroundAsset: ThumbnailAssetRef | None = None
    secondaryAsset: ThumbnailAssetRef | None = None
    citationText: str | None = None
    showCitation: bool = False
    formatOptions: dict[str, Any] | None = None


class ThumbnailWorkflowSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: ThumbnailWorkflowStage
    lockedBeforeScript: bool
    researchBriefRef: str
    clickConfirmPromise: str
    abTestMode: Literal["test_and_compare", "sequential_swap", "single"] = "test_and_compare"
    dailyImpressionsTier: Literal["under_1000", "over_1000"] = "under_1000"
    # 非推奨・後方互換用：既存エピソード Spec との互換維持のため残置。
    # 新規制作ではコピー固定を使わず、絵面だけでなく切り口・フック軸ごと検証できるよう各案に最適なコピーを振ることを推奨する。
    copyLockedAcrossVariants: bool = False


class ThumbnailComplianceSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    primarySourcesCount: int
    noOfficialImpersonation: bool
    usesUnauthorizedTrademarkAsOfficial: bool
    hasMisleadingBreakingUi: bool
    noAiSlop3Ng: bool
    silOflFontsOnly: bool
    aiDisclosureRequired: bool = False


class ThumbnailRenderSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: int = 3840
    height: int = 2160
    squintWidth: int = 168
    squintHeight: int = 94
    comparisonSheetWidth: int = 2560
    comparisonSheetHeight: int = 1600
    maxFileSizeMb: float = 50.0
    exportTextlessBase: bool = True


class CompetitorMockCard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    channelName: str
    title: str
    viewsText: str
    publishedAgo: str
    durationText: str
    thumbnailLabel: str | None = None
    bgColor: str | None = None
    accentColor: str | None = None
    imageSrc: str | None = None


class ThumbnailPackageSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: int = 2
    episodeId: str = Field(..., min_length=1)
    formatId: str = Field(..., min_length=1)
    channelName: str = Field(..., min_length=1)
    videoTitle: str
    videoDurationText: str = "18:00"
    comparisonSheetCompositionId: str = "ThumbnailFeedComparisonSheet"
    workflow: ThumbnailWorkflowSpec
    fonts: list[str]
    compliance: ThumbnailComplianceSpec
    render: ThumbnailRenderSpec = Field(default_factory=ThumbnailRenderSpec)
    competitors: list[CompetitorMockCard] = Field(default_factory=list)
    variants: list[ThumbnailVariantSpec]


class ValidationIssue(BaseModel):
    severity: Literal["error", "warning"]
    code: str
    target: str
    message: str


class VariantValidationMetric(BaseModel):
    variantId: str
    compositionId: str | None = None
    copyCharCount: int
    lineCount: int
    contrastPrimary: float | None = None
    contrastEmphasis: float | None = None
    lcsOverlapLen: int = 0
    bigramOverlapRatio: float = 0.0
    overlapWarning: bool = False


class ThumbnailValidationReport(BaseModel):
    passed: bool
    episodeId: str
    formatId: str
    titleZenkakuLength: float
    recommendedExperimentMethod: str
    errors: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[ValidationIssue] = Field(default_factory=list)
    variantMetrics: list[VariantValidationMetric] = Field(default_factory=list)


# ==============================================================================
# 2. 文字・色・重複・登録済み <Still> 検証ユーティリティ
# ==============================================================================
def calc_zenkaku_length(text: str) -> float:
    """全角=1.0、半角=0.5 として文字列の全角換算文字数を算出する。"""
    total = 0.0
    for ch in text:
        if unicodedata.east_asian_width(ch) in ("F", "W", "A"):
            total += 1.0
        else:
            total += 0.5
    return round(total, 1)


def _visible_chars(text: str) -> str:
    return re.sub(r"[\s　]+", "", text)


def _normalize_for_overlap(text: str) -> str:
    return OVERLAP_STRIP_RE.sub("", text).lower()


def _longest_common_substring_len(a: str, b: str) -> int:
    if not a or not b:
        return 0
    dp = [0] * (len(b) + 1)
    best = 0
    for ch_a in a:
        new_dp = [0] * (len(b) + 1)
        for j, ch_b in enumerate(b, start=1):
            if ch_a == ch_b:
                val = dp[j - 1] + 1
                new_dp[j] = val
                if val > best:
                    best = val
        dp = new_dp
    return best


def _bigram_set(text: str) -> set[str]:
    if len(text) < 2:
        return set()
    return {text[i : i + 2] for i in range(len(text) - 1)}


def parse_hex_color(value: str | None) -> tuple[int, int, int] | None:
    if not value:
        return None
    s = value.strip()
    if s.startswith("#"):
        s = s[1:]
    if len(s) == 3 and all(c in "0123456789abcdefABCDEF" for c in s):
        s = "".join(c * 2 for c in s)
    if len(s) != 6 or not all(c in "0123456789abcdefABCDEF" for c in s):
        return None
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def relative_luminance(rgb: tuple[int, int, int]) -> float:
    def _lin(channel_8bit: int) -> float:
        c = channel_8bit / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (_lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(hex_a: str | None, hex_b: str | None) -> float | None:
    rgb_a = parse_hex_color(hex_a)
    rgb_b = parse_hex_color(hex_b)
    if rgb_a is None or rgb_b is None:
        return None
    lum_a = relative_luminance(rgb_a)
    lum_b = relative_luminance(rgb_b)
    brighter = max(lum_a, lum_b)
    darker = min(lum_a, lum_b)
    return round((brighter + 0.05) / (darker + 0.05), 2)


def _evaluate_text_contrast(
    text_hex: str,
    bg_hex: str,
    backing_hex: str | None,
    stroke_hex: str | None,
) -> tuple[float | None, bool]:
    """文字色の実効コントラスト比と合格可否を判定する。

    - 通常: 文字 vs 背景（または座布団 textBacking）>= 4.5:1
    - 太縁取りあり（strokeColor 指定時）: 文字 vs 背景 >= 3.0:1（WCAG Large Text）かつ 文字 vs strokeColor >= 4.5:1
      または 文字 vs 座布団 >= 4.5:1
    """
    c_bg = contrast_ratio(text_hex, bg_hex)
    if c_bg is None:
        return None, False

    surface_candidates = [c_bg]
    if backing_hex:
        c_back = contrast_ratio(text_hex, backing_hex)
        if c_back is not None:
            surface_candidates.append(c_back)
    best_surface = max(surface_candidates)

    if best_surface >= 4.5:
        return best_surface, True

    if stroke_hex:
        c_stroke = contrast_ratio(text_hex, stroke_hex)
        if c_stroke is not None and c_stroke >= 4.5 and best_surface >= 3.0:
            return max(best_surface, c_stroke), True

    return best_surface, False


def _resolve_effective_bg(spec: ThumbnailPackageSpec, variant: ThumbnailVariantSpec) -> str:
    if variant.colors.background:
        return variant.colors.background
    return FORMAT_DEFAULT_BACKGROUNDS.get(spec.formatId, "#0F172A")


def _strip_ai_negative_clauses(prompt: str) -> str:
    cleaned = prompt
    for pat in AI_NEGATIVE_TEXT_CLAUSES:
        cleaned = pat.sub(" ", cleaned)
    return cleaned


def extract_registered_still_ids(repo_root: Path) -> set[str] | None:
    """studio/src/ThumbnailRoot.tsx に登録されている <Still id="..."> 一覧を静的抽出する。"""
    root_tsx = repo_root / "studio" / "src" / "ThumbnailRoot.tsx"
    if not root_tsx.is_file():
        return None
    content = root_tsx.read_text(encoding="utf-8")
    return set(STILL_ID_SCAN_RE.findall(content))


# ==============================================================================
# 3. 機械バリデーション本体
# ==============================================================================
def validate_thumbnail_spec(
    spec: ThumbnailPackageSpec,
    *,
    repo_root: Path | None = None,
    check_assets: bool = True,
    check_compositions: bool = True,
    require_registered_stills: bool = False,
) -> ThumbnailValidationReport:
    """サムネSpecの全設計・自由舞台登録・法務・視認性・技術規約を機械検証する。"""
    root = repo_root or find_repo_root()
    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []
    metrics: list[VariantValidationMetric] = []

    def add_err(code: str, target: str, msg: str) -> None:
        errors.append(ValidationIssue(severity="error", code=code, target=target, message=msg))

    def add_warn(code: str, target: str, msg: str) -> None:
        warnings.append(ValidationIssue(severity="warning", code=code, target=target, message=msg))

    registered_stills = extract_registered_still_ids(root) if check_compositions else None
    strict_still_check = require_registered_stills or spec.workflow.stage == "final_qa"

    # 1. フォーマット・廃止フォーマット禁止検証
    allowed_formats = {
        "stickman_collage",
        "planE_macro_econ",
    }
    fmt_low = spec.formatId.lower()
    if "plan_d" in fmt_low or "pland" in fmt_low or "3d" in fmt_low:
        add_err("FORBIDDEN_FORMAT_3D", "formatId", f"重い3D系フォーマット（案D）は使用禁止です: {spec.formatId}")
    elif spec.formatId not in allowed_formats:
        add_err(
            "UNSUPPORTED_FORMAT",
            "formatId",
            f"未対応のフォーマットIDです: {spec.formatId}（対応: {', '.join(sorted(allowed_formats))}）",
        )

    # 1.5 比較シート compositionId 検証
    if not REMOTION_ID_RE.match(spec.comparisonSheetCompositionId):
        add_err(
            "INVALID_COMPARISON_COMPOSITION_ID",
            "comparisonSheetCompositionId",
            f"Remotion の compositionId 規約（英数字とハイフンのみ）に違反しています: {spec.comparisonSheetCompositionId}",
        )
    elif registered_stills is not None and spec.comparisonSheetCompositionId not in registered_stills:
        add_err(
            "COMPARISON_COMPOSITION_NOT_REGISTERED",
            "comparisonSheetCompositionId",
            f"comparisonSheetCompositionId が ThumbnailRoot.tsx に登録されていません: {spec.comparisonSheetCompositionId}",
        )

    # 2. フォント規約（SIL OFL 1.1 / Apache 2.0 限定）
    if not spec.fonts:
        add_err("FONTS_EMPTY", "fonts", "fonts は1つ以上の SIL OFL 1.1 / Apache 2.0 フォントを指定してください。")
    for font_name in spec.fonts:
        low = font_name.lower()
        if any(tok in low for tok in FORBIDDEN_FONT_TOKENS):
            add_err("FORBIDDEN_FONT", "fonts", f"SIL OFL / Apache 2.0 以外の禁止フォントが含まれています: {font_name}")

    # 3. 台本前仮確定フロー整合
    if not spec.workflow.lockedBeforeScript:
        add_err(
            "WORKFLOW_NOT_LOCKED_BEFORE_SCRIPT",
            "workflow.lockedBeforeScript",
            "台本執筆前にサムネ構図・コピーを仮確定（lockedBeforeScript: true）する必要があります。",
        )
    if not spec.workflow.researchBriefRef.strip():
        add_err("WORKFLOW_MISSING_BRIEF", "workflow.researchBriefRef", "01_research_brief.md への参照パスが空です。")
    if not spec.workflow.clickConfirmPromise.strip():
        add_err(
            "WORKFLOW_MISSING_CLICK_PROMISE",
            "workflow.clickConfirmPromise",
            "冒頭5〜15秒でサムネの約束を回収するための clickConfirmPromise を明記してください。",
        )

    recommended_method = (
        "日次インプ1,000回以上：公式 Test & Compare（大差2〜3案・全案1280×720以上）を実行"
        if spec.workflow.dailyImpressionsTier == "over_1000"
        else "日次インプ1,000回未満：投稿タブ画像アンケート ＋ 168×94px事前確認 ＋ 7日順次スワップ（1変数）を実行"
    )

    # 4. タイトル文字数チェック（全角30文字前後目安。検索KW先頭・【】は任意で検査しない）
    title_trimmed = spec.videoTitle.strip()
    title_zenkaku = calc_zenkaku_length(title_trimmed)
    if not title_trimmed:
        add_err("TITLE_EMPTY", "videoTitle", "動画タイトル（videoTitle）が空です。")
    elif title_zenkaku > 45.0:
        add_err("TITLE_TOO_LONG", "videoTitle", f"動画タイトルが長すぎます（全角換算 {title_zenkaku} 字 / 上限45字）。")
    elif title_zenkaku < 22.0 or title_zenkaku > 38.0:
        add_warn(
            "TITLE_LENGTH_ADVISORY",
            "videoTitle",
            f"動画タイトルは全角30文字前後が目安です（現在: {title_zenkaku} 字）。",
        )

    for pat in IMPERSONATION_PATTERNS:
        if pat.search(title_trimmed):
            add_err(
                "OFFICIAL_IMPERSONATION_TITLE",
                "videoTitle",
                f"公式提携・公式アカウントと誤認させる語句がタイトルに含まれています: {pat.pattern}",
            )

    # 5. コンプライアンス（法務・非真正回避・AI slop 3大NG）
    comp = spec.compliance
    if comp.primarySourcesCount < 3:
        add_err("INSUFFICIENT_PRIMARY_SOURCES", "compliance.primarySourcesCount", "一次情報3ソース以上が必須です。")
    if not comp.noOfficialImpersonation:
        add_err(
            "OFFICIAL_IMPERSONATION_FLAG",
            "compliance.noOfficialImpersonation",
            "公式誤認加工禁止フラグ（noOfficialImpersonation: true）を満たしていません。",
        )
    if comp.usesUnauthorizedTrademarkAsOfficial:
        add_err(
            "UNAUTHORIZED_TRADEMARK_OFFICIAL",
            "compliance.usesUnauthorizedTrademarkAsOfficial",
            "公式提携と誤認させる商標・ロゴ加工は禁止です。",
        )
    if comp.hasMisleadingBreakingUi:
        add_err(
            "MISLEADING_BREAKING_UI",
            "compliance.hasMisleadingBreakingUi",
            "公式報道や緊急速報を装う誤認UI加工は禁止です。",
        )
    if not comp.noAiSlop3Ng:
        add_err(
            "AI_SLOP_3NG_VIOLATION",
            "compliance.noAiSlop3Ng",
            "AI slop 3大NG（直線棒人間・均質ダークカード・常時帯字幕）排除フラグが false です。",
        )
    if not comp.silOflFontsOnly:
        add_err("NON_SIL_OFL_FLAG", "compliance.silOflFontsOnly", "SIL OFL / Apache 2.0 フォント限定フラグが false です。")

    # 6. 出力解像度・ファイルサイズ上限規約
    rnd = spec.render
    if rnd.width < 1280 or rnd.height < 720:
        add_err(
            "RENDER_BELOW_720P",
            "render",
            f"全サムネイル（A/B含む）は最低 1280×720 以上が必須です（指定: {rnd.width}×{rnd.height}）。",
        )
    elif rnd.width < 3840 or rnd.height < 2160:
        add_warn(
            "RENDER_BELOW_4K",
            "render",
            f"本番推奨解像度は 4K（3840×2160）です（現在指定: {rnd.width}×{rnd.height}）。",
        )

    if rnd.width > 0 and rnd.height > 0:
        aspect = rnd.width / rnd.height
        if abs(aspect - (16.0 / 9.0)) > 0.03:
            add_err("RENDER_ASPECT_NOT_16_9", "render", f"アスペクト比は 16:9 が必須です（現在: {rnd.width}×{rnd.height}）。")

    if rnd.maxFileSizeMb <= 0 or rnd.maxFileSizeMb > 50.0:
        add_err(
            "RENDER_MAX_SIZE_INVALID",
            "render.maxFileSizeMb",
            f"ファイルサイズ上限は 50MB 以下にする必要があります（指定: {rnd.maxFileSizeMb} MB）。",
        )

    if rnd.squintWidth != 168 or rnd.squintHeight != 94:
        add_err(
            "SQUINT_SIZE_INVALID",
            "render",
            f"スクイントテスト縮小サイズは 168×94px 固定です（指定: {rnd.squintWidth}×{rnd.squintHeight}）。",
        )

    # 7. A/Bテスト案数制約
    if not spec.variants:
        add_err("VARIANTS_EMPTY", "variants", "少なくとも1案以上のバリアント定義が必要です。")
    elif spec.workflow.abTestMode == "test_and_compare" and not (2 <= len(spec.variants) <= 3):
        add_err(
            "AB_VARIANT_COUNT",
            "variants",
            f"公式 Test & Compare モードでは大差の 2〜3案が必要です（現在: {len(spec.variants)} 案）。",
        )

    studio_public = root / "studio" / "public"
    norm_title = _normalize_for_overlap(title_trimmed)
    title_bigrams = _bigram_set(norm_title)

    seen_variant_ids: set[str] = set()
    seen_copy_signatures: dict[str, str] = {}
    seen_composition_sigs: dict[tuple[str, str], str] = {}
    seen_trigger_sets: dict[frozenset[str], str] = {}

    for v in spec.variants:
        v_target = f"variants[{v.variantId}]"
        if v.variantId in seen_variant_ids:
            add_err("DUPLICATE_VARIANT_ID", v_target, f"variantId が重複しています: {v.variantId}")
        seen_variant_ids.add(v.variantId)

        # 7.0 自由舞台 <Still> compositionId 検証（v2 正式ルート）
        comp_id = (v.compositionId or "").strip()
        if not comp_id:
            add_err(
                "MISSING_COMPOSITION_ID",
                v_target,
                "v2 自由舞台運用では各バリアントにエピソード専用 <Still> の compositionId 指定が必須です（固定プリセット流し込みは廃止）。",
            )
        else:
            if not REMOTION_ID_RE.match(comp_id):
                add_err(
                    "INVALID_COMPOSITION_ID",
                    v_target,
                    f"compositionId は英数字とハイフン（-）のみ使用可能です: {comp_id}",
                )
            else:
                props_sig = json.dumps(v.stillProps or {}, sort_keys=True, ensure_ascii=False)
                comp_sig = (comp_id, props_sig)
                if comp_sig in seen_composition_sigs:
                    add_err(
                        "DUPLICATE_COMPOSITION_ID",
                        v_target,
                        f"別案（{seen_composition_sigs[comp_sig]}）と同じ compositionId（および stillProps）が指定されています: {comp_id}",
                    )
                else:
                    seen_composition_sigs[comp_sig] = v.variantId

                if registered_stills is not None and comp_id not in registered_stills:
                    if strict_still_check:
                        add_err(
                            "COMPOSITION_ID_NOT_REGISTERED",
                            v_target,
                            f"compositionId '{comp_id}' が studio/src/ThumbnailRoot.tsx に登録されていません。",
                        )
                    else:
                        add_warn(
                            "COMPOSITION_ID_NOT_REGISTERED_YET",
                            v_target,
                            f"compositionId '{comp_id}' はまだ studio/src/ThumbnailRoot.tsx に未登録です（本番ビルド前に自由舞台 <Still> を実装・登録してください）。",
                        )

        # 7.1 行数・文字数検証（推奨 3〜10文字程度 / 絶対上限 20文字 / 1〜2行）
        cleaned_lines = [line.strip() for line in v.copyLines]
        if len(cleaned_lines) == 0:
            add_err("COPY_LINES_EMPTY", v_target, "copyLines が空です（1〜2行必須）。")
        elif len(cleaned_lines) > 2:
            add_err("COPY_LINES_TOO_MANY", v_target, f"サムネイルコピーは2行以内が必須です（現在: {len(cleaned_lines)} 行）。")
        if any(not _visible_chars(line) for line in cleaned_lines):
            add_err("COPY_LINE_BLANK", v_target, "copyLines に空白のみの行が含まれています。")

        badge_chars = len(_visible_chars(v.badgeText or ""))
        if badge_chars > 8:
            add_err("BADGE_TOO_LONG", v_target, f"badgeText は8文字以内にしてください（現在: {badge_chars} 字）。")

        copy_only_chars = len(_visible_chars("".join(cleaned_lines)))
        total_copy_chars = copy_only_chars + badge_chars
        if total_copy_chars == 0:
            add_err("COPY_TEXT_EMPTY", v_target, "サムネイルコピー文字列が空です。")
        elif total_copy_chars > 20:
            add_err(
                "COPY_EXCEEDS_MAX_20",
                v_target,
                f"サムネイル文字数が絶対上限 20文字を超過しています（現在: {total_copy_chars} 字）。",
            )
        # 推奨 3〜10文字程度はスマホ縮小で0.5秒で読める文字サイズを保つための制作ガイド（非強制）。文字数は metrics.copyCharCount で確認する。

        # 7.2 なりすまし語句チェック
        combined_text = "".join(cleaned_lines) + (v.badgeText or "")
        for pat in IMPERSONATION_PATTERNS:
            if pat.search(combined_text):
                add_err("OFFICIAL_IMPERSONATION_COPY", v_target, f"公式誤認を招く語句がコピーに含まれています: {pat.pattern}")

        # 7.3 タイトルとの文言重複チェック
        norm_copy = _normalize_for_overlap("".join(cleaned_lines))
        lcs_len = _longest_common_substring_len(norm_title, norm_copy)
        copy_bigrams = _bigram_set(norm_copy)
        bigram_ratio = (
            round(len(copy_bigrams & title_bigrams) / len(copy_bigrams), 3)
            if copy_bigrams
            else 0.0
        )

        # 丸写し（コピー全体がタイトル内にそのまま含まれる）だけを Error とする。
        # 主題語1〜2語の自然な共有は推奨（0.5秒で文脈が噛み合う）ため、部分一致は長い場合のみ Warning。
        overlap_warn = False
        if len(norm_copy) >= 4 and norm_copy in norm_title:
            add_err(
                "TITLE_COPY_EXACT_OVERLAP",
                v_target,
                "サムネコピーがタイトルの丸写しです。主題語の共有に留め、サムネは感情フック・タイトルは問いや詳細へ役割を分けてください。",
            )
        elif lcs_len >= 9 or bigram_ratio >= 0.60:
            overlap_warn = True
            add_warn(
                "TITLE_COPY_NEAR_DUPLICATE",
                v_target,
                f"サムネコピーがタイトルの言い換えに近い状態です（連続一致 {lcs_len}字 / バイグラム一致率 {bigram_ratio:.0%}）。共有は主題語1〜2語程度が目安です。",
            )

        # 7.4 4大心理トリガー最大2種制約
        if len(v.triggers) == 0:
            add_err("TRIGGERS_EMPTY", v_target, "4大心理トリガーを最低1種指定してください。")
        elif len(v.triggers) > 2:
            add_err("TRIGGERS_EXCEED_MAX_2", v_target, f"心理トリガーは最大2種までです（現在: {len(v.triggers)} 種）。")
        if len(set(v.triggers)) != len(v.triggers):
            add_err("TRIGGERS_DUPLICATED", v_target, "同一バリアント内で心理トリガーが重複しています。")

        # 7.5 大差バリアントチェック
        copy_sig = norm_copy
        if spec.workflow.copyLockedAcrossVariants:
            pass  # 後方互換用（非推奨）：既存 Spec で明示的に true 指定されている場合のみ同一コピーを許容する
        elif copy_sig in seen_copy_signatures:
            add_err(
                "DUPLICATE_VARIANT_COPY",
                v_target,
                f"別案（{seen_copy_signatures[copy_sig]}）とコピーが同一です。Test & Compare 向けに大差をつけてください。",
            )
        else:
            seen_copy_signatures[copy_sig] = v.variantId

        trig_key = frozenset(v.triggers)
        if trig_key and trig_key in seen_trigger_sets:
            add_warn(
                "SIMILAR_VARIANT_TRIGGERS",
                v_target,
                f"別案（{seen_trigger_sets[trig_key]}）と心理トリガー軸の組み合わせが同一です。A/Bテストの検証力を高めるため別トリガー軸の検討を推奨します。",
            )
        elif trig_key:
            seen_trigger_sets[trig_key] = v.variantId

        # 7.6 右下再生時間バッジ回避 ＆ コントラスト比検証（太縁取り/座布団対応）
        if v.copyZone == "bottom_right":
            add_err(
                "COPY_ZONE_BOTTOM_RIGHT",
                v_target,
                "copyZone に bottom_right は禁止です（YouTube再生時間バッジと重なります）。",
            )

        eff_bg = _resolve_effective_bg(spec, v)
        c_primary, ok_primary = _evaluate_text_contrast(
            v.colors.primaryText,
            eff_bg,
            v.colors.textBacking,
            v.colors.strokeColor,
        )
        c_emphasis, ok_emphasis = _evaluate_text_contrast(
            v.colors.emphasisText,
            eff_bg,
            v.colors.textBacking,
            v.colors.strokeColor,
        )
        if c_primary is None:
            add_err(
                "INVALID_COLOR_HEX",
                v_target,
                f"primaryText または background のカラーコードが不正です: {v.colors.primaryText} / {eff_bg}",
            )
        elif not ok_primary:
            add_err(
                "LOW_CONTRAST_PRIMARY",
                v_target,
                f"主文字と背景のコントラスト比が基準（4.5:1、縁取り時は背景3.0:1＋縁4.5:1）未満です（{v.colors.primaryText} vs {eff_bg} = {c_primary}:1）。",
            )
        if c_emphasis is None:
            add_err("INVALID_COLOR_HEX", v_target, f"emphasisText のカラーコードが不正です: {v.colors.emphasisText}")
        elif not ok_emphasis:
            add_err(
                "LOW_CONTRAST_EMPHASIS",
                v_target,
                f"強調文字と背景のコントラスト比が基準（4.5:1、縁取り時は背景3.0:1＋縁4.5:1）未満です（{v.colors.emphasisText} vs {eff_bg} = {c_emphasis}:1）。",
            )

        # 7.7 AI画像生成禁止・禁止モデル・アセット実在検証
        for asset_slot, asset_ref in (
            ("backgroundAsset", v.backgroundAsset),
            ("secondaryAsset", v.secondaryAsset),
        ):
            if asset_ref is None or asset_ref.sourceType == "none":
                continue
            a_target = f"{v_target}.{asset_slot}"
            if asset_ref.containsAiBakedText:
                add_err(
                    "AI_BAKED_TEXT_FORBIDDEN",
                    a_target,
                    "AI画像への直書き文字（containsAiBakedText: true）は全面禁止です。文字はRemotion側で描画してください。",
                )

            if asset_ref.sourceType == "ai_generated":
                add_err(
                    "AI_IMAGE_GENERATION_DISALLOWED",
                    a_target,
                    "AI画像生成（sourceType: ai_generated）は全フォーマット共通方針により禁止です。ネット収集実写・公的資料・フリー素材（existing_public）または Remotion 自由舞台描画（none）を使用してください。",
                )
                if not asset_ref.strictlyNoTextEnforced:
                    add_err(
                        "AI_NO_TEXT_GUARD_MISSING",
                        a_target,
                        "AI生成アセットでは strictlyNoTextEnforced: true と文字禁止指示が必須です。",
                    )
                if asset_ref.prompt:
                    stripped = _strip_ai_negative_clauses(asset_ref.prompt)
                    for pat in AI_BAKED_TEXT_REQUEST_PATTERNS:
                        if pat.search(stripped):
                            add_err(
                                "AI_PROMPT_REQUESTS_TEXT",
                                a_target,
                                f"AI画像プロンプト内に文字描画を指示する記述が含まれています（直書き文字禁止）: {pat.pattern}",
                            )
                            break
                if asset_ref.generatorModel:
                    gm_low = asset_ref.generatorModel.lower()
                    if any(tok in gm_low for tok in FORBIDDEN_MODEL_TOKENS):
                        add_err("FORBIDDEN_IMAGE_MODEL", a_target, f"終了済みまたは禁止モデルが指定されています: {asset_ref.generatorModel}")

            if check_assets and asset_ref.sourceType == "existing_public":
                if not asset_ref.pathOrCatalogId or not asset_ref.pathOrCatalogId.strip():
                    add_err("MISSING_ASSET_PATH", a_target, "existing_public 指定時は pathOrCatalogId が必須です。")
                else:
                    ref_val = asset_ref.pathOrCatalogId.strip()
                    norm_rel = ref_val.replace("\\", "/").lstrip("/")
                    if norm_rel.startswith("studio/public/"):
                        norm_rel = norm_rel[len("studio/public/") :]
                    if not (studio_public / norm_rel).is_file():
                        add_err("ASSET_FILE_NOT_FOUND", a_target, f"参照アセットが見つかりません: studio/public/{norm_rel}")

        metrics.append(
            VariantValidationMetric(
                variantId=v.variantId,
                compositionId=comp_id or None,
                copyCharCount=total_copy_chars,
                lineCount=len(cleaned_lines),
                contrastPrimary=c_primary,
                contrastEmphasis=c_emphasis,
                lcsOverlapLen=lcs_len,
                bigramOverlapRatio=bigram_ratio,
                overlapWarning=overlap_warn,
            )
        )

    return ThumbnailValidationReport(
        passed=(len(errors) == 0),
        episodeId=spec.episodeId,
        formatId=spec.formatId,
        titleZenkakuLength=title_zenkaku,
        recommendedExperimentMethod=recommended_method,
        errors=errors,
        warnings=warnings,
        variantMetrics=metrics,
    )


# ==============================================================================
# 4. PNG 実解像度・サイズ検証 ＆ ffmpeg Lanczos スクイント縮小
# ==============================================================================
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def read_png_dimensions(png_path: Path) -> tuple[int, int]:
    """Pillow非依存で PNG ヘッダ（IHDRチャンク）から (width, height) を読み取る。"""
    if not png_path.is_file():
        raise FileNotFoundError(f"PNGファイルが存在しません: {png_path}")
    data = png_path.read_bytes()
    if len(data) < 24 or data[:8] != PNG_SIGNATURE or data[12:16] != b"IHDR":
        raise ValueError(f"有効なPNGファイルではありません: {png_path}")
    width, height = struct.unpack(">II", data[16:24])
    return int(width), int(height)


def generate_squint_png(src_png: Path, dst_png: Path, width: int = 168, height: int = 94) -> None:
    """ffmpeg Lanczos フィルタを用いて 168x94px スクイントテスト画像を生成する。"""
    dst_png.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src_png),
        "-vf",
        f"scale={width}:{height}:flags=lanczos",
        "-frames:v",
        "1",
        str(dst_png),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg スクイント縮小に失敗しました ({proc.returncode}): {proc.stderr}")


def validate_rendered_outputs(
    spec: ThumbnailPackageSpec,
    rendered_records: list[dict[str, Any]],
) -> list[str]:
    """生成された全PNG（4K/文字抜き/168x94/比較シート）の解像度と50MB上限を検証する。"""
    failures: list[str] = []
    max_bytes = int(spec.render.maxFileSizeMb * 1024 * 1024)

    for rec in rendered_records:
        kind = rec["kind"]
        path = Path(rec["path"])
        if not path.is_file():
            failures.append(f"[{kind}] 出力ファイルが生成されていません: {path}")
            continue
        size_bytes = path.stat().st_size
        if size_bytes <= 0:
            failures.append(f"[{kind}] 出力ファイルサイズが 0 バイトです: {path}")
            continue

        try:
            w, h = read_png_dimensions(path)
        except Exception as exc:
            failures.append(f"[{kind}] PNGヘッダ検証エラー ({path}): {exc}")
            continue

        rec["actualWidth"] = w
        rec["actualHeight"] = h
        rec["sizeBytes"] = size_bytes
        rec["sizeMb"] = round(size_bytes / (1024 * 1024), 3)

        if kind in ("variant_4k", "variant_textless_4k"):
            if w < 1280 or h < 720:
                failures.append(f"[{kind}] 最低解像度 1280×720 を下回っています: {w}×{h} ({path.name})")
            if w != rec["expectedWidth"] or h != rec["expectedHeight"]:
                failures.append(f"[{kind}] 期待解像度 {rec['expectedWidth']}×{rec['expectedHeight']} と一致しません: {w}×{h}")
            if size_bytes > max_bytes:
                failures.append(
                    f"[{kind}] ファイルサイズが上限 {spec.render.maxFileSizeMb}MB を超過しています: "
                    f"{rec['sizeMb']}MB ({path.name})"
                )
        elif kind == "squint_168x94":
            if w != spec.render.squintWidth or h != spec.render.squintHeight:
                failures.append(
                    f"[{kind}] スクイント画像解像度が {spec.render.squintWidth}×{spec.render.squintHeight} と一致しません: {w}×{h}"
                )
        elif kind == "comparison_sheet":
            if w != spec.render.comparisonSheetWidth or h != spec.render.comparisonSheetHeight:
                failures.append(
                    f"[{kind}] 比較シート解像度が {spec.render.comparisonSheetWidth}×{spec.render.comparisonSheetHeight} と一致しません: {w}×{h}"
                )

    return failures


# ==============================================================================
# 5. スペック読込・オーケストレータ・CLI
# ==============================================================================
def load_thumbnail_spec(spec_path: Path) -> ThumbnailPackageSpec:
    if not spec_path.is_file():
        raise FileNotFoundError(f"サムネイルSpecファイルが見つかりません: {spec_path}")
    text = spec_path.read_text(encoding="utf-8")
    if spec_path.suffix.lower() in (".yaml", ".yml"):
        raw = yaml.safe_load(text)
    else:
        raw = json.loads(text)
    return ThumbnailPackageSpec.model_validate(raw)


def _resolve_node_executable() -> str:
    found = shutil.which("node")
    if found:
        return found
    raise FileNotFoundError("Node.js (node) が PATH 上に見つかりません。")


def run_thumbnail_build(
    spec_path: Path,
    *,
    out_dir: Path | None = None,
    validate_only: bool = False,
    dry_run: bool = False,
    skip_textless: bool = False,
    skip_comparison: bool = False,
    show_safe_guides: bool = False,
    require_registered_stills: bool = False,
    repo_root: Path | None = None,
) -> dict[str, Any]:
    """サムネSpecを検証し、必要に応じてエピソード専用自由舞台 <Still> を一括生成する。"""
    root = repo_root or find_repo_root()
    spec = load_thumbnail_spec(spec_path)
    is_real_build = not validate_only and not dry_run
    report = validate_thumbnail_spec(
        spec,
        repo_root=root,
        check_assets=True,
        check_compositions=True,
        require_registered_stills=(require_registered_stills or is_real_build),
    )

    resolved_out_dir = (
        out_dir.resolve()
        if out_dir is not None
        else (root / "episodes" / "productions" / spec.episodeId / "thumbnails").resolve()
    )

    spec_dict = spec.model_dump()
    validation_summary = {
        "passed": report.passed,
        "errorCount": len(report.errors),
        "warningCount": len(report.warnings),
        "recommendedExperimentMethod": report.recommendedExperimentMethod,
        "titleZenkakuLength": report.titleZenkakuLength,
        "variantMetrics": [m.model_dump() for m in report.variantMetrics],
    }

    planned_outputs: list[dict[str, Any]] = []
    remotion_tasks: list[dict[str, Any]] = []
    variant_main_pngs: dict[str, str] = {}

    for variant in spec.variants:
        comp_id = (variant.compositionId or "").strip()
        base_props = dict(variant.stillProps or {})

        main_png = resolved_out_dir / f"{variant.variantId}_{spec.render.width}x{spec.render.height}.png"
        variant_main_pngs[variant.variantId] = str(main_png)
        planned_outputs.append(
            {
                "kind": "variant_4k",
                "variantId": variant.variantId,
                "compositionId": comp_id,
                "path": str(main_png),
                "expectedWidth": spec.render.width,
                "expectedHeight": spec.render.height,
            }
        )
        remotion_tasks.append(
            {
                "taskId": f"{variant.variantId}_main",
                "compositionId": comp_id,
                "outputPath": str(main_png),
                "width": spec.render.width,
                "height": spec.render.height,
                "inputProps": {
                    **base_props,
                    "textless": False,
                    "showSafeGuides": show_safe_guides,
                },
            }
        )

        if spec.render.exportTextlessBase and variant.supportsTextless and not skip_textless:
            textless_png = resolved_out_dir / f"{variant.variantId}_textless_{spec.render.width}x{spec.render.height}.png"
            planned_outputs.append(
                {
                    "kind": "variant_textless_4k",
                    "variantId": variant.variantId,
                    "compositionId": comp_id,
                    "path": str(textless_png),
                    "expectedWidth": spec.render.width,
                    "expectedHeight": spec.render.height,
                }
            )
            remotion_tasks.append(
                {
                    "taskId": f"{variant.variantId}_textless",
                    "compositionId": comp_id,
                    "outputPath": str(textless_png),
                    "width": spec.render.width,
                    "height": spec.render.height,
                    "inputProps": {
                        **base_props,
                        "textless": True,
                        "showSafeGuides": False,
                    },
                }
            )

        squint_png = resolved_out_dir / f"{variant.variantId}_squint_{spec.render.squintWidth}x{spec.render.squintHeight}.png"
        planned_outputs.append(
            {
                "kind": "squint_168x94",
                "variantId": variant.variantId,
                "sourceMainPng": str(main_png),
                "path": str(squint_png),
                "expectedWidth": spec.render.squintWidth,
                "expectedHeight": spec.render.squintHeight,
            }
        )

    if not skip_comparison:
        sheet_png = resolved_out_dir / "comparison_sheet.png"
        planned_outputs.append(
            {
                "kind": "comparison_sheet",
                "variantId": "all",
                "compositionId": spec.comparisonSheetCompositionId,
                "path": str(sheet_png),
                "expectedWidth": spec.render.comparisonSheetWidth,
                "expectedHeight": spec.render.comparisonSheetHeight,
            }
        )
        remotion_tasks.append(
            {
                "taskId": "comparison_sheet",
                "compositionId": spec.comparisonSheetCompositionId,
                "outputPath": str(sheet_png),
                "width": spec.render.comparisonSheetWidth,
                "height": spec.render.comparisonSheetHeight,
                "embedImageFiles": variant_main_pngs,
                "inputProps": {
                    "spec": spec_dict,
                    "validationSummary": validation_summary,
                },
            }
        )

    mode = "validate_only" if validate_only else ("dry_run" if dry_run else "build")
    result: dict[str, Any] = {
        "mode": mode,
        "schemaVersion": spec.schemaVersion,
        "specPath": str(spec_path),
        "outDir": str(resolved_out_dir),
        "validation": report.model_dump(),
        "plannedOutputs": planned_outputs,
        "outputVerificationErrors": [],
        "passed": report.passed,
    }

    if validate_only or dry_run or not report.passed:
        return result

    resolved_out_dir.mkdir(parents=True, exist_ok=True)
    render_script = root / "studio" / "scripts" / "render_thumbnails.mjs"
    if not render_script.is_file():
        raise FileNotFoundError(f"Remotionサムネイルレンダラスクリプトが見つかりません: {render_script}")

    node_bin = _resolve_node_executable()
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False) as tf:
        json.dump({"tasks": remotion_tasks}, tf, ensure_ascii=False, indent=2)
        job_path = Path(tf.name)

    try:
        proc = subprocess.run(
            [node_bin, str(render_script), "--job", str(job_path)],
            cwd=str(root / "studio"),
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        if proc.stdout:
            print(proc.stdout.strip())
        if proc.returncode != 0:
            if proc.stderr:
                print(proc.stderr.strip(), file=sys.stderr)
            raise RuntimeError(f"Remotion サムネイル描画に失敗しました (exit={proc.returncode})")
    finally:
        job_path.unlink(missing_ok=True)

    # 168x94px スクイント画像を ffmpeg Lanczos で生成
    for item in planned_outputs:
        if item["kind"] == "squint_168x94":
            generate_squint_png(
                Path(item["sourceMainPng"]),
                Path(item["path"]),
                width=spec.render.squintWidth,
                height=spec.render.squintHeight,
            )

    verification_errors = validate_rendered_outputs(spec, planned_outputs)
    result["outputVerificationErrors"] = verification_errors
    result["passed"] = report.passed and len(verification_errors) == 0

    report_path = resolved_out_dir / "thumbnail_build_report.json"
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    result["reportPath"] = str(report_path)
    return result


def _print_summary(result: dict[str, Any]) -> None:
    val = result["validation"]
    print(f"=== サムネイルパイプライン v2 ({result['mode']}) ===")
    print(f"エピソード : {val['episodeId']} | フォーマット: {val['formatId']}")
    print(f"タイトル   : 全角換算 {val['titleZenkakuLength']} 字（目安30字前後）")
    print(f"実験推奨   : {val['recommendedExperimentMethod']}")
    print("バリアント監査:")
    for m in val["variantMetrics"]:
        comp_label = m.get("compositionId") or "(未指定)"
        print(
            f"  - {m['variantId']} [Still:{comp_label}]: コピー{m['copyCharCount']}字 ({m['lineCount']}行), "
            f"コントラスト比={m['contrastPrimary']}:1 / 強調={m['contrastEmphasis']}:1, "
            f"タイトル連続一致={m['lcsOverlapLen']}字 (バイグラム={m['bigramOverlapRatio']:.1%})"
        )
    if val["errors"]:
        print(f"エラー ({len(val['errors'])}件):")
        for e in val["errors"]:
            print(f"  [ERROR:{e['code']}] {e['target']}: {e['message']}")
    if val["warnings"]:
        print(f"警告 ({len(val['warnings'])}件):")
        for w in val["warnings"]:
            print(f"  [WARN:{w['code']}] {w['target']}: {w['message']}")

    if result["mode"] in ("dry_run", "build"):
        print(f"出力先ディレクトリ: {result['outDir']}")
        for item in result["plannedOutputs"]:
            extra = ""
            if "actualWidth" in item:
                extra = f" -> 実測 {item['actualWidth']}×{item['actualHeight']} ({item.get('sizeMb', 0)} MB)"
            print(f"  - [{item['kind']}] {item['path']}{extra}")

    if result.get("outputVerificationErrors"):
        print("出力ファイル実測エラー:")
        for msg in result["outputVerificationErrors"]:
            print(f"  [OUTPUT_ERR] {msg}")

    print(f"最終判定: {'合格 (PASSED)' if result['passed'] else '不合格 (FAILED)'}")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Remotion <Still> 自由舞台 v2 サムネイル機械検証＆一括ビルドCLI"
    )
    parser.add_argument("--spec", required=True, help="thumbnail_spec.json / .yaml へのパス")
    parser.add_argument("--out-dir", default=None, help="画像出力先ディレクトリ（省略時はエピソード配下 thumbnails/）")
    parser.add_argument("--validate-only", action="store_true", help="Spec契約と規約バリデーションのみ実行して終了")
    parser.add_argument("--dry-run", action="store_true", help="バリデーション＋出力ファイル計画を表示して終了（画像生成なし）")
    parser.add_argument("--skip-textless", action="store_true", help="文字抜きベースPNGの生成を省略")
    parser.add_argument("--skip-comparison", action="store_true", help="YouTube模擬比較シートの生成を省略")
    parser.add_argument("--show-safe-guides", action="store_true", help="4K画像へセーフゾーン/再生時間バッジ回避ガイドを重ねる")
    parser.add_argument(
        "--require-registered-stills",
        action="store_true",
        help="validate-only / dry-run 時でも ThumbnailRoot.tsx への compositionId 登録済みを必須エラーにする",
    )
    parser.add_argument("--strict-warnings", action="store_true", help="警告が1件以上ある場合も終了コード1にする")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    spec_path = Path(args.spec).resolve()
    out_dir = Path(args.out_dir).resolve() if args.out_dir else None

    result = run_thumbnail_build(
        spec_path,
        out_dir=out_dir,
        validate_only=args.validate_only,
        dry_run=args.dry_run,
        skip_textless=args.skip_textless,
        skip_comparison=args.skip_comparison,
        show_safe_guides=args.show_safe_guides,
        require_registered_stills=args.require_registered_stills,
    )
    _print_summary(result)

    if not result["passed"]:
        return 1
    if args.strict_warnings and result["validation"]["warnings"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
