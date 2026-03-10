import { z } from "zod";

export const IntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("onboarding_submit"), businessName: z.string().min(1) }),
  z.object({
    type: z.literal("customer_create"),
    name: z.string().min(1),
    phone: z.string().optional(),
    notes: z.string().optional()
  }),
  z.object({
    type: z.literal("job_create"),
    customerName: z.string().min(1),
    customerPhone: z.string().optional(),
    title: z.string().min(1),
    totalPence: z.number().int().nonnegative(),
    depositPence: z.number().int().nonnegative().optional(),
    dueDate: z.date().optional(),
    notes: z.string().optional()
  }),
  z.object({ type: z.literal("job_list_active") }),
  z.object({ type: z.literal("job_list_due_week") }),
  z.object({ type: z.literal("job_list_last_30") }),
  z.object({ type: z.literal("job_close"), jobId: z.string().min(1) }),
  z.object({
    type: z.literal("job_set_status"),
    jobId: z.string().min(1),
    status: z.enum(["active", "completed", "canceled"])
  }),
  z.object({ type: z.literal("job_close_customer"), customerQuery: z.string().min(1) }),
  z.object({ type: z.literal("customer_find"), query: z.string().min(1) }),
  z.object({
    type: z.literal("customer_update_phone"),
    customerQuery: z.string().min(1),
    phone: z.string().min(4)
  }),
  z.object({ type: z.literal("briefing_toggle"), enabled: z.boolean() }),
  z.object({ type: z.literal("summary_today") }),
  z.object({ type: z.literal("summary_yesterday") }),
  z.object({ type: z.literal("summary_7") }),
  z.object({ type: z.literal("summary_30") }),
  z.object({ type: z.literal("expense_list") }),
  z.object({
    type: z.literal("expense_add"),
    amountPence: z.number().int().positive(),
    note: z.string().optional(),
    counterpartyName: z.string().optional()
  }),
  z.object({
    type: z.literal("expense_add_batch"),
    items: z
      .array(
        z.object({
          amountPence: z.number().int().positive(),
          note: z.string().optional(),
          counterpartyName: z.string().optional()
        })
      )
      .min(2)
      .max(10)
  }),
  z.object({
    type: z.literal("vendor_debt_add"),
    amountPence: z.number().int().positive(),
    vendorQuery: z.string().min(1),
    note: z.string().optional()
  }),
  z.object({
    type: z.literal("vendor_payment_add"),
    amountPence: z.number().int().positive(),
    vendorQuery: z.string().min(1),
    note: z.string().optional()
  }),
  z.object({ type: z.literal("vendor_summary"), days: z.number().int().positive().max(365).optional() }),
  z.object({ type: z.literal("export_data") }),
  z.object({ type: z.literal("export_pdf"), customerQuery: z.string().min(1).optional() }),
  z.object({ type: z.literal("export_vendor_pdf"), vendorQuery: z.string().min(1).optional() }),
  z.object({ type: z.literal("export_expense_pdf") }),
  z.object({ type: z.literal("invoice_create"), customerQuery: z.string().min(1).optional() }),
  z.object({ type: z.literal("subscribe") }),
  z.object({ type: z.literal("outstanding_list") }),
  z.object({
    type: z.literal("payment_list"),
    range: z.enum(["today", "yesterday", "week", "month", "all"]).optional()
  }),
  z.object({ type: z.literal("greeting") }),
  z.object({
    type: z.literal("payment_add"),
    jobId: z.string().optional(),
    customerName: z.string().optional(),
    amountPence: z.number().int().positive(),
    method: z.enum(["cash", "bank", "card", "unknown"]).optional(),
    note: z.string().optional()
  }),
  z.object({ type: z.literal("help") }),
  z.object({ type: z.literal("confirm_action") }),
  z.object({ type: z.literal("cancel_action") }),
  z.object({ type: z.literal("unknown") })
]);

export type ParsedIntent = z.infer<typeof IntentSchema>;

export const WriteIntentTypeSchema = z.enum([
  "customer_create",
  "job_create",
  "payment_add",
  "job_close",
  "job_set_status",
  "expense_add",
  "expense_add_batch",
  "vendor_debt_add",
  "vendor_payment_add"
]);
export type WriteIntentType = z.infer<typeof WriteIntentTypeSchema>;
