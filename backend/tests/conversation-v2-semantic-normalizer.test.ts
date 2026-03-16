import assert from "node:assert/strict";
import test from "node:test";

test("semantic normalizer converts workflow_intent into runtime-normalized intent", async () => {
  const { normalizeSemanticFrontDoorResult } = await import("../src/conversation-v2/semantic/normalizer");

  const result = normalizeSemanticFrontDoorResult({
    kind: "workflow_intent",
    workflow: "create_job",
    mode: "fresh",
    confidence: "high",
    fields: {
      customer_query: "john",
      title: "home cleaning",
      total_pence: 50000
    },
    reasoning_summary: "The user wants to create a new job."
  });

  assert.equal(result.type, "workflow_intent");
  if (result.type !== "workflow_intent") {
    return;
  }

  assert.equal(result.intent.workflow, "create_job");
  assert.equal(result.mode, "fresh");
  assert.equal(result.intent.fields.total_pence, 50000);
});

test("semantic normalizer preserves explicit V1 delegation", async () => {
  const { normalizeSemanticFrontDoorResult } = await import("../src/conversation-v2/semantic/normalizer");

  const result = normalizeSemanticFrontDoorResult({
    kind: "delegate_to_v1",
    capability: "export_pdf",
    reasoning_summary: "This is a PDF export request."
  });

  assert.deepEqual(result, {
    type: "delegate_to_v1",
    capability: "export_pdf",
    reasoningSummary: "This is a PDF export request."
  });
});

test("semantic normalizer preserves clarification payload", async () => {
  const { normalizeSemanticFrontDoorResult } = await import("../src/conversation-v2/semantic/normalizer");

  const result = normalizeSemanticFrontDoorResult({
    kind: "clarification",
    question: "Which customer is this for?",
    workflow: "create_job",
    missing_fields: ["customer_query"]
  });

  assert.deepEqual(result, {
    type: "clarification",
    question: "Which customer is this for?",
    workflow: "create_job",
    missingFields: ["customer_query"],
    reasoningSummary: undefined
  });
});

test("semantic normalizer preserves unknown outputs", async () => {
  const { normalizeSemanticFrontDoorResult } = await import("../src/conversation-v2/semantic/normalizer");

  const result = normalizeSemanticFrontDoorResult({
    kind: "unknown",
    reason: "No safe classification."
  });

  assert.deepEqual(result, {
    type: "unknown",
    reason: "No safe classification."
  });
});
