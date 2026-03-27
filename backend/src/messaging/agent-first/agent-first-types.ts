// Implements the agent-first orchestration layer for legacy messaging.
import type { ParsedIntent } from "../intents/schemas";
import type { AgentParseContext, ParsedUserIntent } from "../agent/agent-types";

export type AgentFirstToolName =
  | "searchCustomers"
  | "getCustomerAccount"
  | "createCustomer"
  | "createJob"
  | "listJobs"
  | "closeJob"
  | "recordPayment"
  | "listPayments"
  | "recordExpense"
  | "listExpenses"
  | "addVendorDebt"
  | "addVendorPayment"
  | "getVendorSummary"
  | "createInvoice"
  | "exportCustomerPdf"
  | "exportExpensesPdf"
  | "exportAllData"
  | "getSummary7Days"
  | "getSummary30Days"
  | "planToday";

export type AgentFirstStructuredDecision =
  | {
      type: "respond";
      message: string;
    }
  | {
      type: "clarify";
      question: string;
      toolName?: AgentFirstToolName;
      toolInput?: Record<string, unknown>;
      missingFields?: string[];
    }
  | {
      type: "call_tool";
      toolName: AgentFirstToolName;
      toolInput?: Record<string, unknown>;
    }
  | {
      type: "unknown";
    };

export type AgentFirstResult =
  | {
      status: "response";
      reply: string;
      mediaUrl?: string;
      source: "assistant" | "tool";
    }
  | {
      status: "clarification";
      question: string;
      analysis?: ParsedUserIntent;
    }
  | {
      status: "intent";
      intent: ParsedIntent;
      analysis: ParsedUserIntent;
      confidence: number;
      normalizedText: string;
      source: "agent_first";
    }
  | {
      status: "unknown";
    };

export type AgentFirstLlmInput = {
  message: string;
  context?: AgentParseContext;
};

export type AgentFirstLlmCaller = (
  input: AgentFirstLlmInput
) => Promise<AgentFirstStructuredDecision | null>;
