import type { PendingFlow, WorkflowIntent, WorkflowName } from "../engine/contracts";

const REQUIRED_SLOTS: Record<WorkflowName, string[]> = {
  create_customer: ["customer_name"],
  record_vendor_debt: ["amount_pence", "vendor_query"],
  record_vendor_payment: ["amount_pence", "vendor_query"],
  create_job: ["customer_query", "title", "total_pence"],
  update_job_status: ["job_query", "status"],
  list_today_jobs: [],
  record_expense: ["amount_pence"],
  daily_summary: [],
  monthly_summary: []
};

export type SlotFillResult = {
  workflow: WorkflowName;
  slots: Record<string, unknown>;
  missingSlots: string[];
};

const hasValue = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== undefined && value !== null;
};

const parseCurrencyToPence = (text: string) => {
  const normalized = text.replace(/,/g, "").trim();
  const match = normalized.match(/-?\d+(?:\.\d{1,2})?/);
  if (!match) {
    return undefined;
  }

  const value = Number.parseFloat(match[0]);
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.round(value * 100);
};

const parseMonth = (text: string) => {
  const value = Number.parseInt(text.trim(), 10);
  if (Number.isNaN(value) || value < 1 || value > 12) {
    return undefined;
  }

  return value;
};

const parseYear = (text: string) => {
  const value = Number.parseInt(text.trim(), 10);
  if (Number.isNaN(value) || value < 2000) {
    return undefined;
  }

  return value;
};

const parseContinuationValue = (slot: string, text: string): unknown => {
  switch (slot) {
    case "amount_pence":
    case "total_pence":
    case "deposit_pence":
      return parseCurrencyToPence(text);
    case "month":
      return parseMonth(text);
    case "year":
      return parseYear(text);
    case "status": {
      const normalized = text.trim().toLowerCase();
      if (normalized === "active" || normalized === "completed" || normalized === "canceled") {
        return normalized;
      }

      return undefined;
    }
    case "scope": {
      const normalized = text.trim().toLowerCase();
      if (normalized === "today" || normalized === "daily") {
        return normalized;
      }

      return undefined;
    }
    default:
      return text.trim() || undefined;
  }
};

const computeMissingSlots = (workflow: WorkflowName, slots: Record<string, unknown>) =>
  REQUIRED_SLOTS[workflow].filter((slot) => !hasValue(slots[slot]));

export const buildInitialSlotState = (intent: WorkflowIntent): SlotFillResult => ({
  workflow: intent.workflow,
  slots: { ...intent.fields },
  missingSlots: computeMissingSlots(intent.workflow, intent.fields as Record<string, unknown>)
});

export const mergePendingFlowSlots = (
  pendingFlow: PendingFlow,
  fields: Record<string, unknown>
): SlotFillResult => {
  const slots = {
    ...(pendingFlow.slots as Record<string, unknown>),
    ...fields
  };

  return {
    workflow: pendingFlow.workflow,
    slots,
    missingSlots: computeMissingSlots(pendingFlow.workflow, slots)
  };
};

export const extractContinuationFields = (pendingFlow: PendingFlow, rawText: string): Record<string, unknown> => {
  if (pendingFlow.missingSlots.length !== 1) {
    return {};
  }

  const [slot] = pendingFlow.missingSlots;
  const value = parseContinuationValue(slot, rawText);
  if (!hasValue(value)) {
    return {};
  }

  return {
    [slot]: value
  };
};
