// Defines the core types and workflow contracts used by Conversation V2.
export const WORKFLOW_NAMES = [
  "customer_records",
  "record_customer_payment",
  "list_payments",
  "expense_list",
  "vendor_summary",
  "export_records_pdf",
  "export_vendor_pdf",
  "export_expense_pdf",
  "create_invoice",
  "create_customer",
  "record_vendor_debt",
  "record_vendor_payment",
  "create_job",
  "update_job_status",
  "list_today_jobs",
  "record_expense",
  "daily_summary",
  "weekly_summary",
  "monthly_summary"
] as const;

export type WorkflowName = (typeof WORKFLOW_NAMES)[number];

export const PENDING_FLOW_STEPS = [
  "slot_filling",
  "entity_resolution",
  "confirmation",
  "ready_to_execute"
] as const;

export type PendingFlowStep = (typeof PENDING_FLOW_STEPS)[number];

export type WorkflowSlotsByName = {
  customer_records: {
    customer_query?: string;
  };
  record_customer_payment: {
    customer_query?: string;
    amount_pence?: number;
    method?: "cash" | "bank" | "card" | "unknown";
    note?: string;
    job_query?: string;
  };
  list_payments: {
    range?: "today" | "yesterday" | "week" | "month" | "all";
  };
  expense_list: {
    range?: "today" | "yesterday" | "week" | "all";
  };
  vendor_summary: {
    days?: number;
  };
  export_records_pdf: {
    customer_query?: string;
  };
  export_vendor_pdf: {
    vendor_query?: string;
  };
  export_expense_pdf: {};
  create_invoice: {
    customer_query?: string;
  };
  create_customer: {
    customer_name?: string;
    customer_phone?: string;
    notes?: string;
  };
  record_vendor_debt: {
    vendor_query?: string;
    amount_pence?: number;
    note?: string;
    occurred_on?: string;
  };
  record_vendor_payment: {
    vendor_query?: string;
    amount_pence?: number;
    note?: string;
    occurred_on?: string;
  };
  create_job: {
    customer_query?: string;
    customer_phone?: string;
    title?: string;
    total_pence?: number;
    deposit_pence?: number;
    due_date?: string;
    notes?: string;
    create_customer_if_missing?: boolean;
  };
  update_job_status: {
    job_query?: string;
    apply_to_all?: boolean;
    status?: "active" | "completed" | "canceled";
  };
  list_today_jobs: {
    scope?: "today";
  };
  record_expense: {
    amount_pence?: number;
    category?: string;
    note?: string;
    occurred_on?: string;
    vendor_query?: string;
  };
  daily_summary: {
    scope?: "daily";
  };
  weekly_summary: {
    scope?: "week";
  };
  monthly_summary: {
    month?: number;
    year?: number;
  };
};

export type WorkflowSlotKey<TWorkflow extends WorkflowName> = keyof WorkflowSlotsByName[TWorkflow] & string;
export type WorkflowSlots<TWorkflow extends WorkflowName = WorkflowName> = WorkflowSlotsByName[TWorkflow];

export type WorkflowIntentByName = {
  [TWorkflow in WorkflowName]: {
    workflow: TWorkflow;
    confidence: "high" | "medium" | "low";
    fields: WorkflowSlotsByName[TWorkflow];
  };
};

export type WorkflowIntent<TWorkflow extends WorkflowName = WorkflowName> = WorkflowIntentByName[TWorkflow];

export type ResolvedEntityIds = Partial<{
  customerId: string;
  vendorId: string;
  jobId: string;
}>;

export type EntityCandidate = {
  id: string;
  label: string;
  type: "customer" | "vendor" | "job";
};

export type EntityResolutionResult =
  | {
      status: "resolved";
      resolvedIds: ResolvedEntityIds;
      candidates?: undefined;
      unresolvedQuery?: undefined;
    }
  | {
      status: "ambiguous";
      resolvedIds?: ResolvedEntityIds;
      candidates: EntityCandidate[];
      unresolvedQuery: string;
    }
  | {
      status: "not_found";
      resolvedIds?: undefined;
      candidates?: undefined;
      unresolvedQuery: string;
    }
  | {
      status: "idle";
      resolvedIds?: undefined;
      candidates?: undefined;
      unresolvedQuery?: undefined;
    };

export type ConfirmationState =
  | {
      type: "confirm_duplicate_customer";
      prompt: string;
      payload: {
        customerName: string;
        matchedCustomerIds: string[];
      };
    }
  | {
      type: "confirm_create_vendor_for_debt";
      prompt: string;
      payload: {
        vendorName: string;
      };
    }
  | {
      type: "confirm_cancel_job";
      prompt: string;
      payload: {
        jobId?: string;
        jobTitle?: string;
      };
    }
  | {
      type: "custom";
      prompt: string;
      payload?: Record<string, unknown>;
    };

export type RecentRefs = Partial<{
  customerId: string;
  customerName: string;
  vendorId: string;
  vendorName: string;
  jobId: string;
  jobTitle: string;
}>;

export type BackgroundTaskStatus =
  | "queued"
  | "running"
  | "waiting_user"
  | "completed"
  | "failed"
  | "canceled";

export type BackgroundTaskKind = "workflow_execution" | "follow_up";

export type BackgroundTask = {
  id: string;
  kind: BackgroundTaskKind;
  status: BackgroundTaskStatus;
  workflow?: WorkflowName;
  ownerAgent: "router_agent" | "qa_agent" | "function_calling_agent";
  summary: string;
  createdAt: string;
  updatedAt: string;
  sourceMessageId?: string;
  startedAt?: string;
  finishedAt?: string;
  resultPreview?: string;
  errorMessage?: string;
 };

export type PendingFlowByName = {
  [TWorkflow in WorkflowName]: {
    id: string;
    workflow: TWorkflow;
    step: PendingFlowStep;
    slots: WorkflowSlotsByName[TWorkflow];
    missingSlots: Array<WorkflowSlotKey<TWorkflow>>;
    entityState: EntityResolutionResult;
    confirmationState?: ConfirmationState;
    prompt: string;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
    topicShiftPolicy: "allow_strong_shift";
    sourceMessageId?: string;
  };
};

export type PendingFlow<TWorkflow extends WorkflowName = WorkflowName> = PendingFlowByName[TWorkflow];

export type ConversationStateV2 = {
  userId: string;
  channel: "whatsapp";
  lastMessageAt: string;
  recentRefs: RecentRefs;
  pendingFlow?: PendingFlow;
  backgroundTask?: BackgroundTask;
  lastCompletedWorkflow?: WorkflowName;
  version: "v2";
};

export type RouteIncomingMessageV2Input = {
  userId: string;
  from: string;
  body: string;
  messageSid: string;
};

export type RouteIncomingMessageV2Result = {
  reply: string;
  mediaUrl?: string;
  state: ConversationStateV2;
  workflow?: WorkflowName;
  status: "completed" | "pending" | "unsupported";
  fallbackToV1?: boolean;
  delegatedCapability?: "booking_create" | "job_list_extended" | "briefing_toggle" | "unknown_v1_capability";
};

export type WorkflowExecutionResult<TWorkflow extends WorkflowName = WorkflowName> = {
  workflow: TWorkflow;
  reply: string;
  mediaUrl?: string;
  recentRefs?: RecentRefs;
  completed: boolean;
};
