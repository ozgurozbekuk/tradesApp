// Tracks legacy capability gaps and cleanup work around the V2 migration.
export const conversationV2DeprecationTargets = [
  "backend/src/messaging/router.ts",
  "backend/src/messaging/dialog-manager.ts",
  "backend/src/messaging/pending-flow-priority.ts",
  "backend/src/messaging/parsers/heuristic-domain.parser.ts",
  "backend/src/messaging/parsers/command.parser.ts",
  "backend/src/messaging/semantic-agent/",
  "backend/src/messaging/agent/context-memory.ts",
  "backend/src/routes/test.route.ts"
] as const;

export const conversationV2CleanupPhases = [
  {
    phase: "after_v2_routing_default",
    goals: [
      "Remove V1-only WhatsApp routing paths once V2 owns all supported workflows.",
      "Delete legacy pending-flow helpers that duplicate V2 continuation logic.",
      "Stop writing WhatsApp turns into V1 conversation memory for V2-routed users."
    ]
  },
  {
    phase: "after_v2_rollout_validation",
    goals: [
      "Remove semantic-agent and dialog-manager branches no longer referenced by production routing.",
      "Delete heuristic parser branches that only exist to support retired V1 WhatsApp flows.",
      "Retire temporary V2 rollout flags after the new router becomes the default."
    ]
  }
] as const;
