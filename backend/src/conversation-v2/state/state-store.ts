import type { ConversationStateV2 } from "../engine/contracts";

export type ConversationStateStore = {
  load(userId: string): Promise<ConversationStateV2 | null>;
  save(state: ConversationStateV2): Promise<void>;
};

export const createEmptyConversationStateV2 = (userId: string): ConversationStateV2 => ({
  userId,
  channel: "whatsapp",
  lastMessageAt: new Date(0).toISOString(),
  recentRefs: {},
  version: "v2"
});

export const createInMemoryConversationStateStore = (): ConversationStateStore => {
  const store = new Map<string, ConversationStateV2>();

  return {
    async load(userId) {
      return store.get(userId) ?? null;
    },
    async save(state) {
      store.set(state.userId, state);
    }
  };
};

