import type {
  ConfirmationState,
  EntityResolutionResult,
  WorkflowExecutionResult,
  WorkflowName
} from "../engine/contracts";

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
  status: "What status should I set: active, completed, or canceled?",
  category: "Which expense category should I use?",
  month: "Which month do you want?",
  year: "Which year do you want?"
};

const WORKFLOW_LABELS: Record<WorkflowName, string> = {
  create_customer: "customer creation",
  record_vendor_debt: "vendor debt",
  record_vendor_payment: "vendor payment",
  create_job: "job creation",
  update_job_status: "job status update",
  list_today_jobs: "today's jobs",
  record_expense: "expense logging",
  daily_summary: "daily summary",
  monthly_summary: "monthly summary"
};

export const buildUnsupportedReply = () =>
  "This request is not supported by Conversation V2 yet. Falling back to the existing flow is expected.";

export const buildWorkflowReply = (result: WorkflowExecutionResult) => result.reply;

export const buildMissingSlotPrompt = (input: {
  workflow: WorkflowName;
  missingSlots: string[];
  validationErrors?: string[];
}) => {
  if (input.validationErrors && input.validationErrors.length > 0) {
    return input.validationErrors[0];
  }

  const firstMissingSlot = input.missingSlots[0];
  if (!firstMissingSlot) {
    return `I need a bit more information to continue with ${WORKFLOW_LABELS[input.workflow]}.`;
  }

  return SLOT_PROMPTS[firstMissingSlot] ?? `I still need ${firstMissingSlot} to continue.`;
};

export const buildEntityClarificationReply = (input: {
  workflow: WorkflowName;
  entityState: EntityResolutionResult;
}) => {
  if (input.entityState.status === "ambiguous") {
    const options = input.entityState.candidates.slice(0, 5).map((candidate) => candidate.label).join(", ");
    return `I found more than one match for ${WORKFLOW_LABELS[input.workflow]}. Please choose one: ${options}.`;
  }

  if (input.entityState.status === "not_found") {
    switch (input.workflow) {
      case "record_vendor_payment":
        return `I could not find a vendor matching "${input.entityState.unresolvedQuery}". Which vendor do you mean?`;
      case "create_job":
        return `I could not find a customer matching "${input.entityState.unresolvedQuery}". Create the customer first or give me a different customer.`;
      case "update_job_status":
        return `I could not find a job matching "${input.entityState.unresolvedQuery}". Which job do you want to update?`;
      case "record_expense":
        return `I could not find a vendor matching "${input.entityState.unresolvedQuery}". You can give me a different vendor or continue without one.`;
      default:
        return `I could not resolve "${input.entityState.unresolvedQuery}". Please clarify the customer, vendor, or job you mean.`;
    }
  }

  return "I could not resolve that reference yet. Please clarify which customer, vendor, or job you mean.";
};

export const buildConfirmationReply = (confirmation: ConfirmationState) => confirmation.prompt;

export const buildPendingFlowCanceledReply = () => "Okay, I have canceled the current workflow.";

export const buildPendingFlowShiftedReply = () => "I have dropped the previous workflow and switched context.";
