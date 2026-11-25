# ADR-0006: Zahlungsstatus nur per Stripe-Webhook

- **Status:** Vorgeschlagen
- **Datum:** 2026-11-25

## Kontext

In v1 konnte jeder API-Key eine Zahlung als bezahlt markieren; ein Agent-Tool dafür ist per Gesprächsmanipulation ausnutzbar.

## Entscheidung

Stripe Checkout-Links werden von n8n erzeugt. Den Status `paid` setzt ausschließlich der signaturgeprüfte Stripe-Webhook, inkl. Abgleich Betrag ↔ Angebot und Idempotenz über die Stripe-Event-ID.

## Konsequenzen

Kein Agent kann Zahlungen fälschen. Bedarf: Stripe-Webhook-Secret in n8n.

## Verworfene Alternativen

Tool `mark_payment_received` im Agent.
