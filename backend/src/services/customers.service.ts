// Provides a backend service layer for a focused business domain.
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
  recentJobs: Array<{
    title: string;
    status: string;
    dueDate: Date | null;
  }>;
};

export type CustomerPdfCandidate = {
  id: string;
  name: string;
  phone: string | null;
  createdAt: Date;
  latestActiveJobTitle?: string | null;
};

export class CustomersService {
  normalizeName(input: string) {
    return input
      .trim()
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/\s+/g, " ");
  }

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
        lastPaymentAt: allPayments[0]?.paidAt ?? null,
        recentJobs: customer.jobs.slice(0, 3).map((job) => ({
          title: job.title,
          status: job.status,
          dueDate: job.dueDate
        }))
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
      lastPaymentAt: allPayments[0]?.paidAt ?? null,
      recentJobs: customer.jobs.slice(0, 3).map((job) => ({
        title: job.title,
        status: job.status,
        dueDate: job.dueDate
      }))
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
        createdAt: true,
        jobs: {
          select: {
            title: true
          },
          orderBy: [{ createdAt: "desc" }],
          take: 1
        }
      },
      orderBy: [{ createdAt: "desc" }],
      take: input.take ?? 80
    }).then((customers) =>
      customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        createdAt: customer.createdAt,
        latestActiveJobTitle: customer.jobs[0]?.title ?? null
      }))
    );
  }

  async listStrictResolutionCandidates(input: {
    userId: string;
    query: string;
    phone?: string;
    take?: number;
  }): Promise<CustomerPdfCandidate[]> {
    const normalizedQuery = this.normalizeName(input.query);
    const normalizedPhone = input.phone ? this.normalizePhone(input.phone) : null;

    const customers = await prisma.customer.findMany({
      where: {
        userId: input.userId,
        OR: normalizedPhone
          ? [
              {
                phone: normalizedPhone
              },
              {
                name: {
                  equals: input.query.trim(),
                  mode: "insensitive"
                }
              }
            ]
          : [
              {
                name: {
                  equals: input.query.trim(),
                  mode: "insensitive"
                }
              }
            ]
      },
      select: {
        id: true,
        name: true,
        phone: true,
        createdAt: true,
        jobs: {
          select: {
            title: true
          },
          orderBy: [{ createdAt: "desc" }],
          take: 1
        }
      },
      orderBy: [{ createdAt: "desc" }],
      take: input.take ?? 20
    });

    return customers
      .filter((customer) => {
        if (normalizedPhone && customer.phone === normalizedPhone) {
          return true;
        }

        return this.normalizeName(customer.name) === normalizedQuery;
      })
      .map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        createdAt: customer.createdAt,
        latestActiveJobTitle: customer.jobs[0]?.title ?? null
      }));
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
