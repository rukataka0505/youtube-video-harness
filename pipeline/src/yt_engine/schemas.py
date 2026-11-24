"""Gemini Structured Outputs および制作台本連携用の Pydantic v2 スキーマ定義。

FSM（有限状態機械）状態爆発による 400 INVALID_ARGUMENT を防ぐため、
ネスト最大2層・全フィールド必須（欠損時は nullable）・小規模 Literal 列挙型で構成する。
"""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class HookMicroSpec(BaseModel):
    """Pass 1（冒頭60秒・2.0 FPS・High Resolution）動画解析出力スキーマ。"""

    click_confirm_sec: float = Field(
        description="タイトル・サムネイルの約束を映像または発言で初確認した秒数(0-60)。未達なら60.0"
    )
    has_greeting_or_logo_waste: bool = Field(
        description="冒頭10秒以内に不要な挨拶や5秒超のロゴOPがあるか"
    )
    hook_format: Literal[
        "direct_value", "highlights_teaser", "cold_open", "bold_claim", "question", "other"
    ] = Field(description="冒頭フックの導入フォーマット分類")
    uses_negative_stakes: bool = Field(
        description="損失回避・失敗警告・危機感などネガティブフレームで視聴理由を提示しているか"
    )
    context_lean_in: str = Field(description="視聴者の共感・前提を引き込む冒頭フレーズ要約")
    scroll_stop_pivot: Optional[str] = Field(
        description="『しかし/But/実は』等の逆接転換フレーズ。無ければnull"
    )
    contrarian_snapback: Optional[str] = Field(
        description="常識を覆す予想外の主張・結論フック。無ければnull"
    )
    opening_curiosity_loop: str = Field(
        description="冒頭30秒以内に開かれた、本編最後まで見させるための未解決の疑問・約束"
    )
    cut_count_0_60s: int = Field(ge=0, description="0〜60秒間の視覚的カット/画面切替回数")
    avg_shot_len_sec: float = Field(gt=0.0, description="冒頭区間の平均ショット長（秒）")
    first_interrupt_sec: Optional[float] = Field(
        description="最初の明確なパターンインタラプト（B-roll/ズーム/図解/音転換）の秒数"
    )
    telop_style: Literal["none", "minimal_keyword", "full_subtitle", "kinetic_highlight", "mixed"] = (
        Field(description="画面内テロップの設計スタイル")
    )
    opening_sfx_present: bool = Field(
        description="冒頭15秒以内にwhoosh/pop/impact等の意図的効果音があるか"
    )
    vocal_energy_level: Literal[
        "calm_authority", "conversational", "high_energy", "dramatic", "tts_ai"
    ] = Field(description="ナレーション・話者の声のトーンとエネルギー分類")
    shorts_seamless_loop: Optional[bool] = Field(
        description="Shorts動画の場合、末尾から冒頭へ自然につながるループ構造か。長尺はnull"
    )


class OpenLoopItem(BaseModel):
    """動画内のオープンループ開閉記録。"""

    opened_at: str = Field(description="ループを開いたタイムスタンプ MM:SS")
    hook_question: str = Field(description="視聴者に提示した疑問・予告・リフック内容")
    closed_at: Optional[str] = Field(description="答えを回収したタイムスタンプ MM:SS。未回収ならnull")
    is_closed: bool = Field(description="動画内で誠実に回収されたか")


class MonetizationCTAItem(BaseModel):
    """動画内の収益導線・CTA記録。"""

    timestamp: str = Field(description="訴求開始タイムスタンプ MM:SS")
    cta_type: Literal[
        "subscribe_like", "line_email_lead", "affiliate_shopping", "sponsor_read", "owned_product", "next_video"
    ] = Field(description="CTA・マネタイズ導線の種別")
    duration_sec: int = Field(ge=0, description="訴求にかけた概算秒数")
    placement_context: Literal["after_rehook", "after_value_peak", "flat_transition", "end_screen"] = (
        Field(description="挿入直前の文脈")
    )
    bridge_script_summary: str = Field(description="本編内容から導線・案件へ自然に接続したトークの型")


class MacroWinningBlueprint(BaseModel):
    """Pass 2（全編・0.5 FPS・Low Resolution＋音声）動画解析出力スキーマ。"""

    content_format: Literal[
        "tutorial", "case_study", "explainer_essay", "comparison_review", "challenge_vlog", "listicle"
    ] = Field(description="動画全体の主フォーマット")
    structural_roadmap_shown: bool = Field(
        description="冒頭〜導入部で動画の全体章立て・ステップ数を視覚提示しているか"
    )
    body_avg_shot_len_sec: float = Field(gt=0.0, description="本編全体の推定平均視覚変化間隔（秒）")
    pattern_interrupt_interval_sec: float = Field(
        gt=0.0, description="大きな場面・図解・演出転換の平均間隔（秒）"
    )
    visual_dominant_layer: Literal[
        "talking_head", "broll_stock", "screen_capture", "slides_motion_gfx", "faceless_ai_mixed"
    ] = Field(description="本編で最も占有率が高い映像レイヤー")
    bgm_shift_count: int = Field(ge=0, description="章転換や感情変化に伴うBGMトラック切替・停止の回数")
    dead_air_eliminated: bool = Field(description="発話間の不要な無音・言い淀みが徹底カットされているか")
    uses_j_l_cuts: bool = Field(description="音声先行・映像先行（J/Lカット）を使っているか")
    open_loops: list[OpenLoopItem] = Field(
        max_length=12, description="動画内で仕掛けられた主要なオープンループ・リフック一覧"
    )
    monetization_ctas: list[MonetizationCTAItem] = Field(
        max_length=10, description="動画内で言及・表示された全CTA・PR・商品導線一覧"
    )
    has_finalizing_phrase: bool = Field(
        description="終盤に『まとめると/最後に/to recap』等の視聴離脱合図語があるか"
    )
    end_screen_continuous_value: bool = Field(
        description="ラスト20秒で次動画への強烈な橋渡しまたは価値提供を継続しているか"
    )
    faceless_reproducible: bool = Field(
        description="顔出し・高額ロケなしで後発クリエイターが再現可能な構成か"
    )
    production_effort_tier: Literal["low_template", "medium_editorial", "high_cinematic"] = Field(
        description="制作工数・編集難易度の段階"
    )
    replicable_winning_formula: str = Field(
        description="他ジャンルへ横展開するための再現可能な『勝ちパターン設計式』要約"
    )


class ScriptSegment(BaseModel):
    """制作工程用の1セグメント台本（表示用・読み上げ用分離スキーマ）。"""

    segment_id: str
    chapter_title: str
    display_text: str = Field(description="画面テロップ・表示用テキスト")
    reading_text: str = Field(description="TTS読み上げ専用テキスト（誤読回避・ひらがな調整済み）")
    visual_layer: Literal["remotion_2d", "static_infographic", "broll", "primary_capture"]
    citation_text: Optional[str] = Field(default=None, description="YouTube概要欄転記用の一次出典メモ（動画画面内には原則表示しない）")
    target_duration_sec: float = Field(gt=0.0)


class ScriptMaster(BaseModel):
    """1本の長尺動画制作で台本からRemotion・音声・NLEへ引き渡すマスター構造。"""

    episode_id: str
    format_plan: Literal["plan_c", "plan_b_e", "plan_e", "plan_a"]
    title_candidate: str
    segments: list[ScriptSegment]
