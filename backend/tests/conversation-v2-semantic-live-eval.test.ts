import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { interpretConversationV2Semantically } from "../src/conversation-v2/semantic/interpreter";
import { normalizeSemanticFrontDoorResult } from "../src/conversation-v2/semantic/normalizer";

type EvalCase = {
  name: string;
  input: string;
  pending_flow?: {
    workflow: "create_job" | "create_customer" | "record_vendor_debt" | "record_vendor_payment" | "update_job_status";
    step: "slot_filling" | "entity_resolution" | "confirmation" | "ready_to_execute";
    slots: Record<string, unknown>;
    missingSlots: string[];
    prompt: string;
  };
  expected: {
    type: "workflow_intent" | "clarification" | "delegate_to_v1" | "respond" | "unknown";
    workflow?: string;
    mode?: "fresh" | "continue_pending";
    capability?: string;
  };
};

const datasetPath = path.resolve(process.cwd(), "scripts/eval/conversation-v2-semantic-phase1.json");

const getCases = () =>
  JSON.parse(fs.readFileSync(datasetPath, "utf8")) as Array<
    EvalCase & {
      mock_output?: unknown;
    }
  >;

test("semantic live eval dataset covers wording variation and pending-flow cases", () => {
  const cases = getCases();

  assert.ok(cases.length >= 12);
  assert.ok(cases.some((entry) => entry.expected.type === "clarification"));
  assert.ok(cases.some((entry) => entry.expected.workflow === "export_records_pdf"));
  assert.ok(cases.some((entry) => entry.expected.workflow === "export_expense_pdf"));
  assert.ok(cases.some((entry) => entry.expected.mode === "continue_pending"));
});

test("semantic interpreter returns schema-valid normalized output for live eval cases when mocked", async () => {
  const cases = getCases();

  for (const entry of cases) {
    const interpreted = await interpretConversationV2Semantically(
      {
        message: entry.input,
        pendingFlow: entry.pending_flow
      },
      async () => entry.mock_output ?? null
    );

    const normalized = normalizeSemanticFrontDoorResult(interpreted);
    assert.equal(typeof normalized.type, "string", entry.name);
  }
});
