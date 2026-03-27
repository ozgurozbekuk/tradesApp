// Declares the slot contract for a single Conversation V2 workflow.
export const exportVendorPdfWorkflow = {
  name: "export_vendor_pdf",
  requiredSlots: [] as const,
  optionalSlots: ["vendor_query"] as const
};
