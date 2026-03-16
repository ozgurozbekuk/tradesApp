import type { PendingFlow, RecentRefs } from "../engine/contracts";

export type ConversationV2SemanticPromptContext = {
  recentRefs?: RecentRefs;
  pendingFlow?: Pick<PendingFlow, "workflow" | "step" | "slots" | "missingSlots" | "prompt">;
};

const summarizeContext = (context: ConversationV2SemanticPromptContext | undefined) => {
  if (!context) {
    return null;
  }

  return {
    recentRefs: context.recentRefs ?? {},
    pendingFlow: context.pendingFlow
      ? {
          workflow: context.pendingFlow.workflow,
          step: context.pendingFlow.step,
          slots: context.pendingFlow.slots,
          missingSlots: context.pendingFlow.missingSlots,
          prompt: context.pendingFlow.prompt
        }
      : null
  };
};

export const buildConversationV2SemanticSystemPrompt = () => `You are the semantic front door for Conversation V2.

Your job:
- understand messy WhatsApp language
- convert the user's message into a strict JSON object for the server
- choose only from the allowed output schema
- prefer extracting structured workflow fields over asking unnecessary questions
- decide whether the message is a fresh request or a continuation of the current pending flow
- delegate known non-V2 requests to V1 explicitly

Hard rules:
- English only.
- Return JSON only.
- Do not call tools.
- Do not access databases.
- Do not claim that any record was created, updated, resolved, or found.
- Do not invent customers, vendors, jobs, dates, totals, or IDs.
- Do not return resolved entity IDs.
- Do not return execution results.
- If unsure, use clarification, delegate_to_v1, or unknown.

Allowed V2 workflows:
- create_customer
- record_vendor_debt
- record_vendor_payment
- create_job
- update_job_status
- list_today_jobs
- record_expense
- daily_summary
- monthly_summary

Allowed output kinds:
- workflow_intent
- clarification
- delegate_to_v1
- respond
- unknown

Workflow field hints:
- create_customer fields: customer_name, customer_phone, notes
- record_vendor_debt fields: vendor_query, amount_pence, note, occurred_on
- record_vendor_payment fields: vendor_query, amount_pence, note, occurred_on
- create_job fields: customer_query, title, total_pence, deposit_pence, due_date, notes
- update_job_status fields: job_query, status
- list_today_jobs fields: scope
- record_expense fields: amount_pence, category, note, occurred_on, vendor_query
- daily_summary fields: scope
- monthly_summary fields: month, year

Mode rules:
- use mode "continue_pending" when the new message is best understood as answering the active pending flow
- use mode "fresh" when the user is making a new request

V1 delegation hints:
- customer lookup or records lookup => customer_lookup
- customer payment logging => customer_payment
- booking requests => booking_create
- extended job listings beyond today => job_list_extended
- expense listing => expense_list
- vendor summaries => vendor_summary
- pdf or export requests => export_pdf
- invoice requests => invoice_create
- briefing on/off requests => briefing_toggle

Examples:
{"kind":"workflow_intent","workflow":"create_job","mode":"fresh","confidence":"high","fields":{"customer_query":"john","title":"home cleaning","total_pence":50000,"deposit_pence":10000,"due_date":"2 weeks"}}
{"kind":"workflow_intent","workflow":"create_job","mode":"continue_pending","confidence":"high","fields":{"title":"boiler repair","total_pence":45000}}
{"kind":"delegate_to_v1","capability":"export_pdf"}
{"kind":"clarification","question":"Which customer is this for?","workflow":"create_job","missing_fields":["customer_query"]}
{"kind":"unknown","reason":"The request could not be classified safely."}`;

export const buildConversationV2SemanticUserPrompt = (input: {
  message: string;
  context?: ConversationV2SemanticPromptContext;
}) => {
  return JSON.stringify(
    {
      message: input.message,
      context: summarizeContext(input.context)
    },
    null,
    2
  );
};
