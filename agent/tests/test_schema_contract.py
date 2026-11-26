"""Agent-Literale und Airtable-Schema müssen zusammenpassen – sonst schreibt n8n ins Leere."""

from __future__ import annotations

import json
from pathlib import Path
from typing import get_args

from stepsales_agent.config import AGENT_NAMES
from stepsales_agent.sales_agent import Objection, Outcome

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "airtable" / "schema.json"
TECHNICAL_OUTCOMES = {"no_answer", "voicemail", "failed"}


def _schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _choices(schema: dict, table: str, field: str) -> set[str]:
    for tbl in schema["tables"]:
        if tbl["name"] == table:
            for col in tbl["fields"]:
                if col["name"] == field:
                    return set(col.get("choices") or [])
    raise AssertionError(f"Feld {table}.{field} fehlt in airtable/schema.json")


def test_agent_outcomes_are_valid_anruf_ergebnisse() -> None:
    allowed = _choices(_schema(), "Anrufe", "Ergebnis")
    model_outcomes = set(get_args(Outcome))
    missing = (model_outcomes | TECHNICAL_OUTCOMES) - allowed
    assert not missing, f"Ergebnisse ohne Airtable-Wert: {sorted(missing)}"


def test_objections_match_lead_einwand_typ() -> None:
    allowed = _choices(_schema(), "Leads", "Einwand-Typ")
    extra = set(get_args(Objection)) - allowed - {"none"}
    assert not extra, f"Einwände ohne Airtable-Wert: {sorted(extra)}"


def test_agent_names_match_lead_agent_choices() -> None:
    allowed = _choices(_schema(), "Leads", "Agent")
    names = set(AGENT_NAMES.values())
    assert names == allowed
    assert names == _choices(_schema(), "Anrufe", "Agent")
