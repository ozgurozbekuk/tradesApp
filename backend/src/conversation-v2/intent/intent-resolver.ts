// Maps incoming text into supported Conversation V2 workflow intents.
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

const extractPaymentMethod = (text: string) => {
  const match = text.match(/\b(cash|bank|card)\b/i);
  return match?.[1]?.toLowerCase() as "cash" | "bank" | "card" | undefined;
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

const normalizeSeparatorWhitespace = (text: string) =>
  text
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*:\s*/g, ": ")
    .trim();

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

const extractTaggedField = (text: string, labels: string[], allLabels: string[]) => {
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const escapedAllLabels = allLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(?:^|[,;])\\s*(?:${escapedLabels.join("|")})\\s*:\\s*(.+?)(?=(?:\\s*[,;]\\s*(?:${escapedAllLabels.join("|")})\\s*:)|$)`,
    "i"
  );

  return text.match(pattern)?.[1]?.trim();
};

const stripExpenseFieldSegment = (text: string, pattern: RegExp) => text.replace(pattern, " ").replace(/\s{2,}/g, " ").trim();

const parseExpenseTail = (tail: string | undefined) => {
  if (!tail) {
    return {};
  }

  const normalizedTail = normalizeSeparatorWhitespace(tail);
  const occurredOn =
    extractTaggedField(normalizedTail, ["date", "on"], ["vendor", "supplier", "note", "category", "date", "on"]) ??
    normalizedTail.match(/(?:^|[,;])\s*on\s+(.+)$/i)?.[1]?.trim();

  let remaining = normalizedTail;
  if (occurredOn) {
    remaining = stripExpenseFieldSegment(remaining, /(?:^|[,;])\s*(?:date|on)\s*:\s*.+$/i);
    remaining = stripExpenseFieldSegment(remaining, /(?:^|[,;])\s*on\s+.+$/i);
  }

  const vendorQuery =
    extractTaggedField(remaining, ["vendor", "supplier"], ["vendor", "supplier", "note", "category", "date", "on"]) ??
    remaining.match(/(?:^|[,;])\s*(?:at|from)\s+(.+?)(?=(?:\s*[,;]\s*(?:date|on)\b)|$)/i)?.[1]?.trim();

  if (vendorQuery) {
    remaining = stripExpenseFieldSegment(remaining, /(?:^|[,;])\s*(?:vendor|supplier)\s*:\s*.+$/i);
    remaining = stripExpenseFieldSegment(remaining, /(?:^|[,;])\s*(?:at|from)\s+.+$/i);
  }

  const taggedNote = extractTaggedField(
    remaining,
    ["note", "category"],
    ["vendor", "supplier", "note", "category", "date", "on"]
  );

  if (taggedNote) {
    remaining = stripExpenseFieldSegment(remaining, /(?:^|[,;])\s*(?:note|category)\s*:\s*.+$/i);
  }

  const freeformNote = remaining.replace(/^[,;\s]+/, "").replace(/^for\s+/i, "").trim() || undefined;
  const note = taggedNote ?? freeformNote;

  return {
    note,
    category: note,
    vendor_query: vendorQuery,
    occurred_on: occurredOn
  };
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

const extractDays = (text: string) => {
  const match = text.match(/\b(?:last|past|for)?\s*(\d{1,3})\s*d(?:ays?)?\b/i);
  if (!match) {
    return undefined;
  }

  const value = Number.parseInt(match[1], 10);
  return Number.isNaN(value) ? undefined : value;
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

const resolveCustomerRecordsIntent = (text: string): IntentResolutionResult | null => {
  const match =
    text.match(/^(?:bring|show|get|find|open)\s+(.+?)\s+(?:records|account|details)$/i) ??
    text.match(/^(?:bring|show|get|find|open)\s+(.+?)\s+job$/i) ??
    text.match(/^(?:bring|show|get|find|open)\s+jobs?\s+(?:for\s+)?(.+)$/i) ??
    text.match(/^(?:customer\s+)?records(?:\s+for)?\s*[:=]?\s*(.+)$/i) ??
    text.match(/^account(?:\s+for)?\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const customerQuery = match[1]?.trim();
  if (
    !customerQuery ||
    /\b(all|everything|all records)\b/i.test(customerQuery) ||
    /^(?:today|today's|tomorrow|yesterday|this week|this month)$/i.test(customerQuery)
  ) {
    return null;
  }

  return buildIntent("customer_records", "high", {
    customer_query: customerQuery
  });
};

const resolveCustomerPaymentIntent = (text: string): IntentResolutionResult | null => {
  const match =
    text.match(/^(?:record|add|log)\s+payment\s+(?:from\s+)?(.+?)\s+£?(-?\d+(?:\.\d{1,2})?)(?:\s+for\s+(.+))?(?:\s+(.+))?$/i) ??
    text.match(/^(.+?)\s+paid\s+£?(-?\d+(?:\.\d{1,2})?)(?:\s+for\s+(.+))?(?:\s+(.+))?$/i) ??
    text.match(/^(?:received)\s+£?(-?\d+(?:\.\d{1,2})?)\s+from\s+(.+?)(?:\s+for\s+(.+))?(?:\s+(.+))?$/i);
  if (!match) {
    return null;
  }

  const customerQuery = match[2] ? match[1].trim() : match[2]?.trim();
  const amountText = match[2] ? match[2] : match[1];
  const jobQuery = match[3]?.trim();
  const note = match[4]?.trim();

  return buildIntent("record_customer_payment", "high", {
    customer_query: customerQuery,
    amount_pence: parseMoneyToPence(amountText),
    method: extractPaymentMethod(text),
    note,
    job_query: jobQuery || undefined
  });
};

const resolveExpenseListIntent = (text: string): IntentResolutionResult | null => {
  if (
    !/^(?:bring|show|get|list)\s+(?:my\s+)?(?:expense|expenses|spend|spending)(?:\s+list)?$/i.test(text) &&
    !/^expenses?\s+(?:today|yesterday)$/i.test(text) &&
    !/^show\s+this\s+week'?s\s+expenses$/i.test(text)
  ) {
    return null;
  }

  const normalized = text.toLowerCase();
  const range =
    normalized.includes("today") ? "today" : normalized.includes("yesterday") ? "yesterday" : normalized.includes("week") ? "week" : "all";

  return buildIntent("expense_list", "high", {
    range
  });
};

const resolvePaymentListIntent = (text: string): IntentResolutionResult | null => {
  const normalized = text.toLowerCase();
  const isPaymentListRequest =
    /\b(payments?|payment list|recent payments?)\b/i.test(text) &&
    !/^(?:record|add|log)\s+payment\b/i.test(text) &&
    !/.+\s+paid(?:\s+£|\s+\d)/i.test(text);

  if (!isPaymentListRequest) {
    return null;
  }

  const range = normalized.includes("today")
    ? "today"
    : normalized.includes("yesterday")
      ? "yesterday"
      : normalized.includes("week")
        ? "week"
        : normalized.includes("month")
          ? "month"
          : "all";

  return buildIntent("list_payments", "high", {
    range
  });
};

const resolveVendorSummaryIntent = (text: string): IntentResolutionResult | null => {
  if (!/\bvendor\s+summary\b/i.test(text) && !/\bsupplier\s+summary\b/i.test(text)) {
    return null;
  }

  return buildIntent("vendor_summary", "high", {
    days: extractDays(text)
  });
};

const resolveExpensePdfIntent = (text: string): IntentResolutionResult | null => {
  if (
    /^(?:bring|send|export|get|show)\s+(?:my\s+)?(?:expense|expenses|spend|spending)\s+(?:record|records)(?:\s+as\s+(?:a\s+)?pdf)?$/i.test(text) ||
    /^(?:expense|expenses)\s+pdf$/i.test(text)
  ) {
    return buildIntent("export_expense_pdf", "high", {});
  }

  return null;
};

const resolveVendorPdfIntent = (text: string): IntentResolutionResult | null => {
  const match = text.match(
    /^(?:send|export|show)\s+(?:(.+?)\s+)?(?:supplier|vendor)\s+(?:payments|debts|records|expenses)\s+as\s+pdf$/i
  );
  if (!match) {
    return null;
  }

  return buildIntent("export_vendor_pdf", "high", {
    vendor_query: match[1]?.trim() || undefined
  });
};

const resolveRecordsPdfIntent = (text: string): IntentResolutionResult | null => {
  const specificMatch =
    text.match(/^(?:bring|send|export|get)\s+(.+?)\s+records(?:\s+as\s+(?:a\s+)?pdf)?$/i) ??
    text.match(/^(?:export|pdf|send)\s+(?:customer\s+)?records(?:\s+for)?\s*[:=]?\s*(.+)$/i);
  if (specificMatch) {
    const customerQuery = specificMatch[1].trim();
    if (!/\b(all|everything|all records)\b/i.test(customerQuery)) {
      return buildIntent("export_records_pdf", "high", {
        customer_query: customerQuery
      });
    }
  }

  if (
    /^(?:export|pdf|send)\s+all\s+records(?:\s+pdf)?$/i.test(text) ||
    /^(?:bring|send)\s+my\s+records$/i.test(text) ||
    /^(?:bring|send)\s+all\s+records(?:\s+pdf)?$/i.test(text)
  ) {
    return buildIntent("export_records_pdf", "high", {});
  }

  return null;
};

const resolveCreateInvoiceIntent = (text: string): IntentResolutionResult | null => {
  const match =
    text.match(/^(?:create|make|generate)\s+(.+?)\s+invoice$/i) ??
    text.match(/^invoice\s+(.+?)\s+for\s+(.+)$/i) ??
    text.match(/^(?:create|make|generate|send|show|raise|draft)(?:\s+me)?\s+(?:an?\s+)?invoice\s+(?:for\s+)?(.+)$/i);
  if (match) {
    const customerQuery =
      match.length >= 3 ? match[1].trim().replace(/'s$/i, "").trim() : match[1].trim().replace(/'s$/i, "").trim();
    return buildIntent("create_invoice", "high", {
      customer_query: customerQuery || undefined
    });
  }

  if (/^(?:create|make|generate|send|show)\s+invoice$/i.test(text)) {
    return buildIntent("create_invoice", "medium", {});
  }

  return null;
};

const resolvePartialCustomerPaymentIntent = (text: string): IntentResolutionResult | null => {
  const customerOnly =
    text.match(/^(?:record|add|log)\s+payment\s+(?:from\s+)?(.+)$/i) ??
    text.match(/^(.+?)\s+paid$/i);
  if (customerOnly) {
    return buildIntent("record_customer_payment", "medium", {
      customer_query: customerOnly[1].trim(),
      method: extractPaymentMethod(text)
    });
  }

  const amountOnly = text.match(/^(?:record|add|log)\s+payment\s+£?(-?\d+(?:\.\d{1,2})?)$/i);
  if (amountOnly) {
    return buildIntent("record_customer_payment", "medium", {
      amount_pence: parseMoneyToPence(amountOnly[1]),
      method: extractPaymentMethod(text)
    });
  }

  return null;
};

const resolveListTodayJobsIntent = (text: string): IntentResolutionResult | null => {
  if (
    !/\b(today('?s)?|today)\b.*\bjobs?\b/i.test(text) &&
    !/\b(list|show|get)\b.*\btoday\b.*\bjobs?\b/i.test(text) &&
    !/^(?:plan\s+today|today\s+plan)$/i.test(text)
  ) {
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

const resolveStructuredCreateJobForNewCustomerIntent = (text: string): IntentResolutionResult | null => {
  if (!/(?:^|[,;])\s*(?:new customer|add new customer|create customer)\s*:/i.test(text)) {
    return null;
  }

  if (!/(?:^|[,;])\s*(?:job|title|price|deposit|due|due date)\s*:/i.test(text)) {
    return null;
  }

  const normalized = normalizeSeparatorWhitespace(text);
  const allLabels = [
    "add new customer",
    "new customer",
    "create customer",
    "customer",
    "job",
    "title",
    "price",
    "total",
    "deposit",
    "due date",
    "due",
    "notes",
    "note",
    "phone number",
    "phone num",
    "phone",
    "number",
    "mobile"
  ];

  const customerQuery =
    extractTaggedField(normalized, ["add new customer", "new customer", "create customer", "customer"], allLabels) ??
    undefined;
  const customerPhone =
    extractTaggedField(normalized, ["phone number", "phone num", "phone", "number", "mobile"], allLabels) ??
    undefined;
  const title = extractTaggedField(normalized, ["job", "title"], allLabels) ?? undefined;
  const totalText = extractTaggedField(normalized, ["price", "total"], allLabels);
  const depositText = extractTaggedField(normalized, ["deposit"], allLabels);
  const dueDate = extractTaggedField(normalized, ["due date", "due"], allLabels) ?? undefined;
  const notes = extractTaggedField(normalized, ["notes", "note"], allLabels) ?? undefined;

  if (!customerQuery || !title || !totalText) {
    return null;
  }

  return buildIntent("create_job", "high", {
    customer_query: customerQuery,
    customer_phone: customerPhone,
    title,
    total_pence: parseMoneyToPence(totalText),
    deposit_pence: depositText ? parseMoneyToPence(depositText) : undefined,
    due_date: dueDate,
    notes,
    create_customer_if_missing: true
  });
};

const resolvePartialCreateJobIntent = (text: string): IntentResolutionResult | null => {
  const customerAndTitle = text.match(
    /^(?:create|add|new)\s+job\s+(?:for\s+)?(.+?)\s+(?:called|title|job)\s+(.+)$/i
  );
  if (customerAndTitle) {
    return buildIntent("create_job", "medium", {
      customer_query: customerAndTitle[1].trim(),
      title: customerAndTitle[2].trim()
    });
  }

  const customerOnly = text.match(/^(?:create|add|new)\s+job\s+(?:for\s+)?(.+)$/i);
  if (customerOnly) {
    return buildIntent("create_job", "medium", {
      customer_query: customerOnly[1].trim()
    });
  }

  return null;
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

const resolvePartialUpdateJobStatusIntent = (text: string): IntentResolutionResult | null => {
  const status = extractStatus(text);
  if (status && /^(?:mark|set|update)\b/i.test(text)) {
    const withoutStatus = text.replace(/\b(active|completed|canceled)\b/i, "").replace(/^(?:mark|set|update)\s*/i, "").replace(/\bas\s*$/i, "").trim();
    return buildIntent("update_job_status", "medium", {
      job_query: withoutStatus || undefined,
      status
    });
  }

  if (/^(?:mark|set|update)\b/i.test(text)) {
    const jobQuery = text.replace(/^(?:mark|set|update)\s*/i, "").trim();
    return buildIntent("update_job_status", "medium", {
      job_query: jobQuery || undefined
    });
  }

  return null;
};

const resolveExpenseIntent = (text: string): IntentResolutionResult | null => {
  const structuredExpenseMatch = text.match(
    /^(?:record|add|log)\s+expenses?\s*:\s*£?(-?\d+(?:\.\d{1,2})?)(?:\s*[,;]\s*(.+))?$/i
  );
  if (structuredExpenseMatch) {
    return buildIntent("record_expense", "high", {
      amount_pence: parseMoneyToPence(structuredExpenseMatch[1]),
      ...parseExpenseTail(structuredExpenseMatch[2])
    });
  }

  const match =
    text.match(
      /^(?:record|add|log)\s+expenses?\s+£?(-?\d+(?:\.\d{1,2})?)(.*)$/i
    ) ??
    text.match(/^(?:expenses?)\s+£?(-?\d+(?:\.\d{1,2})?)(.*)$/i);
  if (!match) {
    return null;
  }

  const tailFields = parseExpenseTail(match[2]);

  return buildIntent("record_expense", "high", {
    amount_pence: parseMoneyToPence(match[1]),
    ...tailFields,
    occurred_on: tailFields.occurred_on ?? extractOccurredOn(text)
  });
};

const resolvePartialExpenseIntent = (text: string): IntentResolutionResult | null => {
  const vendorOnly = text.match(/^(?:record|add|log)\s+expenses?\s+(?:at|for)\s+(.+)$/i);
  if (vendorOnly) {
    return buildIntent("record_expense", "medium", {
      note: vendorOnly[1].trim()
    });
  }

  if (/^(?:record|add|log)\s+expenses?$/i.test(text)) {
    return buildIntent("record_expense", "medium", {});
  }

  return null;
};

const resolveHighConfidenceIntent = (text: string): IntentResolutionResult | null => {
  return (
    resolveStructuredCreateJobForNewCustomerIntent(text) ??
    resolveCustomerRecordsIntent(text) ??
    resolveCustomerPaymentIntent(text) ??
    resolvePaymentListIntent(text) ??
    resolveExpenseListIntent(text) ??
    resolveVendorSummaryIntent(text) ??
    resolveExpensePdfIntent(text) ??
    resolveVendorPdfIntent(text) ??
    resolveRecordsPdfIntent(text) ??
    resolveCreateInvoiceIntent(text) ??
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

  if (/^(?:bring|show|get|list)\s+(?:my\s+)?(?:expense|expenses|spend|spending)\b/i.test(text)) {
    return buildIntent("expense_list", "medium", {});
  }

  if (/\b(today|yesterday|week|month)?\s*payments?\b/i.test(text) || /\bpayments?\s+(today|yesterday|this week|this month)\b/i.test(text)) {
    return resolvePaymentListIntent(text);
  }

  if (/^(?:expense|expenses)\s+pdf$/i.test(text)) {
    return buildIntent("export_expense_pdf", "medium", {});
  }

  if (/\b(?:vendor|supplier)\b.*\bpdf\b/i.test(text)) {
    return buildIntent("export_vendor_pdf", "medium", {});
  }

  if (/\brecords\b.*\bpdf\b/i.test(text) || /\bmy records\b/i.test(text)) {
    return buildIntent("export_records_pdf", "medium", {});
  }

  if (/\bvendor\s+summary\b/i.test(text) || /\bsupplier\s+summary\b/i.test(text)) {
    return buildIntent("vendor_summary", "medium", {
      days: extractDays(text)
    });
  }

  if (/^(?:record|add|log)\s+expense\b/i.test(text)) {
    return resolvePartialExpenseIntent(text);
  }

  if (/^(?:record|add|log)\s+vendor\s+debt\b/i.test(text) || /^(?:i\s+)?owe\b/i.test(text)) {
    return resolvePartialVendorDebtIntent(text);
  }

  if (/^(?:record|add|log)\s+vendor\s+payment\b/i.test(text) || /^(?:pay|paid)\b/i.test(text)) {
    return resolvePartialVendorPaymentIntent(text);
  }

  if (/^(?:record|add|log)\s+payment\b/i.test(text) || /.+\s+paid(?:\s+£|\s+\d)/i.test(text)) {
    return resolvePartialCustomerPaymentIntent(text);
  }

  if (/^(?:create|add|new)\s+job\b/i.test(text)) {
    return resolvePartialCreateJobIntent(text);
  }

  if (/^(?:mark|set|update)\b/i.test(text)) {
    return resolvePartialUpdateJobStatusIntent(text);
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
