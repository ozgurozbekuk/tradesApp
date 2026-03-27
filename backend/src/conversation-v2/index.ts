// Exposes the Conversation V2 entry points used by the router.
import { runConversationV2Turn, type ConversationV2RuntimeDependencies } from "./engine/runtime";
import type { RouteIncomingMessageV2Input, RouteIncomingMessageV2Result } from "./engine/contracts";

export type { RouteIncomingMessageV2Input, RouteIncomingMessageV2Result } from "./engine/contracts";
export { runConversationV2Turn } from "./engine/runtime";

export const routeIncomingMessageV2 = async (
  input: RouteIncomingMessageV2Input,
  dependencies: ConversationV2RuntimeDependencies
): Promise<RouteIncomingMessageV2Result> => {
  return runConversationV2Turn(input, dependencies);
};

