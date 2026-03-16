# Semantic-First V2 Design Note

## Goal

Move from a regex-first workflow engine to a semantic-first assistant architecture:

1. Every inbound message goes to an LLM first.
2. The LLM interprets the message into a server-safe structured decision.
3. The server validates that decision against strict schemas.
4. The deterministic V2 runtime executes the workflow.
5. The LLM never touches the database and never executes business actions directly.

This keeps the assistant feel of an LLM-first experience while preserving deterministic execution and data safety.

## Core Principle

The LLM is an interpreter, not an executor.

The LLM may:

- classify user intent
- extract fields
- infer missing information
- detect ambiguity
- decide whether the message is a follow-up or a fresh request
- convert messy user language into structured server input

The LLM may not:

- call Prisma
- call services directly
- mutate records
- decide final entity matches without server validation
- bypass workflow validation

## Target Runtime Shape

### Old direction

- user message
- regex / heuristic parsing
- partial workflow detection
- server execution

### New direction

- user message
- semantic interpreter LLM
- structured semantic output
- schema validation
- V2 workflow runtime
- entity resolution
- confirmation
- execution
- response

## Proposed Pipeline

### Step 1. Load state

Server loads:

- V2 conversation state
- active pending flow if any
- recent refs
- user identity

### Step 2. Send message to semantic interpreter

Every inbound message goes to an LLM-facing interpreter module.

Interpreter input should include:

- raw user message
- pending flow summary
- recent refs summary
- supported V2 workflows
- unsupported-but-known capabilities still handled by V1
- strict output schema instructions

The interpreter should decide:

- is this a fresh request or a continuation
- which capability or workflow is intended
- which fields are present
- what is still missing
- whether the server should clarify, execute, or delegate

### Step 3. Validate structured output

The server validates the LLM output through Zod or equivalent schemas.

If invalid:

- reject the output
- optionally retry with repair instructions
- or fall back to a safe clarification reply

### Step 4. Map semantic result into V2 workflow input

The server converts the interpreter output into V2-native structures:

- workflow name
- typed slots
- continuation vs fresh intent
- clarification reason
- confirmation candidate

This becomes the only interface between the LLM layer and the workflow runtime.

### Step 5. Run deterministic workflow runtime

Existing V2 runtime remains responsible for:

- state ownership
- slot merging
- entity resolution
- ambiguity handling
- confirmation
- execution
- response persistence

### Step 6. Delegate unsupported capabilities

If the semantic interpreter identifies a request outside V2:

- mark it as `delegate_to_v1`
- do not partially execute in V2
- hand the turn to V1 intentionally

This is cleaner than letting narrow regex parsing fail accidentally.

## New System Contracts

## 1. Semantic interpreter output

Add a new server-safe structured output such as:

```ts
type SemanticFrontDoorResult =
  | {
      kind: "workflow_intent";
      workflow:
        | "create_customer"
        | "record_vendor_debt"
        | "record_vendor_payment"
        | "create_job"
        | "update_job_status"
        | "list_today_jobs"
        | "record_expense"
        | "daily_summary"
        | "monthly_summary";
      mode: "fresh" | "continue_pending";
      confidence: "high" | "medium" | "low";
      fields: Record<string, unknown>;
      reasoningSummary?: string;
    }
  | {
      kind: "clarification";
      question: string;
      workflow?: string;
      missingFields?: string[];
      reasoningSummary?: string;
    }
  | {
      kind: "delegate_to_v1";
      capability: string;
      reasoningSummary?: string;
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

Important rule:

- this object is advisory until the server validates it

## 2. Workflow runtime input

The current V2 runtime should evolve to accept semantic-first normalized inputs instead of only regex-derived intent objects.

Example:

```ts
type RuntimeNormalizedTurn =
  | {
      type: "workflow_intent";
      workflow: WorkflowName;
      fields: Record<string, unknown>;
      source: "semantic_llm";
      mode: "fresh" | "continue_pending";
    }
  | {
      type: "clarification";
      question: string;
    }
  | {
      type: "delegate_to_v1";
      capability: string;
    };
```

## Which Existing V2 Parts Stay

These parts are still valid and should remain:

- `pendingFlow` state model
- state store
- entity resolution boundaries
- workflow-specific confirmation rules
- service adapters
- deterministic executor
- response builder
- routing gate / V1 fallback logic

These are good runtime-core decisions and do not conflict with semantic-first input.

## Which Existing V2 Parts Must Change

### 1. Intent resolver becomes LLM-first

Current issue:

- `conversation-v2/intent/intent-resolver.ts` is mostly regex-driven

Required change:

- make semantic interpretation the primary path
- keep regex heuristics only as fallback or repair path

### 2. Slot extraction must become semantic, not phrase-shaped

Current issue:

- slot extraction fails when wording changes slightly
- labeled input like `price:500, customer:john` is not robustly parsed

Required change:

- the LLM should extract fields semantically
- the runtime should only validate and normalize them

### 3. Pending-flow continuation must accept semantic follow-ups

Current issue:

- continuation logic is too narrow
- it often expects one missing slot and a short direct answer

Required change:

- LLM should decide whether a short reply satisfies one or more pending slots
- runtime should merge validated fields into the current `pendingFlow`

## Recommended Module Changes

## Add

- `backend/src/conversation-v2/semantic/interpreter.ts`
- `backend/src/conversation-v2/semantic/prompt.ts`
- `backend/src/conversation-v2/semantic/schema.ts`
- `backend/src/conversation-v2/semantic/normalizer.ts`

## Refactor

- `backend/src/conversation-v2/intent/intent-resolver.ts`
  - becomes thin wrapper around semantic interpreter

- `backend/src/conversation-v2/slot/slot-filler.ts`
  - should focus on merge and validation
  - should stop owning most language parsing responsibility

- `backend/src/conversation-v2/engine/runtime.ts`
  - should call semantic interpreter before intent resolution
  - should support semantic `fresh` vs `continue_pending`

## Reuse from V1 if helpful

Potentially reusable references:

- `backend/src/messaging/semantic-agent/types.ts`
- `backend/src/messaging/semantic-agent/interpreter.ts`
- `backend/src/messaging/semantic-agent/prompt.ts`

But do not copy V1 orchestration wholesale.
Use them only as reference material for prompt/output shape.

## Safety Rules

These are non-negotiable.

### Rule 1. LLM output is never trusted blindly

Every LLM output must be validated against strict schemas.

### Rule 2. Entity resolution stays server-side

If the LLM says `customer = John`, the server still must resolve:

- whether John exists
- whether there are multiple Johns
- whether user clarification is required

### Rule 3. Confirmations stay server-side

The LLM may suggest that confirmation is needed.
The server decides whether confirmation is actually required.

### Rule 4. Execution stays server-side

Only the server may call:

- services
- DB operations
- export creation
- billing/subscription operations
- reminder creation

### Rule 5. Unsupported capability delegation is explicit

If V2 cannot handle a request, the system should say so internally and delegate cleanly.
Do not rely on accidental parser failure as routing logic.

## Why This Fixes Current Pain

This architecture directly addresses problems like:

- `add job : home cleaning , price:500 , customer : john , deposit : 100 , due:2 weeks`
- messy abbreviated language
- reordered slot presentation
- partial replies during pending flows
- wording variation that humans understand but regex does not

Because the LLM sees the semantic meaning first, it can produce:

- workflow: `create_job`
- fields:
  - `title = "home cleaning"`
  - `total_pence = 50000`
  - `customer_query = "john"`
  - `deposit_pence = 10000`
  - `due_date = "2 weeks"`

The server can then validate:

- due date parseability
- deposit vs total
- customer resolution
- confirmation rules

## Tradeoffs

### Benefits

- far better natural-language flexibility
- stronger assistant feel
- fewer brittle regex misses
- cleaner separation between interpretation and execution
- better long-term product direction

### Costs

- higher latency
- higher LLM cost
- need for prompt and schema hardening
- possible semantic hallucinations
- more work on evals and observability

## Required Evaluation Changes

The current eval runner is V1-oriented and parser-oriented.
That is no longer enough.

We will need:

- semantic interpreter eval set
- workflow normalization eval set
- pending-flow continuation eval set
- end-to-end runtime eval set

Evaluation should test:

- same intent across many phrasings
- labeled input
- bad spelling
- short follow-ups
- topic shifts
- unsupported capability delegation

## Rollout Strategy

### Phase 1

- keep current V2 runtime core
- add semantic interpreter in front of it
- use semantic-first path behind a flag

### Phase 2

- compare semantic-first path against current regex-first V2
- inspect failures
- tune prompt and output schema

### Phase 3

- make semantic-first the default V2 path
- keep regex parser only as fallback

### Phase 4

- expand capability parity with V1
- then remove V1 fallback once both feature breadth and assistant quality are acceptable

## Final Recommendation

The right architecture is:

- LLM first for meaning
- server first for truth
- workflow engine for control
- service layer for execution

In one sentence:

Every message should go to the LLM first, but only the server is allowed to decide what is valid and what actually runs.
