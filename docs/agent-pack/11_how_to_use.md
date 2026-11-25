# 11 — How To Use

## Goal

Use these files in ChatGPT Projects or another agent session without blowing up context.

## Recommended Upload Order

Upload these files into your project or workspace:

1. `00_master_brief.md`
2. `01_business_rules.md`
3. `02_sales_workflows.md`
4. `03_offer_payment_followup.md`
5. `04_tools.md`
6. `05_data_and_crm.md`
7. `06_knowledge_base.md`
8. `07_personas_prompts.md`
9. `08_dograh_template_target.md`
10. `09_orchestrator_prompt.md`
11. `10_step_by_step_run_prompts.md`

## Best Working Method

Do not ask for everything at once.

Instead:

1. upload all files
2. paste the orchestrator prompt from `09_orchestrator_prompt.md`
3. then run one numbered pass at a time from `10_step_by_step_run_prompts.md`

## Simple Example

### First message

Paste the content of:
- `09_orchestrator_prompt.md`

### Second message

Paste:

```text
Run 1
Use the prompt for Run 1 from 10_step_by_step_run_prompts.md
```

### Then

Review the output, correct anything needed, and continue with:

- Run 2
- Run 3
- Run 4
- Run 5

## Why This Works Better

- smaller context per run
- more stable outputs
- easier corrections
- less duplication
- easier export into Dograh templates later

## If You Want Even More Control

You can upload only the files needed for the current run instead of all files at once. That is slower, but even cleaner.
