export type MorningSummaryMessage = {
  userId: string;
  reply: string;
};

export const buildMorningSummaryMessage = (userId: string): MorningSummaryMessage => ({
  userId,
  reply: "Morning summary automation is not implemented yet."
});

