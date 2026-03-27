// Parses user messages into structured intents for the legacy messaging stack.
import { env } from "../../../config/env";
import { IntentSchema, ParsedIntent } from "../../intents/schemas";
import { AgentParseContext, AgentIntentName, ParsedUserIntent } from "../../agent/agent-types";
import { buildClarificationQuestion } from "../../agent/clarification-builder";

export type LlmFallbackResult = {
  intent: ParsedIntent | null;
  confidence: number;
  canonicalText?: string;
  clarificationQuestion?: string;
  parsedUserIntent?: ParsedUserIntent;
};

type LlmStructuredOutput = {
  canonicalText?: string;
  intent?: Record<string, unknown>;
  confidence?: number;
  clarificationQuestion?: string;
  parsedUserIntent?: {
    intent?: AgentIntentName;
    confidence?: number;
    entities?: Record<string, unknown>;
    missingFields?: string[];
    followUpQuestion?: string;
    sessionReferences?: {
      usesLastCustomer?: boolean;
      usesLastJob?: boolean;
      usesPendingFlow?: boolean;
    };
  };
};

const summarizeContextForPrompt = (context?: AgentParseContext) => {
  if (!context) {
    return undefined;
  }

  return {
    recentFocus: {
      lastCustomer: context.lastCustomerLabel ?? null,
      lastJob: context.lastJobLabel ?? null,
      lastIntent: context.lastIntent ?? null
    },
    recentTurns: context.recentTurns ?? [],
    pendingFlow: context.pendingFlow
      ? {
          intent: context.pendingFlow.intent,
          missingFields: context.pendingFlow.missingFields,
          entities: context.pendingFlow.entities
        }
      : null,
    recentCandidates:
      context.lastResolvedCandidates?.slice(0, 5).map((candidate) => ({
        label: candidate.label,
        score: candidate.score ?? null
      })) ?? [],
    learnedCustomerAliases:
      context.learnedAliases?.slice(0, 8).map((alias) => ({
        phrase: alias.phrase,
        targetValue: alias.targetValue,
        confidence: alias.confidence
      })) ?? [],
    learnedIntentHints:
      context.learnedIntentHints?.slice(0, 8).map((hint) => ({
        phrase: hint.phrase,
        intent: hint.intent,
        confidence: hint.confidence
      })) ?? []
  };
};

const FEW_SHOT_EXAMPLES = [
  {
    input: "open ahmed's account",
    output: {
      canonicalText: "Find ahmed",
      intent: { type: "customer_find", query: "ahmed" },
      confidence: 0.95,
      clarificationQuestion: "",
      parsedUserIntent: {
        intent: "get_customer_account",
        confidence: 0.95,
        entities: { customerQuery: "ahmed" },
        missingFields: [],
        followUpQuestion: ""
      }
    }
  },
  {
    input: "john paid 250 add it",
    output: {
      canonicalText: "PAYMENT customer: john; amount: 250",
      intent: { type: "payment_add", customerName: "john", amountPence: 25000 },
      confidence: 0.94,
      clarificationQuestion: "",
      parsedUserIntent: {
        intent: "record_payment",
        confidence: 0.94,
        entities: { customerQuery: "john", customerName: "john", amountPence: 25000 },
        missingFields: [],
        followUpQuestion: ""
      }
    }
  },
  {
    input: "add payment to that one 150",
    output: {
      canonicalText: "PAYMENT amount: 150",
      intent: { type: "payment_add", amountPence: 15000 },
      confidence: 0.7,
      clarificationQuestion: "",
      parsedUserIntent: {
        intent: "record_payment",
        confidence: 0.82,
        entities: { amountPence: 15000 },
        missingFields: [],
        followUpQuestion: "",
        sessionReferences: { usesLastJob: true }
      }
    }
  },
  {
    input: "mark that job as completed",
    output: {
      canonicalText: "Close job <session-last-job>",
      intent: { type: "job_close", jobId: "session-last-job" },
      confidence: 0.7,
      clarificationQuestion: "",
      parsedUserIntent: {
        intent: "update_job_status",
        confidence: 0.84,
        entities: {},
        missingFields: [],
        followUpQuestion: "",
        sessionReferences: { usesLastJob: true }
      }
    }
  },
  {
    input: "create a kitchen cabinet job for mehmet",
    output: {
      canonicalText: "NEW JOB customer: mehmet; title: kitchen cabinet",
      intent: { type: "unknown" },
      confidence: 0.55,
      clarificationQuestion: "I can create that job. What is the total price?",
      parsedUserIntent: {
        intent: "create_job",
        confidence: 0.7,
        entities: { customerQuery: "mehmet", customerName: "mehmet", title: "kitchen cabinet" },
        missingFields: ["total"],
        followUpQuestion: "I can create that job. What is the total price?"
      }
    }
  },
  {
    input: "I paid 300 for painting staff and 100 for electricity bill and 50 for phone bill",
    output: {
      canonicalText: "expense batch",
      intent: {
        type: "expense_add_batch",
        items: [
          { amountPence: 30000, note: "painting staff" },
          { amountPence: 10000, note: "electricity bill" },
          { amountPence: 5000, note: "phone bill" }
        ]
      },
      confidence: 0.96,
      clarificationQuestion: "",
      parsedUserIntent: {
        intent: "record_expense",
        confidence: 0.96,
        entities: {
          items: [
            { amountPence: 30000, note: "painting staff" },
            { amountPence: 10000, note: "electricity bill" },
            { amountPence: 5000, note: "phone bill" }
          ]
        },
        missingFields: [],
        followUpQuestion: ""
      }
    }
  }
];

const SYSTEM_PROMPT = `You convert user WhatsApp messages into strict JSON intents for a trades admin assistant.
Rules:
- Extract intent only. Do not perform business logic.
- The user writes casually, with typos, short forms, missing punctuation, fragmented follow-ups, and mixed formats. Infer the intended admin action when it is reasonably clear.
- Messages may sound conversational instead of command-like. Treat natural phrasing such as "can you sort that payment", "put him down", "that one is done", or "show me where I'm at this week" as valid admin requests when supported by context.
- If session context contains learnedIntentHints or learnedCustomerAliases, treat them as high-signal guidance for this user's wording habits.
- If uncertain, return low confidence and a short clarification question.
- Return JSON only, with this shape:
{
  "canonicalText": "server-friendly command text",
  "intent": { "type": "..." },
  "confidence": 0.0,
  "clarificationQuestion": "optional",
  "parsedUserIntent": {
    "intent": "record_payment",
    "confidence": 0.0,
    "entities": {},
    "missingFields": [],
    "followUpQuestion": "optional",
    "sessionReferences": {
      "usesLastCustomer": false,
      "usesLastJob": false,
      "usesPendingFlow": false
    }
  }
}
- Valid intent types:
onboarding_submit, customer_create, job_create, booking_create, job_list_active, job_list_due_week, job_list_last_30, job_close,
job_close_customer, customer_find, customer_update_phone, briefing_toggle, summary_7, summary_30, expense_list, expense_add, vendor_debt_add, vendor_payment_add, vendor_summary, export_data, export_pdf, export_vendor_pdf, export_expense_pdf, invoice_create, subscribe, outstanding_list,
payment_add, payment_list, expense_add_batch, help, confirm_action, cancel_action, greeting, unknown
- Valid parsedUserIntent.intent values:
create_customer, search_customer, get_customer_account, create_job, create_booking, list_jobs, update_job_status, record_payment, record_expense, list_payments, list_debts, get_financial_summary, create_invoice, clarification_needed, unknown
- For customer_create: include name and optional phone.
- For job_create: customerName, title, totalPence (integer).
- For booking_create: customerName and startsAt (ISO datetime string).
- For job_create, if the user says "new customer/costumer/client" and also includes job + price/total, treat it as creating a customer and their first job in one message.
- For payment_add: amountPence (integer), optional jobId/customerName/method/note.
- For payment_list: include range when present: today, yesterday, week, month, all.
- For customer_update_phone: include both customerQuery and phone.
- For expense_add: include amountPence and optional note/counterpartyName.
- For expense_list: use { "type": "expense_list" } when user asks to show/list/bring their expenses as text, not PDF.
- For vendor_debt_add: include amountPence and vendorQuery.
- For vendor_payment_add: include amountPence and vendorQuery.
- For export_pdf:
  - If user asks all data, set only { "type": "export_pdf" }.
  - If user names a customer (for example: "bring john records as a pdf"), include customerQuery:
    { "type": "export_pdf", "customerQuery": "john" }.
- For export_expense_pdf: use { "type": "export_expense_pdf" } when user asks for expense/spending records as pdf.
- For invoice_create: include customerQuery when user names a customer (for example: "create john invoice").
- canonicalText should look like:
  - NEW JOB customer: Jack London; title: home maintenance; total: 600; deposit: 100; phone: +445656566655
  - NEW JOB customer: ...; title: ...; total: ...; deposit: ...; due: in 1 week
  - PAYMENT customer: ...; amount: ...
  - Find ...
  - Update customer phone: add John phone number +447700900123
  - Active jobs
  - Jobs due this week
  - Jobs last 30 days
  - Close job <id>
  - Close John jobs
  - paid 85 for paint at Screwfix
  - bring my expenses list
  - debt 300 Y market
  - paid 100 to Y market
  - vendor summary
  - export vendor payments as pdf
  - bring expenses records as pdf
  - create john invoice
  - Summary last 7 days
  - Summary last 30 days
  - Export my data
  - Export PDF
  - Export customer records: John
  - STOP BRIEFING / START BRIEFING
  - Subscribe
- Do not output "customer find:" format. Use exactly "Find <query>".
- Accept common typos and aliases such as: costumer/customer, maintance/maintenance, deposite/deposit, num/number, john's/john.
- Resolve short references carefully using provided session context. If the user says "him", "that one", "previous customer", or "this job", use sessionReferences and fill entities from context only when reasonable.
- Prefer reusing recent context over asking for clarification when the reference is strong and unambiguous.
- When a message contains one real business action plus filler words, extract the action and ignore the filler.
- If the user corrects themselves inside the same message, prefer the latest phrasing.
- Preserve relative date phrases in canonicalText (e.g. "in 1 week", "tomorrow"), do not invent old fixed dates.
- Use clarification_needed in parsedUserIntent when one or two fields are missing.
- Examples:
  - "open ahmed's account" -> parsedUserIntent intent get_customer_account, entity customerQuery "ahmed"
  - "john paid 250 add it" -> parsedUserIntent intent record_payment, entity customerQuery "john", amountPence 25000
  - "mark that job as completed" -> use sessionReferences.usesLastJob when context supports it
  - "show yesterday's payments" -> payment_list range yesterday
- Use unknown when not enough information.`;

const coerceIntent = (value: Record<string, unknown> | undefined): ParsedIntent | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const cloned: Record<string, unknown> = { ...value };

  if (typeof cloned.dueDate === "string") {
    const date = new Date(cloned.dueDate);
    if (!Number.isNaN(date.getTime())) {
      cloned.dueDate = date;
    }
  }

  if (typeof cloned.startsAt === "string") {
    const date = new Date(cloned.startsAt);
    if (!Number.isNaN(date.getTime())) {
      cloned.startsAt = date;
    }
  }

  const parsed = IntentSchema.safeParse(cloned);
  return parsed.success ? parsed.data : null;
};

const parseJsonObjectFromText = (text: string): LlmStructuredOutput | null => {
  try {
    return JSON.parse(text) as LlmStructuredOutput;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]) as LlmStructuredOutput;
    } catch {
      return null;
    }
  }
};

const coerceParsedUserIntent = (
  value: LlmStructuredOutput["parsedUserIntent"],
  executionIntent: ParsedIntent | null,
  canonicalText?: string
): ParsedUserIntent | undefined => {
  if (!value?.intent) {
    return undefined;
  }

  const entities = value.entities && typeof value.entities === "object" ? value.entities : {};
  const missingFields = Array.isArray(value.missingFields)
    ? value.missingFields.filter((item): item is string => typeof item === "string")
    : [];

  return {
    intent: value.intent,
    confidence:
      typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? Math.max(0, Math.min(1, value.confidence))
        : executionIntent
          ? 0.7
          : 0.45,
    entities,
    missingFields,
    needsDisambiguation: false,
    followUpQuestion:
      typeof value.followUpQuestion === "string" && value.followUpQuestion.trim()
        ? value.followUpQuestion.trim()
        : missingFields.length > 0
          ? buildClarificationQuestion({
              intent: value.intent,
              entities,
              missingFields
            })
          : undefined,
    sessionReferences: value.sessionReferences,
    canonicalText,
    executionIntent,
    source: "llm"
  };
};

const callOpenAi = async (message: string, context?: AgentParseContext) => {
  const model = env.LLM_MODEL || "gpt-4o-mini";

  if (env.AGENT_DEBUG) {
    console.info("[agent][llm] calling OpenAI", { model });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LLM_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(context
          ? [
              {
                role: "system" as const,
                content: `Session context: ${JSON.stringify(summarizeContextForPrompt(context))}`
              }
            ]
          : []),
        ...FEW_SHOT_EXAMPLES.flatMap((example) => [
          {
            role: "user" as const,
            content: example.input
          },
          {
            role: "assistant" as const,
            content: JSON.stringify(example.output)
          }
        ]),
        { role: "user", content: message }
      ]
    })
  });

  if (!response.ok) {
    if (env.AGENT_DEBUG) {
      const errorText = await response.text();
      console.warn("[agent][llm] OpenAI non-200", {
        status: response.status,
        body: errorText.slice(0, 400)
      });
    }
    return null;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    if (env.AGENT_DEBUG) {
      console.warn("[agent][llm] no content in response");
    }
    return null;
  }

  return parseJsonObjectFromText(content);
};

export const parseWithLlmFallback = async (
  message: string,
  context?: AgentParseContext
): Promise<LlmFallbackResult> => {
  if (!env.LLM_PROVIDER || !env.LLM_API_KEY) {
    if (env.AGENT_DEBUG) {
      console.info("[agent][llm] disabled: missing provider or api key");
    }
    return {
      intent: null,
      confidence: 0
    };
  }

  const provider = env.LLM_PROVIDER.toLowerCase();

  if (provider !== "openai") {
    if (env.AGENT_DEBUG) {
      console.warn("[agent][llm] unsupported provider", { provider });
    }
    return {
      intent: null,
      confidence: 0
    };
  }

  try {
    const structured = await callOpenAi(message, context);

    if (!structured) {
      if (env.AGENT_DEBUG) {
        console.warn("[agent][llm] structured output missing");
      }
      return { intent: null, confidence: 0 };
    }

    const intent = coerceIntent(structured.intent);

    const confidenceRaw =
      typeof structured.confidence === "number" && Number.isFinite(structured.confidence)
        ? structured.confidence
        : 0;

    const confidence = Math.max(0, Math.min(1, confidenceRaw));

    const clarificationQuestion =
      typeof structured.clarificationQuestion === "string"
        ? structured.clarificationQuestion.trim() || undefined
        : undefined;
    const canonicalText =
      typeof structured.canonicalText === "string"
        ? structured.canonicalText.trim() || undefined
        : undefined;
    const parsedUserIntent = coerceParsedUserIntent(structured.parsedUserIntent, intent, canonicalText);

    return {
      intent,
      confidence,
      canonicalText,
      clarificationQuestion,
      parsedUserIntent
    };
  } catch {
    if (env.AGENT_DEBUG) {
      console.warn("[agent][llm] exception while parsing fallback");
    }
    return {
      intent: null,
      confidence: 0
    };
  }
};
