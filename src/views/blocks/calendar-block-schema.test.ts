import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { defaultsFrom, repairValue } from "@/settings/repair";

import { calendarBlockBaseSchema } from "./calendar-block-schema";

const schema = v.object(calendarBlockBaseSchema);

describe("calendarBlockBaseSchema weeks", () => {
  it("defaults weeks to 'default' when omitted", () => {
    const parsed = v.parse(schema, { before: 0, after: 0 });
    expect(parsed.weeks).toBe("default");
  });

  it("accepts an explicit 'right' override", () => {
    const parsed = v.parse(schema, { before: 0, after: 0, weeks: "right" });
    expect(parsed.weeks).toBe("right");
  });
});

describe("calendarBlockBaseSchema visibility", () => {
  const base = { before: 0, after: 0 };

  it("defaults heading and weekday header to 'default' when omitted", () => {
    const parsed = v.parse(schema, base);
    expect(parsed.showHeading).toBe("default");
    expect(parsed.showWeekdays).toBe("default");
  });

  it("keeps legacy booleans unchanged", () => {
    expect(v.parse(schema, { ...base, showHeading: true }).showHeading).toBe(true);
    expect(v.parse(schema, { ...base, showHeading: false }).showHeading).toBe(false);
  });

  it("repairs an unknown heading value to 'default'", () => {
    const repaired = repairValue(schema, { ...base, showHeading: "maybe" }, defaultsFrom({}));
    expect(repaired?.value.showHeading).toBe("default");
  });
});
