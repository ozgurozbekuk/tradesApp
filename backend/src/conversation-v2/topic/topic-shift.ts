import type { PendingFlow } from "../engine/contracts";

export type TopicShiftDecision =
  | { type: "continue_pending" }
  | { type: "topic_shift"; reason: "explicit_cancel" | "topic_shift" };

export const decideTopicShift = (_input: {
  pendingFlow: PendingFlow;
  text: string;
}): TopicShiftDecision => {
  return { type: "continue_pending" };
};

