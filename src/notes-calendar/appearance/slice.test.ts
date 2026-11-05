import * as v from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";
import { testContainer } from "@/testing";

import {
  appearanceSlice,
  appearanceSliceSchema,
  type AppearanceParts,
  type AppearanceSliceState,
  type BoxValues,
  type HighlightValues,
  type NarrowHighlight,
  type NarrowOverrides,
  type Overrides,
  type TextValues,
} from "./slice";

const transparent = { type: "transparent" };
const theme = (name: string) => ({ type: "theme", name });
const unchangedText = { color: null, weight: null, italic: null };

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
    expect(wide.weekday).toEqual({ ...asToday, size: "0.6em", color: theme("text-muted") });
    expect(wide.weekNumber).toEqual({ ...asToday, weight: "bold" });
    expect(wide.date).toEqual(asToday);
    expect(wide.cell).toEqual({ padding: 0, radius: "var(--radius-s)", gap: "var(--size-2-1)", minHeight: 26 });
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
      heading: TextValues;
      weekday: TextValues;
      weekNumber: TextValues;
      date: TextValues;
      cell: BoxValues;
    }>();
  });

  it("every narrow part overrides exactly its wide part's fields", () => {
    expectTypeOf<NarrowOverrides>().toEqualTypeOf<{
      [P in keyof AppearanceParts]: AppearanceParts[P] extends HighlightValues
        ? NarrowHighlight
        : Overrides<AppearanceParts[P]>;
    }>();
    expectTypeOf<keyof NarrowHighlight>().toEqualTypeOf<keyof HighlightValues>();
    expectTypeOf<Omit<NarrowHighlight, "text">>().toEqualTypeOf<Overrides<Omit<HighlightValues, "text">>>();
    expectTypeOf<NarrowHighlight["text"]>().toEqualTypeOf<Overrides<HighlightValues["text"]>>();
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

  it("an unreadable highlight text color resets only that color", async () => {
    const { state } = await loaded({
      wide: { active: { color: red, text: { color: { type: "custom", color: 5 }, weight: "bold" } } },
    });

    expect(state.wide.active.text).toEqual({
      color: appearanceSlice.defaults.wide.active.text.color,
      weight: "bold",
      italic: null,
    });
    expect(state.wide.active.color).toEqual(red);
  });
});
