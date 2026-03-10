import { Router } from "express";
import { runCronTick } from "../cron";
import { env } from "../config/env";
import { routeIncomingMessage } from "../messaging/router";
import { parseWithAgentLayer } from "../messaging/parsers/agent-orchestrator";
import { AgentLearningService } from "../services/agent-learning.service";

export const testRouter = Router();
const agentLearningService = new AgentLearningService();

testRouter.post("/internal/test/cron/run", async (req, res) => {
  if (env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  const forceBriefing = req.body?.forceBriefing === true;
  const forceEveningSummary = req.body?.forceEveningSummary === true;

  await runCronTick({ forceBriefing, forceEveningSummary });

  return res.status(200).json({
    status: "ok",
    forceBriefing,
    forceEveningSummary
  });
});

testRouter.post("/internal/test/agent/parse", async (req, res) => {
  if (env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  const body = typeof req.body?.body === "string" ? req.body.body : "";

  if (!body.trim()) {
    return res.status(400).json({ error: "body is required" });
  }

  const parse = await parseWithAgentLayer(body);

  return res.status(200).json({
    status: "ok",
    parse
  });
});

testRouter.post("/internal/test/message", async (req, res) => {
  if (env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  const body = typeof req.body?.body === "string" ? req.body.body : "";
  const from = typeof req.body?.from === "string" ? req.body.from : "+10000000000";

  if (!body.trim()) {
    return res.status(400).json({ error: "body is required" });
  }

  const parse = await parseWithAgentLayer(body);
  const response = await routeIncomingMessage({
    from,
    body,
    messageSid: `TEST-${Date.now()}`
  });

  return res.status(200).json({
    status: "ok",
    parse,
    response
  });
});

testRouter.get("/internal/test/agent/learning-review", async (req, res) => {
  if (env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  const limit = Number.isFinite(limitRaw) && limitRaw && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  const items = await agentLearningService.getRecentCorrectionReview({ limit });

  return res.status(200).json({
    status: "ok",
    count: items.length,
    items
  });
});

testRouter.get("/internal/test/agent/learning-eval-cases", async (req, res) => {
  if (env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  const limit = Number.isFinite(limitRaw) && limitRaw && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  const cases = await agentLearningService.getSuggestedEvalCasesFromCorrections({ limit });

  return res.status(200).json({
    status: "ok",
    count: cases.length,
    cases
  });
});
