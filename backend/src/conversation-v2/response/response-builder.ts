import type { WorkflowExecutionResult } from "../engine/contracts";

export const buildUnsupportedReply = () =>
  "This request is not supported by Conversation V2 yet. Falling back to the existing flow is expected.";

export const buildWorkflowReply = (result: WorkflowExecutionResult) => result.reply;

