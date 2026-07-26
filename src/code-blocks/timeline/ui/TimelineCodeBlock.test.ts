import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, nextTick } from "vue";

import type * as CalendarModule from "@/calendar";
import { CalendarDate, type AnchorString, type WeekPlacement, type WeekPlacementConfig } from "@/calendar";
import { anchor, installTestCalendar } from "@/calendar/testing";
import { initLocale } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { OpenDateFlow } from "@/journals";
import { fixedJournal } from "@/journals/testing";
import { buildNotesCalendarHarness, type NotesCalendarHarness } from "@/notes-calendar/testing";

import TimelineCodeBlock from "./TimelineCodeBlock.vue";

import type { TimelineBlockConfig } from "../timeline-config";

vi.mock("@/calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof CalendarModule>();
  return {
    ...actual,
    useResolvedWeekPlacement: (getConfigWeeks: () => WeekPlacementConfig | undefined) =>
      computed<WeekPlacement>(() => {
        const v = getConfigWeeks();
        return v === "none" || v === "left" || v === "right" ? v : "left";
      }),
  };
});

const HOST_PATH = "host-note.md" as VaultPath;
const HOST_ANCHOR = anchor("2026-05-27");

function mount(h: NotesCalendarHarness, props: { path: VaultPath; config: TimelineBlockConfig }) {
  h.container.register(OpenDateFlow).useValue({} as OpenDateFlow);
  return render(TimelineCodeBlock, {
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeAll(() => initLocale("en"));

describe("TimelineCodeBlock", () => {
  let teardown: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => teardown());

  describe("mode derivation", () => {
    it("derives 'week' mode when host journal is day journal", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-week")).toBeTruthy();
    });

    it("derives 'week' mode when host journal is week journal", () => {
      const h = buildNotesCalendarHarness({ journals: { weekly: fixedJournal("weekly", { type: "week" }) } });
      h.index.register({ journalName: "weekly", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-week")).toBeTruthy();
    });

    it("derives 'month' mode when host journal is month journal", () => {
      const h = buildNotesCalendarHarness({ journals: { monthly: fixedJournal("monthly", { type: "month" }) } });
      h.index.register({ journalName: "monthly", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-month")).toBeTruthy();
    });

    it("derives 'quarter' mode when host journal is quarter journal", () => {
      const h = buildNotesCalendarHarness({ journals: { quarterly: fixedJournal("quarterly", { type: "quarter" }) } });
      h.index.register({ journalName: "quarterly", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-quarter")).toBeTruthy();
    });

    it("derives 'calendar' mode when host journal is year journal", () => {
      const h = buildNotesCalendarHarness({ journals: { yearly: fixedJournal("yearly", { type: "year" }) } });
      h.index.register({ journalName: "yearly", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-calendar")).toBeTruthy();
    });

    it("uses config.mode over the derived mode", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: { mode: "month" } });

      expect(container.querySelector(".timeline-month")).toBeTruthy();
      expect(container.querySelector(".timeline-week")).toBeNull();
    });

    it("falls back to 'week' when host note is not connected to any journal", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-week")).toBeTruthy();
    });

    it("re-derives the mode when the index registers the host note after mount", async () => {
      const h = buildNotesCalendarHarness({ journals: { monthly: fixedJournal("monthly", { type: "month" }) } });

      const { container } = mount(h, { path: HOST_PATH, config: {} });
      h.index.register({ journalName: "monthly", anchor: HOST_ANCHOR, path: HOST_PATH });
      await nextTick();

      expect(container.querySelector(".timeline-month")).toBeTruthy();
    });
  });

  describe("shelf derivation", () => {
    it("derives the shelf from the host journal when config.shelf is absent", () => {
      const h = buildNotesCalendarHarness({
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          otherDaily: fixedJournal("otherDaily", { type: "day" }),
          otherWeekly: fixedJournal("otherWeekly", { type: "week" }),
        },
        shelves: {
          work: { name: "work", journals: ["daily"] },
          home: { name: "home", journals: ["otherDaily", "otherWeekly"] },
        },
      });
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      const weekCell = container.querySelector<HTMLElement>('[data-testid="week-number-cell"]');
      expect(weekCell?.dataset.inactive).toBe("true");
    });

    it("uses config.shelf over the derived shelf", () => {
      const h = buildNotesCalendarHarness({
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
        },
        shelves: {
          owning: { name: "owning", journals: ["daily"] },
          override: { name: "override", journals: ["weekly"] },
        },
      });
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: { shelf: "override" } });

      const weekCell = container.querySelector<HTMLElement>('[data-testid="week-number-cell"]');
      expect(weekCell?.dataset.inactive).toBeUndefined();
    });
  });

  describe("weeks position", () => {
    it("hides the month week column when config.weeks is none", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: { mode: "month", weeks: "none" } });

      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeNull();
    });

    it("positions the month week column right when config.weeks is right", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: { mode: "month", weeks: "right" } });

      const grid = container.querySelector<HTMLElement>(".notes-month-view__grid");
      expect(grid?.dataset.weeks).toBe("right");
    });

    it("hides the week-view week column when config.weeks is none", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: { mode: "week", weeks: "none" } });

      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeNull();
    });

    it("positions the week-view week column right when config.weeks is right", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: { mode: "week", weeks: "right" } });

      const row = container.querySelector<HTMLElement>(".notes-week-view__row");
      expect(row?.dataset.weeks).toBe("right");
    });
  });

  describe("hidden weekdays", () => {
    it("drops the hidden weekdays' day cells from the month grid", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: { mode: "month", hiddenWeekdays: [0, 6] } });

      const cells = [...container.querySelectorAll<HTMLElement>(".notes-month-view__day")];
      const weekdays = cells.map((cell) =>
        Number(CalendarDate.fromAnchor(cell.dataset.anchor as AnchorString).format("d")),
      );
      expect(cells.length).toBeGreaterThan(0);
      expect(weekdays.some((day) => day === 0 || day === 6)).toBe(false);
    });

    it("drops the hidden weekdays' header labels from the week grid", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: { mode: "week", hiddenWeekdays: [0, 6] } });

      expect(container.querySelectorAll(".notes-week-view__weekday").length).toBe(5);
    });
  });
});
