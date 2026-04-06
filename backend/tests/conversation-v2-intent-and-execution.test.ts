import assert from "node:assert/strict";
import test from "node:test";

const ensureEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "https://example.com/db";
  process.env.BASE_URL = process.env.BASE_URL || "https://example.com";
};

test("intent resolver parses combined new customer and job command", async () => {
  ensureEnv();
  const intentResolverModule = await import("../src/conversation-v2/intent/intent-resolver");
  const resolveIntentV2 =
    "resolveIntentV2" in intentResolverModule
      ? intentResolverModule.resolveIntentV2
      : intentResolverModule.default.resolveIntentV2;

  const result = await resolveIntentV2({
    text: "add new customer : jane doe doe , job : garden cleaning , price : 500 , deposit : 200 , due date : 7 days"
  });

  assert.equal(result.type, "intent");
  if (result.type !== "intent") {
    return;
  }

  assert.equal(result.intent.workflow, "create_job");
  assert.equal(result.intent.fields.customer_query, "jane doe doe");
  assert.equal(result.intent.fields.title, "garden cleaning");
  assert.equal(result.intent.fields.total_pence, 50000);
  assert.equal(result.intent.fields.deposit_pence, 20000);
  assert.equal(result.intent.fields.due_date, "7 days");
  assert.equal(result.intent.fields.create_customer_if_missing, true);
});

test("intent resolver parses combined new customer and job command with phone number label", async () => {
  ensureEnv();
  const intentResolverModule = await import("../src/conversation-v2/intent/intent-resolver");
  const resolveIntentV2 =
    "resolveIntentV2" in intentResolverModule
      ? intentResolverModule.resolveIntentV2
      : intentResolverModule.default.resolveIntentV2;

  const result = await resolveIntentV2({
    text: "new customer : John Doe , Job : Painting 4 rooms, price : 500 , deposit:200 , phone num : +447776665656 , due date : 6 days"
  });

  assert.equal(result.type, "intent");
  if (result.type !== "intent") {
    return;
  }

  assert.equal(result.intent.workflow, "create_job");
  assert.equal(result.intent.fields.customer_query, "John Doe");
  assert.equal(result.intent.fields.customer_phone, "447776665656");
  assert.equal(result.intent.fields.title, "Painting 4 rooms");
  assert.equal(result.intent.fields.total_pence, 50000);
  assert.equal(result.intent.fields.deposit_pence, 20000);
  assert.equal(result.intent.fields.due_date, "6 days");
  assert.equal(result.intent.fields.create_customer_if_missing, true);
});

test("intent resolver parses structured expense command with plural wording", async () => {
  ensureEnv();
  const intentResolverModule = await import("../src/conversation-v2/intent/intent-resolver");
  const resolveIntentV2 =
    "resolveIntentV2" in intentResolverModule
      ? intentResolverModule.resolveIntentV2
      : intentResolverModule.default.resolveIntentV2;

  const result = await resolveIntentV2({
    text: "add expenses : 400 , cleaning staff"
  });

  assert.equal(result.type, "intent");
  if (result.type !== "intent") {
    return;
  }

  assert.equal(result.intent.workflow, "record_expense");
  assert.equal(result.intent.fields.amount_pence, 40000);
  assert.equal(result.intent.fields.note, "cleaning staff");
  assert.equal(result.intent.fields.category, "cleaning staff");
});

test("intent resolver parses plural expense command without colon", async () => {
  ensureEnv();
  const intentResolverModule = await import("../src/conversation-v2/intent/intent-resolver");
  const resolveIntentV2 =
    "resolveIntentV2" in intentResolverModule
      ? intentResolverModule.resolveIntentV2
      : intentResolverModule.default.resolveIntentV2;

  const result = await resolveIntentV2({
    text: "add expenses 300 for painting staff"
  });

  assert.equal(result.type, "intent");
  if (result.type !== "intent") {
    return;
  }

  assert.equal(result.intent.workflow, "record_expense");
  assert.equal(result.intent.fields.amount_pence, 30000);
  assert.equal(result.intent.fields.note, "painting staff");
  assert.equal(result.intent.fields.category, "painting staff");
});

test("intent resolver parses structured expense vendor field", async () => {
  ensureEnv();
  const intentResolverModule = await import("../src/conversation-v2/intent/intent-resolver");
  const resolveIntentV2 =
    "resolveIntentV2" in intentResolverModule
      ? intentResolverModule.resolveIntentV2
      : intentResolverModule.default.resolveIntentV2;

  const result = await resolveIntentV2({
    text: "add expenses : 300 , vendor : Ikea"
  });

  assert.equal(result.type, "intent");
  if (result.type !== "intent") {
    return;
  }

  assert.equal(result.intent.workflow, "record_expense");
  assert.equal(result.intent.fields.amount_pence, 30000);
  assert.equal(result.intent.fields.vendor_query, "Ikea");
  assert.equal(result.intent.fields.note, undefined);
});

test("intent resolver treats customer job lookup phrasing as customer records", async () => {
  ensureEnv();
  const intentResolverModule = await import("../src/conversation-v2/intent/intent-resolver");
  const resolveIntentV2 =
    "resolveIntentV2" in intentResolverModule
      ? intentResolverModule.resolveIntentV2
      : intentResolverModule.default.resolveIntentV2;

  const result = await resolveIntentV2({
    text: "bring lenin job"
  });

  assert.equal(result.type, "intent");
  if (result.type !== "intent") {
    return;
  }

  assert.equal(result.intent.workflow, "customer_records");
  assert.equal(result.intent.fields.customer_query, "lenin");
});

test("intent resolver parses plan today as the today jobs workflow", async () => {
  ensureEnv();
  const intentResolverModule = await import("../src/conversation-v2/intent/intent-resolver");
  const resolveIntentV2 =
    "resolveIntentV2" in intentResolverModule
      ? intentResolverModule.resolveIntentV2
      : intentResolverModule.default.resolveIntentV2;

  const result = await resolveIntentV2({
    text: "plan today"
  });

  assert.equal(result.type, "intent");
  if (result.type !== "intent") {
    return;
  }

  assert.equal(result.intent.workflow, "list_today_jobs");
  assert.equal(result.intent.fields.scope, "today");
});

test("intent resolver parses bulk job completion phrasing", async () => {
  ensureEnv();
  const intentResolverModule = await import("../src/conversation-v2/intent/intent-resolver");
  const resolveIntentV2 =
    "resolveIntentV2" in intentResolverModule
      ? intentResolverModule.resolveIntentV2
      : intentResolverModule.default.resolveIntentV2;

  const commands = ["mark to the completed all jobs", "complete all jobs"];
  for (const text of commands) {
    const result = await resolveIntentV2({ text });

    assert.equal(result.type, "intent");
    if (result.type !== "intent") {
      continue;
    }

    assert.equal(result.intent.workflow, "update_job_status");
    assert.equal(result.intent.fields.apply_to_all, true);
    assert.equal(result.intent.fields.status, "completed");
    assert.equal(result.intent.fields.job_query, undefined);
  }
});

test("create_job execution creates missing customer when explicitly requested", async () => {
  ensureEnv();
  const actionExecutorModule = await import("../src/conversation-v2/execution/action-executor");
  const executeWorkflowAction =
    "executeWorkflowAction" in actionExecutorModule
      ? actionExecutorModule.executeWorkflowAction
      : actionExecutorModule.default.executeWorkflowAction;
  let capturedDueDate: Date | undefined;
  let capturedCustomerPhone: string | undefined;
  const startedAt = new Date();

  const result = await executeWorkflowAction({
    userId: "user-1",
    workflow: "create_job",
    slots: {
      customer_query: "jane doe doe",
      customer_phone: "447700900123",
      title: "garden cleaning",
      total_pence: 50000,
      deposit_pence: 20000,
      due_date: "7 days",
      create_customer_if_missing: true
    },
    entityState: {
      status: "not_found",
      unresolvedQuery: "jane doe doe"
    },
    services: {
      users: {},
      customers: {
        upsertByPhoneOrName: async ({ phone }: { phone?: string }) => {
          capturedCustomerPhone = phone;
          return ({
          id: "customer-new-1",
          name: "jane doe doe"
        });
        }
      },
      jobs: {
        createJobForCustomerId: async ({ customerId, dueDate }: { customerId: string; dueDate?: Date }) => {
          capturedDueDate = dueDate;
          return {
            customer: {
              id: customerId,
              name: "jane doe doe"
            },
            job: {
              id: "job-1",
              title: "garden cleaning"
            }
          };
        }
      },
      payments: {},
      reports: {},
      reminders: {},
      vendorPayments: {},
      exports: {}
    } as unknown as import("../src/conversation-v2/adapters/services").ConversationV2Services
  });

  assert.equal(result.completed, true);
  assert.equal(result.reply, "Created job garden cleaning for jane doe doe.");
  assert.equal(result.recentRefs?.customerId, "customer-new-1");
  assert.equal(capturedCustomerPhone, "447700900123");
  const dueDateDeltaDays = capturedDueDate
    ? Math.round((capturedDueDate.getTime() - startedAt.getTime()) / (24 * 60 * 60 * 1000))
    : undefined;
  assert.equal(dueDateDeltaDays, 7);
});

test("customer records execution includes recent jobs in the reply", async () => {
  ensureEnv();
  const actionExecutorModule = await import("../src/conversation-v2/execution/action-executor");
  const executeWorkflowAction =
    "executeWorkflowAction" in actionExecutorModule
      ? actionExecutorModule.executeWorkflowAction
      : actionExecutorModule.default.executeWorkflowAction;

  const result = await executeWorkflowAction({
    userId: "user-1",
    workflow: "customer_records",
    slots: {
      customer_query: "lenin"
    },
    entityState: {
      status: "resolved",
      resolvedIds: {
        customerId: "customer-1"
      }
    },
    services: {
      users: {},
      customers: {
        findRecordByCustomerId: async () => ({
          id: "customer-1",
          name: "Lenin",
          phone: "07000123456",
          activeJobs: 1,
          outstandingPence: 30000,
          lastPaymentPence: 15000,
          lastPaymentAt: new Date("2026-03-20T10:00:00.000Z"),
          recentJobs: [
            {
              title: "Garden cleaning",
              status: "active",
              dueDate: new Date("2026-03-30T00:00:00.000Z")
            }
          ]
        })
      },
      jobs: {},
      payments: {},
      reports: {},
      reminders: {},
      vendorPayments: {},
      exports: {}
    } as unknown as import("../src/conversation-v2/adapters/services").ConversationV2Services
  });

  assert.equal(result.completed, true);
  assert.match(result.reply, /Customer record for Lenin/);
  assert.match(result.reply, /Recent jobs: Garden cleaning \(active, due 2026-03-30\)\./);
});

test("update job status execution can complete all jobs", async () => {
  ensureEnv();
  const actionExecutorModule = await import("../src/conversation-v2/execution/action-executor");
  const executeWorkflowAction =
    "executeWorkflowAction" in actionExecutorModule
      ? actionExecutorModule.executeWorkflowAction
      : actionExecutorModule.default.executeWorkflowAction;
  let capturedStatus: string | undefined;

  const result = await executeWorkflowAction({
    userId: "user-1",
    workflow: "update_job_status",
    slots: {
      apply_to_all: true,
      status: "completed"
    },
    entityState: {
      status: "idle"
    },
    services: {
      users: {},
      customers: {},
      jobs: {
        updateAllJobStatuses: async ({ status }: { status: string }) => {
          capturedStatus = status;
          return 4;
        }
      },
      payments: {},
      reports: {},
      reminders: {},
      vendorPayments: {},
      exports: {}
    } as unknown as import("../src/conversation-v2/adapters/services").ConversationV2Services
  });

  assert.equal(result.completed, true);
  assert.equal(result.reply, "Updated 4 jobs to completed.");
  assert.equal(capturedStatus, "completed");
});
