import { JobStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "../db/prisma";
import { CustomersService } from "./customers.service";

const customersService = new CustomersService();
export const SYSTEM_DEPOSIT_PAYMENT_NOTE = "Deposit recorded on job creation";

type JobPaymentLike = {
  amountPence: number;
  note: string | null;
};

type JobOutstandingLike = {
  priceTotalPence: number;
  depositPence: number | null;
  payments: JobPaymentLike[];
};

const getPaidPence = (payments: JobPaymentLike[]) => payments.reduce((sum, payment) => sum + payment.amountPence, 0);

export const getImplicitDepositPence = (job: JobOutstandingLike) => {
  const depositPence = job.depositPence ?? 0;
  if (depositPence <= 0) {
    return 0;
  }

  const hasDepositPayment = job.payments.some(
    (payment) => payment.note === SYSTEM_DEPOSIT_PAYMENT_NOTE && payment.amountPence === depositPence
  );

  return hasDepositPayment ? 0 : depositPence;
};

export const calculateJobOutstandingPence = (job: JobOutstandingLike) =>
  Math.max(job.priceTotalPence - getImplicitDepositPence(job) - getPaidPence(job.payments), 0);

export type CreateJobInput = {
  userId: string;
  customerName: string;
  customerPhone?: string;
  title: string;
  priceTotalPence: number;
  depositPence?: number;
  dueDate?: Date;
  notes?: string;
};

export type JobWithOutstanding = {
  id: string;
  title: string;
  dueDate: Date | null;
  customerName: string;
  priceTotalPence: number;
  paidPence: number;
  outstandingPence: number;
};

export type JobResolutionCandidate = {
  id: string;
  title: string;
  customerName: string;
  outstandingPence: number;
  dueDate: Date | null;
  createdAt: Date;
};

export class JobsService {
  async createJobForCustomerId(input: {
    userId: string;
    customerId: string;
    title: string;
    priceTotalPence: number;
    depositPence?: number;
    dueDate?: Date;
    notes?: string;
  }) {
    const customer = await prisma.customer.findFirst({
      where: {
        id: input.customerId,
        userId: input.userId
      }
    });

    if (!customer) {
      throw new Error("Customer not found");
    }

    const initialOutstandingPence = Math.max(
      input.priceTotalPence - (input.depositPence ?? 0),
      0
    );

    const job = await prisma.$transaction(async (tx) => {
      const createdJob = await tx.job.create({
        data: {
          userId: input.userId,
          customerId: customer.id,
          title: input.title,
          description: input.notes,
          dueDate: input.dueDate,
          priceTotalPence: input.priceTotalPence,
          depositPence: input.depositPence,
          status: JobStatus.active
        }
      });

      if ((input.depositPence ?? 0) > 0) {
        await tx.payment.create({
          data: {
            userId: input.userId,
            jobId: createdJob.id,
            amountPence: input.depositPence ?? 0,
            method: PaymentMethod.unknown,
            paidAt: new Date(),
            note: SYSTEM_DEPOSIT_PAYMENT_NOTE
          }
        });
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          balancePence: {
            increment: initialOutstandingPence
          }
        }
      });

      return createdJob;
    });

    return { job, customer };
  }

  async createJob(input: CreateJobInput) {
    const customer = await customersService.upsertByPhoneOrName({
      userId: input.userId,
      name: input.customerName,
      phone: input.customerPhone
    });

    const initialOutstandingPence = Math.max(
      input.priceTotalPence - (input.depositPence ?? 0),
      0
    );

    const job = await prisma.$transaction(async (tx) => {
      const createdJob = await tx.job.create({
        data: {
          userId: input.userId,
          customerId: customer.id,
          title: input.title,
          description: input.notes,
          dueDate: input.dueDate,
          priceTotalPence: input.priceTotalPence,
          depositPence: input.depositPence,
          status: JobStatus.active
        }
      });

      if ((input.depositPence ?? 0) > 0) {
        await tx.payment.create({
          data: {
            userId: input.userId,
            jobId: createdJob.id,
            amountPence: input.depositPence ?? 0,
            method: PaymentMethod.unknown,
            paidAt: new Date(),
            note: SYSTEM_DEPOSIT_PAYMENT_NOTE
          }
        });
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          balancePence: {
            increment: initialOutstandingPence
          }
        }
      });

      return createdJob;
    });

    return { job, customer };
  }

  async getJobOutstandingPence(jobId: string) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { payments: true }
    });

    if (!job) {
      return null;
    }

    return calculateJobOutstandingPence(job);
  }

  async listActiveJobsWithOutstanding(userId: string): Promise<JobWithOutstanding[]> {
    const jobs = await prisma.job.findMany({
      where: {
        userId,
        status: JobStatus.active
      },
      include: {
        customer: true,
        payments: true
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }]
    });

    return jobs.map((job) => {
      const paidPence = getPaidPence(job.payments);
      const outstandingPence = calculateJobOutstandingPence(job);

      return {
        id: job.id,
        title: job.title,
        dueDate: job.dueDate,
        customerName: job.customer?.name ?? "Unknown customer",
        priceTotalPence: job.priceTotalPence,
        paidPence,
        outstandingPence
      };
    });
  }

  async listOutstandingJobs(userId: string): Promise<JobWithOutstanding[]> {
    const jobs = await this.listActiveJobsWithOutstanding(userId);
    return jobs.filter((job) => job.outstandingPence > 0);
  }

  async listDueThisWeekJobs(userId: string): Promise<JobWithOutstanding[]> {
    const now = new Date();
    const end = new Date(now);
    end.setDate(now.getDate() + 7);

    const jobs = await this.listActiveJobsWithOutstanding(userId);
    return jobs.filter((job) => job.dueDate && job.dueDate >= now && job.dueDate <= end);
  }

  async listJobsCreatedLast30Days(userId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    return prisma.job.findMany({
      where: {
        userId,
        createdAt: {
          gte: since
        }
      },
      include: {
        customer: true
      },
      orderBy: [{ createdAt: "desc" }]
    });
  }

  async closeJob(input: { userId: string; jobId: string }) {
    const existing = await prisma.job.findFirst({
      where: {
        id: input.jobId,
        userId: input.userId
      }
    });

    if (!existing) {
      return null;
    }

    return prisma.job.update({
      where: { id: existing.id },
      data: { status: JobStatus.completed }
    });
  }

  async updateJobStatus(input: { userId: string; jobId: string; status: JobStatus }) {
    const existing = await prisma.job.findFirst({
      where: {
        id: input.jobId,
        userId: input.userId
      }
    });

    if (!existing) {
      return null;
    }

    return prisma.job.update({
      where: { id: existing.id },
      data: { status: input.status }
    });
  }

  async closeActiveJobsByCustomerId(input: { userId: string; customerId: string }) {
    const result = await prisma.job.updateMany({
      where: {
        userId: input.userId,
        customerId: input.customerId,
        status: JobStatus.active
      },
      data: {
        status: JobStatus.completed
      }
    });

    return result.count;
  }

  async findLatestOutstandingJobByCustomerName(input: { userId: string; customerName: string }) {
    const jobs = await prisma.job.findMany({
      where: {
        userId: input.userId,
        status: JobStatus.active,
        customer: {
          is: {
            name: {
              equals: input.customerName,
              mode: "insensitive"
            }
          }
        }
      },
      include: {
        customer: true,
        payments: true
      },
      orderBy: [{ createdAt: "desc" }]
    });

    return (
      jobs.find((job) => {
        return calculateJobOutstandingPence(job) > 0;
      }) ?? null
    );
  }

  async findOutstandingJobsByCustomerName(input: { userId: string; customerName: string }) {
    const jobs = await prisma.job.findMany({
      where: {
        userId: input.userId,
        status: JobStatus.active,
        customer: {
          is: {
            name: {
              equals: input.customerName,
              mode: "insensitive"
            }
          }
        }
      },
      include: {
        customer: true,
        payments: true
      },
      orderBy: [{ createdAt: "desc" }]
    });

    return jobs
      .map((job) => {
        const outstandingPence = calculateJobOutstandingPence(job);
        return {
          id: job.id,
          title: job.title,
          customerName: job.customer?.name ?? input.customerName,
          outstandingPence
        };
      })
      .filter((job) => job.outstandingPence > 0);
  }

  async findOutstandingJobsByCustomerId(input: { userId: string; customerId: string }) {
    const jobs = await prisma.job.findMany({
      where: {
        userId: input.userId,
        status: JobStatus.active,
        customerId: input.customerId
      },
      include: {
        customer: true,
        payments: true
      },
      orderBy: [{ createdAt: "desc" }]
    });

    return jobs
      .map((job) => {
        const outstandingPence = calculateJobOutstandingPence(job);
        return {
          id: job.id,
          title: job.title,
          customerName: job.customer?.name ?? "Unknown",
          outstandingPence
        };
      })
      .filter((job) => job.outstandingPence > 0);
  }

  async listResolutionCandidates(input: {
    userId: string;
    query: string;
    take?: number;
    outstandingOnly?: boolean;
  }): Promise<JobResolutionCandidate[]> {
    const tokens = input.query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .slice(0, 4);

    const jobs = await prisma.job.findMany({
      where: {
        userId: input.userId,
        status: JobStatus.active,
        OR: tokens.length
          ? tokens.flatMap((token) => [
              {
                title: {
                  contains: token,
                  mode: "insensitive"
                }
              },
              {
                customer: {
                  is: {
                    name: {
                      contains: token,
                      mode: "insensitive"
                    }
                  }
                }
              }
            ])
          : [
              {
                title: {
                  contains: input.query,
                  mode: "insensitive"
                }
              }
            ]
      },
      include: {
        customer: true,
        payments: true
      },
      orderBy: [{ createdAt: "desc" }],
      take: input.take ?? 50
    });

    return jobs
      .map((job) => {
        const outstandingPence = calculateJobOutstandingPence(job);
        return {
          id: job.id,
          title: job.title,
          customerName: job.customer?.name ?? "Unknown",
          outstandingPence,
          dueDate: job.dueDate,
          createdAt: job.createdAt
        };
      })
      .filter((job) => (input.outstandingOnly ? job.outstandingPence > 0 : true));
  }
}
