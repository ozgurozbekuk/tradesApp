// Declares the slot contract for a single Conversation V2 workflow.
export const recordCustomerPaymentWorkflow = {
  name: "record_customer_payment",
  requiredSlots: ["customer_query", "amount_pence"] as const,
  optionalSlots: ["method", "note", "job_query"] as const
};
