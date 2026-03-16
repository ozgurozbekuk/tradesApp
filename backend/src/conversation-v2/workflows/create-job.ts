export const createJobWorkflow = {
  name: "create_job",
  requiredSlots: ["customer_query", "title", "total_pence"] as const
};

