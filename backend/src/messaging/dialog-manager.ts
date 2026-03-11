import { env } from "../config/env";
import type { AgentParseContext, ParsedUserIntent } from "./agent/agent-types";
import type { SemanticCapabilityName } from "./semantic-agent/types";

type SupportedCapability = Exclude<SemanticCapabilityName, "unknown">;

type DialogManagerStructuredOutput =
  | {
      kind: "reply";
      reply: string;
    }
  | {
      kind: "continue";
      rewrittenMessage?: string;
      clearPendingFlow?: boolean;
    }
  | {
      kind: "pending_resolution";
      capability: SupportedCapability;
      entities?: Record<string, unknown>;
      missingFields?: string[];
      question?: string;
      clearPendingFlow?: boolean;
    }
  | {
      kind: "unknown";
    };

export type DialogManagerResult =
  | {
      status: "reply";
      reply: string;
    }
  | {
      status: "continue";
      message: string;
      clearPendingFlow: boolean;
    }
  | {
      status: "pending_resolution";
      capability: SupportedCapability;
      entities: Record<string, unknown>;
      missingFields: string[];
      question?: string;
      clearPendingFlow: boolean;
    }
  | {
      status: "unknown";
    };

export type DialogManagerLlmCaller = (input: {
  message: string;
  context?: AgentParseContext;
}) => Promise<DialogManagerStructuredOutput | null>;

const mapPendingIntentToCapability = (
  intent?: ParsedUserIntent["intent"]
): SupportedCapability | undefined => {
  if (!intent || intent === "unknown" || intent === "clarification_needed") {
    return undefined;
  }

  if (intent === "search_customer") {
    return "search_customers";
  }
  if (intent === "get_customer_account") {
    return "get_customer_balance";
  }
  if (intent === "vendor_summary") {
    return "get_vendor_summary";
  }
  if (intent === "list_debts") {
    return "list_due_payments";
  }

  return intent as SupportedCapability;
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const RECORDS_TOPIC_PATTERN = /\b(record|records|account|accounts|pdf|export|bring|show|find|open)\b/i;
const BOOKING_TOPIC_PATTERN = /\b(book|booking|schedule|scheduled|tomorrow|today|am|pm)\b/i;
const CORRECTION_PATTERN =
  /^(?:no\b|not\b|not booking\b|not that\b|not this\b|i mean\b|i meant\b|no i meant\b|wrong\b)/i;

const detectDeterministicTopicShift = (input: {
  message: string;
  context?: AgentParseContext;
}): DialogManagerResult | null => {
  const pendingIntent = input.context?.pendingFlow?.intent;
  if (!pendingIntent) {
    return null;
  }

  const text = normalize(input.message);
  if (!text) {
    return null;
  }

  if (
    pendingIntent === "create_booking" &&
    (CORRECTION_PATTERN.test(text) || text.startsWith("not booking")) &&
    RECORDS_TOPIC_PATTERN.test(text)
  ) {
    return {
      status: "continue",
      message: input.message.replace(/^not booking[, ]*/i, "").trim() || input.message,
      clearPendingFlow: true
    };
  }

  if (pendingIntent === "create_booking" && !BOOKING_TOPIC_PATTERN.test(text) && RECORDS_TOPIC_PATTERN.test(text)) {
    return {
      status: "continue",
      message: input.message,
      clearPendingFlow: true
    };
  }

  return null;
};

const DIALOG_MANAGER_SYSTEM_PROMPT = `You are the conversation-state manager for a WhatsApp trades assistant.

Your job:
- decide whether the user's latest message is answering the previous assistant question, correcting it, starting a new request, or just chatting
- if it answers a pending question, merge the new answer into the pending task state
- do not execute business logic
- do not invent data
- return JSON only

Rules:
- Use recentTurns and pendingFlow as the main memory.
- Very short messages like "active", "completed", "that one", "boiler repair", "yes", or a bare name usually answer the previous assistant question.
- If the user is clearly changing topic or starting over, return kind "continue" and set clearPendingFlow to true.
- If the user is correcting the previous assumption, return kind "continue" with a rewrittenMessage that captures the correction cleanly.
- If the user is answering a pending question, return kind "pending_resolution".
- When returning kind "pending_resolution", include the merged entities and the remaining missingFields.
- If pendingResolution still lacks one field, include a short question for only that field.
- If the message is simple small talk, return kind "reply".

Output shapes:
{"kind":"reply","reply":"short reply"}
{"kind":"continue","rewrittenMessage":"normalized user request","clearPendingFlow":true}
{"kind":"pending_resolution","capability":"update_job_status","entities":{"customerQuery":"John","status":"completed","jobQuery":"boiler repair"},"missingFields":[],"clearPendingFlow":true}
{"kind":"pending_resolution","capability":"update_job_status","entities":{"customerQuery":"John","status":"completed"},"missingFields":["jobId"],"question":"Which of John's jobs should I mark as completed?","clearPendingFlow":false}
{"kind":"unknown"}
`;

const summarizeContextForPrompt = (context?: AgentParseContext) => ({
  lastCustomer: context?.lastCustomerLabel ?? null,
  lastJob: context?.lastJobLabel ?? null,
  lastIntent: context?.lastIntent ?? null,
  pendingFlow: context?.pendingFlow
    ? {
        intent: context.pendingFlow.intent,
        mappedCapability: mapPendingIntentToCapability(context.pendingFlow.intent) ?? null,
        entities: context.pendingFlow.entities,
        missingFields: context.pendingFlow.missingFields,
        followUpQuestion: context.pendingFlow.followUpQuestion ?? null
      }
    : null,
  recentTurns: context?.recentTurns ?? [],
  recentCandidates: context?.lastResolvedCandidates ?? [],
  learnedAliases: context?.learnedAliases ?? [],
  learnedIntentHints: context?.learnedIntentHints ?? []
});

const parseJsonObject = (content: string): DialogManagerStructuredOutput | null => {
  try {
    return JSON.parse(content) as DialogManagerStructuredOutput;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]) as DialogManagerStructuredOutput;
    } catch {
      return null;
    }
  }
};

export const callDialogManagerOpenAi: DialogManagerLlmCaller = async (input) => {
  if (!env.LLM_PROVIDER || !env.LLM_API_KEY) {
    return null;
  }

  if (env.LLM_PROVIDER.toLowerCase() !== "openai") {
    return null;
  }

  const model = env.LLM_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LLM_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DIALOG_MANAGER_SYSTEM_PROMPT },
        {
          role: "system",
          content: `Conversation context: ${JSON.stringify(summarizeContextForPrompt(input.context))}`
        },
        { role: "user", content: input.message }
      ]
    })
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  return content ? parseJsonObject(content) : null;
};

export const manageDialogTurn = async (
  input: {
    message: string;
    context?: AgentParseContext;
  },
  llmCaller: DialogManagerLlmCaller = callDialogManagerOpenAi
): Promise<DialogManagerResult> => {
  const deterministicShift = detectDeterministicTopicShift(input);
  if (deterministicShift) {
    return deterministicShift;
  }

  const structured = await llmCaller(input);
  if (!structured) {
    return { status: "unknown" };
  }

  if (structured.kind === "reply") {
    const reply = structured.reply.trim();
    return reply ? { status: "reply", reply } : { status: "unknown" };
  }

  if (structured.kind === "continue") {
    return {
      status: "continue",
      message: structured.rewrittenMessage?.trim() || input.message,
      clearPendingFlow: structured.clearPendingFlow === true
    };
  }

  if (structured.kind === "pending_resolution") {
    return {
      status: "pending_resolution",
      capability: structured.capability,
      entities: structured.entities ?? {},
      missingFields: structured.missingFields ?? [],
      question: structured.question?.trim() || undefined,
      clearPendingFlow: structured.clearPendingFlow !== false
    };
  }

  return { status: "unknown" };
};
