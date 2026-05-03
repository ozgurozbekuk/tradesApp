import { VendorPaymentsService } from "../../services/vendor-payments.service";
import type { AppTool } from "./types";

type AddVendorDebtArgs = {
  vendorName: string;
  amountPence: number;
  note?: string | null;
  occurredAt?: string | null;
};

const vendorPaymentsService = new VendorPaymentsService();

export const addVendorDebtTool: AppTool<AddVendorDebtArgs> = {
  name: "add_vendor_debt",
  description: "Add a new vendor debt and increase the vendor's outstanding balance.",
  inputSchema: {
    type: "object",
    properties: {
      vendorName: {
        type: "string",
        description: "Vendor name"
      },
      amountPence: {
        type: "number",
        description: "Debt amount in pence"
      },
      note: {
        type: ["string", "null"],
        description: "Optional debt note"
      },
      occurredAt: {
        type: ["string", "null"],
        description: "Optional transaction date in ISO format"
      }
    },
    required: ["vendorName", "amountPence", "note", "occurredAt"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const vendorName = args.vendorName?.trim();
    const amountPence = args.amountPence;
    const note = args.note?.trim();
    const occurredAtRaw = args.occurredAt?.trim();

    if (!vendorName || !Number.isFinite(amountPence) || amountPence <= 0) {
      return {
        success: false,
        message: "Vendor name and a valid debt amount are required."
      };
    }

    const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : undefined;
    if (occurredAtRaw && Number.isNaN(occurredAt?.getTime() ?? Number.NaN)) {
      return {
        success: false,
        message: "Transaction date must be a valid date."
      };
    }

    try {
      const ledger = await vendorPaymentsService.addVendorDebt({
        userId: ctx.userId,
        vendorName,
        amountPence,
        note,
        occurredAt
      });

      return {
        success: true,
        data: {
          vendor: ledger
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Could not add vendor debt."
      };
    }
  }
};
