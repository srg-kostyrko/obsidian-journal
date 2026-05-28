import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { anchor, installTestCalendar } from "@/calendar/testing";
import { initLocale } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { OpenDateFlow } from "@/journals";
import { fixedJournal } from "@/journals/testing";
import { buildNotesCalendarHarness, type NotesCalendarHarness } from "@/notes-calendar/testing";

import TimelineCodeBlock from "./TimelineCodeBlock.vue";

import type { TimelineBlockConfig } from "../timeline-config";

const HOST_PATH = "host-note.md" as VaultPath;
const HOST_ANCHOR = anchor("2026-05-27");

function mount(h: NotesCalendarHarness, props: { path: VaultPath; config: TimelineBlockConfig }) {
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

function registerOpenDateFlow(h: NotesCalendarHarness): void {
  h.container.register(OpenDateFlow).useValue({} as OpenDateFlow);
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
      registerOpenDateFlow(h);
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-week")).toBeTruthy();
    });

    it("derives 'week' mode when host journal is week journal", () => {
      const h = buildNotesCalendarHarness({ journals: { weekly: fixedJournal("weekly", { type: "week" }) } });
      registerOpenDateFlow(h);
      h.index.register({ journalName: "weekly", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-week")).toBeTruthy();
    });

    it("derives 'month' mode when host journal is month journal", () => {
      const h = buildNotesCalendarHarness({ journals: { monthly: fixedJournal("monthly", { type: "month" }) } });
      registerOpenDateFlow(h);
      h.index.register({ journalName: "monthly", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-month")).toBeTruthy();
    });

    it("derives 'quarter' mode when host journal is quarter journal", () => {
      const h = buildNotesCalendarHarness({ journals: { quarterly: fixedJournal("quarterly", { type: "quarter" }) } });
      registerOpenDateFlow(h);
      h.index.register({ journalName: "quarterly", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-quarter")).toBeTruthy();
    });

    it("derives 'calendar' mode when host journal is year journal", () => {
      const h = buildNotesCalendarHarness({ journals: { yearly: fixedJournal("yearly", { type: "year" }) } });
      registerOpenDateFlow(h);
      h.index.register({ journalName: "yearly", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-calendar")).toBeTruthy();
    });

    it("uses config.mode over the derived mode", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      registerOpenDateFlow(h);
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: { mode: "month" } });

      expect(container.querySelector(".timeline-month")).toBeTruthy();
      expect(container.querySelector(".timeline-week")).toBeNull();
    });

    it("falls back to 'week' when host note is not connected to any journal", () => {
      const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
      registerOpenDateFlow(h);

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector(".timeline-week")).toBeTruthy();
    });
  });

  describe("shelf derivation", () => {
    it("derives the shelf from the host journal when config.shelf is absent", () => {
      const h = buildNotesCalendarHarness({
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
        },
        shelves: { work: { name: "work", journals: ["daily", "weekly"] } },
      });
      registerOpenDateFlow(h);
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: {} });

      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeTruthy();
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
      registerOpenDateFlow(h);
      h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });

      const { container } = mount(h, { path: HOST_PATH, config: { shelf: "override" } });

      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeTruthy();
    });
  });
});
