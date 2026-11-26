# Runbook: Agent auf LiveKit Cloud deployen

**Auslöser:** neue Agent-Version, Secret-Änderung, Wechsel Web-Test → Telefonie.

## Stand (2026-11-26, Issues #26, #28)

| Deployment | Agent-ID | Region | Läuft als | Modus | Config-Datei |
| --- | --- | --- | --- | --- | --- |
| eins (Plan-Grenze) | `CA_hsZnEzmbGUk9` | `eu-central` | `stepsales-gptlive` (`STEPSALES_VARIANT=gptlive`, seit 2026-11-26 `STEPSALES_GPTLIVE_BACKEND=openai`) | Web-Test (kein SIP, simulierte Tools) | `agent/livekit.toml` |

`lk agent status` zeigt in der Spalte „Name“ weiterhin `stepsales-gemini`, den Namen aus der ersten Anlage. Welchen Agent-Namen der Worker tatsächlich anmeldet, steht im Log `registered worker` (`agent_name`).

**GPT-Live über eigenen OpenAI-Key ([ADR-0013](../adr/0013-gptlive-direkt-ueber-openai.md)):** `OPENAI_API_KEY` im Dashboard als Secret eintragen, dann `lk agent update-secrets -y --secrets STEPSALES_GPTLIVE_BACKEND=openai`. Zurück: `…=inference`.

**Inference-Guthaben:** Am 2026-11-26 ist das Realtime-Kontingent des Projekts ausgelaufen (`Realtime (sts) credit quota exhausted`, 429). Ohne Guthaben bricht jede Session sofort ab, auch in der Agent Console. Lösung: Plan erhöhen oder auf den nächsten Abrechnungszyklus warten.

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
| `STEPSALES_GPTLIVE_BACKEND` | `inference` (Default) oder `openai` | wie Web-Test |
| `OPENAI_API_KEY` | Pflicht bei `openai`; nur im Dashboard eintragen (Agents → Agent → Secrets) | wie Web-Test |

Web-Test und SIP-Trunk schließen sich im Code aus (`load_settings` und `_run_call`). Ein Web-Test-Deployment kann daher nie wählen.

**Was deployt wird:** `lk agent deploy` lädt den Inhalt von `agent/` **aus dem lokalen Arbeitsverzeichnis** hoch, nicht aus GitHub. Deshalb immer von `main` deployen, nachdem der PR gemergt ist (`git checkout main && git pull`). Nur für Tests vor dem Merge darf vom Branch deployt werden; das gehört dann in den PR.

## Schritte

1. Unit-Tests: `uv run pytest`, Lint: `uv run ruff check src tests`.
2. Erstes Deployment: `lk agent create -y --region eu-central --config livekit.<variante>.toml --secrets-file <datei> .`
3. Neue Version: `lk agent deploy -y .`
4. Secrets ändern (startet neu): `lk agent update-secrets --secrets-file <datei>`
   - Variante umschalten (nur eine Variante setzen, bestehende Secrets bleiben): `lk agent update-secrets -y --secrets STEPSALES_VARIANT=gptlive`. Danach meldet sich der Agent als `stepsales-gptlive` an.

## Kontrolle danach

- `lk agent status` → `Running`, Name wie erwartet.
- `lk agent logs` → `registered worker`, kein `error initializing process`.
- Sprach-Simulation (läuft komplett in LiveKit Cloud, kostet Inference; `-k 3` = jedes Szenario dreimal):
  `lk agent simulate audio --agent-name stepsales-gptlive --scenarios simulations/webtest.yaml -k 3 --concurrency 2 -y`
  Mit mehr als 2 parallelen Läufen sind auf dieser Instanz Fehler aufgetreten (Agent tritt nicht bei, hört nicht).
- Selbst sprechen: LiveKit-Dashboard → Agents → Agent Console:
  `https://cloud.livekit.io/projects/d_stepsalesv2-walghbs5/agents/console?agentName=stepsales-gptlive&autoStart=false`
  Im Web-Test eröffnet der Agent, sobald du verbunden bist. Der Lead ist fiktiv („TEST Musterbau GmbH“), die Pakete heißen „TEST-Paket S/M“. Es geht keine Mail raus, nichts wird gespeichert.

## Rollback

- `lk agent versions` → Version wählen → `lk agent rollback`. Die Optionen zeigt `lk agent rollback --help`.
- Notfall: `lk agent delete`. Danach ist die Agent-ID weg und es braucht ein neues `create`.

## Eskalation

Startfehler oder fehlerhafte Jobs: Logs sichern (`lk agent logs --log-type=build` für Builds) und im Issue vermerken. Während Stufe 4 bleibt zusätzlich `Config.dial_enabled = false` ([Kill-Switch](kill-switch.md)).
