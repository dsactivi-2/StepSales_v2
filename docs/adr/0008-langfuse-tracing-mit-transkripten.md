# ADR-0008: Langfuse-Tracing inkl. Transkripten

- **Status:** Akzeptiert (Owner, 2026-11-25)
- **Datum:** 2026-11-25

## Kontext

Qualität und A/B-Vergleich brauchen nachvollziehbare Gespräche.

## Entscheidung

Beide Agents tracen per OpenTelemetry nach Langfuse, inkl. Transkript, Tool-Calls, Modell und Agent-Name.

## Konsequenzen

Volle Auswertbarkeit. DSGVO: personenbezogene Daten → Hinweis im Gespräch, Löschfrist und Zugriffsrechte festlegen (offen).

## Verworfene Alternativen

Nur Metriken ohne Inhalte.
