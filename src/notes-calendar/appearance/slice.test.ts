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
    });
  });

  it("accepts a custom hex color for a highlight", () => {
    const parsed = v.parse(appearanceSliceSchema, {
      today: { color: { type: "custom", color: "#ff0000" }, background: { type: "transparent" } },
      active: { color: { type: "transparent" }, background: { type: "transparent" } },
    });
    expect(parsed.today.color).toEqual({ type: "custom", color: "#ff0000" });
  });
});
