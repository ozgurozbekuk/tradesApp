import { PaymentMethod } from "@prisma/client";
import { JobsService } from "../../services/jobs.service";
import { PaymentsService } from "../../services/payments.service";
import type { AppTool } from "./types";

type AddPaymentArgs = {
  jobQuery: string;
  amountPence: number;
  method?: PaymentMethod | null;
  note?: string | null;
};

const jobsService = new JobsService();
const paymentsService = new PaymentsService();

export const addPaymentTool: AppTool<AddPaymentArgs> = {
  name: "add_payment",
  description: "Add a payment to an outstanding job using the job title or customer name.",
  inputSchema: {
    type: "object",
    properties: {
      jobQuery: {
        type: "string",
        description: "Job title or customer name for the outstanding job"
      },
      amountPence: {
        type: "number",
        description: "Payment amount in pence"
      },
      method: {
        type: ["string", "null"],
        description: "Payment method: cash, bank, card, or unknown",
        enum: ["cash", "bank", "card", "unknown", null]
      },
      note: {
        type: ["string", "null"],
        description: "Optional payment note"
      }
    },
    required: ["jobQuery", "amountPence", "method", "note"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const jobQuery = args.jobQuery?.trim();
    const amountPence = args.amountPence;
    const method = args.method ?? PaymentMethod.unknown;
    const note = args.note?.trim();

    if (!jobQuery || !Number.isFinite(amountPence) || amountPence <= 0) {
      return {
        success: false,
        message: "Job query and a valid payment amount are required."
      };
    }

    const candidates = await jobsService.listResolutionCandidates({
      userId: ctx.userId,
      query: jobQuery,
      outstandingOnly: true,
      take: 8
    });

    if (candidates.length === 0) {
      return {
        success: false,
        message: `No outstanding job found for "${jobQuery}".`
      };
    }

    if (candidates.length > 1) {
      return {
        success: false,
        message: `Multiple outstanding jobs matched "${jobQuery}".`,
        data: {
          matchType: "multiple",
          jobs: candidates
        }
      };
    }

    try {
      const result = await paymentsService.addPayment({
        userId: ctx.userId,
        jobId: candidates[0].id,
        amountPence,
        method,
        note
      });

      return {
        success: true,
        data: {
          job: candidates[0],
          payment: {
            id: result.payment.id,
            amountPence: result.payment.amountPence,
            method: result.payment.method,
            paidAt: result.payment.paidAt.toISOString(),
            note: result.payment.note ?? null
          },
          outstandingPence: result.outstandingPence
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Could not add the payment."
      };
    }
  }
};
