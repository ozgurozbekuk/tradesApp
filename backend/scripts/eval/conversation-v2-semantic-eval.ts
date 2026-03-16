import fs from "fs";
import path from "path";
import { interpretConversationV2Semantically } from "../../src/conversation-v2/semantic/interpreter";
import { normalizeSemanticFrontDoorResult } from "../../src/conversation-v2/semantic/normalizer";

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
  mock_output: unknown;
  expected: {
    type: "workflow_intent" | "clarification" | "delegate_to_v1" | "respond" | "unknown";
    workflow?: string;
    mode?: "fresh" | "continue_pending";
    capability?: string;
    question?: string;
    message?: string;
    missingFields?: string[];
    fields?: Record<string, unknown>;
  };
};

const matchesSubset = (expected: Record<string, unknown>, actual: Record<string, unknown>) =>
  Object.entries(expected).every(([key, value]) => actual[key] === value);

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") {
    process.exit(0);
  }

  throw error;
});

const run = async () => {
  const file = path.resolve(process.cwd(), "scripts/eval/conversation-v2-semantic-phase1.json");
  const cases = JSON.parse(fs.readFileSync(file, "utf8")) as EvalCase[];

  let passed = 0;

  console.log("idx\tname\texpected\tactual\tresult");

  for (const [index, testCase] of cases.entries()) {
    const interpreted = await interpretConversationV2Semantically(
      {
        message: testCase.input,
        pendingFlow: testCase.pending_flow
      },
      async () => testCase.mock_output
    );

    const normalized = normalizeSemanticFrontDoorResult(interpreted);

    const typeMatches = normalized.type === testCase.expected.type;
    const workflowMatches =
      testCase.expected.workflow === undefined ||
      ("intent" in normalized
        ? normalized.intent.workflow === testCase.expected.workflow
        : "workflow" in normalized
          ? normalized.workflow === testCase.expected.workflow
          : false);
    const modeMatches =
      testCase.expected.mode === undefined ||
      ("mode" in normalized && normalized.mode === testCase.expected.mode);
    const capabilityMatches =
      testCase.expected.capability === undefined ||
      ("capability" in normalized && normalized.capability === testCase.expected.capability);
    const questionMatches =
      testCase.expected.question === undefined ||
      ("question" in normalized && normalized.question === testCase.expected.question);
    const messageMatches =
      testCase.expected.message === undefined ||
      ("message" in normalized && normalized.message === testCase.expected.message);
    const missingFieldsMatches =
      testCase.expected.missingFields === undefined ||
      ("missingFields" in normalized &&
        JSON.stringify(normalized.missingFields) === JSON.stringify(testCase.expected.missingFields));
    const fieldMatches =
      testCase.expected.fields === undefined ||
      ("intent" in normalized && matchesSubset(testCase.expected.fields, normalized.intent.fields as Record<string, unknown>));

    const ok =
      typeMatches &&
      workflowMatches &&
      modeMatches &&
      capabilityMatches &&
      questionMatches &&
      messageMatches &&
      missingFieldsMatches &&
      fieldMatches;

    if (ok) {
      passed += 1;
    }

    const actualSummary =
      normalized.type === "workflow_intent"
        ? `${normalized.type}:${normalized.intent.workflow}:${normalized.mode}`
        : normalized.type === "delegate_to_v1"
          ? `${normalized.type}:${normalized.capability}`
          : normalized.type;

    console.log(
      `${index + 1}\t${testCase.name}\t${testCase.expected.type}\t${actualSummary}\t${ok ? "PASS" : "FAIL"}`
    );
  }

  const total = cases.length;
  const accuracy = ((passed / total) * 100).toFixed(1);
  console.log(`\nSummary: ${passed}/${total} passed (${accuracy}%)`);

  if (passed !== total) {
    process.exitCode = 1;
  }
};

void run();
