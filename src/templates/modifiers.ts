import { match } from "ts-pattern";

import type { CalendarDate } from "@/calendar";

import type { Modifier, Unit } from "./types";

export type BoundaryUnit = "year" | "quarter" | "month" | "week" | "day" | "decade" | "hour";

export const BOUNDARY_UNITS = new Set<BoundaryUnit>(["year", "quarter", "month", "week", "day", "decade", "hour"]);

export function isBoundaryUnit(unit: string): unit is BoundaryUnit {
  return BOUNDARY_UNITS.has(unit as BoundaryUnit);
}

interface Shiftable<S> {
  shift(amount: number, unit: Unit): S;
  startOf(unit: BoundaryUnit): S;
  endOf(unit: BoundaryUnit): S;
}

export function applyModifier<S extends Shiftable<S>>(value: S, modifier: Modifier): S {
  return match(modifier)
    .with({ kind: "shift" }, ({ sign, amount, unit }) => value.shift(sign * amount, unit))
    .with({ kind: "boundary" }, ({ direction, unit }) => {
      if (!isBoundaryUnit(unit)) return value;
      return direction === "start" ? value.startOf(unit) : value.endOf(unit);
    })
    .exhaustive();
}

export function unapplyModifier(date: CalendarDate, modifier: Modifier): CalendarDate {
  return match(modifier)
    .with({ kind: "shift" }, ({ sign, amount, unit }) => date.shift(-(sign * amount), unit))
    .with({ kind: "boundary" }, () => date)
    .exhaustive();
}

export function applyModifiers<S extends Shiftable<S>>(value: S, modifiers: readonly Modifier[]): S {
  // v2 order: arithmetic shifts first, then boundary
  const shifts = modifiers.filter(
    (modifier): modifier is Extract<Modifier, { kind: "shift" }> => modifier.kind === "shift",
  );
  const boundaries = modifiers.filter(
    (modifier): modifier is Extract<Modifier, { kind: "boundary" }> => modifier.kind === "boundary",
  );
  let result = value;
  for (const modifier of shifts) result = applyModifier(result, modifier);
  for (const modifier of boundaries) result = applyModifier(result, modifier);
  return result;
}

export function unapplyModifiers(date: CalendarDate, modifiers: readonly Modifier[]): CalendarDate {
  const shifts = modifiers.filter(
    (modifier): modifier is Extract<Modifier, { kind: "shift" }> => modifier.kind === "shift",
  );
  let result = date;
  for (let i = shifts.length - 1; i >= 0; i--) {
    result = unapplyModifier(result, shifts[i]);
  }
  return result;
}
