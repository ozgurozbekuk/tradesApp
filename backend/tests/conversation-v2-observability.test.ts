import assert from "node:assert/strict";
import test from "node:test";

test("conversation v2 observability emits JSON when agent observability is enabled", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "https://example.com/db";
  process.env.BASE_URL = process.env.BASE_URL || "https://example.com";
  process.env.AGENT_OBSERVABILITY_ENABLED = "true";

  const originalInfo = console.info;
  const messages: string[] = [];
  console.info = (message?: unknown) => {
    messages.push(String(message));
  };

  try {
    const { emitConversationV2Event } = await import("../src/conversation-v2/observability");
    emitConversationV2Event("conversation_v2.semantic.result", {
      userId: "user-1",
      type: "workflow_intent",
      workflow: "create_job"
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(messages.length, 1);
  const payload = JSON.parse(messages[0]) as {
    event: string;
    data: Record<string, unknown>;
  };

  assert.equal(payload.event, "conversation_v2.semantic.result");
  assert.equal(payload.data.userId, "user-1");
  assert.equal(payload.data.workflow, "create_job");
});
