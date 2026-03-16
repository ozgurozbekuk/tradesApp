import { prisma } from "../db/prisma";
import { calculateJobOutstandingPence } from "./job-outstanding";

export type CustomerRecordSummary = {
  id: string;
  name: string;
  phone: string | null;
  activeJobs: number;
  outstandingPence: number;
  lastPaymentPence: number | null;
  lastPaymentAt: Date | null;
};

export type CustomerPdfCandidate = {
  id: string;
  name: string;
  phone: string | null;
  createdAt: Date;
};

export class CustomersService {
  normalizePhone(input: string) {
    const trimmed = input.trim();
    const hasPlus = trimmed.startsWith("+");
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 7) {
      return null;
    }
    return `${hasPlus ? "+" : ""}${digits}`;
  }

  async upsertByPhoneOrName(input: {
    userId: string;
    name: string;
    phone?: string;
    notes?: string;
  }) {
    const name = input.name.trim();
    const phone = input.phone?.trim();

    if (phone) {
      return prisma.customer.upsert({
        where: {
          userId_phone: {
            userId: input.userId,
            phone
          }
        },
        create: {
          userId: input.userId,
          name,
          phone,
          notes: input.notes
        },
        update: {
          name,
          notes: input.notes
        }
      });
    }

    const existing = await prisma.customer.findFirst({
      where: {
        userId: input.userId,
        name: {
          equals: name,
          mode: "insensitive"
        }
      }
    });

    if (existing) {
      return prisma.customer.update({
        where: { id: existing.id },
        data: {
          notes: input.notes
        }
      });
    }

    return prisma.customer.create({
      data: {
        userId: input.userId,
        name,
        notes: input.notes
      }
    });
  }

  findByNameContains(input: { userId: string; query: string }) {
    return prisma.customer.findMany({
      where: {
        userId: input.userId,
        name: {
          contains: input.query,
          mode: "insensitive"
        }
      },
      orderBy: [{ name: "asc" }],
      take: 5
    });
  }

  async findRecordsByName(input: { userId: string; query: string }): Promise<CustomerRecordSummary[]> {
    const customers = await prisma.customer.findMany({
      where: {
        userId: input.userId,
        name: {
          contains: input.query,
          mode: "insensitive"
        }
      },
      include: {
        jobs: {
          include: {
            payments: true
          }
        }
      },
      orderBy: [{ name: "asc" }],
      take: 5
    });

    return customers.map((customer) => {
    const activeJobs = customer.jobs.filter((job) => job.status === "active");
    const outstandingPence = activeJobs.reduce((sum, job) => {
      return sum + calculateJobOutstandingPence(job);
    }, 0);

      const allPayments = customer.jobs
        .flatMap((job) => job.payments)
        .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        activeJobs: activeJobs.length,
        outstandingPence,
        lastPaymentPence: allPayments[0]?.amountPence ?? null,
        lastPaymentAt: allPayments[0]?.paidAt ?? null
      };
    });
  }

  async findRecordByCustomerId(input: { userId: string; customerId: string }): Promise<CustomerRecordSummary | null> {
    const customer = await prisma.customer.findFirst({
      where: {
        userId: input.userId,
        id: input.customerId
      },
      include: {
        jobs: {
          include: {
            payments: true
          }
        }
      }
    });

    if (!customer) {
      return null;
    }

    const activeJobs = customer.jobs.filter((job) => job.status === "active");
    const outstandingPence = activeJobs.reduce((sum, job) => {
      return sum + calculateJobOutstandingPence(job);
    }, 0);

    const allPayments = customer.jobs
      .flatMap((job) => job.payments)
      .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      activeJobs: activeJobs.length,
      outstandingPence,
      lastPaymentPence: allPayments[0]?.amountPence ?? null,
      lastPaymentAt: allPayments[0]?.paidAt ?? null
    };
  }

  findPdfCandidatesByQuery(input: { userId: string; query: string; take?: number }): Promise<CustomerPdfCandidate[]> {
    return prisma.customer.findMany({
      where: {
        userId: input.userId,
        name: {
          contains: input.query,
          mode: "insensitive"
        }
      },
      select: {
        id: true,
        name: true,
        phone: true,
        createdAt: true
      },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      take: input.take ?? 8
    });
  }

  listResolutionCandidates(input: { userId: string; query: string; take?: number }): Promise<CustomerPdfCandidate[]> {
    const tokens = input.query
      .trim()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .slice(0, 3);

    return prisma.customer.findMany({
      where: {
        userId: input.userId,
        OR: tokens.length
          ? tokens.flatMap((token) => [
              {
                name: {
                  contains: token,
                  mode: "insensitive" as const
                }
              },
              {
                phone: {
                  contains: token
                }
              }
            ])
          : [
              {
                name: {
                  contains: input.query,
                  mode: "insensitive" as const
                }
              }
            ]
      },
      select: {
        id: true,
        name: true,
        phone: true,
        createdAt: true
      },
      orderBy: [{ createdAt: "desc" }],
      take: input.take ?? 80
    });
  }

  findPdfCandidatesByExactName(input: {
    userId: string;
    name: string;
    take?: number;
  }): Promise<CustomerPdfCandidate[]> {
    return prisma.customer.findMany({
      where: {
        userId: input.userId,
        name: {
          equals: input.name,
          mode: "insensitive"
        }
      },
      select: {
        id: true,
        name: true,
        phone: true,
        createdAt: true
      },
      orderBy: [{ createdAt: "desc" }],
      take: input.take ?? 8
    });
  }

  findCustomerById(input: { userId: string; customerId: string }) {
    return prisma.customer.findFirst({
      where: {
        userId: input.userId,
        id: input.customerId
      },
      select: {
        id: true,
        name: true,
        phone: true
      }
    });
  }

  async updateCustomerPhone(input: { userId: string; customerId: string; phone: string }) {
    const normalized = this.normalizePhone(input.phone);
    if (!normalized) {
      throw new Error("Invalid phone format");
    }

    return prisma.customer.update({
      where: {
        id: input.customerId
      },
      data: {
        phone: normalized
      }
    });
  }
}
