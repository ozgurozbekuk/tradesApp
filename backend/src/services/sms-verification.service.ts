// Provides a backend service layer for a focused business domain.
import crypto from "crypto";
import { env } from "../config/env";

const OTP_TTL_MINUTES = 10;

export const createOtpCode = () => crypto.randomInt(100_000, 1_000_000).toString();

export const hashOtpCode = (code: string) =>
  crypto.createHash("sha256").update(code).digest("hex");

export const getOtpExpiry = () => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + OTP_TTL_MINUTES);
  return expiresAt;
};

export const sendVerificationSms = async (phone: string, code: string) => {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_SMS_FROM) {
    throw new Error("SMS verification is not configured.");
  }

  const body = new URLSearchParams({
    To: phone,
    From: env.TWILIO_SMS_FROM,
    Body: `${code} is your Trades Assistant verification code. It expires in ${OTP_TTL_MINUTES} minutes.`
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  if (!response.ok) {
    const payload = (await response.text()) || "Unknown Twilio error";
    throw new Error(`Failed to send verification SMS: ${payload}`);
  }
};
