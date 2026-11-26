"""Regressionstests der n8n-Code-Nodes aus PR #25 (fail-closed, Idempotenz, Validierung)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, get_args

import pytest
from n8n_code import (
    N8N_DIR,
    SRC_DIR,
    config_rows,
    extract_js,
    first_json,
    load_src,
    run_node,
)

from stepsales_agent.config import AGENT_NAMES
from stepsales_agent.sales_agent import Objection, Outcome, SalesAgent

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "airtable" / "schema.json"
TECHNICAL_OUTCOMES = {"no_answer", "voicemail", "failed"}
AGENT_TOOLS = [
    "get_packages",
    "qualify_lead",
    "create_offer",
    "send_followup",
    "schedule_second_call",
    "send_payment_link",
    "log_call_outcome",
]


def _schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _choices(schema: dict, table: str, field: str) -> set[str]:
    for tbl in schema["tables"]:
        if tbl["name"] == table:
            for col in tbl["fields"]:
                if col["name"] == field:
                    return set(col.get("choices") or [])
    raise AssertionError(f"Feld {table}.{field} fehlt in airtable/schema.json")


def _table_id(schema: dict, name: str) -> str:
    for tbl in schema["tables"]:
        if tbl["name"] == name:
            return tbl["id"]
    raise AssertionError(f"Tabelle {name} fehlt")


LEAD = {
    "id": "recTESTLEAD000001",
    "Firma": "TEST Musterbau GmbH",
    "Ansprechpartner": "Anna Test",
    "Status": "new",
    "E-Mail": "anna@example.invalid",
    "Telefon": "+4930123456789",
    "Testdaten": True,
    "Versuche": 1,
    "DNC": False,
}

CALL = {
    "id": "recCALL0000000001",
    "Call-ID": "call-TEST-0001",
    "Lead": ["recTESTLEAD000001"],
    "Start": "2026-11-26T09:00:00.000Z",
}

REQ = {
    "valid": True,
    "tool": "create_offer",
    "call_id": "call-TEST-0001",
    "lead_id": "recTESTLEAD000001",
    "agent": "stepsales-gemini",
    "seq": 2,
    "key": "call-TEST-0001:create_offer:2",
    "args": {},
}

PKG = {
    "id": "recPAKET000000001",
    "Paket-ID": "MULTI_M",
    "Name": "Paket M",
    "Listenpreis netto": 1490,
    "Max Rabatt": 0.1,
    "Aktiv": True,
}


def _offer_nodes(**overrides: Any) -> dict[str, list[dict[str, Any]]]:
    req = dict(REQ)
    req["args"] = dict(overrides.get("args") or {})
    nodes = {
        "Validate request": [req],
        "Load config": config_rows(
            default_max_rabatt_prozent="10",
            angebot_gueltig_tage="7",
            timezone="Europe/Berlin",
        ),
        "Get lead": [dict(LEAD)],
        "Find call": [dict(CALL)],
        "Offer: find existing": [],
        "Offer: find package": [dict(PKG)],
    }
    for key, value in overrides.items():
        if key != "args":
            nodes[key] = value
    nodes["Validate request"] = [req]
    return nodes


@pytest.fixture(scope="session")
def agent_tools_src() -> str:
    return load_src("agent-tools.ts")


@pytest.fixture(scope="session")
def dispatcher_src() -> str:
    return load_src("dispatcher.ts")


@pytest.fixture(scope="session")
def mail_src() -> str:
    return load_src("mail-senden.ts")


@pytest.fixture(scope="session")
def reconcile_src() -> str:
    return load_src("ergebnisabgleich.ts")


def test_workflow_table_ids_match_airtable_schema(
    agent_tools_src: str, dispatcher_src: str
) -> None:
    schema = _schema()
    expected = {
        "T_LEADS": _table_id(schema, "Leads"),
        "T_PAKETE": _table_id(schema, "Pakete"),
        "T_ANRUFE": _table_id(schema, "Anrufe"),
        "T_ANGEBOTE": _table_id(schema, "Angebote"),
        "T_TERMINE": _table_id(schema, "Termine"),
        "T_CONFIG": _table_id(schema, "Config"),
    }
    for src in (agent_tools_src, dispatcher_src):
        base = re.search(r"value: '(app[A-Za-z0-9]+)'", src)
        assert base and base.group(1) == schema["baseId"]
        for const, table_id in expected.items():
            if f"const {const} " not in src:
                continue
            found = re.search(rf"const {const} = \{{[^}}]*value: '([^']+)'", src)
            assert found, const
            assert found.group(1) == table_id, const


def test_agent_tool_names_match_n8n_router(agent_tools_src: str) -> None:
    tools = re.search(
        r"const TOOLS = \[([^\]]+)\]",
        extract_js(agent_tools_src, "Validate request"),
    )
    assert tools
    listed = [t.strip().strip("'") for t in tools.group(1).split(",")]
    assert listed == AGENT_TOOLS
    methods = [name for name in AGENT_TOOLS]
    for name in methods:
        assert hasattr(SalesAgent, name)
    assert not hasattr(SalesAgent, "mark_payment_received")


def test_validate_request_rejects_bad_contract(agent_tools_src: str) -> None:
    code = extract_js(agent_tools_src, "Validate request")

    def body(**overrides: Any) -> dict[str, Any]:
        data = {
            "tool": "get_packages",
            "call_id": "call-TEST-0001",
            "lead_id": "recTESTLEAD000001",
            "agent": "stepsales-gemini",
            "seq": 1,
            "args": {},
        }
        data.update(overrides)
        return {
            "headers": {"idempotency-key": f"{data['call_id']}:{data['tool']}:{data['seq']}"},
            "body": data,
        }

    ok = first_json(run_node(code, input_json=body()))
    assert ok["valid"] is True
    assert ok["key"] == "call-TEST-0001:get_packages:1"

    bad_tool = first_json(run_node(code, input_json=body(tool="delete_lead")))
    assert bad_tool["valid"] is False
    assert bad_tool["response"]["error"]["code"] == "bad_request"

    bad_lead = first_json(run_node(code, input_json=body(lead_id="lead-1")))
    assert bad_lead["valid"] is False

    mismatched = first_json(
        run_node(
            code,
            input_json={
                "headers": {"idempotency-key": "other:get_packages:1"},
                "body": body()["body"],
            },
        )
    )
    assert mismatched["valid"] is False

    seq_zero = first_json(run_node(code, input_json=body(seq=0)))
    assert seq_zero["valid"] is False

    args_list = first_json(run_node(code, input_json=body(args=["x"])))
    assert args_list["valid"] is False


def test_gate_kill_switch_and_missing_livekit_key(dispatcher_src: str) -> None:
    code = extract_js(dispatcher_src, "Gate")
    placeholders: list[dict[str, Any]] = []

    def gate(**cfg: str) -> Any:
        values = {
            "dial_enabled": "true",
            "timezone": "Europe/Berlin",
            "call_days": "1,2,3,4,5",
            "call_window_start": "09:00",
            "call_window_end": "17:00",
            "livekit_api_key": "APItestkey01",
            "test_mode": "true",
            "anzeigenummer": "STEP-1",
        }
        values.update(cfg)
        return run_node(
            code,
            nodes={"Load config": config_rows(**values), "Find placeholder packages": placeholders},
        )

    assert gate(dial_enabled="false") == []
    assert gate(sperrtage="2026-11-26") == []
    assert gate(call_window_start="12:00", call_window_end="17:00") == []
    with pytest.raises(RuntimeError, match="livekit_api_key"):
        gate(livekit_api_key="")
    opened = first_json(gate())
    assert opened["test_only"] is True
    assert opened["livekit_http_url"] == "https://stepsalesv2-walghbs5.livekit.cloud"


def test_select_calls_skips_invalid_phone_and_prefers_second_call(dispatcher_src: str) -> None:
    code = extract_js(dispatcher_src, "Select calls")
    result = run_node(
        code,
        nodes={
            "Gate": [{"max_parallel": 2, "max_call_seconds": 600, "ab_split": 50}],
            "Find active calls": [],
            "Find due appointments": [
                {
                    "id": "recTERMIN00000001",
                    "Lead": ["recTESTLEAD000001"],
                    "Kontext für Agent": "Paket M, GF-Freigabe",
                    "Erstgespräch": ["recCALL0000000001"],
                }
            ],
            "Find eligible leads": [
                {
                    "id": "recBADPHONE000001",
                    "Telefon": "030 123",
                    "Status": "new",
                    "Agent": "stepsales-gemini",
                    "Versuche": 0,
                },
                {
                    "id": "recTESTLEAD000001",
                    "Telefon": "+4930123456789",
                    "Status": "qualified",
                    "Agent": "stepsales-gemini",
                    "Versuche": 1,
                },
                {
                    "id": "recFRESHLEAD00001",
                    "Telefon": "+4930987654321",
                    "Status": "new",
                    "Agent": "stepsales-gptlive",
                    "Versuche": 0,
                    "Anzeigen-Datum": "2026-11-25",
                },
            ],
        },
    )
    picked = [item["json"] for item in result]
    assert [p["lead_id"] for p in picked] == ["recTESTLEAD000001", "recFRESHLEAD00001"]
    assert picked[0]["call_type"] == "zweittermin"
    assert picked[0]["termin_kontext"] == "Paket M, GF-Freigabe"
    assert picked[1]["call_type"] == "erstgespraech"
    assert picked[0]["agent"] == "stepsales-gemini"


def test_build_dispatch_fails_closed_without_second_call_context(dispatcher_src: str) -> None:
    code = extract_js(dispatcher_src, "Build dispatch")
    sel = {
        "lead_id": "recTESTLEAD000001",
        "phone": "+4930123456789",
        "room": "call-TESTLEAD000001-abc",
        "agent": "stepsales-gemini",
        "call_type": "zweittermin",
        "termin_kontext": "",
        "first_call_id": "",
    }
    with pytest.raises(RuntimeError, match="ohne Thema"):
        run_node(
            code,
            nodes={
                "Select calls": [sel],
                "Find first calls": [],
                "Reservation confirmed?": [dict(LEAD)],
            },
        )
    sel["termin_kontext"] = "Paket M"
    out = first_json(
        run_node(
            code,
            nodes={
                "Select calls": [sel],
                "Find first calls": [],
                "Reservation confirmed?": [dict(LEAD)],
            },
        )
    )
    meta = json.loads(out["_metadata"])
    assert meta["previous_summary"] == "Thema: Paket M"
    assert meta["call_type"] == "zweittermin"
    assert meta["test"] is True


def test_offer_enforces_max_discount_and_computes_price(agent_tools_src: str) -> None:
    code = extract_js(agent_tools_src, "Offer: calculate")
    too_high = first_json(
        run_node(code, nodes=_offer_nodes(args={"package_id": "MULTI_M", "discount_percent": 15}))
    )
    assert too_high["_action"] == "reject"
    assert too_high["_response"]["error"]["code"] == "discount_too_high"

    ok = first_json(
        run_node(
            code,
            nodes=_offer_nodes(
                args={
                    "package_id": "MULTI_M",
                    "discount_percent": 5,
                    "discount_reason": "Entscheidung diese Woche",
                }
            ),
        )
    )
    assert ok["_action"] == "create"
    assert ok["_response"]["data"]["final_price"] == 1415.5
    assert ok["_response"]["data"]["offer_id"] == "call-TEST-0001:create_offer:2"
    assert ok["_lead"]["Status"] == "proposal_pending"

    no_reason = first_json(
        run_node(code, nodes=_offer_nodes(args={"package_id": "MULTI_M", "discount_percent": 5}))
    )
    assert no_reason["_response"]["error"]["code"] == "discount_reason_missing"


def test_second_call_requires_topic_and_stays_in_call_window(agent_tools_src: str) -> None:
    code = extract_js(agent_tools_src, "Appointment: check slot")

    def nodes(args: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        req = dict(REQ)
        req.update(
            tool="schedule_second_call",
            seq=4,
            key="call-TEST-0001:schedule_second_call:4",
            args=args,
        )
        return {
            "Validate request": [req],
            "Load config": config_rows(
                timezone="Europe/Berlin",
                call_days="1,2,3,4,5",
                call_window_start="09:00",
                call_window_end="17:00",
                termin_dauer_min="20",
                kalender_dienst="none",
            ),
            "Get lead": [dict(LEAD)],
            "Find call": [dict(CALL)],
            "Appointment: find existing": [],
        }

    missing = first_json(run_node(code, nodes=nodes({"start_iso": "2026-11-27T10:30:00+01:00"})))
    assert missing["_response"]["error"]["code"] == "topic_missing"

    late = first_json(
        run_node(
            code,
            nodes=nodes({"start_iso": "2026-11-27T16:50:00+01:00", "topic": "Paket M"}),
        )
    )
    assert late["_response"]["error"]["code"] == "outside_call_hours"

    ok = first_json(
        run_node(
            code,
            nodes=nodes(
                {"start_iso": "2026-11-27T10:30:00+01:00", "topic": "Paket M, GF-Freigabe"}
            ),
        )
    )
    assert ok["_action"] == "create"
    assert ok["topic"] == "Paket M, GF-Freigabe"


def test_payment_link_stays_disabled(agent_tools_src: str) -> None:
    code = extract_js(agent_tools_src, "Payment link: not enabled")
    data = first_json(run_node(code))
    assert data["ok"] is False
    assert data["error"]["code"] == "payment_not_enabled"


def test_qualify_does_not_downgrade_and_ignores_current_channels(agent_tools_src: str) -> None:
    code = extract_js(agent_tools_src, "Qualify: compute")
    req = dict(REQ)
    req.update(
        tool="qualify_lead",
        seq=1,
        key="call-TEST-0001:qualify_lead:1",
        args={
            "active_hiring": True,
            "urgency": "high",
            "interest_level": "high",
            "number_of_roles": 2,
            "current_channels": "Indeed",
        },
    )
    lead = dict(LEAD)
    lead["Status"] = "qualified"
    out = first_json(
        run_node(
            code,
            nodes={
                "Validate request": [req],
                "Load config": config_rows(),
                "Get lead": [lead],
            },
        )
    )
    assert out["_response"]["data"]["score"] == 95
    assert out["_response"]["data"]["status"] == "qualified"
    assert "Status" not in out
    assert out["_response"]["data"]["ignored"] == ["current_channels"]


def test_dnc_outcome_locks_lead(agent_tools_src: str) -> None:
    code = extract_js(agent_tools_src, "Outcome: decide")
    req = dict(REQ)
    req.update(
        tool="log_call_outcome",
        seq=5,
        key="call-TEST-0001:log_call_outcome:5",
        args={"outcome": "dnc_requested", "summary": "nicht mehr anrufen", "technical": False},
    )
    out = first_json(
        run_node(
            code,
            nodes={
                "Validate request": [req],
                "Load config": config_rows(
                    timezone="Europe/Berlin", retry_hours="24", max_attempts="3"
                ),
                "Get lead": [dict(LEAD)],
                "Find call": [dict(CALL)],
            },
        )
    )
    assert out["_lead"]["DNC"] is True
    assert out["_lead"]["Wählbar"] is False
    assert out["_lead"]["Status"] == "dnc"
    already = dict(CALL)
    already["Ergebnis"] = "no_interest"
    dup = first_json(
        run_node(
            code,
            nodes={
                "Validate request": [req],
                "Load config": config_rows(),
                "Get lead": [dict(LEAD)],
                "Find call": [already],
            },
        )
    )
    assert dup["_response"]["data"]["already_logged"] is True


def test_mail_blocks_missing_signature_and_duplicate_planned(mail_src: str) -> None:
    code = extract_js(mail_src, "Render mail")
    start = {
        "zweck": "offer",
        "lead_id": "recTESTLEAD000001",
        "empfaenger": "anna@example.invalid",
        "fu_id": "call-TEST-0001:send_followup:3",
        "angebot_id": "recOFFER000000001",
        "vars": {
            "paket": "Paket M",
            "leistungen": "Portale",
            "endpreis": "1.415,50 €",
            "gueltig_bis": "03.12.2026",
        },
    }
    template = {
        "id": "recTPL00000000001",
        "Betreff": "Angebot für {{firma}}",
        "Text": "Preis {{endpreis}}\n{{signatur}}",
        "Aktiv": True,
    }
    missing = first_json(
        run_node(
            code,
            nodes={
                "Start": [start],
                "Load config": config_rows(
                    test_mode="true",
                    mail_dienst="gmail",
                    absender_name="Lena Berger",
                    mail_signatur="",
                ),
                "Find template": [template],
                "Find existing follow-up": [],
                "Get lead": [dict(LEAD)],
            },
        )
    )
    assert missing["_action"] == "block"
    assert missing["_response"]["error"]["code"] == "placeholder_missing"

    sending = first_json(
        run_node(
            code,
            nodes={
                "Start": [start],
                "Load config": config_rows(
                    test_mode="true", mail_dienst="gmail", mail_signatur="Lena"
                ),
                "Find template": [template],
                "Find existing follow-up": [
                    {
                        "id": "recFU000000000001",
                        "FU-ID": start["fu_id"],
                        "Status": "planned",
                        "Geplant für": "2026-11-26T09:58:00.000+01:00",
                    }
                ],
                "Get lead": [dict(LEAD)],
            },
        )
    )
    assert sending["_action"] == "done"
    assert sending["_response"]["data"]["status"] == "sending"


def test_missed_second_call_done_if_held_else_rescheduled(reconcile_src: str) -> None:
    code = extract_js(reconcile_src, "Build missed updates")
    appt = {
        "id": "recTERMIN00000001",
        "Start": "2026-11-26T08:00:00.000Z",
        "Lead": ["recTESTLEAD000001"],
    }
    missed = first_json(
        run_node(
            code,
            nodes={"Find missed appointments": [appt], "Find second calls": []},
        )
    )
    assert missed["Status"] == "rescheduled"
    held = first_json(
        run_node(
            code,
            nodes={
                "Find missed appointments": [appt],
                "Find second calls": [
                    {
                        "id": "recCALL0000000002",
                        "Lead": ["recTESTLEAD000001"],
                        "Start": "2026-11-26T07:50:00.000Z",
                        "Ergebnis": "offer_promised",
                    }
                ],
            },
        )
    )
    assert held["Status"] == "done"


def test_agent_literals_are_valid_airtable_choices() -> None:
    schema = _schema()
    allowed_outcomes = _choices(schema, "Anrufe", "Ergebnis")
    missing = (set(get_args(Outcome)) | TECHNICAL_OUTCOMES) - allowed_outcomes
    assert not missing, sorted(missing)
    extra_obj = set(get_args(Objection)) - _choices(schema, "Leads", "Einwand-Typ") - {"none"}
    assert not extra_obj, sorted(extra_obj)
    names = set(AGENT_NAMES.values())
    assert names == _choices(schema, "Leads", "Agent")
    assert names == _choices(schema, "Anrufe", "Agent")


def test_luxon_is_a_test_only_dependency() -> None:
    pkg = json.loads((N8N_DIR / "package.json").read_text(encoding="utf-8"))
    assert "dependencies" not in pkg or not pkg["dependencies"]
    assert "luxon" in pkg["devDependencies"]
    assert SRC_DIR.exists()
