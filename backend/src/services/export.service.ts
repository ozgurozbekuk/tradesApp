import crypto from "crypto";
import { prisma } from "../db/prisma";
import { calculateJobOutstandingPence } from "./jobs.service";
import { env } from "../config/env";

export type ExportKind = "jobs" | "customers" | "payments" | "vendor_ledgers" | "money_transactions";
export type ExportReportType = "csv" | "pdf";

type ExportTokenPayload = {
  userId: string;
  exp: number;
  nonce: string;
  reportType?: ExportReportType;
  customerQuery?: string;
  customerId?: string;
  pdfMode?: "records" | "vendors" | "expenses" | "invoice";
  vendorQuery?: string;
  vendorId?: string;
};

const EXPORT_KINDS: ExportKind[] = [
  "jobs",
  "customers",
  "payments",
  "vendor_ledgers",
  "money_transactions"
];
const PDF_PAGE_WIDTH = 595;
const PDF_PAGE_HEIGHT = 842;
const PDF_MARGIN = 42;
const PDF_FONT_SIZE = 10;
const PDF_LINE_HEIGHT = 14;
const PDF_MAX_LINE_LENGTH = 100;
const PDF_CACHE_TTL_MS = 30 * 60 * 1000;
const GBP_FORMATTER = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP"
});

const getExportSecret = () => {
  const secret =
    env.EXPORT_TOKEN_SECRET || env.STRIPE_WEBHOOK_SECRET || env.TWILIO_AUTH_TOKEN;

  if (!secret) {
    throw new Error(
      "Missing export token secret. Set one of: EXPORT_TOKEN_SECRET, STRIPE_WEBHOOK_SECRET, TWILIO_AUTH_TOKEN."
    );
  }

  return secret;
};

const base64UrlEncode = (value: string) => Buffer.from(value).toString("base64url");
const base64UrlDecode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const sign = (value: string, secret: string) => {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
};

const escapeCsv = (value: string | null | undefined) => {
  const normalized = value ?? "";
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
};

const compactDate = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : "-");
const penceToPounds = (value: number) => GBP_FORMATTER.format(value / 100);

const normalizePdfText = (value: string) => {
  const poundToken = "__POUND__";
  const withToken = value.replace(/£/g, poundToken);
  const ascii = withToken.replace(/[^\x20-\x7e]/g, "?");
  const escaped = ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  // Base-14 Helvetica with WinAnsi supports pound sign via octal \243.
  return escaped.replace(new RegExp(poundToken, "g"), "\\243");
};

const wrapPdfLine = (line: string) => {
  if (line.length <= PDF_MAX_LINE_LENGTH) {
    return [line];
  }

  const words = line.split(/\s+/).filter(Boolean);
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= PDF_MAX_LINE_LENGTH) {
      current = next;
      continue;
    }

    if (current) {
      wrapped.push(current);
      current = word;
      continue;
    }

    wrapped.push(word.slice(0, PDF_MAX_LINE_LENGTH));
    current = word.slice(PDF_MAX_LINE_LENGTH);
  }

  if (current) {
    wrapped.push(current);
  }

  return wrapped;
};

const paginateLines = (lines: string[]) => {
  const maxLinesPerPage = Math.floor((PDF_PAGE_HEIGHT - PDF_MARGIN * 2) / PDF_LINE_HEIGHT);
  const pages: string[][] = [];
  let currentPage: string[] = [];

  for (const line of lines) {
    const wrappedLines = wrapPdfLine(line);
    for (const wrappedLine of wrappedLines) {
      if (currentPage.length >= maxLinesPerPage) {
        pages.push(currentPage);
        currentPage = [];
      }
      currentPage.push(wrappedLine);
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages.length > 0 ? pages : [["No data"]];
};

const buildSimplePdf = (lines: string[]) => {
  const pages = paginateLines(lines);
  const objects = new Map<number, string>();
  const contentObjectNumbers: number[] = [];
  const pageObjectNumbers: number[] = [];
  const fontObjectNumber = 3 + pages.length * 2;

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    pageObjectNumbers.push(pageObjectNumber);
    contentObjectNumbers.push(contentObjectNumber);

    const textLines = pageLines.map((line) => `(${normalizePdfText(line)}) Tj`).join("\n0 -14 Td\n");
    const stream = `BT
/F1 ${PDF_FONT_SIZE} Tf
1 0 0 1 ${PDF_MARGIN} ${PDF_PAGE_HEIGHT - PDF_MARGIN} Tm
${textLines}
ET`;
    const streamLength = Buffer.byteLength(stream, "utf8");

    objects.set(
      contentObjectNumber,
      `<< /Length ${streamLength} >>
stream
${stream}
endstream`
    );

    objects.set(
      pageObjectNumber,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    );
  });

  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((num) => `${num} 0 R`).join(" ")}] /Count ${pages.length} >>`
  );
  objects.set(fontObjectNumber, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const maxObjectNumber = fontObjectNumber;
  let output = "%PDF-1.4\n";
  const offsets: number[] = new Array(maxObjectNumber + 1).fill(0);

  for (let objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber += 1) {
    const body = objects.get(objectNumber);
    if (!body) {
      continue;
    }

    offsets[objectNumber] = Buffer.byteLength(output, "utf8");
    output += `${objectNumber} 0 obj\n${body}\nendobj\n`;
  }

  const startXref = Buffer.byteLength(output, "utf8");
  output += `xref
0 ${maxObjectNumber + 1}
0000000000 65535 f 
`;

  for (let objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber += 1) {
    const offset = offsets[objectNumber];
    if (offset === 0) {
      output += "0000000000 65535 f \n";
      continue;
    }

    output += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }

  output += `trailer
<< /Size ${maxObjectNumber + 1} /Root 1 0 R >>
startxref
${startXref}
%%EOF`;

  return Buffer.from(output, "utf8");
};

const sanitizeFilenamePart = (value: string) => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "customer";
};

type PdfCacheValue = {
  filename: string;
  buffer: Buffer;
};

type PdfCacheEntry = {
  fingerprint: string;
  createdAt: number;
  value: PdfCacheValue;
};

type VendorLedgerRow = {
  id: string;
  vendorName: string;
  balancePence: number;
  createdAt: Date;
  updatedAt: Date;
};

type MoneyTransactionRow = {
  id: string;
  kind: string;
  direction: string;
  amountPence: number;
  vendor?: { vendorName: string } | null;
  counterpartyName?: string | null;
  note?: string | null;
  occurredAt: Date;
};

const pdfReportCache = new Map<string, PdfCacheEntry>();

const buildPdfCacheKey = (input: { userId: string; customerQuery?: string }) => {
  const normalizedQuery = input.customerQuery?.trim().toLowerCase() || "__all__";
  return `${input.userId}:${normalizedQuery}`;
};

const toIso = (value: Date | null | undefined) => (value ? value.toISOString() : "-");

export class ExportService {
  private db = prisma as unknown as {
    vendorLedger: {
      findMany: (args: unknown) => Promise<VendorLedgerRow[]>;
    };
    moneyTransaction: {
      findMany: (args: unknown) => Promise<MoneyTransactionRow[]>;
    };
  };

  private async getPdfDataFingerprint(input: { userId: string; customerQuery?: string; customerId?: string }) {
    const customerQuery = input.customerQuery?.trim();
    const customerId = input.customerId?.trim();
    const customerFilter = customerQuery
      ? {
          name: {
            contains: customerQuery,
            mode: "insensitive" as const
          }
        }
      : undefined;

    const customerWhere = {
      userId: input.userId,
      ...(customerId ? { id: customerId } : {}),
      ...customerFilter
    };

    const jobWhere = {
      userId: input.userId,
      ...(customerId ? { customerId } : {}),
      ...(customerQuery
        ? {
            customer: {
              is: {
                name: {
                  contains: customerQuery,
                  mode: "insensitive" as const
                }
              }
            }
          }
        : {})
    };

    const paymentJobFilter = {
      ...(customerId ? { customerId } : {}),
      ...(customerQuery
        ? {
            customer: {
              is: {
                name: {
                  contains: customerQuery,
                  mode: "insensitive" as const
                }
              }
            }
          }
        : {})
    };

    const [customerAgg, jobAgg, paymentAgg] = await Promise.all([
      prisma.customer.aggregate({
        where: customerWhere,
        _count: { _all: true },
        _max: {
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.job.aggregate({
        where: jobWhere,
        _count: { _all: true },
        _max: {
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.payment.aggregate({
        where: {
          userId: input.userId,
          ...((customerId || customerQuery)
            ? {
                job: {
                  is: paymentJobFilter
                }
              }
            : {})
        },
        _count: { _all: true },
        _max: {
          createdAt: true,
          paidAt: true
        }
      })
    ]);

    return [
      `q:${customerQuery ?? "__all__"}`,
      `cid:${customerId ?? "__all__"}`,
      `c:${customerAgg._count._all}:${toIso(customerAgg._max.createdAt)}:${toIso(customerAgg._max.updatedAt)}`,
      `j:${jobAgg._count._all}:${toIso(jobAgg._max.createdAt)}:${toIso(jobAgg._max.updatedAt)}`,
      `p:${paymentAgg._count._all}:${toIso(paymentAgg._max.createdAt)}:${toIso(paymentAgg._max.paidAt)}`
    ].join("|");
  }

  createAccessToken(input: { userId: string; expiresInMinutes?: number }) {
    const expiresInMinutes = input.expiresInMinutes ?? 30;
    const payload: ExportTokenPayload = {
      userId: input.userId,
      exp: Date.now() + expiresInMinutes * 60 * 1000,
      nonce: crypto.randomUUID(),
      reportType: "csv",
      pdfMode: "records"
    };

    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(payloadB64, getExportSecret());

    return `${payloadB64}.${signature}`;
  }

  verifyAccessToken(token: string): ExportTokenPayload {
    const [payloadB64, providedSignature] = token.split(".");

    if (!payloadB64 || !providedSignature) {
      throw new Error("Invalid token format");
    }

    const expectedSignature = sign(payloadB64, getExportSecret());

    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(providedSignature);

    if (expectedBuffer.length !== providedBuffer.length) {
      throw new Error("Invalid token signature");
    }

    if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
      throw new Error("Invalid token signature");
    }

    const payload = JSON.parse(base64UrlDecode(payloadB64)) as ExportTokenPayload;

    if (!payload.userId || !payload.exp || payload.exp < Date.now()) {
      throw new Error("Token expired or invalid");
    }

    return payload;
  }

  createAccessLink(token: string) {
    return `${env.BASE_URL}/export/access/${encodeURIComponent(token)}`;
  }

  createDownloadLink(token: string, kind: ExportKind) {
    return `${env.BASE_URL}/export/download/${encodeURIComponent(token)}/${kind}`;
  }

  createPdfAccessToken(input: {
    userId: string;
    customerQuery?: string;
    customerId?: string;
    expiresInMinutes?: number;
  }) {
    const expiresInMinutes = input.expiresInMinutes ?? 30;
    const customerQuery = input.customerQuery?.trim();
    const customerId = input.customerId?.trim();
    const payload: ExportTokenPayload = {
      userId: input.userId,
      exp: Date.now() + expiresInMinutes * 60 * 1000,
      nonce: crypto.randomUUID(),
      reportType: "pdf",
      pdfMode: "records",
      customerQuery: customerQuery || undefined,
      customerId: customerId || undefined
    };

    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(payloadB64, getExportSecret());

    return `${payloadB64}.${signature}`;
  }

  createPdfDownloadLink(token: string) {
    return `${env.BASE_URL}/export/pdf/${encodeURIComponent(token)}`;
  }

  createVendorPdfAccessToken(input: {
    userId: string;
    vendorQuery?: string;
    vendorId?: string;
    expiresInMinutes?: number;
  }) {
    const expiresInMinutes = input.expiresInMinutes ?? 30;
    const payload: ExportTokenPayload = {
      userId: input.userId,
      exp: Date.now() + expiresInMinutes * 60 * 1000,
      nonce: crypto.randomUUID(),
      reportType: "pdf",
      pdfMode: "vendors",
      vendorQuery: input.vendorQuery?.trim() || undefined,
      vendorId: input.vendorId?.trim() || undefined
    };

    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(payloadB64, getExportSecret());
    return `${payloadB64}.${signature}`;
  }

  createExpensePdfAccessToken(input: {
    userId: string;
    expiresInMinutes?: number;
  }) {
    const expiresInMinutes = input.expiresInMinutes ?? 30;
    const payload: ExportTokenPayload = {
      userId: input.userId,
      exp: Date.now() + expiresInMinutes * 60 * 1000,
      nonce: crypto.randomUUID(),
      reportType: "pdf",
      pdfMode: "expenses"
    };

    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(payloadB64, getExportSecret());
    return `${payloadB64}.${signature}`;
  }

  createInvoicePdfAccessToken(input: {
    userId: string;
    customerQuery?: string;
    customerId?: string;
    expiresInMinutes?: number;
  }) {
    const expiresInMinutes = input.expiresInMinutes ?? 30;
    const payload: ExportTokenPayload = {
      userId: input.userId,
      exp: Date.now() + expiresInMinutes * 60 * 1000,
      nonce: crypto.randomUUID(),
      reportType: "pdf",
      pdfMode: "invoice",
      customerQuery: input.customerQuery?.trim() || undefined,
      customerId: input.customerId?.trim() || undefined
    };

    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(payloadB64, getExportSecret());
    return `${payloadB64}.${signature}`;
  }

  buildAccessHtml(token: string) {
    const links = EXPORT_KINDS.map((kind) => {
      return `<li><a href="${this.createDownloadLink(token, kind)}">Download ${kind}.csv</a></li>`;
    }).join("\n");

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Export Data</title>
  </head>
  <body>
    <h1>Export Data</h1>
    <p>Links expire automatically.</p>
    <ul>${links}</ul>
  </body>
</html>`;
  }

  async generateCsv(userId: string, kind: ExportKind) {
    if (kind === "jobs") {
      const jobs = await prisma.job.findMany({
        where: { userId },
        include: { customer: true },
        orderBy: [{ createdAt: "desc" }]
      });

      const header = [
        "id",
        "customer",
        "title",
        "description",
        "due_date",
        "price_total_pence",
        "deposit_pence",
        "status",
        "created_at"
      ].join(",");

      const rows = jobs.map((job) => {
        return [
          escapeCsv(job.id),
          escapeCsv(job.customer?.name),
          escapeCsv(job.title),
          escapeCsv(job.description),
          escapeCsv(job.dueDate ? job.dueDate.toISOString() : ""),
          String(job.priceTotalPence),
          String(job.depositPence ?? ""),
          escapeCsv(job.status),
          escapeCsv(job.createdAt.toISOString())
        ].join(",");
      });

      return [header, ...rows].join("\n");
    }

    if (kind === "customers") {
      const customers = await prisma.customer.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }]
      });

      const header = ["id", "name", "phone", "notes", "balance_pence", "created_at"].join(",");
      const rows = customers.map((customer) => {
        return [
          escapeCsv(customer.id),
          escapeCsv(customer.name),
          escapeCsv(customer.phone),
          escapeCsv(customer.notes),
          String(customer.balancePence),
          escapeCsv(customer.createdAt.toISOString())
        ].join(",");
      });

      return [header, ...rows].join("\n");
    }

    if (kind === "vendor_ledgers") {
      const ledgers = await this.db.vendorLedger.findMany({
        where: { userId },
        orderBy: [{ vendorName: "asc" }]
      });

      const header = ["id", "vendor_name", "balance_pence", "created_at", "updated_at"].join(",");
      const rows = ledgers.map((ledger: VendorLedgerRow) => {
        return [
          escapeCsv(ledger.id),
          escapeCsv(ledger.vendorName),
          String(ledger.balancePence),
          escapeCsv(ledger.createdAt.toISOString()),
          escapeCsv(ledger.updatedAt.toISOString())
        ].join(",");
      });

      return [header, ...rows].join("\n");
    }

    if (kind === "money_transactions") {
      const txs = await this.db.moneyTransaction.findMany({
        where: { userId },
        include: { vendor: true },
        orderBy: [{ occurredAt: "desc" }]
      });

      const header = [
        "id",
        "kind",
        "direction",
        "amount_pence",
        "vendor_name",
        "counterparty_name",
        "note",
        "occurred_at"
      ].join(",");
      const rows = txs.map((tx: MoneyTransactionRow) => {
        return [
          escapeCsv(tx.id),
          escapeCsv(tx.kind),
          escapeCsv(tx.direction),
          String(tx.amountPence),
          escapeCsv(tx.vendor?.vendorName),
          escapeCsv(tx.counterpartyName),
          escapeCsv(tx.note),
          escapeCsv(tx.occurredAt.toISOString())
        ].join(",");
      });

      return [header, ...rows].join("\n");
    }

    const payments = await prisma.payment.findMany({
      where: { userId },
      orderBy: [{ paidAt: "desc" }]
    });

    const header = ["id", "job_id", "amount_pence", "method", "paid_at", "note"].join(",");
    const rows = payments.map((payment) => {
      return [
        escapeCsv(payment.id),
        escapeCsv(payment.jobId),
        String(payment.amountPence),
        escapeCsv(payment.method),
        escapeCsv(payment.paidAt.toISOString()),
        escapeCsv(payment.note)
      ].join(",");
    });

    return [header, ...rows].join("\n");
  }

  async generatePdfReport(tokenPayload: ExportTokenPayload) {
    if (tokenPayload.pdfMode === "invoice") {
      const ownerRows = await prisma.$queryRaw<
        Array<{
          businessName: string | null;
          businessAddress: string | null;
          businessPhone: string | null;
          businessIban: string | null;
        }>
      >`SELECT "businessName", "businessAddress", "businessPhone", "businessIban" FROM "User" WHERE id = ${tokenPayload.userId} LIMIT 1`;
      const owner = ownerRows[0];
      const businessName = owner?.businessName?.trim() || "Your Business";
      const businessAddress = owner?.businessAddress?.trim() || "-";
      const businessPhone = owner?.businessPhone?.trim() || "-";
      const businessIban = owner?.businessIban?.trim() || "-";
      const logoMark = businessName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("");

      const customerId = tokenPayload.customerId?.trim();
      const customerQuery = tokenPayload.customerQuery?.trim();
      if (!customerId && !customerQuery) {
        throw new Error("Invoice requires customer");
      }

      const customer = await prisma.customer.findFirst({
        where: {
          userId: tokenPayload.userId,
          ...(customerId ? { id: customerId } : {}),
          ...(customerQuery
            ? {
                name: {
                  contains: customerQuery,
                  mode: "insensitive" as const
                }
              }
            : {})
        }
      });

      if (!customer) {
        throw new Error("No matching customer found for invoice");
      }

      const jobs = await prisma.job.findMany({
        where: {
          userId: tokenPayload.userId,
          customerId: customer.id
        },
        include: {
          payments: true
        },
        orderBy: [{ createdAt: "desc" }]
      });

      const jobIds = jobs.map((job) => job.id);
      const payments = await prisma.payment.findMany({
        where: {
          userId: tokenPayload.userId,
          jobId: { in: jobIds }
        },
        include: {
          job: true
        },
        orderBy: [{ paidAt: "desc" }]
      });

      const totalPence = jobs.reduce((sum, job) => sum + job.priceTotalPence, 0);
      const totalPaidPence = payments.reduce((sum, payment) => sum + payment.amountPence, 0);
      const outstandingPence = Math.max(totalPence - totalPaidPence, 0);

      const nowDate = new Date();
      const invoiceNo = `INV-${nowDate.toISOString().slice(0, 10).replace(/-/g, "")}-${customer.id.slice(0, 6).toUpperCase()}`;
      const lines: string[] = [
        "========================================",
        `[ ${logoMark || "TB"} ] ${businessName.toUpperCase()}`,
        "TRADES INVOICE",
        `Address: ${businessAddress}`,
        `Phone: ${businessPhone}`,
        `IBAN: ${businessIban}`,
        "========================================",
        "",
        "INVOICE",
        `Invoice no: ${invoiceNo}`,
        `Issue date: ${compactDate(nowDate)}`,
        "",
        `Bill to: ${customer.name}`,
        `Phone: ${customer.phone ?? "-"}`,
        "",
        `Jobs: ${jobs.length}`,
        `Total: ${penceToPounds(totalPence)}`,
        `Paid: ${penceToPounds(totalPaidPence)}`,
        `Amount due: ${penceToPounds(outstandingPence)}`,
        "",
        "LINE ITEMS"
      ];

      if (jobs.length === 0) {
        lines.push("No jobs found for this customer.");
      } else {
        jobs.forEach((job, index) => {
          const jobPaid = job.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
          const jobDue = Math.max(job.priceTotalPence - jobPaid, 0);
          lines.push(
            `${index + 1}. ${job.title} | status: ${job.status} | total: ${penceToPounds(job.priceTotalPence)} | paid: ${penceToPounds(jobPaid)} | due: ${penceToPounds(jobDue)}`
          );
        });
      }

      lines.push("", "PAYMENTS");
      if (payments.length === 0) {
        lines.push("No payments recorded.");
      } else {
        payments.forEach((payment, index) => {
          lines.push(
            `${index + 1}. ${compactDate(payment.paidAt)} | ${payment.job.title} | ${penceToPounds(payment.amountPence)} | ${payment.method}`
          );
        });
      }

      const datePart = nowDate.toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `invoice-${sanitizeFilenamePart(customer.name)}-${datePart}.pdf`;

      return {
        filename,
        buffer: buildSimplePdf(lines)
      };
    }

    if (tokenPayload.pdfMode === "expenses") {
      const txs = await this.db.moneyTransaction.findMany({
        where: {
          userId: tokenPayload.userId,
          kind: "expense_paid"
        },
        include: {
          vendor: true
        },
        orderBy: [{ occurredAt: "desc" }]
      });

      const expenseTotal = txs.reduce(
        (sum: number, tx: { amountPence: number }) => sum + tx.amountPence,
        0
      );

      const lines: string[] = [
        "Expense Records PDF",
        `Generated: ${new Date().toISOString()}`,
        "",
        `Expense transactions: ${txs.length}`,
        `Total expenses: ${penceToPounds(expenseTotal)}`,
        "",
        "EXPENSE TRANSACTIONS"
      ];

      if (txs.length === 0) {
        lines.push("No expense transactions.");
      } else {
        txs.slice(0, 300).forEach((tx: MoneyTransactionRow, index: number) => {
          lines.push(
            `${index + 1}. ${penceToPounds(tx.amountPence)} | ${tx.vendor?.vendorName ?? tx.counterpartyName ?? "-"} | ${tx.note ?? "-"} | ${compactDate(tx.occurredAt)}`
          );
        });
      }

      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `expenses-${datePart}.pdf`;

      return {
        filename,
        buffer: buildSimplePdf(lines)
      };
    }

    if (tokenPayload.pdfMode === "vendors") {
      const vendorQuery = tokenPayload.vendorQuery?.trim();
      const vendorId = tokenPayload.vendorId?.trim();
      const ledgers = await this.db.vendorLedger.findMany({
        where: {
          userId: tokenPayload.userId,
          ...(vendorId ? { id: vendorId } : {}),
          ...(vendorQuery
            ? {
                vendorName: {
                  contains: vendorQuery,
                  mode: "insensitive" as const
                }
              }
            : {})
        },
        orderBy: [{ vendorName: "asc" }]
      });

      const txs = await this.db.moneyTransaction.findMany({
        where: {
          userId: tokenPayload.userId,
          ...(vendorId ? { vendorId } : {}),
          ...(vendorQuery
            ? {
                OR: [
                  {
                    vendor: {
                      is: {
                        vendorName: {
                          contains: vendorQuery,
                          mode: "insensitive" as const
                        }
                      }
                    }
                  },
                  {
                    counterpartyName: {
                      contains: vendorQuery,
                      mode: "insensitive" as const
                    }
                  }
                ]
              }
            : {})
        },
        include: {
          vendor: true
        },
        orderBy: [{ occurredAt: "desc" }]
      });

      const totalOutstanding = ledgers.reduce(
        (sum: number, ledger: { balancePence: number }) => sum + ledger.balancePence,
        0
      );
      const expenseTotal = txs
        .filter((tx: MoneyTransactionRow) => tx.kind === "expense_paid")
        .reduce((sum: number, tx: { amountPence: number }) => sum + tx.amountPence, 0);
      const debtTotal = txs
        .filter((tx: MoneyTransactionRow) => tx.kind === "vendor_debt_added")
        .reduce((sum: number, tx: { amountPence: number }) => sum + tx.amountPence, 0);
      const paymentTotal = txs
        .filter((tx: MoneyTransactionRow) => tx.kind === "vendor_payment_made")
        .reduce((sum: number, tx: { amountPence: number }) => sum + tx.amountPence, 0);

      const lines: string[] = [
        vendorQuery ? `Vendor Report PDF: ${vendorQuery}` : "Vendor Report PDF",
        `Generated: ${new Date().toISOString()}`,
        "",
        `Vendors: ${ledgers.length}`,
        `Transactions: ${txs.length}`,
        `Vendor outstanding: ${penceToPounds(totalOutstanding)}`,
        `Expenses paid: ${penceToPounds(expenseTotal)}`,
        `Vendor debt added: ${penceToPounds(debtTotal)}`,
        `Vendor payments made: ${penceToPounds(paymentTotal)}`,
        "",
        "VENDOR LEDGERS"
      ];

      if (ledgers.length === 0) {
        lines.push("No vendor ledger records.");
      } else {
        ledgers.forEach((ledger: { vendorName: string; balancePence: number }, index: number) => {
          lines.push(`${index + 1}. ${ledger.vendorName} | outstanding: ${penceToPounds(ledger.balancePence)}`);
        });
      }

      lines.push("", "MONEY TRANSACTIONS");
      if (txs.length === 0) {
        lines.push("No transactions.");
      } else {
        txs.slice(0, 200).forEach((tx: MoneyTransactionRow, index: number) => {
          lines.push(
            `${index + 1}. ${tx.kind} | ${penceToPounds(tx.amountPence)} | ${tx.vendor?.vendorName ?? tx.counterpartyName ?? "-"} | ${compactDate(tx.occurredAt)}`
          );
        });
      }

      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = vendorQuery
        ? `vendor-${sanitizeFilenamePart(vendorQuery)}-${datePart}.pdf`
        : `vendors-${datePart}.pdf`;

      return {
        filename,
        buffer: buildSimplePdf(lines)
      };
    }

    const customerQuery = tokenPayload.customerQuery?.trim();
    const customerId = tokenPayload.customerId?.trim();
    const cacheKey = buildPdfCacheKey({
      userId: tokenPayload.userId,
      customerQuery: customerId ? `id:${customerId}` : customerQuery
    });
    const fingerprint = await this.getPdfDataFingerprint({
      userId: tokenPayload.userId,
      customerQuery,
      customerId
    });

    const cached = pdfReportCache.get(cacheKey);
    if (cached) {
      const isFresh = Date.now() - cached.createdAt <= PDF_CACHE_TTL_MS;
      if (isFresh && cached.fingerprint === fingerprint) {
        return cached.value;
      }
      pdfReportCache.delete(cacheKey);
    }

    const customerFilter = customerQuery
      ? {
          name: {
            contains: customerQuery,
            mode: "insensitive" as const
          }
        }
      : undefined;

    const customers = await prisma.customer.findMany({
      where: {
        userId: tokenPayload.userId,
        ...(customerId ? { id: customerId } : {}),
        ...customerFilter
      },
      orderBy: [{ name: "asc" }]
    });

    if (customerQuery && customers.length === 0) {
      throw new Error("No matching customer found for PDF export");
    }

    const customerIds = customers.map((customer) => customer.id);
    const jobs = await prisma.job.findMany({
      where: {
        userId: tokenPayload.userId,
        ...((customerQuery || customerId) ? { customerId: { in: customerIds } } : {})
      },
      include: {
        customer: true,
        payments: true
      },
      orderBy: [{ createdAt: "desc" }]
    });

    const jobIds = jobs.map((job) => job.id);
    const payments = await prisma.payment.findMany({
      where: {
        userId: tokenPayload.userId,
        ...((customerQuery || customerId) ? { jobId: { in: jobIds } } : {})
      },
      include: {
        job: {
          include: {
            customer: true
          }
        }
      },
      orderBy: [{ paidAt: "desc" }]
    });

    const totalPaidPence = payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    const totalOutstandingPence = jobs.reduce((sum, job) => {
      const paid = job.payments.reduce((inner, payment) => inner + payment.amountPence, 0);
      return sum + Math.max(job.priceTotalPence - paid, 0);
    }, 0);

    const lines: string[] = [
      customerQuery ? `Customer Records PDF: ${customerQuery}` : "All Records PDF",
      `Generated: ${new Date().toISOString()}`,
      "",
      `Customers: ${customers.length}`,
      `Jobs: ${jobs.length}`,
      `Payments: ${payments.length}`,
      `Payments total: ${penceToPounds(totalPaidPence)}`,
      `Outstanding total: ${penceToPounds(totalOutstandingPence)}`,
      "",
      "CUSTOMERS"
    ];

    if (customers.length === 0) {
      lines.push("No customers.");
    } else {
      customers.forEach((customer, index) => {
        lines.push(
          `${index + 1}. ${customer.name} | phone: ${customer.phone ?? "-"} | created: ${compactDate(customer.createdAt)}`
        );
      });
    }

    lines.push("", "JOBS");

    if (jobs.length === 0) {
      lines.push("No jobs.");
    } else {
      jobs.forEach((job, index) => {
        const paidPence = job.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
        const outstandingPence = calculateJobOutstandingPence(job);
        lines.push(
          `${index + 1}. ${job.customer?.name ?? "Unknown"} | ${job.title} | status: ${job.status} | due: ${compactDate(job.dueDate)} | total: ${penceToPounds(job.priceTotalPence)} | paid: ${penceToPounds(paidPence)} | out: ${penceToPounds(outstandingPence)}`
        );
      });
    }

    lines.push("", "PAYMENTS");

    if (payments.length === 0) {
      lines.push("No payments.");
    } else {
      payments.forEach((payment, index) => {
        lines.push(
          `${index + 1}. ${payment.job.customer?.name ?? "Unknown"} | job: ${payment.job.title} | ${penceToPounds(payment.amountPence)} | method: ${payment.method} | paid: ${compactDate(payment.paidAt)}`
        );
      });
    }

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = customerQuery
      ? `records-${sanitizeFilenamePart(customerQuery)}-${datePart}.pdf`
      : `records-all-${datePart}.pdf`;

    const value = {
      filename,
      buffer: buildSimplePdf(lines)
    };

    pdfReportCache.set(cacheKey, {
      fingerprint,
      createdAt: Date.now(),
      value
    });

    return value;
  }
}
