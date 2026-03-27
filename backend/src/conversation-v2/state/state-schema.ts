// Defines persisted state and pending-flow schemas for Conversation V2.
import { z } from "zod";

export const workflowNameSchema = z.enum([
  "customer_records",
  "record_customer_payment",
  "list_payments",
  "expense_list",
  "vendor_summary",
  "export_records_pdf",
  "export_vendor_pdf",
  "export_expense_pdf",
  "create_invoice",
  "create_customer",
  "record_vendor_debt",
  "record_vendor_payment",
  "create_job",
  "update_job_status",
  "list_today_jobs",
  "record_expense",
  "daily_summary",
  "monthly_summary"
]);

export const pendingFlowStepSchema = z.enum([
  "slot_filling",
  "entity_resolution",
  "confirmation",
  "ready_to_execute"
]);

export const jobStatusSchema = z.enum(["active", "completed", "canceled"]);

export const recentRefsSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  vendorId: z.string().optional(),
  vendorName: z.string().optional(),
  jobId: z.string().optional(),
  jobTitle: z.string().optional()
});

export const entityCandidateSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["customer", "vendor", "job"])
});

export const entityResolutionResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("idle")
  }),
  z.object({
    status: z.literal("resolved"),
    resolvedIds: z
      .object({
        customerId: z.string().optional(),
        vendorId: z.string().optional(),
        jobId: z.string().optional()
      })
      .strict()
  }),
  z.object({
    status: z.literal("ambiguous"),
    resolvedIds: z
      .object({
        customerId: z.string().optional(),
        vendorId: z.string().optional(),
        jobId: z.string().optional()
      })
      .strict()
      .optional(),
    candidates: z.array(entityCandidateSchema).min(1),
    unresolvedQuery: z.string()
  }),
  z.object({
    status: z.literal("not_found"),
    unresolvedQuery: z.string()
  })
]);

export const confirmationStateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("confirm_duplicate_customer"),
    prompt: z.string(),
    payload: z.object({
      customerName: z.string(),
      matchedCustomerIds: z.array(z.string()).min(1)
    })
  }),
  z.object({
    type: z.literal("confirm_create_vendor_for_debt"),
    prompt: z.string(),
    payload: z.object({
      vendorName: z.string()
    })
  }),
  z.object({
    type: z.literal("confirm_cancel_job"),
    prompt: z.string(),
    payload: z.object({
      jobId: z.string().optional(),
      jobTitle: z.string().optional()
    })
  }),
  z.object({
    type: z.literal("custom"),
    prompt: z.string(),
    payload: z.record(z.string(), z.unknown()).optional()
  })
]);

export const createCustomerSlotsSchema = z
  .object({
    customer_name: z.string().min(1).optional(),
    customer_phone: z
      .string()
      .min(1)
      .optional()
      .refine(
        (value) => value === undefined || value.replace(/\D/g, "").length >= 7,
        "customer_phone must contain at least 7 digits"
      ),
    notes: z.string().min(1).optional()
  })
  .strict();

export const customerRecordsSlotsSchema = z
  .object({
    customer_query: z.string().min(1).optional()
  })
  .strict();

export const recordCustomerPaymentSlotsSchema = z
  .object({
    customer_query: z.string().min(1).optional(),
    amount_pence: z.number().int().positive("amount_pence must be greater than 0").optional(),
    method: z.enum(["cash", "bank", "card", "unknown"]).optional(),
    note: z.string().min(1).optional(),
    job_query: z.string().min(1).optional()
  })
  .strict();

export const listPaymentsSlotsSchema = z
  .object({
    range: z.enum(["today", "yesterday", "week", "month", "all"]).optional()
  })
  .strict();

export const expenseListSlotsSchema = z
  .object({
    range: z.enum(["today", "yesterday", "week", "all"]).optional()
  })
  .strict();

export const vendorSummarySlotsSchema = z
  .object({
    days: z.number().int().positive().max(365).optional()
  })
  .strict();

export const exportRecordsPdfSlotsSchema = z
  .object({
    customer_query: z.string().min(1).optional()
  })
  .strict();

export const exportVendorPdfSlotsSchema = z
  .object({
    vendor_query: z.string().min(1).optional()
  })
  .strict();

export const exportExpensePdfSlotsSchema = z.object({}).strict();

export const createInvoiceSlotsSchema = z
  .object({
    customer_query: z.string().min(1).optional()
  })
  .strict();

export const recordVendorDebtSlotsSchema = z
  .object({
    vendor_query: z.string().min(1).optional(),
    amount_pence: z.number().int().positive("amount_pence must be greater than 0").optional(),
    note: z.string().min(1).optional(),
    occurred_on: z.string().min(1).optional()
  })
  .strict();

export const recordVendorPaymentSlotsSchema = z
  .object({
    vendor_query: z.string().min(1).optional(),
    amount_pence: z.number().int().positive("amount_pence must be greater than 0").optional(),
    note: z.string().min(1).optional(),
    occurred_on: z.string().min(1).optional()
  })
  .strict();

export const createJobSlotsSchema = z
  .object({
    customer_query: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    total_pence: z.number().int().nonnegative().optional(),
    deposit_pence: z.number().int().nonnegative().optional(),
    due_date: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
    create_customer_if_missing: z.boolean().optional()
  })
  .strict()
  .refine(
    (value) =>
      value.deposit_pence === undefined ||
      value.total_pence === undefined ||
      value.deposit_pence <= value.total_pence,
    {
      message: "deposit_pence must be less than or equal to total_pence",
      path: ["deposit_pence"]
    }
  );

export const updateJobStatusSlotsSchema = z
  .object({
    job_query: z.string().min(1).optional(),
    status: jobStatusSchema.optional()
  })
  .strict();

export const listTodayJobsSlotsSchema = z
  .object({
    scope: z.literal("today").optional()
  })
  .strict();

export const recordExpenseSlotsSchema = z
  .object({
    amount_pence: z.number().int().nonnegative().optional(),
    category: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
    occurred_on: z.string().min(1).optional(),
    vendor_query: z.string().min(1).optional()
  })
  .strict();

export const dailySummarySlotsSchema = z
  .object({
    scope: z.literal("daily").optional()
  })
  .strict();

export const monthlySummarySlotsSchema = z
  .object({
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().min(2000).max(9999).optional()
  })
  .strict();

export const workflowSlotsSchemaMap = {
  customer_records: customerRecordsSlotsSchema,
  record_customer_payment: recordCustomerPaymentSlotsSchema,
  list_payments: listPaymentsSlotsSchema,
  expense_list: expenseListSlotsSchema,
  vendor_summary: vendorSummarySlotsSchema,
  export_records_pdf: exportRecordsPdfSlotsSchema,
  export_vendor_pdf: exportVendorPdfSlotsSchema,
  export_expense_pdf: exportExpensePdfSlotsSchema,
  create_invoice: createInvoiceSlotsSchema,
  create_customer: createCustomerSlotsSchema,
  record_vendor_debt: recordVendorDebtSlotsSchema,
  record_vendor_payment: recordVendorPaymentSlotsSchema,
  create_job: createJobSlotsSchema,
  update_job_status: updateJobStatusSlotsSchema,
  list_today_jobs: listTodayJobsSlotsSchema,
  record_expense: recordExpenseSlotsSchema,
  daily_summary: dailySummarySlotsSchema,
  monthly_summary: monthlySummarySlotsSchema
} as const;

const pendingFlowBaseSchema = z.object({
  id: z.string(),
  step: pendingFlowStepSchema,
  entityState: entityResolutionResultSchema,
  confirmationState: confirmationStateSchema.optional(),
  prompt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
  topicShiftPolicy: z.literal("allow_strong_shift"),
  sourceMessageId: z.string().optional()
});

export const pendingFlowSchema = z.discriminatedUnion("workflow", [
  pendingFlowBaseSchema.extend({
    workflow: z.literal("customer_records"),
    slots: customerRecordsSlotsSchema,
    missingSlots: z.array(z.enum(["customer_query"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("record_customer_payment"),
    slots: recordCustomerPaymentSlotsSchema,
    missingSlots: z.array(z.enum(["customer_query", "amount_pence", "method", "note", "job_query"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("list_payments"),
    slots: listPaymentsSlotsSchema,
    missingSlots: z.array(z.enum(["range"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("expense_list"),
    slots: expenseListSlotsSchema,
    missingSlots: z.array(z.enum(["range"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("vendor_summary"),
    slots: vendorSummarySlotsSchema,
    missingSlots: z.array(z.enum(["days"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("export_records_pdf"),
    slots: exportRecordsPdfSlotsSchema,
    missingSlots: z.array(z.enum(["customer_query"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("export_vendor_pdf"),
    slots: exportVendorPdfSlotsSchema,
    missingSlots: z.array(z.enum(["vendor_query"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("export_expense_pdf"),
    slots: exportExpensePdfSlotsSchema,
    missingSlots: z.array(z.never())
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("create_invoice"),
    slots: createInvoiceSlotsSchema,
    missingSlots: z.array(z.enum(["customer_query"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("create_customer"),
    slots: createCustomerSlotsSchema,
    missingSlots: z.array(z.enum(["customer_name", "customer_phone", "notes"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("record_vendor_debt"),
    slots: recordVendorDebtSlotsSchema,
    missingSlots: z.array(z.enum(["vendor_query", "amount_pence", "note", "occurred_on"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("record_vendor_payment"),
    slots: recordVendorPaymentSlotsSchema,
    missingSlots: z.array(z.enum(["vendor_query", "amount_pence", "note", "occurred_on"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("create_job"),
    slots: createJobSlotsSchema,
    missingSlots: z.array(
      z.enum(["customer_query", "title", "total_pence", "deposit_pence", "due_date", "notes"])
    )
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("update_job_status"),
    slots: updateJobStatusSlotsSchema,
    missingSlots: z.array(z.enum(["job_query", "status"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("list_today_jobs"),
    slots: listTodayJobsSlotsSchema,
    missingSlots: z.array(z.enum(["scope"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("record_expense"),
    slots: recordExpenseSlotsSchema,
    missingSlots: z.array(z.enum(["amount_pence", "category", "note", "occurred_on", "vendor_query"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("daily_summary"),
    slots: dailySummarySlotsSchema,
    missingSlots: z.array(z.enum(["scope"]))
  }),
  pendingFlowBaseSchema.extend({
    workflow: z.literal("monthly_summary"),
    slots: monthlySummarySlotsSchema,
    missingSlots: z.array(z.enum(["month", "year"]))
  })
]);

export const conversationStateV2Schema = z.object({
  userId: z.string(),
  channel: z.literal("whatsapp"),
  lastMessageAt: z.string(),
  recentRefs: recentRefsSchema,
  pendingFlow: pendingFlowSchema.optional(),
  lastCompletedWorkflow: workflowNameSchema.optional(),
  version: z.literal("v2")
});

export type WorkflowNameSchema = z.infer<typeof workflowNameSchema>;
export type PendingFlowStepSchema = z.infer<typeof pendingFlowStepSchema>;
export type RecentRefsSchema = z.infer<typeof recentRefsSchema>;
export type EntityResolutionResultSchema = z.infer<typeof entityResolutionResultSchema>;
export type ConfirmationStateSchema = z.infer<typeof confirmationStateSchema>;
export type CustomerRecordsSlotsSchema = z.infer<typeof customerRecordsSlotsSchema>;
export type RecordCustomerPaymentSlotsSchema = z.infer<typeof recordCustomerPaymentSlotsSchema>;
export type ListPaymentsSlotsSchema = z.infer<typeof listPaymentsSlotsSchema>;
export type ExpenseListSlotsSchema = z.infer<typeof expenseListSlotsSchema>;
export type VendorSummarySlotsSchema = z.infer<typeof vendorSummarySlotsSchema>;
export type ExportRecordsPdfSlotsSchema = z.infer<typeof exportRecordsPdfSlotsSchema>;
export type ExportVendorPdfSlotsSchema = z.infer<typeof exportVendorPdfSlotsSchema>;
export type ExportExpensePdfSlotsSchema = z.infer<typeof exportExpensePdfSlotsSchema>;
export type CreateInvoiceSlotsSchema = z.infer<typeof createInvoiceSlotsSchema>;
export type CreateCustomerSlotsSchema = z.infer<typeof createCustomerSlotsSchema>;
export type RecordVendorDebtSlotsSchema = z.infer<typeof recordVendorDebtSlotsSchema>;
export type RecordVendorPaymentSlotsSchema = z.infer<typeof recordVendorPaymentSlotsSchema>;
export type CreateJobSlotsSchema = z.infer<typeof createJobSlotsSchema>;
export type UpdateJobStatusSlotsSchema = z.infer<typeof updateJobStatusSlotsSchema>;
export type ListTodayJobsSlotsSchema = z.infer<typeof listTodayJobsSlotsSchema>;
export type RecordExpenseSlotsSchema = z.infer<typeof recordExpenseSlotsSchema>;
export type DailySummarySlotsSchema = z.infer<typeof dailySummarySlotsSchema>;
export type MonthlySummarySlotsSchema = z.infer<typeof monthlySummarySlotsSchema>;
export type PendingFlowSchema = z.infer<typeof pendingFlowSchema>;
export type ConversationStateV2Schema = z.infer<typeof conversationStateV2Schema>;
