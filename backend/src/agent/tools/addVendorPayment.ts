import { VendorPaymentsService } from "../../services/vendor-payments.service";
import type { AppTool } from "./types";

type AddVendorPaymentArgs = {
  vendorQuery: string;
  amountPence: number;
  note?: string | null;
  occurredAt?: string | null;
};

const vendorPaymentsService = new VendorPaymentsService();

export const addVendorPaymentTool: AppTool<AddVendorPaymentArgs> = {
  name: "add_vendor_payment",
  description: "Record a payment to a vendor using the vendor name.",
  inputSchema: {
    type: "object",
    properties: {
      vendorQuery: {
        type: "string",
        description: "Vendor name"
      },
      amountPence: {
        type: "number",
        description: "Payment amount in pence"
      },
      note: {
        type: ["string", "null"],
        description: "Optional payment note"
      },
      occurredAt: {
        type: ["string", "null"],
        description: "Optional payment date in ISO format"
      }
    },
    required: ["vendorQuery", "amountPence", "note", "occurredAt"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const vendorQuery = args.vendorQuery?.trim();
    const amountPence = args.amountPence;
    const note = args.note?.trim();
    const occurredAtRaw = args.occurredAt?.trim();

    if (!vendorQuery || !Number.isFinite(amountPence) || amountPence <= 0) {
      return {
        success: false,
        message: "Vendor and a valid payment amount are required."
      };
    }

    const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : undefined;
    if (occurredAtRaw && Number.isNaN(occurredAt?.getTime() ?? Number.NaN)) {
      return {
        success: false,
        message: "Payment date must be a valid date."
      };
    }

    const candidates = await vendorPaymentsService.resolveVendorByQuery({
      userId: ctx.userId,
      query: vendorQuery,
      take: 8
    });

    if (candidates.length === 0) {
      return {
        success: false,
        message: `No vendor found for "${vendorQuery}".`
      };
    }

    if (candidates.length > 1) {
      return {
        success: false,
        message: `Multiple vendors matched "${vendorQuery}".`,
        data: {
          matchType: "multiple",
          vendors: candidates
        }
      };
    }

    try {
      const vendor = await vendorPaymentsService.addVendorPaymentByVendorId({
        userId: ctx.userId,
        vendorId: candidates[0].id,
        amountPence,
        note,
        occurredAt
      });

      return {
        success: true,
        data: {
          vendor
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Could not record vendor payment."
      };
    }
  }
};
