import { z } from "zod";

export const CreateJobToolSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  title: z.string().min(1),
  totalPence: z.number().int().nonnegative(),
  depositPence: z.number().int().nonnegative().optional(),
  dueDate: z.date().optional(),
  notes: z.string().optional()
});

export const AddPaymentToolSchema = z.object({
  jobId: z.string().min(1),
  amountPence: z.number().int().positive(),
  method: z.enum(["cash", "bank", "card", "unknown"]).optional(),
  note: z.string().optional()
});

export const FindCustomerToolSchema = z.object({
  query: z.string().min(1)
});

export const CloseJobToolSchema = z.object({
  jobId: z.string().min(1)
});

export const SummaryToolSchema = z.object({
  period: z.enum(["today", "yesterday", "7d", "30d"])
});

export const ToggleBriefingToolSchema = z.object({
  enabled: z.boolean()
});
