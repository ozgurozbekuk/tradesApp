import OpenAI from "openai";
import type {
  Response,
  ResponseFunctionToolCall,
  ResponseInputItem
} from "openai/resources/responses/responses";
import { buildConversationInput, type ConversationMessage } from "./conversationInput";
import { buildSystemPrompt } from "./systemPrompt";
import { toolDefinitions, toolMap } from "./toolDefinitions";
import type { ToolAttachment, ToolResult } from "./tools/types";

const client = new OpenAI();
const MAX_TOOL_ROUNDS = 5;

export type RunOrchestratorInput = {
  userId: string;
  userMessage: string;
  history?: ConversationMessage[];
};

export type RunOrchestratorResult = {
  reply: string;
  attachment?: ToolAttachment;
};

const isFunctionToolCall = (item: Response["output"][number]): item is ResponseFunctionToolCall => {
  return item.type === "function_call";
};

const getFunctionToolCalls = (response: Response) => {
  return response.output.filter(isFunctionToolCall);
};

const parseToolArguments = (toolCall: ResponseFunctionToolCall) => {
  try {
    const parsed = JSON.parse(toolCall.arguments) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const sanitizeToolResultForModel = (result: ToolResult): ToolResult => {
  if (!result.attachment) {
    return result;
  }

  return {
    success: result.success,
    message: result.message,
    data: result.data
  };
};

const finalizeReply = (reply: string) => {
  const trimmed = reply.trim();
  const lower = trimmed.toLowerCase();

  const mentionsMissingTool =
    lower.includes("tool") &&
    (lower.includes("not available") ||
      lower.includes("isn't available") ||
      lower.includes("no tool") ||
      lower.includes("don't have") ||
      lower.includes("do not have"));

  if (mentionsMissingTool) {
    return "I can’t help with that action here. If you want, I can help with a supported related step instead.";
  }

  return trimmed;
};

const executeToolCall = async (input: {
  toolCall: ResponseFunctionToolCall;
  userId: string;
}): Promise<{
  toolOutput: ResponseInputItem.FunctionCallOutput;
  attachment?: ToolAttachment;
}> => {
  const tool = toolMap.get(input.toolCall.name);

  if (!tool) {
    return {
      toolOutput: {
        type: "function_call_output",
        call_id: input.toolCall.call_id,
        output: JSON.stringify({
          success: false,
          message: "I can’t help with that action here."
        }),
        status: "completed"
      }
    };
  }

  const args = parseToolArguments(input.toolCall);
  const result = await tool.execute(args, { userId: input.userId });

  return {
    toolOutput: {
      type: "function_call_output",
      call_id: input.toolCall.call_id,
      output: JSON.stringify(sanitizeToolResultForModel(result)),
      status: "completed"
    },
    attachment: result.attachment
  };
};

export const runOrchestrator = async (input: RunOrchestratorInput): Promise<RunOrchestratorResult> => {
  const conversationInput = buildConversationInput({
    userMessage: input.userMessage,
    history: input.history
  });
  let attachment: ToolAttachment | undefined;

  let response = await client.responses.create({
    model: "gpt-5.4",
    instructions: buildSystemPrompt(),
    tools: toolDefinitions,
    input: conversationInput
  });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const toolCalls = getFunctionToolCalls(response);

    if (toolCalls.length === 0) {
      return {
        reply: finalizeReply(response.output_text) || "I could not produce a reply.",
        attachment
      };
    }

    const toolExecutions = await Promise.all(
      toolCalls.map((toolCall) =>
        executeToolCall({
          toolCall,
          userId: input.userId
        })
      )
    );
    const toolOutputs = toolExecutions.map((entry) => entry.toolOutput);
    attachment = toolExecutions.map((entry) => entry.attachment).find(Boolean) ?? attachment;

    response = await client.responses.create({
      model: "gpt-5.4",
      instructions: buildSystemPrompt(),
      tools: toolDefinitions,
      previous_response_id: response.id,
      input: toolOutputs
    });
  }

  return {
    reply: finalizeReply(response.output_text) || "I could not complete the request.",
    attachment
  };
};
