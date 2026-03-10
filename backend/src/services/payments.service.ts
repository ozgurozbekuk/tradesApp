import { PaymentMethod } from "@prisma/client";
import { prisma } from "../db/prisma";
import { JobsService } from "./jobs.service";

const jobsService = new JobsService();

export class PaymentsService {
  async addPayment(input: {
    userId: string;
    jobId: string;
    amountPence: number;
    method?: PaymentMethod;
    note?: string;
  }) {
    const job = await prisma.job.findFirst({
      where: {
        id: input.jobId,
        userId: input.userId
      }
    });

    if (!job) {
      throw new Error("Job not found");
    }

    const outstandingBefore = await jobsService.getJobOutstandingPence(input.jobId);
    if (outstandingBefore === null) {
      throw new Error("Job not found");
    }

    if (outstandingBefore <= 0) {
      throw new Error("Job has no outstanding balance");
    }

    if (input.amountPence > outstandingBefore) {
      throw new Error(`Payment exceeds outstanding balance (${outstandingBefore} pence)`);
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          userId: input.userId,
          jobId: input.jobId,
          amountPence: input.amountPence,
          method: input.method ?? PaymentMethod.unknown,
          paidAt: new Date(),
          note: input.note
        }
      });

      if (job.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: job.customerId },
          select: { id: true, balancePence: true }
        });

        if (customer) {
          await tx.customer.update({
            where: { id: customer.id },
            data: {
              balancePence: Math.max(customer.balancePence - input.amountPence, 0)
            }
          });
        }
      }

      return created;
    });

    const outstandingPence = await jobsService.getJobOutstandingPence(input.jobId);

    return {
      payment,
      outstandingPence: outstandingPence ?? 0
    };
  }

  async listPayments(input: {
    userId: string;
    range?: "today" | "yesterday" | "week" | "month" | "all";
    take?: number;
  }) {
    const now = new Date();
    const since = (() => {
      switch (input.range) {
        case "today": {
          const date = new Date(now);
          date.setHours(0, 0, 0, 0);
          return date;
        }
        case "yesterday": {
          const date = new Date(now);
          date.setDate(date.getDate() - 1);
          date.setHours(0, 0, 0, 0);
          return date;
        }
        case "week": {
          const date = new Date(now);
          date.setDate(date.getDate() - 7);
          return date;
        }
        case "month": {
          const date = new Date(now);
          date.setDate(date.getDate() - 30);
          return date;
        }
        default:
          return undefined;
      }
    })();
    const before =
      input.range === "yesterday"
        ? new Date(new Date(now).setHours(0, 0, 0, 0))
        : undefined;

    return prisma.payment.findMany({
      where: {
        userId: input.userId,
        ...(since
          ? {
              paidAt: {
                gte: since,
                ...(before ? { lt: before } : {})
              }
            }
          : {})
      },
      include: {
        job: {
          include: {
            customer: true
          }
        }
      },
      orderBy: [{ paidAt: "desc" }],
      take: input.take ?? 10
    });
  }
}
