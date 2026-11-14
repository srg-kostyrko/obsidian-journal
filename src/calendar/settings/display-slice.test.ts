import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { calendarDisplaySlice, calendarDisplaySliceSchema } from "./display-slice";
import { calendarSettingsCoreModule } from "./module";

async function repaired(weekend: unknown) {
  const harness = await testContainer({
    modules: [calendarSettingsCoreModule],
    data: { calendarDisplay: { weekend, weekPlacement: "right" } },
    allow: { dataRepair: true },
  });
  return harness.settings.getSlice(calendarDisplaySlice).state;
}

describe("calendarDisplaySlice", () => {
  it("fills the label fields from fresh objects, so filling one in place leaves the stock untouched", () => {
    const first = v.parse(calendarDisplaySliceSchema, {});
    const second = v.parse(calendarDisplaySliceSchema, {});
    first.labels.day = "DD";
    if (first.weekdayLabel.type === "pattern") first.weekdayLabel.pattern = "dd";
    expect([second.labels.day, calendarDisplaySlice.defaults.labels.day]).toEqual(["", ""]);
    expect([second.weekdayLabel, calendarDisplaySlice.defaults.weekdayLabel]).toEqual([
      { type: "pattern", pattern: "" },
      { type: "pattern", pattern: "" },
    ]);
    expect(second.labels).not.toBe(calendarDisplaySlice.defaults.labels);
  });

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
      weekend: { type: "locale" },
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

  it("repairs an unknown weekdayLabelNarrow shape to null, not to a widened override", async () => {
    const harness = await testContainer({
      modules: [calendarSettingsCoreModule],
      data: { calendarDisplay: { weekdayLabelNarrow: { type: "nope" }, weekdayLabel: { type: "letter" } } },
      allow: { dataRepair: true },
    });
    const state = harness.settings.getSlice(calendarDisplaySlice).state;
    expect(state.weekdayLabelNarrow).toBeNull();
    expect(state.weekdayLabel).toEqual({ type: "letter" });
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
  describe("weekend", () => {
    it("defaults to the locale's weekend", () => {
      expect(calendarDisplaySlice.defaults.weekend).toEqual({ type: "locale" });
      expect(v.parse(calendarDisplaySliceSchema, {}).weekend).toEqual({ type: "locale" });
    });

    it("keeps a custom weekend, including the empty one", () => {
      expect(v.parse(calendarDisplaySliceSchema, { weekend: { type: "custom", days: [5, 6] } }).weekend).toEqual({
        type: "custom",
        days: [5, 6],
      });
      expect(v.parse(calendarDisplaySliceSchema, { weekend: { type: "custom", days: [] } }).weekend).toEqual({
        type: "custom",
        days: [],
      });
    });

    it.each([[{ type: "custom", days: [5, 9] }], [{ type: "custom", days: "fri" }]])(
      "repairs a corrupt custom weekend %j to the locale weekend, not a narrowed one",
      async (weekend) => {
        const state = await repaired(weekend);
        expect(state.weekend).toEqual({ type: "locale" });
        expect(state.weekPlacement).toBe("right");
      },
    );

    it("repairs an unknown weekend shape to the stock", async () => {
      const state = await repaired({ type: "nope" });
      expect(state.weekend).toEqual({ type: "locale" });
      expect(state.weekPlacement).toBe("right");
    });
  });
});
