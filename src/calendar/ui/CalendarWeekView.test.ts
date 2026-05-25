import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Calendar, MonthPeriod, OpenInterval, WeekPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { createTestContainer } from "@/infrastructure/di/testing";

import CalendarWeekView from "./CalendarWeekView.vue";

function mount(
  props: { outerPeriod: MonthPeriod; selected: Period | null; bounds?: OpenInterval },
  calendar?: Calendar,
) {
  const container = createTestContainer();
  container.register(Calendar).useValue(calendar ?? new Calendar());

  return render(CalendarWeekView, {
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

describe("CalendarWeekView", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  describe("week cells", () => {
    it("renders one cell per week overlapping the month", () => {
      const outerPeriod = MonthPeriod.containing(date("2025-03-15"));
      mount({ outerPeriod, selected: null });

      const cells = screen.getAllByTestId("week-cell");
      expect(cells.length).toBeGreaterThanOrEqual(4);
      expect(cells.length).toBeLessThanOrEqual(6);
    });
  });

  describe("emit", () => {
    it("emits select with the clicked week's WeekPeriod", async () => {
      const outerPeriod = MonthPeriod.containing(date("2025-03-15"));
      const { emitted } = mount({ outerPeriod, selected: null });

      const cells = screen.getAllByTestId("week-cell");
      await userEvent.click(cells[0]);

      const events = emitted<[WeekPeriod, MouseEvent]>("select");
      expect(events).toHaveLength(1);
      expect(events[0][0].kind).toBe("week");
    });
  });

  describe("selection", () => {
    it("marks the selected week with data-selected", () => {
      const calendar = new Calendar();
      const outerPeriod = MonthPeriod.containing(date("2025-03-15"));
      const selected = WeekPeriod.containing(date("2025-03-15"));
      mount({ outerPeriod, selected }, calendar);

      const anchor = selected.anchor.toAnchor();
      const selectedCell = screen.getAllByTestId("week-cell").find((c) => c.dataset.anchor === anchor);
      expect(selectedCell?.dataset.selected).toBe("true");
    });
  });

  describe("bounds", () => {
    it("disables a cell whose week falls outside bounds", () => {
      const outerPeriod = MonthPeriod.containing(date("2025-03-15"));
      const bounds = OpenInterval.from(date("2025-03-15"));
      mount({ outerPeriod, selected: null, bounds });

      const buttons = screen.getAllByTestId("week-cell");
      const disabledCount = buttons.filter((b) => (b as HTMLButtonElement).disabled).length;
      expect(disabledCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("cell label", () => {
    it("renders the week number and date range in the cell text", () => {
      const outerPeriod = MonthPeriod.containing(date("2025-03-15"));
      mount({ outerPeriod, selected: null });

      const cells = screen.getAllByTestId("week-cell");
      const marchCell = cells.find((c) => /Mar/i.test(c.textContent ?? ""));
      expect(marchCell?.textContent).toMatch(/W\d+/);
      expect(marchCell?.textContent).toMatch(/Mar \d+/i);
    });
  });
});
