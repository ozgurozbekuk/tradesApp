import { env } from "../../config/env";
import { buildSemanticClarification } from "./clarification";
import { SEMANTIC_AGENT_SYSTEM_PROMPT } from "./prompt";
import type {
  SemanticCapabilityName,
  SemanticDecision,
  SemanticInterpretInput,
  SemanticInterpretResult,
  SemanticLlmCaller,
  SemanticStructuredOutput
} from "./types";

export const PLAN_TODAY_PATTERN =
  /\b(plan today|today'?s plan|todays plan|what should i do today|what should i focus on today|focus on today|what's my plan today|whats my plan today|plan my day|prioritise today|prioritize today)\b/i;

const summarizeContextForPrompt = (context?: SemanticInterpretInput["context"]) =>
  context
      ? {
          lastCustomer: context.lastCustomerLabel ?? null,
          lastJob: context.lastJobLabel ?? null,
          lastIntent: context.lastIntent ?? null,
          recentTurns: context.recentTurns ?? [],
          pendingFlow: context.pendingFlow ?? null,
          recentCandidates: context.lastResolvedCandidates ?? [],
          learnedAliases: context.learnedAliases ?? [],
        learnedIntentHints: context.learnedIntentHints ?? []
      }
    : null;

const parseJsonObject = (content: string): SemanticStructuredOutput | null => {
  try {
    return JSON.parse(content) as SemanticStructuredOutput;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]) as SemanticStructuredOutput;
    } catch {
      return null;
    }
  }
};

export const callSemanticAgentOpenAi: SemanticLlmCaller = async (input) => {
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
        { role: "system", content: SEMANTIC_AGENT_SYSTEM_PROMPT },
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
  return content ? parseJsonObject(content) : null;
};

const normalizeCapability = (
  value: unknown
): Exclude<SemanticCapabilityName, "unknown"> | "unknown" => {
  if (typeof value !== "string") {
    return "unknown";
  }

  return value === "unknown" ? "unknown" : (value as Exclude<SemanticCapabilityName, "unknown">);
};

export const interpretWithSemanticAgent = async (
  input: SemanticInterpretInput,
  llmCaller: SemanticLlmCaller = callSemanticAgentOpenAi
): Promise<SemanticInterpretResult> => {
  if (PLAN_TODAY_PATTERN.test(input.message)) {
    return {
      status: "decision",
      decision: {
        kind: "action",
        capability: "plan_today",
        entities: {},
        reasoningSummary: "The user wants planning guidance for today.",
        needsSearchFirst: false,
        safeToExecuteDirectly: true
      },
      confidence: 0.95
    };
  }

  const structured = await llmCaller(input);
  if (!structured) {
    return { status: "unknown" };
  }

  if (structured.kind === "response") {
    const reply = structured.message?.trim();
    return reply ? { status: "response", reply } : { status: "unknown" };
  }

  if (structured.kind === "clarification") {
    const clarification = buildSemanticClarification({
      capability: structured.candidateCapability ?? "unknown",
      entities: {},
      missingOrAmbiguous: structured.missingOrAmbiguous ?? [],
      structuredReason: structured.structuredReason
    });
    return {
      status: "clarification",
      question: structured.question || clarification.question,
      analysis: clarification.analysis,
      decision: clarification.decision
    };
  }

  if (structured.kind === "unknown") {
    return {
      status: "unknown",
      decision: {
        kind: "unknown",
        reason: structured.reason
      }
    };
  }

  const capability = normalizeCapability(structured.capability);
  if (capability === "unknown") {
    return {
      status: "unknown",
      decision: {
        kind: "unknown",
        reason: "The semantic interpreter could not select a safe capability."
      }
    };
  }

  return {
    status: "decision",
    decision: {
      kind: "action",
      capability,
      entities: structured.entities ?? {},
      reasoningSummary: structured.reasoningSummary,
      needsSearchFirst: structured.needsSearchFirst ?? false,
      safeToExecuteDirectly: structured.safeToExecuteDirectly ?? false
    },
    confidence: 0.85
  };
};
