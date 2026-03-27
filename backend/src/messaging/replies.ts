// Formats short and long reply text for messaging responses.
const SHORT_REPLY_LENGTH = 280;
const LONG_REPLY_LENGTH = 1500;

const normalizeReply = (message: string) =>
  message
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .trim();

const clipReply = (message: string, maxLength: number) => {
  const normalized = normalizeReply(message);
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
};

export const shortReply = (message: string) => clipReply(message, SHORT_REPLY_LENGTH);

export const longReply = (message: string) => clipReply(message, LONG_REPLY_LENGTH);

export const adminReply = (message: string, optionalAction?: string) =>
  shortReply(optionalAction ? `${message} ${optionalAction}` : message);

export const assistantReply = (message: string, optionalAction?: string) => {
  const normalizedMessage = message.trim();
  const action = optionalAction?.trim();

  if (!action) {
    return shortReply(normalizedMessage);
  }

  return shortReply(`${normalizedMessage} ${action}`);
};

export const detailedReply = (...parts: Array<string | undefined>) =>
  longReply(parts.filter((part): part is string => Boolean(part && part.trim())).join("\n"));

export const guideReply = (...parts: Array<string | undefined>) => detailedReply(...parts);
