import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";
import { testContainer } from "@/testing";

import { buildCalendarDecoration, buildStyle } from "../testing";

import { decorationsSlice, decorationsSliceSchema } from "./slice";

describe("decorationsSliceSchema", () => {
  it("defaults the mark limit to 3 for a payload written before the field existed", () => {
    const parsed = v.parse(decorationsSliceSchema, { decorations: [] });

    expect(parsed.maxMarksPerSlot).toBe(3);
  });

  it("keeps a stored limit", () => {
    const parsed = v.parse(decorationsSliceSchema, { decorations: [], maxMarksPerSlot: 5 });

    expect(parsed.maxMarksPerSlot).toBe(5);
  });

  it("accepts 0, the unlimited value", () => {
    const parsed = v.parse(decorationsSliceSchema, { decorations: [], maxMarksPerSlot: 0 });

    expect(parsed.maxMarksPerSlot).toBe(0);
  });
});

const sliceModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(decorationsSlice);
  },
};

const kept = () =>
  buildCalendarDecoration({
    mode: "or",
    conditions: [{ type: "weekday", weekdays: [6] }],
    styles: [buildStyle("color")],
  });

describe("decorations slice repair on load", () => {
  it.each([
    ["an unknown condition type", { type: "moon-phase" }],
    ["a weekday condition naming no weekday", { type: "weekday", weekdays: [9] }],
  ])("a decoration with %s is dropped whole, keeping its sibling", async (_label, bad) => {
    const broken = {
      mode: "and",
      conditions: [{ type: "weekday", weekdays: [1] }, bad],
      styles: [buildStyle("color")],
    };
    const harness = await testContainer({
      modules: [sliceModule],
      data: { decorations: { decorations: [broken, kept()], maxMarksPerSlot: 5 } },
      allow: { dataRepair: true },
    });

    expect(harness.settings.getSlice(decorationsSlice).state).toEqual({ decorations: [kept()], maxMarksPerSlot: 5 });
  });
});
