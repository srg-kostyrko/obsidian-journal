import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  Calendar,
  CalendarDate,
  DayPeriod,
  MonthPeriod,
  OpenInterval,
  type Period,
  QuarterPeriod,
  WeekPeriod,
  YearPeriod,
} from "@/calendar";
import { date, installTestCalendar, testCalendar } from "@/calendar/testing";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { createTestContainer } from "@/infrastructure/di/testing";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import DatePickerModal from "./DatePickerModal.vue";

function renderModal(options: {
  picking: "day" | "week" | "month" | "quarter" | "year";
  selected?: Period | null;
  bounds?: OpenInterval;
  submit?: (v: unknown) => void;
  cancel?: () => void;
}) {
  const container = createTestContainer();
  container.register(Calendar).useValue(testCalendar());
  const submit = options.submit ?? vi.fn();
  const cancel = options.cancel ?? vi.fn();
  return {
    submit,
    cancel,
    ...render(DatePickerModal, {
      props: { picking: options.picking, selected: options.selected, bounds: options.bounds },
      global: {
        plugins: [
          {
            install(app) {
              provideInjectorOnApp(app, container);
              provideModalApiOnApp(app, { submit, cancel });
            },
          },
        ],
      },
    }),
  };
}

describe("DatePickerModal", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  describe("initial view", () => {
    it("opens at the month view when picking is day", () => {
      const selected = DayPeriod.containing(date("2025-03-15"));
      renderModal({ picking: "day", selected });

      expect(screen.queryAllByTestId("month-cell").length).toBeGreaterThan(0);
    });

    it("opens at the week view when picking is week", () => {
      const selected = WeekPeriod.containing(date("2025-03-15"));
      renderModal({ picking: "week", selected });

      expect(screen.queryAllByTestId("week-cell").length).toBeGreaterThan(0);
    });

    it("opens at the year view when picking is month", () => {
      const selected = MonthPeriod.containing(date("2025-03-15"));
      renderModal({ picking: "month", selected });

      expect(screen.queryAllByTestId("year-cell").length).toBeGreaterThan(0);
    });

    it("opens at the quarter view when picking is quarter", () => {
      const selected = QuarterPeriod.containing(date("2025-03-15"));
      renderModal({ picking: "quarter", selected });

      expect(screen.queryAllByTestId("quarter-cell").length).toBeGreaterThan(0);
    });

    it("opens at the decade view when picking is year", () => {
      const selected = YearPeriod.containing(date("2025-03-15"));
      renderModal({ picking: "year", selected });

      expect(screen.queryAllByTestId("decade-cell").length).toBeGreaterThan(0);
    });

    it("opens on the bounded period when there is no selection and bounds lie entirely in the past", () => {
      const end = CalendarDate.today().shift(-2, "y");
      const bounds = OpenInterval.until(end);
      renderModal({ picking: "day", selected: null, bounds });

      expect(screen.getByTestId("modal-title-label").textContent).toBe(end.format("MMMM YYYY"));
    });

    it("opens on the bounded period when there is no selection and bounds lie entirely in the future", () => {
      const start = CalendarDate.today().shift(2, "y");
      const bounds = OpenInterval.from(start);
      renderModal({ picking: "day", selected: null, bounds });

      expect(screen.getByTestId("modal-title-label").textContent).toBe(start.format("MMMM YYYY"));
    });
  });

  describe("target click", () => {
    it("submits the clicked period when in target view", async () => {
      const submit = vi.fn();
      const selected = DayPeriod.containing(date("2025-03-15"));
      renderModal({ picking: "day", selected, submit });

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
      renderModal({ picking: "day", selected });

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
      renderModal({ picking: "day", selected });

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
      renderModal({ picking: "day", selected });

      await userEvent.click(screen.getByTestId("modal-title-button"));

      expect(screen.queryAllByTestId("year-cell").length).toBeGreaterThan(0);
    });
  });

  describe("navigation", () => {
    it("moves to the previous outer period when prev is clicked", async () => {
      const selected = DayPeriod.containing(date("2025-03-15"));
      renderModal({ picking: "day", selected });

      const titleBefore = screen.getByTestId("modal-title-label").textContent;
      await userEvent.click(screen.getByTestId("modal-prev"));
      const titleAfter = screen.getByTestId("modal-title-label").textContent;

      expect(titleAfter).not.toBe(titleBefore);
    });

    it("hides prev when the previous outer period does not overlap bounds", () => {
      // Bounds start from 2025-03-01, so previous month (Feb 2025) is entirely before bounds
      const selected = DayPeriod.containing(date("2025-03-15"));
      const bounds = OpenInterval.from(date("2025-03-01"));
      renderModal({ picking: "day", selected, bounds });

      expect(screen.queryByTestId("modal-prev")).toBeNull();
    });
  });
});
