export const selectAgentFlow = (useAgentFirst: boolean) =>
  useAgentFirst ? "agent_first" : "server_first";
