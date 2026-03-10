import type { ParsedUserIntent } from "../agent/agent-types";
import { IntentSchema, type ParsedIntent } from "../intents/schemas";
import { VendorPaymentsService } from "../../services/vendor-payments.service";
import { buildSemanticClarification } from "./clarification";
import type {
  SemanticCapabilityName,
  SemanticDecision,
  StructuredClarificationReason
} from "./types";

const vendorPaymentsService = new VendorPaymentsService();

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const asOptionalString = (value: unknown) => {
  const text = asString(value);
  return text || undefined;
};
const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const asBoolean = (value: unknown) => (typeof value === "boolean" ? value : undefined);
const looksLikeConcreteJobId = (value: unknown) => typeof value === "string" && /^[a-z0-9-]{8,}$/i.test(value.trim());

type CapabilityPolicy = {
  requiresResolvedCustomer?: boolean;
  requiresResolvedJob?: boolean;
  requiresResolvedVendor?: boolean;
  destructive: boolean;
  allowPartialName: boolean;
  searchFirst: boolean;
};

export const capabilityPolicies: Record<Exclude<SemanticCapabilityName, "unknown">, CapabilityPolicy> = {
  search_customers: {
    requiresResolvedCustomer: false,
    destructive: false,
    allowPartialName: true,
    searchFirst: true
  },
  get_customer_summary: {
    requiresResolvedCustomer: true,
    destructive: false,
    allowPartialName: true,
    searchFirst: true
  },
  get_customer_balance: {
    requiresResolvedCustomer: true,
    destructive: false,
    allowPartialName: true,
    searchFirst: true
  },
  get_recent_payments: {
    requiresResolvedCustomer: true,
    destructive: false,
    allowPartialName: true,
    searchFirst: true
  },
  create_customer: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  create_job: {
    destructive: true,
    allowPartialName: true,
    searchFirst: true,
    requiresResolvedCustomer: true
  },
  list_jobs: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  update_job_status: {
    destructive: true,
    allowPartialName: true,
    searchFirst: true,
    requiresResolvedJob: true
  },
  record_payment: {
    destructive: true,
    allowPartialName: true,
    searchFirst: true,
    requiresResolvedCustomer: true
  },
  record_expense: {
    destructive: true,
    allowPartialName: false,
    searchFirst: false
  },
  record_vendor_debt: {
    destructive: true,
    allowPartialName: true,
    searchFirst: true,
    requiresResolvedVendor: true
  },
  record_vendor_payment: {
    destructive: true,
    allowPartialName: true,
    searchFirst: true,
    requiresResolvedVendor: true
  },
  get_vendor_summary: {
    destructive: false,
    allowPartialName: true,
    searchFirst: true,
    requiresResolvedVendor: true
  },
  list_expenses: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  list_payments: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  list_due_payments: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  get_financial_summary: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  create_invoice: {
    destructive: false,
    allowPartialName: true,
    searchFirst: true,
    requiresResolvedCustomer: true
  },
  export_vendor_report: {
    destructive: false,
    allowPartialName: true,
    searchFirst: true,
    requiresResolvedVendor: true
  },
  export_expenses_pdf: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  export_all_records: {
    destructive: false,
    allowPartialName: true,
    searchFirst: true
  },
  toggle_briefing: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  subscribe: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  help: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  greeting: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  confirm_action: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  cancel_action: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  },
  plan_today: {
    destructive: false,
    allowPartialName: false,
    searchFirst: false
  }
};

type RuntimeAnalysis = ParsedUserIntent;

type CapabilityResolutionResult =
  | {
      status: "executable";
      intent: ParsedIntent | null;
      analysis: RuntimeAnalysis;
    }
  | {
      status: "clarification";
      question: string;
      decision: Extract<SemanticDecision, { kind: "clarification" }>;
      analysis: RuntimeAnalysis;
    };

type RuntimeDeps = {
  resolveCustomer?: (input: {
    userId: string;
    query: string;
    take?: number;
  }) => Promise<
    | { status: "not_found"; query: string }
    | {
        status: "single";
        customer: {
          id: string;
          name: string;
          phone: string | null;
          createdAt: Date;
          score: number;
        };
      }
    | {
        status: "ambiguous";
        query: string;
        candidates: Array<{
          id: string;
          name: string;
          phone: string | null;
          score: number;
        }>;
      }
  >;
  resolveVendor?: (input: { userId: string; query: string }) => Promise<
    | { status: "vendor"; vendor: { id: string; vendorName: string } }
    | { status: "ambiguous"; query: string; candidates: Array<{ vendorName: string }> }
    | { status: "not_found"; query: string }
  >;
  resolveJob?: (input: {
    userId: string;
    query: string;
    take?: number;
    outstandingOnly?: boolean;
  }) => Promise<
    | { status: "not_found"; query: string }
    | {
        status: "single";
        job: {
          id: string;
          title: string;
          customerName: string;
          outstandingPence: number;
          dueDate: Date | null;
          createdAt: Date;
          score: number;
        };
      }
    | {
        status: "ambiguous";
        query: string;
        candidates: Array<{
          id: string;
          title: string;
          customerName: string;
          outstandingPence: number;
          dueDate: Date | null;
          score: number;
        }>;
      }
  >;
};

const defaultDeps: Required<RuntimeDeps> = {
  resolveCustomer: async (input) => {
    const { resolveCustomerQuery } = await import("../agent/entity-resolver");
    return resolveCustomerQuery(input);
  },
  resolveVendor: async ({ userId, query }) => {
    const candidates = await vendorPaymentsService.resolveVendorByQuery({
      userId,
      query
    });

    if (candidates.length === 0) {
      return { status: "not_found" as const, query };
    }

    if (candidates.length > 1) {
      return {
        status: "ambiguous" as const,
        query,
        candidates: candidates.map((candidate) => ({
          vendorName: candidate.vendorName
        }))
      };
    }

    return {
      status: "vendor" as const,
      vendor: {
        id: candidates[0].id,
        vendorName: candidates[0].vendorName
      }
    };
  },
  resolveJob: async (input) => {
    const { resolveJobQuery } = await import("../agent/entity-resolver");
    return resolveJobQuery(input);
  }
};

const toAnalysis = (input: {
  capability: Exclude<SemanticCapabilityName, "unknown">;
  entities: Record<string, unknown>;
  executionIntent: ParsedIntent | null;
  confidence?: number;
}): RuntimeAnalysis => ({
  intent:
    input.capability === "search_customers"
      ? "search_customer"
      : input.capability === "get_customer_summary" ||
          input.capability === "get_customer_balance" ||
          input.capability === "get_recent_payments" ||
          input.capability === "plan_today"
        ? "get_customer_account"
        : input.capability === "get_vendor_summary"
          ? "vendor_summary"
          : input.capability === "list_due_payments"
            ? "list_debts"
            : (input.capability as ParsedUserIntent["intent"]),
  confidence: input.confidence ?? 0.85,
  entities: input.entities,
  missingFields: [],
  needsDisambiguation: false,
  executionIntent: input.executionIntent,
  source: "llm"
});

const parseIntent = (intent: Record<string, unknown>) => {
  const parsed = IntentSchema.safeParse(intent);
  return parsed.success ? parsed.data : null;
};

const compileDirectIntent = (capability: Exclude<SemanticCapabilityName, "unknown">, entities: Record<string, unknown>) => {
  const intent =
    capability === "search_customers" ||
    capability === "get_customer_summary" ||
    capability === "get_customer_balance" ||
    capability === "get_recent_payments"
      ? {
          type: "customer_find",
          query: asString(entities.customerQuery || entities.customerName || entities.query || entities.name)
        }
      : capability === "create_customer"
      ? {
          type: "customer_create",
          name: asString(entities.customerQuery || entities.name),
          phone: asOptionalString(entities.phone)
        }
      : capability === "create_job"
        ? {
            type: "job_create",
            customerName: asString(entities.customerQuery || entities.customerName),
            customerPhone: asOptionalString(entities.customerPhone),
            title: asString(entities.title),
            totalPence: asNumber(entities.totalPence),
            depositPence: asNumber(entities.depositPence),
            dueDate:
              typeof entities.dueDate === "string" && entities.dueDate
                ? new Date(entities.dueDate)
                : undefined,
            notes: asOptionalString(entities.notes)
          }
        : capability === "list_jobs"
          ? entities.scope === "due_week"
            ? { type: "job_list_due_week" }
            : entities.scope === "last_30"
              ? { type: "job_list_last_30" }
              : { type: "job_list_active" }
          : capability === "update_job_status"
            ? entities.status === "completed" || entities.status === "canceled" || entities.status === "active"
              ? {
                  type: "job_set_status",
                  jobId: asString(entities.jobId),
                  status: entities.status
                }
              : {
                  type: "job_close",
                  jobId: asString(entities.jobId)
                }
        : capability === "record_payment"
          ? {
              type: "payment_add",
              jobId: asOptionalString(entities.jobId),
              customerName: asOptionalString(entities.customerQuery || entities.customerName),
              amountPence: asNumber(entities.amountPence),
              method:
                entities.method === "cash" ||
                entities.method === "bank" ||
                entities.method === "card" ||
                entities.method === "unknown"
                  ? entities.method
                  : undefined,
              note: asOptionalString(entities.note)
            }
          : capability === "record_expense"
            ? {
                type: "expense_add",
                amountPence: asNumber(entities.amountPence),
                note: asOptionalString(entities.note),
                counterpartyName: asOptionalString(entities.counterpartyName)
              }
            : capability === "record_vendor_debt"
              ? {
                  type: "vendor_debt_add",
                  vendorQuery: asString(entities.vendorQuery),
                  amountPence: asNumber(entities.amountPence),
                  note: asOptionalString(entities.note)
                }
              : capability === "record_vendor_payment"
                ? {
                    type: "vendor_payment_add",
                    vendorQuery: asString(entities.vendorQuery),
                    amountPence: asNumber(entities.amountPence),
                    note: asOptionalString(entities.note)
                  }
                : capability === "list_expenses"
                  ? { type: "expense_list" }
                  : capability === "list_payments"
                    ? {
                        type: "payment_list",
                        range:
                          entities.range === "today" ||
                          entities.range === "yesterday" ||
                          entities.range === "week" ||
                          entities.range === "month" ||
                          entities.range === "all"
                            ? entities.range
                            : undefined
                      }
                    : capability === "list_due_payments"
                      ? { type: "outstanding_list" }
                      : capability === "get_financial_summary"
                        ? entities.period === "today"
                          ? { type: "summary_today" }
                          : entities.period === "yesterday"
                            ? { type: "summary_yesterday" }
                            : entities.period === "month"
                              ? { type: "summary_30" }
                              : { type: "summary_7" }
                        : capability === "get_vendor_summary"
                          ? { type: "vendor_summary", days: asNumber(entities.days) }
                          : capability === "create_invoice"
                            ? { type: "invoice_create", customerQuery: asOptionalString(entities.customerQuery) }
                            : capability === "export_vendor_report"
                              ? { type: "export_vendor_pdf", vendorQuery: asOptionalString(entities.vendorQuery) }
                              : capability === "export_expenses_pdf"
                                ? { type: "export_expense_pdf" }
                                : capability === "export_all_records"
                                  ? asOptionalString(entities.customerQuery)
                                    ? { type: "export_pdf", customerQuery: asOptionalString(entities.customerQuery) }
                                    : { type: "export_data" }
                                  : capability === "toggle_briefing"
                                    ? { type: "briefing_toggle", enabled: asBoolean(entities.enabled) }
                                    : capability === "subscribe"
                                      ? { type: "subscribe" }
                                      : capability === "help"
                                        ? { type: "help" }
                                        : capability === "greeting"
                                          ? { type: "greeting" }
                                          : capability === "confirm_action"
                                            ? { type: "confirm_action" }
                                            : capability === "cancel_action"
                                              ? { type: "cancel_action" }
                                              : capability === "plan_today"
                                                ? null
                                                : null;

  return intent ? parseIntent(intent) : null;
};

const validateCapabilityInputs = (input: {
  capability: Exclude<SemanticCapabilityName, "unknown">;
  entities: Record<string, unknown>;
}) => {
  const customerQuery = asOptionalString(
    input.entities.customerQuery || input.entities.customerName || input.entities.query || input.entities.name
  );
  const vendorQuery = asOptionalString(input.entities.vendorQuery || input.entities.vendorName);
  const title = asOptionalString(input.entities.title);
  const amountPence = asNumber(input.entities.amountPence);
  const totalPence = asNumber(input.entities.totalPence);
  const enabled = asBoolean(input.entities.enabled);
  const scope = asOptionalString(input.entities.scope);
  const jobId = asOptionalString(input.entities.jobId);
  const jobQuery = asOptionalString(input.entities.jobQuery);

  if (input.capability === "create_customer" && !customerQuery) {
    return ["customerQuery"];
  }

  if (input.capability === "create_job") {
    const missingFields: string[] = [];
    if (!customerQuery) {
      missingFields.push("customerQuery");
    }
    if (!title) {
      missingFields.push("title");
    }
    if (totalPence === undefined) {
      missingFields.push("totalPence");
    }
    return missingFields;
  }

  if (input.capability === "record_payment") {
    const missingFields: string[] = [];
    if (!customerQuery && !asOptionalString(input.entities.jobId)) {
      missingFields.push("customerQuery");
    }
    if (amountPence === undefined) {
      missingFields.push("amountPence");
    }
    return missingFields;
  }

  if (input.capability === "list_jobs" && scope && !["active", "due_week", "last_30"].includes(scope)) {
    return ["scope"];
  }

  if (input.capability === "update_job_status" && !jobId && !jobQuery) {
    return ["jobId"];
  }

  if (input.capability === "record_expense" && amountPence === undefined) {
    return ["amountPence"];
  }

  if (input.capability === "record_vendor_debt" || input.capability === "record_vendor_payment") {
    const missingFields: string[] = [];
    if (!vendorQuery) {
      missingFields.push("vendorQuery");
    }
    if (amountPence === undefined) {
      missingFields.push("amountPence");
    }
    return missingFields;
  }

  if (input.capability === "toggle_briefing" && enabled === undefined) {
    return ["enabled"];
  }

  return [];
};

const buildClarification = (input: {
  capability: Exclude<SemanticCapabilityName, "unknown">;
  entities: Record<string, unknown>;
  missingOrAmbiguous: string[];
  structuredReason?: StructuredClarificationReason;
  confidence?: number;
}) => {
  const clarification = buildSemanticClarification({
    capability: input.capability,
    entities: input.entities,
    missingOrAmbiguous: input.missingOrAmbiguous,
    structuredReason: input.structuredReason
  });

  return {
    status: "clarification" as const,
    question: clarification.question,
    decision: clarification.decision,
    analysis: {
      ...clarification.analysis,
      confidence: input.confidence ?? clarification.analysis.confidence
    }
  };
};

const resolveCustomerCapability = async (input: {
  userId: string;
  capability: Exclude<SemanticCapabilityName, "unknown">;
  entities: Record<string, unknown>;
  confidence?: number;
  deps: Required<RuntimeDeps>;
}) => {
  const query = asString(input.entities.customerQuery || input.entities.customerName || input.entities.query || input.entities.name);
  if (!query) {
    return buildClarification({
      capability: input.capability,
      entities: input.entities,
      missingOrAmbiguous: ["customerQuery"],
      confidence: input.confidence
    });
  }

  const resolution = await input.deps.resolveCustomer({
    userId: input.userId,
    query
  });

  if (resolution.status === "not_found") {
    return buildClarification({
      capability: input.capability,
      entities: input.entities,
      missingOrAmbiguous: ["customerQuery"],
      structuredReason: {
        type: "customer_not_found",
        query
      },
      confidence: input.confidence
    });
  }

  if (resolution.status === "ambiguous") {
    return buildClarification({
      capability: input.capability,
      entities: input.entities,
      missingOrAmbiguous: ["customerQuery"],
      structuredReason: {
        type: "ambiguous_customer",
        query,
        candidates: resolution.candidates.map((candidate) => candidate.name)
      },
      confidence: input.confidence
    });
  }

  return {
    status: "resolved" as const,
    entities: {
      ...input.entities,
      customerQuery: resolution.customer.name,
      customerName: resolution.customer.name,
      customerId: resolution.customer.id
    }
  };
};

const resolveVendorCapability = async (input: {
  userId: string;
  capability: Exclude<SemanticCapabilityName, "unknown">;
  entities: Record<string, unknown>;
  confidence?: number;
  deps: Required<RuntimeDeps>;
}) => {
  const query = asString(input.entities.vendorQuery || input.entities.vendorName);
  if (!query) {
    return buildClarification({
      capability: input.capability,
      entities: input.entities,
      missingOrAmbiguous: ["vendorQuery"],
      confidence: input.confidence
    });
  }

  const resolution = await input.deps.resolveVendor({
    userId: input.userId,
    query
  });

  if (resolution.status === "not_found") {
    return buildClarification({
      capability: input.capability,
      entities: input.entities,
      missingOrAmbiguous: ["vendorQuery"],
      structuredReason: {
        type: "vendor_not_found",
        query
      },
      confidence: input.confidence
    });
  }

  if (resolution.status === "ambiguous") {
    return buildClarification({
      capability: input.capability,
      entities: input.entities,
      missingOrAmbiguous: ["vendorQuery"],
      structuredReason: {
        type: "ambiguous_vendor",
        query,
        candidates: resolution.candidates.map((candidate) => candidate.vendorName)
      },
      confidence: input.confidence
    });
  }

  return {
    status: "resolved" as const,
    entities: {
      ...input.entities,
      vendorQuery: resolution.vendor.vendorName,
      vendorId: resolution.vendor.id
    }
  };
};

const resolveJobCapability = async (input: {
  userId: string;
  capability: Exclude<SemanticCapabilityName, "unknown">;
  entities: Record<string, unknown>;
  confidence?: number;
  deps: Required<RuntimeDeps>;
}) => {
  const directJobId = asOptionalString(input.entities.jobId);
  if (looksLikeConcreteJobId(directJobId)) {
    return {
      status: "resolved" as const,
      entities: {
        ...input.entities,
        jobId: directJobId
      }
    };
  }

  const query = asString(input.entities.jobQuery || input.entities.jobTitleQuery || input.entities.jobId);
  if (!query) {
    return buildClarification({
      capability: input.capability,
      entities: input.entities,
      missingOrAmbiguous: ["jobId"],
      confidence: input.confidence
    });
  }

  const resolution = await input.deps.resolveJob({
    userId: input.userId,
    query
  });

  if (resolution.status === "not_found") {
    return buildClarification({
      capability: input.capability,
      entities: input.entities,
      missingOrAmbiguous: ["jobId"],
      structuredReason: {
        type: "job_not_found",
        query
      },
      confidence: input.confidence
    });
  }

  if (resolution.status === "ambiguous") {
    return buildClarification({
      capability: input.capability,
      entities: input.entities,
      missingOrAmbiguous: ["jobId"],
      structuredReason: {
        type: "ambiguous_job",
        query,
        candidates: resolution.candidates.map((candidate) => `${candidate.title} for ${candidate.customerName}`)
      },
      confidence: input.confidence
    });
  }

  return {
    status: "resolved" as const,
    entities: {
      ...input.entities,
      jobId: resolution.job.id,
      jobQuery: resolution.job.title
    }
  };
};

export const resolveSemanticCapability = async (
  input: {
    userId: string;
    capability: Exclude<SemanticCapabilityName, "unknown">;
    entities: Record<string, unknown>;
    confidence?: number;
  },
  deps: RuntimeDeps = {}
): Promise<CapabilityResolutionResult> => {
  const runtimeDeps = { ...defaultDeps, ...deps };
  const policy = capabilityPolicies[input.capability];
  let resolvedEntities = { ...input.entities };

  const missingFields = validateCapabilityInputs({
    capability: input.capability,
    entities: resolvedEntities
  });
  if (missingFields.length > 0) {
    return buildClarification({
      capability: input.capability,
      entities: resolvedEntities,
      missingOrAmbiguous: missingFields,
      structuredReason:
        missingFields.length === 1
          ? {
              type: "missing_field",
              field: missingFields[0]
            }
          : undefined,
      confidence: input.confidence
    });
  }

  if (policy.requiresResolvedCustomer && policy.searchFirst) {
    const resolved = await resolveCustomerCapability({
      ...input,
      entities: resolvedEntities,
      deps: runtimeDeps
    });
    if (resolved.status === "clarification") {
      return resolved;
    }
    resolvedEntities = resolved.entities;
  }

  if (policy.requiresResolvedVendor && policy.searchFirst) {
    const resolved = await resolveVendorCapability({
      ...input,
      entities: resolvedEntities,
      deps: runtimeDeps
    });
    if (resolved.status === "clarification") {
      return resolved;
    }
    resolvedEntities = resolved.entities;
  }

  if (policy.requiresResolvedJob && policy.searchFirst) {
    const resolved = await resolveJobCapability({
      ...input,
      entities: resolvedEntities,
      deps: runtimeDeps
    });
    if (resolved.status === "clarification") {
      return resolved;
    }
    resolvedEntities = resolved.entities;
  }

  const intent = compileDirectIntent(input.capability, resolvedEntities);
  const analysis = toAnalysis({
    capability: input.capability,
    entities: resolvedEntities,
    executionIntent: intent,
    confidence: input.confidence
  });

  if (!intent && input.capability !== "plan_today") {
    const clarification = buildSemanticClarification({
      capability: input.capability,
      entities: resolvedEntities,
      missingOrAmbiguous: [],
      structuredReason: {
        type: "capability_uncertain",
        likelyCapability: input.capability
      }
    });

    return {
      status: "clarification",
      question: clarification.question,
      decision: clarification.decision,
      analysis: clarification.analysis
    };
  }

  return {
    status: "executable",
    intent,
    analysis
  };
};

export const buildIntentFromSemanticAction = (input: {
  capability: Exclude<SemanticCapabilityName, "unknown">;
  entities: Record<string, unknown>;
  confidence?: number;
}) =>
  resolveSemanticCapability({
    userId: "__runtime_test__",
    capability: input.capability,
    entities: input.entities,
    confidence: input.confidence
  }, {
    resolveCustomer: async () => ({
      status: "single" as const,
      customer: {
        id: "resolved-customer",
        name: asString(input.entities.customerQuery || input.entities.customerName || input.entities.query || input.entities.name),
        phone: null,
        createdAt: new Date(),
        score: 1000
      }
    }),
    resolveVendor: async () => ({
      status: "vendor" as const,
      vendor: {
        id: "resolved-vendor",
        vendorName: asString(input.entities.vendorQuery || input.entities.vendorName)
      }
    }),
    resolveJob: async () => ({
      status: "single" as const,
      job: {
        id: looksLikeConcreteJobId(input.entities.jobId) ? asString(input.entities.jobId) : "resolved-job",
        title: asString(input.entities.jobQuery || input.entities.jobTitleQuery || input.entities.jobId),
        customerName: "Resolved Customer",
        outstandingPence: 0,
        dueDate: null,
        createdAt: new Date(),
        score: 1000
      }
    })
  });
