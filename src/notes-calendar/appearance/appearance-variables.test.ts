import { cloneFnJSON } from "@vueuse/core";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { testContainer, type TestHarness } from "@/testing";

import { appearanceCatalog, savedName, type CatalogEntry } from "./appearance-catalog";
import {
  AppearanceVariables,
  appearanceVariables,
  mergedPart,
  writtenEntryNames,
  writtenValue,
} from "./appearance-variables";
import { calendarAppearanceCoreModule } from "./module";
import { appearanceSlice, STOCK_NARROW, UNCHANGED, type AppearanceSliceState, type HighlightValues } from "./slice";
import { calendarAppearanceStartupModule } from "./startup-module";

type HighlightText = HighlightValues["text"];

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

  it("a wide date size does not reach narrow while narrow keeps its stock", () => {
    const state = fresh();
    state.wide.date.size = "1.4em";

    expect(appearanceVariables(state)).toEqual({ [saved("journal-cell-date-size")]: "1.4em" });
  });

  it("the stock row height writes nothing", () => {
    const state = fresh();
    state.wide.cell.minHeight = null;

    expect(appearanceVariables(state)).toEqual({});
  });

  it("a set row height writes its pixels", () => {
    const state = fresh();
    state.wide.cell.minHeight = 26;

    expect(appearanceVariables(state)).toEqual({ [saved("journal-cell-cell-min-height")]: "26px" });
  });

  it("the narrow part takes the stock narrow values under its overrides and over the wide ones", () => {
    const state = fresh();
    state.wide.cell.gap = "3px";
    state.wide.cell.padding = 2;
    state.narrow.cell.minHeight = 30;

    expect(mergedPart(state, "cell")).toEqual({ padding: 2, radius: "var(--radius-s)", gap: "1px", minHeight: 30 });
  });

  it("the narrow date takes the wide size, having no stock of its own", () => {
    const state = fresh();
    state.wide.date.size = "1.4em";

    expect(mergedPart(state, "date").size).toBe("1.4em");
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

    const bare = appearanceCatalog.map(({ stockNarrow: _stockNarrow, ...entry }) => entry);

    expect(appearanceVariables(state, {}, bare)).toEqual({
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

  it("a narrow ring for Selected writes its ring and a zero strength", () => {
    const state = fresh();
    state.narrow.selected.style = "ring";

    expect(appearanceVariables(state)).toEqual({
      [saved("journal-cell-selected-ring-width", true)]: "2px",
      [saved("journal-cell-selected-strength", true)]: "0",
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
    state.wide.cell = { padding: 4, radius: "50%", gap: "2px", minHeight: null };

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

const STYLES = ["ring", "background", "text", "none"] as const;
const WIDE_WEIGHTS: readonly HighlightText["weight"][] = [UNCHANGED, "bold"];
const NARROW_WEIGHTS: readonly (HighlightText["weight"] | null)[] = [null, UNCHANGED, "normal"];
const WIDE_COLORS: readonly HighlightText["color"][] = [UNCHANGED, { type: "custom", color: "#123456" }];

function* selectedStates(): Generator<AppearanceSliceState> {
  for (const wideStyle of STYLES)
    for (const narrowStyle of [null, ...STYLES])
      for (const wideWeight of WIDE_WEIGHTS)
        for (const narrowWeight of NARROW_WEIGHTS)
          for (const wideColor of WIDE_COLORS) {
            const state = fresh();
            state.wide.selected = { ...state.wide.selected, style: wideStyle };
            state.wide.selected.text = { ...state.wide.selected.text, weight: wideWeight, color: wideColor };
            state.narrow.selected.style = narrowStyle;
            state.narrow.selected.text.weight = narrowWeight;
            yield state;
          }
}

function* dateAndCellStates(): Generator<AppearanceSliceState> {
  for (const wideSize of ["inherit", "1.4em", "1em"])
    for (const narrowSize of [null, "1em", "2em"])
      for (const wideGap of ["var(--size-2-1)", "3px", "1px"])
        for (const narrowGap of [null, "1px", "4px"])
          for (const wideHeight of [null, 26, 40])
            for (const narrowHeight of [null, 26, 30]) {
              const state = fresh();
              state.wide.date.size = wideSize;
              state.narrow.date.size = narrowSize;
              state.wide.cell.gap = wideGap;
              state.narrow.cell.gap = narrowGap;
              state.wide.cell.minHeight = wideHeight;
              state.narrow.cell.minHeight = narrowHeight;
              yield state;
            }
}

// Pass and an empty stock both leave the property to what it inherits.
const settled = (css: string): string => (css === UNCHANGED ? "" : css);

function rendered(variables: Record<string, string>, entry: CatalogEntry, narrow: boolean): string {
  const wide = variables[savedName(entry)] ?? entry.stock;
  if (!narrow) return settled(wide);
  return settled(variables[savedName(entry, true)] ?? entry.stockNarrow ?? wide);
}

describe("what the readers resolve", () => {
  const states = [fresh(), ...selectedStates(), ...dateAndCellStates()];

  it.each([
    ["wide", false],
    ["narrow", true],
  ] as const)("at %s is what the model says, for every state", (_width, narrow) => {
    const mismatches: unknown[] = [];
    for (const state of states) {
      const variables = appearanceVariables(state, STOCK_NARROW, appearanceCatalog);
      for (const entry of appearanceCatalog) {
        const value = writtenValue(entry.name);
        const css = narrow ? value?.narrowCss(state, STOCK_NARROW) : value?.wideCss(state);
        const expected = settled(css ?? entry.stock);
        const actual = rendered(variables, entry, narrow);
        if (actual !== expected)
          mismatches.push({
            entry: entry.name,
            expected,
            actual,
            wide: state.wide.selected,
            narrow: state.narrow.selected,
          });
      }
    }
    expect(mismatches.slice(0, 3)).toEqual([]);
  });

  it("writes nothing for defaults under the stock either", () => {
    expect(appearanceVariables(fresh(), STOCK_NARROW, appearanceCatalog)).toEqual({});
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
