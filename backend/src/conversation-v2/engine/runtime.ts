// Runs the Conversation V2 turn lifecycle, from interpretation to workflow execution.
import { env } from "../../config/env";
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
import { emitConversationV2Event } from "../observability";
import type { ConversationV2SemanticLlmCaller } from "../semantic/interpreter";
import { interpretConversationV2Semantically } from "../semantic/interpreter";
import { normalizeSemanticFrontDoorResult } from "../semantic/normalizer";
import { resolveWorkflowConfirmation } from "../confirmation/confirmation-handler";
import { resolveAmbiguousEntitySelection } from "../entity/disambiguation";
import { resolveWorkflowEntities } from "../entity/entity-resolver";
import { executeWorkflowAction } from "../execution/action-executor";
import { resolveIntentV2, type IntentResolutionResult } from "../intent/intent-resolver";
import {
  buildConfirmationReply,
  buildConfirmationRetryReply,
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
import { workflowIntentSchema } from "../intent/intent-schema";
import { buildBoundedAssistantReply } from "../../messaging/agent/bounded-chat";

export type ConversationV2RuntimeDependencies = {
  stateStore: ConversationStateStore;
  services?: import("../adapters/services").ConversationV2Services;
  semanticLlmCaller?: ConversationV2SemanticLlmCaller;
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

const LEADING_CHAT_PREFIX_PATTERN =
  /^(?:(?:hi|hello|hey|good morning|good afternoon|good evening|morning|afternoon|evening|thanks|thank you|cheers|please|can you|could you|would you|mate|buddy|pal)\b[\s,!?.-]*)+/i;

const PURE_CHAT_PATTERN =
  /^(?:hi|hello|hey|good morning|good afternoon|good evening|morning|afternoon|evening|thanks|thank you|cheers|nice one|appreciate it|how are you|how's it going|hows it going|you good|are you okay|help|what can you do|what do you do|how can you help|who are you|ok|okay|cool|sounds good|alright|all good|great)[\s!?.]*$/i;

const hasConversationalPrefix = (text: string) => LEADING_CHAT_PREFIX_PATTERN.test(text.trim());

const stripConversationalPrefix = (text: string) => text.replace(LEADING_CHAT_PREFIX_PATTERN, "").trim();

const isPureChatMessage = (text: string) => PURE_CHAT_PATTERN.test(text.trim());

const buildConversationalTaskPrefix = (text: string) => {
  const normalized = text.trim().toLowerCase();
  if (/thank|thanks|cheers|nice one|appreciate it/.test(normalized)) {
    return "No problem.";
  }

  if (/^(?:hi|hello|hey|good morning|good afternoon|good evening|morning|afternoon|evening)\b/.test(normalized)) {
    return "Sure.";
  }

  if (/^(?:can you|could you|would you|please)\b/.test(normalized)) {
    return "Of course.";
  }

  return null;
};

const prependConversationalPrefix = (reply: string, prefix: string | null) => {
  if (!prefix) {
    return reply;
  }

  if (!reply.trim()) {
    return prefix;
  }

  return `${prefix} ${reply}`;
};

const readSemanticFrontDoorEnabled = () =>
  process.env.USE_V2_SEMANTIC_FRONT_DOOR === undefined
    ? env.USE_V2_SEMANTIC_FRONT_DOOR
    : process.env.USE_V2_SEMANTIC_FRONT_DOOR === "true";

const parseConfirmationAnswer = (text: string) => {
  const normalized = text.trim().toLowerCase();
  if (["yes", "y", "yeah", "yep", "confirm", "ok", "ok confirm"].includes(normalized)) {
    return "yes";
  }

  if (["no", "n", "nope", "cancel"].includes(normalized)) {
    return "no";
  }

  return "unknown";
};

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

const saveAndReturn = async (input: {
  stateStore: ConversationStateStore;
  state: ConversationStateV2;
  reply: string;
  mediaUrl?: string;
  workflow?: WorkflowName;
  status: RouteIncomingMessageV2Result["status"];
  fallbackToV1?: boolean;
  delegatedCapability?: RouteIncomingMessageV2Result["delegatedCapability"];
}): Promise<RouteIncomingMessageV2Result> => {
  await input.stateStore.save(input.state);

  return {
    reply: input.reply,
    mediaUrl: input.mediaUrl,
    state: input.state,
    workflow: input.workflow,
    status: input.status,
    fallbackToV1: input.fallbackToV1,
    delegatedCapability: input.delegatedCapability
  };
};

const buildEmptyWorkflowIntent = (workflow: WorkflowName): WorkflowIntent =>
  workflowIntentSchema.parse({
    workflow,
    confidence: "low",
    fields: {}
  });

const resolveSemanticNormalizedTurn = async (input: {
  userId: string;
  body: string;
  recentRefs: ConversationStateV2["recentRefs"];
  pendingFlow?: Pick<PendingFlow, "workflow" | "step" | "slots" | "missingSlots" | "prompt">;
  semanticLlmCaller?: ConversationV2SemanticLlmCaller;
}) => {
  if (!readSemanticFrontDoorEnabled()) {
    emitConversationV2Event("conversation_v2.semantic.skipped", {
      userId: input.userId,
      reason: "flag_disabled"
    });
    return null;
  }

  const semanticResult = await interpretConversationV2Semantically(
    {
      message: input.body,
      recentRefs: input.recentRefs,
      pendingFlow: input.pendingFlow
    },
    input.semanticLlmCaller
  );

  const normalized = normalizeSemanticFrontDoorResult(semanticResult);
  emitConversationV2Event("conversation_v2.semantic.result", {
    userId: input.userId,
    type: normalized.type,
    pendingWorkflow: input.pendingFlow?.workflow,
    pendingStep: input.pendingFlow?.step,
    workflow: normalized.type === "workflow_intent" ? normalized.intent.workflow : undefined,
    mode: normalized.type === "workflow_intent" ? normalized.mode : undefined,
    delegatedCapability: normalized.type === "delegate_to_v1" ? normalized.capability : undefined,
    hasClarificationQuestion: normalized.type === "clarification",
    reason: normalized.type === "unknown" ? normalized.reason : undefined
  });

  return normalized.type === "unknown" ? null : normalized;
};

export const runConversationV2Turn = async (
  input: RouteIncomingMessageV2Input,
  dependencies: ConversationV2RuntimeDependencies
): Promise<RouteIncomingMessageV2Result> => {
  const now = new Date();
  const existingState = await dependencies.stateStore.load(input.userId);
  const state: ConversationStateV2 = existingState ?? createEmptyConversationStateV2(input.userId);
  const normalizedText = normalizeIncomingText(input.body);
  const strippedConversationalText = stripConversationalPrefix(normalizedText);
  const conversationalTaskPrefix = hasConversationalPrefix(normalizedText)
    ? buildConversationalTaskPrefix(normalizedText)
    : null;

  const baseState: ConversationStateV2 = {
    ...state,
    lastMessageAt: now.toISOString()
  };

  let workingState = baseState;
  let carriedIntentResolution: IntentResolutionResult | null = null;
  let shiftedPendingWorkflow: WorkflowName | undefined;

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
      shiftedPendingWorkflow = workingState.pendingFlow.workflow;
      workingState = {
        ...workingState,
        pendingFlow: undefined
      };
    }
  }

  if (workingState.pendingFlow) {
    const pendingFlowBeforeHeuristic = workingState.pendingFlow;

    if (workingState.pendingFlow.step === "confirmation" && workingState.pendingFlow.confirmationState) {
      const confirmationAnswer = parseConfirmationAnswer(normalizedText);

      if (confirmationAnswer === "no") {
        return saveAndReturn({
          stateStore: dependencies.stateStore,
          state: {
            ...workingState,
            pendingFlow: undefined
          },
          reply: buildPendingFlowCanceledReply(),
          workflow: workingState.pendingFlow.workflow,
          status: "unsupported"
        });
      }

      if (confirmationAnswer === "yes") {
        const executionResult = await executeWorkflowAction({
          userId: input.userId,
          workflow: workingState.pendingFlow.workflow,
          slots: workingState.pendingFlow.slots,
          entityState: workingState.pendingFlow.entityState,
          services: dependencies.services
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
            mediaUrl: executionResult.mediaUrl,
            workflow: executionResult.workflow,
            status: "completed"
          });
        }

        return saveAndReturn({
          stateStore: dependencies.stateStore,
          state: workingState,
          reply: buildWorkflowReply(executionResult),
          workflow: workingState.pendingFlow.workflow,
          status: "pending"
        });
      }

      return saveAndReturn({
        stateStore: dependencies.stateStore,
        state: workingState,
        reply: buildConfirmationRetryReply(),
        workflow: workingState.pendingFlow.workflow,
        status: "pending"
      });
    }

    if (workingState.pendingFlow.step === "entity_resolution" && workingState.pendingFlow.entityState.status === "ambiguous") {
      const selectedEntityState = resolveAmbiguousEntitySelection(workingState.pendingFlow.entityState, input.body);

      if (selectedEntityState?.status === "resolved") {
        const confirmation = await resolveWorkflowConfirmation({
          userId: input.userId,
          workflow: workingState.pendingFlow.workflow,
          slots: workingState.pendingFlow.slots,
          entityState: selectedEntityState
        });

        if (confirmation.type === "required") {
          const prompt = buildConfirmationReply(confirmation.confirmation);
          const pendingFlow = buildPendingFlow({
            workflow: workingState.pendingFlow.workflow,
            slotState: {
              workflow: workingState.pendingFlow.workflow,
              slots: workingState.pendingFlow.slots,
              missingSlots: workingState.pendingFlow.missingSlots,
              validationErrors: []
            },
            entityState: selectedEntityState,
            confirmationState: confirmation.confirmation,
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
          userId: input.userId,
          workflow: workingState.pendingFlow.workflow,
          slots: workingState.pendingFlow.slots,
          entityState: selectedEntityState,
          services: dependencies.services
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
            mediaUrl: executionResult.mediaUrl,
            workflow: executionResult.workflow,
            status: "completed"
          });
        }
      }
    }

    const semanticPendingTurn = await resolveSemanticNormalizedTurn({
      userId: input.userId,
      body: input.body,
      recentRefs: workingState.recentRefs,
      pendingFlow: workingState.pendingFlow,
      semanticLlmCaller: dependencies.semanticLlmCaller
    });

    const heuristicPendingIntent = await resolveIntentV2({
      text: normalizedText
    });

    if (
      heuristicPendingIntent.type === "intent" &&
      heuristicPendingIntent.intent.workflow !== pendingFlowBeforeHeuristic.workflow
    ) {
      workingState = {
        ...workingState,
        pendingFlow: undefined
      };
      carriedIntentResolution = heuristicPendingIntent;
    }

    if (carriedIntentResolution) {
      emitConversationV2Event("conversation_v2.pending.shifted_by_heuristic_intent", {
        userId: input.userId,
        previousWorkflow: state.pendingFlow?.workflow,
        nextWorkflow: carriedIntentResolution.intent.workflow
      });
    } else if (
      semanticPendingTurn?.type === "clarification" &&
      (!semanticPendingTurn.workflow || semanticPendingTurn.workflow === pendingFlowBeforeHeuristic.workflow)
    ) {
      emitConversationV2Event("conversation_v2.semantic.pending_clarification", {
        userId: input.userId,
        workflow: pendingFlowBeforeHeuristic.workflow,
        question: semanticPendingTurn.question
      });

      const pendingFlow = {
        ...pendingFlowBeforeHeuristic,
        prompt: semanticPendingTurn.question,
        updatedAt: now.toISOString()
      };

      return saveAndReturn({
        stateStore: dependencies.stateStore,
        state: {
          ...workingState,
          pendingFlow
        },
        reply: semanticPendingTurn.question,
        workflow: pendingFlow.workflow,
        status: "pending"
      });
    }

    if (!workingState.pendingFlow) {
      // Fresh intent will be handled by the main path below.
    } else {
      const continuationFields =
        semanticPendingTurn?.type === "workflow_intent" &&
        semanticPendingTurn.mode === "continue_pending" &&
        semanticPendingTurn.intent.workflow === workingState.pendingFlow.workflow
          ? (semanticPendingTurn.intent.fields as Record<string, unknown>)
          : heuristicPendingIntent.type === "intent" &&
              heuristicPendingIntent.intent.workflow === workingState.pendingFlow.workflow
            ? (heuristicPendingIntent.intent.fields as Record<string, unknown>)
            : extractContinuationFields(workingState.pendingFlow, input.body);

      if (
        semanticPendingTurn?.type === "workflow_intent" &&
        semanticPendingTurn.mode === "continue_pending" &&
        semanticPendingTurn.intent.workflow === workingState.pendingFlow.workflow
      ) {
        emitConversationV2Event("conversation_v2.semantic.pending_continue", {
          userId: input.userId,
          workflow: workingState.pendingFlow.workflow,
          filledKeys: Object.keys(semanticPendingTurn.intent.fields)
        });
      }

      const slotState = mergePendingFlowSlots(workingState.pendingFlow, continuationFields);
      const resolution = await resolvePendingState({
        userId: input.userId,
        workflow: workingState.pendingFlow.workflow,
        slotState,
        recentRefs: workingState.recentRefs
      });

      if (resolution.kind === "missing_slots") {
        const prompt = buildMissingSlotPrompt({
          workflow: workingState.pendingFlow.workflow,
          missingSlots: resolution.slotState.missingSlots,
          validationErrors: resolution.slotState.validationErrors
        });
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
        const prompt = buildEntityClarificationReply({
          workflow: workingState.pendingFlow.workflow,
          entityState: resolution.entityState
        });
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
        const prompt = buildConfirmationReply(resolution.confirmationState);
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
        userId: input.userId,
        workflow: workingState.pendingFlow.workflow,
        slots: resolution.slotState.slots,
        entityState: resolution.entityState,
        services: dependencies.services
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
          mediaUrl: executionResult.mediaUrl,
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
  }

  if (isPureChatMessage(normalizedText)) {
    const chatReply = await buildBoundedAssistantReply({
      message: normalizedText,
      registered: true
    });

    return saveAndReturn({
      stateStore: dependencies.stateStore,
      state: workingState,
      reply: chatReply ?? "I can help with jobs, customers, payments, invoices, expenses, and reminders.",
      status: "completed"
    });
  }

  const semanticFreshTurn = carriedIntentResolution
    ? null
    : await resolveSemanticNormalizedTurn({
        userId: input.userId,
        body: input.body,
        recentRefs: workingState.recentRefs,
        semanticLlmCaller: dependencies.semanticLlmCaller
      });

  const normalizedSemanticFreshTurn =
    shiftedPendingWorkflow &&
    semanticFreshTurn?.type === "clarification" &&
    semanticFreshTurn.workflow === shiftedPendingWorkflow
      ? null
      : semanticFreshTurn;

  if (normalizedSemanticFreshTurn?.type === "respond") {
    emitConversationV2Event("conversation_v2.semantic.respond", {
      userId: input.userId
    });

    return saveAndReturn({
      stateStore: dependencies.stateStore,
      state: workingState,
      reply: prependConversationalPrefix(normalizedSemanticFreshTurn.message, conversationalTaskPrefix),
      status: "completed"
    });
  }

  if (normalizedSemanticFreshTurn?.type === "delegate_to_v1") {
    emitConversationV2Event("conversation_v2.semantic.delegate_to_v1", {
      userId: input.userId,
      capability: normalizedSemanticFreshTurn.capability
    });

    return saveAndReturn({
      stateStore: dependencies.stateStore,
      state: workingState,
      reply: buildUnsupportedReply(),
      status: "unsupported",
      fallbackToV1: true,
      delegatedCapability: normalizedSemanticFreshTurn.capability
    });
  }

  if (normalizedSemanticFreshTurn?.type === "clarification") {
    emitConversationV2Event("conversation_v2.semantic.fresh_clarification", {
      userId: input.userId,
      workflow: normalizedSemanticFreshTurn.workflow,
      missingFields: normalizedSemanticFreshTurn.missingFields
    });

    if (!normalizedSemanticFreshTurn.workflow) {
      return saveAndReturn({
        stateStore: dependencies.stateStore,
        state: workingState,
        reply: normalizedSemanticFreshTurn.question,
        status: "pending"
      });
    }

    const emptyIntent = buildEmptyWorkflowIntent(normalizedSemanticFreshTurn.workflow);
    const initialSlotState = buildInitialSlotState(emptyIntent);
    const slotState = {
      ...initialSlotState,
      missingSlots: normalizedSemanticFreshTurn.missingFields ?? initialSlotState.missingSlots
    };
    const pendingFlow = buildPendingFlow({
      workflow: normalizedSemanticFreshTurn.workflow,
      slotState,
      entityState: { status: "idle" },
      now,
      sourceMessageId: input.messageSid,
      prompt: normalizedSemanticFreshTurn.question
    });

    return saveAndReturn({
      stateStore: dependencies.stateStore,
      state: {
        ...workingState,
        pendingFlow
      },
      reply: normalizedSemanticFreshTurn.question,
      workflow: pendingFlow.workflow,
      status: "pending"
    });
  }

  const intentResolution =
    carriedIntentResolution ??
    (normalizedSemanticFreshTurn?.type === "workflow_intent" && normalizedSemanticFreshTurn.mode === "fresh"
      ? {
          type: "intent" as const,
          intent: normalizedSemanticFreshTurn.intent
        }
      : await resolveIntentV2({
          text: normalizedText
        }));

  const normalizedIntentResolution =
    intentResolution.type === "unsupported" && strippedConversationalText && strippedConversationalText !== normalizedText
      ? await resolveIntentV2({
          text: strippedConversationalText
        })
      : intentResolution;

  emitConversationV2Event("conversation_v2.runtime.intent_path", {
    userId: input.userId,
    semanticUsed: Boolean(
      normalizedSemanticFreshTurn?.type === "workflow_intent" && normalizedSemanticFreshTurn.mode === "fresh"
    ),
    semanticType: normalizedSemanticFreshTurn?.type,
    resultType: normalizedIntentResolution.type,
    workflow: normalizedIntentResolution.type === "intent" ? normalizedIntentResolution.intent.workflow : undefined
  });

  if (normalizedIntentResolution.type === "unsupported") {
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

  const initialSlotState = buildInitialSlotState(normalizedIntentResolution.intent as WorkflowIntent);
  const resolvedIntent = normalizedIntentResolution.intent;
  const resolution = await resolvePendingState({
    userId: input.userId,
    workflow: resolvedIntent.workflow,
    slotState: initialSlotState,
    recentRefs: workingState.recentRefs
  });

  if (resolution.kind === "missing_slots") {
    const prompt = buildMissingSlotPrompt({
      workflow: resolvedIntent.workflow,
      missingSlots: resolution.slotState.missingSlots,
      validationErrors: resolution.slotState.validationErrors
    });
    const pendingFlow = buildPendingFlow({
      workflow: resolvedIntent.workflow,
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
    const prompt = buildEntityClarificationReply({
      workflow: resolvedIntent.workflow,
      entityState: resolution.entityState
    });
    const pendingFlow = buildPendingFlow({
      workflow: resolvedIntent.workflow,
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
    const prompt = buildConfirmationReply(resolution.confirmationState);
    const pendingFlow = buildPendingFlow({
      workflow: resolvedIntent.workflow,
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
    userId: input.userId,
    workflow: resolvedIntent.workflow,
    slots: resolution.slotState.slots,
    entityState: resolution.entityState,
    services: dependencies.services
  });

  if (!executionResult.completed) {
    const pendingFlow = buildPendingFlow({
      workflow: resolvedIntent.workflow,
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
        reply: prependConversationalPrefix(buildWorkflowReply(executionResult), conversationalTaskPrefix),
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
    reply: prependConversationalPrefix(buildWorkflowReply(executionResult), conversationalTaskPrefix),
    mediaUrl: executionResult.mediaUrl,
    workflow: executionResult.workflow,
    status: "completed"
  });
};
