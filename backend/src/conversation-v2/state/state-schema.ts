import { z } from "zod";

export const workflowNameSchema = z.enum([
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

export const recentRefsSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  vendorId: z.string().optional(),
  vendorName: z.string().optional(),
  jobId: z.string().optional(),
  jobTitle: z.string().optional()
});

export const pendingFlowSchema = z.object({
  id: z.string(),
  workflow: workflowNameSchema,
  step: pendingFlowStepSchema,
  slots: z.record(z.string(), z.unknown()),
  missingSlots: z.array(z.string()),
  entityState: z.object({
    status: z.enum(["idle", "resolved", "ambiguous", "not_found"]),
    resolvedIds: z
      .object({
        customerId: z.string().optional(),
        vendorId: z.string().optional(),
        jobId: z.string().optional()
      })
      .optional(),
    candidates: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          type: z.enum(["customer", "vendor", "job"])
        })
      )
      .optional(),
    unresolvedQuery: z.string().optional()
  }),
  confirmationState: z
    .object({
      type: z.string(),
      prompt: z.string(),
      payload: z.record(z.string(), z.unknown()).optional()
    })
    .optional(),
  prompt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
  topicShiftPolicy: z.literal("allow_strong_shift"),
  sourceMessageId: z.string().optional()
});

export const conversationStateV2Schema = z.object({
  userId: z.string(),
  channel: z.literal("whatsapp"),
  lastMessageAt: z.string(),
  recentRefs: recentRefsSchema,
  pendingFlow: pendingFlowSchema.optional(),
  lastCompletedWorkflow: workflowNameSchema.optional(),
  version: z.literal("v2")
});

export type ConversationStateV2Schema = z.infer<typeof conversationStateV2Schema>;

