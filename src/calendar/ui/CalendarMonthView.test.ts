import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Calendar, DayPeriod, MonthPeriod, OpenInterval } from "@/calendar";
import type { Period } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { createTestContainer } from "@/infrastructure/di/testing";

import CalendarMonthView from "./CalendarMonthView.vue";

function mount(
  props: { outerPeriod: MonthPeriod; selected: Period | null; bounds?: OpenInterval },
  calendarOverride?: Calendar,
) {
  const container = createTestContainer();
  const calendar = calendarOverride ?? new Calendar();
  container.register(Calendar).useValue(calendar);

  return render(CalendarMonthView, {
    props,
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
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
    it("emits select with the clicked day's DayPeriod", async () => {
      const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
      const { emitted } = mount({ outerPeriod, selected: null });

      const targetCell = screen.getAllByTestId("month-cell").find((c) => c.dataset.anchor === "2024-05-07")!;
      await userEvent.click(targetCell);

      const events = emitted<[DayPeriod]>("select");
      expect(events).toHaveLength(1);
      expect(events[0][0].start.toAnchor()).toBe("2024-05-07");
    });
  });

  describe("bounds", () => {
    it("disables a cell whose day falls outside bounds", () => {
      const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
      const bounds = OpenInterval.from(date("2024-05-10"));
      mount({ outerPeriod, selected: null, bounds });

      const cellForMay1 = screen.getAllByTestId("month-cell").find((c) => c.dataset.anchor === "2024-05-01") as
        | HTMLButtonElement
        | undefined;
      expect(cellForMay1?.disabled).toBe(true);
    });
  });

  describe("weekday header", () => {
    it("respects Calendar dow configuration", () => {
      const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { propagateToGlobal: false });
      mount({ outerPeriod, selected: null }, calendar);

      const firstHeader = screen.getAllByTestId("weekday-header")[0];
      expect(firstHeader.textContent).toMatch(/Sun/i);
    });
  });
});
