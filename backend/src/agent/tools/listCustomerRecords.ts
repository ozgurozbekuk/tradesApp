import { CustomersService } from "../../services/customers.service";
import type { AppTool } from "./types";

type ListCustomerRecordsArgs = {
  query: string;
};

const customersService = new CustomersService();

export const listCustomerRecordsTool: AppTool<ListCustomerRecordsArgs> = {
  name: "list_customer_records",
  description: "List matching customer records with balances, recent jobs, and latest payment details.",
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

    const records = await customersService.findRecordsByName({
      userId: ctx.userId,
      query
    });

    if (records.length === 0) {
      return {
        success: false,
        message: `No customer records found for "${query}".`
      };
    }

    return {
      success: true,
      data: {
        count: records.length,
        customers: records.map((record) => ({
          id: record.id,
          name: record.name,
          phone: record.phone,
          activeJobs: record.activeJobs,
          outstandingPence: record.outstandingPence,
          lastPaymentPence: record.lastPaymentPence,
          lastPaymentAt: record.lastPaymentAt?.toISOString() ?? null,
          recentJobs: record.recentJobs.map((job) => ({
            title: job.title,
            status: job.status,
            dueDate: job.dueDate?.toISOString() ?? null
          }))
        }))
      }
    };
  }
};
