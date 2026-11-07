import { match } from "ts-pattern";
import { watch, type WatchStopHandle } from "vue";

import { colorToString, type ColorSettings } from "@/decorations";
import { inject } from "@/infrastructure/di";
import { WindowCssVariables } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { appearanceCatalog, savedName, type CatalogEntry } from "./appearance-catalog";
import {
  appearanceSlice,
  UNCHANGED,
  type Unchanged,
  type AppearanceParts,
  type AppearanceSliceState,
  type BoxValues,
  type CurrentWeekValues,
  type HighlightValues,
  type NarrowCurrentWeek,
  type NarrowHighlight,
  type NarrowOverrides,
  type Overrides,
  type TextCase,
  type TextValues,
  type Weight,
} from "./slice";

/** A CSS value, or undefined for "write nothing" so the reader's own fallback applies. */
type Css = string | undefined;

/**
 * "Show nothing of mine": written only where something underneath would otherwise paint — a
 * non-empty stock, or at narrow width a wide value that was saved. The token is `unchanged`
 * because the cell's style queries turn it into a pass-through, which no real CSS value can be.
 */
interface Pass {
  readonly pass: true;
}

const PASS: Pass = { pass: true };
const PASS_TOKEN = UNCHANGED;

/** One catalog value of a part: its CSS from the part's values, and which narrow leaves feed it. */
interface Value<Part, Narrow> {
  readonly suffix: string;
  readonly css: (values: Part) => Css | Pass;
  readonly reads: (narrow: Narrow) => readonly unknown[];
}

interface PartWriter<Part, Narrow> {
  readonly name: string;
  readonly values: readonly Value<Part, Narrow>[];
  readonly merge: (wide: Part, narrow: Narrow) => Part;
}

const WEIGHT_CSS = {
  normal: "var(--font-normal)",
  semibold: "var(--font-semibold)",
  bold: "var(--font-bold)",
} as const satisfies Record<Weight, string>;

const CASE_CSS = {
  none: "none",
  upper: "uppercase",
  lower: "lowercase",
  title: "capitalize",
} as const satisfies Record<TextCase, string>;

const px = (value: number): string => `${value}px`;
const color = (value: ColorSettings | null): Css => (value === null ? undefined : colorToString(value));
const weight = (value: Weight | null): Css => (value === null ? undefined : WEIGHT_CSS[value]);
function italic(value: boolean | null): Css {
  if (value === null) return undefined;
  return value ? "italic" : "normal";
}
const clampStrength = (value: number): number => Math.min(100, Math.max(5, Math.round(value)));

// The style is stored, but CSS only ever sees plain values, so a snippet can switch styles with
// variables alone and the editor keeps the other values when the style changes.
function styleValues(h: HighlightValues): { ring: number; strength: number; text: boolean } {
  return match(h.style)
    .with("ring", () => ({ ring: h.ringWidth, strength: 0, text: true }))
    .with("background", () => ({ ring: 0, strength: clampStrength(h.strength), text: true }))
    .with("text", () => ({ ring: 0, strength: 0, text: true }))
    .with("none", () => ({ ring: 0, strength: 0, text: false }))
    .exhaustive();
}

const orNull = <T>(value: T | Unchanged): T | null => (value === UNCHANGED ? null : value);

type HighlightText = HighlightValues["text"];

const gated = (h: HighlightValues, group: HighlightText): HighlightText | undefined =>
  styleValues(h).text ? group : undefined;

const textColor = (h: HighlightValues, group = h.text): Css | Pass =>
  color(orNull(gated(h, group)?.color ?? null)) ?? PASS;
const textWeight = (h: HighlightValues, group = h.text): Css | Pass =>
  weight(orNull(gated(h, group)?.weight ?? null)) ?? PASS;
const textItalic = (h: HighlightValues, group = h.text): Css | Pass =>
  italic(orNull(gated(h, group)?.italic ?? null)) ?? PASS;

function highlightWriter(name: string): PartWriter<HighlightValues, NarrowHighlight> {
  return {
    name,
    values: [
      { suffix: "color", css: (h) => colorToString(h.color), reads: (n) => [n.color] },
      { suffix: "ring-width", css: (h) => px(styleValues(h).ring), reads: (n) => [n.style, n.ringWidth] },
      { suffix: "strength", css: (h) => String(styleValues(h).strength / 100), reads: (n) => [n.style, n.strength] },
      { suffix: "text-color", css: (h) => textColor(h), reads: (n) => [n.style, n.text.color] },
      { suffix: "text-weight", css: (h) => textWeight(h), reads: (n) => [n.style, n.text.weight] },
      { suffix: "text-italic", css: (h) => textItalic(h), reads: (n) => [n.style, n.text.italic] },
      { suffix: "layer", css: (h) => (h.over ? "1" : "-1"), reads: (n) => [n.over] },
    ],
    merge: (wide, narrow) => ({
      style: narrow.style ?? wide.style,
      color: narrow.color ?? wide.color,
      ringWidth: narrow.ringWidth ?? wide.ringWidth,
      strength: narrow.strength ?? wide.strength,
      text: {
        color: narrow.text.color ?? wide.text.color,
        weight: narrow.text.weight ?? wide.text.weight,
        italic: narrow.text.italic ?? wide.text.italic,
      },
      over: narrow.over ?? wide.over,
    }),
  };
}

function currentWeekWriter(): PartWriter<CurrentWeekValues, NarrowCurrentWeek> {
  const base = highlightWriter("current-week");
  return {
    name: base.name,
    values: [
      ...base.values,
      {
        suffix: "week-number-text-color",
        css: (h) => textColor(h, h.weekNumberText),
        reads: (n) => [n.style, n.weekNumberText.color],
      },
      {
        suffix: "week-number-text-weight",
        css: (h) => textWeight(h, h.weekNumberText),
        reads: (n) => [n.style, n.weekNumberText.weight],
      },
      {
        suffix: "week-number-text-italic",
        css: (h) => textItalic(h, h.weekNumberText),
        reads: (n) => [n.style, n.weekNumberText.italic],
      },
    ],
    merge: (wide, narrow) => ({
      ...base.merge(wide, narrow),
      weekNumberText: {
        color: narrow.weekNumberText.color ?? wide.weekNumberText.color,
        weight: narrow.weekNumberText.weight ?? wide.weekNumberText.weight,
        italic: narrow.weekNumberText.italic ?? wide.weekNumberText.italic,
      },
    }),
  };
}

function overlay<T extends object>(wide: T, narrow: Overrides<T>): T {
  const out = { ...wide };
  for (const key of Object.keys(narrow) as (keyof T)[]) {
    const value = narrow[key];
    if (value !== null) out[key] = value;
  }
  return out;
}

function textWriter(name: string): PartWriter<TextValues, Overrides<TextValues>> {
  return {
    name,
    values: [
      { suffix: "size", css: (t) => t.size, reads: (n) => [n.size] },
      { suffix: "weight", css: (t) => weight(t.weight), reads: (n) => [n.weight] },
      { suffix: "italic", css: (t) => italic(t.italic), reads: (n) => [n.italic] },
      { suffix: "color", css: (t) => color(t.color), reads: (n) => [n.color] },
      { suffix: "case", css: (t) => (t.case === null ? undefined : CASE_CSS[t.case]), reads: (n) => [n.case] },
    ],
    merge: overlay,
  };
}

const boxWriter: PartWriter<BoxValues, Overrides<BoxValues>> = {
  name: "cell",
  values: [
    { suffix: "padding", css: (b) => px(b.padding), reads: (n) => [n.padding] },
    { suffix: "radius", css: (b) => b.radius, reads: (n) => [n.radius] },
    { suffix: "gap", css: (b) => b.gap, reads: (n) => [n.gap] },
    { suffix: "min-height", css: (b) => px(b.minHeight), reads: (n) => [n.minHeight] },
  ],
  merge: overlay,
};

type Writers = {
  [P in keyof AppearanceParts]: PartWriter<AppearanceParts[P], NarrowOverrides[P]>;
};

const WRITERS: Writers = {
  today: highlightWriter("today"),
  selected: highlightWriter("selected"),
  active: highlightWriter("active"),
  outside: highlightWriter("outside"),
  weekend: highlightWriter("weekend"),
  currentWeek: currentWeekWriter(),
  heading: textWriter("heading"),
  weekday: textWriter("weekday"),
  weekNumber: textWriter("week-number"),
  date: textWriter("date"),
  cell: boxWriter,
};

/** The part as the cell sees it at narrow width: narrow overrides laid over the wide values. */
export function mergedPart<P extends keyof AppearanceParts>(state: AppearanceSliceState, part: P): AppearanceParts[P] {
  const writer: PartWriter<AppearanceParts[P], NarrowOverrides[P]> = WRITERS[part];
  return writer.merge(state.wide[part], state.narrow[part]);
}

const PARTS = Object.keys(WRITERS) as (keyof AppearanceParts)[];

const catalogByName = new Map(appearanceCatalog.map((entry) => [entry.name, entry]));

const entryOf = (part: string, suffix: string): CatalogEntry | undefined =>
  catalogByName.get(`journal-cell-${part}-${suffix}`);

/** Every catalog name the writer produces; a catalog entry missing here would never be saved. */
export function writtenEntryNames(): ReadonlySet<string> {
  const names = new Set<string>();
  const add = <P extends keyof AppearanceParts>(part: P): void => {
    const writer = WRITERS[part];
    for (const value of writer.values) {
      const entry = entryOf(writer.name, value.suffix);
      if (entry !== undefined) names.add(entry.name);
    }
  };
  for (const part of PARTS) add(part);
  return names;
}

function writePart<Part, Narrow>(
  out: Record<string, string>,
  writer: PartWriter<Part, Narrow>,
  wide: Part,
  narrow: Narrow,
): void {
  const merged = writer.merge(wide, narrow);
  for (const value of writer.values) {
    const entry = entryOf(writer.name, value.suffix);
    if (entry === undefined) continue;
    const wideCss = value.css(wide);
    let written: string | undefined;
    if (typeof wideCss === "string") written = wideCss === entry.stock ? undefined : wideCss;
    else if (wideCss !== undefined && entry.stock !== "") written = PASS_TOKEN;
    if (written !== undefined) out[savedName(entry)] = written;
    if (value.reads(narrow).every((leaf) => leaf === null)) continue;
    const narrowCss = value.css(merged);
    if (typeof narrowCss === "string") out[savedName(entry, true)] = narrowCss;
    else if (narrowCss !== undefined && (entry.stock !== "" || written !== undefined)) {
      out[savedName(entry, true)] = PASS_TOKEN;
    }
  }
}

/**
 * One saved variable per wide value that differs from the catalog's stock, and one narrow saved
 * variable per value a narrow override feeds. Stock values are left out, so they resolve through
 * the calendar's own fallback.
 */
export function appearanceVariables(state: AppearanceSliceState): Record<string, string> {
  const out: Record<string, string> = {};
  const write = <P extends keyof AppearanceParts>(part: P): void => {
    writePart(out, WRITERS[part], state.wide[part], state.narrow[part]);
  };
  for (const part of PARTS) write(part);
  return out;
}

export class AppearanceVariables {
  readonly #slice = inject(SettingsService).getSlice(appearanceSlice);
  readonly #installed = inject(WindowCssVariables).install(() => appearanceVariables(this.#slice.state));
  readonly #stop: WatchStopHandle;

  constructor() {
    this.#stop = watch(
      () => this.#slice.state,
      () => {
        this.#installed.refresh();
      },
      { deep: true },
    );
  }

  [Symbol.dispose](): void {
    this.#stop();
    this.#installed.remove();
  }
}
