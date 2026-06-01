import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { monthCalendarBlock } from "./month-calendar-block";

describe("monthCalendarBlock", () => {
  it("defaults the week-number column to left", () => {
    expect(monthCalendarBlock.defaultConfig.weeks).toBe("left");
  });

  it("parses a stored config missing weeks as left", () => {
    const parsed = v.parse(monthCalendarBlock.schema, { before: 0, after: 0, hideWeekends: false });
    expect(parsed.weeks).toBe("left");
  });

  it("rejects an unknown weeks value", () => {
    const result = v.safeParse(monthCalendarBlock.schema, {
      before: 0,
      after: 0,
      hideWeekends: false,
      weeks: "middle",
    });
    expect(result.success).toBe(false);
  });
});
