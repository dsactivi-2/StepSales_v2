# Sicherheit

## Secrets

- Nur in `.env` (ignoriert), LiveKit-Cloud-Secrets oder n8n-Credentials. Nie in Code, Issues, PRs, Chats.
- Geleaktes Secret: sofort beim Anbieter rotieren, alten Wert sperren, Issue mit Label `security` anlegen (ohne den Wert).

## Sicherheitsrelevante Regeln

- Zahlungsstatus nur per signaturgeprüftem Stripe-Webhook ([ADR-0006](docs/adr/0006-zahlungsstatus-nur-per-stripe-webhook.md)).
- n8n-Tool-Webhook nur mit Secret-Header ([ADR-0005](docs/adr/0005-agent-tools-ueber-einen-n8n-webhook.md)).
- Agent-Eingaben aus dem Gespräch sind unvertrauenswürdig (Prompt-Injection): n8n validiert jede Eingabe.
- Kill-Switch `Config.dial_enabled`; Fehler stoppen das Wählen (fail-closed).

## Personendaten

Transkripte und Leads liegen in Langfuse und Airtable, nie im Repo. Löschfristen und Zugriffe: offen, siehe `docs/PLAN.md`.

## Meldung

Sicherheitsprobleme direkt an den Owner (@dsactivi-2), nicht öffentlich als Issue mit Details.
