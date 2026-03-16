import { env } from "../../config/env";
import type { PendingFlow, RecentRefs } from "../engine/contracts";
import {
  semanticFrontDoorResultSchema,
  type SemanticFrontDoorResultSchema
} from "./schema";
import {
  buildConversationV2SemanticSystemPrompt,
  buildConversationV2SemanticUserPrompt
} from "./prompt";

export type ConversationV2SemanticInterpretInput = {
  message: string;
  recentRefs?: RecentRefs;
  pendingFlow?: Pick<PendingFlow, "workflow" | "step" | "slots" | "missingSlots" | "prompt">;
};

export type ConversationV2SemanticLlmCallInput = {
  systemPrompt: string;
  userPrompt: string;
};

export type ConversationV2SemanticLlmCaller = (
  input: ConversationV2SemanticLlmCallInput
) => Promise<unknown | null>;

const parseJsonObject = (content: string): unknown | null => {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

export const callConversationV2SemanticOpenAi: ConversationV2SemanticLlmCaller = async (input) => {
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
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt }
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

export const interpretConversationV2Semantically = async (
  input: ConversationV2SemanticInterpretInput,
  llmCaller: ConversationV2SemanticLlmCaller = callConversationV2SemanticOpenAi
): Promise<SemanticFrontDoorResultSchema> => {
  const systemPrompt = buildConversationV2SemanticSystemPrompt();
  const userPrompt = buildConversationV2SemanticUserPrompt({
    message: input.message,
    context: {
      recentRefs: input.recentRefs,
      pendingFlow: input.pendingFlow
    }
  });

  const structured = await llmCaller({
    systemPrompt,
    userPrompt
  });

  if (!structured) {
    return {
      kind: "unknown",
      reason: "Semantic interpreter returned no structured output."
    };
  }

  const parsed = semanticFrontDoorResultSchema.safeParse(structured);
  if (parsed.success) {
    return parsed.data;
  }

  return {
    kind: "unknown",
    reason: "Semantic interpreter returned invalid structured output."
  };
};
