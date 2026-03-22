import { JobStatus, PaymentMethod } from "@prisma/client";
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
import { parseConversationDate } from "../date-parsing";

const penceToPounds = (value: number) => `£${(value / 100).toFixed(2)}`;

const parseOccurredAt = (value: unknown) => {
  return parseConversationDate(value);
};

const parseDueDate = (value: unknown) => {
  return parseConversationDate(value);
};

const buildSummaryReply = (label: string, summary: {
  jobsCreated: number;
  jobsCompleted: number;
  paymentsReceivedPence: number;
  expensesPaidPence: number;
  outstandingPence: number;
}) =>
  `${label}: created ${summary.jobsCreated}, completed ${summary.jobsCompleted}, paid ${penceToPounds(summary.paymentsReceivedPence)}, spent ${penceToPounds(summary.expensesPaidPence)}, outstanding ${penceToPounds(summary.outstandingPence)}.`;

const buildCustomerRecordsReply = (record: {
  name: string;
  phone: string | null;
  activeJobs: number;
  outstandingPence: number;
  lastPaymentPence: number | null;
  lastPaymentAt: Date | null;
}) => {
  const lastPayment =
    record.lastPaymentPence !== null
      ? `Last payment ${penceToPounds(record.lastPaymentPence)}${record.lastPaymentAt ? ` on ${record.lastPaymentAt.toISOString().slice(0, 10)}` : ""}.`
      : "No payments yet.";

  return [
    `Customer record for ${record.name}${record.phone ? ` (${record.phone})` : ""}:`,
    `Active jobs: ${record.activeJobs}.`,
    `Outstanding: ${penceToPounds(record.outstandingPence)}.`,
    lastPayment
  ].join(" ");
};

const buildExpenseListReply = (
  expenses: Array<{
    amountPence: number;
    occurredAt: Date;
    note?: string | null;
    counterpartyName?: string | null;
    vendor?: { vendorName: string } | null;
  }>
) => {
  if (expenses.length === 0) {
    return "No expenses recorded yet.";
  }

  const totalPence = expenses.reduce((sum, expense) => sum + expense.amountPence, 0);
  const lines = expenses
    .slice(0, 10)
    .map((expense) => {
      const counterparty = expense.vendor?.vendorName ?? expense.counterpartyName ?? undefined;
      return `- ${penceToPounds(expense.amountPence)} on ${expense.occurredAt.toISOString().slice(0, 10)}${counterparty ? ` at ${counterparty}` : ""}${expense.note ? ` for ${expense.note}` : ""}`;
    });

  return [`Recent expenses (${expenses.length}), total ${penceToPounds(totalPence)}:`, ...lines].join("\n");
};

const buildVendorSummaryReply = (summary: {
  days: number;
  vendorOutstandingPence: number;
  expensePaidPence: number;
  vendorDebtAddedPence: number;
  vendorPaymentPence: number;
}) =>
  `Vendor ${summary.days}d: outstanding ${penceToPounds(summary.vendorOutstandingPence)}, expenses ${penceToPounds(summary.expensePaidPence)}, debts added ${penceToPounds(summary.vendorDebtAddedPence)}, vendor payments ${penceToPounds(summary.vendorPaymentPence)}.`;

const filterExpensesByRange = <
  TExpense extends {
    occurredAt: Date;
  }
>(
  expenses: TExpense[],
  range: "today" | "yesterday" | "week" | "all"
) => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  if (range === "all") {
    return expenses;
  }

  if (range === "today") {
    return expenses.filter((expense) => expense.occurredAt >= todayStart);
  }

  if (range === "yesterday") {
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    return expenses.filter((expense) => expense.occurredAt >= yesterdayStart && expense.occurredAt < todayStart);
  }

  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  return expenses.filter((expense) => expense.occurredAt >= weekStart);
};

const resolveMonthlySummaryPeriod = (slots: Record<string, unknown>): "30d" => {
  const month = typeof slots.month === "number" ? slots.month : undefined;
  const year = typeof slots.year === "number" ? slots.year : undefined;

  // Current reporting service only supports rolling windows, so monthly summary
  // uses the 30-day period until a calendar-month report is added.
  void month;
  void year;
  return "30d";
};

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
    case "customer_records": {
      const customerId = getResolvedId(input.entityState, "customerId");
      if (!customerId) {
        return {
          workflow: input.workflow,
          reply: "I still need a specific customer before I can show the records.",
          completed: false
        };
      }

      const record = await services.customers.findRecordByCustomerId({
        userId: input.userId,
        customerId
      });

      if (!record) {
        return {
          workflow: input.workflow,
          reply: "I could not find that customer record.",
          completed: false
        };
      }

      return {
        workflow: input.workflow,
        reply: buildCustomerRecordsReply(record),
        recentRefs: {
          customerId: record.id,
          customerName: record.name
        },
        completed: true
      };
    }

    case "record_customer_payment": {
      const jobId = getResolvedId(input.entityState, "jobId");
      if (!jobId) {
        return {
          workflow: input.workflow,
          reply: "I still need the exact outstanding job before I can record that payment.",
          completed: false
        };
      }

      const amountPence = Number(input.slots.amount_pence ?? 0);
      const result = await services.payments.addPayment({
        userId: input.userId,
        jobId,
        amountPence,
        method: (typeof input.slots.method === "string"
          ? input.slots.method
          : "unknown") as PaymentMethod,
        note: typeof input.slots.note === "string" ? input.slots.note : undefined
      });

      const customerId = getResolvedId(input.entityState, "customerId");
      const customer = customerId
        ? await services.customers.findCustomerById({
            userId: input.userId,
            customerId
          })
        : null;

      return {
        workflow: input.workflow,
        reply: `Recorded payment of ${penceToPounds(result.payment.amountPence)}. Remaining balance ${penceToPounds(result.outstandingPence)}.`,
        recentRefs: {
          customerId: customer?.id,
          customerName: customer?.name,
          jobId
        },
        completed: true
      };
    }

    case "expense_list": {
      const txs = await services.vendorPayments.listMoneyTransactions(input.userId);
      const range =
        typeof input.slots.range === "string" &&
        ["today", "yesterday", "week", "all"].includes(input.slots.range)
          ? (input.slots.range as "today" | "yesterday" | "week" | "all")
          : "all";
      const expenses = filterExpensesByRange(
        txs.filter((tx) => tx.kind === "expense_paid"),
        range
      );

      return {
        workflow: input.workflow,
        reply: buildExpenseListReply(expenses),
        completed: true
      };
    }

    case "vendor_summary": {
      const summary = await services.vendorPayments.getSummary({
        userId: input.userId,
        days: typeof input.slots.days === "number" ? input.slots.days : undefined
      });

      return {
        workflow: input.workflow,
        reply: buildVendorSummaryReply(summary),
        completed: true
      };
    }

    case "export_records_pdf": {
      const customerId = getResolvedId(input.entityState, "customerId");
      const customerQuery = typeof input.slots.customer_query === "string" ? input.slots.customer_query : undefined;
      const token = services.exports.createPdfAccessToken({
        userId: input.userId,
        customerId,
        customerQuery
      });

      return {
        workflow: input.workflow,
        reply: customerQuery
          ? `Customer report PDF is ready for "${customerQuery}". Sending now.`
          : "Full records PDF is ready. Sending now.",
        mediaUrl: services.exports.createPdfDownloadLink(token),
        recentRefs: customerId
          ? {
              customerId,
              customerName: customerQuery
            }
          : undefined,
        completed: true
      };
    }

    case "export_vendor_pdf": {
      const vendorId = getResolvedId(input.entityState, "vendorId");
      const vendorQuery = typeof input.slots.vendor_query === "string" ? input.slots.vendor_query : undefined;
      const token = services.exports.createVendorPdfAccessToken({
        userId: input.userId,
        vendorId,
        vendorQuery
      });

      return {
        workflow: input.workflow,
        reply: vendorQuery
          ? `Vendor report PDF is ready for "${vendorQuery}". Sending now.`
          : "Vendor report PDF is ready. Sending now.",
        mediaUrl: services.exports.createPdfDownloadLink(token),
        recentRefs: vendorId
          ? {
              vendorId,
              vendorName: vendorQuery
            }
          : undefined,
        completed: true
      };
    }

    case "export_expense_pdf": {
      const token = services.exports.createExpensePdfAccessToken({
        userId: input.userId
      });

      return {
        workflow: input.workflow,
        reply: "Expense records PDF is ready. Sending now.",
        mediaUrl: services.exports.createPdfDownloadLink(token),
        completed: true
      };
    }

    case "create_invoice": {
      const customerId = getResolvedId(input.entityState, "customerId");
      const customerQuery = typeof input.slots.customer_query === "string" ? input.slots.customer_query : undefined;
      const token = services.exports.createInvoicePdfAccessToken({
        userId: input.userId,
        customerId,
        customerQuery
      });

      return {
        workflow: input.workflow,
        reply: customerQuery
          ? `Invoice PDF is ready for "${customerQuery}". Sending now.`
          : "Invoice PDF is ready. Sending now.",
        mediaUrl: services.exports.createPdfDownloadLink(token),
        recentRefs: customerId
          ? {
              customerId,
              customerName: customerQuery
            }
          : undefined,
        completed: true
      };
    }

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
        dueDate: parseDueDate(input.slots.due_date),
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

      if (plan.todayJobs.length === 0) {
        return {
          workflow: input.workflow,
          reply: `Today: ${plan.scheduledToday} scheduled, ${plan.dueSoonCount} due soon, ${plan.overdueCount} overdue.`,
          completed: true
        };
      }

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
        note:
          [input.slots.category, input.slots.note]
            .filter((value) => typeof value === "string" && value.trim().length > 0)
            .join(" - ") || undefined,
        counterpartyName: typeof input.slots.vendor_query === "string" ? input.slots.vendor_query : undefined,
        occurredAt: parseOccurredAt(input.slots.occurred_on)
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
      const summary = await services.reports.getSummary(input.userId, resolveMonthlySummaryPeriod(input.slots));
      return {
        workflow: input.workflow,
        reply: buildSummaryReply("Monthly summary", summary),
        completed: true
      };
    }
  }
};
