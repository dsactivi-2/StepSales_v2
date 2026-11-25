# n8n-Workflows (n8n.activi.io)

Stand: 2026-11-26 · Stufe 3 · **alle inaktiv** · Entscheidungen: [ADR-0011](../../docs/adr/0011-anrufablauf-und-dispatch-vertrag.md), [ADR-0012](../../docs/adr/0012-n8n-workflows-idempotenz-und-fail-closed.md)

Die Quelltexte in `src/` sind n8n-Workflow-SDK-Code und die versionierte Fassung der Workflows. Sie enthalten keine Credentials. Neu anlegen: Inhalt per n8n-MCP `validate_workflow` → `create_workflow_from_code`, danach die Einstellungen unten setzen und die Credentials zuweisen.

## Übersicht

| Workflow | ID | Auslöser | Aufgabe | Einstellungen |
| --- | --- | --- | --- | --- |
| StepSales – Agent-Tools | `RxfOpzUAF6C7yyoa` | Webhook `POST /webhook/stepsales-tools` (Header-Auth) | Alle Agent-Tools ([Vertrag](../../docs/contracts/tools-webhook.md)) | Europe/Berlin, Timeout 30 s, Error-Workflow: Fehler-Stopp* |
| StepSales – Mail senden | `9uPWJkD0fqWwTC2R` | Sub-Workflow | Einziger Mail-Baustein: Vorlage, Platzhalter, Gmail, Follow-up-Datensatz | nur aufrufbar von Agent-Tools und FU-Sequenz |
| StepSales – Dispatcher | `24V2NkLhWgBrSgWW` | Cron `*/2 8-17 * * 1-5` | Leads auswählen, reservieren, A/B, LiveKit `CreateDispatch` | Europe/Berlin, Timeout 90 s, Error-Workflow: Fehler-Stopp* |
| StepSales – Ergebnisabgleich | `1uidBkcPnCccRKnb` | Cron `*/10 8-19 * * 1-5` | Anrufe ohne Ergebnis → `failed`, Lead zur Prüfung sperren | Europe/Berlin, Error-Workflow: Fehler-Stopp* |
| StepSales – Follow-up-Sequenz | `SfS9EqXM6nBJsj1v` | Cron `0 10 * * 1-5` | FU1–FU3 nach versendetem Angebot | Europe/Berlin, Timeout 600 s |
| StepSales – Fehler-Stopp | `uXKc4PcGND3EImxI` | Error Trigger | `Config.dial_enabled = false`, Ursache in `Config.Beschreibung`, Alarm-Mail | – |

\* n8n akzeptiert einen Error-Workflow erst, wenn er veröffentlicht ist. Das Verknüpfen ist deshalb Teil der Aktivierung (Schritt 4 unten).

Die Cron-Zeiten begrenzen die Airtable-Aufrufe (Monatskontingent je Plan); die tatsächlichen Anrufzeiten steuert `Config.call_window_*` im Gate.

## Credentials (vom Owner in n8n anzulegen)

| Name in n8n | Typ | Wofür | Hinweis |
| --- | --- | --- | --- |
| StepSales Airtable | Airtable Personal Access Token | alle Airtable-Nodes | Token **nur** für Base `appLXW1HK6fe213yO`, Scopes `data.records:read`, `data.records:write` |
| StepSales Tools Secret | Header Auth | Webhook „Tool call“ | Name `X-StepSales-Secret`, Wert = `N8N_TOOLS_WEBHOOK_SECRET` des Agents |
| StepSales Gmail | Gmail OAuth2 | Mail senden, Fehler-Stopp-Alarm | Konto laut `Config.absender_adresse` |
| StepSales Google Calendar | Google Calendar OAuth2 | `schedule_second_call` | Kalender laut `Config.kalender_id` |
| StepSales LiveKit (Dispatcher) | JWT (Passphrase, HS256) | Token für `CreateDispatch` | Secret = API-Secret des LiveKit-Projekts StepSales |

**Achtung:** Beim Anlegen hat n8n den Airtable-Nodes automatisch die Credential „Airtable – Lina Outbound“ und dem Token-Node „LiveKit lina-oai“ zugewiesen. Beide gehören zu anderen Projekten. Ein Testlauf hat gezeigt, dass der Lina-Token keinen Zugriff auf die StepSales-Base hat (403). Vor jeder Aktivierung müssen alle Nodes auf die StepSales-Credentials umgestellt werden (Schritt 2).

## Neue Config-Schlüssel (in Airtable `Config` anzulegen)

| Schlüssel | Pflicht | Bedeutung |
| --- | --- | --- |
| `livekit_api_key` | ja, für den Dispatcher | API-Key-ID des LiveKit-Projekts (kein Secret). Fehlt sie, bricht der Dispatcher mit Fehler ab. |
| `livekit_http_url` | nein | Standard `https://stepsalesv2-walghbs5.livekit.cloud` |
| `sperrtage` | nein | Tage ohne Anrufe, `YYYY-MM-DD,YYYY-MM-DD` (z. B. Feiertage) |
| `alarm_email` | nein | Empfänger der Fehler-Stopp-Mail; sonst `absender_adresse` |

## Aktivierung (erst nach „bestätige“, Stufe 4)

1. Credentials oben anlegen; Config-Schlüssel `livekit_api_key` eintragen; `mail_signatur` füllen (sonst blockiert jede Mail).
2. In allen sechs Workflows die Credentials auf die StepSales-Credentials umstellen und prüfen, dass keine Lina-Credential mehr zugewiesen ist.
3. Fehler-Stopp veröffentlichen.
4. Fehler-Stopp als Error-Workflow bei Agent-Tools, Dispatcher und Ergebnisabgleich setzen.
5. Mail senden und Agent-Tools veröffentlichen. Webhook-URL `https://n8n.activi.io/webhook/stepsales-tools` als `N8N_TOOLS_WEBHOOK_URL` beim Agent setzen.
6. Tools mit echtem Aufruf prüfen (Testdaten-Lead, siehe unten).
7. Ergebnisabgleich und Follow-up-Sequenz veröffentlichen.
8. Dispatcher veröffentlichen – `dial_enabled` bleibt `false`, bis der erste Testanruf freigegeben ist ([Kill-Switch-Runbook](../../docs/runbooks/kill-switch.md)).

## Geprüft (Stufe 3, mit Pin-Daten, ohne Airtable-Zugriff)

| Workflow | Fall | Ergebnis |
| --- | --- | --- |
| Agent-Tools | `create_offer` 15 % bei Max 10 % | `discount_too_high`, nichts geschrieben |
| Agent-Tools | `create_offer` 5 % mit Begründung | Endpreis 1415,50 €, Angebot-ID = Idempotency-Key, Lead → `proposal_pending` |
| Agent-Tools | `log_call_outcome` `dnc_requested` | Anruf gespeichert, Lead `dnc`, DNC an, Wählbar aus |
| Agent-Tools | falscher Idempotency-Key | 400 `bad_request` |
| Agent-Tools | `get_packages` | aktive Pakete, Rabattgrenze 10 % als Fallback |
| Agent-Tools | `qualify_lead` | Score 95 nach v1-Regeln, Status `qualified`, `current_channels` als ignoriert gemeldet |
| Agent-Tools | `schedule_second_call` | Termin in Anrufzeiten, Lead `second_call_scheduled`, Nächster Versuch = Termin |
| Agent-Tools | `send_followup` offer | Variablen korrekt (Preis „1.415,50 €“), Angebot → `sent` |
| Mail senden | Signatur leer | blockiert `placeholder_missing: signatur` |
| Mail senden | Signatur gesetzt | Betreff/Text vollständig gerendert |
| Dispatcher | `dial_enabled = false` | Lauf endet im Gate, keine weiteren Zugriffe |
| Dispatcher | Zweittermin + Neu-Lead + ungültige Nummer | Zweittermin zuerst (mit Gesprächsstand), ungültige Nummer übersprungen, A/B gesetzt |
| Follow-up-Sequenz | drei Angebote | FU2 fällig, zu frisch → nichts, abgelaufen → FU2 übersprungen, FU3 |
| Ergebnisabgleich | zwei hängende Anrufe, ein Lead | beide `failed`, Lead einmal gesperrt |

Noch nicht geprüft: echte Airtable-, Gmail-, Kalender- und LiveKit-Aufrufe (fehlende Credentials, Stufe 4).
