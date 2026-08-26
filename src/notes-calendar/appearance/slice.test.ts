import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { appearanceSlice, appearanceSliceSchema } from "./slice";

describe("appearanceSlice", () => {
  it("defaults today to accent text on a transparent background", () => {
    expect(appearanceSlice.defaults).toEqual({
      today: { color: { type: "theme", name: "text-accent" }, background: { type: "transparent" } },
      active: {
        color: { type: "theme", name: "text-on-accent" },
        background: { type: "theme", name: "interactive-accent" },
      },
      selectedBackground: { type: "theme", name: "background-modifier-hover" },
    });
  });

  it("accepts a custom hex color for a highlight", () => {
    const parsed = v.parse(appearanceSliceSchema, {
      today: { color: { type: "custom", color: "#ff0000" }, background: { type: "transparent" } },
      active: { color: { type: "transparent" }, background: { type: "transparent" } },
      selectedBackground: { type: "custom", color: "#00ff00" },
    });
    expect(parsed.today.color).toEqual({ type: "custom", color: "#ff0000" });
  });

  it("fills the selected-date background when older settings omit it", () => {
    const parsed = v.parse(appearanceSliceSchema, {
      today: { color: { type: "transparent" }, background: { type: "transparent" } },
      active: { color: { type: "transparent" }, background: { type: "transparent" } },
    });
    expect(parsed.selectedBackground).toEqual({ type: "theme", name: "background-modifier-hover" });
  });
});
