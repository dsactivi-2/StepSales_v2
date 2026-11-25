# StepSales v2

Deutschsprachige KI-Telesales-Agents für Multiposting-Pakete auf **LiveKit Cloud**, gesteuert über **n8n** mit **Airtable** als Datenspeicher.

- Agent A: OpenAI `gpt-live-1`
- Agent B: Google `gemini-3.8-live`
- Beide: gleiche Aufgabe, gleiche Tools, gleicher Lead-Pool (A/B-Vergleich)

## Inhalt

| Pfad | Inhalt |
| --- | --- |
| `docs/PLAN.md` | Bauplan, Entscheidungen, Stufen, offene Punkte |
| `docs/analysis.md` | Modell-Verifizierung, Lücken, Risiken |
| `docs/adr/` | Architekturentscheidungen |
| `airtable/` | Schema der Airtable-Base „StepSales“ |
| `AGENTS.md` | Regeln für Coding-Agents und Mitarbeit |
| `docs/agent-pack/` | Fachliche Aufgabe (Stepsales Agent Pack 00–11) |
| `.env.example` | Benötigte Umgebungsvariablen (ohne Werte) |

## Status

Planung. Code folgt nach Freigabe von `docs/PLAN.md`.

Secrets gehören nie ins Repo – nur in `.env` (ignoriert) bzw. LiveKit-/n8n-Secrets.
