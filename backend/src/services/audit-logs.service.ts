// Provides a backend service layer for a focused business domain.
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { UsersService } from "./users.service";

const usersService = new UsersService();

const findUserIdByPhone = async (phone: string) => {
  const user = await usersService.findByPhone(phone);
  return user?.id ?? null;
};

export const logInboundMessage = async (input: {
  from: string;
  body: string;
  messageSid: string;
}) => {
  const userId = await findUserIdByPhone(input.from);

  if (!userId) {
    console.info("Inbound message received for unknown user", {
      from: input.from,
      messageSid: input.messageSid
    });
    return;
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: "whatsapp.inbound",
      metadataJson: {
        from: input.from,
        body: input.body,
        messageSid: input.messageSid
      }
    }
  });
};

export const logOutboundMessage = async (input: {
  to: string;
  body: string;
  replySid?: string;
  status?: string;
  error?: string;
}) => {
  const userId = await findUserIdByPhone(input.to);

  if (!userId) {
    console.info("Outbound message sent for unknown user", {
      to: input.to,
      replySid: input.replySid,
      error: input.error
    });
    return;
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: "whatsapp.outbound",
      metadataJson: {
        to: input.to,
        body: input.body,
        replySid: input.replySid,
        status: input.status,
        error: input.error
      }
    }
  });
};

export const logUserAction = async (input: {
  userId: string;
  action: string;
  metadata: Prisma.InputJsonObject;
}) => {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      metadataJson: input.metadata
    }
  });
};
