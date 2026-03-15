import { IntentSchema, ParsedIntent, WriteIntentTypeSchema } from "./intents/schemas";
import { parseWithAgentLayer } from "./parsers/agent-orchestrator";
import { adminReply, assistantReply, detailedReply, guideReply } from "./replies";
import { conversationMemory } from "./agent/context-memory";
import { JobsService } from "../services/jobs.service";
import { PaymentsService } from "../services/payments.service";
import { RemindersService } from "../services/reminders.service";
import { ReportsService } from "../services/reports.service";
import { SubscriptionService } from "../services/subscription.service";
import { UsersService } from "../services/users.service";
import { CustomersService } from "../services/customers.service";
import { BookingsService } from "../services/bookings.service";
import { ExportService } from "../services/export.service";
import { VendorPaymentsService } from "../services/vendor-payments.service";
import { ToolExecutor } from "./agent/tools/tool-executor";
import {
  AddPaymentToolSchema,
  CloseJobToolSchema,
  CreateJobToolSchema,
  FindCustomerToolSchema,
  SummaryToolSchema,
  ToggleBriefingToolSchema
} from "./agent/tools/tool-schemas";
import { createAgentRequestId, emitAgentEvent } from "./agent/observability";
import { resolveCustomerQuery, resolveJobQuery } from "./agent/entity-resolver";
import { buildCommandGuide } from "./agent/command-guide";
import { buildBoundedAssistantReply } from "./agent/bounded-chat";
import { AgentLearningService } from "../services/agent-learning.service";
import { selectAgentFlow } from "./agent-first/flow-selector";
import { env } from "../config/env";
import { buildPlanTodayToolExecutor } from "./agent-first/agent-first-runtime";
import { interpretWithSemanticAgent } from "./semantic-agent/interpreter";
import { resolveSemanticCapability } from "./semantic-agent/runtime";
import { buildSemanticClarification } from "./semantic-agent/clarification";
import { manageDialogTurn } from "./dialog-manager";
import { tryResolvePriorityPendingVendorDebtFollowUp } from "./pending-flow-priority";

export type IncomingMessage = {
  from: string;
  body: string;
  messageSid: string;
};

export type RoutedMessage = {
  reply: string;
  mediaUrl?: string;
};

const UNREGISTERED_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
const UNREGISTERED_REPLY_MAX_COUNT = 3;
const unregisteredReplyCounters = new Map<string, { count: number; resetAt: number }>();

const usersService = new UsersService();
const jobsService = new JobsService();
const paymentsService = new PaymentsService();
const customersService = new CustomersService();
const bookingsService = new BookingsService();
const remindersService = new RemindersService();
const reportsService = new ReportsService();
const exportService = new ExportService();
const vendorPaymentsService = new VendorPaymentsService();
const subscriptionService = new SubscriptionService();
const agentLearningService = new AgentLearningService();
const toolExecutor = new ToolExecutor({
  jobs: jobsService,
  payments: paymentsService,
  customers: customersService,
  reminders: remindersService,
  reports: reportsService,
  exports: exportService,
  users: usersService,
  subscriptions: subscriptionService
});

const penceToPounds = (value: number) => `£${(value / 100).toFixed(2)}`;

const EXPLICIT_CORRECTION_PATTERN =
  /^(?:no\b|nah\b|not quite\b|not exactly\b|that's wrong\b|that is wrong\b|i meant\b|no i meant\b|what i meant was\b)/i;

const isExplicitCorrection = (text: string) => EXPLICIT_CORRECTION_PATTERN.test(text.trim());

const hasMaterialParseDifference = (
  previous: {
    status: "intent" | "clarification" | "unknown";
    intentType?: string;
    analysisIntent?: string;
  },
  current: {
    status: "intent" | "clarification" | "unknown";
    intentType?: string;
    analysisIntent?: string;
  }
) =>
  previous.status !== current.status ||
  previous.intentType !== current.intentType ||
  previous.analysisIntent !== current.analysisIntent;

const mergeParseContexts = (...contexts: Array<Partial<ReturnType<typeof conversationMemory.getAgentParseContext>>>) => {
  return contexts.reduce((acc, context) => {
    if (!context) {
      return acc;
    }

    if (context.lastCustomerId) {
      acc.lastCustomerId = context.lastCustomerId;
    }
    if (context.lastCustomerLabel) {
      acc.lastCustomerLabel = context.lastCustomerLabel;
    }
    if (context.lastJobId) {
      acc.lastJobId = context.lastJobId;
    }
    if (context.lastJobLabel) {
      acc.lastJobLabel = context.lastJobLabel;
    }
    if (context.lastIntent) {
      acc.lastIntent = context.lastIntent;
    }
    if (context.recentTurns?.length) {
      acc.recentTurns = context.recentTurns;
    }
    if (context.pendingFlow) {
      acc.pendingFlow = context.pendingFlow;
    }
    if (context.lastResolvedCandidates) {
      acc.lastResolvedCandidates = context.lastResolvedCandidates;
    }
    if (context.learnedAliases) {
      acc.learnedAliases = context.learnedAliases;
    }
    if (context.learnedIntentHints) {
      acc.learnedIntentHints = context.learnedIntentHints;
    }

    return acc;
  }, {} as ReturnType<typeof conversationMemory.getAgentParseContext>);
};

const compactDate = (value: Date | null) => {
  if (!value) {
    return "no due date";
  }

  return value.toISOString().slice(0, 10);
};

const buildRegistrationReply = () => adminReply(`Please register on the website first: ${env.BASE_URL}`);

const shouldReplyToUnregisteredPhone = (phone: string) => {
  const now = Date.now();
  const existing = unregisteredReplyCounters.get(phone);

  if (!existing || existing.resetAt <= now) {
    unregisteredReplyCounters.set(phone, {
      count: 1,
      resetAt: now + UNREGISTERED_REPLY_WINDOW_MS
    });
    return true;
  }

  if (existing.count >= UNREGISTERED_REPLY_MAX_COUNT) {
    return false;
  }

  existing.count += 1;
  return true;
};

const buildPaymentFollowUpDraft = (input: {
  customerName?: string;
  outstandingPence: number;
  jobTitle?: string | null;
}) => {
  const customer = input.customerName?.trim() || "there";
  const balance = penceToPounds(input.outstandingPence);
  const jobContext = input.jobTitle?.trim() ? ` for ${input.jobTitle.trim()}` : "";

  return [
    `Hi ${customer},`,
    `Thanks for your payment.${jobContext ? ` There is ${balance} still outstanding${jobContext}.` : ` There is ${balance} still outstanding on your account.`}`,
    "Please let me know when you'd like to settle the remaining balance.",
    "Thank you."
  ].join("\n");
};

const buildJobReminderDraft = (input: {
  customerName?: string;
  jobTitle?: string | null;
  dueDate?: Date | null;
}) => {
  const customer = input.customerName?.trim() || "there";
  const jobTitle = input.jobTitle?.trim() || "the job";
  const dueText = input.dueDate ? ` on ${compactDate(input.dueDate)}` : "";

  return [
    `Hi ${customer},`,
    `Just a reminder that ${jobTitle} is booked in${dueText}.`,
    "Please let me know if anything changes.",
    "Thank you."
  ].join("\n");
};

const EXPLICIT_ALL_RECORDS_PATTERN =
  /\b(all records|all customers|full records|everything|entire database|all data)\b/i;
const FOLLOW_UP_CUSTOMER_PDF_PATTERN =
  /\b(as pdf|pdf|as a pdf|same customer|that customer|this customer|that one|this one)\b/i;
const extractCustomerQueryFromPdfMessage = (normalizedText: string) => {
  const namedRecordsMatch = normalizedText.match(
    /^(?:bring|send|export|get)\s+(.+?)\s+records(?:\s+as\s+(?:a\s+)?pdf)?$/i
  );
  if (namedRecordsMatch) {
    const query = namedRecordsMatch[1].trim().replace(/'s$/i, "").trim();
    if (query && !EXPLICIT_ALL_RECORDS_PATTERN.test(query)) {
      return query;
    }
  }

  const recordsForMatch = normalizedText.match(
    /^(?:export|pdf|send)\s+(?:customer\s+)?records(?:\s+for)?\s*[:=]?\s*(.+)$/i
  );
  if (recordsForMatch) {
    const query = recordsForMatch[1].trim();
    if (query && !EXPLICIT_ALL_RECORDS_PATTERN.test(query)) {
      return query;
    }
  }

  return undefined;
};

const resolvePdfCustomerQuery = (input: {
  explicitCustomerQuery?: string;
  normalizedText: string;
  rawText: string;
  phone: string;
}) => {
  const query = input.explicitCustomerQuery?.trim();
  if (query) {
    return query;
  }

  if (
    EXPLICIT_ALL_RECORDS_PATTERN.test(input.normalizedText) ||
    EXPLICIT_ALL_RECORDS_PATTERN.test(input.rawText)
  ) {
    return undefined;
  }

  const extracted =
    extractCustomerQueryFromPdfMessage(input.normalizedText) ??
    extractCustomerQueryFromPdfMessage(input.rawText);
  if (extracted) {
    return extracted;
  }

  if (!FOLLOW_UP_CUSTOMER_PDF_PATTERN.test(input.normalizedText)) {
    return undefined;
  }

  const ctx = conversationMemory.get(input.phone);
  return ctx.lastCustomerName?.trim() || undefined;
};

const PHONE_VALUE_PATTERN = /(\+?[0-9][0-9\s\-().]{5,}[0-9])/;
const EXPENSE_PAID_PATTERN =
  /^(?:i\s+)?(?:paid|spent)\s+£?(\d+(?:\.\d{1,2})?)\s*(?:quid|pounds|gbp)?(?:\s+for\s+(.+?))?(?:\s+(?:at|from)\s+(.+))?$/i;
const EXPENSE_BOUGHT_PAID_PATTERN =
  /^(?:i\s+)?bought\s+(.+?)\s+paid\s+£?(\d+(?:\.\d{1,2})?)\s*(?:quid|pounds|gbp)?(?:\s+(?:at|from)\s+(.+))?$/i;

const parsePoundsToPence = (value: string) => {
  const normalized = value.trim().replace(/[, ]/g, "");
  const amount = Number(normalized.replace(/^£/, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100);
};

const inferExpenseFromRawText = (rawText: string) => {
  const text = rawText.trim();
  const paidMatch = text.match(EXPENSE_PAID_PATTERN);
  if (paidMatch) {
    const amountPence = parsePoundsToPence(paidMatch[1]);
    if (!amountPence) {
      return null;
    }
    return {
      amountPence,
      note: paidMatch[2]?.trim() || undefined,
      counterpartyName: paidMatch[3]?.trim() || undefined
    };
  }

  const boughtMatch = text.match(EXPENSE_BOUGHT_PAID_PATTERN);
  if (!boughtMatch) {
    return null;
  }

  const amountPence = parsePoundsToPence(boughtMatch[2]);
  if (!amountPence) {
    return null;
  }

  return {
    amountPence,
    note: `bought ${boughtMatch[1].trim()}`,
    counterpartyName: boughtMatch[3]?.trim() || undefined
  };
};

const cleanCustomerQuery = (value: string) => {
  return value
    .replace(/^(customer|client)\s+/i, "")
    .replace(/\b(phone|phone number|phone num|number)\b.*$/i, "")
    .replace(/^[\s:=-]+|[\s:=-]+$/g, "")
    .trim();
};

const extractPhoneUpdateFromRawText = (rawText: string) => {
  const phoneMatch = rawText.match(PHONE_VALUE_PATTERN);
  const phone = phoneMatch?.[1]?.trim();

  const patterns = [
    /(?:add|update|set|change)\s+(.+?)\s+(?:phone|phone number|phone num|number|num)\b/i,
    /(?:phone|phone number|phone num|number|num)\s+(?:for|of)\s+(.+?)(?:\s|$)/i,
    /(?:customer|client)\s*[:=]?\s*(.+?)\s*;\s*phone/i
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const customerQuery = cleanCustomerQuery(match[1]);
    if (customerQuery && phone) {
      return { customerQuery, phone };
    }
  }

  if (phone) {
    const stripped = rawText.replace(phone, " ");
    const nameGuess = cleanCustomerQuery(
      stripped.replace(/^(add|update|set|change)\s+/i, "").replace(/\b(phone|phone number|phone num|number|num)\b/gi, " ")
    );
    if (nameGuess) {
      return { customerQuery: nameGuess, phone };
    }
  }

  return null;
};

const extractLikelyJobQuery = (rawText: string) => {
  const patterns = [
    /(?:that|this|the|last|previous)\s+(.+?)\s+job/i,
    /(?:close|complete|mark)\s+(.+?)\s+(?:as\s+)?completed/i,
    /(?:pay|payment|add payment)\s+(?:to|for)\s+(.+?)(?:\s+£?\d|$)/i,
    /(?:for|to)\s+the\s+(.+?)\s+one/i
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match?.[1]) {
      const value = match[1].trim().replace(/\b(job|one)\b$/i, "").trim();
      if (value && !/^(that|this|last|previous)$/i.test(value)) {
        return value;
      }
    }
  }

  return null;
};

const repairParsedIntentFromRawText = (intent: ParsedIntent, rawText: string): ParsedIntent => {
  if (intent.type === "payment_add" && !intent.jobId && !intent.customerName) {
    const inferredExpense = inferExpenseFromRawText(rawText);
    if (inferredExpense) {
      return {
        type: "expense_add",
        amountPence: inferredExpense.amountPence,
        note: inferredExpense.note,
        counterpartyName: inferredExpense.counterpartyName
      };
    }
  }

  if (intent.type !== "customer_update_phone") {
    return intent;
  }

  const extracted = extractPhoneUpdateFromRawText(rawText);
  if (!extracted) {
    return intent;
  }

  const currentPhoneLooksWeak = !PHONE_VALUE_PATTERN.test(intent.phone || "");
  const currentQueryLooksWeak =
    intent.customerQuery.length < 2 ||
    /\bcustomer\b|\bphone\b|[:;]/i.test(intent.customerQuery) ||
    intent.customerQuery.toLowerCase().startsWith("add ");

  if (!currentPhoneLooksWeak && !currentQueryLooksWeak) {
    return intent;
  }

  return {
    type: "customer_update_phone",
    customerQuery: extracted.customerQuery,
    phone: extracted.phone
  };
};

const resolvePendingCustomerCandidate = (input: {
  message: string;
  candidates: Array<{ id: string; name: string; phone: string | null }>;
}) => {
  const text = input.message.trim().toLowerCase();
  if (!text) {
    return null;
  }

  const indexMatch = text.match(/^([1-9]\d?)$/);
  if (indexMatch) {
    const index = Number(indexMatch[1]) - 1;
    if (index >= 0 && index < input.candidates.length) {
      return input.candidates[index];
    }
  }

  const digits = text.replace(/\D/g, "");
  if (digits.length >= 4) {
    const byPhone = input.candidates.find((candidate) => {
      const candidateDigits = (candidate.phone ?? "").replace(/\D/g, "");
      return candidateDigits.endsWith(digits) || candidateDigits.includes(digits);
    });
    if (byPhone) {
      return byPhone;
    }
  }

  const byName = input.candidates.find((candidate) => candidate.name.toLowerCase() === text);
  if (byName) {
    return byName;
  }

  return input.candidates.find((candidate) => text.includes(candidate.name.toLowerCase())) ?? null;
};

const isAllSelectionReply = (message: string) => /^(?:all|all date|all dates|all records|everything)$/i.test(message.trim());

const resolvePendingVendorCandidate = (input: {
  message: string;
  candidates: Array<{ id: string; vendorName: string; balancePence: number }>;
}) => {
  const text = input.message.trim().toLowerCase();
  if (!text) {
    return null;
  }

  const indexMatch = text.match(/^([1-9]\d?)$/);
  if (indexMatch) {
    const index = Number(indexMatch[1]) - 1;
    if (index >= 0 && index < input.candidates.length) {
      return input.candidates[index];
    }
  }

  const byName = input.candidates.find((candidate) => candidate.vendorName.toLowerCase() === text);
  if (byName) {
    return byName;
  }

  return input.candidates.find((candidate) => text.includes(candidate.vendorName.toLowerCase())) ?? null;
};

const resolvePendingJobCandidate = (input: {
  message: string;
  candidates: Array<{ id: string; title: string; customerName: string; outstandingPence: number; dueDate: Date | null }>;
}) => {
  const text = input.message.trim().toLowerCase();
  if (!text) {
    return null;
  }

  const indexMatch = text.match(/^([1-9]\d?)$/);
  if (indexMatch) {
    const index = Number(indexMatch[1]) - 1;
    if (index >= 0 && index < input.candidates.length) {
      return input.candidates[index];
    }
  }

  const byId = input.candidates.find((candidate) => candidate.id.toLowerCase().startsWith(text));
  if (byId) {
    return byId;
  }

  return (
    input.candidates.find(
      (candidate) =>
        text.includes(candidate.title.toLowerCase()) || text.includes(candidate.customerName.toLowerCase())
    ) ?? null
  );
};

const createCustomerDisambiguationReply = (input: {
  query: string;
  action:
    | "export_pdf"
    | "invoice_pdf"
    | "update_customer_phone"
    | "add_payment"
    | "customer_find"
    | "close_jobs"
    | "job_create"
    | "booking_create";
  candidates: Array<{ id: string; name: string; phone: string | null }>;
}) => {
  const lines = input.candidates
    .slice(0, 5)
    .map((candidate, index) => {
      const phonePart = candidate.phone ? ` (${candidate.phone})` : "";
      return `${index + 1}) ${candidate.name}${phonePart}`;
    })
    .join(" | ");

  const actionPrompt =
    input.action === "update_customer_phone"
      ? `Reply with number or phone digits to update: ${lines}`
      : input.action === "add_payment"
        ? `Reply with number or phone digits to continue payment: ${lines}`
        : input.action === "customer_find"
          ? `Reply with number or phone digits to view exact customer: ${lines}`
          : input.action === "close_jobs"
            ? `Reply with number or phone digits to close jobs: ${lines}`
        : input.action === "job_create"
          ? `Reply with number or phone digits to create job: ${lines}`
          : input.action === "booking_create"
            ? `Reply with number or phone digits to create booking: ${lines}`
          : input.action === "invoice_pdf"
            ? `Reply with number or phone digits to create invoice: ${lines}`
      : `Reply with number or phone digits: ${lines}`;

  return adminReply(
    `I found multiple customers for "${input.query}".`,
    actionPrompt
  );
};

const formatCustomerRecordsReply = (records: Array<{
  id: string;
  name: string;
  phone: string | null;
  activeJobs: number;
  outstandingPence: number;
  lastPaymentPence: number | null;
  lastPaymentAt: Date | null;
}>) => {
  const top = records.slice(0, 3);
  const summary = top
    .map((record) => {
      const lastPayment =
        record.lastPaymentPence !== null
          ? `last payment ${penceToPounds(record.lastPaymentPence)}${record.lastPaymentAt ? ` on ${record.lastPaymentAt.toISOString().slice(0, 10)}` : ""}`
          : "no payments yet";
      return `${record.name}${record.phone ? ` (${record.phone})` : ""}: active jobs ${record.activeJobs}, outstanding ${penceToPounds(record.outstandingPence)}, ${lastPayment}`;
    })
    .join(" | ");

  const suffix = records.length > top.length ? ` +${records.length - top.length} more.` : "";
  return adminReply(`Customer records: ${summary}.${suffix}`);
};

const createVendorDisambiguationReply = (input: {
  query: string;
  action: "vendor_payment_add" | "export_vendor_pdf";
  candidates: Array<{ id: string; vendorName: string; balancePence: number }>;
}) => {
  const lines = input.candidates
    .slice(0, 5)
    .map((candidate, index) => `${index + 1}) ${candidate.vendorName} (${penceToPounds(candidate.balancePence)})`)
    .join(" | ");

  const actionPrompt =
    input.action === "vendor_payment_add"
      ? `Reply with number or vendor name to continue payment: ${lines}`
      : `Reply with number or vendor name to continue PDF export: ${lines}`;

  return adminReply(`I found multiple vendors for "${input.query}".`, actionPrompt);
};

const createJobDisambiguationReply = (input: {
  query: string;
  action: "add_payment" | "close_job";
  candidates: Array<{ id: string; title: string; customerName: string; outstandingPence: number; dueDate: Date | null }>;
}) => {
  const lines = input.candidates
    .slice(0, 5)
    .map(
      (candidate, index) =>
        `${index + 1}) ${candidate.customerName}: ${candidate.title} (${penceToPounds(candidate.outstandingPence)}, ${compactDate(candidate.dueDate)})`
    )
    .join(" | ");

  const actionPrompt =
    input.action === "add_payment"
      ? `Which job should I apply the payment to? Reply with the number: ${lines}`
      : `Which job should I close? Reply with the number: ${lines}`;

  return adminReply(`I found multiple jobs for "${input.query}".`, actionPrompt);
};

const resolveCustomerByQuery = async (input: { userId: string; query: string }) => {
  return resolveCustomerQuery(input);
};

const resolveVendorByQuery = async (input: { userId: string; query: string }) => {
  const query = input.query.trim();
  const candidates = await vendorPaymentsService.resolveVendorByQuery({
    userId: input.userId,
    query
  });

  if (candidates.length === 0) {
    return { status: "not_found" as const, query };
  }

  if (candidates.length > 1) {
    return {
      status: "ambiguous" as const,
      query,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        vendorName: candidate.vendorName,
        balancePence: candidate.balancePence
      }))
    };
  }

  return {
    status: "vendor" as const,
    vendor: candidates[0]
  };
};

const resolveCustomerOrReply = async (input: {
  userId: string;
  phone: string;
  action:
    | "export_pdf"
    | "invoice_pdf"
    | "update_customer_phone"
    | "add_payment"
    | "customer_find"
    | "close_jobs"
    | "job_create"
    | "booking_create";
  query: string;
  targetPhone?: string;
  targetPayment?: {
    amountPence: number;
    method?: "cash" | "bank" | "card" | "unknown";
    note?: string;
  };
  targetJob?: {
    title: string;
    totalPence: number;
    depositPence?: number;
    dueDate?: Date;
    notes?: string;
  };
  targetBooking?: {
    startsAt: Date;
    title?: string;
    notes?: string;
  };
}): Promise<
  | { status: "customer"; customer: { id: string; name: string; phone: string | null } }
  | { status: "reply"; routed: RoutedMessage }
> => {
  const resolution = await resolveCustomerByQuery({
    userId: input.userId,
    query: input.query
  });

  if (resolution.status === "not_found") {
    return {
      status: "reply",
      routed: { reply: adminReply(`Customer not found: "${resolution.query}".`) }
    };
  }

  if (resolution.status === "ambiguous") {
    conversationMemory.clearPendingFlow(input.phone);
    conversationMemory.setLastResolvedCandidates(
      input.phone,
      resolution.candidates.map((candidate) => ({
        id: candidate.id,
        label: candidate.name,
        score: candidate.score
      }))
    );
    conversationMemory.setPendingCustomerDisambiguation(input.phone, {
      action: input.action,
      query: resolution.query,
      targetPhone: input.targetPhone,
      targetPayment: input.targetPayment,
      targetJob: input.targetJob,
      targetBooking: input.targetBooking,
      candidates: resolution.candidates
    });
    return {
      status: "reply",
      routed: {
        reply: createCustomerDisambiguationReply({
          action: input.action,
          query: resolution.query,
          candidates: resolution.candidates
        })
      }
    };
  }

  conversationMemory.setLastResolvedCandidates(input.phone, [
    {
      id: resolution.customer.id,
      label: resolution.customer.name
    }
  ]);
  await agentLearningService.recordCustomerAlias({
    userId: input.userId,
    phrase: input.query,
    customerId: resolution.customer.id,
    customerName: resolution.customer.name,
    source: "successful_resolution",
    confidence: 0.66
  });

  return {
    status: "customer",
    customer: {
      id: resolution.customer.id,
      name: resolution.customer.name,
      phone: resolution.customer.phone
    }
  };
};

const resolveVendorOrReply = async (input: {
  userId: string;
  phone: string;
  action: "vendor_payment_add" | "export_vendor_pdf";
  query: string;
  targetPayment?: {
    amountPence: number;
    note?: string;
  };
}): Promise<
  | { status: "vendor"; vendor: { id: string; vendorName: string; balancePence: number } }
  | { status: "reply"; routed: RoutedMessage }
> => {
  const resolution = await resolveVendorByQuery({
    userId: input.userId,
    query: input.query
  });

  if (resolution.status === "not_found") {
    return {
      status: "reply",
      routed: { reply: adminReply(`Vendor not found: "${resolution.query}".`) }
    };
  }

  if (resolution.status === "ambiguous") {
    conversationMemory.setPendingVendorDisambiguation(input.phone, {
      action: input.action,
      query: resolution.query,
      targetPayment: input.targetPayment,
      candidates: resolution.candidates
    });

    return {
      status: "reply",
      routed: {
        reply: createVendorDisambiguationReply({
          query: resolution.query,
          action: input.action,
          candidates: resolution.candidates
        })
      }
    };
  }

  return {
    status: "vendor",
    vendor: resolution.vendor
  };
};

const resolveJobOrReply = async (input: {
  userId: string;
  phone: string;
  action: "add_payment" | "close_job";
  query: string;
  targetPayment?: {
    amountPence: number;
    method?: "cash" | "bank" | "card" | "unknown";
    note?: string;
  };
  outstandingOnly?: boolean;
}): Promise<
  | { status: "job"; job: { id: string; title: string; customerName: string; outstandingPence: number; dueDate: Date | null } }
  | { status: "reply"; routed: RoutedMessage }
> => {
  const resolution = await resolveJobQuery({
    userId: input.userId,
    query: input.query,
    outstandingOnly: input.outstandingOnly
  });

  if (resolution.status === "not_found") {
    return {
      status: "reply",
      routed: { reply: adminReply(`Job not found: "${resolution.query}".`) }
    };
  }

  if (resolution.status === "ambiguous") {
    conversationMemory.setPendingJobDisambiguation(input.phone, {
      action: input.action,
      query: resolution.query,
      targetPayment: input.targetPayment,
      candidates: resolution.candidates
    });
    conversationMemory.setLastResolvedCandidates(
      input.phone,
      resolution.candidates.map((candidate) => ({
        id: candidate.id,
        label: `${candidate.customerName}: ${candidate.title}`,
        score: candidate.score
      }))
    );
    return {
      status: "reply",
      routed: {
        reply: createJobDisambiguationReply({
          query: resolution.query,
          action: input.action,
          candidates: resolution.candidates
        })
      }
    };
  }

  conversationMemory.setLastResolvedCandidates(input.phone, [
    {
      id: resolution.job.id,
      label: `${resolution.job.customerName}: ${resolution.job.title}`
    }
  ]);

  return {
    status: "job",
    job: {
      id: resolution.job.id,
      title: resolution.job.title,
      customerName: resolution.job.customerName,
      outstandingPence: resolution.job.outstandingPence,
      dueDate: resolution.job.dueDate
    }
  };
};

const executeIntent = async (input: {
  intent: ParsedIntent;
  phone: string;
  userId: string;
  businessName: string;
  requestId: string;
  normalizedText: string;
  rawText: string;
}): Promise<RoutedMessage> => {
  const { intent, phone, userId, businessName, requestId, normalizedText, rawText } = input;

  if (intent.type === "help") {
    return {
      reply: guideReply(buildCommandGuide({ registered: true, lastIntent: conversationMemory.get(phone).lastIntent }))
    };
  }

  if (intent.type === "greeting") {
    const boundedReply = await buildBoundedAssistantReply({
      message: rawText,
      businessName,
      registered: true,
      context: conversationMemory.getAgentParseContext(phone)
    });

    return {
      reply:
        boundedReply ||
        adminReply(
          `Hi, this is your admin assistant for ${businessName}.`,
          "How can I help today with jobs, payments, or outstanding balances?"
        )
    };
  }

  if (intent.type === "customer_create") {
    const created = await customersService.upsertByPhoneOrName({
      userId,
      name: intent.name,
      phone: intent.phone
    });

    conversationMemory.updateRecentCustomer(phone, {
      customerId: created.id,
      customerName: created.name
    });

    return {
      reply: adminReply(
        `Customer saved: ${created.name}${created.phone ? ` (${created.phone})` : ""}.`
      )
    };
  }

  if (intent.type === "booking_create") {
    const customerResolution = await resolveCustomerOrReply({
      userId,
      phone,
      action: "booking_create",
      query: intent.customerName,
      targetBooking: {
        startsAt: intent.startsAt,
        title: intent.title,
        notes: intent.notes
      }
    });

    if (customerResolution.status === "reply") {
      return customerResolution.routed;
    }

    const created = await bookingsService.createBookingForCustomerId({
      userId,
      customerId: customerResolution.customer.id,
      startsAt: intent.startsAt,
      title: intent.title,
      notes: intent.notes
    });

    conversationMemory.updateRecentCustomer(phone, {
      customerId: created.customer.id,
      customerName: created.customer.name
    });

    return {
      reply: adminReply(
        `Booking saved for ${created.customer.name} on ${created.booking.startsAt.toISOString().slice(0, 16).replace("T", " ")}.`
      )
    };
  }

  if (intent.type === "job_create") {
    let created;
    if (!intent.customerPhone) {
      const customerResolution = await resolveCustomerOrReply({
        userId,
        phone,
        action: "job_create",
        query: intent.customerName,
        targetJob: {
          title: intent.title,
          totalPence: intent.totalPence,
          depositPence: intent.depositPence,
          dueDate: intent.dueDate,
          notes: intent.notes
        }
      });

      if (customerResolution.status === "reply") {
        return customerResolution.routed;
      }

      created = await jobsService.createJobForCustomerId({
        userId,
        customerId: customerResolution.customer.id,
        title: intent.title,
        priceTotalPence: intent.totalPence,
        depositPence: intent.depositPence,
        dueDate: intent.dueDate,
        notes: intent.notes
      });
    } else {
      const args = CreateJobToolSchema.parse({
        customerName: intent.customerName,
        customerPhone: intent.customerPhone,
        title: intent.title,
        totalPence: intent.totalPence,
        depositPence: intent.depositPence,
        dueDate: intent.dueDate,
        notes: intent.notes
      });
      created = await toolExecutor.createJob(userId, args);
    }

    await toolExecutor.scheduleReminders(userId, created.job.id, created.job.dueDate);
    emitAgentEvent("tool.execute", requestId, { tool: "create_job", ok: true });

      conversationMemory.updateRecent(phone, {
        customerName: created.customer.name,
        jobId: created.job.id,
        jobTitle: created.job.title
      });
      conversationMemory.setPendingReplyDraft(
        phone,
        buildJobReminderDraft({
          customerName: created.customer.name,
          jobTitle: created.job.title,
          dueDate: created.job.dueDate
        })
      );

      const outstandingPence = Math.max(intent.totalPence - (intent.depositPence ?? 0), 0);

    return {
      reply: adminReply(
        `Job logged for ${created.customer.name}: ${created.job.title}. Outstanding ${penceToPounds(outstandingPence)}.`,
        "Want me to draft a reminder message?"
      )
    };
  }

  if (intent.type === "payment_add") {
    const ctx = conversationMemory.get(phone);
    const directJobIdLooksConcrete = Boolean(intent.jobId && /^[a-z0-9-]{8,}$/i.test(intent.jobId));
    let jobId = directJobIdLooksConcrete ? intent.jobId : ctx.lastJobId;
    const customerName = intent.customerName || ctx.lastCustomerName;
    const rawJobQuery = !directJobIdLooksConcrete
      ? intent.jobId || extractLikelyJobQuery(rawText)
      : extractLikelyJobQuery(rawText);

    if (!jobId && customerName) {
      const customerResolution = await resolveCustomerOrReply({
        userId,
        phone,
        action: "add_payment",
        query: customerName,
        targetPayment: {
          amountPence: intent.amountPence,
          method: intent.method,
          note: intent.note
        }
      });

      if (customerResolution.status === "reply") {
        return customerResolution.routed;
      }

      conversationMemory.updateRecentCustomer(phone, {
        customerId: customerResolution.customer.id,
        customerName: customerResolution.customer.name
      });

      const jobs = await jobsService.findOutstandingJobsByCustomerId({
        userId,
        customerId: customerResolution.customer.id
      });

      if (jobs.length === 1) {
        jobId = jobs[0].id;
      } else if (jobs.length > 1) {
        const top = jobs.slice(0, 3);
        const options = top
          .map((job) => `${job.id.slice(0, 8)} ${job.title} (${penceToPounds(job.outstandingPence)})`)
          .join(" | ");
        return {
          reply: adminReply(
            `I found multiple outstanding jobs for ${customerName}.`,
            `Please pay with job ID. Options: ${options}`
          )
        };
      } else {
        return {
          reply: adminReply(`No outstanding job found for ${customerResolution.customer.name}.`)
        };
      }
    }

    if (!intent.jobId && !jobId && rawJobQuery) {
      const jobResolution = await resolveJobOrReply({
        userId,
        phone,
        action: "add_payment",
        query: rawJobQuery,
        outstandingOnly: true,
        targetPayment: {
          amountPence: intent.amountPence,
          method: intent.method,
          note: intent.note
        }
      });

      if (jobResolution.status === "reply") {
        return jobResolution.routed;
      }

      jobId = jobResolution.job.id;
    }

    if (!jobId) {
      return {
        reply: adminReply("I could not find a target job for this payment.", "Please send job ID or customer name.")
      };
    }

    try {
      const args = AddPaymentToolSchema.parse({
        jobId,
        amountPence: intent.amountPence,
        method: intent.method,
        note: intent.note
      });
      const result = await toolExecutor.addPayment(userId, args);
      emitAgentEvent("tool.execute", requestId, { tool: "add_payment", ok: true });

      conversationMemory.updateRecent(phone, {
        jobId,
        customerName,
        jobTitle: rawJobQuery ?? undefined
      });
      conversationMemory.setPendingReplyDraft(
        phone,
        buildPaymentFollowUpDraft({
          customerName,
          outstandingPence: result.outstandingPence,
          jobTitle: rawJobQuery ?? undefined
        })
      );

      return {
        reply: adminReply(
          `Payment recorded ${penceToPounds(result.payment.amountPence)}. Remaining balance ${penceToPounds(result.outstandingPence)}.`,
          "Need me to send a polite payment follow-up draft?"
        )
      };
    } catch (error) {
      emitAgentEvent("tool.execute", requestId, { tool: "add_payment", ok: false });
      const message = error instanceof Error ? error.message : "";
      if (message.includes("exceeds outstanding balance")) {
        const penceMatch = message.match(/\((\d+)\s+pence\)/);
        const remainingPence = penceMatch ? Number(penceMatch[1]) : null;
        return {
          reply: adminReply(
            remainingPence !== null
              ? `Payment is higher than remaining balance (${penceToPounds(remainingPence)}).`
              : "Payment is higher than remaining balance."
          )
        };
      }
      if (message.includes("no outstanding balance")) {
        return {
          reply: adminReply("That job has no remaining balance.", "Please choose another job.")
        };
      }
      return {
        reply: adminReply("Payment was not saved.", "Please check the job ID and amount.")
      };
    }
  }

  if (intent.type === "payment_list") {
    const payments = await paymentsService.listPayments({
      userId,
      range: intent.range,
      take: 20
    });

    if (payments.length === 0) {
      return {
        reply: adminReply("No payments found for that period.")
      };
    }

    const lines = payments
      .map((payment) => {
        const customerName = payment.job.customer?.name ?? "Unknown customer";
        return `${customerName}: ${penceToPounds(payment.amountPence)} on ${payment.paidAt.toISOString().slice(0, 10)}`;
      });

    return {
      reply: detailedReply(`Payments ${payments.length}:`, ...lines)
    };
  }

  if (intent.type === "job_list_active") {
    const jobs = await toolExecutor.listActiveJobs(userId);
    emitAgentEvent("tool.execute", requestId, { tool: "list_active_jobs", ok: true, count: jobs.length });

    if (jobs.length === 0) {
      return { reply: adminReply("No active jobs at the moment.") };
    }

    const lines = jobs.map(
      (job, index) =>
        `${index + 1}. ${job.customerName}: ${job.title} (${penceToPounds(job.outstandingPence)}, ${compactDate(job.dueDate)})`
    );
    return { reply: detailedReply(`Active jobs ${jobs.length}:`, ...lines) };
  }

  if (intent.type === "job_list_due_week") {
    const jobs = await jobsService.listDueThisWeekJobs(userId);
    emitAgentEvent("tool.execute", requestId, { tool: "list_due_week_jobs", ok: true, count: jobs.length });

    if (jobs.length === 0) {
      return { reply: adminReply("Nothing due in the next 7 days.") };
    }

    const lines = jobs.map(
      (job, index) => `${index + 1}. ${job.customerName}: ${job.title} (${compactDate(job.dueDate)})`
    );

    return { reply: detailedReply(`Due this week ${jobs.length}:`, ...lines) };
  }

  if (intent.type === "job_list_last_30") {
    const jobs = await jobsService.listJobsCreatedLast30Days(userId);
    emitAgentEvent("tool.execute", requestId, { tool: "list_last_30_jobs", ok: true, count: jobs.length });

    if (jobs.length === 0) {
      return { reply: adminReply("No jobs created in the last 30 days.") };
    }

    const completed = jobs.filter((job) => job.status === "completed").length;
    const active = jobs.filter((job) => job.status === "active").length;

    return {
      reply: adminReply(`Last 30 days: ${jobs.length} jobs. Active ${active}. Completed ${completed}.`)
    };
  }

  if (intent.type === "job_close") {
    const directJobIdLooksConcrete = /^[a-z0-9-]{8,}$/i.test(intent.jobId);
    let resolvedJobId = directJobIdLooksConcrete ? intent.jobId : undefined;
    const rawJobQuery = !directJobIdLooksConcrete ? intent.jobId || extractLikelyJobQuery(rawText) : extractLikelyJobQuery(rawText);

    if (rawJobQuery) {
      const jobResolution = await resolveJobOrReply({
        userId,
        phone,
        action: "close_job",
        query: rawJobQuery
      });

      if (jobResolution.status === "reply") {
        return jobResolution.routed;
      }

      resolvedJobId = jobResolution.job.id;
    }

    const args = CloseJobToolSchema.parse({ jobId: resolvedJobId });
    const closed = await toolExecutor.closeJob(userId, args.jobId);
    emitAgentEvent("tool.execute", requestId, { tool: "close_job", ok: Boolean(closed) });

    if (!closed) {
      return { reply: adminReply("I could not find that job.", "Please re-check job ID.") };
    }

    conversationMemory.updateRecent(phone, {
      jobId: closed.id,
      jobTitle: closed.title
    });

    return { reply: adminReply(`Job closed: ${closed.title}.`) };
  }

  if (intent.type === "job_set_status") {
    const directJobIdLooksConcrete = /^[a-z0-9-]{8,}$/i.test(intent.jobId);
    let resolvedJobId = directJobIdLooksConcrete ? intent.jobId : undefined;
    const rawJobQuery = !directJobIdLooksConcrete ? intent.jobId || extractLikelyJobQuery(rawText) : extractLikelyJobQuery(rawText);

    if (rawJobQuery) {
      const jobResolution = await resolveJobOrReply({
        userId,
        phone,
        action: "close_job",
        query: rawJobQuery
      });

      if (jobResolution.status === "reply") {
        return jobResolution.routed;
      }

      resolvedJobId = jobResolution.job.id;
    }

    if (!resolvedJobId) {
      return { reply: adminReply("I could not find that job.", "Please re-check the job name.") };
    }

    const updated = await jobsService.updateJobStatus({
      userId,
      jobId: resolvedJobId,
      status: intent.status
    });

    if (!updated) {
      return { reply: adminReply("I could not update that job.", "Please re-check the job name.") };
    }

    conversationMemory.updateRecent(phone, {
      jobId: updated.id,
      jobTitle: updated.title
    });

    return {
      reply: adminReply(`Job updated: ${updated.title} is now ${intent.status}.`)
    };
  }

  if (intent.type === "job_close_customer") {
    const resolution = await resolveCustomerOrReply({
      userId,
      phone,
      action: "close_jobs",
      query: intent.customerQuery
    });

    if (resolution.status === "reply") {
      return resolution.routed;
    }

    const closedCount = await jobsService.closeActiveJobsByCustomerId({
      userId,
      customerId: resolution.customer.id
    });

    if (closedCount === 0) {
      return {
        reply: adminReply(`No active jobs found for ${resolution.customer.name}.`)
      };
    }

    conversationMemory.updateRecentCustomer(phone, {
      customerId: resolution.customer.id,
      customerName: resolution.customer.name
    });

    return {
      reply: adminReply(`Closed ${closedCount} active job(s) for ${resolution.customer.name}.`)
    };
  }

  if (intent.type === "outstanding_list") {
    const jobs = await toolExecutor.listOutstanding(userId);
    emitAgentEvent("tool.execute", requestId, { tool: "list_outstanding", ok: true, count: jobs.length });

    if (jobs.length === 0) {
      return { reply: adminReply("Great news. No outstanding balances.") };
    }

    const total = jobs.reduce((sum, job) => sum + job.outstandingPence, 0);
    const lines = jobs.map(
      (job, index) => `${index + 1}. ${job.customerName} ${penceToPounds(job.outstandingPence)}`
    );

    return {
      reply: detailedReply(
        `Outstanding total ${penceToPounds(total)} across ${jobs.length} jobs:`,
        ...lines,
        "Want me to draft a reminder for one of them?"
      )
    };
  }

  if (intent.type === "customer_find") {
    const args = FindCustomerToolSchema.parse({ query: intent.query });
    const resolution = await resolveCustomerOrReply({
      userId,
      phone,
      action: "customer_find",
      query: args.query
    });

    if (resolution.status === "reply") {
      return resolution.routed;
    }

    const record = await customersService.findRecordByCustomerId({
      userId,
      customerId: resolution.customer.id
    });

    if (!record) {
      return {
        reply: adminReply(`Customer not found: "${args.query}".`)
      };
    }

    const records = [record];
    emitAgentEvent("tool.execute", requestId, {
      tool: "find_customer_records",
      ok: true,
      query: args.query,
      count: records.length
    });

    conversationMemory.updateRecent(phone, {
      customerName: records[0].name
    });
    conversationMemory.updateRecentCustomer(phone, {
      customerId: records[0].id,
      customerName: records[0].name
    });

    return { reply: formatCustomerRecordsReply(records) };
  }

  if (intent.type === "customer_update_phone") {
    const normalizedPhone = customersService.normalizePhone(intent.phone);
    if (!normalizedPhone) {
      return {
        reply: adminReply(
          "I could not validate that phone number.",
          "Use format like +447700900123."
        )
      };
    }

    const resolved = await resolveCustomerOrReply({
      userId,
      phone,
      action: "update_customer_phone",
      query: intent.customerQuery,
      targetPhone: normalizedPhone
    });

    if (resolved.status === "reply") {
      return resolved.routed;
    }

    try {
      const updated = await customersService.updateCustomerPhone({
        userId,
        customerId: resolved.customer.id,
        phone: normalizedPhone
      });

      conversationMemory.updateRecentCustomer(phone, {
        customerId: updated.id,
        customerName: updated.name
      });

      emitAgentEvent("tool.execute", requestId, {
        tool: "update_customer_phone",
        ok: true,
        customerId: updated.id
      });

      return {
        reply: adminReply(`Updated ${updated.name} phone to ${updated.phone ?? normalizedPhone}.`)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("unique constraint")) {
        return {
          reply: adminReply("That phone number is already used by another customer.")
        };
      }

      return {
        reply: adminReply("I could not update the phone number right now.")
      };
    }
  }

  if (intent.type === "briefing_toggle") {
    const args = ToggleBriefingToolSchema.parse({ enabled: intent.enabled });
    await toolExecutor.toggleBriefing(userId, args.enabled);
    emitAgentEvent("tool.execute", requestId, { tool: "toggle_briefing", ok: true, enabled: args.enabled });

    return {
      reply: adminReply(intent.enabled ? "Morning briefing is now enabled." : "Morning briefing is now paused.")
    };
  }

  if (
    intent.type === "summary_today" ||
    intent.type === "summary_yesterday" ||
    intent.type === "summary_7" ||
    intent.type === "summary_30"
  ) {
    const period =
      intent.type === "summary_today"
        ? "today"
        : intent.type === "summary_yesterday"
          ? "yesterday"
          : intent.type === "summary_30"
            ? "30d"
            : "7d";
    const args = SummaryToolSchema.parse({ period });
    const summary = await toolExecutor.getSummary(userId, args.period);
    emitAgentEvent("tool.execute", requestId, { tool: "get_summary", ok: true, period: args.period });

    const label =
      args.period === "today"
        ? "Today"
        : args.period === "yesterday"
          ? "Yesterday"
          : args.period === "30d"
            ? "30d"
            : "7d";

    return {
      reply: adminReply(
        `${label} summary: created ${summary.jobsCreated}, completed ${summary.jobsCompleted}, revenue ${penceToPounds(summary.revenuePence)}, paid ${penceToPounds(summary.paymentsReceivedPence)}, spent ${penceToPounds(summary.expensesPaidPence)}, outstanding ${penceToPounds(summary.outstandingPence)}.`
      )
    };
  }

  if (intent.type === "expense_list") {
    const txs = await vendorPaymentsService.listMoneyTransactions(userId);
    const expenses = txs.filter((tx: { kind: string }) => tx.kind === "expense_paid").slice(0, 10);

    if (!expenses.length) {
      return {
        reply: adminReply("No expenses recorded yet.")
      };
    }

    const totalPence = expenses.reduce(
      (sum: number, tx: { amountPence: number }) => sum + tx.amountPence,
      0
    );

    const lines = expenses.map(
      (
        tx: {
          amountPence: number;
          vendor?: { vendorName: string } | null;
          counterpartyName?: string | null;
          note?: string | null;
          occurredAt: Date;
        },
        index: number
      ) =>
        `${index + 1}. ${penceToPounds(tx.amountPence)} | ${tx.vendor?.vendorName ?? tx.counterpartyName ?? "-"} | ${tx.note ?? "-"} | ${compactDate(tx.occurredAt)}`
    );

    return {
      reply: detailedReply(
        `Recent expenses (${expenses.length}), total ${penceToPounds(totalPence)}:`,
        ...lines
      )
    };
  }

  if (intent.type === "expense_add") {
    await vendorPaymentsService.addExpensePaid({
      userId,
      amountPence: intent.amountPence,
      note: intent.note,
      counterpartyName: intent.counterpartyName
    });

    return {
      reply: adminReply(
        `Expense logged: ${penceToPounds(intent.amountPence)}${intent.counterpartyName ? ` at ${intent.counterpartyName}` : ""}.`
      )
    };
  }

  if (intent.type === "expense_add_batch") {
    for (const item of intent.items) {
      await vendorPaymentsService.addExpensePaid({
        userId,
        amountPence: item.amountPence,
        note: item.note,
        counterpartyName: item.counterpartyName
      });
    }

    const totalPence = intent.items.reduce((sum, item) => sum + item.amountPence, 0);
    const summary = intent.items
      .slice(0, 3)
      .map((item) => `${penceToPounds(item.amountPence)} ${item.note ? `for ${item.note}` : ""}`.trim())
      .join(" | ");
    const suffix = intent.items.length > 3 ? ` +${intent.items.length - 3} more.` : "";

    return {
      reply: adminReply(
        `Logged ${intent.items.length} expenses, total ${penceToPounds(totalPence)}.`,
        `${summary}.${suffix}`
      )
    };
  }

  if (intent.type === "vendor_debt_add") {
    const ledger = await vendorPaymentsService.addVendorDebt({
      userId,
      vendorName: intent.vendorQuery,
      amountPence: intent.amountPence,
      note: intent.note
    });

    return {
      reply: adminReply(
        `Debt added: ${penceToPounds(intent.amountPence)} to ${ledger.vendorName}. Vendor balance ${penceToPounds(ledger.balancePence)}.`
      )
    };
  }

  if (intent.type === "vendor_payment_add") {
    const resolved = await resolveVendorOrReply({
      userId,
      phone,
      action: "vendor_payment_add",
      query: intent.vendorQuery,
      targetPayment: {
        amountPence: intent.amountPence,
        note: intent.note
      }
    });

    if (resolved.status === "reply") {
      return resolved.routed;
    }

    try {
      const ledger = await vendorPaymentsService.addVendorPaymentByVendorId({
        userId,
        vendorId: resolved.vendor.id,
        amountPence: intent.amountPence,
        note: intent.note
      });

      return {
        reply: adminReply(
          `Payment recorded: ${penceToPounds(intent.amountPence)} to ${ledger.vendorName}. Remaining vendor balance ${penceToPounds(ledger.balancePence)}.`
        )
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("exceeds vendor balance")) {
        return { reply: adminReply("Payment is higher than vendor outstanding balance.") };
      }
      if (message.includes("no outstanding balance")) {
        return { reply: adminReply("That vendor has no outstanding balance.") };
      }
      return { reply: adminReply("Vendor payment could not be saved.") };
    }
  }

  if (intent.type === "vendor_summary") {
    const summary = await vendorPaymentsService.getSummary({
      userId,
      days: intent.days
    });

    return {
      reply: adminReply(
        `Vendor ${summary.days}d: outstanding ${penceToPounds(summary.vendorOutstandingPence)}, expenses ${penceToPounds(summary.expensePaidPence)}, debts added ${penceToPounds(summary.vendorDebtAddedPence)}, vendor payments ${penceToPounds(summary.vendorPaymentPence)}.`
      )
    };
  }

  if (intent.type === "export_data") {
      const customerQuery = resolvePdfCustomerQuery({
      explicitCustomerQuery: undefined,
      normalizedText,
      rawText,
      phone
    });
    let resolvedCustomer:
      | { id: string; name: string; phone: string | null }
      | undefined;
    if (customerQuery) {
      const resolved = await resolveCustomerOrReply({
        userId,
        phone,
        action: "export_pdf",
        query: customerQuery
      });
      if (resolved.status === "reply") {
        return resolved.routed;
      }
      resolvedCustomer = resolved.customer;
    }

    const link = await toolExecutor.createPdfExportLink(
      userId,
      resolvedCustomer
        ? { customerQuery: resolvedCustomer.name, customerId: resolvedCustomer.id }
        : undefined
    );
    emitAgentEvent("tool.execute", requestId, {
      tool: "create_pdf_export_link",
      ok: true,
      legacyIntent: true,
      customerQuery: resolvedCustomer ? resolvedCustomer.name : null
    });

    if (resolvedCustomer) {
      conversationMemory.updateRecentCustomer(phone, {
        customerId: resolvedCustomer.id,
        customerName: resolvedCustomer.name
      });
    }

    return {
      reply: resolvedCustomer
        ? adminReply(`Customer report PDF is ready for "${resolvedCustomer.name}". Sending now.`)
        : adminReply("Full records PDF is ready. Sending now."),
      mediaUrl: link
    };
  }

  if (intent.type === "export_pdf") {
    const customerQuery = resolvePdfCustomerQuery({
      explicitCustomerQuery: intent.customerQuery,
      normalizedText,
      rawText,
      phone
    });
    let resolvedCustomer:
      | { id: string; name: string; phone: string | null }
      | undefined;
    if (customerQuery) {
      const resolved = await resolveCustomerOrReply({
        userId,
        phone,
        action: "export_pdf",
        query: customerQuery
      });
      if (resolved.status === "reply") {
        return resolved.routed;
      }
      resolvedCustomer = resolved.customer;
    }

    const link = await toolExecutor.createPdfExportLink(
      userId,
      resolvedCustomer
        ? { customerQuery: resolvedCustomer.name, customerId: resolvedCustomer.id }
        : undefined
    );
    emitAgentEvent("tool.execute", requestId, {
      tool: "create_pdf_export_link",
      ok: true,
      customerQuery: resolvedCustomer ? resolvedCustomer.name : null
    });

    if (resolvedCustomer) {
      conversationMemory.updateRecentCustomer(phone, {
        customerId: resolvedCustomer.id,
        customerName: resolvedCustomer.name
      });
    }

    return {
      reply: resolvedCustomer
        ? adminReply(`Customer report PDF is ready for "${resolvedCustomer.name}". Sending now.`)
        : adminReply("Full records PDF is ready. Sending now."),
      mediaUrl: link
    };
  }

  if (intent.type === "invoice_create") {
    const customerQuery = intent.customerQuery?.trim() || conversationMemory.get(phone).lastCustomerName;
    if (!customerQuery) {
      return {
        reply: adminReply("Please specify customer for invoice.", "Example: create John invoice")
      };
    }

    const resolved = await resolveCustomerOrReply({
      userId,
      phone,
      action: "invoice_pdf",
      query: customerQuery
    });

    if (resolved.status === "reply") {
      return resolved.routed;
    }

    const token = exportService.createInvoicePdfAccessToken({
      userId,
      customerId: resolved.customer.id,
      customerQuery: resolved.customer.name,
      expiresInMinutes: 30
    });
    const link = exportService.createPdfDownloadLink(token);

    conversationMemory.updateRecentCustomer(phone, {
      customerId: resolved.customer.id,
      customerName: resolved.customer.name
    });

    return {
      reply: adminReply(`Invoice PDF is ready for "${resolved.customer.name}". Sending now.`),
      mediaUrl: link
    };
  }

  if (intent.type === "export_vendor_pdf") {
    let resolvedVendor:
      | { id: string; vendorName: string; balancePence: number }
      | undefined;
    if (intent.vendorQuery) {
      const resolved = await resolveVendorOrReply({
        userId,
        phone,
        action: "export_vendor_pdf",
        query: intent.vendorQuery
      });

      if (resolved.status === "reply") {
        return resolved.routed;
      }

      resolvedVendor = resolved.vendor;
    }

    const token = exportService.createVendorPdfAccessToken({
      userId,
      vendorQuery: resolvedVendor?.vendorName ?? intent.vendorQuery,
      vendorId: resolvedVendor?.id,
      expiresInMinutes: 30
    });
    const link = exportService.createPdfDownloadLink(token);

    return {
      reply: resolvedVendor || intent.vendorQuery
        ? adminReply(
            `Vendor report PDF is ready for "${resolvedVendor?.vendorName ?? intent.vendorQuery}". Sending now.`
          )
        : adminReply("Vendor report PDF is ready. Sending now."),
      mediaUrl: link
    };
  }

  if (intent.type === "export_expense_pdf") {
    const token = exportService.createExpensePdfAccessToken({
      userId,
      expiresInMinutes: 30
    });
    const link = exportService.createPdfDownloadLink(token);

    return {
      reply: adminReply("Expense records PDF is ready. Sending now."),
      mediaUrl: link
    };
  }

  if (intent.type === "subscribe") {
    if (!subscriptionService.isBillingEnabled()) {
      return {
        reply: adminReply("Subscriptions are not active yet.", "You currently have full free access.")
      };
    }

    const checkoutLink = await toolExecutor.subscribe(userId);

    if (!checkoutLink) {
      return {
        reply: adminReply("Subscription checkout is temporarily unavailable.")
      };
    }

    return {
      reply: adminReply(`Subscribe here: ${checkoutLink}`)
    };
  }

  if (intent.type === "onboarding_submit") {
    return {
      reply: adminReply(`You are already registered as ${businessName}.`)
    };
  }

  return {
    reply: guideReply(
      "I did not fully understand that request.",
      buildCommandGuide({ registered: true, lastIntent: conversationMemory.get(phone).lastIntent })
    )
  };
};

export const routeIncomingMessage = async (message: IncomingMessage): Promise<RoutedMessage> => {
  const body = message.body.trim();
  const requestId = createAgentRequestId();

  if (!body) {
    return { reply: adminReply("Please send a message and I will help.") };
  }

  const user = await usersService.findByPhone(message.from);
  if (!user) {
    return shouldReplyToUnregisteredPhone(message.from)
      ? { reply: buildRegistrationReply() }
      : { reply: "" };
  }

  const previousParseDecision = conversationMemory.getLastParseDecision(message.from);
  let parseContext = mergeParseContexts(
    conversationMemory.getAgentParseContext(message.from),
    await agentLearningService.getLearnedParseContext(user.id)
  );
  const selectedFlow = selectAgentFlow(env.USE_AGENT_FIRST_ORCHESTRATION === true);
  let bodyForInterpretation = body;
  let parseResult:
    | Awaited<ReturnType<typeof parseWithAgentLayer>>
    | null = null;

  parseResult = tryResolvePriorityPendingVendorDebtFollowUp(body, parseContext);

  const planTodayExecutor =
    selectedFlow === "agent_first"
      ? buildPlanTodayToolExecutor({
          getTodayPlan: ({ timezone }) =>
            remindersService.buildTodayPlan({
              userId: user.id,
              timezone: timezone || user.timezone || env.APP_TZ
            })
        })
      : undefined;
  if (selectedFlow === "agent_first" && !parseResult) {
    const dialogResult = await manageDialogTurn({
      message: body,
      context: parseContext
    });

    if (dialogResult.status === "reply") {
      return {
        reply: assistantReply(dialogResult.reply)
      };
    }

    if (dialogResult.status === "continue") {
      bodyForInterpretation = dialogResult.message;
      if (dialogResult.clearPendingFlow) {
        conversationMemory.clearPendingFlow(message.from);
        parseContext = {
          ...parseContext,
          pendingFlow: undefined
        };
      }
    }

    if (dialogResult.status === "pending_resolution") {
      if (dialogResult.clearPendingFlow) {
        conversationMemory.clearPendingFlow(message.from);
      }

      if (dialogResult.missingFields.length > 0) {
        const clarification = buildSemanticClarification({
          capability: dialogResult.capability,
          entities: dialogResult.entities,
          missingOrAmbiguous: dialogResult.missingFields
        });
        const question = dialogResult.question || clarification.question;
        if (clarification.analysis.intent !== "unknown") {
          conversationMemory.setPendingFlow(message.from, {
            intent: clarification.analysis.intent,
            entities: clarification.analysis.entities,
            missingFields: clarification.analysis.missingFields,
            followUpQuestion: question
          });
          conversationMemory.updateLastIntent(message.from, clarification.analysis.intent);
        }

        return {
          reply: assistantReply(question)
        };
      }

      const resolution = await resolveSemanticCapability({
        userId: user.id,
        capability: dialogResult.capability,
        entities: dialogResult.entities,
        confidence: 0.9
      });

      if (resolution.status === "clarification") {
        if (resolution.analysis.intent !== "unknown") {
          conversationMemory.setPendingFlow(message.from, {
            intent: resolution.analysis.intent,
            entities: resolution.analysis.entities,
            missingFields: resolution.analysis.missingFields,
            followUpQuestion: resolution.analysis.followUpQuestion
          });
          conversationMemory.updateLastIntent(message.from, resolution.analysis.intent);
        }

        return {
          reply: assistantReply(dialogResult.question || resolution.question)
        };
      }

      if (resolution.intent) {
        parseResult = {
          status: "intent",
          intent: resolution.intent,
          confidence: 0.9,
          source: "llm",
          needsConfirmation: false,
          normalizedText: bodyForInterpretation,
          analysis: resolution.analysis
        };
      }
    }
  }
  const semanticResult =
    selectedFlow === "agent_first" && !parseResult
      ? await interpretWithSemanticAgent({
          message: bodyForInterpretation,
          context: parseContext
        })
      : null;

  if (selectedFlow === "agent_first") {
    emitAgentEvent("agent.flow.selected", requestId, {
      from: message.from,
      messageSid: message.messageSid,
      flow: "agent_first",
      resultStatus: semanticResult?.status ?? "unknown"
    });
  }

  if (semanticResult?.status === "response") {
    return {
      reply: assistantReply(semanticResult.reply)
    };
  }

  if (semanticResult?.status === "clarification") {
    if (semanticResult.analysis && semanticResult.analysis.intent !== "unknown") {
      conversationMemory.setPendingFlow(message.from, {
        intent: semanticResult.analysis.intent,
        entities: semanticResult.analysis.entities,
        missingFields: semanticResult.analysis.missingFields,
        followUpQuestion: semanticResult.analysis.followUpQuestion
      });
      conversationMemory.updateLastIntent(message.from, semanticResult.analysis.intent);
    }

    return {
      reply: assistantReply(semanticResult.question)
    };
  }

  parseResult =
    parseResult ??
    (selectedFlow === "agent_first" && env.AGENT_LEGACY_FALLBACK_ENABLED !== true
      ? null
      : await parseWithAgentLayer(bodyForInterpretation, parseContext));

  if (selectedFlow === "agent_first" && semanticResult?.status === "decision") {
    const resolution = await resolveSemanticCapability({
      userId: user.id,
      capability: semanticResult.decision.capability,
      entities: semanticResult.decision.entities,
      confidence: semanticResult.confidence
    });

    if (resolution.status === "clarification") {
      if (resolution.analysis.intent !== "unknown") {
        conversationMemory.setPendingFlow(message.from, {
          intent: resolution.analysis.intent,
          entities: resolution.analysis.entities,
          missingFields: resolution.analysis.missingFields,
          followUpQuestion: resolution.analysis.followUpQuestion
        });
        conversationMemory.updateLastIntent(message.from, resolution.analysis.intent);
      }

      return {
        reply: assistantReply(resolution.question)
      };
    }

    if (semanticResult.decision.capability === "plan_today") {
      const planTodayResult = planTodayExecutor
        ? await planTodayExecutor({ toolName: "planToday", toolInput: {} })
        : { status: "not_handled" as const };

      if (planTodayResult.status === "handled") {
        return {
          reply: planTodayResult.reply
        };
      }
    }

    if (resolution.intent) {
      parseResult = {
        status: "intent" as const,
        intent: resolution.intent,
        confidence: semanticResult.confidence,
        source: "llm" as const,
        needsConfirmation: false,
        normalizedText: bodyForInterpretation,
        analysis: resolution.analysis
      };
    } else if (env.AGENT_LEGACY_FALLBACK_ENABLED !== true) {
      parseResult = null;
    }
  }

  if (selectedFlow === "agent_first" && !parseResult) {
    const boundedReply = await buildBoundedAssistantReply({
      message: body,
      businessName: user.businessName,
      registered: true,
      context: conversationMemory.getAgentParseContext(message.from)
    });

    return boundedReply
      ? { reply: assistantReply(boundedReply) }
      : {
          reply: guideReply(
            buildCommandGuide({
              registered: true,
              lastIntent: conversationMemory.get(message.from).lastIntent
            })
          )
        };
  }
  const effectiveParseResult = parseResult!;

  emitAgentEvent("agent.parse.result", requestId, {
    from: message.from,
    messageSid: message.messageSid,
    flow: selectedFlow,
    status: effectiveParseResult.status,
    source: effectiveParseResult.status === "intent" ? effectiveParseResult.source : null,
    confidence: effectiveParseResult.status === "intent" ? effectiveParseResult.confidence : null,
    intentType: effectiveParseResult.status === "intent" ? effectiveParseResult.intent.type : null,
    normalizedText: effectiveParseResult.status === "intent" ? effectiveParseResult.normalizedText : null,
    agentIntent: effectiveParseResult.analysis?.intent ?? null,
    missingFields: effectiveParseResult.analysis?.missingFields ?? []
  });

  if (user) {
    await agentLearningService.logParseDecision({
      userId: user.id,
      phone: message.from,
      requestId,
      messageSid: message.messageSid,
      rawText: body,
      parseResult: effectiveParseResult
    });
  }

  const currentParseDecision = {
    status: effectiveParseResult.status,
    intentType: effectiveParseResult.status === "intent" ? effectiveParseResult.intent.type : undefined,
    analysisIntent: effectiveParseResult.analysis?.intent,
    confidence: effectiveParseResult.status === "intent" ? effectiveParseResult.confidence : undefined
  } as const;

  if (
    user &&
    previousParseDecision &&
    isExplicitCorrection(body) &&
    hasMaterialParseDifference(previousParseDecision, currentParseDecision)
  ) {
    await agentLearningService.recordExplicitCorrection({
      userId: user.id,
      phone: message.from,
      correctionText: body,
      previous: previousParseDecision,
      current: currentParseDecision
    });
  }

  conversationMemory.setLastParseDecision(message.from, {
    rawText: body,
    status: currentParseDecision.status,
    intentType: currentParseDecision.intentType,
    analysisIntent: currentParseDecision.analysisIntent,
    confidence: currentParseDecision.confidence
  });

  if (effectiveParseResult.status === "clarification") {
    if (effectiveParseResult.analysis && effectiveParseResult.analysis.intent !== "unknown") {
      conversationMemory.setPendingFlow(message.from, {
        intent: effectiveParseResult.analysis.intent,
        entities: effectiveParseResult.analysis.entities,
        missingFields: effectiveParseResult.analysis.missingFields,
        followUpQuestion: effectiveParseResult.analysis.followUpQuestion
      });
      conversationMemory.updateLastIntent(message.from, effectiveParseResult.analysis.intent);
    }
    return {
      reply: assistantReply(effectiveParseResult.question)
    };
  }

  if (user) {
    const pendingCustomerDisambiguation =
      conversationMemory.getPendingCustomerDisambiguation(message.from);
    if (pendingCustomerDisambiguation) {
      const selected = resolvePendingCustomerCandidate({
        message: body,
        candidates: pendingCustomerDisambiguation.candidates
      });

      if (!selected && isAllSelectionReply(body)) {
        if (pendingCustomerDisambiguation.action === "customer_find") {
          conversationMemory.clearPendingCustomerDisambiguation(message.from);
          const records = (
            await Promise.all(
              pendingCustomerDisambiguation.candidates.map((candidate) =>
                customersService.findRecordByCustomerId({
                  userId: user.id,
                  customerId: candidate.id
                })
              )
            )
          ).filter((record): record is NonNullable<typeof record> => Boolean(record));

          if (records.length > 0) {
            return {
              reply: formatCustomerRecordsReply(records)
            };
          }
        }

        if (pendingCustomerDisambiguation.action === "export_pdf") {
          conversationMemory.clearPendingCustomerDisambiguation(message.from);
          return {
            reply: adminReply(
              `I found several customers for "${pendingCustomerDisambiguation.query}".`,
              "Please pick one number for a single customer PDF, or say 'bring all records' for the full database."
            )
          };
        }
      }

      if (selected) {
        conversationMemory.clearPendingCustomerDisambiguation(message.from);
        conversationMemory.updateRecentCustomer(message.from, {
          customerId: selected.id,
          customerName: selected.name
        });
        await agentLearningService.recordCustomerAlias({
          userId: user.id,
          phrase: pendingCustomerDisambiguation.query,
          customerId: selected.id,
          customerName: selected.name,
          source: "disambiguation",
          confidence: 0.82
        });

        if (pendingCustomerDisambiguation.action === "update_customer_phone") {
          const targetPhone = pendingCustomerDisambiguation.targetPhone;
          if (!targetPhone) {
            return {
              reply: adminReply("I lost the target phone for this update.", "Please send the update again.")
            };
          }

          try {
            const updated = await customersService.updateCustomerPhone({
              userId: user.id,
              customerId: selected.id,
              phone: targetPhone
            });

            return {
              reply: adminReply(`Updated ${updated.name} phone to ${updated.phone ?? targetPhone}.`)
            };
          } catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : "";
            if (message.includes("unique constraint")) {
              return {
                reply: adminReply("That phone number is already used by another customer.")
              };
            }
            return {
              reply: adminReply("I could not update the phone number right now.")
            };
          }
        }

        if (pendingCustomerDisambiguation.action === "add_payment") {
          const targetPayment = pendingCustomerDisambiguation.targetPayment;
          if (!targetPayment) {
            return {
              reply: adminReply("I lost the pending payment details.", "Please send the payment again.")
            };
          }

          const jobs = await jobsService.findOutstandingJobsByCustomerId({
            userId: user.id,
            customerId: selected.id
          });

          if (jobs.length === 0) {
            return {
              reply: adminReply(`No outstanding job found for ${selected.name}.`)
            };
          }

          if (jobs.length > 1) {
            const top = jobs.slice(0, 3);
            const options = top
              .map((job) => `${job.id.slice(0, 8)} ${job.title} (${penceToPounds(job.outstandingPence)})`)
              .join(" | ");
            return {
              reply: adminReply(
                `I found multiple outstanding jobs for ${selected.name}.`,
                `Please pay with job ID. Options: ${options}`
              )
            };
          }

          try {
            const result = await toolExecutor.addPayment(user.id, {
              jobId: jobs[0].id,
              amountPence: targetPayment.amountPence,
              method: targetPayment.method,
              note: targetPayment.note
            });
            conversationMemory.setPendingReplyDraft(
              message.from,
              buildPaymentFollowUpDraft({
                customerName: selected.name,
                outstandingPence: result.outstandingPence,
                jobTitle: jobs[0].title
              })
            );

            return {
              reply: adminReply(
                `Payment recorded ${penceToPounds(result.payment.amountPence)}. Remaining balance ${penceToPounds(result.outstandingPence)}.`,
                "Need me to send a polite payment follow-up draft?"
              )
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message.includes("exceeds outstanding balance")) {
              const penceMatch = message.match(/\((\d+)\s+pence\)/);
              const remainingPence = penceMatch ? Number(penceMatch[1]) : null;
              return {
                reply: adminReply(
                  remainingPence !== null
                    ? `Payment is higher than remaining balance (${penceToPounds(remainingPence)}).`
                    : "Payment is higher than remaining balance."
                )
              };
            }

            return {
              reply: adminReply("Payment was not saved.", "Please check the job ID and amount.")
            };
          }
        }

        if (pendingCustomerDisambiguation.action === "customer_find") {
          const record = await customersService.findRecordByCustomerId({
            userId: user.id,
            customerId: selected.id
          });

          if (!record) {
            return {
              reply: adminReply(`Customer not found: "${selected.name}".`)
            };
          }

          return {
            reply: formatCustomerRecordsReply([record])
          };
        }

        if (pendingCustomerDisambiguation.action === "close_jobs") {
          const closedCount = await jobsService.closeActiveJobsByCustomerId({
            userId: user.id,
            customerId: selected.id
          });

          if (closedCount === 0) {
            return {
              reply: adminReply(`No active jobs found for ${selected.name}.`)
            };
          }

          return {
            reply: adminReply(`Closed ${closedCount} active job(s) for ${selected.name}.`)
          };
        }

        if (pendingCustomerDisambiguation.action === "job_create") {
          const targetJob = pendingCustomerDisambiguation.targetJob;
          if (!targetJob) {
            return {
              reply: adminReply("I lost the pending job details.", "Please send the job request again.")
            };
          }

          const created = await jobsService.createJobForCustomerId({
            userId: user.id,
            customerId: selected.id,
            title: targetJob.title,
            priceTotalPence: targetJob.totalPence,
            depositPence: targetJob.depositPence,
            dueDate: targetJob.dueDate,
            notes: targetJob.notes
          });

          await toolExecutor.scheduleReminders(user.id, created.job.id, created.job.dueDate);

          const outstandingPence = Math.max(
            targetJob.totalPence - (targetJob.depositPence ?? 0),
            0
          );
          conversationMemory.setPendingReplyDraft(
            message.from,
            buildJobReminderDraft({
              customerName: created.customer.name,
              jobTitle: created.job.title,
              dueDate: created.job.dueDate
            })
          );

          return {
            reply: adminReply(
              `Job logged for ${created.customer.name}: ${created.job.title}. Outstanding ${penceToPounds(outstandingPence)}.`,
              "Want me to draft a reminder message?"
            )
          };
        }

        if (pendingCustomerDisambiguation.action === "booking_create") {
          const targetBooking = pendingCustomerDisambiguation.targetBooking;
          if (!targetBooking) {
            return {
              reply: adminReply("I lost the pending booking details.", "Please send the booking again.")
            };
          }

          const created = await bookingsService.createBookingForCustomerId({
            userId: user.id,
            customerId: selected.id,
            startsAt: targetBooking.startsAt,
            title: targetBooking.title,
            notes: targetBooking.notes
          });

          conversationMemory.updateRecentCustomer(message.from, {
            customerId: created.customer.id,
            customerName: created.customer.name
          });

          return {
            reply: adminReply(
              `Booking saved for ${created.customer.name} on ${created.booking.startsAt.toISOString().slice(0, 16).replace("T", " ")}.`
            )
          };
        }

        if (pendingCustomerDisambiguation.action === "invoice_pdf") {
          const token = exportService.createInvoicePdfAccessToken({
            userId: user.id,
            customerId: selected.id,
            customerQuery: selected.name,
            expiresInMinutes: 30
          });
          const link = exportService.createPdfDownloadLink(token);

          return {
            reply: adminReply(`Invoice PDF is ready for "${selected.name}". Sending now.`),
            mediaUrl: link
          };
        }

        const link = await toolExecutor.createPdfExportLink(user.id, {
          customerId: selected.id,
          customerQuery: selected.name
        });

        return {
          reply: adminReply(`Customer report PDF is ready for "${selected.name}". Sending now.`),
          mediaUrl: link
        };
      }
    }

    const pendingVendorDisambiguation =
      conversationMemory.getPendingVendorDisambiguation(message.from);
    if (pendingVendorDisambiguation) {
      const selected = resolvePendingVendorCandidate({
        message: body,
        candidates: pendingVendorDisambiguation.candidates
      });

      if (selected) {
        conversationMemory.clearPendingVendorDisambiguation(message.from);

        if (pendingVendorDisambiguation.action === "vendor_payment_add") {
          const targetPayment = pendingVendorDisambiguation.targetPayment;
          if (!targetPayment) {
            return {
              reply: adminReply("I lost the pending payment details.", "Please send the payment again.")
            };
          }

          try {
            const ledger = await vendorPaymentsService.addVendorPaymentByVendorId({
              userId: user.id,
              vendorId: selected.id,
              amountPence: targetPayment.amountPence,
              note: targetPayment.note
            });
            return {
              reply: adminReply(
                `Payment recorded: ${penceToPounds(targetPayment.amountPence)} to ${ledger.vendorName}. Remaining vendor balance ${penceToPounds(ledger.balancePence)}.`
              )
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message.includes("exceeds vendor balance")) {
              return { reply: adminReply("Payment is higher than vendor outstanding balance.") };
            }
            if (message.includes("no outstanding balance")) {
              return { reply: adminReply("That vendor has no outstanding balance.") };
            }
            return { reply: adminReply("Vendor payment could not be saved.") };
          }
        }

        const token = exportService.createVendorPdfAccessToken({
          userId: user.id,
          vendorQuery: selected.vendorName,
          vendorId: selected.id,
          expiresInMinutes: 30
        });
        const link = exportService.createPdfDownloadLink(token);
        return {
          reply: adminReply(`Vendor report PDF is ready for "${selected.vendorName}". Sending now.`),
          mediaUrl: link
        };
      }
    }

    const pendingJobDisambiguation =
      conversationMemory.getPendingJobDisambiguation(message.from);
    if (pendingJobDisambiguation) {
      const selected = resolvePendingJobCandidate({
        message: body,
        candidates: pendingJobDisambiguation.candidates
      });

      if (selected) {
        conversationMemory.clearPendingJobDisambiguation(message.from);
        conversationMemory.updateRecent(message.from, {
          jobId: selected.id,
          customerName: selected.customerName,
          jobTitle: selected.title
        });

        if (pendingJobDisambiguation.action === "add_payment") {
          const targetPayment = pendingJobDisambiguation.targetPayment;
          if (!targetPayment) {
            return {
              reply: adminReply("I lost the pending payment details.", "Please send the payment again.")
            };
          }

          try {
            const result = await toolExecutor.addPayment(user.id, {
              jobId: selected.id,
              amountPence: targetPayment.amountPence,
              method: targetPayment.method,
              note: targetPayment.note
            });

            return {
              reply: adminReply(
                `Payment recorded ${penceToPounds(result.payment.amountPence)} for ${selected.customerName} - ${selected.title}. Remaining balance ${penceToPounds(result.outstandingPence)}.`
              )
            };
          } catch {
            return { reply: adminReply("Payment was not saved.", "Please check the amount and job.") };
          }
        }

        const closed = await toolExecutor.closeJob(user.id, selected.id);
        if (!closed) {
          return { reply: adminReply("I could not close that job.") };
        }

        return { reply: adminReply(`Job closed: ${selected.customerName} - ${selected.title}.`) };
      }
    }
  }

  if (effectiveParseResult.status === "unknown") {
    conversationMemory.clearPendingFlow(message.from);
    const boundedReply = await buildBoundedAssistantReply({
      message: body,
      businessName: user.businessName,
      registered: true,
      context: conversationMemory.getAgentParseContext(message.from)
    });

    if (boundedReply) {
      return {
        reply: assistantReply(boundedReply)
      };
    }

    return {
      reply: guideReply(
        buildCommandGuide({
          registered: true,
          lastIntent: effectiveParseResult.analysis?.intent ?? conversationMemory.get(message.from).lastIntent
        })
      )
    };
  }

  const validated = IntentSchema.safeParse(effectiveParseResult.intent);
  if (!validated.success) {
    return {
      reply: guideReply(
        "I understood part of it but couldn't turn it into a safe action.",
        buildCommandGuide({
          registered: true,
          lastIntent: effectiveParseResult.analysis?.intent ?? conversationMemory.get(message.from).lastIntent
        })
      )
    };
  }

  const intent = repairParsedIntentFromRawText(validated.data, body);
  conversationMemory.clearPendingFlow(message.from);
  conversationMemory.updateLastIntent(message.from, effectiveParseResult.analysis?.intent ?? intent.type);

  if (intent.type === "confirm_action") {
    const pending = conversationMemory.popPending(message.from);
    if (!pending) {
      return { reply: adminReply("There is nothing pending confirmation.") };
    }

    if (pending.kind === "reply_draft") {
      return {
        reply: detailedReply("Here is the draft you can send:", pending.message)
      };
    }

    return executeIntent({
      intent: pending.intent,
      phone: message.from,
      userId: user.id,
      businessName: user.businessName,
      requestId,
      normalizedText: body,
      rawText: body
    });
  }

  if (intent.type === "cancel_action") {
    conversationMemory.clearPending(message.from);
    conversationMemory.clearPendingCustomerDisambiguation(message.from);
    conversationMemory.clearPendingVendorDisambiguation(message.from);
    conversationMemory.clearPendingJobDisambiguation(message.from);
    conversationMemory.clearPendingFlow(message.from);
    return { reply: adminReply("Cancelled. No changes were made.") };
  }

  const requiresConfirmation = WriteIntentTypeSchema.safeParse(intent.type).success;
  if (requiresConfirmation && effectiveParseResult.confidence < 0.85) {
    conversationMemory.setPending(message.from, intent);
    return {
      reply: assistantReply(
        "I think I understood the action, but I want to be sure before changing your records.",
        "Reply CONFIRM to continue or CANCEL."
      )
    };
  }

  return executeIntent({
    intent,
    phone: message.from,
    userId: user.id,
    businessName: user.businessName,
    requestId,
    normalizedText: effectiveParseResult.normalizedText,
    rawText: body
  });
};
