// Implements helper logic for the legacy bounded business assistant.
import crypto from "crypto";
import { env } from "../../config/env";

type AgentEvent = {
  event: string;
  requestId: string;
  at: string;
  data: Record<string, unknown>;
};

export const createAgentRequestId = () => crypto.randomUUID();

export const emitAgentEvent = (event: string, requestId: string, data: Record<string, unknown>) => {
  if (!env.AGENT_OBSERVABILITY_ENABLED) {
    return;
  }

  const payload: AgentEvent = {
    event,
    requestId,
    at: new Date().toISOString(),
    data
  };

  console.info(JSON.stringify(payload));
};
