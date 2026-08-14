import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

import { CalendarDate, periodOfKind, window, type AnchorString, type MonthPeriod, type WeekPeriod } from "@/calendar";

export function usePeriodWindow(
  kind: "month",
  refDate: MaybeRefOrGetter<AnchorString>,
  before: MaybeRefOrGetter<number>,
  after: MaybeRefOrGetter<number>,
): ComputedRef<readonly MonthPeriod[]>;
export function usePeriodWindow(
  kind: "week",
  refDate: MaybeRefOrGetter<AnchorString>,
  before: MaybeRefOrGetter<number>,
  after: MaybeRefOrGetter<number>,
): ComputedRef<readonly WeekPeriod[]>;
export function usePeriodWindow(
  kind: "month" | "week",
  refDate: MaybeRefOrGetter<AnchorString>,
  before: MaybeRefOrGetter<number>,
  after: MaybeRefOrGetter<number>,
): ComputedRef<readonly (MonthPeriod | WeekPeriod)[]> {
  return computed(() => {
    const focus = periodOfKind(kind, CalendarDate.fromAnchor(toValue(refDate))) as MonthPeriod | WeekPeriod;
    return window(focus, toValue(before), toValue(after));
  });
}
