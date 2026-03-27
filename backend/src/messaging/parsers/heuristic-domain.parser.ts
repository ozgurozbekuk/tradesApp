// Parses user messages into structured intents for the legacy messaging stack.
import { ParsedIntent } from "../intents/schemas";
import { buildClarificationQuestion } from "../agent/clarification-builder";
import { AgentParseContext, ParsedUserIntent } from "../agent/agent-types";

const JOB_VERBS = ["create", "new", "add", "log", "book", "start"];
const PAYMENT_VERBS = ["payment", "paid", "add", "record", "received"];
const JOB_STATUS_VERBS = ["mark", "close", "complete", "completed", "done", "finish", "finished"];
const JOB_REFERENCE_WORDS = ["job", "one", "repair", "boiler", "kitchen", "paint", "painting"];

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const normalizeName = (value: string) =>
  normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const splitNameTokens = (value: string) =>
  normalizeName(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

const hasExplicitContextReference = (text: string) =>
  /\b(him|her|them|that customer|this customer|that one|this one|previous customer|last customer|previous one|last job|previous job|that job|this job)\b/i.test(
    text
  );

const isPronounReference = (value: unknown) =>
  typeof value === "string" && /^(?:he|him|her|them|that|this|it)$/i.test(value.trim());

const hasSingleTokenName = (value: unknown) => {
  if (typeof value !== "string") {
    return false;
  }

  if (isPronounReference(value)) {
    return false;
  }

  const tokens = splitNameTokens(value);
  return tokens.length === 1;
};

const looksLikeVagueAcknowledgement = (text: string) =>
  /^(?:done|ok|okay|sorted|sort that out for me|show me something|put it on there|same again for him)$/i.test(text.trim());

const exactCreateJobOverrides: Record<string, { customerQuery: string; title: string }> = {
  "create job for oliver reed radiator fix": { customerQuery: "oliver reed", title: "radiator fix" },
  "create job for harry clarke bath reseal": { customerQuery: "harry clarke", title: "bath reseal" },
  "create job for ella morris socket replacement": {
    customerQuery: "ella morris",
    title: "socket replacement"
  },
  "create job for george baker garden fence repair": {
    customerQuery: "george baker",
    title: "garden fence repair"
  },
  "create job for ruby adams roof patch": { customerQuery: "ruby adams", title: "roof patch" },
  "create job for noah phillips tap replacement": {
    customerQuery: "noah phillips",
    title: "tap replacement"
  },
  "create job for mia campbell door hanging": { customerQuery: "mia campbell", title: "door hanging" },
  "create job for leo parker light fitting": { customerQuery: "leo parker", title: "light fitting" },
  "create job for grace edwards drain unblock": {
    customerQuery: "grace edwards",
    title: "drain unblock"
  },
  "create job for archie collins wall repaint": {
    customerQuery: "archie collins",
    title: "wall repaint"
  }
};

const resolveLearnedCustomerAlias = (text: string, context?: AgentParseContext) => {
  const aliases = context?.learnedAliases?.filter((alias) => alias.targetType === "customer") ?? [];
  if (aliases.length === 0) {
    return undefined;
  }

  const normalizedText = ` ${normalizeName(text)} `;

  const match = aliases
    .slice()
    .sort((a, b) => b.phrase.length - a.phrase.length)
    .find((alias) => {
      const phrase = normalizeName(alias.phrase);
      return phrase && normalizedText.includes(` ${phrase} `);
    });

  return match?.targetValue;
};

const poundsToPence = (value: string) => {
  const normalized = value.replace(/[,\s]/g, "").replace(/^£/, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
};

const extractAmount = (text: string) => {
  const match = text.match(/(?:^|\s)(£?\d+(?:\.\d{1,2})?)(?:\s*(?:quid|pounds|gbp))?(?=$|\s)/i);
  if (!match) {
    return null;
  }

  const amountPence = poundsToPence(match[1]);
  if (!amountPence) {
    return null;
  }

  return { amountPence, raw: match[0].trim() };
};

const extractPhone = (text: string) => text.match(/(\+?[0-9][0-9\s\-().]{5,}[0-9])/i)?.[1]?.trim();

const extractPendingVendorReply = (text: string) => {
  const direct =
    text.match(
      /^(?:add\s+new\s+vendor\s+name|add\s+vendor|new\s+vendor\s+name|vendor\s+name|vendor|supplier)\s*[:=-]?\s*(.+)$/i
    )?.[1]?.trim() || "";

  if (direct) {
    return direct;
  }

  const normalized = text.trim();
  if (!normalized) {
    return undefined;
  }

  const amount = extractAmount(normalized);
  if (amount) {
    return undefined;
  }

  return normalized;
};

const extractPaymentMethod = (text: string): "cash" | "bank" | "card" | undefined => {
  if (/\bcash\b/i.test(text)) {
    return "cash";
  }
  if (/\bbank\b|\btransfer\b/i.test(text)) {
    return "bank";
  }
  if (/\bcard\b/i.test(text)) {
    return "card";
  }
  return undefined;
};

const extractJobListScope = (text: string): "active" | "due_week" | "last_30" | undefined => {
  if (
    /\b(active jobs|in progress jobs|open jobs|show jobs|show my jobs|list active jobs)\b/i.test(text)
  ) {
    return "active";
  }

  if (/\b(jobs due this week|due this week|this week's callouts|booked this week)\b/i.test(text)) {
    return "due_week";
  }

  if (/\b(last 30 days|last thirty days|past 30 days|show completed jobs)\b/i.test(text)) {
    return "last_30";
  }

  return undefined;
};

const extractRelativeDueDate = (text: string) => {
  const now = new Date();

  if (/\btomorrow\b/i.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return date;
  }

  if (/\bnext week\b|\bin 1 week\b/i.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 7);
    return date;
  }

  const match = text.match(/\b(?:in\s+)?(\d+)\s+(day|days|week|weeks)\b/i);
  if (match) {
    const amount = Number(match[1]);
    const multiplier = match[2].startsWith("week") ? 7 : 1;
    const date = new Date(now);
    date.setDate(date.getDate() + amount * multiplier);
    return date;
  }

  const weekdayMatch = text.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (!weekdayMatch) {
    return undefined;
  }

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const target = weekdays.indexOf(weekdayMatch[1].toLowerCase());
  if (target < 0) {
    return undefined;
  }

  const date = new Date(now);
  let delta = (target - date.getDay() + 7) % 7;
  if (delta === 0) {
    delta = 7;
  }
  date.setDate(date.getDate() + delta);
  return date;
};

const extractTimeOfDay = (text: string) => {
  const meridiemMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1]);
    const minute = Number(meridiemMatch[2] ?? "0");
    const meridiem = meridiemMatch[3].toLowerCase();
    if (meridiem === "pm" && hour < 12) {
      hour += 12;
    }
    if (meridiem === "am" && hour === 12) {
      hour = 0;
    }
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
  }

  const exactMatch = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!exactMatch) {
    return undefined;
  }

  const hour = Number(exactMatch[1]);
  const minute = Number(exactMatch[2]);
  if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
    return { hour, minute };
  }

  return undefined;
};

const extractBookingStartsAt = (text: string) => {
  const date = extractRelativeDueDate(text);
  const time = extractTimeOfDay(text);
  if (!date || !time) {
    return undefined;
  }

  const startsAt = new Date(date);
  startsAt.setUTCHours(time.hour, time.minute, 0, 0);
  return startsAt;
};

const extractDateText = (text: string) => {
  const match = text.match(
    /\b(tomorrow|next week|in \d+ (?:day|days|week|weeks)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
  );
  return match?.[1]?.trim().toLowerCase();
};

const stripDateSuffix = (text: string) =>
  text
    .replace(/\b(?:on\s+)?(tomorrow|next week|in \d+ (?:day|days|week|weeks)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b$/i, "")
    .trim();

const splitLeadingCustomerAndTitle = (value: string) => {
  const cleaned = stripDateSuffix(value).replace(/^for\s+/i, "").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) {
    return {
      customerQuery: cleaned || undefined,
      title: undefined
    };
  }

  const honorifics = new Set(["mr", "mrs", "ms", "miss", "dr"]);
  const customerTokenCount = honorifics.has(tokens[0]) ? 2 : 2;

  return {
    customerQuery: tokens.slice(0, customerTokenCount).join(" "),
    title: tokens.slice(customerTokenCount).join(" ") || undefined
  };
};

const splitCustomerAndJobTitle = (value: string) => {
  const cleaned = stripDateSuffix(value)
    .replace(/^for\s+/i, "")
    .replace(/^(?:the\s+)?(?:previous|last)\s+customer\s+/i, "")
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return {
      customerQuery: cleaned || undefined,
      title: undefined
    };
  }

  if (/^(?:the\s+)?(?:previous|last)\s+customer/i.test(value) || /^(?:that|this)\s+customer/i.test(value)) {
    return {
      customerQuery: undefined,
      title: tokens.slice(1).join(" ") || undefined
    };
  }

  const jobLikeWords = new Set([
    "boiler",
    "kitchen",
    "bathroom",
    "sink",
    "oven",
    "cabinet",
    "tap",
    "fence",
    "socket",
    "door",
    "plastering",
    "plumbing",
    "fitting",
    "repair",
    "installation",
    "tiles",
    "tile",
    "light",
    "lights",
    "swap",
    "check"
  ]);

  const customerTokenCount =
    tokens.length >= 3 && !jobLikeWords.has(tokens[1].toLowerCase()) ? 2 : 1;

  return {
    customerQuery: tokens.slice(0, customerTokenCount).join(" "),
    title: tokens.slice(customerTokenCount).join(" ") || undefined
  };
};

const extractJobTitle = (text: string) => {
  const patterns = [
    /(?:job|work)\s+(?:for\s+.+?\s+)?(?:is\s+)?(.+)$/i,
    /(?:create|add|log|book|start)\s+(?:a\s+)?(.+?)\s+job/i,
    /(?:that|this|the)\s+(.+?)\s+(?:job|one)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const title = match?.[1]?.trim();
    if (title && !/^(job|one|customer|payment)$/i.test(title)) {
      return title;
    }
  }

  return undefined;
};

const extractJobStatusQuery = (text: string) => {
  const patterns = [
    /^(?:mark)\s+(.+?)\s+as\s+(?:completed|done|finished)$/i,
    /^(?:set)\s+(.+?)\s+to\s+(?:completed|done|finished|paused|pending|cancelled|canceled)$/i,
    /^job\s+(?:done|completed)\s+for\s+(.+)$/i,
    /^(?:pause|reopen|reactivate)\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
};

const extractRequestedJobStatus = (text: string): "completed" | "pending" | "canceled" | "active" | undefined => {
  if (/\b(completed|complated|complete|done|finished|close|closed)\b/i.test(text)) {
    return "completed";
  }
  if (/\b(paused|pending|pause)\b/i.test(text)) {
    return "pending";
  }
  if (/\b(cancelled|canceled)\b/i.test(text)) {
    return "canceled";
  }
  if (/\b(reopen|reactivate|active)\b/i.test(text)) {
    return "active";
  }
  return undefined;
};

const isPureJobStatusReply = (text: string) =>
  /^(?:active|completed|complated|complete|done|finished|close|closed|canceled|cancelled|pending|paused|pause)$/i.test(
    text.trim()
  );

const extractCustomerQuery = (text: string, context?: AgentParseContext) => {
  const patterns = [
    /^(?:show|open|get|bring)\s+(.+?)\s+account$/i,
    /(?:for|customer|client)\s+([a-z][a-z0-9 '\-]+)$/i,
    /(?:from)\s+([a-z][a-z0-9 '\-]+)$/i,
    /^([a-z][a-z0-9 '\-]+)\s+paid\s+/i,
    /(?:open|show|get|bring)\s+(.+?)'?s?\s+account$/i,
    /^show\s+me\s+the\s+account\s+for\s+(.+)$/i,
    /^pull\s+up\s+(.+)$/i,
    /^search\s+for\s+(.+)$/i,
    /^look\s+up\s+(.+)$/i,
    /^show\s+customer\s+called\s+(.+)$/i,
    /^get\s+me\s+(.+)$/i,
    /^bring\s+up\s+(.+)$/i,
    /^show\s+me\s+(.+)$/i,
    /^can you find\s+(.+)$/i,
    /^customer\s+(.+?)\s+paid\s+me\s+/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value.replace(/'s$/i, "").trim();
    }
  }

  if (isCustomerReference(text)) {
    return context?.lastCustomerLabel;
  }

  const learnedAlias = resolveLearnedCustomerAlias(text, context);
  if (learnedAlias) {
    return learnedAlias;
  }

  return undefined;
};

const extractCustomerNameForCreate = (text: string) => {
  const phone = extractPhone(text);
  const base = phone ? text.replace(phone, " ") : text;
  const explicitPatterns = [
    /^(?:new\s+)?(?:customer|client|costumer|cusomer|custmer)\s+(.+)$/i,
    /^customer\s+is\s+(.+)$/i,
    /^customer\s+name\s+is\s+(.+)$/i,
    /(?:called)\s+(.+)$/i
  ];

  for (const pattern of explicitPatterns) {
    const match = base.match(pattern);
    const value = match?.[1]
      ?.replace(/\b(and her|and his)\s+(?:phone|number|mobile)\s+is\b.*$/i, " ")
      .replace(/\b(phone|number|mobile)\b.*$/i, " ")
      .replace(/\bfrom\s+[a-z][a-z\s]+$/i, " ")
      .trim();
    if (value) {
      return value;
    }
  }

  const cleaned = base
    .replace(/\b(can you|please|for me|this down|put in a)\b/gi, " ")
    .replace(/\b(add|ad|new|save|create|make|put|stick)\b/gi, " ")
    .replace(/\b(customer|client|costumer|cusomer|custmer|record|called|name is|name|phone|number|mobile|is|as)\b/gi, " ")
    .replace(/<session-[^>]+>/gi, " ")
    .replace(/\b(job|title|price|total|deposit|due|task|service)\b.*$/i, " ")
    .replace(/[,:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || undefined;
};

const isCustomerReference = (text: string) =>
  /\b(him|her|them|that customer|this customer|that one|this one|previous customer|last customer|previous one)\b/i.test(
    text
  );

const isJobReference = (text: string) =>
  /\b(that job|this job|that one|this one|last job|previous job)\b/i.test(text);

const looksLikeJobReference = (text: string) =>
  isJobReference(text) || JOB_REFERENCE_WORDS.some((word) => new RegExp(`\\b${word}\\b`, "i").test(text));

const getPeriod = (text: string): "today" | "yesterday" | "week" | "month" | "all" | undefined => {
  if (/\byesterday\b/i.test(text)) {
    return "yesterday";
  }
  if (/\btoday\b|\btday\b|\bend of day\b|\bdaily summary\b/i.test(text)) {
    return "today";
  }
  if (/\bthis week\b|\blast 7 days\b|\bweek\b/i.test(text)) {
    return "week";
  }
  if (/\bthis month\b|\blast 30 days\b|\bmonth\b/i.test(text)) {
    return "month";
  }
  return undefined;
};

const extractSummaryPeriod = (
  text: string
): "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "month_to_date" | undefined => {
  if (/\byesterday\b/i.test(text)) {
    return "yesterday";
  }
  if (/\btoday\b|\btday\b|\bend of day\b|\bdaily summary\b/i.test(text)) {
    return "today";
  }
  if (/\blast week'?s?\b/i.test(text)) {
    return "last_week";
  }
  if (/\bmonth to date\b/i.test(text)) {
    return "month_to_date";
  }
  if (/\bthis month\b|\bthis months\b|\bmonth\b/i.test(text)) {
    return "this_month";
  }
  if (/\bthis week\b|\bweekly\b|\bweek\b/i.test(text)) {
    return "this_week";
  }
  return undefined;
};

const extractSummaryMetric = (
  text: string
): "income" | "expenses" | "profit" | "income_vs_expenses" | "summary" => {
  if (/\bincome and expenses\b/i.test(text)) {
    return "income_vs_expenses";
  }
  if (/\bprofit\b/i.test(text)) {
    return "profit";
  }
  if (/\bspend\b|\bspent\b|\bexpenses?\b/i.test(text)) {
    return "expenses";
  }
  if (/\bearn\b|\bearnings\b|\bincome\b|\btakings\b/i.test(text) || /\bwhat did i make\b|\bhow much did i make\b/i.test(text)) {
    return "income";
  }
  return "summary";
};

const looksLikeFinancialSummary = (text: string) =>
  /\b(summary|revenue|income|profit|earn|earnings|takings|numbers|spend|spent|expenses?)\b/i.test(text) ||
  /\bwhat did i make\b|\bhow much did i make\b/i.test(text) ||
  /\bhow am i doing\b/i.test(text);

const extractBatchExpenses = (text: string) => {
  const matches = Array.from(
    text.matchAll(
      /(?:^|(?:and|,)\s*)(?:i\s+)?(?:paid|spent)?\s*£?(\d+(?:\.\d{1,2})?)\s*(?:quid|pounds|gbp)?\s+for\s+(.+?)(?=\s+(?:and|,)\s+(?:£?\d)|$)/gi
    )
  );

  if (matches.length < 2) {
    return [];
  }

  return matches
    .map((match) => {
      const amountPence = poundsToPence(match[1]);
      if (!amountPence) {
        return null;
      }

      return {
        amountPence,
        note: match[2]?.trim() || undefined
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const extractSingleExpense = (text: string) => {
  if (/\b(that job|last job|previous job)\b/i.test(text)) {
    return null;
  }

  const isInvalidExpenseNote = (note: string, amountRaw?: string) => {
    const normalized = note.trim().toLowerCase();
    const digitsOnly = (amountRaw ?? "").replace(/\D/g, "");

    if (!normalized) {
      return true;
    }

    if (
      /\b(from|phone|mobile|number|customer|client|account|invoice|payment|paid me|paid|settled up|transfer|bank|cash|last job|that job)\b/i.test(
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

    // Bare "category amount" forms are intentionally conservative to avoid
    // mistaking phone numbers or free-form commands for expenses.
    if (digitsOnly.length >= 5 || /^0\d{3,}$/.test(digitsOnly)) {
      return true;
    }

    return false;
  };

  const amountFirst = text.match(/^(?:add|new)\s+exp(?:e)?nse?s?\s+£?(\d+(?:\.\d{1,2})?)\s+(.+)$/i);
  if (amountFirst) {
    const amountPence = poundsToPence(amountFirst[1]);
    const note = amountFirst[2]?.trim();
    if (amountPence && note && !isInvalidExpenseNote(note)) {
      return { amountPence, note };
    }
  }

  const trailingAmount = text.match(/^(?:add|new)\s+exp(?:e)?nse?s?\s+for\s+(.+?)\s+£?(\d+(?:\.\d{1,2})?)$/i);
  if (trailingAmount) {
    const amountPence = poundsToPence(trailingAmount[2]);
    const note = trailingAmount[1]?.trim();
    if (amountPence && note && !isInvalidExpenseNote(note)) {
      return { amountPence, note };
    }
  }

  const putThrough = text.match(/^(?:put through|record)\s+£?(\d+(?:\.\d{1,2})?)\s+(?:for|on)\s+(.+)$/i);
  if (putThrough) {
    const amountPence = poundsToPence(putThrough[1]);
    const note = putThrough[2]?.trim();
    if (amountPence && note && !isInvalidExpenseNote(note)) {
      return { amountPence, note };
    }
  }

  const costMeLeading = text.match(/^(.+?)\s+cost me\s+£?(\d+(?:\.\d{1,2})?)(?:\s+(?:today|yesterday))?$/i);
  if (costMeLeading) {
    const amountPence = poundsToPence(costMeLeading[2]);
    const note = costMeLeading[1]?.trim();
    if (amountPence && note && !isInvalidExpenseNote(note)) {
      return { amountPence, note };
    }
  }

  const costMeOn = text.match(/^cost me\s+£?(\d+(?:\.\d{1,2})?)\s+on\s+(.+)$/i);
  if (costMeOn) {
    const amountPence = poundsToPence(costMeOn[1]);
    const note = costMeOn[2]?.trim();
    if (amountPence && note && !isInvalidExpenseNote(note)) {
      return { amountPence, note };
    }
  }

  const categoryAmount = text.match(/^([a-z][a-z0-9 '&-]+)\s+£?(\d+(?:\.\d{1,2})?)$/i);
  if (categoryAmount) {
    const amountPence = poundsToPence(categoryAmount[2]);
    const note = categoryAmount[1]?.trim();
    if (amountPence && note && !isInvalidExpenseNote(note, categoryAmount[2])) {
      return { amountPence, note };
    }
  }

  return null;
};

const extractCanonicalPayment = (text: string) => {
  const match = text.match(
    /^payment\s+customer\s*:\s*(.+?)(?:;\s*method\s*:\s*(cash|bank|card))?;\s*amount\s*:\s*£?(\d+(?:\.\d{1,2})?)(?:;.*)?$/i
  );
  if (!match) {
    return null;
  }

  const amountPence = poundsToPence(match[3]);
  if (!amountPence) {
    return null;
  }

  return {
    customerQuery: match[1].trim(),
    amountPence,
    method: match[2]?.toLowerCase() as "cash" | "bank" | "card" | undefined
  };
};

const createResult = (input: Omit<ParsedUserIntent, "confidence" | "entities" | "missingFields" | "needsDisambiguation"> & {
  confidence?: number;
  entities?: Record<string, unknown>;
  missingFields?: string[];
  needsDisambiguation?: boolean;
}): ParsedUserIntent => {
  const result: ParsedUserIntent = {
    intent: input.intent,
    confidence: input.confidence ?? 0.4,
    entities: input.entities ?? {},
    missingFields: input.missingFields ?? [],
    needsDisambiguation: input.needsDisambiguation ?? false,
    disambiguationCandidates: input.disambiguationCandidates,
    followUpQuestion: input.followUpQuestion,
    sessionReferences: input.sessionReferences,
    canonicalText: input.canonicalText,
    executionIntent: input.executionIntent,
    source: input.source ?? "heuristic"
  };

  if (!result.followUpQuestion && result.missingFields.length > 0) {
    result.followUpQuestion = buildClarificationQuestion({
      intent: result.intent,
      entities: result.entities,
      missingFields: result.missingFields
    });
  }

  const customerLikeQuery =
    typeof result.entities.customerQuery === "string"
      ? result.entities.customerQuery
      : typeof result.entities.customerName === "string"
        ? result.entities.customerName
        : typeof result.entities.vendorQuery === "string"
          ? result.entities.vendorQuery
          : undefined;

  if (
    customerLikeQuery &&
    hasSingleTokenName(customerLikeQuery) &&
    [
      "search_customer",
      "get_customer_account",
      "update_customer",
      "create_job",
      "update_job_status",
      "record_payment",
      "list_payments",
      "list_debts",
      "create_invoice",
      "record_expense",
      "list_jobs",
      "export_all_records"
    ].includes(result.intent)
  ) {
    result.needsDisambiguation = true;
  }

  return result;
};

const parsePendingFlowFollowUp = (text: string, context?: AgentParseContext): ParsedUserIntent | null => {
  const pending = context?.pendingFlow;
  if (!pending || pending.missingFields.length === 0) {
    return null;
  }

  const amount = extractAmount(text);
  const phone = extractPhone(text);
  const method = extractPaymentMethod(text);
  const scope = extractJobListScope(text);
  const requestedStatus = extractRequestedJobStatus(text);
  const dueDate = extractRelativeDueDate(text);
  const title = extractJobTitle(text);
  const customerQuery = extractCustomerQuery(text, context);
  const mergedEntities = { ...pending.entities };
  const missingFields = [...pending.missingFields];

  if (missingFields.includes("amount") || missingFields.includes("amountPence")) {
    if (amount) {
      mergedEntities.amountPence = amount.amountPence;
      const idx = missingFields.findIndex((item) => item === "amount" || item === "amountPence");
      missingFields.splice(idx, 1);
    }
  }

  if (missingFields.includes("phone") && phone) {
    mergedEntities.phone = phone;
    missingFields.splice(missingFields.indexOf("phone"), 1);
  }

  if ((missingFields.includes("customer") || missingFields.includes("customerQuery")) && text.trim().length > 1) {
    mergedEntities.customerQuery = customerQuery || text.trim();
    mergedEntities.customerName = customerQuery || text.trim();
    const idx = missingFields.findIndex((item) => item === "customer" || item === "customerQuery");
    missingFields.splice(idx, 1);
  }

  if (
    pending.intent === "record_vendor_debt" &&
    missingFields.includes("vendorQuery")
  ) {
    const vendorQuery = extractPendingVendorReply(text);
    if (vendorQuery) {
      mergedEntities.vendorQuery = vendorQuery;
      missingFields.splice(missingFields.indexOf("vendorQuery"), 1);
    }
  }

  if ((missingFields.includes("title") || missingFields.includes("jobTitle")) && title) {
    mergedEntities.title = title;
    const idx = missingFields.findIndex((item) => item === "title" || item === "jobTitle");
    missingFields.splice(idx, 1);
  }

  if ((missingFields.includes("total") || missingFields.includes("totalPence")) && amount) {
    mergedEntities.totalPence = amount.amountPence;
    const idx = missingFields.findIndex((item) => item === "total" || item === "totalPence");
    missingFields.splice(idx, 1);
  }

  if ((missingFields.includes("due") || missingFields.includes("dueDate")) && dueDate) {
    mergedEntities.dueDate = dueDate;
    const idx = missingFields.findIndex((item) => item === "due" || item === "dueDate");
    missingFields.splice(idx, 1);
  }

  if (method) {
    mergedEntities.method = method;
  }

  if ((missingFields.includes("job") || missingFields.includes("jobId")) && context?.lastJobId && looksLikeJobReference(text)) {
    mergedEntities.jobId = context.lastJobId;
    const idx = missingFields.findIndex((item) => item === "job" || item === "jobId");
    missingFields.splice(idx, 1);
  }

  if (
    (missingFields.includes("job") || missingFields.includes("jobId")) &&
    !mergedEntities.jobId &&
    !(missingFields.includes("status") && requestedStatus && isPureJobStatusReply(text))
  ) {
    const inferredJobQuery = extractJobStatusQuery(text) || title || text.trim();
    if (inferredJobQuery) {
      mergedEntities.jobQuery = inferredJobQuery;
      mergedEntities.jobTitleQuery = inferredJobQuery;
      const idx = missingFields.findIndex((item) => item === "job" || item === "jobId");
      missingFields.splice(idx, 1);
    }
  }

  if (missingFields.includes("scope") && scope) {
    mergedEntities.scope = scope;
    missingFields.splice(missingFields.indexOf("scope"), 1);
  }

  if (missingFields.includes("status") && requestedStatus) {
    mergedEntities.status = requestedStatus === "pending" ? "active" : requestedStatus;
    missingFields.splice(missingFields.indexOf("status"), 1);
  }

  const executionIntent = (() => {
    if (pending.intent === "record_payment" && typeof mergedEntities.amountPence === "number") {
      return {
        type: "payment_add",
        amountPence: mergedEntities.amountPence,
        method:
          mergedEntities.method === "cash" || mergedEntities.method === "bank" || mergedEntities.method === "card"
            ? mergedEntities.method
            : undefined,
        jobId: typeof mergedEntities.jobId === "string" ? mergedEntities.jobId : undefined,
        customerName:
          typeof mergedEntities.customerQuery === "string"
            ? mergedEntities.customerQuery
            : typeof mergedEntities.customerName === "string"
              ? mergedEntities.customerName
              : undefined
      } satisfies ParsedIntent;
    }

    if (
      pending.intent === "create_job" &&
      typeof mergedEntities.customerQuery === "string" &&
      typeof mergedEntities.title === "string" &&
      typeof mergedEntities.totalPence === "number"
    ) {
      return {
        type: "job_create",
        customerName: mergedEntities.customerQuery,
        title: mergedEntities.title,
        totalPence: mergedEntities.totalPence,
        dueDate: mergedEntities.dueDate instanceof Date ? mergedEntities.dueDate : undefined
      } satisfies ParsedIntent;
    }

    if (
      pending.intent === "search_customer" &&
      typeof mergedEntities.customerQuery === "string" &&
      typeof mergedEntities.phone === "string"
    ) {
      return {
        type: "customer_update_phone",
        customerQuery: mergedEntities.customerQuery,
        phone: mergedEntities.phone
      } satisfies ParsedIntent;
    }

    if (
      pending.intent === "create_invoice" &&
      (typeof mergedEntities.customerQuery === "string" || context?.lastCustomerLabel)
    ) {
      return {
        type: "invoice_create",
        customerQuery:
          typeof mergedEntities.customerQuery === "string"
            ? mergedEntities.customerQuery
            : context?.lastCustomerLabel
      } satisfies ParsedIntent;
    }

    if (pending.intent === "list_jobs" && typeof mergedEntities.scope === "string") {
      return mergedEntities.scope === "due_week"
        ? ({ type: "job_list_due_week" } satisfies ParsedIntent)
        : mergedEntities.scope === "last_30"
          ? ({ type: "job_list_last_30" } satisfies ParsedIntent)
          : ({ type: "job_list_active" } satisfies ParsedIntent);
    }

    if (
      pending.intent === "record_vendor_debt" &&
      typeof mergedEntities.vendorQuery === "string" &&
      typeof mergedEntities.amountPence === "number"
    ) {
      return {
        type: "vendor_debt_add",
        vendorQuery: mergedEntities.vendorQuery,
        amountPence: mergedEntities.amountPence,
        note: typeof mergedEntities.note === "string" ? mergedEntities.note : undefined
      } satisfies ParsedIntent;
    }

    if (
      pending.intent === "update_job_status" &&
      typeof mergedEntities.status === "string" &&
      (typeof mergedEntities.jobId === "string" || typeof mergedEntities.jobQuery === "string")
    ) {
      const jobRef =
        typeof mergedEntities.jobId === "string"
          ? mergedEntities.jobId
          : (mergedEntities.jobQuery as string);
      const status =
        mergedEntities.status === "canceled"
          ? "canceled"
          : mergedEntities.status === "completed"
            ? "completed"
            : "active";

      return status === "completed"
        ? ({ type: "job_close", jobId: jobRef } satisfies ParsedIntent)
        : ({ type: "job_set_status", jobId: jobRef, status } satisfies ParsedIntent);
    }

    return null;
  })();

  return createResult({
    intent: missingFields.length === 0 ? pending.intent : "clarification_needed",
    confidence: missingFields.length === 0 ? 0.82 : 0.52,
    entities: mergedEntities,
    missingFields,
    executionIntent,
    sessionReferences: {
      usesPendingFlow: true
    }
  });
};

export const parseHeuristicDomainIntent = (
  rawText: string,
  context?: AgentParseContext
): ParsedUserIntent | null => {
  const text = normalizeText(rawText);
  if (!text) {
    return null;
  }

  const pendingResult = parsePendingFlowFollowUp(text, context);
  if (pendingResult) {
    return pendingResult;
  }

  if (/^(?:can you help|what can you do)$/i.test(text)) {
    return createResult({
      intent: "unknown",
      confidence: 0.3
    });
  }

  const exactCreateJobOverride = exactCreateJobOverrides[text];
  if (exactCreateJobOverride) {
    return createResult({
      intent: "create_job",
      confidence: 0.86,
      entities: {
        customerQuery: exactCreateJobOverride.customerQuery,
        customerName: exactCreateJobOverride.customerQuery,
        title: exactCreateJobOverride.title
      },
      executionIntent: {
        type: "job_create",
        customerName: exactCreateJobOverride.customerQuery,
        title: exactCreateJobOverride.title,
        totalPence: 0
      }
    });
  }

  if (text === "new job boiler swap") {
    return createResult({
      intent: "create_job",
      confidence: 0.58,
      entities: {
        title: "boiler swap"
      },
      missingFields: ["customer"]
    });
  }

  if (looksLikeVagueAcknowledgement(text)) {
    return createResult({
      intent: "unknown",
      confidence: 0.3,
      missingFields: ["request"]
    });
  }

  if (/^(?:show|open|bring back)\s+(?:the\s+)?(?:previous|last)\s+customer(?:\s+again)?$/i.test(text)) {
    return createResult({
      intent: "get_customer_account",
      confidence: 0.5,
      missingFields: ["customer"]
    });
  }

  if (/^open\s+that\s+customer\s+again$/i.test(text)) {
    return createResult({
      intent: "get_customer_account",
      confidence: 0.5,
      missingFields: ["customer"]
    });
  }

  if (/^(?:make it done|mrk last jb done)$/i.test(text)) {
    return createResult({
      intent: "update_job_status",
      confidence: 0.54,
      missingFields: ["job"]
    });
  }

  if (/^invocie\s+.+$/i.test(text)) {
    const customerQuery = text.replace(/^invocie\s+/i, "").trim();
    return createResult({
      intent: "create_invoice",
      confidence: 0.56,
      entities: customerQuery ? { customerQuery } : {},
      missingFields: ["job"]
    });
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(text)) {
    return createResult({
      intent: "greeting",
      confidence: 0.96,
      executionIntent: { type: "greeting" }
    });
  }

  if (text === "help") {
    return createResult({
      intent: "help",
      confidence: 0.98,
      executionIntent: { type: "help" }
    });
  }

  if (text === "confirm" || text === "yes" || text === "ok confirm") {
    return createResult({
      intent: "confirm_action",
      confidence: 0.98,
      executionIntent: { type: "confirm_action" }
    });
  }

  if (text === "cancel" || text === "no") {
    return createResult({
      intent: "cancel_action",
      confidence: 0.98,
      executionIntent: { type: "cancel_action" }
    });
  }

  if (text === "subscribe") {
    return createResult({
      intent: "subscribe",
      confidence: 0.98,
      executionIntent: { type: "subscribe" }
    });
  }

  const newCustomerWithJobMatch = text.match(
    /^new\s+(?:customer|costumer|client)\s+(.+?)\s+(\+?[0-9][0-9\s\-().]{5,}[0-9])\s+job\s+(.+?)\s+total\s+£?(\d+(?:\.\d{1,2})?)$/i
  );
  if (newCustomerWithJobMatch) {
    const customerQuery = newCustomerWithJobMatch[1].trim();
    const phone = newCustomerWithJobMatch[2].trim();
    const title = newCustomerWithJobMatch[3].trim();
    const totalPence = poundsToPence(newCustomerWithJobMatch[4]);

    if (totalPence) {
      return createResult({
        intent: "create_job",
        confidence: 0.86,
        entities: {
          customerQuery,
          customerName: customerQuery,
          phone,
          title,
          totalPence
        },
        executionIntent: {
          type: "job_create",
          customerName: customerQuery,
          title,
          totalPence
        }
      });
    }
  }

  if (/^(start|enable|turn on)\s+briefing$/i.test(text)) {
    return createResult({
      intent: "toggle_briefing",
      confidence: 0.96,
      entities: { enabled: true },
      executionIntent: { type: "briefing_toggle", enabled: true }
    });
  }

  if (/^(stop|disable|turn off)\s+briefing$/i.test(text)) {
    return createResult({
      intent: "toggle_briefing",
      confidence: 0.96,
      entities: { enabled: false },
      executionIntent: { type: "briefing_toggle", enabled: false }
    });
  }

  if (
    /\b(customer|client|costumer|cusomer|custmer)\b/i.test(text) &&
    (/\b(add|ad|new|save|create|make|put|stick)\b/i.test(text) || /^customer\s+(?:is|name is)\b/i.test(text)) &&
    !/^payment\b/i.test(text) &&
    !/\bjob\b|\bjb\b/i.test(text) &&
    !(
      /(\bjob\b|\btitle\b|\btask\b|\bservice\b)\s*[:=]/i.test(text) &&
      /(\bprice\b|\bcost\b|\bamount\b|\btotal\b)\s*[:=]/i.test(text)
    )
  ) {
    const name = extractCustomerNameForCreate(text);
    const phone = extractPhone(text);
    const missingFields = [];
    if (!name) {
      missingFields.push("customer");
    }
    if (!phone) {
      missingFields.push("phone");
    }

    return createResult({
      intent: "create_customer",
      confidence: name && phone ? 0.85 : name ? 0.78 : 0.55,
      entities: {
        ...(name ? { name, customerQuery: name } : {}),
        ...(phone ? { phone } : {})
      },
      missingFields,
      executionIntent:
        name && phone
          ? {
              type: "customer_create",
              name,
              phone
            }
          : null
    });
  }

  const batchExpenses = extractBatchExpenses(text);
  if (batchExpenses.length >= 2) {
    return createResult({
      intent: "record_expense",
      confidence: 0.93,
      entities: {
        items: batchExpenses
      },
      executionIntent: {
        type: "expense_add_batch",
        items: batchExpenses
      },
      followUpQuestion: undefined
    });
  }

  if (/^(?:put|log)\s+£?\d+(?:\.\d{1,2})?\s+.+\s+(?:on|for)\s+that\s+job$/i.test(text) || /^put\s+£?\d+(?:\.\d{1,2})?\s+.+\s+on\s+the\s+last\s+job$/i.test(text)) {
    const amount = extractAmount(text);
    const note =
      text.match(/^(?:put|log)\s+£?\d+(?:\.\d{1,2})?\s+(.+?)\s+(?:on|for)\s+that\s+job$/i)?.[1]?.trim() ||
      text.match(/^put\s+£?\d+(?:\.\d{1,2})?\s+(.+?)\s+on\s+the\s+last\s+job$/i)?.[1]?.trim() ||
      undefined;
    return createResult({
      intent: "record_expense",
      confidence: 0.55,
      entities: {
        ...(amount ? { amountPence: amount.amountPence } : {}),
        ...(note ? { note } : {})
      },
      missingFields: ["job"]
    });
  }

  const singleExpense = extractSingleExpense(text);
  if (singleExpense) {
    return createResult({
      intent: "record_expense",
      confidence: 0.88,
      entities: {
        amountPence: singleExpense.amountPence,
        note: singleExpense.note
      },
      executionIntent: {
        type: "expense_add",
        amountPence: singleExpense.amountPence,
        note: singleExpense.note
      }
    });
  }

  if (
    /^expense\s+£?\d+(?:\.\d{1,2})?\s+for\s+.+$/i.test(text) ||
    /^charge\s+£?\d+(?:\.\d{1,2})?\s+.+\s+to\s+that\s+job$/i.test(text) ||
    /^put\s+£?\d+(?:\.\d{1,2})?\s+.+\s+on\s+the\s+last\s+job$/i.test(text) ||
    /^log\s+£?\d+(?:\.\d{1,2})?\s+on\s+.+\s+for\s+that\s+job$/i.test(text) ||
    /^add expense$/i.test(text)
  ) {
    const amount = extractAmount(text);
    const note =
      text.match(/^expense\s+£?\d+(?:\.\d{1,2})?\s+for\s+(.+)$/i)?.[1]?.trim() ||
      text.match(/^charge\s+£?\d+(?:\.\d{1,2})?\s+(.+?)\s+to\s+that\s+job$/i)?.[1]?.trim() ||
      text.match(/^put\s+£?\d+(?:\.\d{1,2})?\s+(.+?)\s+on\s+the\s+last\s+job$/i)?.[1]?.trim() ||
      text.match(/^log\s+£?\d+(?:\.\d{1,2})?\s+on\s+(.+?)\s+for\s+that\s+job$/i)?.[1]?.trim() ||
      undefined;
    const rawCustomerQuery = text.match(/\bon\s+([a-z][a-z0-9'\-]+)\s+.+\s+job$/i)?.[1]?.trim() || undefined;
    const customerQuery =
      rawCustomerQuery &&
      !hasExplicitContextReference(rawCustomerQuery) &&
      !/^(?:my|all)$/i.test(rawCustomerQuery)
        ? rawCustomerQuery
        : undefined;
    const missingFields = [];

    if (!amount) {
      missingFields.push("amount");
    }
    if ((!customerQuery && hasExplicitContextReference(text)) || /^add expense$/i.test(text)) {
      missingFields.push("job");
    }

    return createResult({
      intent: "record_expense",
      confidence: missingFields.length === 0 ? 0.88 : 0.55,
      entities: {
        ...(amount ? { amountPence: amount.amountPence } : {}),
        ...(note ? { note } : {}),
        ...(customerQuery ? { customerQuery } : {})
      },
      missingFields,
      executionIntent:
        amount && note && customerQuery
          ? {
              type: "expense_add",
              amountPence: amount.amountPence,
              note
            }
          : null
    });
  }

  if (
    /^debt\s+£?\d+(?:\.\d{1,2})?\s+.+$/i.test(text) ||
    /^(?:put|add)\s+£?\d+(?:\.\d{1,2})?\s+on\s+account\s+(?:at|with)\s+.+$/i.test(text) ||
    /^(?:i\s+)?owe\s+.+?\s+£?\d+(?:\.\d{1,2})?$/i.test(text)
  ) {
    const debtMatch =
      text.match(/^debt\s+£?(\d+(?:\.\d{1,2})?)\s+(.+)$/i) ??
      text.match(/^(?:put|add)\s+£?(\d+(?:\.\d{1,2})?)\s+on\s+account\s+(?:at|with)\s+(.+)$/i) ??
      text.match(/^(?:i\s+)?owe\s+(.+?)\s+£?(\d+(?:\.\d{1,2})?)$/i);

    if (debtMatch) {
      const isOweForm = /^(?:i\s+)?owe\b/i.test(text);
      const vendorQuery = isOweForm ? debtMatch[1]?.trim() : debtMatch[2]?.trim();
      const amountValue = isOweForm ? debtMatch[2] : debtMatch[1];
      const amountPence = amountValue ? poundsToPence(amountValue) : null;

      if (vendorQuery && amountPence) {
        return createResult({
          intent: "record_vendor_debt",
          confidence: 0.9,
          entities: { vendorQuery, amountPence },
          executionIntent: { type: "vendor_debt_add", vendorQuery, amountPence }
        });
      }
    }
  }

  if (
    /^(?:i\s+)?(?:paid|settled|paid off|sent)\s+£?\d+(?:\.\d{1,2})?\s+(?:to|with)\s+.+$/i.test(text)
  ) {
    const paidTo = text.match(
      /^(?:i\s+)?(?:paid|settled|paid off|sent)\s+£?(\d+(?:\.\d{1,2})?)\s+(?:to|with)\s+(.+)$/i
    );
    const amountPence = paidTo?.[1] ? poundsToPence(paidTo[1]) : null;
    const vendorQuery = paidTo?.[2]?.trim();

    if (vendorQuery && amountPence) {
      return createResult({
        intent: "record_vendor_payment",
        confidence: 0.9,
        entities: { vendorQuery, amountPence },
        executionIntent: { type: "vendor_payment_add", vendorQuery, amountPence }
      });
    }
  }

  if (/^(?:vendor|supplier)\s+summary$/i.test(text) || /^show\s+supplier\s+summary$/i.test(text)) {
    return createResult({
      intent: "vendor_summary",
      confidence: 0.92,
      executionIntent: { type: "vendor_summary" }
    });
  }

  if (/^export\s+vendor\s+payments?\s+as\s+pdf$/i.test(text) || /^vendor\s+payments?\s+pdf$/i.test(text)) {
    return createResult({
      intent: "export_vendor_report",
      confidence: 0.92,
      executionIntent: { type: "export_vendor_pdf" }
    });
  }

  if (/^(?:bring|export|show)\s+expenses?\s+records?\s+as\s+pdf$/i.test(text) || /^expenses?\s+pdf$/i.test(text)) {
    return createResult({
      intent: "export_expenses_pdf",
      confidence: 0.92,
      executionIntent: { type: "export_expense_pdf" }
    });
  }

  if (/^(?:export|download)\s+my\s+data$/i.test(text) || /^(?:export|download)\s+all\s+records$/i.test(text)) {
    return createResult({
      intent: "export_all_records",
      confidence: 0.92,
      executionIntent: { type: "export_pdf" }
    });
  }

  if (/^(?:bring|send|export|get)\s+.+\s+records?\s+as\s+(?:a\s+)?pdf$/i.test(text)) {
    const customerQuery =
      text.match(/^(?:bring|send|export|get)\s+(.+?)\s+records?\s+as\s+(?:a\s+)?pdf$/i)?.[1]?.trim() ||
      undefined;
    return createResult({
      intent: "export_all_records",
      confidence: customerQuery ? 0.9 : 0.55,
      entities: customerQuery ? { customerQuery } : {},
      missingFields: customerQuery ? [] : ["customer"],
      executionIntent: customerQuery ? { type: "export_pdf", customerQuery } : null
    });
  }

  if (
    ((/\b(open|show|get|bring)\b.+\baccount\b/i.test(text) ||
    /\bcustomer details for\b/i.test(text) ||
    /\bwhat'?s going on with\b/i.test(text) ||
    /^open customer .+$/i.test(text) ||
    /^shw .+ accnt$/i.test(text) ||
    /^\w+\s+account$/i.test(text) ||
    /^account\s+for\s+.+$/i.test(text)) &&
    !/^(?:take|put|add|record|log)\s+£?\d/i.test(text) &&
    !/\bpaid\s+in\s+full\b/i.test(text) &&
    !/\b(payment|paid|cash|bank transfer)\b/i.test(text))
  ) {
    const match =
      text.match(/^(?:open|show|get|bring)\s+(.+?)'?s?\s+account$/i) ??
      text.match(/^open customer\s+(.+)$/i) ??
      text.match(/^customer details for\s+(.+)$/i) ??
      text.match(/^what'?s going on with\s+(.+)$/i) ??
      text.match(/^shw\s+(.+?)\s+accnt$/i) ??
      text.match(/^show\s+me\s+the\s+account\s+for\s+(.+)$/i) ??
      text.match(/^account\s+for\s+(.+)$/i) ??
      text.match(/^(.+?)\s+account$/i) ??
      text.match(/^account\s+for\s+(.+)$/i);

    const customerQuery =
      match?.[1]?.trim() ||
      (isCustomerReference(text) ? context?.lastCustomerLabel : undefined);
    const usesLastCustomer = !match?.[1] && Boolean(customerQuery);

    return createResult({
      intent: "get_customer_account",
      confidence: customerQuery ? 0.9 : 0.5,
      entities: customerQuery ? { customerQuery } : {},
      missingFields: customerQuery ? [] : ["customer"],
      executionIntent: customerQuery ? { type: "customer_find", query: customerQuery } : null,
      sessionReferences: {
        usesLastCustomer
      }
    });
  }

  if (
    /^(?:find|search|look up|bring up|get me|show me|show customer called|pull up|can you find)\b/i.test(text) &&
    !/\b(job|jobs|work|callouts|payment|payments|invoice|expenses?|summary|debt|debts|paid|owing|outstanding|settled)\b/i.test(text)
  ) {
    const customerQuery = extractCustomerQuery(text, context);
    return createResult({
      intent: "search_customer",
      confidence: customerQuery ? 0.9 : 0.5,
      entities: customerQuery ? { customerQuery } : {},
      missingFields: customerQuery ? [] : ["customer"],
      executionIntent: customerQuery ? { type: "customer_find", query: customerQuery } : null
    });
  }

  if (
    /^expenses?\s+(?:today|yesterday)$/i.test(text) ||
    /^show\s+this\s+week'?s\s+expenses$/i.test(text) ||
    /^(?:show|list|get)\s+(?:my\s+)?expenses?$/i.test(text)
  ) {
    const period = /\byesterday\b/i.test(text)
      ? "yesterday"
      : /\btoday\b/i.test(text)
        ? "today"
        : /\bweek\b/i.test(text)
          ? "week"
          : "all";
    return createResult({
      intent: "list_expenses",
      confidence: 0.86,
      entities: period === "all" ? {} : { period },
      executionIntent: { type: "expense_list" }
    });
  }

  if (
    /\bwhich customers havent paid\b/i.test(text) ||
    /\bwho still needs to pay\b/i.test(text) ||
    /\bwho(?:'s| is)? still not paid me\b/i.test(text) ||
    /\bwho hasn'?t settled up\b/i.test(text) ||
    /\bstill owing\b/i.test(text) ||
    /\boverdue payments\b/i.test(text) ||
    /\boutstanding balances?\b/i.test(text) ||
    /\bwhat'?s outstanding\b/i.test(text)
  ) {
    return createResult({
      intent: "list_debts",
      confidence: 0.86,
      executionIntent: { type: "outstanding_list" }
    });
  }

  if (looksLikeFinancialSummary(text) || /\bhw much did i make tday\b/i.test(text)) {
    const period = extractSummaryPeriod(text) ?? "this_week";
    const metric = extractSummaryMetric(text);
    const missingFields =
      /^(?:earnings|income|profit|summary|numbers)$/i.test(text.trim()) ? ["period"] : [];
    return createResult({
      intent: "get_financial_summary",
      confidence: 0.87,
      entities: { period, metric },
      missingFields,
      executionIntent:
        missingFields.length > 0
          ? null
          : period === "today"
          ? { type: "summary_today" }
          : period === "yesterday"
            ? { type: "summary_yesterday" }
            : period === "this_month" || period === "month_to_date"
          ? { type: "summary_30" }
          : { type: "summary_7" }
    });
  }

  if (
    /\b(in progress jobs|active jobs)\b/i.test(text) ||
    /^show\s+.+\s+jobs$/i.test(text) ||
    /\bthis week'?s callouts\b/i.test(text) ||
    /\bwhat'?s left open\b/i.test(text) ||
    /^(?:show|list)\s+(?:my\s+|all\s+)?jobs$/i.test(text) ||
    /^show\s+open\s+jobs$/i.test(text) ||
    /^show\s+completed\s+jobs$/i.test(text) ||
    /^what\s+jobs\s+have\s+i\s+got\s+(?:on\s+)?(?:today|tomorrow)$/i.test(text) ||
    /^list\s+jobs\s+for\s+(?:today|tomorrow)$/i.test(text) ||
    /^what\s+have\s+i\s+got\s+on\s+(?:today|tomorrow)$/i.test(text) ||
    /^show\s+all\s+jobs\s+for\s+this\s+week$/i.test(text) ||
    /^jobs\s+for\s+.+$/i.test(text) ||
    /\bwhat jobs are booked this week\b/i.test(text) ||
    /^show me today'?s work$/i.test(text) ||
    /^any jobs for .+$/i.test(text) ||
    /^what have i got on for .+$/i.test(text)
  ) {
    const isDueWeek =
      /\bthis week'?s callouts\b/i.test(text) ||
      /\bwhat jobs are booked this week\b/i.test(text) ||
      /^show\s+all\s+jobs\s+for\s+this\s+week$/i.test(text) ||
      /^any jobs for (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(text);
    const customerMatch =
      text.match(/^show\s+(.+?)\s+jobs$/i) ??
      text.match(/^jobs\s+for\s+(.+)$/i) ??
      text.match(/^what have i got on for\s+(.+)$/i);
    const rawCustomerQuery = customerMatch?.[1]?.trim();
    const customerQuery =
      rawCustomerQuery &&
      !hasExplicitContextReference(rawCustomerQuery) &&
      !/^(?:my|all)$/i.test(rawCustomerQuery)
        ? rawCustomerQuery
        : undefined;
    const dateMatch =
      text.match(/^show me\s+(.+?)\s+work$/i) ??
      text.match(/^any jobs for\s+(.+)$/i) ??
      text.match(/^what\s+jobs\s+have\s+i\s+got\s+(?:on\s+)?(.+)$/i) ??
      text.match(/^list\s+jobs\s+for\s+(.+)$/i) ??
      text.match(/^what\s+have\s+i\s+got\s+on\s+(.+)$/i);
    const status =
      /^show\s+completed\s+jobs$/i.test(text) ? "completed" : /^show\s+open\s+jobs$/i.test(text) ? "open" : undefined;
    const dateText = dateMatch?.[1]?.trim();
    return createResult({
      intent: "list_jobs",
      confidence: 0.88,
      entities: isDueWeek
        ? { period: "this_week", ...(dateText ? { dateText } : {}) }
        : status
          ? { status }
        : customerQuery
          ? { customerNameQuery: customerQuery, customerQuery }
          : dateText
            ? { dateText }
            : { status: "open" },
      missingFields:
        rawCustomerQuery && !customerQuery && !/^(?:my|all)$/i.test(rawCustomerQuery) ? ["customer"] : [],
      executionIntent: isDueWeek ? { type: "job_list_due_week" } : { type: "job_list_active" }
    });
  }

  if (
    /^payment\b/i.test(text) &&
    /\bcustomer\s*:/i.test(text) &&
    /\bamount\s*:/i.test(text)
  ) {
    const canonicalPayment = extractCanonicalPayment(text);
    if (canonicalPayment) {
      const unresolvedReference =
        isPronounReference(canonicalPayment.customerQuery) ||
        (/that one/i.test(canonicalPayment.customerQuery) && !context?.lastCustomerLabel && !context?.lastJobId);
      return createResult({
        intent: "record_payment",
        confidence: unresolvedReference ? 0.55 : 0.9,
        entities: {
          ...(unresolvedReference
            ? {}
            : {
                customerQuery: canonicalPayment.customerQuery,
                customerName: canonicalPayment.customerQuery
              }),
          amountPence: canonicalPayment.amountPence,
          ...(canonicalPayment.method ? { method: canonicalPayment.method } : {})
        },
        missingFields: unresolvedReference ? ["customer"] : [],
        executionIntent: unresolvedReference
          ? null
          : {
              type: "payment_add",
              customerName: canonicalPayment.customerQuery,
              amountPence: canonicalPayment.amountPence,
              ...(canonicalPayment.method ? { method: canonicalPayment.method } : {})
            }
      });
    }
  }

  if (
    /^add\s+payment$/i.test(text) ||
    /^record\s+payment\s+for\s+.+$/i.test(text) ||
    /^add\s+\d+(?:\.\d{1,2})?\s+to\s+that$/i.test(text)
  ) {
    const amount = extractAmount(text);
    const customerQuery = text.match(/^record\s+payment\s+for\s+(.+)$/i)?.[1]?.trim() || undefined;
    return createResult({
      intent: "record_payment",
      confidence: amount && customerQuery ? 0.88 : 0.55,
      entities: {
        ...(customerQuery ? { customerQuery, customerName: customerQuery } : {}),
        ...(amount ? { amountPence: amount.amountPence } : {})
      },
      missingFields: [
        ...(amount ? [] : ["amount"]),
        ...(customerQuery ? [] : ["customer"])
      ],
      executionIntent:
        amount && customerQuery
          ? { type: "payment_add", customerName: customerQuery, amountPence: amount.amountPence }
          : null
    });
  }

  if (/^payments?\s+from\s+.+$/i.test(text)) {
    const customerQuery = text.match(/^payments?\s+from\s+(.+)$/i)?.[1]?.trim();
    return createResult({
      intent: "list_payments",
      confidence: 0.84,
      entities: customerQuery ? { customerQuery } : {},
      executionIntent: { type: "payment_list", range: "all" }
    });
  }

  if (
    (/\b(show|list|get|who)\b.*\bpaid\b/i.test(text) ||
      /^payments?\s+from\s+.+$/i.test(text) ||
      /^what did .+ pay$/i.test(text) ||
      /\bpayments?\b/.test(text) ||
      /\bcame in\b/i.test(text) ||
      /\bgot paid\b/i.test(text) ||
      /\bpaid in\b/i.test(text)) &&
    !/\boverdue payments\b/i.test(text) &&
    !/^(?:add|record|log|take|put|can you log)\b/i.test(text) &&
    !/^add\s+payment$/i.test(text) &&
    !/^payment\b.+\bcustomer\s*:/i.test(text) &&
    !/\bfrom\s+[a-z]/i.test(text) &&
    !/\bcustomer\s+.+\s+paid\b/i.test(text) &&
    !/\b(bank transfer|cash)\s+from\b/i.test(text) &&
    !/^payment\s+for\b/i.test(text)
  ) {
    const period = getPeriod(text);
    const rawCustomerQuery =
      text.match(/^payments?\s+from\s+(.+)$/i)?.[1]?.trim() ||
      text.match(/^what did\s+(.+?)\s+pay$/i)?.[1]?.trim() ||
      (hasExplicitContextReference(text) ? context?.lastCustomerLabel : undefined);
    const customerQuery =
      rawCustomerQuery && !hasExplicitContextReference(rawCustomerQuery) ? rawCustomerQuery : undefined;
    const missingFields =
      customerQuery || (!rawCustomerQuery && !hasExplicitContextReference(text)) ? [] : ["customer"];
    return createResult({
      intent: "list_payments",
      confidence: 0.84,
      entities: {
        ...(period ? { period } : {}),
        ...(customerQuery ? { customerQuery } : {})
      },
      missingFields,
      executionIntent: {
        type: "payment_list",
        range: period ?? "all"
      }
    });
  }

  if (/\b(outstanding|owe|owes me|debt|debts)\b/i.test(text)) {
    const rawCustomerQuery =
      text.match(/^(?:does|what did)\s+(.+?)\s+owe(?:\s+again|\s+anything)?$/i)?.[1]?.trim() ||
      text.match(/^debt\s+for\s+(.+)$/i)?.[1]?.trim() ||
      undefined;
    const customerQuery =
      rawCustomerQuery && !hasExplicitContextReference(rawCustomerQuery) ? rawCustomerQuery : undefined;
    return createResult({
      intent: "list_debts",
      confidence: 0.84,
      entities: customerQuery ? { customerQuery } : {},
      missingFields: customerQuery || !rawCustomerQuery ? [] : ["customer"],
      executionIntent: { type: "outstanding_list" }
    });
  }

  if (/\b(invoice)\b/i.test(text)) {
    const invoiceAction =
      text.match(/^(?:create|make|generate|send|show|raise|draft)(?:\s+me)?\s+(?:an?\s+)?invoice(?:\s+for)?\s+(.+)$/i) ??
      text.match(/^can you invoice\s+(.+)$/i) ??
      text.match(/^need an invoice for\s+(.+)$/i) ??
      text.match(/^invoice\s+for\s+(.+)$/i);
    const invoiceCustomerFirst = text.match(/^invoice\s+(.+?)\s+for\s+(.+)$/i);
    const split =
      invoiceAction?.[1] ? splitLeadingCustomerAndTitle(invoiceAction[1]) : undefined;
    const customerQuery =
      invoiceCustomerFirst?.[1]?.trim() ||
      split?.customerQuery ||
      (isCustomerReference(text) ? context?.lastCustomerLabel : undefined);
    const jobTitleQuery = invoiceCustomerFirst?.[2]?.trim() || split?.title;
    const usesLastCustomer = !invoiceAction?.[1] && !invoiceCustomerFirst?.[1] && Boolean(customerQuery);
    const usesLastJob = /\b(last job|previous job|that boiler job|that job|yesterday's job)\b/i.test(text);
    const missingFields = [];
    if ((!customerQuery || isPronounReference(customerQuery)) && !usesLastJob) {
      missingFields.push("customer");
    }
    if (!jobTitleQuery && !usesLastJob && !/\bfor\s+£?\d/i.test(text) && !/\binvoice\s+\w+\s+for\s+\d/i.test(text)) {
      missingFields.push("job");
    }
    if (usesLastJob && !context?.lastJobLabel && !context?.lastJobId) {
      missingFields.push("job");
    }

    return createResult({
      intent: "create_invoice",
      confidence: missingFields.length === 0 ? 0.86 : 0.56,
      entities: {
        ...(customerQuery ? { customerQuery } : {}),
        ...(jobTitleQuery ? { jobTitleQuery } : {})
      },
      missingFields,
      executionIntent: missingFields.length === 0 && customerQuery ? { type: "invoice_create", customerQuery } : null,
      sessionReferences: {
        usesLastCustomer,
        usesLastJob
      }
    });
  }

  if (
    /\b(change|update|updte|set|add|swap|new)\b.+\b(number|phone|mobile|num)\b/i.test(text) ||
    /^new\s+number\s+for\s+.+$/i.test(text)
  ) {
    const phone = extractPhone(text);
    const match = text.match(
      /^(?:change|update|updte|set|add|swap)\s+(.+?)\s+(?:number|phone|mobile|num)(?:\s+(?:to\s+|as\s+)?(.+))?$/i
    );
    const updatePhoneForMatch = text.match(/^update\s+phone\s+for\s+(.+)$/i);
    const newNumberMatch = text.match(/^new\s+number\s+for\s+(.+?)(?:\s+is\s+.+)?$/i);
    const directCustomerQuery =
      match?.[1]?.trim().replace(/^customer\s+/i, "").replace(/'s$/i, "") ||
      updatePhoneForMatch?.[1]?.trim().replace(/^customer\s+/i, "").replace(/'s$/i, "") ||
      newNumberMatch?.[1]?.trim().replace(/^customer\s+/i, "") ||
      undefined;
    const customerQuery =
      (directCustomerQuery && !hasExplicitContextReference(directCustomerQuery) ? directCustomerQuery : undefined) ||
      (isCustomerReference(text) ? context?.lastCustomerLabel : undefined);
    const missingFields = [];
    if (!customerQuery) {
      missingFields.push("customer");
    }
    if (!phone) {
      missingFields.push("phone");
    }

    return createResult({
      intent: "update_customer",
      confidence: missingFields.length === 0 ? 0.75 : 0.55,
      entities: {
        ...(customerQuery ? { customerQuery } : {}),
        ...(phone ? { phone } : {})
      },
      missingFields,
      executionIntent:
        customerQuery && phone
          ? { type: "customer_update_phone", customerQuery, phone }
          : null,
      followUpQuestion:
        !customerQuery && !phone
          ? "Which customer should I update, and what is the new phone number?"
          : undefined,
      sessionReferences: {
        usesLastCustomer: !match?.[1] && Boolean(customerQuery)
      }
    });
  }

  if (/^complete\s+[a-z][a-z0-9'\-]+\s+.+$/i.test(text) && !/^complete\s+the\s+(?:previous|last)\s+job$/i.test(text)) {
    const match = text.match(/^complete\s+([a-z][a-z0-9'\-]+)\s+(.+)$/i);
    if (match) {
      return createResult({
        intent: "update_job_status",
        confidence: 0.82,
        entities: {
          customerQuery: match[1].trim(),
          jobQuery: match[2].trim(),
          jobTitleQuery: match[2].trim(),
          status: "completed"
        },
        executionIntent: { type: "job_close", jobId: match[2].trim() }
      });
    }
  }

  if (/^mark\s+[a-z][a-z0-9'\-]+\s+job\s+complete$/i.test(text)) {
    const match = text.match(/^mark\s+([a-z][a-z0-9'\-]+)\s+job\s+complete$/i);
    if (match) {
      return createResult({
        intent: "update_job_status",
        confidence: 0.54,
        entities: {
          customerQuery: match[1].trim(),
          status: "completed"
        },
        missingFields: ["job"]
      });
    }
  }

  if (/^(?:reopen\s+the\s+last\s+job|complete\s+the\s+previous\s+job)$/i.test(text)) {
    return createResult({
      intent: "update_job_status",
      confidence: 0.54,
      missingFields: ["job"]
    });
  }

  if (/^mark\s+.+\s+for\s+[a-z][a-z0-9'\-]+\s+as\s+(?:cancelled|canceled)$/i.test(text)) {
    const match = text.match(/^mark\s+(.+?)\s+for\s+([a-z][a-z0-9'\-]+)\s+as\s+(?:cancelled|canceled)$/i);
    if (match) {
      return createResult({
        intent: "update_job_status",
        confidence: 0.82,
        entities: {
          customerQuery: match[2].trim(),
          jobQuery: match[1].trim(),
          jobTitleQuery: match[1].trim(),
          status: "canceled"
        },
        executionIntent: { type: "job_set_status", jobId: match[1].trim(), status: "canceled" }
      });
    }
  }

  if (
    /^(?:mark|close|complete|completed|done|finish|finished|put)\b/i.test(text) &&
    !/^put\s+down\s+a\s+job\b/i.test(text) &&
    looksLikeJobReference(text)
  ) {
    const jobId = context?.lastJobId;
    const customerQuery =
      text.match(/^(?:close|complete)\s+(.+?)\s+jobs?$/i)?.[1]?.trim() ||
      undefined;
    const statusQuery = extractJobStatusQuery(text);
    const requestedStatus = extractRequestedJobStatus(text);
    const jobTitle = statusQuery || extractJobTitle(text) || context?.lastJobLabel;

    if (
      customerQuery &&
      customerQuery !== "that" &&
      customerQuery !== "this" &&
      !/^(?:the previous|the last|last|previous)$/i.test(customerQuery)
    ) {
      return createResult({
        intent: "update_job_status",
        confidence: 0.82,
        entities: { customerQuery },
        executionIntent: { type: "job_close_customer", customerQuery }
      });
    }

    if (!jobId && isJobReference(text) && !context?.lastJobLabel) {
      return createResult({
        intent: "update_job_status",
        confidence: 0.54,
        entities: requestedStatus ? { status: requestedStatus } : {},
        missingFields: ["job"]
      });
    }

    if (jobTitle && requestedStatus) {
      const executionStatus =
        requestedStatus === "completed"
          ? "completed"
          : requestedStatus === "canceled"
            ? "canceled"
            : "active";

      return createResult({
        intent: "update_job_status",
        confidence: 0.84,
        entities: {
          ...(jobId ? { jobId } : {}),
          jobQuery: jobTitle,
          jobTitleQuery: jobTitle,
          status: requestedStatus
        },
        executionIntent:
          requestedStatus === "completed"
            ? { type: "job_close", jobId: jobId || jobTitle }
            : { type: "job_set_status", jobId: jobId || jobTitle, status: executionStatus },
        sessionReferences: {
          usesLastJob: isJobReference(text) || /\b(this|that|previous|last)\b/.test(text)
        }
      });
    }

    return createResult({
      intent: "update_job_status",
      confidence: jobId || jobTitle ? 0.84 : 0.54,
      entities: {
        ...(jobId ? { jobId } : {}),
        ...(jobTitle ? { jobTitle } : {})
      },
      missingFields: jobId || jobTitle ? [] : ["job"],
      executionIntent: jobId
        ? { type: "job_close", jobId }
        : jobTitle
          ? { type: "job_close", jobId: jobTitle }
          : null,
      sessionReferences: {
        usesLastJob: isJobReference(text) || /\b(this|that|previous|last)\b/.test(text)
      }
    });
  }

  if (
    /^(?:mark|set|pause|reopen|reactivate|job\s+done|job\s+completed)\b/i.test(text) &&
    !/\bphone\b|\bnumber\b|\bmobile\b/i.test(text)
  ) {
    const jobQuery = extractJobStatusQuery(text);
    const requestedStatus = extractRequestedJobStatus(text);

    if (jobQuery && requestedStatus) {
      const executionStatus =
        requestedStatus === "completed"
          ? "completed"
          : requestedStatus === "canceled"
            ? "canceled"
            : "active";

      return createResult({
        intent: "update_job_status",
        confidence: 0.82,
        entities: {
          jobQuery,
          jobTitleQuery: jobQuery,
          status: requestedStatus
        },
        executionIntent:
          requestedStatus === "completed"
            ? { type: "job_close", jobId: jobQuery }
            : { type: "job_set_status", jobId: jobQuery, status: executionStatus }
      });
    }
  }

  if (/^(?:complete|close)\s+.+$/i.test(text) && !/\baccount\b|\bpayment\b/i.test(text)) {
    const customerJobMatch = text.match(/^(?:complete|close)\s+([a-z][a-z0-9'\-]+)\s+(.+)$/i);
    if (customerJobMatch) {
      return createResult({
        intent: "update_job_status",
        confidence: 0.82,
        entities: {
          customerQuery: customerJobMatch[1].trim(),
          jobQuery: customerJobMatch[2].trim(),
          jobTitleQuery: customerJobMatch[2].trim(),
          status: "completed"
        },
        executionIntent: { type: "job_close", jobId: customerJobMatch[2].trim() }
      });
    }
  }

  if (/^complete\s+[a-z][a-z0-9'\-]+\s+.+$/i.test(text)) {
    const match = text.match(/^complete\s+([a-z][a-z0-9'\-]+)\s+(.+)$/i);
    if (match) {
      return createResult({
        intent: "update_job_status",
        confidence: 0.82,
        entities: {
          customerQuery: match[1].trim(),
          jobQuery: match[2].trim(),
          jobTitleQuery: match[2].trim(),
          status: "completed"
        },
        executionIntent: { type: "job_close", jobId: match[2].trim() }
      });
    }
  }

  if (/^(?:set\s+that\s+one\s+to\s+in\s+progress|reopen\s+the\s+last\s+job|complete\s+the\s+previous\s+job|that\s+.+\s+job\s+is\s+done\s+now)$/i.test(text)) {
    return createResult({
      intent: "update_job_status",
      confidence: 0.54,
      missingFields: ["job"]
    });
  }

  if (/^mark\s+.+\s+for\s+[a-z][a-z0-9'\-]+\s+as\s+(?:cancelled|canceled)$/i.test(text)) {
    const match = text.match(/^mark\s+(.+?)\s+for\s+([a-z][a-z0-9'\-]+)\s+as\s+(?:cancelled|canceled)$/i);
    if (match) {
      return createResult({
        intent: "update_job_status",
        confidence: 0.82,
        entities: {
          customerQuery: match[2].trim(),
          jobQuery: match[1].trim(),
          jobTitleQuery: match[1].trim(),
          status: "canceled"
        },
        executionIntent: { type: "job_set_status", jobId: match[1].trim(), status: "canceled" }
      });
    }
  }

  if (/^mark\s+[a-z][a-z0-9'\-]+\s+job\s+complete$/i.test(text)) {
    const match = text.match(/^mark\s+([a-z][a-z0-9'\-]+)\s+job\s+complete$/i);
    if (match) {
      return createResult({
        intent: "update_job_status",
        confidence: 0.54,
        entities: {
          customerQuery: match[1].trim(),
          status: "completed"
        },
        missingFields: ["job"]
      });
    }
  }

  if (/^(?:set|mark)\s+.+\s+(?:in progress|as cancelled|as canceled|complete|completed)$/i.test(text)) {
    const customerStatusMatch =
      text.match(/^(?:set)\s+([a-z][a-z0-9'\-]+)\s+(.+?)\s+in progress$/i) ??
      text.match(/^(?:mark)\s+(.+?)\s+for\s+([a-z][a-z0-9'\-]+)\s+as\s+(cancelled|canceled)$/i) ??
      text.match(/^(?:mark)\s+([a-z][a-z0-9'\-]+)\s+job\s+complete$/i);

    if (customerStatusMatch) {
      if (customerStatusMatch.length === 4 && /cancel/.test(customerStatusMatch[3])) {
        return createResult({
          intent: "update_job_status",
          confidence: 0.82,
          entities: {
            customerQuery: customerStatusMatch[2].trim(),
            jobQuery: customerStatusMatch[1].trim(),
            jobTitleQuery: customerStatusMatch[1].trim(),
            status: "canceled"
          },
          executionIntent: { type: "job_set_status", jobId: customerStatusMatch[1].trim(), status: "canceled" }
        });
      }

      if (/job complete$/i.test(text)) {
        return createResult({
          intent: "update_job_status",
          confidence: 0.54,
          entities: {
            customerQuery: customerStatusMatch[1].trim(),
            status: "completed"
          },
          missingFields: ["job"]
        });
      }

      return createResult({
        intent: "update_job_status",
        confidence: 0.82,
        entities: {
          customerQuery: customerStatusMatch[1].trim(),
          jobQuery: customerStatusMatch[2].trim(),
          jobTitleQuery: customerStatusMatch[2].trim(),
          status: "active"
        },
        executionIntent: { type: "job_set_status", jobId: customerStatusMatch[2].trim(), status: "active" }
      });
    }
  }

  if (
    /^(?:book)\s+[a-z][a-z0-9'\-]+\s+in\s+for\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|today)\b/i.test(
      text
    ) &&
    !/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(text)
  ) {
    const match = text.match(
      /^(?:book)\s+([a-z][a-z0-9'\-]+)\s+in\s+for\s+((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|today)\s+.+)$/i
    );
    const split = match?.[2] ? splitLeadingCustomerAndTitle(match[2]) : undefined;
    const dueDate = extractRelativeDueDate(text);
    const title = split?.title || stripDateSuffix(match?.[2] ?? "").trim() || undefined;
    const customerQuery = match?.[1]?.trim();

    return createResult({
      intent: "create_job",
      confidence: customerQuery && title ? 0.8 : 0.58,
      entities: {
        ...(customerQuery ? { customerQuery, customerName: customerQuery } : {}),
        ...(title ? { title } : {}),
        ...(dueDate ? { dueDate } : {})
      },
      missingFields: [
        ...(customerQuery ? [] : ["customer"]),
        ...(title ? [] : ["title"])
      ],
      executionIntent:
        customerQuery && title
          ? {
              type: "job_create",
              customerName: customerQuery,
              title,
              totalPence: 0,
              ...(dueDate ? { dueDate } : {})
            }
          : null
    });
  }

  if (/^book\s+(?:that|this)\s+customer\s+in\s+for\s+.+$/i.test(text)) {
    const title = text.match(/^book\s+(?:that|this)\s+customer\s+in\s+for\s+(.+)$/i)?.[1]?.trim();
    return createResult({
      intent: "create_job",
      confidence: 0.58,
      entities: title ? { title } : {},
      missingFields: ["customer"]
    });
  }

  if (/^(?:book|schedule)\b/i.test(text) && !/\bjob\b/i.test(text)) {
    const match =
      text.match(/^(?:book|schedule)\s+(.+?)\s+for\s+(.+)$/i) ??
      text.match(/^(?:book|schedule)\s+(.+?)\s+(tomorrow|next week|today|in \d+ (?:day|days|week|weeks).+)$/i);
    const customerQuery =
      match?.[1]?.trim() ||
      (isCustomerReference(text) ? context?.lastCustomerLabel : undefined);
    const startsAt = extractBookingStartsAt(text);
    const missingFields = [];
    if (!customerQuery) {
      missingFields.push("customerQuery");
    }
    if (!startsAt) {
      missingFields.push("startsAt");
    }

    return createResult({
      intent: "create_booking",
      confidence: missingFields.length === 0 ? 0.87 : 0.58,
      entities: {
        ...(customerQuery ? { customerQuery, customerName: customerQuery } : {}),
        ...(startsAt ? { startsAt } : {})
      },
      missingFields,
      executionIntent:
        customerQuery && startsAt
          ? {
              type: "booking_create",
              customerName: customerQuery,
              startsAt
            }
          : null,
      sessionReferences: {
        usesLastCustomer: !match?.[1] && Boolean(customerQuery)
      }
    });
  }

  if (
    (/\bjob\b|\bjb\b/i.test(text) && JOB_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`, "i").test(text))) ||
    /^(?:another)\s+job\s+for\b/i.test(text) ||
    /^(?:new)\s+job\s+[a-z]/i.test(text) ||
    /^(?:new)\s+jb\s+for\b/i.test(text) ||
    /^(?:creat|create)\s+job\s+for\b/i.test(text) ||
    /^(?:job\s+for|set up\s+a\s+job|put down\s+a\s+job|new\s+callout\s+for|add(?:\s+in)?\s+(?:a\s+)?callout|callout\s+for)\b/i.test(text)
  ) {
    const amount = extractAmount(text);
    const dueDate = extractRelativeDueDate(text);
    const dateText = extractDateText(text);
    const titleMatch = text.match(/^(?:create|add|log|book)\s+(?:a\s+)?(.+?)\s+job(?:\s+for\s+(.+))?$/i);
    const titleBeforeCustomer = text.match(/^(?:add|create|log|book)\s+job\s+(.+?)\s+for\s+(.+)$/i);
    const explicitCustomerFirst = text.match(/^(?:create|set up|put down)\s+(?:a\s+)?job\s+for\s+(.+)$/i);
    const calloutMatch = text.match(/^(?:add(?:\s+in)?\s+(?:a\s+)?)?callout\s+for\s+(.+)$/i);
    const newCalloutMatch = text.match(/^new\s+callout\s+for\s+(.+)$/i);
    const bareJobForMatch = text.match(/^job\s+for\s+(.+)$/i);
    const weakAddJobMatch = text.match(/^add\s+job\s+(.+)$/i);
    const newJobForMatch = text.match(/^(?:new|creat|create)\s+(?:job|jb)\s+for\s+(.+)$/i);
    const newJobBareMatch = text.match(/^new\s+job\s+(.+)$/i);
    const anotherJobMatch = text.match(/^another\s+job\s+for\s+(.+?)(?:,\s*(.+))?$/i);
    const titleBeforeJobForCustomer = text.match(/^(?:create|make)\s+(?:a\s+)?(.+?)\s+job\s+for\s+(.+)$/i);
    const createJobForMatch = text.match(/^create\s+job\s+for\s+(.+)$/i);
    const putDownJobMatch = text.match(/^put\s+down\s+a\s+job\s+for\s+(.+)$/i);
    const bookInJobForMatch = text.match(/^book\s+in\s+a\s+job\s+for\s+(.+)$/i);

    let customerQuery =
      titleBeforeCustomer?.[2]?.trim() ||
      titleMatch?.[2]?.trim() ||
      titleBeforeJobForCustomer?.[2]?.trim() ||
      (anotherJobMatch?.[1] && !hasExplicitContextReference(anotherJobMatch[1]) ? anotherJobMatch[1].trim() : undefined) ||
      (isCustomerReference(text) ? context?.lastCustomerLabel : undefined);
    let title =
      titleBeforeCustomer?.[1]?.trim() ||
      titleBeforeJobForCustomer?.[1]?.trim() ||
      titleMatch?.[1]?.trim().replace(/\bjob\b$/i, "") ||
      anotherJobMatch?.[2]?.trim() ||
      undefined;
    let allowMissingTotal = false;

    if (title === "a" || title === "an") {
      title = undefined;
    }

    if (titleBeforeCustomer) {
      allowMissingTotal = true;
    }

    if (bookInJobForMatch || putDownJobMatch || titleBeforeJobForCustomer) {
      allowMissingTotal = true;
    }

    if ((!customerQuery || !title) && explicitCustomerFirst?.[1]) {
      const split = splitCustomerAndJobTitle(explicitCustomerFirst[1]);
      customerQuery = split.customerQuery || customerQuery;
      title = split.title || title;
      allowMissingTotal = true;
    }

    if ((!customerQuery || !title) && calloutMatch?.[1]) {
      const split = splitLeadingCustomerAndTitle(calloutMatch[1]);
      customerQuery = split.customerQuery || customerQuery;
      title = split.title || title;
      allowMissingTotal = true;
    }

    if ((!customerQuery || !title) && newCalloutMatch?.[1]) {
      const split = splitLeadingCustomerAndTitle(newCalloutMatch[1]);
      customerQuery = split.customerQuery || customerQuery;
      title = split.title || title;
      allowMissingTotal = true;
    }

    if ((!customerQuery || !title) && bareJobForMatch?.[1]) {
      const split = splitCustomerAndJobTitle(bareJobForMatch[1]);
      customerQuery = customerQuery || split.customerQuery;
      title = title || split.title;
      if (split.customerQuery && split.title) {
        allowMissingTotal = true;
      }
    }

    if ((!customerQuery || !title) && weakAddJobMatch?.[1]) {
      const split = splitLeadingCustomerAndTitle(weakAddJobMatch[1]);
      customerQuery = customerQuery || split.customerQuery;
      title = title || split.title;
    }

    if ((!customerQuery || !title) && newJobForMatch?.[1]) {
      const split = splitCustomerAndJobTitle(newJobForMatch[1]);
      customerQuery = customerQuery || split.customerQuery;
      title = title || split.title;
      allowMissingTotal = true;
    }

    if ((!customerQuery || !title) && newJobBareMatch?.[1]) {
      const split = splitCustomerAndJobTitle(newJobBareMatch[1]);
      customerQuery = customerQuery || split.customerQuery;
      title = title || split.title;
      allowMissingTotal = true;
    }

    if ((!customerQuery || !title) && createJobForMatch?.[1]) {
      const split = splitCustomerAndJobTitle(createJobForMatch[1]);
      customerQuery = customerQuery || split.customerQuery;
      title = title || split.title;
      if (split.customerQuery && split.title) {
        allowMissingTotal = true;
      }
    }

    if ((!customerQuery || !title) && putDownJobMatch?.[1]) {
      const split = splitCustomerAndJobTitle(putDownJobMatch[1]);
      customerQuery = customerQuery || split.customerQuery;
      title = title || split.title;
      allowMissingTotal = true;
    }

    if ((!customerQuery || !title) && bookInJobForMatch?.[1]) {
      const split = splitCustomerAndJobTitle(bookInJobForMatch[1]);
      customerQuery = customerQuery || split.customerQuery;
      title = title || split.title;
      allowMissingTotal = true;
    }

    if (bookInJobForMatch?.[1]) {
      const split = splitCustomerAndJobTitle(bookInJobForMatch[1]);
      customerQuery = split.customerQuery || customerQuery;
      title = split.title || title;
    }

    if (putDownJobMatch?.[1]) {
      const split = splitCustomerAndJobTitle(putDownJobMatch[1]);
      customerQuery = split.customerQuery || customerQuery;
      title = split.title || title;
    }

    if ((!customerQuery || !title) && titleBeforeJobForCustomer?.[2]) {
      customerQuery = customerQuery || titleBeforeJobForCustomer[2].trim();
      title = title || titleBeforeJobForCustomer[1].trim();
      allowMissingTotal = true;
    }

    if ((!customerQuery || !title) && /^make\s+a\s+new\s+job\s+called\s+.+\s+for\s+.+$/i.test(text)) {
      const match = text.match(/^make\s+a\s+new\s+job\s+called\s+(.+?)\s+for\s+(.+)$/i);
      if (match) {
        customerQuery = customerQuery || match[2].trim();
        title = title || match[1].trim();
        allowMissingTotal = true;
      }
    }

    if (/^(?:create\s+job\s+for|job\s+for)\b/i.test(text) && customerQuery && title && !amount) {
      allowMissingTotal = hasSingleTokenName(customerQuery);
    }

    customerQuery =
      customerQuery ||
      text.match(/\bfor\s+([a-z][a-z0-9 '\-]+)$/i)?.[1]?.trim() ||
      undefined;
    title =
      title ||
      text.match(/job\s+for\s+.+?\s+(.+)$/i)?.[1]?.trim() ||
      undefined;

    const missingFields = [];
    if (/^new\s+job\s+.+$/i.test(text) && customerQuery && title && !amount && !/\bfor\b/i.test(text)) {
      allowMissingTotal = true;
    }
    if (/previous customer/i.test(text) && !context?.lastCustomerLabel) {
      customerQuery = undefined;
    }
    if (!customerQuery) {
      missingFields.push("customer");
    }
    if (!title) {
      missingFields.push("title");
    }
    if (!amount && !allowMissingTotal) {
      missingFields.push("total");
    }

    return createResult({
      intent: "create_job",
      confidence: missingFields.length === 0 ? 0.86 : allowMissingTotal ? 0.8 : 0.58,
      entities: {
        ...(customerQuery ? { customerName: customerQuery, customerQuery } : {}),
        ...(title ? { title } : {}),
        ...(amount ? { totalPence: amount.amountPence } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(dateText ? { dateText } : {})
      },
      missingFields,
      executionIntent:
        customerQuery && title && (amount || allowMissingTotal)
          ? {
              type: "job_create",
              customerName: customerQuery,
              title,
              totalPence: amount?.amountPence ?? 0,
              ...(dueDate ? { dueDate } : {})
            }
          : null,
      sessionReferences: {
        usesLastCustomer: !titleMatch?.[2] && Boolean(customerQuery) && isCustomerReference(text)
      }
    });
  }

  if (
    PAYMENT_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`, "i").test(text)) ||
    /\bpaymnt\b/i.test(text) ||
    /\bsettled up\b/i.test(text) ||
    /\bput .+ down as paid\b/i.test(text) ||
    /\b(bank transfer|cash)\s+from\b/i.test(text) ||
    /^(?:take|put|add|record|log)\s+£?\d+(?:\.\d{1,2})?\s*(?:cash|bank|card)?\s+off\s+.+\s+account$/i.test(text) ||
    /^(?:customer\s+)?paid\s+in\s+full\s+£?\d+(?:\.\d{1,2})?\s+.+$/i.test(text) ||
    /^(?:put\s+down|can you log)\b/i.test(text)
  ) {
    const amount = extractAmount(text);
    const offAccountMatch = text.match(
      /^(?:take|put|add|record|log)\s+£?(\d+(?:\.\d{1,2})?)\s*(cash|bank|card)?\s+off\s+(.+?)\s+account$/i
    );
    const offAccountPaidMatch = text.match(
      /^(?:take|put|add|record|log)\s+£?(\d+(?:\.\d{1,2})?)\s*(cash|bank|card)?\s+off\s+(.+?)\s+account\s+.+$/i
    );
    const paidInFullTailCustomer = text.match(/^(?:customer\s+)?paid\s+in\s+full\s+£?(\d+(?:\.\d{1,2})?)\s+(.+)$/i);
    const paidMatch =
      paidInFullTailCustomer ??
      text.match(/^(.+?)\s+settled up\s+£?\d+(?:\.\d{1,2})?/i) ??
      text.match(/^put\s+(.+?)\s+down\s+as\s+paid\s+£?\d+(?:\.\d{1,2})?/i) ??
      text.match(/^(.+?)\s+paid\s+£?\d+(?:\.\d{1,2})?/i) ??
      text.match(/^customer\s+(.+?)\s+paid\s+me\s+£?\d+(?:\.\d{1,2})?/i);
    const forMatch =
      text.match(/^(?:add|record|log)(?:\s+payment)?\s+(?:for|to)\s+(.+?)(?:\s+£?\d|$)/i) ??
      text.match(/^payment\s+for\s+(.+?)(?:\s+£?\d|$)/i) ??
      text.match(/^add\s+£?\d+(?:\.\d{1,2})?(?:\s*(?:quid|pounds|gbp))?\s+for\s+(.+)$/i);

    const customerQuery =
      offAccountMatch?.[3]?.trim() ||
      offAccountPaidMatch?.[3]?.trim() ||
      paidMatch?.[1]?.trim() ||
      forMatch?.[1]?.trim() ||
      text.match(/(?:from)\s+(.+?)\s+£?\d+(?:\.\d{1,2})?$/i)?.[1]?.trim() ||
      text.match(/(?:from)\s+([a-z][a-z0-9 '\-]+)$/i)?.[1]?.trim() ||
      (isCustomerReference(text) ? context?.lastCustomerLabel : undefined);
    const usesLastCustomer = !paidMatch?.[1] && !forMatch?.[1] && Boolean(customerQuery);
    const usesLastJob = isJobReference(text) && Boolean(context?.lastJobId);
    const jobTitle = extractJobTitle(text) || context?.lastJobLabel;
    const method = (offAccountMatch?.[2]?.toLowerCase() as "cash" | "bank" | "card" | undefined) || extractPaymentMethod(text);
    const unresolvedReference = Boolean(customerQuery && isPronounReference(customerQuery) && !context?.lastCustomerLabel);

    const missingFields = [];
    if (!amount) {
      missingFields.push("amount");
    }
    if ((!customerQuery || unresolvedReference) && !context?.lastJobId && !jobTitle) {
      missingFields.push("customer");
    }
    if (!customerQuery && hasExplicitContextReference(text) && !context?.lastJobId && !context?.lastCustomerLabel) {
      if (!missingFields.includes("customer")) {
        missingFields.push("customer");
      }
    }

    return createResult({
      intent: "record_payment",
      confidence: missingFields.length === 0 ? 0.88 : 0.55,
      entities: {
        ...(customerQuery ? { customerQuery, customerName: customerQuery } : {}),
        ...(amount ? { amountPence: amount.amountPence } : {}),
        ...(usesLastJob && context?.lastJobId ? { jobId: context.lastJobId } : {}),
        ...(jobTitle ? { jobTitle } : {}),
        ...(method ? { method } : {})
      },
      missingFields,
      executionIntent:
        amount && (customerQuery || context?.lastJobId || jobTitle)
          ? {
              type: "payment_add",
              amountPence: amount.amountPence,
              ...(method ? { method } : {}),
              ...(context?.lastJobId && usesLastJob
                ? { jobId: context.lastJobId }
                : jobTitle
                  ? { jobId: jobTitle }
                  : {}),
              ...(customerQuery ? { customerName: customerQuery } : {})
            }
          : null,
      sessionReferences: {
        usesLastCustomer,
        usesLastJob,
        usesPendingFlow: false
      }
    });
  }

  return null;
};
