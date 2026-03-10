import { env } from "../config/env";

export class SubscriptionService {
  isBillingEnabled() {
    return env.BILLING_ENABLED === true;
  }

  async createCheckoutLink(userId: string) {
    void userId;
    if (!this.isBillingEnabled()) {
      return null;
    }

    // Stripe checkout is intentionally disabled for now.
    return null;
  }

  async handleWebhook(rawBody: string, signature: string | undefined) {
    void rawBody;
    void signature;
    if (!this.isBillingEnabled()) {
      return { ignored: true };
    }

    // Stripe webhook processing will be enabled later.
    return { ignored: true };
  }
}
