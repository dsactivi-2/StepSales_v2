# Analyse & Verifizierung (2026-11-25)

## Modelle

| Vorgabe | Befund | Quelle |
| --- | --- | --- |
| GPT Live 1 | Existiert: `gpt-live-1`, Vollduplex, delegiert Reasoning/Tools an ein Backend-Responses-Modell; $0.05/Min, Backend separat. In LiveKit über Inference (`openai/gpt-live-1`, EU-Endpoint) und OpenAI-Plugin. Kein Text-only-Modus → keine eigene TTS kombinierbar. | developers.openai.com/api/docs/models/gpt-live-1 · docs.livekit.io/agents/models/realtime/plugins/gpt-live |
| Gemini 3.8 Flash | Existiert als Sprachmodell **nicht**. Live-Modell: `gemini-3.8-live` (Nachfolger von `gemini-3.1-flash-live-preview`); „3.8 Flash“ gibt es nur als TTS. In LiveKit Inference **mit** EU-Endpoint (Korrektur 2026-11-25, Stufe 2: Tabelle auf docs.livekit.io/agents/models/realtime/gemini/ zeigt ✓; die frühere Angabe „ohne EU“ war falsch). | ai.google.dev/gemini-api/docs/models/gemini-3.8-live · docs.livekit.io/agents/models/realtime/gemini |

## Aufgabe

Quelle: `docs/agent-pack/` (aus `dsactivi-2/dograhv1`, Commit `146053c`, 2026-05-13). Deutscher B2B-Telesales für Multiposting; Abschluss im Erstgespräch, sonst Zweittermin/Angebot/Follow-up, danach Zahlung und Abfrage der Anzeigendaten.

## Lücken & Risiken

| # | Befund | Einstufung | Maßnahme |
| --- | --- | --- | --- |
| 1 | Keine Leadquelle | offen (Entscheidung: später) | Schema jetzt, Import später |
| 2 | Paketinhalte fehlen | blockiert Live-Betrieb | Airtable-Tabelle `Pakete`, Platzhalter |
| 3 | Mail/Kalender nicht festgelegt | offen | siehe PLAN.md, offene Punkte |
| 4 | `mark_payment_received` als Agent-Tool wäre manipulierbar | Risiko | nur Stripe-Webhook setzt „bezahlt“ |
| 5 | Kaltanrufe B2B: UWG §7 (mutmaßliche Einwilligung) | rechtliches Risiko, keine Rechtsberatung | vor Pilot klären |
| 6 | KI-Offenlegung (EU AI Act Art. 50) | Pflicht | fester Satz in der Eröffnung |
| 7 | Transkripte in Langfuse = personenbezogene Daten | DSGVO | Hinweis im Gespräch, Löschfrist festlegen |
| 8 | ~~Gemini via LiveKit Inference ohne EU-Endpoint~~ – korrigiert: EU-Endpoint vorhanden | erledigt | Region-Restriction im LiveKit-Projekt aktivieren, Agents in `eu-central` deployen |

## Übernommene Regeln aus `dograhv2-stepsale`

Lead-Score 0–100, Status-Schwellen (≥ 70 qualified, ≥ 40 reached), Rabatt ≤ 10 % mit Pflichtbegründung, Preis serverseitig, kein Status-Downgrade bei Re-Qualifizierung. Bekannte Schwächen dort (keine Lead-Dublettenprüfung, keine Betragsprüfung bei Zahlung) werden in v2 von Anfang an abgedeckt: Dedupe per Telefon/E-Mail, Betrag aus Stripe-Event gegen Angebot.
