// Defines the typed schema for supported Conversation V2 intents.
import { z } from "zod";
import {
  customerRecordsSlotsSchema,
  createCustomerSlotsSchema,
  createInvoiceSlotsSchema,
  createJobSlotsSchema,
  dailySummarySlotsSchema,
  expenseListSlotsSchema,
  exportExpensePdfSlotsSchema,
  exportRecordsPdfSlotsSchema,
  exportVendorPdfSlotsSchema,
  listTodayJobsSlotsSchema,
  monthlySummarySlotsSchema,
  listPaymentsSlotsSchema,
  recordCustomerPaymentSlotsSchema,
  recordExpenseSlotsSchema,
  recordVendorDebtSlotsSchema,
  recordVendorPaymentSlotsSchema,
  updateJobStatusSlotsSchema,
  vendorSummarySlotsSchema,
  weeklySummarySlotsSchema
} from "../state/state-schema";

const intentBaseSchema = z.object({
  confidence: z.enum(["high", "medium", "low"])
});

export const workflowIntentSchema = z.discriminatedUnion("workflow", [
  intentBaseSchema.extend({
    workflow: z.literal("customer_records"),
    fields: customerRecordsSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("record_customer_payment"),
    fields: recordCustomerPaymentSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("list_payments"),
    fields: listPaymentsSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("expense_list"),
    fields: expenseListSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("vendor_summary"),
    fields: vendorSummarySlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("export_records_pdf"),
    fields: exportRecordsPdfSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("export_vendor_pdf"),
    fields: exportVendorPdfSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("export_expense_pdf"),
    fields: exportExpensePdfSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("create_invoice"),
    fields: createInvoiceSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("create_customer"),
    fields: createCustomerSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("record_vendor_debt"),
    fields: recordVendorDebtSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("record_vendor_payment"),
    fields: recordVendorPaymentSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("create_job"),
    fields: createJobSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("update_job_status"),
    fields: updateJobStatusSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("list_today_jobs"),
    fields: listTodayJobsSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("record_expense"),
    fields: recordExpenseSlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("daily_summary"),
    fields: dailySummarySlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("weekly_summary"),
    fields: weeklySummarySlotsSchema
  }),
  intentBaseSchema.extend({
    workflow: z.literal("monthly_summary"),
    fields: monthlySummarySlotsSchema
  })
]);

export const unsupportedIntentSchema = z.object({
  workflow: z.literal("unsupported"),
  confidence: z.enum(["high", "medium", "low"]),
  fields: z.record(z.string(), z.unknown())
});

export type WorkflowIntentSchema = z.infer<typeof workflowIntentSchema>;
export type UnsupportedIntentSchema = z.infer<typeof unsupportedIntentSchema>;
