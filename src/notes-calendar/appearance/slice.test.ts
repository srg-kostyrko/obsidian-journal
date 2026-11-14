import * as v from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";
import { testContainer } from "@/testing";

import {
  appearanceSlice,
  appearanceSliceSchema,
  STOCK_NARROW,
  type AppearanceParts,
  type AppearanceSliceState,
  type BoxValues,
  type CurrentWeekValues,
  type HighlightValues,
  type NarrowCurrentWeek,
  type NarrowHighlight,
  type NarrowOverrides,
  type Overrides,
  type TextValues,
  type WeekNumberValues,
} from "./slice";

const transparent = { type: "transparent" };
const theme = (name: string) => ({ type: "theme", name });
const unchangedText = { color: "unchanged", weight: "unchanged", italic: "unchanged" };

describe("appearanceSlice", () => {
  it("defaults reproduce today's look", () => {
    const { wide } = appearanceSlice.defaults;

    expect(wide.today).toEqual({
      style: "text",
      color: transparent,
      ringWidth: 2,
      strength: 100,
      text: { ...unchangedText, color: theme("text-accent") },
      over: false,
    });
    expect(wide.selected).toEqual({
      style: "ring",
      color: theme("interactive-accent"),
      ringWidth: 2,
      strength: 100,
      text: unchangedText,
      over: true,
    });
    expect(wide.active).toEqual({
      style: "background",
      color: theme("interactive-accent"),
      ringWidth: 2,
      strength: 100,
      text: { ...unchangedText, color: theme("text-on-accent") },
      over: false,
    });
    expect(wide.outside).toEqual({
      style: "text",
      color: transparent,
      ringWidth: 2,
      strength: 100,
      text: { ...unchangedText, color: theme("text-muted") },
      over: false,
    });
    const asToday = { size: "inherit", weight: null, italic: null, color: null, case: null };
    expect(wide.heading).toEqual(asToday);
    // A stock a Default option covers is stored as Default, so a fresh install reads Default there.
    expect(wide.weekday).toEqual({ ...asToday, size: "0.6em" });
    expect(wide.weekNumber).toEqual({
      ...asToday,
      size: "0.85em",
      divider: true,
      dividerColor: theme("background-modifier-border"),
      dividerWidth: 1,
    });
    expect(wide.date).toEqual(asToday);
    // Null, not a number: Default is a row height that grows with the calendar's width.
    expect(wide.cell).toEqual({ padding: 0, radius: "var(--radius-s)", gap: "var(--size-2-1)", minHeight: null });
  });

  it("narrow keeps one-pixel gaps, 26px rows and a 20% Selected background as its stock", () => {
    expect(STOCK_NARROW).toEqual({
      selected: { style: "background", strength: 20 },
      cell: { gap: "1px", minHeight: 26 },
    });
  });

  it("the weekend band draws nothing at stock", () => {
    expect(appearanceSlice.defaults.wide.weekend).toEqual({
      style: "none",
      color: transparent,
      ringWidth: 2,
      strength: 100,
      text: unchangedText,
      over: false,
    });
  });

  // Text only, not None: None would pass every text value through, the week number's accent included.
  it("the current week marks only its week number at stock, in accent and bold", () => {
    expect(appearanceSlice.defaults.wide.currentWeek).toEqual({
      style: "text",
      color: transparent,
      ringWidth: 2,
      strength: 100,
      text: unchangedText,
      weekNumberText: { color: theme("text-accent"), weight: "bold", italic: "unchanged" },
      over: false,
    });
  });

  it("a highlight's text defaults to unchanged where the stock sets none", () => {
    expect(appearanceSlice.defaults.wide.selected.text).toEqual({
      color: "unchanged",
      weight: "unchanged",
      italic: "unchanged",
    });
  });

  it("every narrow override defaults to null", () => {
    const leaves: [string, unknown][] = [];
    const walk = (value: unknown, path: string): void => {
      if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
      } else leaves.push([path, value]);
    };
    walk(appearanceSlice.defaults.narrow, "narrow");

    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.filter(([, value]) => value !== null)).toEqual([]);
    expect(Object.keys(appearanceSlice.defaults.narrow)).toEqual(Object.keys(appearanceSlice.defaults.wide));
  });

  it("parses an empty object into the defaults", () => {
    expect(v.parse(appearanceSliceSchema, {})).toEqual(appearanceSlice.defaults);
  });
});

describe("appearance slice types", () => {
  it("the schema parses to the slice state", () => {
    expectTypeOf<v.InferOutput<typeof appearanceSliceSchema>>().toEqualTypeOf<{
      wide: AppearanceParts;
      narrow: NarrowOverrides;
    }>();
    expectTypeOf<AppearanceSliceState>().toEqualTypeOf<{ wide: AppearanceParts; narrow: NarrowOverrides }>();
  });

  it("each wide part holds its kind's values", () => {
    expectTypeOf<AppearanceParts>().toEqualTypeOf<{
      today: HighlightValues;
      selected: HighlightValues;
      active: HighlightValues;
      outside: HighlightValues;
      weekend: HighlightValues;
      currentWeek: CurrentWeekValues;
      heading: TextValues;
      weekday: TextValues;
      weekNumber: WeekNumberValues;
      date: TextValues;
      cell: BoxValues;
    }>();
  });

  it("every narrow part overrides exactly its wide part's fields", () => {
    expectTypeOf<NarrowOverrides>().toEqualTypeOf<{
      [P in keyof AppearanceParts]: AppearanceParts[P] extends CurrentWeekValues
        ? NarrowCurrentWeek
        : AppearanceParts[P] extends HighlightValues
          ? NarrowHighlight
          : Overrides<AppearanceParts[P]>;
    }>();
    expectTypeOf<Omit<NarrowCurrentWeek, "weekNumberText">>().toEqualTypeOf<NarrowHighlight>();
    expectTypeOf<NarrowCurrentWeek["weekNumberText"]>().toEqualTypeOf<Overrides<HighlightValues["text"]>>();
    expectTypeOf<CurrentWeekValues["weekNumberText"]>().toEqualTypeOf<HighlightValues["text"]>();
    expectTypeOf<keyof NarrowHighlight>().toEqualTypeOf<keyof HighlightValues>();
    expectTypeOf<Omit<NarrowHighlight, "text">>().toEqualTypeOf<Overrides<Omit<HighlightValues, "text">>>();
    expectTypeOf<NarrowHighlight["text"]>().toEqualTypeOf<Overrides<HighlightValues["text"]>>();
    expectTypeOf<Omit<WeekNumberValues, "divider" | "dividerColor" | "dividerWidth">>().toEqualTypeOf<TextValues>();
  });
});

const sliceModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(appearanceSlice);
  },
};

async function loaded(stored: unknown) {
  const harness = await testContainer({
    modules: [sliceModule],
    data: { appearance: stored },
    allow: { dataRepair: true },
  });
  const repairs = harness.logs.records.filter((record) => record.message === "slice fields reset to defaults");
  return { state: harness.settings.getSlice(appearanceSlice).state, repairs };
}

describe("appearance slice repair on load", () => {
  const red = { type: "custom", color: "#ff0000" };

  it("repairs an out-of-range strength alone", async () => {
    const { state, repairs } = await loaded({ wide: { today: { style: "background", color: red, strength: 250 } } });

    expect(state.wide.today.strength).toBe(appearanceSlice.defaults.wide.today.strength);
    expect(state.wide.today.color).toEqual(red);
    expect(state.wide.today.style).toBe("background");
    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.fields).toMatchObject({ sliceKey: "appearance", fields: ["wide.today.strength"] });
  });

  it("repairs an unknown style alone", async () => {
    const { state } = await loaded({ wide: { selected: { style: "glow", color: red } } });

    expect(state.wide.selected.style).toBe("ring");
    expect(state.wide.selected.color).toEqual(red);
  });

  it("repairs a non-null garbage narrow override to null", async () => {
    const { state, repairs } = await loaded({
      narrow: { selected: { style: 7, color: red }, cell: { minHeight: "tall", padding: 4 } },
    });

    expect(state.narrow.selected.style).toBeNull();
    expect(state.narrow.selected.color).toEqual(red);
    expect(state.narrow.cell.minHeight).toBeNull();
    expect(state.narrow.cell.padding).toBe(4);
    const reset = repairs[0]?.fields as { sliceKey?: string; fields?: string[] } | undefined;
    expect(reset?.sliceKey).toBe("appearance");
    expect(reset?.fields?.toSorted()).toEqual(["narrow.cell.minHeight", "narrow.selected.style"]);
  });

  it("repairs an unreadable row height to the growing default alone", async () => {
    const { state } = await loaded({ wide: { cell: { minHeight: "tall", padding: 4 } } });

    expect(state.wide.cell.minHeight).toBeNull();
    expect(state.wide.cell.padding).toBe(4);
  });

  it("keeps a set row height", async () => {
    const { state } = await loaded({ wide: { cell: { minHeight: 40 } } });

    expect(state.wide.cell.minHeight).toBe(40);
  });

  it("an unreadable highlight text color resets only that color", async () => {
    const { state } = await loaded({
      wide: { active: { color: red, text: { color: { type: "custom", color: 5 }, weight: "bold" } } },
    });

    expect(state.wide.active.text).toEqual({
      color: appearanceSlice.defaults.wide.active.text.color,
      weight: "bold",
      italic: "unchanged",
    });
    expect(state.wide.active.color).toEqual(red);
  });

  it("a corrupt highlight text leaf repairs to unchanged", async () => {
    const { state } = await loaded({ wide: { selected: { text: { weight: 7 } } } });

    expect(state.wide.selected.text.weight).toBe("unchanged");
    expect(state.wide.selected.text.color).toEqual(appearanceSlice.defaults.wide.selected.text.color);
  });

  it("a corrupt week-number text leaf repairs that leaf alone", async () => {
    const { state, repairs } = await loaded({ wide: { currentWeek: { weekNumberText: { weight: 7, italic: true } } } });

    expect(state.wide.currentWeek.weekNumberText).toEqual({
      ...appearanceSlice.defaults.wide.currentWeek.weekNumberText,
      italic: true,
    });
    expect(repairs[0]?.fields).toMatchObject({ fields: ["wide.currentWeek.weekNumberText.weight"] });
  });

  it("a narrow week-number text leaf overrides that leaf alone", () => {
    const state = v.parse(appearanceSliceSchema, {
      narrow: { currentWeek: { weekNumberText: { color: "unchanged" } } },
    });

    expect(state.narrow.currentWeek.weekNumberText).toEqual({ color: "unchanged", weight: null, italic: null });
  });

  it("a corrupt divider width repairs that leaf alone", async () => {
    const { state, repairs } = await loaded({ wide: { weekNumber: { divider: false, dividerWidth: -2 } } });

    expect(state.wide.weekNumber).toMatchObject({ divider: false, dividerWidth: 1 });
    expect(repairs[0]?.fields).toMatchObject({ fields: ["wide.weekNumber.dividerWidth"] });
  });

  it("a narrow divider overrides its three leaves alone", () => {
    const state = v.parse(appearanceSliceSchema, { narrow: { weekNumber: { divider: false } } });

    expect(state.narrow.weekNumber).toMatchObject({ divider: false, dividerColor: null, dividerWidth: null });
  });

  it("narrow keeps null as no override and accepts unchanged", () => {
    const state = v.parse(appearanceSliceSchema, { narrow: { today: { text: { color: "unchanged" } } } });

    expect(state.narrow.today.text).toEqual({ color: "unchanged", weight: null, italic: null });
  });
});
