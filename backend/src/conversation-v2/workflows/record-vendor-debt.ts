// Declares the slot contract for a single Conversation V2 workflow.
export const recordVendorDebtWorkflow = {
  name: "record_vendor_debt",
  requiredSlots: ["vendor_query", "amount_pence"] as const,
  optionalSlots: ["note", "occurred_on"] as const
};
