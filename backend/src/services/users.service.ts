import { prisma } from "../db/prisma";

const TRIAL_DAYS = 14;

export class UsersService {
  findByPhone(phone: string) {
    return prisma.user.findUnique({
      where: { phone }
    });
  }

  async createWithBusinessName(input: { phone: string; businessName: string; tradeType?: string }) {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

    return prisma.user.create({
      data: {
        phone: input.phone,
        businessName: input.businessName,
        tradeType: input.tradeType,
        trialEndsAt,
        subscriptionStatus: "trial"
      }
    });
  }

  updateBriefingEnabled(input: { userId: string; enabled: boolean }) {
    return prisma.user.update({
      where: { id: input.userId },
      data: { briefingEnabled: input.enabled }
    });
  }
}
