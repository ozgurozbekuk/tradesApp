import { JobsService } from "../../services/jobs.service";
import type { AppTool } from "./types";

type ListRecentJobsArgs = Record<string, never>;

const jobsService = new JobsService();

export const listRecentJobsTool: AppTool<ListRecentJobsArgs> = {
  name: "list_recent_jobs",
  description: "List jobs created in the last 30 days.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false
  },

  async execute(_args, ctx) {
    const jobs = await jobsService.listJobsCreatedLast30Days(ctx.userId);

    return {
      success: true,
      data: {
        count: jobs.length,
        jobs: jobs.map((job) => ({
          id: job.id,
          title: job.title,
          status: job.status,
          customerName: job.customer?.name ?? null,
          dueDate: job.dueDate?.toISOString() ?? null,
          createdAt: job.createdAt.toISOString(),
          priceTotalPence: job.priceTotalPence,
          depositPence: job.depositPence ?? null
        }))
      }
    };
  }
};
