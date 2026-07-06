import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { weekCalendarBlock } from "./week-calendar-block";

describe("weekCalendarBlock", () => {
  it("defaults the week-number column to left", () => {
    expect(weekCalendarBlock.defaultConfig.weeks).toBe("left");
  });

  it("parses a stored config missing weeks as left", () => {
    const parsed = v.parse(weekCalendarBlock.schema, { before: 0, after: 0 });
    expect(parsed.weeks).toBe("left");
  });

  it("rejects an unknown weeks value", () => {
    const result = v.safeParse(weekCalendarBlock.schema, { before: 0, after: 0, weeks: "middle" });
    expect(result.success).toBe(false);
  });

  it("defaults hiddenWeekdays to an empty array when omitted", () => {
    const parsed = v.parse(weekCalendarBlock.schema, { before: 0, after: 0 });
    expect(parsed.hiddenWeekdays).toEqual([]);
  });

  it("parses a provided hiddenWeekdays array", () => {
    const parsed = v.parse(weekCalendarBlock.schema, { before: 0, after: 0, hiddenWeekdays: [0, 6] });
    expect(parsed.hiddenWeekdays).toEqual([0, 6]);
  });

  it("rejects a weekday index outside the 0-6 range", () => {
    const result = v.safeParse(weekCalendarBlock.schema, { before: 0, after: 0, hiddenWeekdays: [7] });
    expect(result.success).toBe(false);
  });

  it("defaults showHeading to true when omitted", () => {
    const parsed = v.parse(weekCalendarBlock.schema, { before: 0, after: 0 });
    expect(parsed.showHeading).toBe(true);
  });
});
