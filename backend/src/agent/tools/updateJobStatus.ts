import { JobStatus } from "@prisma/client";
import { JobsService } from "../../services/jobs.service";
import { resolveActiveJobByQuery } from "../resolves/jobResolver";
import type { AppTool } from "./types";

type UpdateJobStatusArgs = {
  jobQuery: string;
  status: JobStatus;
};

const jobsService = new JobsService();

export const updateJobStatusTool: AppTool<UpdateJobStatusArgs> = {
  name: "update_job_status",
  description: "Update the status of an active job using the job title or customer name.",
  inputSchema: {
    type: "object",
    properties: {
      jobQuery: {
        type: "string",
        description: "Job title or customer name for the active job"
      },
      status: {
        type: "string",
        description: "New job status",
        enum: ["active", "completed", "canceled"]
      }
    },
    required: ["jobQuery", "status"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const jobQuery = args.jobQuery?.trim();
    const status = args.status;

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

    const job = await jobsService.updateJobStatus({
      userId: ctx.userId,
      jobId: match.job.id,
      status
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
