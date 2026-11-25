# Runbook: Kill-Switch (Wählen stoppen und freigeben)

Gilt für den n8n-Workflow „StepSales – Dispatcher“ (`24V2NkLhWgBrSgWW`). Der Dispatcher startet **nur** Anrufe, wenn in Airtable `Config.dial_enabled` genau `true` ist.

## Auslöser

- Fehlanruf, Beschwerde, falsche Ansage, technischer Fehler, Verdacht auf Datenfehler.
- Alarm-Mail „StepSales: Wählen gestoppt“ (der Fehler-Stopp hat schon abgeschaltet).

## Sofort stoppen (unter 1 Minute)

1. Airtable-Base **StepSales** → Tabelle **Config** → Zeile `dial_enabled` → **Wert** auf `false`.
2. Wirkung: Der nächste Dispatcher-Lauf (spätestens nach 2 Minuten) startet keinen neuen Anruf.
3. **Laufende Gespräche** stoppt das nicht. Notfalls im LiveKit-Dashboard (Projekt StepSales → Rooms) den Raum `call-…` beenden.

Härter, falls Airtable nicht erreichbar ist: in n8n den Dispatcher deaktivieren (Unpublish).

## Ursache prüfen

- `Config.dial_enabled` → **Beschreibung**: Bei automatischem Stopp steht dort `AUTO-STOP <Zeit>: <Workflow> / <Node>: <Fehler>`.
- n8n → Executions des Workflows aus der Beschreibung öffnen.
- Airtable **Leads** → Spalte **Fehlernotiz**; Leads mit Fehler sind auf **Wählbar** = aus gesetzt.
- Airtable **Anrufe** → Zeilen mit `Ergebnis = failed` und Zusammenfassung „Ergebnisabgleich“ oder „Technischer Abbruch“.

## Wieder freigeben

Erst wenn die Ursache behoben ist:

1. Betroffene Leads prüfen; nur korrekte wieder auf **Wählbar** = an, **Fehlernotiz** leeren.
2. `Config.dial_enabled` → `true`. **Beschreibung** auf „Kill-Switch (true/false)“ zurücksetzen.
3. Beim nächsten Lauf in n8n prüfen: Execution grün, im Gate Ausgabe vorhanden, ein Anruf angelegt (Tabelle **Anrufe**).

## Kontrolle danach

- Erster Anruf nach Freigabe: Ergebnis in **Anrufe**, Trace in Langfuse.
- Keine neue Alarm-Mail innerhalb von 30 Minuten.

## Was automatisch stoppt

| Ereignis | Wirkung |
| --- | --- |
| Fehler in Dispatcher, Ergebnisabgleich oder Agent-Tools | Fehler-Stopp: `dial_enabled = false` + Alarm-Mail (sobald als Error-Workflow verknüpft) |
| Dispatch an LiveKit fehlgeschlagen | Lead gesperrt + Fehler-Stopp |
| `livekit_api_key` fehlt | Dispatcher bricht ab → Fehler-Stopp |
| Außerhalb `call_days` / `call_window_*` oder an `sperrtage` | Gate startet nichts (kein Stopp, nur Pause) |
| Testbetrieb (`test_mode` ≠ `false`, Platzhalter-Paket aktiv oder `anzeigenummer` leer) | nur Leads mit **Testdaten** = an |

## Eskalation

Owner (Denis). Bei Verdacht auf Datenpanne (falsche Person angerufen, Daten an Dritte): zusätzlich `SECURITY.md` und später `incident.md` (Stufe 4).
