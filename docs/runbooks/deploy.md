# Runbook: Agent auf LiveKit Cloud deployen

**Auslöser:** neue Agent-Version, Secret-Änderung, Wechsel Web-Test → Telefonie.

## Stand (2026-11-26, Issue #26)

| Agent | Agent-ID | Region | Modus | Config-Datei |
| --- | --- | --- | --- | --- |
| `stepsales-gemini` | `CA_hsZnEzmbGUk9` | `eu-central` | Web-Test (kein SIP, simulierte Tools) | `agent/livekit.gemini.toml` |
| `stepsales-gptlive` | – | – | nicht deployt | – |

**Grenze des LiveKit-Plans:** Das Projekt erlaubt derzeit **1 Agent** (`maximum number of agents reached (1/1)`). Für den A/B-Betrieb mit zwei gleichzeitig laufenden Agents braucht es einen höheren Plan (offener Punkt in `docs/PLAN.md`). Bis dahin lässt sich das eine Deployment zwischen den Varianten umschalten (unten).

## Voraussetzungen

- LiveKit CLI ≥ 2.20 (`lk --version`), Projekt verbunden: `lk cloud auth` (Browser) oder `lk project add <name> --url … --api-key … --api-secret … --default`.
- Befehle im Ordner `agent/`. `LIVEKIT_URL`, `LIVEKIT_API_KEY` und `LIVEKIT_API_SECRET` setzt LiveKit Cloud im Container selbst (docs.livekit.io/deploy/agents/builds/).
- Secrets nie ins Repo: Secrets-Datei außerhalb des Repos anlegen (`umask 077`) und nach dem Deploy löschen.

## Secrets je Modus

| Variable | Web-Test | Telefonie (Stufe 4) |
| --- | --- | --- |
| `STEPSALES_VARIANT` | `gemini` oder `gptlive` | `gemini` oder `gptlive` |
| `STEPSALES_WEB_TEST` | `true` | weglassen |
| `STEPSALES_TEST_CALLS_ONLY` | `true` | `true` bis zum Pilot |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` | **nicht setzen** (sonst Startfehler) | Pflicht |
| `N8N_TOOLS_WEBHOOK_URL` / `_SECRET` | nicht nötig | Pflicht |
| `LANGFUSE_BASE_URL` / `_PUBLIC_KEY` / `_SECRET_KEY` | optional | empfohlen |

Web-Test und SIP-Trunk schließen sich im Code aus (`load_settings` und `_run_call`). Ein Web-Test-Deployment kann daher nie wählen.

## Schritte

1. Unit-Tests: `uv run pytest`, Lint: `uv run ruff check src tests`.
2. Erstes Deployment: `lk agent create -y --region eu-central --config livekit.<variante>.toml --secrets-file <datei> .`
3. Neue Version: `lk agent deploy -y --config livekit.gemini.toml .`
4. Secrets ändern (startet neu): `lk agent update-secrets --config livekit.gemini.toml --secrets-file <datei>`
   - Variante umschalten: `STEPSALES_VARIANT=gptlive` setzen. Der Agent meldet sich dann als `stepsales-gptlive` an. `livekit.gemini.toml` verweist weiter auf dieselbe Agent-ID.

## Kontrolle danach

- `lk agent status --config livekit.gemini.toml` → `Running`, Name wie erwartet.
- `lk agent logs --config livekit.gemini.toml` → `registered worker`, kein `error initializing process`.
- Sprach-Simulation (läuft komplett in LiveKit Cloud, kostet Inference):
  `lk agent simulate audio --agent-name stepsales-gemini --scenarios simulations/webtest.yaml -y`
- Selbst sprechen: LiveKit-Dashboard → Agents → Agent Console:
  `https://cloud.livekit.io/projects/d_stepsalesv2-walghbs5/agents/console?agentName=stepsales-gemini&autoStart=false`
  Im Web-Test eröffnet der Agent, sobald du verbunden bist. Der Lead ist fiktiv („TEST Musterbau GmbH“), die Pakete heißen „TEST-Paket S/M“. Es geht keine Mail raus, nichts wird gespeichert.

## Rollback

- `lk agent versions --config livekit.gemini.toml` → Version wählen → `lk agent rollback --config livekit.gemini.toml`. Die Optionen zeigt `lk agent rollback --help`.
- Notfall: `lk agent delete --config livekit.gemini.toml`. Danach ist die Agent-ID weg und es braucht ein neues `create`.

## Eskalation

Startfehler oder fehlerhafte Jobs: Logs sichern (`lk agent logs --log-type=build` für Builds) und im Issue vermerken. Während Stufe 4 bleibt zusätzlich `Config.dial_enabled = false` ([Kill-Switch](kill-switch.md)).
