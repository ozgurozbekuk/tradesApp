import { JobsService } from "../../services/jobs.service";
import type { AppTool } from "./types";

type ListDueThisWeekJobsArgs = Record<string, never>;

const jobsService = new JobsService();

export const listDueThisWeekJobsTool: AppTool<ListDueThisWeekJobsArgs> = {
  name: "list_due_this_week_jobs",
  description: "List active jobs due within the next 7 days.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false
  },

  async execute(_args, ctx) {
    const jobs = await jobsService.listDueThisWeekJobs(ctx.userId);

    return {
      success: true,
      data: {
        count: jobs.length,
        jobs: jobs.map((job) => ({
          id: job.id,
          title: job.title,
          customerName: job.customerName,
          dueDate: job.dueDate?.toISOString() ?? null,
          priceTotalPence: job.priceTotalPence,
          paidPence: job.paidPence,
          outstandingPence: job.outstandingPence
        }))
      }
    };
  }
};
