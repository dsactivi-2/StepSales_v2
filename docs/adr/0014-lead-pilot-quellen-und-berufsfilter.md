# ADR-0014: Lead-Pilot – Quellen und Berufsfilter

- **Status:** Vorgeschlagen (Owner-Entscheidungen F1–F3 vom 2026-11-26 eingearbeitet; Filterliste wartet auf Freigabe)
- **Datum:** 2026-11-26
- **Issue:** #36

## Kontext

Für den Pilot brauchen wir Firmen mit frischen Stellenanzeigen und einer Kontaktperson aus der Anzeige. Der Owner hat entschieden:

| Punkt | Entscheidung |
| --- | --- |
| F1 Recht | Ohne Anwaltsprüfung. Argumentation: Eine aktuelle Stellenanzeige zeigt konkreten Bedarf, die Firma nutzt solche Dienste bereits (mutmaßliche Einwilligung, UWG § 7 Abs. 2 Nr. 1). Kontakt nur aus der Anzeige selbst, nicht aus dem Impressum. |
| F2 Quellen | kimeta.de und meinestadt.de über Apify |
| F3 Region / Filter | Bundesweit, kein Regionsfilter. Filter nach Berufen: gefragte, schwer zu besetzende kaufmännische Berufe (White-Collar) |
| Anbindung | Apify-API direkt per n8n HTTP Request (keine Community-Node) |

Die BA-Engpassanalyse lehnt der Owner als zu alt ab. Gesucht war eine aktuelle, kostenlose, zuverlässige Quelle mit wenig Aufwand.

## Entscheidung

**Datenbasis: Indeed Hiring Lab, Datei `DE/job_postings_by_sector_DE.csv`** im Repo [`hiring-lab/job_postings_tracker`](https://github.com/hiring-lab/job_postings_tracker).

Verifiziert am 2026-11-26:

- Tageswerte, wöchentlich aktualisiert; letzter Datenpunkt 2026-11-13.
- Lizenz CC BY 4.0. Nutzung erlaubt, Quellenangabe „Indeed Hiring Lab“ ist Pflicht.
- Werte sind ein Index (1.2.2020 = 100), saisonbereinigt, je Sektor getrennt für `total postings` (alle offenen) und `new postings` (neu geschaltete). Es sind **keine absoluten Stellenzahlen**.

**Methode (Annahme, kein offizieller Indeed-Indikator):**
Verhältnis `total / new` je Sektor. Liegt es über 1, sind im Verhältnis zu 2020 mehr Anzeigen online, als neu dazukommen. Anzeigen bleiben also länger stehen. Das werten wir als Signal für „schwer zu besetzen“.

Stand 2026-11-13, kaufmännische Sektoren:

| Sektor (Indeed) | total | neu | total/neu | total ggü. Vorjahr |
| --- | ---: | ---: | ---: | ---: |
| Insurance | 91,5 | 54,8 | **1,67** | −11,7 % |
| Accounting | 122,2 | 100,9 | **1,21** | −11,3 % |
| Banking & Finance | 102,6 | 89,8 | **1,14** | +0,1 % |
| Administrative Assistance | 100,9 | 92,7 | **1,09** | −16,0 % |
| Customer Service | 68,3 | 62,8 | 1,09 | −24,6 % |
| Legal | 91,4 | 86,0 | **1,06** | −1,5 % |
| Project Management | 79,9 | 79,6 | 1,00 | −9,1 % |
| Sales | 93,5 | 103,0 | 0,91 | −11,0 % |
| Management | 106,4 | 118,9 | 0,89 | −8,2 % |
| Marketing | 62,2 | 74,5 | 0,84 | −15,5 % |
| Human Resources | 79,4 | 99,1 | 0,80 | −4,6 % |

**Pilot-Filter:** die fünf Sektoren mit total/neu > 1,05, ohne Customer Service (stärkster Rückgang, eher Callcenter als kaufmännisch). Suchbegriffe stehen in [`n8n/workflows/config/berufsfilter.json`](../../n8n/workflows/config/berufsfilter.json).

**Volumen-Check:** Der Index sagt nichts über die Menge. Der erste Pilotlauf zählt je Suchbegriff die Treffer auf kimeta und meinestadt (kleine Obergrenze). Begriffe mit zu wenig Treffern fliegen raus. So entsteht die eigene Statistik aus den Pilotportalen.

**Aktualisierung:** monatlich neu berechnen (CSV abrufen, Tabelle oben ersetzen). Später kann das ein n8n-Schritt übernehmen.

## Konsequenzen

- Kostenlos, ohne Konto, ohne Scraping, rechtlich sauber (CC BY 4.0).
- Indeed-Sektoren sind englische Oberbegriffe. Die deutschen Suchbegriffe je Sektor sind unsere Zuordnung (Annahme) und brauchen Owner-Freigabe.
- Index ist relativ zu 2020. Ein Sektor kann gut aussehen, obwohl er klein ist. Deshalb der Volumen-Check.
- Daten nur von Indeed, nicht vom ganzen Markt. Für den Piloten reicht das.

## Verworfene Alternativen

- **BA-Engpassanalyse:** Owner lehnt ab, Stand zu alt.
- **StepStone:** Keine öffentliche, maschinenlesbare Berufsstatistik gefunden, nur Artikel ohne Liste.
- **Bullhorn DACH Job Market Trends:** monatlich, aber Berichtsform, nicht maschinenlesbar.
- **Nur eigene Zählung auf 1–3 Portalen:** zeigt Menge, aber nicht „schwer zu besetzen“. Wird als Volumen-Check ergänzt, nicht als einzige Quelle.
