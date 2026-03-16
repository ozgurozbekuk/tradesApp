import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryConversationStateStore } from "../src/conversation-v2/state/state-store";

const ensureEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "https://example.com/db";
  process.env.BASE_URL = process.env.BASE_URL || "https://example.com";
};

const buildServices = () =>
  ({
    users: {},
    customers: {},
    jobs: {},
    payments: {},
    reports: {},
    reminders: {
      buildTodayPlan: async () => ({
        scheduledToday: 1,
        dueSoonCount: 0,
        overdueCount: 0,
        todayJobs: [
          {
            customerName: "John",
            title: "Home cleaning",
            scheduledFor: "09:00"
          }
        ]
      })
    },
    vendorPayments: {}
  }) as unknown as import("../src/conversation-v2/adapters/services").ConversationV2Services;

test("runtime uses semantic front door for fresh V2 workflow intents when enabled", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");

  const result = await runConversationV2Turn(
    {
      userId: "user-1",
      from: "+447000000001",
      body: "what's on today boss?",
      messageSid: "MSG-SEM-1"
    },
    {
      stateStore: createInMemoryConversationStateStore(),
      services: buildServices(),
      semanticLlmCaller: async () => ({
        kind: "workflow_intent",
        workflow: "list_today_jobs",
        mode: "fresh",
        confidence: "high",
        fields: {
          scope: "today"
        }
      })
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "list_today_jobs");
  assert.match(result.reply, /Today:/);
  assert.match(result.reply, /Home cleaning/);
});

test("runtime falls back to regex-first intent resolution when semantic output is unusable", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");

  const result = await runConversationV2Turn(
    {
      userId: "user-2",
      from: "+447000000002",
      body: "show today jobs",
      messageSid: "MSG-SEM-2"
    },
    {
      stateStore: createInMemoryConversationStateStore(),
      services: buildServices(),
      semanticLlmCaller: async () => ({
        kind: "unknown",
        reason: "No safe classification."
      })
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "list_today_jobs");
  assert.match(result.reply, /Today:/);
});

test("runtime merges multiple missing pending-flow slots from semantic continuation", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");
  const stateStore = createInMemoryConversationStateStore();

  await stateStore.save({
    userId: "user-3",
    channel: "whatsapp",
    lastMessageAt: new Date().toISOString(),
    recentRefs: {},
    version: "v2",
    pendingFlow: {
      id: "create_job:MSG-old",
      workflow: "create_job",
      step: "slot_filling",
      slots: {},
      missingSlots: ["customer_query", "title", "total_pence"],
      entityState: { status: "idle" },
      prompt: "Which customer is this for?",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      topicShiftPolicy: "allow_strong_shift",
      sourceMessageId: "MSG-old"
    }
  });

  const result = await runConversationV2Turn(
    {
      userId: "user-3",
      from: "+447000000003",
      body: "title: boiler repair, price: 450",
      messageSid: "MSG-SEM-3"
    },
    {
      stateStore,
      services: buildServices(),
      semanticLlmCaller: async () => ({
        kind: "workflow_intent",
        workflow: "create_job",
        mode: "continue_pending",
        confidence: "high",
        fields: {
          title: "boiler repair",
          total_pence: 45000
        }
      })
    }
  );

  assert.equal(result.status, "pending");
  assert.equal(result.workflow, "create_job");
  assert.equal(result.state.pendingFlow?.slots.title, "boiler repair");
  assert.equal(result.state.pendingFlow?.slots.total_pence, 45000);
  assert.deepEqual(result.state.pendingFlow?.missingSlots, ["customer_query"]);
  assert.equal(result.reply, "Which customer is this for?");
});

test("runtime keeps pending flow and returns semantic clarification when continuation is still ambiguous", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");
  const stateStore = createInMemoryConversationStateStore();

  await stateStore.save({
    userId: "user-4",
    channel: "whatsapp",
    lastMessageAt: new Date().toISOString(),
    recentRefs: {},
    version: "v2",
    pendingFlow: {
      id: "create_job:MSG-old-2",
      workflow: "create_job",
      step: "slot_filling",
      slots: {},
      missingSlots: ["customer_query", "title", "total_pence"],
      entityState: { status: "idle" },
      prompt: "Which customer is this for?",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      topicShiftPolicy: "allow_strong_shift",
      sourceMessageId: "MSG-old-2"
    }
  });

  const result = await runConversationV2Turn(
    {
      userId: "user-4",
      from: "+447000000004",
      body: "same as before",
      messageSid: "MSG-SEM-4"
    },
    {
      stateStore,
      services: buildServices(),
      semanticLlmCaller: async () => ({
        kind: "clarification",
        question: "I still need the customer name and the total price.",
        workflow: "create_job",
        missing_fields: ["customer_query", "total_pence"]
      })
    }
  );

  assert.equal(result.status, "pending");
  assert.equal(result.workflow, "create_job");
  assert.equal(result.reply, "I still need the customer name and the total price.");
  assert.equal(result.state.pendingFlow?.prompt, "I still need the customer name and the total price.");
});
