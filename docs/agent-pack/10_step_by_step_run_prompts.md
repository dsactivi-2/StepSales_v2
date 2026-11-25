# 10 — Step-by-Step Run Prompts

## Run 1 — Sales Analysis

```text
Lies nur:
- 00_master_brief.md
- 01_business_rules.md
- 02_sales_workflows.md
- 03_offer_payment_followup.md

Aufgabe:
Erstelle nur die Sales-Prozess-Analyse.
Keine Tools.
Keine Prompts.
Keine Templates.

Output exakt in dieser Struktur:
1. Sales objective
2. Funnel stages
3. Qualification model
4. Closing logic
5. Discount logic
6. Follow-up logic
7. Payment and post-sale logic
8. Key risks
9. Open questions

Stop after this output.
```

## Run 2 — Tools and Data

```text
Lies nur:
- 00_master_brief.md
- 01_business_rules.md
- 03_offer_payment_followup.md
- 04_tools.md
- 05_data_and_crm.md
- 06_knowledge_base.md

Aufgabe:
Entwerfe nur das operative System.
Keine finalen Prompts.
Keine Templates.

Output exakt in dieser Struktur:
1. Required tools
2. Tool schemas
3. Data model
4. CRM states
5. Process automations
6. Knowledge base structure
7. Operational risks
8. Open questions

Stop after this output.
```

## Run 3 — Personas and Prompts

```text
Lies nur:
- 00_master_brief.md
- 01_business_rules.md
- 02_sales_workflows.md
- 03_offer_payment_followup.md
- 06_knowledge_base.md
- 07_personas_prompts.md

Aufgabe:
Erstelle nur Agentenrollen und produktionsreife Prompts.
Keine Templates.
Keine SQL.

Output exakt in dieser Struktur:
1. Agent roster
2. Female main sales agent prompt
3. Male main sales agent prompt
4. Follow-up agent prompt
5. Offer / closing agent prompt
6. Payment / post-sale agent prompt
7. Shared rules
8. Open assumptions

Stop after this output.
```

## Run 4 — Template Architecture

```text
Lies nur:
- 00_master_brief.md
- 01_business_rules.md
- 02_sales_workflows.md
- 03_offer_payment_followup.md
- 04_tools.md
- 05_data_and_crm.md
- 07_personas_prompts.md
- 08_dograh_template_target.md

Aufgabe:
Erstelle nur die Template-Architektur und die inhaltliche Matrix.
Noch keine finalen JSON-Blöcke.

Output exakt in dieser Struktur:
1. Template strategy
2. 15 variant templates
3. 3 main templates
4. Node composition rules
5. Extraction field mapping
6. Tool mapping per template
7. Naming and descriptions for UI
8. Implementation notes

Stop after this output.
```

## Run 5 — Importable Template Output

```text
Lies:
- 08_dograh_template_target.md

Zusätzlich nutze nur die bereits freigegebenen Ergebnisse aus Run 1 bis Run 4.

Aufgabe:
Erzeuge das importierbare Template-Pack.

Output exakt in dieser Struktur:
1. Executive summary
2. Template index
3. Template blocks

Für jeden Template Block liefere:
- template_name
- template_description
- template_json

template_json muss enthalten:
- nodes
- edges
- viewport

Erzeuge alle 15 Variant-Templates und alle 3 Main-Templates.

Stop after this output.
```
