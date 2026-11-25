# ADR-0003: Zwei Agents, eine Codebasis, Modell per Agent-Name

- **Status:** Vorgeschlagen
- **Datum:** 2026-11-25

## Kontext

Der Owner will einen GPT-Live- und einen Gemini-Live-Agent mit identischer Aufgabe und gemeinsamem Lead-Pool.

## Entscheidung

Eine Codebasis in `agent/`. Zwei registrierte Agent-Namen (`stepsales-gptlive`, `stepsales-gemini`) wählen beim Start das Modell; Prompt, Persona, Tools und Regeln sind geteilt. Der Dispatcher weist jedem Lead zufällig einen Agent zu und speichert die Zuordnung.

## Konsequenzen

Fairer A/B-Vergleich, eine Stelle für Fixes. Modellspezifische Abweichungen (z. B. Delegation bei GPT-Live) werden in einem Adapter gekapselt.

## Verworfene Alternativen

Zwei getrennte Repos/Codebasen; unterschiedliche Personas je Agent (verfälscht den Vergleich).
