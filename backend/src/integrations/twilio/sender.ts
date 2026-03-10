import { env } from "../../config/env";

export type SendWhatsAppMessageInput = {
  to: string;
  body: string;
  mediaUrl?: string;
};

export type SendWhatsAppMessageResult = {
  sid: string;
  status: string;
};

const assertTwilioConfig = () => {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
    throw new Error("Missing Twilio configuration. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM.");
  }

  return {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    from: env.TWILIO_WHATSAPP_FROM
  };
};

const withWhatsAppPrefix = (value: string) => {
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
};

export const sendWhatsAppMessage = async (
  input: SendWhatsAppMessageInput
): Promise<SendWhatsAppMessageResult> => {
  const twilio = assertTwilioConfig();

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`;
  const payload = new URLSearchParams({
    To: withWhatsAppPrefix(input.to),
    From: withWhatsAppPrefix(twilio.from),
    Body: input.body
  });
  if (input.mediaUrl) {
    payload.set("MediaUrl", input.mediaUrl);
  }

  const authHeader = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString()
  });

  const data = (await response.json()) as { sid?: string; status?: string; message?: string };

  if (!response.ok || !data.sid) {
    throw new Error(`Twilio send failed: ${data.message ?? "Unknown error"}`);
  }

  return {
    sid: data.sid,
    status: data.status ?? "queued"
  };
};
