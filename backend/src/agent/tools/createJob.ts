import { resolveCustomerByName } from "../resolves/customerResolver";
import { JobsService } from "../../services/jobs.service";
import type { AppTool } from "./types";

type CreateJobArgs = {
  customerQuery: string;
  title: string;
  priceTotalPence: number;
  depositPence?: number | null;
  dueDate?: string | null;
  notes?: string | null;
};

const jobsService = new JobsService();

export const createJobTool: AppTool<CreateJobArgs> = {
  name: "create_job",
  description: "Create a job for an existing customer using the customer's name or phone number.",
  inputSchema: {
    type: "object",
    properties: {
      customerQuery: {
        type: "string",
        description: "Existing customer name or phone number"
      },
      title: {
        type: "string",
        description: "Job title or short description"
      },
      priceTotalPence: {
        type: "number",
        description: "Total job amount in pence"
      },
      depositPence: {
        type: ["number", "null"],
        description: "Optional deposit amount in pence"
      },
      dueDate: {
        type: ["string", "null"],
        description: "Optional due date in ISO format"
      },
      notes: {
        type: ["string", "null"],
        description: "Optional job notes"
      }
    },
    required: ["customerQuery", "title", "priceTotalPence", "depositPence", "dueDate", "notes"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const customerQuery = args.customerQuery?.trim();
    const title = args.title?.trim();
    const priceTotalPence = args.priceTotalPence;
    const depositPence = args.depositPence ?? 0;
    const dueDateRaw = args.dueDate?.trim();
    const notes = args.notes?.trim();

    if (!customerQuery || !title) {
      return {
        success: false,
        message: "Customer and job title are required."
      };
    }

    if (!Number.isFinite(priceTotalPence) || priceTotalPence < 0) {
      return {
        success: false,
        message: "A valid total job amount is required."
      };
    }

    if (!Number.isFinite(depositPence) || depositPence < 0) {
      return {
        success: false,
        message: "Deposit must be a valid non-negative amount."
      };
    }

    if (depositPence > priceTotalPence) {
      return {
        success: false,
        message: "Deposit cannot exceed the total job amount."
      };
    }

    const dueDate = dueDateRaw ? new Date(dueDateRaw) : undefined;
    if (dueDateRaw && (!dueDate || Number.isNaN(dueDate.getTime()))) {
      return {
        success: false,
        message: "Due date must be a valid date."
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

    try {
      const { job, customer } = await jobsService.createJobForCustomerId({
        userId: ctx.userId,
        customerId: match.customer.id,
        title,
        priceTotalPence,
        depositPence,
        dueDate,
        notes
      });

      return {
        success: true,
        data: {
          customer: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone
          },
          job: {
            id: job.id,
            title: job.title,
            priceTotalPence: job.priceTotalPence,
            depositPence: job.depositPence ?? 0,
            dueDate: job.dueDate?.toISOString() ?? null,
            status: job.status
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Could not create the job."
      };
    }
  }
};
