// Provides a backend service layer for a focused business domain.
import { prisma } from "../db/prisma";

export type VendorCandidate = {
  id: string;
  vendorName: string;
  balancePence: number;
};

export const normalizeVendorName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export class VendorPaymentsService {
  private db = prisma as unknown as {
    vendorLedger: {
      findMany: (args: unknown) => Promise<Array<{ id: string; vendorName: string; balancePence: number }>>;
      upsert: (args: unknown) => Promise<{ id: string; vendorName: string; balancePence: number }>;
      findFirst: (args: unknown) => Promise<{ id: string; vendorName: string; balancePence: number } | null>;
      update: (args: unknown) => Promise<{ id: string; vendorName: string; balancePence: number }>;
    };
    moneyTransaction: {
      create: (args: unknown) => Promise<unknown>;
      findMany: (args: unknown) => Promise<
        Array<{
          kind: string;
          amountPence: number;
          occurredAt: Date;
          note?: string | null;
          counterpartyName?: string | null;
          vendor?: { vendorName: string } | null;
        }>
      >;
    };
    $transaction: typeof prisma.$transaction;
  };

  private asTxClient(tx: unknown) {
    return tx as unknown as Omit<typeof this.db, "$transaction">;
  }

  resolveVendorByQuery(input: { userId: string; query: string; take?: number }) {
    const normalizedQuery = normalizeVendorName(input.query);
    if (!normalizedQuery) {
      return Promise.resolve([]);
    }

    return this.db.vendorLedger
      .findMany({
        where: {
          userId: input.userId,
          OR: [
            {
              vendorNameNormalized: {
                equals: normalizedQuery
              }
            },
            {
              vendorNameNormalized: {
                startsWith: normalizedQuery
              }
            },
            {
              vendorNameNormalized: {
                contains: normalizedQuery
              }
            }
          ]
        },
        select: {
          id: true,
          vendorName: true,
          balancePence: true
        },
        orderBy: [{ vendorName: "asc" }],
        take: 50
      })
      .then((candidates: Array<{ id: string; vendorName: string; balancePence: number }>) => {
        const score = (name: string) => {
          const normalizedName = normalizeVendorName(name);
          if (normalizedName === normalizedQuery) {
            return 300;
          }
          if (normalizedName.startsWith(normalizedQuery)) {
            return 200;
          }
          if (normalizedName.includes(normalizedQuery)) {
            return 100;
          }
          return 0;
        };

        return candidates
          .map((candidate) => ({
            ...candidate,
            _score: score(candidate.vendorName)
          }))
          .sort((a, b) => b._score - a._score || a.vendorName.localeCompare(b.vendorName))
          .slice(0, input.take ?? 8)
          .map(({ ...candidate }) => ({
            id: candidate.id,
            vendorName: candidate.vendorName,
            balancePence: candidate.balancePence
          }));
      });
  }

  async addExpensePaid(input: {
    userId: string;
    amountPence: number;
    note?: string;
    counterpartyName?: string;
    occurredAt?: Date;
  }) {
    return this.db.moneyTransaction.create({
      data: {
        userId: input.userId,
        kind: "expense_paid",
        direction: "outflow",
        amountPence: input.amountPence,
        note: input.note,
        counterpartyName: input.counterpartyName,
        occurredAt: input.occurredAt ?? new Date()
      }
    });
  }

  async addVendorDebt(input: {
    userId: string;
    vendorName: string;
    amountPence: number;
    note?: string;
    occurredAt?: Date;
  }) {
    const normalized = normalizeVendorName(input.vendorName);
    if (!normalized) {
      throw new Error("Invalid vendor name");
    }

    return prisma.$transaction(async (tx) => {
      const txClient = this.asTxClient(tx);
      const ledger = await txClient.vendorLedger.upsert({
        where: {
          userId_vendorNameNormalized: {
            userId: input.userId,
            vendorNameNormalized: normalized
          }
        },
        create: {
          userId: input.userId,
          vendorName: input.vendorName.trim(),
          vendorNameNormalized: normalized,
          balancePence: input.amountPence
        },
        update: {
          vendorName: input.vendorName.trim(),
          balancePence: {
            increment: input.amountPence
          }
        }
      });

      await txClient.moneyTransaction.create({
        data: {
          userId: input.userId,
          vendorId: ledger.id,
          kind: "vendor_debt_added",
          direction: "outflow",
          amountPence: input.amountPence,
          counterpartyName: ledger.vendorName,
          note: input.note,
          occurredAt: input.occurredAt ?? new Date()
        }
      });

      return ledger;
    });
  }

  async addVendorPaymentByVendorId(input: {
    userId: string;
    vendorId: string;
    amountPence: number;
    note?: string;
    occurredAt?: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      const txClient = this.asTxClient(tx);
      const ledger = await txClient.vendorLedger.findFirst({
        where: {
          userId: input.userId,
          id: input.vendorId
        }
      });

      if (!ledger) {
        throw new Error("Vendor not found");
      }

      if (ledger.balancePence <= 0) {
        throw new Error("Vendor has no outstanding balance");
      }

      if (input.amountPence > ledger.balancePence) {
        throw new Error(`Payment exceeds vendor balance (${ledger.balancePence} pence)`);
      }

      const updated = await txClient.vendorLedger.update({
        where: { id: ledger.id },
        data: {
          balancePence: {
            decrement: input.amountPence
          }
        }
      });

      await txClient.moneyTransaction.create({
        data: {
          userId: input.userId,
          vendorId: ledger.id,
          kind: "vendor_payment_made",
          direction: "outflow",
          amountPence: input.amountPence,
          counterpartyName: ledger.vendorName,
          note: input.note,
          occurredAt: input.occurredAt ?? new Date()
        }
      });

      return updated;
    });
  }

  async getSummary(input: { userId: string; days?: number }) {
    const days = input.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [ledgers, txs] = await Promise.all([
      this.db.vendorLedger.findMany({
        where: { userId: input.userId }
      }),
      this.db.moneyTransaction.findMany({
        where: {
          userId: input.userId,
          occurredAt: {
            gte: since
          }
        }
      })
    ]);

    const vendorOutstandingPence = ledgers.reduce(
      (sum: number, ledger: { balancePence: number }) => sum + ledger.balancePence,
      0
    );
    const expensePaidPence = txs
      .filter((tx: { kind: string }) => tx.kind === "expense_paid")
      .reduce((sum: number, tx: { amountPence: number }) => sum + tx.amountPence, 0);
    const vendorDebtAddedPence = txs
      .filter((tx: { kind: string }) => tx.kind === "vendor_debt_added")
      .reduce((sum: number, tx: { amountPence: number }) => sum + tx.amountPence, 0);
    const vendorPaymentPence = txs
      .filter((tx: { kind: string }) => tx.kind === "vendor_payment_made")
      .reduce((sum: number, tx: { amountPence: number }) => sum + tx.amountPence, 0);

    return {
      days,
      vendorOutstandingPence,
      expensePaidPence,
      vendorDebtAddedPence,
      vendorPaymentPence
    };
  }

  listVendorLedgers(userId: string) {
    return this.db.vendorLedger.findMany({
      where: { userId },
      orderBy: [{ vendorName: "asc" }]
    });
  }

  listMoneyTransactions(userId: string) {
    return this.db.moneyTransaction.findMany({
      where: { userId },
      include: {
        vendor: true
      },
      orderBy: [{ occurredAt: "desc" }]
    });
  }
}
