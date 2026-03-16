# Semantic-First V2 Phase 1 Plan

## Purpose

This phase does not aim to finish the full semantic-first migration.

Its purpose is to prove the new architecture safely:

- every inbound message can go through an LLM semantic interpreter first
- the server can validate and normalize that output
- the existing V2 runtime can consume it without giving execution control to the LLM

Phase 1 should stay intentionally small and focused.

## Phase 1 Scope

Limit the first phase to the highest-signal path:

- semantic interpretation for core V2 workflows only
- no V1 capability expansion yet
- no V1 removal
- no full parity work
- no broad cleanup

Recommended workflow coverage for Phase 1:

- `create_customer`
- `create_job`
- `update_job_status`
- `record_vendor_debt`
- `record_vendor_payment`

These are the best signal because they stress:

- natural language variation
- slot extraction
- pending-flow continuation
- entity resolution
- confirmation rules

## Task 1. Define the semantic interpreter contract

**Goal**

Create the server-safe structured output schema that the LLM must return.

**Deliverables**

- `backend/src/conversation-v2/semantic/schema.ts`
- Zod schema for semantic interpreter output
- typed TS contract for:
  - `workflow_intent`
  - `clarification`
  - `delegate_to_v1`
  - `respond`
  - `unknown`

**Acceptance criteria**

- LLM output format is strict and machine-validated.
- Output supports `fresh` vs `continue_pending`.
- Output supports only allowed V2 workflow names.
- No execution-level fields are trusted without validation.

## Task 2. Implement the semantic interpreter module

**Goal**

Add a dedicated LLM-facing interpreter layer in front of the V2 runtime.

**Deliverables**

- `backend/src/conversation-v2/semantic/interpreter.ts`
- `backend/src/conversation-v2/semantic/prompt.ts`
- semantic caller interface
- prompt that includes:
  - current message
  - pending flow summary
  - recent refs
  - supported V2 workflows
  - explicit "no DB / no execution" constraints

**Acceptance criteria**

- Interpreter returns only structured output.
- Interpreter is isolated from service execution.
- Prompt is workflow-aware and English-only.
- Invalid or empty LLM output is handled safely.

## Task 3. Add semantic-to-runtime normalization

**Goal**

Convert validated LLM output into runtime-native V2 input.

**Deliverables**

- `backend/src/conversation-v2/semantic/normalizer.ts`
- mapping from semantic result to:
  - V2 workflow intent
  - continuation mode
  - clarification response
  - explicit V1 delegation

**Acceptance criteria**

- Server rejects unsupported field shapes.
- Runtime receives typed workflow fields only.
- `delegate_to_v1` is explicit and testable.
- Semantic output cannot bypass slot and entity validation.

## Task 4. Integrate semantic-first path into the V2 runtime behind a flag

**Goal**

Make semantic interpretation the first step in V2 behind a dedicated feature flag.

**Deliverables**

- runtime integration in `backend/src/conversation-v2/engine/runtime.ts`
- new env flag such as `USE_V2_SEMANTIC_FRONT_DOOR`
- safe fallback path to the current regex-first V2 resolver

**Acceptance criteria**

- When flag is on, V2 sends inbound messages to the semantic interpreter first.
- When flag is off, current V2 behavior remains unchanged.
- Runtime can still fall back safely if semantic output is invalid.
- No DB execution path is exposed to the LLM.

## Task 5. Improve pending-flow continuation through semantic interpretation

**Goal**

Let short follow-up replies and reformatted answers fill multiple pending slots semantically.

**Deliverables**

- semantic continuation handling for active `pendingFlow`
- support for:
  - labeled replies
  - reordered slot answers
  - short replies that satisfy more than one field
- runtime merge logic updates if needed

**Acceptance criteria**

- A pending flow no longer depends on "exactly one missing slot" to make progress.
- Messages like `price: 500, deposit: 100` can be merged into pending job flows.
- The server still validates all merged fields after interpretation.

## Task 6. Add Phase 1 evals and smoke tests

**Goal**

Create a small evaluation and test layer for the semantic-first path.

**Deliverables**

- semantic-first test file(s) under `backend/tests/`
- small Phase 1 eval set focused on wording variation
- coverage for:
  - messy create-job phrasing
  - pending-flow follow-ups
  - ambiguous customer/vendor/job references
  - explicit V1 delegation cases

**Acceptance criteria**

- Phase 1 has its own eval cases and does not rely only on V1 parser evals.
- Tests prove that semantic-first handles phrasing that regex-first misses.
- Failures are inspectable and reproducible locally.

## Task 7. Add observability for semantic-first decisions

**Goal**

Make the new semantic layer debuggable before broad rollout.

**Deliverables**

- structured logs for:
  - semantic output validity
  - chosen workflow
  - delegation to V1
  - runtime validation rejection
  - clarification vs execution decisions

**Acceptance criteria**

- We can trace why a message was:
  - executed in V2
  - clarified
  - rejected
  - delegated to V1
- Semantic-first failures are diagnosable without guessing from user replies alone.

## Recommended Order

1. Task 1: semantic schema
2. Task 2: interpreter module
3. Task 3: normalizer
4. Task 4: runtime integration behind flag
5. Task 5: pending-flow semantic continuation
6. Task 6: evals and tests
7. Task 7: observability

## Definition of Done for Phase 1

Phase 1 is done when all of the following are true:

- V2 can run in semantic-first mode behind a flag.
- LLM output is schema-validated before runtime use.
- LLM has no execution or DB access.
- At least the selected core workflows work through the semantic-first path.
- The system can still fall back safely when semantic output fails.
- There is a dedicated test/eval surface for the new path.

## Out of Scope for Phase 1

- full V1 capability parity
- export / PDF migration
- invoice migration
- booking migration
- full V1 removal
- complete prompt optimization
- production-wide rollout by default
