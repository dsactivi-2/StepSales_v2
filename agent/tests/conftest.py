from __future__ import annotations

import json

import pytest

from stepsales_agent.call_context import CallContext, parse_metadata
from stepsales_agent.config import Settings

ROOM = "call-TEST-0001"


def make_metadata(**overrides: object) -> str:
    data: dict[str, object] = {
        "lead_id": "recTESTLEAD0001",
        "phone_number": "+4930123456789",
        "call_id": ROOM,
        "call_type": "erstgespraech",
        "lead": {
            "firma": "TEST Musterbau GmbH",
            "ansprechpartner": "Anna Test",
            "rolle": "HR-Leitung",
            "anzeigen_titel": "Bauleiter (m/w/d)",
            "quelle_portal": "TEST-Portal",
        },
        "test": True,
    }
    data.update(overrides)
    return json.dumps(data)


@pytest.fixture
def call_ctx() -> CallContext:
    return parse_metadata(make_metadata(), room_name=ROOM)


def make_settings(variant: str = "gptlive") -> Settings:
    from stepsales_agent.config import AGENT_NAMES, DEFAULT_MODELS, DEFAULT_VOICES

    return Settings(
        variant=variant,  # type: ignore[arg-type]
        agent_name=AGENT_NAMES[variant],  # type: ignore[index]
        model=DEFAULT_MODELS[variant],  # type: ignore[index]
        voice=DEFAULT_VOICES[variant],  # type: ignore[index]
        backend_model=None,
        tools_webhook_url="https://n8n.example/webhook/stepsales-tools",
        tools_webhook_secret="test-secret",
        tools_timeout_s=2.0,
        sip_outbound_trunk_id="ST_TEST",
        max_call_seconds=600,
        company_name="StepSales",
        persona_name="Lena Berger",
        timezone="Europe/Berlin",
        langfuse_enabled=False,
        test_calls_only=True,
    )


@pytest.fixture
def settings() -> Settings:
    return make_settings()
