// Provides a backend service layer for a focused business domain.
import { JobStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { calculateJobOutstandingPence } from "./job-outstanding";

export type SummaryReport = {
  jobsCreated: number;
  jobsCompleted: number;
  revenuePence: number;
  paymentsReceivedPence: number;
  expensesPaidPence: number;
  outstandingPence: number;
};

export class ReportsService {
  async getSummary(userId: string, period: "today" | "yesterday" | "7d" | "30d"): Promise<SummaryReport> {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (period === "today") {
      start.setHours(0, 0, 0, 0);
    } else if (period === "yesterday") {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else {
      const days = period === "30d" ? 30 : 7;
      start.setDate(start.getDate() - days);
    }

    const [jobsCreated, jobsCompleted, completedJobs, payments, expenses, activeJobs] = await Promise.all([
      prisma.job.count({
        where: {
          userId,
          createdAt: {
            gte: start,
            lte: end
          }
        }
      }),
      prisma.job.count({
        where: {
          userId,
          status: JobStatus.completed,
          updatedAt: {
            gte: start,
            lte: end
          }
        }
      }),
      prisma.job.findMany({
        where: {
          userId,
          status: JobStatus.completed,
          updatedAt: {
            gte: start,
            lte: end
          }
        },
        select: {
          priceTotalPence: true
        }
      }),
      prisma.payment.findMany({
        where: {
          userId,
          paidAt: {
            gte: start,
            lte: end
          }
        },
        select: {
          amountPence: true
        }
      }),
      prisma.moneyTransaction.findMany({
        where: {
          userId,
          kind: "expense_paid",
          occurredAt: {
            gte: start,
            lte: end
          }
        },
        select: {
          amountPence: true
        }
      }),
      prisma.job.findMany({
        where: {
          userId,
          status: JobStatus.active
        },
        include: {
          payments: true
        }
      })
    ]);

    const revenuePence = completedJobs.reduce((sum, job) => sum + job.priceTotalPence, 0);
    const paymentsReceivedPence = payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    const expensesPaidPence = expenses.reduce((sum, expense) => sum + expense.amountPence, 0);

    const outstandingPence = activeJobs.reduce((sum, job) => {
      return sum + calculateJobOutstandingPence(job);
    }, 0);

    return {
      jobsCreated,
      jobsCompleted,
      revenuePence,
      paymentsReceivedPence,
      expensesPaidPence,
      outstandingPence
    };
  }
}
