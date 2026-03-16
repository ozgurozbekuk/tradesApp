import type { WorkflowExecutionResult, WorkflowName } from "../engine/contracts";

const SLOT_PROMPTS: Record<string, string> = {
  customer_name: "What is the customer name?",
  customer_phone: "What is the customer phone number?",
  vendor_query: "Which vendor is this for?",
  amount_pence: "What is the amount?",
  note: "What note should I save?",
  occurred_on: "What date should I use?",
  customer_query: "Which customer is this for?",
  title: "What is the job title?",
  total_pence: "What is the total amount for the job?",
  deposit_pence: "What is the deposit amount?",
  due_date: "What due date should I use?",
  job_query: "Which job do you want to update?",
  status: "What status should I set?",
  category: "Which expense category should I use?",
  month: "Which month do you want?",
  year: "Which year do you want?"
};

export const buildUnsupportedReply = () =>
  "This request is not supported by Conversation V2 yet. Falling back to the existing flow is expected.";

export const buildWorkflowReply = (result: WorkflowExecutionResult) => result.reply;

export const buildMissingSlotPrompt = (workflow: WorkflowName, missingSlots: string[]) => {
  const firstMissingSlot = missingSlots[0];
  if (!firstMissingSlot) {
    return `I need a bit more information to continue with ${workflow}.`;
  }

  return SLOT_PROMPTS[firstMissingSlot] ?? `I still need ${firstMissingSlot} to continue.`;
};

export const buildEntityClarificationReply = () =>
  "I could not resolve that reference yet. Please clarify which customer, vendor, or job you mean.";

export const buildConfirmationReply = (prompt: string) => prompt;

export const buildPendingFlowCanceledReply = () => "Okay, I have canceled the current workflow.";

export const buildPendingFlowShiftedReply = () => "I have dropped the previous workflow and switched context.";
