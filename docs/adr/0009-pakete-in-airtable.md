# ADR-0009: Pakete in Airtable, zur Laufzeit geladen

- **Status:** Vorgeschlagen
- **Datum:** 2026-11-25

## Kontext

Der Owner will Pakete leicht anpassen können, ohne Code-Deploy.

## Entscheidung

Tabelle `Pakete` (paket_id, name, leistungen, portale, laufzeit_tage, listenpreis_eur_netto, max_rabatt_prozent, empfehlen_wenn, aktiv). Der Agent lädt aktive Pakete über `get_packages` zu Gesprächsbeginn; n8n berechnet Endpreise.

## Konsequenzen

Änderungen wirken ab dem nächsten Anruf. Agent darf nichts nennen, was nicht in der Tabelle steht.

## Verworfene Alternativen

Pakete im Code oder Prompt (erfordert Deploy).
