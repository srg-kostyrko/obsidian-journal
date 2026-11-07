import { fireEvent } from "@testing-library/vue";
import { __testing } from "obsidian";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { CalendarDate, MonthPeriod, type CalendarDisplaySliceState } from "@/calendar";
import { calendarDisplayCoreModule } from "@/calendar/settings/module";
import { anchor, installTestCalendar } from "@/calendar/testing";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { initLocale } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { tasksCoreModule } from "@/tasks/module";
import { testContainer, type TestHarness } from "@/testing";

import { appearanceCatalog } from "../appearance/appearance-catalog";
import { notesCalendarModule } from "../module";
import { calendarStyleRules, NARROW_QUERY, narrowReader, privateName, wideReader } from "../testing";

import NotesMonthView from "./NotesMonthView.vue";

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

function dayRows(container: Element): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="grid"] > [role="row"]')].slice(1);
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

const dayCell = (container: Element, at: string): HTMLElement | null =>
  container.querySelector<HTMLElement>(`.notes-month-view__day[data-anchor="${CSS.escape(at)}"]`);
const headerFor = (container: Element, name: string): Element | undefined =>
  [...container.querySelectorAll('[role="columnheader"]')].find((header) => header.getAttribute("aria-label") === name);
const texts = (header: Element | undefined) => ({
  wide: header?.querySelector(".notes-month-view__weekday-wide")?.textContent?.trim(),
  narrow: header?.querySelector(".notes-month-view__weekday-narrow")?.textContent?.trim(),
});

describe("NotesMonthView", () => {
  it("does not bind appearance variables inline", async () => {
    const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
    const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });

    expect(container.querySelector(".notes-month-view")?.getAttribute("style") ?? "").not.toContain("--journal-cell-");
  });

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
    // The month header and the week-number cells share their representative with a day cell —
    // the month's with the 1st, a week's with its week-year day — so a date that collides is the
    // only one that can catch a coarse cell ringing alongside the day the user selected.
    it("marks only the day cell matching selectedDate", async () => {
      const harness = await bootHarness({
        daily: fixedJournal("daily", { type: "day" }),
        monthly: fixedJournal("monthly", { type: "month" }),
        weekly: fixedJournal("weekly", { type: "week" }),
      });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, selectedDate: anchor("2026-08-01") },
      });
      const selected = container.querySelectorAll('[aria-selected="true"]');

      expect(selected.length).toBe(1);
      expect((selected[0] as HTMLElement | undefined)?.getAttribute("role")).toBe("gridcell");
      expect((selected[0] as HTMLElement | undefined)?.dataset.anchor).toBe("2026-08-01");
    });

    it("does not select an inert outside date on Shift+primary click", async () => {
      const selectDate = vi.fn();
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, outsideDates: "inactive", selectDate },
      });
      const outside = container.querySelector<HTMLElement>('.notes-month-view__day[data-anchor="2026-07-31"]')!;

      await fireEvent.click(outside, { shiftKey: true, button: 0 });

      expect(selectDate).not.toHaveBeenCalled();
    });

    it("leaves a header cell with no journal of its kind out of the tab order", async () => {
      const selectDate = vi.fn();
      const harness = await bootHarness({});
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, selectDate } });
      const header = container.querySelector<HTMLElement>('[data-testid="header-month"]')!;

      expect(header.hasAttribute("role")).toBe(false);
      expect(header.hasAttribute("tabindex")).toBe(false);
      expect(header.hasAttribute("aria-label")).toBe(false);
    });

    it("does not select from a header cell", async () => {
      const selectDate = vi.fn();
      const harness = await bootHarness({ monthly: fixedJournal("monthly", { type: "month" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, selectDate } });
      const header = container.querySelector<HTMLElement>('[data-testid="header-month"]')!;

      await fireEvent.click(header, { shiftKey: true, button: 0 });

      expect(selectDate).not.toHaveBeenCalled();
    });

    it("does not select from a week-number cell", async () => {
      const selectDate = vi.fn();
      const harness = await bootHarness({ weekly: fixedJournal("weekly", { type: "week" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, selectDate } });
      const weekCell = container.querySelector<HTMLElement>('[data-testid="week-number-cell"]')!;

      await fireEvent.click(weekCell, { shiftKey: true, button: 0 });

      expect(selectDate).not.toHaveBeenCalled();
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

    it("draws no mark on an inert outside day", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("corner")],
      });
      const harness = await bootHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      for (const day of ["2026-07-31", "2026-08-03"]) {
        const path = `daily/${day}.md` as VaultPath;
        harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor(day), path });
        harness.host.putFile(path);
      }
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, outsideDates: "inactive" } });
      await nextTick();

      const cell = (day: string) =>
        container.querySelector<HTMLElement>(`.notes-month-view__day[data-anchor="${CSS.escape(day)}"]`);
      expect(cell("2026-08-03")?.querySelector(".decoration-corner")).not.toBeNull();
      expect(cell("2026-07-31")?.querySelector(".decoration-corner")).toBeNull();
    });

    it("takes inert outside days out of the tab order and marks them disabled", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, outsideDates: "inactive" } });
      const outside = container.querySelectorAll<HTMLElement>(".notes-month-view__day[data-outside]");

      expect(outside.length).toBeGreaterThan(0);
      for (const element of outside) {
        expect({
          role: element.getAttribute("role"),
          tabindex: element.getAttribute("tabindex"),
          disabled: element.getAttribute("aria-disabled"),
          gridKey: element.dataset.gridKey,
        }).toEqual({ role: "gridcell", tabindex: null, disabled: "true", gridKey: undefined });
      }
    });

    it("skips inert outside days in keyboard navigation", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, weeks: "none", outsideDates: "inactive" },
      });
      const first = container.querySelector<HTMLElement>('[data-grid-key="day:2026-08-01"]')!;
      const last = container.querySelector<HTMLElement>('[data-grid-key="day:2026-08-31"]')!;

      first.focus();
      await fireEvent.keyDown(first, { key: "ArrowLeft" });
      expect(document.activeElement).toBe(first);
      last.focus();
      await fireEvent.keyDown(last, { key: "ArrowRight" });
      expect(document.activeElement).toBe(last);
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

    it("the weekday header reads the catalog variable", () => {
      const rules = calendarStyleRules().monthView;
      const declared = (container: string | null, property: string): string | undefined =>
        rules
          .filter((rule) => rule.selector === ".notes-month-view__weekday" && rule.container === container)
          .map((rule) => rule.declarations.get(property))
          .find((value) => value !== undefined);
      const weekday = appearanceCatalog.filter((entry) => entry.name.startsWith("journal-cell-weekday-"));
      const reads = {
        size: "font-size",
        weight: "font-weight",
        italic: "font-style",
        color: "color",
        case: "text-transform",
      };

      expect(weekday.map((entry) => entry.name.replace("journal-cell-weekday-", "")).toSorted()).toEqual(
        Object.keys(reads).toSorted(),
      );
      for (const entry of weekday) {
        const property = reads[entry.name.replace("journal-cell-weekday-", "") as keyof typeof reads];
        expect(declared(null, property)).toBe(`var(${privateName(entry)})`);
        expect(declared(null, privateName(entry))).toBe(wideReader(entry));
        expect(declared(NARROW_QUERY, privateName(entry))).toBe(narrowReader(entry));
      }
    });

    it("orders weekday labels to match the weekdays of the rendered day cells", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      const labels = [...container.querySelectorAll(".notes-month-view__weekday-wide")].map((element) =>
        element.textContent?.trim(),
      );
      const expected = [...[...month.weeks()][0].days()].map((d) => d.format("ddd"));
      expect(labels).toEqual(expected);
    });
  });

  describe("label formats", () => {
    const daily = { daily: fixedJournal("daily", { type: "day" }) };
    // The attribute gates the rules that let a day shrink below its label, so stock grids keep their size floor.
    it("marks the grid for clipping only when the day label is custom", async () => {
      const stock = await bootHarness(daily);
      const custom = await bootHarness(daily, { labels: { day: "Do", week: "", month: "", quarter: "", year: "" } });
      const stockView = stock.render(NotesMonthView, { props: { shelf: null, month } }).container;
      const customView = custom.render(NotesMonthView, { props: { shelf: null, month } }).container;

      expect(stockView.querySelector("[data-custom-day-label]")).toBeNull();
      expect(customView.querySelector(".notes-month-view")?.hasAttribute("data-custom-day-label")).toBe(true);
    });

    it("renders the day label in the user's format and keeps the full date as its name", async () => {
      const harness = await bootHarness(daily, { labels: { day: "DD", week: "", month: "", quarter: "", year: "" } });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });

      expect(dayCell(container, "2026-08-01")?.textContent?.trim()).toBe("01");
      expect(dayCell(container, "2026-08-01")?.getAttribute("aria-label")).toBe("August 1, 2026");
    });

    it("renders week numbers in the user's format", async () => {
      const harness = await bootHarness(daily, { labels: { day: "", week: "w", month: "", quarter: "", year: "" } });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });
      const first = [...month.weeks()][0];

      expect(container.querySelector('[data-testid="week-number-cell"]')?.textContent?.trim()).toBe(first.format("w"));
    });

    it("renders the heading's month, quarter and year in the user's formats", async () => {
      const harness = await bootHarness(
        {
          ...daily,
          monthly: fixedJournal("monthly", { type: "month" }),
          quarterly: fixedJournal("quarterly", { type: "quarter" }),
        },
        { labels: { day: "", week: "", month: "MMM", quarter: "Qo", year: "YY" } },
      );
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });

      expect(container.querySelector('[data-testid="header-month"]')?.textContent?.trim()).toBe("Aug");
      expect(container.querySelector('[data-testid="header-month"]')?.getAttribute("aria-label")).toBe("August 2026");
      expect(container.querySelector('[data-testid="header-quarter"]')?.textContent?.trim()).toBe("3rd");
      // No yearly journal, so the year is no control: its visible text is hidden and its name read instead.
      const year = container.querySelector('[data-testid="header-year"]');
      expect(year?.querySelector('.cell-decoration__content [aria-hidden="true"]')?.textContent?.trim()).toBe("26");
      expect(year?.querySelector(".notes-calendar-cell__accessible-name")?.textContent?.trim()).toBe("2026");
    });

    // With no monthly journal the heading's month is no control, so no aria-label names it: its text would be read.
    it("keeps a non-control heading cell's accessible text fixed whatever the format", async () => {
      const harness = await bootHarness(daily, { labels: { day: "", week: "", month: "MM", quarter: "", year: "" } });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      const heading = container.querySelector<HTMLElement>('[data-testid="header-month"]');
      const shown = heading?.querySelector('[aria-hidden="true"]:not(.notes-calendar-cell__layer)');
      const named = [...(heading?.querySelectorAll(".notes-calendar-cell__accessible-name") ?? [])];

      expect(heading?.hasAttribute("aria-label")).toBe(false);
      expect(shown?.textContent?.trim()).toBe("08");
      expect(named.map((element) => element.textContent?.trim())).toEqual(["August 2026"]);
    });

    it.each([
      ["stock", { day: "", week: "", month: "", quarter: "", year: "" }],
      ["typed as the default", { day: "", week: "", month: "MMMM", quarter: "", year: "" }],
    ])("renders a non-control heading cell with a %s format as plain text", async (_name, labels) => {
      const harness = await bootHarness(daily, { labels });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      const heading = container.querySelector<HTMLElement>('[data-testid="header-month"]');
      const text = heading?.querySelector(".cell-decoration__content");

      expect(heading?.querySelector(".notes-calendar-cell__accessible-name")).toBeNull();
      expect(text?.children.length).toBe(0);
      expect(text?.textContent?.trim()).toBe("August");
    });

    it("renders each width's weekday text and names the column by the full weekday", async () => {
      const harness = await bootHarness(daily, {
        weekdayLabel: { type: "pattern", pattern: "ddd" },
        weekdayLabelNarrow: { type: "letter" },
      });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      const monday = headerFor(container, "Monday");

      expect(texts(monday)).toEqual({ wide: "Mon", narrow: "M" });
      expect(monday?.querySelector(".notes-month-view__weekday-wide")?.getAttribute("aria-hidden")).toBe("true");
      expect(monday?.querySelector(".notes-month-view__weekday-narrow")?.getAttribute("aria-hidden")).toBe("true");
    });

    it("keeps each width's own text when the wide one is one letter", async () => {
      const harness = await bootHarness(daily, {
        weekdayLabel: { type: "letter" },
        weekdayLabelNarrow: { type: "pattern", pattern: "dd" },
      });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });

      expect(texts(headerFor(container, "Monday"))).toEqual({ wide: "M", narrow: "Mo" });
    });

    it("renders the wide text at both widths when the narrow one is unset", async () => {
      const harness = await bootHarness(daily, {
        weekdayLabel: { type: "pattern", pattern: "dd" },
        weekdayLabelNarrow: null,
      });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });

      expect(texts(headerFor(container, "Monday"))).toEqual({ wide: "Mo", narrow: "Mo" });
    });

    it("keeps the full weekday names on a visually hidden weekday row", async () => {
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, showWeekdays: false } });

      expect(headerFor(container, "Monday")).toBeDefined();
    });
  });

  describe("weekday header visibility", () => {
    it("keeps the column headers but hides them visually when showWeekdays is false", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, showWeekdays: false } });
      const row = container.querySelector('[role="grid"] > [role="row"]');
      expect(row?.classList.contains("notes-month-view__row--visually-hidden")).toBe(true);
      expect(row?.querySelectorAll('[role="columnheader"]').length).toBe(7);
    });

    it("shows the weekday row by default", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      const row = container.querySelector('[role="grid"] > [role="row"]');
      expect(row?.classList.contains("notes-month-view__row--visually-hidden")).toBe(false);
    });
  });

  describe("sixRows", () => {
    const february = MonthPeriod.containing(CalendarDate.fromAnchor(anchor("2027-02-10")));

    it("pads a four-row month to six rows of outside days", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month: february, weeks: "none" },
      });
      expect(dayRows(container)).toHaveLength(4);

      const six = harness.render(NotesMonthView, {
        props: { shelf: null, month: february, weeks: "none", sixRows: true },
      });
      const rows = dayRows(six.container);
      expect(rows).toHaveLength(6);
      for (const row of rows.slice(4)) {
        const days = row.querySelectorAll<HTMLElement>(".notes-month-view__day");
        expect(days).toHaveLength(7);
        for (const day of days) expect(day.dataset.outside).toBeDefined();
      }
    });

    it("renders blank cells in the added rows and skips them in keyboard navigation", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month: february, weeks: "none", sixRows: true, outsideDates: "blank" },
      });
      const rows = dayRows(container);
      expect(rows).toHaveLength(6);
      for (const row of rows.slice(4)) {
        expect(row.querySelectorAll(".notes-month-view__day--blank")).toHaveLength(7);
      }
      const last = container.querySelector<HTMLElement>('[data-grid-key="day:2027-02-22"]')!;
      last.focus();
      await fireEvent.keyDown(last, { key: "ArrowDown" });
      expect(document.activeElement).toBe(last);
    });

    it("decorates and opens the added days when outside days are active", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("corner")],
      });
      const harness = await bootHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const path = "daily/2027-03-08.md" as VaultPath;
      harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2027-03-08"), path });
      harness.host.putFile(path);
      const invoke = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue({} as never);
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month: february, weeks: "none", sixRows: true, outsideDates: "active" },
      });
      await nextTick();

      const added = container.querySelector<HTMLElement>('[data-grid-key="day:2027-03-08"]')!;
      expect(added.querySelector(".decoration-corner")).not.toBeNull();
      await fireEvent.click(added, { button: 0 });
      expect(invoke).toHaveBeenCalled();
    });
    it("keeps the added days inert, unmarked and out of navigation when outside days are inert", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("corner")],
      });
      const harness = await bootHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const path = "daily/2027-03-08.md" as VaultPath;
      harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2027-03-08"), path });
      harness.host.putFile(path);
      const invoke = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue({} as never);
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month: february, weeks: "none", sixRows: true, outsideDates: "inactive" },
      });
      await nextTick();

      const added = container.querySelector<HTMLElement>('.notes-month-view__day[data-anchor="2027-03-08"]')!;
      expect(added.dataset.inactive).toBe("true");
      expect(added.hasAttribute("tabindex")).toBe(false);
      expect(added.querySelector(".decoration-corner")).toBeNull();
      await fireEvent.click(added, { button: 0 });
      expect(invoke).not.toHaveBeenCalled();
      const last = container.querySelector<HTMLElement>('[data-grid-key="day:2027-02-22"]')!;
      last.focus();
      await fireEvent.keyDown(last, { key: "ArrowDown" });
      expect(document.activeElement).toBe(last);
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
      const labels = [...container.querySelectorAll(".notes-month-view__weekday-wide")].map((element) =>
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

    it.each([
      ["left", "1fr repeat(var(--day-columns, 7), 1fr)"],
      ["right", "repeat(var(--day-columns, 7), 1fr) 1fr"],
    ] as const)("lays the week-number column out as wide as a day, on the %s", (side, columns) => {
      const rule = calendarStyleRules().monthView.find(
        (candidate) =>
          candidate.container === null && candidate.selector === `.notes-month-view__grid[data-weeks="${side}"]`,
      );
      expect(rule?.declarations.get("grid-template-columns")).toBe(columns);
    });

    it.each([
      ["left", "end"],
      ["right", "start"],
    ] as const)("draws the divider on the days' side of week numbers on the %s", async (weeks, side) => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks } });
      const dividers = [...container.querySelectorAll<HTMLElement>(".notes-calendar-divider")];
      expect(dividers.map((divider) => divider.dataset.side)).toEqual([side]);
    });

    it("draws no divider without week numbers", async () => {
      const harness = await bootHarness({ daily: fixedJournal("daily", { type: "day" }) });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "none" } });
      expect(container.querySelector(".notes-calendar-divider")).toBeNull();
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

const bands = (container: Element, kind: "weekend" | "current-week"): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(`.notes-calendar-band[data-band="${CSS.escape(kind)}"]`),
];
const placement = (band: HTMLElement) => ({ column: band.style.gridColumn, row: band.style.gridRow });
const currentWeekAnchors = (container: Element): (string | undefined)[] =>
  [...container.querySelectorAll<HTMLElement>("[data-current-week]")].map((cell) => cell.dataset.anchor);
const daily = { daily: fixedJournal("daily", { type: "day" }) };

describe("NotesMonthView bands", () => {
  describe("weekend", () => {
    it("draws one band down Saturday and Sunday in a Monday-start grid, after the week numbers", async () => {
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });

      expect(bands(container, "weekend").map(placement)).toEqual([{ column: "7 / span 2", row: "auto" }]);
    });

    it("splits the weekend into the first and last columns of a Sunday-start grid", async () => {
      installTestCalendar({ dow: 0, doy: 6 });
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });

      expect(bands(container, "weekend").map(placement)).toEqual([
        { column: "2 / span 1", row: "auto" },
        { column: "8 / span 1", row: "auto" },
      ]);
    });

    it("starts at the first column with week numbers on the right", async () => {
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "right" } });

      expect(bands(container, "weekend").map(placement)).toEqual([{ column: "6 / span 2", row: "auto" }]);
    });

    it("moves the band to a custom Friday and Saturday", async () => {
      const harness = await bootHarness(daily, { weekend: { type: "custom", days: [5, 6] } });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });

      expect(bands(container, "weekend").map(placement)).toEqual([{ column: "6 / span 2", row: "auto" }]);
      const weekendDays = [...container.querySelectorAll<HTMLElement>(".notes-month-view__day[data-weekend]")];
      expect(new Set(weekendDays.map((cell) => new Date(`${cell.dataset.anchor}T12:00`).getDay()))).toEqual(
        new Set([5, 6]),
      );
    });

    it("draws no band and marks no day for an empty custom weekend", async () => {
      const harness = await bootHarness(daily, { weekend: { type: "custom", days: [] } });
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });

      expect(bands(container, "weekend")).toEqual([]);
      expect(container.querySelector("[data-weekend]")).toBeNull();
    });

    it("marks every weekend day, outside days included, inert or interactive", async () => {
      for (const outsideDates of ["active", "inactive"] as const) {
        const harness = await bootHarness(daily);
        const { container, unmount } = harness.render(NotesMonthView, { props: { shelf: null, month, outsideDates } });

        // 2026-08-01 is a Saturday inside the month; 2026-09-06 a Sunday padding its last row.
        expect(
          [dayCell(container, "2026-08-01"), dayCell(container, "2026-09-06")].map((cell) => cell?.dataset.weekend),
        ).toEqual(["true", "true"]);
        expect(dayCell(container, "2026-08-03")?.hasAttribute("data-weekend")).toBe(false);
        unmount();
      }
    });

    it("marks the weekend's column headers alone", async () => {
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });

      const marked = [...container.querySelectorAll<HTMLElement>('[role="columnheader"]')].map(
        (header) => header.dataset.weekend !== undefined,
      );
      expect(marked).toEqual([false, false, false, false, false, true, true]);
    });
  });

  describe("current week", () => {
    it("draws one band across today's row, counting the weekday header", async () => {
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });

      // Today, 2026-08-15, sits in the third week row; the header row is grid row 1.
      expect(bands(container, "current-week").map(placement)).toEqual([{ column: "1 / -1", row: "4 / span 1" }]);
    });

    // A visually hidden header row is absolutely positioned, so it takes no grid row.
    it("counts no header row when the weekday row is hidden", async () => {
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month, weeks: "left", showWeekdays: false },
      });

      expect(bands(container, "current-week").map(placement)).toEqual([{ column: "1 / -1", row: "3 / span 1" }]);
    });

    it("marks today's week number and its seven days, and nothing else", async () => {
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });

      const row = dayRows(container)[2];
      const marked = [...(row?.querySelectorAll<HTMLElement>("[data-current-week]") ?? [])];
      expect(marked.length).toBe(8);
      expect(marked[0]?.dataset.testid).toBe("week-number-cell");
      expect(container.querySelectorAll("[data-current-week]").length).toBe(8);
    });

    it("today's week number and the current month heading carry no today", async () => {
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });

      expect(container.querySelector('[data-testid="week-number-cell"][data-today]')).toBeNull();
      expect(container.querySelector('[data-testid="header-month"][data-today]')).toBeNull();
      expect(container.querySelector('[data-anchor="2026-08-15"][data-today]')).not.toBeNull();
    });

    it("draws no current-week band in a month without today", async () => {
      const harness = await bootHarness(daily);
      const other = MonthPeriod.containing(CalendarDate.fromAnchor(anchor("2026-03-15")));
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month: other } });

      expect(bands(container, "current-week")).toEqual([]);
      expect(container.querySelector("[data-current-week]")).toBeNull();
    });

    // 2026-11-01 is a Sunday, so its Monday-start week runs from 26 October.
    it("draws the band in both months of a week that straddles them, over each one's real days", async () => {
      vi.setSystemTime(new Date(2026, 10, 1, 12, 0, 0));
      const october = MonthPeriod.containing(CalendarDate.fromAnchor(anchor("2026-10-15")));
      const november = MonthPeriod.containing(CalendarDate.fromAnchor(anchor("2026-11-15")));
      const harness = await bootHarness(daily);

      const before = harness.render(NotesMonthView, {
        props: { shelf: null, month: october, outsideDates: "blank", weeks: "left" },
      });
      expect(bands(before.container, "current-week").map(placement)).toEqual([{ column: "1 / -1", row: "6 / span 1" }]);
      expect(currentWeekAnchors(before.container).slice(1)).toEqual([
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
        "2026-10-29",
        "2026-10-30",
        "2026-10-31",
      ]);
      before.unmount();

      const after = harness.render(NotesMonthView, {
        props: { shelf: null, month: november, outsideDates: "blank", weeks: "left" },
      });
      expect(bands(after.container, "current-week").map(placement)).toEqual([{ column: "1 / -1", row: "2 / span 1" }]);
      expect(currentWeekAnchors(after.container).slice(1)).toEqual(["2026-11-01"]);
    });

    it("draws no current-week band across a row of blanks alone", async () => {
      // The sixth row of a six-row July is 3–9 August, all outside the month.
      vi.setSystemTime(new Date(2026, 7, 5, 12, 0, 0));
      const july = MonthPeriod.containing(CalendarDate.fromAnchor(anchor("2026-07-15")));
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, {
        props: { shelf: null, month: july, outsideDates: "blank", sixRows: true },
      });

      expect(bands(container, "current-week")).toEqual([]);
      expect(container.querySelector("[data-current-week]")).toBeNull();
    });

    it("draws no current-week band when the caller opts out", async () => {
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, currentWeekBand: false } });

      expect(bands(container, "current-week")).toEqual([]);
      expect(container.querySelector("[data-current-week]")).toBeNull();
    });

    it("moves to the next row when midnight starts a new week", async () => {
      vi.setSystemTime(new Date(2026, 7, 16, 23, 59, 0));
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month, weeks: "left" } });
      expect(bands(container, "current-week").map(placement)).toEqual([{ column: "1 / -1", row: "4 / span 1" }]);

      await vi.advanceTimersByTimeAsync(61_000);

      expect(bands(container, "current-week").map(placement)).toEqual([{ column: "1 / -1", row: "5 / span 1" }]);
      expect(currentWeekAnchors(container).at(1)).toBe("2026-08-17");
    });
  });

  describe("in the grid", () => {
    it("places every band ahead of the header row, weekend bands first, then the divider", async () => {
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });
      const grid = container.querySelector('[role="grid"]');
      const children = [...(grid?.children ?? [])];
      const firstRow = children.findIndex((child) => child.getAttribute("role") === "row");

      expect(
        children.slice(0, firstRow).map((child) => (child as HTMLElement).dataset.band ?? child.className),
      ).toEqual(["weekend", "current-week", "notes-calendar-divider"]);
    });

    it("hides every band from assistive tech", async () => {
      const harness = await bootHarness(daily);
      const { container } = harness.render(NotesMonthView, { props: { shelf: null, month } });

      const hidden = [...container.querySelectorAll(".notes-calendar-band, .notes-calendar-band *")].map((element) =>
        element.getAttribute("aria-hidden"),
      );
      expect(hidden.length).toBe(6);
      expect(new Set(hidden)).toEqual(new Set(["true"]));
    });

    // A non-positioned header paints before every positioned z-0 element, so an under band would cover its text.
    it.each([
      ["monthView", ".notes-month-view__weekday"],
      ["weekView", ".notes-week-view__weekday"],
      ["preview", ".appearance-preview__weekday"],
    ] as const)("%s positions its weekday header above an under band, without a z-index", (component, selector) => {
      const header = calendarStyleRules()[component].find(
        (rule) => rule.container === null && rule.selector === selector,
      );
      expect(header?.declarations.get("position")).toBe("relative");
      expect(header?.declarations.has("z-index")).toBe(false);
    });

    it("positions the grid for its bands without isolating it", () => {
      const grid = calendarStyleRules().monthView.find(
        (rule) =>
          rule.container === null && rule.selector === ".notes-month-view__grid" && rule.declarations.has("display"),
      );
      expect(grid?.declarations.get("position")).toBe("relative");
      expect(grid?.declarations.has("isolation")).toBe(false);
      expect(grid?.declarations.has("z-index")).toBe(false);
    });

    // jsdom does no hit testing, so this reads the rules that decide it: the pointer passes through every band
    // layer, and an over band is z 1 at most while a cell with an open popover lifts to the popover layer.
    it("lets the pointer through an over band and lifts a cell's open popover above it", () => {
      const { band, cell } = calendarStyleRules();

      expect(band.find((rule) => rule.selector === ".notes-calendar-band")?.declarations.get("pointer-events")).toBe(
        "none",
      );
      const layers = band
        .filter((rule) => rule.declarations.has("z-index"))
        .map((rule) => rule.declarations.get("z-index"));
      expect(layers).toEqual(["clamp(0, var(--_v-weekend-layer), 1)", "clamp(0, var(--_v-current-week-layer), 1)"]);
      expect(
        cell
          .find((rule) => rule.selector === ".notes-calendar-cell:has(.mark-overflow__popover)")
          ?.declarations.get("z-index"),
      ).toBe("var(--layer-popover)");
    });
  });
});
