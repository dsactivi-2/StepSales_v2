# ADR-0010: Mail und Kalender konfigurierbar statt fest verdrahtet

- **Status:** Vorgeschlagen (Anforderung Owner, 2026-11-25)
- **Datum:** 2026-11-25

## Kontext

Der Owner will Absender, Mail-Dienst und Mail-Texte sowie Kalender und Durchführung des Zweittermins (Mensch oder Agent) leicht ändern können, ohne Code-Deploy.

## Entscheidung

- **Mail:** Airtable-Tabelle `Mail-Vorlagen` (vorlage_id, zweck, betreff, text mit Platzhaltern wie `{{firma}}`, `{{paket}}`, `{{link}}`, aktiv) und `Config` (absender_name, absender_adresse, mail_dienst). Ein n8n-Subworkflow „Mail senden“ liest Vorlage + Config, ersetzt Platzhalter und verzweigt je `mail_dienst` auf den passenden Node (z. B. Gmail, SMTP, Brevo). Agent und andere Workflows rufen nur diesen Subworkflow.
- **Kalender:** `Config.kalender_dienst`, `Config.kalender_id`, `Config.zweittermin_durch` (`mensch` | `agent`), `Config.termin_dauer_min`, Zeitfenster. Ein n8n-Subworkflow „Termin buchen“ kapselt den Dienst. Bei `mensch` erhält der zuständige Mitarbeiter Termin + Lead-Zusammenfassung; bei `agent` plant der Dispatcher einen Rückruf zum Termin.

## Konsequenzen

Wechsel von Dienst, Absender, Text oder Ablauf = Änderung in Airtable (+ einmalig Credential in n8n für einen neuen Dienst). Ein Platzhalter ohne Wert blockiert den Versand (kein halb gefülltes Mail). Für den Start muss je ein Standard-Dienst festgelegt werden.

## Verworfene Alternativen

Mail-Texte im Agent-Prompt oder fest im n8n-Node (Änderung nur durch Entwickler).
