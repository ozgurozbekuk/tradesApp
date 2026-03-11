import test from "node:test";
import assert from "node:assert/strict";

const loadParser = async () => {
  const mod = await import("../src/messaging/parsers/heuristic-domain.parser");
  return mod.parseHeuristicDomainIntent ?? mod.default.parseHeuristicDomainIntent;
};

test("pending list_jobs follow-up resolves active scope from a short reply", async () => {
  const parseHeuristicDomainIntent = await loadParser();

  const result = parseHeuristicDomainIntent("active jobs", {
    pendingFlow: {
      intent: "list_jobs",
      entities: {},
      missingFields: ["scope"],
      followUpQuestion: "Do you want active jobs, jobs due this week, or jobs from the last 30 days?"
    }
  });

  assert.ok(result);
  assert.equal(result?.intent, "list_jobs");
  assert.deepEqual(result?.missingFields, []);
  assert.deepEqual(result?.entities, { scope: "active" });
  assert.deepEqual(result?.executionIntent, { type: "job_list_active" });
  assert.equal(result?.sessionReferences?.usesPendingFlow, true);
});

test("pending update_job_status follow-up keeps status and accepts a later job title", async () => {
  const parseHeuristicDomainIntent = await loadParser();

  const statusReply = parseHeuristicDomainIntent("active", {
    pendingFlow: {
      intent: "update_job_status",
      entities: { customerQuery: "John" },
      missingFields: ["status", "jobId"]
    }
  });

  assert.ok(statusReply);
  assert.equal(statusReply?.intent, "clarification_needed");
  assert.deepEqual(statusReply?.entities, { customerQuery: "John", status: "active" });
  assert.deepEqual(statusReply?.missingFields, ["jobId"]);

  const jobReply = parseHeuristicDomainIntent("boiler repair", {
    pendingFlow: {
      intent: "update_job_status",
      entities: { customerQuery: "John", status: "active" },
      missingFields: ["jobId"]
    }
  });

  assert.ok(jobReply);
  assert.equal(jobReply?.intent, "update_job_status");
  assert.deepEqual(jobReply?.entities, {
    customerQuery: "John",
    status: "active",
    jobQuery: "boiler repair",
    jobTitleQuery: "boiler repair"
  });
  assert.deepEqual(jobReply?.executionIntent, {
    type: "job_set_status",
    jobId: "boiler repair",
    status: "active"
  });
});

test("pending update_job_status follow-up normalizes common completed typos", async () => {
  const parseHeuristicDomainIntent = await loadParser();

  const result = parseHeuristicDomainIntent("complated", {
    pendingFlow: {
      intent: "update_job_status",
      entities: { jobQuery: "boiler repair" },
      missingFields: ["status"]
    }
  });

  assert.ok(result);
  assert.equal(result?.intent, "update_job_status");
  assert.deepEqual(result?.entities, { jobQuery: "boiler repair", status: "completed" });
  assert.deepEqual(result?.executionIntent, {
    type: "job_close",
    jobId: "boiler repair"
  });
});

test("heuristic parser understands simple booking messages", async () => {
  const parseHeuristicDomainIntent = await loadParser();

  const result = parseHeuristicDomainIntent("book john for tomorrow 10 am");

  assert.ok(result);
  assert.equal(result?.intent, "create_booking");
  assert.deepEqual(result?.missingFields, []);
  assert.equal(result?.entities.customerQuery, "john");
  assert.ok(result?.entities.startsAt instanceof Date);
  assert.equal(result?.executionIntent?.type, "booking_create");
});
