import { cloneFnJSON } from "@vueuse/core";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { testContainer, type TestHarness } from "@/testing";

import { appearanceCatalog, savedName } from "./appearance-catalog";
import { AppearanceVariables, appearanceVariables, writtenEntryNames } from "./appearance-variables";
import { calendarAppearanceCoreModule } from "./module";
import { appearanceSlice } from "./slice";
import { calendarAppearanceStartupModule } from "./startup-module";

const fresh = () => structuredClone(appearanceSlice.defaults);

function saved(name: string, narrow = false): string {
  const entry = appearanceCatalog.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`no catalog entry ${name}`);
  return savedName(entry, narrow);
}

describe("appearanceVariables", () => {
  it("writes nothing for defaults", () => {
    expect(appearanceVariables(fresh())).toEqual({});
  });

  it("writes every catalog entry from some part value", () => {
    expect([...writtenEntryNames()].toSorted()).toEqual(appearanceCatalog.map((entry) => entry.name).toSorted());
  });

  it("writes the weekend's strength for a background weekend", () => {
    const state = fresh();
    state.wide.weekend.style = "background";

    expect(appearanceVariables(state)).toEqual({ [saved("journal-cell-weekend-strength")]: "1" });
  });

  it("writes an over current week's layer", () => {
    const state = fresh();
    state.wide.currentWeek.over = true;

    expect(appearanceVariables(state)).toEqual({ [saved("journal-cell-current-week-layer")]: "1" });
  });

  it("writes all seven values of both bands, and the current week's three week-number values", () => {
    const bands = [...writtenEntryNames()].filter((name) => /^journal-cell-(weekend|current-week)-/.test(name));
    expect(bands.length).toBe(17);
  });

  it("writes nothing for the stock current week", () => {
    const written = Object.keys(appearanceVariables(fresh()));
    expect(written.filter((name) => name.startsWith("--journal-saved-cell-current-week-"))).toEqual([]);
  });

  it("a None current week passes the week number's text through", () => {
    const state = fresh();
    state.wide.currentWeek.style = "none";

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-current-week-week-number-text-color")]: "unchanged",
      [saved("journal-cell-current-week-week-number-text-weight")]: "unchanged",
    });
  });

  it("writes the week number's text apart from the days' text", () => {
    const state = fresh();
    state.wide.currentWeek.text.color = { type: "custom", color: "#123456" };
    state.wide.currentWeek.weekNumberText.italic = true;

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-current-week-text-color")]: "#123456",
      [saved("journal-cell-current-week-week-number-text-italic")]: "italic",
    });
  });

  it("a narrow week-number color writes its narrow pair only", () => {
    const state = fresh();
    state.narrow.currentWeek.weekNumberText.color = { type: "custom", color: "#abcdef" };

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-current-week-week-number-text-color", true)]: "#abcdef",
    });
  });

  it("a narrow None current week passes the week number's stock text through at narrow", () => {
    const state = fresh();
    state.narrow.currentWeek.style = "none";

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-current-week-week-number-text-color", true)]: "unchanged",
      [saved("journal-cell-current-week-week-number-text-weight", true)]: "unchanged",
      [saved("journal-cell-current-week-ring-width", true)]: "0px",
      [saved("journal-cell-current-week-strength", true)]: "0",
    });
  });

  it("the stock divider and week number write nothing", () => {
    const written = Object.keys(appearanceVariables(fresh()));
    expect(written.filter((name) => name.startsWith("--journal-saved-cell-week-number-"))).toEqual([]);
  });

  it("a hidden divider writes a zero width", () => {
    const state = fresh();
    state.wide.weekNumber.divider = false;

    expect(appearanceVariables(state)).toEqual({ "--journal-saved-cell-week-number-divider-width": "0px" });
  });

  it("writes the divider's color and width", () => {
    const state = fresh();
    state.wide.weekNumber.dividerColor = { type: "custom", color: "#123456" };
    state.wide.weekNumber.dividerWidth = 3;

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-week-number-divider-color")]: "#123456",
      [saved("journal-cell-week-number-divider-width")]: "3px",
    });
  });

  it("a divider hidden at narrow width writes a narrow zero width only", () => {
    const state = fresh();
    state.narrow.weekNumber.divider = false;

    expect(appearanceVariables(state)).toEqual({ [saved("journal-cell-week-number-divider-width", true)]: "0px" });
  });

  it("writes the narrow name for a narrow override", () => {
    const state = fresh();
    state.narrow.cell.minHeight = 30;

    expect(appearanceVariables(state)).toEqual({ [saved("journal-cell-cell-min-height", true)]: "30px" });
  });

  it("writes a narrow override even when it equals the stock value", () => {
    const state = fresh();
    state.wide.cell.minHeight = 40;
    state.narrow.cell.minHeight = 26;

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-cell-min-height")]: "40px",
      [saved("journal-cell-cell-min-height", true)]: "26px",
    });
  });

  it("a ring style writes the ring width and zero strength", () => {
    const state = fresh();
    state.wide.active.style = "ring";
    state.wide.active.ringWidth = 3;

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-active-ring-width")]: "3px",
      [saved("journal-cell-active-strength")]: "0",
    });
  });

  it("a background style writes its strength and zero ring", () => {
    const state = fresh();
    state.wide.selected.style = "background";
    state.wide.selected.strength = 40;

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-selected-ring-width")]: "0px",
      [saved("journal-cell-selected-strength")]: "0.4",
    });
  });

  it("clamps a strength outside the schema range", () => {
    const state = fresh();
    state.wide.today.style = "background";
    state.wide.today.strength = 250;

    expect(appearanceVariables(state)[saved("journal-cell-today-strength")]).toBe("1");
  });

  it("a none style writes zero ring, zero strength, and no text values over an empty stock", () => {
    const state = fresh();
    state.wide.selected.style = "none";
    state.wide.selected.text = { color: { type: "custom", color: "#123456" }, weight: "bold", italic: true };

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-selected-ring-width")]: "0px",
    });
  });

  it("a none style passes a stock text color through", () => {
    const state = fresh();
    state.wide.today.style = "none";

    expect(appearanceVariables(state)).toEqual({ [saved("journal-cell-today-text-color")]: "unchanged" });
  });

  it("Unchanged today text writes a pass, never currentColor", () => {
    const state = fresh();
    state.wide.today.text.color = "unchanged";
    state.wide.today.text.weight = "semibold";
    state.wide.today.text.italic = false;

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-today-text-color")]: "unchanged",
      [saved("journal-cell-today-text-weight")]: "var(--font-semibold)",
      [saved("journal-cell-today-text-italic")]: "normal",
    });
  });

  it("Unchanged selected text writes nothing", () => {
    const state = fresh();
    state.wide.selected.text = { color: "unchanged", weight: "unchanged", italic: "unchanged" };

    expect(appearanceVariables(state)).toEqual({});
  });

  it("a narrow none passes every wide text value it can", () => {
    const state = fresh();
    state.wide.selected.text = { color: { type: "custom", color: "#ff0000" }, weight: "bold", italic: true };
    state.narrow.selected.style = "none";

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-selected-text-color")]: "#ff0000",
      [saved("journal-cell-selected-text-weight")]: "var(--font-bold)",
      [saved("journal-cell-selected-text-italic")]: "italic",
      [saved("journal-cell-selected-ring-width", true)]: "0px",
      [saved("journal-cell-selected-strength", true)]: "0",
      [saved("journal-cell-selected-text-color", true)]: "unchanged",
      [saved("journal-cell-selected-text-weight", true)]: "unchanged",
      [saved("journal-cell-selected-text-italic", true)]: "unchanged",
    });
  });

  it("narrow none over a saved wide weight writes a narrow weight pass", () => {
    const state = fresh();
    state.wide.today.text.weight = "bold";
    state.narrow.today.style = "none";

    expect(appearanceVariables(state)[saved("journal-cell-today-text-weight", true)]).toBe("unchanged");
  });

  it("narrow none over a stock-only weight writes nothing", () => {
    const state = fresh();
    state.wide.today.text.weight = "unchanged";
    state.narrow.today.style = "none";

    expect(appearanceVariables(state)[saved("journal-cell-today-text-weight", true)]).toBeUndefined();
  });

  it("writes no currentColor or normal-as-pass anywhere", () => {
    const state = fresh();
    state.wide.today.text.color = "unchanged";
    state.narrow.outside.style = "none";

    expect(Object.values(appearanceVariables(state))).not.toContain("currentColor");
  });

  it("a narrow none passes a stock text color through", () => {
    const state = fresh();
    state.narrow.outside.style = "none";

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-outside-text-color", true)]: "unchanged",
      [saved("journal-cell-outside-ring-width", true)]: "0px",
      [saved("journal-cell-outside-strength", true)]: "0",
    });
  });

  it("maps colors, layers, text and box values to CSS", () => {
    const state = fresh();
    state.wide.today = {
      ...state.wide.today,
      style: "background",
      color: { type: "custom", color: "#111111" },
      strength: 60,
      over: true,
    };
    state.wide.heading = {
      size: "1.2em",
      weight: "bold",
      italic: true,
      color: { type: "theme", name: "text-normal" },
      case: "upper",
    };
    state.wide.cell = { padding: 4, radius: "50%", gap: "2px", minHeight: 26 };

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-today-color")]: "#111111",
      [saved("journal-cell-today-strength")]: "0.6",
      [saved("journal-cell-today-layer")]: "1",
      [saved("journal-cell-heading-size")]: "1.2em",
      [saved("journal-cell-heading-weight")]: "var(--font-bold)",
      [saved("journal-cell-heading-italic")]: "italic",
      [saved("journal-cell-heading-color")]: "var(--text-normal)",
      [saved("journal-cell-heading-case")]: "uppercase",
      [saved("journal-cell-cell-padding")]: "4px",
      [saved("journal-cell-cell-radius")]: "50%",
      [saved("journal-cell-cell-gap")]: "2px",
    });
  });

  it("a narrow style resolves the narrow ring width and strength against the wide values", () => {
    const state = fresh();
    state.wide.today.ringWidth = 4;
    state.narrow.today.style = "ring";

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-today-ring-width", true)]: "4px",
      [saved("journal-cell-today-strength", true)]: "0",
      [saved("journal-cell-today-text-color", true)]: "var(--text-accent)",
    });
  });

  it("a narrow text leaf overrides that leaf alone", () => {
    const state = fresh();
    state.narrow.outside.text.italic = true;

    expect(appearanceVariables(state)).toEqual({ [saved("journal-cell-outside-text-italic", true)]: "italic" });
  });
});

const rootStyle = (harness: TestHarness) => harness.host.windowFor("main").document.body.style;
const selectedColor = saved("journal-cell-selected-color");

function withSelected(
  harness: TestHarness,
  color: { type: "custom"; color: string } | { type: "theme"; name: string },
) {
  const slice = harness.settings.getSlice(appearanceSlice);
  const next = cloneFnJSON(slice.state);
  next.wide.selected.color = color;
  slice.state = next;
}

describe("AppearanceVariables", () => {
  it("sets the appearance variables on the main window body", async () => {
    const harness = await testContainer({ modules: [calendarAppearanceCoreModule, calendarAppearanceStartupModule] });
    const slice = harness.settings.getSlice(appearanceSlice);
    const next = cloneFnJSON(slice.state);
    next.wide.today.text.color = { type: "custom", color: "#123456" };
    slice.state = next;
    await nextTick();
    const expected = appearanceVariables(slice.state);
    expect(expected).not.toEqual({});

    for (const [key, value] of Object.entries(expected)) {
      expect(rootStyle(harness).getPropertyValue(key)).toBe(value);
    }
    expect(harness.resolve(AppearanceVariables)).toBeInstanceOf(AppearanceVariables);
  });

  it("updates the variables when the slice changes", async () => {
    const harness = await testContainer({ modules: [calendarAppearanceCoreModule, calendarAppearanceStartupModule] });

    withSelected(harness, { type: "custom", color: "#00ff00" });
    await nextTick();

    expect(rootStyle(harness).getPropertyValue(selectedColor)).toBe("#00ff00");
  });

  it("removes a variable from the body when its color returns to the stock one", async () => {
    const harness = await testContainer({ modules: [calendarAppearanceCoreModule, calendarAppearanceStartupModule] });

    withSelected(harness, { type: "custom", color: "#00ff00" });
    await nextTick();
    withSelected(harness, { type: "theme", name: "interactive-accent" });
    await nextTick();

    expect(rootStyle(harness).getPropertyValue(selectedColor)).toBe("");
  });

  it("removes its variables and stops watching on dispose", async () => {
    const harness = await testContainer({ modules: [calendarAppearanceCoreModule, calendarAppearanceStartupModule] });
    withSelected(harness, { type: "custom", color: "#00ff00" });
    await nextTick();

    harness.resolve(AppearanceVariables)[Symbol.dispose]();
    withSelected(harness, { type: "custom", color: "#ff0000" });
    await nextTick();

    expect(rootStyle(harness).getPropertyValue(selectedColor)).toBe("");
  });
});
