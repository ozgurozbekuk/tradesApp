import { buildClarificationQuestion } from "../agent/clarification-builder";
import type { ParsedUserIntent } from "../agent/agent-types";
import type { SemanticCapabilityName, SemanticDecision, StructuredClarificationReason } from "./types";

const toAgentIntent = (capability: SemanticCapabilityName): ParsedUserIntent["intent"] => {
  if (capability === "plan_today") {
    return "get_financial_summary";
  }

  if (capability === "search_customers") {
    return "search_customer";
  }

  if (capability === "get_customer_summary" || capability === "get_customer_balance" || capability === "get_recent_payments") {
    return "get_customer_account";
  }

  if (capability === "get_vendor_summary") {
    return "vendor_summary";
  }

  if (capability === "list_due_payments") {
    return "list_debts";
  }

  return capability as ParsedUserIntent["intent"];
};

const buildQuestionFromReason = (reason?: StructuredClarificationReason) => {
  if (!reason) {
    return undefined;
  }

  if (reason.type === "missing_field") {
    if (reason.field === "amountPence") {
      return "What amount should I use?";
    }

    if (reason.field === "customerQuery" || reason.field === "customerName" || reason.field === "query") {
      return "Which customer should I use?";
    }

    if (reason.field === "vendorQuery" || reason.field === "vendorName") {
      return "Which vendor should I use?";
    }

    if (reason.field === "title") {
      return "What job title should I use?";
    }

    if (reason.field === "totalPence") {
      return "What total price should I use?";
    }
  }

  if (reason.type === "ambiguous_customer") {
    const options = reason.candidates.slice(0, 4).join(", ");
    return `I found more than one customer for "${reason.query}". Which one do you mean: ${options}?`;
  }

  if (reason.type === "customer_not_found") {
    return `I couldn't find a customer matching "${reason.query}". What name should I look for?`;
  }

  if (reason.type === "ambiguous_job") {
    const options = reason.candidates.slice(0, 4).join(", ");
    return `I found more than one job for "${reason.query}". Which one do you mean: ${options}?`;
  }

  if (reason.type === "job_not_found") {
    return `I couldn't find a job matching "${reason.query}". Which job should I use?`;
  }

  if (reason.type === "ambiguous_vendor") {
    const options = reason.candidates.slice(0, 4).join(", ");
    return `I found more than one vendor for "${reason.query}". Which one do you mean: ${options}?`;
  }

  if (reason.type === "vendor_not_found") {
    return `I couldn't find a vendor matching "${reason.query}". Which vendor should I use?`;
  }

  if (reason.type === "capability_uncertain") {
    return "I can help with that, but I need a bit more detail before I do anything.";
  }

  return undefined;
};

export const buildSemanticClarification = (input: {
  capability: SemanticCapabilityName;
  entities: Record<string, unknown>;
  missingOrAmbiguous: string[];
  structuredReason?: StructuredClarificationReason;
}) => {
  const intent = toAgentIntent(input.capability);
  const normalizedMissingFields = input.missingOrAmbiguous.map((field) => {
    if (field === "query") {
      return "customerQuery";
    }
    if (field === "customerName") {
      return "customerQuery";
    }
    return field;
  });
  const question =
    buildQuestionFromReason(input.structuredReason) ??
    buildClarificationQuestion({
      intent,
      entities: input.entities,
      missingFields: normalizedMissingFields
    });

  const decision: Extract<SemanticDecision, { kind: "clarification" }> = {
    kind: "clarification",
    question: question ?? "I need a bit more detail to continue.",
    missingOrAmbiguous: normalizedMissingFields,
    candidateCapability: input.capability === "unknown" ? undefined : input.capability,
    structuredReason: input.structuredReason
  };

  return {
    question: decision.question,
    decision,
    analysis: {
      intent,
      confidence: 0.7,
      entities: input.entities,
      missingFields: normalizedMissingFields,
      needsDisambiguation: false,
      followUpQuestion: question,
      source: "llm" as const
    }
  };
};
