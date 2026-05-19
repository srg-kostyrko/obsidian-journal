import { match } from "ts-pattern";

import type { CalendarDate } from "@/calendar";

import type { Modifier } from "./types";

const BOUNDARY_UNITS = new Set(["year", "quarter", "month", "week", "day", "decade"]);

export function applyModifier(date: CalendarDate, modifier: Modifier): CalendarDate {
  return match(modifier)
    .with({ kind: "shift" }, ({ sign, amount, unit }) => date.shift(sign * amount, unit))
    .with({ kind: "boundary" }, ({ direction, unit }) => {
      if (!BOUNDARY_UNITS.has(unit)) return date;
      const u = unit as "year" | "quarter" | "month" | "week" | "day" | "decade";
      return direction === "start" ? date.startOf(u) : date.endOf(u);
    })
    .exhaustive();
}

export function unapplyModifier(date: CalendarDate, modifier: Modifier): CalendarDate {
  return match(modifier)
    .with({ kind: "shift" }, ({ sign, amount, unit }) => date.shift(-1 * sign * amount, unit))
    .with({ kind: "boundary" }, () => date)
    .exhaustive();
}

export function applyModifiers(date: CalendarDate, modifiers: readonly Modifier[]): CalendarDate {
  // v2 order: arithmetic shifts first, then boundary
  const shifts = modifiers.filter(
    (modifier): modifier is Extract<Modifier, { kind: "shift" }> => modifier.kind === "shift",
  );
  const boundaries = modifiers.filter(
    (modifier): modifier is Extract<Modifier, { kind: "boundary" }> => modifier.kind === "boundary",
  );
  let result = date;
  for (const modifier of shifts) result = applyModifier(result, modifier);
  for (const modifier of boundaries) result = applyModifier(result, modifier);
  return result;
}

export function unapplyModifiers(date: CalendarDate, modifiers: readonly Modifier[]): CalendarDate {
  // reverse order: undo boundaries first (no-op), then undo shifts in reverse
  const shifts = modifiers.filter(
    (modifier): modifier is Extract<Modifier, { kind: "shift" }> => modifier.kind === "shift",
  );
  let result = date;
  for (let i = shifts.length - 1; i >= 0; i--) {
    result = unapplyModifier(result, shifts[i]);
  }
  return result;
}
