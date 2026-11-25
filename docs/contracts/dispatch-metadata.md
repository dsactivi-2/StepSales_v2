# Vertrag: n8n-Dispatcher → Agent (Job-Metadaten)

Der n8n-Dispatcher startet einen Anruf mit `CreateAgentDispatch` (LiveKit API):

- `agent_name`: `stepsales-gptlive` oder `stepsales-gemini` (aus `Leads.Agent`)
- `room`: eindeutiger Raumname = `call_id` (z. B. `call-<leadRecordId>-<unix>`), Idempotenz-Schlüssel
- `metadata`: JSON wie unten

```json
{
  "lead_id": "recXXXXXXXXXXXXXX",
  "phone_number": "+4930123456789",
  "call_id": "call-recXXXXXXXXXXXXXX-1795570000",
  "call_type": "erstgespraech",
  "lead": {
    "firma": "Musterbau GmbH",
    "ansprechpartner": "Anna Muster",
    "rolle": "HR-Leitung",
    "anzeigen_titel": "Bauleiter (m/w/d)",
    "quelle_portal": "…",
    "anzeigen_datum": "2026-11-20"
  },
  "previous_summary": null,
  "test": true
}
```

| Feld | Pflicht | Regel |
| --- | --- | --- |
| lead_id | ja | Airtable-Record-ID des Leads |
| phone_number | ja | E.164 (`+` und 7–15 Ziffern) |
| call_id | nein | muss dem Raumnamen entsprechen; fehlt es, gilt der Raumname |
| call_type | nein | `erstgespraech` (Default) · `zweittermin` · `rueckruf` |
| lead.firma | ja | |
| lead.* übrige | nein | leer lassen statt raten |
| previous_summary | bei `zweittermin` Pflicht (sonst Abbruch) | aus `Termine.Kontext für Agent` |
| test | ja, JSON-Boolean (kein String) | `true` für fiktive Leads/interne Nummern |

**Fail-closed:** Fehlt ein Pflichtfeld oder ist es ungültig, beendet der Agent den Job ohne zu wählen.
Solange `STEPSALES_TEST_CALLS_ONLY` nicht `false` ist, werden nur Aufträge mit `test: true` angerufen.

Quelle Implementierung: `agent/src/stepsales_agent/call_context.py`.

## Umsetzung in n8n (Stufe 3)

Workflow „StepSales – Dispatcher“ (`24V2NkLhWgBrSgWW`), Quelltext `n8n/workflows/src/dispatcher.ts`.

- `call_id` = Raumname `call-<Lead-ID ohne rec>-<Zeit+Zufall>`; ein Datensatz in **Anrufe** wird vor dem Dispatch angelegt.
- `call_type`: fälliger Zweittermin (`Termine`, Durchführung `agent`, Start −30/+5 Min.) → `zweittermin`; `Nächster Schritt = callback_agreed` → `rueckruf`; sonst `erstgespraech`.
- `previous_summary` (nur `zweittermin`): Termin-Thema + Zusammenfassung des Erstgesprächs; fehlt beides, ein fester Hinweistext.
- `test` = `Leads.Testdaten`.
- Dispatch: `POST <livekit_http_url>/twirp/livekit.AgentDispatchService/CreateDispatch` mit `agent_name` = `Leads.Agent`, Token HS256, 5 Min. gültig, Grant `roomCreate` + `roomAdmin` für genau diesen Raum.
