import type {
  ConfirmationState,
  ConversationStateV2,
  EntityResolutionResult,
  PendingFlow,
  RouteIncomingMessageV2Input,
  RouteIncomingMessageV2Result,
  WorkflowIntent,
  WorkflowName
} from "./contracts";
import { resolveWorkflowConfirmation } from "../confirmation/confirmation-handler";
import { resolveWorkflowEntities } from "../entity/entity-resolver";
import { executeWorkflowAction } from "../execution/action-executor";
import { resolveIntentV2 } from "../intent/intent-resolver";
import {
  buildConfirmationReply,
  buildEntityClarificationReply,
  buildMissingSlotPrompt,
  buildPendingFlowCanceledReply,
  buildPendingFlowShiftedReply,
  buildUnsupportedReply,
  buildWorkflowReply
} from "../response/response-builder";
import {
  buildInitialSlotState,
  extractContinuationFields,
  mergePendingFlowSlots,
  type SlotFillResult
} from "../slot/slot-filler";
import { createEmptyConversationStateV2, type ConversationStateStore } from "../state/state-store";
import { decideTopicShift } from "../topic/topic-shift";

export type ConversationV2RuntimeDependencies = {
  stateStore: ConversationStateStore;
};

type PendingResolution =
  | {
      kind: "missing_slots";
      slotState: SlotFillResult;
    }
  | {
      kind: "entity_clarification";
      slotState: SlotFillResult;
      entityState: EntityResolutionResult;
    }
  | {
      kind: "confirmation";
      slotState: SlotFillResult;
      entityState: EntityResolutionResult;
      confirmationState: ConfirmationState;
    }
  | {
      kind: "ready";
      slotState: SlotFillResult;
      entityState: EntityResolutionResult;
    };

const normalizeIncomingText = (text: string) => text.trim().replace(/\s+/g, " ");

const buildPendingFlow = (input: {
  workflow: WorkflowName;
  slotState: SlotFillResult;
  entityState: EntityResolutionResult;
  confirmationState?: ConfirmationState;
  previous?: PendingFlow;
  now: Date;
  sourceMessageId: string;
  prompt: string;
}): PendingFlow => {
  const createdAt = input.previous?.createdAt ?? input.now.toISOString();
  const expiresAt = new Date(input.now.getTime() + 5 * 60 * 1000).toISOString();

  if (input.confirmationState) {
    return {
      id: input.previous?.id ?? `${input.workflow}:${input.sourceMessageId}`,
      workflow: input.workflow,
      step: "confirmation",
      slots: input.slotState.slots,
      missingSlots: input.slotState.missingSlots,
      entityState: input.entityState,
      confirmationState: input.confirmationState,
      prompt: input.prompt,
      createdAt,
      updatedAt: input.now.toISOString(),
      expiresAt,
      topicShiftPolicy: "allow_strong_shift",
      sourceMessageId: input.sourceMessageId
    } as PendingFlow;
  }

  if (input.entityState.status === "ambiguous" || input.entityState.status === "not_found") {
    return {
      id: input.previous?.id ?? `${input.workflow}:${input.sourceMessageId}`,
      workflow: input.workflow,
      step: "entity_resolution",
      slots: input.slotState.slots,
      missingSlots: input.slotState.missingSlots,
      entityState: input.entityState,
      prompt: input.prompt,
      createdAt,
      updatedAt: input.now.toISOString(),
      expiresAt,
      topicShiftPolicy: "allow_strong_shift",
      sourceMessageId: input.sourceMessageId
    } as PendingFlow;
  }

  return {
    id: input.previous?.id ?? `${input.workflow}:${input.sourceMessageId}`,
    workflow: input.workflow,
    step: input.slotState.missingSlots.length > 0 ? "slot_filling" : "ready_to_execute",
    slots: input.slotState.slots,
    missingSlots: input.slotState.missingSlots,
    entityState: input.entityState,
    prompt: input.prompt,
    createdAt,
    updatedAt: input.now.toISOString(),
    expiresAt,
    topicShiftPolicy: "allow_strong_shift",
    sourceMessageId: input.sourceMessageId
  } as PendingFlow;
};

const resolvePendingState = async (input: {
  userId: string;
  workflow: WorkflowName;
  slotState: SlotFillResult;
  recentRefs: ConversationStateV2["recentRefs"];
}): Promise<PendingResolution> => {
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

  if (entityState.status === "ambiguous" || entityState.status === "not_found") {
    return {
      kind: "entity_clarification",
      slotState: input.slotState,
      entityState
    };
  }

  const confirmation = await resolveWorkflowConfirmation({
    workflow: input.workflow,
    slots: input.slotState.slots
  });

  if (confirmation.type === "required") {
    return {
      kind: "confirmation",
      slotState: input.slotState,
      entityState,
      confirmationState: confirmation.confirmation
    };
  }

  return {
    kind: "ready",
    slotState: input.slotState,
    entityState
  };
};

const saveAndReturn = async (input: {
  stateStore: ConversationStateStore;
  state: ConversationStateV2;
  reply: string;
  workflow?: WorkflowName;
  status: RouteIncomingMessageV2Result["status"];
}): Promise<RouteIncomingMessageV2Result> => {
  await input.stateStore.save(input.state);

  return {
    reply: input.reply,
    state: input.state,
    workflow: input.workflow,
    status: input.status
  };
};

export const runConversationV2Turn = async (
  input: RouteIncomingMessageV2Input,
  dependencies: ConversationV2RuntimeDependencies
): Promise<RouteIncomingMessageV2Result> => {
  const now = new Date();
  const existingState = await dependencies.stateStore.load(input.userId);
  const state: ConversationStateV2 = existingState ?? createEmptyConversationStateV2(input.userId);
  const normalizedText = normalizeIncomingText(input.body);

  const baseState: ConversationStateV2 = {
    ...state,
    lastMessageAt: now.toISOString()
  };

  let workingState = baseState;

  if (workingState.pendingFlow) {
    const topicShiftDecision = decideTopicShift({
      pendingFlow: workingState.pendingFlow,
      text: normalizedText
    });

    if (topicShiftDecision.type === "cancel_pending") {
      const nextState: ConversationStateV2 = {
        ...workingState,
        pendingFlow: undefined
      };

      return saveAndReturn({
        stateStore: dependencies.stateStore,
        state: nextState,
        reply: buildPendingFlowCanceledReply(),
        status: "unsupported"
      });
    }

    if (topicShiftDecision.type === "shift_to_fresh_intent") {
      workingState = {
        ...workingState,
        pendingFlow: undefined
      };
    }
  }

  if (workingState.pendingFlow) {
    const continuationFields = extractContinuationFields(workingState.pendingFlow, input.body);
    const slotState = mergePendingFlowSlots(workingState.pendingFlow, continuationFields);
    const resolution = await resolvePendingState({
      userId: input.userId,
      workflow: workingState.pendingFlow.workflow,
      slotState,
      recentRefs: workingState.recentRefs
    });

    if (resolution.kind === "missing_slots") {
      const prompt = buildMissingSlotPrompt(workingState.pendingFlow.workflow, resolution.slotState.missingSlots);
      const pendingFlow = buildPendingFlow({
        workflow: workingState.pendingFlow.workflow,
        slotState: resolution.slotState,
        entityState: workingState.pendingFlow.entityState,
        previous: workingState.pendingFlow,
        now,
        sourceMessageId: input.messageSid,
        prompt
      });

      return saveAndReturn({
        stateStore: dependencies.stateStore,
        state: {
          ...workingState,
          pendingFlow
        },
        reply: prompt,
        workflow: pendingFlow.workflow,
        status: "pending"
      });
    }

    if (resolution.kind === "entity_clarification") {
      const prompt = buildEntityClarificationReply();
      const pendingFlow = buildPendingFlow({
        workflow: workingState.pendingFlow.workflow,
        slotState: resolution.slotState,
        entityState: resolution.entityState,
        previous: workingState.pendingFlow,
        now,
        sourceMessageId: input.messageSid,
        prompt
      });

      return saveAndReturn({
        stateStore: dependencies.stateStore,
        state: {
          ...workingState,
          pendingFlow
        },
        reply: prompt,
        workflow: pendingFlow.workflow,
        status: "pending"
      });
    }

    if (resolution.kind === "confirmation") {
      const prompt = buildConfirmationReply(resolution.confirmationState.prompt);
      const pendingFlow = buildPendingFlow({
        workflow: workingState.pendingFlow.workflow,
        slotState: resolution.slotState,
        entityState: resolution.entityState,
        confirmationState: resolution.confirmationState,
        previous: workingState.pendingFlow,
        now,
        sourceMessageId: input.messageSid,
        prompt
      });

      return saveAndReturn({
        stateStore: dependencies.stateStore,
        state: {
          ...workingState,
          pendingFlow
        },
        reply: prompt,
        workflow: pendingFlow.workflow,
        status: "pending"
      });
    }

    const executionResult = await executeWorkflowAction({
      workflow: workingState.pendingFlow.workflow,
      slots: resolution.slotState.slots
    });

    if (executionResult.completed) {
      return saveAndReturn({
        stateStore: dependencies.stateStore,
        state: {
          ...workingState,
          recentRefs: {
            ...workingState.recentRefs,
            ...executionResult.recentRefs
          },
          pendingFlow: undefined,
          lastCompletedWorkflow: executionResult.workflow
        },
        reply: buildWorkflowReply(executionResult),
        workflow: executionResult.workflow,
        status: "completed"
      });
    }

    const pendingFlow = buildPendingFlow({
      workflow: workingState.pendingFlow.workflow,
      slotState: resolution.slotState,
      entityState: resolution.entityState,
      previous: workingState.pendingFlow,
      now,
      sourceMessageId: input.messageSid,
      prompt: buildWorkflowReply(executionResult)
    });

    return saveAndReturn({
      stateStore: dependencies.stateStore,
      state: {
        ...workingState,
        pendingFlow
      },
      reply: buildWorkflowReply(executionResult),
      workflow: pendingFlow.workflow,
      status: "pending"
    });
  }

  const intentResolution = await resolveIntentV2({
    text: normalizedText
  });

  if (intentResolution.type === "unsupported") {
    return saveAndReturn({
      stateStore: dependencies.stateStore,
      state: workingState,
      reply:
        baseState.pendingFlow && !workingState.pendingFlow
          ? buildPendingFlowShiftedReply()
          : buildUnsupportedReply(),
      status: "unsupported"
    });
  }

  const initialSlotState = buildInitialSlotState(intentResolution.intent as WorkflowIntent);
  const resolution = await resolvePendingState({
    userId: input.userId,
    workflow: intentResolution.intent.workflow,
    slotState: initialSlotState,
    recentRefs: workingState.recentRefs
  });

  if (resolution.kind === "missing_slots") {
    const prompt = buildMissingSlotPrompt(intentResolution.intent.workflow, resolution.slotState.missingSlots);
    const pendingFlow = buildPendingFlow({
      workflow: intentResolution.intent.workflow,
      slotState: resolution.slotState,
      entityState: { status: "idle" },
      now,
      sourceMessageId: input.messageSid,
      prompt
    });

    return saveAndReturn({
      stateStore: dependencies.stateStore,
      state: {
        ...workingState,
        pendingFlow
      },
      reply: prompt,
      workflow: pendingFlow.workflow,
      status: "pending"
    });
  }

  if (resolution.kind === "entity_clarification") {
    const prompt = buildEntityClarificationReply();
    const pendingFlow = buildPendingFlow({
      workflow: intentResolution.intent.workflow,
      slotState: resolution.slotState,
      entityState: resolution.entityState,
      now,
      sourceMessageId: input.messageSid,
      prompt
    });

    return saveAndReturn({
      stateStore: dependencies.stateStore,
      state: {
        ...workingState,
        pendingFlow
      },
      reply: prompt,
      workflow: pendingFlow.workflow,
      status: "pending"
    });
  }

  if (resolution.kind === "confirmation") {
    const prompt = buildConfirmationReply(resolution.confirmationState.prompt);
    const pendingFlow = buildPendingFlow({
      workflow: intentResolution.intent.workflow,
      slotState: resolution.slotState,
      entityState: resolution.entityState,
      confirmationState: resolution.confirmationState,
      now,
      sourceMessageId: input.messageSid,
      prompt
    });

    return saveAndReturn({
      stateStore: dependencies.stateStore,
      state: {
        ...workingState,
        pendingFlow
      },
      reply: prompt,
      workflow: pendingFlow.workflow,
      status: "pending"
    });
  }

  const executionResult = await executeWorkflowAction({
    workflow: intentResolution.intent.workflow,
    slots: resolution.slotState.slots
  });

  if (!executionResult.completed) {
    const pendingFlow = buildPendingFlow({
      workflow: intentResolution.intent.workflow,
      slotState: resolution.slotState,
      entityState: resolution.entityState,
      now,
      sourceMessageId: input.messageSid,
      prompt: buildWorkflowReply(executionResult)
    });

    return saveAndReturn({
      stateStore: dependencies.stateStore,
      state: {
        ...workingState,
        pendingFlow
      },
      reply: buildWorkflowReply(executionResult),
      workflow: pendingFlow.workflow,
      status: "pending"
    });
  }

  return saveAndReturn({
    stateStore: dependencies.stateStore,
    state: {
      ...workingState,
      recentRefs: {
        ...workingState.recentRefs,
        ...executionResult.recentRefs
      },
      lastCompletedWorkflow: executionResult.workflow
    },
    reply: buildWorkflowReply(executionResult),
    workflow: executionResult.workflow,
    status: "completed"
  });
};
