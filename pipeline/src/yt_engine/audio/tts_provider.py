"""全ハーネス共通（案A / 案B / 案C / 案E）の TTS プロバイダ抽象化・設定解決・ファクトリモジュール。

既存の GeminiTTSClient と ElevenLabsTTSClient（eleven_v4）を統一インターフェースで切り替え、
キャッシュディレクトリ分離（tts/ vs tts_<variant>/）や configs/stack.yaml 参照を一元管理する。
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Mapping, Protocol, Sequence, runtime_checkable

import yaml

from yt_engine.audio.tts_elevenlabs import (
    DEFAULT_ELEVENLABS_LANGUAGE_CODE,
    DEFAULT_ELEVENLABS_MIN_INTERVAL_SEC,
    DEFAULT_ELEVENLABS_MODELS,
    DEFAULT_ELEVENLABS_OUTPUT_FORMATS,
    DEFAULT_ELEVENLABS_VOICE_ID,
    DEFAULT_ELEVENLABS_VOICE_NAME,
    DEFAULT_ELEVENLABS_VOICE_SETTINGS,
    ElevenLabsTTSClient,
    normalize_elevenlabs_language_code,
)
from yt_engine.audio.tts_gemini import (
    DEFAULT_KEY_MIN_INTERVAL_SEC,
    DEFAULT_SAMPLE_RATE,
    DEFAULT_TTS_MODELS,
    GeminiTTSClient,
    NarrationChunk,
    SynthesizedChunk,
)
from yt_engine.config import find_repo_root

TTSProviderName = Literal["gemini", "elevenlabs"]
SUPPORTED_TTS_PROVIDERS: tuple[str, ...] = ("gemini", "elevenlabs")

GEMINI_PREBUILT_VOICES: frozenset[str] = frozenset(
    {
        "charon",
        "orus",
        "kore",
        "puck",
        "fenrir",
        "aoede",
        "leda",
        "zephyr",
        "sulafat",
        "achernar",
        "algenib",
        "algieba",
        "alnilam",
        "autonoe",
        "callirrhoe",
        "despina",
        "enceladus",
        "erinome",
        "gacrux",
        "iapetus",
        "laomedeia",
        "pulcherrima",
        "rasalgethi",
        "sadachbia",
        "sadaltager",
        "schedar",
        "umbriel",
        "vindemiatrix",
        "zubenelgenubi",
    }
)


@runtime_checkable
class TTSClientProtocol(Protocol):
    """全ハーネスビルダーが共通依存する最小 TTS クライアントプロトコル。"""

    provider_name: str

    def synthesize_chunk(
        self,
        chunk: NarrationChunk,
        out_dir: Path,
        *,
        force: bool = False,
        stop_duration: float = 0.14,
        max_expected_sec: float | None = None,
        models: Sequence[str] | None = None,
    ) -> SynthesizedChunk: ...

    def synthesize_chunks(
        self,
        chunks: Sequence[NarrationChunk],
        out_dir: Path,
        *,
        force: bool = False,
        stop_duration: float = 0.14,
    ) -> tuple[list[SynthesizedChunk], str]: ...


@dataclass(frozen=True)
class ResolvedTTSConfig:
    """Spec JSON・CLI 引数・configs/stack.yaml を統合解決した TTS 実行設定。"""

    provider: TTSProviderName
    models: tuple[str, ...]
    voices: tuple[str, ...]
    language_code: str
    temperature: float
    voice_settings: dict[str, Any]
    output_formats: tuple[str, ...]
    use_timestamps: bool


def resolve_stack_tts_defaults(repo_root: Path | None = None) -> dict[str, Any]:
    """configs/stack.yaml の roles.tts_primary.primary 設定を読み込む。"""
    fallback = {
        "provider": "elevenlabs",
        "model": "eleven_v4",
        "voice_id": DEFAULT_ELEVENLABS_VOICE_ID,
        "voice_name": DEFAULT_ELEVENLABS_VOICE_NAME,
        "language_code": DEFAULT_ELEVENLABS_LANGUAGE_CODE,
    }
    root = repo_root
    if root is None:
        try:
            root = find_repo_root()
        except FileNotFoundError:
            return fallback

    stack_path = root / "configs" / "stack.yaml"
    if not stack_path.is_file():
        return fallback

    try:
        loaded = yaml.safe_load(stack_path.read_text(encoding="utf-8"))
        if not isinstance(loaded, Mapping):
            return fallback
        primary = (
            loaded.get("roles", {})
            .get("tts_primary", {})
            .get("primary", {})
        )
        if not isinstance(primary, Mapping):
            return fallback
        req_params = primary.get("required_params") or {}
        lang = req_params.get("language_code") if isinstance(req_params, Mapping) else None
        raw_voice_id = (
            primary.get("voice_id")
            or primary.get("default_voice_id")
            or fallback["voice_id"]
        )
        raw_voice_name = (
            primary.get("voice_name")
            or primary.get("default_voice_name")
            or fallback["voice_name"]
        )
        return {
            "provider": str(primary.get("provider") or fallback["provider"]).strip().lower(),
            "model": str(primary.get("model") or fallback["model"]).strip(),
            "voice_id": str(raw_voice_id).strip() or fallback["voice_id"],
            "voice_name": str(raw_voice_name).strip() or fallback["voice_name"],
            "language_code": str(lang or fallback["language_code"]).strip(),
        }
    except Exception:
        return fallback


def _prepend_unique(first: str | None, items: Sequence[str]) -> tuple[str, ...]:
    cleaned = [str(x).strip() for x in items if str(x).strip()]
    if first and first.strip():
        f = first.strip()
        return (f, *[x for x in cleaned if x != f])
    return tuple(dict.fromkeys(cleaned))


def resolve_tts_config(
    spec_tts: Mapping[str, Any] | None = None,
    *,
    cli_provider: str | None = None,
    cli_model: str | None = None,
    cli_voice: str | None = None,
    cli_language: str | None = None,
    default_provider: str = "elevenlabs",
    repo_root: Path | None = None,
) -> ResolvedTTSConfig:
    """Spec 定義・CLI 上書き・configs/stack.yaml から実効 TTS 設定を確定する。"""
    cfg = spec_tts if isinstance(spec_tts, Mapping) else {}
    stack_defaults = resolve_stack_tts_defaults(repo_root)

    raw_provider = (cli_provider or str(cfg.get("provider") or "")).strip().lower()
    if raw_provider == "auto":
        raw_provider = str(stack_defaults.get("provider") or default_provider).strip().lower()
    if not raw_provider:
        spec_models = [str(m).strip().lower() for m in (cfg.get("models") or []) if str(m).strip()]
        if spec_models and all(m.startswith("eleven_") for m in spec_models):
            raw_provider = "elevenlabs"
        else:
            raw_provider = default_provider.strip().lower()

    if raw_provider not in SUPPORTED_TTS_PROVIDERS:
        raise ValueError(
            f"Unsupported TTS provider: {raw_provider!r} (expected one of {SUPPORTED_TTS_PROVIDERS})"
        )

    provider: TTSProviderName = raw_provider  # type: ignore[assignment]
    temperature = float(cfg.get("temperature", 0.30))

    if provider == "elevenlabs":
        el_sub = cfg.get("elevenlabs")
        el_cfg: Mapping[str, Any] = el_sub if isinstance(el_sub, Mapping) else {}

        raw_models = el_cfg.get("models")
        if raw_models is None:
            raw_models = [
                str(m).strip()
                for m in (cfg.get("models") or [])
                if str(m).strip() and not str(m).strip().lower().startswith("gemini")
            ]
        if not raw_models:
            stack_model = str(stack_defaults.get("model") or "eleven_v4")
            if stack_defaults.get("provider") == "elevenlabs" and stack_model.startswith("eleven_"):
                raw_models = [stack_model, *[m for m in DEFAULT_ELEVENLABS_MODELS if m != stack_model]]
            else:
                raw_models = list(DEFAULT_ELEVENLABS_MODELS)
        models = _prepend_unique(cli_model, [str(m) for m in raw_models])

        raw_voices = el_cfg.get("voices")
        if raw_voices is None:
            single_el_voice = el_cfg.get("voiceId") or el_cfg.get("voice_id")
            if isinstance(single_el_voice, str) and single_el_voice.strip():
                raw_voices = [single_el_voice.strip()]
            else:
                raw_voices = [
                    str(v).strip()
                    for v in (cfg.get("voices") or [])
                    if str(v).strip() and str(v).strip().lower() not in GEMINI_PREBUILT_VOICES
                ]
        if not raw_voices:
            env_voice = os.environ.get("ELEVENLABS_VOICE_ID", "").strip()
            stack_voice = (
                str(stack_defaults.get("voice_id") or "").strip()
                if stack_defaults.get("provider") == "elevenlabs"
                else ""
            )
            default_voice = env_voice or stack_voice or DEFAULT_ELEVENLABS_VOICE_ID
            raw_voices = [default_voice]
        voices = _prepend_unique(cli_voice, [str(v) for v in raw_voices])

        raw_lang = (
            cli_language
            or el_cfg.get("languageCode")
            or el_cfg.get("language_code")
            or cfg.get("languageCode")
            or stack_defaults.get("language_code")
            or DEFAULT_ELEVENLABS_LANGUAGE_CODE
        )
        lang = normalize_elevenlabs_language_code(str(raw_lang)) or DEFAULT_ELEVENLABS_LANGUAGE_CODE

        merged_settings = dict(DEFAULT_ELEVENLABS_VOICE_SETTINGS)
        raw_settings = el_cfg.get("voiceSettings") or cfg.get("voiceSettings")
        if isinstance(raw_settings, Mapping):
            merged_settings.update({str(k): v for k, v in raw_settings.items()})

        raw_fmts = el_cfg.get("outputFormats") or cfg.get("outputFormats") or DEFAULT_ELEVENLABS_OUTPUT_FORMATS
        output_formats = tuple(str(f).strip() for f in raw_fmts if str(f).strip()) or DEFAULT_ELEVENLABS_OUTPUT_FORMATS

        raw_ts = el_cfg.get("useTimestamps", cfg.get("useTimestamps", True))
        use_timestamps = bool(raw_ts)

        return ResolvedTTSConfig(
            provider=provider,
            models=models,
            voices=voices,
            language_code=lang,
            temperature=temperature,
            voice_settings=merged_settings,
            output_formats=output_formats,
            use_timestamps=use_timestamps,
        )

    raw_gemini_models = [
        str(m).strip()
        for m in (cfg.get("models") or DEFAULT_TTS_MODELS)
        if str(m).strip() and not str(m).strip().lower().startswith("eleven_")
    ] or list(DEFAULT_TTS_MODELS)
    models = _prepend_unique(cli_model, raw_gemini_models)

    raw_gemini_voices = [
        str(v).strip()
        for v in (cfg.get("voices") or ("Charon", "Orus"))
        if str(v).strip() and str(v).strip().lower() != "auto"
    ] or ["Charon", "Orus"]
    voices = _prepend_unique(cli_voice, raw_gemini_voices)

    lang = str(cli_language or cfg.get("languageCode") or "ja-JP").strip() or "ja-JP"
    return ResolvedTTSConfig(
        provider=provider,
        models=models,
        voices=voices,
        language_code=lang,
        temperature=temperature,
        voice_settings={},
        output_formats=(),
        use_timestamps=False,
    )


def resolve_tts_cache_dir(
    public_dir: Path,
    provider: str,
    *,
    variant: str | None = None,
) -> Path:
    """プロバイダ／比較バリアントに応じて TTS キャッシュディレクトリを安全に分離する。

    variant 未指定かつ Gemini の場合は従来の `public_dir / "tts"` を維持して完全後方互換。
    """
    if variant and variant.strip():
        safe_var = re.sub(r"[^A-Za-z0-9_-]+", "_", variant.strip()).strip("_")
        if safe_var:
            return public_dir / f"tts_{safe_var}"
    norm = provider.strip().lower()
    if norm == "gemini":
        return public_dir / "tts"
    return public_dir / f"tts_{norm}"


def create_tts_client(
    provider: str = "gemini",
    *,
    api_key: str | None = None,
    voice_name: str | None = None,
    models: Sequence[str] | None = None,
    language_code: str | None = None,
    temperature: float | None = 0.35,
    voice_settings: Mapping[str, Any] | None = None,
    output_formats: Sequence[str] | None = None,
    use_timestamps: bool = True,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    request_interval_sec: float | None = None,
    attempts_per_model: int = 2,
    trim_pre_filters: str | None = None,
    trim_post_filters: str | None = None,
    repo_root: Path | None = None,
    load_env: bool = True,
    **extra_kwargs: Any,
) -> GeminiTTSClient | ElevenLabsTTSClient:
    """指定プロバイダ（gemini / elevenlabs / auto）の共通 TTS クライアントを生成する。"""
    norm = provider.strip().lower()
    if norm == "auto":
        norm = str(resolve_stack_tts_defaults(repo_root).get("provider") or "gemini").strip().lower()

    if norm == "elevenlabs":
        resolved_voice = (voice_name or "").strip()
        if not resolved_voice:
            env_voice = os.environ.get("ELEVENLABS_VOICE_ID", "").strip()
            stack_defaults = resolve_stack_tts_defaults(repo_root)
            stack_voice = (
                str(stack_defaults.get("voice_id") or "").strip()
                if stack_defaults.get("provider") == "elevenlabs"
                else ""
            )
            resolved_voice = env_voice or stack_voice or DEFAULT_ELEVENLABS_VOICE_ID
        return ElevenLabsTTSClient(
            api_key=api_key,
            voice_id=resolved_voice,
            models=tuple(models) if models else DEFAULT_ELEVENLABS_MODELS,
            language_code=language_code or DEFAULT_ELEVENLABS_LANGUAGE_CODE,
            voice_settings=voice_settings,
            output_formats=tuple(output_formats) if output_formats else DEFAULT_ELEVENLABS_OUTPUT_FORMATS,
            use_timestamps=use_timestamps,
            sample_rate=sample_rate,
            request_interval_sec=(
                DEFAULT_ELEVENLABS_MIN_INTERVAL_SEC
                if request_interval_sec is None
                else float(request_interval_sec)
            ),
            attempts_per_model=attempts_per_model,
            trim_pre_filters=trim_pre_filters,
            trim_post_filters=trim_post_filters,
            repo_root=repo_root,
            load_env=load_env,
            http_client=extra_kwargs.get("http_client"),
            clock=extra_kwargs.get("clock"),
            sleep_fn=extra_kwargs.get("sleep_fn"),
        )

    if norm == "gemini":
        return GeminiTTSClient(
            api_key=api_key,
            api_keys=extra_kwargs.get("api_keys"),
            fallback_api_key=extra_kwargs.get("fallback_api_key"),
            voice_name=voice_name or "Charon",
            models=tuple(models) if models else DEFAULT_TTS_MODELS,
            sample_rate=sample_rate,
            temperature=temperature,
            request_interval_sec=(
                DEFAULT_KEY_MIN_INTERVAL_SEC
                if request_interval_sec is None
                else float(request_interval_sec)
            ),
            attempts_per_model=attempts_per_model,
            trim_pre_filters=trim_pre_filters,
            trim_post_filters=trim_post_filters,
            repo_root=repo_root,
            load_env=load_env,
            key_pool=extra_kwargs.get("key_pool"),
            client_factory=extra_kwargs.get("client_factory"),
            clock=extra_kwargs.get("clock"),
            sleep_fn=extra_kwargs.get("sleep_fn"),
            jitter_fn=extra_kwargs.get("jitter_fn"),
        )

    raise ValueError(f"Unsupported TTS provider: {provider!r} (expected one of {SUPPORTED_TTS_PROVIDERS})")
