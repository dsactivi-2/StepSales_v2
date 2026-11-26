"""Browser-Testmodus: fail-closed gegenüber SIP, simulierte Tools ohne Netz."""

from __future__ import annotations

import dataclasses

import pytest
from conftest import ROOM, make_metadata, make_settings
from test_entrypoint_guards import FakeCtx

from stepsales_agent.call_context import parse_metadata
from stepsales_agent.config import ConfigError, load_settings
from stepsales_agent.main import _run_call
from stepsales_agent.n8n_client import ToolRejected
from stepsales_agent.web_test import FakeToolsClient, default_metadata


def _clear(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "N8N_TOOLS_WEBHOOK_URL",
        "N8N_TOOLS_WEBHOOK_SECRET",
        "LIVEKIT_SIP_OUTBOUND_TRUNK_ID",
        "STEPSALES_WEB_TEST",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("STEPSALES_VARIANT", "gemini")


def test_web_test_needs_no_webhook(monkeypatch) -> None:
    _clear(monkeypatch)
    monkeypatch.setenv("STEPSALES_WEB_TEST", "true")
    settings = load_settings()
    assert settings.web_test is True
    assert settings.sip_outbound_trunk_id is None


def test_web_test_with_trunk_refused(monkeypatch) -> None:
    _clear(monkeypatch)
    monkeypatch.setenv("STEPSALES_WEB_TEST", "true")
    monkeypatch.setenv("LIVEKIT_SIP_OUTBOUND_TRUNK_ID", "ST_x")
    with pytest.raises(ConfigError, match="schließen sich aus"):
        load_settings()


def test_web_test_off_by_default_still_requires_webhook(monkeypatch) -> None:
    _clear(monkeypatch)
    with pytest.raises(ConfigError, match="Pflicht"):
        load_settings()


async def test_run_call_refuses_web_test_with_trunk() -> None:
    ctx = FakeCtx(make_metadata())
    settings = dataclasses.replace(make_settings(), web_test=True)  # Trunk ST_TEST gesetzt
    await _run_call(ctx, settings)  # type: ignore[arg-type]
    assert ctx.shutdown_reasons == ["web test with trunk"]
    assert ctx.sip_calls == 0


async def test_run_call_web_test_refuses_non_test_metadata() -> None:
    ctx = FakeCtx(make_metadata(test=False))
    settings = dataclasses.replace(
        make_settings(), web_test=True, test_calls_only=False, sip_outbound_trunk_id=None
    )
    await _run_call(ctx, settings)  # type: ignore[arg-type]
    assert ctx.shutdown_reasons == ["test calls only"]


def test_default_metadata_is_valid_test_call() -> None:
    call = parse_metadata(default_metadata(ROOM), room_name=ROOM)
    assert call.test is True
    assert call.lead.firma.startswith("TEST")


async def test_fake_packages_are_marked_as_test() -> None:
    client = FakeToolsClient(call_id=ROOM)
    data = await client.call("get_packages", {})
    assert data["test_data"] is True
    assert all("TEST" in p["name"] for p in data["packages"])


async def test_fake_offer_enforces_max_discount() -> None:
    client = FakeToolsClient(call_id=ROOM)
    with pytest.raises(ToolRejected) as exc:
        await client.call("create_offer", {"package_id": "TEST_M", "discount_percent": 15})
    assert exc.value.code == "discount_too_high"
    ok = await client.call(
        "create_offer", {"package_id": "TEST_M", "discount_percent": 5, "discount_reason": "x"}
    )
    assert ok["final_price"] == 1415.5


async def test_fake_second_call_requires_topic() -> None:
    client = FakeToolsClient(call_id=ROOM)
    with pytest.raises(ToolRejected) as exc:
        await client.call("schedule_second_call", {"start_iso": "2026-12-01T10:00:00+01:00"})
    assert exc.value.code == "topic_missing"


async def test_fake_tools_log_without_reserved_record_keys(caplog) -> None:
    """Regression: extra={"args": ...} überschreibt LogRecord.args und wirft KeyError."""
    import logging

    caplog.set_level(logging.INFO, logger="stepsales.webtest")
    client = FakeToolsClient(call_id=ROOM)
    for tool, args in [
        ("get_packages", {}),
        ("qualify_lead", {"active_hiring": True}),
        ("send_followup", {"email": "test@example.invalid", "followup_type": "recap"}),
        ("send_payment_link", {"offer_id": "x", "email": "test@example.invalid"}),
        ("log_call_outcome", {"outcome": "no_answer", "summary": "x"}),
    ]:
        await client.call(tool, args)
    assert len(client.calls) == 5
