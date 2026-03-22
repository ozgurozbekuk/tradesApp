import type { EntityResolutionResult, RecentRefs, WorkflowName } from "../engine/contracts";
import { CustomersService } from "../../services/customers.service";
import { JobsService } from "../../services/jobs.service";
import { VendorPaymentsService } from "../../services/vendor-payments.service";

export type EntityResolverResult = EntityResolutionResult;

const customersService = new CustomersService();
const jobsService = new JobsService();
const vendorPaymentsService = new VendorPaymentsService();

const buildCandidateLabels = <
  TCandidate extends {
    id: string;
    name?: string;
    phone?: string | null;
    createdAt?: Date;
    balancePence?: number;
    vendorName?: string;
    title?: string;
    customerName?: string;
    dueDate?: Date | null;
    outstandingPence?: number;
  }
>(
  candidates: TCandidate[],
  type: "customer" | "vendor" | "job"
) => {
  const formatDate = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : undefined);

  const labels = candidates.map((candidate, index) => {
    if (type === "customer") {
      const name = String(candidate.name ?? "").trim() || `Customer ${index + 1}`;
      if (candidate.phone) {
        return `${name} (${candidate.phone})`;
      }

      if (candidate.createdAt) {
        return `${name} - added ${formatDate(candidate.createdAt)}`;
      }

      return `${name} - option ${index + 1}`;
    }

    if (type === "vendor") {
      const vendorName = String(candidate.vendorName ?? "").trim() || `Vendor ${index + 1}`;
      if (typeof candidate.balancePence === "number") {
        return `${vendorName} - balance £${(candidate.balancePence / 100).toFixed(2)}`;
      }

      return `${vendorName} - option ${index + 1}`;
    }

    const title = String(candidate.title ?? "").trim() || `Job ${index + 1}`;
    const customerName = String(candidate.customerName ?? "").trim() || "Unknown customer";
    const dueDate = formatDate(candidate.dueDate);
    const outstanding =
      typeof candidate.outstandingPence === "number"
        ? ` - outstanding £${(candidate.outstandingPence / 100).toFixed(2)}`
        : "";

    return dueDate
      ? `${title} - ${customerName}${outstanding} - due ${dueDate}`
      : `${title} - ${customerName}${outstanding}`;
  });
  return labels;
};

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
    candidates: candidates.map((candidate, index) => ({
      id: candidate.id,
      label: buildCandidateLabels(candidates, "customer")[index],
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
    candidates: candidates.map((candidate, index) => ({
      id: candidate.id,
      label: buildCandidateLabels(candidates, "vendor")[index],
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
    candidates: candidates.map((candidate, index) => ({
      id: candidate.id,
      label: buildCandidateLabels(candidates, "job")[index],
      type: "job" as const
    }))
  };
};

const normalizeEntityQuery = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const scoreOutstandingJobMatch = (query: string, candidate: { title: string }) => {
  const normalizedQuery = normalizeEntityQuery(query);
  const normalizedTitle = normalizeEntityQuery(candidate.title);
  if (!normalizedQuery || !normalizedTitle) {
    return 0;
  }

  if (normalizedQuery === normalizedTitle) {
    return 1000;
  }

  if (normalizedTitle.startsWith(normalizedQuery)) {
    return 850;
  }

  if (normalizedTitle.includes(normalizedQuery)) {
    return 700;
  }

  const queryTokens = normalizedQuery.split(" ");
  const titleTokens = normalizedTitle.split(" ");
  return queryTokens.filter((token) => titleTokens.some((titleToken) => titleToken.startsWith(token))).length * 120;
};

const resolveCustomerPaymentEntity = async (input: {
  userId: string;
  customerQuery?: string;
  jobQuery?: string;
  recentRefs: RecentRefs;
}): Promise<EntityResolverResult> => {
  const customerQuery = input.customerQuery?.trim();
  if (!customerQuery) {
    return {
      status: "idle"
    };
  }

  const customerResolution = await resolveCustomerEntity({
    userId: input.userId,
    customerQuery
  });

  if (customerResolution.status !== "resolved") {
    return customerResolution;
  }

  const customerId = customerResolution.resolvedIds.customerId;
  if (!customerId) {
    return {
      status: "idle"
    };
  }

  const outstandingJobs = await jobsService.findOutstandingJobsByCustomerId({
    userId: input.userId,
    customerId
  });

  if (outstandingJobs.length === 0) {
    return {
      status: "not_found",
      unresolvedQuery: customerQuery
    };
  }

  const rawJobQuery = input.jobQuery?.trim();
  if (rawJobQuery) {
    if (isReferentialJobQuery(rawJobQuery) && input.recentRefs.jobId) {
      return {
        status: "resolved",
        resolvedIds: {
          customerId,
          jobId: input.recentRefs.jobId
        }
      };
    }

    const scored = outstandingJobs
      .map((job) => ({
        ...job,
        score: scoreOutstandingJobMatch(rawJobQuery, job)
      }))
      .filter((job) => job.score >= 180)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        status: "not_found",
        unresolvedQuery: rawJobQuery
      };
    }

    if (scored.length === 1 || (scored[0].score >= 930 && (scored[1]?.score ?? 0) < scored[0].score - 180)) {
      return {
        status: "resolved",
        resolvedIds: {
          customerId,
          jobId: scored[0].id
        }
      };
    }

    return {
      status: "ambiguous",
      resolvedIds: {
        customerId
      },
      unresolvedQuery: rawJobQuery,
      candidates: scored.slice(0, 5).map((candidate, index, candidates) => ({
        id: candidate.id,
        label: buildCandidateLabels(candidates, "job")[index],
        type: "job" as const
      }))
    };
  }

  if (outstandingJobs.length === 1) {
    return {
      status: "resolved",
      resolvedIds: {
        customerId,
        jobId: outstandingJobs[0].id
      }
    };
  }

  return {
    status: "ambiguous",
    resolvedIds: {
      customerId
    },
    unresolvedQuery: customerQuery,
    candidates: outstandingJobs.slice(0, 5).map((candidate, index, candidates) => ({
      id: candidate.id,
      label: buildCandidateLabels(candidates, "job")[index],
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
    case "customer_records": {
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

    case "export_records_pdf": {
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

    case "create_invoice": {
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

    case "export_vendor_pdf": {
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

    case "export_expense_pdf":
      return {
        status: "idle"
      };

    case "record_customer_payment":
      return resolveCustomerPaymentEntity({
        userId: input.userId,
        customerQuery:
          typeof input.slots.customer_query === "string" ? input.slots.customer_query : undefined,
        jobQuery: typeof input.slots.job_query === "string" ? input.slots.job_query : undefined,
        recentRefs: input.recentRefs
      });

    case "create_customer":
    case "expense_list":
    case "vendor_summary":
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
