# ADR-0013: GPT-Live optional direkt über OpenAI (eigener Key)

- **Status:** Akzeptiert (Owner, Chat 2026-11-26)
- **Datum:** 2026-11-26

## Kontext

Bisher rufen beide Varianten ihr Modell über LiveKit Inference auf (Issue #5). Am 2026-11-26 war das Realtime-Kontingent des LiveKit-Projekts erschöpft (`Realtime (sts) credit quota exhausted`, 429). Ohne Kontingent bricht jede Session sofort ab. Der Owner will mit einem eigenen OpenAI-Key weiterarbeiten.

## Entscheidung

- Neuer Schalter `STEPSALES_GPTLIVE_BACKEND`:
  - `inference` (Default) läuft wie bisher über `inference.DuplexModel`.
  - `openai` läuft über `livekit-plugins-openai` mit `realtime.GPTLiveModel`.
- Der Key kommt aus dem Agent-Secret `OPENAI_API_KEY` (SDK-Fallback, geprüft in `livekit/agents/llm/_realtime/gpt_live.py`). Fehlt er, startet der Agent nicht (fail-fast).
- Modell, Stimme und Backend-Anweisungen (`responses_options`) sind bei beiden Wegen gleich. Gemini bleibt bei LiveKit Inference.
- Die VAD (`inference.VAD`) bleibt bei LiveKit; das gemeldete Limit betraf nur das Realtime-Kontingent.

## Konsequenzen

- Die Abrechnung für GPT-Live läuft direkt bei OpenAI. Kosten und Limits sind getrennt vom LiveKit-Plan.
- Der Audio-Weg führt vom LiveKit-Worker (`eu-central`) direkt zur OpenAI-API. Für die Datenverarbeitung gilt damit der Vertrag mit OpenAI und nicht der mit LiveKit. Das ist vor dem Pilot mit echten Leads zu klären (Datenschutz/AVV).
- Der A/B-Vergleich (ADR-0003) bleibt fair, solange Modell, Prompt und Tools gleich sind. Der Infrastruktur-Weg unterscheidet sich aber und kann die Latenz beeinflussen. In den Auswertungen ist er deshalb als Merkmal mitzuführen (`stepsales.variant`).
- Wird kein `STEPSALES_GPTLIVE_BACKEND_MODEL` gesetzt, gilt der Default des Plugins. Annahme: Dieser kann vom Default bei LiveKit Inference abweichen. Er sollte vor dem Pilot fest gesetzt werden.

## Verworfene Alternativen

- **Nur warten oder LiveKit-Plan erhöhen:** bleibt möglich, ein Wechsel per Secret genügt. Der Owner wollte sofort testen.
- **Code dauerhaft auf OpenAI umstellen:** Der Inference-Weg wäre dann verloren, obwohl er laut Issue #5 der Standard ist.
