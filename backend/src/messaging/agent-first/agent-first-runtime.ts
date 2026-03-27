// Implements the agent-first orchestration layer for legacy messaging.
import { env } from "../../config/env";
import type { TodayPlanSnapshot } from "../../services/reminders.service";
import type { AgentParseContext } from "../agent/agent-types";
import {
  buildIntentFromAgentFirstToolCall,
  formatToolValidationError
} from "./agent-first-tools";
import type {
  AgentFirstLlmInput,
  AgentFirstResult,
  AgentFirstStructuredDecision,
  AgentFirstToolName
} from "./agent-first-types";

type NativeToolExecutor = (input: {
  toolName: AgentFirstToolName;
  toolInput?: Record<string, unknown>;
}) => Promise<
  | {
      status: "handled";
      reply: string;
      mediaUrl?: string;
    }
  | {
      status: "not_handled";
    }
>;

type ToolReplyLlmCaller = (input: {
  message: string;
  context?: AgentParseContext;
  toolName: AgentFirstToolName;
  toolInput?: Record<string, unknown>;
  toolResult: Record<string, unknown>;
}) => Promise<string | null>;

const TOOL_REPLY_SYSTEM_PROMPT = `You are a WhatsApp business admin assistant for a self-employed tradesperson in the UK.

You are given:
- the user's original message
- the safe server tool that was executed
- the server tool result

Write the final WhatsApp reply.

Rules:
- English only.
- Keep it concise and natural.
- Use the tool result only. Do not invent facts.
- If the result looks like a planning snapshot, turn it into a helpful day plan.
- Prefer short paragraphs over long lists, but a short list is fine if it helps.
- Do not mention tools, JSON, policies, or internal systems.
- Return plain text only.`;

const formatPounds = (value: number) => `£${(value / 100).toFixed(2)}`;

const buildTodayPlanFallbackReply = (plan: TodayPlanSnapshot) => {
  const lines = [
    `Today looks like ${plan.scheduledToday} booked job${plan.scheduledToday === 1 ? "" : "s"}, ${plan.dueSoonCount} due soon, and ${plan.overdueCount} overdue.`,
    `Outstanding payments sit at ${formatPounds(plan.outstandingTotalPence)}.`
  ];

  if (plan.todayJobs.length) {
    const jobs = plan.todayJobs
      .slice(0, 3)
      .map((job) => `${job.customerName} - ${job.title}`)
      .join(" | ");
    lines.push(`Today's jobs: ${jobs}.`);
  }

  if (plan.overdueCount > 0) {
    lines.push("Start with the overdue work first, then the jobs already booked for today.");
  } else if (plan.dueSoonCount > 0) {
    lines.push("Priority should be today's bookings first, then anything due soon.");
  }

  return lines.join(" ");
};

const parseTextFromChatCompletion = (data: {
  choices?: Array<{ message?: { content?: string | null } }>;
}) => data.choices?.[0]?.message?.content?.trim() || null;

export const callToolReplyOpenAi: ToolReplyLlmCaller = async (input) => {
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
      temperature: 0.2,
      messages: [
        { role: "system", content: TOOL_REPLY_SYSTEM_PROMPT },
        {
          role: "system",
          content: `Context: ${JSON.stringify({
            userMessage: input.message,
            toolName: input.toolName,
            toolInput: input.toolInput ?? {},
            toolResult: input.toolResult,
            agentContext: input.context ?? null
          })}`
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

  return parseTextFromChatCompletion(data);
};

export const executeAgentFirstStructuredDecision = async (input: {
  structured: AgentFirstStructuredDecision;
  message: string;
  context?: AgentParseContext;
  nativeToolExecutor?: NativeToolExecutor;
  toolReplyLlmCaller?: ToolReplyLlmCaller;
}): Promise<AgentFirstResult> => {
  const { structured } = input;

  if (structured.type === "respond") {
    const text = structured.message.trim();
    return text ? { status: "response", reply: text, source: "assistant" } : { status: "unknown" };
  }

  if (structured.type === "clarify") {
    const question = structured.question.trim();
    if (!question) {
      return { status: "unknown" };
    }

    return {
      status: "clarification",
      question
    };
  }

  if (structured.type !== "call_tool") {
    return { status: "unknown" };
  }

  if (input.nativeToolExecutor) {
    const nativeResult = await input.nativeToolExecutor({
      toolName: structured.toolName,
      toolInput: structured.toolInput
    });

    if (nativeResult.status === "handled") {
      return {
        status: "response",
        reply: nativeResult.reply,
        mediaUrl: nativeResult.mediaUrl,
        source: "tool"
      };
    }
  }

  const compiled = buildIntentFromAgentFirstToolCall(structured.toolName, structured.toolInput);
  if (!compiled.ok) {
    const validation = formatToolValidationError(structured.toolName, structured.toolInput);
    return {
      status: "clarification",
      question: validation?.question ?? "I need a bit more detail before I can do that safely.",
      analysis: {
        intent: "clarification_needed",
        confidence: 0.66,
        entities: structured.toolInput ?? {},
        missingFields: validation?.missingFields ?? [],
        needsDisambiguation: false,
        followUpQuestion: validation?.question,
        source: "llm"
      }
    };
  }

  return {
    status: "intent",
    intent: compiled.intent,
    analysis: compiled.analysis,
    confidence: compiled.analysis.confidence,
    normalizedText: input.message.trim(),
    source: "agent_first"
  };
};

export const buildPlanTodayToolExecutor = (deps: {
  getTodayPlan: (input: { timezone?: string }) => Promise<TodayPlanSnapshot>;
  toolReplyLlmCaller?: ToolReplyLlmCaller;
}) => {
  return async (input: {
    toolName: AgentFirstToolName;
    toolInput?: Record<string, unknown>;
  }) => {
    if (input.toolName !== "planToday") {
      return { status: "not_handled" as const };
    }

    const plan = await deps.getTodayPlan({
      timezone:
        typeof input.toolInput?.timezone === "string" ? input.toolInput.timezone : undefined
    });

    const llmReply = deps.toolReplyLlmCaller
      ? await deps.toolReplyLlmCaller({
          message: "Plan today for me",
          toolName: "planToday",
          toolInput: input.toolInput,
          toolResult: plan
        } as AgentFirstLlmInput & {
          toolName: AgentFirstToolName;
          toolInput?: Record<string, unknown>;
          toolResult: Record<string, unknown>;
        })
      : null;

    return {
      status: "handled" as const,
      reply: llmReply || buildTodayPlanFallbackReply(plan)
    };
  };
};
