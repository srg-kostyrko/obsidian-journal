import { computed, toRaw, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

import type { CalendarDate, OpenInterval, Period } from "@/calendar";

export interface Cell {
  readonly period: Period;
  readonly label: string;
  readonly key: string;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
  readonly isOutside: boolean;
  readonly isToday: boolean;
}

export interface UseCalendarGridOptions {
  cells: MaybeRefOrGetter<readonly Period[]>;
  formatPattern: string;
  selected: MaybeRefOrGetter<Period | null>;
  today: MaybeRefOrGetter<CalendarDate>;
  bounds?: MaybeRefOrGetter<OpenInterval | undefined>;
  outsidePredicate?: (period: Period) => boolean;
}

export function useCalendarGrid(options: UseCalendarGridOptions): ComputedRef<readonly Cell[]> {
  return computed(() => {
    const periods = toValue(options.cells).map(toRaw);
    const selected = toRaw(toValue(options.selected));
    const bounds = options.bounds ? toRaw(toValue(options.bounds)) : undefined;
    const today = toRaw(toValue(options.today));
    const outside = options.outsidePredicate;

    return periods.map((period) => {
      const key = `${period.kind}:${period.anchor.toAnchor()}`;
      const isSelected =
        selected !== null && selected.kind === period.kind
          ? (period as unknown as { isSame(o: Period): boolean }).isSame(selected)
          : false;
      const isDisabled = bounds ? !bounds.overlapsPeriod(period) : false;
      const isOutside = outside ? outside(period) : false;
      const isToday = period.contains(today);
      const label = period.format(options.formatPattern);
      return { period, label, key, isSelected, isDisabled, isOutside, isToday };
    });
  });
}
