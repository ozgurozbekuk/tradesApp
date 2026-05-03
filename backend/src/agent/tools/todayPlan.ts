import { RemindersService } from "../../services/reminders.service";
import type { AppTool } from "./types";

type TodayPlanArgs = {
  timezone?: string | null;
};

const remindersService = new RemindersService();

export const todayPlanTool: AppTool<TodayPlanArgs> = {
  name: "today_plan",
  description: "Show today's plan including bookings, due-soon jobs, overdue jobs, and outstanding total.",
  inputSchema: {
    type: "object",
    properties: {
      timezone: {
        type: ["string", "null"],
        description: "Optional IANA timezone such as Europe/London"
      }
    },
    required: ["timezone"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    try {
      const plan = await remindersService.buildTodayPlan({
        userId: ctx.userId,
        timezone: args.timezone?.trim() || undefined
      });

      return {
        success: true,
        data: {
          timezone: plan.timezone,
          scheduledToday: plan.scheduledToday,
          dueSoonCount: plan.dueSoonCount,
          overdueCount: plan.overdueCount,
          outstandingTotalPence: plan.outstandingTotalPence,
          todayJobs: plan.todayJobs,
          dueSoonJobs: plan.dueSoonJobs
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Could not build today's plan."
      };
    }
  }
};
