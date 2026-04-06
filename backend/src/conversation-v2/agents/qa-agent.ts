// Owns conversational replies, clarifications, and user-facing workflow prompts.
import { buildBoundedAssistantReply } from "../../messaging/agent/bounded-chat";
import {
  buildConfirmationRetryReply,
  buildPendingFlowShiftedReply,
  buildUnsupportedReply
} from "../response/response-builder";
import type {
  ConversationQaAgentUnsupportedInput,
  ConversationQaAgentWorkflowReplyInput
} from "./agent-contracts";

export const buildQaChatReply = async (message: string) => {
  const chatReply = await buildBoundedAssistantReply({
    message,
    registered: true
  });

  return chatReply ?? "I can help with jobs, customers, payments, invoices, expenses, and reminders.";
};

export const buildQaUnsupportedReply = (input: ConversationQaAgentUnsupportedInput) => {
  return input.shiftedFromPendingFlow ? buildPendingFlowShiftedReply() : buildUnsupportedReply();
};

export const buildQaConfirmationRetryReply = () => buildConfirmationRetryReply();

export const buildQaWorkflowReply = (input: ConversationQaAgentWorkflowReplyInput) => {
  if (!input.prefix) {
    return input.reply;
  }

  if (!input.reply.trim()) {
    return input.prefix;
  }

  return `${input.prefix} ${input.reply}`;
};
