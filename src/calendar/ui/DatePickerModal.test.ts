import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import {
  CalendarDate,
  DayPeriod,
  MonthPeriod,
  OpenInterval,
  type Period,
  QuarterPeriod,
  WeekPeriod,
  YearPeriod,
} from "@/calendar";
import { date } from "@/calendar/testing";
import { testContainer } from "@/testing";

import DatePickerModal from "./DatePickerModal.vue";

async function renderModal(options: {
  picking: "day" | "week" | "month" | "quarter" | "year";
  selected?: Period | null;
  bounds?: OpenInterval;
}) {
  const harness = await testContainer();
  return harness.renderModal<typeof DatePickerModal, Period>(DatePickerModal, {
    props: { picking: options.picking, selected: options.selected, bounds: options.bounds },
  });
}

describe("DatePickerModal", () => {
  describe("initial view", () => {
    it("opens at the month view when picking is day", async () => {
      const selected = DayPeriod.containing(date("2025-03-15"));
      await renderModal({ picking: "day", selected });

      expect(screen.queryAllByTestId("month-cell").length).toBeGreaterThan(0);
    });

    it("opens at the week view when picking is week", async () => {
      const selected = WeekPeriod.containing(date("2025-03-15"));
      await renderModal({ picking: "week", selected });

      expect(screen.queryAllByTestId("week-cell").length).toBeGreaterThan(0);
    });

    it("opens at the year view when picking is month", async () => {
      const selected = MonthPeriod.containing(date("2025-03-15"));
      await renderModal({ picking: "month", selected });

      expect(screen.queryAllByTestId("year-cell").length).toBeGreaterThan(0);
    });

    it("opens at the quarter view when picking is quarter", async () => {
      const selected = QuarterPeriod.containing(date("2025-03-15"));
      await renderModal({ picking: "quarter", selected });

      expect(screen.queryAllByTestId("quarter-cell").length).toBeGreaterThan(0);
    });

    it("opens at the decade view when picking is year", async () => {
      const selected = YearPeriod.containing(date("2025-03-15"));
      await renderModal({ picking: "year", selected });

      expect(screen.queryAllByTestId("decade-cell").length).toBeGreaterThan(0);
    });

    it("opens on the bounded period when there is no selection and bounds lie entirely in the past", async () => {
      const end = CalendarDate.today().shift(-2, "y");
      const bounds = OpenInterval.until(end);
      await renderModal({ picking: "day", selected: null, bounds });

      expect(screen.getByTestId("modal-title-label").textContent).toBe(end.format("MMMM YYYY"));
    });

    it("opens on the bounded period when there is no selection and bounds lie entirely in the future", async () => {
      const start = CalendarDate.today().shift(2, "y");
      const bounds = OpenInterval.from(start);
      await renderModal({ picking: "day", selected: null, bounds });

      expect(screen.getByTestId("modal-title-label").textContent).toBe(start.format("MMMM YYYY"));
    });
  });

  describe("target click", () => {
    it("submits the clicked period when in target view", async () => {
      const selected = DayPeriod.containing(date("2025-03-15"));
      const { submit } = await renderModal({ picking: "day", selected });

      const cells = screen.getAllByTestId("month-cell");
      const march15 = cells.find((c) => c.dataset.anchor === "2025-03-15")!;
      await userEvent.click(march15);

      expect(submit).toHaveBeenCalledOnce();
      const submitted = submit.mock.calls[0][0] as DayPeriod;
      expect(submitted.kind).toBe("day");
      expect(submitted.start.toAnchor()).toBe("2025-03-15");
    });
  });

  describe("descent", () => {
    it("descends from decade to year view for picking=day after a year click", async () => {
      const selected = DayPeriod.containing(date("2025-03-15"));
      await renderModal({ picking: "day", selected });

      // Ascend month → year
      await userEvent.click(screen.getByTestId("modal-title-button"));
      // Ascend year → decade
      await userEvent.click(screen.getByTestId("modal-title-button"));

      // Now in decade view — click a year cell
      const decadeCells = screen.getAllByTestId("decade-cell");
      await userEvent.click(decadeCells[0]);

      // Should now show year-cells (year view)
      expect(screen.queryAllByTestId("year-cell").length).toBeGreaterThan(0);
    });

    it("descends from year to month view for picking=day after a month click", async () => {
      const selected = DayPeriod.containing(date("2025-03-15"));
      await renderModal({ picking: "day", selected });

      // Ascend month → year
      await userEvent.click(screen.getByTestId("modal-title-button"));

      // In year view — click a month cell
      const yearCells = screen.getAllByTestId("year-cell");
      await userEvent.click(yearCells[0]);

      // Should now show month-cells (month view)
      expect(screen.queryAllByTestId("month-cell").length).toBeGreaterThan(0);
    });
  });

  describe("drill up", () => {
    it("ascends from month to year on title click", async () => {
      const selected = DayPeriod.containing(date("2025-03-15"));
      await renderModal({ picking: "day", selected });

      await userEvent.click(screen.getByTestId("modal-title-button"));

      expect(screen.queryAllByTestId("year-cell").length).toBeGreaterThan(0);
    });
  });

  describe("navigation", () => {
    it("moves to the previous outer period when prev is clicked", async () => {
      const selected = DayPeriod.containing(date("2025-03-15"));
      await renderModal({ picking: "day", selected });

      const titleBefore = screen.getByTestId("modal-title-label").textContent;
      await userEvent.click(screen.getByTestId("modal-prev"));
      const titleAfter = screen.getByTestId("modal-title-label").textContent;

      expect(titleAfter).not.toBe(titleBefore);
    });

    it("hides prev when the previous outer period does not overlap bounds", async () => {
      // Bounds start from 2025-03-01, so previous month (Feb 2025) is entirely before bounds
      const selected = DayPeriod.containing(date("2025-03-15"));
      const bounds = OpenInterval.from(date("2025-03-01"));
      await renderModal({ picking: "day", selected, bounds });

      expect(screen.queryByTestId("modal-prev")).toBeNull();
    });
  });
});
