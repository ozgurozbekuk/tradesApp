// Decides when Conversation V2 must ask for explicit confirmation before acting.
import type { ConfirmationState, EntityResolutionResult, WorkflowName } from "../engine/contracts";
import { CustomersService } from "../../services/customers.service";

export type ConfirmationDecision =
  | { type: "none" }
  | { type: "required"; confirmation: ConfirmationState };

const customersService = new CustomersService();

const findLikelyDuplicateCustomerIds = async (input: {
  userId: string;
  customerName: string;
}): Promise<string[]> => {
  const candidates = await customersService.listResolutionCandidates({
    userId: input.userId,
    query: input.customerName,
    take: 8
  });

  const normalizedName = input.customerName.trim().toLowerCase();

  return candidates
    .filter((candidate) => candidate.name.trim().toLowerCase() === normalizedName)
    .map((candidate) => candidate.id);
};

export const resolveWorkflowConfirmation = async (input: {
  userId: string;
  workflow: WorkflowName;
  slots: Record<string, unknown>;
  entityState: EntityResolutionResult;
}): Promise<ConfirmationDecision> => {
  switch (input.workflow) {
    case "customer_records":
    case "record_customer_payment":
    case "list_payments":
    case "expense_list":
    case "vendor_summary":
    case "export_records_pdf":
    case "export_vendor_pdf":
    case "export_expense_pdf":
    case "create_invoice":
      return { type: "none" };

    case "create_customer": {
      const customerName =
        typeof input.slots.customer_name === "string" ? input.slots.customer_name.trim() : undefined;
      if (!customerName) {
        return { type: "none" };
      }

      const duplicateIds = await findLikelyDuplicateCustomerIds({
        userId: input.userId,
        customerName
      });

      if (duplicateIds.length === 0) {
        return { type: "none" };
      }

      return {
        type: "required",
        confirmation: {
          type: "confirm_duplicate_customer",
          prompt: `I found an existing customer named ${customerName}. Do you still want to create a new customer?`,
          payload: {
            customerName,
            matchedCustomerIds: duplicateIds
          }
        }
      };
    }

    case "record_vendor_debt": {
      if (input.entityState.status !== "not_found") {
        return { type: "none" };
      }

      const vendorName = typeof input.slots.vendor_query === "string" ? input.slots.vendor_query.trim() : undefined;
      if (!vendorName) {
        return { type: "none" };
      }

      return {
        type: "required",
        confirmation: {
          type: "confirm_create_vendor_for_debt",
          prompt: `Create vendor ${vendorName} and record the debt?`,
          payload: {
            vendorName
          }
        }
      };
    }

    case "update_job_status": {
      const status = typeof input.slots.status === "string" ? input.slots.status : undefined;
      if (status !== "canceled") {
        return { type: "none" };
      }

      return {
        type: "required",
        confirmation: {
          type: "confirm_cancel_job",
          prompt: input.slots.apply_to_all === true ? "Are you sure you want to cancel all jobs?" : "Are you sure you want to cancel this job?",
          payload: {
            jobId:
              input.entityState.status === "resolved" ? input.entityState.resolvedIds.jobId : undefined,
            jobTitle: typeof input.slots.job_query === "string" ? input.slots.job_query : undefined
          }
        }
      };
    }

    case "record_vendor_payment":
    case "create_job":
    case "list_today_jobs":
    case "record_expense":
    case "daily_summary":
    case "weekly_summary":
    case "monthly_summary":
      return { type: "none" };
  }
};
