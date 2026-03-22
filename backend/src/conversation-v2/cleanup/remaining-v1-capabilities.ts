export const remainingV1OnlyCapabilities = [
  "booking_create",
  "job_list_extended",
  "briefing_toggle",
  "unknown_v1_capability"
] as const;

export type RemainingV1OnlyCapability = (typeof remainingV1OnlyCapabilities)[number];
