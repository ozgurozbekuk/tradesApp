export const recordVendorDebtWorkflow = {
  name: "record_vendor_debt",
  requiredSlots: ["vendor_query", "amount_pence"] as const,
  optionalSlots: ["note", "occurred_on"] as const
};
