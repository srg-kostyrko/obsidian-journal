import { match } from "ts-pattern";

import { CalendarDate, periodOfKind } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { localMoment } from "@/calendar/calendar";
import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";

import { JournalsIndex } from "./journals-index";
import { JournalsRepository } from "./repository";

import type { JournalWrite } from "./config";

type MomentDurationUnit = "day" | "week" | "month" | "quarter" | "year";

export type JournalCycle =
  | { readonly kind: "fixed"; readonly period: MomentDurationUnit }
  | {
      readonly kind: "custom";
      readonly every: MomentDurationUnit;
      readonly duration: number;
      readonly anchor: AnchorString;
    };

type CustomCycle = Extract<JournalCycle, { kind: "custom" }>;

export function buildCycle(write: JournalWrite): JournalCycle {
  return (
    match(write)
      .with({ type: "custom" }, (w) => ({
        kind: "custom" as const,
        every: w.every,
        duration: w.duration,
        anchor: w.anchorDate,
      }))
      // fixed-write schema excludes "decade", so w.type is already a MomentDurationUnit
      .otherwise((w) => ({ kind: "fixed" as const, period: w.type }))
  );
}

function isParseableAnchor(s: AnchorString): boolean {
  return localMoment(s, "YYYY-MM-DD", true).isValid();
}

// Month-sized steps take their day-of-month from the journal's configured anchor, never from the
// date being stepped off. Re-deriving the phase from the current anchor loses it the first time a
// short month clamps it: a 31st anchor clamped to Feb 28 would then read as a plain 28th and stay
// on the 28th forever, instead of returning to the month end in March.
function customStepMonths(from: AnchorString, anchor: AnchorString, months: number): AnchorString {
  const phase = localMoment(anchor, "YYYY-MM-DD", true);
  const target = localMoment(from, "YYYY-MM-DD", true).date(1).add(months, "month");
  const day =
    phase.date() === phase.daysInMonth() ? target.daysInMonth() : Math.min(phase.date(), target.daysInMonth());
  return target.date(day).format("YYYY-MM-DD") as AnchorString;
}

// None for units that never cross a month boundary, and so need no phase of their own.
function monthsPerStep(c: CustomCycle): Option<number> {
  return match(c.every)
    .with("month", () => Option.some(c.duration))
    .with("quarter", () => Option.some(c.duration * 3))
    .with("year", () => Option.some(c.duration * 12))
    .with("day", "week", () => Option.none<number>())
    .exhaustive();
}

function customStep(from: AnchorString, c: CustomCycle, direction: 1 | -1): AnchorString {
  const months = monthsPerStep(c);
  if (months.isSome() && isParseableAnchor(c.anchor)) {
    return customStepMonths(from, c.anchor, direction * months.value);
  }
  const m = localMoment(from, "YYYY-MM-DD", true);
  const stepped = direction === 1 ? m.add(c.duration, c.every) : m.subtract(c.duration, c.every);
  return stepped.format("YYYY-MM-DD") as AnchorString;
}

function customStepForward(anchor: AnchorString, c: CustomCycle): AnchorString {
  return customStep(anchor, c, 1);
}

function customStepBackward(anchor: AnchorString, c: CustomCycle): AnchorString {
  return customStep(anchor, c, -1);
}

function customDefaultEnd(anchor: AnchorString, c: CustomCycle): CalendarDate {
  const next = customStepForward(anchor, c);
  const end = localMoment(next, "YYYY-MM-DD", true).subtract(1, "day");
  return CalendarDate.fromAnchor(end.format("YYYY-MM-DD") as AnchorString);
}

export class CycleService {
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);

  // A custom interval can be manually extended/shrunk, recorded as the note's stored endDate.
  // Stepping must consult the index so anchorOf/nextAnchor/previousAnchor agree on irregular
  // period boundaries rather than computing phantom anchors from the fixed duration.
  #customNext(name: string, c: CustomCycle, from: AnchorString): AnchorString {
    const stored = this.#index.entryByAnchor(name, from);
    if (stored.isSome() && stored.value.endDate !== undefined) {
      const m = localMoment(stored.value.endDate, "YYYY-MM-DD", true).add(1, "day");
      return m.format("YYYY-MM-DD") as AnchorString;
    }
    return customStepForward(from, c);
  }

  #customPrevious(name: string, c: CustomCycle, from: AnchorString): AnchorString {
    const previousEnd = localMoment(from, "YYYY-MM-DD", true).subtract(1, "day").format("YYYY-MM-DD") as AnchorString;
    const closest = this.#index.findClosestAnchor(name, previousEnd);
    if (closest.isSome()) {
      const entry = this.#index.entryByAnchor(name, closest.value);
      if (entry.isSome() && entry.value.endDate === previousEnd) {
        return closest.value;
      }
    }
    return customStepBackward(from, c);
  }

  #cycleFor(name: string): Option<JournalCycle> {
    return this.#journals.get(name).map((c) => buildCycle(c.write));
  }

  anchorOf(name: string, date: CalendarDate): Option<AnchorString> {
    return this.#cycleFor(name).flatMap((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => {
          const period = periodOfKind(c.period, date);
          return Option.some(period.anchor.toAnchor());
        })
        .with({ kind: "custom" }, (c) => {
          const target = date.toAnchor();
          if (target < c.anchor) {
            let current: AnchorString = c.anchor;
            while (target < current) {
              current = this.#customPrevious(name, c, current);
            }
            return Option.some(current);
          }
          let current: AnchorString = c.anchor;
          let nextStart = this.#customNext(name, c, current);
          while (nextStart <= target) {
            current = nextStart;
            nextStart = this.#customNext(name, c, current);
          }
          return Option.some(current);
        })
        .exhaustive(),
    );
  }

  isCanonicalAnchor(name: string, anchor: AnchorString): Option<boolean> {
    return this.anchorOf(name, CalendarDate.fromAnchor(anchor)).map((resolved) => resolved === anchor);
  }

  nextAnchor(name: string, from: AnchorString): Option<AnchorString> {
    return this.#cycleFor(name).flatMap((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => {
          const period = periodOfKind(c.period, CalendarDate.fromAnchor(from));
          return Option.some(period.next().anchor.toAnchor());
        })
        .with({ kind: "custom" }, (c) => Option.some(this.#customNext(name, c, from)))
        .exhaustive(),
    );
  }

  previousAnchor(name: string, from: AnchorString): Option<AnchorString> {
    return this.#cycleFor(name).flatMap((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => {
          const period = periodOfKind(c.period, CalendarDate.fromAnchor(from));
          return Option.some(period.previous().anchor.toAnchor());
        })
        .with({ kind: "custom" }, (c) => Option.some(this.#customPrevious(name, c, from)))
        .exhaustive(),
    );
  }

  startOf(name: string, anchor: AnchorString): Option<CalendarDate> {
    return this.#cycleFor(name).map((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => periodOfKind(c.period, CalendarDate.fromAnchor(anchor)).start)
        .with({ kind: "custom" }, () => CalendarDate.fromAnchor(anchor))
        .exhaustive(),
    );
  }

  representativeOf(name: string, anchor: AnchorString): Option<CalendarDate> {
    return this.#cycleFor(name).map((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => periodOfKind(c.period, CalendarDate.fromAnchor(anchor)).representative)
        .with({ kind: "custom" }, () => CalendarDate.fromAnchor(anchor))
        .exhaustive(),
    );
  }

  endOf(name: string, anchor: AnchorString): Option<CalendarDate> {
    return this.#cycleFor(name).map((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => periodOfKind(c.period, CalendarDate.fromAnchor(anchor)).end)
        .with({ kind: "custom" }, (c) => {
          const stored = this.#index.entryByAnchor(name, anchor);
          if (stored.isSome() && stored.value.endDate !== undefined) {
            return CalendarDate.fromAnchor(stored.value.endDate);
          }
          return customDefaultEnd(anchor, c);
        })
        .exhaustive(),
    );
  }

  // The period's duration-derived end, ignoring any manually extended/shrunk stored end.
  // A stored end equal to this is period metadata, not extension data.
  defaultEndOf(name: string, anchor: AnchorString): Option<CalendarDate> {
    return this.#cycleFor(name).map((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => periodOfKind(c.period, CalendarDate.fromAnchor(anchor)).end)
        .with({ kind: "custom" }, (c) => customDefaultEnd(anchor, c))
        .exhaustive(),
    );
  }

  offsets(name: string, date: CalendarDate): Option<readonly [positive: number, negative: number]> {
    return this.anchorOf(name, date).flatMap((anchor) =>
      this.startOf(name, anchor).flatMap((start) =>
        this.endOf(name, anchor).map((end) => {
          const d = localMoment(date.toAnchor(), "YYYY-MM-DD", true);
          const startM = localMoment(start.toAnchor(), "YYYY-MM-DD", true);
          const endM = localMoment(end.toAnchor(), "YYYY-MM-DD", true);
          return [d.diff(startM, "days") + 1, d.diff(endM, "days") - 1] as const;
        }),
      ),
    );
  }

  intervalsInRange(name: string, start: AnchorString, end: AnchorString): readonly AnchorString[] {
    if (start > end) return [];
    const firstOpt = this.anchorOf(name, CalendarDate.fromAnchor(start));
    if (firstOpt.isNone()) return [];
    const out: AnchorString[] = [];
    let current = firstOpt.value;
    while (current <= end) {
      out.push(current);
      const nextOpt = this.nextAnchor(name, current);
      if (nextOpt.isNone() || nextOpt.value <= current) break;
      current = nextOpt.value;
    }
    return out;
  }

  anchorAtOffset(name: string, from: AnchorString, steps: number): Option<AnchorString> {
    return this.#cycleFor(name).map((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => {
          let period = periodOfKind(c.period, CalendarDate.fromAnchor(from));
          for (let i = 0; i < Math.abs(steps); i++) {
            period = steps >= 0 ? period.next() : period.previous();
          }
          return period.anchor.toAnchor();
        })
        .with({ kind: "custom" }, (c) => {
          let current = from;
          for (let i = 0; i < Math.abs(steps); i++) {
            current = steps >= 0 ? customStepForward(current, c) : customStepBackward(current, c);
          }
          return current;
        })
        .exhaustive(),
    );
  }

  countRepeats(name: string, from: AnchorString, to: AnchorString): Option<number> {
    // NaN is not a count. A bound that does not parse — e.g. the empty anchor a numbering source or
    // timeline start legitimately carries until the user picks a date — would otherwise diff to
    // NaN and travel on as Some(NaN), silently poisoning every comparison downstream: a NaN
    // index rendered into a note, or a timeline that excludes every date.
    if (!isParseableAnchor(from) || !isParseableAnchor(to)) return Option.none();
    return this.#cycleFor(name).map((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => {
          // Both ends must sit on the journal's grid before diffing: `from` is free-form (a
          // timeline start or numbering anchor the user picked mid-period, or a v2 config
          // carried over verbatim) while `to` is always a canonical anchor. A raw diff counts
          // whole periods only when both share the same intra-period offset — a Wednesday
          // start against Monday week anchors otherwise collapses two weeks into one step.
          const a = periodOfKind(c.period, CalendarDate.fromAnchor(from)).anchor;
          const b = periodOfKind(c.period, CalendarDate.fromAnchor(to)).anchor;
          return localMoment(b.toAnchor(), "YYYY-MM-DD", true).diff(
            localMoment(a.toAnchor(), "YYYY-MM-DD", true),
            c.period,
          );
        })
        .with({ kind: "custom" }, (c) => {
          // `from` is free-form (a timeline start the user picked mid-interval) while `to` is
          // always a canonical anchor. Stepping in raw duration increments from an off-grid
          // `from` shifts the count by one interval versus counting from its cycle anchor, the
          // same grid endOf() walks when it computes the repeats bound. And the steps themselves
          // must consult the index (#customNext/#customPrevious), the same as anchorOf/endOf, so
          // a manually extended/shrunk interval counts on the same grid those walk rather than a
          // phantom one computed from the fixed duration.
          const anchoredFrom = this.anchorOf(name, CalendarDate.fromAnchor(from)).getOr(from);
          let current = anchoredFrom;
          let count = 0;
          if (anchoredFrom <= to) {
            while (current < to) {
              const next = this.#customNext(name, c, current);
              // A stored endDate is trusted to advance past its own anchor (nothing else in this
              // file guards #customNext/#customPrevious either), but this loop's exit condition
              // depends on strictly increasing steps in a way the raw stepping never risked —
              // bail rather than spin if a corrupt entry ever breaks that assumption.
              if (next <= current || next > to) break;
              current = next;
              count++;
            }
            return count;
          }
          while (current > to) {
            const previous = this.#customPrevious(name, c, current);
            if (previous >= current || previous < to) break;
            current = previous;
            count++;
          }
          return -count;
        })
        .exhaustive(),
    );
  }
}
