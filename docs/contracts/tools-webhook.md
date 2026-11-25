# Vertrag: Agent → n8n-Tools-Webhook

Ein Webhook für alle Tools ([ADR-0005](../adr/0005-agent-tools-ueber-einen-n8n-webhook.md)).
Implementierung Agent-Seite: `agent/src/stepsales_agent/n8n_client.py`, `sales_agent.py`.

## Request

`POST {N8N_TOOLS_WEBHOOK_URL}` (https)

| Header | Wert |
| --- | --- |
| `X-StepSales-Secret` | `N8N_TOOLS_WEBHOOK_SECRET` – n8n lehnt ohne gültiges Secret mit 401 ab |
| `Idempotency-Key` | `<call_id>:<tool>:<seq>` – bei Wiederholung identisch; n8n führt denselben Schlüssel nur einmal aus |

```json
{"tool": "create_offer", "call_id": "call-…", "lead_id": "rec…", "agent": "stepsales-gemini",
 "seq": 3, "args": {"package_id": "MULTI_M", "discount_percent": 5, "discount_reason": "…"}}
```

`args` enthält nur Felder, die im Gespräch genannt wurden (`null` wird nicht gesendet).

## Response

| Fall | Status | Body |
| --- | --- | --- |
| Erfolg | 200 | `{"ok": true, "data": {…}}` |
| Fachliche Ablehnung | 200 | `{"ok": false, "error": {"code": "…", "message": "…"}}` |
| Auth/Schema-Fehler | 4xx | beliebig – Agent wiederholt nicht |
| Technischer Fehler | 5xx | Agent wiederholt einmal, dann „System nicht erreichbar“ |

Timeout Agent-Seite: `STEPSALES_TOOLS_TIMEOUT_S` (Default 8 s).

## Tools

| tool | args | data (mind.) | n8n-Regeln |
| --- | --- | --- | --- |
| get_packages | – | `packages[]` mit package_id, name, leistungen, portale, laufzeit_tage, listenpreis_eur_netto, max_rabatt_prozent, empfehlen_wenn | nur `Aktiv`; sortiert nach Reihenfolge |
| qualify_lead | active_hiring, roles_hiring_for[], number_of_roles, urgency, timeline, current_channels, budget_signal, interest_level, decision_role, contact_name, contact_role | lead_id, score, status | nur gesendete Felder ändern; Score wie v1; kein Status-Downgrade |
| create_offer | package_id, discount_percent, discount_reason | offer_id, package_name, list_price, discount_percent, final_price, valid_until | Rabatt ≤ Paket-Max (sonst `ok:false`, code `discount_too_high`); Endpreis serverseitig |
| send_followup | email, followup_type (offer/recap/material), offer_id, summary, agreed_next_contact | fu_id, status | Vorlage + Config ([ADR-0010](../adr/0010-mail-und-kalender-konfigurierbar.md)); Platzhalter fehlt → `ok:false` |
| schedule_second_call | start_iso, email, topic | termin_id, start | Kalender laut Config; Zeit in Anrufzeiten; Lead-Status `second_call_scheduled` |
| send_payment_link | offer_id, email | payment_ref, status | nur Angebot dieses Leads; Stripe Checkout; Lead `payment_pending` |
| log_call_outcome | outcome, summary, next_step, objection_type, interest_level, callback_iso, confidence, technical | stored | genau ein Ergebnis je call_id; `dnc_requested` → `DNC`=an; `technical:true` = Code-Fallback |

`outcome`-Werte = `Anrufe.Ergebnis` (airtable/schema.md). Technische Werte vom Code: `no_answer` (auch SIP 486 besetzt / 603 abgelehnt, Code im `summary`), `voicemail`, `failed`.
Nie ein Agent-Tool: Zahlung als bezahlt markieren ([ADR-0006](../adr/0006-zahlungsstatus-nur-per-stripe-webhook.md)).
