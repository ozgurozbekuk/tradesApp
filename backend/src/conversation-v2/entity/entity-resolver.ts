import type { PendingFlowEntityState, WorkflowName } from "../engine/contracts";

export type EntityResolverResult = PendingFlowEntityState;

export const resolveWorkflowEntities = async (_input: {
  workflow: WorkflowName;
  slots: Record<string, unknown>;
}): Promise<EntityResolverResult> => {
  return {
    status: "idle"
  };
};

