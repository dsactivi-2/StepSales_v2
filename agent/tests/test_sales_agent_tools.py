"""Deterministische Tests der Tool-Wächter und des Zustands – ohne Modell."""

from __future__ import annotations

import inspect
from typing import Any

import pytest
from livekit.agents.llm import ToolError

from stepsales_agent.main import _report_technical_outcome
from stepsales_agent.n8n_client import ToolRejected, ToolsUnavailable
from stepsales_agent.sales_agent import CallState, SalesAgent


class FakeClient:
    def __init__(self, responses: dict[str, Any] | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.responses = responses or {}

    async def call(self, tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
        self.calls.append((tool, args or {}))
        result = self.responses.get(tool, {})
        if isinstance(result, Exception):
            raise result
        return result

    async def aclose(self) -> None:
        return None


def _agent(client: FakeClient, state: CallState | None = None) -> tuple[SalesAgent, CallState]:
    st = state or CallState()
    return SalesAgent(instructions="x", tools_client=client, state=st), st  # type: ignore[arg-type]


async def test_discount_requires_reason_and_is_not_sent() -> None:
    client = FakeClient()
    agent, _ = _agent(client)
    with pytest.raises(ToolError):
        await agent.create_offer(None, package_id="MULTI_M", discount_percent=10)
    assert client.calls == []


async def test_negative_discount_rejected() -> None:
    client = FakeClient()
    agent, _ = _agent(client)
    with pytest.raises(ToolError):
        await agent.create_offer(None, package_id="MULTI_M", discount_percent=-5)
    assert client.calls == []


async def test_offer_id_tracked_for_payment_link() -> None:
    client = FakeClient({"create_offer": {"offer_id": "OFF-1", "final_price": 1490}})
    agent, state = _agent(client)
    await agent.create_offer(None, package_id="MULTI_M")
    await agent.send_payment_link(None, offer_id="OFF-1", email="a@example.com")
    assert state.offer_ids == ["OFF-1"]
    assert [c[0] for c in client.calls] == ["create_offer", "send_payment_link"]


async def test_payment_link_for_unknown_offer_refused() -> None:
    client = FakeClient()
    agent, _ = _agent(client)
    with pytest.raises(ToolError):
        await agent.send_payment_link(None, offer_id="OFF-INVENTED", email="a@example.com")
    assert client.calls == []


async def test_offer_followup_needs_offer_id() -> None:
    client = FakeClient()
    agent, _ = _agent(client)
    with pytest.raises(ToolError):
        await agent.send_followup(None, email="a@example.com", followup_type="offer")
    assert client.calls == []


async def test_business_rejection_becomes_tool_error() -> None:
    client = FakeClient({"create_offer": ToolRejected("discount_too_high", "max 10 %")})
    agent, state = _agent(client)
    with pytest.raises(ToolError, match="discount_too_high"):
        await agent.create_offer(
            None, package_id="MULTI_M", discount_percent=20, discount_reason="x"
        )
    assert state.offer_ids == []


async def test_backend_down_becomes_honest_tool_error() -> None:
    client = FakeClient({"get_packages": ToolsUnavailable("502")})
    agent, state = _agent(client)
    with pytest.raises(ToolError, match="Nichts wurde gespeichert"):
        await agent.get_packages(None)
    assert state.tool_failures == 1


async def test_outcome_marked_only_after_successful_write() -> None:
    client = FakeClient({"log_call_outcome": ToolsUnavailable("down")})
    agent, state = _agent(client)
    with pytest.raises(ToolError):
        await agent.log_call_outcome(None, outcome="no_interest", summary="kein Bedarf")
    assert state.outcome_logged is False

    client.responses["log_call_outcome"] = {"ok": True}
    await agent.log_call_outcome(None, outcome="no_interest", summary="kein Bedarf")
    assert state.outcome_logged is True and state.outcome == "no_interest"


async def test_qualify_omits_unmentioned_fields() -> None:
    client = FakeClient()
    agent, _ = _agent(client)
    await agent.qualify_lead(None, urgency="high", number_of_roles=3)
    _, args = client.calls[0]
    assert {k: v for k, v in args.items() if v is not None} == {
        "urgency": "high",
        "number_of_roles": 3,
    }


async def test_technical_fallback_only_when_model_did_not_log() -> None:
    client = FakeClient()
    state = CallState(outcome_logged=True, outcome="closed")
    await _report_technical_outcome(client, state, "failed", "x")  # type: ignore[arg-type]
    assert client.calls == []

    state = CallState()
    await _report_technical_outcome(client, state, "voicemail", "Mailbox")  # type: ignore[arg-type]
    tool, args = client.calls[0]
    assert tool == "log_call_outcome"
    assert args["outcome"] == "voicemail" and args["technical"] is True
    assert state.outcome_logged is True


async def test_technical_fallback_swallows_backend_failure() -> None:
    client = FakeClient({"log_call_outcome": ToolsUnavailable("down")})
    state = CallState()
    await _report_technical_outcome(client, state, "failed", "x")  # type: ignore[arg-type]
    assert state.outcome_logged is False


async def test_recap_followup_does_not_need_offer_id() -> None:
    client = FakeClient({"send_followup": {"status": "queued"}})
    agent, _ = _agent(client)
    await agent.send_followup(None, email="a@example.com", followup_type="recap", summary="kurz")
    assert client.calls == [
        (
            "send_followup",
            {
                "email": "a@example.com",
                "followup_type": "recap",
                "offer_id": None,
                "summary": "kurz",
                "agreed_next_contact": None,
            },
        )
    ]


async def test_offer_response_without_id_is_not_tracked() -> None:
    client = FakeClient({"create_offer": {"final_price": 1490}})
    agent, state = _agent(client)
    await agent.create_offer(None, package_id="MULTI_M")
    assert state.offer_ids == []


async def test_schedule_second_call_requires_topic_and_forwards_args() -> None:
    client = FakeClient({"schedule_second_call": {"termin_id": "T-1"}})
    agent, _ = _agent(client)
    params = inspect.signature(SalesAgent.schedule_second_call).parameters
    assert params["topic"].default is inspect.Parameter.empty
    await agent.schedule_second_call(
        None,
        start_iso="2026-12-01T10:30:00+01:00",
        topic="Paket M, GF-Freigabe",
        email="a@example.com",
    )
    tool, args = client.calls[0]
    assert tool == "schedule_second_call"
    assert args["start_iso"] == "2026-12-01T10:30:00+01:00"
    assert args["topic"] == "Paket M, GF-Freigabe"
    assert args["email"] == "a@example.com"


def test_payment_received_is_not_an_agent_tool() -> None:
    assert not hasattr(SalesAgent, "mark_payment_received")
