from __future__ import annotations

import pytest
from conftest import ROOM, make_metadata

from stepsales_agent.call_context import MetadataError, parse_metadata
from stepsales_agent.config import ConfigError, load_settings


def _env(monkeypatch: pytest.MonkeyPatch, **values: str) -> None:
    for key in (
        "STEPSALES_VARIANT",
        "N8N_TOOLS_WEBHOOK_URL",
        "N8N_TOOLS_WEBHOOK_SECRET",
        "STEPSALES_MODEL",
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "LANGFUSE_BASE_URL",
    ):
        monkeypatch.delenv(key, raising=False)
    for key, value in values.items():
        monkeypatch.setenv(key, value)


BASE = {
    "N8N_TOOLS_WEBHOOK_URL": "https://n8n.example/webhook/x",
    "N8N_TOOLS_WEBHOOK_SECRET": "secret",
}


@pytest.mark.parametrize(
    ("variant", "name", "model"),
    [
        ("gptlive", "stepsales-gptlive", "openai/gpt-live-1"),
        ("gemini", "stepsales-gemini", "google/gemini-3.8-live"),
    ],
)
def test_variant_selects_name_and_model(monkeypatch, variant, name, model) -> None:
    _env(monkeypatch, STEPSALES_VARIANT=variant, **BASE)
    s = load_settings()
    assert (s.agent_name, s.model) == (name, model)
    assert s.langfuse_enabled is False


def test_test_calls_only_defaults_on(monkeypatch) -> None:
    _env(monkeypatch, STEPSALES_VARIANT="gemini", **BASE)
    monkeypatch.delenv("STEPSALES_TEST_CALLS_ONLY", raising=False)
    assert load_settings().test_calls_only is True
    monkeypatch.setenv("STEPSALES_TEST_CALLS_ONLY", "false")
    assert load_settings().test_calls_only is False


def test_unknown_variant_fails_fast(monkeypatch) -> None:
    _env(monkeypatch, STEPSALES_VARIANT="gpt4", **BASE)
    with pytest.raises(ConfigError):
        load_settings()


def test_webhook_must_be_https(monkeypatch) -> None:
    _env(
        monkeypatch,
        STEPSALES_VARIANT="gemini",
        N8N_TOOLS_WEBHOOK_URL="http://n8n.example/x",
        N8N_TOOLS_WEBHOOK_SECRET="s",
    )
    with pytest.raises(ConfigError):
        load_settings()


def test_missing_secret_fails(monkeypatch) -> None:
    _env(monkeypatch, STEPSALES_VARIANT="gemini", N8N_TOOLS_WEBHOOK_URL="https://x")
    with pytest.raises(ConfigError):
        load_settings()


def test_valid_metadata_parses() -> None:
    ctx = parse_metadata(make_metadata(), room_name=ROOM)
    assert ctx.lead_id == "recTESTLEAD0001"
    assert ctx.lead.firma == "TEST Musterbau GmbH"
    assert ctx.call_type == "erstgespraech"
    assert ctx.test is True


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "",
        "not json",
        "[1, 2]",
        make_metadata(lead_id=""),
        make_metadata(phone_number="030 123"),
        make_metadata(phone_number="+0123"),
        make_metadata(call_type="kaltakquise"),
        make_metadata(lead={"ansprechpartner": "X"}),
        make_metadata(call_id="other-room"),
    ],
)
def test_invalid_metadata_never_dials(raw) -> None:
    with pytest.raises(MetadataError):
        parse_metadata(raw, room_name=ROOM)


def test_call_id_defaults_to_room() -> None:
    raw = make_metadata()
    import json

    data = json.loads(raw)
    del data["call_id"]
    ctx = parse_metadata(json.dumps(data), room_name=ROOM)
    assert ctx.call_id == ROOM
