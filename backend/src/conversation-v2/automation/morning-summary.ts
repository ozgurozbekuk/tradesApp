// Implements an automated Conversation V2 workflow trigger.
import { ReportsService } from "../../services/reports.service";

export type MorningSummaryMessage = {
  userId: string;
  reply: string;
};

const penceToPounds = (value: number) => `£${(value / 100).toFixed(2)}`;

export const buildMorningSummaryMessage = async (
  userId: string,
  services?: { reports: ReportsService }
): Promise<MorningSummaryMessage> => {
  const reports = services?.reports ?? new ReportsService();
  const summary = await reports.getSummary(userId, "today");

  return {
    userId,
    reply: [
      "Good morning.",
      `Today's summary so far:`,
      `- ${summary.jobsCreated} jobs created`,
      `- ${summary.jobsCompleted} jobs completed`,
      `- ${penceToPounds(summary.paymentsReceivedPence)} received`,
      `- ${penceToPounds(summary.expensesPaidPence)} spent`,
      `- ${penceToPounds(summary.outstandingPence)} outstanding`
    ].join("\n")
  };
};
