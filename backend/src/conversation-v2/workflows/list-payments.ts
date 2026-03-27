// Declares the slot contract for a single Conversation V2 workflow.
export const listPaymentsWorkflow = {
  name: "list_payments",
  requiredSlots: [] as const,
  optionalSlots: ["range"] as const
};
