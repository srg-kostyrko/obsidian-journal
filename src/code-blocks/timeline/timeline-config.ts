import * as v from "valibot";

export const timelineModes = ["week", "month", "quarter", "calendar"] as const;

export type TimelineMode = (typeof timelineModes)[number];

function asTimelineMode(value: unknown): TimelineMode | undefined {
  return typeof value === "string" && (timelineModes as readonly string[]).includes(value)
    ? (value as TimelineMode)
    : undefined;
}

// A non-mapping fence (e.g. `mode:month` with no space parses to the bare string "mode:month")
// degrades to defaults so the journal-derived mode applies, rather than blanking into an error panel.
function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

export const timelineBlockSchema = v.pipe(
  v.unknown(),
  v.transform(asRecord),
  v.object({
    // An unknown mode parses to unset so the journal-derived mode applies — v2 fell
    // back on a typo instead of blanking the timeline into an error panel.
    mode: v.pipe(v.optional(v.unknown()), v.transform(asTimelineMode)),
    shelf: v.optional(v.string()),
    weeks: v.optional(v.picklist(["default", "none", "left", "right"] as const)),
    hiddenWeekdays: v.optional(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)))),
  }),
);

export type TimelineBlockConfig = v.InferOutput<typeof timelineBlockSchema>;
