import { JobsService } from "../../services/jobs.service";
import { resolveCustomerByName } from "../resolves/customerResolver";
import type { AppTool } from "./types";

type CloseCustomerJobsArgs = {
  customerQuery: string;
};

const jobsService = new JobsService();

export const closeCustomerJobsTool: AppTool<CloseCustomerJobsArgs> = {
  name: "close_customer_jobs",
  description: "Mark all active jobs for a customer as completed using the customer's name or phone number.",
  inputSchema: {
    type: "object",
    properties: {
      customerQuery: {
        type: "string",
        description: "Customer name or phone number"
      }
    },
    required: ["customerQuery"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const customerQuery = args.customerQuery?.trim();

    if (!customerQuery) {
      return {
        success: false,
        message: "Customer query is required."
      };
    }

    const match = await resolveCustomerByName({
      userId: ctx.userId,
      query: customerQuery
    });

    if (match.type === "not_found") {
      return {
        success: false,
        message: `No customer found for "${customerQuery}".`
      };
    }

    if (match.type === "multiple") {
      return {
        success: false,
        message: `Multiple customers matched "${customerQuery}".`,
        data: {
          matchType: "multiple",
          customers: match.customers
        }
      };
    }

    const closedCount = await jobsService.closeActiveJobsByCustomerId({
      userId: ctx.userId,
      customerId: match.customer.id
    });

    return {
      success: true,
      data: {
        customer: match.customer,
        closedCount
      }
    };
  }
};
