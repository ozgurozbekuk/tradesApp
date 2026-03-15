import type { AgentParseContext } from "./agent/agent-types";
import type { OrchestratedParseResult } from "./parsers/agent-orchestrator";
import { parseHeuristicDomainIntent } from "./parsers/heuristic-domain.parser";
import { buildSemanticClarification } from "./semantic-agent/clarification";

export const tryResolvePriorityPendingVendorDebtFollowUp = (
  message: string,
  context?: AgentParseContext
): OrchestratedParseResult | null => {
  const pending = context?.pendingFlow;
  if (!pending || pending.intent !== "record_vendor_debt") {
    return null;
  }

  if (!pending.missingFields.includes("vendorQuery")) {
    return null;
  }

  const heuristic = parseHeuristicDomainIntent(message, context);
  if (!heuristic?.sessionReferences?.usesPendingFlow) {
    return null;
  }

  if (heuristic.executionIntent?.type === "vendor_debt_add") {
    return {
      status: "intent",
      intent: heuristic.executionIntent,
      confidence: Math.max(heuristic.confidence, 0.82),
      source: "rule",
      needsConfirmation: false,
      normalizedText: message.trim(),
      analysis: heuristic
    };
  }

  if (heuristic.missingFields.length > 0) {
    return {
      status: "clarification",
      question:
        heuristic.followUpQuestion ||
        buildSemanticClarification({
          capability: "record_vendor_debt",
          entities: heuristic.entities,
          missingOrAmbiguous: heuristic.missingFields
        }).question,
      analysis: heuristic
    };
  }

  return null;
};
