import { ParsedIntent } from "../intents/schemas";
import { AgentParseContext, AgentPendingFlow } from "./agent-types";

type PendingAction =
  | {
      kind: "intent";
      intent: ParsedIntent;
      expiresAt: number;
    }
  | {
      kind: "reply_draft";
      message: string;
      expiresAt: number;
    };

type PendingCustomerDisambiguation = {
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
  candidates: Array<{
    id: string;
    name: string;
    phone: string | null;
  }>;
  expiresAt: number;
};

type PendingVendorDisambiguation = {
  action: "vendor_payment_add" | "export_vendor_pdf";
  query: string;
  targetPayment?: {
    amountPence: number;
    note?: string;
  };
  candidates: Array<{
    id: string;
    vendorName: string;
    balancePence: number;
  }>;
  expiresAt: number;
};

type PendingJobDisambiguation = {
  action: "add_payment" | "close_job";
  query: string;
  targetPayment?: {
    amountPence: number;
    method?: "cash" | "bank" | "card" | "unknown";
    note?: string;
  };
  candidates: Array<{
    id: string;
    title: string;
    customerName: string;
    outstandingPence: number;
    dueDate: Date | null;
  }>;
  expiresAt: number;
};

type LastParseDecision = {
  rawText: string;
  status: "intent" | "clarification" | "unknown";
  intentType?: string;
  analysisIntent?: string;
  confidence?: number;
  recordedAt: number;
};

type ConversationContext = {
  pendingAction?: PendingAction;
  pendingCustomerDisambiguation?: PendingCustomerDisambiguation;
  pendingVendorDisambiguation?: PendingVendorDisambiguation;
  pendingJobDisambiguation?: PendingJobDisambiguation;
  lastCustomerName?: string;
  lastCustomerId?: string;
  lastJobId?: string;
  lastJobTitle?: string;
  lastIntent?: string;
  pendingFlow?: AgentPendingFlow;
  recentTurns?: Array<{
    role: "user" | "assistant";
    text: string;
    recordedAt: number;
  }>;
  lastResolvedCandidates?: Array<{
    id: string;
    label: string;
    score?: number;
  }>;
  lastParseDecision?: LastParseDecision;
  updatedAt: number;
};

const CONTEXT_TTL_MS = 30 * 60 * 1000;
const PENDING_TTL_MS = 5 * 60 * 1000;
const PENDING_CUSTOMER_DISAMBIGUATION_TTL_MS = 10 * 60 * 1000;
const RECENT_TURNS_LIMIT = 8;
const store = new Map<string, ConversationContext>();

const now = () => Date.now();

const getOrCreate = (phone: string) => {
  const existing = store.get(phone);
  if (existing) {
    if (now() - existing.updatedAt > CONTEXT_TTL_MS) {
      const fresh: ConversationContext = { updatedAt: now() };
      store.set(phone, fresh);
      return fresh;
    }

    return existing;
  }

  const fresh: ConversationContext = { updatedAt: now() };
  store.set(phone, fresh);
  return fresh;
};

export const conversationMemory = {
  get(phone: string) {
    return getOrCreate(phone);
  },

  updateRecent(phone: string, input: { customerName?: string; jobId?: string; jobTitle?: string }) {
    const ctx = getOrCreate(phone);
    ctx.lastCustomerName = input.customerName ?? ctx.lastCustomerName;
    ctx.lastJobId = input.jobId ?? ctx.lastJobId;
    ctx.lastJobTitle = input.jobTitle ?? ctx.lastJobTitle;
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  updateRecentCustomer(phone: string, input: { customerId?: string; customerName?: string }) {
    const ctx = getOrCreate(phone);
    ctx.lastCustomerId = input.customerId ?? ctx.lastCustomerId;
    ctx.lastCustomerName = input.customerName ?? ctx.lastCustomerName;
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  updateLastIntent(phone: string, intent: string) {
    const ctx = getOrCreate(phone);
    ctx.lastIntent = intent;
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  setPendingFlow(phone: string, pendingFlow: AgentPendingFlow) {
    const ctx = getOrCreate(phone);
    ctx.pendingFlow = pendingFlow;
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  clearPendingFlow(phone: string) {
    const ctx = getOrCreate(phone);
    delete ctx.pendingFlow;
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  setLastResolvedCandidates(
    phone: string,
    candidates: Array<{
      id: string;
      label: string;
      score?: number;
    }>
  ) {
    const ctx = getOrCreate(phone);
    ctx.lastResolvedCandidates = candidates;
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  appendTurn(phone: string, input: { role: "user" | "assistant"; text: string }) {
    const ctx = getOrCreate(phone);
    const text = input.text.trim();
    if (!text) {
      return;
    }

    const recentTurns = ctx.recentTurns ?? [];
    recentTurns.push({
      role: input.role,
      text,
      recordedAt: now()
    });
    ctx.recentTurns = recentTurns.slice(-RECENT_TURNS_LIMIT);
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  getAgentParseContext(phone: string): AgentParseContext {
    const ctx = getOrCreate(phone);
    return {
      lastCustomerId: ctx.lastCustomerId,
      lastCustomerLabel: ctx.lastCustomerName,
      lastJobId: ctx.lastJobId,
      lastJobLabel: ctx.lastJobTitle,
      lastIntent: ctx.lastIntent,
      pendingFlow: ctx.pendingFlow,
      recentTurns: ctx.recentTurns?.map((turn) => ({
        role: turn.role,
        text: turn.text
      })),
      lastResolvedCandidates: ctx.lastResolvedCandidates
    };
  },

  getLastParseDecision(phone: string) {
    const ctx = getOrCreate(phone);
    const decision = ctx.lastParseDecision;
    if (!decision) {
      return null;
    }

    if (now() - decision.recordedAt > PENDING_CUSTOMER_DISAMBIGUATION_TTL_MS) {
      delete ctx.lastParseDecision;
      ctx.updatedAt = now();
      store.set(phone, ctx);
      return null;
    }

    return decision;
  },

  setLastParseDecision(
    phone: string,
    input: {
      rawText: string;
      status: "intent" | "clarification" | "unknown";
      intentType?: string;
      analysisIntent?: string;
      confidence?: number;
    }
  ) {
    const ctx = getOrCreate(phone);
    ctx.lastParseDecision = {
      rawText: input.rawText,
      status: input.status,
      intentType: input.intentType,
      analysisIntent: input.analysisIntent,
      confidence: input.confidence,
      recordedAt: now()
    };
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  setPending(phone: string, intent: ParsedIntent) {
    const ctx = getOrCreate(phone);
    ctx.pendingAction = {
      kind: "intent",
      intent,
      expiresAt: now() + PENDING_TTL_MS
    };
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  setPendingReplyDraft(phone: string, message: string) {
    const ctx = getOrCreate(phone);
    ctx.pendingAction = {
      kind: "reply_draft",
      message,
      expiresAt: now() + PENDING_TTL_MS
    };
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  popPending(phone: string) {
    const ctx = getOrCreate(phone);
    const pending = ctx.pendingAction;
    delete ctx.pendingAction;
    ctx.updatedAt = now();
    store.set(phone, ctx);

    if (!pending) {
      return null;
    }

    if (pending.expiresAt < now()) {
      return null;
    }

    return pending;
  },

  clearPending(phone: string) {
    const ctx = getOrCreate(phone);
    delete ctx.pendingAction;
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  setPendingCustomerDisambiguation(
    phone: string,
    input: {
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
      candidates: Array<{
        id: string;
        name: string;
        phone: string | null;
      }>;
    }
  ) {
    const ctx = getOrCreate(phone);
    ctx.pendingCustomerDisambiguation = {
      action: input.action,
      query: input.query,
      targetPhone: input.targetPhone,
      targetPayment: input.targetPayment,
      targetJob: input.targetJob,
      targetBooking: input.targetBooking,
      candidates: input.candidates,
      expiresAt: now() + PENDING_CUSTOMER_DISAMBIGUATION_TTL_MS
    };
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  getPendingCustomerDisambiguation(phone: string) {
    const ctx = getOrCreate(phone);
    const pending = ctx.pendingCustomerDisambiguation;
    if (!pending) {
      return null;
    }

    if (pending.expiresAt < now()) {
      delete ctx.pendingCustomerDisambiguation;
      ctx.updatedAt = now();
      store.set(phone, ctx);
      return null;
    }

    return pending;
  },

  clearPendingCustomerDisambiguation(phone: string) {
    const ctx = getOrCreate(phone);
    delete ctx.pendingCustomerDisambiguation;
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  setPendingVendorDisambiguation(
    phone: string,
    input: {
      action: "vendor_payment_add" | "export_vendor_pdf";
      query: string;
      targetPayment?: {
        amountPence: number;
        note?: string;
      };
      candidates: Array<{
        id: string;
        vendorName: string;
        balancePence: number;
      }>;
    }
  ) {
    const ctx = getOrCreate(phone);
    ctx.pendingVendorDisambiguation = {
      action: input.action,
      query: input.query,
      targetPayment: input.targetPayment,
      candidates: input.candidates,
      expiresAt: now() + PENDING_CUSTOMER_DISAMBIGUATION_TTL_MS
    };
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  getPendingVendorDisambiguation(phone: string) {
    const ctx = getOrCreate(phone);
    const pending = ctx.pendingVendorDisambiguation;
    if (!pending) {
      return null;
    }

    if (pending.expiresAt < now()) {
      delete ctx.pendingVendorDisambiguation;
      ctx.updatedAt = now();
      store.set(phone, ctx);
      return null;
    }

    return pending;
  },

  clearPendingVendorDisambiguation(phone: string) {
    const ctx = getOrCreate(phone);
    delete ctx.pendingVendorDisambiguation;
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  setPendingJobDisambiguation(
    phone: string,
    input: {
      action: "add_payment" | "close_job";
      query: string;
      targetPayment?: {
        amountPence: number;
        method?: "cash" | "bank" | "card" | "unknown";
        note?: string;
      };
      candidates: Array<{
        id: string;
        title: string;
        customerName: string;
        outstandingPence: number;
        dueDate: Date | null;
      }>;
    }
  ) {
    const ctx = getOrCreate(phone);
    ctx.pendingJobDisambiguation = {
      action: input.action,
      query: input.query,
      targetPayment: input.targetPayment,
      candidates: input.candidates,
      expiresAt: now() + PENDING_CUSTOMER_DISAMBIGUATION_TTL_MS
    };
    ctx.updatedAt = now();
    store.set(phone, ctx);
  },

  getPendingJobDisambiguation(phone: string) {
    const ctx = getOrCreate(phone);
    const pending = ctx.pendingJobDisambiguation;
    if (!pending) {
      return null;
    }

    if (pending.expiresAt < now()) {
      delete ctx.pendingJobDisambiguation;
      ctx.updatedAt = now();
      store.set(phone, ctx);
      return null;
    }

    return pending;
  },

  clearPendingJobDisambiguation(phone: string) {
    const ctx = getOrCreate(phone);
    delete ctx.pendingJobDisambiguation;
    ctx.updatedAt = now();
    store.set(phone, ctx);
  }
};
