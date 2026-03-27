// Declares the slot contract for a single Conversation V2 workflow.
export const expenseListWorkflow = {
  name: "expense_list",
  requiredSlots: [] as const,
  optionalSlots: ["range"] as const
};
