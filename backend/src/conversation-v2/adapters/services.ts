import { prisma } from "../../db/prisma";
import { CustomersService } from "../../services/customers.service";
import { JobsService } from "../../services/jobs.service";
import { PaymentsService } from "../../services/payments.service";
import { RemindersService } from "../../services/reminders.service";
import { ReportsService } from "../../services/reports.service";
import { UsersService } from "../../services/users.service";
import { VendorPaymentsService } from "../../services/vendor-payments.service";

export type ConversationV2Services = {
  users: UsersService;
  customers: CustomersService;
  jobs: JobsService;
  payments: PaymentsService;
  reports: ReportsService;
  reminders: RemindersService;
  vendorPayments: VendorPaymentsService;
};

export const createConversationV2Services = (): ConversationV2Services => ({
  users: new UsersService(),
  customers: new CustomersService(),
  jobs: new JobsService(),
  payments: new PaymentsService(),
  reports: new ReportsService(),
  reminders: new RemindersService(),
  vendorPayments: new VendorPaymentsService()
});

export const createCustomerExplicitly = async (input: {
  userId: string;
  name: string;
  phone?: string;
  notes?: string;
  customersService: CustomersService;
}) => {
  const normalizedPhone = input.phone ? input.customersService.normalizePhone(input.phone) : null;
  if (input.phone && !normalizedPhone) {
    throw new Error("Invalid phone format");
  }

  return prisma.customer.create({
    data: {
      userId: input.userId,
      name: input.name.trim(),
      phone: normalizedPhone ?? undefined,
      notes: input.notes?.trim() || undefined
    }
  });
};
