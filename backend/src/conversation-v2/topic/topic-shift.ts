// Detects when a user message should continue or replace the current pending flow.
import type { PendingFlow } from "../engine/contracts";

export type TopicShiftDecision =
  | { type: "continue_pending" }
  | { type: "cancel_pending"; reason: "explicit_cancel" }
  | { type: "shift_to_fresh_intent"; reason: "topic_shift" };

const EXPLICIT_CANCEL_PATTERNS = [
  /^cancel$/i,
  /^stop$/i,
  /^never mind$/i,
  /^nevermind$/i,
  /^start over$/i
];

const STRONG_SHIFT_PATTERNS = [
  /\bshow\b.*\btoday\b.*\bjobs?\b/i,
  /\blist\b.*\btoday\b.*\bjobs?\b/i,
  /\btoday('?s)?\b.*\bjobs?\b/i,
  /^(?:bring|show|get|find|open)\b.+\b(?:job|jobs|record|records|account|details)\b/i,
  /\btoday\b.*\bpayments?\b/i,
  /\bpayments?\b.*\btoday\b/i,
  /\bplan\s+today\b/i,
  /\btoday\s+plan\b/i,
  /\bdaily summary\b/i,
  /\bmonthly summary\b/i,
  /\b(?:record|add|log)\s+expenses?\b/i,
  /\bcreate customer\b/i,
  /\bnew customer\b/i,
  /\bcreate job\b/i,
  /\bnew job\b/i,
  /\bmark\b.*\b(active|completed|canceled)\b/i,
  /\bupdate\b.*\bjob\b.*\b(active|completed|canceled)\b/i
];

const isExplicitCancel = (text: string) => EXPLICIT_CANCEL_PATTERNS.some((pattern) => pattern.test(text.trim()));

const looksLikeYesNo = (text: string) =>
  /^(?:yes|yep|yeah|no|nope)$/i.test(text.trim());

const looksLikeShortStatus = (text: string) =>
  /^(?:active|completed|canceled)$/i.test(text.trim());

const looksLikeSimpleAmount = (text: string) =>
  /^£?\s*-?\d+(?:\.\d{1,2})?$/i.test(text.trim());

const looksLikeShortReply = (text: string) => text.trim().split(/\s+/).length <= 4;

const matchesAwaitedSlotShape = (pendingFlow: PendingFlow, text: string) => {
  if (pendingFlow.step === "confirmation") {
    return looksLikeYesNo(text);
  }

  if (pendingFlow.missingSlots.length !== 1) {
    return false;
  }

  const [missingSlot] = pendingFlow.missingSlots;

  switch (missingSlot) {
    case "amount_pence":
    case "total_pence":
    case "deposit_pence":
      return looksLikeSimpleAmount(text);
    case "status":
      return looksLikeShortStatus(text);
    case "customer_name":
    case "vendor_query":
    case "customer_query":
    case "job_query":
    case "title":
    case "category":
    case "month":
    case "year":
    case "occurred_on":
    case "due_date":
    case "note":
    case "notes":
    case "customer_phone":
      return looksLikeShortReply(text);
    default:
      return false;
  }
};

const isStrongFreshCommand = (text: string) => STRONG_SHIFT_PATTERNS.some((pattern) => pattern.test(text));

export const decideTopicShift = (input: { pendingFlow: PendingFlow; text: string }): TopicShiftDecision => {
  const normalizedText = input.text.trim();

  if (isExplicitCancel(normalizedText)) {
    return {
      type: "cancel_pending",
      reason: "explicit_cancel"
    };
  }

  if (matchesAwaitedSlotShape(input.pendingFlow, normalizedText)) {
    return {
      type: "continue_pending"
    };
  }

  if (isStrongFreshCommand(normalizedText)) {
    return {
      type: "shift_to_fresh_intent",
      reason: "topic_shift"
    };
  }

  return {
    type: "continue_pending"
  };
};
