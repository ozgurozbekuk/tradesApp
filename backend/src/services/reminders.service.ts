// Provides a backend service layer for a focused business domain.
import { BookingStatus, JobStatus, ReminderType, SubscriptionStatus } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { sendWhatsAppMessage } from "../integrations/twilio";
import { calculateJobOutstandingPence } from "./job-outstanding";
import { ReportsService } from "./reports.service";

type UserAccess = {
  id: string;
  phone: string;
  businessName: string;
  briefingEnabled: boolean;
  trialEndsAt: Date;
  subscriptionStatus: SubscriptionStatus;
};

const canWriteBySubscription = (user: UserAccess, now: Date) => {
  if (env.BILLING_ENABLED !== true) {
    return true;
  }

  if (user.subscriptionStatus === "active") {
    return true;
  }

  if (user.subscriptionStatus === "trial" && user.trialEndsAt >= now) {
    return true;
  }

  return false;
};

const penceToPounds = (value: number) => `£${(value / 100).toFixed(2)}`;
const reportsService = new ReportsService();

const startOfTodayInTz = (date: Date, timezone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const datePart = formatter.format(date);
  return new Date(`${datePart}T00:00:00.000Z`);
};

const getTzHourMinute = (date: Date, timezone: string) => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return { hour, minute };
};

const formatCount = (count: number, singular: string, plural: string) => {
  return `${count} ${count === 1 ? singular : plural}`;
};

const compactDateInTz = (date: Date | null, timezone: string) => {
  if (!date) {
    return "unscheduled";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "short"
  }).format(date);
};

const compactTimeInTz = (date: Date | null, timezone: string) => {
  if (!date) {
    return "unscheduled";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
};

const getDayWindowInTz = (date: Date, timezone: string, shiftDays = 0) => {
  const base = new Date(date);
  base.setUTCDate(base.getUTCDate() + shiftDays);
  const start = startOfTodayInTz(base, timezone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
};

export type TodayPlanSnapshot = {
  timezone: string;
  scheduledToday: number;
  dueSoonCount: number;
  overdueCount: number;
  outstandingTotalPence: number;
  todayJobs: Array<{
    customerName: string;
    title: string;
    scheduledFor: string;
    outstandingPence: number;
  }>;
  dueSoonJobs: Array<{
    customerName: string;
    title: string;
    dueOn: string;
    outstandingPence: number;
  }>;
};

export class RemindersService {
  async buildTodayPlan(input: { userId: string; timezone?: string; now?: Date }): Promise<TodayPlanSnapshot> {
    const timezone = input.timezone || env.APP_TZ || "Europe/London";
    const now = input.now ?? new Date();
    const { start: dayStart, end: dayEnd } = getDayWindowInTz(now, timezone);
    const dueSoonEnd = new Date(dayEnd.getTime() + 3 * 24 * 60 * 60 * 1000);
    const todaysBookings = await prisma.booking.findMany({
      where: {
        userId: input.userId,
        status: BookingStatus.scheduled,
        startsAt: {
          gte: dayStart,
          lt: dayEnd
        }
      },
      include: {
        customer: true
      },
      orderBy: [{ startsAt: "asc" }]
    });

    const activeJobs = await prisma.job.findMany({
      where: {
        userId: input.userId,
        status: JobStatus.active
      },
      include: {
        customer: true,
        payments: true
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }]
    });

    let scheduledToday = todaysBookings.length;
    let dueSoonCount = 0;
    let overdueCount = 0;
    let outstandingTotalPence = 0;
    const todayJobs: TodayPlanSnapshot["todayJobs"] = todaysBookings.slice(0, 6).map((booking) => ({
      customerName: booking.customer.name,
      title: booking.title ?? "Booking",
      scheduledFor: compactTimeInTz(booking.startsAt, timezone),
      outstandingPence: 0
    }));
    const dueSoonJobs: TodayPlanSnapshot["dueSoonJobs"] = [];

    for (const job of activeJobs) {
      const outstandingPence = calculateJobOutstandingPence(job);
      outstandingTotalPence += outstandingPence;
      const customerName = job.customer?.name ?? "Customer";
      if (job.dueDate && job.dueDate >= dayStart && job.dueDate <= dueSoonEnd && outstandingPence > 0) {
        dueSoonCount += 1;
        if (dueSoonJobs.length < 6) {
          dueSoonJobs.push({
            customerName,
            title: job.title,
            dueOn: compactDateInTz(job.dueDate, timezone),
            outstandingPence
          });
        }
      }

      if (job.dueDate && job.dueDate < dayStart && outstandingPence > 0) {
        overdueCount += 1;
      }
    }

    return {
      timezone,
      scheduledToday,
      dueSoonCount,
      overdueCount,
      outstandingTotalPence,
      todayJobs,
      dueSoonJobs
    };
  }

  async scheduleForNewJob(input: { userId: string; jobId: string; dueDate: Date | null }) {
    if (!input.dueDate) {
      return;
    }

    const due1dAt = new Date(input.dueDate.getTime() - 24 * 60 * 60 * 1000);
    const overdueFirstAt = new Date(input.dueDate.getTime() + 24 * 60 * 60 * 1000);

    const existingDue = await prisma.reminder.findFirst({
      where: {
        userId: input.userId,
        jobId: input.jobId,
        type: ReminderType.due_1d
      }
    });

    if (!existingDue) {
      await prisma.reminder.create({
        data: {
          userId: input.userId,
          jobId: input.jobId,
          type: ReminderType.due_1d,
          remindAt: due1dAt,
          maxSends: 1
        }
      });
    }

    const existingOverdue = await prisma.reminder.findFirst({
      where: {
        userId: input.userId,
        jobId: input.jobId,
        type: ReminderType.overdue_3d
      }
    });

    if (!existingOverdue) {
      await prisma.reminder.create({
        data: {
          userId: input.userId,
          jobId: input.jobId,
          type: ReminderType.overdue_3d,
          remindAt: overdueFirstAt,
          maxSends: 3
        }
      });
    }
  }

  async processDueAndOverdueReminders(now = new Date()) {
    const reminders = await prisma.reminder.findMany({
      where: {
        type: {
          in: [ReminderType.due_1d, ReminderType.overdue_3d]
        },
        remindAt: {
          lte: now
        }
      },
      include: {
        user: true,
        job: {
          include: {
            customer: true,
            payments: true
          }
        }
      },
      orderBy: [{ remindAt: "asc" }],
      take: 100
    });

    for (const reminder of reminders) {
      if (reminder.sendCount >= reminder.maxSends) {
        continue;
      }

      const user = reminder.user;
      const job = reminder.job;

      if (!job || job.status !== JobStatus.active) {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { sentAt: now }
        });
        continue;
      }

      if (!canWriteBySubscription(user, now)) {
        continue;
      }

      const outstandingPence = calculateJobOutstandingPence(job);

      if (outstandingPence <= 0) {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { sentAt: now }
        });
        continue;
      }

      const dueDateText = job.dueDate ? job.dueDate.toISOString().slice(0, 10) : "unscheduled";
      const customerName = job.customer?.name ?? "Customer";

      const body =
        reminder.type === ReminderType.due_1d
          ? `Reminder: ${customerName} - ${job.title} is due on ${dueDateText}. Outstanding ${penceToPounds(outstandingPence)}.`
          : `Overdue: ${customerName} - ${job.title}. Outstanding ${penceToPounds(outstandingPence)}.`;

      try {
        await sendWhatsAppMessage({
          to: user.phone,
          body
        });

        if (reminder.type === ReminderType.due_1d) {
          await prisma.reminder.update({
            where: { id: reminder.id },
            data: {
              sendCount: reminder.sendCount + 1,
              lastSentAt: now,
              sentAt: now
            }
          });
        } else {
          const nextCount = reminder.sendCount + 1;
          const isFinalSend = nextCount >= reminder.maxSends;

          await prisma.reminder.update({
            where: { id: reminder.id },
            data: {
              sendCount: nextCount,
              lastSentAt: now,
              sentAt: isFinalSend ? now : null,
              remindAt: isFinalSend ? reminder.remindAt : new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
            }
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn("Reminder send failed", { reminderId: reminder.id, message });
      }
    }
  }

  async processMorningBriefings(now = new Date(), options?: { force?: boolean }) {
    const users = await prisma.user.findMany({
      where: {
        briefingEnabled: true
      }
    });

    for (const user of users) {
      const timezone = user.timezone || env.APP_TZ || "Europe/London";
      const { hour, minute } = getTzHourMinute(now, timezone);

      if (!options?.force && (hour !== 9 || minute !== 0)) {
        continue;
      }

      if (!canWriteBySubscription(user, now)) {
        continue;
      }

      const { start: dayStart, end: dayEnd } = getDayWindowInTz(now, timezone);
      const dueSoonEnd = new Date(dayEnd.getTime() + 3 * 24 * 60 * 60 * 1000);

      const alreadySent = await prisma.auditLog.findFirst({
        where: {
          userId: user.id,
          action: "briefing.sent",
          createdAt: {
            gte: dayStart
          }
        }
      });

      if (alreadySent) {
        continue;
      }

      const todaysBookings = await prisma.booking.findMany({
        where: {
          userId: user.id,
          status: BookingStatus.scheduled,
          startsAt: {
            gte: dayStart,
            lt: dayEnd
          }
        },
        include: {
          customer: true
        },
        orderBy: [{ startsAt: "asc" }]
      });

      const activeJobs = await prisma.job.findMany({
        where: {
          userId: user.id,
          status: JobStatus.active
        },
        include: {
          customer: true,
          payments: true
        }
      });

      let scheduledToday = todaysBookings.length;
      let dueSoonCount = 0;
      let overdueCount = 0;
      let outstandingTotal = 0;
      const todayLines: string[] = todaysBookings.slice(0, 4).map((booking) => {
        const title = booking.title?.trim() ? ` - ${booking.title.trim()}` : "";
        return `• ${compactTimeInTz(booking.startsAt, timezone)} ${booking.customer.name}${title}`;
      });
      const dueSoonLines: string[] = [];

      for (const job of activeJobs) {
        const outstanding = calculateJobOutstandingPence(job);
        outstandingTotal += outstanding;

        if (job.dueDate && job.dueDate >= dayStart && job.dueDate <= dueSoonEnd && outstanding > 0) {
          dueSoonCount += 1;
          if (dueSoonLines.length < 4) {
            dueSoonLines.push(`• ${job.customer?.name ?? "Customer"} - ${job.title} due ${compactDateInTz(job.dueDate, timezone)}`);
          }
        }

        if (job.dueDate && job.dueDate < dayStart && outstanding > 0) {
          overdueCount += 1;
        }
      }

      const body = [
        "Good morning, boss.",
        "",
        "I've checked the diary for you. Here's today's plan:",
        `• ${formatCount(scheduledToday, "job booked for today", "jobs booked for today")}`,
        `• ${formatCount(dueSoonCount, "job due soon", "jobs due soon")}`,
        `• ${formatCount(overdueCount, "overdue job", "overdue jobs")}`,
        `• ${penceToPounds(outstandingTotal)} outstanding payments`,
        ...(todayLines.length ? ["", "Today's jobs:", ...todayLines] : []),
        ...(dueSoonLines.length ? ["", "Coming up soon:", ...dueSoonLines] : [])
      ].join("\n");

      try {
        await sendWhatsAppMessage({
          to: user.phone,
          body
        });

        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "briefing.sent",
            metadataJson: {
              activeJobs: activeJobs.length,
              scheduledToday,
              dueSoonCount,
              overdueCount,
              outstandingTotal
            }
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn("Morning briefing failed", { userId: user.id, message });
      }
    }
  }

  async processEveningSummaries(now = new Date(), options?: { force?: boolean }) {
    const users = await prisma.user.findMany({
      where: {
        briefingEnabled: true
      }
    });

    for (const user of users) {
      const timezone = user.timezone || env.APP_TZ || "Europe/London";
      const { hour, minute } = getTzHourMinute(now, timezone);

      if (!options?.force && (hour !== 18 || minute !== 0)) {
        continue;
      }

      if (!canWriteBySubscription(user, now)) {
        continue;
      }

      const { start: dayStart } = getDayWindowInTz(now, timezone);
      const alreadySent = await prisma.auditLog.findFirst({
        where: {
          userId: user.id,
          action: "briefing.evening.sent",
          createdAt: {
            gte: dayStart
          }
        }
      });

      if (alreadySent) {
        continue;
      }

      try {
        const summary = await reportsService.getSummary(user.id, "today");
        const activeJobs = await prisma.job.findMany({
          where: {
            userId: user.id,
            status: JobStatus.active
          },
          include: {
            payments: true
          }
        });

        const overdueCount = activeJobs.filter((job) => {
          const outstanding = calculateJobOutstandingPence(job);
          return Boolean(job.dueDate && job.dueDate < dayStart && outstanding > 0);
        }).length;

        const body = [
          "One more day wrapped up, boss.",
          "",
          "I've put together your end-of-day summary:",
          `• ${formatCount(summary.jobsCreated, "new job logged", "new jobs logged")}`,
          `• ${formatCount(summary.jobsCompleted, "job completed", "jobs completed")}`,
          `• ${penceToPounds(summary.paymentsReceivedPence)} taken in today`,
          `• ${penceToPounds(summary.expensesPaidPence)} spent today`,
          `• ${penceToPounds(summary.outstandingPence)} still outstanding`,
          `• ${formatCount(overdueCount, "overdue job still open", "overdue jobs still open")}`
        ].join("\n");

        await sendWhatsAppMessage({
          to: user.phone,
          body
        });

        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "briefing.evening.sent",
            metadataJson: {
              jobsCreated: summary.jobsCreated,
              jobsCompleted: summary.jobsCompleted,
              paymentsReceivedPence: summary.paymentsReceivedPence,
              expensesPaidPence: summary.expensesPaidPence,
              outstandingPence: summary.outstandingPence,
              overdueCount
            }
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn("Evening summary failed", { userId: user.id, message });
      }
    }
  }
}
