"""configs/*.yaml からスタック・しきい値・価格監視設定を読み込む設定ローダー。"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


def find_repo_root(start: Path | None = None) -> Path:
    """configs/ ディレクトリを含むリポジトリルートを探索して返す。"""
    current = (start or Path(__file__)).resolve()
    for candidate in (current, *current.parents):
        if (candidate / "configs").is_dir():
            return candidate
    raise FileNotFoundError("configs/ directory could not be located from current path.")


def load_yaml_config(filename: str, configs_dir: Path | None = None) -> dict[str, Any]:
    """configs 配下の指定 YAML ファイルを読み込む。"""
    base_dir = configs_dir or (find_repo_root() / "configs")
    target = base_dir / filename
    if not target.is_file():
        raise FileNotFoundError(f"Config file not found: {target}")
    with target.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping in {target}, got {type(data).__name__}")
    return data


@dataclass(frozen=True)
class EngineConfig:
    """設定ファイル3種を束ねた読み取り専用コンテナ。"""

    stack: dict[str, Any]
    thresholds: dict[str, Any]
    pricing_watch: dict[str, Any]

    @classmethod
    def load(cls, configs_dir: Path | None = None) -> "EngineConfig":
        """configs/ 配下の設定ファイルを一括読み込みする。"""
        return cls(
            stack=load_yaml_config("stack.yaml", configs_dir),
            thresholds=load_yaml_config("outlier_thresholds.yaml", configs_dir),
            pricing_watch=load_yaml_config("pricing_watch.yaml", configs_dir),
        )

    def get_role_primary_model(self, role: str) -> str:
        """stack.yaml から指定ロールの primary モデル/製品名を取得する。"""
        role_cfg = self.stack.get("roles", {}).get(role, {})
        primary = role_cfg.get("primary", {})
        return str(primary.get("model") or primary.get("product") or primary.get("provider") or "")
