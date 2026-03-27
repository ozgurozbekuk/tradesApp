// Declares the slot contract for a single Conversation V2 workflow.
export const customerRecordsWorkflow = {
  name: "customer_records",
  requiredSlots: ["customer_query"] as const,
  optionalSlots: [] as const
};
