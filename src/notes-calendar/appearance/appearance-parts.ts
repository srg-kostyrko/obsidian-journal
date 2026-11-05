import type { ThemeColorFieldRole } from "@/ui/theme-colors";

import type { AppearanceParts, HighlightStyle } from "./slice";

export type PartKey = keyof AppearanceParts;
export type Width = "wide" | "narrow";
export type Family = "text" | "highlight" | "box";
export type ControlKind = "color" | "slider" | "select";

export interface Control {
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

const WEIGHTS = ["normal", "semibold", "bold"] as const;
const ITALIC = ["on", "off"] as const;
const CASES = ["none", "upper", "lower", "title"] as const;
const STYLES = ["text", "ring", "background", "none"] as const;
const SHAPED: readonly HighlightStyle[] = ["ring", "background"];
const WITH_TEXT: readonly HighlightStyle[] = ["text", "ring", "background"];

function highlightControls(part: string): readonly Control[] {
  const entry = (value: string): string => `journal-cell-${part}-${value}`;
  return [
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
  ];
}

function textControls(part: string): readonly Control[] {
  const entry = (value: string): string => `journal-cell-${part}-${value}`;
  return [
    { path: ["size"], kind: "slider", entry: entry("size"), range: { min: 0.5, max: 1.6, step: 0.05, unit: "em" } },
    { path: ["weight"], kind: "select", entry: entry("weight"), options: WEIGHTS },
    { path: ["italic"], kind: "select", entry: entry("italic"), options: ITALIC },
    { path: ["color"], kind: "color", entry: entry("color"), role: "text" },
    { path: ["case"], kind: "select", entry: entry("case"), options: CASES },
  ];
}

const BOX_CONTROLS: readonly Control[] = [
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
];

export const PARTS: Readonly<Record<PartKey, { readonly family: Family; readonly controls: readonly Control[] }>> = {
  today: { family: "highlight", controls: highlightControls("today") },
  selected: { family: "highlight", controls: highlightControls("selected") },
  active: { family: "highlight", controls: highlightControls("active") },
  outside: { family: "highlight", controls: highlightControls("outside") },
  heading: { family: "text", controls: textControls("heading") },
  weekday: { family: "text", controls: textControls("weekday") },
  weekNumber: { family: "text", controls: textControls("week-number") },
  date: { family: "text", controls: textControls("date") },
  cell: { family: "box", controls: BOX_CONTROLS },
};

/** Most specific first, so a click that lands on several parts picks the one the user aimed at. */
export const CHIP_ORDER: readonly PartKey[] = [
  "active",
  "selected",
  "today",
  "outside",
  "date",
  "weekNumber",
  "weekday",
  "heading",
  "cell",
];

export function visibleControls(part: PartKey, style: HighlightStyle | undefined): readonly Control[] {
  const { controls } = PARTS[part];
  if (style === undefined) return controls;
  return controls.filter((control) => control.shownFor === undefined || control.shownFor.includes(style));
}

export function roleFor(control: Control, style: HighlightStyle | undefined): ThemeColorFieldRole {
  return (style === undefined ? undefined : control.roleByStyle?.[style]) ?? control.role ?? "text";
}
