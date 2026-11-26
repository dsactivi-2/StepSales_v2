"""Browser-Testmodus (``STEPSALES_WEB_TEST=true``): Gespräch ohne SIP und ohne n8n.

Zweck: Stimme, Pausen, Unterbrechungen und Gesprächsführung beider Modelle per Mikrofon
prüfen, bevor Telefonie und n8n-Credentials stehen (Issue #26).

Alle Daten hier sind FIKTIV und klar als TEST gekennzeichnet. Sie sind keine echten
Paketinhalte oder Preise (die kommen in Produktion nur aus Airtable ``Pakete``).
Kein Aufruf verlässt den Prozess: kein n8n, kein Airtable, keine Mail, kein Zahlungslink.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .n8n_client import ToolRejected

logger = logging.getLogger("stepsales.webtest")

TEST_PACKAGES: list[dict[str, Any]] = [
    {
        "package_id": "TEST_S",
        "name": "TEST-Paket S (fiktiv)",
        "leistungen": "Anzeige zusätzlich auf zwei Portalen (Testdaten)",
        "laufzeit_tage": 30,
        "listenpreis_eur_netto": 790,
        "max_rabatt_prozent": 10,
        "empfehlen_wenn": "eine Stelle, wenig Zeitdruck",
    },
    {
        "package_id": "TEST_M",
        "name": "TEST-Paket M (fiktiv)",
        "leistungen": "Anzeige zusätzlich auf fünf Portalen (Testdaten)",
        "laufzeit_tage": 30,
        "listenpreis_eur_netto": 1490,
        "max_rabatt_prozent": 10,
        "empfehlen_wenn": "mehrere Stellen oder hohe Dringlichkeit",
    },
]


def default_metadata(room_name: str) -> str:
    """Fiktiver Lead, wenn das Browser-Token keine Job-Metadaten mitbringt."""
    return json.dumps(
        {
            "lead_id": "recWEBTEST00001",
            # wird im Web-Test nie gewählt; nur für die Metadaten-Prüfung (E.164)
            "phone_number": "+4930000000000",
            "call_id": room_name,
            "call_type": "erstgespraech",
            "lead": {
                "firma": "TEST Musterbau GmbH",
                "ansprechpartner": "Herr Test",
                "rolle": "HR-Leitung",
                "anzeigen_titel": "Bauleiter (m/w/d)",
                "quelle_portal": "TEST-Portal",
            },
            "test": True,
        }
    )


class FakeToolsClient:
    """Gleiche Schnittstelle wie ToolsClient, antwortet lokal mit Testdaten.

    Bildet die fachlichen Ablehnungen nach, die n8n liefert (Rabatt über Maximum,
    fehlendes Thema beim Zweittermin), damit das Gesprächsverhalten realistisch bleibt.
    """

    def __init__(self, *, call_id: str, timezone: str = "Europe/Berlin") -> None:
        self._call_id = call_id
        self._tz = ZoneInfo(timezone)
        self._seq = 0
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def aclose(self) -> None:
        return None

    async def call(self, tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
        self._seq += 1
        clean = {k: v for k, v in (args or {}).items() if v is not None}
        self.calls.append((tool, clean))
        logger.info("web-test tool", extra={"tool": tool, "tool_args": clean})
        handler = getattr(self, f"_{tool}", None)
        if handler is None:
            raise ToolRejected("unknown_tool", f"Tool {tool} unbekannt")
        return handler(clean)

    def _get_packages(self, _args: dict[str, Any]) -> dict[str, Any]:
        return {"packages": TEST_PACKAGES, "test_data": True}

    def _qualify_lead(self, _args: dict[str, Any]) -> dict[str, Any]:
        return {"lead_id": "recWEBTEST00001", "score": 70, "status": "qualified"}

    def _create_offer(self, args: dict[str, Any]) -> dict[str, Any]:
        pkg = next((p for p in TEST_PACKAGES if p["package_id"] == args.get("package_id")), None)
        if pkg is None:
            raise ToolRejected("unknown_package", "Paket-ID unbekannt")
        discount = float(args.get("discount_percent") or 0)
        if discount > pkg["max_rabatt_prozent"]:
            raise ToolRejected(
                "discount_too_high", f"Maximal {pkg['max_rabatt_prozent']} % Rabatt möglich"
            )
        final = round(pkg["listenpreis_eur_netto"] * (1 - discount / 100), 2)
        valid = (datetime.now(self._tz) + timedelta(days=7)).date().isoformat()
        return {
            "offer_id": f"{self._call_id}:create_offer:{self._seq}",
            "final_price": final,
            "currency": "EUR",
            "valid_until": valid,
            "test_data": True,
        }

    def _send_followup(self, _args: dict[str, Any]) -> dict[str, Any]:
        return {"status": "sent", "test_data": True, "note": "Web-Test: keine Mail versendet"}

    def _schedule_second_call(self, args: dict[str, Any]) -> dict[str, Any]:
        if not args.get("topic"):
            raise ToolRejected("topic_missing", "topic ist Pflicht")
        return {"termin_id": f"{self._call_id}:schedule_second_call:{self._seq}", "test_data": True}

    def _send_payment_link(self, _args: dict[str, Any]) -> dict[str, Any]:
        return {"status": "sent", "test_data": True, "note": "Web-Test: kein Zahlungslink"}

    def _log_call_outcome(self, _args: dict[str, Any]) -> dict[str, Any]:
        return {"stored": True, "test_data": True}
