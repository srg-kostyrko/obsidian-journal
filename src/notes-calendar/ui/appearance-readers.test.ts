import { describe, expect, it } from "vitest";

import blockSource from "@/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue?raw";

import { appearanceCatalog, type CatalogEntry } from "../appearance/appearance-catalog";
import { ROW_FLOOR_PX } from "../appearance/slice";
import {
  calendarStyleRules,
  NARROW_QUERY,
  scopedStyleRules,
  narrowReader,
  privateName,
  wideReader,
  type ScopedRule,
} from "../testing";

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
// column's header takes the weekend's text too, so every grid reads that. The week numbers' divider is
// drawn by its own component, across the rows, so it alone reads the divider's color; every grid reads its
// width too, which sizes the track the divider sits in.
function bandRenderers(state: string, value: string): readonly Component[] {
  if (value === "layer") return ["band", "cell"];
  if (value.startsWith("week-number-text-")) return ["cell"];
  if (!value.startsWith("text-")) return ["band"];
  return state === "weekend" ? ["cell", ...GRIDS] : ["cell"];
}

function renderers(entry: CatalogEntry): readonly Component[] {
  const part = entry.name.replace(/^journal-cell-/, "");
  const band = BANDS.find((state) => part.startsWith(`${state}-`));
  if (band !== undefined) return bandRenderers(band, part.slice(band.length + 1));
  if (part === "cell-padding") return ["cell", "intervalRow", "monthView", "preview"];
  if (part === "cell-min-height") return ["cell", "monthView", "preview"];
  if (part === "cell-radius") return ["cell", "intervalRow", "band"];
  if (/^(today|selected|active)-/.test(part) && !part.endsWith("-narrow")) return ["cell", "intervalRow"];
  if (part === "week-number-divider-width") return ["divider", ...GRIDS];
  if (part.startsWith("week-number-divider-")) return ["divider"];
  return GRID_PARTS.some((prefix) => part.startsWith(`${prefix}-`) || part === prefix) ? GRIDS : ["cell"];
}

// A heading cell holds one line of text, so its row keeps the flat floor where a wide day row grows.
const HEADING_CELLS: Readonly<Record<(typeof GRIDS)[number], string>> = {
  monthView: ".notes-month-view__header .notes-calendar-cell",
  weekView: ".notes-week-view__header .notes-calendar-cell",
  preview: ".appearance-preview__header .notes-calendar-cell",
};
const headingCellSelectors: readonly string[] = Object.values(HEADING_CELLS);

const cases = appearanceCatalog.flatMap((entry) =>
  renderers(entry).map((component) => [entry.name, component, entry] as const),
);

const cellDeclarations = (selector: string): Record<string, string> =>
  Object.fromEntries(
    components.cell.find(
      (rule) => rule.container === null && rule.selector === selector && rule.declarations.has("min-width"),
    )?.declarations ?? [],
  );

// The row resolves its text values for the label to read; nothing reads them yet.
const unreadByRow = (name: string, component: Component): boolean =>
  component === "intervalRow" && /^journal-cell-(today|selected|active)-text-/.test(name);

describe("calendar appearance readers", () => {
  it("assigns every catalog entry to the components that render it, the weekend's text to every grid's headers", () => {
    expect(appearanceCatalog.filter((entry) => renderers(entry).includes("weekView")).length).toBe(25);
    expect(appearanceCatalog.filter((entry) => renderers(entry).includes("band")).length).toBe(9);
    expect(appearanceCatalog.filter((entry) => renderers(entry).includes("divider")).length).toBe(2);
    expect(appearanceCatalog.filter((entry) => renderers(entry).includes("intervalRow")).length).toBe(23);
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
      const wide = rules.filter(
        (rule) =>
          rule.container === null &&
          rule.supports === null &&
          rule.declarations.has(name) &&
          !headingCellSelectors.includes(rule.selector),
      );
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

  it.each(GRIDS)("%s keeps its heading cells at the flat row floor at every width", (component) => {
    const entry = appearanceCatalog.find((candidate) => candidate.name === "journal-cell-cell-min-height");
    if (entry === undefined) throw new Error("no row-height entry in the catalog");
    const declared = (container: string | null): string | undefined =>
      components[component]
        .find((rule) => rule.container === container && rule.selector === HEADING_CELLS[component])
        ?.declarations.get(privateName(entry));
    expect({ wide: declared(null), narrow: declared(NARROW_QUERY) }).toEqual({
      wide: wideReader({ ...entry, stock: `${ROW_FLOOR_PX}px` }),
      narrow: narrowReader(entry),
    });
  });

  // The growing stock is sized in cqi; where the unit is unknown the min-height it reaches is invalid and the
  // row loses its floor, so each reader of it falls back to the flat one.
  it.each([
    ["cell", ".notes-calendar-cell"],
    ["monthView", ".notes-month-view__day--blank"],
    ["preview", ".appearance-preview__day--blank"],
  ] as const)("%s falls back to the flat row floor where cqi is unsupported", (component, selector) => {
    const entry = appearanceCatalog.find((candidate) => candidate.name === "journal-cell-cell-min-height");
    if (entry === undefined) throw new Error("no row-height entry in the catalog");
    const fallback = components[component].find(
      (rule) => rule.supports === "not (width: 1cqi)" && rule.selector === selector,
    );
    expect(fallback?.declarations.get(privateName(entry))).toBe(wideReader({ ...entry, stock: `${ROW_FLOOR_PX}px` }));
  });

  it.each(cases.filter(([name, component]) => !unreadByRow(name, component)))(
    "%s is read by %s outside the private values",
    (_name, component, entry) => {
      const read = `var(${privateName(entry)})`;
      const readers = components[component].flatMap((rule) =>
        [...rule.declarations].filter(([property, value]) => !property.startsWith("--_v-") && value.includes(read)),
      );
      expect(readers.length).toBeGreaterThan(0);
    },
  );

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
// The current week's week number reads its own text group, so the days' pass-through must not reach it.
const passThroughCell = (state: string): string =>
  state === "current-week"
    ? '.notes-calendar-cell[data-current-week]:not([data-kind="week"])'
    : `.notes-calendar-cell[data-${state}]`;
const passThroughCases = [
  ...STATES.flatMap((state) =>
    TEXT_VALUES.map(([value, slot]) => [`${state}-${value}`, `--_${slot}-${state}`, passThroughCell(state)] as const),
  ),
  ...TEXT_VALUES.map(
    ([value, slot]) =>
      [
        `current-week-week-number-${value}`,
        `--_${slot}-current-week`,
        '.notes-calendar-cell[data-current-week][data-kind="week"]',
      ] as const,
  ),
];

describe("calendar appearance Unchanged pass-through", () => {
  // The query is answered by the span's parent, the cell, which is where `--_v-*` lives.
  it.each(passThroughCases)("%s clears %s on the text span when it reads unchanged", (value, slot, cell) => {
    const container = `style(--_v-${value}: unchanged)`;
    const rules = components.cell.filter((rule) => rule.container === container);
    expect(rules.map((rule) => ({ selector: rule.selector, value: rule.declarations.get(slot) }))).toEqual([
      { selector: `${cell} > .notes-calendar-cell__text`, value: "initial" },
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

const ROW = ".journal-view-custom-intervals__entry";
const rowRule = (selector: string) =>
  components.intervalRow.find((rule) => rule.container === null && rule.selector === selector);

describe("custom-interval row paint", () => {
  it("intervalRow is isolated and rounds its layers", () => {
    const declarations = rowRule(ROW)?.declarations;
    expect({
      isolation: declarations?.get("isolation"),
      position: declarations?.get("position"),
      radius: declarations?.get("border-radius"),
    }).toEqual({ isolation: "isolate", position: "relative", radius: "var(--_v-cell-radius)" });
  });

  it.each(["today", "selected", "active"])("intervalRow layers read the %s values", (state) => {
    const declarations = rowRule(`.journal-interval-row__layer[data-layer^="${state}-"]`)?.declarations;
    expect({
      color: declarations?.get("--_color"),
      strength: declarations?.get("--_strength"),
      ring: declarations?.get("--_ring-width"),
      layer: declarations?.get("z-index"),
    }).toEqual({
      color: `var(--_v-${state}-color)`,
      strength: `var(--_v-${state}-strength)`,
      ring: `var(--_v-${state}-ring-width)`,
      layer: `var(--_v-${state}-layer)`,
    });
  });

  it("intervalRow paints fills as an opacity and rings as an inset shadow", () => {
    expect(rowRule('.journal-interval-row__layer[data-layer$="-fill"]')?.declarations).toEqual(
      new Map([
        ["background-color", "var(--_color)"],
        ["opacity", "var(--_strength)"],
      ]),
    );
    expect(rowRule('.journal-interval-row__layer[data-layer$="-ring"]')?.declarations.get("box-shadow")).toBe(
      "inset 0 0 0 var(--_ring-width) var(--_color)",
    );
  });

  it("intervalRow pads its label", () => {
    expect(rowRule(`${ROW} .nav-block`)?.declarations.get("padding")).toBe("var(--_v-cell-padding)");
  });

  it("intervalRow lifts a row holding a popover, and the block lifts itself", () => {
    const lifted = [...components.intervalRow, ...scopedStyleRules(blockSource)]
      .filter((rule) => rule.selector.includes(":has(.mark-overflow__popover)"))
      .map((rule) => [rule.selector, rule.declarations.get("position"), rule.declarations.get("z-index")]);
    expect(lifted).toEqual([
      [`${ROW}:has(.mark-overflow__popover)`, undefined, "var(--layer-popover)"],
      [".journal-view-custom-intervals:has(.mark-overflow__popover)", "relative", "var(--layer-popover)"],
    ]);
  });

  it("intervalRow adds no !important", () => {
    const important = components.intervalRow.flatMap((rule) =>
      [...rule.declarations].filter(([, value]) => value.includes("!important")).map(([property]) => property),
    );
    expect(important).toEqual([]);
  });
});
