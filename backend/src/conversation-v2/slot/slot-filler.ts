import type { PendingFlow, WorkflowIntent, WorkflowName } from "../engine/contracts";
import { parseConversationDate } from "../date-parsing";
import { workflowSlotsSchemaMap } from "../state/state-schema";

const REQUIRED_SLOTS: Record<WorkflowName, string[]> = {
  customer_records: ["customer_query"],
  record_customer_payment: ["customer_query", "amount_pence"],
  expense_list: [],
  vendor_summary: [],
  export_records_pdf: [],
  export_vendor_pdf: [],
  export_expense_pdf: [],
  create_invoice: [],
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

const WORKFLOW_SLOT_KEYS: Record<WorkflowName, string[]> = {
  customer_records: ["customer_query"],
  record_customer_payment: ["customer_query", "amount_pence", "method", "note", "job_query"],
  expense_list: ["range"],
  vendor_summary: ["days"],
  export_records_pdf: ["customer_query"],
  export_vendor_pdf: ["vendor_query"],
  export_expense_pdf: [],
  create_invoice: ["customer_query"],
  create_customer: ["customer_name", "customer_phone", "notes"],
  record_vendor_debt: ["vendor_query", "amount_pence", "note", "occurred_on"],
  record_vendor_payment: ["vendor_query", "amount_pence", "note", "occurred_on"],
  create_job: ["customer_query", "title", "total_pence", "deposit_pence", "due_date", "notes"],
  update_job_status: ["job_query", "status"],
  list_today_jobs: ["scope"],
  record_expense: ["amount_pence", "category", "note", "occurred_on", "vendor_query"],
  daily_summary: ["scope"],
  monthly_summary: ["month", "year"]
};

export type SlotFillResult = {
  workflow: WorkflowName;
  slots: Record<string, unknown>;
  missingSlots: string[];
  validationErrors: string[];
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

const parseDays = (text: string) => {
  const value = Number.parseInt(text.trim(), 10);
  if (Number.isNaN(value) || value <= 0 || value > 365) {
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
    case "method": {
      const normalized = text.trim().toLowerCase();
      if (normalized === "cash" || normalized === "bank" || normalized === "card" || normalized === "unknown") {
        return normalized;
      }

      return undefined;
    }
    case "days":
      return parseDays(text);
    case "scope": {
      const normalized = text.trim().toLowerCase();
      if (normalized === "today" || normalized === "daily") {
        return normalized;
      }

      return undefined;
    }
    case "range": {
      const normalized = text.trim().toLowerCase();
      if (normalized === "today" || normalized === "yesterday" || normalized === "week" || normalized === "all") {
        return normalized;
      }

      return undefined;
    }
    default:
      return text.trim() || undefined;
  }
};

const filterWorkflowFields = (workflow: WorkflowName, fields: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => WORKFLOW_SLOT_KEYS[workflow].includes(key) && hasValue(value))
  );

const computeMissingSlots = (workflow: WorkflowName, slots: Record<string, unknown>) =>
  REQUIRED_SLOTS[workflow].filter((slot) => !hasValue(slots[slot]));

const validateWorkflowSlots = (workflow: WorkflowName, slots: Record<string, unknown>) => {
  const schema = workflowSlotsSchemaMap[workflow];
  const validation = schema.safeParse(slots);

  if (validation.success) {
    const validationErrors: string[] = [];
    const validatedSlots = validation.data as Record<string, unknown>;
    if (workflow === "create_job" && typeof validatedSlots.due_date === "string") {
      if (!parseConversationDate(validatedSlots.due_date)) {
        validationErrors.push("I could not understand that due date. Please use a clear date like 2026-03-20 or say tomorrow.");
      }
    }

    return {
      slots: validatedSlots,
      validationErrors
    };
  }

  return {
    slots,
    validationErrors: validation.error.issues.map((issue) => issue.message)
  };
};

const buildSlotFillResult = (workflow: WorkflowName, slots: Record<string, unknown>): SlotFillResult => {
  const filteredSlots = filterWorkflowFields(workflow, slots);
  const validated = validateWorkflowSlots(workflow, filteredSlots);

  return {
    workflow,
    slots: validated.slots,
    missingSlots: computeMissingSlots(workflow, validated.slots),
    validationErrors: validated.validationErrors
  };
};

export const buildInitialSlotState = (intent: WorkflowIntent): SlotFillResult => {
  return buildSlotFillResult(intent.workflow, intent.fields as Record<string, unknown>);
};

export const mergePendingFlowSlots = (
  pendingFlow: PendingFlow,
  fields: Record<string, unknown>
): SlotFillResult => {
  const nextFields = filterWorkflowFields(pendingFlow.workflow, fields);
  const mergedIntoMissingOnly = {
    ...(pendingFlow.slots as Record<string, unknown>)
  };

  for (const missingSlot of pendingFlow.missingSlots) {
    if (hasValue(nextFields[missingSlot])) {
      mergedIntoMissingOnly[missingSlot] = nextFields[missingSlot];
    }
  }

  return buildSlotFillResult(pendingFlow.workflow, mergedIntoMissingOnly);
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
