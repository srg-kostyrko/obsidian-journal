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
    .with({ kind: "offset" }, () => value)
    .exhaustive();
}

export function unapplyModifier(date: CalendarDate, modifier: Modifier): CalendarDate {
  return match(modifier)
    .with({ kind: "shift" }, ({ sign, amount, unit }) => date.shift(-(sign * amount), unit))
    .with({ kind: "boundary" }, () => date)
    .with({ kind: "offset" }, () => date)
    .exhaustive();
}

export function applyModifiers<S extends Shiftable<S>>(value: S, modifiers: readonly Modifier[]): S {
  // Shifts apply before boundaries regardless of written order, so
  // {{date<endOf=week>+1d}} is the end of tomorrow's week, not the day after
  // this week's end.
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

export function applyOffsets(value: number, modifiers: readonly Modifier[]): number {
  let result = value;
  for (const modifier of modifiers) {
    if (modifier.kind === "offset") result += modifier.sign * modifier.amount;
  }
  return result;
}

export function unapplyOffsets(value: number, modifiers: readonly Modifier[]): number {
  let result = value;
  for (const modifier of modifiers) {
    if (modifier.kind === "offset") result -= modifier.sign * modifier.amount;
  }
  return result;
}
