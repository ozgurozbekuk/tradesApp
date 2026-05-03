import { VendorPaymentsService } from "../../services/vendor-payments.service";
import type { AppTool } from "./types";

type AddExpenseArgs = {
  amountPence: number;
  note: string;
  counterpartyName?: string | null;
  occurredAt?: string | null;
};

const vendorPaymentsService = new VendorPaymentsService();

export const addExpenseTool: AppTool<AddExpenseArgs> = {
  name: "add_expense",
  description: "Record a paid expense with amount, note, optional supplier, and optional date.",
  inputSchema: {
    type: "object",
    properties: {
      amountPence: {
        type: "number",
        description: "Expense amount in pence"
      },
      note: {
        type: "string",
        description: "Expense note or description"
      },
      counterpartyName: {
        type: ["string", "null"],
        description: "Optional supplier or payee name"
      },
      occurredAt: {
        type: ["string", "null"],
        description: "Optional expense date in ISO format"
      }
    },
    required: ["amountPence", "note", "counterpartyName", "occurredAt"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const amountPence = args.amountPence;
    const note = args.note?.trim();
    const counterpartyName = args.counterpartyName?.trim();
    const occurredAtRaw = args.occurredAt?.trim();

    if (!Number.isFinite(amountPence) || amountPence <= 0 || !note) {
      return {
        success: false,
        message: "A valid expense amount and note are required."
      };
    }

    const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : undefined;
    if (occurredAtRaw && Number.isNaN(occurredAt?.getTime() ?? Number.NaN)) {
      return {
        success: false,
        message: "Expense date must be a valid date."
      };
    }

    try {
      const expense = await vendorPaymentsService.addExpensePaid({
        userId: ctx.userId,
        amountPence,
        note,
        counterpartyName,
        occurredAt
      });

      return {
        success: true,
        data: {
          expense
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Could not record the expense."
      };
    }
  }
};
