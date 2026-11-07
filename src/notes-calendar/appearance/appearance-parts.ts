import type { LabelKind, StructureKey, WeekdayLabel } from "@/calendar";
import type { ThemeColorFieldRole } from "@/ui/theme-colors";

import type { AppearanceParts, HighlightStyle } from "./slice";

export type ValuePartKey = keyof AppearanceParts;
export type PartKey = ValuePartKey | "grid";
export type Width = "wide" | "narrow";
export type Family = "visibility" | "label" | "text" | "highlight" | "box";
export const FAMILY_ORDER: readonly Family[] = ["visibility", "label", "text", "highlight", "box"];
export type ControlKind = "color" | "slider" | "select";

export interface ValueControl {
  readonly family: Exclude<Family, "visibility" | "label">;
  readonly path: readonly string[];
  readonly kind: ControlKind;
  /** Catalog name of the variable the control feeds; absent for a style, which no single variable carries. */
  readonly entry?: string;
  readonly role?: ThemeColorFieldRole;
  /** Roles that replace `role` for a style: a ring is a border, a fill is a background. */
  readonly roleByStyle?: Partial<Readonly<Record<HighlightStyle, ThemeColorFieldRole>>>;
  /** The select's neutral choice stores "unchanged" rather than null. */
  readonly unchanged?: boolean;
  readonly range?: {
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly unit: "px" | "em" | "%";
  };
  readonly options?: readonly string[];
  /** Absent means shown for every style. */
  readonly shownFor?: readonly HighlightStyle[];
}

/** Writes the calendar display slice rather than the appearance slice, so it has one value for every width. */
export interface StructureControl {
  readonly family: "visibility";
  readonly setting: StructureKey;
  readonly kind: "select";
  readonly options: readonly string[];
}

export type OneLetter = Extract<WeekdayLabel, { type: "letter" }>;
/** A string is always a moment pattern; one letter is an object so no typed pattern can mean it. */
export type FormatValue = string | OneLetter;

/** Writes the calendar display slice; a period's format has one value for every width, the weekday's has two. */
export interface FormatControl {
  readonly family: "label";
  readonly kind: "format";
  readonly label: LabelKind | "weekday";
  readonly suggestions: readonly FormatValue[];
}

export type Control = ValueControl | StructureControl | FormatControl;

export function isStructure(control: Control): control is StructureControl {
  return control.family === "visibility";
}

export function isFormat(control: Control): control is FormatControl {
  return control.family === "label";
}

const WEIGHTS = ["normal", "semibold", "bold"] as const;
const ITALIC = ["on", "off"] as const;
const CASES = ["none", "upper", "lower", "title"] as const;
const STYLES = ["text", "ring", "background", "none"] as const;
const SHAPED: readonly HighlightStyle[] = ["ring", "background"];
const WITH_TEXT: readonly HighlightStyle[] = ["text", "ring", "background"];

const SHOWN = ["shown", "hidden"] as const;

function structure(setting: StructureKey, options: readonly string[]): StructureControl {
  return { family: "visibility", setting, kind: "select", options };
}

function format(label: FormatControl["label"], suggestions: readonly FormatValue[]): FormatControl {
  return { family: "label", kind: "format", label, suggestions };
}

type WithoutFamily = Omit<ValueControl, "family">;
const inFamily = (family: ValueControl["family"], controls: readonly WithoutFamily[]): readonly ValueControl[] =>
  controls.map((control) => ({ family, ...control }));

function highlightControls(part: string): readonly ValueControl[] {
  const entry = (value: string): string => `journal-cell-${part}-${value}`;
  return inFamily("highlight", [
    { path: ["style"], kind: "select", options: STYLES },
    {
      path: ["color"],
      kind: "color",
      entry: entry("color"),
      role: "background",
      roleByStyle: { ring: "border" },
      shownFor: SHAPED,
    },
    {
      path: ["ringWidth"],
      kind: "slider",
      entry: entry("ring-width"),
      range: { min: 1, max: 4, step: 1, unit: "px" },
      shownFor: ["ring"],
    },
    {
      path: ["strength"],
      kind: "slider",
      entry: entry("strength"),
      range: { min: 5, max: 100, step: 5, unit: "%" },
      shownFor: ["background"],
    },
    {
      path: ["text", "color"],
      kind: "color",
      entry: entry("text-color"),
      role: "text",
      unchanged: true,
      shownFor: WITH_TEXT,
    },
    {
      path: ["text", "weight"],
      kind: "select",
      entry: entry("text-weight"),
      options: WEIGHTS,
      unchanged: true,
      shownFor: WITH_TEXT,
    },
    {
      path: ["text", "italic"],
      kind: "select",
      entry: entry("text-italic"),
      options: ITALIC,
      unchanged: true,
      shownFor: WITH_TEXT,
    },
    { path: ["over"], kind: "select", entry: entry("layer"), options: ["over", "under"], shownFor: SHAPED },
  ]);
}

function textControls(part: string): readonly ValueControl[] {
  const entry = (value: string): string => `journal-cell-${part}-${value}`;
  return inFamily("text", [
    { path: ["size"], kind: "slider", entry: entry("size"), range: { min: 0.5, max: 1.6, step: 0.05, unit: "em" } },
    { path: ["weight"], kind: "select", entry: entry("weight"), options: WEIGHTS },
    { path: ["italic"], kind: "select", entry: entry("italic"), options: ITALIC },
    { path: ["color"], kind: "color", entry: entry("color"), role: "text" },
    { path: ["case"], kind: "select", entry: entry("case"), options: CASES },
  ]);
}

const BOX_CONTROLS: readonly ValueControl[] = inFamily("box", [
  {
    path: ["padding"],
    kind: "slider",
    entry: "journal-cell-cell-padding",
    range: { min: 0, max: 10, step: 1, unit: "px" },
  },
  {
    path: ["radius"],
    kind: "slider",
    entry: "journal-cell-cell-radius",
    range: { min: 0, max: 12, step: 1, unit: "px" },
  },
  { path: ["gap"], kind: "slider", entry: "journal-cell-cell-gap", range: { min: 0, max: 8, step: 1, unit: "px" } },
  {
    path: ["minHeight"],
    kind: "slider",
    entry: "journal-cell-cell-min-height",
    range: { min: 16, max: 64, step: 1, unit: "px" },
  },
]);

const currentWeekNumberEntry = (value: string): string => `journal-cell-current-week-week-number-text-${value}`;

// Spliced in after the days' text, so the two text groups sit together ahead of the layer.
function currentWeekControls(): readonly ValueControl[] {
  const controls = highlightControls("current-week");
  const weekNumber = inFamily("highlight", [
    {
      path: ["weekNumberText", "color"],
      kind: "color",
      entry: currentWeekNumberEntry("color"),
      role: "text",
      unchanged: true,
      shownFor: WITH_TEXT,
    },
    {
      path: ["weekNumberText", "weight"],
      kind: "select",
      entry: currentWeekNumberEntry("weight"),
      options: WEIGHTS,
      unchanged: true,
      shownFor: WITH_TEXT,
    },
    {
      path: ["weekNumberText", "italic"],
      kind: "select",
      entry: currentWeekNumberEntry("italic"),
      options: ITALIC,
      unchanged: true,
      shownFor: WITH_TEXT,
    },
  ]);
  const over = controls.findIndex((control) => control.path[0] === "over");
  return [...controls.slice(0, over), ...weekNumber, ...controls.slice(over)];
}

export const PARTS: Readonly<Record<PartKey, { readonly controls: readonly Control[] }>> = {
  today: { controls: highlightControls("today") },
  selected: { controls: highlightControls("selected") },
  active: { controls: highlightControls("active") },
  outside: {
    controls: [
      structure("outsideDays", ["automatic", "interactive", "inert", "hidden"]),
      ...highlightControls("outside"),
    ],
  },
  weekend: { controls: highlightControls("weekend") },
  currentWeek: { controls: currentWeekControls() },
  heading: {
    controls: [
      structure("showHeading", SHOWN),
      format("month", ["MMMM", "MMM", "MM"]),
      format("quarter", ["[Q]Q", "Qo", "Q"]),
      format("year", ["YYYY", "YY"]),
      ...textControls("heading"),
    ],
  },
  weekday: {
    controls: [
      structure("showWeekdays", SHOWN),
      format("weekday", ["ddd", "dd", "dddd", { type: "letter" }]),
      ...textControls("weekday"),
    ],
  },
  weekNumber: {
    controls: [
      structure("weekPlacement", ["left", "right", "none"]),
      // No ISO `W`: it disagrees with the week grid unless that grid is ISO.
      format("week", ["[W]w", "w", "[W]ww", "wo"]),
      ...textControls("week-number"),
    ],
  },
  date: { controls: [format("day", ["D", "DD", "Do"]), ...textControls("date")] },
  cell: { controls: BOX_CONTROLS },
  grid: { controls: [structure("monthRows", ["fit", "six"])] },
};

/** Most specific first, so a click that lands on several parts picks the one the user aimed at. */
export const CHIP_ORDER: readonly PartKey[] = [
  "active",
  "selected",
  "today",
  "currentWeek",
  "weekend",
  "outside",
  "date",
  "weekNumber",
  "weekday",
  "heading",
  "cell",
  "grid",
];

export function visibleControls(part: PartKey, style: HighlightStyle | undefined): readonly Control[] {
  const { controls } = PARTS[part];
  if (style === undefined) return controls;
  return controls.filter(
    (control) =>
      isStructure(control) || isFormat(control) || control.shownFor === undefined || control.shownFor.includes(style),
  );
}

export function familiesOf(
  part: PartKey,
  style: HighlightStyle | undefined,
): readonly { family: Family; controls: readonly Control[] }[] {
  const controls = visibleControls(part, style);
  return FAMILY_ORDER.map((family) => ({
    family,
    controls: controls.filter((control) => control.family === family),
  })).filter((group) => group.controls.length > 0);
}

export function roleFor(control: ValueControl, style: HighlightStyle | undefined): ThemeColorFieldRole {
  return (style === undefined ? undefined : control.roleByStyle?.[style]) ?? control.role ?? "text";
}
