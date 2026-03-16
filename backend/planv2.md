# Conversation Engine V2 Plan

## 1. V2 architecture summary

V2 should be a workflow engine, not a mixed parser. One message enters one pipeline: load state, try pending-flow continuation first, otherwise resolve a fresh intent, then fill slots, resolve entities, run workflow-specific confirmation, execute, build reply, save state.

The key design change is to replace today's overlapping state channels with one `pendingFlow` object owned by the workflow runtime. No separate generic confirmation lane, no separate vendor/customer/job disambiguation lane, and no parallel semantic-vs-legacy orchestration inside the same turn.

The current pain points come directly from the existing mix in `backend/src/messaging/router.ts` and the overlapping memory model in `backend/src/messaging/agent/context-memory.ts`. V2 should isolate:

- intent resolution
- slot filling
- entity resolution
- confirmation
- execution
- state persistence

All assistant prompts, examples, reply templates, and workflow copy should be English-only and stored centrally.

## 2. Proposed folder/module structure

Use a new parallel tree such as `backend/src/conversation-v2/`.

Suggested modules:

- `index.ts`: public entrypoint, `routeIncomingMessageV2`
- `engine/runtime.ts`: top-level pipeline
- `engine/contracts.ts`: core types
- `state/state-store.ts`: load/save conversation state
- `state/state-schema.ts`: session and pending-flow schema
- `intent/intent-resolver.ts`: fresh intent resolver for MVP only
- `intent/intent-schema.ts`: narrow V2 intent definitions
- `slot/slot-filler.ts`: merge new message into workflow slots
- `entity/entity-resolver.ts`: customer/vendor/job lookup rules
- `confirmation/confirmation-handler.ts`: workflow-specific confirmation rules
- `topic/topic-shift.ts`: pending-vs-fresh decision rules
- `execution/action-executor.ts`: maps resolved workflows to existing services
- `response/response-builder.ts`: English-only assistant replies
- `workflows/create-customer.ts`
- `workflows/record-vendor-debt.ts`
- `workflows/record-vendor-payment.ts`
- `workflows/create-job.ts`
- `workflows/update-job-status.ts`
- `workflows/list-today-jobs.ts`
- `workflows/record-expense.ts`
- `workflows/daily-summary.ts`
- `workflows/monthly-summary.ts`
- `automation/morning-summary.ts`
- `adapters/services.ts`: wrappers around current services
- `adapters/twilio.ts`: optional thin adapter if needed
- `cleanup/deprecation-plan.ts`: optional tracker for retiring V1 modules
- `tests/...`: workflow and engine tests

Do not extend the current `messaging/agent*`, `semantic-agent`, or `dialog-manager` modules further for V2. Treat them as V1.

## 3. Runtime flow step by step

1. Load user and V2 state.
2. Normalize inbound text for matching, but keep raw text for audit and replies.
3. If there is an active `pendingFlow`, run `topic-shift` check first.
4. If no topic shift, route message to the pending workflow's slot filler.
5. The slot filler merges the new message into missing fields only for that workflow.
6. Entity resolver resolves only the entities required by that workflow.
7. If entities are missing or ambiguous, return a workflow-specific clarification and keep `pendingFlow`.
8. If entity resolution triggers a workflow-specific confirmation, store that confirmation step inside the same `pendingFlow`.
9. If pending flow completes, execute action, build reply, clear `pendingFlow`, save lightweight recent refs.
10. If there is no active pending flow, run fresh intent resolver.
11. Intent resolver returns one MVP intent or `unsupported/unknown`.
12. Slot filler extracts known fields from the same message.
13. Entity resolver resolves customer/vendor/job references.
14. Confirmation handler applies workflow rules.
15. Executor calls existing services.
16. Response builder returns a plain English WhatsApp reply.
17. State saver persists the updated conversation state.

Important rule: a pending flow is only cleared after successful execution, explicit cancel, expiry, or a confirmed topic shift. It must not be cleared just because parsing succeeded.

## 4. State and pending-flow schema

Session state should be small and explicit:

- `userId`
- `channel`: `whatsapp`
- `lastMessageAt`
- `recentRefs`: `{ customerId?, customerName?, vendorId?, vendorName?, jobId?, jobTitle? }`
- `pendingFlow?`
- `lastCompletedWorkflow?`
- `version`: `v2`

Single pending-flow shape:

- `id`
- `workflow`: `create_customer | record_vendor_debt | record_vendor_payment | create_job | update_job_status | list_today_jobs | record_expense | daily_summary | monthly_summary`
- `step`: `slot_filling | entity_resolution | confirmation | ready_to_execute`
- `slots`: record of collected slot values
- `missingSlots`: string[]
- `entityState`: resolved IDs, ambiguous candidates, unresolved query
- `confirmationState?`: `{ type, prompt, payload }`
- `prompt`: last assistant question
- `createdAt`
- `updatedAt`
- `expiresAt`
- `topicShiftPolicy`: `allow_strong_shift`
- `sourceMessageId?`

This replaces V1's overlapping `pendingFlow`, `pendingAction`, `pendingCustomerDisambiguation`, `pendingVendorDisambiguation`, and `pendingJobDisambiguation` in `backend/src/messaging/agent/context-memory.ts`.

## 5. MVP intent definitions

Use narrow V2 intents, separate from current broad intent catalog in `backend/src/messaging/intents/schemas.ts`.

- `create_customer`
  - Fields: `customer_name`, `customer_phone?`, `notes?`
- `record_vendor_debt`
  - Fields: `vendor_query?`, `amount_pence?`, `note?`, `occurred_on?`
- `record_vendor_payment`
  - Fields: `vendor_query?`, `amount_pence?`, `note?`, `occurred_on?`
- `create_job`
  - Fields: `customer_query?`, `title?`, `total_pence?`, `deposit_pence?`, `due_date?`, `notes?`
- `update_job_status`
  - Fields: `job_query?`, `status?`
  - Allowed statuses should match DB reality: `active | completed | canceled`
- `list_today_jobs`
  - Fields: none, or optional `scope=today`
- `record_expense`
  - Fields: `amount_pence?`, `category?`, `note?`, `occurred_on?`, `vendor_query?`
- `daily_summary`
  - Fields: none, or optional `scope=daily`
- `monthly_summary`
  - Fields: none, or optional `month?`, `year?`

Intent resolver should only emit these nine intents in V2 MVP. Anything else returns `unsupported` and can remain in V1.

## 6. Slot definitions

- `create_customer`
  - Required: `customer_name`
  - Optional: `customer_phone`, `notes`

- `record_vendor_debt`
  - Required: `amount_pence`, `vendor_query`
  - Optional: `note`, `occurred_on`
  - Debt flow may propose vendor creation if vendor not found

- `record_vendor_payment`
  - Required: `amount_pence`, `vendor_query`
  - Optional: `note`, `occurred_on`
  - Payment flow must not create vendor

- `create_job`
  - Required: `customer_query`, `title`, `total_pence`
  - Optional: `deposit_pence`, `due_date`, `notes`
  - `deposit_pence <= total_pence` validation

- `update_job_status`
  - Required: `job_query`, `status`
  - Optional: none

- `list_today_jobs`
  - Required: none

- `record_expense`
  - Required: `amount_pence`
  - Optional: `category`, `note`, `occurred_on`, `vendor_query`
  - Category can be optional in MVP if the product can safely default to `uncategorized`

- `daily_summary`
  - Required: none

- `monthly_summary`
  - Required: none if current month is the default
  - Optional: `month`, `year`

Slots should be typed by workflow, not shared globally. `vendor_query` is never interchangeable with `customer_query`. `job_query` is never filled from a vendor answer.

## 7. Confirmation and clarification rules

Confirmation must be domain-specific:

- `create_customer`
  - Clarify on invalid phone or likely duplicate customer.
  - Confirm only if creating a customer appears to duplicate an existing one closely.

- `record_vendor_debt`
  - Clarify when amount or vendor is missing.
  - If vendor not found, confirm: "Create vendor X and record debt?"
  - This is allowed because current debt service auto-creates via upsert in `backend/src/services/vendor-payments.service.ts`.

- `record_vendor_payment`
  - Clarify when amount or vendor is missing.
  - If vendor not found, ask for clarification or selection.
  - Never confirm vendor creation, because vendor creation is forbidden in this workflow.

- `create_job`
  - Clarify missing customer, title, or total.
  - Clarify if due date parse is ambiguous.
  - No generic low-confidence confirm.
  - If customer does not exist, do not silently create through job flow; either redirect to `create_customer` or offer explicit handoff.

- `update_job_status`
  - Clarify missing job or status.
  - Clarify ambiguous job matches.
  - Confirm only for `canceled` if you want a safety step; `completed` and `active` can execute directly.

- `list_today_jobs`
  - No confirmation.
  - If "today" meaning is unclear in product terms, clarify once at design level, not runtime.

- `record_expense`
  - Clarify when amount is missing or invalid.
  - Clarify category only if the product requires one for reporting correctness.
  - If a vendor is referenced and vendor resolution is ambiguous, ask for clarification.

- `daily_summary`
  - No confirmation.
  - If the product includes multiple possible summary definitions, settle the definition at design level, not per request.

- `monthly_summary`
  - No confirmation.
  - Clarify only when the month reference is ambiguous.

## 8. Entity resolution and topic-shift rules

Entity resolution:

- Customer resolution uses customer-only lookup.
- Vendor resolution uses vendor-only lookup.
- Job resolution uses job-only lookup.
- Never cross-resolve vendor text into customer entities or vice versa.
- Resolution outputs exactly one of: `resolved`, `ambiguous`, `not_found`.

Rules by workflow:

- `record_vendor_debt`: if vendor not found, branch to create-vendor confirmation.
- `record_vendor_payment`: if vendor not found, branch to vendor clarification only.
- `create_job`: resolve customer first; do not use `jobsService.createJob()` because it silently upserts customer.
- `update_job_status`: resolve job from explicit query or recent ref only when the message is clearly referential.
- `list_today_jobs`: no entity resolution.
- `record_expense`: vendor resolution is optional and vendor-only when a vendor is mentioned.
- `daily_summary`: no entity resolution.
- `monthly_summary`: no entity resolution.

Topic-shift rules:

- Pending flow has priority by default.
- Continue pending flow when reply shape matches awaited slot type: bare name, amount, yes/no to pending confirmation, short status, short job title.
- Treat as strong topic shift when message is a high-confidence fresh command for another workflow, especially list/report intents like "show me today jobs".
- Explicit shift/cancel phrases always end the pending flow: `cancel`, `stop`, `never mind`, `start over`.
- On strong topic shift, clear pending flow with reason `topic_shift`.
- On weak ambiguity, prefer pending continuation over fresh intent.

## 9. Reuse plan for current services/actions

Reuse as-is or via thin V2 adapters:

- Twilio webhook validation and inbound route
- user lookup
- `CustomersService.normalizePhone()`
- `CustomersService.listResolutionCandidates()`
- `CustomersService.findCustomerById()`
- `JobsService.createJobForCustomerId()`
- `JobsService.updateJobStatus()`
- `JobsService.listResolutionCandidates()`
- `VendorPaymentsService.resolveVendorByQuery()`
- `VendorPaymentsService.addVendorDebt()`
- `VendorPaymentsService.addVendorPaymentByVendorId()`
- `PaymentsService` methods that support expense recording, if they match the required semantics
- `ReportsService` methods that support daily and monthly summaries
- `RemindersService` methods that support morning reminder or summary automation

Reuse with caution:

- `CustomersService.upsertByPhoneOrName()` conflicts with explicit `create_customer` semantics because it can update an existing same-name record.
- `JobsService.createJob()` conflicts with strong customer separation because it silently creates or updates customer records.
- `RemindersService.buildTodayPlan()` is booking/diary-oriented, not a pure job list. It is reusable only if `list_today_jobs` is defined as "today's scheduled bookings/jobs in diary". If you mean active jobs due today, this needs a new read method.
- Existing reports or reminder builders may mix bookings, jobs, payments, and free-form text. Reuse only if the V2 summary definitions match exactly; otherwise add narrow read models for V2.

Do not reuse as core V2 orchestration:

- `backend/src/messaging/router.ts`
- dialog manager
- semantic-agent runtime
- current generic confirmation flow
- current separate pending disambiguation channels

Cleanup after V2 rollout:

- Remove or retire V1-only orchestration paths that are no longer used by production routing.
- Delete dead code only after routing, tests, and pilot results confirm V2 ownership of the replaced workflows.
- Keep cleanup separate from the first V2 pilot so behavioral regression risk stays bounded.

## 10. Migration strategy

Build V2 alongside V1 behind a feature flag and a routing gate.

Recommended transition:

- Keep current webhook and outer route.
- Add `routeIncomingMessageV2`.
- Route only opted-in users, test numbers, or a dedicated env flag to V2.
- Keep V2 state under its own namespace/version so it cannot collide with V1 memory.
- In early rollout, V2 handles only the selected MVP workflows enabled by flag.
- If V2 receives unsupported intent before any execution, return `not_supported` and delegate to V1.
- If a V2 pending flow already exists, keep that user on V2 until the flow is resolved or canceled; do not bounce mid-flow to V1.

Safer rollout stages:

- shadow mode: V2 parses and logs decisions without executing
- pilot mode: V2 executes for internal/test users only
- staged enablement: first core workflows, then summaries and automations, then V1 cleanup

## 11. Additional V2 MVP scope

The expanded V2 MVP also includes:

- `record_expense`
  - User can record a business expense with amount and optional category, vendor, note, and date.
- `daily_summary`
  - User can ask for a daily financial or operational summary using one stable product definition.
- `monthly_summary`
  - User can ask for a monthly financial or operational summary for the current month or an explicitly referenced month.
- `morning reminder / summary auto message`
  - The system can send an automated morning WhatsApp summary using a predefined template and schedule.

These additions should follow the same runtime principles:

- user-triggered flows go through the same V2 workflow engine
- automation uses the same response builder and summary read models where possible
- summary definitions must be stabilized at product level before implementation

## 12. Cleanup and deprecation strategy

V2 should include a planned cleanup phase for superseded V1 files and modules.

Cleanup scope:

- old routing branches that no longer receive traffic
- generic confirmation helpers replaced by V2 confirmation handling
- separate disambiguation state channels replaced by `pendingFlow`
- unused semantic-agent or dialog-manager code paths if they are no longer routed
- reply templates or prompt fragments that are dead after V2 migration

Rules:

- Do not delete V1 files during the first implementation pass unless they are already dead and verified unused.
- Mark modules as V1-only first if immediate deletion is risky.
- Remove files only after routing gates, tests, and pilot rollout confirm there is no remaining dependency.
- Add regression checks before deleting any module that was previously part of production message routing.
- partial production: V2 default for six workflows, V1 for all others
- later expansion after stability

## 11. Implementation phases

1. Define V2 contracts.
   - intent schema
   - state schema
   - workflow interfaces
   - response templates

2. Build state layer.
   - versioned V2 state store
   - single pending-flow persistence
   - expiry and clear reasons

3. Build runtime pipeline.
   - state loader
   - pending-first dispatcher
   - topic-shift gate
   - state saver

4. Build MVP workflows.
   - create_customer
   - record_vendor_debt
   - record_vendor_payment
   - create_job
   - update_job_status
   - list_today_jobs

5. Build entity adapters and execution adapters.
   - customer/vendor/job resolvers
   - wrappers over existing services
   - explicit conflict guards

6. Integrate behind flag.
   - dual-router entry
   - unsupported fallback to V1
   - sticky V2 pending-flow handling

7. Add test coverage before rollout.
   - pending continuation priority
   - vendor/customer separation
   - vendor debt create-vendor confirmation
   - vendor payment no-auto-create
   - topic shift clearing
   - no early pending clear
   - service conflict guards

## 12. Risks and open questions

Risks:

- `create_customer` semantics are currently blurred by `upsertByPhoneOrName`; V2 needs explicit duplicate policy.
- `create_job` currently has a silent customer upsert path; using it directly would recreate current confusion.
- `list_today_jobs` is not fully defined in current domain model: bookings today, jobs due today, or both.
- `update_job_status` in DB supports only `active`, `completed`, `canceled`; any "pending" language must be mapped or rejected explicitly.
- Fallback from V2 to V1 can cause state drift if a user is allowed to cross engines mid-flow.

Assumptions:

- existing DB schema remains unchanged for MVP
- existing services are mostly reusable with wrappers
- English-only assistant output is acceptable across all WhatsApp interactions
- V2 will not cover exports/PDFs, customer search, or payments-to-jobs in MVP

Open questions:

- What exactly should `list_today_jobs` mean in your product?
- Should `create_job` ever offer "create customer and continue", or must it always require an existing customer first?
- For `create_customer`, what counts as a duplicate worth confirming: exact name, exact phone, or fuzzy name match?
- For `update_job_status`, do you want an explicit confirmation only for `canceled`, or none at all?
- Do you want V2 intent resolution to remain partly heuristic/rule-based for MVP, or do you want an LLM only as a narrow fresh-intent classifier with strict schema output?
