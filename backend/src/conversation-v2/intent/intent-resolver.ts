import type { WorkflowIntent, WorkflowName } from "../engine/contracts";
import { workflowIntentSchema } from "./intent-schema";

export type IntentResolutionResult =
  | { type: "intent"; intent: WorkflowIntent }
  | { type: "unsupported" };

const parseMoneyToPence = (text: string) => {
  const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d{1,2})?/);
  if (!match) {
    return undefined;
  }

  const value = Number.parseFloat(match[0]);
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.round(value * 100);
};

const monthNameToNumber = (value: string) => {
  const normalized = value.trim().toLowerCase();
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ];

  const exactIndex = months.indexOf(normalized);
  if (exactIndex >= 0) {
    return exactIndex + 1;
  }

  const shortIndex = months.findIndex((month) => month.startsWith(normalized));
  return shortIndex >= 0 ? shortIndex + 1 : undefined;
};

const normalizeWhitespace = (text: string) => text.trim().replace(/\s+/g, " ");

const isLikelyPhone = (text: string) => /\+?\d[\d\s()-]{6,}/.test(text);

const extractPhone = (text: string) => {
  const match = text.match(/(\+?\d[\d\s()-]{6,})/);
  if (!match) {
    return undefined;
  }

  return match[1].trim();
};

const extractOccurredOn = (text: string) => {
  const dateMatch = text.match(
    /\b(today|yesterday|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)\b/i
  );

  return dateMatch?.[1]?.trim();
};

const extractStatus = (text: string) => {
  const match = text.match(/\b(active|completed|canceled)\b/i);
  return match?.[1]?.toLowerCase() as "active" | "completed" | "canceled" | undefined;
};

const extractMonthYear = (text: string) => {
  const numericMonthMatch = text.match(/\b(1[0-2]|0?[1-9])[/-](\d{4})\b/);
  if (numericMonthMatch) {
    return {
      month: Number.parseInt(numericMonthMatch[1], 10),
      year: Number.parseInt(numericMonthMatch[2], 10)
    };
  }

  const namedMonthMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{4})\b/i
  );
  if (namedMonthMatch) {
    return {
      month: monthNameToNumber(namedMonthMatch[1]),
      year: Number.parseInt(namedMonthMatch[2], 10)
    };
  }

  return {};
};

const buildIntent = <TWorkflow extends WorkflowName>(
  workflow: TWorkflow,
  confidence: WorkflowIntent["confidence"],
  fields: Extract<WorkflowIntent, { workflow: TWorkflow }>["fields"]
): IntentResolutionResult => {
  const intent = workflowIntentSchema.parse({
    workflow,
    confidence,
    fields
  });

  return {
    type: "intent",
    intent
  };
};

const resolveCreateCustomerIntent = (text: string): IntentResolutionResult | null => {
  const match = text.match(/^(?:create|add|new)\s+customer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const rawRemainder = match[1].trim();
  const phone = extractPhone(rawRemainder);
  const name = phone ? rawRemainder.replace(phone, "").replace(/[,-]+$/g, "").trim() : rawRemainder;

  return buildIntent("create_customer", "high", {
    customer_name: name || undefined,
    customer_phone: phone
  });
};

const resolveListTodayJobsIntent = (text: string): IntentResolutionResult | null => {
  if (!/\b(today('?s)?|today)\b.*\bjobs?\b/i.test(text) && !/\b(list|show|get)\b.*\btoday\b.*\bjobs?\b/i.test(text)) {
    return null;
  }

  return buildIntent("list_today_jobs", "high", {
    scope: "today"
  });
};

const resolveDailySummaryIntent = (text: string): IntentResolutionResult | null => {
  if (!/\b(daily summary|summary today|today summary|end of day summary)\b/i.test(text)) {
    return null;
  }

  return buildIntent("daily_summary", "high", {
    scope: "daily"
  });
};

const resolveMonthlySummaryIntent = (text: string): IntentResolutionResult | null => {
  if (!/\b(monthly summary|month summary|this month summary|summary this month)\b/i.test(text)) {
    return null;
  }

  const { month, year } = extractMonthYear(text);

  return buildIntent("monthly_summary", "high", {
    month,
    year
  });
};

const resolveVendorDebtIntent = (text: string): IntentResolutionResult | null => {
  const match =
    text.match(/^(?:record|add|log)\s+vendor\s+debt\s+(?:for\s+)?(.+?)\s+(?:for\s+)?£?(-?\d+(?:\.\d{1,2})?)(?:\s+(.+))?$/i) ??
    text.match(/^(?:i\s+)?owe\s+(.+?)\s+£?(-?\d+(?:\.\d{1,2})?)(?:\s+(.+))?$/i);
  if (!match) {
    return null;
  }

  return buildIntent("record_vendor_debt", "high", {
    vendor_query: match[1].trim(),
    amount_pence: parseMoneyToPence(match[2]),
    note: match[3]?.trim(),
    occurred_on: extractOccurredOn(text)
  });
};

const resolvePartialVendorDebtIntent = (text: string): IntentResolutionResult | null => {
  const vendorOnly =
    text.match(/^(?:record|add|log)\s+vendor\s+debt\s+(?:for\s+)?(.+)$/i) ??
    text.match(/^(?:i\s+)?owe\s+(.+)$/i);
  if (vendorOnly) {
    return buildIntent("record_vendor_debt", "medium", {
      vendor_query: vendorOnly[1].trim()
    });
  }

  const amountOnly = text.match(/^(?:record|add|log)\s+vendor\s+debt\s+£?(-?\d+(?:\.\d{1,2})?)$/i);
  if (amountOnly) {
    return buildIntent("record_vendor_debt", "medium", {
      amount_pence: parseMoneyToPence(amountOnly[1])
    });
  }

  return null;
};

const resolveVendorPaymentIntent = (text: string): IntentResolutionResult | null => {
  const match =
    text.match(
      /^(?:record|add|log)\s+vendor\s+payment\s+(?:to|for)\s+(.+?)\s+£?(-?\d+(?:\.\d{1,2})?)(?:\s+(.+))?$/i
    ) ??
    text.match(/^(?:paid|pay)\s+(.+?)\s+£?(-?\d+(?:\.\d{1,2})?)(?:\s+(.+))?$/i);
  if (!match) {
    return null;
  }

  return buildIntent("record_vendor_payment", "high", {
    vendor_query: match[1].trim(),
    amount_pence: parseMoneyToPence(match[2]),
    note: match[3]?.trim(),
    occurred_on: extractOccurredOn(text)
  });
};

const resolvePartialVendorPaymentIntent = (text: string): IntentResolutionResult | null => {
  const vendorOnly =
    text.match(/^(?:record|add|log)\s+vendor\s+payment\s+(?:to|for)\s+(.+)$/i) ??
    text.match(/^(?:pay|paid)\s+(.+)$/i);
  if (vendorOnly) {
    return buildIntent("record_vendor_payment", "medium", {
      vendor_query: vendorOnly[1].trim()
    });
  }

  const amountOnly = text.match(/^(?:record|add|log)\s+vendor\s+payment\s+£?(-?\d+(?:\.\d{1,2})?)$/i);
  if (amountOnly) {
    return buildIntent("record_vendor_payment", "medium", {
      amount_pence: parseMoneyToPence(amountOnly[1])
    });
  }

  return null;
};

const resolveCreateJobIntent = (text: string): IntentResolutionResult | null => {
  const match = text.match(
    /^(?:create|add|new)\s+job\s+(?:for\s+)?(.+?)\s+(?:called|title|job)\s+(.+?)\s+(?:for|at)\s+£?(-?\d+(?:\.\d{1,2})?)(?:\s+deposit\s+£?(-?\d+(?:\.\d{1,2})?))?(?:\s+due\s+(.+))?$/i
  );
  if (!match) {
    return null;
  }

  return buildIntent("create_job", "high", {
    customer_query: match[1].trim(),
    title: match[2].trim(),
    total_pence: parseMoneyToPence(match[3]),
    deposit_pence: match[4] ? parseMoneyToPence(match[4]) : undefined,
    due_date: match[5]?.trim()
  });
};

const resolveUpdateJobStatusIntent = (text: string): IntentResolutionResult | null => {
  const status = extractStatus(text);
  if (!status) {
    return null;
  }

  const match =
    text.match(/^(?:mark|set|update)\s+(.+?)\s+(?:as\s+)?(active|completed|canceled)$/i) ??
    text.match(/^(?:job\s+)?(.+?)\s+(?:is\s+)?(active|completed|canceled)$/i);
  if (!match) {
    return null;
  }

  return buildIntent("update_job_status", "high", {
    job_query: match[1].trim(),
    status: match[2].toLowerCase() as "active" | "completed" | "canceled"
  });
};

const resolveExpenseIntent = (text: string): IntentResolutionResult | null => {
  const match =
    text.match(
      /^(?:record|add|log)\s+expense\s+£?(-?\d+(?:\.\d{1,2})?)(?:\s+for\s+(.+?))?(?:\s+at\s+(.+?))?(?:\s+on\s+(.+))?$/i
    ) ??
    text.match(/^(?:expense)\s+£?(-?\d+(?:\.\d{1,2})?)(?:\s+for\s+(.+?))?(?:\s+at\s+(.+?))?(?:\s+on\s+(.+))?$/i);
  if (!match) {
    return null;
  }

  return buildIntent("record_expense", "high", {
    amount_pence: parseMoneyToPence(match[1]),
    note: match[2]?.trim(),
    vendor_query: match[3]?.trim(),
    occurred_on: match[4]?.trim() ?? extractOccurredOn(text)
  });
};

const resolveHighConfidenceIntent = (text: string): IntentResolutionResult | null => {
  return (
    resolveListTodayJobsIntent(text) ??
    resolveDailySummaryIntent(text) ??
    resolveMonthlySummaryIntent(text) ??
    resolveCreateCustomerIntent(text) ??
    resolveVendorDebtIntent(text) ??
    resolveVendorPaymentIntent(text) ??
    resolveCreateJobIntent(text) ??
    resolveUpdateJobStatusIntent(text) ??
    resolveExpenseIntent(text)
  );
};

const resolveMediumConfidenceIntent = (text: string): IntentResolutionResult | null => {
  const normalized = text.toLowerCase();

  if (normalized === "daily summary" || normalized === "today summary") {
    return buildIntent("daily_summary", "medium", { scope: "daily" });
  }

  if (normalized === "monthly summary" || normalized === "this month summary") {
    const { month, year } = extractMonthYear(text);
    return buildIntent("monthly_summary", "medium", { month, year });
  }

  if (/\btoday('?s)?\s+jobs?\b/i.test(text)) {
    return buildIntent("list_today_jobs", "medium", { scope: "today" });
  }

  if (/^add expense$/i.test(text)) {
    return buildIntent("record_expense", "medium", {});
  }

  if (/^(?:record|add|log)\s+vendor\s+debt\b/i.test(text) || /^(?:i\s+)?owe\b/i.test(text)) {
    return resolvePartialVendorDebtIntent(text);
  }

  if (/^(?:record|add|log)\s+vendor\s+payment\b/i.test(text) || /^(?:pay|paid)\b/i.test(text)) {
    return resolvePartialVendorPaymentIntent(text);
  }

  if (/^new customer\s+.+/i.test(text) && !isLikelyPhone(text)) {
    return buildIntent("create_customer", "medium", {
      customer_name: text.replace(/^new customer\s+/i, "").trim()
    });
  }

  return null;
};

export const resolveIntentV2 = async (input: { text: string }): Promise<IntentResolutionResult> => {
  const text = normalizeWhitespace(input.text);
  if (!text) {
    return { type: "unsupported" };
  }

  return resolveHighConfidenceIntent(text) ?? resolveMediumConfidenceIntent(text) ?? { type: "unsupported" };
};
