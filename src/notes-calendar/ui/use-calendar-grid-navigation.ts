import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from "vue";

import type { AnchorString, Period } from "@/calendar";
import { useToday } from "@/calendar/ui";

export interface CalendarGridItem {
  readonly key: string;
  readonly period: Period;
}

export type CalendarGridRows = readonly (readonly (CalendarGridItem | null)[])[];

interface CalendarGridNavigation {
  readonly grid: Ref<HTMLElement | null>;
  tabIndex(key: string): 0 | -1;
  onFocusIn(event: FocusEvent): void;
  onKeyDown(event: KeyboardEvent): void;
}

/**
 * Implements one roving tab stop inside a calendar grid. Null entries preserve
 * visual columns for blank outside-month dates while remaining non-focusable.
 */
export function useCalendarGridNavigation(
  rows: MaybeRefOrGetter<CalendarGridRows>,
  selectedDate: MaybeRefOrGetter<AnchorString | undefined>,
): CalendarGridNavigation {
  const grid = ref<HTMLElement | null>(null);
  const focusedKey = ref<string>();
  const today = useToday();

  const currentKey = computed(() => {
    const matrix = toValue(rows);
    const items = matrix.flatMap((row) => row.filter((item): item is CalendarGridItem => item !== null));
    if (focusedKey.value !== undefined && items.some((item) => item.key === focusedKey.value)) {
      return focusedKey.value;
    }

    const selected = toValue(selectedDate);
    const selectedItem =
      selected === undefined
        ? undefined
        : (items.find((item) => item.period.kind === "day" && item.period.representative.toAnchor() === selected) ??
          items.find((item) => item.period.representative.toAnchor() === selected));
    if (selectedItem !== undefined) return selectedItem.key;

    const todayItem =
      items.find((item) => item.period.kind === "day" && item.period.contains(today.value)) ??
      items.find((item) => item.period.contains(today.value));
    return todayItem?.key ?? items[0]?.key;
  });

  function tabIndex(key: string): 0 | -1 {
    return currentKey.value === key ? 0 : -1;
  }

  function itemElement(target: EventTarget | null): HTMLElement | null {
    if (target === null || typeof target !== "object" || !("closest" in target)) return null;
    const closest = target.closest;
    return typeof closest === "function" ? (closest.call(target, "[data-grid-key]") as HTMLElement | null) : null;
  }

  function onFocusIn(event: FocusEvent): void {
    const key = itemElement(event.target)?.dataset.gridKey;
    if (key !== undefined) focusedKey.value = key;
  }

  function findPosition(key: string): { row: number; column: number } | undefined {
    const matrix = toValue(rows);
    for (const [rowIndex, row] of matrix.entries()) {
      const column = row.findIndex((item) => item?.key === key);
      if (column !== -1) return { row: rowIndex, column };
    }
    return undefined;
  }

  function horizontalTarget(row: number, column: number, delta: -1 | 1): CalendarGridItem | undefined {
    const items = toValue(rows).flatMap((gridRow) => gridRow.filter((item): item is CalendarGridItem => item !== null));
    const current = toValue(rows)[row]?.[column];
    if (current === null || current === undefined) return undefined;
    const index = items.findIndex((item) => item.key === current.key);
    return items[index + delta];
  }

  function verticalTarget(row: number, column: number, delta: -1 | 1): CalendarGridItem | undefined {
    const matrix = toValue(rows);
    for (let nextRow = row + delta; nextRow >= 0 && nextRow < matrix.length; nextRow += delta) {
      const item = matrix[nextRow]?.[column];
      if (item !== null && item !== undefined) return item;
    }
    return undefined;
  }

  function rowEndTarget(row: number, end: "first" | "last"): CalendarGridItem | undefined {
    const items = toValue(rows)[row]?.filter((item): item is CalendarGridItem => item !== null) ?? [];
    return end === "first" ? items[0] : items.at(-1);
  }

  function focus(item: CalendarGridItem | undefined, root: EventTarget | null): void {
    if (item === undefined) return;
    focusedKey.value = item.key;
    const queryRoot =
      root !== null && typeof root === "object" && "querySelectorAll" in root ? (root as HTMLElement) : grid.value;
    const elements = queryRoot?.querySelectorAll<HTMLElement>("[data-grid-key]") ?? [];
    [...elements].find((element) => element.dataset.gridKey === item.key)?.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    const key = itemElement(event.target)?.dataset.gridKey;
    if (key === undefined) return;
    const position = findPosition(key);
    if (position === undefined) return;

    let target: CalendarGridItem | undefined;
    switch (event.key) {
      case "ArrowLeft": {
        target = horizontalTarget(position.row, position.column, -1);
        break;
      }
      case "ArrowRight": {
        target = horizontalTarget(position.row, position.column, 1);
        break;
      }
      case "ArrowUp": {
        target = verticalTarget(position.row, position.column, -1);
        break;
      }
      case "ArrowDown": {
        target = verticalTarget(position.row, position.column, 1);
        break;
      }
      case "Home": {
        target = rowEndTarget(position.row, "first");
        break;
      }
      case "End": {
        target = rowEndTarget(position.row, "last");
        break;
      }
      default: {
        return;
      }
    }

    event.preventDefault();
    focus(target, event.currentTarget);
  }

  return { grid, tabIndex, onFocusIn, onKeyDown };
}
