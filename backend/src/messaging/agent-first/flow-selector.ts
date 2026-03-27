// Implements the agent-first orchestration layer for legacy messaging.
export const selectAgentFlow = (useAgentFirst: boolean) =>
  useAgentFirst ? "agent_first" : "server_first";
