// Implements a reusable Express middleware for backend requests.
import { Request, Response, NextFunction } from "express";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
  name?: string;
};

type Counter = {
  count: number;
  resetAt: number;
};

export const createInMemoryRateLimiter = (options: RateLimitOptions) => {
  const counters = new Map<string, Counter>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const keyBase = options.keyFn ? options.keyFn(req) : req.ip || "unknown";
    const key = `${options.name ?? "default"}:${keyBase}`;

    const existing = counters.get(key);

    if (!existing || existing.resetAt <= now) {
      counters.set(key, {
        count: 1,
        resetAt: now + options.windowMs
      });
      return next();
    }

    existing.count += 1;

    if (existing.count > options.max) {
      const retryAfterSeconds = Math.max(Math.ceil((existing.resetAt - now) / 1000), 1);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ error: "Too many requests. Please retry shortly." });
    }

    return next();
  };
};
