// Owns front-door routing decisions for Conversation V2.
import { emitConversationV2Event } from "../observability";
import { interpretConversationV2Semantically } from "../semantic/interpreter";
import { normalizeSemanticFrontDoorResult } from "../semantic/normalizer";
import type {
  ConversationRouterAgentDecision,
  ConversationRouterAgentInput
} from "./agent-contracts";

const LEADING_CHAT_PREFIX_PATTERN =
  /^(?:(?:hi|hello|hey|good morning|good afternoon|good evening|morning|afternoon|evening|thanks|thank you|cheers|please|can you|could you|would you|mate|buddy|pal)\b[\s,!?.-]*)+/i;

const PURE_CHAT_PATTERN =
  /^(?:hi|hello|hey|good morning|good afternoon|good evening|morning|afternoon|evening|thanks|thank you|cheers|nice one|appreciate it|how are you|how's it going|hows it going|you good|are you okay|i am not feeling good today|i'm not feeling good today|not feeling good today|feeling bad today|help|what can you do|what do you do|how can you help|who are you|ok|okay|cool|sounds good|alright|all good|great)[\s!?.]*$/i;

export const normalizeIncomingText = (text: string) => text.trim().replace(/\s+/g, " ");

export const hasConversationalPrefix = (text: string) => LEADING_CHAT_PREFIX_PATTERN.test(text.trim());

export const stripConversationalPrefix = (text: string) => text.replace(LEADING_CHAT_PREFIX_PATTERN, "").trim();

export const isPureChatMessage = (text: string) => PURE_CHAT_PATTERN.test(text.trim());

export const buildConversationalTaskPrefix = (text: string) => {
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

export const prependConversationalPrefix = (reply: string, prefix: string | null) => {
  if (!prefix) {
    return reply;
  }

  if (!reply.trim()) {
    return prefix;
  }

  return `${prefix} ${reply}`;
};

export const parseConfirmationAnswer = (text: string) => {
  const normalized = text.trim().toLowerCase();
  if (["yes", "y", "yeah", "yep", "confirm", "ok", "ok confirm"].includes(normalized)) {
    return "yes";
  }

  if (["no", "n", "nope", "cancel"].includes(normalized)) {
    return "no";
  }

  return "unknown";
};

export const routeWithConversationRouterAgent = async (
  input: ConversationRouterAgentInput
): Promise<ConversationRouterAgentDecision> => {
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
