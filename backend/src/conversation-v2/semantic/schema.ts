import { z } from "zod";
import { workflowNameSchema } from "../state/state-schema";
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

export const semanticModeSchema = z.enum(["fresh", "continue_pending"]);
export const semanticConfidenceSchema = z.enum(["high", "medium", "low"]);

export const semanticDelegateCapabilitySchema = z.enum([
  "customer_lookup",
  "customer_payment",
  "booking_create",
  "job_list_extended",
  "expense_list",
  "vendor_summary",
  "export_pdf",
  "invoice_create",
  "briefing_toggle",
  "unknown_v1_capability"
]);

const workflowMissingFieldSchemaMap = {
  create_customer: z.array(z.enum(["customer_name", "customer_phone", "notes"])).optional(),
  record_vendor_debt: z.array(z.enum(["vendor_query", "amount_pence", "note", "occurred_on"])).optional(),
  record_vendor_payment: z.array(z.enum(["vendor_query", "amount_pence", "note", "occurred_on"])).optional(),
  create_job: z
    .array(z.enum(["customer_query", "title", "total_pence", "deposit_pence", "due_date", "notes"]))
    .optional(),
  update_job_status: z.array(z.enum(["job_query", "status"])).optional(),
  list_today_jobs: z.array(z.enum(["scope"])).optional(),
  record_expense: z.array(z.enum(["amount_pence", "category", "note", "occurred_on", "vendor_query"])).optional(),
  daily_summary: z.array(z.enum(["scope"])).optional(),
  monthly_summary: z.array(z.enum(["month", "year"])).optional()
} as const;

const semanticWorkflowIntentBaseSchema = z.object({
  kind: z.literal("workflow_intent"),
  mode: semanticModeSchema,
  confidence: semanticConfidenceSchema,
  reasoning_summary: z.string().min(1).optional()
});

export const semanticWorkflowIntentSchema = z.discriminatedUnion("workflow", [
  semanticWorkflowIntentBaseSchema.extend({
    workflow: z.literal("create_customer"),
    fields: createCustomerSlotsSchema,
    missing_fields: workflowMissingFieldSchemaMap.create_customer
  }),
  semanticWorkflowIntentBaseSchema.extend({
    workflow: z.literal("record_vendor_debt"),
    fields: recordVendorDebtSlotsSchema,
    missing_fields: workflowMissingFieldSchemaMap.record_vendor_debt
  }),
  semanticWorkflowIntentBaseSchema.extend({
    workflow: z.literal("record_vendor_payment"),
    fields: recordVendorPaymentSlotsSchema,
    missing_fields: workflowMissingFieldSchemaMap.record_vendor_payment
  }),
  semanticWorkflowIntentBaseSchema.extend({
    workflow: z.literal("create_job"),
    fields: createJobSlotsSchema,
    missing_fields: workflowMissingFieldSchemaMap.create_job
  }),
  semanticWorkflowIntentBaseSchema.extend({
    workflow: z.literal("update_job_status"),
    fields: updateJobStatusSlotsSchema,
    missing_fields: workflowMissingFieldSchemaMap.update_job_status
  }),
  semanticWorkflowIntentBaseSchema.extend({
    workflow: z.literal("list_today_jobs"),
    fields: listTodayJobsSlotsSchema,
    missing_fields: workflowMissingFieldSchemaMap.list_today_jobs
  }),
  semanticWorkflowIntentBaseSchema.extend({
    workflow: z.literal("record_expense"),
    fields: recordExpenseSlotsSchema,
    missing_fields: workflowMissingFieldSchemaMap.record_expense
  }),
  semanticWorkflowIntentBaseSchema.extend({
    workflow: z.literal("daily_summary"),
    fields: dailySummarySlotsSchema,
    missing_fields: workflowMissingFieldSchemaMap.daily_summary
  }),
  semanticWorkflowIntentBaseSchema.extend({
    workflow: z.literal("monthly_summary"),
    fields: monthlySummarySlotsSchema,
    missing_fields: workflowMissingFieldSchemaMap.monthly_summary
  })
]);

export const semanticClarificationSchema = z
  .object({
    kind: z.literal("clarification"),
    question: z.string().min(1),
    workflow: workflowNameSchema.optional(),
    missing_fields: z.array(z.string().min(1)).optional(),
    reasoning_summary: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.workflow || !value.missing_fields) {
      return;
    }

    const schema = workflowMissingFieldSchemaMap[value.workflow];
    const result = schema.safeParse(value.missing_fields);
    if (result.success) {
      return;
    }

    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["missing_fields", ...(issue.path ?? [])],
        message: issue.message
      });
    }
  });

export const semanticDelegateToV1Schema = z.object({
  kind: z.literal("delegate_to_v1"),
  capability: semanticDelegateCapabilitySchema,
  reasoning_summary: z.string().min(1).optional()
});

export const semanticRespondSchema = z.object({
  kind: z.literal("respond"),
  message: z.string().min(1)
});

export const semanticUnknownSchema = z.object({
  kind: z.literal("unknown"),
  reason: z.string().min(1).optional()
});

export const semanticFrontDoorResultSchema = z.union([
  semanticWorkflowIntentSchema,
  semanticClarificationSchema,
  semanticDelegateToV1Schema,
  semanticRespondSchema,
  semanticUnknownSchema
]);

export type SemanticModeSchema = z.infer<typeof semanticModeSchema>;
export type SemanticConfidenceSchema = z.infer<typeof semanticConfidenceSchema>;
export type SemanticDelegateCapabilitySchema = z.infer<typeof semanticDelegateCapabilitySchema>;
export type SemanticWorkflowIntentSchema = z.infer<typeof semanticWorkflowIntentSchema>;
export type SemanticClarificationSchema = z.infer<typeof semanticClarificationSchema>;
export type SemanticDelegateToV1Schema = z.infer<typeof semanticDelegateToV1Schema>;
export type SemanticRespondSchema = z.infer<typeof semanticRespondSchema>;
export type SemanticUnknownSchema = z.infer<typeof semanticUnknownSchema>;
export type SemanticFrontDoorResultSchema = z.infer<typeof semanticFrontDoorResultSchema>;
