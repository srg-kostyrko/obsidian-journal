import * as v from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";

import { timelineBlockSchema, type TimelineBlockConfig, type TimelineMode } from "./timeline-config";

describe("timelineBlockSchema", () => {
  it("accepts an empty object", () => {
    const result = v.parse(timelineBlockSchema, {});
    expect(result).toEqual({});
  });

  it.each(["week", "month", "quarter", "calendar"] as const)("accepts mode %s", (mode) => {
    const result = v.parse(timelineBlockSchema, { mode });
    expect(result.mode).toBe(mode);
  });

  it("treats an unknown mode value as unset so the journal-derived mode applies", () => {
    // `asTimelineMode` only recognizes the four listed modes; anything else — including
    // "decade", a real period unit elsewhere in the app — degrades to undefined rather
    // than failing.
    const result = v.parse(timelineBlockSchema, { mode: "decade" });
    expect(result.mode).toBeUndefined();
  });

  it("applies the journal-derived mode when the source is a non-object scalar", () => {
    // `mode:month` with no space after the colon parses to the bare string "mode:month"
    // rather than a mapping; `asRecord` degrades that to {}, so every field, including
    // mode, ends up unset.
    const result = v.parse(timelineBlockSchema, "mode:month");
    expect(result.mode).toBeUndefined();
  });

  it("accepts a shelf string", () => {
    const result = v.parse(timelineBlockSchema, { shelf: "work" });
    expect(result.shelf).toBe("work");
  });

  it("accepts a weeks position", () => {
    const result = v.parse(timelineBlockSchema, { weeks: "right" });
    expect(result.weeks).toBe("right");
  });

  it("treats an unknown weeks value as unset so the configured placement applies", () => {
    // Same rule as mode: a typo must not blank the block into an error panel.
    const result = v.parse(timelineBlockSchema, { weeks: "center" });
    expect(result.weeks).toBeUndefined();
  });

  it("accepts a config without weeks", () => {
    expect(v.safeParse(timelineBlockSchema, { mode: "month" }).success).toBe(true);
  });

  it("accepts a hiddenWeekdays array", () => {
    const result = v.parse(timelineBlockSchema, { hiddenWeekdays: [0, 6] });
    expect(result.hiddenWeekdays).toEqual([0, 6]);
  });

  it("drops a weekday index outside the 0-6 range and keeps the rest", () => {
    const result = v.parse(timelineBlockSchema, { hiddenWeekdays: [0, 7] });
    expect(result.hiddenWeekdays).toEqual([0]);
  });

  it("treats a non-array hiddenWeekdays as unset", () => {
    const result = v.parse(timelineBlockSchema, { hiddenWeekdays: 0 });
    expect(result.hiddenWeekdays).toBeUndefined();
  });

  it("coerces an unquoted numeric shelf to its string form", () => {
    // `shelf: 2024` is ordinary YAML for a shelf named 2024 and parses as a number; the home
    // block already coerces it, and the same line must not error here.
    const result = v.parse(timelineBlockSchema, { shelf: 2024 });
    expect(result.shelf).toBe("2024");
  });

  it("infers TimelineMode as the mode union", () => {
    expectTypeOf<TimelineMode>().toEqualTypeOf<"week" | "month" | "quarter" | "calendar">();
  });

  it("infers TimelineBlockConfig with optional fields", () => {
    expectTypeOf<TimelineBlockConfig>().toEqualTypeOf<{
      mode?: TimelineMode | undefined;
      shelf?: string | undefined;
      weeks?: "default" | "none" | "left" | "right" | undefined;
      hiddenWeekdays?: number[] | undefined;
    }>();
  });
});
