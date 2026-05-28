import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate, MonthPeriod } from "@/calendar";
import { anchor, installTestCalendar } from "@/calendar/testing";
import { initLocale } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { fixedJournal } from "@/journals/testing";

import { buildNotesCalendarHarness, type NotesCalendarHarness } from "../testing";

import NotesMonthView from "./NotesMonthView.vue";

function mount(
  h: NotesCalendarHarness,
  props: { shelf: string | null; month: MonthPeriod; hideOutsideDates?: boolean },
) {
  return render(NotesMonthView, {
    props,
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, h.container);
          },
        },
      ],
    },
  });
}

const month = MonthPeriod.containing(CalendarDate.fromAnchor(anchor("2026-08-15")));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeAll(() => initLocale("en"));

describe("NotesMonthView", () => {
  let teardown: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T10:00:00Z"));
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => teardown());

  describe("day grid", () => {
    it("renders one cell per day across the month's weeks", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelectorAll(".notes-month-view__day").length).toBe(42);
    });
  });

  describe("hideOutsideDates", () => {
    it("marks cells outside the outer month inactive when set", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month, hideOutsideDates: true });
      const outside = container.querySelectorAll<HTMLElement>(".notes-month-view__day[data-outside]");
      expect(outside.length).toBeGreaterThan(0);
      for (const element of outside) {
        expect(element.dataset.inactive).toBe("true");
      }
    });

    it("does not mark outside cells inactive when not set", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month });
      const outside = container.querySelectorAll<HTMLElement>(".notes-month-view__day[data-outside]");
      expect(outside.length).toBeGreaterThan(0);
      for (const element of outside) {
        expect(element.dataset.inactive).toBeUndefined();
      }
    });
  });

  describe("week-number column", () => {
    it("renders one week-number cell per row when scope has a week journal", () => {
      const h = buildNotesCalendarHarness({
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
        },
      });
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(6);
    });

    it("omits the week-number column when scope has no week journal", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(0);
    });
  });

  describe("header badges", () => {
    it("renders the month and year header badges", () => {
      const h = buildNotesCalendarHarness({
        journals: {
          monthly: fixedJournal("monthly", { type: "month" }),
          yearly: fixedJournal("yearly", { type: "year" }),
        },
      });
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelector('[data-testid="header-month"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="header-year"]')).toBeTruthy();
    });

    it("renders the quarter header badge only when scope has a quarter journal", () => {
      const without = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const r1 = mount(without, { shelf: null, month });
      expect(r1.container.querySelector('[data-testid="header-quarter"]')).toBeNull();
      cleanup();

      const withQuarter = buildNotesCalendarHarness({
        journals: { quarterly: fixedJournal("quarterly", { type: "quarter" }) },
      });
      const r2 = mount(withQuarter, { shelf: null, month });
      expect(r2.container.querySelector('[data-testid="header-quarter"]')).toBeTruthy();
    });
  });
});
