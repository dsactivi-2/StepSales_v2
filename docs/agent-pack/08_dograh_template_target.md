# 08 — Dograh Template Target

## Target Node Set

Prefer these nodes:

- `globalNode`
- `startCall`
- `agentNode`
- `qa`
- `webhook`
- `endCall`

Avoid depending on:

- `customNode` unless implementation truly needs it
- `trigger` for the first version unless explicitly required

## Template Types To Build

### 15 Variant Templates

Five motions times three styles:

- Cold Outreach - Direct SDR
- Cold Outreach - Consultative Advisor
- Cold Outreach - HR Specialist
- Qualification - Direct SDR
- Qualification - Consultative Advisor
- Qualification - HR Specialist
- Demo Booking - Direct SDR
- Demo Booking - Consultative Advisor
- Demo Booking - HR Specialist
- Follow-up - Direct SDR
- Follow-up - Consultative Advisor
- Follow-up - HR Specialist
- Inbound HR Inquiry - Direct SDR
- Inbound HR Inquiry - Consultative Advisor
- Inbound HR Inquiry - HR Specialist

### 3 Main Templates

- Stepsales Main - Outbound Qualification to Demo
- Stepsales Main - Outbound Qualification to Follow-up
- Stepsales Main - Inbound HR Conversion Flow

## Import Shape

The other agent should produce templates in an importable intermediate structure with:

- `template_name`
- `template_description`
- `template_json`

Where `template_json` contains:

- `nodes`
- `edges`
- `viewport`

## Node Design Expectations

- `globalNode` should contain persona and hard rules
- `startCall` should contain the opener
- `agentNode` should contain discovery, qualification, objection handling, or close logic
- `qa` should be used for FAQ-heavy stages only
- `webhook` should represent CRM or handoff actions
- `endCall` should provide a clean spoken close

## Output Preference

Preferred final delivery from the other agent:

1. analytical sections
2. template matrix
3. importable JSON blocks
4. optional SQL-seed-ready transformation guidance
