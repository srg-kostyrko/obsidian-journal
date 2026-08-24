import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { DecadePeriod, OpenInterval, YearPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { date } from "@/calendar/testing";

import CalendarDecadeView from "./CalendarDecadeView.vue";

function mount(props: { outerPeriod: DecadePeriod; selected: Period | null; bounds?: OpenInterval }) {
  return render(CalendarDecadeView, { props });
}

describe("CalendarDecadeView", () => {
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
