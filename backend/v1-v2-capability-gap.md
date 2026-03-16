# V1 vs V2 Capability Gap

## Purpose

This document captures the current capability gap between the legacy messaging system in `backend/src/messaging/` and the new workflow engine in `backend/src/conversation-v2/`.

It is an inventory document, not an implementation plan.

## Baseline

### V1 currently exposes a broader product surface

From `backend/src/messaging/intents/schemas.ts`, V1 supports a much wider intent set than V2, including:

- onboarding and registration flows
- customer lookup and customer phone updates
- customer payments and payment history
- job listing variants beyond "today"
- booking creation
- expense listing and batch expense logging
- vendor summaries
- export / PDF / invoice flows
- briefing toggle
- subscription and billing-adjacent flows
- greeting / help / generic conversational commands

### V2 currently covers only the new workflow-engine MVP

From `backend/planv2.md` and the implemented `conversation-v2` contracts, V2 currently supports:

- `create_customer`
- `record_vendor_debt`
- `record_vendor_payment`
- `create_job`
- `update_job_status`
- `list_today_jobs`
- `record_expense`
- `daily_summary`
- `monthly_summary`
- morning summary automation

## High-Level Conclusion

Today, V2 is architecturally cleaner but product-wise narrower than V1.

- V2 is stronger in state handling, slot progression, entity isolation, and workflow determinism.
- V1 is stronger in breadth, natural free-text coverage, and utility features outside the V2 MVP.

Because of that, V2 is not yet a full replacement for V1.

## Capability Status Matrix

### Present in both V1 and V2

- create customer
- record vendor debt
- record vendor payment
- create job
- update job status
- today-oriented job listing / plan-today behavior
- record expense
- financial summary requests at a basic level

### Present in V1 but missing in V2

#### Customer and account operations

- customer lookup / records lookup
- customer phone number update
- customer balance / account summary flows
- outstanding customer list
- payment history / payment list flows

#### Payment operations

- customer payment logging (`payment_add`)
- payment logging against a specific job
- payment method capture (`cash`, `bank`, `card`)
- outstanding-job disambiguation before taking payment

#### Job and scheduling operations

- booking creation
- active job listing
- due-this-week job listing
- last-30-days job listing
- close all active jobs for a customer
- richer job disambiguation flows accumulated in V1

#### Expense and vendor operations

- expense listing
- batch expense logging
- vendor summary
- broader vendor reporting flows

#### Export / document flows

- export all data
- export customer PDF
- export vendor PDF
- export expense PDF
- invoice creation / invoice PDF link flows

#### User controls and meta flows

- briefing toggle
- onboarding submit
- subscribe / billing-adjacent flow
- greeting / help handling as explicit intents

### Present in V2 but not really a V1 equivalent

- single-runtime `pendingFlow` ownership with workflow-local state
- workflow-specific confirmation model instead of generic cross-cutting confirmation
- explicit topic-shift handling inside one consistent engine
- isolated entity resolution by domain

These are architecture/runtime advantages rather than user-facing feature additions.

## Quality Gaps Beyond Raw Features

Even where V1 and V2 overlap on paper, they are not equivalent in feel or coverage.

### Areas where V1 is currently stronger

- broader free-text interpretation
- more legacy phrase coverage
- more utility commands outside core workflows
- more "assistant-like" feel because more requests happen to be supported

### Areas where V2 is currently stronger

- less state confusion
- safer follow-up handling
- better workflow boundaries
- clearer vendor/customer/job separation
- more deterministic confirmation behavior

## Important Gap Categories

### 1. Critical replacement blockers

These are the gaps that directly block V2 from replacing V1:

- customer payment flows
- export / PDF / invoice flows
- customer/account lookup flows
- booking flows
- active / due-week / last-30 job listing variants
- expense list and vendor summary flows
- briefing toggle and other still-used control flows

### 2. Partial parity but weaker experience in V2

These areas exist in both systems, but V2 is still likely weaker in conversational coverage:

- create customer from messy natural language
- create job from loose or incomplete phrasing
- status changes expressed indirectly
- summary requests expressed in many different ways
- handling off-path user requests while staying assistant-like

### 3. Fallback-dependent capabilities

These capabilities are currently only safe because routing can still fall back to V1:

- anything involving PDFs or exports
- anything involving invoices
- non-MVP financial lookups
- non-MVP customer/account requests
- non-MVP scheduling flows

If V1 were removed today, these would disappear unless first ported or intentionally dropped.

## Suggested Product Classification for Next Planning Pass

When planning the next phase, each V1-only capability should be classified into one of three buckets:

- must port to V2
- can stay behind temporary V1 fallback
- intentionally retire

## Short List of Likely "Must Port" Items

Based on current product usefulness, the most likely must-port candidates are:

- customer payment logging
- customer/account lookup
- export customer PDF
- export full records PDF
- invoice / invoice PDF flow
- booking creation
- expense list
- vendor summary
- briefing toggle

## Notes

- This gap list is derived from the current V1 intent catalog in `backend/src/messaging/intents/schemas.ts`, the V1 router behavior in `backend/src/messaging/router.ts`, and the current V2 scope in `backend/planv2.md`.
- Some V1 behaviors are wider than the explicit intent list because V1 also contains layered parser/orchestrator behavior. So this document is conservative: the true V1 surface area is probably even broader.
- The key takeaway is simple: V2 is the better foundation, but it has not yet reached feature parity with V1.
