# Conversation Engine V2 Task List

## Purpose

This document turns the V2 architecture plan into implementation tasks that can be executed, tracked, and later converted into issues.

Scope is limited to the V2 MVP described in `backend/planv2.md`:

- `create_customer`
- `record_vendor_debt`
- `record_vendor_payment`
- `create_job`
- `update_job_status`
- `list_today_jobs`
- `record_expense`
- `daily_summary`
- `monthly_summary`
- `morning reminder / summary auto message`
- V1 cleanup and deprecation for replaced flows

V2 must be built in parallel to V1 under a separate module tree and state namespace.

## Delivery principles

- Build V2 under `backend/src/conversation-v2/`.
- Do not extend V1 orchestration modules for new V2 behavior.
- Keep all assistant-facing prompts and replies English-only.
- Keep workflow state inside a single `pendingFlow` object.
- Reuse existing services through thin adapters where possible.
- Roll out behind a feature flag or routing gate.

## Recommended execution order

1. Foundation and contracts
2. State store and schema
3. Core runtime pipeline
4. Intent resolution
5. Slot filling
6. Entity resolution
7. Confirmation handling
8. Execution adapters
9. Response builder
10. Workflow modules
11. Summary and automation support
12. V1/V2 routing gate
13. Test coverage, cleanup, and rollout support

## Task breakdown

## Milestone 1: Foundation and Engine

### 1. Create the V2 module skeleton

**Goal**

Create the new `conversation-v2` tree and define the public entrypoint.

**Deliverables**

- `backend/src/conversation-v2/index.ts`
- `backend/src/conversation-v2/engine/runtime.ts`
- `backend/src/conversation-v2/engine/contracts.ts`
- `backend/src/conversation-v2/state/state-store.ts`
- `backend/src/conversation-v2/state/state-schema.ts`
- `backend/src/conversation-v2/intent/intent-resolver.ts`
- `backend/src/conversation-v2/intent/intent-schema.ts`
- `backend/src/conversation-v2/slot/slot-filler.ts`
- `backend/src/conversation-v2/entity/entity-resolver.ts`
- `backend/src/conversation-v2/confirmation/confirmation-handler.ts`
- `backend/src/conversation-v2/topic/topic-shift.ts`
- `backend/src/conversation-v2/execution/action-executor.ts`
- `backend/src/conversation-v2/response/response-builder.ts`
- `backend/src/conversation-v2/workflows/`
- `backend/src/conversation-v2/adapters/services.ts`

**Acceptance criteria**

- `routeIncomingMessageV2` exists as the V2 public API.
- Imports compile without depending on unfinished V1 internals.
- Folder structure matches the plan and is ready for incremental implementation.

### 2. Define V2 contracts and state schema

**Goal**

Define the core runtime types and the single pending-flow shape.

**Deliverables**

- V2 workflow enum or union type
- V2 intent definitions for the expanded MVP workflows
- `SessionStateV2`
- `PendingFlowV2`
- `EntityResolutionResult`
- `ConfirmationState`
- `WorkflowExecutionResult`

**Acceptance criteria**

- `pendingFlow` is the only in-progress workflow state channel in V2.
- State shape includes `recentRefs`, `lastCompletedWorkflow`, and `version: 'v2'`.
- Workflow slot types are separated by workflow and not shared loosely across domains.

### 3. Implement the V2 state store

**Goal**

Load and save V2 conversation state without colliding with V1 memory.

**Deliverables**

- State load helper
- State save helper
- Namespace or version isolation for V2 state
- Pending-flow expiry handling

**Acceptance criteria**

- V2 state can be loaded independently of existing V1 context memory.
- Expired pending flows are cleared deterministically.
- Save operations preserve `recentRefs` and `pendingFlow` updates correctly.

### 4. Implement the runtime pipeline

**Goal**

Build the top-level V2 turn processor with the intended execution order.

**Deliverables**

- Load state
- Normalize inbound message for matching
- Pending-flow continuation branch
- Fresh-intent branch
- Execution and response assembly
- Final state persistence

**Acceptance criteria**

- Runtime follows the plan order from `backend/planv2.md`.
- Pending flow is not cleared merely because parsing succeeded.
- Runtime returns enough structured output for response building and testing.

### 5. Implement topic-shift handling

**Goal**

Decide when a message should continue the current pending flow versus start a new one.

**Deliverables**

- Explicit cancel handling
- Strong topic-shift detection
- Weak ambiguity fallback to pending continuation
- Topic-shift reason tracking

**Acceptance criteria**

- `cancel`, `stop`, `never mind`, and `start over` end the pending flow.
- High-confidence fresh commands can replace the pending flow with reason `topic_shift`.
- Short replies that match the awaited slot shape continue the pending flow.

### 6. Implement the MVP intent resolver

**Goal**

Resolve fresh messages into one of the V2 MVP intents or return unsupported.

**Deliverables**

- Narrow intent schema under `conversation-v2`
- Resolver for:
  - `create_customer`
  - `record_vendor_debt`
  - `record_vendor_payment`
  - `create_job`
  - `update_job_status`
  - `list_today_jobs`
  - `record_expense`
  - `daily_summary`
  - `monthly_summary`
- `unsupported` or `unknown` fallback

**Acceptance criteria**

- Resolver does not emit legacy broad intents from `backend/src/messaging/intents/schemas.ts`.
- Intent output includes any directly extractable fields from the same message.
- Unsupported requests can be delegated to V1 before execution begins.

### 7. Implement slot filling by workflow

**Goal**

Merge extracted data into typed workflow slots and track missing required fields.

**Deliverables**

- Workflow-specific slot definitions
- Slot merge logic for new turns
- Missing-slot computation
- Validation for workflow-specific rules

**Acceptance criteria**

- Missing slots are computed per workflow only.
- `vendor_query`, `customer_query`, and `job_query` are never interchangeable.
- `deposit_pence <= total_pence` is enforced in `create_job`.
- `record_expense` validates amount and any required category constraints.

### 8. Implement entity resolution rules

**Goal**

Resolve customer, vendor, and job references without cross-domain leakage.

**Deliverables**

- Customer-only lookup path
- Vendor-only lookup path
- Job-only lookup path
- `resolved | ambiguous | not_found` result model

**Acceptance criteria**

- Vendor text is never resolved against customers.
- Customer text is never resolved against vendors.
- `update_job_status` uses recent job refs only when the message is clearly referential.
- `list_today_jobs` performs no entity resolution.
- `record_expense` resolves vendors only when a vendor reference is explicitly present.
- `daily_summary` and `monthly_summary` perform no entity resolution.

### 9. Implement workflow-specific confirmation handling

**Goal**

Replace generic confirmation with domain-specific confirmation and clarification logic.

**Deliverables**

- Duplicate-customer confirmation for `create_customer`
- Vendor-create confirmation for `record_vendor_debt`
- Vendor clarification only for `record_vendor_payment`
- Missing/ambiguous customer clarification for `create_job`
- Optional cancel confirmation for `update_job_status`
- Expense clarification rules for `record_expense`

**Acceptance criteria**

- `record_vendor_payment` never offers vendor creation.
- `create_job` does not silently create a customer.
- No generic low-confidence confirmation flow exists in V2.
- Summary workflows do not introduce unnecessary confirmation steps.

### 10. Build service adapters and executor

**Goal**

Map resolved V2 workflows to existing backend services safely.

**Deliverables**

- Adapter layer wrapping reusable services
- Workflow execution dispatcher
- Standardized execution result model

**Expected service reuse**

- `CustomersService.normalizePhone()`
- `CustomersService.listResolutionCandidates()`
- `CustomersService.findCustomerById()`
- `JobsService.createJobForCustomerId()`
- `JobsService.updateJobStatus()`
- `JobsService.listResolutionCandidates()`
- `VendorPaymentsService.resolveVendorByQuery()`
- `VendorPaymentsService.addVendorDebt()`
- `VendorPaymentsService.addVendorPaymentByVendorId()`
- `PaymentsService` methods for expense recording, if they match V2 semantics
- `ReportsService` methods for daily and monthly summary reads, if they match V2 semantics
- `RemindersService` methods for morning reminder or summary automation, if they match V2 semantics

**Acceptance criteria**

- V2 does not use `JobsService.createJob()` for job creation.
- V2 does not rely on `CustomersService.upsertByPhoneOrName()` for explicit customer creation semantics.
- Executor behavior is deterministic and easy to test with mocks.
- Summary and automation adapters are narrow and do not depend on V1 orchestration modules.

### 11. Build the response builder

**Goal**

Generate plain English WhatsApp replies from structured runtime outcomes.

**Deliverables**

- Success replies
- Clarification prompts
- Confirmation prompts
- Unsupported fallback replies
- Summary reply formatting
- Morning automation message formatting

**Acceptance criteria**

- Reply copy is English-only.
- Prompt text can be generated from V2 state and workflow context.
- Replies are consistent across workflows and do not depend on V1 reply templates by default.
- Automated summary copy is generated from the same response or template layer where practical.

## Milestone 2: Core Workflows A

### 12. Implement `create_customer` workflow

**Goal**

Support explicit customer creation with duplicate and phone validation handling.

**Deliverables**

- Slot definitions
- Slot filling behavior
- Duplicate-check confirmation behavior
- Execution path

**Acceptance criteria**

- Requires `customer_name`.
- Invalid phone values trigger clarification.
- Likely duplicate customers trigger confirmation before execution.

### 13. Implement `record_vendor_debt` workflow

**Goal**

Support vendor debt recording, including allowed vendor creation confirmation.

**Deliverables**

- Amount extraction and validation
- Vendor lookup integration
- Vendor-create confirmation when not found
- Debt execution path

**Acceptance criteria**

- Requires `amount_pence` and `vendor_query`.
- Missing amount or vendor prompts for clarification.
- Vendor not found can lead to: "Create vendor X and record debt?"

### 14. Implement `record_vendor_payment` workflow

**Goal**

Support vendor payment recording without vendor auto-creation.

**Deliverables**

- Amount extraction and validation
- Vendor lookup integration
- Vendor clarification path
- Payment execution path

**Acceptance criteria**

- Requires `amount_pence` and `vendor_query`.
- Vendor not found never triggers vendor creation confirmation.
- Execution only happens when a specific vendor is resolved.

## Milestone 3: Core Workflows B

### 15. Implement `create_job` workflow

**Goal**

Create jobs only for an explicitly resolved existing customer.

**Deliverables**

- Customer resolution integration
- Title and pricing slot handling
- Due date ambiguity handling
- Job creation execution path

**Acceptance criteria**

- Requires `customer_query`, `title`, and `total_pence`.
- Does not silently create or update a customer during job creation.
- Ambiguous due dates trigger clarification.

### 16. Implement `update_job_status` workflow

**Goal**

Update a job status using explicit job resolution and allowed status values.

**Deliverables**

- Job lookup integration
- Status validation
- Optional cancel confirmation
- Status update execution path

**Acceptance criteria**

- Allowed statuses are exactly `active`, `completed`, and `canceled`.
- Missing or ambiguous job references trigger clarification.
- `completed` and `active` can execute directly.

### 17. Implement `list_today_jobs` workflow

**Goal**

Return today's jobs according to the chosen product definition.

**Deliverables**

- Finalized product meaning for "today jobs"
- Read path implementation
- Workflow response formatting

**Acceptance criteria**

- No confirmation step exists.
- No entity resolution runs for this workflow.
- If `RemindersService.buildTodayPlan()` is reused, the workflow definition must explicitly match that behavior.

## Milestone 4: Reports and Automation

### 18. Implement `record_expense` workflow

**Goal**

Support explicit expense recording with correct amount parsing and optional vendor linkage.

**Deliverables**

- Expense slot definitions
- Amount parsing and validation
- Optional category handling
- Optional vendor resolution integration
- Expense execution path

**Acceptance criteria**

- Requires `amount_pence`.
- Clarifies missing or invalid amount values.
- Vendor lookup runs only when a vendor reference is present.
- Workflow behavior is compatible with the reporting model used by summaries.

### 19. Implement `daily_summary` workflow

**Goal**

Return a stable daily summary from a clearly defined reporting source.

**Deliverables**

- Final daily summary product definition
- Summary read path
- Reply formatting

**Acceptance criteria**

- No entity resolution runs for this workflow.
- No confirmation step exists.
- Output uses one stable definition of "daily summary" across all users.

### 20. Implement `monthly_summary` workflow

**Goal**

Return a stable monthly summary for the current month or a specified month.

**Deliverables**

- Month parsing and validation
- Summary read path
- Reply formatting

**Acceptance criteria**

- Defaults to current month when no month is provided, if product-approved.
- Ambiguous month references trigger clarification.
- Output uses one stable definition of "monthly summary" across all users.

### 21. Implement morning reminder or summary automation

**Goal**

Send an automated morning WhatsApp summary or reminder using V2 summary logic and templates where possible.

**Deliverables**

- Automation entrypoint or scheduler integration
- Message template or response-builder integration
- Per-user eligibility or preference checks
- Logging for sent automation messages

**Acceptance criteria**

- Automation does not depend on inbound message routing to run.
- Message content reuses V2 summary definitions where possible.
- The system can safely distinguish automated sends from user-triggered workflow turns.

## Milestone 5: Routing, Tests, and Cleanup

### 22. Add V1/V2 routing and feature gating

**Goal**

Run V2 safely beside the existing messaging stack.

**Deliverables**

- Routing gate from existing inbound flow
- Opt-in or feature-flag control
- Delegation path for unsupported intents

**Acceptance criteria**

- Test users or opted-in users can be routed to V2 only.
- Unsupported fresh intents can fall back to V1 before any V2 execution.
- Users with an active V2 pending flow remain on V2 until completion, cancel, expiry, or confirmed topic shift.

### 23. Add automated tests for the engine and workflows

**Goal**

Cover core runtime behavior and each MVP workflow with focused tests.

**Deliverables**

- Runtime pipeline tests
- Topic-shift tests
- State persistence tests
- Workflow tests for all V2 MVP flows
- Adapter/executor tests with mocks
- Automation tests for morning summary or reminder delivery

**Acceptance criteria**

- Tests cover happy path, missing-slot path, ambiguous-entity path, and confirmation path where applicable.
- Tests verify pending-flow persistence and clearing rules.
- Tests verify that forbidden V1 behaviors are not reintroduced through V2.
- Tests verify summary outputs against the selected reporting definitions.

### 24. Add V1 cleanup and deprecation work

**Goal**

Retire V1 files and branches that are no longer used after V2 takes ownership of the replaced workflows.

**Deliverables**

- Inventory of V1 modules replaced by V2
- Usage verification before deletion
- Deletion or deprecation PRs for dead files
- Regression checks around removed routing paths

**Acceptance criteria**

- No production-routed workflow still depends on removed V1 modules.
- Cleanup is staged after pilot validation, not mixed into the first V2 implementation pass.
- Dead reply templates, generic confirmation paths, and disambiguation channels are removed or clearly marked deprecated.

### 25. Add rollout and observability support

**Goal**

Make pilot rollout and debugging safe before broader adoption.

**Deliverables**

- Structured logs for V2 routing and workflow decisions
- Shadow-mode option if desired
- Pilot-mode safeguards for internal/test users

**Acceptance criteria**

- Logs make it possible to inspect intent resolution, topic-shift decisions, and execution outcomes.
- V2 can be enabled for a limited audience without affecting general traffic.
- Rollout path supports shadow mode, pilot mode, and broader release.

## Suggested issue groups

### Foundation

- Task 1. Create the V2 module skeleton
- Task 2. Define V2 contracts and state schema
- Task 3. Implement the V2 state store

### Engine

- Task 4. Implement the runtime pipeline
- Task 5. Implement topic-shift handling
- Task 6. Implement the MVP intent resolver
- Task 7. Implement slot filling by workflow
- Task 8. Implement entity resolution rules
- Task 9. Implement workflow-specific confirmation handling
- Task 10. Build service adapters and executor
- Task 11. Build the response builder

### Workflows

- Task 12. Implement `create_customer` workflow
- Task 13. Implement `record_vendor_debt` workflow
- Task 14. Implement `record_vendor_payment` workflow
- Task 15. Implement `create_job` workflow
- Task 16. Implement `update_job_status` workflow
- Task 17. Implement `list_today_jobs` workflow
- Task 18. Implement `record_expense` workflow
- Task 19. Implement `daily_summary` workflow
- Task 20. Implement `monthly_summary` workflow
- Task 21. Implement morning reminder or summary automation

### Rollout

- Task 22. Add V1/V2 routing and feature gating
- Task 23. Add automated tests for the engine and workflows
- Task 24. Add V1 cleanup and deprecation work
- Task 25. Add rollout and observability support

## Suggested milestones

### Milestone 1: Foundation ready

Tasks 1 to 3 completed.

### Milestone 2: Engine ready

Tasks 4 to 11 completed.

### Milestone 3: MVP workflows ready

Tasks 12 to 21 completed.

### Milestone 4: Pilot ready

Tasks 22 to 25 completed.

## Definition of done for V2 MVP

V2 MVP is ready for pilot when:

- The selected V2 MVP workflows execute end-to-end in the V2 runtime.
- Pending-flow continuation behaves consistently across turns.
- V2 state is isolated from V1 state.
- Unsupported fresh intents can safely fall back to V1.
- Summary and automation outputs use stable, product-defined read models.
- Core workflow and runtime tests are passing.
- Pilot routing can be enabled for a restricted audience.
