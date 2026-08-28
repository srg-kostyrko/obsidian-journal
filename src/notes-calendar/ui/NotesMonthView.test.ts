import { fireEvent } from "@testing-library/vue";
import { __testing } from "obsidian";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { CalendarDate, MonthPeriod } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { initLocale } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { notesCalendarModule } from "../module";

import NotesMonthView from "./NotesMonthView.vue";

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

const month = MonthPeriod.containing(CalendarDate.fromAnchor(anchor("2026-08-15")));

beforeAll(() => initLocale("en"));

beforeEach(() => {
  __testing.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-15T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NotesMonthView", () => {
  describe("accessible grid", () => {
    it("provides the grid, row, column-header, row-header, and grid-cell structure", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });
      const grid = container.querySelector('[role="grid"]');

      expect(grid?.getAttribute("aria-label")).toBe(month.format("MMMM YYYY"));
      expect(grid?.querySelectorAll(':scope > [role="row"]').length).toBe(7);
      expect(grid?.querySelectorAll('[role="columnheader"]').length).toBe(7);
      expect(grid?.querySelectorAll('[role="rowheader"]').length).toBe(6);
      expect(grid?.querySelectorAll('[role="gridcell"]').length).toBe(42);
    });

    it("keeps blank outside-month cells hidden from the accessibility tree", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, outsideDates: "blank" },
      });

      const blanks = container.querySelectorAll(".notes-month-view__day--blank");
      expect(blanks.length).toBeGreaterThan(0);
      for (const blank of blanks) expect(blank.getAttribute("aria-hidden")).toBe("true");
    });

    it("gives exactly one period cell a tab stop and prefers the selected day", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, selectedDate: anchor("2026-08-20") },
      });
      const tabbable = container.querySelectorAll('[role="gridcell"][tabindex="0"], [role="rowheader"][tabindex="0"]');

      expect(tabbable.length).toBe(1);
      expect((tabbable[0] as HTMLElement | undefined)?.dataset.anchor).toBe("2026-08-20");
    });

    it("preserves the last focused cell while the grid remains mounted", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const view = harness.render(NotesMonthView, {
        props: { shelf: null, month, selectedDate: anchor("2026-08-15") },
      });
      const focused = view.container.querySelector<HTMLElement>('[data-grid-key="day:2026-08-20"]')!;
      focused.focus();

      await view.rerender({ shelf: null, month, selectedDate: anchor("2026-08-21") });

      expect(focused.tabIndex).toBe(0);
      expect(
        view.container.querySelectorAll('[role="gridcell"][tabindex="0"], [role="rowheader"][tabindex="0"]'),
      ).toHaveLength(1);
    });

    it("falls back from selected date to today, then to the first non-blank period", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const todayView = harness.render(NotesMonthView, { props: { shelf: null, month } });
      expect(todayView.container.querySelector<HTMLElement>('[tabindex="0"]')?.dataset.anchor).toBe("2026-08-15");
      todayView.unmount();

      vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
      const firstView = harness.render(NotesMonthView, {
        props: { shelf: null, month, outsideDates: "blank", weeks: "none" },
      });
      expect(firstView.container.querySelector<HTMLElement>('[tabindex="0"]')?.dataset.anchor).toBe("2026-08-01");
    });

    it("moves with arrows and Home/End while preserving week-number participation", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, selectedDate: anchor("2026-08-15"), weeks: "left" },
      });
      const cell = (value: string): HTMLElement =>
        [...container.querySelectorAll<HTMLElement>("[data-grid-key]")].find(
          (element) => element.dataset.gridKey === value,
        )!;
      const selected = cell("day:2026-08-15");

      selected.focus();
      await fireEvent.keyDown(selected, { key: "ArrowLeft" });
      expect(document.activeElement).toBe(cell("day:2026-08-14"));
      await fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
      expect(document.activeElement).toBe(selected);
      await fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
      expect(document.activeElement).toBe(cell("day:2026-08-08"));
      await fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
      expect(document.activeElement).toBe(selected);
      await fireEvent.keyDown(document.activeElement!, { key: "Home" });
      expect((document.activeElement as HTMLElement).getAttribute("role")).toBe("rowheader");
      await fireEvent.keyDown(document.activeElement!, { key: "End" });
      expect(document.activeElement).toBe(cell("day:2026-08-16"));
    });

    it("stops at month-grid boundaries instead of wrapping", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });
      const cells = [...container.querySelectorAll<HTMLElement>("[data-grid-key]")];
      const first = cells[0];
      const last = cells.at(-1);
      if (!first || !last) throw new Error("calendar grid rendered no period cells");

      first.focus();
      await fireEvent.keyDown(first, { key: "ArrowLeft" });
      expect(document.activeElement).toBe(first);
      last.focus();
      await fireEvent.keyDown(last, { key: "ArrowRight" });
      expect(document.activeElement).toBe(last);
    });

    it("navigates hidden-weekday rows as regular compact rows", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: {
          shelf: null,
          month,
          weeks: "none",
          hiddenWeekdays: [0, 6],
          selectedDate: anchor("2026-08-14"),
        },
      });
      const friday = container.querySelector<HTMLElement>('[data-grid-key="day:2026-08-14"]')!;

      friday.focus();
      await fireEvent.keyDown(friday, { key: "ArrowRight" });
      expect((document.activeElement as HTMLElement).dataset.gridKey).toBe("day:2026-08-17");
    });

    it("places the right-side week number at the End of its row", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, weeks: "right", selectedDate: anchor("2026-08-15") },
      });
      const selected = container.querySelector<HTMLElement>('[data-grid-key="day:2026-08-15"]')!;

      selected.focus();
      await fireEvent.keyDown(selected, { key: "End" });
      expect((document.activeElement as HTMLElement).getAttribute("role")).toBe("rowheader");
    });
  });

  describe("date selection", () => {
    it("marks only cells whose representative exactly matches selectedDate", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, selectedDate: anchor("2026-08-15") },
      });
      const selected = container.querySelectorAll('[aria-selected="true"]');

      expect(selected.length).toBe(1);
      expect((selected[0] as HTMLElement | undefined)?.dataset.anchor).toBe("2026-08-15");
    });

    it("selects an inactive outside date on Shift+primary click without opening it", async () => {
      const selectDate = vi.fn();
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, outsideDates: "inactive", selectDate },
      });
      const outside = container.querySelector<HTMLElement>(".notes-month-view__day[data-outside]")!;

      await fireEvent.click(outside, { shiftKey: true, button: 0 });

      expect(selectDate).toHaveBeenCalledWith(outside.dataset.anchor);
    });

    it("reacts when a selection callback becomes available after mount", async () => {
      const harness = await bootHarness({});
      const view = harness.render(NotesMonthView, { props: { shelf: null, month } });
      const header = view.container.querySelector<HTMLElement>('[data-testid="header-month"]')!;

      expect(header.hasAttribute("role")).toBe(false);
      expect(header.hasAttribute("tabindex")).toBe(false);
      expect(header.hasAttribute("aria-label")).toBe(false);

      const selectDate = vi.fn();
      await view.rerender({ shelf: null, month, selectDate });

      expect(header.getAttribute("role")).toBe("button");
      expect(header.tabIndex).toBe(0);
      expect(header.getAttribute("aria-label")).toBe(month.format("MMMM YYYY"));
      await fireEvent.click(header, { shiftKey: true, button: 0 });
      expect(selectDate).toHaveBeenCalledWith(month.representative.toAnchor());
    });
  });

  describe("day grid", () => {
    it("renders one cell per day across the month's weeks", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      expect(container.querySelectorAll(".notes-month-view__day").length).toBe(42);
    });
  });

  describe("outsideDates", () => {
    it("marks cells outside the outer month inactive when inactive", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, outsideDates: "inactive" } });
      const outside = container.querySelectorAll<HTMLElement>(".notes-month-view__day[data-outside]");
      expect(outside.length).toBeGreaterThan(0);
      for (const element of outside) {
        expect(element.dataset.inactive).toBe("true");
      }
    });

    it("keeps outside cells actionable by default", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      const outside = container.querySelectorAll<HTMLElement>(".notes-month-view__day[data-outside]");
      expect(outside.length).toBeGreaterThan(0);
      for (const element of outside) {
        expect(element.dataset.inactive).toBeUndefined();
      }
    });

    it("renders outside days as empty cells when blank", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, outsideDates: "blank" } });
      const blanks = container.querySelectorAll<HTMLElement>(".notes-month-view__day--blank");
      expect(blanks.length).toBeGreaterThan(0);
      for (const element of blanks) {
        expect(element.textContent?.trim()).toBe("");
      }
    });

    it("renders no day number outside the outer month when blank", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, outsideDates: "blank" } });
      expect(container.querySelector(".notes-month-view__day[data-outside]")).toBeNull();
    });

    it("preserves the full week grid when blank", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, outsideDates: "blank" } });
      expect(container.querySelectorAll(".notes-month-view__day").length).toBe(42);
    });
  });

  describe("weekday header", () => {
    it("renders a label for each of the seven day columns", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      expect(container.querySelectorAll(".notes-month-view__weekday").length).toBe(7);
    });

    it("orders weekday labels to match the weekdays of the rendered day cells", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      const labels = [...container.querySelectorAll(".notes-month-view__weekday")].map((element) =>
        element.textContent?.trim(),
      );
      const expected = [...[...month.weeks()][0].days()].map((d) => d.format("ddd"));
      expect(labels).toEqual(expected);
    });
  });

  describe("hidden weekdays", () => {
    it("renders no day cell for a hidden weekday across every week row", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, hiddenWeekdays: [0, 6] },
      });
      // 6 week rows × (7 − 2 hidden) visible day columns.
      expect(container.querySelectorAll(".notes-month-view__day").length).toBe(30);
    });

    it("omits hidden weekdays from the header labels", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, hiddenWeekdays: [0, 6] },
      });
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
    it("renders one week-number cell per row when weeks is left", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });
      expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(6);
    });

    it("renders one week-number cell per row when weeks is right", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "right" } });
      expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(6);
    });

    it("omits the week-number column when weeks is none", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "none" } });
      expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(0);
    });

    it("positions the column via data-weeks", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "right" } });
      expect(container.querySelector<HTMLElement>(".notes-month-view__grid")?.dataset.weeks).toBe("right");
    });

    it("shows the week number even without a week journal as an inactive label", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });
      const weekCell = container.querySelector<HTMLElement>('[data-testid="week-number-cell"]');
      expect(weekCell).toBeTruthy();
      expect(weekCell?.dataset.active).toBeUndefined();
    });

    it("defaults to a left-positioned column when weeks is omitted", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      expect(container.querySelector<HTMLElement>(".notes-month-view__grid")?.dataset.weeks).toBe("left");
    });
  });

  describe("header badges", () => {
    it("renders the month header badge", async () => {
      const harness = await bootHarness({ monthly: fixedJournal("monthly", { type: "month" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      expect(container.querySelector('[data-testid="header-month"]')).toBeTruthy();
    });

    it("renders the year header badge", async () => {
      const harness = await bootHarness({ yearly: fixedJournal("yearly", { type: "year" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      expect(container.querySelector('[data-testid="header-year"]')).toBeTruthy();
    });

    it("renders the quarter header badge when scope has a quarter journal", async () => {
      const harness = await bootHarness({ quarterly: fixedJournal("quarterly", { type: "quarter" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeTruthy();
    });

    it("omits the quarter header badge when scope has no quarter journal", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeNull();
    });
  });

  describe("header visibility", () => {
    it("hides the default header row when showHeader is false", async () => {
      const harness = await bootHarness({ monthly: fixedJournal("monthly", { type: "month" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, showHeader: false } });
      expect(container.querySelector(".notes-month-view__header")).toBeNull();
    });

    it("renders the default header row when showHeader is omitted", async () => {
      const harness = await bootHarness({ monthly: fixedJournal("monthly", { type: "month" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      expect(container.querySelector(".notes-month-view__header")).not.toBeNull();
    });
  });

  describe("custom interval decorations", () => {
    // A custom interval is anchored to its start date, which coincides with one day cell's
    // anchor. The day calendar grid renders fixed-period journals only; a custom interval's
    // decoration belongs in the interval list, never on the day cell sharing its anchor.
    it("does not decorate the day cell sharing a custom interval's start anchor", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("corner")],
      });
      const harness = await bootHarness({
        sprint: customJournal("sprint", "week", 2, "2026-08-03", { decorations: [decoration] }),
      });
      const path = "sprint/2026-08-03.md" as VaultPath;
      harness.resolve(JournalsIndex).register({ journalName: "sprint", anchor: anchor("2026-08-03"), path });
      harness.host.putFile(path);

      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      await nextTick();

      const cell = container.querySelector('.notes-month-view__day[data-anchor="2026-08-03"]');
      expect(cell?.querySelector(".decoration-corner")).toBeNull();
    });

    // The day grid is otherwise fixed-only, but a custom journal's offset-condition
    // decorations mark specific days inside an interval, so they belong on the day
    // cells even though the journal itself renders as intervals.
    it("paints a custom journal's offset decoration on the matching day cell", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("offset", { offset: 3 })],
        styles: [buildStyle("corner")],
      });
      const harness = await bootHarness({
        sprint: customJournal("sprint", "week", 2, "2026-08-03", { decorations: [decoration] }),
      });

      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      await nextTick();

      // Day 3 of the interval starting 2026-08-03 is 2026-08-05.
      const cell = container.querySelector('.notes-month-view__day[data-anchor="2026-08-05"]');
      expect(cell?.querySelector(".decoration-corner")).not.toBeNull();
    });

    it("does not paint a custom journal's non-offset decoration on other day cells", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1, 2, 3, 4, 5, 6, 0] })],
        styles: [buildStyle("corner")],
      });
      const harness = await bootHarness({
        sprint: customJournal("sprint", "week", 2, "2026-08-03", { decorations: [decoration] }),
      });

      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      await nextTick();

      const cell = container.querySelector('.notes-month-view__day[data-anchor="2026-08-05"]');
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
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      await nextTick();

      const cell = container.querySelector('.notes-month-view__day[data-anchor="2026-08-15"]');
      await fireEvent.contextMenu(cell!);

      expect(menuItemTitles()).toHaveLength(1);
    });
  });

  describe("header slot", () => {
    it("replaces the default header row when #header is provided", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month },
        slots: { header: "<div data-testid='custom-header'>X</div>" },
      });
      expect(container.querySelector('[data-testid="custom-header"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="header-month"]')).toBeNull();
    });
  });
});
