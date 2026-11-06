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
      labels: { day: "", week: "", month: "", quarter: "", year: "" },
      weekdayLabel: { type: "pattern", pattern: "" },
      weekdayLabelNarrow: null,
    });
  });

  it("repairs a non-string label to empty and keeps the other labels", async () => {
    const harness = await testContainer({
      modules: [calendarSettingsCoreModule],
      data: { calendarDisplay: { labels: { day: 42, week: "w" } } },
      allow: { dataRepair: true },
    });
    const state = harness.settings.getSlice(calendarDisplaySlice).state;
    expect(state.labels.day).toBe("");
    expect(state.labels.week).toBe("w");
  });

  it("repairs an unknown weekdayLabel shape to the stock label", async () => {
    const harness = await testContainer({
      modules: [calendarSettingsCoreModule],
      data: { calendarDisplay: { weekdayLabel: { type: "nope" }, weekPlacement: "right" } },
      allow: { dataRepair: true },
    });
    const state = harness.settings.getSlice(calendarDisplaySlice).state;
    expect(state.weekdayLabel).toEqual({ type: "pattern", pattern: "" });
    expect(state.weekPlacement).toBe("right");
  });

  it("accepts the letter weekday label", () => {
    const parsed = v.parse(calendarDisplaySliceSchema, {
      weekdayLabel: { type: "letter" },
      weekdayLabelNarrow: { type: "letter" },
    });
    expect(parsed.weekdayLabel).toEqual({ type: "letter" });
    expect(parsed.weekdayLabelNarrow).toEqual({ type: "letter" });
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
