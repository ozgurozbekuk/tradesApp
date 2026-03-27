// Defines tool schemas and execution helpers for the legacy agent stack.
import { logUserAction } from "../../../services/audit-logs.service";
import { CustomersService } from "../../../services/customers.service";
import { ExportService } from "../../../services/export.service";
import { JobsService } from "../../../services/jobs.service";
import { PaymentsService } from "../../../services/payments.service";
import { RemindersService } from "../../../services/reminders.service";
import { ReportsService } from "../../../services/reports.service";
import { SubscriptionService } from "../../../services/subscription.service";
import { UsersService } from "../../../services/users.service";

export class ToolExecutor {
  constructor(
    private readonly deps: {
      jobs: JobsService;
      payments: PaymentsService;
      customers: CustomersService;
      reminders: RemindersService;
      reports: ReportsService;
      exports: ExportService;
      users: UsersService;
      subscriptions: SubscriptionService;
    }
  ) {}

  createJob(userId: string, args: {
    customerName: string;
    customerPhone?: string;
    title: string;
    totalPence: number;
    depositPence?: number;
    dueDate?: Date;
    notes?: string;
  }) {
    return this.deps.jobs.createJob({
      userId,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      title: args.title,
      priceTotalPence: args.totalPence,
      depositPence: args.depositPence,
      dueDate: args.dueDate,
      notes: args.notes
    });
  }

  async addPayment(userId: string, args: { jobId: string; amountPence: number; method?: "cash" | "bank" | "card" | "unknown"; note?: string }) {
    return this.deps.payments.addPayment({
      userId,
      jobId: args.jobId,
      amountPence: args.amountPence,
      method: args.method,
      note: args.note
    });
  }

  listActiveJobs(userId: string) {
    return this.deps.jobs.listActiveJobsWithOutstanding(userId);
  }

  listOutstanding(userId: string) {
    return this.deps.jobs.listOutstandingJobs(userId);
  }

  findCustomers(userId: string, query: string) {
    return this.deps.customers.findRecordsByName({ userId, query });
  }

  closeJob(userId: string, jobId: string) {
    return this.deps.jobs.closeJob({ userId, jobId });
  }

  getSummary(userId: string, period: "today" | "yesterday" | "7d" | "30d") {
    return this.deps.reports.getSummary(userId, period);
  }

  async createExportLink(userId: string) {
    const token = this.deps.exports.createAccessToken({ userId, expiresInMinutes: 30 });
    const link = this.deps.exports.createAccessLink(token);

    await logUserAction({
      userId,
      action: "export.requested",
      metadata: { link, expiresInMinutes: 30 }
    });

    return link;
  }

  async createPdfExportLink(
    userId: string,
    options?: {
      customerQuery?: string;
      customerId?: string;
    }
  ) {
    const token = this.deps.exports.createPdfAccessToken({
      userId,
      customerQuery: options?.customerQuery,
      customerId: options?.customerId,
      expiresInMinutes: 30
    });
    const link = this.deps.exports.createPdfDownloadLink(token);

    await logUserAction({
      userId,
      action: "export.pdf.requested",
      metadata: {
        link,
        expiresInMinutes: 30,
        customerQuery: options?.customerQuery ?? null,
        customerId: options?.customerId ?? null
      }
    });

    return link;
  }

  toggleBriefing(userId: string, enabled: boolean) {
    return this.deps.users.updateBriefingEnabled({ userId, enabled });
  }

  subscribe(userId: string) {
    return this.deps.subscriptions.createCheckoutLink(userId);
  }

  scheduleReminders(userId: string, jobId: string, dueDate: Date | null) {
    return this.deps.reminders.scheduleForNewJob({ userId, jobId, dueDate });
  }
}
