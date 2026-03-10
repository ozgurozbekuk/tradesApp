import crypto from "crypto";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const getAuthSecret = () => {
  const secret = env.AUTH_SESSION_SECRET || env.EXPORT_TOKEN_SECRET || env.TWILIO_AUTH_TOKEN;
  if (!secret) {
    throw new Error("Missing AUTH_SESSION_SECRET (or EXPORT_TOKEN_SECRET/TWILIO_AUTH_TOKEN).");
  }
  return secret;
};

const base64UrlEncode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const base64UrlDecode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const sign = (value: string) => {
  return crypto.createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
};

const scryptAsync = (password: string, salt: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
};

const normalizePhone = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) {
    return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  }
  return `+${trimmed.replace(/\D/g, "")}`;
};

export class AuthService {
  normalizePhone(value: string) {
    return normalizePhone(value);
  }

  async hashPassword(password: string) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = await scryptAsync(password, salt);
    return `scrypt$${salt}$${derived.toString("hex")}`;
  }

  async verifyPassword(password: string, passwordHash: string) {
    const [scheme, salt, expectedHex] = passwordHash.split("$");
    if (scheme !== "scrypt" || !salt || !expectedHex) {
      return false;
    }
    const derived = await scryptAsync(password, salt);
    const expected = Buffer.from(expectedHex, "hex");
    if (expected.length !== derived.length) {
      return false;
    }
    return crypto.timingSafeEqual(expected, derived);
  }

  async register(input: { phone: string; password: string; businessName: string }) {
    const phone = normalizePhone(input.phone);
    const businessName = input.businessName.trim();
    const passwordHash = await this.hashPassword(input.password);
    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const existing = await prisma.user.findUnique({
      where: { phone }
    });

    if (existing) {
      if (existing.passwordHash) {
        throw new Error("PHONE_ALREADY_REGISTERED");
      }

      return prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          businessName: businessName || existing.businessName,
          phoneVerifiedAt: now
        }
      });
    }

    return prisma.user.create({
      data: {
        phone,
        businessName,
        passwordHash,
        phoneVerifiedAt: now,
        trialEndsAt,
        subscriptionStatus: "trial"
      }
    });
  }

  async login(input: { phone: string; password: string }) {
    const phone = normalizePhone(input.phone);
    const user = await prisma.user.findUnique({
      where: { phone }
    });

    if (!user?.passwordHash) {
      return null;
    }

    const ok = await this.verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      return null;
    }

    return user;
  }

  createSessionToken(userId: string) {
    const payload = {
      uid: userId,
      exp: Date.now() + SESSION_TTL_MS
    };
    const body = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(body);
    return `${body}.${signature}`;
  }

  verifySessionToken(token: string) {
    const [body, signature] = token.split(".");
    if (!body || !signature) {
      return null;
    }

    const expected = sign(body);
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== signatureBuffer.length) {
      return null;
    }
    if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
      return null;
    }

    try {
      const parsed = JSON.parse(base64UrlDecode(body)) as { uid?: string; exp?: number };
      if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) {
        return null;
      }
      return parsed.uid;
    } catch {
      return null;
    }
  }
}
