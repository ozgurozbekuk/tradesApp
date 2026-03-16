export const recordExpenseWorkflow = {
  name: "record_expense",
  requiredSlots: ["amount_pence"] as const,
  optionalSlots: ["category", "note", "occurred_on", "vendor_query"] as const
};
