import assert from "node:assert/strict";
import test from "node:test";

const ensureEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "https://example.com/db";
  process.env.BASE_URL = process.env.BASE_URL || "https://example.com";
};

test("semantic interpreter returns validated workflow intent output", async () => {
  ensureEnv();
  const { interpretConversationV2Semantically } = await import("../src/conversation-v2/semantic/interpreter");

  const result = await interpretConversationV2Semantically(
    {
      message: "add job : home cleaning , price:500 , customer : john , deposit : 100 , due:2 weeks"
    },
    async () => ({
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
    })
  );

  assert.equal(result.kind, "workflow_intent");
  if (result.kind !== "workflow_intent") {
    return;
  }

  assert.equal(result.workflow, "create_job");
  assert.equal(result.fields.total_pence, 50000);
});

test("semantic interpreter converts invalid LLM output into unknown", async () => {
  ensureEnv();
  const { interpretConversationV2Semantically } = await import("../src/conversation-v2/semantic/interpreter");

  const result = await interpretConversationV2Semantically(
    {
      message: "create customer John"
    },
    async () => ({
      kind: "workflow_intent",
      workflow: "create_customer",
      mode: "fresh",
      confidence: "high",
      fields: {
        customer_name: "John",
        random_field: "bad"
      }
    })
  );

  assert.deepEqual(result, {
    kind: "unknown",
    reason: "Semantic interpreter returned invalid structured output."
  });
});

test("semantic user prompt includes pending flow context", async () => {
  ensureEnv();
  const { buildConversationV2SemanticUserPrompt } = await import("../src/conversation-v2/semantic/prompt");

  const prompt = buildConversationV2SemanticUserPrompt({
    message: "title: boiler repair",
    context: {
      recentRefs: {
        customerName: "John"
      },
      pendingFlow: {
        workflow: "create_job",
        step: "slot_filling",
        slots: {
          customer_query: "John"
        },
        missingSlots: ["title", "total_pence"],
        prompt: "What is the job title?"
      }
    }
  });

  assert.match(prompt, /"message": "title: boiler repair"/);
  assert.match(prompt, /"workflow": "create_job"/);
  assert.match(prompt, /"missingSlots": \[/);
  assert.match(prompt, /"customerName": "John"/);
});
