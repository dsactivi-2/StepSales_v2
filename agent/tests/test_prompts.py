from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from conftest import ROOM, make_metadata, make_settings

from stepsales_agent.call_context import parse_metadata
from stepsales_agent.prompts import (
    backend_instructions,
    combined_instructions,
    voice_instructions,
)

TOOL_NAMES = [
    "get_packages",
    "qualify_lead",
    "create_offer",
    "send_followup",
    "schedule_second_call",
    "send_payment_link",
    "log_call_outcome",
    "end_call",
]
NOW = datetime(2026, 11, 25, 10, 0, tzinfo=ZoneInfo("Europe/Berlin"))


@pytest.mark.parametrize("call_type", ["erstgespraech", "zweittermin", "rueckruf"])
def test_every_opening_requires_ai_disclosure(call_type: str) -> None:
    ctx = parse_metadata(
        make_metadata(call_type=call_type, previous_summary="Interesse an M"), room_name=ROOM
    )
    text = voice_instructions(ctx, make_settings(), NOW)
    assert "KI-Assistentin" in text
    assert "Lena Berger" in text and "StepSales" in text


def test_voice_prompt_does_not_name_tools(call_ctx) -> None:
    # GPT-Live: das Sprachmodell sieht keine Tools (LiveKit-Doku); Namen verwirren nur
    text = voice_instructions(call_ctx, make_settings(), NOW)
    assert not [name for name in TOOL_NAMES if name in text]


def test_backend_prompt_covers_every_tool() -> None:
    text = backend_instructions(make_settings())
    assert all(name in text for name in TOOL_NAMES)


def test_no_hardcoded_prices_or_package_contents(call_ctx) -> None:
    # Pakete/Preise kommen nur aus Airtable (ADR-0009)
    text = combined_instructions(call_ctx, make_settings(), NOW)
    assert not re.search(r"\b\d{3,4}\s*(€|Euro)", text)
    assert "MULTI_" not in text
    # auch ausgeschriebene Beträge (gesprochene Form) dürfen nicht im Prompt stehen
    assert not re.search(r"(hundert|tausend)\w*\s+Euro", text, re.IGNORECASE)


def test_lead_context_and_date_included(call_ctx) -> None:
    text = voice_instructions(call_ctx, make_settings(), NOW)
    assert "TEST Musterbau GmbH" in text
    assert "Bauleiter (m/w/d)" in text
    assert "Mittwoch, 25.11.2026, 10:00 Uhr" in text


def test_second_call_carries_previous_summary() -> None:
    ctx = parse_metadata(
        make_metadata(call_type="zweittermin", previous_summary="Will Paket M, Freigabe GF"),
        room_name=ROOM,
    )
    text = voice_instructions(ctx, make_settings(), NOW)
    assert "Will Paket M, Freigabe GF" in text
    assert "Zweittermin" in text


def test_discount_rules_present(call_ctx) -> None:
    text = voice_instructions(call_ctx, make_settings(), NOW)
    assert "nie zu Beginn" in text
    assert "Listenpreis" in text


def test_dnc_rule_in_backend() -> None:
    assert "dnc_requested" in backend_instructions(make_settings())


def test_opening_without_job_title_still_discloses_ai() -> None:
    ctx = parse_metadata(make_metadata(lead={"firma": "TEST Musterbau GmbH"}), room_name=ROOM)
    text = voice_instructions(ctx, make_settings(), NOW)
    assert "sage in einem kurzen Halbsatz, dass du eine KI-Assistentin bist" in text
    assert "eine aktuelle Stellenanzeige der Firma" in text


def test_callback_opening_names_rueckruf() -> None:
    ctx = parse_metadata(make_metadata(call_type="rueckruf"), room_name=ROOM)
    text = voice_instructions(ctx, make_settings(), NOW)
    assert "Rückruf" in text
    assert "KI-Assistentin" in text


def test_backend_requires_topic_for_second_call() -> None:
    text = backend_instructions(make_settings())
    assert "topic immer angeben" in text
