// Defines the shared turn contract used by Conversation V2 agents.
import type {
  ConversationStateV2,
  EntityResolutionResult,
  PendingFlow,
  RecentRefs,
  RouteIncomingMessageV2Input,
  RouteIncomingMessageV2Result,
  WorkflowExecutionResult,
  WorkflowName
} from "../engine/contracts";
import type { ConversationV2SemanticLlmCaller } from "../semantic/interpreter";
import type { RuntimeNormalizedTurn } from "../semantic/normalizer";
import type { ConversationV2Services } from "../adapters/services";
import type { SlotFillResult } from "../slot/slot-filler";

export type ConversationAgentTurnContext = {
  now: Date;
  message: RouteIncomingMessageV2Input;
  state: ConversationStateV2;
  recentRefs: RecentRefs;
  normalizedText: string;
  strippedConversationalText: string;
  conversationalTaskPrefix: string | null;
};

export type ConversationRouterAgentInput = {
  userId: string;
  body: string;
  recentRefs: RecentRefs;
  pendingFlow?: Pick<PendingFlow, "workflow" | "step" | "slots" | "missingSlots" | "prompt">;
  semanticLlmCaller?: ConversationV2SemanticLlmCaller;
};

export type ConversationRouterAgentDecision = RuntimeNormalizedTurn | null;

export type ConversationQaAgentUnsupportedInput = {
  shiftedFromPendingFlow: boolean;
};

export type ConversationQaAgentWorkflowReplyInput = {
  reply: string;
  prefix: string | null;
};

export type PendingFunctionCallResolution =
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
      confirmationState: import("../engine/contracts").ConfirmationState;
    }
  | {
      kind: "ready";
      slotState: SlotFillResult;
      entityState: EntityResolutionResult;
    };

export type ConversationFunctionCallingReadinessInput = {
  userId: string;
  workflow: WorkflowName;
  slotState: SlotFillResult;
  recentRefs: ConversationStateV2["recentRefs"];
};

export type ConversationFunctionCallExecutionInput = {
  userId: string;
  workflow: WorkflowName;
  slots: Record<string, unknown>;
  entityState: EntityResolutionResult;
  services?: ConversationV2Services;
};

export type ConversationFunctionCallExecutionResult = WorkflowExecutionResult;

export type SaveTurnResultInput = {
  state: ConversationStateV2;
  reply: string;
  mediaUrl?: string;
  workflow?: WorkflowName;
  status: RouteIncomingMessageV2Result["status"];
  fallbackToV1?: boolean;
  delegatedCapability?: RouteIncomingMessageV2Result["delegatedCapability"];
};
