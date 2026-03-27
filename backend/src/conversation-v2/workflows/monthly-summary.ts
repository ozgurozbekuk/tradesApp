// Declares the slot contract for a single Conversation V2 workflow.
export const monthlySummaryWorkflow = {
  name: "monthly_summary",
  requiredSlots: [] as const,
  optionalSlots: ["month", "year"] as const
};
