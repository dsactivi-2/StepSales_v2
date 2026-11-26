from __future__ import annotations

import json

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
        "STEPSALES_TOOLS_TIMEOUT_S",
        "STEPSALES_MAX_CALL_SECONDS",
        "STEPSALES_TEST_CALLS_ONLY",
        "STEPSALES_WEB_TEST",
        "LIVEKIT_SIP_OUTBOUND_TRUNK_ID",
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


def test_variant_is_case_insensitive(monkeypatch) -> None:
    _env(monkeypatch, STEPSALES_VARIANT="GPTLIVE", **BASE)
    assert load_settings().variant == "gptlive"


def test_localhost_webhook_is_allowed(monkeypatch) -> None:
    _env(
        monkeypatch,
        STEPSALES_VARIANT="gemini",
        N8N_TOOLS_WEBHOOK_URL="http://localhost:5678/webhook/x",
        N8N_TOOLS_WEBHOOK_SECRET="s",
    )
    assert load_settings().tools_webhook_url == "http://localhost:5678/webhook/x"


def test_invalid_numeric_env_fails_fast(monkeypatch) -> None:
    _env(monkeypatch, STEPSALES_VARIANT="gemini", STEPSALES_TOOLS_TIMEOUT_S="schnell", **BASE)
    with pytest.raises(ConfigError, match="STEPSALES_TOOLS_TIMEOUT_S"):
        load_settings()


def test_langfuse_requires_all_three_keys(monkeypatch) -> None:
    _env(
        monkeypatch,
        STEPSALES_VARIANT="gemini",
        LANGFUSE_PUBLIC_KEY="pk",
        LANGFUSE_SECRET_KEY="sk",
        **BASE,
    )
    assert load_settings().langfuse_enabled is False
    monkeypatch.setenv("LANGFUSE_BASE_URL", "https://cloud.langfuse.com")
    assert load_settings().langfuse_enabled is True


def test_non_false_value_keeps_test_calls_only_on(monkeypatch) -> None:
    _env(monkeypatch, STEPSALES_VARIANT="gemini", STEPSALES_TEST_CALLS_ONLY="no", **BASE)
    assert load_settings().test_calls_only is True


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
        make_metadata(lead={"firma": "   "}),
        make_metadata(call_id="other-room"),
        make_metadata(call_type="zweittermin"),
        make_metadata(test="false"),
        make_metadata(test=None),
        make_metadata(test=1),
        make_metadata(phone_number="+123456"),
        make_metadata(phone_number="+1234567890123456"),
        make_metadata(phone_number="4930123456789"),
    ],
)
def test_invalid_metadata_never_dials(raw) -> None:
    with pytest.raises(MetadataError):
        parse_metadata(raw, room_name=ROOM)


def test_call_id_defaults_to_room() -> None:
    raw = make_metadata()
    data = json.loads(raw)
    del data["call_id"]
    ctx = parse_metadata(json.dumps(data), room_name=ROOM)
    assert ctx.call_id == ROOM


def test_missing_call_type_defaults_to_erstgespraech() -> None:
    raw = make_metadata()
    data = json.loads(raw)
    del data["call_type"]
    ctx = parse_metadata(json.dumps(data), room_name=ROOM)
    assert ctx.call_type == "erstgespraech"


def test_rueckruf_does_not_require_previous_summary() -> None:
    ctx = parse_metadata(make_metadata(call_type="rueckruf"), room_name=ROOM)
    assert ctx.call_type == "rueckruf"
    assert ctx.previous_summary is None


def test_zweittermin_accepts_previous_summary() -> None:
    ctx = parse_metadata(
        make_metadata(call_type="zweittermin", previous_summary="Will Paket M"),
        room_name=ROOM,
    )
    assert ctx.previous_summary == "Will Paket M"


@pytest.mark.parametrize("phone", ["+1234567", "+123456789012345", "  +4930123456789  "])
def test_e164_bounds_and_whitespace_are_accepted(phone: str) -> None:
    ctx = parse_metadata(make_metadata(phone_number=phone), room_name=ROOM)
    assert ctx.phone_number == phone.strip()
