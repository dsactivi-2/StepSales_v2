# AGENTS.md – StepSales v2

Verbindlicher Vertrag für alle Coding-Agents (Claude Code, Codex, Cursor …) und Menschen, die in diesem Repo arbeiten. Tiefere Ordner können eigene `AGENTS.md` haben; die nächstgelegene gilt zusätzlich.

## 1. Projekt in einem Satz

Zwei deutschsprachige Outbound-Telesales-Voice-Agents für **StepSales** verkaufen Multiposting-Pakete an Firmen mit frischen Stellenanzeigen. Laufzeit: LiveKit Cloud; Steuerung: n8n (`n8n.activi.io`); Datenspeicher: Airtable.

| Agent | Modell | LiveKit-Agent-Name |
| --- | --- | --- |
| A | OpenAI `gpt-live-1` | `stepsales-gptlive` |
| B | Google `gemini-3.8-live` | `stepsales-gemini` |

Gleiche Aufgabe, gleiche Tools, gleicher Prompt, gleicher Lead-Pool. Unterschied nur im Modell (A/B-Vergleich, [ADR-0003](docs/adr/0003-zwei-agents-eine-codebasis.md)).

## 2. Wahrheitsquellen (in dieser Reihenfolge)

1. Entscheidungen des Owners (Denis) in Issues/PRs und `docs/adr/`
2. `docs/PLAN.md` – Bauplan, Stufen, offene Punkte
3. `docs/agent-pack/00–07` – fachliche Aufgabe (Verkaufsprozess, Regeln, Tools, CRM-Status, Persona)
4. Offizielle Doku (LiveKit, OpenAI, Google, n8n, Stripe, Airtable) – **immer live nachschlagen**, nie aus dem Gedächtnis

`docs/agent-pack/08–11` beschreiben das alte Dograh-Ziel und sind nur Hintergrund.

## 3. Struktur

```
AGENTS.md            dieser Vertrag (CLAUDE.md verweist hierher)
README.md            Kurzüberblick
docs/PLAN.md         Bauplan + Stufen + offene Punkte
docs/analysis.md     Verifizierung, Lücken, Risiken
docs/adr/            Architecture Decision Records (NNNN-titel.md)
docs/agent-pack/     Fachliche Aufgabe
docs/runbooks/       Betrieb: Kill-Switch, Deploy, Rollback, Incidents
.github/             Issue-/PR-Templates, CODEOWNERS
agent/               Python-Code LiveKit Agents (beide Varianten, Tests)
docs/contracts/      Schnittstellen n8n ↔ Agent (Dispatch-Metadaten, Tools-Webhook)
n8n/workflows/       n8n-Workflows als SDK-Quelltext (src/), ohne Credentials; README mit IDs + Aktivierung
airtable/            Schema der Base „StepSales“ (schema.md + schema.json mit Feld-IDs)
```

Neue Top-Level-Ordner nur mit ADR oder Freigabe im Issue.

## 4. Arbeitsweise (Pflicht)

### Phasen und Freigaben

- Gearbeitet wird in den Stufen aus `docs/PLAN.md`. Eine Stufe beginnt erst nach explizitem **„bestätige“** des Owners.
- **Ohne Freigabe nie:** Deploy auf LiveKit Cloud, Aktivieren eines n8n-Workflows, echte Anrufe an externe Nummern, Stripe-Live-Modus, Schreiben in Produktions-Airtable, Löschen von Daten, Force-Push.
- Unklare Anforderung, Ownership oder Erfolgskriterien → **fragen und warten**. Keine Geschäftsregeln, Preise, Paketinhalte, Rufnummern, Rechtsgrundlagen oder Umgebungswerte erfinden.

### Verifikation vor Aktion

- Modell-IDs, SDK-APIs, Plugin-Parameter, n8n-Nodes und Preise aus der aktuellen offiziellen Quelle bestätigen (LiveKit: Docs-MCP `https://docs.livekit.io/mcp` oder `lk docs`; n8n: MCP `get_workflow_sdk_reference`/`search_nodes`).
- Nie aus Metadaten, Dateinamen oder Erinnerung schließen. Was nicht verifiziert ist, im PR als Annahme markieren.

### Issues, Branches, Commits, PRs

- Jede Arbeit hat ein GitHub-Issue (Templates unter `.github/ISSUE_TEMPLATE/`). Labels: `stage:*`, `area:*`, `type:*`, `prio:*`.
- Branch: `<type>/<issue-nr>-<kurz>` (z. B. `feat/12-airtable-schema`).
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- `main` nur per PR. PR-Template ausfüllen: Was, Warum, Wie getestet, Risiken, Rollback, Doku aktualisiert.

### Definition of Done

- [ ] Akzeptanzkriterien des Issues erfüllt und geprüft (Befehl/Ergebnis im PR)
- [ ] Tests grün (sobald Code existiert)
- [ ] Doku im selben PR aktualisiert (siehe §6)
- [ ] Keine Secrets, keine echten Personendaten im Diff
- [ ] Offene Risiken und nächster Schritt im PR benannt

## 5. Fachliche Leitplanken (nicht verhandelbar)

- **Sprache:** Agents sprechen Deutsch (Sie-Form, B2B). Repo-Doku Deutsch; Code, Bezeichner und Commit-Typen Englisch.
- **KI-Offenlegung:** Eröffnung nennt StepSales, Anrufgrund und dass ein KI-Assistent spricht (EU AI Act Art. 50).
- **Gesprächsstil:** eine Frage pro Turn, kurze Sätze, nie Rabatt als Einstieg, immer genau ein nächster Schritt (`agent-pack/01`, `02`, `07`).
- **Keine erfundenen Fakten:** Pakete, Portale, Preise, Laufzeiten nur aus dem Tool `get_packages` (Airtable `Pakete`, [ADR-0009](docs/adr/0009-pakete-in-airtable.md)).
- **Preis und Rabatt** berechnet ausschließlich n8n; Rabatt ≤ `max_rabatt_prozent` des Pakets (Default 10 %), Begründung Pflicht.
- **„Bezahlt“** setzt nur der Stripe-Webhook; `mark_payment_received` ist **kein** Agent-Tool ([ADR-0006](docs/adr/0006-zahlungsstatus-nur-per-stripe-webhook.md)).
- **E-Mail** vor jedem Versand im Gespräch bestätigen lassen.
- **„Kein Interesse“ / „nicht mehr anrufen“** → höflich beenden, Lead auf `dnc`, nie erneut wählen.
- **Wählen** nur über den Dispatcher mit Kill-Switch `Config.dial_enabled`, Anrufzeiten Mo–Fr (Europe/Berlin), Max-Versuche, fail-closed bei Fehlern.

## 6. Dokumentation mitliefern

| Geändert | Auch aktualisieren |
| --- | --- |
| Architektur, Stack, Datenfluss, Anbieter | neues ADR in `docs/adr/` (+ `docs/PLAN.md` falls Plan betroffen) |
| Agent-Prompt, Persona, Gesprächsregeln | `agent/` Prompt-Datei + §5 falls Regel neu |
| Agent-Tool (Name, Ein-/Ausgabe) | Tool-Tabelle in `docs/PLAN.md` + n8n-Webhook + Tests |
| Airtable-Schema | `airtable/schema.md` |
| n8n-Workflow | Quelltext in `n8n/workflows/src/` + `n8n/workflows/README.md` + Beschreibung im Workflow |
| Betrieb (Deploy, Kill-Switch, Rollback) | `docs/runbooks/` |
| Release | `CHANGELOG.md` |

Code ohne Doku ist nicht fertig.

## 7. Secrets und Daten

- Secrets nur in `.env` (git-ignoriert), LiveKit-Cloud-Secrets, n8n-Credentials. `.env.example` enthält nur Namen.
- n8n-Exporte ohne Credential-Daten committen; Webhook-Secrets nie im Klartext.
- Keine echten Leads, Telefonnummern, E-Mails oder Transkripte im Repo; Testdaten klar als fiktiv kennzeichnen.
- Geleakte Secrets sofort rotieren und im Issue vermerken (siehe `SECURITY.md`).

## 8. Befehle

Alle Befehle im Ordner `agent/` (Python 3.12/3.13, [uv](https://docs.astral.sh/uv/)):

| Zweck | Befehl |
| --- | --- |
| Setup | `uv sync` |
| Unit-Tests (ohne Netz, jeder Commit) | `uv run pytest` |
| Einmalig für n8n-Code-Node-Tests (sonst übersprungen) | `cd ../n8n/workflows && npm ci --ignore-scripts` |
| Verhaltenstests mit echtem Modell (kostet Inference) | `set -a; . ../.env; set +a; uv run pytest -m live` |
| Lint / Format | `uv run ruff check src tests` · `uv run ruff format src tests` |
| Agent-Worker lokal (registriert sich bei LiveKit Cloud) | `STEPSALES_VARIANT=gemini uv run python -m stepsales_agent.main dev` |
| Deploy / Sprach-Simulation (LiveKit Cloud) | siehe [`docs/runbooks/deploy.md`](docs/runbooks/deploy.md) |

- `console`-Modus geht nicht: der Agent braucht einen SIP-Teilnehmer (AMD). Ohne Telefon testen: `STEPSALES_WEB_TEST=true` (simulierte Tools, kein SIP) und Agent Console bzw. `lk agent simulate` ([Runbook](docs/runbooks/deploy.md)). Telefontests: Stufe 4, nur interne Nummern.
- Live-Tests: Gemini läuft als echtes Modell im Textmodus; GPT-Live ist audio-only, getestet wird dort sein Backend-Modell (siehe `agent/tests/test_behavior_live.py`).
- Deploy auf LiveKit Cloud: Stufe 4, erst nach „bestätige“.

## 9. Übergabe am Ende jeder Session

Im PR oder Issue: Was gebaut · Doku aktualisiert · wie verifiziert · Restrisiken · nächster Schritt für den Owner.
