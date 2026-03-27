// Defines an HTTP route module for the backend API.
import { Router } from "express";
import { ExportKind, ExportService } from "../services/export.service";
import { logUserAction } from "../services/audit-logs.service";

export const exportRouter = Router();

const exportService = new ExportService();

const isExportKind = (value: string): value is ExportKind => {
  return (
    value === "jobs" ||
    value === "customers" ||
    value === "payments" ||
    value === "vendor_ledgers" ||
    value === "money_transactions"
  );
};

exportRouter.get("/export/access/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const payload = exportService.verifyAccessToken(token);
    if (payload.reportType === "pdf") {
      return res.status(403).json({ error: "Invalid or expired export link" });
    }

    const html = exportService.buildAccessHtml(token);
    return res.status(200).type("html").send(html);
  } catch {
    return res.status(403).json({ error: "Invalid or expired export link" });
  }
});

exportRouter.get("/export/download/:token/:kind", async (req, res) => {
  try {
    const token = req.params.token;
    const kind = req.params.kind;

    if (!isExportKind(kind)) {
      return res.status(400).json({ error: "Unsupported export type" });
    }

    const payload = exportService.verifyAccessToken(token);
    if (payload.reportType === "pdf") {
      return res.status(403).json({ error: "Invalid or expired export link" });
    }
    const csv = await exportService.generateCsv(payload.userId, kind);

    await logUserAction({
      userId: payload.userId,
      action: "export.downloaded",
      metadata: {
        kind
      }
    });

    return res
      .status(200)
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="${kind}.csv"`)
      .send(csv);
  } catch {
    return res.status(403).json({ error: "Invalid or expired export link" });
  }
});

exportRouter.get("/export/pdf/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const payload = exportService.verifyAccessToken(token);

    if (payload.reportType !== "pdf") {
      return res.status(403).json({ error: "Invalid or expired export link" });
    }

    const pdf = await exportService.generatePdfReport(payload);

    await logUserAction({
      userId: payload.userId,
      action: "export.pdf.downloaded",
      metadata: {
        filename: pdf.filename,
        customerQuery: payload.customerQuery ?? null
      }
    });

    return res
      .status(200)
      .setHeader("Content-Type", "application/pdf")
      .setHeader("Content-Disposition", `attachment; filename="${pdf.filename}"`)
      .send(pdf.buffer);
  } catch {
    return res.status(403).json({ error: "Invalid or expired export link" });
  }
});
