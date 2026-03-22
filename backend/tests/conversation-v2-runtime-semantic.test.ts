import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryConversationStateStore } from "../src/conversation-v2/state/state-store";

const ensureEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "https://example.com/db";
  process.env.BASE_URL = process.env.BASE_URL || "https://example.com";
};

const buildServices = () =>
  ({
    users: {},
    customers: {},
    jobs: {},
    payments: {},
    reports: {},
    reminders: {
      buildTodayPlan: async () => ({
        scheduledToday: 1,
        dueSoonCount: 0,
        overdueCount: 0,
        todayJobs: [
          {
            customerName: "John",
            title: "Home cleaning",
            scheduledFor: "09:00"
          }
        ]
      })
    },
    vendorPayments: {}
  }) as unknown as import("../src/conversation-v2/adapters/services").ConversationV2Services;

const buildExecutionServices = () =>
  ({
    users: {},
    customers: {},
    jobs: {
      createJobForCustomerId: async () => ({
        customer: {
          id: "customer-1",
          name: "John Doe"
        },
        job: {
          id: "job-1",
          title: "New Job"
        }
      })
    },
    payments: {},
    reports: {},
    reminders: {
      buildTodayPlan: async () => ({
        scheduledToday: 0,
        dueSoonCount: 0,
        overdueCount: 0,
        todayJobs: []
      })
    },
    vendorPayments: {}
  }) as unknown as import("../src/conversation-v2/adapters/services").ConversationV2Services;

const buildCustomerRecordsServices = () =>
  ({
    users: {},
    customers: {
      findRecordByCustomerId: async () => ({
        id: "customer-1",
        name: "John Doe",
        phone: "07000123456",
        activeJobs: 2,
        outstandingPence: 25000,
        lastPaymentPence: 12000,
        lastPaymentAt: new Date("2026-03-01T10:00:00.000Z")
      })
    },
    jobs: {},
    payments: {},
    reports: {},
    reminders: {
      buildTodayPlan: async () => ({
        scheduledToday: 0,
        dueSoonCount: 0,
        overdueCount: 0,
        todayJobs: []
      })
    },
    vendorPayments: {}
  }) as unknown as import("../src/conversation-v2/adapters/services").ConversationV2Services;

const buildCustomerPaymentServices = () =>
  ({
    users: {},
    customers: {
      findCustomerById: async () => ({
        id: "customer-1",
        name: "John Doe",
        phone: "07000123456"
      })
    },
    jobs: {},
    payments: {
      addPayment: async () => ({
        payment: {
          amountPence: 25000
        },
        outstandingPence: 5000
      })
    },
    reports: {},
    reminders: {
      buildTodayPlan: async () => ({
        scheduledToday: 0,
        dueSoonCount: 0,
        overdueCount: 0,
        todayJobs: []
      })
    },
    vendorPayments: {}
  }) as unknown as import("../src/conversation-v2/adapters/services").ConversationV2Services;

const buildExpenseAndVendorServices = () =>
  ({
    users: {},
    customers: {},
    jobs: {},
    payments: {},
    reminders: {
      buildTodayPlan: async () => ({
        scheduledToday: 0,
        dueSoonCount: 0,
        overdueCount: 0,
        todayJobs: []
      })
    },
    vendorPayments: {
      listMoneyTransactions: async () => [
        {
          kind: "expense_paid",
          amountPence: 1200,
          occurredAt: new Date("2026-03-18T10:00:00.000Z"),
          note: "diesel",
          counterpartyName: "Shell",
          vendor: null
        },
        {
          kind: "expense_paid",
          amountPence: 800,
          occurredAt: new Date("2026-03-17T10:00:00.000Z"),
          note: "parking",
          counterpartyName: null,
          vendor: null
        }
      ],
      getSummary: async ({ days }: { days?: number }) => ({
        days: days ?? 30,
        vendorOutstandingPence: 55000,
        expensePaidPence: 12000,
        vendorDebtAddedPence: 9000,
        vendorPaymentPence: 4000
      })
    },
    reports: {}
  }) as unknown as import("../src/conversation-v2/adapters/services").ConversationV2Services;

const buildExportServices = () =>
  ({
    users: {},
    customers: {},
    jobs: {},
    payments: {},
    reports: {},
    reminders: {
      buildTodayPlan: async () => ({
        scheduledToday: 0,
        dueSoonCount: 0,
        overdueCount: 0,
        todayJobs: []
      })
    },
    vendorPayments: {},
    exports: {
      createPdfAccessToken: () => "token-records",
      createVendorPdfAccessToken: () => "token-vendors",
      createExpensePdfAccessToken: () => "token-expenses",
      createInvoicePdfAccessToken: () => "token-invoice",
      createPdfDownloadLink: (token: string) => `https://example.com/export/pdf/${token}`
    }
  }) as unknown as import("../src/conversation-v2/adapters/services").ConversationV2Services;

test("runtime uses semantic front door for fresh V2 workflow intents when enabled", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");

  const result = await runConversationV2Turn(
    {
      userId: "user-1",
      from: "+447000000001",
      body: "what's on today boss?",
      messageSid: "MSG-SEM-1"
    },
    {
      stateStore: createInMemoryConversationStateStore(),
      services: buildServices(),
      semanticLlmCaller: async () => ({
        kind: "workflow_intent",
        workflow: "list_today_jobs",
        mode: "fresh",
        confidence: "high",
        fields: {
          scope: "today"
        }
      })
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "list_today_jobs");
  assert.match(result.reply, /Today:/);
  assert.match(result.reply, /Home cleaning/);
});

test("runtime falls back to regex-first intent resolution when semantic output is unusable", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");

  const result = await runConversationV2Turn(
    {
      userId: "user-2",
      from: "+447000000002",
      body: "show today jobs",
      messageSid: "MSG-SEM-2"
    },
    {
      stateStore: createInMemoryConversationStateStore(),
      services: buildServices(),
      semanticLlmCaller: async () => ({
        kind: "unknown",
        reason: "No safe classification."
      })
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "list_today_jobs");
  assert.match(result.reply, /Today:/);
});

test("runtime requests explicit v1 fallback only for semantic delegated capabilities", async () => {
  ensureEnv();
  delete process.env.USE_V2_SEMANTIC_FRONT_DOOR;
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");

  const result = await runConversationV2Turn(
    {
      userId: "user-sem-delegate-1",
      from: "+447000000017",
      body: "book john for tomorrow at 9",
      messageSid: "MSG-SEM-DELEGATE-1"
    },
    {
      stateStore: createInMemoryConversationStateStore(),
      services: buildServices(),
      semanticLlmCaller: async () => ({
        kind: "delegate_to_v1",
        capability: "booking_create"
      })
    }
  );

  assert.equal(result.status, "unsupported");
  assert.equal(result.fallbackToV1, true);
  assert.equal(result.delegatedCapability, "booking_create");
});

test("runtime completes customer records after numbered ambiguity selection", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");
  const stateStore = createInMemoryConversationStateStore();

  await stateStore.save({
    userId: "user-customer-records-1",
    channel: "whatsapp",
    lastMessageAt: new Date().toISOString(),
    recentRefs: {},
    version: "v2",
    pendingFlow: {
      id: "customer_records:MSG-old",
      workflow: "customer_records",
      step: "entity_resolution",
      slots: {
        customer_query: "john"
      },
      missingSlots: [],
      entityState: {
        status: "ambiguous",
        unresolvedQuery: "john",
        candidates: [
          { id: "customer-1", label: "John (07000123456)", type: "customer" },
          { id: "customer-2", label: "John Doe - added 2026-03-02", type: "customer" }
        ]
      },
      prompt: "I found more than one match for customer records lookup. Please choose one: 1) John (07000123456), 2) John Doe - added 2026-03-02. Reply with a number.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      topicShiftPolicy: "allow_strong_shift",
      sourceMessageId: "MSG-old"
    }
  });

  const result = await runConversationV2Turn(
    {
      userId: "user-customer-records-1",
      from: "+447000000010",
      body: "1",
      messageSid: "MSG-CUSTOMER-RECORDS-1"
    },
    {
      stateStore,
      services: buildCustomerRecordsServices()
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "customer_records");
  assert.match(result.reply, /Customer record for John Doe/);
  assert.match(result.reply, /Outstanding: £250.00/);
  assert.equal(result.state.pendingFlow, undefined);
  assert.equal(result.state.recentRefs.customerId, "customer-1");
});

test("runtime completes customer payment after selecting one outstanding job", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");
  const stateStore = createInMemoryConversationStateStore();

  await stateStore.save({
    userId: "user-customer-payment-1",
    channel: "whatsapp",
    lastMessageAt: new Date().toISOString(),
    recentRefs: {},
    version: "v2",
    pendingFlow: {
      id: "record_customer_payment:MSG-old",
      workflow: "record_customer_payment",
      step: "entity_resolution",
      slots: {
        customer_query: "john",
        amount_pence: 25000
      },
      missingSlots: [],
      entityState: {
        status: "ambiguous",
        resolvedIds: {
          customerId: "customer-1"
        },
        unresolvedQuery: "john",
        candidates: [
          { id: "job-1", label: "Boiler repair - John Doe - outstanding £75.00 - due 2026-03-20", type: "job" },
          { id: "job-2", label: "Window cleaning - John Doe - outstanding £30.00", type: "job" }
        ]
      },
      prompt: "I found more than one match for customer payment. Please choose one: 1) Boiler repair - John Doe - outstanding £75.00 - due 2026-03-20, 2) Window cleaning - John Doe - outstanding £30.00. Reply with a number.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      topicShiftPolicy: "allow_strong_shift",
      sourceMessageId: "MSG-old"
    }
  });

  const result = await runConversationV2Turn(
    {
      userId: "user-customer-payment-1",
      from: "+447000000011",
      body: "1",
      messageSid: "MSG-CUSTOMER-PAYMENT-1"
    },
    {
      stateStore,
      services: buildCustomerPaymentServices()
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "record_customer_payment");
  assert.match(result.reply, /Recorded payment of £250.00/);
  assert.match(result.reply, /Remaining balance £50.00/);
  assert.equal(result.state.pendingFlow, undefined);
  assert.equal(result.state.recentRefs.customerId, "customer-1");
  assert.equal(result.state.recentRefs.jobId, "job-1");
});

test("runtime completes expense list through semantic front door", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");

  const result = await runConversationV2Turn(
    {
      userId: "user-expense-list-1",
      from: "+447000000012",
      body: "show my expenses",
      messageSid: "MSG-EXPENSE-LIST-1"
    },
    {
      stateStore: createInMemoryConversationStateStore(),
      services: buildExpenseAndVendorServices(),
      semanticLlmCaller: async () => ({
        kind: "workflow_intent",
        workflow: "expense_list",
        mode: "fresh",
        confidence: "high",
        fields: {
          range: "all"
        }
      })
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "expense_list");
  assert.match(result.reply, /Recent expenses \(2\), total £20.00:/);
  assert.match(result.reply, /£12.00/);
});

test("runtime completes vendor summary through semantic front door", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");

  const result = await runConversationV2Turn(
    {
      userId: "user-vendor-summary-1",
      from: "+447000000013",
      body: "vendor summary",
      messageSid: "MSG-VENDOR-SUMMARY-1"
    },
    {
      stateStore: createInMemoryConversationStateStore(),
      services: buildExpenseAndVendorServices(),
      semanticLlmCaller: async () => ({
        kind: "workflow_intent",
        workflow: "vendor_summary",
        mode: "fresh",
        confidence: "high",
        fields: {
          days: 30
        }
      })
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "vendor_summary");
  assert.match(result.reply, /Vendor 30d: outstanding £550.00/);
  assert.match(result.reply, /expenses £120.00/);
});

test("runtime completes full records pdf export through semantic front door", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");

  const result = await runConversationV2Turn(
    {
      userId: "user-export-records-1",
      from: "+447000000014",
      body: "bring all records",
      messageSid: "MSG-EXPORT-RECORDS-1"
    },
    {
      stateStore: createInMemoryConversationStateStore(),
      services: buildExportServices(),
      semanticLlmCaller: async () => ({
        kind: "workflow_intent",
        workflow: "export_records_pdf",
        mode: "fresh",
        confidence: "high",
        fields: {}
      })
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "export_records_pdf");
  assert.equal(result.reply, "Full records PDF is ready. Sending now.");
  assert.equal(result.mediaUrl, "https://example.com/export/pdf/token-records");
});

test("runtime completes expense pdf export through semantic front door", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");

  const result = await runConversationV2Turn(
    {
      userId: "user-export-expense-1",
      from: "+447000000015",
      body: "expenses pdf",
      messageSid: "MSG-EXPORT-EXPENSE-1"
    },
    {
      stateStore: createInMemoryConversationStateStore(),
      services: buildExportServices(),
      semanticLlmCaller: async () => ({
        kind: "workflow_intent",
        workflow: "export_expense_pdf",
        mode: "fresh",
        confidence: "high",
        fields: {}
      })
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "export_expense_pdf");
  assert.equal(result.reply, "Expense records PDF is ready. Sending now.");
  assert.equal(result.mediaUrl, "https://example.com/export/pdf/token-expenses");
});

test("runtime completes invoice pdf creation through semantic front door", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");

  const result = await runConversationV2Turn(
    {
      userId: "user-invoice-1",
      from: "+447000000016",
      body: "create invoice",
      messageSid: "MSG-INVOICE-1"
    },
    {
      stateStore: createInMemoryConversationStateStore(),
      services: buildExportServices(),
      semanticLlmCaller: async () => ({
        kind: "workflow_intent",
        workflow: "create_invoice",
        mode: "fresh",
        confidence: "high",
        fields: {}
      })
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "create_invoice");
  assert.equal(result.reply, "Invoice PDF is ready. Sending now.");
  assert.equal(result.mediaUrl, "https://example.com/export/pdf/token-invoice");
});

test("runtime honors fresh semantic clarification by creating a pending flow", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");
  const stateStore = createInMemoryConversationStateStore();

  const result = await runConversationV2Turn(
    {
      userId: "user-fresh-clarify",
      from: "+447000000099",
      body: "add new job tomorrow",
      messageSid: "MSG-SEM-FRESH-1"
    },
    {
      stateStore,
      services: buildServices(),
      semanticLlmCaller: async () => ({
        kind: "clarification",
        question: "Which customer is this for and what is the total price?",
        workflow: "create_job",
        missing_fields: ["customer_query", "total_pence"]
      })
    }
  );

  assert.equal(result.status, "pending");
  assert.equal(result.workflow, "create_job");
  assert.equal(result.reply, "Which customer is this for and what is the total price?");
  assert.equal(result.state.pendingFlow?.workflow, "create_job");
  assert.deepEqual(result.state.pendingFlow?.missingSlots, ["customer_query", "total_pence"]);
  assert.equal(result.state.pendingFlow?.prompt, "Which customer is this for and what is the total price?");
});

test("runtime merges multiple missing pending-flow slots from semantic continuation", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");
  const stateStore = createInMemoryConversationStateStore();

  await stateStore.save({
    userId: "user-3",
    channel: "whatsapp",
    lastMessageAt: new Date().toISOString(),
    recentRefs: {},
    version: "v2",
    pendingFlow: {
      id: "create_job:MSG-old",
      workflow: "create_job",
      step: "slot_filling",
      slots: {},
      missingSlots: ["customer_query", "title", "total_pence"],
      entityState: { status: "idle" },
      prompt: "Which customer is this for?",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      topicShiftPolicy: "allow_strong_shift",
      sourceMessageId: "MSG-old"
    }
  });

  const result = await runConversationV2Turn(
    {
      userId: "user-3",
      from: "+447000000003",
      body: "title: boiler repair, price: 450",
      messageSid: "MSG-SEM-3"
    },
    {
      stateStore,
      services: buildServices(),
      semanticLlmCaller: async () => ({
        kind: "workflow_intent",
        workflow: "create_job",
        mode: "continue_pending",
        confidence: "high",
        fields: {
          title: "boiler repair",
          total_pence: 45000
        }
      })
    }
  );

  assert.equal(result.status, "pending");
  assert.equal(result.workflow, "create_job");
  assert.equal(result.state.pendingFlow?.slots.title, "boiler repair");
  assert.equal(result.state.pendingFlow?.slots.total_pence, 45000);
  assert.deepEqual(result.state.pendingFlow?.missingSlots, ["customer_query"]);
  assert.equal(result.reply, "Which customer is this for?");
});

test("runtime accepts semantic due dates like 2 weeks without raising validation errors", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");
  const stateStore = createInMemoryConversationStateStore();

  await stateStore.save({
    userId: "user-date-1",
    channel: "whatsapp",
    lastMessageAt: new Date().toISOString(),
    recentRefs: {},
    version: "v2",
    pendingFlow: {
      id: "create_job:MSG-date-1",
      workflow: "create_job",
      step: "slot_filling",
      slots: {},
      missingSlots: ["customer_query", "title", "total_pence", "due_date"],
      entityState: { status: "idle" },
      prompt: "Which customer is this for?",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      topicShiftPolicy: "allow_strong_shift",
      sourceMessageId: "MSG-date-1"
    }
  });

  const result = await runConversationV2Turn(
    {
      userId: "user-date-1",
      from: "+447000000006",
      body: "title: boiler repair, price: 450, due date: 2 weeks",
      messageSid: "MSG-SEM-DATE-1"
    },
    {
      stateStore,
      services: buildServices(),
      semanticLlmCaller: async () => ({
        kind: "workflow_intent",
        workflow: "create_job",
        mode: "continue_pending",
        confidence: "high",
        fields: {
          title: "boiler repair",
          total_pence: 45000,
          due_date: "2 weeks"
        }
      })
    }
  );

  assert.equal(result.status, "pending");
  assert.equal(result.state.pendingFlow?.slots.due_date, "2 weeks");
  assert.deepEqual(result.state.pendingFlow?.missingSlots, ["customer_query"]);
  assert.equal(result.reply, "Which customer is this for?");
});

test("runtime keeps pending flow and returns semantic clarification when continuation is still ambiguous", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");
  const stateStore = createInMemoryConversationStateStore();

  await stateStore.save({
    userId: "user-4",
    channel: "whatsapp",
    lastMessageAt: new Date().toISOString(),
    recentRefs: {},
    version: "v2",
    pendingFlow: {
      id: "create_job:MSG-old-2",
      workflow: "create_job",
      step: "slot_filling",
      slots: {},
      missingSlots: ["customer_query", "title", "total_pence"],
      entityState: { status: "idle" },
      prompt: "Which customer is this for?",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      topicShiftPolicy: "allow_strong_shift",
      sourceMessageId: "MSG-old-2"
    }
  });

  const result = await runConversationV2Turn(
    {
      userId: "user-4",
      from: "+447000000004",
      body: "same as before",
      messageSid: "MSG-SEM-4"
    },
    {
      stateStore,
      services: buildServices(),
      semanticLlmCaller: async () => ({
        kind: "clarification",
        question: "I still need the customer name and the total price.",
        workflow: "create_job",
        missing_fields: ["customer_query", "total_pence"]
      })
    }
  );

  assert.equal(result.status, "pending");
  assert.equal(result.workflow, "create_job");
  assert.equal(result.reply, "I still need the customer name and the total price.");
  assert.equal(result.state.pendingFlow?.prompt, "I still need the customer name and the total price.");
});

test("runtime resolves ambiguous entity selection from numbered replies", async () => {
  ensureEnv();
  process.env.USE_V2_SEMANTIC_FRONT_DOOR = "true";
  const { runConversationV2Turn } = await import("../src/conversation-v2/engine/runtime");
  const stateStore = createInMemoryConversationStateStore();

  await stateStore.save({
    userId: "user-5",
    channel: "whatsapp",
    lastMessageAt: new Date().toISOString(),
    recentRefs: {},
    version: "v2",
    pendingFlow: {
      id: "create_job:MSG-old-3",
      workflow: "create_job",
      step: "entity_resolution",
      slots: {
        title: "New Job",
        total_pence: 30000,
        deposit_pence: 5000,
        due_date: "tomorrow",
        customer_query: "john"
      },
      missingSlots: [],
      entityState: {
        status: "ambiguous",
        unresolvedQuery: "john",
        candidates: [
          {
            id: "customer-1",
            label: "John",
            type: "customer"
          },
          {
            id: "customer-2",
            label: "John Doe",
            type: "customer"
          }
        ]
      },
      prompt: "I found more than one match for job creation. Please choose one: 1) John, 2) John Doe. Reply with a number.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      topicShiftPolicy: "allow_strong_shift",
      sourceMessageId: "MSG-old-3"
    }
  });

  const result = await runConversationV2Turn(
    {
      userId: "user-5",
      from: "+447000000005",
      body: "1",
      messageSid: "MSG-SEM-5"
    },
    {
      stateStore,
      services: buildExecutionServices(),
      semanticLlmCaller: async () => ({
        kind: "unknown",
        reason: "The user is choosing from an ambiguous list."
      })
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.workflow, "create_job");
  assert.equal(result.reply, "Created job New Job for John Doe.");
  assert.equal(result.state.pendingFlow, undefined);
});
