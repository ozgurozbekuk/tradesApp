import type { AppTool } from "./tools/types";
import type { FunctionTool } from "openai/resources/responses/responses";
import { findCustomerTool } from "./tools/findCustomer";
import { exportCustomerRecordTool } from "./tools/exportCustomerRecord";
import { exportInvoiceTool } from "./tools/exportInvoice";
import { addCustomerTool } from "./tools/addCustomer";
import { createJobTool } from "./tools/createJob";
import { addPaymentTool } from "./tools/addPayment";
import { listCustomerRecordsTool } from "./tools/listCustomerRecords";
import { listOutstandingJobsTool } from "./tools/listOutstandingJobs";
import { todayPlanTool } from "./tools/todayPlan";
import { createBookingTool } from "./tools/createBooking";
import { addExpenseTool } from "./tools/addExpense";
import { addVendorDebtTool } from "./tools/addVendorDebt";
import { addVendorPaymentTool } from "./tools/addVendorPayment";
import { reportSummaryTool } from "./tools/reportSummary";
import { closeJobTool } from "./tools/closeJob";
import { updateJobStatusTool } from "./tools/updateJobStatus";
import { closeCustomerJobsTool } from "./tools/closeCustomerJobs";
import { listDueThisWeekJobsTool } from "./tools/listDueThisWeekJobs";
import { listRecentJobsTool } from "./tools/listRecentJobs";

const toRegisteredTool = (tool: AppTool) => tool;

export const toolRegistry = [
  toRegisteredTool(addCustomerTool as unknown as AppTool),
  toRegisteredTool(createJobTool as unknown as AppTool),
  toRegisteredTool(addPaymentTool as unknown as AppTool),
  toRegisteredTool(createBookingTool as unknown as AppTool),
  toRegisteredTool(addExpenseTool as unknown as AppTool),
  toRegisteredTool(addVendorDebtTool as unknown as AppTool),
  toRegisteredTool(addVendorPaymentTool as unknown as AppTool),
  toRegisteredTool(closeJobTool as unknown as AppTool),
  toRegisteredTool(updateJobStatusTool as unknown as AppTool),
  toRegisteredTool(closeCustomerJobsTool as unknown as AppTool),
  toRegisteredTool(findCustomerTool as unknown as AppTool),
  toRegisteredTool(listCustomerRecordsTool as unknown as AppTool),
  toRegisteredTool(listOutstandingJobsTool as unknown as AppTool),
  toRegisteredTool(listDueThisWeekJobsTool as unknown as AppTool),
  toRegisteredTool(listRecentJobsTool as unknown as AppTool),
  toRegisteredTool(reportSummaryTool as unknown as AppTool),
  toRegisteredTool(todayPlanTool as unknown as AppTool),
  toRegisteredTool(exportCustomerRecordTool as unknown as AppTool),
  toRegisteredTool(exportInvoiceTool as unknown as AppTool)
];

export const toolMap = new Map(toolRegistry.map((tool) => [tool.name, tool] as const));

export const toolDefinitions: FunctionTool[] = toolRegistry.map((tool) => ({
  type: "function",
  name: tool.name,
  description: tool.description,
  parameters: tool.inputSchema,
  strict: true
}));
