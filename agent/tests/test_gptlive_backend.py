"""GPT-Live-Backend: LiveKit Inference (Default) oder direkt OpenAI mit eigenem Key (#30)."""

from __future__ import annotations

import dataclasses

import pytest
from conftest import make_settings

from stepsales_agent.config import ConfigError, load_settings
from stepsales_agent.models import build_llm


def _env(monkeypatch: pytest.MonkeyPatch, **values: str) -> None:
    for key in ("STEPSALES_GPTLIVE_BACKEND", "OPENAI_API_KEY", "LIVEKIT_SIP_OUTBOUND_TRUNK_ID"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("STEPSALES_WEB_TEST", "true")
    for key, value in values.items():
        monkeypatch.setenv(key, value)


def test_default_backend_is_inference(monkeypatch) -> None:
    _env(monkeypatch, STEPSALES_VARIANT="gptlive")
    assert load_settings().gptlive_backend == "inference"


def test_openai_backend_requires_key(monkeypatch) -> None:
    _env(monkeypatch, STEPSALES_VARIANT="gptlive", STEPSALES_GPTLIVE_BACKEND="openai")
    with pytest.raises(ConfigError, match="OPENAI_API_KEY"):
        load_settings()


def test_openai_backend_irrelevant_for_gemini(monkeypatch) -> None:
    _env(monkeypatch, STEPSALES_VARIANT="gemini", STEPSALES_GPTLIVE_BACKEND="openai")
    assert load_settings().variant == "gemini"


def test_unknown_backend_refused(monkeypatch) -> None:
    _env(monkeypatch, STEPSALES_VARIANT="gptlive", STEPSALES_GPTLIVE_BACKEND="azure")
    with pytest.raises(ConfigError, match="inference"):
        load_settings()


def test_openai_backend_builds_plugin_model(monkeypatch) -> None:
    from livekit.plugins.openai.realtime import GPTLiveModel

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    settings = dataclasses.replace(
        make_settings(),
        variant="gptlive",
        model="gpt-live-1",
        voice="marin",
        gptlive_backend="openai",
    )
    model = build_llm(settings, "backend")
    assert isinstance(model, GPTLiveModel)
