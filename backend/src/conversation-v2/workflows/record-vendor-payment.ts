export const recordVendorPaymentWorkflow = {
  name: "record_vendor_payment",
  requiredSlots: ["vendor_query", "amount_pence"] as const,
  optionalSlots: ["note", "occurred_on"] as const
};
