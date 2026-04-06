// Owns workflow readiness checks and function-style workflow execution.
import { resolveWorkflowConfirmation } from "../confirmation/confirmation-handler";
import { resolveWorkflowEntities } from "../entity/entity-resolver";
import { executeWorkflowAction } from "../execution/action-executor";
import type {
  ConversationFunctionCallExecutionInput,
  ConversationFunctionCallExecutionResult,
  ConversationFunctionCallingReadinessInput,
  PendingFunctionCallResolution
} from "./agent-contracts";

export const resolvePendingFunctionCall = async (
  input: ConversationFunctionCallingReadinessInput
): Promise<PendingFunctionCallResolution> => {
  if (input.slotState.missingSlots.length > 0) {
    return {
      kind: "missing_slots",
      slotState: input.slotState
    };
  }

  if (input.slotState.validationErrors.length > 0) {
    return {
      kind: "missing_slots",
      slotState: input.slotState
    };
  }

  const entityState = await resolveWorkflowEntities({
    userId: input.userId,
    workflow: input.workflow,
    slots: input.slotState.slots,
    recentRefs: input.recentRefs
  });

  const confirmation = await resolveWorkflowConfirmation({
    userId: input.userId,
    workflow: input.workflow,
    slots: input.slotState.slots,
    entityState
  });

  if (confirmation.type === "required") {
    return {
      kind: "confirmation",
      slotState: input.slotState,
      entityState,
      confirmationState: confirmation.confirmation
    };
  }

  if (entityState.status === "ambiguous" || entityState.status === "not_found") {
    if (
      input.workflow === "create_job" &&
      entityState.status === "not_found" &&
      input.slotState.slots.create_customer_if_missing === true
    ) {
      return {
        kind: "ready",
        slotState: input.slotState,
        entityState
      };
    }

    return {
      kind: "entity_clarification",
      slotState: input.slotState,
      entityState
    };
  }

  return {
    kind: "ready",
    slotState: input.slotState,
    entityState
  };
};

export const runFunctionCallAgent = async (
  input: ConversationFunctionCallExecutionInput
): Promise<ConversationFunctionCallExecutionResult> => {
  return executeWorkflowAction(input);
};
