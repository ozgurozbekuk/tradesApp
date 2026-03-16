import type { WorkflowExecutionResult, WorkflowName } from "../engine/contracts";

export const executeWorkflowAction = async (input: {
  workflow: WorkflowName;
  slots: Record<string, unknown>;
}): Promise<WorkflowExecutionResult> => {
  return {
    workflow: input.workflow,
    reply: "Conversation V2 action execution is not implemented yet.",
    completed: false
  };
};

