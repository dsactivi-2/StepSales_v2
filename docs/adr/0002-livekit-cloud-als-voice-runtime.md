# ADR-0002: LiveKit Cloud als Voice-Runtime statt Dograh

- **Status:** Akzeptiert (Owner, 2026-11-25)
- **Datum:** 2026-11-25

## Kontext

v1 lief auf Dograh (Pipecat). Der Owner betreibt bereits Lina und Dinko auf LiveKit Cloud mit n8n-Dispatch und hat für v2 LiveKit festgelegt.

## Entscheidung

Die Agents laufen als LiveKit Agents (Python) auf LiveKit Cloud in einem eigenen Projekt „StepSales“.

## Konsequenzen

Gleicher Betrieb wie Lina/Dinko, native Unterstützung für `gpt-live-1` und `gemini-3.8-live`. Die Stepsales-API aus `dograhv2-stepsale` wird nicht weiterbetrieben; ihre Geschäftsregeln werden in n8n neu umgesetzt.

## Verworfene Alternativen

Dograh als Laufzeit weiterverwenden.
