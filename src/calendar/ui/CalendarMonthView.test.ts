import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { DayPeriod, MonthPeriod, OpenInterval } from "@/calendar";
import type { Period } from "@/calendar";
import { date, installTestCalendar, testCalendar } from "@/calendar/testing";

import CalendarMonthView from "./CalendarMonthView.vue";

function mount(props: { outerPeriod: MonthPeriod; selected: Period | null; bounds?: OpenInterval }) {
  return render(CalendarMonthView, { props });
}

function setWeek(dow: number, doy: number): void {
  testCalendar().applyWeekConfig({ dow, doy }, { propagateToGlobal: false });
}

describe("CalendarMonthView", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  describe("day cells", () => {
    it("renders cells for every day in every week overlapping the month", () => {
      const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
      mount({ outerPeriod, selected: null });

      const cells = screen.getAllByTestId("month-cell");
      expect(cells.length).toBeGreaterThanOrEqual(28);
    });
  });

  describe("selection", () => {
    it("marks the selected day with data-selected", () => {
      const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
      const selectedDay = DayPeriod.containing(date("2024-05-10"));
      mount({ outerPeriod, selected: selectedDay });

      const selectedCell = screen.getByRole("button", { name: "10" });
      expect(selectedCell.dataset.selected).toBe("true");
    });
  });

  describe("emit", () => {
    it("emits select with the clicked day's DayPeriod and the MouseEvent", async () => {
      const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
      const { emitted } = mount({ outerPeriod, selected: null });

      const targetCell = screen.getAllByTestId("month-cell").find((c) => c.dataset.anchor === "2024-05-07")!;
      await userEvent.click(targetCell);

      const events = emitted<[DayPeriod, MouseEvent]>("select");
      expect(events).toHaveLength(1);
      expect(events[0][0].start.toAnchor()).toBe("2024-05-07");
      expect(events[0][1]).toBeInstanceOf(MouseEvent);
    });
  });

  describe("bounds", () => {
    it("disables a cell whose day falls outside bounds", () => {
      const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
      const bounds = OpenInterval.from(date("2024-05-10"));
      mount({ outerPeriod, selected: null, bounds });

      const cellForMay1 = screen.getAllByTestId("month-cell").find((c) => c.dataset.anchor === "2024-05-01") as
        HTMLButtonElement | undefined;
      expect(cellForMay1?.disabled).toBe(true);
    });
  });

  describe("weekday header", () => {
    it("orders the header row from the locale's first day of week", () => {
      const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
      setWeek(1, 4);
      mount({ outerPeriod, selected: null });

      const headers = screen.getAllByTestId("weekday-header").map((h) => h.textContent);
      expect(headers).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    });

    it("starts the header row on Sunday when the week starts on Sunday", () => {
      const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
      setWeek(0, 6);
      mount({ outerPeriod, selected: null });

      const headers = screen.getAllByTestId("weekday-header").map((h) => h.textContent);
      expect(headers).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    });

    it("labels each header with the weekday of the cells in its column", () => {
      const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
      setWeek(1, 4);
      mount({ outerPeriod, selected: null });

      const headers = screen.getAllByTestId("weekday-header").map((h) => h.textContent);
      const firstWeek = screen
        .getAllByTestId("month-cell")
        .slice(0, 7)
        .map((c) => date(c.dataset.anchor!).format("ddd"));
      expect(headers).toEqual(firstWeek);
    });

    it("reorders the header row when the week config changes while mounted", async () => {
      const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
      setWeek(1, 4);
      mount({ outerPeriod, selected: null });

      setWeek(0, 6);
      await nextTick();

      const headers = screen.getAllByTestId("weekday-header").map((h) => h.textContent);
      expect(headers).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    });
  });
});
