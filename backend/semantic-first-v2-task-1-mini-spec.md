# Semantic-First V2 Task 1 Mini Spec

## Task

Define the semantic interpreter contract for Semantic-First V2.

This task is only about the structured output shape.
It does not include the actual LLM caller or runtime wiring.

## Goal

Create a strict, server-safe schema for the first LLM output that will sit in front of the V2 runtime.

This schema must be:

- expressive enough for semantic interpretation
- narrow enough to validate reliably
- aligned with existing V2 workflow and slot schemas
- safe by design so the LLM cannot directly execute anything

## Non-Goals

This task must not:

- call the LLM
- change route wiring
- execute workflows
- resolve entities
- mutate pending flow
- replace current V2 intent resolution yet

## Design Rules

### Rule 1

The semantic contract is advisory, not authoritative.

The server may accept, reject, normalize, or ignore the output.

### Rule 2

The schema should reuse existing V2 workflow names and slot shapes wherever possible.

That means it must align with:

- `backend/src/conversation-v2/engine/contracts.ts`
- `backend/src/conversation-v2/state/state-schema.ts`
- `backend/src/conversation-v2/intent/intent-schema.ts`

### Rule 3

The semantic layer may classify intent and extract candidate fields, but it may not claim:

- resolved database IDs
- final entity matches
- execution success
- authorization or business-rule validity

### Rule 4

Unsupported or out-of-scope requests must be explicit.

The contract should allow the system to intentionally delegate to V1 instead of failing by accident.

## Proposed Output Variants

The schema should be a discriminated union on `kind`.

## 1. `workflow_intent`

Used when the interpreter believes the message maps to a V2 workflow.

### Required fields

- `kind: "workflow_intent"`
- `workflow`
- `mode`
- `confidence`
- `fields`

### Optional fields

- `reasoning_summary`
- `missing_fields`

### Notes

- `workflow` must be one of the existing V2 workflow names.
- `mode` must be:
  - `fresh`
  - `continue_pending`
- `confidence` should remain:
  - `high`
  - `medium`
  - `low`
- `fields` must be validated against workflow-specific slot schemas.
- `missing_fields` may be advisory only and must not replace server validation.

## 2. `clarification`

Used when the interpreter cannot safely produce a workflow intent yet.

### Required fields

- `kind: "clarification"`
- `question`

### Optional fields

- `workflow`
- `missing_fields`
- `reasoning_summary`

### Notes

- `question` is user-facing English text.
- `workflow` is optional because sometimes capability is still uncertain.
- `missing_fields` should only contain known slot keys if `workflow` is present.

## 3. `delegate_to_v1`

Used when the interpreter identifies a known capability outside current V2 scope.

### Required fields

- `kind: "delegate_to_v1"`
- `capability`

### Optional fields

- `reasoning_summary`

### Notes

- `capability` should be a controlled string enum, not free text.
- This is how the semantic layer explicitly says:
  - "I understood the request"
  - "but it belongs to V1 right now"

## 4. `respond`

Used only for safe conversational replies that do not mutate records.

### Required fields

- `kind: "respond"`
- `message`

### Notes

- This should be used sparingly in Phase 1.
- It is mainly for greeting/help-like cases if needed.
- It must never be used to imply that a business action has already happened.

## 5. `unknown`

Used when the interpreter cannot confidently classify the request.

### Required fields

- `kind: "unknown"`

### Optional fields

- `reason`

## Field-Level Decisions

## `workflow`

Must reuse current V2 names:

- `create_customer`
- `record_vendor_debt`
- `record_vendor_payment`
- `create_job`
- `update_job_status`
- `list_today_jobs`
- `record_expense`
- `daily_summary`
- `monthly_summary`

## `fields`

For `workflow_intent`, `fields` must validate against the existing workflow slot schema for the chosen workflow.

That means:

- no extra keys
- no V1-only field names
- no resolved IDs
- no hidden execution instructions

Examples:

- `create_job.fields`
  - `customer_query`
  - `title`
  - `total_pence`
  - `deposit_pence`
  - `due_date`
  - `notes`

- `record_vendor_payment.fields`
  - `vendor_query`
  - `amount_pence`
  - `note`
  - `occurred_on`

## `missing_fields`

This should be optional and advisory.

It can help the runtime or logs, but must not replace server-side missing-slot computation.

If present:

- for `workflow_intent`, it must only contain slot keys for that workflow
- for `clarification`, it may be absent if the interpreter only knows a clarification is needed

## `capability`

For `delegate_to_v1`, use a narrow enum for Phase 1.

Initial allowed values:

- `customer_lookup`
- `customer_payment`
- `booking_create`
- `job_list_extended`
- `expense_list`
- `vendor_summary`
- `export_pdf`
- `invoice_create`
- `briefing_toggle`
- `unknown_v1_capability`

This can expand later, but it should not be free-form now.

## Schema Layout

Recommended files:

- `backend/src/conversation-v2/semantic/schema.ts`
- optional type exports from that file only

Recommended exports:

- `semanticFrontDoorResultSchema`
- `semanticWorkflowIntentSchema`
- `semanticClarificationSchema`
- `semanticDelegateToV1Schema`
- `semanticRespondSchema`
- `semanticUnknownSchema`

## Expected Type Shape

Illustrative target:

```ts
type SemanticFrontDoorResult =
  | {
      kind: "workflow_intent";
      workflow: WorkflowName;
      mode: "fresh" | "continue_pending";
      confidence: "high" | "medium" | "low";
      fields: WorkflowSlots;
      missing_fields?: string[];
      reasoning_summary?: string;
    }
  | {
      kind: "clarification";
      question: string;
      workflow?: WorkflowName;
      missing_fields?: string[];
      reasoning_summary?: string;
    }
  | {
      kind: "delegate_to_v1";
      capability:
        | "customer_lookup"
        | "customer_payment"
        | "booking_create"
        | "job_list_extended"
        | "expense_list"
        | "vendor_summary"
        | "export_pdf"
        | "invoice_create"
        | "briefing_toggle"
        | "unknown_v1_capability";
      reasoning_summary?: string;
    }
  | {
      kind: "respond";
      message: string;
    }
  | {
      kind: "unknown";
      reason?: string;
    };
```

## Validation Rules

### `workflow_intent`

- `workflow` must be valid
- `mode` must be valid
- `confidence` must be valid
- `fields` must match the selected workflow slot schema
- `missing_fields` must not contain keys outside the selected workflow

### `clarification`

- `question` must be non-empty
- if `workflow` exists, it must be valid
- if `missing_fields` exists together with `workflow`, all entries must belong to that workflow

### `delegate_to_v1`

- `capability` must be from the allowed enum

### `respond`

- `message` must be non-empty

### `unknown`

- no extra required fields

## Example Outputs

### Example 1. Messy create-job message

Input:

`add job : home cleaning , price:500 , customer : john , deposit : 100 , due:2 weeks`

Expected semantic output:

```json
{
  "kind": "workflow_intent",
  "workflow": "create_job",
  "mode": "fresh",
  "confidence": "high",
  "fields": {
    "title": "home cleaning",
    "total_pence": 50000,
    "customer_query": "john",
    "deposit_pence": 10000,
    "due_date": "2 weeks"
  }
}
```

### Example 2. Pending follow-up

Pending flow is waiting on job title and price.

Input:

`title: boiler repair, price: 450`

Expected semantic output:

```json
{
  "kind": "workflow_intent",
  "workflow": "create_job",
  "mode": "continue_pending",
  "confidence": "high",
  "fields": {
    "title": "boiler repair",
    "total_pence": 45000
  }
}
```

### Example 3. V1-only export request

Input:

`send me john's records as pdf`

Expected semantic output:

```json
{
  "kind": "delegate_to_v1",
  "capability": "export_pdf"
}
```

## Acceptance Criteria

Task 1 is complete when:

- the semantic output schema exists
- it compiles cleanly with current V2 types
- it reuses existing workflow slot validation
- it does not expose execution-level authority to the LLM
- it supports explicit delegation to V1
- there is no ambiguity about what the LLM is allowed to return

## Open Decisions To Keep Small

These should be fixed now to avoid scope creep:

- do not include resolved entity IDs in semantic output
- do not include confirmation decisions in semantic output
- do not include final assistant reply text except for `respond` and `clarification`
- do not include arbitrary free-form capability names

## Recommended Next Step After This Task

After Task 1, move directly to:

- implementing `semantic/interpreter.ts`
- wiring one mock caller in tests before any real runtime integration
