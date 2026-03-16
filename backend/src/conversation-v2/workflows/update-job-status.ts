export const updateJobStatusWorkflow = {
  name: "update_job_status",
  requiredSlots: ["job_query", "status"] as const,
  optionalSlots: [] as const
};
