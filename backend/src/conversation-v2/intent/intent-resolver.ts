import type { WorkflowIntent } from "../engine/contracts";

export type IntentResolutionResult =
  | { type: "intent"; intent: WorkflowIntent }
  | { type: "unsupported" };

export const resolveIntentV2 = async (_input: {
  text: string;
}): Promise<IntentResolutionResult> => {
  return { type: "unsupported" };
};

