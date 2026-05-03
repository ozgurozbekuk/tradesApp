import { JobsService } from "../../services/jobs.service";

const jobsService = new JobsService();

export type JobMatchResult =
  | { type: "not_found" }
  | {
      type: "single";
      job: {
        id: string;
        title: string;
        customerName: string;
        outstandingPence: number;
        dueDate: Date | null;
        createdAt: Date;
      };
    }
  | {
      type: "multiple";
      jobs: Array<{
        id: string;
        title: string;
        customerName: string;
        outstandingPence: number;
        dueDate: Date | null;
        createdAt: Date;
      }>;
    };

export const resolveActiveJobByQuery = async (input: {
  userId: string;
  query: string;
}): Promise<JobMatchResult> => {
  const jobs = await jobsService.listResolutionCandidates({
    userId: input.userId,
    query: input.query,
    take: 8
  });

  if (jobs.length === 0) {
    return { type: "not_found" };
  }

  if (jobs.length === 1) {
    return {
      type: "single",
      job: jobs[0]
    };
  }

  return {
    type: "multiple",
    jobs
  };
};
