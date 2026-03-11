import { parseIntent } from "./command.parser";
import { parseWithLlmFallback } from "./llm/llm-fallback.parser";
import { ParsedIntent, WriteIntentTypeSchema } from "../intents/schemas";
import { env } from "../../config/env";
import { normalizeInboundText } from "../agent/input-normalizer";
import { AgentIntentName, AgentParseContext, ParsedUserIntent } from "../agent/agent-types";
import { parseHeuristicDomainIntent } from "./heuristic-domain.parser";
import { buildClarificationQuestion } from "../agent/clarification-builder";

export type OrchestratedParseResult =
  | {
      status: "intent";
      intent: ParsedIntent;
      confidence: number;
      source: "rule" | "llm";
      needsConfirmation: boolean;
      normalizedText: string;
      analysis: ParsedUserIntent;
    }
  | {
      status: "clarification";
      question: string;
      analysis?: ParsedUserIntent;
    }
  | {
      status: "unknown";
      analysis?: ParsedUserIntent;
    };

const isWriteIntent = (intent: ParsedIntent) => {
  return WriteIntentTypeSchema.safeParse(intent.type).success;
};

const LLM_CONFIDENT_THRESHOLD = 0.6;
const LLM_PREFERRED_THRESHOLD = 0.78;

const clarificationForRuleFailure = (message: string) => {
  const text = message.trim().toLowerCase();

  if (text.startsWith("new job")) {
    return "Please provide: customer, title, and total. Example: NEW JOB customer: John; title: Boiler repair; total: 450";
  }

  if (text.startsWith("payment") || text.includes(" paid ")) {
    return "Please provide payment details. Example: PAYMENT job: <id>; amount: 200";
  }

  if (text.startsWith("close job") || text.startsWith("job close")) {
    return "Please provide the job ID. Example: Close job <id>.";
  }

  return null;
};

const toAnalysisFromIntent = (intent: ParsedIntent, normalizedText: string): ParsedUserIntent => {
  const map: {
    intent: AgentIntentName;
    entities: Record<string, unknown>;
  } =
    intent.type === "customer_create"
      ? {
          intent: "create_customer",
          entities: {
            name: intent.name,
            customerQuery: intent.name,
            ...(intent.phone ? { phone: intent.phone } : {})
          }
        }
      : intent.type === "customer_find"
      ? {
          intent: "get_customer_account",
          entities: { customerQuery: intent.query }
        }
      : intent.type === "job_create"
        ? {
            intent: "create_job",
            entities: {
              customerName: intent.customerName,
              customerQuery: intent.customerName,
              title: intent.title,
              totalPence: intent.totalPence
            }
          }
        : intent.type === "booking_create"
          ? {
              intent: "create_booking",
              entities: {
                customerName: intent.customerName,
                customerQuery: intent.customerName,
                startsAt: intent.startsAt,
                ...(intent.title ? { title: intent.title } : {}),
                ...(intent.notes ? { notes: intent.notes } : {})
              }
            }
        : intent.type === "payment_add"
          ? {
              intent: "record_payment",
              entities: {
                ...(intent.customerName ? { customerQuery: intent.customerName, customerName: intent.customerName } : {}),
                ...(intent.jobId ? { jobId: intent.jobId } : {}),
                amountPence: intent.amountPence
              }
            }
            : intent.type === "job_close" || intent.type === "job_close_customer"
              ? {
                  intent: "update_job_status",
                  entities: intent.type === "job_close" ? { jobId: intent.jobId } : { customerQuery: intent.customerQuery }
                }
            : intent.type === "job_set_status"
              ? {
                  intent: "update_job_status",
                  entities: { jobId: intent.jobId, status: intent.status }
                }
              : intent.type === "summary_today" || intent.type === "summary_yesterday" || intent.type === "summary_7" || intent.type === "summary_30"
              ? {
                  intent: "get_financial_summary",
                  entities: {
                    period:
                      intent.type === "summary_today"
                        ? "today"
                        : intent.type === "summary_yesterday"
                          ? "yesterday"
                          : intent.type === "summary_30"
                            ? "month"
                            : "week"
                  }
                }
              : intent.type === "invoice_create"
                ? {
                    intent: "create_invoice",
                    entities: intent.customerQuery ? { customerQuery: intent.customerQuery } : {}
                  }
                : intent.type === "outstanding_list"
                  ? {
                      intent: "list_debts",
                      entities: {}
                    }
                  : intent.type === "payment_list"
                    ? {
                        intent: "list_payments",
                        entities: intent.range ? { period: intent.range } : {}
                      }
                    : intent.type === "expense_add" || intent.type === "expense_add_batch"
                      ? {
                          intent: "record_expense",
                          entities:
                            intent.type === "expense_add"
                              ? {
                                  amountPence: intent.amountPence,
                                  ...(intent.note ? { note: intent.note } : {}),
                                  ...(intent.counterpartyName ? { counterpartyName: intent.counterpartyName } : {})
                                }
                              : {
                                  items: intent.items
                                }
                        }
                      : intent.type === "expense_list"
                        ? {
                            intent: "list_expenses",
                            entities: {}
                          }
                        : intent.type === "vendor_debt_add"
                          ? {
                              intent: "record_vendor_debt",
                              entities: {
                                vendorQuery: intent.vendorQuery,
                                amountPence: intent.amountPence,
                                ...(intent.note ? { note: intent.note } : {})
                              }
                            }
                          : intent.type === "vendor_payment_add"
                            ? {
                                intent: "record_vendor_payment",
                                entities: {
                                  vendorQuery: intent.vendorQuery,
                                  amountPence: intent.amountPence,
                                  ...(intent.note ? { note: intent.note } : {})
                                }
                              }
                            : intent.type === "vendor_summary"
                              ? {
                                  intent: "vendor_summary",
                                  entities: intent.days ? { days: intent.days } : {}
                                }
                              : intent.type === "export_vendor_pdf"
                                ? {
                                    intent: "export_vendor_report",
                                    entities: intent.vendorQuery ? { vendorQuery: intent.vendorQuery } : {}
                                  }
                                : intent.type === "export_expense_pdf"
                                  ? {
                                      intent: "export_expenses_pdf",
                                      entities: {}
                                    }
                                  : intent.type === "export_pdf"
                                    ? {
                                        intent: "export_all_records",
                                        entities: intent.customerQuery ? { customerQuery: intent.customerQuery } : {}
                                      }
                                    : intent.type === "briefing_toggle"
                                      ? {
                                          intent: "toggle_briefing",
                                          entities: { enabled: intent.enabled }
                                        }
                                      : intent.type === "subscribe"
                                        ? {
                                            intent: "subscribe",
                                            entities: {}
                                          }
                                        : intent.type === "help"
                                          ? {
                                              intent: "help",
                                              entities: {}
                                            }
                                          : intent.type === "greeting"
                                            ? {
                                                intent: "greeting",
                                                entities: {}
                                              }
                                            : intent.type === "confirm_action"
                                              ? {
                                                  intent: "confirm_action",
                                                  entities: {}
                                                }
                                              : intent.type === "cancel_action"
                                                ? {
                                                    intent: "cancel_action",
                                                    entities: {}
                                                  }
                    : {
                        intent: "unknown",
                        entities: {}
                      };

  return {
    intent: map.intent,
    confidence: 0.9,
    entities: map.entities,
    missingFields: [],
    needsDisambiguation: false,
    canonicalText: normalizedText,
    executionIntent: intent,
    source: "rule"
  };
};

const chooseAnalysis = (input: {
  heuristic: ParsedUserIntent | null;
  llm: ParsedUserIntent | undefined;
  fallbackIntent: ParsedIntent | null;
  normalizedText: string;
}) => {
  if (input.llm && input.llm.confidence >= 0.75) {
    return input.llm;
  }

  if (input.heuristic && input.heuristic.confidence >= 0.6) {
    return input.heuristic;
  }

  if (input.fallbackIntent && input.fallbackIntent.type !== "unknown") {
    return toAnalysisFromIntent(input.fallbackIntent, input.normalizedText);
  }

  return input.llm ?? input.heuristic ?? undefined;
};

export const parseWithAgentLayer = async (
  message: string,
  context?: AgentParseContext
): Promise<OrchestratedParseResult> => {
  const useRuleParser = env.AGENT_RULE_PARSER_ENABLED === true;
  const normalizedMessage = normalizeInboundText(message);
  const heuristic = parseHeuristicDomainIntent(normalizedMessage, context);
  const llmFallback = await parseWithLlmFallback(normalizedMessage, context);
  if (env.AGENT_DEBUG) {
    console.info("[agent][orchestrator] llm result", {
      hasIntent: Boolean(llmFallback.intent),
      confidence: llmFallback.confidence,
      canonicalText: llmFallback.canonicalText,
      heuristic
    });
  }

  const canonicalIntent = llmFallback.canonicalText
    ? parseIntent(llmFallback.canonicalText)
    : ({ type: "unknown" } as const);

  if (env.AGENT_DEBUG && llmFallback.canonicalText) {
    console.info("[agent][orchestrator] canonical parse", {
      canonicalText: llmFallback.canonicalText,
      canonicalIntentType: canonicalIntent.type
    });
  }

  const llmIntent = llmFallback.intent ?? (canonicalIntent.type !== "unknown" ? canonicalIntent : null);
  const llmConfidence =
    llmFallback.intent || canonicalIntent.type !== "unknown"
      ? Math.max(
          llmFallback.confidence,
          llmFallback.intent ? 0 : 0.68
        )
      : 0;

  const ruleIntent = useRuleParser ? parseIntent(normalizedMessage) : ({ type: "unknown" } as const);
  if (env.AGENT_DEBUG && useRuleParser && ruleIntent.type !== "unknown") {
    console.info("[agent][orchestrator] rule intent", { type: ruleIntent.type });
  }

  const analysis = chooseAnalysis({
    heuristic,
    llm: llmFallback.parsedUserIntent,
    fallbackIntent:
      llmIntent && llmIntent.type !== "unknown"
        ? llmIntent
        : ruleIntent.type !== "unknown"
          ? ruleIntent
          : null,
    normalizedText: llmFallback.canonicalText || normalizedMessage
  });

  if (llmIntent && llmConfidence >= LLM_PREFERRED_THRESHOLD) {
    return {
      status: "intent",
      intent: llmIntent,
      confidence: llmConfidence,
      source: "llm",
      needsConfirmation: isWriteIntent(llmIntent) && llmConfidence < 0.9,
      normalizedText: llmFallback.canonicalText || normalizedMessage,
      analysis: analysis ?? toAnalysisFromIntent(llmIntent, llmFallback.canonicalText || normalizedMessage)
    };
  }

  if (useRuleParser && ruleIntent.type !== "unknown") {
    if (!llmIntent || llmConfidence < LLM_CONFIDENT_THRESHOLD) {
      return {
        status: "intent",
        intent: ruleIntent,
        confidence: 0.9,
        source: "rule",
        needsConfirmation: false,
        normalizedText: normalizedMessage,
        analysis: analysis ?? toAnalysisFromIntent(ruleIntent, normalizedMessage)
      };
    }
  }

  if (analysis?.executionIntent) {
    return {
      status: "intent",
      intent: analysis.executionIntent,
      confidence: Math.max(analysis.confidence, 0.78),
      source: "rule",
      needsConfirmation: isWriteIntent(analysis.executionIntent) && analysis.confidence < 0.9,
      normalizedText: llmFallback.canonicalText || normalizedMessage,
      analysis
    };
  }

  if (llmIntent) {
    return {
      status: "intent",
      intent: llmIntent,
      confidence: llmConfidence,
      source: "llm",
      needsConfirmation: isWriteIntent(llmIntent) && llmConfidence < 0.9,
      normalizedText: llmFallback.canonicalText || normalizedMessage,
      analysis: analysis ?? toAnalysisFromIntent(llmIntent, llmFallback.canonicalText || normalizedMessage)
    };
  }

  if (analysis?.missingFields.length) {
    return {
      status: "clarification",
      question:
        analysis.followUpQuestion ||
        buildClarificationQuestion({
          intent: analysis.intent,
          entities: analysis.entities,
          missingFields: analysis.missingFields
        }) ||
        "Please give me the missing detail.",
      analysis
    };
  }

  if (llmFallback.clarificationQuestion) {
    return {
      status: "clarification",
      question: llmFallback.clarificationQuestion,
      analysis
    };
  }

  const ruleClarification = useRuleParser ? clarificationForRuleFailure(message) : null;
  if (ruleClarification) {
    return {
      status: "clarification",
      question: ruleClarification,
      analysis
    };
  }

  return {
    status: "unknown",
    analysis
  };
};
