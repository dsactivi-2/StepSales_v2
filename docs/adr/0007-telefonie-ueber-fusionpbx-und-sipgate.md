# ADR-0007: Telefonie über FusionPBX und sipgate

- **Status:** Akzeptiert (Owner, 2026-11-25)
- **Datum:** 2026-11-25

## Kontext

Outbound nach Deutschland mit Berliner Festnetznummer. Der Owner betreibt FreeSWITCH/FusionPBX unter `fusion.activi.io`.

## Entscheidung

LiveKit SIP Outbound-Trunk → FusionPBX → sipgate-Trunk → Ziel. Anzeigenummer: Berliner Festnetznummer (folgt).

## Konsequenzen

Volle Kontrolle über Routing/CLI. Zusätzlicher Hop → Latenz und Fehlerquelle; Anzeigenummer muss bei sipgate freigeschaltet sein.

## Verworfene Alternativen

LiveKit direkt zu sipgate; anderer SIP-Provider.
