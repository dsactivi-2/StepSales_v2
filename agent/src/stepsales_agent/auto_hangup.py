"""Auflegen nach gespeichertem Ergebnis, wenn das Modell ``end_call`` nicht auslöst (#28).

Sprach-Simulation: GPT-Live verabschiedet sich, delegiert ``end_call`` aber oft nicht. Ohne
Auflegen hinge die Leitung bis zum Zeitlimit offen. Regel: Ist ``log_call_outcome`` gespeichert
und war danach ``quiet_s`` Sekunden niemand am Sprechen, legt der Code auf. Spricht die Person
noch einmal, startet die Ruhezeit neu; das Gespräch kann also normal weitergehen.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable

from .sales_agent import CallState

logger = logging.getLogger("stepsales.hangup")

DEFAULT_QUIET_S = 5.0


class AutoHangup:
    def __init__(
        self,
        state: CallState,
        on_hangup: Callable[[], None],
        *,
        quiet_s: float = DEFAULT_QUIET_S,
        tick_s: float = 0.5,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._state = state
        self._on_hangup = on_hangup
        self._quiet_s = quiet_s
        self._tick_s = tick_s
        self._clock = clock
        self._agent_speaking = False
        self._user_speaking = False
        self._last_activity = clock()
        self._outcome_seen_at: float | None = None
        self._task: asyncio.Task[None] | None = None
        self.fired = False

    def on_agent_state(self, new_state: str) -> None:
        self._agent_speaking = new_state in ("speaking", "thinking")
        self._last_activity = self._clock()

    def on_user_state(self, new_state: str) -> None:
        self._user_speaking = new_state == "speaking"
        self._last_activity = self._clock()

    def check(self) -> bool:
        """Ein Prüfschritt; True, wenn aufgelegt wurde."""
        if self.fired or not self._state.outcome_logged:
            return False
        now = self._clock()
        if self._outcome_seen_at is None:
            self._outcome_seen_at = now
        if self._agent_speaking or self._user_speaking:
            return False
        quiet_since = max(self._last_activity, self._outcome_seen_at)
        if now - quiet_since < self._quiet_s:
            return False
        self.fired = True
        logger.info("auto hangup after saved outcome", extra={"outcome": self._state.outcome})
        self._on_hangup()
        return True

    def start(self) -> None:
        async def _loop() -> None:
            while not self.check():  # noqa: ASYNC110 - zeitbasierte Prüfung, kein Ereignis
                await asyncio.sleep(self._tick_s)

        self._task = asyncio.create_task(_loop())

    def cancel(self) -> None:
        if self._task is not None:
            self._task.cancel()
