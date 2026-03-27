// Declares the slot contract for a single Conversation V2 workflow.
export const updateJobStatusWorkflow = {
  name: "update_job_status",
  requiredSlots: ["job_query", "status"] as const,
  optionalSlots: [] as const
};
