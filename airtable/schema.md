# Airtable-Base „StepSales“

- **Base-ID:** `appLXW1HK6fe213yO` (Workspace `wsp776xCeBFbhigym` „Workspace“)
- **Maschinenlesbar mit allen Feld-IDs:** [`schema.json`](schema.json) – n8n adressiert Felder per ID, nicht per Name.
- **Stand:** 2026-11-25 (Issue #10)
- **Entscheidungen:** [ADR-0004](../docs/adr/0004-airtable-und-n8n-als-system-of-record.md), [ADR-0006](../docs/adr/0006-zahlungsstatus-nur-per-stripe-webhook.md), [ADR-0009](../docs/adr/0009-pakete-in-airtable.md), [ADR-0010](../docs/adr/0010-mail-und-kalender-konfigurierbar.md)

## Beziehungen

```
Pakete ─┬─< Angebote >─┬── Leads ──< Anrufe
        │              ├─< Zahlungen        │
        └── Leads      └─< Follow-ups >── Mail-Vorlagen
                                            
Leads ──< Termine >── Anrufe (Erstgespräch)
Config: Schlüssel/Wert, keine Links
```

Alle Links sind Airtable-`multipleRecordLinks`; n8n schreibt pro Link genau einen Datensatz.

## Tabellen

| Tabelle | ID | Zweck | Schreibt |
| --- | --- | --- | --- |
| Leads | `tblaT64e3mBSfULhx` | Firma, Ansprechpartner, Qualifizierung, Status, Wähl-Steuerung | Import (später), n8n Tools, Dispatcher |
| Pakete | `tblKplkdKcvxC3Lvy` | Verkaufbare Pakete, Preise, Rabattgrenze | Owner (manuell) |
| Anrufe | `tblOX9jhoT5mr49jh` | Ein Datensatz je Anrufversuch | Dispatcher, `log_call_outcome` |
| Angebote | `tblysTSwcnTCjcd9p` | Angebote inkl. serverseitigem Endpreis | `create_offer` |
| Zahlungen | `tbltUaSlEoArrQpgW` | Stripe-Checkouts, Status | `send_payment_link`, Stripe-Webhook |
| Follow-ups | `tblTnWina3R6xUidx` | Jede ausgehende Mail | Subworkflow „Mail senden“, FU-Sequenz |
| Termine | `tbl4lisj3qqeg8fwV` | Zweittermine | `schedule_second_call` |
| Mail-Vorlagen | `tblLxwddcbRNedW31` | Betreff/Text mit Platzhaltern | Owner (manuell) |
| Config | `tblF7wK3OESuyDoFJ` | Schlüssel/Wert-Einstellungen | Owner (manuell), Fehler-Stopp (`dial_enabled`) |

## Status-Werte

| Feld | Werte |
| --- | --- |
| Leads.Status | new · reached · qualified · proposal_pending · second_call_scheduled · negotiating · verbally_closed · payment_pending · paid · onboarding_pending · fulfilled · closed_lost · no_fit · dnc |
| Leads.Nächster Schritt | closed · second_appointment_booked · offer_promised · material_promised · callback_agreed · no_fit · no_interest (agent-pack/02) |
| Anrufe.Ergebnis | wie „Nächster Schritt“ + dnc_requested · wrong_person · voicemail · no_answer · failed |
| Angebote.Status | draft · sent · accepted · payment_pending · paid · rejected · expired |
| Zahlungen.Status | pending · paid · failed · expired · refunded · amount_mismatch |
| Follow-ups.Status | planned · sent · failed · cancelled |
| Termine.Status | scheduled · done · no_show · rescheduled · cancelled |

## Regeln für n8n (verbindlich)

1. **Dedupe:** Vor dem Anlegen eines Leads nach `Telefon normalisiert` und `E-Mail normalisiert` suchen; Treffer → aktualisieren statt neu anlegen. Telefon immer in E.164 speichern.
2. **Wählbar nur wenn:** `Wählbar` = an, `DNC` = aus, `Status` nicht in {paid, onboarding_pending, fulfilled, closed_lost, no_fit, dnc}, `Versuche` < `max_attempts`, `Nächster Versuch` leer oder ≤ jetzt, `Reserviert bis` leer oder abgelaufen, Telefon vorhanden.
3. **Testbetrieb:** `Config.test_mode` = `true` → nur Leads mit `Testdaten` = an. Solange ein aktives Paket `Platzhalter` = an ist oder `Config.anzeigenummer` leer ist, keine Leads ohne `Testdaten`.
4. **A/B:** `Leads.Agent` wird beim ersten Wählen gesetzt (Anteil `ab_split_gptlive_percent`) und danach nie geändert.
5. **Status-Downgrade verboten:** Re-Qualifizierung setzt Status nur, wenn der aktuelle Status new/reached/qualified ist.
6. **Idempotenz:** `Anrufe.Call-ID`, `Zahlungen.Stripe Event-ID`, `Follow-ups.FU-ID` sind eindeutig; vor dem Schreiben prüfen.
7. **Zahlung:** `Zahlungen.Status` = `paid` nur vom Stripe-Webhook, nur wenn `Betrag erhalten` = `Betrag erwartet`; sonst `amount_mismatch` + Meldung.
8. **Prozentfelder** (`Max Rabatt`, `Rabatt`) speichern Brüche: 0.1 = 10 %.
9. **Mail-Versand blockiert**, wenn ein Platzhalter der Vorlage keinen Wert hat (inkl. `{{signatur}}` aus `Config.mail_signatur`).

## Config-Schlüssel

| Schlüssel | Startwert | Bedeutung |
| --- | --- | --- |
| dial_enabled | false | Kill-Switch |
| test_mode | true | Nur Testdaten-Leads wählen |
| timezone | Europe/Berlin | |
| call_days | 1,2,3,4,5 | Mo–Fr |
| call_window_start / _end | 09:00 / 17:00 | Anrufbeginn-Fenster |
| max_attempts | 3 | Versuche ohne Gespräch |
| retry_hours | 24 | Abstand zwischen Versuchen |
| max_parallel_calls | 1 | Gleichzeitige Anrufe |
| max_call_seconds | 600 | Harte Gesprächsgrenze |
| ab_split_gptlive_percent | 50 | A/B-Anteil GPT-Live |
| default_max_rabatt_prozent | 10 | Fallback |
| firma_name | StepSales | |
| agent_persona | Lena Berger | |
| anzeigenummer | *(leer)* | Berliner Nummer, Issue #9 |
| mail_dienst | gmail | ADR-0010 |
| absender_name | Lena Berger \| StepSales | |
| absender_adresse | ds.selmanovic@gmail.com | Issue #1 |
| mail_signatur | *(leer → Versand blockiert)* | Signatur/Impressum, offen |
| mail_bcc_intern | *(leer)* | optional |
| kalender_dienst | google_calendar | ADR-0010 |
| kalender_id | ds.selmanovic@gmail.com | Issue #2 |
| zweittermin_durch | agent | Issue #2 |
| termin_dauer_min | 20 | |
| angebot_gueltig_tage | 7 | |
| fu_abstand_tage | 2,4,7 | FU1–FU3 nach Angebot |

Werte `termin_dauer_min`, `angebot_gueltig_tage`, `fu_abstand_tage`, `max_call_seconds`, Anrufzeiten sind **Startannahmen** von Claude und jederzeit in Airtable änderbar.

## Startdaten

- **Pakete:** MULTI_S 790 €, MULTI_M 1490 €, MULTI_L 2490 € (Preise aus v1), Max Rabatt 10 %, alle `Platzhalter` = an. Leistungen/Portale/Laufzeit offen (Issue #8).
- **Mail-Vorlagen:** 10 deutsche Entwürfe (offer, recap, material, fu1–fu3, payment_link, payment_confirmation, post_sale_request, appointment_confirmation), frei editierbar.
- **Leads:** 3 fiktive Test-Leads („TEST …“, `@example.com`, ohne Telefonnummer, `Wählbar` = aus, `Testdaten` = an). Für Testanrufe interne Testnummern eintragen.

## Offen

- Paketinhalte (#8), Anzeigenummer (#9), Mail-Signatur/Impressum, Löschfrist Transkripte (#4).
- Airtable-Token für n8n: Owner legt einen Personal Access Token mit Zugriff nur auf diese Base an und hinterlegt ihn als n8n-Credential (Stufe 3).
