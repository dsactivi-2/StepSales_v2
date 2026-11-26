"""Laufzeitkonfiguration aus Umgebungsvariablen.

Ein Prozess bedient genau einen Agent-Namen (LiveKit registriert pro Server einen Namen).
Beide Agents laufen deshalb aus demselben Code als zwei Deployments, unterschieden durch
``STEPSALES_VARIANT`` (ADR-0003).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

Variant = Literal["gptlive", "gemini"]

AGENT_NAMES: dict[Variant, str] = {
    "gptlive": "stepsales-gptlive",
    "gemini": "stepsales-gemini",
}

# Modell-IDs laut LiveKit-Inference-Doku (verifiziert 2026-11-25):
# https://docs.livekit.io/agents/models/realtime/gpt-live/ und .../realtime/gemini/
DEFAULT_MODELS: dict[Variant, str] = {
    "gptlive": "openai/gpt-live-1",
    "gemini": "google/gemini-3.8-live",
}

# Stimmen: GPT-Live-Stimmen aus GPTLiveVoices (SDK 1.8.13), Gemini-Stimmen aus der
# Google-Voice-Liste. Weiblich passend zur Persona; per Hörtest final festlegen.
DEFAULT_VOICES: dict[Variant, str] = {
    "gptlive": "marin",
    "gemini": "Kore",
}


class ConfigError(ValueError):
    """Pflichtwert fehlt oder ist ungültig."""


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def _env_float(name: str, default: float) -> float:
    raw = _env(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} muss eine Zahl sein, ist aber {raw!r}") from exc


@dataclass(frozen=True)
class Settings:
    variant: Variant
    agent_name: str
    model: str
    voice: str
    backend_model: str | None
    tools_webhook_url: str
    tools_webhook_secret: str
    tools_timeout_s: float
    sip_outbound_trunk_id: str | None
    max_call_seconds: float
    company_name: str
    persona_name: str
    timezone: str
    langfuse_enabled: bool
    test_calls_only: bool
    # Browser-Test ohne SIP und mit simulierten Tools (docs/runbooks/deploy-agents.md)
    web_test: bool = False
    # GPT-Live: "inference" = LiveKit Inference (Guthaben LiveKit), "openai" = direkt mit
    # eigenem OPENAI_API_KEY (ADR-0013). Gemini nutzt immer LiveKit Inference.
    gptlive_backend: str = "inference"

    @property
    def is_gptlive(self) -> bool:
        return self.variant == "gptlive"


def load_settings() -> Settings:
    variant_raw = (_env("STEPSALES_VARIANT") or "").lower()
    if variant_raw not in AGENT_NAMES:
        raise ConfigError(
            "STEPSALES_VARIANT muss 'gptlive' oder 'gemini' sein "
            f"(gesetzt: {variant_raw or 'leer'})"
        )
    variant: Variant = variant_raw  # type: ignore[assignment]

    web_test = (_env("STEPSALES_WEB_TEST", "false") or "false").lower() == "true"
    trunk = _env("LIVEKIT_SIP_OUTBOUND_TRUNK_ID")
    if web_test and trunk:
        # fail-closed: ein Test-Deployment darf nie wählen können
        raise ConfigError("STEPSALES_WEB_TEST und LIVEKIT_SIP_OUTBOUND_TRUNK_ID schließen sich aus")

    url = _env("N8N_TOOLS_WEBHOOK_URL")
    secret = _env("N8N_TOOLS_WEBHOOK_SECRET")
    if web_test:
        # Tools sind im Web-Test simuliert; n8n wird nie aufgerufen
        url, secret = url or "", secret or ""
    else:
        if not url or not secret:
            raise ConfigError("N8N_TOOLS_WEBHOOK_URL und N8N_TOOLS_WEBHOOK_SECRET sind Pflicht")
        if not url.startswith("https://") and not url.startswith("http://localhost"):
            raise ConfigError("N8N_TOOLS_WEBHOOK_URL muss https verwenden")

    gptlive_backend = (_env("STEPSALES_GPTLIVE_BACKEND", "inference") or "inference").lower()
    if gptlive_backend not in ("inference", "openai"):
        raise ConfigError("STEPSALES_GPTLIVE_BACKEND muss 'inference' oder 'openai' sein")
    if variant == "gptlive" and gptlive_backend == "openai" and not _env("OPENAI_API_KEY"):
        # fail-fast beim Start statt Abbruch mitten im ersten Gespräch
        raise ConfigError("STEPSALES_GPTLIVE_BACKEND=openai braucht das Secret OPENAI_API_KEY")

    langfuse = all(
        _env(k) for k in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL")
    )

    return Settings(
        variant=variant,
        agent_name=AGENT_NAMES[variant],
        model=_env("STEPSALES_MODEL", DEFAULT_MODELS[variant]) or DEFAULT_MODELS[variant],
        voice=_env("STEPSALES_VOICE", DEFAULT_VOICES[variant]) or DEFAULT_VOICES[variant],
        backend_model=_env("STEPSALES_GPTLIVE_BACKEND_MODEL"),
        tools_webhook_url=url,
        tools_webhook_secret=secret,
        tools_timeout_s=_env_float("STEPSALES_TOOLS_TIMEOUT_S", 8.0),
        sip_outbound_trunk_id=trunk,
        max_call_seconds=_env_float("STEPSALES_MAX_CALL_SECONDS", 600.0),
        company_name=_env("STEPSALES_COMPANY_NAME", "StepSales") or "StepSales",
        persona_name=_env("STEPSALES_PERSONA_NAME", "Lena Berger") or "Lena Berger",
        timezone=_env("STEPSALES_TIMEZONE", "Europe/Berlin") or "Europe/Berlin",
        langfuse_enabled=langfuse,
        # bis zum Pilot (Stufe 6) nimmt der Agent nur Testanrufe an – zusätzlich zum Dispatcher
        test_calls_only=(_env("STEPSALES_TEST_CALLS_ONLY", "true") or "true").lower() != "false",
        web_test=web_test,
        gptlive_backend=gptlive_backend,
    )
