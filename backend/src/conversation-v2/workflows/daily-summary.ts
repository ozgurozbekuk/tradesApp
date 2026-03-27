// Declares the slot contract for a single Conversation V2 workflow.
export const dailySummaryWorkflow = {
  name: "daily_summary",
  requiredSlots: [] as const,
  optionalSlots: ["scope"] as const
};
