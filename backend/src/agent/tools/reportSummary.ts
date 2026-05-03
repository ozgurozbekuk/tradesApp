import { ReportsService } from "../../services/reports.service";
import type { AppTool } from "./types";

type ReportSummaryArgs = {
  period: "today" | "yesterday" | "7d" | "30d";
};

const reportsService = new ReportsService();

export const reportSummaryTool: AppTool<ReportSummaryArgs> = {
  name: "report_summary",
  description: "Get a business summary report for today, yesterday, the last 7 days, or the last 30 days.",
  inputSchema: {
    type: "object",
    properties: {
      period: {
        type: "string",
        description: "Summary period",
        enum: ["today", "yesterday", "7d", "30d"]
      }
    },
    required: ["period"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    try {
      const summary = await reportsService.getSummary(ctx.userId, args.period);
      return {
        success: true,
        data: summary
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Could not build the summary report."
      };
    }
  }
};
