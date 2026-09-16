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

/** The earliest date that renders as `rendered` under `modifiers`. */
export function sourceDateOf(rendered: CalendarDate, modifiers: readonly Modifier[]): CalendarDate {
  // Rendering shifts and then snaps, in written order, so inversion runs the whole chain backwards:
  // the last boundary comes off first, and the shifts come off what is left.
  //
  // A boundary takes a whole unit to one date, so undoing one turns a date into the range that
  // renders it, and the next boundary back has to be answered for the whole range rather than for
  // its earliest date alone. Keeping only that date is what made a chain misread: undoing
  // `<startOf=month>` from 1 January gives all of January, and only over that range is there a
  // week starting inside the month -- from 1 January by itself there is none, and the walk stopped
  // on a date no week ever starts on.
  let range: DateRange = { from: rendered, to: rendered };
  for (const modifier of modifiers.toReversed()) {
    if (modifier.kind !== "boundary" || !isBoundaryUnit(modifier.unit)) continue;
    range = sourcesOf(range, modifier.direction, modifier.unit);
  }
  return unapplyModifiers(range.from, modifiers);
}

interface DateRange {
  from: CalendarDate;
  to: CalendarDate;
}

// Every date that `direction`/`unit` maps into `range`.
//
// An empty answer means no date renders what the range holds, which is not the caller's cue to
// refuse: a format naming only part of a date parses the rest in from today, so a `<startOf=week>`
// capture of "2026" arrives as a 1 January that no week starts on while the year it does carry is
// perfectly real. The range collapses to the date it was asked about, which is the reading this
// took before it looked at ranges at all.
function sourcesOf(range: DateRange, direction: "start" | "end", unit: BoundaryUnit): DateRange {
  if (direction === "end") {
    // A date's unit-end lands in the range when its unit ends at or after `from`, so the unit
    // holding `from` is the earliest. The last is `to` itself where `to` ends a unit, and otherwise
    // the day before its unit began -- the previous unit's end, the last one finishing by `to`.
    const from = range.from.startOf(unit);
    const to = range.to.endOf(unit).isAfter(range.to) ? range.to.startOf(unit).shift(-1, "d") : range.to;
    return from.isAfter(to) ? { from, to: from } : { from, to };
  }
  // A date's unit-start lands in the range when its unit begins at or after `from`, so the earliest
  // is the first unit start that is not before `from`, and the last is the end of `to`'s own unit.
  const ownStart = range.from.startOf(unit);
  const from = ownStart.isSame(range.from) ? range.from : nextStartOf(ownStart, unit);
  const to = range.to.endOf(unit);
  return from.isAfter(to) ? { from: range.from, to: range.from } : { from, to };
}

// One unit on from a date that already starts one. A decade is ten years; an hour cannot move a
// date at all, and reads as the day it sits in.
function nextStartOf(unitStart: CalendarDate, unit: BoundaryUnit): CalendarDate {
  return match(unit)
    .with("decade", () => unitStart.shift(10, "y"))
    .with("year", () => unitStart.shift(1, "y"))
    .with("quarter", () => unitStart.shift(1, "q"))
    .with("month", () => unitStart.shift(1, "m"))
    .with("week", () => unitStart.shift(1, "w"))
    .with("day", "hour", () => unitStart.shift(1, "d"))
    .exhaustive();
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
