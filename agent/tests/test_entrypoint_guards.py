"""Fail-closed-Wächter vor dem Wählen: ohne gültigen Auftrag wird nie ein SIP-Anruf erzeugt."""

from __future__ import annotations

import dataclasses
from types import SimpleNamespace

import pytest
from conftest import ROOM, make_metadata, make_settings

from stepsales_agent.main import _run_call


class FakeCtx:
    def __init__(self, metadata: str | None) -> None:
        self.room = SimpleNamespace(name=ROOM, remote_participants={})
        self.job = SimpleNamespace(metadata=metadata)
        self.log_context_fields: dict[str, str] = {}
        self.shutdown_reasons: list[str] = []
        self.sip_calls = 0
        self.api = SimpleNamespace(sip=SimpleNamespace(create_sip_participant=self._dial))

    async def _dial(self, *args: object, **kwargs: object) -> None:  # pragma: no cover
        self.sip_calls += 1

    def shutdown(self, reason: str = "") -> None:
        self.shutdown_reasons.append(reason)

    def add_shutdown_callback(self, cb: object) -> None:  # pragma: no cover
        raise AssertionError("darf vor den Wächtern nicht registriert werden")


async def test_invalid_metadata_shuts_down_without_dialing() -> None:
    ctx = FakeCtx("{kaputt")
    await _run_call(ctx, make_settings())  # type: ignore[arg-type]
    assert ctx.shutdown_reasons == ["invalid metadata"]
    assert ctx.sip_calls == 0


async def test_non_test_call_refused_while_test_only() -> None:
    ctx = FakeCtx(make_metadata(test=False))
    await _run_call(ctx, make_settings())  # type: ignore[arg-type]
    assert ctx.shutdown_reasons == ["test calls only"]
    assert ctx.sip_calls == 0


async def test_missing_trunk_refused() -> None:
    ctx = FakeCtx(make_metadata())
    settings = dataclasses.replace(make_settings(), sip_outbound_trunk_id=None)
    await _run_call(ctx, settings)  # type: ignore[arg-type]
    assert ctx.shutdown_reasons == ["missing trunk"]
    assert ctx.sip_calls == 0


@pytest.mark.parametrize(
    ("code", "expected"),
    [("486", "no_answer"), ("603", "no_answer"), ("480", "no_answer"), ("500", "failed")],
)
def test_busy_and_rejected_are_not_technical_failures(code: str, expected: str) -> None:
    from livekit import api

    from stepsales_agent.main import _technical_from_sip

    exc = api.SipCallError(
        "unavailable",
        "sip error",
        status=503,
        metadata={"sip_status_code": code, "sip_status": "X"},
    )
    outcome, reason = _technical_from_sip(exc)
    assert outcome == expected
    assert code in reason


def test_entrypoint_is_picklable_for_job_processes(monkeypatch) -> None:
    """LiveKit startet Jobs per forkserver: der Entrypoint muss per Name importierbar sein."""
    import pickle

    from stepsales_agent.config import load_settings
    from stepsales_agent.main import build_server

    monkeypatch.setenv("STEPSALES_VARIANT", "gemini")
    monkeypatch.setenv("STEPSALES_WEB_TEST", "true")
    monkeypatch.delenv("LIVEKIT_SIP_OUTBOUND_TRUNK_ID", raising=False)
    server = build_server(load_settings())
    pickle.dumps(server._entrypoint_fnc)
