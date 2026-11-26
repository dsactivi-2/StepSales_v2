"""DNC-Sicherung: Sperrwunsch aus der Rede der Person geht nie verloren (#28)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from stepsales_agent.dnc_guard import detects_dnc
from stepsales_agent.main import fallback_outcome, on_conversation_item


@pytest.mark.parametrize(
    "text",
    [
        "Ich habe kein Interesse. Bitte rufen Sie mich nicht mehr an.",
        "rufen Sie uns nie wieder an",
        "Ich möchte nicht mehr angerufen werden",
        "Bitte nicht wieder anrufen!",
        "Keine weiteren Anrufe, danke.",
        "Nehmen Sie mich von Ihrer Liste.",
        "Löschen Sie bitte meine Nummer.",
        "Meine Nummer bitte löschen.",
        "Entfernen Sie uns bitte aus dem Verteiler.",
        "Streichen Sie meine Telefonnummer.",
    ],
)
def test_detects_clear_dnc_requests(text: str) -> None:
    assert detects_dnc(text)


@pytest.mark.parametrize(
    "text",
    [
        "Ich habe kein Interesse.",
        "Rufen Sie mich am Donnerstag an.",
        "Können Sie mich nächste Woche nochmal anrufen?",
        "Das ist gerade schlecht, rufen Sie später an.",
        "Schicken Sie mir bitte die Unterlagen.",
        "Löschen Sie meine alte Anzeige, die ist erledigt.",
        None,
        "",
    ],
)
def test_ignores_non_dnc(text: str | None) -> None:
    assert not detects_dnc(text)


def _item(role: str, text: str) -> SimpleNamespace:
    return SimpleNamespace(role=role, text_content=text)


def test_user_dnc_turns_fallback_into_dnc() -> None:
    technical = {"outcome": "failed", "reason": "x"}
    on_conversation_item(_item("user", "Bitte rufen Sie mich nicht mehr an"), technical)
    technical.update(outcome="failed", reason="Zeitlimit")  # späteres Update darf es nicht kippen
    assert fallback_outcome(technical)[0] == "dnc_requested"


def test_agent_speech_never_triggers_dnc() -> None:
    technical = {"outcome": "failed", "reason": "x"}
    on_conversation_item(_item("assistant", "Wir rufen Sie nicht mehr an."), technical)
    assert fallback_outcome(technical) == ("failed", "x")
