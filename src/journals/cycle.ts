import { match } from "ts-pattern";

import { CalendarDate, DayPeriod, DecadePeriod, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod } from "@/calendar";
import type { AnchorString, PeriodKind } from "@/calendar";
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

interface PeriodLike {
  readonly anchor: CalendarDate;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  next(): PeriodLike;
  previous(): PeriodLike;
}

const PERIOD_CTORS: Record<PeriodKind, (d: CalendarDate) => PeriodLike> = {
  day: (d) => DayPeriod.containing(d),
  week: (d) => WeekPeriod.containing(d),
  month: (d) => MonthPeriod.containing(d),
  quarter: (d) => QuarterPeriod.containing(d),
  year: (d) => YearPeriod.containing(d),
  decade: (d) => DecadePeriod.containing(d),
};

function customStepForward(anchor: AnchorString, every: MomentDurationUnit, duration: number): AnchorString {
  const m = localMoment(anchor, "YYYY-MM-DD", true);
  if (every === "month" && m.date() > 28) {
    const monthEnd = m.clone().endOf("month");
    const delta = monthEnd.diff(m, "days");
    const nextEnd = monthEnd.clone().add(duration, "month").endOf("month");
    return nextEnd.clone().subtract(delta, "days").format("YYYY-MM-DD") as AnchorString;
  }
  return m.clone().add(duration, every).format("YYYY-MM-DD") as AnchorString;
}

function customStepBackward(anchor: AnchorString, every: MomentDurationUnit, duration: number): AnchorString {
  const m = localMoment(anchor, "YYYY-MM-DD", true);
  if (every === "month" && m.date() > 28) {
    const monthEnd = m.clone().endOf("month");
    const delta = monthEnd.diff(m, "days");
    const previousEnd = monthEnd.clone().subtract(duration, "month").endOf("month");
    return previousEnd.clone().add(delta, "days").format("YYYY-MM-DD") as AnchorString;
  }
  return m.clone().subtract(duration, every).format("YYYY-MM-DD") as AnchorString;
}

export class CycleService {
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);

  anchorOf(name: string, date: CalendarDate): Option<AnchorString> {
    return this.#cycleFor(name).flatMap((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => {
          const period = PERIOD_CTORS[c.period](date);
          return Option.some(period.anchor.toAnchor());
        })
        .with({ kind: "custom" }, (c) => {
          const target = date.toAnchor();
          if (target < c.anchor) {
            let current = c.anchor;
            while (target < current) {
              current = customStepBackward(current, c.every, c.duration);
            }
            return Option.some(current);
          }
          let current = c.anchor;
          let nextStart = customStepForward(current, c.every, c.duration);
          while (nextStart <= target) {
            current = nextStart;
            nextStart = customStepForward(current, c.every, c.duration);
          }
          return Option.some(current);
        })
        .exhaustive(),
    );
  }

  nextAnchor(name: string, from: AnchorString): Option<AnchorString> {
    return this.#cycleFor(name).flatMap((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => {
          const period = PERIOD_CTORS[c.period](CalendarDate.fromAnchor(from));
          return Option.some(period.next().anchor.toAnchor());
        })
        .with({ kind: "custom" }, (c) => {
          const stored = this.#index.entryByAnchor(name, from);
          if (stored.isSome() && stored.value.endDate !== undefined) {
            const m = localMoment(stored.value.endDate, "YYYY-MM-DD", true).add(1, "day");
            return Option.some(m.format("YYYY-MM-DD") as AnchorString);
          }
          return Option.some(customStepForward(from, c.every, c.duration));
        })
        .exhaustive(),
    );
  }

  previousAnchor(name: string, from: AnchorString): Option<AnchorString> {
    return this.#cycleFor(name).flatMap((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => {
          const period = PERIOD_CTORS[c.period](CalendarDate.fromAnchor(from));
          return Option.some(period.previous().anchor.toAnchor());
        })
        .with({ kind: "custom" }, (c) => Option.some(customStepBackward(from, c.every, c.duration)))
        .exhaustive(),
    );
  }

  startOf(name: string, anchor: AnchorString): Option<CalendarDate> {
    return this.#cycleFor(name).map((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => PERIOD_CTORS[c.period](CalendarDate.fromAnchor(anchor)).start)
        .with({ kind: "custom" }, () => CalendarDate.fromAnchor(anchor))
        .exhaustive(),
    );
  }

  endOf(name: string, anchor: AnchorString): Option<CalendarDate> {
    return this.#cycleFor(name).map((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => PERIOD_CTORS[c.period](CalendarDate.fromAnchor(anchor)).end)
        .with({ kind: "custom" }, (c) => {
          const stored = this.#index.entryByAnchor(name, anchor);
          if (stored.isSome() && stored.value.endDate !== undefined) {
            return CalendarDate.fromAnchor(stored.value.endDate);
          }
          const next = customStepForward(anchor, c.every, c.duration);
          const end = localMoment(next, "YYYY-MM-DD", true).subtract(1, "day");
          return CalendarDate.fromAnchor(end.format("YYYY-MM-DD") as AnchorString);
        })
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

  countRepeats(name: string, from: AnchorString, to: AnchorString): Option<number> {
    return this.#cycleFor(name).map((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => {
          const a = localMoment(from, "YYYY-MM-DD", true);
          const b = localMoment(to, "YYYY-MM-DD", true);
          return Math.ceil(b.diff(a, c.period));
        })
        .with({ kind: "custom" }, (c) => {
          let current = from;
          let count = 0;
          if (from <= to) {
            while (current < to) {
              const next = customStepForward(current, c.every, c.duration);
              if (next > to) break;
              current = next;
              count++;
            }
            return count;
          }
          while (current > to) {
            const previous = customStepBackward(current, c.every, c.duration);
            if (previous < to) break;
            current = previous;
            count++;
          }
          return -count;
        })
        .exhaustive(),
    );
  }

  #cycleFor(name: string): Option<JournalCycle> {
    return this.#journals.get(name).map((c) => buildCycle(c.write));
  }
}
