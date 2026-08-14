import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Calendar, DecadePeriod, OpenInterval, YearPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { date, installTestCalendar, testCalendar } from "@/calendar/testing";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { createTestContainer } from "@/infrastructure/di/testing";

import CalendarDecadeView from "./CalendarDecadeView.vue";

function mount(props: { outerPeriod: DecadePeriod; selected: Period | null; bounds?: OpenInterval }) {
  const container = createTestContainer();
  container.register(Calendar).useValue(testCalendar());

  return render(CalendarDecadeView, {
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

describe("CalendarDecadeView", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  describe("year cells", () => {
    it("renders exactly ten year cells", () => {
      const outerPeriod = DecadePeriod.containing(date("2025-01-01"));
      mount({ outerPeriod, selected: null });

      const cells = screen.getAllByTestId("decade-cell");
      expect(cells).toHaveLength(10);
    });
  });

  describe("emit", () => {
    it("emits select with the clicked year's YearPeriod", async () => {
      const outerPeriod = DecadePeriod.containing(date("2025-01-01"));
      const { emitted } = mount({ outerPeriod, selected: null });

      const cells = screen.getAllByTestId("decade-cell");
      await userEvent.click(cells[5]);

      const events = emitted<[YearPeriod, MouseEvent]>("select");
      expect(events).toHaveLength(1);
      expect(events[0][0].kind).toBe("year");
    });
  });

  describe("selection", () => {
    it("marks the selected year with data-selected", () => {
      const outerPeriod = DecadePeriod.containing(date("2025-01-01"));
      const selected = YearPeriod.containing(date("2025-05-15"));
      mount({ outerPeriod, selected });

      const cells = screen.getAllByTestId("decade-cell");
      const selectedCells = cells.filter((c) => c.dataset.selected === "true");
      expect(selectedCells.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("bounds", () => {
    it("disables a year whose period falls outside bounds", () => {
      const outerPeriod = DecadePeriod.containing(date("2025-01-01"));
      const bounds = OpenInterval.from(date("2026-01-01"));
      mount({ outerPeriod, selected: null, bounds });

      const buttons = screen.getAllByTestId("decade-cell");
      const disabledCount = buttons.filter((b) => (b as HTMLButtonElement).disabled).length;
      expect(disabledCount).toBeGreaterThanOrEqual(1);
    });
  });
});
