// Declares the slot contract for a single Conversation V2 workflow.
export const exportRecordsPdfWorkflow = {
  name: "export_records_pdf",
  requiredSlots: [] as const,
  optionalSlots: ["customer_query"] as const
};
