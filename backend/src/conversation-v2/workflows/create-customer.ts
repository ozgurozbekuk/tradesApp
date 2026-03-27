// Declares the slot contract for a single Conversation V2 workflow.
export const createCustomerWorkflow = {
  name: "create_customer",
  requiredSlots: ["customer_name"] as const,
  optionalSlots: ["customer_phone", "notes"] as const
};
