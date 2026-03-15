import type { ConfirmationState, WorkflowName } from "../engine/contracts";

export type ConfirmationDecision =
  | { type: "none" }
  | { type: "required"; confirmation: ConfirmationState };

export const resolveWorkflowConfirmation = async (_input: {
  workflow: WorkflowName;
  slots: Record<string, unknown>;
}): Promise<ConfirmationDecision> => {
  return { type: "none" };
};

