# ADR-0005: Agent-Tools über einen authentifizierten n8n-Webhook

- **Status:** Vorgeschlagen
- **Datum:** 2026-11-25

## Kontext

Die Agents brauchen ~8 Tools mit Schreibzugriff auf Airtable, Stripe und Mail.

## Entscheidung

Alle Tools rufen einen n8n-Webhook mit `tool`-Feld und Secret-Header (`N8N_TOOLS_WEBHOOK_SECRET`). n8n validiert Eingaben, rechnet Preise, schreibt Airtable und antwortet mit stabilem JSON (`ok`, `data`, `error`). Jeder Aufruf trägt `call_id` und `lead_id` als Idempotenz-Schlüssel.

## Konsequenzen

Geschäftslogik zentral und ohne Agent-Deploy änderbar. Webhook ist ein Single Point of Failure → Timeouts und Fallback-Antworten im Agent.

## Verworfene Alternativen

Agent schreibt direkt in Airtable (Logik im Agent verteilt, Keys im Agent).
