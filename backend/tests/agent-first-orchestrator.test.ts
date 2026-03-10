import test from "node:test";
import assert from "node:assert/strict";

const ensureEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "https://example.com/db";
  process.env.BASE_URL = process.env.BASE_URL || "https://example.com";
};

test("agent-first orchestrator returns an intent for a valid tool call", async () => {
  ensureEnv();
  const { orchestrateWithAgentFirst } = await import("../src/messaging/agent-first/agent-first-orchestrator");

  const result = await orchestrateWithAgentFirst("john paid 250", undefined, async () => ({
    type: "call_tool",
    toolName: "recordPayment",
    toolInput: {
      customerName: "John",
      amountPence: 25000
    }
  }));

  assert.equal(result.status, "intent");
  if (result.status !== "intent") {
    return;
  }

  assert.deepEqual(result.intent, {
    type: "payment_add",
    customerName: "John",
    amountPence: 25000,
    jobId: undefined,
    method: undefined,
    note: undefined
  });
  assert.equal(result.analysis.intent, "record_payment");
});

test("agent-first orchestrator returns clarification with pending-flow analysis", async () => {
  ensureEnv();
  const { orchestrateWithAgentFirst } = await import("../src/messaging/agent-first/agent-first-orchestrator");

  const result = await orchestrateWithAgentFirst("book a kitchen job for John", undefined, async () => ({
    type: "clarify",
    question: "What is the total price for the job?",
    toolName: "createJob",
    toolInput: {
      customerQuery: "John",
      title: "Kitchen fit"
    },
    missingFields: ["totalPence"]
  }));

  assert.equal(result.status, "clarification");
  if (result.status !== "clarification") {
    return;
  }

  assert.equal(result.analysis?.intent, "create_job");
  assert.deepEqual(result.analysis?.missingFields, ["totalPence"]);
  assert.equal(result.analysis?.entities.customerQuery, "John");
});

test("agent-first orchestrator turns tool validation failure into clarification", async () => {
  ensureEnv();
  const { orchestrateWithAgentFirst } = await import("../src/messaging/agent-first/agent-first-orchestrator");

  const result = await orchestrateWithAgentFirst("book the job", undefined, async () => ({
    type: "call_tool",
    toolName: "createJob",
    toolInput: {
      customerQuery: "John",
      title: "Kitchen fit"
    }
  }));

  assert.equal(result.status, "clarification");
  if (result.status !== "clarification") {
    return;
  }

  assert.equal(result.analysis?.intent, "clarification_needed");
  assert.equal(result.question, "I can create that job. What is the total price?");
  assert.ok(!result.question.includes("totalPence"));
  assert.ok(!result.question.includes("query"));
});

test("tool validation for customer lookup does not leak internal field names", async () => {
  ensureEnv();
  const { orchestrateWithAgentFirst } = await import("../src/messaging/agent-first/agent-first-orchestrator");

  const result = await orchestrateWithAgentFirst("open it", undefined, async () => ({
    type: "call_tool",
    toolName: "searchCustomers",
    toolInput: {}
  }));

  assert.equal(result.status, "clarification");
  if (result.status !== "clarification") {
    return;
  }

  assert.equal(result.question, "Which customer should I look up?");
  assert.ok(!result.question.includes("query"));
});

test("customer account tool mapping preserves downstream disambiguation path", async () => {
  const { buildIntentFromAgentFirstToolCall } = await import("../src/messaging/agent-first/agent-first-tools");

  const result = buildIntentFromAgentFirstToolCall("getCustomerAccount", {
    customerQuery: "John"
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.intent, {
    type: "customer_find",
    query: "John"
  });
  assert.equal(result.analysis.intent, "get_customer_account");
});

test("feature flag selector keeps server-first flow as the default", async () => {
  const { selectAgentFlow } = await import("../src/messaging/agent-first/flow-selector");

  assert.equal(selectAgentFlow(false), "server_first");
  assert.equal(selectAgentFlow(true), "agent_first");
});

test("agent-first orchestrator can execute a native planToday tool", async () => {
  ensureEnv();
  const { orchestrateWithAgentFirst } = await import("../src/messaging/agent-first/agent-first-orchestrator");

  const result = await orchestrateWithAgentFirst(
    "plan today for me",
    undefined,
    async () => ({
      type: "call_tool",
      toolName: "planToday",
      toolInput: {}
    }),
    async ({ toolName }) => {
      assert.equal(toolName, "planToday");
      return {
        status: "handled",
        reply: "Today looks like 2 booked jobs and 1 overdue. Start with the overdue one."
      };
    }
  );

  assert.equal(result.status, "response");
  if (result.status !== "response") {
    return;
  }

  assert.equal(result.reply, "Today looks like 2 booked jobs and 1 overdue. Start with the overdue one.");
  assert.equal(result.source, "tool");
});

test("agent-first orchestrator routes plan phrases to planToday without needing llm selection", async () => {
  ensureEnv();
  const { orchestrateWithAgentFirst } = await import("../src/messaging/agent-first/agent-first-orchestrator");

  const result = await orchestrateWithAgentFirst(
    "what should I focus on today",
    undefined,
    async () => ({
      type: "respond",
      message: "wrong path"
    }),
    async ({ toolName }) => {
      assert.equal(toolName, "planToday");
      return {
        status: "handled",
        reply: "Start with the overdue work, then move to today's booked jobs."
      };
    }
  );

  assert.equal(result.status, "response");
  if (result.status !== "response") {
    return;
  }

  assert.equal(result.reply, "Start with the overdue work, then move to today's booked jobs.");
  assert.equal(result.source, "tool");
});
