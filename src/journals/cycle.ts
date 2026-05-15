import { match } from "ts-pattern";

import { CalendarDate, DayPeriod, DecadePeriod, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod } from "@/calendar";
import type { AnchorString, PeriodKind } from "@/calendar";
import { localMoment } from "@/calendar/calendar";
import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { journalConfigCollection } from "./config";
import { JournalsIndex } from "./journals-index";

import type { JournalConfig, JournalWrite } from "./config";

type MomentDurationUnit = "day" | "week" | "month" | "quarter" | "year";

export type JournalCycle =
  | { readonly kind: "fixed"; readonly period: PeriodKind }
  | {
      readonly kind: "custom";
      readonly every: MomentDurationUnit;
      readonly duration: number;
      readonly anchor: AnchorString;
    };

export function buildCycle(write: JournalWrite): JournalCycle {
  return match(write)
    .with({ type: "custom" }, (w) => ({
      kind: "custom" as const,
      every: w.every,
      duration: w.duration,
      anchor: w.anchorDate,
    }))
    .otherwise((w) => ({ kind: "fixed" as const, period: w.type }));
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
  readonly #settings = inject(SettingsService);
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

  #cycleFor(name: string): Option<JournalCycle> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name);
    return Option.fromNullable(config as JournalConfig | undefined).map((c) => buildCycle(c.write));
  }
}
