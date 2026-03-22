import assert from "node:assert/strict";
import test from "node:test";
import { buildEntityClarificationReply } from "../src/conversation-v2/response/response-builder";
import { resolveAmbiguousEntitySelection } from "../src/conversation-v2/entity/disambiguation";

test("entity clarification reply numbers ambiguous options", () => {
  const reply = buildEntityClarificationReply({
    workflow: "create_job",
    entityState: {
      status: "ambiguous",
      unresolvedQuery: "john",
      candidates: [
        { id: "customer-1", label: "John", type: "customer" },
        { id: "customer-2", label: "John Doe", type: "customer" }
      ]
    }
  });

  assert.match(reply, /1\) John/);
  assert.match(reply, /2\) John Doe/);
  assert.match(reply, /Reply with a number/);
});

test("ambiguous selection resolves ordinal replies with punctuation", () => {
  const result = resolveAmbiguousEntitySelection(
    {
      status: "ambiguous",
      unresolvedQuery: "john",
      candidates: [
        { id: "customer-1", label: "John", type: "customer" },
        { id: "customer-2", label: "John Doe", type: "customer" }
      ]
    },
    "2)"
  );

  assert.deepEqual(result, {
    status: "resolved",
    resolvedIds: {
      customerId: "customer-2",
      vendorId: undefined,
      jobId: undefined
    }
  });
});

test("ambiguous selection matches customer labels without metadata suffixes", () => {
  const result = resolveAmbiguousEntitySelection(
    {
      status: "ambiguous",
      unresolvedQuery: "john",
      candidates: [
        { id: "customer-1", label: "John - added 2026-03-01", type: "customer" },
        { id: "customer-2", label: "John Doe - added 2026-03-02", type: "customer" }
      ]
    },
    "john doe"
  );

  assert.deepEqual(result, {
    status: "resolved",
    resolvedIds: {
      customerId: "customer-2",
      vendorId: undefined,
      jobId: undefined
    }
  });
});
