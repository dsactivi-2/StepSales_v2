# 04 — Tools

## Tool Set Needed

### 1. `qualify_lead`

Purpose:
- store lead data
- score qualification
- record next step

Suggested inputs:
- company_name
- contact_name
- role
- email
- phone
- active_hiring
- roles_hiring_for
- urgency
- budget_signal
- interest_level
- next_step
- objection_type

### 2. `create_offer`

Purpose:
- generate a formal offer based on package and pricing

Suggested inputs:
- lead_id
- package_id
- list_price
- discount_percent
- final_price
- valid_until
- notes

### 3. `send_followup`

Purpose:
- send recap or material

Suggested inputs:
- lead_id
- email
- followup_type
- template_id
- package_summary
- next_step

### 4. `schedule_second_call`

Purpose:
- book a second sales conversation

Suggested inputs:
- lead_id
- email
- preferred_date
- preferred_time
- timezone

### 5. `send_payment_link`

Purpose:
- deliver payment link after verbal agreement

Suggested inputs:
- lead_id
- offer_id
- final_price
- payment_methods

### 6. `check_payment_status`

Purpose:
- verify whether payment completed

Suggested inputs:
- payment_reference
- lead_id

### 7. `mark_payment_received`

Purpose:
- update deal state
- trigger onboarding sequence

Suggested inputs:
- lead_id
- payment_reference
- amount_received
- payment_method

### 8. `send_post_payment_request`

Purpose:
- request all data needed to publish the job ad

Suggested inputs:
- lead_id
- email
- purchased_package
- required_fields_template

### 9. `log_call_outcome`

Purpose:
- store structured conversation result

Suggested inputs:
- lead_id
- outcome
- summary
- objection_type
- next_step
- callback_date

### 10. `search_jobs` (optional only)

Purpose:
- context enrichment only

Rule:
- never make core sales success depend on this tool

## Tool Guardrails

- never call payment tools before commercial agreement
- never call discount-related logic without explicit close context
- always confirm email before sending offer or follow-up
- always store lead state after meaningful qualification
