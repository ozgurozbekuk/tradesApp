const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const toCanonicalKey = (key: string) => {
  const normalized = key.trim().toLowerCase();

  if (["costumer", "customer", "client", "client name", "customer name", "name"].includes(normalized)) {
    return "customer";
  }

  if (["price", "cost", "amount", "total", "total price"].includes(normalized)) {
    return "total";
  }

  if (["deposite", "deposit", "taken deposit", "take deposit", "taked deposite", "paid deposit"].includes(normalized)) {
    return "deposit";
  }

  if (["job", "task", "service", "title"].includes(normalized)) {
    return "title";
  }

  if (["due", "due date", "due_date"].includes(normalized)) {
    return "due";
  }

  return normalized.replace(/\s+/g, "_");
};

const normalizeNewJobText = (text: string) => {
  const startedAsNewCustomer = /^new\s*(?:customer|costumer)\b/i.test(text);
  let body = text.replace(/^new\s*(?:job|customer|costumer)\s*[:\-]?/i, "").trim();
  body = body.replace(/\b(please\s+record|record\s+this|please\s+save)\b/gi, "").trim();
  body = body.replace(/\s*,\s*/g, "; ");

  const rawParts = body
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const keyedParts: string[] = [];
  const freeParts: string[] = [];

  for (const part of rawParts) {
      const match = part.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
      if (!match) {
        freeParts.push(part);
        continue;
      }

      const key = toCanonicalKey(match[1]);
      const value = normalizeWhitespace(match[2]);
      keyedParts.push(`${key}: ${value}`);
  }

  // For "new customer ..." messages, the first free part is usually the customer.
  if (startedAsNewCustomer) {
    if (!keyedParts.some((item) => item.startsWith("customer:")) && freeParts[0]) {
      keyedParts.unshift(`customer: ${normalizeWhitespace(freeParts[0])}`);
    }

    if (!keyedParts.some((item) => item.startsWith("title:")) && freeParts[1]) {
      keyedParts.push(`title: ${normalizeWhitespace(freeParts[1])}`);
    }
  } else {
    // For "new job ..." messages, the first free part is usually the title.
    if (!keyedParts.some((item) => item.startsWith("title:")) && freeParts[0]) {
      keyedParts.unshift(`title: ${normalizeWhitespace(freeParts[0])}`);
    }

    if (!keyedParts.some((item) => item.startsWith("customer:")) && freeParts[1]) {
      keyedParts.push(`customer: ${normalizeWhitespace(freeParts[1])}`);
    }
  }

  return `NEW JOB ${keyedParts.join("; ")}`;
};

const normalizePaymentText = (text: string) => {
  const offAccountPattern = text.match(
    /^(?:take|put|add|record|log)\s+([£$]?\d+(?:\.\d{1,2})?)\s*(cash|bank|card)?\s+off\s+(.+?)\s+account$/i
  );
  if (offAccountPattern) {
    const amount = offAccountPattern[1].replace(/^\$/, "£");
    const customer = normalizeWhitespace(offAccountPattern[3]);
    const method = offAccountPattern[2] ? `; method: ${offAccountPattern[2].toLowerCase()}` : "";
    return `PAYMENT customer: ${customer}${method}; amount: ${amount}`;
  }

  const paidInFullPattern = text.match(/^(?:customer\s+)?paid\s+in\s+full\s+([£$]?\d+(?:\.\d{1,2})?)\s+(.+)$/i);
  if (paidInFullPattern) {
    const amount = paidInFullPattern[1].replace(/^\$/, "£");
    const customer = normalizeWhitespace(paidInFullPattern[2]);
    return `PAYMENT customer: ${customer}; amount: ${amount}`;
  }

  const naturalForPattern = text.match(
    /^(?:add|record|log)(?:\s+partial)?\s+payment(?:\s+for)?\s+(.+?)\s+([£$]?\d+(?:\.\d{1,2})?)$/i
  );
  if (naturalForPattern) {
    const customer = normalizeWhitespace(naturalForPattern[1]);
    const amount = naturalForPattern[2].replace(/^\$/, "£");
    return `PAYMENT customer: ${customer}; amount: ${amount}`;
  }

  const fromPattern = text.match(
    /^(?:add\s+payment|put\s+down|record|log|can you log|bank transfer|cash|add partial payment)\s+([£$]?\d+(?:\.\d{1,2})?)\s+from\s+(.+)$/i
  );
  if (fromPattern) {
    const amount = fromPattern[1].replace(/^\$/, "£");
    const customer = normalizeWhitespace(fromPattern[2]);
    return `PAYMENT customer: ${customer}; amount: ${amount}`;
  }

  const paidPattern = text.match(/^(.+?)\s+paid\s+([£$]?\d+(?:\.\d{1,2})?)$/i);
  if (paidPattern) {
    const customer = normalizeWhitespace(paidPattern[1]);
    const amount = paidPattern[2].replace(/^\$/, "£");
    return `PAYMENT customer: ${customer}; amount: ${amount}`;
  }

  const paidMePattern = text.match(/^customer\s+(.+?)\s+paid\s+me\s+([£$]?\d+(?:\.\d{1,2})?)(?:\s+.+)?$/i);
  if (paidMePattern) {
    const customer = normalizeWhitespace(paidMePattern[1]);
    const amount = paidMePattern[2].replace(/^\$/, "£");
    return `PAYMENT customer: ${customer}; amount: ${amount}`;
  }

  const receivedPattern = text.match(/^i\s+received\s+([£$]?\d+(?:\.\d{1,2})?)\s+from\s+(.+)$/i);
  if (receivedPattern) {
    const amount = receivedPattern[1].replace(/^\$/, "£");
    const customer = normalizeWhitespace(receivedPattern[2]);
    return `PAYMENT customer: ${customer}; amount: ${amount}`;
  }

  if (/^payment\b/i.test(text) || /^add payment\b/i.test(text)) {
    let body = text.replace(/^add\s+/i, "").replace(/^payment\s*[:\-]?/i, "").trim();
    body = body.replace(/\s*,\s*/g, "; ");

    const parts = body
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const match = part.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
        if (!match) {
          return part;
        }

        const key = toCanonicalKey(match[1]);
        const value = normalizeWhitespace(match[2]);
        return `${key}: ${value}`;
      });

    return `PAYMENT ${parts.join("; ")}`;
  }

  return text;
};

const normalizeAccountLookupText = (text: string) => {
  const direct =
    text.match(/^(?:open|show|get|bring)\s+(.+?)'?s?\s+account$/i) ??
    text.match(/^(.+?)\s+account$/i) ??
    text.match(/^account\s+for\s+(.+)$/i);

  if (!direct?.[1]) {
    return text;
  }

  return `Account for ${normalizeWhitespace(direct[1]).replace(/'s$/i, "")}`;
};

export const normalizeInboundText = (input: string) => {
  const text = normalizeWhitespace(input);
  const lower = text.toLowerCase();

  const bringRecordMatch = text.match(/^bring\s+(.+?)\s+record$/i);
  if (bringRecordMatch) {
    return `Find ${normalizeWhitespace(bringRecordMatch[1])}`;
  }

  const showRecordMatch = text.match(/^(show|get)\s+(.+?)\s+record$/i);
  if (showRecordMatch) {
    return `Find ${normalizeWhitespace(showRecordMatch[2])}`;
  }

  const looksLikeCustomerWithJob =
    (lower.startsWith("new customer") || lower.startsWith("new costumer")) &&
    (/(\bjob\b|\btitle\b|\btask\b|\bservice\b)\s*[:=]/i.test(text) ||
      /(\bprice\b|\bcost\b|\bamount\b|\btotal\b)\s*[:=]/i.test(text));

  if (lower.startsWith("new job") || looksLikeCustomerWithJob) {
    return normalizeNewJobText(text);
  }

  if (
    lower.startsWith("payment") ||
    lower.startsWith("add payment") ||
    lower.includes(" paid ") ||
    lower.startsWith("i received ") ||
    /^(?:take|put|add|record|log)\s+[£$]?\d+(?:\.\d{1,2})?\s*(?:cash|bank|card)?\s+off\s+.+\s+account$/i.test(text) ||
    /^(?:customer\s+)?paid\s+in\s+full\s+[£$]?\d+(?:\.\d{1,2})?\s+.+$/i.test(text)
  ) {
    return normalizePaymentText(text);
  }

  if (/\baccount\b/.test(lower) && !/\b(payment|paid|cash|bank transfer)\b/.test(lower)) {
    return normalizeAccountLookupText(text);
  }

  if (
    /\bhow much did i make this week\b|\bthis week summary\b|\bweekly earnings\b|\bthis months income\b|\bwhat did i earn today\b|\bprofit this month\b|\bincome and expenses for this month\b|\bhow am i doing this week\b|\btakings today\b|\bmonth to date earnings\b|\blast week's total income\b|\bshow my numbers for this month\b|\bwhat did i make yesterday\b|\bhow much profit have i got this week\b|\bhow much did i spend this week\b|\bsummary today\b|\bend of day summary\b|\bdaily summary\b/.test(lower)
  ) {
    return text;
  }

  if (/\bshow customers with outstanding debt\b|\bwho owes me money\b/.test(lower)) {
    return "Outstanding balances";
  }

  return text;
};
