import { AgentIntentName } from "./agent-types";

const formatFieldLabel = (field: string) => {
  switch (field) {
    case "query":
      return "customer";
    case "amount":
    case "amountPence":
      return "amount";
    case "scope":
      return "job list type";
    case "range":
      return "time period";
    case "customer":
    case "customerQuery":
    case "customerName":
    case "name":
      return "customer";
    case "vendorQuery":
      return "vendor";
    case "job":
    case "jobId":
      return "job";
    case "title":
      return "job title";
    case "total":
    case "totalPence":
      return "total price";
    case "phone":
      return "phone number";
    default:
      return field;
  }
};

export const buildClarificationQuestion = (input: {
  intent: AgentIntentName;
  entities: Record<string, unknown>;
  missingFields: string[];
}) => {
  const missing = input.missingFields[0];
  if (!missing) {
    return undefined;
  }

  const customer =
    typeof input.entities.customerQuery === "string"
      ? input.entities.customerQuery
      : typeof input.entities.customerName === "string"
        ? input.entities.customerName
        : undefined;

  if (input.intent === "record_payment" && missing === "amount" && customer) {
    return `I can add a payment for ${customer}. How much is it?`;
  }

  if (input.intent === "record_expense" && (missing === "amount" || missing === "amountPence")) {
    return "I can log the expense. How much was it?";
  }

  if (input.intent === "record_payment" && (missing === "customer" || missing === "customerQuery")) {
    return "I can record the payment. Which customer or job is it for?";
  }

  if (input.intent === "create_customer" && (missing === "customer" || missing === "customerQuery")) {
    return "What is the customer name?";
  }

  if (input.intent === "create_job" && missing === "customer") {
    return "Customer name is missing. Who should I create the job for?";
  }

  if (input.intent === "create_job" && missing === "title" && customer) {
    return `I can create a job for ${customer}. What is the job title?`;
  }

  if (input.intent === "create_job" && (missing === "total" || missing === "totalPence")) {
    return "I can create that job. What is the total price?";
  }

  if (input.intent === "record_vendor_debt" && missing === "vendorQuery") {
    return "Which vendor should I add the debt to?";
  }

  if (input.intent === "record_vendor_debt" && (missing === "amount" || missing === "amountPence")) {
    return "I can add the vendor debt. How much is it?";
  }

  if (input.intent === "record_vendor_payment" && missing === "vendorQuery") {
    return "Which vendor is the payment for?";
  }

  if (input.intent === "record_vendor_payment" && (missing === "amount" || missing === "amountPence")) {
    return "I can record the vendor payment. How much is it?";
  }

  if (input.intent === "update_job_status" && (missing === "job" || missing === "jobId")) {
    return "Which job should I mark as completed?";
  }

  if (input.intent === "create_invoice" && (missing === "customer" || missing === "customerQuery")) {
    return "Which customer should I create the invoice for?";
  }

  if (input.intent === "get_customer_account" && (missing === "customer" || missing === "customerQuery")) {
    return "Which customer account should I open?";
  }

  if (input.intent === "search_customer" && (missing === "customer" || missing === "customerQuery")) {
    return "Which customer should I look up?";
  }

  if (input.intent === "list_payments" && missing === "range") {
    return "Which period do you want for the payments?";
  }

  if (input.intent === "list_jobs" && missing === "scope") {
    return "Do you want active jobs, jobs due this week, or jobs from the last 30 days?";
  }

  if (input.intent === "export_all_records" && (missing === "customer" || missing === "customerQuery")) {
    return "Which customer records should I export?";
  }

  return `I need the ${formatFieldLabel(missing)} to continue.`;
};
