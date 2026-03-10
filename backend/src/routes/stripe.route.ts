import { Router } from "express";
import { SubscriptionService } from "../services/subscription.service";

export const stripeRouter = Router();

const subscriptionService = new SubscriptionService();

stripeRouter.post("/webhook/stripe", async (req, res) => {
  const signature = req.header("stripe-signature");
  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});

  await subscriptionService.handleWebhook(rawBody, signature);

  return res.status(200).json({ status: "ignored", billingEnabled: subscriptionService.isBillingEnabled() });
});
