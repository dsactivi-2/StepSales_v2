"""Code-Sicherung für „nicht mehr anrufen“ (AGENTS.md §5, Issue #28).

Problem (Sprach-Simulation #28): GPT-Live sagt „ich speichere das“, legt die Person aber
sofort auf, kommt ``log_call_outcome`` nicht mehr an, und der Lead würde wieder angerufen.

Lösung: Die Äußerungen der angerufenen Person werden auf eindeutige Sperrwünsche geprüft.
Hat das Modell bis zum Gesprächsende kein Ergebnis gespeichert, meldet der technische
Fallback ``dnc_requested`` statt ``failed``. Die Richtung ist bewusst vorsichtig: lieber
einmal zu viel sperren als einen Sperrwunsch verlieren. „Kein Interesse“ allein zählt nicht.
"""

from __future__ import annotations

import re

_PATTERNS = [
    r"nicht\s+(mehr|wieder|nochmal|noch\s+mal|erneut)\s+an(zu|ge)?ruf(en|t)",
    r"(rufen|ruft)\s+(sie|ihr)\s+(mich|uns)\s+(bitte\s+)?(nicht|nie)(\s+mehr|\s+wieder)?\s+an",
    r"(nie|nicht)\s+(mehr|wieder)\s+(hier\s+)?an(rufen|ruft)",
    r"keine\s+(weiteren\s+)?anrufe",
    r"(von|aus)\s+(ihrer|eurer|der)\s+(anruf)?liste",
    r"(meine|unsere)\s+(nummer|daten)\s+(bitte\s+)?löschen",
    r"(sperren|streichen)\s+sie\s+(bitte\s+)?(mich|uns)\b",
    # Objekt Pflicht, damit z. B. „löschen Sie meine alte Anzeige“ nicht zählt
    r"(sperren|streichen|löschen|entfernen)\s+sie\s+(bitte\s+)?(meine|unsere)\s+"
    r"(telefon)?(nummer|daten|kontaktdaten)\b",
    r"(löschen|entfernen)\s+sie\s+(bitte\s+)?(mich|uns)\s+(bitte\s+)?(aus|von)\b",
]
_DNC = re.compile("|".join(_PATTERNS), re.IGNORECASE)


def detects_dnc(text: str | None) -> bool:
    """True, wenn der Text einen eindeutigen Wunsch enthält, nicht mehr angerufen zu werden."""
    if not text:
        return False
    return _DNC.search(" ".join(text.split())) is not None


DNC_FALLBACK_REASON = (
    "Code-Sicherung: Die Person hat im Gespräch gebeten, nicht mehr angerufen zu werden; "
    "das Modell hat kein Ergebnis gespeichert."
)
