import { JobStatus } from "@prisma/client";
import { getAuth, requireAuth } from "@clerk/express";
import { Router } from "express";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import {
  createOtpCode,
  getOtpExpiry,
  hashOtpCode,
  sendVerificationSms
} from "../services/sms-verification.service";

export const accountRouter = Router();

const normalizePhone = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("+")) {
    return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  }
  return `+${trimmed.replace(/\D/g, "")}`;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const getRequiredClerkUserId = (input: { userId: string | null | undefined }) => {
  const userId = input.userId?.trim();
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  return userId;
};

accountRouter.use("/api", requireAuth());

accountRouter.get("/api/account/me", async (req, res) => {
  const auth = getAuth(req);
  const clerkUserId = getRequiredClerkUserId({ userId: auth.userId });

  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: {
      id: true,
      clerkUserId: true,
      email: true,
      phone: true,
      businessName: true,
      businessAddress: true,
      businessPhone: true,
      businessIban: true,
      phoneVerifiedAt: true,
      whatsappActivatedAt: true
    }
  });

  return res.status(200).json({
    ok: true,
    user: user ?? null
  });
});

accountRouter.post("/api/account/profile", async (req, res) => {
  const auth = getAuth(req);
  const clerkUserId = getRequiredClerkUserId({ userId: auth.userId });

  const businessName =
    typeof req.body?.businessName === "string" ? req.body.businessName.trim() : "";
  const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
  const rawPhone = typeof req.body?.phone === "string" ? req.body.phone : "";
  const phone = normalizePhone(rawPhone);
  const businessAddress =
    typeof req.body?.businessAddress === "string" ? req.body.businessAddress.trim() : undefined;
  const businessPhone =
    typeof req.body?.businessPhone === "string" ? req.body.businessPhone.trim() : undefined;
  const businessIban =
    typeof req.body?.businessIban === "string" ? req.body.businessIban.trim() : undefined;

  if (!businessName || !email || phone.length < 8) {
    return res.status(400).json({
      ok: false,
      error: "businessName, email and phone are required"
    });
  }

  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  const existingByClerk = await prisma.user.findUnique({
    where: { clerkUserId }
  });

  const existingByEmail = await prisma.user.findUnique({
    where: { email: email || undefined }
  });

  if (existingByEmail && existingByEmail.clerkUserId && existingByEmail.clerkUserId !== clerkUserId) {
    return res.status(409).json({
      ok: false,
      error: "email already linked to another account"
    });
  }

  if (existingByClerk) {
    const phoneChanged = existingByClerk.phone !== phone;
    const updated = await prisma.user.update({
      where: { id: existingByClerk.id },
      data: {
        email,
        phone,
        businessName,
        businessAddress,
        businessPhone,
        businessIban,
        phoneVerifiedAt: phoneChanged ? null : existingByClerk.phoneVerifiedAt,
        whatsappActivatedAt: phoneChanged ? null : existingByClerk.whatsappActivatedAt
      },
      select: {
        id: true,
        email: true,
        phone: true,
        businessName: true,
        phoneVerifiedAt: true,
        whatsappActivatedAt: true
      }
    });

    return res.status(200).json({ ok: true, user: updated });
  }

  const existingByPhone = await prisma.user.findUnique({
    where: { phone }
  });

  if (existingByPhone && existingByPhone.clerkUserId && existingByPhone.clerkUserId !== clerkUserId) {
    return res.status(409).json({
      ok: false,
      error: "phone already linked to another account"
    });
  }

  if (existingByPhone) {
    const phoneChanged = existingByPhone.phone !== phone;
    const linked = await prisma.user.update({
      where: { id: existingByPhone.id },
      data: {
        clerkUserId,
        email,
        businessName,
        businessAddress,
        businessPhone,
        businessIban,
        phoneVerifiedAt: phoneChanged ? null : existingByPhone.phoneVerifiedAt,
        whatsappActivatedAt: phoneChanged ? null : existingByPhone.whatsappActivatedAt
      },
      select: {
        id: true,
        email: true,
        phone: true,
        businessName: true,
        phoneVerifiedAt: true,
        whatsappActivatedAt: true
      }
    });
    return res.status(200).json({ ok: true, user: linked });
  }

  const created = await prisma.user.create({
    data: {
      clerkUserId,
      email,
      phone,
      businessName,
      businessAddress,
      businessPhone,
      businessIban,
      trialEndsAt,
      subscriptionStatus: "trial"
    },
    select: {
      id: true,
      email: true,
      phone: true,
      businessName: true,
      phoneVerifiedAt: true,
      whatsappActivatedAt: true
    }
  });

  return res.status(201).json({ ok: true, user: created });
});

accountRouter.post("/api/account/send-phone-code", async (req, res) => {
  const auth = getAuth(req);
  const clerkUserId = getRequiredClerkUserId({ userId: auth.userId });

  const businessName =
    typeof req.body?.businessName === "string" ? req.body.businessName.trim() : "";
  const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
  const phone = normalizePhone(typeof req.body?.phone === "string" ? req.body.phone : "");
  const businessAddress =
    typeof req.body?.businessAddress === "string" ? req.body.businessAddress.trim() : undefined;
  const businessPhone =
    typeof req.body?.businessPhone === "string" ? req.body.businessPhone.trim() : undefined;
  const businessIban =
    typeof req.body?.businessIban === "string" ? req.body.businessIban.trim() : undefined;

  if (!businessName || !email || phone.length < 8) {
    return res.status(400).json({ ok: false, error: "businessName, email and phone are required" });
  }

  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  const existingByClerk = await prisma.user.findUnique({ where: { clerkUserId } });
  const existingByPhone = await prisma.user.findUnique({ where: { phone } });
  const existingByEmail = await prisma.user.findUnique({ where: { email } });

  if (existingByPhone && existingByPhone.clerkUserId && existingByPhone.clerkUserId !== clerkUserId) {
    return res.status(409).json({ ok: false, error: "phone already linked to another account" });
  }

  if (existingByEmail && existingByEmail.clerkUserId && existingByEmail.clerkUserId !== clerkUserId) {
    return res.status(409).json({ ok: false, error: "email already linked to another account" });
  }

  const targetUser =
    existingByClerk ||
    existingByPhone ||
    existingByEmail ||
    (await prisma.user.create({
      data: {
        clerkUserId,
        email,
        phone,
        businessName,
        businessAddress,
        businessPhone,
        businessIban,
        trialEndsAt,
        subscriptionStatus: "trial"
      }
    }));

  const phoneChanged = targetUser.phone !== phone;

  const savedUser = await prisma.user.update({
    where: { id: targetUser.id },
    data: {
      clerkUserId,
      email,
      phone,
      businessName,
      businessAddress,
      businessPhone,
      businessIban,
      phoneVerifiedAt: phoneChanged ? null : targetUser.phoneVerifiedAt,
      whatsappActivatedAt: phoneChanged ? null : targetUser.whatsappActivatedAt
    }
  });

  const code = createOtpCode();
  const expiresAt = getOtpExpiry();

  await prisma.phoneVerificationChallenge.upsert({
    where: { clerkUserId },
    update: {
      userId: savedUser.id,
      phone,
      codeHash: hashOtpCode(code),
      expiresAt,
      verifiedAt: null,
      attempts: 0
    },
    create: {
      userId: savedUser.id,
      clerkUserId,
      phone,
      codeHash: hashOtpCode(code),
      expiresAt
    }
  });

  try {
    await sendVerificationSms(phone, code);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not send verification code"
    });
  }

  return res.status(200).json({
    ok: true,
    verificationRequired: true,
    phoneMasked: `${phone.slice(0, 4)}******${phone.slice(-2)}`
  });
});

accountRouter.post("/api/account/verify-phone-code", async (req, res) => {
  const auth = getAuth(req);
  const clerkUserId = getRequiredClerkUserId({ userId: auth.userId });
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ ok: false, error: "Enter the 6-digit code." });
  }

  const challenge = await prisma.phoneVerificationChallenge.findUnique({
    where: { clerkUserId },
    include: { user: true }
  });

  if (!challenge) {
    return res.status(404).json({ ok: false, error: "No verification request found." });
  }

  if (challenge.verifiedAt) {
    return res.status(200).json({ ok: true, alreadyVerified: true });
  }

  if (challenge.expiresAt < new Date()) {
    return res.status(400).json({ ok: false, error: "Code expired. Request a new one." });
  }

  const matches = challenge.codeHash === hashOtpCode(code);

  if (!matches) {
    await prisma.phoneVerificationChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } }
    });

    return res.status(400).json({ ok: false, error: "Invalid code." });
  }

  const verifiedAt = new Date();

  await prisma.$transaction([
    prisma.phoneVerificationChallenge.update({
      where: { id: challenge.id },
      data: { verifiedAt }
    }),
    prisma.user.update({
      where: { id: challenge.userId },
      data: { phoneVerifiedAt: verifiedAt }
    })
  ]);

  return res.status(200).json({
    ok: true,
    verified: true
  });
});

accountRouter.get("/api/dashboard/summary", async (req, res) => {
  const auth = getAuth(req);
  const clerkUserId = getRequiredClerkUserId({ userId: auth.userId });

  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true, whatsappActivatedAt: true }
  });

  if (!user) {
    return res.status(404).json({ ok: false, error: "profile not completed" });
  }

  const [customersCount, activeJobs, overdueJobs, paymentsCount] = await Promise.all([
    prisma.customer.count({ where: { userId: user.id } }),
    prisma.job.findMany({
      where: { userId: user.id, status: JobStatus.active },
      include: { payments: true }
    }),
    prisma.job.count({
      where: {
        userId: user.id,
        status: JobStatus.active,
        dueDate: { lt: new Date() }
      }
    }),
    prisma.payment.count({ where: { userId: user.id } })
  ]);

  const outstandingPence = activeJobs.reduce((sum, job) => {
    const paid = job.payments.reduce((inner, payment) => inner + payment.amountPence, 0);
    return sum + Math.max(job.priceTotalPence - paid, 0);
  }, 0);

  return res.status(200).json({
    ok: true,
    summary: {
      customersCount,
      activeJobsCount: activeJobs.length,
      overdueJobsCount: overdueJobs,
      paymentsCount,
      outstandingPence,
      whatsappActivated: Boolean(user.whatsappActivatedAt)
    }
  });
});

accountRouter.get("/api/dashboard/lists", async (req, res) => {
  const auth = getAuth(req);
  const clerkUserId = getRequiredClerkUserId({ userId: auth.userId });

  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true }
  });

  if (!user) {
    return res.status(404).json({ ok: false, error: "profile not completed" });
  }

  const [customers, jobs, payments, expenses, debts] = await Promise.all([
    prisma.customer.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: {
        jobs: {
          include: { payments: true }
        }
      }
    }),
    prisma.job.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: {
        customer: {
          select: { name: true }
        }
      }
    }),
    prisma.payment.findMany({
      where: { userId: user.id },
      orderBy: { paidAt: "desc" },
      take: 12,
      include: {
        job: {
          select: {
            title: true,
            customer: {
              select: { name: true }
            }
          }
        }
      }
    }),
    prisma.moneyTransaction.findMany({
      where: {
        userId: user.id,
        kind: "expense_paid"
      },
      orderBy: { occurredAt: "desc" },
      take: 12
    }),
    prisma.vendorLedger.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: {
        transactions: {
          orderBy: { occurredAt: "desc" },
          take: 1
        }
      }
    })
  ]);

  return res.status(200).json({
    ok: true,
    customers: customers.map((customer) => {
      const totalPaidPence = customer.jobs.reduce(
        (jobSum, job) =>
          jobSum + job.payments.reduce((paymentSum, payment) => paymentSum + payment.amountPence, 0),
        0
      );

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        totalJobs: customer.jobs.length,
        totalPaidPence,
        outstandingPence: customer.balancePence
      };
    }),
    jobs: jobs.map((job) => ({
      id: job.id,
      title: job.title,
      customerName: job.customer?.name ?? "-",
      status: job.status,
      priceTotalPence: job.priceTotalPence,
      depositPence: job.depositPence ?? 0,
      scheduledDate: job.scheduledDate?.toISOString() ?? null,
      dueDate: job.dueDate?.toISOString() ?? null
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      customerName: payment.job.customer?.name ?? "-",
      jobTitle: payment.job.title,
      amountPence: payment.amountPence,
      paidAt: payment.paidAt.toISOString(),
      method: payment.method
    })),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      note: expense.note ?? expense.counterpartyName ?? "Expense",
      counterpartyName: expense.counterpartyName ?? "-",
      amountPence: expense.amountPence,
      occurredAt: expense.occurredAt.toISOString()
    })),
    debts: debts.map((debt) => ({
      id: debt.id,
      vendorName: debt.vendorName,
      balancePence: debt.balancePence,
      lastActivityAt: debt.transactions[0]?.occurredAt.toISOString() ?? null
    }))
  });
});

accountRouter.get("/api/account/activation", async (_req, res) => {
  const sandboxNumberRaw = env.TWILIO_WHATSAPP_FROM?.replace(/^whatsapp:/, "");
  const sandboxNumber = sandboxNumberRaw || "";
  const joinCode = env.TWILIO_SANDBOX_JOIN_CODE?.trim() || "";
  const joinText = joinCode ? `join ${joinCode}` : "";
  const waLink =
    sandboxNumber && joinText
      ? `https://wa.me/${sandboxNumber.replace(/[^\d]/g, "")}?text=${encodeURIComponent(joinText)}`
      : "";

  return res.status(200).json({
    ok: true,
    activation: {
      sandboxNumber,
      joinCode,
      joinText,
      waLink
    }
  });
});
