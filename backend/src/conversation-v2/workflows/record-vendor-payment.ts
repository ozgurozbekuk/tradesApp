// Declares the slot contract for a single Conversation V2 workflow.
export const recordVendorPaymentWorkflow = {
  name: "record_vendor_payment",
  requiredSlots: ["vendor_query", "amount_pence"] as const,
  optionalSlots: ["note", "occurred_on"] as const
};
