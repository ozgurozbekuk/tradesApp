import type { ParsedIntent } from "../intents/schemas";

export type AgentIntentName =
  | "create_customer"
  | "update_customer"
  | "search_customer"
  | "get_customer_account"
  | "create_job"
  | "create_booking"
  | "list_jobs"
  | "update_job_status"
  | "record_payment"
  | "record_expense"
  | "record_vendor_debt"
  | "record_vendor_payment"
  | "vendor_summary"
  | "list_expenses"
  | "list_payments"
  | "list_debts"
  | "get_financial_summary"
  | "create_invoice"
  | "export_vendor_report"
  | "export_expenses_pdf"
  | "export_all_records"
  | "toggle_briefing"
  | "subscribe"
  | "help"
  | "greeting"
  | "confirm_action"
  | "cancel_action"
  | "clarification_needed"
  | "unknown";

export type ParsedUserIntent = {
  intent: AgentIntentName;
  confidence: number;
  entities: Record<string, unknown>;
  missingFields: string[];
  needsDisambiguation: boolean;
  disambiguationCandidates?: Array<{
    id: string;
    label: string;
    score?: number;
  }>;
  followUpQuestion?: string;
  sessionReferences?: {
    usesLastCustomer?: boolean;
    usesLastJob?: boolean;
    usesPendingFlow?: boolean;
  };
  canonicalText?: string;
  executionIntent?: ParsedIntent | null;
  source?: "rule" | "llm" | "heuristic" | "hybrid";
};

export type AgentPendingFlow = {
  intent: AgentIntentName;
  entities: Record<string, unknown>;
  missingFields: string[];
  followUpQuestion?: string;
};

export type AgentParseContext = {
  lastCustomerId?: string;
  lastCustomerLabel?: string;
  lastJobId?: string;
  lastJobLabel?: string;
  lastIntent?: string;
  recentTurns?: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
  learnedAliases?: Array<{
    phrase: string;
    targetType: "customer";
    targetValue: string;
    confidence: number;
  }>;
  learnedIntentHints?: Array<{
    phrase: string;
    intent: AgentIntentName;
    confidence: number;
  }>;
  pendingFlow?: AgentPendingFlow;
  lastResolvedCandidates?: Array<{
    id: string;
    label: string;
    score?: number;
  }>;
};
