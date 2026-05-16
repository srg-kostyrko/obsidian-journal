import { match } from "ts-pattern";
import { computed, toRaw, toValue, type MaybeRefOrGetter, type Ref, type WritableComputedRef } from "vue";

import {
  CalendarDate,
  DayPeriod,
  MonthPeriod,
  QuarterPeriod,
  WeekPeriod,
  YearPeriod,
  type AnchorString,
  type Period,
} from "@/calendar";
import type { Picking } from "@/calendar/ui";

export function useAnchorField(options: {
  anchor: Ref<AnchorString>;
  picking: MaybeRefOrGetter<Picking>;
}): WritableComputedRef<Period | null> {
  return computed({
    get: () => {
      const a = options.anchor.value;
      if (!a) return null;
      const picking = toValue(options.picking);
      const calendarDate = CalendarDate.fromAnchor(a);
      return periodContaining(picking, calendarDate);
    },
    set: (period) => {
      const raw = period ? toRaw(period) : null;
      const rawAnchor = raw ? toRaw(raw.anchor) : null;
      options.anchor.value = (rawAnchor ? rawAnchor.toAnchor() : "") as AnchorString;
    },
  });
}

function periodContaining(picking: Picking, d: CalendarDate): Period {
  return match(picking)
    .with("day", () => DayPeriod.containing(d))
    .with("week", () => WeekPeriod.containing(d))
    .with("month", () => MonthPeriod.containing(d))
    .with("quarter", () => QuarterPeriod.containing(d))
    .with("year", () => YearPeriod.containing(d))
    .exhaustive();
}
