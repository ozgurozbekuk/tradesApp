import test from "node:test";
import assert from "node:assert/strict";

test("dialog manager resolves a short answer against pending flow", async () => {
  const { manageDialogTurn } = await import("../src/messaging/dialog-manager");

  const result = await manageDialogTurn(
    {
      message: "boiler repair",
      context: {
        pendingFlow: {
          intent: "update_job_status",
          entities: {
            customerQuery: "John",
            status: "completed"
          },
          missingFields: ["jobId"],
          followUpQuestion: "Which of John's jobs should I mark as completed?"
        },
        recentTurns: [
          { role: "user", text: "close john job" },
          { role: "assistant", text: "Which of John's jobs should I mark as completed?" }
        ]
      }
    },
    async () => ({
      kind: "pending_resolution",
      capability: "update_job_status",
      entities: {
        customerQuery: "John",
        status: "completed",
        jobQuery: "boiler repair"
      },
      missingFields: [],
      clearPendingFlow: true
    })
  );

  assert.deepEqual(result, {
    status: "pending_resolution",
    capability: "update_job_status",
    entities: {
      customerQuery: "John",
      status: "completed",
      jobQuery: "boiler repair"
    },
    missingFields: [],
    question: undefined,
    clearPendingFlow: true
  });
});

test("dialog manager can declare a new request and clear stale pending flow", async () => {
  const { manageDialogTurn } = await import("../src/messaging/dialog-manager");

  const result = await manageDialogTurn(
    {
      message: "show ahmad records",
      context: {
        pendingFlow: {
          intent: "update_job_status",
          entities: {
            customerQuery: "John",
            status: "completed"
          },
          missingFields: ["jobId"]
        }
      }
    },
    async () => ({
      kind: "continue",
      rewrittenMessage: "show ahmad records",
      clearPendingFlow: true
    })
  );

  assert.deepEqual(result, {
    status: "continue",
    message: "show ahmad records",
    clearPendingFlow: true
  });
});

test("dialog manager deterministically clears booking flow on explicit correction to records", async () => {
  const { manageDialogTurn } = await import("../src/messaging/dialog-manager");

  const result = await manageDialogTurn({
    message: "not booking, bring all name of johns records",
    context: {
      pendingFlow: {
        intent: "create_booking",
        entities: { customerQuery: "John" },
        missingFields: ["startsAt"],
        followUpQuestion: "What date and time should I book them in for?"
      }
    }
  });

  assert.deepEqual(result, {
    status: "continue",
    message: "bring all name of johns records",
    clearPendingFlow: true
  });
});
