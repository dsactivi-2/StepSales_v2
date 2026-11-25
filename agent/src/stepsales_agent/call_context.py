"""Vertrag zwischen n8n-Dispatcher und Agent: die Job-Metadaten eines Anrufs.

n8n erzeugt den LiveKit-Dispatch (Raumname = call_id) und legt die Lead-Daten als JSON in
``metadata``. Der Agent liest Airtable nicht selbst – das spart Latenz vor dem Gespräch und
hält Schreibrechte in n8n (ADR-0004/0005).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Literal

CallType = Literal["erstgespraech", "zweittermin", "rueckruf"]
_E164 = re.compile(r"^\+[1-9]\d{6,14}$")


class MetadataError(ValueError):
    """Dispatch-Metadaten sind unvollständig oder ungültig – der Anruf wird nicht gestartet."""


@dataclass(frozen=True)
class LeadInfo:
    firma: str
    ansprechpartner: str | None = None
    rolle: str | None = None
    anzeigen_titel: str | None = None
    quelle_portal: str | None = None
    anzeigen_datum: str | None = None


@dataclass(frozen=True)
class CallContext:
    call_id: str
    lead_id: str
    phone_number: str
    call_type: CallType
    lead: LeadInfo
    previous_summary: str | None = None
    test: bool = False
    extra: dict[str, str] = field(default_factory=dict)


def _clean(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def parse_metadata(raw: str | None, *, room_name: str) -> CallContext:
    """Parst und validiert die Dispatch-Metadaten. Wirft MetadataError statt zu raten."""
    if not raw:
        raise MetadataError("Dispatch ohne Metadaten – kein Anruf")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise MetadataError(f"Metadaten sind kein gültiges JSON: {exc.msg}") from exc
    if not isinstance(data, dict):
        raise MetadataError("Metadaten müssen ein JSON-Objekt sein")

    lead_id = _clean(data.get("lead_id"))
    phone = _clean(data.get("phone_number"))
    call_id = _clean(data.get("call_id")) or room_name
    call_type = _clean(data.get("call_type")) or "erstgespraech"
    lead_raw = data.get("lead") or {}

    if not lead_id:
        raise MetadataError("lead_id fehlt")
    if not phone or not _E164.match(phone):
        raise MetadataError("phone_number fehlt oder ist nicht im E.164-Format")
    if call_type not in ("erstgespraech", "zweittermin", "rueckruf"):
        raise MetadataError(f"unbekannter call_type: {call_type}")
    if not isinstance(lead_raw, dict) or not _clean(lead_raw.get("firma")):
        raise MetadataError("lead.firma fehlt")
    if call_id != room_name:
        raise MetadataError("call_id muss dem Raumnamen entsprechen (Idempotenz-Schlüssel)")
    previous_summary = _clean(data.get("previous_summary"))
    if call_type == "zweittermin" and not previous_summary:
        raise MetadataError("previous_summary fehlt für zweittermin")
    test = data.get("test")
    if not isinstance(test, bool):
        raise MetadataError("test fehlt oder ist kein Boolean")

    lead = LeadInfo(
        firma=_clean(lead_raw.get("firma")) or "",
        ansprechpartner=_clean(lead_raw.get("ansprechpartner")),
        rolle=_clean(lead_raw.get("rolle")),
        anzeigen_titel=_clean(lead_raw.get("anzeigen_titel")),
        quelle_portal=_clean(lead_raw.get("quelle_portal")),
        anzeigen_datum=_clean(lead_raw.get("anzeigen_datum")),
    )
    return CallContext(
        call_id=call_id,
        lead_id=lead_id,
        phone_number=phone,
        call_type=call_type,  # type: ignore[arg-type]
        lead=lead,
        previous_summary=previous_summary,
        test=test,
    )
