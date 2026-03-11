import test from "node:test";
import assert from "node:assert/strict";

test("conversation memory exposes recent turns in parse context", async () => {
  const { conversationMemory } = await import("../src/messaging/agent/context-memory");

  const phone = "+447700900999";
  conversationMemory.appendTurn(phone, {
    role: "user",
    text: "close john job"
  });
  conversationMemory.appendTurn(phone, {
    role: "assistant",
    text: "Which of John's jobs should I mark as completed?"
  });
  conversationMemory.appendTurn(phone, {
    role: "user",
    text: "boiler repair"
  });

  const context = conversationMemory.getAgentParseContext(phone);
  assert.deepEqual(context.recentTurns, [
    { role: "user", text: "close john job" },
    { role: "assistant", text: "Which of John's jobs should I mark as completed?" },
    { role: "user", text: "boiler repair" }
  ]);
});
