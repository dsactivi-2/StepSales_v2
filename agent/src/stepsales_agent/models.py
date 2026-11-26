"""Modellwahl je Variante – über LiveKit Inference (Owner-Entscheidung, Issue #5);
GPT-Live optional direkt über OpenAI mit eigenem Key (ADR-0013, Issue #30).

Quellen (2026-11-25): docs.livekit.io/agents/models/realtime/gpt-live/ und .../gemini/,
SDK livekit-agents 1.8.13 (inference.DuplexModel, inference.RealtimeModel, inference.VAD).
"""

from __future__ import annotations

from typing import Any

from livekit.agents import inference
from livekit.plugins import openai as openai_plugin

from .config import Settings


def build_llm(settings: Settings, backend_instructions: str) -> Any:
    if settings.is_gptlive:
        responses_options: dict[str, Any] = {"instructions": backend_instructions}
        if settings.backend_model:
            # sonst gilt der SDK-Default (laut Doku gpt-5.6-luna)
            responses_options["model"] = settings.backend_model
        if settings.gptlive_backend == "openai":
            # direkt bei OpenAI, Key aus OPENAI_API_KEY (ADR-0013); gleiche Optionen wie unten
            return openai_plugin.realtime.GPTLiveModel(
                model=settings.model,
                voice=settings.voice,
                responses_options=responses_options,  # type: ignore[arg-type]
            )
        return inference.DuplexModel(
            settings.model,
            voice=settings.voice,
            extra_kwargs={"responses_options": responses_options},
        )
    return inference.RealtimeModel(model=settings.model, voice=settings.voice)


def build_vad(settings: Settings) -> Any:
    """GPT-Live: die Session lässt ihre Standard-VAD weg, Barge-in braucht aber eine VAD
    (Doku „Turn detection and interruption“). Gemini nutzt die eigene Aktivitätserkennung."""
    if settings.is_gptlive:
        return inference.VAD(model="silero")
    return None
