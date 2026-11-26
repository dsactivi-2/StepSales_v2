# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung: [SemVer](https://semver.org/lang/de/).

## [Unreleased]

### Added
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
