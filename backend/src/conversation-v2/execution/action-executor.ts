import { JobStatus } from "@prisma/client";
import type {
  EntityResolutionResult,
  WorkflowExecutionResult,
  WorkflowName
} from "../engine/contracts";
import {
  createConversationV2Services,
  createCustomerExplicitly,
  type ConversationV2Services
} from "../adapters/services";

const penceToPounds = (value: number) => `£${(value / 100).toFixed(2)}`;

const parseOccurredAt = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "today") {
    return new Date();
  }

  if (normalized === "yesterday") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const buildSummaryReply = (label: string, summary: {
  jobsCreated: number;
  jobsCompleted: number;
  paymentsReceivedPence: number;
  expensesPaidPence: number;
  outstandingPence: number;
}) =>
  `${label}: created ${summary.jobsCreated}, completed ${summary.jobsCompleted}, paid ${penceToPounds(summary.paymentsReceivedPence)}, spent ${penceToPounds(summary.expensesPaidPence)}, outstanding ${penceToPounds(summary.outstandingPence)}.`;

const getResolvedId = (entityState: EntityResolutionResult, key: "customerId" | "vendorId" | "jobId") =>
  entityState.status === "resolved" ? entityState.resolvedIds[key] : undefined;

export const executeWorkflowAction = async (input: {
  userId: string;
  workflow: WorkflowName;
  slots: Record<string, unknown>;
  entityState: EntityResolutionResult;
  services?: ConversationV2Services;
}): Promise<WorkflowExecutionResult> => {
  const services = input.services ?? createConversationV2Services();

  switch (input.workflow) {
    case "create_customer": {
      const customer = await createCustomerExplicitly({
        userId: input.userId,
        name: String(input.slots.customer_name ?? "").trim(),
        phone: typeof input.slots.customer_phone === "string" ? input.slots.customer_phone : undefined,
        notes: typeof input.slots.notes === "string" ? input.slots.notes : undefined,
        customersService: services.customers
      });

      return {
        workflow: input.workflow,
        reply: `Created customer ${customer.name}.`,
        recentRefs: {
          customerId: customer.id,
          customerName: customer.name
        },
        completed: true
      };
    }

    case "record_vendor_debt": {
      const vendorName = String(input.slots.vendor_query ?? "").trim();
      const amountPence = Number(input.slots.amount_pence ?? 0);
      const ledger = await services.vendorPayments.addVendorDebt({
        userId: input.userId,
        vendorName,
        amountPence,
        note: typeof input.slots.note === "string" ? input.slots.note : undefined,
        occurredAt: parseOccurredAt(input.slots.occurred_on)
      });

      return {
        workflow: input.workflow,
        reply: `Recorded vendor debt of ${penceToPounds(amountPence)} for ${ledger.vendorName}.`,
        recentRefs: {
          vendorId: ledger.id,
          vendorName: ledger.vendorName
        },
        completed: true
      };
    }

    case "record_vendor_payment": {
      const vendorId = getResolvedId(input.entityState, "vendorId");
      if (!vendorId) {
        return {
          workflow: input.workflow,
          reply: "I still need a specific vendor before I can record that payment.",
          completed: false
        };
      }

      const amountPence = Number(input.slots.amount_pence ?? 0);
      const ledger = await services.vendorPayments.addVendorPaymentByVendorId({
        userId: input.userId,
        vendorId,
        amountPence,
        note: typeof input.slots.note === "string" ? input.slots.note : undefined,
        occurredAt: parseOccurredAt(input.slots.occurred_on)
      });

      return {
        workflow: input.workflow,
        reply: `Recorded vendor payment of ${penceToPounds(amountPence)} to ${ledger.vendorName}.`,
        recentRefs: {
          vendorId: ledger.id,
          vendorName: ledger.vendorName
        },
        completed: true
      };
    }

    case "create_job": {
      const customerId = getResolvedId(input.entityState, "customerId");
      if (!customerId) {
        return {
          workflow: input.workflow,
          reply: "I still need a specific customer before I can create that job.",
          completed: false
        };
      }

      const result = await services.jobs.createJobForCustomerId({
        userId: input.userId,
        customerId,
        title: String(input.slots.title ?? "").trim(),
        priceTotalPence: Number(input.slots.total_pence ?? 0),
        depositPence:
          typeof input.slots.deposit_pence === "number" ? input.slots.deposit_pence : undefined,
        notes: typeof input.slots.notes === "string" ? input.slots.notes : undefined
      });

      return {
        workflow: input.workflow,
        reply: `Created job ${result.job.title} for ${result.customer.name}.`,
        recentRefs: {
          customerId: result.customer.id,
          customerName: result.customer.name,
          jobId: result.job.id,
          jobTitle: result.job.title
        },
        completed: true
      };
    }

    case "update_job_status": {
      const jobId = getResolvedId(input.entityState, "jobId");
      if (!jobId) {
        return {
          workflow: input.workflow,
          reply: "I still need a specific job before I can update the status.",
          completed: false
        };
      }

      const job = await services.jobs.updateJobStatus({
        userId: input.userId,
        jobId,
        status: String(input.slots.status ?? "active") as JobStatus
      });

      if (!job) {
        return {
          workflow: input.workflow,
          reply: "I could not find that job to update.",
          completed: false
        };
      }

      return {
        workflow: input.workflow,
        reply: `Updated ${job.title} to ${job.status}.`,
        recentRefs: {
          jobId: job.id,
          jobTitle: job.title
        },
        completed: true
      };
    }

    case "list_today_jobs": {
      const plan = await services.reminders.buildTodayPlan({
        userId: input.userId
      });

      const firstLine = `Today: ${plan.scheduledToday} scheduled, ${plan.dueSoonCount} due soon, ${plan.overdueCount} overdue.`;
      const jobLines = plan.todayJobs.slice(0, 5).map((job) => `- ${job.customerName}: ${job.title} at ${job.scheduledFor}`);

      return {
        workflow: input.workflow,
        reply: [firstLine, ...jobLines].join("\n"),
        completed: true
      };
    }

    case "record_expense": {
      const amountPence = Number(input.slots.amount_pence ?? 0);
      await services.vendorPayments.addExpensePaid({
        userId: input.userId,
        amountPence,
        note: typeof input.slots.note === "string" ? input.slots.note : undefined,
        counterpartyName: typeof input.slots.vendor_query === "string" ? input.slots.vendor_query : undefined
      });

      return {
        workflow: input.workflow,
        reply: `Recorded expense of ${penceToPounds(amountPence)}.`,
        completed: true
      };
    }

    case "daily_summary": {
      const summary = await services.reports.getSummary(input.userId, "today");
      return {
        workflow: input.workflow,
        reply: buildSummaryReply("Daily summary", summary),
        completed: true
      };
    }

    case "monthly_summary": {
      const summary = await services.reports.getSummary(input.userId, "30d");
      return {
        workflow: input.workflow,
        reply: buildSummaryReply("Monthly summary", summary),
        completed: true
      };
    }
  }
};
