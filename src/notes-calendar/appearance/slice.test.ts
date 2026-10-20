import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";
import { testContainer } from "@/testing";

import { appearanceSlice, appearanceSliceSchema } from "./slice";

describe("appearanceSlice", () => {
  it("defaults today to accent text on a transparent background", () => {
    expect(appearanceSlice.defaults).toEqual({
      today: { color: { type: "theme", name: "text-accent" }, background: { type: "transparent" } },
      active: {
        color: { type: "theme", name: "text-on-accent" },
        background: { type: "theme", name: "interactive-accent" },
      },
      selectedRing: { type: "theme", name: "interactive-accent" },
    });
  });

  it("accepts a custom hex color for a highlight", () => {
    const parsed = v.parse(appearanceSliceSchema, {
      today: { color: { type: "custom", color: "#ff0000" }, background: { type: "transparent" } },
      active: { color: { type: "transparent" }, background: { type: "transparent" } },
      selectedRing: { type: "custom", color: "#00ff00" },
    });
    expect(parsed.today.color).toEqual({ type: "custom", color: "#ff0000" });
    expect(parsed.selectedRing).toEqual({ type: "custom", color: "#00ff00" });
  });
});

const sliceModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(appearanceSlice);
  },
};

describe("appearance slice repair on load", () => {
  it("an unreadable highlight color resets only that color", async () => {
    const stored = {
      today: { color: { type: "custom", color: "#ff0000" }, background: { type: "custom", color: "#00ff00" } },
      active: { color: { type: "custom", color: 5 }, background: { type: "custom", color: "#0000ff" } },
      selectedRing: { type: "custom", color: "#123456" },
    };
    const harness = await testContainer({
      modules: [sliceModule],
      data: { appearance: stored },
      allow: { dataRepair: true },
    });

    expect(harness.settings.getSlice(appearanceSlice).state).toEqual({
      ...stored,
      active: { color: appearanceSlice.defaults.active.color, background: { type: "custom", color: "#0000ff" } },
    });
  });
});
