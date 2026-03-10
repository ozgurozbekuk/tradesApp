import fs from "fs";
import path from "path";
import { parseWithAgentLayer } from "../../src/messaging/parsers/agent-orchestrator";

type EvalCase = {
  input: string;
  expected_intent: string;
  expected_entities?: Record<string, unknown>;
  should_clarify?: boolean;
  should_disambiguate?: boolean;
};

const INTENT_ALIASES: Record<string, string> = {
  create_customer: "customer_create",
  customer_create: "customer_create",
  get_customer_account: "customer_lookup",
  search_customer: "customer_lookup",
  customer_find: "customer_lookup",
  update_customer: "customer_update_phone",
  update_customer_phone: "customer_update_phone",
  list_expenses: "expense_list",
  expense_list: "expense_list",
  record_vendor_debt: "vendor_debt_add",
  vendor_debt_add: "vendor_debt_add",
  record_vendor_payment: "vendor_payment_add",
  vendor_payment_add: "vendor_payment_add",
  vendor_summary: "vendor_summary",
  export_vendor_report: "export_vendor_pdf",
  export_vendor_pdf: "export_vendor_pdf",
  export_expenses_pdf: "export_expense_pdf",
  export_expense_pdf: "export_expense_pdf",
  export_all_records: "export_pdf",
  export_customer_records: "export_pdf",
  export_pdf: "export_pdf",
  toggle_briefing: "briefing_toggle",
  briefing_toggle: "briefing_toggle",
  record_payment: "payment_add",
  payment_add: "payment_add",
  list_payments: "payment_list",
  payment_list: "payment_list",
  list_debts: "outstanding_list",
  outstanding_list: "outstanding_list",
  create_invoice: "invoice_create",
  invoice_create: "invoice_create",
  create_job: "job_create",
  job_create: "job_create",
  list_jobs: "job_list",
  job_list_active: "job_list",
  job_list_due_week: "job_list",
  job_list_last_30: "job_list",
  get_financial_summary: "summary",
  summary_today: "summary",
  summary_yesterday: "summary",
  summary_7: "summary",
  summary_30: "summary",
  update_job_status: "job_status",
  job_close: "job_status",
  job_close_customer: "job_status",
  job_set_status: "job_status",
  record_expense: "expense_add",
  expense_add: "expense_add",
  expense_add_batch: "expense_add"
};

const normalizeIntent = (value: string) => INTENT_ALIASES[value] ?? value;

const intentsEquivalent = (expected: string, actual: string) => {
  const normalizedExpected = normalizeIntent(expected);
  const normalizedActual = normalizeIntent(actual);

  if (normalizedExpected === normalizedActual) {
    return true;
  }

  return false;
};

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") {
    process.exit(0);
  }

  throw error;
});

const run = async () => {
  const evalDir = path.resolve(process.cwd(), "scripts/eval");
  const splitFiles = ["agent-eval-core.json", "agent-eval-edge.json"]
    .map((name) => path.join(evalDir, name))
    .filter((file) => fs.existsSync(file));

  const files = splitFiles.length ? splitFiles : [path.join(evalDir, "agent-eval-set.json")];
  const cases = files.flatMap((file) => JSON.parse(fs.readFileSync(file, "utf8")) as EvalCase[]);

  let passed = 0;

  console.log("idx\texpected\tactual\tstatus\tclarify\tdisamb\tconfidence\tresult");

  for (const [index, testCase] of cases.entries()) {
    const parse = await parseWithAgentLayer(testCase.input);
    const analysis = parse.analysis;
    const actualIntent = parse.status === "intent" ? parse.intent.type : analysis?.intent ?? parse.status;
    const confidence =
      parse.status === "intent"
        ? parse.confidence.toFixed(2)
        : analysis
          ? analysis.confidence.toFixed(2)
          : "n/a";
    const actualClarify = parse.status === "clarification" || Boolean(analysis?.missingFields.length);
    const actualDisambiguate = Boolean(analysis?.needsDisambiguation);

    const ok =
      intentsEquivalent(testCase.expected_intent, actualIntent) &&
      actualClarify === Boolean(testCase.should_clarify) &&
      actualDisambiguate === Boolean(testCase.should_disambiguate);
    if (ok) {
      passed += 1;
    }

    console.log(
      `${index + 1}\t${testCase.expected_intent}\t${actualIntent}\t${parse.status}\t${actualClarify}\t${actualDisambiguate}\t${confidence}\t${ok ? "PASS" : "FAIL"}`
    );
  }

  const total = cases.length;
  const accuracy = ((passed / total) * 100).toFixed(1);
  console.log(`\nSummary: ${passed}/${total} passed (${accuracy}%)`);

  if (passed !== total) {
    process.exitCode = 1;
  }
};

void run();
