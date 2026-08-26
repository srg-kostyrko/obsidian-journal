import { describe, expect, it } from "vitest";

import { appearanceVariables } from "./use-appearance-style";

import type { AppearanceSliceState } from "./slice";

describe("appearanceVariables", () => {
  it("maps today and active colors onto their CSS variables", () => {
    const state: AppearanceSliceState = {
      today: { color: { type: "theme", name: "text-accent" }, background: { type: "transparent" } },
      active: { color: { type: "custom", color: "#fff" }, background: { type: "theme", name: "interactive-accent" } },
      selectedBackground: { type: "custom", color: "#123456" },
    };

    expect(appearanceVariables(state)).toEqual({
      "--journal-cell-today-color": "var(--text-accent)",
      "--journal-cell-today-bg": "transparent",
      "--journal-cell-active-color": "#fff",
      "--journal-cell-active-bg": "var(--interactive-accent)",
      "--journal-cell-selected-bg": "#123456",
    });
  });
});
