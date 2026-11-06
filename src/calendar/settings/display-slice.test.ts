import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { calendarDisplaySlice, calendarDisplaySliceSchema } from "./display-slice";
import { calendarSettingsCoreModule } from "./module";

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

  it("defaults every structure field to today's rendering", () => {
    expect(calendarDisplaySlice.defaults).toEqual({
      weekPlacement: "left",
      timelineNavigation: false,
      showHeading: true,
      showWeekdays: true,
      outsideDays: "automatic",
      monthRows: "fit",
    });
  });

  it("repairs a stored unknown outsideDays to automatic and keeps the other fields", async () => {
    const harness = await testContainer({
      modules: [calendarSettingsCoreModule],
      data: { calendarDisplay: { outsideDays: "sideways", weekPlacement: "right" } },
      allow: { dataRepair: true },
    });
    const state = harness.settings.getSlice(calendarDisplaySlice).state;
    expect(state.outsideDays).toBe("automatic");
    expect(state.weekPlacement).toBe("right");
  });
});
