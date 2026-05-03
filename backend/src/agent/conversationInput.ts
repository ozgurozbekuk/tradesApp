export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type BuildConversationInputArgs = {
  userMessage: string;
  history?: ConversationMessage[];
};

export const buildConversationInput = (args: BuildConversationInputArgs) => {
  const historyLines = (args.history ?? []).map(
    (message, index) => `${index + 1}. ${message.role.toUpperCase()}: ${message.content}`
  );

  return [
    "WhatsApp conversation context:",
    historyLines.length > 0 ? historyLines.join("\n") : "No prior history.",
    "",
    `Latest user message: ${args.userMessage}`
  ].join("\n");
};
