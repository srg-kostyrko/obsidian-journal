import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Calendar, OpenInterval, QuarterPeriod, YearPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { createTestContainer } from "@/infrastructure/di/testing";

import CalendarQuarterView from "./CalendarQuarterView.vue";

function mount(props: { outerPeriod: YearPeriod; selected: Period | null; bounds?: OpenInterval }) {
  const container = createTestContainer();
  container.register(Calendar).useValue(new Calendar());

  return render(CalendarQuarterView, {
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

describe("CalendarQuarterView", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  describe("quarter cells", () => {
    it("renders exactly four quarter cells", () => {
      const outerPeriod = YearPeriod.containing(date("2025-01-01"));
      mount({ outerPeriod, selected: null });

      const cells = screen.getAllByTestId("quarter-cell");
      expect(cells).toHaveLength(4);
    });
  });

  describe("emit", () => {
    it("emits select with the clicked quarter's QuarterPeriod", async () => {
      const outerPeriod = YearPeriod.containing(date("2025-01-01"));
      const { emitted } = mount({ outerPeriod, selected: null });

      const cells = screen.getAllByTestId("quarter-cell");
      await userEvent.click(cells[2]);

      const events = emitted<[QuarterPeriod]>("select");
      expect(events).toHaveLength(1);
      expect(events[0][0].kind).toBe("quarter");
    });
  });

  describe("selection", () => {
    it("marks the selected quarter with data-selected", () => {
      const outerPeriod = YearPeriod.containing(date("2025-01-01"));
      const selected = QuarterPeriod.containing(date("2025-05-15"));
      mount({ outerPeriod, selected });

      const cells = screen.getAllByTestId("quarter-cell");
      const selectedCells = cells.filter((c) => c.dataset.selected === "true");
      expect(selectedCells.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("bounds", () => {
    it("disables a quarter whose period falls outside bounds", () => {
      const outerPeriod = YearPeriod.containing(date("2025-01-01"));
      const bounds = OpenInterval.from(date("2025-07-01"));
      mount({ outerPeriod, selected: null, bounds });

      const buttons = screen.getAllByTestId("quarter-cell");
      const disabledCount = buttons.filter((b) => (b as HTMLButtonElement).disabled).length;
      expect(disabledCount).toBeGreaterThanOrEqual(1);
    });
  });
});
