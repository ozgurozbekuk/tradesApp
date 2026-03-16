export const createJobWorkflow = {
  name: "create_job",
  requiredSlots: ["customer_query", "title", "total_pence"] as const,
  optionalSlots: ["deposit_pence", "due_date", "notes"] as const
};
