export const WORKFLOW_NAMES = [
  "create_customer",
  "record_vendor_debt",
  "record_vendor_payment",
  "create_job",
  "update_job_status",
  "list_today_jobs",
  "record_expense",
  "daily_summary",
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

export type PendingFlowEntityState = {
  status: "idle" | "resolved" | "ambiguous" | "not_found";
  resolvedIds?: Partial<{
    customerId: string;
    vendorId: string;
    jobId: string;
  }>;
  candidates?: Array<{
    id: string;
    label: string;
    type: "customer" | "vendor" | "job";
  }>;
  unresolvedQuery?: string;
};

export type ConfirmationState = {
  type: string;
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

export type PendingFlow = {
  id: string;
  workflow: WorkflowName;
  step: PendingFlowStep;
  slots: Record<string, unknown>;
  missingSlots: string[];
  entityState: PendingFlowEntityState;
  confirmationState?: ConfirmationState;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  topicShiftPolicy: "allow_strong_shift";
  sourceMessageId?: string;
};

export type ConversationStateV2 = {
  userId: string;
  channel: "whatsapp";
  lastMessageAt: string;
  recentRefs: RecentRefs;
  pendingFlow?: PendingFlow;
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
};

export type WorkflowIntent = {
  workflow: WorkflowName;
  confidence: "high" | "medium" | "low";
  fields: Record<string, unknown>;
};

export type WorkflowExecutionResult = {
  workflow: WorkflowName;
  reply: string;
  recentRefs?: RecentRefs;
  completed: boolean;
};

