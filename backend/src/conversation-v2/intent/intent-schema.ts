import { z } from "zod";
import { workflowNameSchema } from "../state/state-schema";

export const workflowIntentSchema = z.object({
  workflow: workflowNameSchema,
  confidence: z.enum(["high", "medium", "low"]),
  fields: z.record(z.string(), z.unknown())
});

export const unsupportedIntentSchema = z.object({
  workflow: z.literal("unsupported"),
  confidence: z.enum(["high", "medium", "low"]),
  fields: z.record(z.string(), z.unknown())
});

export type WorkflowIntentSchema = z.infer<typeof workflowIntentSchema>;
export type UnsupportedIntentSchema = z.infer<typeof unsupportedIntentSchema>;

