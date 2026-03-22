import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryConversationStateStore } from "../src/conversation-v2/state/state-store";

const ensureEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "https://example.com/db";
  process.env.BASE_URL = process.env.BASE_URL || "https://example.com";
};

test("conversation v2 router falls back to v1 when the v2 flag is disabled", async () => {
  ensureEnv();
  process.env.USE_CONVERSATION_V2 = "false";
  process.env.CONVERSATION_V2_TEST_PHONES = "";

  const { routeIncomingMessageWithConversationV2 } = await import("../src/conversation-v2/router");

  const result = await routeIncomingMessageWithConversationV2(
    {
      from: "+447000000001",
      body: "create customer John",
      messageSid: "MSG-1"
    },
    {
      usersService: {
        findByPhone: async () => ({ id: "user-1", phone: "+447000000001" })
      },
      routeV1: async () => ({ reply: "v1 reply" }),
      routeV2: async () => {
        throw new Error("v2 should not run when disabled");
      }
    }
  );

  assert.equal(result.source, "v1");
  assert.equal(result.reply, "v1 reply");
});

test("conversation v2 router routes eligible users into v2", async () => {
  ensureEnv();
  process.env.USE_CONVERSATION_V2 = "true";
  process.env.CONVERSATION_V2_TEST_PHONES = "+447000000002";

  const { routeIncomingMessageWithConversationV2 } = await import("../src/conversation-v2/router");

  const result = await routeIncomingMessageWithConversationV2(
    {
      from: "+447000000002",
      body: "show today jobs",
      messageSid: "MSG-2"
    },
    {
      usersService: {
        findByPhone: async () => ({ id: "user-2", phone: "+447000000002" })
      },
      routeV1: async () => ({ reply: "v1 reply" }),
      routeV2: async () => ({
        reply: "v2 reply",
        state: {
          userId: "user-2",
          channel: "whatsapp",
          lastMessageAt: new Date().toISOString(),
          recentRefs: {},
          version: "v2"
        },
        workflow: "list_today_jobs",
        status: "completed"
      })
    }
  );

  assert.equal(result.source, "v2");
  assert.equal(result.reply, "v2 reply");
  assert.equal(result.v2Status, "completed");
});

test("conversation v2 router falls back to v1 for fresh unsupported turns", async () => {
  ensureEnv();
  process.env.USE_CONVERSATION_V2 = "true";
  process.env.CONVERSATION_V2_TEST_PHONES = "";

  const { routeIncomingMessageWithConversationV2 } = await import("../src/conversation-v2/router");
  const stateStore = createInMemoryConversationStateStore();

  const result = await routeIncomingMessageWithConversationV2(
    {
      from: "+447000000003",
      body: "send me all records as pdf",
      messageSid: "MSG-3"
    },
    {
      stateStore,
      usersService: {
        findByPhone: async () => ({ id: "user-3", phone: "+447000000003" })
      },
      routeV1: async () => ({ reply: "v1 fallback reply" }),
      routeV2: async () => ({
        reply: "unsupported",
        state: {
          userId: "user-3",
          channel: "whatsapp",
          lastMessageAt: new Date().toISOString(),
          recentRefs: {},
          version: "v2"
        },
        status: "unsupported",
        fallbackToV1: true,
        delegatedCapability: "unknown_v1_capability"
      })
    }
  );

  assert.equal(result.source, "v1");
  assert.equal(result.reply, "v1 fallback reply");
});

test("conversation v2 router keeps unsupported turns on v2 when no explicit v1 delegation was requested", async () => {
  ensureEnv();
  process.env.USE_CONVERSATION_V2 = "true";
  process.env.CONVERSATION_V2_TEST_PHONES = "";

  const { routeIncomingMessageWithConversationV2 } = await import("../src/conversation-v2/router");
  const stateStore = createInMemoryConversationStateStore();

  const result = await routeIncomingMessageWithConversationV2(
    {
      from: "+447000000030",
      body: "some unsupported phrasing",
      messageSid: "MSG-30"
    },
    {
      stateStore,
      usersService: {
        findByPhone: async () => ({ id: "user-30", phone: "+447000000030" })
      },
      routeV1: async () => ({ reply: "v1 fallback reply" }),
      routeV2: async () => ({
        reply: "unsupported",
        state: {
          userId: "user-30",
          channel: "whatsapp",
          lastMessageAt: new Date().toISOString(),
          recentRefs: {},
          version: "v2"
        },
        status: "unsupported"
      })
    }
  );

  assert.equal(result.source, "v2");
  assert.equal(result.reply, "unsupported");
  assert.equal(result.v2Status, "unsupported");
});

test("conversation v2 router keeps pending users on v2 even when the current turn is unsupported", async () => {
  ensureEnv();
  process.env.USE_CONVERSATION_V2 = "true";
  process.env.CONVERSATION_V2_TEST_PHONES = "";

  const { routeIncomingMessageWithConversationV2 } = await import("../src/conversation-v2/router");
  const stateStore = createInMemoryConversationStateStore();

  await stateStore.save({
    userId: "user-4",
    channel: "whatsapp",
    lastMessageAt: new Date().toISOString(),
    recentRefs: {},
    version: "v2",
    pendingFlow: {
      id: "create_customer:MSG-old",
      workflow: "create_customer",
      step: "slot_filling",
      slots: {},
      missingSlots: ["customer_name"],
      entityState: { status: "idle" },
      prompt: "What is the customer name?",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      topicShiftPolicy: "allow_strong_shift",
      sourceMessageId: "MSG-old"
    }
  });

  const result = await routeIncomingMessageWithConversationV2(
    {
      from: "+447000000004",
      body: "cancel",
      messageSid: "MSG-4"
    },
    {
      stateStore,
      usersService: {
        findByPhone: async () => ({ id: "user-4", phone: "+447000000004" })
      },
      routeV1: async () => ({ reply: "v1 fallback reply" }),
      routeV2: async () => ({
        reply: "Okay, I cancelled that.",
        state: {
          userId: "user-4",
          channel: "whatsapp",
          lastMessageAt: new Date().toISOString(),
          recentRefs: {},
          version: "v2"
        },
        workflow: "create_customer",
        status: "unsupported"
      })
    }
  );

  assert.equal(result.source, "v2");
  assert.equal(result.reply, "Okay, I cancelled that.");
  assert.equal(result.v2Status, "unsupported");
});
