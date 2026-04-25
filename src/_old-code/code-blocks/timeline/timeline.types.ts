export const timelineModes = ["week", "month", "quarter", "calendar"] as const;
export type TimelineMode = (typeof timelineModes)[number];
