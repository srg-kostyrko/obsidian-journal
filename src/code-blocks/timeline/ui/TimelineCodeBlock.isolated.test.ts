import { cleanup, fireEvent, render } from "@testing-library/vue";
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

// The settings slice these composables read is not in the notes-calendar harness, so both are
// stubbed down to the resolution rule itself — the block's own precedence (its option wins over
// the global) is what these tests are about, and the stubs keep it in play.
const globals = vi.hoisted(() => ({ timelineNavigation: false }));

vi.mock("@/calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof CalendarModule>();
  return {
    ...actual,
    useResolvedWeekPlacement: (getConfigWeeks: () => WeekPlacementConfig | undefined) =>
      computed<WeekPlacement>(() => {
        const v = getConfigWeeks();
        return v === "none" || v === "left" || v === "right" ? v : "left";
      }),
    useResolvedTimelineNavigation: (getConfigNavigation: () => boolean | undefined) =>
      computed<boolean>(() => getConfigNavigation() ?? globals.timelineNavigation),
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

function dailyHarness() {
  const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
  h.index.register({ journalName: "daily", anchor: HOST_ANCHOR, path: HOST_PATH });
  return h;
}

async function click(button: HTMLElement | null | undefined): Promise<void> {
  if (!button) throw new Error("navigation control is not rendered");
  await fireEvent.click(button);
  await nextTick();
}

function weekAnchors(container: Element): string[] {
  return [...container.querySelectorAll<HTMLElement>('[data-testid="week-number-cell"]')].map(
    (cell) => cell.dataset.anchor ?? "",
  );
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
    globals.timelineNavigation = false;
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
          work: { name: "work", journals: ["daily"], decorations: [] },
          home: { name: "home", journals: ["otherDaily", "otherWeekly"], decorations: [] },
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
          owning: { name: "owning", journals: ["daily"], decorations: [] },
          override: { name: "override", journals: ["weekly"], decorations: [] },
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

  describe("period padding", () => {
    it("renders only the host week when no padding is set", () => {
      const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week" } });

      expect(weekAnchors(container).length).toBe(1);
    });

    it("renders the padded weeks in order around the host week", () => {
      const bare = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week" } });
      const hostWeek = weekAnchors(bare.container).at(0);

      const padded = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week", before: 1, after: 1 } });

      const anchors = weekAnchors(padded.container);
      expect(anchors.length).toBe(3);
      expect(anchors.at(1)).toBe(hostWeek);
      expect(anchors.toSorted()).toEqual(anchors);
    });

    it("pads only forward when before is absent", () => {
      const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week", after: 2 } });

      const anchors = weekAnchors(container);
      expect(anchors.length).toBe(3);
      expect(anchors.at(0)).toBe(weekAnchors(mount(dailyHarness(), { path: HOST_PATH, config: {} }).container).at(0));
    });

    it("renders a run of month grids when the month mode is padded", () => {
      const { container } = mount(dailyHarness(), {
        path: HOST_PATH,
        config: { mode: "month", before: 1, after: 1 },
      });

      expect(container.querySelectorAll(".notes-month-view__grid").length).toBe(3);
    });

    it("ignores padding in quarter mode", () => {
      const bare = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "quarter" } });
      const padded = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "quarter", before: 1, after: 1 } });

      expect(padded.container.querySelectorAll(".notes-month-view__grid").length).toBe(
        bare.container.querySelectorAll(".notes-month-view__grid").length,
      );
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

  describe("navigation row", () => {
    const NAV = ".timeline-navigation";
    const next = (c: Element) => c.querySelector<HTMLElement>(`${NAV} [data-nav="next"]`);
    const previous = (c: Element) => c.querySelector<HTMLElement>(`${NAV} [data-nav="prev"]`);
    const reset = (c: Element) => c.querySelector<HTMLElement>(`${NAV} [data-nav="reset"]`);
    const label = (c: Element) => c.querySelector<HTMLElement>(`${NAV} .timeline-navigation__label`)?.textContent;

    describe("when it is shown", () => {
      it("stays hidden when neither the setting nor the block asks for it", () => {
        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week" } });

        expect(container.querySelector(NAV)).toBeNull();
      });

      it("appears when the block asks for it", () => {
        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week", navigation: true } });

        expect(container.querySelector(NAV)).toBeTruthy();
      });

      it("appears when the setting is on and the block is silent", () => {
        globals.timelineNavigation = true;

        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week" } });

        expect(container.querySelector(NAV)).toBeTruthy();
      });

      it("stays hidden when the block opts out of an enabled setting", () => {
        globals.timelineNavigation = true;

        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week", navigation: false } });

        expect(container.querySelector(NAV)).toBeNull();
      });
    });

    describe("paging", () => {
      it("moves the week grid one week forward", async () => {
        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week", navigation: true } });
        const before = weekAnchors(container).at(0);

        await click(next(container));

        expect(weekAnchors(container).at(0)).toBe(
          CalendarDate.fromAnchor(before as AnchorString)
            .shift(1, "w")
            .toAnchor(),
        );
      });

      it("moves the week grid one week back", async () => {
        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week", navigation: true } });
        const before = weekAnchors(container).at(0);

        await click(previous(container));

        expect(weekAnchors(container).at(0)).toBe(
          CalendarDate.fromAnchor(before as AnchorString)
            .shift(-1, "w")
            .toAnchor(),
        );
      });

      it("slides a padded window by one period rather than by the whole window", async () => {
        const { container } = mount(dailyHarness(), {
          path: HOST_PATH,
          config: { mode: "week", navigation: true, before: 1, after: 1 },
        });
        const before = weekAnchors(container);

        await click(next(container));

        // The window overlaps its previous contents: what was the last week is now the middle one.
        expect(weekAnchors(container).at(1)).toBe(before.at(2));
      });

      it("moves by a month in month mode", async () => {
        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "month", navigation: true } });

        await click(next(container));

        expect(label(container)).toBe("June 2026");
      });

      it("moves by a quarter in quarter mode", async () => {
        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "quarter", navigation: true } });

        await click(next(container));

        expect(label(container)).toBe("Q3 2026");
      });

      it("moves by a year in calendar mode", async () => {
        const { container } = mount(dailyHarness(), {
          path: HOST_PATH,
          config: { mode: "calendar", navigation: true },
        });

        await click(next(container));

        expect(label(container)).toBe("2027");
      });
    });

    describe("the reset control", () => {
      it("is absent while the block sits on the host note's period", () => {
        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week", navigation: true } });

        expect(reset(container)).toBeNull();
      });

      it("appears once the window has moved", async () => {
        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week", navigation: true } });

        await click(next(container));

        expect(reset(container)).toBeTruthy();
      });

      it("returns the window to the host note's period", async () => {
        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week", navigation: true } });
        const before = weekAnchors(container);

        await click(next(container));
        await click(next(container));
        await click(reset(container));

        expect(weekAnchors(container)).toEqual(before);
      });
    });

    describe("the label", () => {
      it("names a single visible week", () => {
        const { container } = mount(dailyHarness(), { path: HOST_PATH, config: { mode: "week", navigation: true } });

        expect(label(container)).toBe("W22 2026");
      });

      it("names the whole visible range when the block is padded", () => {
        const { container } = mount(dailyHarness(), {
          path: HOST_PATH,
          config: { mode: "week", navigation: true, before: 1, after: 1 },
        });

        expect(label(container)).toBe("W21 – W23 2026");
      });
    });

    describe("invalidation", () => {
      it("returns to the host note's period when that note's anchor changes", async () => {
        const h = dailyHarness();
        const { container } = mount(h, { path: HOST_PATH, config: { mode: "week", navigation: true } });

        await click(next(container));
        h.index.register({ journalName: "daily", anchor: anchor("2026-08-27"), path: HOST_PATH });
        await nextTick();

        expect(label(container)).toBe("W35 2026");
      });

      it("shows the host note's period again when navigation is switched off mid-page", async () => {
        const { container, rerender } = mount(dailyHarness(), {
          path: HOST_PATH,
          config: { mode: "week", navigation: true },
        });
        const before = weekAnchors(container);

        await click(next(container));
        await rerender({ config: { mode: "week", navigation: false } });

        expect(weekAnchors(container)).toEqual(before);
      });
    });
  });
});
