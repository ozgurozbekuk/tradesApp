import test from "node:test";
import assert from "node:assert/strict";

const ensureEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "https://example.com/db";
  process.env.BASE_URL = process.env.BASE_URL || "https://example.com";
};

test("priority vendor-debt follow-up resolves a bare vendor reply before semantic rerouting", async () => {
  ensureEnv();
  const { tryResolvePriorityPendingVendorDebtFollowUp } = await import("../src/messaging/pending-flow-priority");

  const result = tryResolvePriorityPendingVendorDebtFollowUp("tool market", {
    pendingFlow: {
      intent: "record_vendor_debt",
      entities: {
        amountPence: 30000,
        note: "painting tools"
      },
      missingFields: ["vendorQuery"],
      followUpQuestion: "Which vendor should I use?"
    }
  });

  assert.ok(result);
  assert.equal(result?.status, "intent");
  if (!result || result.status !== "intent") {
    return;
  }

  assert.deepEqual(result.intent, {
    type: "vendor_debt_add",
    vendorQuery: "tool market",
    amountPence: 30000,
    note: "painting tools"
  });
  assert.equal(result.analysis.intent, "record_vendor_debt");
  assert.equal(result.analysis.sessionReferences?.usesPendingFlow, true);
});

test("priority vendor-debt follow-up keeps vendor-labelled replies out of customer creation", async () => {
  ensureEnv();
  const { tryResolvePriorityPendingVendorDebtFollowUp } = await import("../src/messaging/pending-flow-priority");

  const result = tryResolvePriorityPendingVendorDebtFollowUp("add vendor : tool market", {
    pendingFlow: {
      intent: "record_vendor_debt",
      entities: {
        amountPence: 30000,
        note: "painting tools",
        vendorQuery: "tool market"
      },
      missingFields: ["vendorQuery"],
      followUpQuestion: 'I couldn\'t find a vendor matching "tool market". Which vendor should I use?'
    }
  });

  assert.ok(result);
  assert.equal(result?.status, "intent");
  if (!result || result.status !== "intent") {
    return;
  }

  assert.deepEqual(result.intent, {
    type: "vendor_debt_add",
    vendorQuery: "tool market",
    amountPence: 30000,
    note: "painting tools"
  });
  assert.equal(result.analysis.intent, "record_vendor_debt");
});
