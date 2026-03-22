import assert from "node:assert/strict";
import test from "node:test";
import { parseConversationDate } from "../src/conversation-v2/date-parsing";

test("conversation date parsing understands week-based relative dates", () => {
  const now = new Date("2026-03-19T10:00:00.000Z");

  const inTwoWeeks = parseConversationDate("2 weeks", now);
  const nextWeek = parseConversationDate("next week", now);

  assert.equal(inTwoWeeks?.toISOString().slice(0, 10), "2026-04-02");
  assert.equal(nextWeek?.toISOString().slice(0, 10), "2026-03-26");
});

test("conversation date parsing understands end of month and next weekday", () => {
  const now = new Date("2026-03-19T10:00:00.000Z");

  const endOfMonth = parseConversationDate("end of month", now);
  const nextFriday = parseConversationDate("next friday", now);

  assert.equal(endOfMonth?.toISOString().slice(0, 10), "2026-03-31");
  assert.equal(nextFriday?.toISOString().slice(0, 10), "2026-03-20");
});

test("conversation date parsing rejects unsupported numeric slash dates", () => {
  const now = new Date("2026-03-19T10:00:00.000Z");
  const parsed = parseConversationDate("12/03/2026", now);

  assert.equal(parsed, undefined);
});
