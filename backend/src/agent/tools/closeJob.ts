import { JobsService } from "../../services/jobs.service";
import { resolveActiveJobByQuery } from "../resolves/jobResolver";
import type { AppTool } from "./types";

type CloseJobArgs = {
  jobQuery: string;
};

const jobsService = new JobsService();

export const closeJobTool: AppTool<CloseJobArgs> = {
  name: "close_job",
  description: "Mark an active job as completed using the job title or customer name.",
  inputSchema: {
    type: "object",
    properties: {
      jobQuery: {
        type: "string",
        description: "Job title or customer name for the active job"
      }
    },
    required: ["jobQuery"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const jobQuery = args.jobQuery?.trim();

    if (!jobQuery) {
      return {
        success: false,
        message: "Job query is required."
      };
    }

    const match = await resolveActiveJobByQuery({
      userId: ctx.userId,
      query: jobQuery
    });

    if (match.type === "not_found") {
      return {
        success: false,
        message: `No active job found for "${jobQuery}".`
      };
    }

    if (match.type === "multiple") {
      return {
        success: false,
        message: `Multiple active jobs matched "${jobQuery}".`,
        data: {
          matchType: "multiple",
          jobs: match.jobs
        }
      };
    }

    const job = await jobsService.closeJob({
      userId: ctx.userId,
      jobId: match.job.id
    });

    if (!job) {
      return {
        success: false,
        message: "Job not found."
      };
    }

    return {
      success: true,
      data: {
        job: {
          id: job.id,
          title: job.title,
          status: job.status
        },
        customerName: match.job.customerName
      }
    };
  }
};
