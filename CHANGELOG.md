# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung: [SemVer](https://semver.org/lang/de/).

## [Unreleased]

### Added
- Claude-Code-Leitplanken (#39): `.claude/settings.json` mit `deny`/`ask`-Regeln für die Freigabe-pflichtigen Aktionen aus AGENTS.md §4. Live-Tests laden `.env` per `uv run --env-file` nur noch für den Testprozess.
- Lead-Pilot (#36): ADR-0014 mit Owner-Entscheidungen (kimeta + meinestadt über Apify, bundesweit) und Berufsfilter aus Indeed Hiring Lab (CC BY 4.0). Filterentwurf `n8n/workflows/config/berufsfilter.json`.
- GPT-Live optional direkt über OpenAI mit eigenem Key: `STEPSALES_GPTLIVE_BACKEND=openai` und `OPENAI_API_KEY` (#30, ADR-0013).
- Agent (#28): menschlichere Sprechweise und aktives Zuhören im Prompt (angelehnt an OpenAI „Prompting GPT-Live“). Pflichtablauf für das Zurücklesen der E-Mail und für das Gesprächsende. DNC-Sicherung im Code (`dnc_guard.py`): Ein ausgesprochener Sperrwunsch wird zu `dnc_requested`, falls das Modell nichts speichert. Automatisches Auflegen nach gespeichertem Ergebnis und 5 s Ruhe (`auto_hangup.py`). Expliziter Eröffnungsanstoß mit KI-Offenlegung. Das Deployment läuft als `stepsales-gptlive`.
- Browser-Testmodus `STEPSALES_WEB_TEST` (#26): kein SIP, kein AMD, simulierte Tools mit fiktiven TEST-Daten, fail-closed gegenüber `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`. Dockerfile für LiveKit Cloud, Runbook `deploy.md`, Sprach-Simulationen `agent/simulations/webtest.yaml`. `stepsales-gemini` in `eu-central` deployt (Web-Test).
- n8n-Workflows auf `n8n.activi.io`, alle inaktiv (#15–#17): Agent-Tools-Webhook, Mail senden, Dispatcher mit Kill-Switch und A/B, Ergebnisabgleich, Follow-up-Sequenz FU1–3, Fehler-Stopp. Quelltexte `n8n/workflows/src/`, ADR-0012, Runbook `kill-switch.md`, Vertragsdetails und Fehlercodes. `schedule_second_call.topic` ist Pflicht (Agent + n8n).
- Agent-Codebasis `agent/` (#11–#14): zwei Varianten (GPT-Live/Gemini) aus einem Code, deutscher Prompt (getrennt Voice/Backend für GPT-Live), 7 Tools gegen n8n-Webhook + EndCallTool, AMD vor dem Gespräch, technischer Ergebnis-Fallback, Zeitlimit, Test-Only-Sperre, Langfuse-Tracing; 50 Unit-Tests, 10 Live-Verhaltenstests.
- Verträge `docs/contracts/` (Dispatch-Metadaten, Tools-Webhook), ADR-0011.
- Airtable-Base „StepSales“ (`appLXW1HK6fe213yO`): 9 Tabellen, Links, Dedupe-Formeln, Config-Startwerte, 10 Mail-Vorlagen, Platzhalter-Pakete, 3 fiktive Test-Leads; Doku `airtable/schema.md` + `schema.json` (#10).
- Projektstruktur: AGENTS.md, ADRs 0001–0009, Issue-/PR-Templates, CODEOWNERS, CONTRIBUTING, SECURITY, Runbook-Ordner.
- Owner-Entscheidungen 11–17 in `docs/PLAN.md`, ADR-0010 (Mail/Kalender konfigurierbar).
- Init: Bauplan, Analyse, Stepsales Agent Pack.

### Tests
- Regression nach #24/#25: E.164-Grenzen, SIP 408, Schema-Vertrag Agent↔Airtable, n8n-Code-Nodes (Kill-Switch, Rabatt, topic, Mail-Idempotenz, Dispatch fail-closed).

### Fixed
- Agent: Entrypoint auf Modulebene. Als Closure war er nicht picklebar, und jeder Job-Prozess scheiterte in LiveKit Cloud (#26).
- Analyse: Gemini 3.8 Live hat über LiveKit Inference einen EU-Endpoint.
