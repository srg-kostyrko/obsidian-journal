import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import { type CalendarDate, DayPeriod, MonthPeriod, OpenInterval, YearPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";

import { useCalendarGrid } from "./use-calendar-grid";

function monthCells(refDate: CalendarDate): readonly DayPeriod[] {
  const m = MonthPeriod.containing(refDate);
  const cells: DayPeriod[] = [];
  for (const week of m.weeks()) {
    for (const day of week.days()) cells.push(DayPeriod.containing(day));
  }
  return cells;
}

describe("useCalendarGrid", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("isSelected", () => {
    it("marks the cell whose period matches the selection of the same kind", () => {
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: DayPeriod.containing(date("2025-03-15")),
        today: date("2099-01-01"),
      });

      expect(cells.value.find((c) => c.isSelected)?.period.start.toAnchor()).toBe("2025-03-15");
    });

    it("does not mark any cell when the selection is a different period kind", () => {
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: YearPeriod.containing(date("2025-03-15")),
        today: date("2099-01-01"),
      });

      expect(cells.value.some((c) => c.isSelected)).toBe(false);
    });
  });

  describe("isDisabled", () => {
    it("disables a cell whose period falls entirely outside the bounds", () => {
      const bounds = OpenInterval.from(date("2025-03-10"));
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2099-01-01"),
        bounds,
      });

      expect(cells.value.find((c) => c.period.start.toAnchor() === "2025-03-05")?.isDisabled).toBe(true);
    });

    it("does not disable a cell whose period overlaps the bounds", () => {
      const bounds = OpenInterval.from(date("2025-03-10"));
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2099-01-01"),
        bounds,
      });

      expect(cells.value.find((c) => c.period.start.toAnchor() === "2025-03-15")?.isDisabled).toBe(false);
    });
  });

  describe("isOutside", () => {
    it("marks a cell as outside when the predicate returns true", () => {
      const outer = MonthPeriod.containing(date("2025-03-15"));
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2099-01-01"),
        outsidePredicate: (p) => !outer.contains(p.start),
      });

      const someOutside = cells.value.some((c) => c.isOutside);
      expect(someOutside).toBe(true);
    });

    it("leaves cells unmarked when no predicate is given", () => {
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2099-01-01"),
      });

      expect(cells.value.every((c) => c.isOutside === false)).toBe(true);
    });
  });

  describe("isToday", () => {
    it("marks the cell whose period contains today", () => {
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2025-03-12"),
      });

      expect(cells.value.find((c) => c.isToday)?.period.start.toAnchor()).toBe("2025-03-12");
    });
  });

  describe("label", () => {
    it("formats each cell using the supplied pattern", () => {
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2099-01-01"),
      });

      const inMonth = cells.value.find((c) => c.period.start.toAnchor() === "2025-03-15");
      expect(inMonth?.label).toBe("15");
    });
  });

  describe("reactivity", () => {
    it("recomputes when the selected ref changes", () => {
      const selected = ref<DayPeriod | null>(null);
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected,
        today: date("2099-01-01"),
      });

      expect(cells.value.some((c) => c.isSelected)).toBe(false);

      selected.value = DayPeriod.containing(date("2025-03-15"));
      expect(cells.value.find((c) => c.isSelected)?.period.start.toAnchor()).toBe("2025-03-15");
    });
  });

  describe("with reactive inputs", () => {
    it("does not throw when today is passed as a ref", () => {
      const todayRef = ref(date("2025-03-12"));
      expect(() =>
        useCalendarGrid({
          cells: monthCells(date("2025-03-15")),
          formatPattern: "D",
          selected: null,
          today: todayRef,
        }).value.find((c) => c.isToday),
      ).not.toThrow();
    });
  });
});
