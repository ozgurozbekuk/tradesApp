import type { ConversationMessage } from "../conversationInput";

export type AgentConversationState = {
  userId: string;
  recentTurns: ConversationMessage[];
  updatedAt: string;
};

export type AgentConversationStateStore = {
  load(userId: string): Promise<AgentConversationState | null>;
  appendTurn(userId: string, message: ConversationMessage): Promise<void>;
  clear(userId: string): Promise<void>;
};

type InMemoryStateStoreOptions = {
  ttlMs?: number;
  maxTurns?: number;
  now?: () => Date;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_TURNS = 12;

const cloneMessage = (message: ConversationMessage): ConversationMessage => ({
  role: message.role,
  content: message.content
});

export const createInMemoryAgentConversationStateStore = (
  options: InMemoryStateStoreOptions = {}
): AgentConversationStateStore => {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const now = options.now ?? (() => new Date());
  const store = new Map<string, AgentConversationState>();

  const loadFreshState = (userId: string) => {
    const state = store.get(userId);
    if (!state) {
      return null;
    }

    const updatedAtMs = Date.parse(state.updatedAt);
    if (Number.isNaN(updatedAtMs) || now().getTime() - updatedAtMs > ttlMs) {
      store.delete(userId);
      return null;
    }

    return {
      userId: state.userId,
      updatedAt: state.updatedAt,
      recentTurns: state.recentTurns.map(cloneMessage)
    };
  };

  return {
    async load(userId) {
      return loadFreshState(userId);
    },

    async appendTurn(userId, message) {
      const content = message.content.trim();
      if (!content) {
        return;
      }

      const existing = loadFreshState(userId);
      const recentTurns = [...(existing?.recentTurns ?? []), { role: message.role, content }].slice(-maxTurns);

      store.set(userId, {
        userId,
        recentTurns,
        updatedAt: now().toISOString()
      });
    },

    async clear(userId) {
      store.delete(userId);
    }
  };
};

export const agentConversationStateStore = createInMemoryAgentConversationStateStore();
