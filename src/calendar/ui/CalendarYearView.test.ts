import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Calendar, MonthPeriod, OpenInterval, YearPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { createTestContainer } from "@/infrastructure/di/testing";

import CalendarYearView from "./CalendarYearView.vue";

function mount(props: { outerPeriod: YearPeriod; selected: Period | null; bounds?: OpenInterval }) {
  const container = createTestContainer();
  container.register(Calendar).useValue(new Calendar());

  return render(CalendarYearView, {
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

describe("CalendarYearView", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  describe("month cells", () => {
    it("renders exactly twelve month cells", () => {
      const outerPeriod = YearPeriod.containing(date("2025-01-01"));
      mount({ outerPeriod, selected: null });

      const cells = screen.getAllByTestId("year-cell");
      expect(cells).toHaveLength(12);
    });
  });

  describe("emit", () => {
    it("emits select with the clicked month's MonthPeriod", async () => {
      const outerPeriod = YearPeriod.containing(date("2025-01-01"));
      const { emitted } = mount({ outerPeriod, selected: null });

      const cells = screen.getAllByTestId("year-cell");
      await userEvent.click(cells[4]);

      const events = emitted<[MonthPeriod, MouseEvent]>("select");
      expect(events).toHaveLength(1);
      expect(events[0][0].start.toAnchor()).toBe("2025-05-01");
    });
  });

  describe("selection", () => {
    it("marks the selected month with data-selected", () => {
      const outerPeriod = YearPeriod.containing(date("2025-01-01"));
      const selected = MonthPeriod.containing(date("2025-05-15"));
      mount({ outerPeriod, selected });

      const cells = screen.getAllByTestId("year-cell");
      const selectedCells = cells.filter((c) => c.dataset.selected === "true");
      expect(selectedCells.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("bounds", () => {
    it("disables a month whose period falls outside bounds", () => {
      const outerPeriod = YearPeriod.containing(date("2025-01-01"));
      const bounds = OpenInterval.from(date("2025-07-01"));
      mount({ outerPeriod, selected: null, bounds });

      const buttons = screen.getAllByTestId("year-cell");
      const disabledCount = buttons.filter((b) => (b as HTMLButtonElement).disabled).length;
      expect(disabledCount).toBeGreaterThanOrEqual(1);
    });
  });
});
