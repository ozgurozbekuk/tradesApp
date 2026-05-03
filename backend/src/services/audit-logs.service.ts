// Provides a backend service layer for a focused business domain.
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { UsersService } from "./users.service";
import type { ConversationMessage } from "../agent/conversationInput";

const usersService = new UsersService();

const findUserIdByPhone = async (phone: string) => {
  const user = await usersService.findByPhone(phone);
  return user?.id ?? null;
};

const getStringField = (value: Prisma.JsonValue, key: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const field = value[key as keyof typeof value];
  return typeof field === "string" ? field : null;
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

export const getRecentConversationHistory = async (input: {
  userId: string;
  limit?: number;
  excludeInboundMessageSid?: string;
}): Promise<ConversationMessage[]> => {
  const logs = await prisma.auditLog.findMany({
    where: {
      userId: input.userId,
      action: {
        in: ["whatsapp.inbound", "whatsapp.outbound"]
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: input.limit ?? 12
  });

  return logs
    .reverse()
    .flatMap<ConversationMessage>((log) => {
      if (log.action === "whatsapp.inbound") {
        const messageSid = getStringField(log.metadataJson, "messageSid");
        if (input.excludeInboundMessageSid && messageSid === input.excludeInboundMessageSid) {
          return [];
        }

        const body = getStringField(log.metadataJson, "body");
        return body ? [{ role: "user" as const, content: body }] : [];
      }

      if (log.action === "whatsapp.outbound") {
        const body = getStringField(log.metadataJson, "body");
        return body ? [{ role: "assistant" as const, content: body }] : [];
      }

      return [];
    });
};
