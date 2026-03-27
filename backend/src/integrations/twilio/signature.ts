// Wraps a Twilio integration concern used by WhatsApp messaging flows.
import crypto from "crypto";

export type TwilioParams = Record<string, string>;

const createDataCheckString = (url: string, params: TwilioParams) => {
  const sortedKeys = Object.keys(params).sort();
  const pairs = sortedKeys.map((key) => `${key}${params[key]}`);
  return `${url}${pairs.join("")}`;
};

const computeSignature = (authToken: string, data: string) => {
  return crypto.createHmac("sha1", authToken).update(data).digest("base64");
};

export const validateTwilioSignature = (input: {
  authToken: string;
  fullUrl: string;
  params: TwilioParams;
  providedSignature: string;
}) => {
  const expected = computeSignature(
    input.authToken,
    createDataCheckString(input.fullUrl, input.params)
  );

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(input.providedSignature);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};
