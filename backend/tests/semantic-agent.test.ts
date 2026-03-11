import test from "node:test";
import assert from "node:assert/strict";

const ensureEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "https://example.com/db";
  process.env.BASE_URL = process.env.BASE_URL || "https://example.com";
};

test("semantic agent routes plan-today phrases deterministically", async () => {
  ensureEnv();
  const { interpretWithSemanticAgent } = await import("../src/messaging/semantic-agent/interpreter");

  const result = await interpretWithSemanticAgent(
    { message: "plan today for me" },
    async () => ({
      kind: "response",
      message: "wrong path"
    })
  );

  assert.equal(result.status, "decision");
  if (result.status !== "decision") {
    return;
  }

  assert.equal(result.decision.capability, "plan_today");
  assert.equal(result.decision.needsSearchFirst, false);
});

test("semantic agent prefers capability planning over rigid intent labels", async () => {
  ensureEnv();
  const { interpretWithSemanticAgent } = await import("../src/messaging/semantic-agent/interpreter");

  const result = await interpretWithSemanticAgent(
    { message: "show me Ahmet's balance" },
    async () => ({
      kind: "action",
      capability: "get_customer_balance",
      entities: { customerQuery: "Ahmet" },
      needsSearchFirst: true,
      safeToExecuteDirectly: false
    })
  );

  assert.equal(result.status, "decision");
  if (result.status !== "decision") {
    return;
  }

  assert.equal(result.decision.capability, "get_customer_balance");
  assert.equal(result.decision.needsSearchFirst, true);
  assert.equal(result.decision.safeToExecuteDirectly, false);
  assert.deepEqual(result.decision.entities, { customerQuery: "Ahmet" });
});

test("semantic clarification does not leak internal field names", async () => {
  ensureEnv();
  const { interpretWithSemanticAgent } = await import("../src/messaging/semantic-agent/interpreter");

  const result = await interpretWithSemanticAgent(
    { message: "open it" },
    async () => ({
      kind: "clarification",
      question: "",
      candidateCapability: "search_customers",
      missingOrAmbiguous: ["query"]
    })
  );

  assert.equal(result.status, "clarification");
  if (result.status !== "clarification") {
    return;
  }

  assert.equal(result.question, "Which customer should I look up?");
  assert.ok(!result.question.includes("query"));
});

test("runtime resolves a single customer before executing", async () => {
  const { resolveSemanticCapability } = await import("../src/messaging/semantic-agent/runtime");

  const result = await resolveSemanticCapability(
    {
      userId: "user-1",
      capability: "get_customer_balance",
      entities: { customerQuery: "Ahmet" }
    },
    {
      resolveCustomer: async () => ({
        status: "single" as const,
        customer: {
          id: "customer-1",
          name: "Ahmet Kaya",
          phone: null,
          createdAt: new Date(),
          score: 1000
        }
      }),
      resolveVendor: async () => ({
        status: "vendor" as const,
        vendor: {
          id: "vendor-1",
          vendorName: "Build Supplies Ltd"
        }
      })
    }
  );

  assert.equal(result.status, "executable");
  if (result.status !== "executable") {
    return;
  }

  assert.deepEqual(result.intent, {
    type: "customer_find",
    query: "Ahmet Kaya"
  });
});

test("runtime resolves a customer before executing booking creation", async () => {
  const { resolveSemanticCapability } = await import("../src/messaging/semantic-agent/runtime");
  const startsAt = new Date("2026-03-12T10:00:00.000Z");

  const result = await resolveSemanticCapability(
    {
      userId: "user-1",
      capability: "create_booking",
      entities: { customerQuery: "John", startsAt: startsAt.toISOString() }
    },
    {
      resolveCustomer: async () => ({
        status: "single" as const,
        customer: {
          id: "customer-1",
          name: "John Smith",
          phone: null,
          createdAt: new Date(),
          score: 1000
        }
      }),
      resolveVendor: async () => ({
        status: "vendor" as const,
        vendor: {
          id: "vendor-1",
          vendorName: "Build Supplies Ltd"
        }
      })
    }
  );

  assert.equal(result.status, "executable");
  if (result.status !== "executable") {
    return;
  }

  assert.equal(result.intent?.type, "booking_create");
  if (result.intent?.type !== "booking_create") {
    return;
  }
  assert.equal(result.intent.customerName, "John Smith");
  assert.equal(result.intent.startsAt.toISOString(), startsAt.toISOString());
});

test("runtime asks for clarification when customer search is ambiguous", async () => {
  const { resolveSemanticCapability } = await import("../src/messaging/semantic-agent/runtime");

  const result = await resolveSemanticCapability(
    {
      userId: "user-1",
      capability: "get_customer_balance",
      entities: { customerQuery: "Ahmet" }
    },
    {
      resolveCustomer: async () => ({
        status: "ambiguous" as const,
        query: "Ahmet",
        candidates: [
          { id: "1", name: "Ahmet Kaya", phone: null, score: 900 },
          { id: "2", name: "Ahmet Demir", phone: null, score: 880 }
        ]
      }),
      resolveVendor: async () => ({
        status: "vendor" as const,
        vendor: {
          id: "vendor-1",
          vendorName: "Build Supplies Ltd"
        }
      })
    }
  );

  assert.equal(result.status, "clarification");
  if (result.status !== "clarification") {
    return;
  }

  assert.equal(result.decision.structuredReason?.type, "ambiguous_customer");
  assert.equal(result.question, 'I found more than one customer for "Ahmet". Which one do you mean: Ahmet Kaya, Ahmet Demir?');
});

test("runtime asks for clarification when no customer matches", async () => {
  const { resolveSemanticCapability } = await import("../src/messaging/semantic-agent/runtime");

  const result = await resolveSemanticCapability(
    {
      userId: "user-1",
      capability: "get_customer_balance",
      entities: { customerQuery: "Ahmet" }
    },
    {
      resolveCustomer: async () => ({
        status: "not_found" as const,
        query: "Ahmet"
      }),
      resolveVendor: async () => ({
        status: "vendor" as const,
        vendor: {
          id: "vendor-1",
          vendorName: "Build Supplies Ltd"
        }
      })
    }
  );

  assert.equal(result.status, "clarification");
  if (result.status !== "clarification") {
    return;
  }

  assert.equal(result.decision.structuredReason?.type, "customer_not_found");
  assert.equal(result.question, `I couldn't find a customer matching "Ahmet". What name should I look for?`);
});

test("runtime blocks direct payment execution when amount is missing", async () => {
  const { resolveSemanticCapability } = await import("../src/messaging/semantic-agent/runtime");

  const result = await resolveSemanticCapability(
    {
      userId: "user-1",
      capability: "record_payment",
      entities: { customerQuery: "Mehmet" }
    },
    {
      resolveCustomer: async () => ({
        status: "single" as const,
        customer: {
          id: "customer-2",
          name: "Mehmet Yilmaz",
          phone: null,
          createdAt: new Date(),
          score: 1000
        }
      }),
      resolveVendor: async () => ({
        status: "vendor" as const,
        vendor: {
          id: "vendor-1",
          vendorName: "Build Supplies Ltd"
        }
      })
    }
  );

  assert.equal(result.status, "clarification");
  if (result.status !== "clarification") {
    return;
  }

  assert.equal(result.decision.structuredReason?.type, "missing_field");
  assert.equal(result.question, "What amount should I use?");
});

test("interpreter can keep uncertain planning requests in guided recovery", async () => {
  ensureEnv();
  const { interpretWithSemanticAgent } = await import("../src/messaging/semantic-agent/interpreter");

  const result = await interpretWithSemanticAgent(
    { message: "what is my plan for tomorrow" },
    async () => ({
      kind: "clarification",
      question: "Do you want a plan for tomorrow or a summary for today?",
      candidateCapability: "plan_today",
      missingOrAmbiguous: ["date"]
    })
  );

  assert.equal(result.status, "clarification");
  if (result.status !== "clarification") {
    return;
  }

  assert.equal(result.question, "Do you want a plan for tomorrow or a summary for today?");
});

test("runtime resolves a single job before executing status updates", async () => {
  const { resolveSemanticCapability } = await import("../src/messaging/semantic-agent/runtime");

  const result = await resolveSemanticCapability(
    {
      userId: "user-1",
      capability: "update_job_status",
      entities: { jobQuery: "boiler repair", status: "completed" }
    },
    {
      resolveCustomer: async () => ({
        status: "single" as const,
        customer: {
          id: "customer-1",
          name: "Ahmet Kaya",
          phone: null,
          createdAt: new Date(),
          score: 1000
        }
      }),
      resolveVendor: async () => ({
        status: "vendor" as const,
        vendor: {
          id: "vendor-1",
          vendorName: "Build Supplies Ltd"
        }
      }),
      resolveJob: async () => ({
        status: "single" as const,
        job: {
          id: "job-12345678",
          title: "Boiler repair",
          customerName: "Ahmet Kaya",
          outstandingPence: 0,
          dueDate: null,
          createdAt: new Date(),
          score: 1000
        }
      })
    }
  );

  assert.equal(result.status, "executable");
  if (result.status !== "executable") {
    return;
  }

  assert.deepEqual(result.intent, {
    type: "job_set_status",
    jobId: "job-12345678",
    status: "completed"
  });
});

test("runtime asks for clarification when job search is ambiguous", async () => {
  const { resolveSemanticCapability } = await import("../src/messaging/semantic-agent/runtime");

  const result = await resolveSemanticCapability(
    {
      userId: "user-1",
      capability: "update_job_status",
      entities: { jobQuery: "boiler", status: "completed" }
    },
    {
      resolveCustomer: async () => ({
        status: "single" as const,
        customer: {
          id: "customer-1",
          name: "Ahmet Kaya",
          phone: null,
          createdAt: new Date(),
          score: 1000
        }
      }),
      resolveVendor: async () => ({
        status: "vendor" as const,
        vendor: {
          id: "vendor-1",
          vendorName: "Build Supplies Ltd"
        }
      }),
      resolveJob: async () => ({
        status: "ambiguous" as const,
        query: "boiler",
        candidates: [
          {
            id: "job-1",
            title: "Boiler repair",
            customerName: "Ahmet Kaya",
            outstandingPence: 0,
            dueDate: null,
            score: 920
          },
          {
            id: "job-2",
            title: "Boiler service",
            customerName: "Mehmet Yilmaz",
            outstandingPence: 0,
            dueDate: null,
            score: 900
          }
        ]
      })
    }
  );

  assert.equal(result.status, "clarification");
  if (result.status !== "clarification") {
    return;
  }

  assert.equal(result.decision.structuredReason?.type, "ambiguous_job");
  assert.ok(result.question.includes('I found more than one job for "boiler"'));
});

test("runtime asks for clarification when no job matches", async () => {
  const { resolveSemanticCapability } = await import("../src/messaging/semantic-agent/runtime");

  const result = await resolveSemanticCapability(
    {
      userId: "user-1",
      capability: "update_job_status",
      entities: { jobQuery: "missing boiler", status: "completed" }
    },
    {
      resolveCustomer: async () => ({
        status: "single" as const,
        customer: {
          id: "customer-1",
          name: "Ahmet Kaya",
          phone: null,
          createdAt: new Date(),
          score: 1000
        }
      }),
      resolveVendor: async () => ({
        status: "vendor" as const,
        vendor: {
          id: "vendor-1",
          vendorName: "Build Supplies Ltd"
        }
      }),
      resolveJob: async () => ({
        status: "not_found" as const,
        query: "missing boiler"
      })
    }
  );

  assert.equal(result.status, "clarification");
  if (result.status !== "clarification") {
    return;
  }

  assert.equal(result.decision.structuredReason?.type, "job_not_found");
  assert.equal(result.question, `I couldn't find a job matching "missing boiler". Which job should I use?`);
});
