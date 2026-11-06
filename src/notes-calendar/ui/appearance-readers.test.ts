import { describe, expect, it } from "vitest";

import { appearanceCatalog, type CatalogEntry } from "../appearance/appearance-catalog";
import { calendarStyleRules, NARROW_QUERY, narrowReader, privateName, wideReader, type ScopedRule } from "../testing";

const components = calendarStyleRules();
type Component = keyof typeof components;

const GRID_PARTS = ["heading", "weekday", "week-number", "date", "cell-gap"];
const GRIDS = ["monthView", "weekView", "preview"] as const;
const BANDS = ["weekend", "current-week"];

// Each grid renders its own heading, weekday header, week numbers, dates and gaps, so each has to read
// them — the editor's preview grid included; the highlights and the cell box live in the cell alone.
// A month grid's blank (hidden outside) day is no cell, yet must hold a cell's row height, so the
// month grids read the cell's min height and label padding for it too.
// A band draws its own fill and ring, so it reads them and the cell's corner radius; the cells under it
// read its text and its layer, which decides whether that text paints over a decoration. A weekend
// column's header takes the weekend's text too, so every grid reads that.
function bandRenderers(state: string, value: string): readonly Component[] {
  if (value === "layer") return ["band", "cell"];
  if (!value.startsWith("text-")) return ["band"];
  return state === "weekend" ? ["cell", ...GRIDS] : ["cell"];
}

function renderers(entry: CatalogEntry): readonly Component[] {
  const part = entry.name.replace(/^journal-cell-/, "");
  const band = BANDS.find((state) => part.startsWith(`${state}-`));
  if (band !== undefined) return bandRenderers(band, part.slice(band.length + 1));
  if (part === "cell-min-height" || part === "cell-padding") return ["cell", "monthView", "preview"];
  if (part === "cell-radius") return ["cell", "band"];
  return GRID_PARTS.some((prefix) => part.startsWith(`${prefix}-`) || part === prefix) ? GRIDS : ["cell"];
}

const cases = appearanceCatalog.flatMap((entry) =>
  renderers(entry).map((component) => [entry.name, component, entry] as const),
);

const cellDeclarations = (selector: string): Record<string, string> =>
  Object.fromEntries(
    components.cell.find(
      (rule) => rule.container === null && rule.selector === selector && rule.declarations.has("min-width"),
    )?.declarations ?? [],
  );

describe("calendar appearance readers", () => {
  it("assigns every catalog entry to the components that render it, the weekend's text to every grid's headers", () => {
    expect(appearanceCatalog.filter((entry) => renderers(entry).includes("weekView")).length).toBe(24);
    expect(appearanceCatalog.filter((entry) => renderers(entry).includes("band")).length).toBe(9);
  });

  it.each([
    ["monthView", ".notes-month-view__day--blank"],
    ["preview", ".appearance-preview__day--blank"],
  ] as const)("%s holds a blank day at a cell's row height", (component, selector) => {
    const rule = components[component].find(
      (candidate) => candidate.container === null && candidate.selector === selector,
    );
    expect(rule?.declarations.get("min-height")).toBe(
      "max(var(--_v-cell-min-height), calc(1em + 2 * var(--_v-cell-padding)))",
    );
  });

  // Where nested grid tracks are unsupported the weekday row falls back to `display: contents`, which has no box to clip.
  it.each([
    ["monthView", ".notes-month-view__row--visually-hidden"],
    ["preview", ".appearance-preview__row--visually-hidden"],
  ] as const)("%s gives a hidden weekday row a box over the display-contents fallback", (component, selector) => {
    const rules = components[component];
    const hidden = rules.findIndex((rule) => rule.selector === selector);
    const fallback = rules.findIndex((rule) => rule.declarations.get("display") === "contents");
    expect(rules[hidden]?.declarations.get("display")).toBe("block");
    expect(hidden).toBeGreaterThan(fallback);
  });

  // The weekday header carries both texts and the narrow query swaps which one shows, in the editor's preview too.
  it.each([
    ["monthView", "notes-month-view"],
    ["weekView", "notes-week-view"],
    ["preview", "appearance-preview"],
  ] as const)("%s shows the narrow weekday text only under the narrow query", (component, block) => {
    const display = (container: string | null, element: string): string | undefined =>
      components[component]
        .find((rule) => rule.container === container && rule.selector === `.${block}__weekday-${element}`)
        ?.declarations.get("display");
    expect({
      wide: display(null, "wide"),
      narrow: display(null, "narrow"),
      wideUnderQuery: display(NARROW_QUERY, "wide"),
      narrowUnderQuery: display(NARROW_QUERY, "narrow"),
    }).toEqual({ wide: undefined, narrow: "none", wideUnderQuery: "none", narrowUnderQuery: "inline" });
  });

  // Stock labels keep the content-sized floor every calendar had before label formats, so a short date with marks
  // never clips; the floor goes only under a grid root that renders a custom day label.
  it.each([
    ["monthView", ".notes-month-view__day"],
    ["weekView", ".notes-week-view__day"],
    ["preview", ".appearance-preview__day"],
  ] as const)("%s lets a day shrink below its label only under a custom day label", (component, selector) => {
    const minWidths = components[component]
      .filter((rule) => rule.container === null && rule.declarations.has("min-width"))
      .map((rule) => [rule.selector, rule.declarations.get("min-width")]);
    expect(minWidths).toContainEqual([`[data-custom-day-label] ${selector}`, "0"]);
    expect(minWidths.filter(([found]) => found === selector)).toEqual([]);
  });

  // A grid track of 1fr keeps a content-sized floor, so every box between the day and its text gives that
  // floor up and the text clips; vertical overflow stays visible so descenders under `line-height: 1` survive.
  it("clips a cell's label inside the cell only under a custom day label", () => {
    expect(cellDeclarations("[data-custom-day-label] .notes-calendar-cell__text")).toMatchObject({ "min-width": "0" });
    expect(cellDeclarations("[data-custom-day-label] .notes-calendar-cell .cell-decoration")).toMatchObject({
      "min-width": "0",
    });
    expect(cellDeclarations("[data-custom-day-label] .notes-calendar-cell .cell-decoration__content")).toMatchObject({
      "min-width": "0",
      "overflow-x": "clip",
      "text-overflow": "ellipsis",
      "white-space": "nowrap",
    });
    const unguarded = components.cell.filter(
      (rule) =>
        !rule.selector.includes("[data-custom-day-label]") &&
        rule.selector !== ".notes-calendar-cell__accessible-name" &&
        ["min-width", "overflow-x", "text-overflow", "white-space"].some((property) => rule.declarations.has(property)),
    );
    expect(unguarded.map((rule) => rule.selector)).toEqual([]);
  });

  it.each(cases)(
    "%s is resolved by %s once per selector and re-resolved under the narrow query",
    (_name, component, entry) => {
      const rules: readonly ScopedRule[] = components[component];
      const name = privateName(entry);
      const wide = rules.filter((rule) => rule.container === null && rule.declarations.has(name));
      expect(wide.length).toBeGreaterThan(0);
      for (const rule of wide) {
        expect({ selector: rule.selector, value: rule.declarations.get(name) }).toEqual({
          selector: rule.selector,
          value: wideReader(entry),
        });
        const narrow = rules.find(
          (candidate) => candidate.container === NARROW_QUERY && candidate.selector === rule.selector,
        );
        expect({ selector: rule.selector, narrow: narrow?.declarations.get(name) }).toEqual({
          selector: rule.selector,
          narrow: narrowReader(entry),
        });
      }
    },
  );

  it.each(cases)("%s is read by %s outside the private values", (_name, component, entry) => {
    const read = `var(${privateName(entry)})`;
    const readers = components[component].flatMap((rule) =>
      [...rule.declarations].filter(([property, value]) => !property.startsWith("--_v-") && value.includes(read)),
    );
    expect(readers.length).toBeGreaterThan(0);
  });

  it.each(Object.entries(components))("%s reads no public variable outside its private values", (_name, rules) => {
    const leaks = rules.flatMap((rule) =>
      [...rule.declarations]
        .filter(([property, value]) => !property.startsWith("--_v-") && /--journal-(saved-)?cell-/.test(value))
        .map(([property]) => `${rule.selector} { ${property} }`),
    );
    expect(leaks).toEqual([]);
  });
});

const STATES = ["outside", "today", "selected", "active", "weekend", "current-week"] as const;
const TEXT_VALUES = [
  ["text-color", "text"],
  ["text-weight", "weight"],
  ["text-italic", "italic"],
] as const;
const passThroughCases = STATES.flatMap((state) =>
  TEXT_VALUES.map(([value, slot]) => [state, value, `--_${slot}-${state}`] as const),
);

describe("calendar appearance Unchanged pass-through", () => {
  // The query is answered by the span's parent, the cell, which is where `--_v-*` lives.
  it.each(passThroughCases)("%s %s clears %s on the text span when it reads unchanged", (state, value, slot) => {
    const container = `style(--_v-${state}-${value}: unchanged)`;
    const rules = components.cell.filter((rule) => rule.container === container);
    expect(rules.map((rule) => ({ selector: rule.selector, value: rule.declarations.get(slot) }))).toEqual([
      { selector: `.notes-calendar-cell[data-${state}] > .notes-calendar-cell__text`, value: "initial" },
    ]);
  });
});

const headerCases = GRIDS.flatMap((component) =>
  TEXT_VALUES.map(([value, slot]) => [component, value, `--_weekend-${slot}`] as const),
);
const HEADER_SELECTORS: Readonly<Record<(typeof GRIDS)[number], string>> = {
  monthView: ".notes-month-view__weekday[data-weekend]",
  weekView: ".notes-week-view__weekday[data-weekend]",
  preview: ".appearance-preview__weekday[data-weekend]",
};

describe("calendar appearance weekend column headers", () => {
  // The query is answered by the header's parent, the weekday row, which is where the header's `--_v-*` lives.
  it.each(headerCases)(
    "%s clears the weekend %s (%s) on a weekend header when it reads unchanged",
    (component, value, slot) => {
      const container = `style(--_v-weekend-${value}: unchanged)`;
      const rules = components[component].filter((rule) => rule.container === container);
      expect(rules.map((rule) => ({ selector: rule.selector, value: rule.declarations.get(slot) }))).toEqual([
        { selector: HEADER_SELECTORS[component], value: "initial" },
      ]);
    },
  );

  it.each(GRIDS)("%s puts the weekend's text over the weekday part's own on a weekend header", (component) => {
    const rule = components[component].find(
      (candidate) => candidate.container === null && candidate.selector === HEADER_SELECTORS[component],
    );
    expect({
      color: rule?.declarations.get("color"),
      weight: rule?.declarations.get("font-weight"),
      italic: rule?.declarations.get("font-style"),
    }).toEqual({
      color: "var(--_weekend-text, var(--_v-weekday-color))",
      weight: "var(--_weekend-weight, var(--_v-weekday-weight))",
      italic: "var(--_weekend-italic, var(--_v-weekday-italic))",
    });
  });
});
