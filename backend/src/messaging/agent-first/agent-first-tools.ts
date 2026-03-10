import { z } from "zod";
import type { AgentPendingFlow, ParsedUserIntent } from "../agent/agent-types";
import type { ParsedIntent } from "../intents/schemas";
import type { AgentFirstToolName } from "./agent-first-types";
import { buildClarificationQuestion } from "../agent/clarification-builder";

type ToolInput = Record<string, unknown>;

type AgentFirstToolDefinition = {
  name: AgentFirstToolName;
  description: string;
  inputSchema: z.ZodType<ToolInput>;
  toIntent: (input: ToolInput) => ParsedIntent;
  toAnalysis: (input: ToolInput, intent: ParsedIntent) => ParsedUserIntent;
  toPendingFlow?: (input: ToolInput, missingFields: string[]) => AgentPendingFlow | null;
  clarificationIntent?: ParsedUserIntent["intent"];
  clarificationEntities?: (input: ToolInput) => Record<string, unknown>;
};

const SearchCustomersToolSchema = z.object({
  query: z.string().min(1)
});

const GetCustomerAccountToolSchema = z.object({
  customerQuery: z.string().min(1)
});

const CreateCustomerToolSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(4).optional(),
  notes: z.string().min(1).optional()
});

const CreateJobToolSchema = z.object({
  customerQuery: z.string().min(1),
  customerPhone: z.string().min(4).optional(),
  title: z.string().min(1),
  totalPence: z.number().int().nonnegative(),
  depositPence: z.number().int().nonnegative().optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().min(1).optional()
});

const ListJobsToolSchema = z.object({
  scope: z.enum(["active", "due_week", "last_30"])
});

const CloseJobToolSchema = z
  .object({
    jobId: z.string().min(1).optional(),
    customerQuery: z.string().min(1).optional()
  })
  .refine((value) => Boolean(value.jobId || value.customerQuery), {
    message: "Provide either jobId or customerQuery."
  });

const RecordPaymentToolSchema = z
  .object({
    jobId: z.string().min(1).optional(),
    customerName: z.string().min(1).optional(),
    amountPence: z.number().int().positive(),
    method: z.enum(["cash", "bank", "card", "unknown"]).optional(),
    note: z.string().min(1).optional()
  })
  .refine((value) => Boolean(value.jobId || value.customerName), {
    message: "Provide either jobId or customerName."
  });

const ListPaymentsToolSchema = z.object({
  range: z.enum(["today", "yesterday", "week", "month", "all"]).optional()
});

const RecordExpenseToolSchema = z.object({
  amountPence: z.number().int().positive(),
  note: z.string().min(1).optional(),
  counterpartyName: z.string().min(1).optional()
});

const ListExpensesToolSchema = z.object({});

const AddVendorDebtToolSchema = z.object({
  vendorQuery: z.string().min(1),
  amountPence: z.number().int().positive(),
  note: z.string().min(1).optional()
});

const AddVendorPaymentToolSchema = z.object({
  vendorQuery: z.string().min(1),
  amountPence: z.number().int().positive(),
  note: z.string().min(1).optional()
});

const GetVendorSummaryToolSchema = z.object({
  days: z.number().int().positive().max(365).optional()
});

const CreateInvoiceToolSchema = z.object({
  customerQuery: z.string().min(1)
});

const ExportCustomerPdfToolSchema = z.object({
  customerQuery: z.string().min(1).optional()
});

const ExportExpensesPdfToolSchema = z.object({});

const ExportAllDataToolSchema = z.object({});

const GetSummaryToolSchema = z.object({});
const PlanTodayToolSchema = z.object({
  timezone: z.string().min(1).optional()
});

const toIsoDate = (value?: string) => (value ? new Date(value) : undefined);
const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asOptionalString = (value: unknown) => (typeof value === "string" ? value : undefined);
const asNumber = (value: unknown) => (typeof value === "number" ? value : 0);
const asOptionalNumber = (value: unknown) => (typeof value === "number" ? value : undefined);
const asPaymentMethod = (value: unknown) =>
  value === "cash" || value === "bank" || value === "card" || value === "unknown" ? value : undefined;
const asPaymentRange = (value: unknown) =>
  value === "today" || value === "yesterday" || value === "week" || value === "month" || value === "all"
    ? value
    : undefined;

const createAnalysis = (input: {
  intent: ParsedUserIntent["intent"];
  confidence?: number;
  entities?: Record<string, unknown>;
  missingFields?: string[];
  executionIntent?: ParsedIntent | null;
}): ParsedUserIntent => ({
  intent: input.intent,
  confidence: input.confidence ?? 0.86,
  entities: input.entities ?? {},
  missingFields: input.missingFields ?? [],
  needsDisambiguation: false,
  executionIntent: input.executionIntent,
  source: "llm"
});

export const agentFirstToolDefinitions: Record<AgentFirstToolName, AgentFirstToolDefinition> = {
  searchCustomers: {
    name: "searchCustomers",
    description: "Search for customers by name or partial reference.",
    inputSchema: SearchCustomersToolSchema,
    toIntent: (input) => ({ type: "customer_find", query: asString(input.query) }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "search_customer",
        entities: { customerQuery: asString(input.query) },
        executionIntent: intent
      }),
    clarificationIntent: "search_customer",
    clarificationEntities: (input) => ({ customerQuery: asString(input.query) }),
    toPendingFlow: (input, missingFields) =>
      missingFields.length
        ? {
            intent: "search_customer",
            entities: { customerQuery: asString(input.query) },
            missingFields
          }
        : null
  },
  getCustomerAccount: {
    name: "getCustomerAccount",
    description: "Open a customer's account or record summary.",
    inputSchema: GetCustomerAccountToolSchema,
    toIntent: (input) => ({ type: "customer_find", query: asString(input.customerQuery) }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "get_customer_account",
        entities: { customerQuery: asString(input.customerQuery) },
        executionIntent: intent
      }),
    clarificationIntent: "get_customer_account",
    clarificationEntities: (input) => ({ customerQuery: asString(input.customerQuery) }),
    toPendingFlow: (input, missingFields) =>
      missingFields.length
        ? {
            intent: "get_customer_account",
            entities: { customerQuery: asString(input.customerQuery) },
            missingFields
          }
        : null
  },
  createCustomer: {
    name: "createCustomer",
    description: "Create a new customer record.",
    inputSchema: CreateCustomerToolSchema,
    toIntent: (input) => ({
      type: "customer_create",
      name: asString(input.name),
      phone: asOptionalString(input.phone),
      notes: asOptionalString(input.notes)
    }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "create_customer",
        entities: {
          name: asString(input.name),
          customerQuery: asString(input.name),
          phone: asOptionalString(input.phone),
          notes: asOptionalString(input.notes)
        },
        executionIntent: intent
      }),
    clarificationIntent: "create_customer",
    clarificationEntities: (input) => ({ customerQuery: asString(input.name), phone: asOptionalString(input.phone) })
  },
  createJob: {
    name: "createJob",
    description: "Create a new job for an existing or new customer.",
    inputSchema: CreateJobToolSchema,
    toIntent: (input) => ({
      type: "job_create",
      customerName: asString(input.customerQuery),
      customerPhone: asOptionalString(input.customerPhone),
      title: asString(input.title),
      totalPence: asNumber(input.totalPence),
      depositPence: asOptionalNumber(input.depositPence),
      dueDate: toIsoDate(asOptionalString(input.dueDate)),
      notes: asOptionalString(input.notes)
    }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "create_job",
        entities: {
          customerQuery: asString(input.customerQuery),
          customerName: asString(input.customerQuery),
          customerPhone: asOptionalString(input.customerPhone),
          title: asString(input.title),
          totalPence: asNumber(input.totalPence),
          depositPence: asOptionalNumber(input.depositPence),
          dueDate: asOptionalString(input.dueDate),
          notes: asOptionalString(input.notes)
        },
        executionIntent: intent
      }),
    clarificationIntent: "create_job",
    clarificationEntities: (input) => ({
      customerQuery: asString(input.customerQuery),
      customerName: asString(input.customerQuery),
      title: asString(input.title),
      totalPence: asOptionalNumber(input.totalPence)
    }),
    toPendingFlow: (input, missingFields) => ({
      intent: "create_job",
      entities: {
        customerQuery: asString(input.customerQuery),
        customerName: asString(input.customerQuery),
        customerPhone: asOptionalString(input.customerPhone),
        title: asString(input.title),
        totalPence: asOptionalNumber(input.totalPence),
        depositPence: asOptionalNumber(input.depositPence),
        dueDate: asOptionalString(input.dueDate),
        notes: asOptionalString(input.notes)
      },
      missingFields
    })
  },
  listJobs: {
    name: "listJobs",
    description: "List active jobs, jobs due this week, or jobs created in the last 30 days.",
    inputSchema: ListJobsToolSchema,
    toIntent: (input) =>
      asString(input.scope) === "due_week"
        ? { type: "job_list_due_week" }
        : asString(input.scope) === "last_30"
          ? { type: "job_list_last_30" }
          : { type: "job_list_active" },
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "list_jobs",
        entities: { scope: asString(input.scope) },
        executionIntent: intent
      }),
    clarificationIntent: "list_jobs",
    clarificationEntities: (input) => ({ scope: asString(input.scope) })
  },
  closeJob: {
    name: "closeJob",
    description: "Close one job by ID or close a customer's active jobs.",
    inputSchema: CloseJobToolSchema,
    toIntent: (input) =>
      asOptionalString(input.jobId)
        ? { type: "job_close", jobId: asString(input.jobId) }
        : { type: "job_close_customer", customerQuery: asString(input.customerQuery) },
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "update_job_status",
        entities: asOptionalString(input.jobId)
          ? { jobId: asString(input.jobId) }
          : { customerQuery: asString(input.customerQuery) },
        executionIntent: intent
      }),
    clarificationIntent: "update_job_status",
    clarificationEntities: (input) => ({
      jobId: asOptionalString(input.jobId),
      customerQuery: asOptionalString(input.customerQuery)
    })
  },
  recordPayment: {
    name: "recordPayment",
    description: "Record a payment against a job or a customer's latest outstanding job.",
    inputSchema: RecordPaymentToolSchema,
    toIntent: (input) => ({
      type: "payment_add",
      jobId: asOptionalString(input.jobId),
      customerName: asOptionalString(input.customerName),
      amountPence: asNumber(input.amountPence),
      method: asPaymentMethod(input.method),
      note: asOptionalString(input.note)
    }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "record_payment",
        entities: {
          jobId: asOptionalString(input.jobId),
          customerQuery: asOptionalString(input.customerName),
          customerName: asOptionalString(input.customerName),
          amountPence: asNumber(input.amountPence),
          method: asPaymentMethod(input.method),
          note: asOptionalString(input.note)
        },
        executionIntent: intent
      }),
    clarificationIntent: "record_payment",
    clarificationEntities: (input) => ({
      jobId: asOptionalString(input.jobId),
      customerQuery: asOptionalString(input.customerName),
      customerName: asOptionalString(input.customerName),
      amountPence: asOptionalNumber(input.amountPence)
    }),
    toPendingFlow: (input, missingFields) => ({
      intent: "record_payment",
      entities: {
        jobId: asOptionalString(input.jobId),
        customerQuery: asOptionalString(input.customerName),
        customerName: asOptionalString(input.customerName),
        amountPence: asOptionalNumber(input.amountPence),
        method: asPaymentMethod(input.method),
        note: asOptionalString(input.note)
      },
      missingFields
    })
  },
  listPayments: {
    name: "listPayments",
    description: "List recent payments for a given period.",
    inputSchema: ListPaymentsToolSchema,
    toIntent: (input) => ({ type: "payment_list", range: asPaymentRange(input.range) }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "list_payments",
        entities: asPaymentRange(input.range) ? { period: asPaymentRange(input.range) } : {},
        executionIntent: intent
      }),
    clarificationIntent: "list_payments",
    clarificationEntities: (input) => ({ range: asPaymentRange(input.range) })
  },
  recordExpense: {
    name: "recordExpense",
    description: "Record a business expense.",
    inputSchema: RecordExpenseToolSchema,
    toIntent: (input) => ({
      type: "expense_add",
      amountPence: asNumber(input.amountPence),
      note: asOptionalString(input.note),
      counterpartyName: asOptionalString(input.counterpartyName)
    }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "record_expense",
        entities: {
          amountPence: asNumber(input.amountPence),
          note: asOptionalString(input.note),
          counterpartyName: asOptionalString(input.counterpartyName)
        },
        executionIntent: intent
      }),
    clarificationIntent: "record_expense",
    clarificationEntities: (input) => ({
      amountPence: asOptionalNumber(input.amountPence),
      note: asOptionalString(input.note),
      counterpartyName: asOptionalString(input.counterpartyName)
    })
  },
  listExpenses: {
    name: "listExpenses",
    description: "List recent expenses as text.",
    inputSchema: ListExpensesToolSchema,
    toIntent: () => ({ type: "expense_list" }),
    toAnalysis: (_input, intent) =>
      createAnalysis({
        intent: "list_expenses",
        executionIntent: intent
      })
  },
  addVendorDebt: {
    name: "addVendorDebt",
    description: "Record a new supplier or vendor debt.",
    inputSchema: AddVendorDebtToolSchema,
    toIntent: (input) => ({
      type: "vendor_debt_add",
      vendorQuery: asString(input.vendorQuery),
      amountPence: asNumber(input.amountPence),
      note: asOptionalString(input.note)
    }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "record_vendor_debt",
        entities: {
          vendorQuery: asString(input.vendorQuery),
          amountPence: asNumber(input.amountPence),
          note: asOptionalString(input.note)
        },
        executionIntent: intent
      }),
    clarificationIntent: "record_vendor_debt",
    clarificationEntities: (input) => ({
      vendorQuery: asString(input.vendorQuery),
      amountPence: asOptionalNumber(input.amountPence)
    })
  },
  addVendorPayment: {
    name: "addVendorPayment",
    description: "Record a payment made to a supplier or vendor.",
    inputSchema: AddVendorPaymentToolSchema,
    toIntent: (input) => ({
      type: "vendor_payment_add",
      vendorQuery: asString(input.vendorQuery),
      amountPence: asNumber(input.amountPence),
      note: asOptionalString(input.note)
    }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "record_vendor_payment",
        entities: {
          vendorQuery: asString(input.vendorQuery),
          amountPence: asNumber(input.amountPence),
          note: asOptionalString(input.note)
        },
        executionIntent: intent
      }),
    clarificationIntent: "record_vendor_payment",
    clarificationEntities: (input) => ({
      vendorQuery: asString(input.vendorQuery),
      amountPence: asOptionalNumber(input.amountPence)
    })
  },
  getVendorSummary: {
    name: "getVendorSummary",
    description: "Summarize supplier balances and spend.",
    inputSchema: GetVendorSummaryToolSchema,
    toIntent: (input) => ({
      type: "vendor_summary",
      days: asOptionalNumber(input.days)
    }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "vendor_summary",
        entities: asOptionalNumber(input.days) ? { days: asOptionalNumber(input.days) } : {},
        executionIntent: intent
      })
  },
  createInvoice: {
    name: "createInvoice",
    description: "Create an invoice PDF for a customer.",
    inputSchema: CreateInvoiceToolSchema,
    toIntent: (input) => ({
      type: "invoice_create",
      customerQuery: asString(input.customerQuery)
    }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "create_invoice",
        entities: { customerQuery: asString(input.customerQuery) },
        executionIntent: intent
      }),
    clarificationIntent: "create_invoice",
    clarificationEntities: (input) => ({ customerQuery: asString(input.customerQuery) }),
    toPendingFlow: (input, missingFields) => ({
      intent: "create_invoice",
      entities: { customerQuery: asString(input.customerQuery) },
      missingFields
    })
  },
  exportCustomerPdf: {
    name: "exportCustomerPdf",
    description: "Export a customer PDF or full customer records PDF.",
    inputSchema: ExportCustomerPdfToolSchema,
    toIntent: (input) => ({
      type: "export_pdf",
      customerQuery: asOptionalString(input.customerQuery)
    }),
    toAnalysis: (input, intent) =>
      createAnalysis({
        intent: "export_all_records",
        entities: asOptionalString(input.customerQuery) ? { customerQuery: asOptionalString(input.customerQuery) } : {},
        executionIntent: intent
      }),
    clarificationIntent: "export_all_records",
    clarificationEntities: (input) => ({ customerQuery: asOptionalString(input.customerQuery) })
  },
  exportExpensesPdf: {
    name: "exportExpensesPdf",
    description: "Export expenses as a PDF.",
    inputSchema: ExportExpensesPdfToolSchema,
    toIntent: () => ({ type: "export_expense_pdf" }),
    toAnalysis: (_input, intent) =>
      createAnalysis({
        intent: "export_expenses_pdf",
        executionIntent: intent
      })
  },
  exportAllData: {
    name: "exportAllData",
    description: "Export the full data set.",
    inputSchema: ExportAllDataToolSchema,
    toIntent: () => ({ type: "export_data" }),
    toAnalysis: (_input, intent) =>
      createAnalysis({
        intent: "export_all_records",
        executionIntent: intent
      })
  },
  getSummary7Days: {
    name: "getSummary7Days",
    description: "Get the 7 day financial summary.",
    inputSchema: GetSummaryToolSchema,
    toIntent: () => ({ type: "summary_7" }),
    toAnalysis: (_input, intent) =>
      createAnalysis({
        intent: "get_financial_summary",
        entities: { period: "week" },
        executionIntent: intent
      })
  },
  getSummary30Days: {
    name: "getSummary30Days",
    description: "Get the 30 day financial summary.",
    inputSchema: GetSummaryToolSchema,
    toIntent: () => ({ type: "summary_30" }),
    toAnalysis: (_input, intent) =>
      createAnalysis({
        intent: "get_financial_summary",
        entities: { period: "month" },
        executionIntent: intent
      })
  },
  planToday: {
    name: "planToday",
    description: "Build a practical plan for today's jobs, due-soon work, and overdue items.",
    inputSchema: PlanTodayToolSchema,
    toIntent: () => ({ type: "unknown" }),
    toAnalysis: () =>
      createAnalysis({
        intent: "unknown",
        confidence: 0.8,
        entities: {}
      })
  }
};

export const agentFirstToolList = Object.values(agentFirstToolDefinitions).map((tool) => ({
  name: tool.name,
  description: tool.description
}));

export const buildIntentFromAgentFirstToolCall = (
  toolName: AgentFirstToolName,
  rawInput: Record<string, unknown> | undefined
) => {
  const definition = agentFirstToolDefinitions[toolName];
  const parsed = definition.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error
    };
  }

  const intent = definition.toIntent(parsed.data);
  const analysis = definition.toAnalysis(parsed.data, intent);
  return {
    ok: true as const,
    intent,
    analysis
  };
};

export const buildPendingFlowFromAgentFirstClarification = (input: {
  toolName?: AgentFirstToolName;
  toolInput?: Record<string, unknown>;
  missingFields?: string[];
}) => {
  if (!input.toolName || !input.missingFields?.length) {
    return null;
  }

  const definition = agentFirstToolDefinitions[input.toolName];
  if (!definition.toPendingFlow) {
    return null;
  }

  return definition.toPendingFlow(input.toolInput ?? {}, input.missingFields);
};

export const formatToolValidationError = (toolName: AgentFirstToolName, rawInput: Record<string, unknown> | undefined) => {
  const definition = agentFirstToolDefinitions[toolName];
  const parsed = definition.inputSchema.safeParse(rawInput ?? {});
  if (parsed.success) {
    return null;
  }

  const issueFields = parsed.error.issues
    .map((issue) => issue.path.join("."))
    .filter(Boolean);
  const fallbackFields =
    toolName === "searchCustomers"
      ? ["customerQuery"]
      : toolName === "getCustomerAccount"
        ? ["customerQuery"]
        : toolName === "recordPayment"
          ? ["customerQuery"]
          : toolName === "closeJob"
            ? ["jobId"]
            : [];
  const missingFields = issueFields.length ? issueFields : fallbackFields;
  const semanticMissingFields = missingFields.map((field) => {
    if (field === "query") {
      return "customerQuery";
    }
    if (field === "name" && definition.clarificationIntent === "create_customer") {
      return "customerQuery";
    }
    return field;
  });
  const entities = definition.clarificationEntities ? definition.clarificationEntities(rawInput ?? {}) : {};
  const question =
    definition.clarificationIntent
      ? buildClarificationQuestion({
          intent: definition.clarificationIntent,
          entities,
          missingFields: semanticMissingFields
        })
      : undefined;

  return {
    question: question ?? "I need a bit more detail before I can do that safely.",
    missingFields: semanticMissingFields
  };
};
