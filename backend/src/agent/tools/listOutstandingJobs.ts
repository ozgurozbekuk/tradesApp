import { JobsService } from "../../services/jobs.service";
import { resolveCustomerByName } from "../resolves/customerResolver";
import type { AppTool } from "./types";

type ListOutstandingJobsArgs = {
  customerQuery?: string | null;
};

const jobsService = new JobsService();

export const listOutstandingJobsTool: AppTool<ListOutstandingJobsArgs> = {
  name: "list_outstanding_jobs",
  description: "List outstanding jobs, optionally filtered to a single customer.",
  inputSchema: {
    type: "object",
    properties: {
      customerQuery: {
        type: ["string", "null"],
        description: "Optional customer name or phone number to filter outstanding jobs"
      }
    },
    required: ["customerQuery"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const customerQuery = args.customerQuery?.trim();

    if (!customerQuery) {
      const jobs = await jobsService.listOutstandingJobs(ctx.userId);
      return {
        success: true,
        data: {
          count: jobs.length,
          jobs: jobs.map((job) => ({
            id: job.id,
            title: job.title,
            customerName: job.customerName,
            dueDate: job.dueDate?.toISOString() ?? null,
            priceTotalPence: job.priceTotalPence,
            paidPence: job.paidPence,
            outstandingPence: job.outstandingPence
          }))
        }
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

    const jobs = await jobsService.findOutstandingJobsByCustomerId({
      userId: ctx.userId,
      customerId: match.customer.id
    });

    return {
      success: true,
      data: {
        customer: match.customer,
        count: jobs.length,
        jobs
      }
    };
  }
};
