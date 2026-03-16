import type { PendingFlow, WorkflowIntent, WorkflowName } from "../engine/contracts";

export type SlotFillResult = {
  workflow: WorkflowName;
  slots: Record<string, unknown>;
  missingSlots: string[];
};

export const buildInitialSlotState = (intent: WorkflowIntent): SlotFillResult => ({
  workflow: intent.workflow,
  slots: { ...intent.fields },
  missingSlots: []
});

export const mergePendingFlowSlots = (pendingFlow: PendingFlow, fields: Record<string, unknown>): SlotFillResult => ({
  workflow: pendingFlow.workflow,
  slots: {
    ...pendingFlow.slots,
    ...fields
  },
  missingSlots: pendingFlow.missingSlots
});

