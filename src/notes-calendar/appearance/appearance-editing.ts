import * as v from "valibot";

import { calendarDisplaySlice, type CalendarDisplaySliceState } from "@/calendar";

import {
  isStructure,
  PARTS,
  type Control,
  type PartKey,
  type StructureControl,
  type ValuePartKey,
  type Width,
} from "./appearance-parts";
import { mergedPart } from "./appearance-variables";
import { appearanceSlice, appearanceSliceSchema, type AppearanceSliceState } from "./slice";

export { visibleControls } from "./appearance-parts";

function read(root: unknown, path: readonly string[]): unknown {
  let current = root;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// Copies only along the path, so untouched branches stay shared and a reactive source is never cloned.
function setIn<T>(root: T, path: readonly string[], value: unknown): T {
  const [key, ...rest] = path;
  if (key === undefined) return value as T;
  const source = root as Record<string, unknown>;
  return { ...source, [key]: setIn(source[key], rest, value) } as T;
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => equal(left[key], right[key]));
}

function hasOverride(narrowPart: unknown): boolean {
  if (typeof narrowPart !== "object" || narrowPart === null) return narrowPart !== null;
  return Object.values(narrowPart).some(hasOverride);
}

export function valueAt(
  state: AppearanceSliceState,
  width: Width,
  part: ValuePartKey,
  path: readonly string[],
): unknown {
  return read(width === "wide" ? state.wide[part] : mergedPart(state, part), path);
}

export function sourceAt(
  state: AppearanceSliceState,
  width: Width,
  part: ValuePartKey,
  path: readonly string[],
): "stock" | "user" | "narrow" {
  if (width === "narrow" && (read(state.narrow[part], path) ?? null) !== null) return "narrow";
  const stock = read(appearanceSlice.defaults.wide[part], path);
  return equal(read(state.wide[part], path), stock) ? "stock" : "user";
}

export function withValue(
  state: AppearanceSliceState,
  width: Width,
  part: ValuePartKey,
  path: readonly string[],
  value: unknown,
): AppearanceSliceState {
  const next = { ...state, [width]: { ...state[width], [part]: setIn(state[width][part], path, value) } };
  // The leaf's type lives in the slice schema, so the schema is the one judge of what fits.
  if (!v.safeParse(appearanceSliceSchema, next).success) {
    throw new TypeError(`${part}.${path.join(".")} does not accept ${JSON.stringify(value)}`);
  }
  return next;
}

// Booleans and "unchanged" share the leaf, so the select speaks option names and the model translates.
const BOOLEAN_OPTIONS: Readonly<Record<string, readonly [string, string]>> = {
  italic: ["on", "off"],
  over: ["over", "under"],
  showHeading: ["shown", "hidden"],
  showWeekdays: ["shown", "hidden"],
};

function booleanOptions(control: Control): readonly [string, string] | undefined {
  const key = isStructure(control) ? control.setting : control.path.at(-1);
  return key === undefined ? undefined : BOOLEAN_OPTIONS[key];
}

export function toControlValue(control: Control, sliceValue: unknown): unknown {
  const names = booleanOptions(control);
  if (names === undefined || typeof sliceValue !== "boolean") return sliceValue;
  return sliceValue ? names[0] : names[1];
}

export function fromControlValue(control: Control, controlValue: unknown): unknown {
  const names = booleanOptions(control);
  if (names === undefined) return controlValue;
  if (controlValue === names[0]) return true;
  return controlValue === names[1] ? false : controlValue;
}

export function structureAt(display: CalendarDisplaySliceState, control: StructureControl): unknown {
  return toControlValue(control, display[control.setting]);
}

export function withStructure(
  display: CalendarDisplaySliceState,
  control: StructureControl,
  controlValue: unknown,
): CalendarDisplaySliceState {
  const next = { ...display, [control.setting]: fromControlValue(control, controlValue) };
  const named = typeof controlValue === "string" && control.options.includes(controlValue);
  if (!named || !v.safeParse(calendarDisplaySlice.schema, next).success) {
    throw new TypeError(`${control.setting} does not accept ${JSON.stringify(controlValue)}`);
  }
  return next;
}

function isValuePart(part: PartKey): part is ValuePartKey {
  return part !== "grid";
}

function structureOf(part: PartKey): readonly StructureControl[] {
  return PARTS[part].controls.filter((control) => isStructure(control));
}

// Structure has no narrow value, so only Wide counts it.
export function isModified(
  state: AppearanceSliceState,
  display: CalendarDisplaySliceState,
  width: Width,
  part: PartKey,
): boolean {
  if (width === "narrow") return isValuePart(part) && hasOverride(state.narrow[part]);
  const structureChanged = structureOf(part).some(
    ({ setting }) => display[setting] !== calendarDisplaySlice.defaults[setting],
  );
  return structureChanged || (isValuePart(part) && !equal(state.wide[part], appearanceSlice.defaults.wide[part]));
}

export function withReset(
  state: AppearanceSliceState,
  display: CalendarDisplaySliceState,
  width: Width,
  part: PartKey,
): { appearance: AppearanceSliceState; display: CalendarDisplaySliceState } {
  const appearance = isValuePart(part)
    ? { ...state, [width]: { ...state[width], [part]: structuredClone(appearanceSlice.defaults[width][part]) } }
    : state;
  if (width === "narrow") return { appearance, display };
  const restored = Object.fromEntries(
    structureOf(part).map(({ setting }) => [setting, calendarDisplaySlice.defaults[setting]]),
  );
  return { appearance, display: { ...display, ...restored } };
}

export function withNarrowCleared(
  state: AppearanceSliceState,
  part: ValuePartKey,
  path: readonly string[],
): AppearanceSliceState {
  return withValue(state, "narrow", part, path, null);
}
