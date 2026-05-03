import { CustomersService } from "../../services/customers.service";
import { JobsService } from "../../services/jobs.service";
import type { AppTool } from "./types";

type AddCustomerArgs = {
  name: string;
  phone?: string;
  notes?: string;
  jobTitle?: string;
  amountPence?: number;
  depositPence?: number;
  dueDate?: string;
};

const customersService = new CustomersService();
const jobsService = new JobsService();

export const addCustomerTool: AppTool<AddCustomerArgs> = {
  name: "add_customer",
  description:
    "Create a new customer record. Optionally also create their first job with title, amount, deposit, and due date.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Customer full name"
      },
      phone: {
        type: ["string", "null"],
        description: "Customer phone number, if provided"
      },
      notes: {
        type: ["string", "null"],
        description: "Optional notes about the customer"
      },
      jobTitle: {
        type: ["string", "null"],
        description: "Optional first job title for the customer"
      },
      amountPence: {
        type: ["number", "null"],
        description: "Optional total job amount in pence, for example 30000 for 300.00"
      },
      depositPence: {
        type: ["number", "null"],
        description: "Optional job deposit in pence, for example 10000 for 100.00"
      },
      dueDate: {
        type: ["string", "null"],
        description: "Optional due date in ISO format if the first job should have one"
      }
    },
    required: ["name", "phone", "notes", "jobTitle", "amountPence", "depositPence", "dueDate"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const name = args.name?.trim();
    const phone = args.phone?.trim();
    const notes = args.notes?.trim();
    const jobTitle = args.jobTitle?.trim();
    const amountPence = args.amountPence;
    const depositPence = args.depositPence ?? 0;
    const dueDateRaw = args.dueDate?.trim();

    if (!name) {
      return {
        success: false,
        message: "Customer name is required."
      };
    }

    if (jobTitle && (!Number.isFinite(amountPence) || (amountPence ?? 0) < 0)) {
      return {
        success: false,
        message: "A valid job amount is required when creating a job."
      };
    }

    if (!jobTitle && (amountPence !== undefined || args.depositPence !== undefined || dueDateRaw)) {
      return {
        success: false,
        message: "Job title is required when job details are provided."
      };
    }

    if (!Number.isFinite(depositPence) || depositPence < 0) {
      return {
        success: false,
        message: "Deposit must be a valid non-negative amount."
      };
    }

    if (jobTitle && depositPence > (amountPence ?? 0)) {
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

    try {
      const customer = await customersService.createCustomer({
        userId: ctx.userId,
        name,
        phone,
        notes
      });

      if (jobTitle) {
        const { job } = await jobsService.createJobForCustomerId({
          userId: ctx.userId,
          customerId: customer.id,
          title: jobTitle,
          priceTotalPence: amountPence ?? 0,
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
              phone: customer.phone,
              notes: customer.notes
            },
            job: {
              id: job.id,
              title: job.title,
              priceTotalPence: job.priceTotalPence,
              depositPence: job.depositPence ?? 0,
              dueDate: job.dueDate?.toISOString() ?? null
            }
          }
        };
      }

      return {
        success: true,
        data: {
          customer: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            notes: customer.notes
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Could not create customer."
      };
    }
  }
};
