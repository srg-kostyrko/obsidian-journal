import userEvent from "@testing-library/user-event";
import { fireEvent, screen } from "@testing-library/vue";
import { __testing } from "obsidian";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { CalendarDate, WeekPeriod } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { initLocale } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import type { JournalConfig } from "@/journals";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { notesCalendarModule } from "../module";

import NotesWeekView from "./NotesWeekView.vue";

const MODULES = [
  journalsCoreModule,
  shelvesCoreModule,
  decorationsModule,
  decorationsSettingsCoreModule,
  notesCalendarModule,
];

function bootHarness(journals: Record<string, JournalConfig>): Promise<TestHarness> {
  return testContainer({ modules: MODULES, data: { journals } });
}

// The real WorkspaceService drives Obsidian's own Menu, so these assertions read the menu the
// host actually opened. `undefined` and `[]` are different outcomes and must stay distinguishable:
// openPathsMenu returns without showing anything when a period resolved neither a path nor an
// extra item, whereas a shown menu carrying no items would be a bug a `?? []` fallback would hide.
function menuItemTitles(): readonly string[] | undefined {
  return __testing.openMenus.at(-1)?.items.map((item) => item.title);
}

const week = WeekPeriod.containing(CalendarDate.fromAnchor(anchor("2026-05-27")));

beforeAll(() => initLocale("en"));

beforeEach(() => {
  __testing.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NotesWeekView", () => {
  describe("accessible grid", () => {
    it("provides the grid, row, column-header, row-header, and grid-cell structure", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week, weeks: "left" } });
      const grid = container.querySelector('[role="grid"]');

      expect(grid?.classList.contains("notes-week-view__grid")).toBe(true);
      expect(container.querySelector(".notes-week-view")?.getAttribute("role")).toBeNull();
      expect(grid?.getAttribute("aria-label")).toBe(week.format("[W]w gggg"));
      expect(grid?.querySelectorAll(':scope > [role="row"]').length).toBe(2);
      expect(grid?.querySelectorAll('[role="columnheader"]').length).toBe(7);
      expect(grid?.querySelectorAll('[role="rowheader"]').length).toBe(1);
      expect(grid?.querySelectorAll('[role="gridcell"]').length).toBe(7);
    });

    it("gives exactly one period cell a tab stop and prefers the selected day", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, {
        props: { shelf: null, week, selectedDate: anchor("2026-05-28") },
      });
      const tabbable = container.querySelectorAll('[role="gridcell"][tabindex="0"], [role="rowheader"][tabindex="0"]');

      expect(tabbable.length).toBe(1);
      expect((tabbable[0] as HTMLElement | undefined)?.dataset.anchor).toBe("2026-05-28");
    });

    it("moves horizontally and sends Home/End to visual row boundaries", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, {
        props: { shelf: null, week, weeks: "left", selectedDate: anchor("2026-05-27") },
      });
      const selected = container.querySelector<HTMLElement>('[data-grid-key="day:2026-05-27"]')!;
      const lastDayKey = [...container.querySelectorAll<HTMLElement>('.notes-week-view__row [role="gridcell"]')].at(-1)
        ?.dataset.gridKey;

      selected.focus();
      await fireEvent.keyDown(selected, { key: "ArrowRight" });
      expect((document.activeElement as HTMLElement).dataset.gridKey).toBe("day:2026-05-28");
      await fireEvent.keyDown(document.activeElement!, { key: "Home" });
      expect((document.activeElement as HTMLElement).getAttribute("role")).toBe("rowheader");
      await fireEvent.keyDown(document.activeElement!, { key: "End" });
      expect((document.activeElement as HTMLElement).dataset.gridKey).toBe(lastDayKey);
    });

    it("keeps right-side week numbers at the visual End boundary", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, {
        props: { shelf: null, week, weeks: "right", selectedDate: anchor("2026-05-27") },
      });
      const selected = container.querySelector<HTMLElement>('[data-grid-key="day:2026-05-27"]')!;

      selected.focus();
      await fireEvent.keyDown(selected, { key: "End" });
      expect((document.activeElement as HTMLElement).getAttribute("role")).toBe("rowheader");
    });

    it("uses regular horizontal navigation after hidden weekdays are removed", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, {
        props: {
          shelf: null,
          week,
          weeks: "none",
          hiddenWeekdays: [0, 6],
          selectedDate: anchor("2026-05-29"),
        },
      });
      const friday = container.querySelector<HTMLElement>('[data-grid-key="day:2026-05-29"]')!;

      friday.focus();
      await fireEvent.keyDown(friday, { key: "ArrowRight" });
      expect(document.activeElement).toBe(friday);
    });
  });

  describe("date selection", () => {
    it("marks the cell whose representative exactly matches selectedDate", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, {
        props: { shelf: null, week, selectedDate: anchor("2026-05-27") },
      });
      const selected = container.querySelector<HTMLElement>('[data-grid-key="day:2026-05-27"]');

      expect(selected?.getAttribute("aria-selected")).toBe("true");
      expect(selected?.dataset.selected).toBe("true");
    });

    it("selects an inactive grid date on Shift+Enter", async () => {
      vi.useRealTimers();
      const selectDate = vi.fn();
      const harness = await bootHarness({});
      const { container } = harness.render(NotesWeekView, {
        props: { shelf: null, week, selectDate, selectedDate: anchor("2026-05-27") },
      });
      const selected = container.querySelector<HTMLElement>('[data-grid-key="day:2026-05-27"]')!;

      selected.focus();
      await userEvent.keyboard("{Shift>}{Enter}{/Shift}");

      expect(selectDate).toHaveBeenCalledWith(anchor("2026-05-27"));
    });

    it("leaves a header cell with no journal of its kind out of the tab order", async () => {
      const selectDate = vi.fn();
      const harness = await bootHarness({});
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week, selectDate } });
      const header = container.querySelector<HTMLElement>('[data-testid="header-month"]')!;

      expect(header.hasAttribute("role")).toBe(false);
      expect(header.hasAttribute("tabindex")).toBe(false);
      expect(header.hasAttribute("aria-label")).toBe(false);
    });

    it("does not select from the week-number cell", async () => {
      const selectDate = vi.fn();
      const harness = await bootHarness({ weekly: fixedJournal("weekly", { type: "week" }) });
      const { container } = harness.render(NotesWeekView, {
        props: { shelf: null, week, weeks: "left", selectDate },
      });
      const weekCell = container.querySelector<HTMLElement>('[role="rowheader"]')!;

      await fireEvent.click(weekCell, { shiftKey: true, button: 0 });

      expect(selectDate).not.toHaveBeenCalled();
    });
  });

  describe("day cells", () => {
    it("renders one cell per day of the week", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      harness.render(NotesWeekView, { props: { shelf: null, week } });
      const expectedDays = [...week.days()].map((d) => d.format("D"));
      for (const label of expectedDays) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      }
    });
  });

  describe("weekday header", () => {
    it("renders a label for each of the seven day columns", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      expect(container.querySelectorAll(".notes-week-view__weekday").length).toBe(7);
    });

    it("orders weekday labels to match the weekdays of the rendered day cells", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      const labels = [...container.querySelectorAll(".notes-week-view__weekday")].map((element) =>
        element.textContent?.trim(),
      );
      const expected = [...week.days()].map((d) => d.format("ddd"));
      expect(labels).toEqual(expected);
    });
  });

  describe("hidden weekdays", () => {
    it("renders no day cell for a hidden weekday", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, {
        props: { shelf: null, week, weeks: "none", hiddenWeekdays: [0, 6] },
      });
      expect(container.querySelectorAll(".notes-week-view__row > *").length).toBe(5);
    });

    it("omits hidden weekdays from the header labels", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week, hiddenWeekdays: [0, 6] } });
      const labels = [...container.querySelectorAll(".notes-week-view__weekday")].map((element) =>
        element.textContent?.trim(),
      );
      const expected = [...week.days()]
        .filter((d) => ![0, 6].includes(Number(d.format("d"))))
        .map((d) => d.format("ddd"));
      expect(labels).toEqual(expected);
    });
  });

  describe("week-number cell", () => {
    it("renders the week-number cell when weeks is left", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week, weeks: "left" } });
      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeTruthy();
    });

    it("renders the week-number cell when weeks is right", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week, weeks: "right" } });
      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeTruthy();
    });

    it("omits the week-number cell when weeks is none", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week, weeks: "none" } });
      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeNull();
    });

    it("positions the cell via data-weeks", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week, weeks: "right" } });
      expect(container.querySelector<HTMLElement>(".notes-week-view__row")?.dataset.weeks).toBe("right");
    });

    it("shows the week number even without a week journal as an inactive label", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week, weeks: "left" } });
      const weekCell = container.querySelector<HTMLElement>('[data-testid="week-number-cell"]');
      expect(weekCell).toBeTruthy();
      expect(weekCell?.dataset.active).toBeUndefined();
    });
  });

  describe("header badges", () => {
    it("renders the month header badge", async () => {
      const harness = await bootHarness({ monthly: fixedJournal("monthly", { type: "month" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      expect(container.querySelector('[data-testid="header-month"]')).toBeTruthy();
    });

    it("renders the year header badge", async () => {
      const harness = await bootHarness({ yearly: fixedJournal("yearly", { type: "year" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      expect(container.querySelector('[data-testid="header-year"]')).toBeTruthy();
    });

    it("renders the quarter header badge when scope has a quarter journal", async () => {
      const harness = await bootHarness({ quarterly: fixedJournal("quarterly", { type: "quarter" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeTruthy();
    });

    it("omits the quarter header badge when scope has no quarter journal", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeNull();
    });
  });

  describe("custom interval decorations", () => {
    // A custom interval is anchored to its start date, which coincides with one day cell's
    // anchor. The week grid renders fixed-period journals only; a custom interval's
    // decoration belongs in the interval list, never on the day cell sharing its anchor.
    it("does not decorate the day cell sharing a custom interval's start anchor", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("corner")],
      });
      const harness = await bootHarness({
        sprint: customJournal("sprint", "week", 2, "2026-05-26", { decorations: [decoration] }),
      });
      const path = "sprint/2026-05-26.md" as VaultPath;
      harness.resolve(JournalsIndex).register({ journalName: "sprint", anchor: anchor("2026-05-26"), path });
      harness.host.putFile(path);

      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      await nextTick();

      const cell = container.querySelector('[data-anchor="2026-05-26"]');
      expect(cell?.querySelector(".decoration-corner")).toBeNull();
    });

    // The week grid is otherwise fixed-only, but a custom journal's offset-condition
    // decorations mark specific days inside an interval, so they belong on the day
    // cells even though the journal itself renders as intervals.
    it("paints a custom journal's offset decoration on the matching day cell", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("offset", { offset: 3 })],
        styles: [buildStyle("corner")],
      });
      const harness = await bootHarness({
        sprint: customJournal("sprint", "week", 2, "2026-05-26", { decorations: [decoration] }),
      });

      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      await nextTick();

      // Day 3 of the interval starting 2026-05-26 is 2026-05-28.
      const cell = container.querySelector('[data-anchor="2026-05-28"]');
      expect(cell?.querySelector(".decoration-corner")).not.toBeNull();
    });

    it("does not paint a custom journal's non-offset decoration on other day cells", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1, 2, 3, 4, 5, 6, 0] })],
        styles: [buildStyle("corner")],
      });
      const harness = await bootHarness({
        sprint: customJournal("sprint", "week", 2, "2026-05-26", { decorations: [decoration] }),
      });

      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      await nextTick();

      const cell = container.querySelector('[data-anchor="2026-05-28"]');
      expect(cell?.querySelector(".decoration-corner")).toBeNull();
    });
  });

  describe("day cell context menu", () => {
    it("contributes the explain item for a decorated day cell", async () => {
      const decoration = buildDecoration({
        conditions: [buildCondition("date")],
        styles: [buildStyle("corner")],
      });
      const harness = await bootHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });

      const cell = container.querySelector('[data-anchor="2026-05-27"]');
      await fireEvent.contextMenu(cell!);

      expect(menuItemTitles()).toHaveLength(1);
    });
  });

  describe("header slot", () => {
    it("replaces the default header row when #header is provided", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, {
        props: { shelf: null, week },
        slots: { header: "<div data-testid='custom-header'>X</div>" },
      });
      expect(container.querySelector('[data-testid="custom-header"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="header-month"]')).toBeNull();
    });
  });

  describe("header visibility", () => {
    it("hides the default header row when showHeader is false", async () => {
      const harness = await bootHarness({ monthly: fixedJournal("monthly", { type: "month" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week, showHeader: false } });
      expect(container.querySelector(".notes-week-view__header")).toBeNull();
    });

    it("renders the default header row when showHeader is omitted", async () => {
      const harness = await bootHarness({ monthly: fixedJournal("monthly", { type: "month" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      expect(container.querySelector(".notes-week-view__header")).not.toBeNull();
    });
  });
});
