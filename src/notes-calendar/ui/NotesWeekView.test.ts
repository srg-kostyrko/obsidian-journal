// cspell: ignore subgrid
import userEvent from "@testing-library/user-event";
import { fireEvent, screen } from "@testing-library/vue";
import { __testing } from "obsidian";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { CalendarDate, WeekPeriod, type CalendarDisplaySliceState } from "@/calendar";
import { calendarDisplayCoreModule } from "@/calendar/settings/module";
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
import { tasksCoreModule } from "@/tasks/module";
import { testContainer, type TestHarness } from "@/testing";

import { ActiveEntryViewModel } from "../active-entry";
import { notesCalendarModule } from "../module";
import { calendarStyleRules } from "../testing";

import NotesWeekView from "./NotesWeekView.vue";

const MODULES = [
  calendarDisplayCoreModule,
  journalsCoreModule,
  shelvesCoreModule,
  decorationsModule,
  decorationsSettingsCoreModule,
  notesCalendarModule,
  tasksCoreModule,
];

function bootHarness(
  journals: Record<string, JournalConfig>,
  calendarDisplay: Partial<CalendarDisplaySliceState> = {},
): Promise<TestHarness> {
  return testContainer({ modules: MODULES, data: { journals, calendarDisplay } });
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

const headerFor = (container: Element, name: string): Element | undefined =>
  [...container.querySelectorAll('[role="columnheader"]')].find((header) => header.getAttribute("aria-label") === name);
const texts = (header: Element | undefined) => ({
  wide: header?.querySelector(".notes-week-view__weekday-wide")?.textContent?.trim(),
  narrow: header?.querySelector(".notes-week-view__weekday-narrow")?.textContent?.trim(),
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

    it("keeps the column headers but hides them visually when showWeekdays is false", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week, showWeekdays: false } });
      const row = container.querySelector(".notes-week-view__weekdays");
      expect(row?.classList.contains("notes-week-view__weekdays--visually-hidden")).toBe(true);
      expect(row?.querySelectorAll('[role="columnheader"]').length).toBe(7);
    });

    it("shows the weekday row by default", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      const row = container.querySelector(".notes-week-view__weekdays");
      expect(row?.classList.contains("notes-week-view__weekdays--visually-hidden")).toBe(false);
    });

    it("orders weekday labels to match the weekdays of the rendered day cells", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      const labels = [...container.querySelectorAll(".notes-week-view__weekday-wide")].map((element) =>
        element.textContent?.trim(),
      );
      const expected = [...week.days()].map((d) => d.format("ddd"));
      expect(labels).toEqual(expected);
    });
  });

  describe("label formats", () => {
    const daily = { daily: fixedJournal("daily", { type: "day" }) };
    // The attribute gates the rules that let a day shrink below its label, so stock grids keep their size floor.
    it("marks the grid for clipping only when the day label is custom", async () => {
      const stock = await bootHarness(daily);
      const custom = await bootHarness(daily, { labels: { day: "Do", week: "", month: "", quarter: "", year: "" } });
      const stockView = stock.render(NotesWeekView, { props: { shelf: null, week } }).container;
      const customView = custom.render(NotesWeekView, { props: { shelf: null, week } }).container;

      expect(stockView.querySelector("[data-custom-day-label]")).toBeNull();
      expect(customView.querySelector(".notes-week-view")?.hasAttribute("data-custom-day-label")).toBe(true);
    });

    it("renders the day label in the user's format and keeps the full date as its name", async () => {
      const harness = await bootHarness(daily, { labels: { day: "Do", week: "", month: "", quarter: "", year: "" } });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      const day = container.querySelector('.notes-week-view__day[data-anchor="2026-05-27"]');

      expect(day?.textContent?.trim()).toBe("27th");
      expect(day?.getAttribute("aria-label")).toBe("May 27, 2026");
    });

    it("renders the week number and the heading in the user's formats", async () => {
      const harness = await bootHarness(daily, {
        labels: { day: "", week: "w", month: "MMM", quarter: "", year: "YY" },
      });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week, weeks: "left" } });

      expect(container.querySelector('[data-testid="week-number-cell"]')?.textContent?.trim()).toBe(week.format("w"));
      // No monthly or yearly journal, so the heading cells are no controls: their visible text is hidden from
      // screen readers, which read the full names instead.
      const shown = (testId: string) =>
        container.querySelector(`[data-testid="${CSS.escape(testId)}"] .cell-decoration__content [aria-hidden="true"]`)
          ?.textContent;
      expect([shown("header-month")?.trim(), shown("header-year")?.trim()]).toEqual(["May", "26"]);
    });

    it("renders each width's weekday text and names the column by the full weekday", async () => {
      const harness = await bootHarness(daily, {
        weekdayLabel: { type: "pattern", pattern: "ddd" },
        weekdayLabelNarrow: { type: "letter" },
      });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });
      const monday = headerFor(container, "Monday");

      expect(texts(monday)).toEqual({ wide: "Mon", narrow: "M" });
      expect(monday?.querySelector(".notes-week-view__weekday-wide")?.getAttribute("aria-hidden")).toBe("true");
      expect(monday?.querySelector(".notes-week-view__weekday-narrow")?.getAttribute("aria-hidden")).toBe("true");
    });

    it("keeps each width's own text when the wide one is one letter", async () => {
      const harness = await bootHarness(daily, {
        weekdayLabel: { type: "letter" },
        weekdayLabelNarrow: { type: "pattern", pattern: "dd" },
      });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });

      expect(texts(headerFor(container, "Monday"))).toEqual({ wide: "M", narrow: "Mo" });
    });

    it("renders the wide text at both widths when the narrow one is unset", async () => {
      const harness = await bootHarness(daily, { weekdayLabel: { type: "pattern", pattern: "dd" } });
      const { container } = harness.render(NotesWeekView, { props: { shelf: null, week } });

      expect(texts(headerFor(container, "Monday"))).toEqual({ wide: "Mo", narrow: "Mo" });
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
      const labels = [...container.querySelectorAll(".notes-week-view__weekday-wide")].map((element) =>
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

const bands = (container: Element, kind: "weekend" | "current-week"): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(`.notes-calendar-band[data-band="${CSS.escape(kind)}"]`),
];
const placement = (band: HTMLElement) => ({ column: band.style.gridColumn, row: band.style.gridRow });

// Built under the test's Monday-start grid, unlike the module's `week`, built at import.
const thisWeek = () => WeekPeriod.containing(CalendarDate.fromAnchor(anchor("2026-05-27")));

describe("NotesWeekView bands", () => {
  const daily = { daily: fixedJournal("daily", { type: "day" }) };

  it("draws the weekend band down Saturday and Sunday and the current-week band across today's week", async () => {
    const harness = await bootHarness(daily);
    const { container } = harness.render(NotesWeekView, { props: { shelf: null, week: thisWeek(), weeks: "left" } });

    expect({
      weekend: bands(container, "weekend").map(placement),
      currentWeek: bands(container, "current-week").map(placement),
    }).toEqual({
      weekend: [{ column: "7 / span 2", row: "auto" }],
      currentWeek: [{ column: "1 / -1", row: "2 / span 1" }],
    });
    expect(container.querySelectorAll("[data-current-week]").length).toBe(8);
    expect(container.querySelectorAll(".notes-week-view__day[data-weekend]").length).toBe(2);
    expect(container.querySelectorAll(".notes-week-view__weekday[data-weekend]").length).toBe(2);
  });

  it("counts no header row when the weekday row is hidden", async () => {
    const harness = await bootHarness(daily);
    const { container } = harness.render(NotesWeekView, {
      props: { shelf: null, week: thisWeek(), showWeekdays: false },
    });

    expect(bands(container, "current-week").map(placement)).toEqual([{ column: "1 / -1", row: "1 / span 1" }]);
  });

  it("keeps the weekend band but drops the current-week band when the caller opts out", async () => {
    const harness = await bootHarness(daily);
    const { container } = harness.render(NotesWeekView, {
      props: { shelf: null, week: thisWeek(), currentWeekBand: false },
    });

    expect(bands(container, "weekend").length).toBe(1);
    expect(bands(container, "current-week")).toEqual([]);
  });

  // The band is the caller's to drop; the week number's current-week text is the block's only accent.
  it("the week block's week number keeps the current week without a band", async () => {
    const harness = await bootHarness(daily);
    const { container } = harness.render(NotesWeekView, {
      props: { shelf: null, week: thisWeek(), weeks: "left", currentWeekBand: false },
    });

    expect(container.querySelector(".notes-week-view__week-number")?.hasAttribute("data-current-week")).toBe(true);
    expect(container.querySelector(".notes-week-view__day[data-current-week]")).toBeNull();
  });

  it("a weekly note open on the current week shows the open note's text on its number", async () => {
    const harness = await bootHarness({ ...daily, weekly: fixedJournal("weekly", { type: "week" }) });
    harness.resolve(ActiveEntryViewModel).active.value = {
      journalName: "weekly",
      anchor: thisWeek().anchor.toAnchor(),
    };
    const { container } = harness.render(NotesWeekView, {
      props: { shelf: null, week: thisWeek(), weeks: "left", currentWeekBand: false },
    });
    const weekNumber = container.querySelector<HTMLElement>(".notes-week-view__week-number");

    expect({ active: weekNumber?.dataset.active, currentWeek: weekNumber?.dataset.currentWeek }).toEqual({
      active: "true",
      currentWeek: "true",
    });
  });

  it("draws no current-week band for a week without today", async () => {
    const harness = await bootHarness(daily);
    const other = WeekPeriod.containing(CalendarDate.fromAnchor(anchor("2026-06-10")));
    const { container } = harness.render(NotesWeekView, { props: { shelf: null, week: other } });

    expect(bands(container, "current-week")).toEqual([]);
    expect(container.querySelector("[data-current-week]")).toBeNull();
  });

  it("draws no current-week band on a week whose every day is hidden", async () => {
    const harness = await bootHarness(daily);
    const { container } = harness.render(NotesWeekView, {
      props: { shelf: null, week: thisWeek(), weeks: "left", hiddenWeekdays: [0, 1, 2, 3, 4, 5, 6] },
    });

    expect(container.querySelector(".notes-week-view__day")).toBeNull();
    expect(bands(container, "current-week")).toEqual([]);
    expect([...container.querySelectorAll("[data-current-week]")].map((cell) => cell.className)).toEqual([
      expect.stringContaining("notes-week-view__week-number"),
    ]);
  });

  it.each([
    ["left", { side: "end", column: "1 / 2", row: "2 / auto" }],
    ["right", { side: "start", column: "-2 / -1", row: "2 / auto" }],
  ] as const)("draws the divider on the days' side of a week number on the %s", async (weeks, expected) => {
    const harness = await bootHarness(daily);
    const { container } = harness.render(NotesWeekView, { props: { shelf: null, week: thisWeek(), weeks } });

    expect(
      [...container.querySelectorAll<HTMLElement>(".notes-calendar-divider")].map((divider) => ({
        side: divider.dataset.side,
        column: divider.style.gridColumn,
        row: divider.style.gridRow,
      })),
    ).toEqual([expected]);
  });

  it("draws no divider without a week number", async () => {
    const harness = await bootHarness(daily);
    const { container } = harness.render(NotesWeekView, { props: { shelf: null, week: thisWeek(), weeks: "none" } });

    expect(container.querySelector(".notes-calendar-divider")).toBeNull();
  });

  it("places the bands ahead of the header row", async () => {
    const harness = await bootHarness(daily);
    const { container } = harness.render(NotesWeekView, { props: { shelf: null, week: thisWeek() } });
    const children = [...(container.querySelector('[role="grid"]')?.children ?? [])];

    expect(children.slice(0, 2).map((child) => (child as HTMLElement).dataset.band)).toEqual([
      "weekend",
      "current-week",
    ]);
  });

  // One band component serves the month and week views, so both lay their rows out on the same grid lines.
  it("lays the header and the day row on the month view's grid", () => {
    const rules = calendarStyleRules().weekView.filter((rule) => rule.container === null);
    const declarations = (selector: string) =>
      Object.fromEntries(rules.filter((rule) => rule.selector === selector).flatMap((rule) => [...rule.declarations]));
    // The stock look of the flex rows it replaced: an equal share for the week number, the wider gap between rows.
    expect(declarations(".notes-week-view__grid")).toMatchObject({
      position: "relative",
      display: "grid",
      "grid-template-columns": "repeat(var(--day-columns, 7), 1fr)",
      "row-gap": "var(--size-2-2)",
      "column-gap": "var(--_v-cell-gap)",
    });
    expect(declarations('.notes-week-view__grid[data-weeks="left"]')).toMatchObject({
      "grid-template-columns": "1fr repeat(var(--day-columns, 7), 1fr)",
    });
    expect(declarations('.notes-week-view__grid[data-weeks="right"]')).toMatchObject({
      "grid-template-columns": "repeat(var(--day-columns, 7), 1fr) 1fr",
    });
    expect(declarations(".notes-week-view__row > *")).toMatchObject({ "text-align": "center" });
    // The first rule laying out each row; the fallback for engines without nested grid tracks that follows it sits under `@supports`.
    for (const row of [".notes-week-view__weekdays", ".notes-week-view__row"]) {
      const layout = rules.find(
        (rule) =>
          rule.selector.split(",").some((part) => part.trim() === row) &&
          rule.declarations.has("grid-template-columns"),
      );
      expect(Object.fromEntries(layout?.declarations ?? [])).toMatchObject({
        display: "grid",
        "grid-template-columns": "subgrid",
      });
    }
  });
});
