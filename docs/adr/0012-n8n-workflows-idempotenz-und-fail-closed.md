# ADR-0012: n8n-Workflows – Aufteilung, Idempotenz und fail-closed

- **Status:** Vorgeschlagen
- **Datum:** 2026-11-26

## Kontext

Stufe 3 baut die Steuerung in n8n (`n8n.activi.io`): Tools-Webhook für die Agents, Dispatcher, Follow-ups und Fehlerbehandlung. Der Agent wiederholt einen Tool-Aufruf bei 5xx genau einmal mit demselben `Idempotency-Key` ([Vertrag](../contracts/tools-webhook.md)). Mails, Angebote und Termine dürfen dabei nicht doppelt entstehen.

## Entscheidung

- **Sechs Workflows** mit klarer Aufgabe: Agent-Tools (ein Webhook, Routing per `tool`), Mail senden (einziger Mail-Baustein), Dispatcher, Ergebnisabgleich, Follow-up-Sequenz, Fehler-Stopp. Übersicht: [`n8n/workflows/README.md`](../../n8n/workflows/README.md).
- **Idempotency-Key = Datensatz-ID.** `Angebot-ID`, `FU-ID`, `Termin-ID` (und später `Zahlungs-Ref`) bekommen den Schlüssel `<call_id>:<tool>:<seq>`. Vor dem Schreiben wird nach der ID gesucht; Mails werden per Upsert auf `FU-ID` gespeichert. Keine zusätzliche Idempotenz-Tabelle.
- **Ein Ergebnis je Anruf:** `log_call_outcome` schreibt nur, wenn `Anrufe.Ergebnis` leer ist; spätere Aufrufe liefern `already_logged`.
- **Fail-closed:**
  - Dispatcher wählt nur bei `dial_enabled = true`, in Anrufzeiten, ohne Sperrtag. Fehlt `livekit_api_key`, bricht er mit Fehler ab.
  - Jeder Dispatch-Fehler sperrt den Lead und beendet den Lauf mit Fehler. Der Error-Workflow „Fehler-Stopp“ setzt dann `dial_enabled = false` und alarmiert.
  - Technischer Abbruch (`failed`), falsche Person und Anrufe ohne Ergebnis sperren den Lead zur Prüfung, statt automatisch neu zu wählen.
  - Der Mail-Baustein blockiert bei fehlendem Platzhalter (auch `{{signatur}}`), DNC, Testbetrieb ohne Testdaten-Lead oder nicht angebundenem `mail_dienst`.
- **Geheimnisse nie im Workflow:** Secrets nur in n8n-Credentials. Die LiveKit-Key-ID steht in `Config.livekit_api_key`, das Secret nur in der JWT-Credential.
- **Felder per Name:** Der n8n-Airtable-Node arbeitet mit Feldnamen. Umbenennen eines Feldes in Airtable erfordert eine Workflow-Änderung.
- **`send_payment_link` ist bis Stufe 5 aus** (`payment_not_enabled`). Stripe-Checkout und Stripe-Webhook folgen dort.

## Konsequenzen

Wiederholungen sind sicher, ohne dass n8n Zustand außerhalb von Airtable braucht. Der Preis sind mehr Lesezugriffe je Aufruf (Config, Lead, Anruf: ~3 Airtable-Requests vor der eigentlichen Logik). Bei Airtable-Rate-Limits (5 Requests/s je Base) und `max_parallel_calls` > 2 muss die Last neu bewertet werden.

## Verworfene Alternativen

- **Ein Sub-Workflow je Tool:** mehr Workflows und Aufrufe, gleiche Logik. Ein Workflow mit Gruppen je Tool ist leichter zu testen und zu exportieren.
- **n8n Data Table als Idempotenz-Speicher:** zusätzliche Quelle, die mit Airtable auseinanderlaufen kann.
