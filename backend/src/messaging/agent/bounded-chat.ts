// Implements helper logic for the legacy bounded business assistant.
import { env } from "../../config/env";
import { AgentParseContext } from "./agent-types";

type BoundedChatInput = {
  message: string;
  businessName?: string;
  registered: boolean;
  context?: AgentParseContext;
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const BUSINESS_TOPIC_PATTERN =
  /\b(job|customer|client|invoice|payment|paid|quote|balance|outstanding|schedule|booking|booked|reminder|expense|supplier|vendor|receipt|refund|deposit|follow up|follow-up)\b/i;

const APP_CAPABILITY_PATTERN =
  /\b(what can you do|what do you do|how can you help|help me|your job|your role|who are you)\b/i;

const THANKS_PATTERN = /\b(thanks|thank you|cheers|nice one|appreciate it)\b/i;
const HOW_ARE_YOU_PATTERN = /\b(how are you|how's it going|hows it going|you good|are you okay)\b/i;
const LOW_MOOD_PATTERN = /\b(i am not feeling good|i'm not feeling good|not feeling good|feeling bad|feeling low|rough day|bad day|not great today)\b/i;
const GREETING_PATTERN = /^(hi|hello|hey|morning|good morning|afternoon|good afternoon|evening|good evening)\b/i;
const AFFIRMATION_PATTERN = /^(ok|okay|cool|sounds good|alright|all good|great)\b/i;
const OUT_OF_SCOPE_PATTERN =
  /\b(weather|football|soccer|movie|film|song|music|recipe|holiday|travel|politics|bitcoin|crypto price|stock price|news)\b/i;

const clip = (value: string, max = 280) => (value.length <= max ? value : `${value.slice(0, max - 3).trimEnd()}...`);

const fallbackBoundedReply = (input: BoundedChatInput): string | null => {
  const text = normalize(input.message);
  const assistantName = input.businessName ? `${input.businessName}'s assistant` : "your trades assistant";

  if (HOW_ARE_YOU_PATTERN.test(text)) {
    return clip(
      `I'm good and ready to help. I can keep things moving on jobs, customers, payments, invoices, expenses, and follow-ups.`
    );
  }

  if (LOW_MOOD_PATTERN.test(text)) {
    return clip(
      `Sorry you're having a rough day. If you want, give me one thing to handle and I'll keep the admin side moving for you.`
    );
  }

  if (THANKS_PATTERN.test(text)) {
    return clip(`Any time. If you want, send the next job, payment, customer, or invoice request in your own words.`);
  }

  if (APP_CAPABILITY_PATTERN.test(text)) {
    return clip(
      `${assistantName} can help with customers, jobs, payments, invoices, expenses, exports, and reminders. You can write naturally, for example: "John paid 250", "book kitchen job for Ahmed tomorrow", or "show overdue balances".`
    );
  }

  if (GREETING_PATTERN.test(text)) {
    return clip(`Hi. I'm here to help with the business side of the work. Send me a job, payment, customer, invoice, or reminder task in plain language.`);
  }

  if (AFFIRMATION_PATTERN.test(text)) {
    return clip(`Understood. Send the next thing you want me to handle.`);
  }

  if (OUT_OF_SCOPE_PATTERN.test(text)) {
    return clip(
      `I can chat briefly, but I should stay focused on running the business side for you. If you want, tell me what needs doing with jobs, customers, payments, or paperwork.`
    );
  }

  if (BUSINESS_TOPIC_PATTERN.test(text)) {
    return clip(
      `That sounds business-related. Send it in your own words and I'll try to turn it into an action or ask only for the missing detail I need.`
    );
  }

  return clip(
    `I can keep the conversation natural, but I should stay within your business assistant role. If this is about work, send it plainly and I'll handle it.`
  );
};

const SYSTEM_PROMPT = `You are a WhatsApp business assistant for a self-employed tradesperson.
Your job:
- sound natural, calm, and human
- reply briefly, like a competent real assistant on WhatsApp
- stay within the boundaries of a business admin assistant
- be helpful with jobs, customers, payments, invoices, reminders, exports, and business follow-up

Rules:
- If the message is casual small talk, respond naturally in 1-2 short sentences.
- If the message is business-related but too vague to act on, gently ask for the single most useful missing detail.
- If the message is outside your role, do not pretend to be a general-purpose assistant. Briefly redirect back to business help.
- Do not mention policies.
- Do not produce lists unless needed.
- Keep replies under 280 characters.
- Do not invent records or claim actions were taken.
- Return plain text only.`;

const callOpenAiBoundedChat = async (input: BoundedChatInput) => {
  if (!env.LLM_PROVIDER || !env.LLM_API_KEY) {
    return null;
  }

  if (env.LLM_PROVIDER.toLowerCase() !== "openai") {
    return null;
  }

  const model = env.LLM_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LLM_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "system",
          content: `Context: ${JSON.stringify({
            registered: input.registered,
            businessName: input.businessName,
            agentContext: input.context ?? null
          })}`
        },
        { role: "user", content: input.message }
      ]
    })
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  return content ? clip(content) : null;
};

export const buildBoundedAssistantReply = async (input: BoundedChatInput) => {
  try {
    const llmReply = await callOpenAiBoundedChat(input);
    if (llmReply) {
      return llmReply;
    }
  } catch {
    // Fall back to deterministic replies when LLM is unavailable.
  }

  return fallbackBoundedReply(input);
};
