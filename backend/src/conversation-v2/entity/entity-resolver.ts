import type { EntityResolutionResult, RecentRefs, WorkflowName } from "../engine/contracts";
import { CustomersService } from "../../services/customers.service";
import { JobsService } from "../../services/jobs.service";
import { VendorPaymentsService } from "../../services/vendor-payments.service";

export type EntityResolverResult = EntityResolutionResult;

const customersService = new CustomersService();
const jobsService = new JobsService();
const vendorPaymentsService = new VendorPaymentsService();

const isReferentialJobQuery = (value: string) =>
  /^(?:it|that|that one|this|this one|the job)$/i.test(value.trim());

const resolveCustomerEntity = async (input: {
  userId: string;
  customerQuery: string;
}): Promise<EntityResolverResult> => {
  const candidates = await customersService.listResolutionCandidates({
    userId: input.userId,
    query: input.customerQuery,
    take: 8
  });

  if (!candidates.length) {
    return {
      status: "not_found",
      unresolvedQuery: input.customerQuery
    };
  }

  if (candidates.length === 1) {
    return {
      status: "resolved",
      resolvedIds: {
        customerId: candidates[0].id
      }
    };
  }

  return {
    status: "ambiguous",
    unresolvedQuery: input.customerQuery,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.phone ? `${candidate.name} (${candidate.phone})` : candidate.name,
      type: "customer" as const
    }))
  };
};

const resolveVendorEntity = async (input: {
  userId: string;
  vendorQuery: string;
}): Promise<EntityResolverResult> => {
  const candidates = await vendorPaymentsService.resolveVendorByQuery({
    userId: input.userId,
    query: input.vendorQuery,
    take: 8
  });

  if (!candidates.length) {
    return {
      status: "not_found",
      unresolvedQuery: input.vendorQuery
    };
  }

  if (candidates.length === 1) {
    return {
      status: "resolved",
      resolvedIds: {
        vendorId: candidates[0].id
      }
    };
  }

  return {
    status: "ambiguous",
    unresolvedQuery: input.vendorQuery,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.vendorName,
      type: "vendor" as const
    }))
  };
};

const resolveJobEntity = async (input: {
  userId: string;
  jobQuery?: string;
  recentRefs: RecentRefs;
}): Promise<EntityResolverResult> => {
  const rawQuery = input.jobQuery?.trim();

  if (!rawQuery) {
    return {
      status: "idle"
    };
  }

  if (isReferentialJobQuery(rawQuery) && input.recentRefs.jobId) {
    return {
      status: "resolved",
      resolvedIds: {
        jobId: input.recentRefs.jobId
      }
    };
  }

  const candidates = await jobsService.listResolutionCandidates({
    userId: input.userId,
    query: rawQuery,
    take: 8
  });

  if (!candidates.length) {
    return {
      status: "not_found",
      unresolvedQuery: rawQuery
    };
  }

  if (candidates.length === 1) {
    return {
      status: "resolved",
      resolvedIds: {
        jobId: candidates[0].id
      }
    };
  }

  return {
    status: "ambiguous",
    unresolvedQuery: rawQuery,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      label: `${candidate.title} - ${candidate.customerName}`,
      type: "job" as const
    }))
  };
};

export const resolveWorkflowEntities = async (input: {
  userId: string;
  workflow: WorkflowName;
  slots: Record<string, unknown>;
  recentRefs: RecentRefs;
}): Promise<EntityResolverResult> => {
  switch (input.workflow) {
    case "create_customer":
    case "list_today_jobs":
    case "daily_summary":
    case "monthly_summary":
      return {
        status: "idle"
      };

    case "record_vendor_debt":
    case "record_vendor_payment": {
      const vendorQuery = typeof input.slots.vendor_query === "string" ? input.slots.vendor_query : undefined;
      if (!vendorQuery) {
        return {
          status: "idle"
        };
      }

      return resolveVendorEntity({
        userId: input.userId,
        vendorQuery
      });
    }

    case "create_job": {
      const customerQuery =
        typeof input.slots.customer_query === "string" ? input.slots.customer_query : undefined;
      if (!customerQuery) {
        return {
          status: "idle"
        };
      }

      return resolveCustomerEntity({
        userId: input.userId,
        customerQuery
      });
    }

    case "update_job_status":
      return resolveJobEntity({
        userId: input.userId,
        jobQuery: typeof input.slots.job_query === "string" ? input.slots.job_query : undefined,
        recentRefs: input.recentRefs
      });

    case "record_expense": {
      const vendorQuery = typeof input.slots.vendor_query === "string" ? input.slots.vendor_query : undefined;
      if (!vendorQuery) {
        return {
          status: "idle"
        };
      }

      return resolveVendorEntity({
        userId: input.userId,
        vendorQuery
      });
    }
  }
};
