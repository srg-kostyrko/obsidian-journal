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
  props: {
    shelf: string | null;
    month: MonthPeriod;
    hideOutsideDates?: boolean;
    weeks?: "none" | "left" | "right";
    hiddenWeekdays?: readonly number[];
    showHeader?: boolean;
  },
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

  describe("weekday header", () => {
    it("renders a label for each of the seven day columns", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelectorAll(".notes-month-view__weekday").length).toBe(7);
    });

    it("orders weekday labels to match the weekdays of the rendered day cells", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month });
      const labels = [...container.querySelectorAll(".notes-month-view__weekday")].map((element) =>
        element.textContent?.trim(),
      );
      const expected = [...[...month.weeks()][0].days()].map((d) => d.format("ddd"));
      expect(labels).toEqual(expected);
    });
  });

  describe("hidden weekdays", () => {
    it("renders no day cell for a hidden weekday across every week row", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month, hiddenWeekdays: [0, 6] });
      // 6 week rows × (7 − 2 hidden) visible day columns.
      expect(container.querySelectorAll(".notes-month-view__day").length).toBe(30);
    });

    it("omits hidden weekdays from the header labels", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month, hiddenWeekdays: [0, 6] });
      const labels = [...container.querySelectorAll(".notes-month-view__weekday")].map((element) =>
        element.textContent?.trim(),
      );
      const expected = [...[...month.weeks()][0].days()]
        .filter((d) => ![0, 6].includes(Number(d.format("d"))))
        .map((d) => d.format("ddd"));
      expect(labels).toEqual(expected);
    });
  });

  describe("week-number column", () => {
    it("renders one week-number cell per row when weeks is left", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month, weeks: "left" });
      expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(6);
    });

    it("renders one week-number cell per row when weeks is right", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month, weeks: "right" });
      expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(6);
    });

    it("omits the week-number column when weeks is none", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month, weeks: "none" });
      expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(0);
    });

    it("positions the column via data-weeks", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month, weeks: "right" });
      expect(container.querySelector<HTMLElement>(".notes-month-view__grid")?.dataset.weeks).toBe("right");
    });

    it("shows the week number even without a week journal as an inactive label", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month, weeks: "left" });
      const weekCell = container.querySelector<HTMLElement>('[data-testid="week-number-cell"]');
      expect(weekCell).toBeTruthy();
      expect(weekCell?.dataset.active).toBeUndefined();
    });

    it("defaults to a left-positioned column when weeks is omitted", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelector<HTMLElement>(".notes-month-view__grid")?.dataset.weeks).toBe("left");
    });
  });

  describe("header badges", () => {
    it("renders the month header badge", () => {
      const h = buildNotesCalendarHarness({ journals: { monthly: fixedJournal("monthly", { type: "month" }) } });
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelector('[data-testid="header-month"]')).toBeTruthy();
    });

    it("renders the year header badge", () => {
      const h = buildNotesCalendarHarness({ journals: { yearly: fixedJournal("yearly", { type: "year" }) } });
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelector('[data-testid="header-year"]')).toBeTruthy();
    });

    it("renders the quarter header badge when scope has a quarter journal", () => {
      const h = buildNotesCalendarHarness({
        journals: { quarterly: fixedJournal("quarterly", { type: "quarter" }) },
      });
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeTruthy();
    });

    it("omits the quarter header badge when scope has no quarter journal", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeNull();
    });
  });

  describe("header visibility", () => {
    it("hides the default header row when showHeader is false", () => {
      const h = buildNotesCalendarHarness({ journals: { monthly: fixedJournal("monthly", { type: "month" }) } });
      const { container } = mount(h, { shelf: null, month, showHeader: false });
      expect(container.querySelector(".notes-month-view__header")).toBeNull();
    });

    it("renders the default header row when showHeader is omitted", () => {
      const h = buildNotesCalendarHarness({ journals: { monthly: fixedJournal("monthly", { type: "month" }) } });
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelector(".notes-month-view__header")).not.toBeNull();
    });
  });

  describe("header slot", () => {
    it("replaces the default header row when #header is provided", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = render(NotesMonthView, {
        props: { shelf: null, month },
        slots: { header: "<div data-testid='custom-header'>X</div>" },
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
      expect(container.querySelector('[data-testid="custom-header"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="header-month"]')).toBeNull();
    });
  });
});
