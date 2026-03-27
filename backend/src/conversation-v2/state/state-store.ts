// Provides state storage helpers for Conversation V2 conversations.
import type { ConversationStateV2, PendingFlow } from "../engine/contracts";
import { conversationStateV2Schema } from "./state-schema";

export const CONVERSATION_V2_STATE_NAMESPACE = "conversation-v2";

export type ConversationStateStore = {
  load(userId: string): Promise<ConversationStateV2 | null>;
  save(state: ConversationStateV2): Promise<void>;
  clear(userId: string): Promise<void>;
};

type StoredConversationStateRecord = {
  namespace: typeof CONVERSATION_V2_STATE_NAMESPACE;
  state: ConversationStateV2;
};

export type ConversationStateStoreOptions = {
  namespace?: typeof CONVERSATION_V2_STATE_NAMESPACE;
  now?: () => Date;
  onInvalidState?: (input: { userId: string; reason: string }) => void;
};

const DEFAULT_LAST_MESSAGE_AT = new Date(0).toISOString();

const cloneState = <T>(value: T): T => structuredClone(value);

const isPendingFlowExpired = (pendingFlow: PendingFlow, now: Date) => {
  const expiresAt = Date.parse(pendingFlow.expiresAt);
  if (Number.isNaN(expiresAt)) {
    return true;
  }

  return expiresAt <= now.getTime();
};

export const createEmptyConversationStateV2 = (userId: string): ConversationStateV2 => ({
  userId,
  channel: "whatsapp",
  lastMessageAt: DEFAULT_LAST_MESSAGE_AT,
  recentRefs: {},
  version: "v2"
});

export const normalizeConversationStateV2 = (
  state: ConversationStateV2,
  now: Date = new Date()
): ConversationStateV2 => {
  const parsed = conversationStateV2Schema.parse(state);

  if (!parsed.pendingFlow || !isPendingFlowExpired(parsed.pendingFlow, now)) {
    return parsed;
  }

  return {
    ...parsed,
    pendingFlow: undefined
  };
};

const buildStorageKey = (namespace: string, userId: string) => `${namespace}:${userId}`;

export const createInMemoryConversationStateStore = (
  options: ConversationStateStoreOptions = {}
): ConversationStateStore => {
  const namespace = options.namespace ?? CONVERSATION_V2_STATE_NAMESPACE;
  const now = options.now ?? (() => new Date());
  const store = new Map<string, StoredConversationStateRecord>();

  return {
    async load(userId) {
      const record = store.get(buildStorageKey(namespace, userId));
      if (!record) {
        return null;
      }

      try {
        const normalized = normalizeConversationStateV2(cloneState(record.state), now());
        return normalized;
      } catch {
        options.onInvalidState?.({
          userId,
          reason: "Stored V2 conversation state failed schema validation during load."
        });
        store.delete(buildStorageKey(namespace, userId));
        return null;
      }
    },

    async save(state) {
      const normalized = normalizeConversationStateV2(cloneState(state), now());
      store.set(buildStorageKey(namespace, normalized.userId), {
        namespace,
        state: normalized
      });
    },

    async clear(userId) {
      store.delete(buildStorageKey(namespace, userId));
    }
  };
};
