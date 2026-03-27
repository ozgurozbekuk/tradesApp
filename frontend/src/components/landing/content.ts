// Stores landing page copy and configuration values.
export const howItWorksSteps = [
  {
    title: "Open WhatsApp",
    description: "Message your assistant the same way you would text a secretary during the day."
  },
  {
    title: "Tell it what happened",
    description: "Add customers, log payments, track jobs, and ask simple business questions."
  },
  {
    title: "Stay organised",
    description: "The assistant keeps records, reminders, totals, and reports in one calm workflow."
  }
];

export const featureCards = [
  {
    title: "Customer management",
    description: "Keep names, phone numbers, balances, and recent activity without messy notebooks."
  },
  {
    title: "Job tracking",
    description: "See what is booked, what is in progress, and what still needs to be closed."
  },
  {
    title: "Payments and debts",
    description: "Record customer payments, supplier debts, and outstanding balances in plain language."
  },
  {
    title: "Simple bookkeeping",
    description: "Track what came in, what went out, and get basic weekly and monthly financial visibility."
  },
  {
    title: "Invoices on demand",
    description: "Create clear PDF invoices and send records when you need them, without admin overhead."
  },
  {
    title: "WhatsApp-first workflow",
    description: "Use the tool where you already work, instead of learning heavy business software."
  }
];

export const useCaseCommands = [
  "Add a new customer called John Miller",
  "Show unpaid customers",
  "Record a 120 pound payment from Ahmad",
  "Bring Sarah records as PDF",
  "What did I earn this week?",
  "Create John invoice"
];

export const pricingPlans = [
  {
    name: "Starter",
    price: "Free",
    description: "For sole traders who want a simple WhatsApp admin helper.",
    features: ["WhatsApp AI assistant", "Customer and job notes", "Basic summaries", "PDF exports"],
    featured: false,
    cta: "Start Free"
  },
  {
    name: "Pro",
    price: "29",
    description: "For busy tradespeople who need deeper tracking and a more complete workflow.",
    features: [
      "Everything in Starter",
      "Payments and debt tracking",
      "Invoices and records PDF",
      "Morning briefings",
      "Priority support"
    ],
    featured: true,
    cta: "Start Pro Trial"
  }
];

export const footerLinks = {
  Product: ["Features", "How it works", "Pricing", "WhatsApp setup"],
  Resources: ["Use cases", "Help centre", "Privacy policy", "Terms"]
};
