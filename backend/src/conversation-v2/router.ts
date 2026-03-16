import { env } from "../config/env";
import { routeIncomingMessage, type IncomingMessage, type RoutedMessage } from "../messaging/router";
import { UsersService } from "../services/users.service";
import { createConversationV2Services, type ConversationV2Services } from "./adapters/services";
import { routeIncomingMessageV2 } from "./index";
import {
  createInMemoryConversationStateStore,
  type ConversationStateStore
} from "./state/state-store";

export type ConversationV2RouteResult = RoutedMessage & {
  source: "v1" | "v2";
  v2Status?: "completed" | "pending" | "unsupported";
};

type ConversationV2RoutingUser = {
  id: string;
  phone: string;
};

export type ConversationV2RouterDependencies = {
  stateStore?: ConversationStateStore;
  usersService?: Pick<UsersService, "findByPhone">;
  services?: ConversationV2Services;
  routeV1?: (input: IncomingMessage) => Promise<RoutedMessage>;
  routeV2?: typeof routeIncomingMessageV2;
  log?: (message: string, meta: Record<string, unknown>) => void;
};

const defaultStateStore = createInMemoryConversationStateStore();
const defaultUsersService = new UsersService();

const normalizePhone = (value: string) => value.replace(/\s+/g, "");

const readConversationV2EnvEnabled = () =>
  process.env.USE_CONVERSATION_V2 === undefined ? env.USE_CONVERSATION_V2 : process.env.USE_CONVERSATION_V2 === "true";

const readConversationV2ConfiguredPhones = () =>
  process.env.CONVERSATION_V2_TEST_PHONES ?? env.CONVERSATION_V2_TEST_PHONES;

const parseConversationV2TestPhones = (value: string | undefined) => {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => normalizePhone(entry.trim()))
    .filter(Boolean);
};

export const isConversationV2EnabledForUser = (input: {
  envEnabled: boolean;
  phone: string;
  configuredPhones?: string;
  user: ConversationV2RoutingUser | null;
}) => {
  if (!input.envEnabled || !input.user) {
    return false;
  }

  const allowedPhones = parseConversationV2TestPhones(input.configuredPhones);
  if (allowedPhones.length === 0) {
    return true;
  }

  return allowedPhones.includes(normalizePhone(input.phone));
};

export const routeIncomingMessageWithConversationV2 = async (
  input: IncomingMessage,
  dependencies: ConversationV2RouterDependencies = {}
): Promise<ConversationV2RouteResult> => {
  const usersService = dependencies.usersService ?? defaultUsersService;
  const routeV1 = dependencies.routeV1 ?? routeIncomingMessage;
  const routeV2 = dependencies.routeV2 ?? routeIncomingMessageV2;
  const stateStore = dependencies.stateStore ?? defaultStateStore;
  const log = dependencies.log;

  const user = (await usersService.findByPhone(input.from)) as ConversationV2RoutingUser | null;
  const v2Enabled = isConversationV2EnabledForUser({
    envEnabled: readConversationV2EnvEnabled(),
    phone: input.from,
    configuredPhones: readConversationV2ConfiguredPhones(),
    user
  });

  if (!v2Enabled || !user) {
    const v1Result = await routeV1(input);
    return {
      ...v1Result,
      source: "v1"
    };
  }

  const existingState = await stateStore.load(user.id);
  const hadPendingFlow = Boolean(existingState?.pendingFlow);
  const services = dependencies.services ?? createConversationV2Services();

  const v2Result = await routeV2(
    {
      userId: user.id,
      from: input.from,
      body: input.body,
      messageSid: input.messageSid
    },
    {
      stateStore,
      services
    }
  );

  const shouldFallbackToV1 =
    v2Result.status === "unsupported" && !hadPendingFlow && !v2Result.state.pendingFlow;

  if (shouldFallbackToV1) {
    log?.("conversation_v2_fallback_to_v1", {
      phone: input.from,
      userId: user.id,
      body: input.body
    });

    const v1Result = await routeV1(input);
    return {
      ...v1Result,
      source: "v1"
    };
  }

  log?.("conversation_v2_routed", {
    phone: input.from,
    userId: user.id,
    workflow: v2Result.workflow,
    status: v2Result.status
  });

  return {
    reply: v2Result.reply,
    mediaUrl: v2Result.mediaUrl,
    source: "v2",
    v2Status: v2Result.status
  };
};
