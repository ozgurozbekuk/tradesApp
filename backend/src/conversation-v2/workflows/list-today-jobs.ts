// Declares the slot contract for a single Conversation V2 workflow.
export const listTodayJobsWorkflow = {
  name: "list_today_jobs",
  requiredSlots: [] as const,
  optionalSlots: ["scope"] as const
};
