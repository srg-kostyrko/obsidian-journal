export interface CatalogEntry {
  /** Public name without the leading dashes, e.g. "journal-cell-today-color". */
  readonly name: string;
  /** CSS fallback; "" means the reader omits it so the property keeps whatever it inherits. */
  readonly stock: string;
  readonly stockNarrow?: string;
  /**
   * The gate sets the entry to `sample` plus every `with` companion (full public names), then asserts
   * that the computed `property` of `selector`, relative to a rendered month view, contains `expect`.
   */
  readonly probe: {
    readonly selector: string;
    readonly property: string;
    readonly sample: string;
    readonly with?: Readonly<Record<string, string>>;
    readonly expect: string;
  };
}

const HIGHLIGHT_STATES = [
  {
    state: "today",
    attribute: "data-today",
    color: "transparent",
    ring: "0px",
    strength: "0",
    text: "var(--text-accent)",
    layer: "-1",
  },
  {
    state: "selected",
    attribute: "data-selected",
    color: "var(--interactive-accent)",
    ring: "2px",
    strength: "0",
    text: "",
    layer: "1",
  },
  {
    state: "active",
    attribute: "data-active",
    color: "var(--interactive-accent)",
    ring: "0px",
    strength: "1",
    text: "var(--text-on-accent)",
    layer: "-1",
  },
  {
    state: "outside",
    attribute: "data-outside",
    color: "transparent",
    ring: "0px",
    strength: "0",
    text: "var(--text-muted)",
    layer: "-1",
  },
  {
    state: "weekend",
    attribute: "data-weekend",
    color: "transparent",
    ring: "0px",
    strength: "0",
    text: "",
    layer: "-1",
  },
  {
    state: "current-week",
    attribute: "data-current-week",
    color: "transparent",
    ring: "0px",
    strength: "0",
    text: "",
    layer: "-1",
  },
] as const;

// A band is drawn by the grid, across many cells, so its fill and ring are the band's, not a cell's.
const BANDS: ReadonlySet<string> = new Set(["weekend", "current-week"]);

function layer(state: string, kind: "fill" | "ring"): string {
  const owner = BANDS.has(state) ? "notes-calendar-band" : "notes-calendar-cell";
  return `.${owner}__layer[data-layer="${state}-${kind}"]`;
}

function highlightEntries(): CatalogEntry[] {
  return HIGHLIGHT_STATES.flatMap(({ state, attribute, color, ring, strength, text, layer: z }) => {
    const cell = `.notes-calendar-cell[${attribute}]`;
    // Weight and italic land on the label: on the cell, an unset chain would unset a host's own weight.
    const label = `${cell} .cell-decoration__content`;
    // The text span owns the cell's color chain; the cell root holds only the part's own color.
    const textSpan = `${cell} > .notes-calendar-cell__text`;
    const name = (value: string): string => `journal-cell-${state}-${value}`;
    // A stock color or strength that paints nothing would hide the variable under test, so the
    // companion pins the other half to something visible.
    const solid = { [`--${name("strength")}`]: "1" };
    const red = { [`--${name("color")}`]: "#ff0000" };
    return [
      {
        name: name("color"),
        stock: color,
        probe:
          state === "selected"
            ? { selector: layer(state, "ring"), property: "box-shadow", sample: "#123456", expect: "rgb(18, 52, 86)" }
            : {
                selector: layer(state, "fill"),
                property: "background-color",
                sample: "#123456",
                with: solid,
                expect: "rgb(18, 52, 86)",
              },
      },
      {
        name: name("ring-width"),
        stock: ring,
        probe: { selector: layer(state, "ring"), property: "box-shadow", sample: "5px", with: red, expect: "5px" },
      },
      {
        name: name("strength"),
        stock: strength,
        probe: {
          selector: layer(state, "fill"),
          property: "opacity",
          sample: "0.5",
          with: red,
          expect: "0.5",
        },
      },
      {
        name: name("text-color"),
        stock: text,
        probe: { selector: textSpan, property: "color", sample: "#563412", expect: "rgb(86, 52, 18)" },
      },
      {
        name: name("text-weight"),
        stock: "",
        probe: { selector: label, property: "font-weight", sample: "300", expect: "300" },
      },
      {
        name: name("text-italic"),
        stock: "",
        probe: { selector: label, property: "font-style", sample: "italic", expect: "italic" },
      },
      {
        name: name("layer"),
        stock: z,
        // A band's layer is clamped to under (0) or over (1), so a larger sample would read back as 1.
        probe: BANDS.has(state)
          ? { selector: layer(state, "fill"), property: "z-index", sample: "1", expect: "1" }
          : { selector: layer(state, "fill"), property: "z-index", sample: "7", expect: "7" },
      },
    ];
  });
}

const currentWeekNumberName = (value: string): string => `journal-cell-current-week-week-number-text-${value}`;

// Probed on a month view's week number: the days of the current week read the days' text instead.
function currentWeekNumberEntries(): CatalogEntry[] {
  const cell = ".notes-month-view__week-number[data-current-week]";
  const label = `${cell} .cell-decoration__content`;
  return [
    {
      name: currentWeekNumberName("color"),
      stock: "var(--text-accent)",
      probe: {
        selector: `${cell} > .notes-calendar-cell__text`,
        property: "color",
        sample: "#563412",
        expect: "rgb(86, 52, 18)",
      },
    },
    {
      name: currentWeekNumberName("weight"),
      stock: "var(--font-bold)",
      probe: { selector: label, property: "font-weight", sample: "300", expect: "300" },
    },
    {
      name: currentWeekNumberName("italic"),
      stock: "",
      probe: { selector: label, property: "font-style", sample: "italic", expect: "italic" },
    },
  ];
}

const TEXT_PARTS = [
  { part: "heading", selector: '[data-testid="header-month"]', size: "inherit", weight: "inherit", color: "inherit" },
  {
    part: "weekday",
    selector: ".notes-month-view__weekday",
    size: "0.6em",
    weight: "inherit",
    color: "var(--text-muted)",
  },
  {
    part: "week-number",
    selector: ".notes-month-view__week-number",
    size: "0.85em",
    weight: "var(--font-normal)",
    color: "var(--text-muted)",
  },
  {
    part: "date",
    selector: ".notes-month-view__day:not([data-outside])",
    size: "inherit",
    weight: "inherit",
    color: "inherit",
  },
] as const;

function textEntries(): CatalogEntry[] {
  return TEXT_PARTS.flatMap(({ part, selector, size, weight, color }) => {
    const name = (value: string): string => `journal-cell-${part}-${value}`;
    return [
      { name: name("size"), stock: size, probe: { selector, property: "font-size", sample: "21px", expect: "21px" } },
      {
        name: name("weight"),
        stock: weight,
        probe: { selector, property: "font-weight", sample: "300", expect: "300" },
      },
      {
        name: name("italic"),
        stock: "inherit",
        probe: { selector, property: "font-style", sample: "italic", expect: "italic" },
      },
      {
        name: name("color"),
        stock: color,
        probe: { selector, property: "color", sample: "#563412", expect: "rgb(86, 52, 18)" },
      },
      {
        name: name("case"),
        stock: "inherit",
        probe: { selector, property: "text-transform", sample: "uppercase", expect: "uppercase" },
      },
    ];
  });
}

// Probed on a month view with week numbers on the left, where the divider draws its inline-end edge.
const DIVIDER_ENTRIES: readonly CatalogEntry[] = [
  {
    name: "journal-cell-week-number-divider-color",
    stock: "var(--background-modifier-border)",
    probe: {
      selector: ".notes-calendar-divider",
      property: "border-inline-end-color",
      sample: "#123456",
      with: { "--journal-cell-week-number-divider-width": "3px" },
      expect: "rgb(18, 52, 86)",
    },
  },
  {
    name: "journal-cell-week-number-divider-width",
    stock: "1px",
    probe: { selector: ".notes-calendar-divider", property: "border-inline-end-width", sample: "3px", expect: "3px" },
  },
];

const BOX_ENTRIES: readonly CatalogEntry[] = [
  {
    name: "journal-cell-cell-padding",
    stock: "0px",
    // Label padding: the decoration's fill still covers the whole cell.
    probe: {
      selector: ".notes-calendar-cell .cell-decoration__content",
      property: "padding-top",
      sample: "9px",
      expect: "9px",
    },
  },
  {
    name: "journal-cell-cell-radius",
    stock: "var(--radius-s)",
    probe: { selector: ".notes-calendar-cell", property: "border-top-left-radius", sample: "11px", expect: "11px" },
  },
  {
    name: "journal-cell-cell-gap",
    stock: "var(--size-2-1)",
    probe: { selector: ".notes-month-view__grid", property: "row-gap", sample: "13px", expect: "13px" },
  },
  {
    name: "journal-cell-cell-min-height",
    stock: "26px",
    probe: { selector: ".notes-calendar-cell", property: "min-height", sample: "41px", expect: "41px" },
  },
];

/** Every documented calendar variable; the writer, the readers and the e2e gate all read this one list. */
export const appearanceCatalog: readonly CatalogEntry[] = [
  ...highlightEntries(),
  ...currentWeekNumberEntries(),
  ...textEntries(),
  ...DIVIDER_ENTRIES,
  ...BOX_ENTRIES,
];

export function publicName(entry: CatalogEntry, narrow = false): `--${string}` {
  return `--${entry.name}${narrow ? "-narrow" : ""}`;
}

export function savedName(entry: CatalogEntry, narrow = false): `--${string}` {
  return `--${entry.name.replace(/^journal-/, "journal-saved-")}${narrow ? "-narrow" : ""}`;
}
