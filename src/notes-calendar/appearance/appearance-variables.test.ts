import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { testContainer, type TestHarness } from "@/testing";

import { AppearanceVariables, appearanceVariables } from "./appearance-variables";
import { calendarAppearanceCoreModule } from "./module";
import { appearanceSlice } from "./slice";

import type { AppearanceSliceState } from "./slice";

describe("appearanceVariables", () => {
  it("maps today and active colors onto their CSS variables", () => {
    const state: AppearanceSliceState = {
      today: { color: { type: "theme", name: "text-accent" }, background: { type: "transparent" } },
      active: { color: { type: "custom", color: "#fff" }, background: { type: "theme", name: "interactive-accent" } },
      selectedRing: { type: "theme", name: "interactive-accent" },
    };

    expect(appearanceVariables(state)).toEqual({
      "--journal-cell-today-color": "var(--text-accent)",
      "--journal-cell-today-bg": "transparent",
      "--journal-cell-active-color": "#fff",
      "--journal-cell-active-bg": "var(--interactive-accent)",
      "--journal-cell-selected-ring": "var(--interactive-accent)",
    });
  });
});

const rootStyle = (harness: TestHarness) => harness.host.windowFor("main").document.documentElement.style;

describe("AppearanceVariables", () => {
  it("sets the appearance variables on the main window root", async () => {
    const harness = await testContainer({ modules: [calendarAppearanceCoreModule] });
    const expected = appearanceVariables(harness.settings.getSlice(appearanceSlice).state);

    for (const [key, value] of Object.entries(expected)) {
      expect(rootStyle(harness).getPropertyValue(key)).toBe(value);
    }
    expect(harness.resolve(AppearanceVariables)).toBeInstanceOf(AppearanceVariables);
  });

  it("updates the variables when the slice changes", async () => {
    const harness = await testContainer({ modules: [calendarAppearanceCoreModule] });
    const slice = harness.settings.getSlice(appearanceSlice);

    slice.state = { ...slice.state, selectedRing: { type: "custom", color: "#00ff00" } };
    await nextTick();

    expect(rootStyle(harness).getPropertyValue("--journal-cell-selected-ring")).toBe("#00ff00");
  });
});
