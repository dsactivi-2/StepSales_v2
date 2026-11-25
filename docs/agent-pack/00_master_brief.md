# Stepsales Agent Pack — Master Brief

## Purpose

Create a German-speaking B2B telesales agent system for selling job ad distribution and multiposting services to companies in Germany that recently posted job ads on selected job platforms.

## Core Sales Goal

- close in the first call where possible
- otherwise move to a tightly managed second conversation
- if not ready, continue with offer, follow-up, payment, and post-sale onboarding

## Target Buyer

- companies in Germany
- HR managers
- recruiters
- talent acquisition
- hiring managers
- SMB to mid-market employers
- companies with active hiring demand

## Trigger Context

The target company posted one or more job ads in the last few days up to roughly 2 weeks ago on relevant job portals.

## Product Model

- fixed packages
- fixed list prices
- agent normally sells at list price
- agent may offer up to 10% discount only as a closing incentive
- discount is never the default and should be used selectively

## Sales Motion

The agent sells:

- additional job ad placements on other portals
- multiposting packages
- reach expansion for active hiring campaigns

## Operational Goal

The end-to-end system should support:

- first contact
- qualification
- objection handling
- closing
- offer follow-up
- second appointment
- follow-up when customer does not reply
- payment link sending
- payment status handling
- immediate post-payment information request for ad fulfillment

## Output We Want From the Other Agent

The other agent must produce:

- deep analysis of the full sales process
- recommended agents / roles
- required tools
- data model
- CRM states
- knowledge base structure
- production-ready prompts
- workflow design
- template strategy
- import-ready Dograh templates

## Hard Constraints

- language: German
- market: Germany / DACH B2B
- phone-first sales
- short, voice-friendly utterances
- one question at a time
- clear next-step logic
- no invented facts
- no overreliance on fragile live job data

## Known Product Gaps To Respect

- live job search may be partially mocked or incomplete
- CRM/session persistence may be limited
- some integrations may be heuristic or incomplete

Therefore, the sales design must remain robust even if some live data or integrations are imperfect.

## Packaging Goal

The final deliverable should be suitable for:

- ChatGPT Projects
- another agent session
- structured analysis in sequential passes
- later conversion into Dograh templates / SQL seed data
