import { ExportService } from "../../services/export.service";
import { resolveCustomerByName } from "../resolves/customerResolver";
import type { AppTool } from "./types";

type ExportCustomerRecordArgs = {
  query: string;
};

const exportService = new ExportService();

export const exportCustomerRecordTool: AppTool<ExportCustomerRecordArgs> = {
  name: "export_customer_record",
  description: "Generate a PDF of a customer's full record using the customer's name or phone number.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Customer name or phone number"
      }
    },
    required: ["query"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const query = args.query?.trim();

    if (!query) {
      return {
        success: false,
        message: "Customer query is required."
      };
    }

    const result = await resolveCustomerByName({
      userId: ctx.userId,
      query
    });

    if (result.type === "not_found") {
      return {
        success: false,
        message: `No customer found for "${query}".`
      };
    }

    if (result.type === "multiple") {
      return {
        success: false,
        message: `Multiple customers matched "${query}".`,
        data: {
          matchType: "multiple",
          customers: result.customers
        }
      };
    }

    const token = exportService.createPdfAccessToken({
      userId: ctx.userId,
      customerId: result.customer.id
    });

    const mediaUrl = exportService.createPdfDownloadLink(token);

    return {
      success: true,
      message: `Customer record PDF is ready for ${result.customer.name}.`,
      data: {
        matchType: "single",
        customerId: result.customer.id,
        customerName: result.customer.name
      },
      attachment: {
        type: "pdf",
        mediaUrl,
        filename: `records-${result.customer.name}.pdf`
      }
    };
  }
};
