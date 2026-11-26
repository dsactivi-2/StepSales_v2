"""Auflegen nach gespeichertem Ergebnis, wenn das Modell end_call nicht auslöst (#28)."""

from __future__ import annotations

from stepsales_agent.auto_hangup import AutoHangup
from stepsales_agent.sales_agent import CallState


class Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


def _make(quiet: float = 5.0) -> tuple[AutoHangup, CallState, Clock, list[str]]:
    clock, calls, state = Clock(), [], CallState()
    hang = AutoHangup(state, lambda: calls.append("hangup"), quiet_s=quiet, clock=clock)
    return hang, state, clock, calls


def test_no_hangup_without_saved_outcome() -> None:
    hang, _state, clock, calls = _make()
    clock.t = 100
    assert not hang.check() and calls == []


def test_hangup_after_quiet_period_following_outcome() -> None:
    hang, state, clock, calls = _make()
    hang.on_agent_state("speaking")
    clock.t = 2
    hang.on_agent_state("listening")  # Verabschiedung fertig
    state.outcome_logged = True
    clock.t = 3
    assert not hang.check()  # Ruhezeit beginnt erst mit dem Ergebnis
    clock.t = 7.9
    assert not hang.check()
    clock.t = 8.1
    assert hang.check() and calls == ["hangup"]
    assert not hang.check() and calls == ["hangup"]  # nur einmal


def test_user_speaking_again_restarts_quiet_period() -> None:
    hang, state, clock, calls = _make()
    state.outcome_logged = True
    hang.check()
    clock.t = 4
    hang.on_user_state("speaking")
    clock.t = 10
    assert not hang.check()  # spricht noch
    hang.on_user_state("listening")
    clock.t = 14
    assert not hang.check()
    clock.t = 15.1
    assert hang.check() and calls == ["hangup"]


def test_no_hangup_while_agent_still_speaking_goodbye() -> None:
    hang, state, clock, calls = _make()
    state.outcome_logged = True
    hang.check()
    hang.on_agent_state("speaking")
    clock.t = 60
    assert not hang.check() and calls == []
