import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate, WeekPeriod } from "@/calendar";
import { anchor, installTestCalendar } from "@/calendar/testing";
import { initLocale } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { fixedJournal } from "@/journals/testing";

import { buildNotesCalendarHarness, type NotesCalendarHarness } from "../testing";

import NotesWeekView from "./NotesWeekView.vue";

function mount(
  h: NotesCalendarHarness,
  props: { shelf: string | null; week: WeekPeriod; weeks?: "none" | "left" | "right" },
) {
  return render(NotesWeekView, {
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

const week = WeekPeriod.containing(CalendarDate.fromAnchor(anchor("2026-05-27")));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeAll(() => initLocale("en"));

describe("NotesWeekView", () => {
  let teardown: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => teardown());

  describe("day cells", () => {
    it("renders one cell per day of the week", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      mount(h, { shelf: null, week });
      const expectedDays = [...week.days()].map((d) => d.format("D"));
      for (const label of expectedDays) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      }
    });
  });

  describe("week-number cell", () => {
    it("renders the week-number cell when weeks is left", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, week, weeks: "left" });
      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeTruthy();
    });

    it("renders the week-number cell when weeks is right", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, week, weeks: "right" });
      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeTruthy();
    });

    it("omits the week-number cell when weeks is none", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, week, weeks: "none" });
      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeNull();
    });

    it("positions the cell via data-weeks", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, week, weeks: "right" });
      expect(container.querySelector<HTMLElement>(".notes-week-view__row")?.dataset.weeks).toBe("right");
    });

    it("shows the week number even without a week journal as an inactive label", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, week, weeks: "left" });
      const weekCell = container.querySelector<HTMLElement>('[data-testid="week-number-cell"]');
      expect(weekCell).toBeTruthy();
      expect(weekCell?.dataset.active).toBeUndefined();
    });
  });

  describe("header badges", () => {
    it("renders the month header badge", () => {
      const h = buildNotesCalendarHarness({ journals: { monthly: fixedJournal("monthly", { type: "month" }) } });
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-month"]')).toBeTruthy();
    });

    it("renders the year header badge", () => {
      const h = buildNotesCalendarHarness({ journals: { yearly: fixedJournal("yearly", { type: "year" }) } });
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-year"]')).toBeTruthy();
    });

    it("renders the quarter header badge when scope has a quarter journal", () => {
      const h = buildNotesCalendarHarness({
        journals: { quarterly: fixedJournal("quarterly", { type: "quarter" }) },
      });
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeTruthy();
    });

    it("omits the quarter header badge when scope has no quarter journal", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeNull();
    });
  });

  describe("header slot", () => {
    it("replaces the default header row when #header is provided", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      const { container } = render(NotesWeekView, {
        props: { shelf: null, week },
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
