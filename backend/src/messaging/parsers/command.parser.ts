// Parses user messages into structured intents for the legacy messaging stack.
import { PaymentMethod } from "@prisma/client";
import { ParsedIntent } from "../intents/schemas";

const parseKeyValues = (text: string) => {
  const cleaned = text
    .replace(/^new job\s*/i, "")
    .replace(/^new customer\s*/i, "")
    .replace(/^new costumer\s*/i, "")
    .replace(/^payment\s*/i, "")
    .replace(/^job close\s*/i, "");

  const parts = cleaned
    .split(/[;\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const result: Record<string, string> = {};

  for (const part of parts) {
    const match = part.match(/^([a-zA-Z_ ]+)\s*[:=]\s*(.+)$/);
    if (!match) {
      continue;
    }

    const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
    const value = match[2].trim();
    result[key] = value;
  }

  return result;
};

const parseMoneyToPence = (value: string) => {
  const normalized = value.replace(/[,\s]/g, "").toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.endsWith("p")) {
    const pence = Number(normalized.slice(0, -1));
    return Number.isFinite(pence) && pence > 0 ? Math.round(pence) : null;
  }

  const numeric = normalized.replace(/^£/, "");
  const pounds = Number(numeric);

  if (!Number.isFinite(pounds) || pounds <= 0) {
    return null;
  }

  return Math.round(pounds * 100);
};

const parseDate = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  const now = new Date();

  if (normalized === "tomorrow") {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return date;
  }

  if (normalized === "next week" || normalized === "in 1 week" || normalized === "1 week") {
    const date = new Date(now);
    date.setDate(date.getDate() + 7);
    return date;
  }

  const relativeMatch = normalized.match(/^(?:in\s+)?(\d+)\s+(day|days|week|weeks)$/);
  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    const unit = relativeMatch[2];
    const multiplier = unit.startsWith("week") ? 7 : 1;
    const date = new Date(now);
    date.setDate(date.getDate() + amount * multiplier);
    return date;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const parsePaymentMethod = (value?: string): PaymentMethod | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();

  if (normalized === "cash" || normalized === "bank" || normalized === "card") {
    return normalized;
  }

  return "unknown";
};

const looksLikeFinancialSummary = (text: string) =>
  /\b(summary|revenue|income|profit|earn|earnings|takings|numbers|make|made|spend|spent|expenses?)\b/i.test(text) ||
  /\bhow am i doing\b/i.test(text);

const isMonthSummary = (text: string) => /\bthis month\b|\bthis months\b|\bmonth to date\b|\bmonth\b/i.test(text);

const parseOnboarding = (text: string): ParsedIntent | null => {
  const patterns = [
    /^(?:my\s+business|business)\s*[:=-]?\s*(.+)$/i,
    /^(?:my\s+)?business\s+name\s+is\s+(.+)$/i,
    /^register\s+(?:my\s+)?business\s*[:=-]?\s*(.+)$/i,
    /^my\s+business\s+is\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const businessName = match[1]?.trim();
    if (!businessName) {
      return { type: "unknown" };
    }

    return { type: "onboarding_submit", businessName };
  }

  return null;
};

const parseCustomerCreate = (text: string): ParsedIntent | null => {
  const lower = text.toLowerCase();
  if (!/\b(customer|client|costumer|cusomer|custmer)\b/.test(lower)) {
    return null;
  }

  if (!/\b(add|ad|new|save|create|make|put|stick)\b/.test(lower) && !/^customer\b/i.test(text)) {
    return null;
  }

  if (/\b(phone|number|mobile)\b/.test(lower) && /\b(update|change|set|swap)\b/.test(lower)) {
    return null;
  }

  if (/\bpaid\b|\bpayment\b|\breceived\b|\bfrom\b/i.test(lower)) {
    return null;
  }

  if (
    /^(?:new\s+(?:customer|costumer)|customer\b)/i.test(text) &&
    /(\bjob\b|\btitle\b|\btask\b|\bservice\b)\s*[:=]/i.test(text) &&
    /(\bprice\b|\bcost\b|\bamount\b|\btotal\b)\s*[:=]/i.test(text)
  ) {
    return null;
  }

  const phone = text.match(/(\+?[0-9][0-9\s\-().]{5,}[0-9])/i)?.[1]?.trim();
  const withoutPhone = phone ? text.replace(phone, " ") : text;

  const explicitPatterns = [
    /^(?:new\s+)?(?:customer|client|costumer|cusomer|custmer)\s+(.+)$/i,
    /^customer\s+is\s+(.+)$/i,
    /^customer\s+name\s+is\s+(.+)$/i,
    /(?:called)\s+(.+)$/i
  ];

  for (const pattern of explicitPatterns) {
    const match = withoutPhone.match(pattern);
    const raw = match?.[1]
      ?.replace(/\b(and her|and his)\s+(?:phone|number|mobile)\s+is\b.*$/i, " ")
      .replace(/\b(phone|number|mobile)\b.*$/i, " ")
      .replace(/\bfrom\s+[a-z][a-z\s]+$/i, " ")
      .trim();
    if (raw) {
      return {
        type: "customer_create",
        name: raw,
        phone: phone || undefined
      };
    }
  }

  const name = withoutPhone
    .replace(/\b(can you|please|for me|this down|put in a)\b/gi, " ")
    .replace(/\b(add|ad|new|save|create|make|put|stick)\b/gi, " ")
    .replace(/\b(customer|client|costumer|cusomer|custmer|record|called|name is|name|phone|number|mobile|is|as)\b/gi, " ")
    .replace(/<session-[^>]+>/gi, " ")
    .replace(/\b(job|title|price|total|deposit|due|task|service)\b.*$/i, " ")
    .replace(/[,:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bfrom\s+[a-z][a-z\s]+$/i, "")
    .trim();

  if (!name) {
    return { type: "unknown" };
  }

  return {
    type: "customer_create",
    name,
    phone: phone || undefined
  };
};

const parseJobCreate = (text: string): ParsedIntent | null => {
  const looksLikeStructuredJobCreate =
    /^(?:new\s+(?:job|customer|costumer))\b/i.test(text) ||
    (/(\bcustomer\b|\bcostumer\b|\bclient\b|\bname\b)\s*[:=]/i.test(text) &&
      /(\bjob\b|\btitle\b|\btask\b|\bservice\b)\s*[:=]/i.test(text) &&
      /(\bprice\b|\bcost\b|\bamount\b|\btotal\b)\s*[:=]/i.test(text));

  if (!looksLikeStructuredJobCreate) {
    return null;
  }

  const kv = parseKeyValues(text);

  const customerName =
    kv.customer ||
    kv.customer_name ||
    kv.costumer ||
    kv.client ||
    kv.client_name ||
    kv.name;
  const customerPhone = kv.customer_phone || kv.phone;
  const title = kv.title || kv.job || kv.task || kv.service;
  const totalValue = kv.total || kv.total_price || kv.price || kv.cost || kv.amount;
  const depositValue =
    kv.deposit || kv.deposite || kv.taken_deposit || kv.take_deposit || kv.paid_deposit;
  const dueDate = parseDate(kv.due || kv.due_date);
  const notes = kv.notes || kv.note || kv.description;

  const totalPence = totalValue ? parseMoneyToPence(totalValue) : null;
  const depositPence = depositValue ? parseMoneyToPence(depositValue) ?? undefined : undefined;

  if (!customerName || !title || !totalPence) {
    return { type: "unknown" };
  }

  return {
    type: "job_create",
    customerName,
    customerPhone,
    title,
    totalPence,
    depositPence,
    dueDate,
    notes
  };
};

const parsePaymentAdd = (text: string): ParsedIntent | null => {
  const offAccountPattern = text.match(
    /^(?:take|put|add|record|log)\s+£?(\d+(?:\.\d{1,2})?)\s*(cash|bank|card)?\s+off\s+(.+?)\s+account$/i
  );
  if (offAccountPattern) {
    const amountPence = parseMoneyToPence(offAccountPattern[1]);
    if (!amountPence) {
      return { type: "unknown" };
    }
    return {
      type: "payment_add",
      customerName: offAccountPattern[3].trim(),
      amountPence,
      method: parsePaymentMethod(offAccountPattern[2])
    };
  }

  const paidInFullTailCustomer = text.match(
    /^(?:customer\s+)?paid\s+in\s+full\s+£?(\d+(?:\.\d{1,2})?)\s+(.+)$/i
  );
  if (paidInFullTailCustomer) {
    const amountPence = parseMoneyToPence(paidInFullTailCustomer[1]);
    if (!amountPence) {
      return { type: "unknown" };
    }
    return {
      type: "payment_add",
      customerName: paidInFullTailCustomer[2].trim(),
      amountPence,
      method: "unknown"
    };
  }

  const naturalForPattern = text.match(
    /^(?:add|record|log)(?:\s+partial)?\s+payment(?:\s+for)?\s+(.+?)\s+£?(\d+(?:\.\d{1,2})?)$/i
  );
  if (naturalForPattern) {
    const customerName = naturalForPattern[1].trim();
    const amountPence = parseMoneyToPence(naturalForPattern[2]);
    if (!amountPence) {
      return { type: "unknown" };
    }

    return {
      type: "payment_add",
      customerName,
      amountPence,
      method: "unknown"
    };
  }

  const fromPattern = text.match(
    /^(?:add\s+payment|put\s+down|record|log|can you log|bank transfer|cash|add partial payment)\s+£?(\d+(?:\.\d{1,2})?)\s+(?:from)\s+(.+)$/i
  );
  if (fromPattern) {
    const amountPence = parseMoneyToPence(fromPattern[1]);
    if (!amountPence) {
      return { type: "unknown" };
    }

    return {
      type: "payment_add",
      customerName: fromPattern[2].trim(),
      amountPence,
      method: /^bank transfer/i.test(text) ? "bank" : /^cash/i.test(text) ? "cash" : "unknown"
    };
  }

  const reverseFromPattern = text.match(
    /^(?:bank transfer|cash)\s+from\s+(.+?)\s+£?(\d+(?:\.\d{1,2})?)$/i
  );
  if (reverseFromPattern) {
    const amountPence = parseMoneyToPence(reverseFromPattern[2]);
    if (!amountPence) {
      return { type: "unknown" };
    }

    return {
      type: "payment_add",
      customerName: reverseFromPattern[1].trim(),
      amountPence,
      method: /^bank transfer/i.test(text) ? "bank" : "cash"
    };
  }

  if (/^payment\b/i.test(text) || /^add payment\b/i.test(text)) {
    const kv = parseKeyValues(text.replace(/^add\s+/i, ""));
    const amount = kv.amount || kv.value;
    const amountPence = amount ? parseMoneyToPence(amount) : null;

    if (!amountPence) {
      return { type: "unknown" };
    }

    return {
      type: "payment_add",
      jobId: kv.job || kv.job_id,
      customerName: kv.customer,
      amountPence,
      method: parsePaymentMethod(kv.method),
      note: kv.note
    };
  }

  const paidMatch = text.match(/^(.+?)\s+paid\s+£?(\d+(?:\.\d{1,2})?)$/i);
  const paidMeMatch = text.match(/^customer\s+(.+?)\s+paid\s+me\s+£?(\d+(?:\.\d{1,2})?)(?:\s+.+)?$/i);

  if (paidMeMatch) {
    const customerName = paidMeMatch[1].trim();
    const amountPence = parseMoneyToPence(paidMeMatch[2]);

    if (!amountPence) {
      return { type: "unknown" };
    }

    return {
      type: "payment_add",
      customerName,
      amountPence,
      method: "unknown"
    };
  }

  if (!paidMatch) {
    return null;
  }

  const customerName = paidMatch[1].trim();
  const amountPence = parseMoneyToPence(paidMatch[2]);

  if (!amountPence) {
    return { type: "unknown" };
  }

  return {
    type: "payment_add",
    customerName,
    amountPence,
    method: "unknown"
  };
};

const parseJobClose = (text: string): ParsedIntent | null => {
  const closeCustomerJobs = text.match(/^close\s+(.+?)\s+jobs$/i);
  if (closeCustomerJobs) {
    const customerQuery = closeCustomerJobs[1].trim().replace(/'s$/i, "").trim();
    if (!customerQuery) {
      return { type: "unknown" };
    }
    return { type: "job_close_customer", customerQuery };
  }

  const direct = text.match(/^close job\s+([a-zA-Z0-9-]+)$/i);
  if (direct) {
    return { type: "job_close", jobId: direct[1] };
  }

  if (!/^job close\b/i.test(text)) {
    return null;
  }

  const kv = parseKeyValues(text);
  const jobId = kv.job || kv.job_id || kv.id;

  if (!jobId) {
    return { type: "unknown" };
  }

  return { type: "job_close", jobId };
};

const parseJobStatusUpdate = (text: string): ParsedIntent | null => {
  const completePatterns = [
    /^(?:mark)\s+(.+?)\s+as\s+(?:completed|done|finished)$/i,
    /^(?:set)\s+(.+?)\s+to\s+(?:completed|done|finished)$/i,
    /^job\s+(?:done|completed)\s+for\s+(.+)$/i
  ];

  for (const pattern of completePatterns) {
    const match = text.match(pattern);
    const jobQuery = match?.[1]?.trim();
    if (jobQuery) {
      return { type: "job_close", jobId: jobQuery };
    }
  }

  const statusPatterns = [
    { pattern: /^(?:pause)\s+(.+)$/i, status: "active" as const },
    { pattern: /^(?:set|mark)\s+(.+?)\s+to\s+(?:paused|pending)$/i, status: "active" as const },
    { pattern: /^(?:set|mark)\s+(.+?)\s+to\s+(?:cancelled|canceled)$/i, status: "canceled" as const },
    { pattern: /^(?:reopen|reactivate)\s+(.+)$/i, status: "active" as const }
  ];

  for (const { pattern, status } of statusPatterns) {
    const match = text.match(pattern);
    const jobQuery = match?.[1]?.trim();
    if (jobQuery) {
      return { type: "job_set_status", jobId: jobQuery, status };
    }
  }

  return null;
};

const parseCustomerFind = (text: string): ParsedIntent | null => {
  const accountPatterns = [
    /^(?:show|open|get|bring)\s+(.+?)\s+account$/i,
    /^show\s+me\s+the\s+account\s+for\s+(.+)$/i,
    /^account\s+for\s+(.+)$/i,
    /^pull\s+up\s+(.+)$/i
  ];

  for (const pattern of accountPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const query = match[1].trim().replace(/'s$/i, "").trim();
      if (!query) {
        return { type: "unknown" };
      }
      return { type: "customer_find", query };
    }
  }

  const naturalLookupPatterns = [
    /^search\s+for\s+(.+)$/i,
    /^look\s+up\s+(.+)$/i,
    /^show\s+customer\s+called\s+(.+)$/i,
    /^get\s+me\s+(.+)$/i,
    /^show\s+me\s+(.+)$/i,
    /^bring\s+up\s+(.+)$/i
  ];

  for (const pattern of naturalLookupPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const query = match[1].trim().replace(/'s$/i, "").trim();
      if (!query || /\b(account|record|records)\b/i.test(query)) {
        continue;
      }
      return { type: "customer_find", query };
    }
  }

  const customerFindMatch = text.match(/^customer\s+find\s*[:=]?\s*(.+)$/i);
  if (customerFindMatch) {
    const query = customerFindMatch[1].trim();
    if (!query) {
      return { type: "unknown" };
    }
    return { type: "customer_find", query };
  }

  const findCustomerMatch = text.match(/^find\s+customer\s*[:=]?\s*(.+)$/i);
  if (findCustomerMatch) {
    const query = findCustomerMatch[1].trim();
    if (!query) {
      return { type: "unknown" };
    }
    return { type: "customer_find", query };
  }

  const match = text.match(/^find\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const raw = match[1].trim();
  const query = raw.replace(/^(customer|client|name)\s*[:=]\s*/i, "").trim();
  if (!query) {
    return { type: "unknown" };
  }

  return { type: "customer_find", query };
};

const parseCustomerPhoneUpdate = (text: string): ParsedIntent | null => {
  const direct = text.match(
    /^(?:add|update|set|change|swap)\s+(.+?)\s+(?:phone|phone number|phone num|number|mobile)\s*(?:to|as|=|:)?\s*(\+?[0-9][0-9\s\-().]{5,})$/i
  );
  if (direct) {
    const customerQuery = direct[1]
      .trim()
      .replace(/^(customer)\s+/i, "")
      .replace(/'s$/i, "")
      .trim();
    const phone = direct[2].trim();
    if (!customerQuery || !phone) {
      return { type: "unknown" };
    }
    return {
      type: "customer_update_phone",
      customerQuery,
      phone
    };
  }

  const kvStyle = text.match(
    /^customer\s+update\s*[:=]?\s*name\s*[:=]\s*(.+?)\s*;\s*phone\s*[:=]\s*(\+?[0-9][0-9\s\-().]{5,})$/i
  );
  if (kvStyle) {
    const customerQuery = kvStyle[1].trim();
    const phone = kvStyle[2].trim();
    if (!customerQuery || !phone) {
      return { type: "unknown" };
    }
    return {
      type: "customer_update_phone",
      customerQuery,
      phone
    };
  }

  const natural = text.match(
    /^(?:update|change|swap)\s+(?:customer\s+)?(.+?)\s+(?:phone|number|mobile)\s+(?:to\s+)?(\+?[0-9][0-9\s\-().]{5,})$/i
  );
  if (natural) {
    const customerQuery = natural[1].trim().replace(/'s$/i, "").trim();
    const phone = natural[2].trim();
    if (!customerQuery || !phone) {
      return { type: "unknown" };
    }
    return {
      type: "customer_update_phone",
      customerQuery,
      phone
    };
  }

  return null;
};

const parseExpenseAdd = (text: string): ParsedIntent | null => {
  const isInvalidExpenseNote = (note: string, amountRaw?: string) => {
    const normalized = note.trim().toLowerCase();
    const digitsOnly = (amountRaw ?? "").replace(/\D/g, "");

    if (!normalized) {
      return true;
    }

    if (
      /\b(from|phone|mobile|number|customer|client|account|invoice|payment|paid me|transfer|bank|cash)\b/i.test(
        normalized
      )
    ) {
      return true;
    }

    if (/\b(update|change|swap|create|add)\b/i.test(normalized)) {
      return true;
    }

    if (/\b(title|deposit|due)\b/i.test(normalized)) {
      return true;
    }

    if (digitsOnly.length >= 5 || /^0\d{3,}$/.test(digitsOnly)) {
      return true;
    }

    return false;
  };

  const multiMatches = Array.from(
    text.matchAll(
      /(?:^|(?:and|,)\s*)(?:i\s+)?(?:paid|spent)?\s*£?(\d+(?:\.\d{1,2})?)\s*(?:quid|pounds|gbp)?\s+for\s+(.+?)(?=\s+(?:and|,)\s+(?:£?\d)|$)/gi
    )
  );

  if (multiMatches.length >= 2) {
    const items = multiMatches
      .map((match) => {
        const amountPence = parseMoneyToPence(match[1]);
        if (!amountPence) {
          return null;
        }

        return {
          amountPence,
          note: match[2]?.trim() || undefined
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (items.length >= 2) {
      return {
        type: "expense_add_batch",
        items
      };
    }
  }

  const expenseLeadAmount = text.match(
    /^(?:add|new)\s+exp(?:e)?nse?s?\s+£?(\d+(?:\.\d{1,2})?)\s+(.+)$/i
  );
  if (expenseLeadAmount) {
    const amountPence = parseMoneyToPence(expenseLeadAmount[1]);
    if (!amountPence) {
      return { type: "unknown" };
    }
    if (isInvalidExpenseNote(expenseLeadAmount[2].trim())) {
      return null;
    }

    return {
      type: "expense_add",
      amountPence,
      note: expenseLeadAmount[2].trim()
    };
  }

  const expenseTrailingAmount = text.match(
    /^(?:add|new)\s+exp(?:e)?nse?s?\s+for\s+(.+?)\s+£?(\d+(?:\.\d{1,2})?)$/i
  );
  if (expenseTrailingAmount) {
    const amountPence = parseMoneyToPence(expenseTrailingAmount[2]);
    if (!amountPence) {
      return { type: "unknown" };
    }
    if (isInvalidExpenseNote(expenseTrailingAmount[1].trim())) {
      return null;
    }

    return {
      type: "expense_add",
      amountPence,
      note: expenseTrailingAmount[1].trim()
    };
  }

  const putThrough = text.match(
    /^(?:put through|record)\s+£?(\d+(?:\.\d{1,2})?)\s+(?:for|on)\s+(.+)$/i
  );
  if (putThrough) {
    const amountPence = parseMoneyToPence(putThrough[1]);
    if (!amountPence) {
      return { type: "unknown" };
    }
    if (isInvalidExpenseNote(putThrough[2].trim())) {
      return null;
    }

    return {
      type: "expense_add",
      amountPence,
      note: putThrough[2].trim()
    };
  }

  const costMeLeading = text.match(
    /^(.+?)\s+cost me\s+£?(\d+(?:\.\d{1,2})?)(?:\s+(?:today|yesterday))?$/i
  );
  if (costMeLeading) {
    const amountPence = parseMoneyToPence(costMeLeading[2]);
    if (!amountPence) {
      return { type: "unknown" };
    }
    if (isInvalidExpenseNote(costMeLeading[1].trim())) {
      return null;
    }

    return {
      type: "expense_add",
      amountPence,
      note: costMeLeading[1].trim()
    };
  }

  const costMeOn = text.match(
    /^cost me\s+£?(\d+(?:\.\d{1,2})?)\s+on\s+(.+)$/i
  );
  if (costMeOn) {
    const amountPence = parseMoneyToPence(costMeOn[1]);
    if (!amountPence) {
      return { type: "unknown" };
    }
    if (isInvalidExpenseNote(costMeOn[2].trim())) {
      return null;
    }

    return {
      type: "expense_add",
      amountPence,
      note: costMeOn[2].trim()
    };
  }

  const categoryAmount = text.match(
    /^([a-z][a-z0-9 '&-]+)\s+£?(\d+(?:\.\d{1,2})?)$/i
  );
  if (categoryAmount && !isInvalidExpenseNote(categoryAmount[1], categoryAmount[2])) {
    const amountPence = parseMoneyToPence(categoryAmount[2]);
    if (!amountPence) {
      return { type: "unknown" };
    }

    return {
      type: "expense_add",
      amountPence,
      note: categoryAmount[1].trim()
    };
  }

  const direct = text.match(
    /^(?:i\s+)?(?:paid|spent|bought)\s+(?:for\s+)?£?(\d+(?:\.\d{1,2})?)\s*(?:quid|pounds|gbp)?(?:\s+for\s+(.+?))?(?:\s+(?:at|from)\s+(.+))?$/i
  );
  if (!direct) {
    const boughtPaid = text.match(
      /^(?:i\s+)?bought\s+(.+?)\s+paid\s+£?(\d+(?:\.\d{1,2})?)\s*(?:quid|pounds|gbp)?(?:\s+(?:at|from)\s+(.+))?$/i
    );
    if (!boughtPaid) {
      return null;
    }

    const amountPence = parseMoneyToPence(boughtPaid[2]);
    if (!amountPence) {
      return { type: "unknown" };
    }

    return {
      type: "expense_add",
      amountPence,
      note: `bought ${boughtPaid[1].trim()}`,
      counterpartyName: boughtPaid[3]?.trim()
    };
  }

  const amountPence = parseMoneyToPence(direct[1]);
  if (!amountPence) {
    return { type: "unknown" };
  }

  return {
    type: "expense_add",
    amountPence,
    note: direct[2]?.trim(),
    counterpartyName: direct[3]?.trim()
  };
};

const parseVendorDebtAdd = (text: string): ParsedIntent | null => {
  const debtSimple = text.match(
    /^debt\s+£?(\d+(?:\.\d{1,2})?)\s*(?:quid|pounds|gbp)?\s+(.+)$/i
  );
  if (debtSimple) {
    const amountPence = parseMoneyToPence(debtSimple[1]);
    if (!amountPence) {
      return { type: "unknown" };
    }
    return {
      type: "vendor_debt_add",
      amountPence,
      vendorQuery: debtSimple[2].trim()
    };
  }

  const onAccount = text.match(
    /^(?:put|add)\s+£?(\d+(?:\.\d{1,2})?)\s*(?:quid|pounds|gbp)?\s+on\s+account\s+(?:at|with)\s+(.+)$/i
  );
  if (onAccount) {
    const amountPence = parseMoneyToPence(onAccount[1]);
    if (!amountPence) {
      return { type: "unknown" };
    }
    return {
      type: "vendor_debt_add",
      amountPence,
      vendorQuery: onAccount[2].trim()
    };
  }

  const owe = text.match(
    /^(?:i\s+)?owe\s+(.+?)\s+£?(\d+(?:\.\d{1,2})?)\s*(?:quid|pounds|gbp)?$/i
  );
  if (owe) {
    const amountPence = parseMoneyToPence(owe[2]);
    if (!amountPence) {
      return { type: "unknown" };
    }
    return {
      type: "vendor_debt_add",
      amountPence,
      vendorQuery: owe[1].trim()
    };
  }

  return null;
};

const parseVendorPaymentAdd = (text: string): ParsedIntent | null => {
  const paidTo = text.match(
    /^(?:i\s+)?(?:paid|settled|paid off|sent)\s+£?(\d+(?:\.\d{1,2})?)\s*(?:quid|pounds|gbp)?\s+(?:to|with)\s+(.+)$/i
  );
  if (!paidTo) {
    return null;
  }

  const amountPence = parseMoneyToPence(paidTo[1]);
  if (!amountPence) {
    return { type: "unknown" };
  }

  return {
    type: "vendor_payment_add",
    amountPence,
    vendorQuery: paidTo[2].trim()
  };
};

const parseInvoiceCreate = (text: string): ParsedIntent | null => {
  const createInvoice = text.match(/^(?:create|make|generate)\s+(.+?)\s+invoice$/i);
  if (createInvoice) {
    const customerQuery = createInvoice[1].trim().replace(/'s$/i, "").trim();
    if (!customerQuery) {
      return { type: "unknown" };
    }
    return { type: "invoice_create", customerQuery };
  }

  const invoiceCustomerFirst = text.match(/^invoice\s+(.+?)\s+for\s+(.+)$/i);
  if (invoiceCustomerFirst) {
    const customerQuery = invoiceCustomerFirst[1].trim().replace(/'s$/i, "").trim();
    if (!customerQuery) {
      return { type: "unknown" };
    }
    return { type: "invoice_create", customerQuery };
  }

  const invoiceFor = text.match(/^(?:create|make|generate|send|show|raise|draft)(?:\s+me)?\s+(?:an?\s+)?invoice\s+(?:for\s+)?(.+)$/i);
  if (invoiceFor) {
    const raw = invoiceFor[1].trim().replace(/'s$/i, "").trim();
    const tokens = raw.split(/\s+/).filter(Boolean);
    const customerQuery = tokens.length >= 2 ? tokens.slice(0, 2).join(" ") : raw;
    if (!customerQuery) {
      return { type: "unknown" };
    }
    return { type: "invoice_create", customerQuery };
  }

  if (/^(?:create|make|generate|send|show)\s+invoice$/i.test(text)) {
    return { type: "invoice_create" };
  }

  return null;
};

const parsePaymentList = (text: string): ParsedIntent | null => {
  if (!/\bpayments?\b|\bpaid\b|\bcame in\b|\bgot paid\b|\bpaid in\b/i.test(text)) {
    return null;
  }

  if (
    /^(?:add|record|log|take|put|can you log)\b/i.test(text) ||
    /\bfrom\s+[a-z]/i.test(text) ||
    /\bcustomer\s+.+\s+paid\b/i.test(text) ||
    /\b(bank transfer|cash)\s+from\b/i.test(text) ||
    /^payment\s+for\b/i.test(text) ||
    /\bexport\b/i.test(text) ||
    /\bpdf\b/i.test(text)
  ) {
    return null;
  }

  if (
    !/^(?:show|list|get|who|bring|what|how much)/i.test(text) &&
    !/\bpayments?\b/i.test(text) &&
    !/\bcame in\b/i.test(text) &&
    !/\bpaid in\b/i.test(text)
  ) {
    return null;
  }

  const lower = text.toLowerCase();
  const range = lower.includes("yesterday")
    ? "yesterday"
    : lower.includes("today")
      ? "today"
      : lower.includes("week")
        ? "week"
        : lower.includes("month") || lower.includes("30 days")
          ? "month"
          : "all";

  return { type: "payment_list", range };
};

export const parseIntent = (input: string): ParsedIntent => {
  const text = input.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return { type: "unknown" };
  }

  if (["hi", "hello", "hey", "good morning", "good afternoon", "good evening"].includes(lower)) {
    return { type: "greeting" };
  }

  if (lower === "confirm" || lower === "yes" || lower === "ok confirm") {
    return { type: "confirm_action" };
  }

  if (lower === "cancel" || lower === "no") {
    return { type: "cancel_action" };
  }

  const onboarding = parseOnboarding(text);
  if (onboarding) {
    return onboarding;
  }

  const jobCreate = parseJobCreate(text);
  if (jobCreate) {
    return jobCreate;
  }

  const customerCreate = parseCustomerCreate(text);
  if (customerCreate) {
    return customerCreate;
  }

  const expenseAdd = parseExpenseAdd(text);
  if (expenseAdd) {
    return expenseAdd;
  }

  const vendorDebtAdd = parseVendorDebtAdd(text);
  if (vendorDebtAdd) {
    return vendorDebtAdd;
  }

  const vendorPaymentAdd = parseVendorPaymentAdd(text);
  if (vendorPaymentAdd) {
    return vendorPaymentAdd;
  }

  const invoiceCreate = parseInvoiceCreate(text);
  if (invoiceCreate) {
    return invoiceCreate;
  }

  const paymentAdd = parsePaymentAdd(text);
  if (paymentAdd) {
    return paymentAdd;
  }

  const paymentList = parsePaymentList(text);
  if (paymentList) {
    return paymentList;
  }

  const jobClose = parseJobClose(text);
  if (jobClose) {
    return jobClose;
  }

  const jobStatusUpdate = parseJobStatusUpdate(text);
  if (jobStatusUpdate) {
    return jobStatusUpdate;
  }

  const customerFind = parseCustomerFind(text);
  if (customerFind) {
    return customerFind;
  }

  const customerPhoneUpdate = parseCustomerPhoneUpdate(text);
  if (customerPhoneUpdate) {
    return customerPhoneUpdate;
  }

  if (
    lower === "active jobs" ||
    lower === "list active jobs" ||
    lower === "show my jobs" ||
    lower === "show jobs" ||
    lower === "show open jobs"
  ) {
    return { type: "job_list_active" };
  }

  if (lower === "show completed jobs") {
    return { type: "job_list_last_30" };
  }

  if (
    lower === "list all in progress jobs" ||
    lower === "in progress jobs" ||
    lower === "show in progress jobs" ||
    lower === "list in progress jobs"
  ) {
    return { type: "job_list_active" };
  }

  if (lower === "jobs due this week" || lower === "due this week") {
    return { type: "job_list_due_week" };
  }

  if (
    lower === "show this week's callouts" ||
    lower === "show this weeks callouts" ||
    lower === "this week's callouts" ||
    lower === "this weeks callouts"
  ) {
    return { type: "job_list_due_week" };
  }

  if (lower === "what's left open" || lower === "what is left open") {
    return { type: "job_list_active" };
  }

  if (
    /^jobs\s+for\s+.+$/i.test(text) ||
    /^show me today'?s work$/i.test(text) ||
    /^what jobs have i got (?:on )?(?:today|tomorrow)$/i.test(text) ||
    /^list jobs for (?:today|tomorrow)$/i.test(text) ||
    /^what have i got on (?:today|tomorrow)$/i.test(text) ||
    /^show all jobs for this week$/i.test(text) ||
    /^any jobs for .+$/i.test(text) ||
    /^what have i got on for .+$/i.test(text) ||
    /^what jobs are booked this week$/i.test(text)
  ) {
    return /\bthis week\b/i.test(text) || /^any jobs for (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(text)
      ? { type: "job_list_due_week" }
      : { type: "job_list_active" };
  }

  if (lower === "jobs last 30 days" || lower === "last 30 days") {
    return { type: "job_list_last_30" };
  }

  if (lower.includes("who owes me money")) {
    return { type: "outstanding_list" };
  }

  if (
    /^(?:show|shw|list|get)\s+debts?$/i.test(text) ||
    /\bwho still needs to pay\b/i.test(text) ||
    /\bwho(?:'s| is)? still not paid me\b/i.test(text) ||
    /\bwhich customers havent paid\b/i.test(text) ||
    /\bwho hasn'?t settled up\b/i.test(text) ||
    /\bstill owing\b/i.test(text) ||
    /\bwhat'?s outstanding\b/i.test(text) ||
    /\boutstanding balances?\b/i.test(text) ||
    /\boverdue payments\b/i.test(text)
  ) {
    return { type: "outstanding_list" };
  }

  if (/^(?:hw|how)\s+much\s+did\s+i\s+make\s+(?:tday|today)$/i.test(text)) {
    return { type: "summary_today" };
  }

  if (
    looksLikeFinancialSummary(text) &&
    !/\b(vendor|supplier)\b/i.test(text) &&
    !/\bexport\b|\bpdf\b|\brecords?\b/i.test(text) &&
    !/^(?:new|add)\s+expense\s+£?\d/i.test(text)
  ) {
    if (/\byesterday\b/i.test(text)) {
      return { type: "summary_yesterday" };
    }
    if (/\btoday\b|\bend of day\b|\bdaily summary\b/i.test(text)) {
      return { type: "summary_today" };
    }
    return isMonthSummary(text) ? { type: "summary_30" } : { type: "summary_7" };
  }

  if (lower === "summary last 7 days" || lower === "summary 7" || lower === "summary_7") {
    return { type: "summary_7" };
  }

  if (lower === "summary last 30 days" || lower === "summary 30" || lower === "summary_30") {
    return { type: "summary_30" };
  }

  if (
    lower === "supplier summary" ||
    lower === "vendor summary" ||
    lower === "show vendor summary" ||
    lower === "show supplier summary"
  ) {
    return { type: "vendor_summary" };
  }

  if (
    /^(?:bring|show|get|list)\s+(?:my\s+)?(?:expense|expenses|spend|spending)\s+list$/i.test(text) ||
    /^(?:show|list|get)\s+(?:my\s+)?(?:expense|expenses|spend|spending)$/i.test(text) ||
    /^expenses?\s+(?:today|yesterday)$/i.test(text) ||
    /^show\s+this\s+week'?s\s+expenses$/i.test(text)
  ) {
    return { type: "expense_list" };
  }

  if (
    /^(?:bring|send|export|get|show)\s+(?:my\s+)?(?:expense|expenses|spend|spending)\s+(?:record|records)(?:\s+as\s+(?:a\s+)?pdf)?$/i.test(
      text
    ) ||
    /^(?:expense|expenses)\s+pdf$/i.test(text)
  ) {
    return { type: "export_expense_pdf" };
  }

  const exportNamedRecordsPdfMatch = text.match(
    /^(?:bring|send|export|get)\s+(.+?)\s+records(?:\s+as\s+(?:a\s+)?pdf)?$/i
  );
  if (exportNamedRecordsPdfMatch) {
    const rawQuery = exportNamedRecordsPdfMatch[1].trim();
    const query = rawQuery.replace(/'s$/i, "").trim();
    const isAllRecordsQuery = /^(all|all customers|everything|all data|full)$/i.test(query);
    return isAllRecordsQuery ? { type: "export_pdf" } : { type: "export_pdf", customerQuery: query };
  }

  const exportCustomerPdfMatch = text.match(
    /^(?:export|pdf|send)\s+(?:customer\s+)?records(?:\s+for)?\s*[:=]?\s*(.+)$/i
  );
  if (exportCustomerPdfMatch) {
    const customerQuery = exportCustomerPdfMatch[1].trim();
    if (!customerQuery) {
      return { type: "unknown" };
    }

    return { type: "export_pdf", customerQuery };
  }

  if (
    lower === "export pdf" ||
    lower === "pdf export" ||
    lower === "export all pdf" ||
    lower === "export all records pdf" ||
    lower === "bring all records" ||
    lower === "send all records" ||
    lower === "send all records pdf"
  ) {
    return { type: "export_pdf" };
  }

  const exportVendorPdfMatch = text.match(
    /^(?:send|export|show)\s+(?:(.+?)\s+)?(?:supplier|vendor)\s+(?:payments|debts|records|expenses)\s+as\s+pdf$/i
  );
  if (exportVendorPdfMatch) {
    const vendorQuery = exportVendorPdfMatch[1]?.trim();
    return vendorQuery ? { type: "export_vendor_pdf", vendorQuery } : { type: "export_vendor_pdf" };
  }

  if (
    lower === "export my data" ||
    lower === "export data" ||
    lower === "export" ||
    lower === "bring my records" ||
    lower === "send my records"
  ) {
    return { type: "export_pdf" };
  }

  if (lower === "subscribe") {
    return { type: "subscribe" };
  }

  if (lower === "stop briefing") {
    return { type: "briefing_toggle", enabled: false };
  }

  if (lower === "start briefing") {
    return { type: "briefing_toggle", enabled: true };
  }

  if (lower === "help") {
    return { type: "help" };
  }

  return { type: "unknown" };
};
