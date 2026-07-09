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

  it("rejects an unknown mode value", () => {
    expect(v.safeParse(timelineBlockSchema, { mode: "decade" }).success).toBe(false);
  });

  it("accepts a shelf string", () => {
    const result = v.parse(timelineBlockSchema, { shelf: "work" });
    expect(result.shelf).toBe("work");
  });

  it("accepts a weeks position", () => {
    const result = v.parse(timelineBlockSchema, { weeks: "right" });
    expect(result.weeks).toBe("right");
  });

  it("rejects an unknown weeks value", () => {
    expect(v.safeParse(timelineBlockSchema, { weeks: "center" }).success).toBe(false);
  });

  it("accepts a config without weeks", () => {
    expect(v.safeParse(timelineBlockSchema, { mode: "month" }).success).toBe(true);
  });

  it("accepts a hiddenWeekdays array", () => {
    const result = v.parse(timelineBlockSchema, { hiddenWeekdays: [0, 6] });
    expect(result.hiddenWeekdays).toEqual([0, 6]);
  });

  it("rejects a weekday index outside the 0-6 range", () => {
    expect(v.safeParse(timelineBlockSchema, { hiddenWeekdays: [7] }).success).toBe(false);
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
