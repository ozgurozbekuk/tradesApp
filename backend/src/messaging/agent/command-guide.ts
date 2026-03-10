type CommandGuideOptions = {
  registered?: boolean;
  lastIntent?: string;
};

const GUIDES = {
  onboarding: [
    "BUSINESS Ozgur Plumbing"
  ],
  jobs: [
    "NEW JOB customer: John; title: Boiler repair; total: 450",
    "Active jobs",
    "close the boiler job"
  ],
  payments: [
    "PAYMENT customer: John; amount: 200",
    "John paid 250 add it",
    "show yesterday's payments"
  ],
  expenses: [
    "I paid 300 for paint and 50 for parking",
    "bring my expenses list"
  ],
  customers: [
    "Find John",
    "open Ahmed's account",
    "change John's phone to +447700900123"
  ],
  invoices: [
    "create invoice for John"
  ],
  summary: [
    "how much did I make this week"
  ]
} as const;

const pickExamples = (input?: CommandGuideOptions) => {
  if (input?.registered === false) {
    return [...GUIDES.onboarding, ...GUIDES.jobs];
  }

  switch (input?.lastIntent) {
    case "record_payment":
    case "list_payments":
      return [...GUIDES.payments, ...GUIDES.customers];
    case "record_expense":
      return [...GUIDES.expenses, ...GUIDES.payments];
    case "create_job":
    case "update_job_status":
      return [...GUIDES.jobs, ...GUIDES.customers];
    case "get_customer_account":
    case "search_customer":
      return [...GUIDES.customers, ...GUIDES.jobs];
    case "create_invoice":
      return [...GUIDES.invoices, ...GUIDES.customers];
    case "get_financial_summary":
    case "list_debts":
      return [...GUIDES.summary, ...GUIDES.payments, ...GUIDES.jobs];
    default:
      return [
        ...GUIDES.jobs,
        ...GUIDES.payments,
        ...GUIDES.expenses,
        ...GUIDES.customers,
        ...GUIDES.summary,
        ...GUIDES.invoices
      ];
  }
};

export const buildCommandGuide = (input?: CommandGuideOptions) =>
  ["You can send commands like:", ...pickExamples(input).map((example) => `-${example}`)].join("\n");
