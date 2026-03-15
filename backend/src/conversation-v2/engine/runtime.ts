import type {
  ConversationStateV2,
  RouteIncomingMessageV2Input,
  RouteIncomingMessageV2Result
} from "./contracts";
import { buildUnsupportedReply } from "../response/response-builder";
import { createEmptyConversationStateV2, type ConversationStateStore } from "../state/state-store";

export type ConversationV2RuntimeDependencies = {
  stateStore: ConversationStateStore;
};

export const runConversationV2Turn = async (
  input: RouteIncomingMessageV2Input,
  dependencies: ConversationV2RuntimeDependencies
): Promise<RouteIncomingMessageV2Result> => {
  const existingState = await dependencies.stateStore.load(input.userId);
  const state: ConversationStateV2 = existingState ?? createEmptyConversationStateV2(input.userId);

  const nextState: ConversationStateV2 = {
    ...state,
    lastMessageAt: new Date().toISOString()
  };

  await dependencies.stateStore.save(nextState);

  return {
    reply: buildUnsupportedReply(),
    state: nextState,
    status: "unsupported"
  };
};

