// Implements the agent-first orchestration layer for legacy messaging.
import { env } from "../../config/env";
import type { AgentParseContext } from "../agent/agent-types";
import { AGENT_FIRST_SYSTEM_PROMPT } from "./agent-first-prompt";
import {
  buildPendingFlowFromAgentFirstClarification,
} from "./agent-first-tools";
import { executeAgentFirstStructuredDecision } from "./agent-first-runtime";
import type {
  AgentFirstLlmCaller,
  AgentFirstResult,
  AgentFirstStructuredDecision
} from "./agent-first-types";

export const PLAN_TODAY_PATTERN =
  /\b(plan today|today'?s plan|todays plan|what should i do today|what should i focus on today|focus on today|what's my plan today|whats my plan today|plan my day|prioritise today|prioritize today)\b/i;

const summarizeContextForPrompt = (context?: AgentParseContext) => {
  if (!context) {
    return null;
  }

  return {
    lastCustomer: context.lastCustomerLabel ?? null,
    lastJob: context.lastJobLabel ?? null,
    lastIntent: context.lastIntent ?? null,
    recentTurns: context.recentTurns ?? [],
    pendingFlow: context.pendingFlow ?? null,
    recentCandidates: context.lastResolvedCandidates ?? [],
    learnedAliases: context.learnedAliases ?? [],
    learnedIntentHints: context.learnedIntentHints ?? []
  };
};

const parseStructuredDecision = (content: string): AgentFirstStructuredDecision | null => {
  try {
    return JSON.parse(content) as AgentFirstStructuredDecision;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]) as AgentFirstStructuredDecision;
    } catch {
      return null;
    }
  }
};

export const callAgentFirstOpenAi: AgentFirstLlmCaller = async (input) => {
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
        { role: "system", content: AGENT_FIRST_SYSTEM_PROMPT },
        {
          role: "system",
          content: `Session context: ${JSON.stringify(summarizeContextForPrompt(input.context))}`
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
  if (!content) {
    return null;
  }

  return parseStructuredDecision(content);
};

export const orchestrateWithAgentFirst = async (
  message: string,
  context?: AgentParseContext,
  llmCaller: AgentFirstLlmCaller = callAgentFirstOpenAi,
  nativeToolExecutor?: Parameters<typeof executeAgentFirstStructuredDecision>[0]["nativeToolExecutor"]
): Promise<AgentFirstResult> => {
  if (PLAN_TODAY_PATTERN.test(message)) {
    return executeAgentFirstStructuredDecision({
      structured: {
        type: "call_tool",
        toolName: "planToday",
        toolInput: {}
      },
      message,
      context,
      nativeToolExecutor
    });
  }

  const structured = await llmCaller({ message, context });
  if (!structured) {
    return { status: "unknown" };
  }

  if (structured.type === "respond") {
    const text = structured.message.trim();
    return text ? { status: "response", reply: text, source: "assistant" } : { status: "unknown" };
  }

  if (structured.type === "clarify") {
    const question = structured.question.trim();
    if (!question) {
      return { status: "unknown" };
    }

    const pendingFlow = buildPendingFlowFromAgentFirstClarification({
      toolName: structured.toolName,
      toolInput: structured.toolInput,
      missingFields: structured.missingFields
    });

    return {
      status: "clarification",
      question,
      analysis: pendingFlow
        ? {
            intent: pendingFlow.intent,
            confidence: 0.72,
            entities: pendingFlow.entities,
            missingFields: pendingFlow.missingFields,
            needsDisambiguation: false,
            followUpQuestion: question,
            source: "llm"
          }
        : undefined
    };
  }

  if (structured.type === "call_tool") {
    return executeAgentFirstStructuredDecision({
      structured,
      message,
      context,
      nativeToolExecutor
    });
  }

  return { status: "unknown" };
};
