// Declares the slot contract for a single Conversation V2 workflow.
export const updateJobStatusWorkflow = {
  name: "update_job_status",
  requiredSlots: ["status"] as const,
  optionalSlots: ["job_query", "apply_to_all"] as const
};
