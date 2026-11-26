# StepSales v2 – Bauplan

Stand: 2026-11-26 · Status: **Stufe 1–2 fertig, Stufe 3 im Review (n8n-Workflows, inaktiv)**

## Ziel

Zwei deutschsprachige Outbound-Telesales-Voice-Agents auf LiveKit Cloud, die Multiposting-Pakete an Firmen mit frischen Stellenanzeigen verkaufen (Aufgabe: `docs/agent-pack/00–07`). Beide Agents haben dieselbe Aufgabe, dieselben Tools und denselben Lead-Pool; nur das Sprachmodell unterscheidet sich (A/B-Vergleich).

| Agent | Modell | LiveKit-Agent-Name |
| --- | --- | --- |
| A | OpenAI `gpt-live-1` (Vollduplex) | `stepsales-gptlive` |
| B | Google `gemini-3.8-live` | `stepsales-gemini` |

## Entscheidungen (von Denis, 2026-11-25)

| # | Thema | Entscheidung |
| --- | --- | --- |
| 1 | Gemini-Modell | `gemini-3.8-live` |
| 2 | Datenspeicher | Airtable + n8n (`n8n.activi.io`) |
| 3 | Leads | Firmen werden später generiert; Schema jetzt, Import später |
| 4 | Telefonie | LiveKit SIP → FreeSWITCH/FusionPBX `fusion.activi.io` → sipgate |
| 5 | Pakete | Leicht änderbar, ohne Code-Deploy |
| 6 | Absender | Firma „StepSales“; Agent-Name von Claude; Berliner Festnetznummer folgt |
| 7 | Zahlung | Stripe |
| 8 | LiveKit | Neues Cloud-Projekt nur für StepSales |
| 9 | Tracing | Langfuse, inkl. Transkripte |
| 10 | Lead-Verteilung | Beide Agents aus demselben Pool (Zufallsaufteilung) |
| 11 | Mail | Absender, Dienst und Texte leicht änder- und anpassbar ([ADR-0010](adr/0010-mail-und-kalender-konfigurierbar.md)) |
| 12 | Zweittermin | Kalender und Durchführung (Mensch/Agent) konfigurierbar ([ADR-0010](adr/0010-mail-und-kalender-konfigurierbar.md)) |
| 13 | Rechtsgrundlage Kaltanrufe (UWG §7) | Vom Owner geklärt (2026-11-25) |
| 14 | Langfuse | Cloud EU (`cloud.langfuse.com`, AWS eu-west-1), Projekt „stepsales“ |
| 15 | Modellzugang | LiveKit Inference |
| 16 | Persona | „Lena Berger, StepSales“ für beide Agents |
| 17 | LiveKit | Projekt `p_5dj6vv0ce47`, `wss://stepsalesv2-walghbs5.livekit.cloud` |

## Architektur

```
Airtable (Base "StepSales")  <──>  n8n.activi.io
   Leads, Pakete, Config,             1 Dispatcher ──► LiveKit Dispatch + SIP ──► FusionPBX ──► sipgate ──► Kunde
   Anrufe, Angebote,                  2 Agent-Tools-Webhook  ◄── Tool-Calls der Agents
   Zahlungen, Follow-ups              3 Stripe-Webhook (paid → Post-Sale)
                                      4 Follow-up-Sequenz (FU 1–3)
                                      5 Ergebnisabgleich
                                      6 Fehler-Stopp (Kill-Switch fail-closed)

LiveKit Cloud (Projekt "StepSales")
   ein Python-Codebase, zwei Agent-Namen → Modellwahl per Agent-Name
   Langfuse-Tracing (OpenTelemetry)
```

### Pakete leicht änderbar (Entscheidung 5)

- Tabelle `Pakete` in Airtable: `paket_id`, `name`, `leistungen` (Kurztext für den Agenten), `portale`, `laufzeit_tage`, `listenpreis_eur_netto`, `max_rabatt_prozent`, `empfehlen_wenn`, `aktiv`.
- Der Agent lädt beim Gesprächsstart nur aktive Pakete über das Tool `get_packages` und nennt nichts, was dort nicht steht.
- Endpreis und Rabattgrenze rechnet **n8n**, nie der Agent. Änderung in Airtable wirkt beim nächsten Anruf, ohne Deploy.

### Agent-Tools (über einen n8n-Webhook, Auth per Secret-Header)

Verbindlicher Vertrag mit allen Argumenten: [docs/contracts/tools-webhook.md](contracts/tools-webhook.md). n8n-Umsetzung: [n8n/workflows/README.md](../n8n/workflows/README.md).
Anrufstart durch n8n: [docs/contracts/dispatch-metadata.md](contracts/dispatch-metadata.md).

| Tool | Zweck | Schreibt in |
| --- | --- | --- |
| `get_packages` | Aktive Pakete + Preise laden | – |
| `qualify_lead` | Qualifizierung + Score | Leads |
| `create_offer` | Angebot, Rabatt ≤ Paketgrenze, Preis serverseitig | Angebote |
| `send_followup` | Angebot/Recap/Material per Mail (E-Mail vorher bestätigt) | Follow-ups |
| `schedule_second_call` | Zweittermin | Termine |
| `send_payment_link` | Stripe-Checkout erzeugen + per Mail senden (bis Stufe 5: `payment_not_enabled`) | Zahlungen |
| `log_call_outcome` | Pflicht am Gesprächsende (sonst technischer Fallback durch Code) | Anrufe |
| `end_call` | Auflegen (LiveKit EndCallTool, kein Webhook) | – |

**Bewusst kein Agent-Tool:** `mark_payment_received`. Den Status „bezahlt“ setzt nur der Stripe-Webhook.

### Gesprächs- und Sicherheitsregeln

- Eröffnung nennt StepSales, den Grund des Anrufs und dass ein KI-Assistent spricht (EU AI Act Art. 50).
- Eine Frage pro Turn, kurze Sätze, nie Rabatt als Einstieg, immer ein konkreter nächster Schritt (`docs/agent-pack/01, 07`).
- Bei „kein Interesse“ / „nicht mehr anrufen“: höflich beenden, Lead auf DNC.
- Harte Grenzen: max. Gesprächsdauer, Anrufzeiten Mo–Fr in Berliner Zeit, max. Versuche je Lead, Kill-Switch `dial_enabled` in Config.

### Airtable-Base „StepSales“ (Entwurf)

`Leads` · `Pakete` · `Anrufe` · `Angebote` · `Zahlungen` · `Follow-ups` · `Termine` · `Config`.
Lead-Status aus `docs/agent-pack/05`: new → reached → qualified → proposal_pending → second_call_scheduled → negotiating → verbally_closed → payment_pending → paid → onboarding_pending → fulfilled · closed_lost · no_fit · dnc.

## Stufen (jede nur nach „bestätige“)

| Stufe | Inhalt | Freigabe-Kriterium |
| --- | --- | --- |
| 0 | Init-Commit (Docs, Plan) | Push-Zugriff steht |
| 1 | Airtable-Base + Pakete-Platzhalter | Schema abgenommen |
| 2 | Agent-Code (beide Modelle), lokale Tests + Text-Simulationen | Tests grün |
| 3 | n8n-Workflows inaktiv anlegen, Tool-Webhook gegen Testdaten | Tool-Antworten korrekt |
| 4 | Deploy LiveKit Cloud, SIP-Trunk, nur interne Testnummern | Testanrufe ok, Langfuse-Traces da |
| 5 | Stripe Testmodus → Live | Zahlung end-to-end im Testmodus |
| 6 | Pilot mit wenigen echten Leads | Ergebnisse geprüft |

## Offene Punkte

000. **Neu aus #26/#28 (Deploy Web-Test):** Der LiveKit-Plan erlaubt nur 1 Agent (`1/1`). Das Deployment läuft jetzt als GPT-Live. Für A/B parallel muss der Plan erhöht werden ([Runbook](runbooks/deploy.md)). **Das Inference-Guthaben ist aufgebraucht** (429): ohne Plan-Upgrade oder neuen Abrechnungszyklus gibt es keine Gespräche. Gelöst in #28: E-Mail wird zurückgelesen, Abschluss mit nächstem Schritt, DNC-Sicherung im Code, automatisches Auflegen, KI-Offenlegung beim Anstoß durch den Code. Offen: Soll eine zugesagte Rückmeldung nach einem Angebot als Zweittermin (`schedule_second_call`) eingetragen werden oder reicht die Follow-up-Sequenz in n8n?

00. **Neu aus Stufe 3:** n8n-Credentials anlegen (StepSales Airtable/Gmail/Google Calendar/Tools Secret/LiveKit) – n8n hat beim Anlegen Lina-Credentials zugewiesen, die vor der Aktivierung ersetzt werden müssen. `Config.livekit_api_key` und `mail_signatur` eintragen. Airtable-Plan prüfen (Monatskontingent API-Aufrufe). Feiertage als `Config.sperrtage`? Feld für `current_channels`?

0. **Neu aus Stufe 2:** Mailbox – Nachricht hinterlassen oder auflegen (aktuell: auflegen, ADR-0011)? LiveKit-Projekt mit EU-Datenregion angelegt (nicht nachträglich änderbar)? Deploy-Region `eu-central`?

1. Mail: Standard-Dienst und Absender-Adresse für den Start (austauschbar, ADR-0010) – Issue #1
2. Kalender: Standard (z. B. Google Calendar) und Default Mensch/Agent – Issue #2
3. Langfuse: Löschfrist und Zugriffsrechte für Transkripte – Issue #4
4. Paketinhalte – Issue #8 (bis dahin Platzhalter, keine echten Anrufe)
5. Berliner Rufnummer / sipgate-CLI – Issue #9
