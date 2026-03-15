import type { EntityResolutionResult, WorkflowName } from "../engine/contracts";

export type EntityResolverResult = EntityResolutionResult;

export const resolveWorkflowEntities = async (_input: {
  workflow: WorkflowName;
  slots: Record<string, unknown>;
}): Promise<EntityResolverResult> => {
  return {
    status: "idle"
  };
};
