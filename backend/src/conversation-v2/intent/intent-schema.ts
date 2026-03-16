import { z } from "zod";
import {
  createCustomerSlotsSchema,
  createJobSlotsSchema,
  dailySummarySlotsSchema,
  listTodayJobsSlotsSchema,
  monthlySummarySlotsSchema,
  recordExpenseSlotsSchema,
  recordVendorDebtSlotsSchema,
  recordVendorPaymentSlotsSchema,
  updateJobStatusSlotsSchema
} from "../state/state-schema";

const intentBaseSchema = z.object({
  confidence: z.enum(["high", "medium", "low"])
});

export const workflowIntentSchema = z.discriminatedUnion("workflow", [
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
