# Semantic-First V2 Phase 2 Tasks

## Purpose

This document defines the next implementation phase after Semantic-First V2 Phase 1.

Phase 1 established:

- semantic schema
- interpreter
- normalizer
- runtime integration behind a flag
- semantic pending-flow continuation
- eval surface
- observability

Phase 2 and beyond should focus on hardening and capability parity so V2 can become the primary assistant experience.

## Guiding Rule

Do not invest in new V1 patches except for emergency production blockers.

All meaningful assistant improvements should now go into V2.

## Milestone 1: Semantic Hardening

### 1. Handle fresh semantic clarification explicitly

**Goal**

Close the gap where fresh semantic clarification is currently not fully honored.

**Deliverables**

- runtime support for semantic clarification on fresh turns
- consistent reply path for semantic clarification
- tests for fresh clarification behavior

**Acceptance criteria**

- when the semantic layer returns `clarification` for a fresh turn, runtime returns that clarification directly
- runtime does not silently fall back to regex-first parsing in that case

### 2. Improve semantic entity disambiguation

**Goal**

Make ambiguous entity selection reliable across customer, vendor, and job flows.

**Deliverables**

- stronger candidate labeling
- support for numeric, ordinal, and exact-label replies
- tests for multi-candidate follow-ups

**Acceptance criteria**

- numbered ambiguity replies are stable
- `1`, `2`, `first`, `second`, and exact labels resolve correctly
- ambiguity loops are reduced significantly

### 3. Improve date and field normalization

**Goal**

Make semantic-first workflows robust against natural time and field phrasing.

**Deliverables**

- better due date parsing
- support for phrases like:
  - `next week`
  - `in 2 weeks`
  - `next friday`
  - `end of month`
- improved label-based extraction handling

**Acceptance criteria**

- common date expressions no longer fail basic workflow progression
- semantic-first handles reordered and labeled fields more reliably

### 4. Add real semantic eval coverage

**Goal**

Go beyond mock-output contract tests and measure actual semantic behavior.

**Deliverables**

- real LLM-backed eval runner or optional live mode
- wording variation eval set
- pending-flow eval set
- ambiguity/disambiguation eval set

**Acceptance criteria**

- semantic quality can be measured independently of V1 evals
- evals distinguish prompt quality from schema plumbing

## Milestone 2: Capability Port A

### 5. Add customer records / account lookup to V2

**Goal**

Port customer records/account lookup flows from V1 into semantic-first V2.

**Deliverables**

- new V2 workflow or supported capability for customer records lookup
- customer ambiguity handling in V2
- response builder support

**Acceptance criteria**

- requests like `bring john records` can be handled in V2
- duplicate customer names are clarified safely
- no V1 patch is needed for this flow

### 6. Add customer payment logging to V2

**Goal**

Port payment recording for customers/jobs into semantic-first V2.

**Deliverables**

- workflow support for customer payment logging
- outstanding-job disambiguation path where needed
- method capture support if still required

**Acceptance criteria**

- payment logging no longer depends on V1
- ambiguity and missing-amount handling work through V2

## Milestone 3: Capability Port B

### 7. Add expense list and vendor summary to V2

**Goal**

Port the most useful read/report financial flows still trapped in V1.

**Deliverables**

- expense list capability
- vendor summary capability
- semantic-first handling and runtime mapping

**Acceptance criteria**

- these reporting flows no longer rely on V1 fallback

### 8. Add PDF/export flows to V2

**Goal**

Port export-heavy user flows into V2 so fallback pressure drops.

**Deliverables**

- customer PDF export
- full records export
- vendor PDF export if still needed
- expense export if still needed

**Acceptance criteria**

- export requests are intentionally handled in V2
- duplicate-customer export requests clarify correctly

### 9. Add invoice flow to V2

**Goal**

Port invoice creation / invoice PDF flow into semantic-first V2.

**Deliverables**

- invoice request capability
- invoice entity resolution path
- export link handoff through V2

**Acceptance criteria**

- invoice flow no longer requires V1 fallback

## Milestone 4: Rollout and Removal

### 10. Make semantic-first V2 the default for supported workflows

**Goal**

Promote semantic-first handling from experimental to default for the supported V2 set.

**Deliverables**

- flag strategy update
- runtime selection cleanup
- rollout checklist

**Acceptance criteria**

- semantic-first is the default path for supported V2 workflows
- regex-first becomes fallback, not primary

### 11. Reduce V1 fallback surface

**Goal**

Shrink the number of requests that still depend on V1.

**Deliverables**

- explicit list of remaining V1-only capabilities
- routing guard updates
- fallback telemetry review

**Acceptance criteria**

- V1 fallback is rare and measurable
- remaining fallback use is intentional, not accidental

### 12. Remove obsolete V1 paths

**Goal**

Retire superseded V1 messaging paths once V2 coverage and rollout confidence are sufficient.

**Deliverables**

- deletion plan
- cleanup PR
- test updates

**Acceptance criteria**

- removed code is truly no longer needed
- no critical supported user flows regress after removal

## Recommended Execution Order

1. Milestone 1: Semantic Hardening
2. Milestone 2: Capability Port A
3. Milestone 3: Capability Port B
4. Milestone 4: Rollout and Removal

## Recommended Next Immediate Work

The best next starting point is:

- Milestone 1
- Task 1: handle fresh semantic clarification explicitly

That is the smallest remaining runtime correctness gap before more capability work is layered on top.
