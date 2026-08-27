import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { calendarDisplaySlice, calendarDisplaySliceSchema } from "./display-slice";

describe("calendarDisplaySlice", () => {
  it("defaults weekPlacement to left", () => {
    expect(calendarDisplaySlice.defaults.weekPlacement).toBe("left");
  });

  it("fills weekPlacement from the default when the field is absent", () => {
    const parsed = v.parse(calendarDisplaySliceSchema, {});
    expect(parsed.weekPlacement).toBe("left");
  });

  it("defaults timelineNavigation to off, so no existing block gains a row on upgrade", () => {
    expect(calendarDisplaySlice.defaults.timelineNavigation).toBe(false);
  });

  it("fills timelineNavigation from the default when the field is absent", () => {
    const parsed = v.parse(calendarDisplaySliceSchema, {});
    expect(parsed.timelineNavigation).toBe(false);
  });

  it("rejects an unknown placement value", () => {
    const parsed = v.safeParse(calendarDisplaySliceSchema, { weekPlacement: "middle" });
    expect(parsed.success).toBe(false);
  });
});
