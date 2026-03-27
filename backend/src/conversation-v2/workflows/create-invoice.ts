// Declares the slot contract for a single Conversation V2 workflow.
export const createInvoiceWorkflow = {
  name: "create_invoice",
  requiredSlots: [] as const,
  optionalSlots: ["customer_query"] as const
};
