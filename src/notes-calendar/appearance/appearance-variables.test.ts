import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { testContainer, type TestHarness } from "@/testing";

import { AppearanceVariables, appearanceVariables } from "./appearance-variables";
import { calendarAppearanceCoreModule } from "./module";
import { appearanceSlice } from "./slice";

import type { AppearanceSliceState } from "./slice";

describe("appearanceVariables", () => {
  it("leaves out every stock color", () => {
    expect(appearanceVariables(structuredClone(appearanceSlice.defaults))).toEqual({});
  });

  it("maps a custom color onto its CSS variable and nothing else", () => {
    const state = structuredClone(appearanceSlice.defaults);
    state.selectedRing = { type: "custom", color: "#00ff00" };

    expect(appearanceVariables(state)).toEqual({ "--journal-saved-cell-selected-ring": "#00ff00" });
  });

  it("maps every non-stock color", () => {
    const state: AppearanceSliceState = {
      today: { color: { type: "theme", name: "text-normal" }, background: { type: "custom", color: "#111" } },
      active: { color: { type: "custom", color: "#fff" }, background: { type: "transparent" } },
      selectedRing: { type: "theme", name: "text-accent" },
    };

    expect(appearanceVariables(state)).toEqual({
      "--journal-saved-cell-today-color": "var(--text-normal)",
      "--journal-saved-cell-today-bg": "#111",
      "--journal-saved-cell-active-color": "#fff",
      "--journal-saved-cell-active-bg": "transparent",
      "--journal-saved-cell-selected-ring": "var(--text-accent)",
    });
  });
});

const rootStyle = (harness: TestHarness) => harness.host.windowFor("main").document.body.style;

describe("AppearanceVariables", () => {
  it("sets the appearance variables on the main window body", async () => {
    const harness = await testContainer({ modules: [calendarAppearanceCoreModule] });
    const slice = harness.settings.getSlice(appearanceSlice);
    slice.state = { ...slice.state, today: { ...slice.state.today, color: { type: "custom", color: "#123456" } } };
    await nextTick();
    const expected = appearanceVariables(slice.state);
    expect(expected).not.toEqual({});

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

    expect(rootStyle(harness).getPropertyValue("--journal-saved-cell-selected-ring")).toBe("#00ff00");
  });

  it("removes a variable from the body when its color returns to the stock one", async () => {
    const harness = await testContainer({ modules: [calendarAppearanceCoreModule] });
    const slice = harness.settings.getSlice(appearanceSlice);

    slice.state = { ...slice.state, selectedRing: { type: "custom", color: "#00ff00" } };
    await nextTick();
    slice.state = { ...slice.state, selectedRing: { ...appearanceSlice.defaults.selectedRing } };
    await nextTick();

    expect(rootStyle(harness).getPropertyValue("--journal-saved-cell-selected-ring")).toBe("");
  });

  it("removes its variables and stops watching on dispose", async () => {
    const harness = await testContainer({ modules: [calendarAppearanceCoreModule] });
    const slice = harness.settings.getSlice(appearanceSlice);
    slice.state = { ...slice.state, selectedRing: { type: "custom", color: "#00ff00" } };
    await nextTick();

    harness.resolve(AppearanceVariables)[Symbol.dispose]();
    slice.state = { ...slice.state, selectedRing: { type: "custom", color: "#ff0000" } };
    await nextTick();

    expect(rootStyle(harness).getPropertyValue("--journal-saved-cell-selected-ring")).toBe("");
  });
});
