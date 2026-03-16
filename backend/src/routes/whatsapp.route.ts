import { Router } from "express";
import { env } from "../config/env";
import { sendWhatsAppMessage, validateTwilioSignature } from "../integrations/twilio";
import { conversationMemory } from "../messaging/agent/context-memory";
import { routeIncomingMessageWithConversationV2 } from "../conversation-v2/router";
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

    const routed = await routeIncomingMessageWithConversationV2({
      from: phone,
      body,
      messageSid
    });

    if (!routed.reply.trim()) {
      return res.status(200).json({ status: "ok", suppressed: true });
    }

    if (routed.source === "v1") {
      conversationMemory.appendTurn(phone, {
        role: "user",
        text: body
      });
      conversationMemory.appendTurn(phone, {
        role: "assistant",
        text: routed.reply
      });
    }

    let outbound;
    try {
      outbound = await sendWhatsAppMessage({
        to: phone,
        body: routed.reply,
        mediaUrl: routed.mediaUrl
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const isMediaUrlError =
        Boolean(routed.mediaUrl) && message.toLowerCase().includes("invalid media url");

      if (!isMediaUrlError) {
        throw error;
      }

      outbound = await sendWhatsAppMessage({
        to: phone,
        body: "I could not attach the PDF. Media URL is not publicly reachable. Please set BASE_URL to a public HTTPS domain."
      });
    }

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
