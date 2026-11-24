"""異常値スコア（OS_LOO・VPH・VSR・VPD_norm）および広告ブースト除外パッケージ。"""

from __future__ import annotations

from yt_engine.scoring.outlier import (
    OutlierScoreResult,
    ScoredVideo,
    ScoringConfig,
    classify_outlier_tier,
    compute_inst_vph,
    compute_loo_outlier_score,
    compute_typical_like_rate,
    compute_vpd_norm,
    compute_vsr,
    evaluate_channel_outliers,
    is_ad_boost_suspected,
    rank_outliers,
)

__all__ = [
    "OutlierScoreResult",
    "ScoredVideo",
    "ScoringConfig",
    "classify_outlier_tier",
    "compute_inst_vph",
    "compute_loo_outlier_score",
    "compute_typical_like_rate",
    "compute_vpd_norm",
    "compute_vsr",
    "evaluate_channel_outliers",
    "is_ad_boost_suspected",
    "rank_outliers",
]
