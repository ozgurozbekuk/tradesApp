import { env } from "../config/env";

type ConversationV2Event = {
  event: string;
  at: string;
  data: Record<string, unknown>;
};

export const emitConversationV2Event = (event: string, data: Record<string, unknown>) => {
  if (!env.AGENT_OBSERVABILITY_ENABLED) {
    return;
  }

  const payload: ConversationV2Event = {
    event,
    at: new Date().toISOString(),
    data
  };

  console.info(JSON.stringify(payload));
};
