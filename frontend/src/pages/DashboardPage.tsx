// Renders a top-level frontend page.
import { SignedIn, SignedOut, UserButton, useAuth } from "@clerk/clerk-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";

type MeResponse = {
  user: {
    businessName: string | null;
    phone: string | null;
    phoneVerifiedAt: string | null;
  } | null;
};

type SummaryResponse = {
  summary: {
    customersCount: number;
    activeJobsCount: number;
    overdueJobsCount: number;
    paymentsCount: number;
    outstandingPence: number;
    whatsappActivated: boolean;
  };
};

type DashboardListsResponse = {
  customers: Array<{
    id: string;
    name: string;
    phone: string | null;
    totalJobs: number;
    totalPaidPence: number;
    outstandingPence: number;
  }>;
  jobs: Array<{
    id: string;
    title: string;
    customerName: string;
    status: string;
    priceTotalPence: number;
    depositPence: number;
    scheduledDate: string | null;
    dueDate: string | null;
  }>;
  payments: Array<{
    id: string;
    customerName: string;
    jobTitle: string;
    amountPence: number;
    paidAt: string;
    method: string;
  }>;
  expenses: Array<{
    id: string;
    note: string;
    counterpartyName: string;
    amountPence: number;
    occurredAt: string;
  }>;
  debts: Array<{
    id: string;
    vendorName: string;
    balancePence: number;
    lastActivityAt: string | null;
  }>;
};

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  accentClass: string;
  icon: "customer" | "job" | "payment" | "expense" | "debt";
};

type CustomerEditorState = {
  id: string;
  name: string;
  phone: string;
};

type JobEditorState = {
  id: string;
  title: string;
  status: string;
  priceTotal: string;
  deposit: string;
  dueDate: string;
};

type ExpenseEditorState = {
  id: string;
  counterpartyName: string;
  note: string;
  amount: string;
  occurredAt: string;
};

type DeleteDialogState = {
  resource: "customer" | "job" | "expense";
  id: string;
  label: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const pounds = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP"
});

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short"
});

const monthLabel = new Intl.DateTimeFormat("en-GB", {
  month: "short"
});

const dayLabel = new Intl.DateTimeFormat("en-GB", {
  weekday: "short"
});

const classNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path
      fill="currentColor"
      d="M10.5 3a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm0 1.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm8.03 12.97 2.97 2.97-1.06 1.06-2.97-2.97 1.06-1.06Z"
    />
  </svg>
);

const BellIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 3a4 4 0 0 1 4 4v1.2c0 .73.2 1.44.59 2.05l1.05 1.66a2 2 0 0 1-1.69 3.09H8.05a2 2 0 0 1-1.69-3.09l1.05-1.66A3.8 3.8 0 0 0 8 8.2V7a4 4 0 0 1 4-4Zm0 18a2.5 2.5 0 0 1-2.45-2h4.9A2.5 2.5 0 0 1 12 21Z"
    />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path fill="currentColor" d="M11.25 4h1.5v7.25H20v1.5h-7.25V20h-1.5v-7.25H4v-1.5h7.25V4Z" />
  </svg>
);

const PencilIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path
      fill="currentColor"
      d="m16.86 3.49 3.65 3.65-9.7 9.7-4.58.93.93-4.58 9.7-9.7ZM15.8 4.55l-8.9 8.9-.43 2.12 2.12-.43 8.9-8.9-1.69-1.69Z"
    />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path
      fill="currentColor"
      d="M9 3.75h6l.75 1.5H20v1.5H4v-1.5h4.25L9 3.75Zm-2 6h1.5v7.5H7v-7.5Zm4.25 0h1.5v7.5h-1.5v-7.5Zm4.25 0H17v7.5h-1.5v-7.5ZM6.25 8.25h11.5V19.5a.75.75 0 0 1-.75.75H7a.75.75 0 0 1-.75-.75V8.25Z"
    />
  </svg>
);

const ToolIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
    <path
      fill="currentColor"
      d="m14.24 3.56 2.2 2.2-2.48 2.48 1.32 1.32 2.48-2.48 2.2 2.2v3.11l-4.9 4.9-3.12-3.11-5.07 5.07H3v-3.87l5.08-5.08-3.12-3.11 4.9-4.9h3.11l2.2 2.2-2.47 2.48 1.31 1.31 2.48-2.47Z"
    />
  </svg>
);

const SidebarIcon = ({ kind }: { kind: ActivityItem["icon"] | "dashboard" | "reports" }) => {
  const paths: Record<string, string> = {
    dashboard:
      "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
    customer:
      "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0H5Zm14.5-9a2.5 2.5 0 1 0-2.45-3H19v3Z",
    job:
      "M8 5V4h8v1h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3Zm1.5 0h5V4h-5v1Z",
    payment:
      "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm10.5 5A2.5 2.5 0 1 0 16 14.5 2.5 2.5 0 0 0 13.5 12ZM6 9h3v1.5H6V9Zm9 5h3v1.5h-3V14Z",
    expense:
      "M5 4h14a1 1 0 0 1 1 1v14l-3-2-3 2-3-2-3 2-3-2V5a1 1 0 0 1 1-1Zm3 3v1.5h8V7H8Zm0 4v1.5h6V11H8Z",
    debt:
      "M5 4h10a2 2 0 0 1 2 2v2h2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4Zm3 4h9V6H8v2Zm0 3v1.5h7V11H8Z",
    reports:
      "M5 20V9h3v11H5Zm5 0V4h3v16h-3Zm5 0v-7h3v7h-3Z"
  };

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="currentColor" d={paths[kind]} />
    </svg>
  );
};

const ActivityIcon = ({ kind }: { kind: ActivityItem["icon"] }) => {
  return (
    <div
      className={classNames(
        "flex h-10 w-10 items-center justify-center rounded-full",
        kind === "customer" && "bg-emerald-100 text-emerald-600",
        kind === "job" && "bg-blue-100 text-blue-600",
        kind === "payment" && "bg-amber-100 text-amber-600",
        kind === "expense" && "bg-rose-100 text-rose-600",
        kind === "debt" && "bg-slate-200 text-slate-600"
      )}
    >
      <SidebarIcon kind={kind} />
    </div>
  );
};

const StatCard = ({
  title,
  value,
  trend,
  icon,
  danger
}: {
  title: string;
  value: string;
  trend: string;
  icon: ReactNode;
  danger?: boolean;
}) => (
  <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-xs font-medium text-slate-500">{title}</div>
        <div className="mt-5 flex items-end gap-2">
          <div className="font-display text-2xl font-semibold tracking-tight text-slate-950">
            {value}
          </div>
          <div className={classNames("pb-1 text-xs font-semibold", danger ? "text-rose-500" : "text-emerald-500")}>
            {trend}
          </div>
        </div>
      </div>
      <div
        className={classNames(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          danger ? "bg-rose-100 text-rose-500" : "bg-blue-100 text-blue-600"
        )}
      >
        {icon}
      </div>
    </div>
  </div>
);

const Panel = ({
  id,
  title,
  subtitle,
  right,
  children,
  className
}: {
  id?: string;
  title: string;
  subtitle: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section
    id={id}
    className={classNames(
      "rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]",
      className
    )}
  >
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {right}
    </div>
    {children}
  </section>
);

const ModalShell = ({
  title,
  description,
  onClose,
  children
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
    <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close dialog"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path fill="currentColor" d="m6.53 5.47 5.47 5.47 5.47-5.47 1.06 1.06L13.06 12l5.47 5.47-1.06 1.06L12 13.06l-5.47 5.47-1.06-1.06L10.94 12 5.47 6.53l1.06-1.06Z" />
          </svg>
        </button>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  </div>
);

const TablePanel = ({
  id,
  title,
  subtitle,
  children
}: {
  id: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) => (
  <Panel id={id} title={title} subtitle={subtitle}>
    <div className="overflow-x-auto">{children}</div>
  </Panel>
);

const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const getAvatarClass = (index: number) => {
  const variants = [
    "bg-blue-100 text-blue-700",
    "bg-violet-100 text-violet-700",
    "bg-sky-100 text-sky-700",
    "bg-pink-100 text-pink-700",
    "bg-emerald-100 text-emerald-700"
  ];

  return variants[index % variants.length];
};

const getOutstandingClass = (value: number) => {
  if (value <= 0) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (value <= 15000) {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-rose-100 text-rose-700";
};

const getJobStatusClass = (status: string) => {
  const normalized = status.toLowerCase();

  if (normalized === "completed") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (normalized === "pending") {
    return "bg-amber-100 text-amber-700";
  }
  if (normalized === "on hold") {
    return "bg-slate-200 text-slate-700";
  }

  return "bg-blue-100 text-blue-700";
};

const getJobDateLabel = (job: DashboardListsResponse["jobs"][number]) => {
  const rawDate = job.scheduledDate ?? job.dueDate;
  if (!rawDate) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(rawDate));
};

const fullDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric"
});

const toDateInputValue = (value: string | null) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
};

const getDebtStatusMeta = (status: string, dueDate: string | null) => {
  const normalized = status.toLowerCase();
  const now = new Date();

  if (dueDate) {
    const due = new Date(dueDate);
    const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays >= 60) {
      return {
        label: "Overdue 60d+",
        className: "bg-rose-100 text-rose-700",
        actionLabel: "Final Notice"
      };
    }

    if (diffDays >= 1) {
      return {
        label: `Overdue ${Math.max(diffDays, 1)}d`,
        className: "bg-rose-100 text-rose-700",
        actionLabel: "Remind"
      };
    }
  }

  if (normalized === "pending") {
    return {
      label: "Pending",
      className: "bg-amber-100 text-amber-700",
      actionLabel: "Manage"
    };
  }

  if (normalized === "on hold") {
    return {
      label: "On Hold",
      className: "bg-slate-200 text-slate-700",
      actionLabel: "Review"
    };
  }

  return {
    label: "Current",
    className: "bg-blue-100 text-blue-700",
    actionLabel: "Send"
  };
};

const getExpenseStatusMeta = (occurredAt: string, amountPence: number) => {
  const ageDays = Math.floor((new Date().getTime() - new Date(occurredAt).getTime()) / (1000 * 60 * 60 * 24));

  if (amountPence >= 100000) {
    return {
      label: "High Cost",
      className: "bg-rose-100 text-rose-700",
      actionLabel: "Review"
    };
  }

  if (ageDays <= 7) {
    return {
      label: "Recent",
      className: "bg-blue-100 text-blue-700",
      actionLabel: "Open"
    };
  }

  if (ageDays <= 30) {
    return {
      label: "This Month",
      className: "bg-amber-100 text-amber-700",
      actionLabel: "Manage"
    };
  }

  return {
    label: "Archived",
    className: "bg-slate-200 text-slate-700",
    actionLabel: "View"
  };
};

const DashboardInner = () => {
  const location = useLocation();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [redirectToOnboarding, setRedirectToOnboarding] = useState(false);
  const [error, setError] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [summary, setSummary] = useState<SummaryResponse["summary"] | null>(null);
  const [lists, setLists] = useState<DashboardListsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState("all");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [customerEditor, setCustomerEditor] = useState<CustomerEditorState | null>(null);
  const [jobEditor, setJobEditor] = useState<JobEditorState | null>(null);
  const [expenseEditor, setExpenseEditor] = useState<ExpenseEditorState | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const isCustomersView = location.pathname === "/customers";
  const isJobsView = location.pathname === "/jobs";
  const isPaymentsView = location.pathname === "/dashboard" && ["#payments", "#debts"].includes(location.hash);
  const isExpensesView = location.pathname === "/dashboard" && location.hash === "#expenses";
  const isReportsView = location.pathname === "/dashboard" && location.hash === "#reports";

  const fetchProtected = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const token = await getToken();
    if (!token) {
      throw new Error("Missing Clerk session token.");
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: init?.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {})
      },
      body: init?.body
    });

    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "Request failed.");
    }

    return payload;
  };

  const loadDashboard = async () => {
    const me = await fetchProtected<MeResponse>("/api/account/me");

    if (!me.user?.businessName || !me.user?.phone || !me.user.phoneVerifiedAt) {
      setRedirectToOnboarding(true);
      return;
    }

    const [dashboard, listPayload] = await Promise.all([
      fetchProtected<SummaryResponse>("/api/dashboard/summary"),
      fetchProtected<DashboardListsResponse>("/api/dashboard/lists")
    ]);

    setBusinessName(me.user.businessName);
    setSummary(dashboard.summary);
    setLists(listPayload);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await loadDashboard();
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Could not load dashboard.";
        if (message.includes("profile not completed")) {
          setRedirectToOnboarding(true);
          return;
        }
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [getToken]);

  const refreshDashboard = async () => {
    await loadDashboard();
  };

  const closeDialogs = () => {
    setCustomerEditor(null);
    setJobEditor(null);
    setExpenseEditor(null);
    setDeleteDialog(null);
    setActionError("");
  };

  const filteredLists = useMemo(() => {
    if (!lists) {
      return null;
    }

    const query = search.trim().toLowerCase();
    if (!query) {
      return lists;
    }

    return {
      customers: lists.customers.filter((item) =>
        [item.name, item.phone ?? ""].some((value) => value.toLowerCase().includes(query))
      ),
      jobs: lists.jobs.filter((item) =>
        [item.title, item.customerName, item.status].some((value) =>
          value.toLowerCase().includes(query)
        )
      ),
      payments: lists.payments.filter((item) =>
        [item.customerName, item.jobTitle, item.method].some((value) =>
          value.toLowerCase().includes(query)
        )
      ),
      expenses: lists.expenses.filter((item) =>
        [item.note, item.counterpartyName].some((value) => value.toLowerCase().includes(query))
      ),
      debts: lists.debts.filter((item) => item.vendorName.toLowerCase().includes(query))
    };
  }, [lists, search]);

  const weeklyIncome = useMemo(() => {
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        key: date.toDateString(),
        label: dayLabel.format(date).toUpperCase(),
        value: 0
      };
    });

    filteredLists?.payments.forEach((payment) => {
      const key = new Date(payment.paidAt).toDateString();
      const bucket = buckets.find((entry) => entry.key === key);
      if (bucket) {
        bucket.value += payment.amountPence / 100;
      }
    });

    return buckets;
  }, [filteredLists]);

  const monthlyComparison = useMemo(() => {
    const map = new Map<string, { label: string; income: number; expenses: number }>();

    filteredLists?.payments.forEach((payment) => {
      const date = new Date(payment.paidAt);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const current = map.get(key) ?? {
        label: monthLabel.format(date).toUpperCase(),
        income: 0,
        expenses: 0
      };
      current.income += payment.amountPence / 100;
      map.set(key, current);
    });

    filteredLists?.expenses.forEach((expense) => {
      const date = new Date(expense.occurredAt);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const current = map.get(key) ?? {
        label: monthLabel.format(date).toUpperCase(),
        income: 0,
        expenses: 0
      };
      current.expenses += expense.amountPence / 100;
      map.set(key, current);
    });

    return Array.from(map.values()).slice(-6);
  }, [filteredLists]);

  const recentActivity = useMemo<ActivityItem[]>(() => {
    if (!filteredLists) {
      return [];
    }

    return [
      ...filteredLists.customers.slice(0, 2).map((customer) => ({
        id: `customer-${customer.id}`,
        title: "New Customer Added",
        detail: `${customer.name}${customer.phone ? ` • ${customer.phone}` : ""}`,
        timestamp: new Date().toISOString(),
        accentClass: "text-emerald-500",
        icon: "customer" as const
      })),
      ...filteredLists.jobs.slice(0, 2).map((job) => ({
        id: `job-${job.id}`,
        title: job.status === "completed" ? "Job Completed" : "Job Updated",
        detail: `${job.title} • ${job.customerName}`,
        timestamp: job.scheduledDate ?? job.dueDate ?? new Date().toISOString(),
        accentClass: "text-blue-500",
        icon: "job" as const
      })),
      ...filteredLists.payments.slice(0, 2).map((payment) => ({
        id: `payment-${payment.id}`,
        title: "Payment Received",
        detail: `${pounds.format(payment.amountPence / 100)} from ${payment.customerName}`,
        timestamp: payment.paidAt,
        accentClass: "text-amber-500",
        icon: "payment" as const
      })),
      ...filteredLists.expenses.slice(0, 1).map((expense) => ({
        id: `expense-${expense.id}`,
        title: "Expense Logged",
        detail: `${pounds.format(expense.amountPence / 100)} for ${expense.note}`,
        timestamp: expense.occurredAt,
        accentClass: "text-rose-500",
        icon: "expense" as const
      }))
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  }, [filteredLists]);

  const nextJobsCount = filteredLists?.jobs.filter((job) => job.status !== "completed").length ?? 0;
  const filteredJobsByStatus = useMemo(() => {
    const jobs = filteredLists?.jobs ?? [];
    if (jobFilter === "all") {
      return jobs;
    }
    if (jobFilter === "in progress") {
      return jobs.filter((job) => job.status.toLowerCase() !== "completed");
    }

    return jobs.filter((job) => job.status.toLowerCase() === jobFilter);
  }, [filteredLists, jobFilter]);
  const totalJobRevenue = filteredJobsByStatus.reduce(
    (sum, job) => sum + Math.max(job.priceTotalPence - job.depositPence, 0),
    0
  );
  const activeJobCount = filteredLists?.jobs.filter((job) => job.status.toLowerCase() !== "completed").length ?? 0;
  const pendingJobCount = filteredLists?.jobs.filter((job) => job.status.toLowerCase() === "pending").length ?? 0;
  const jobFilters = [
    { key: "all", label: "All Jobs" },
    { key: "in progress", label: "In Progress" },
    { key: "pending", label: "Pending" },
    { key: "completed", label: "Completed" },
    { key: "on hold", label: "On Hold" }
  ];
  const activeFinanceTab = location.hash === "#debts" ? "debts" : "payments";
  const totalReceivedPence = filteredLists?.payments.reduce((sum, item) => sum + item.amountPence, 0) ?? 0;
  const totalExpensesPence = filteredLists?.expenses.reduce((sum, item) => sum + item.amountPence, 0) ?? 0;
  const currentMonthExpensesPence = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return (filteredLists?.expenses ?? []).reduce((sum, expense) => {
      const occurredAt = new Date(expense.occurredAt);
      if (occurredAt.getMonth() !== currentMonth || occurredAt.getFullYear() !== currentYear) {
        return sum;
      }

      return sum + expense.amountPence;
    }, 0);
  }, [filteredLists]);
  const outstandingReceivablesPence =
    filteredLists?.customers.reduce((sum, customer) => sum + Math.max(customer.outstandingPence, 0), 0) ?? 0;
  const overdueJobs = useMemo(
    () =>
      (filteredLists?.jobs ?? []).filter((job) => {
        if (job.status.toLowerCase() === "completed" || !job.dueDate) {
          return false;
        }

        return new Date(job.dueDate) < new Date();
      }),
    [filteredLists]
  );
  const overdueReceivablesPence = overdueJobs.reduce(
    (sum, job) => sum + Math.max(job.priceTotalPence - job.depositPence, 0),
    0
  );
  const debtRows = useMemo(() => {
    if (!filteredLists) {
      return [];
    }

    return filteredLists.customers
      .filter((customer) => customer.outstandingPence > 0)
      .map((customer, index) => {
        const customerJobs = filteredLists.jobs.filter((job) => job.customerName === customer.name);
        const latestJob = customerJobs[0];
        const lastPayment = filteredLists.payments.find((payment) => payment.customerName === customer.name);
        const statusMeta = getDebtStatusMeta(latestJob?.status ?? "active", latestJob?.dueDate ?? null);

        return {
          id: customer.id,
          customerName: customer.name,
          initials: getInitials(customer.name),
          avatarClass: getAvatarClass(index),
          projectLabel: latestJob ? `${latestJob.title} (#${latestJob.id.slice(0, 8)})` : "Open balance",
          totalDebtPence: customer.outstandingPence,
          lastPaymentAt: lastPayment?.paidAt ?? null,
          statusLabel: statusMeta.label,
          statusClass: statusMeta.className,
          actionLabel: statusMeta.actionLabel
        };
      })
      .sort((a, b) => b.totalDebtPence - a.totalDebtPence);
  }, [filteredLists]);
  const agingBuckets = useMemo(() => {
    const initial = { current: 0, overdue: 0, critical: 0 };

    return (filteredLists?.jobs ?? []).reduce((acc, job) => {
      if (job.status.toLowerCase() === "completed") {
        return acc;
      }

      const outstanding = Math.max(job.priceTotalPence - job.depositPence, 0);
      if (outstanding <= 0) {
        return acc;
      }

      if (!job.dueDate) {
        acc.current += outstanding;
        return acc;
      }

      const ageDays = Math.floor((new Date().getTime() - new Date(job.dueDate).getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays >= 60) {
        acc.critical += outstanding;
      } else if (ageDays >= 31) {
        acc.overdue += outstanding;
      } else {
        acc.current += outstanding;
      }

      return acc;
    }, initial);
  }, [filteredLists]);
  const maxAgingBucket = Math.max(agingBuckets.current, agingBuckets.overdue, agingBuckets.critical, 1);
  const expenseRows = useMemo(() => {
    if (!filteredLists) {
      return [];
    }

    return filteredLists.expenses
      .map((expense, index) => {
        const statusMeta = getExpenseStatusMeta(expense.occurredAt, expense.amountPence);

        return {
          id: expense.id,
          counterpartyName: expense.counterpartyName,
          initials: getInitials(expense.counterpartyName),
          avatarClass: getAvatarClass(index),
          note: expense.note,
          amountPence: expense.amountPence,
          occurredAt: expense.occurredAt,
          statusLabel: statusMeta.label,
          statusClass: statusMeta.className,
          actionLabel: statusMeta.actionLabel
        };
      })
      .sort((a, b) => b.amountPence - a.amountPence);
  }, [filteredLists]);
  const expenseBuckets = useMemo(() => {
    const initial = { weekly: 0, monthly: 0, older: 0 };

    return (filteredLists?.expenses ?? []).reduce((acc, expense) => {
      const ageDays = Math.floor((new Date().getTime() - new Date(expense.occurredAt).getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays <= 7) {
        acc.weekly += expense.amountPence;
      } else if (ageDays <= 30) {
        acc.monthly += expense.amountPence;
      } else {
        acc.older += expense.amountPence;
      }

      return acc;
    }, initial);
  }, [filteredLists]);
  const maxExpenseBucket = Math.max(expenseBuckets.weekly, expenseBuckets.monthly, expenseBuckets.older, 1);
  const weeklyIncomePence = Math.round(weeklyIncome.reduce((sum, item) => sum + item.value, 0) * 100);
  const currentMonthIncomePence = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return (filteredLists?.payments ?? []).reduce((sum, payment) => {
      const paidAt = new Date(payment.paidAt);
      if (paidAt.getMonth() !== currentMonth || paidAt.getFullYear() !== currentYear) {
        return sum;
      }

      return sum + payment.amountPence;
    }, 0);
  }, [filteredLists]);
  const currentMonthProfitPence = currentMonthIncomePence - currentMonthExpensesPence;
  const reportVolumePence = monthlyComparison.reduce(
    (sum, item) => sum + Math.round(item.income * 100) + Math.round(item.expenses * 100),
    0
  );
  const reportTrend = monthlyComparison.map((item) => ({
    label: item.label,
    profit: item.income - item.expenses,
    expenses: item.expenses
  }));
  const maxProfitTrend = Math.max(...reportTrend.map((item) => item.profit), 1);
  const reportLinePoints = reportTrend
    .map((item, index) => {
      const x = (index / Math.max(reportTrend.length - 1, 1)) * 100;
      const y = 85 - (Math.max(item.profit, 0) / maxProfitTrend) * 55;
      return `${x},${y}`;
    })
    .join(" ");
  const reportAreaPoints = `0,90 ${reportLinePoints} 100,90`;
  const recentTransactions = useMemo(() => {
    const payments =
      filteredLists?.payments.map((payment) => ({
        id: `payment-${payment.id}`,
        description: `Project Payment: ${payment.jobTitle}`,
        entity: payment.customerName,
        category: "Service",
        date: payment.paidAt,
        amountPence: payment.amountPence,
        positive: true
      })) ?? [];

    const expenses =
      filteredLists?.expenses.map((expense) => ({
        id: `expense-${expense.id}`,
        description: expense.note,
        entity: expense.counterpartyName,
        category: "Operating",
        date: expense.occurredAt,
        amountPence: expense.amountPence,
        positive: false
      })) ?? [];

    return [...payments, ...expenses]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);
  }, [filteredLists]);

  const submitCustomerEdit = async () => {
    if (!customerEditor) {
      return;
    }

    setSaving(true);
    setActionError("");

    try {
      await fetchProtected(`/api/customers/${customerEditor.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: customerEditor.name,
          phone: customerEditor.phone
        })
      });
      await refreshDashboard();
      closeDialogs();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Could not update customer.");
    } finally {
      setSaving(false);
    }
  };

  const submitJobEdit = async () => {
    if (!jobEditor) {
      return;
    }

    setSaving(true);
    setActionError("");

    try {
      await fetchProtected(`/api/jobs/${jobEditor.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: jobEditor.title,
          status: jobEditor.status,
          priceTotalPence: Math.round(Number(jobEditor.priceTotal || 0) * 100),
          depositPence: Math.round(Number(jobEditor.deposit || 0) * 100),
          dueDate: jobEditor.dueDate || null
        })
      });
      await refreshDashboard();
      closeDialogs();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Could not update job.");
    } finally {
      setSaving(false);
    }
  };

  const submitExpenseEdit = async () => {
    if (!expenseEditor) {
      return;
    }

    setSaving(true);
    setActionError("");

    try {
      await fetchProtected(`/api/expenses/${expenseEditor.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          counterpartyName: expenseEditor.counterpartyName,
          note: expenseEditor.note,
          amountPence: Math.round(Number(expenseEditor.amount || 0) * 100),
          occurredAt: expenseEditor.occurredAt
        })
      });
      await refreshDashboard();
      closeDialogs();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Could not update expense.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteDialog) {
      return;
    }

    setSaving(true);
    setActionError("");

    try {
      await fetchProtected(`/api/${deleteDialog.resource}s/${deleteDialog.id}`, {
        method: "DELETE"
      });
      await refreshDashboard();
      closeDialogs();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : `Could not delete ${deleteDialog.resource}.`);
    } finally {
      setSaving(false);
    }
  };

  if (redirectToOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef2f7] px-4">
        <div className="w-full max-w-xl rounded-[32px] border border-slate-200 bg-white p-10 text-center shadow-soft">
          <h1 className="font-display text-4xl font-semibold text-slate-950">Loading dashboard</h1>
          <p className="mt-4 text-base leading-7 text-slate-600">Preparing your account data.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef2f7] px-4">
        <div className="w-full max-w-xl rounded-[32px] border border-rose-200 bg-white p-10 text-center shadow-soft">
          <h1 className="font-display text-4xl font-semibold text-slate-950">Dashboard unavailable</h1>
          <p className="mt-4 text-base leading-7 text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  const maxWeeklyIncome = Math.max(...weeklyIncome.map((item) => item.value), 1);
  const linePoints = weeklyIncome
    .map((item, index) => {
      const x = (index / Math.max(weeklyIncome.length - 1, 1)) * 100;
      const y = 85 - (item.value / maxWeeklyIncome) * 55;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,90 ${linePoints} 100,90`;
  const maxMonthlyValue = Math.max(
    ...monthlyComparison.flatMap((item) => [item.income, item.expenses]),
    1
  );

  return (
    <div className="min-h-screen bg-[#eef2f7] text-slate-950">
      <div className="grid min-h-screen xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-r border-slate-200 bg-white/70 px-4 py-6 backdrop-blur-xl">
          <Link to="/" className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_14px_28px_rgba(37,99,235,0.22)]">
              <ToolIcon />
            </div>
            <div>
              <div className="font-display text-[1.45rem] font-semibold leading-none text-slate-950">
                Trades Assistant
              </div>
              <div className="mt-1.5 text-xs uppercase tracking-[0.16em] text-slate-500">
                Business Management
              </div>
            </div>
          </Link>

          <nav className="mt-8 grid gap-2">
            {[
              { label: "Dashboard", icon: "dashboard", href: "/dashboard" },
              { label: "Customers", icon: "customer", href: "/customers" },
              { label: "Jobs", icon: "job", href: "/jobs" },
              { label: "Payments", icon: "payment", href: "/dashboard#payments" },
              { label: "Expenses", icon: "expense", href: "/dashboard#expenses" },
              { label: "Reports", icon: "reports", href: "/dashboard#reports" }
            ].map((item) => (
              <Link
                key={item.label}
                to={item.href}
                className={classNames(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                  `${location.pathname}${location.hash}` === item.href ||
                    (!item.href.includes("#") && !location.hash && location.pathname === item.href)
                    ? "bg-blue-100 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <SidebarIcon kind={item.icon as "dashboard" | "customer" | "job" | "payment" | "expense" | "reports"} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-auto hidden xl:block" />

          <div className="mt-10 rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                {businessName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-950">{businessName}</div>
                <div className="text-xs text-slate-500">Premium Plan</div>
              </div>
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="border-b border-slate-200 bg-white/75 px-5 py-5 backdrop-blur-xl sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div id="overview">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-950">
                  {isCustomersView
                    ? "Customers"
                    : isJobsView
                      ? "Jobs"
                      : isReportsView
                        ? "Financial Reports"
                      : isPaymentsView
                        ? "Financial Overview"
                        : isExpensesView
                          ? "Expense Overview"
                          : "Business Overview"}
                </h1>
                {isPaymentsView || isExpensesView || isReportsView ? (
                  <p className="mt-1 text-sm text-slate-500">
                    {isReportsView
                      ? "A high-level overview of your business health and growth."
                      : isExpensesView
                      ? "Review outgoing spend, supplier activity and recent costs."
                      : "Monitor your business liquidity and outstanding receivables."}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex min-w-[280px] items-center gap-3 rounded-2xl bg-slate-100 px-4 py-2.5 text-slate-500">
                  <SearchIcon />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search records..."
                    className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </label>
                <button className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition hover:bg-slate-200">
                  <BellIcon />
                </button>
                <Link
                  to="/"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Home
                </Link>
                {isPaymentsView || isExpensesView || isReportsView ? (
                  <>
                    <button className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                      {isReportsView ? "Last 30 Days" : "Export PDF"}
                    </button>
                    <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(37,99,235,0.22)] transition hover:bg-blue-700">
                      <PlusIcon />
                      {isReportsView ? "Export Data" : isExpensesView ? "Add Expense" : "Log Payment"}
                    </button>
                  </>
                ) : (
                  <a
                    href={isCustomersView ? "#customers-list" : "#jobs"}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(37,99,235,0.22)] transition hover:bg-blue-700"
                  >
                    <PlusIcon />
                    {isCustomersView ? "Add Customer" : "New Job"}
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="px-5 py-6 sm:px-6">
            {isReportsView ? (
              <div className="space-y-6">
                <div className="grid gap-4 xl:grid-cols-4">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Weekly Income
                    </div>
                    <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                      {pounds.format(weeklyIncomePence / 100)}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-emerald-600">Last 7 days</div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Monthly Income
                    </div>
                    <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                      {pounds.format(currentMonthIncomePence / 100)}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-emerald-600">This calendar month</div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Monthly Expenses
                    </div>
                    <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                      {pounds.format(currentMonthExpensesPence / 100)}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-rose-600">This calendar month</div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Net Profit
                    </div>
                    <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                      {pounds.format(currentMonthProfitPence / 100)}
                    </div>
                    <div
                      className={classNames(
                        "mt-3 text-sm font-semibold",
                        currentMonthProfitPence >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}
                    >
                      {currentMonthProfitPence >= 0 ? "Current month in profit" : "Current month in loss"}
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <Panel title="Income vs Expenses" subtitle="Six-month business activity.">
                    <div className="text-3xl font-semibold tracking-tight text-blue-600">
                      {pounds.format(reportVolumePence / 100)}
                      <span className="ml-2 text-sm font-medium text-slate-400">Total Volume</span>
                    </div>
                    <div className="mt-6 grid grid-cols-6 gap-4 rounded-[22px] bg-[#f8fbff] p-5">
                      {monthlyComparison.length ? (
                        monthlyComparison.map((item) => (
                          <div key={item.label} className="flex flex-col items-center gap-4">
                            <div className="flex h-52 items-end gap-2">
                              <div
                                className="w-7 rounded-t-xl bg-blue-600"
                                style={{ height: `${Math.max((item.income / maxMonthlyValue) * 180, 10)}px` }}
                              />
                              <div
                                className="w-7 rounded-t-xl bg-slate-300"
                                style={{ height: `${Math.max((item.expenses / maxMonthlyValue) * 180, 10)}px` }}
                              />
                            </div>
                            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                              {item.label}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-6 py-16 text-center text-slate-500">
                          No report data yet.
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-5 text-xs font-semibold text-slate-400">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                        Net Profit
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                        Operating Expenses
                      </span>
                    </div>
                  </Panel>

                  <Panel title="Net Profit Trend" subtitle="How profit has moved over recent months.">
                    <div className="text-3xl font-semibold tracking-tight text-emerald-500">
                      {pounds.format(currentMonthProfitPence / 100)}
                      <span className="ml-2 text-sm font-medium text-slate-400">Current run rate</span>
                    </div>
                    <div className="mt-6 rounded-[22px] bg-[#f6fcf9] p-4">
                      <svg viewBox="0 0 100 100" className="h-64 w-full">
                        <defs>
                          <linearGradient id="profit-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.04" />
                          </linearGradient>
                        </defs>
                        <path d={reportAreaPoints} fill="url(#profit-fill)" />
                        <polyline
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={reportLinePoints}
                        />
                      </svg>
                      <div className="mt-2 grid grid-cols-6 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                        {reportTrend.map((item) => (
                          <div key={item.label}>{item.label}</div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 rounded-[18px] bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                      Your reports show how income, expenses and profit are changing month to month.
                    </div>
                  </Panel>
                </div>

                <Panel
                  title="Recent Transactions"
                  subtitle="Latest payments and outgoing costs."
                  right={
                    <button className="text-sm font-semibold text-blue-600 transition hover:text-blue-700">
                      View All
                    </button>
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        <tr>
                          <th className="pb-4 pr-4">Entity / Description</th>
                          <th className="pb-4 px-4">Category</th>
                          <th className="pb-4 px-4">Date</th>
                          <th className="pb-4 pl-4 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentTransactions.length ? (
                          recentTransactions.map((item) => (
                            <tr key={item.id} className="border-b border-slate-100 text-slate-700">
                              <td className="py-4 pr-4">
                                <div className="font-medium text-slate-950">{item.description}</div>
                                <div className="mt-1 text-xs text-slate-400">{item.entity}</div>
                              </td>
                              <td className="px-4 py-4">
                                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                  {item.category}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-slate-500">{fullDate.format(new Date(item.date))}</td>
                              <td
                                className={classNames(
                                  "py-4 pl-4 text-right font-semibold",
                                  item.positive ? "text-emerald-600" : "text-rose-600"
                                )}
                              >
                                {item.positive ? "+" : "-"}
                                {pounds.format(item.amountPence / 100)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-10 text-center text-slate-500">
                              No transactions yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
            ) : isPaymentsView ? (
              <div className="space-y-6">
                <div className="grid gap-4 xl:grid-cols-3">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Total Received
                    </div>
                    <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                      {pounds.format(totalReceivedPence / 100)}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-emerald-600">
                      {summary?.paymentsCount ?? 0} payments recorded
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Outstanding Debts
                    </div>
                    <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                      {pounds.format(outstandingReceivablesPence / 100)}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-amber-600">
                      {debtRows.length} clients pending
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Overdue Amount
                    </div>
                    <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                      {pounds.format(overdueReceivablesPence / 100)}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-rose-600">
                      {overdueJobs.length} late invoices need attention
                    </div>
                  </div>
                </div>

                <Panel
                  title="Receivables Tracker"
                  subtitle="Customer balances, recent payments and collection status."
                >
                  <div className="border-b border-slate-200">
                    <div className="flex flex-wrap gap-6 text-sm font-semibold">
                      <Link
                        to="/dashboard#payments"
                        className={classNames(
                          "border-b-2 pb-3 transition",
                          activeFinanceTab === "payments"
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-slate-400 hover:text-slate-700"
                        )}
                      >
                        Recent Payments
                      </Link>
                      <Link
                        to="/dashboard#debts"
                        className={classNames(
                          "border-b-2 pb-3 transition",
                          activeFinanceTab === "debts"
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-slate-400 hover:text-slate-700"
                        )}
                      >
                        Outstanding Debts
                      </Link>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 lg:flex-row">
                    <label className="flex flex-1 items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-slate-400">
                      <SearchIcon />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search by customer or project..."
                        className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                      />
                    </label>
                    <div className="flex gap-3">
                      <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                        All Status
                      </button>
                      <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                        Newest First
                      </button>
                    </div>
                  </div>

                  {activeFinanceTab === "payments" ? (
                    <div className="mt-5 overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          <tr>
                            <th className="pb-4 pr-4">Customer</th>
                            <th className="pb-4 px-4">Project / Invoice</th>
                            <th className="pb-4 px-4">Amount</th>
                            <th className="pb-4 px-4">Date</th>
                            <th className="pb-4 pl-4 text-right">Method</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLists?.payments.length ? (
                            filteredLists.payments.map((payment, index) => (
                              <tr key={payment.id} className="border-b border-slate-100 text-slate-700">
                                <td className="py-4 pr-4">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${getAvatarClass(
                                        index
                                      )}`}
                                    >
                                      {getInitials(payment.customerName)}
                                    </div>
                                    <span className="font-semibold text-slate-950">{payment.customerName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-slate-500">{payment.jobTitle}</td>
                                <td className="px-4 py-4 font-semibold text-emerald-600">
                                  {pounds.format(payment.amountPence / 100)}
                                </td>
                                <td className="px-4 py-4 text-slate-500">{fullDate.format(new Date(payment.paidAt))}</td>
                                <td className="py-4 pl-4 text-right text-sm font-semibold text-blue-600">
                                  {payment.method}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="py-10 text-center text-slate-500">
                                No payments yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="mt-5 overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          <tr>
                            <th className="pb-4 pr-4">Supplier</th>
                            <th className="pb-4 px-4">Expense</th>
                            <th className="pb-4 px-4">Amount</th>
                            <th className="pb-4 px-4">Date</th>
                            <th className="pb-4 px-4">Status</th>
                            <th className="pb-4 pl-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {debtRows.length ? (
                            debtRows.map((debt) => (
                              <tr key={debt.id} className="border-b border-slate-100 text-slate-700">
                                <td className="py-4 pr-4">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${debt.avatarClass}`}
                                    >
                                      {debt.initials}
                                    </div>
                                    <span className="font-semibold text-slate-950">{debt.customerName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-slate-500">{debt.projectLabel}</td>
                                <td className="px-4 py-4 font-semibold text-rose-600">
                                  {pounds.format(debt.totalDebtPence / 100)}
                                </td>
                                <td className="px-4 py-4 text-slate-500">
                                  {debt.lastPaymentAt ? fullDate.format(new Date(debt.lastPaymentAt)) : "None"}
                                </td>
                                <td className="px-4 py-4">
                                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${debt.statusClass}`}>
                                    {debt.statusLabel}
                                  </span>
                                </td>
                                <td className="py-4 pl-4 text-right text-sm font-semibold text-blue-600">
                                  {debt.actionLabel}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} className="py-10 text-center text-slate-500">
                                No outstanding debts.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
                    <span>
                      Showing {activeFinanceTab === "payments" ? filteredLists?.payments.length ?? 0 : debtRows.length}{" "}
                      of {activeFinanceTab === "payments" ? summary?.paymentsCount ?? 0 : debtRows.length}{" "}
                      {activeFinanceTab === "payments" ? "payments" : "debtors"}
                    </span>
                    <div className="flex gap-2">
                      <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
                        ‹
                      </button>
                      <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
                        ›
                      </button>
                    </div>
                  </div>
                </Panel>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <Panel title="Debt Aging" subtitle="Receivables split by age bucket.">
                    <div className="space-y-4">
                      {[
                        { label: "Current (0-30 Days)", value: agingBuckets.current, color: "bg-blue-600" },
                        { label: "Overdue (31-60 Days)", value: agingBuckets.overdue, color: "bg-amber-500" },
                        { label: "Critical (60+ Days)", value: agingBuckets.critical, color: "bg-rose-500" }
                      ].map((bucket) => (
                        <div key={bucket.label}>
                          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                            <span>{bucket.label}</span>
                            <span>{pounds.format(bucket.value / 100)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${bucket.color}`}
                              style={{ width: `${Math.max((bucket.value / maxAgingBucket) * 100, bucket.value ? 8 : 0)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  <Panel title="Cash Flow Tip" subtitle="Collections guidance from current balances.">
                    <div className="rounded-[20px] bg-[#f6f8fc] p-5 text-sm leading-6 text-slate-600">
                      <div className="text-base font-semibold text-slate-950">
                        {overdueReceivablesPence > 0
                          ? `You have ${pounds.format(overdueReceivablesPence / 100)} in overdue receivables.`
                          : "Your overdue receivables are currently under control."}
                      </div>
                      <p className="mt-3">
                        {debtRows.length
                          ? `Focus on ${debtRows[0].customerName} first, then work through the ${debtRows.length - 1} remaining balances.`
                          : "Log more payments and invoices to unlock tailored collection tips here."}
                      </p>
                      <button className="mt-5 text-sm font-semibold text-blue-600 transition hover:text-blue-700">
                        Set up automated reminders →
                      </button>
                    </div>
                  </Panel>
                </div>
              </div>
            ) : isExpensesView ? (
              <div className="space-y-6">
                <div className="grid gap-4 xl:grid-cols-3">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Total Expenses
                    </div>
                    <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                      {pounds.format(totalExpensesPence / 100)}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-rose-600">
                      {expenseRows.length} expense entries tracked
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      This Month
                    </div>
                    <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                      {pounds.format(currentMonthExpensesPence / 100)}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-amber-600">
                      Resets at the start of each month
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Average Expense
                    </div>
                    <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                      {pounds.format((expenseRows.length ? totalExpensesPence / expenseRows.length : 0) / 100)}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-amber-600">
                      Per logged supplier transaction
                    </div>
                  </div>
                </div>

                <Panel title="Expense Tracker" subtitle="Supplier costs, cash spend and recent outgoing transactions.">
                  <div className="mt-1 flex flex-col gap-3 lg:flex-row">
                    <label className="flex flex-1 items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-slate-400">
                      <SearchIcon />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search supplier or expense note..."
                        className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                      />
                    </label>
                    <div className="flex gap-3">
                      <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                        All Suppliers
                      </button>
                      <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                        Newest First
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        <tr>
                          <th className="pb-4 pr-4">Supplier</th>
                          <th className="pb-4 px-4">Expense</th>
                          <th className="pb-4 px-4">Amount</th>
                          <th className="pb-4 px-4">Date</th>
                          <th className="pb-4 px-4">Status</th>
                          <th className="pb-4 pl-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenseRows.length ? (
                          expenseRows.map((expense) => (
                            <tr key={expense.id} className="border-b border-slate-100 text-slate-700">
                              <td className="py-4 pr-4">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${expense.avatarClass}`}
                                  >
                                    {expense.initials}
                                  </div>
                                  <span className="font-semibold text-slate-950">{expense.counterpartyName}</span>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-slate-500">{expense.note}</td>
                              <td className="px-4 py-4 font-semibold text-rose-600">
                                {pounds.format(expense.amountPence / 100)}
                              </td>
                              <td className="px-4 py-4 text-slate-500">{fullDate.format(new Date(expense.occurredAt))}</td>
                              <td className="px-4 py-4">
                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${expense.statusClass}`}>
                                  {expense.statusLabel}
                                </span>
                              </td>
                              <td className="py-4">
                                <div className="flex justify-end gap-2 text-slate-400">
                                  <button
                                    aria-label={`Edit ${expense.note}`}
                                    type="button"
                                    onClick={() => {
                                      setActionError("");
                                      setExpenseEditor({
                                        id: expense.id,
                                        counterpartyName: expense.counterpartyName,
                                        note: expense.note,
                                        amount: (expense.amountPence / 100).toFixed(2),
                                        occurredAt: toDateInputValue(expense.occurredAt)
                                      });
                                    }}
                                    className="rounded-lg p-2 text-emerald-500 transition hover:bg-emerald-50 hover:text-emerald-600"
                                  >
                                    <PencilIcon />
                                  </button>
                                  <button
                                    aria-label={`Delete ${expense.note}`}
                                    type="button"
                                    onClick={() => {
                                      setActionError("");
                                      setDeleteDialog({
                                        resource: "expense",
                                        id: expense.id,
                                        label: expense.note
                                      });
                                    }}
                                    className="rounded-lg p-2 text-amber-500 transition hover:bg-amber-50 hover:text-amber-600"
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-slate-500">
                              No expenses yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
                    <span>Showing {expenseRows.length} of {expenseRows.length} expenses</span>
                    <div className="flex gap-2">
                      <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
                        ‹
                      </button>
                      <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
                        ›
                      </button>
                    </div>
                  </div>
                </Panel>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <Panel title="Expense Timing" subtitle="Spending split by recency bucket.">
                    <div className="space-y-4">
                      {[
                        { label: "This Week", value: expenseBuckets.weekly, color: "bg-blue-600" },
                        { label: "This Month", value: expenseBuckets.monthly, color: "bg-amber-500" },
                        { label: "Older", value: expenseBuckets.older, color: "bg-rose-500" }
                      ].map((bucket) => (
                        <div key={bucket.label}>
                          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                            <span>{bucket.label}</span>
                            <span>{pounds.format(bucket.value / 100)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${bucket.color}`}
                              style={{ width: `${Math.max((bucket.value / maxExpenseBucket) * 100, bucket.value ? 8 : 0)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  <Panel title="Spending Tip" subtitle="Guidance from current expense activity.">
                    <div className="rounded-[20px] bg-[#f6f8fc] p-5 text-sm leading-6 text-slate-600">
                      <div className="text-base font-semibold text-slate-950">
                        {expenseRows.length
                          ? `You have spent ${pounds.format(totalExpensesPence / 100)} across ${expenseRows.length} logged expenses.`
                          : "No expenses are currently logged."}
                      </div>
                      <p className="mt-3">
                        {expenseRows.length
                          ? `Largest recent cost is ${expenseRows[0].counterpartyName} at ${pounds.format(expenseRows[0].amountPence / 100)}. Review repeat spend categories first.`
                          : "Log supplier bills and cash expenses to unlock tailored spending tips here."}
                      </p>
                      <button className="mt-5 text-sm font-semibold text-blue-600 transition hover:text-blue-700">
                        Review expense controls →
                      </button>
                    </div>
                  </Panel>
                </div>
              </div>
            ) : isCustomersView ? (
              <div className="space-y-6">
                <Panel
                  id="customers-list"
                  title="Customers"
                  subtitle="Manage your client relationships and job history."
                >
                  <label className="flex items-center gap-4 rounded-2xl bg-slate-100 px-5 py-4 text-slate-400">
                    <SearchIcon />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search customers by name or phone..."
                      className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </label>
                </Panel>

                <Panel
                  title="Customer List"
                  subtitle={`Showing ${filteredLists?.customers.length ?? 0} customers`}
                >
                  <div className="mb-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-amber-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
                        Total Outstanding Balance
                      </div>
                      <div className="mt-1 text-xl font-semibold text-slate-950">
                        {pounds.format((filteredLists?.customers.reduce((sum, customer) => sum + customer.outstandingPence, 0) ?? 0) / 100)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                        Active Jobs
                      </div>
                      <div className="mt-1 text-xl font-semibold text-slate-950">
                        {filteredLists?.jobs.filter((job) => job.status !== "completed").length ?? 0}
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="pb-4 pr-8 font-medium">Customer Name</th>
                          <th className="pb-4 px-4 font-medium">Phone</th>
                          <th className="pb-4 px-6 text-center font-medium">Total Jobs</th>
                          <th className="pb-4 px-6 text-center font-medium">Total Paid</th>
                          <th className="pb-4 px-6 text-center font-medium">Outstanding Balance</th>
                          <th className="pb-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLists?.customers.length ? (
                          filteredLists.customers.map((customer, index) => (
                            <tr key={customer.id} className="border-b border-slate-100 text-slate-700">
                              <td className="py-4 pr-8">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${getAvatarClass(
                                      index
                                    )}`}
                                  >
                                    {getInitials(customer.name)}
                                  </div>
                                  <div className="font-semibold text-slate-950">{customer.name}</div>
                                </div>
                              </td>
                              <td className="px-4 py-4">{customer.phone || "-"}</td>
                              <td className="px-6 py-4 text-center">{customer.totalJobs}</td>
                              <td className="px-6 py-4 text-center">{pounds.format(customer.totalPaidPence / 100)}</td>
                              <td className="px-6 py-4 text-center">
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getOutstandingClass(
                                    customer.outstandingPence
                                  )}`}
                                >
                                  {pounds.format(customer.outstandingPence / 100)}
                                </span>
                              </td>
                              <td className="py-4">
                                <div className="flex justify-end gap-2 text-slate-400">
                                  <button
                                    aria-label={`Edit ${customer.name}`}
                                    type="button"
                                    onClick={() => {
                                      setActionError("");
                                      setCustomerEditor({
                                        id: customer.id,
                                        name: customer.name,
                                        phone: customer.phone ?? ""
                                      });
                                    }}
                                    className="rounded-lg p-2 text-emerald-500 transition hover:bg-emerald-50 hover:text-emerald-600"
                                  >
                                    <PencilIcon />
                                  </button>
                                  <button
                                    aria-label={`Delete ${customer.name}`}
                                    type="button"
                                    onClick={() => {
                                      setActionError("");
                                      setDeleteDialog({
                                        resource: "customer",
                                        id: customer.id,
                                        label: customer.name
                                      });
                                    }}
                                    className="rounded-lg p-2 text-amber-500 transition hover:bg-amber-50 hover:text-amber-600"
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-slate-500">
                              No customers found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
            ) : isJobsView ? (
              <div className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-sm font-medium text-slate-500">Total Revenue</div>
                    <div className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
                      {pounds.format(totalJobRevenue / 100)}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-emerald-600">Current filtered jobs</div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-sm font-medium text-slate-500">Active Jobs</div>
                    <div className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
                      {activeJobCount}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-blue-600">Open across all statuses</div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                    <div className="text-sm font-medium text-slate-500">Pending Quotes</div>
                    <div className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
                      {pendingJobCount}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-amber-600">Requires action</div>
                  </div>
                </div>

                <Panel
                  id="jobs-list"
                  title="Job Tracking"
                  subtitle="Manage your active work orders and service history."
                >
                  <div className="flex flex-wrap gap-3">
                    {jobFilters.map((filter) => (
                      <button
                        key={filter.key}
                        type="button"
                        onClick={() => setJobFilter(filter.key)}
                        className={classNames(
                          "rounded-full border px-4 py-2 text-sm font-semibold transition",
                          jobFilter === filter.key
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
                        )}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </Panel>

                <Panel title="Job List" subtitle={`Showing ${filteredJobsByStatus.length} jobs`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="pb-4 pr-6 font-medium">Job Title</th>
                          <th className="pb-4 px-4 font-medium">Customer</th>
                          <th className="pb-4 px-4 text-center font-medium">Status</th>
                          <th className="pb-4 px-4 text-center font-medium">Price</th>
                          <th className="pb-4 px-4 text-center font-medium">Date</th>
                          <th className="pb-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredJobsByStatus.length ? (
                          filteredJobsByStatus.map((job) => (
                            <tr key={job.id} className="border-b border-slate-100 text-slate-700">
                              <td className="py-4 pr-6">
                                <div className="font-semibold text-slate-950">{job.title}</div>
                                <div className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-slate-400">
                                  #{job.id.slice(0, 8)}
                                </div>
                              </td>
                              <td className="px-4 py-4 font-medium text-slate-600">{job.customerName}</td>
                              <td className="px-4 py-4 text-center">
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${getJobStatusClass(
                                    job.status
                                  )}`}
                                >
                                  {job.status}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-center font-semibold text-slate-950">
                                <div>{pounds.format((job.priceTotalPence - job.depositPence) / 100)}</div>
                                <div className="mt-1 text-xs font-medium text-amber-600">
                                  Deposit {pounds.format(job.depositPence / 100)}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center text-slate-600">{getJobDateLabel(job)}</td>
                              <td className="py-4">
                                <div className="flex justify-end gap-2 text-slate-400">
                                  <button
                                    aria-label={`Edit ${job.title}`}
                                    type="button"
                                    onClick={() => {
                                      setActionError("");
                                      setJobEditor({
                                        id: job.id,
                                        title: job.title,
                                        status: job.status,
                                        priceTotal: (job.priceTotalPence / 100).toFixed(2),
                                        deposit: (job.depositPence / 100).toFixed(2),
                                        dueDate: toDateInputValue(job.scheduledDate ?? job.dueDate)
                                      });
                                    }}
                                    className="rounded-lg p-2 text-emerald-500 transition hover:bg-emerald-50 hover:text-emerald-600"
                                  >
                                    <PencilIcon />
                                  </button>
                                  <button
                                    aria-label={`Delete ${job.title}`}
                                    type="button"
                                    onClick={() => {
                                      setActionError("");
                                      setDeleteDialog({
                                        resource: "job",
                                        id: job.id,
                                        label: job.title
                                      });
                                    }}
                                    className="rounded-lg p-2 text-amber-500 transition hover:bg-amber-50 hover:text-amber-600"
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-slate-500">
                              No jobs found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
            ) : (
            <>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
                  <StatCard
                    title="Total Customers"
                    value={String(summary?.customersCount ?? 0)}
                    trend="↗12%"
                    icon={<SidebarIcon kind="customer" />}
                  />
                  <StatCard
                    title="Active Jobs"
                    value={String(summary?.activeJobsCount ?? 0)}
                    trend="↗5%"
                    icon={<SidebarIcon kind="job" />}
                  />
                  <StatCard
                    title="Payments Received"
                    value={pounds.format(
                      (filteredLists?.payments.reduce((sum, item) => sum + item.amountPence, 0) ?? 0) / 100
                    )}
                    trend="↗18%"
                    icon={<SidebarIcon kind="payment" />}
                  />
                  <StatCard
                    title="Outstanding Debts"
                    value={pounds.format(
                      (filteredLists?.debts.reduce((sum, item) => sum + item.balancePence, 0) ?? 0) / 100
                    )}
                    trend="↘2%"
                    icon={<SidebarIcon kind="debt" />}
                    danger
                  />
                </div>

                <Panel
                  title="Weekly Income"
                  subtitle="Revenue performance last 7 days"
                  right={
                    <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">
                      Last 7 Days
                    </div>
                  }
                >
                  <div className="rounded-[22px] bg-[#f8fbff] p-4">
                    <svg viewBox="0 0 100 100" className="h-56 w-full">
                      <defs>
                        <linearGradient id="income-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.18" />
                          <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <path d={`M ${areaPoints}`} fill="url(#income-fill)" />
                      <polyline
                        fill="none"
                        stroke="#1d4ed8"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={linePoints}
                      />
                      {weeklyIncome.map((item, index) => {
                        const x = (index / Math.max(weeklyIncome.length - 1, 1)) * 100;
                        const y = 85 - (item.value / maxWeeklyIncome) * 55;
                        return <circle key={item.key} cx={x} cy={y} r="1.25" fill="#1d4ed8" />;
                      })}
                    </svg>
                    <div className="mt-3 grid grid-cols-7 text-center text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                      {weeklyIncome.map((item) => (
                        <div key={item.key}>{item.label}</div>
                      ))}
                    </div>
                  </div>
                </Panel>

                <Panel
                  title="Income vs Expenses"
                  subtitle="Monthly financial comparison"
                  right={
                    <div className="flex items-center gap-5 text-sm text-slate-600">
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full bg-blue-600" />
                        Income
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full bg-slate-300" />
                        Expenses
                      </span>
                    </div>
                  }
                  className="scroll-mt-24"
                >
                  <div id="reports" className="grid grid-cols-6 gap-5 rounded-[22px] bg-[#f8fbff] p-5">
                    {monthlyComparison.length ? (
                      monthlyComparison.map((item) => (
                        <div key={item.label} className="flex flex-col items-center gap-4">
                          <div className="flex h-52 items-end gap-2.5">
                            <div
                              className="w-7 rounded-t-xl bg-blue-600"
                              style={{ height: `${Math.max((item.income / maxMonthlyValue) * 180, 8)}px` }}
                            />
                            <div
                              className="w-7 rounded-t-xl bg-slate-300"
                              style={{ height: `${Math.max((item.expenses / maxMonthlyValue) * 180, 8)}px` }}
                            />
                          </div>
                          <div className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                            {item.label}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-6 py-16 text-center text-slate-500">
                        No payment or expense data yet.
                      </div>
                    )}
                  </div>
                </Panel>
              </div>

              <Panel title="Recent Activity" subtitle="Latest business updates">
                <div className="space-y-6">
                  {recentActivity.length ? (
                    recentActivity.map((item) => (
                      <div key={item.id} className="flex items-start gap-4">
                        <ActivityIcon kind={item.icon} />
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-slate-950">{item.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.detail}</div>
                          <div className={classNames("mt-2 text-sm font-semibold uppercase tracking-[0.12em]", item.accentClass)}>
                            {shortDate.format(new Date(item.timestamp))}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center text-slate-500">
                      No recent activity yet.
                    </div>
                  )}

                  <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5">
                    <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Upcoming tomorrow
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 text-sm text-slate-950">
                        <span className="h-3 w-3 rounded-full bg-blue-600" />
                        <span>{nextJobsCount} Scheduled Jobs</span>
                      </div>
                      <span className="text-xl text-slate-400">›</span>
                    </div>
                  </div>
                </div>
              </Panel>
            </div>
            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              <TablePanel id="customers" title="Customers" subtitle="Recent customers and balance status">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="pb-3 font-medium">Name</th>
                      <th className="pb-3 font-medium">Phone</th>
                      <th className="pb-3 font-medium">Jobs</th>
                      <th className="pb-3 font-medium">Paid</th>
                      <th className="pb-3 font-medium">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLists?.customers.length ? (
                      filteredLists.customers.map((customer) => (
                        <tr key={customer.id} className="border-b border-slate-100 text-slate-700">
                          <td className="py-3 font-medium text-slate-950">{customer.name}</td>
                          <td className="py-3">{customer.phone || "-"}</td>
                          <td className="py-3">{customer.totalJobs}</td>
                          <td className="py-3">{pounds.format(customer.totalPaidPence / 100)}</td>
                          <td className="py-3">{pounds.format(customer.outstandingPence / 100)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500">
                          No customers yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TablePanel>

              <TablePanel id="jobs" title="Jobs" subtitle="Latest work items and status">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="pb-3 font-medium">Job</th>
                      <th className="pb-3 font-medium">Customer</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLists?.jobs.length ? (
                      filteredLists.jobs.map((job) => (
                        <tr key={job.id} className="border-b border-slate-100 text-slate-700">
                          <td className="py-3 font-medium text-slate-950">{job.title}</td>
                          <td className="py-3">{job.customerName}</td>
                          <td className="py-3 capitalize">{job.status}</td>
                          <td className="py-3">{pounds.format(job.priceTotalPence / 100)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500">
                          No jobs yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TablePanel>

              <TablePanel id="payments" title="Payments" subtitle="Customer payments received">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="pb-3 font-medium">Customer</th>
                      <th className="pb-3 font-medium">Job</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLists?.payments.length ? (
                      filteredLists.payments.map((payment) => (
                        <tr key={payment.id} className="border-b border-slate-100 text-slate-700">
                          <td className="py-3 font-medium text-slate-950">{payment.customerName}</td>
                          <td className="py-3">{payment.jobTitle}</td>
                          <td className="py-3">{pounds.format(payment.amountPence / 100)}</td>
                          <td className="py-3">{shortDate.format(new Date(payment.paidAt))}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500">
                          No payments yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TablePanel>

              <TablePanel id="debts" title="Debts" subtitle="Supplier and vendor balances">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="pb-3 font-medium">Vendor</th>
                      <th className="pb-3 font-medium">Balance</th>
                      <th className="pb-3 font-medium">Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLists?.debts.length ? (
                      filteredLists.debts.map((debt) => (
                        <tr key={debt.id} className="border-b border-slate-100 text-slate-700">
                          <td className="py-3 font-medium text-slate-950">{debt.vendorName}</td>
                          <td className="py-3">{pounds.format(debt.balancePence / 100)}</td>
                          <td className="py-3">
                            {debt.lastActivityAt ? shortDate.format(new Date(debt.lastActivityAt)) : "-"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-slate-500">
                          No debts yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TablePanel>
            </div>
            </>
            )}
          </div>
        </main>
      </div>

      {customerEditor ? (
        <ModalShell
          title="Edit customer"
          description="Update the customer details shown in your dashboard."
          onClose={closeDialogs}
        >
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Name
              <input
                value={customerEditor.name}
                onChange={(event) => setCustomerEditor({ ...customerEditor, name: event.target.value })}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Phone
              <input
                value={customerEditor.phone}
                onChange={(event) => setCustomerEditor({ ...customerEditor, phone: event.target.value })}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
              />
            </label>
            {actionError ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</div> : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDialogs}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitCustomerEdit()}
                disabled={saving}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {jobEditor ? (
        <ModalShell
          title="Edit job"
          description="Update the job details from the jobs list."
          onClose={closeDialogs}
        >
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Title
              <input
                value={jobEditor.title}
                onChange={(event) => setJobEditor({ ...jobEditor, title: event.target.value })}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Status
                <select
                  value={jobEditor.status}
                  onChange={(event) => setJobEditor({ ...jobEditor, status: event.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="canceled">Canceled</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Due date
                <input
                  type="date"
                  value={jobEditor.dueDate}
                  onChange={(event) => setJobEditor({ ...jobEditor, dueDate: event.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Total price (GBP)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={jobEditor.priceTotal}
                  onChange={(event) => setJobEditor({ ...jobEditor, priceTotal: event.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Deposit (GBP)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={jobEditor.deposit}
                  onChange={(event) => setJobEditor({ ...jobEditor, deposit: event.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
                />
              </label>
            </div>
            {actionError ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</div> : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDialogs}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitJobEdit()}
                disabled={saving}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {expenseEditor ? (
        <ModalShell
          title="Edit expense"
          description="Update the supplier transaction details."
          onClose={closeDialogs}
        >
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Supplier
              <input
                value={expenseEditor.counterpartyName}
                onChange={(event) =>
                  setExpenseEditor({ ...expenseEditor, counterpartyName: event.target.value })
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Expense note
              <input
                value={expenseEditor.note}
                onChange={(event) => setExpenseEditor({ ...expenseEditor, note: event.target.value })}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Amount (GBP)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseEditor.amount}
                  onChange={(event) => setExpenseEditor({ ...expenseEditor, amount: event.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Date
                <input
                  type="date"
                  value={expenseEditor.occurredAt}
                  onChange={(event) => setExpenseEditor({ ...expenseEditor, occurredAt: event.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500"
                />
              </label>
            </div>
            {actionError ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</div> : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDialogs}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitExpenseEdit()}
                disabled={saving}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {deleteDialog ? (
        <ModalShell
          title={`Delete ${deleteDialog.resource}`}
          description={`This will permanently remove ${deleteDialog.label}.`}
          onClose={closeDialogs}
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {deleteDialog.resource === "customer"
                ? "Deleting a customer will also remove that customer's jobs from the dashboard."
                : "This action cannot be undone."}
            </div>
            {actionError ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</div> : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDialogs}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={saving}
                className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
};

export const DashboardPage = () => {
  return (
    <>
      <SignedIn>
        <DashboardInner />
      </SignedIn>
      <SignedOut>
        <Navigate to="/login" replace />
      </SignedOut>
    </>
  );
};
