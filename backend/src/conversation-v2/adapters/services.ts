import type { CustomersService } from "../../services/customers.service";
import type { JobsService } from "../../services/jobs.service";
import type { PaymentsService } from "../../services/payments.service";
import type { RemindersService } from "../../services/reminders.service";
import type { ReportsService } from "../../services/reports.service";
import type { UsersService } from "../../services/users.service";
import type { VendorPaymentsService } from "../../services/vendor-payments.service";

export type ConversationV2Services = {
  users: UsersService;
  customers: CustomersService;
  jobs: JobsService;
  payments: PaymentsService;
  reports: ReportsService;
  reminders: RemindersService;
  vendorPayments: VendorPaymentsService;
};

