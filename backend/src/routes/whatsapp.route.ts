// Defines an HTTP route module for the backend API.
import { Router } from "express";
import { agentConversationStateStore } from "../agent/state/state-store";
import { env } from "../config/env";
import { sendWhatsAppMessage, validateTwilioSignature } from "../integrations/twilio";
import { runOrchestrator } from "../agent/orchestrator";
import { logInboundMessage, logOutboundMessage } from "../services/audit-logs.service";
import { prisma } from "../db/prisma";

export const whatsappRouter = Router();

const extractTwilioParams = (body: unknown) => {
  if (!body || typeof body !== "object") {
    return {};
  }

  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      params[key] = value;
    }
  }

  return params;
};

const resolveRequestUrl = (input: {
  protocol: string;
  host: string;
  originalUrl: string;
}) => {
  return `${input.protocol}://${input.host}${input.originalUrl}`;
};

whatsappRouter.post("/webhook/whatsapp", async (req, res) => {
  try {
    const signatureHeader = req.header("x-twilio-signature");
    const authToken = env.TWILIO_AUTH_TOKEN;

    if (!signatureHeader || !authToken) {
      return res.status(403).json({ error: "Signature validation failed" });
    }

    const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();

    const fullUrl = resolveRequestUrl({
      protocol: forwardedProto || req.protocol,
      host: forwardedHost || req.get("host") || "",
      originalUrl: req.originalUrl
    });

    const params = extractTwilioParams(req.body);

    const isValidSignature = validateTwilioSignature({
      authToken,
      fullUrl,
      params,
      providedSignature: signatureHeader
    });

    if (!isValidSignature) {
      return res.status(403).json({ error: "Invalid signature" });
    }

    const from = params.From ?? "";
    const body = params.Body ?? "";
    const messageSid = params.MessageSid ?? "";

    if (!from || !messageSid) {
      return res.status(400).json({ error: "Missing required Twilio fields" });
    }

    const phone = from.replace(/^whatsapp:/, "");

    // First inbound WhatsApp message confirms sandbox activation for web-registered users.
    await prisma.user.updateMany({
      where: {
        phone,
        whatsappActivatedAt: null
      },
      data: {
        whatsappActivatedAt: new Date()
      }
    });

    try {
      await logInboundMessage({
        from: phone,
        body,
        messageSid
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn("Inbound audit log failed", message);
    }

    const user = await prisma.user.findFirst({
      where: {
        phone
      },
      select: {
        id: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const state = await agentConversationStateStore.load(user.id);
    const history = state?.recentTurns ?? [];

    await agentConversationStateStore.appendTurn(user.id, {
      role: "user",
      content: body
    });

    const routed = await runOrchestrator({
      userId: user.id,
      userMessage: body,
      history
    });

    if (!routed.reply.trim()) {
      return res.status(200).json({ status: "ok", suppressed: true });
    }

    let outbound;
    try {
      outbound = await sendWhatsAppMessage({
        to: phone,
        body: routed.reply,
        mediaUrl: routed.attachment?.mediaUrl
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to send WhatsApp reply: ${message}`);
    }

    await agentConversationStateStore.appendTurn(user.id, {
      role: "assistant",
      content: routed.reply
    });

    try {
      await logOutboundMessage({
        to: phone,
        body: routed.reply,
        replySid: outbound.sid,
        status: outbound.status
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn("Outbound audit log failed", message);
    }

    return res.status(200).json({ status: "ok" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to process WhatsApp webhook", message);
    return res.status(500).json({ error: "Failed to process webhook" });
  }
});
