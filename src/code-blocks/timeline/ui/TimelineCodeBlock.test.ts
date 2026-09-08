import { fireEvent } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { CalendarDate, type AnchorString, type WeekPlacement } from "@/calendar";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { anchor } from "@/calendar/testing";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { initLocale } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, type JournalConfig, type JournalEntry } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { notesCalendarModule } from "@/notes-calendar/module";
import type { ShelfConfig } from "@/shelves";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import TimelineCodeBlock from "./TimelineCodeBlock.vue";

import type { TimelineBlockConfig } from "../timeline-config";

const MODULES = [
  journalsCoreModule,
  shelvesCoreModule,
  decorationsModule,
  decorationsSettingsCoreModule,
  notesCalendarModule,
  calendarSettingsCoreModule,
];

const HOST_PATH = "host-note.md" as VaultPath;
const HOST_ANCHOR_DATE = "2026-05-27";

interface TimelineScenario {
  readonly journals: Record<string, JournalConfig>;
  readonly shelves?: Record<string, ShelfConfig>;
  readonly entries?: readonly JournalEntry[];
  readonly timelineNavigation?: boolean;
  readonly weekPlacement?: WeekPlacement;
}

function journalEntry(journalName: string, anchorDate: string): JournalEntry {
  return { journalName, anchor: anchor(anchorDate), path: HOST_PATH };
}

async function renderTimeline(config: TimelineBlockConfig, scenario: TimelineScenario) {
  const harness = await testContainer({
    modules: MODULES,
    data: {
      journals: scenario.journals,
      shelves: scenario.shelves ?? {},
      calendarDisplay: {
        timelineNavigation: scenario.timelineNavigation ?? false,
        ...(scenario.weekPlacement !== undefined && { weekPlacement: scenario.weekPlacement }),
      },
    },
  });
  const index = harness.resolve(JournalsIndex);
  const entries = scenario.entries ?? [];
  for (const entry of entries) index.register(entry);
  const result = harness.render(TimelineCodeBlock, { props: { path: HOST_PATH, config } });
  return { harness, index, ...result };
}

// The host note's own daily journal, already registered at the host anchor — the fixture every
// navigation-row and padding test shares.
async function renderDaily(config: TimelineBlockConfig, overrides: Partial<TimelineScenario> = {}) {
  return renderTimeline(config, {
    journals: { daily: fixedJournal("daily", { type: "day" }) },
    entries: [journalEntry("daily", HOST_ANCHOR_DATE)],
    ...overrides,
  });
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

// Scoped to the whole block rather than to the label row: the controls sit in the grid's own
// heading once the two rows merge, and only `data-nav` spans both shapes.
const next = (c: Element) => c.querySelector<HTMLElement>('[data-nav="next"]');
const previous = (c: Element) => c.querySelector<HTMLElement>('[data-nav="prev"]');
const reset = (c: Element) => c.querySelector<HTMLElement>('[data-nav="reset"]');
const labelRow = (c: Element) => c.querySelector<HTMLElement>(".timeline-navigation");
const label = (c: Element) => c.querySelector<HTMLElement>(".timeline-navigation__label")?.textContent;
const weekHeader = (c: Element) => c.querySelector<HTMLElement>(".notes-week-view__header");
const monthHeader = (c: Element) => c.querySelector<HTMLElement>(".notes-month-view__header");

// Reading a heading's contents in document order is what separates the merge from a navigation
// row that merely happens to render above a heading.
function headingOrder(header: Element | null): string[] {
  return [...(header?.querySelectorAll<HTMLElement>('[data-nav], [data-testid^="header-"]') ?? [])].map(
    (element) => element.dataset.nav ?? element.dataset.testid ?? "",
  );
}

afterEach(() => {
  vi.useRealTimers();
});

beforeAll(() => initLocale("en"));

describe("TimelineCodeBlock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  describe("mode derivation", () => {
    it("derives 'week' mode when host journal is day journal", async () => {
      const { container } = await renderDaily({});

      expect(container.querySelector(".timeline-week")).toBeTruthy();
    });

    it("derives 'week' mode when host journal is week journal", async () => {
      const { container } = await renderTimeline(
        {},
        {
          journals: { weekly: fixedJournal("weekly", { type: "week" }) },
          entries: [journalEntry("weekly", HOST_ANCHOR_DATE)],
        },
      );

      expect(container.querySelector(".timeline-week")).toBeTruthy();
    });

    it("derives 'month' mode when host journal is month journal", async () => {
      const { container } = await renderTimeline(
        {},
        {
          journals: { monthly: fixedJournal("monthly", { type: "month" }) },
          entries: [journalEntry("monthly", HOST_ANCHOR_DATE)],
        },
      );

      expect(container.querySelector(".timeline-month")).toBeTruthy();
    });

    it("derives 'quarter' mode when host journal is quarter journal", async () => {
      const { container } = await renderTimeline(
        {},
        {
          journals: { quarterly: fixedJournal("quarterly", { type: "quarter" }) },
          entries: [journalEntry("quarterly", HOST_ANCHOR_DATE)],
        },
      );

      expect(container.querySelector(".timeline-quarter")).toBeTruthy();
    });

    it("derives 'calendar' mode when host journal is year journal", async () => {
      const { container } = await renderTimeline(
        {},
        {
          journals: { yearly: fixedJournal("yearly", { type: "year" }) },
          entries: [journalEntry("yearly", HOST_ANCHOR_DATE)],
        },
      );

      expect(container.querySelector(".timeline-calendar")).toBeTruthy();
    });

    it("uses config.mode over the derived mode", async () => {
      const { container } = await renderDaily({ mode: "month" });

      expect(container.querySelector(".timeline-month")).toBeTruthy();
      expect(container.querySelector(".timeline-week")).toBeNull();
    });

    it("falls back to 'week' when host note is not connected to any journal", async () => {
      const { container } = await renderTimeline({}, { journals: { daily: fixedJournal("daily", { type: "day" }) } });

      expect(container.querySelector(".timeline-week")).toBeTruthy();
    });

    it("re-derives the mode when the index registers the host note after mount", async () => {
      const { container, index } = await renderTimeline(
        {},
        { journals: { monthly: fixedJournal("monthly", { type: "month" }) } },
      );

      index.register(journalEntry("monthly", HOST_ANCHOR_DATE));
      await nextTick();

      expect(container.querySelector(".timeline-month")).toBeTruthy();
    });
  });

  describe("shelf derivation", () => {
    it("derives the shelf from the host journal when config.shelf is absent", async () => {
      const { container } = await renderTimeline(
        {},
        {
          journals: {
            daily: fixedJournal("daily", { type: "day" }),
            otherDaily: fixedJournal("otherDaily", { type: "day" }),
            otherWeekly: fixedJournal("otherWeekly", { type: "week" }),
          },
          shelves: {
            work: { name: "work", journals: ["daily"], decorations: [] },
            home: { name: "home", journals: ["otherDaily", "otherWeekly"], decorations: [] },
          },
          entries: [journalEntry("daily", HOST_ANCHOR_DATE)],
        },
      );

      const weekCell = container.querySelector<HTMLElement>('[data-testid="week-number-cell"]');
      expect(weekCell?.dataset.inactive).toBe("true");
    });

    it("uses config.shelf over the derived shelf", async () => {
      const { container } = await renderTimeline(
        { shelf: "override" },
        {
          journals: {
            daily: fixedJournal("daily", { type: "day" }),
            weekly: fixedJournal("weekly", { type: "week" }),
          },
          shelves: {
            owning: { name: "owning", journals: ["daily"], decorations: [] },
            override: { name: "override", journals: ["weekly"], decorations: [] },
          },
          entries: [journalEntry("daily", HOST_ANCHOR_DATE)],
        },
      );

      const weekCell = container.querySelector<HTMLElement>('[data-testid="week-number-cell"]');
      expect(weekCell?.dataset.inactive).toBeUndefined();
    });
  });

  describe("weeks position", () => {
    it("hides the month week column when config.weeks is none", async () => {
      const { container } = await renderDaily({ mode: "month", weeks: "none" });

      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeNull();
    });

    it("positions the month week column right when config.weeks is right", async () => {
      const { container } = await renderDaily({ mode: "month", weeks: "right" });

      const grid = container.querySelector<HTMLElement>(".notes-month-view__grid");
      expect(grid?.dataset.weeks).toBe("right");
    });

    it("hides the week-view week column when config.weeks is none", async () => {
      const { container } = await renderDaily({ mode: "week", weeks: "none" });

      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeNull();
    });

    it("positions the week-view week column right when config.weeks is right", async () => {
      const { container } = await renderDaily({ mode: "week", weeks: "right" });

      const row = container.querySelector<HTMLElement>(".notes-week-view__row");
      expect(row?.dataset.weeks).toBe("right");
    });
  });

  describe("global week placement", () => {
    it("uses the calendar display setting's placement when config.weeks is unset", async () => {
      const { container } = await renderDaily({ mode: "week" }, { weekPlacement: "right" });

      const row = container.querySelector<HTMLElement>(".notes-week-view__row");
      expect(row?.dataset.weeks).toBe("right");
    });
  });

  describe("period padding", () => {
    it("renders only the host week when no padding is set", async () => {
      const { container } = await renderDaily({ mode: "week" });

      expect(weekAnchors(container).length).toBe(1);
    });

    it("renders the padded weeks in order around the host week", async () => {
      const bare = await renderDaily({ mode: "week" });
      const hostWeek = weekAnchors(bare.container).at(0);

      const padded = await renderDaily({ mode: "week", before: 1, after: 1 });

      const anchors = weekAnchors(padded.container);
      expect(anchors.length).toBe(3);
      expect(anchors.at(1)).toBe(hostWeek);
      expect(anchors.toSorted()).toEqual(anchors);
    });

    it("pads only forward when before is absent", async () => {
      const { container } = await renderDaily({ mode: "week", after: 2 });
      const unpadded = await renderDaily({});

      const anchors = weekAnchors(container);
      expect(anchors.length).toBe(3);
      expect(anchors.at(0)).toBe(weekAnchors(unpadded.container).at(0));
    });

    it("renders a run of month grids when the month mode is padded", async () => {
      const { container } = await renderDaily({ mode: "month", before: 1, after: 1 });

      expect(container.querySelectorAll(".notes-month-view__grid").length).toBe(3);
    });

    it("ignores padding in quarter mode", async () => {
      const bare = await renderDaily({ mode: "quarter" });
      const padded = await renderDaily({ mode: "quarter", before: 1, after: 1 });

      expect(padded.container.querySelectorAll(".notes-month-view__grid").length).toBe(
        bare.container.querySelectorAll(".notes-month-view__grid").length,
      );
    });
  });

  describe("hidden weekdays", () => {
    it("drops the hidden weekdays' day cells from the month grid", async () => {
      const { container } = await renderDaily({ mode: "month", hiddenWeekdays: [0, 6] });

      const cells = [...container.querySelectorAll<HTMLElement>(".notes-month-view__day")];
      const weekdays = cells.map((cell) =>
        Number(CalendarDate.fromAnchor(cell.dataset.anchor as AnchorString).format("d")),
      );
      expect(cells.length).toBeGreaterThan(0);
      expect(weekdays.some((day) => day === 0 || day === 6)).toBe(false);
    });

    it("drops the hidden weekdays' header labels from the week grid", async () => {
      const { container } = await renderDaily({ mode: "week", hiddenWeekdays: [0, 6] });

      expect(container.querySelectorAll(".notes-week-view__weekday").length).toBe(5);
    });
  });

  describe("navigation row", () => {
    describe("when it is shown", () => {
      it("stays hidden when neither the setting nor the block asks for it", async () => {
        const { container } = await renderDaily({ mode: "week" });

        expect(previous(container)).toBeNull();
      });

      it("appears when the block asks for it", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: true });

        expect(previous(container)).toBeTruthy();
      });

      it("appears when the setting is on and the block is silent", async () => {
        const { container } = await renderDaily({ mode: "week" }, { timelineNavigation: true });

        expect(previous(container)).toBeTruthy();
      });

      it("stays hidden when the block opts out of an enabled setting", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: false }, { timelineNavigation: true });

        expect(previous(container)).toBeNull();
      });
    });

    // A block showing one grid has nothing to say in a label the grid's own heading does not
    // already say, so the controls join that heading instead of taking a row of their own.
    describe("merged into the grid heading", () => {
      it("puts the week controls in the grid's heading and drops the label row", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: true });

        expect(weekHeader(container)?.dataset.flanked).toBe("true");
        expect(headingOrder(weekHeader(container))).toEqual(["prev", "header-month", "header-year", "next"]);
        expect(labelRow(container)).toBeNull();
      });

      it("puts the month controls in the grid's heading and drops the label row", async () => {
        const { container } = await renderDaily({ mode: "month", navigation: true });

        expect(monthHeader(container)?.dataset.flanked).toBe("true");
        expect(headingOrder(monthHeader(container))).toEqual(["prev", "header-month", "header-year", "next"]);
        expect(labelRow(container)).toBeNull();
      });

      it("seats the reset control between the heading and the next control", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: true });

        await click(next(container));

        expect(headingOrder(weekHeader(container))).toEqual(["prev", "header-month", "header-year", "reset", "next"]);
      });

      it("keeps the quarter cell in the heading where quarterly journals are in scope", async () => {
        const { container } = await renderTimeline(
          { mode: "week", navigation: true },
          {
            journals: {
              daily: fixedJournal("daily", { type: "day" }),
              quarterly: fixedJournal("quarterly", { type: "quarter" }),
            },
            entries: [journalEntry("daily", HOST_ANCHOR_DATE)],
          },
        );

        expect(headingOrder(weekHeader(container))).toEqual([
          "prev",
          "header-month",
          "header-quarter",
          "header-year",
          "next",
        ]);
      });

      it("keeps the label row when a padded window gives the block several headings", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: true, before: 1 });

        expect(labelRow(container)).toBeTruthy();
        expect(previous(container)?.closest(".timeline-navigation")).toBeTruthy();
        expect(weekHeader(container)?.dataset.flanked).toBeUndefined();
      });

      it("keeps the label row in quarter mode, where each month carries its own heading", async () => {
        const { container } = await renderDaily({ mode: "quarter", navigation: true });

        expect(labelRow(container)).toBeTruthy();
        expect(monthHeader(container)?.dataset.flanked).toBeUndefined();
      });

      it("keeps the label row in calendar mode", async () => {
        const { container } = await renderDaily({ mode: "calendar", navigation: true });

        expect(labelRow(container)).toBeTruthy();
        expect(monthHeader(container)?.dataset.flanked).toBeUndefined();
      });

      it("leaves the heading alone when navigation is off", async () => {
        const { container } = await renderDaily({ mode: "week" });

        expect(weekHeader(container)).toBeTruthy();
        expect(weekHeader(container)?.dataset.flanked).toBeUndefined();
      });
    });

    describe("paging", () => {
      it("moves the week grid one week forward", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: true });
        const before = weekAnchors(container).at(0);

        await click(next(container));

        expect(weekAnchors(container).at(0)).toBe(
          CalendarDate.fromAnchor(before as AnchorString)
            .shift(1, "w")
            .toAnchor(),
        );
      });

      it("moves the week grid one week back", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: true });
        const before = weekAnchors(container).at(0);

        await click(previous(container));

        expect(weekAnchors(container).at(0)).toBe(
          CalendarDate.fromAnchor(before as AnchorString)
            .shift(-1, "w")
            .toAnchor(),
        );
      });

      it("slides a padded window by one period rather than by the whole window", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: true, before: 1, after: 1 });
        const before = weekAnchors(container);

        await click(next(container));

        // The window overlaps its previous contents: what was the last week is now the middle one.
        expect(weekAnchors(container).at(1)).toBe(before.at(2));
      });

      it("moves by a month in month mode", async () => {
        const { container } = await renderDaily({ mode: "month", navigation: true });

        await click(next(container));

        // The merged row has no label of its own, so the heading cell the controls now flank
        // is what has to name the month the block moved to.
        const month = container.querySelector<HTMLElement>('[data-testid="header-month"]');
        expect(month?.dataset.anchor).toBe("2026-06-01");
      });

      it("moves by a quarter in quarter mode", async () => {
        const { container } = await renderDaily({ mode: "quarter", navigation: true });

        await click(next(container));

        expect(label(container)).toBe("Q3 2026");
      });

      it("moves by a year in calendar mode", async () => {
        const { container } = await renderDaily({ mode: "calendar", navigation: true });

        await click(next(container));

        expect(label(container)).toBe("2027");
      });
    });

    describe("the reset control", () => {
      it("is absent while the block sits on the host note's period", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: true });

        expect(reset(container)).toBeNull();
      });

      it("appears once the window has moved", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: true });

        await click(next(container));

        expect(reset(container)).toBeTruthy();
      });

      it("returns the window to the host note's period", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: true });
        const before = weekAnchors(container);

        await click(next(container));
        await click(next(container));
        await click(reset(container));

        expect(weekAnchors(container)).toEqual(before);
      });
    });

    describe("the label", () => {
      // Quarter mode rather than week: a single week grid merges its heading into the row and
      // leaves no label to read.
      it("names a single visible period", async () => {
        const { container } = await renderDaily({ mode: "quarter", navigation: true });

        expect(label(container)).toBe("Q2 2026");
      });

      it("names the whole visible range when the block is padded", async () => {
        const { container } = await renderDaily({ mode: "week", navigation: true, before: 1, after: 1 });

        expect(label(container)).toBe("W21 – W23 2026");
      });
    });

    describe("invalidation", () => {
      it("returns to the host note's period when that note's anchor changes", async () => {
        const { container, index } = await renderDaily({ mode: "week", navigation: true });
        // The week the new anchor belongs to, read off a block that was mounted on it, so the
        // assertion does not have to hardcode a week start the installed grid decides.
        const moved = await renderDaily(
          { mode: "week", navigation: true },
          { entries: [journalEntry("daily", "2026-08-27")] },
        );

        await click(next(container));
        index.register(journalEntry("daily", "2026-08-27"));
        await nextTick();

        expect(weekAnchors(container)).toEqual(weekAnchors(moved.container));
      });

      it("shows the host note's period again when navigation is switched off mid-page", async () => {
        const { container, rerender } = await renderDaily({ mode: "week", navigation: true });
        const before = weekAnchors(container);

        await click(next(container));
        await rerender({ config: { mode: "week", navigation: false } });

        expect(weekAnchors(container)).toEqual(before);
      });
    });
  });
});
