# ADR-0011: Anrufablauf, Dispatch-Vertrag und zwei Deployments

- **Status:** Vorgeschlagen
- **Datum:** 2026-11-25

## Kontext

Stufe 2 brauchte feste Schnittstellen zwischen n8n und Agent sowie einen Anrufablauf, der Mailboxen, Fehlwahlen und Abbrüche sicher behandelt. LiveKit registriert pro Agent-Server genau einen Agent-Namen.

## Entscheidung

- **Zwei Deployments, ein Code:** `STEPSALES_VARIANT=gptlive|gemini` wählt Agent-Name und Modell.
- **n8n wählt nicht selbst**, sondern dispatcht den Agenten mit Metadaten ([Vertrag](../contracts/dispatch-metadata.md)); der Agent ruft per `CreateSIPParticipant` (`wait_until_answered`) an. Lead-Daten kommen aus den Metadaten, der Agent liest Airtable nicht.
- **Answering Machine Detection** (LiveKit AMD) vor dem Gespräch. Mailbox/nicht erreichbar → **auflegen ohne Nachricht**, Ergebnis `voicemail`.
- **Ergebnis-Garantie:** Speichert das Modell kein Ergebnis, meldet der Code beim Beenden ein technisches Ergebnis (`no_answer`/`voicemail`/`failed`).
- **Jede Exit-Route löscht den Raum** (legt auf). Harte Gesprächsgrenze `STEPSALES_MAX_CALL_SECONDS` mit Abschluss-Aufforderung und 90 s Nachlauf.
- **Testbetrieb im Agent:** `STEPSALES_TEST_CALLS_ONLY` (Default an) lässt nur Aufträge mit `test: true` zu – zusätzlich zum Dispatcher.

## Konsequenzen

Wählen ist fail-closed an zwei Stellen (n8n + Agent). Mailbox-Nachrichten sind bewusst aus; ob StepSales auf Mailboxen sprechen soll, ist eine offene Geschäftsentscheidung.

## Verworfene Alternativen

n8n erzeugt den SIP-Teilnehmer selbst (Lina-Muster „n8n_dials“): verliert AMD vor dem Gespräch und die Ergebnis-Garantie im Agent.
