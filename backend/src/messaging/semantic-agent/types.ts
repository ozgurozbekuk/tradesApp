import type { AgentParseContext, ParsedUserIntent } from "../agent/agent-types";

// Capability labels are broader than legacy intent names, which lets the runtime
// resolve ambiguity before we collapse into a concrete execution path.
export type SemanticCapabilityName =
  | "search_customers"
  | "get_customer_summary"
  | "get_customer_balance"
  | "get_recent_payments"
  | "create_customer"
  | "create_job"
  | "create_booking"
  | "list_jobs"
  | "update_job_status"
  | "record_payment"
  | "record_expense"
  | "record_vendor_debt"
  | "record_vendor_payment"
  | "get_vendor_summary"
  | "list_expenses"
  | "list_payments"
  | "list_due_payments"
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
  | "plan_today"
  | "unknown";

export type StructuredClarificationReason =
  | {
      type: "missing_field";
      field: string;
    }
  | {
      type: "ambiguous_customer";
      query: string;
      candidates: string[];
    }
  | {
      type: "customer_not_found";
      query: string;
    }
  | {
      type: "ambiguous_job";
      query: string;
      candidates: string[];
    }
  | {
      type: "job_not_found";
      query: string;
    }
  | {
      type: "ambiguous_vendor";
      query: string;
      candidates: string[];
    }
  | {
      type: "vendor_not_found";
      query: string;
    }
  | {
      type: "capability_uncertain";
      likelyCapability?: SemanticCapabilityName;
    };

export type SemanticDecision =
  | {
      kind: "action";
      capability: Exclude<SemanticCapabilityName, "unknown">;
      entities: Record<string, unknown>;
      reasoningSummary?: string;
      needsSearchFirst?: boolean;
      safeToExecuteDirectly?: boolean;
    }
  | {
      kind: "clarification";
      question: string;
      missingOrAmbiguous: string[];
      candidateCapability?: Exclude<SemanticCapabilityName, "unknown">;
      structuredReason?: StructuredClarificationReason;
    }
  | {
      kind: "response";
      message: string;
    }
  | {
      kind: "unknown";
      reason?: string;
    };

export type SemanticStructuredOutput =
  | {
      kind: "action";
      capability: Exclude<SemanticCapabilityName, "unknown">;
      entities?: Record<string, unknown>;
      reasoningSummary?: string;
      needsSearchFirst?: boolean;
      safeToExecuteDirectly?: boolean;
    }
  | {
      kind: "clarification";
      question: string;
      missingOrAmbiguous?: string[];
      candidateCapability?: Exclude<SemanticCapabilityName, "unknown">;
      structuredReason?: StructuredClarificationReason;
    }
  | {
      kind: "response";
      message: string;
    }
  | {
      kind: "unknown";
      reason?: string;
    };

export type SemanticInterpretInput = {
  message: string;
  context?: AgentParseContext;
};

export type SemanticInterpretResult =
  | {
      status: "response";
      reply: string;
    }
  | {
      status: "clarification";
      question: string;
      analysis?: ParsedUserIntent;
      decision: Extract<SemanticDecision, { kind: "clarification" }>;
    }
  | {
      status: "decision";
      decision: Extract<SemanticDecision, { kind: "action" }>;
      confidence: number;
    }
  | {
      status: "unknown";
      decision?: Extract<SemanticDecision, { kind: "unknown" }>;
    };

export type SemanticLlmCaller = (
  input: SemanticInterpretInput
) => Promise<SemanticStructuredOutput | null>;
