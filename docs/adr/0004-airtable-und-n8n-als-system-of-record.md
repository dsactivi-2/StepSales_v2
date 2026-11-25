# ADR-0004: Airtable + n8n als Datenspeicher und Steuerung

- **Status:** Akzeptiert (Owner, 2026-11-25)
- **Datum:** 2026-11-25

## Kontext

Leads, Angebote, Zahlungen und Follow-ups brauchen Persistenz. Der Owner nutzt Airtable + n8n bereits produktiv.

## Entscheidung

Airtable-Base „StepSales“ ist die Wahrheitsquelle. n8n (`n8n.activi.io`) implementiert Dispatcher, Agent-Tools, Stripe-Webhook, Follow-ups, Ergebnisabgleich und Fehler-Stopp.

## Konsequenzen

Bekanntes Betriebsmodell, Daten für den Owner direkt editierbar. Grenzen: Airtable-Rate-Limits und fehlende Transaktionen → Idempotenz-Schlüssel und Dedupe in n8n Pflicht.

## Verworfene Alternativen

Dograh-Stepsales-API (Postgres); eigenes Backend.
