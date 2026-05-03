// Builds the Express application and registers shared middleware and routes.
import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import express from "express";
import { createInMemoryRateLimiter } from "./middleware/rate-limit";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { accountRouter } from "./routes/account.route";
import { exportRouter } from "./routes/export.route";
import { healthRouter } from "./routes/health.route";
import { stripeRouter } from "./routes/stripe.route";
import { staticRouter } from "./routes/static.route";
import { whatsappRouter } from "./routes/whatsapp.route";

export const createApp = () => {
  const app = express();

  const webhookRateLimiter = createInMemoryRateLimiter({
    name: "webhook",
    windowMs: 60_000,
    max: 120
  });

  const exportRateLimiter = createInMemoryRateLimiter({
    name: "export",
    windowMs: 60_000,
    max: 40
  });

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(
    cors({
      origin: true,
      credentials: true
    })
  );
  app.use(clerkMiddleware());

  app.use(healthRouter);
  app.use(staticRouter);
  app.use(accountRouter);
  app.use("/export", exportRateLimiter);
  app.use("/webhook", webhookRateLimiter);
  app.use(stripeRouter);
  app.use(exportRouter);
  app.use(whatsappRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
