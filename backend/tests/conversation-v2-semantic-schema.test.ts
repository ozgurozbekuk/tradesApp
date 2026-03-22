import assert from "node:assert/strict";
import test from "node:test";

test("semantic workflow intent schema accepts messy create_job fields", async () => {
  const { semanticFrontDoorResultSchema } = await import("../src/conversation-v2/semantic/schema");

  const parsed = semanticFrontDoorResultSchema.parse({
    kind: "workflow_intent",
    workflow: "create_job",
    mode: "fresh",
    confidence: "high",
    fields: {
      title: "home cleaning",
      total_pence: 50000,
      customer_query: "john",
      deposit_pence: 10000,
      due_date: "2 weeks"
    }
  });

  assert.equal(parsed.kind, "workflow_intent");
  if (parsed.kind !== "workflow_intent") {
    return;
  }

  assert.equal(parsed.workflow, "create_job");
  assert.deepEqual(parsed.fields, {
    title: "home cleaning",
    total_pence: 50000,
    customer_query: "john",
    deposit_pence: 10000,
    due_date: "2 weeks"
  });
});

test("semantic clarification schema rejects slot keys outside the declared workflow", async () => {
  const { semanticClarificationSchema } = await import("../src/conversation-v2/semantic/schema");

  const result = semanticClarificationSchema.safeParse({
    kind: "clarification",
    question: "Which customer is this for?",
    workflow: "create_job",
    missing_fields: ["vendor_query"]
  });

  assert.equal(result.success, false);
});

test("semantic delegate schema accepts explicit V1 delegation", async () => {
  const { semanticFrontDoorResultSchema } = await import("../src/conversation-v2/semantic/schema");

  const parsed = semanticFrontDoorResultSchema.parse({
    kind: "delegate_to_v1",
    capability: "booking_create"
  });

  assert.equal(parsed.kind, "delegate_to_v1");
  if (parsed.kind !== "delegate_to_v1") {
    return;
  }

  assert.equal(parsed.capability, "booking_create");
});

test("semantic workflow intent schema rejects unknown fields", async () => {
  const { semanticWorkflowIntentSchema } = await import("../src/conversation-v2/semantic/schema");

  const result = semanticWorkflowIntentSchema.safeParse({
    kind: "workflow_intent",
    workflow: "create_customer",
    mode: "fresh",
    confidence: "high",
    fields: {
      customer_name: "John",
      random_field: "should fail"
    }
  });

  assert.equal(result.success, false);
});
