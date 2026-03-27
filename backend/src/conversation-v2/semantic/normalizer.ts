// Normalizes semantic front door output into runtime-friendly shapes.
import type { WorkflowIntent, WorkflowName } from "../engine/contracts";
import { workflowIntentSchema } from "../intent/intent-schema";
import type { SemanticDelegateCapabilitySchema, SemanticFrontDoorResultSchema } from "./schema";

export type RuntimeNormalizedTurn =
  | {
      type: "workflow_intent";
      intent: WorkflowIntent;
      mode: "fresh" | "continue_pending";
      reasoningSummary?: string;
    }
  | {
      type: "clarification";
      question: string;
      workflow?: WorkflowName;
      missingFields?: string[];
      reasoningSummary?: string;
    }
  | {
      type: "delegate_to_v1";
      capability: SemanticDelegateCapabilitySchema;
      reasoningSummary?: string;
    }
  | {
      type: "respond";
      message: string;
    }
  | {
      type: "unknown";
      reason?: string;
    };

const normalizeWorkflowIntent = (
  input: Extract<SemanticFrontDoorResultSchema, { kind: "workflow_intent" }>
): Extract<RuntimeNormalizedTurn, { type: "workflow_intent" }> => {
  const intent = workflowIntentSchema.parse({
    workflow: input.workflow,
    confidence: input.confidence,
    fields: input.fields
  });

  return {
    type: "workflow_intent",
    intent,
    mode: input.mode,
    reasoningSummary: input.reasoning_summary
  };
};

export const normalizeSemanticFrontDoorResult = (
  input: SemanticFrontDoorResultSchema
): RuntimeNormalizedTurn => {
  switch (input.kind) {
    case "workflow_intent":
      return normalizeWorkflowIntent(input);
    case "clarification":
      return {
        type: "clarification",
        question: input.question,
        workflow: input.workflow,
        missingFields: input.missing_fields,
        reasoningSummary: input.reasoning_summary
      };
    case "delegate_to_v1":
      return {
        type: "delegate_to_v1",
        capability: input.capability,
        reasoningSummary: input.reasoning_summary
      };
    case "respond":
      return {
        type: "respond",
        message: input.message
      };
    case "unknown":
      return {
        type: "unknown",
        reason: input.reason
      };
  }
};
