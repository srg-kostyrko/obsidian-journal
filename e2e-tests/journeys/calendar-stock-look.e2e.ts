import { $, browser, expect } from "@wdio/globals";

import { reloadObsidianOn } from "../support/clock.js";
import { seedNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { hostNote, openInReadingMode, VISIBLE_LEAF } from "./code-blocks.js";

// The stock look, read off a real calendar with nothing saved: the weekends fixture has no appearance,
// starts weeks on Monday and shows week numbers on the left. Today is pinned to Wednesday 12 May 2027,
// so the current week runs 10–16 May.
const PINNED_TODAY = "2027-05-12";
const SELECTED = "2027-05-20";

const VIEW_ID = "2b7e4c19-8a3d-4f6e-9b1c-5d0a7e3f2c84";
const ROOT = `[data-journal-view="${VIEW_ID}"]`;
const MONTH = `${ROOT} .journal-view-month-calendar`;

// Every case forces the block's width, so wide and narrow do not depend on the sidebar's.
const WIDE = "40em";
const NARROW = "20em";
// Under the breakpoint, but wide enough that the wide stock row (7cqi) would come out above 26px.
const NARROW_BUT_GROWN = "27em";
// The breakpoint's 28em, in the units of the container it is evaluated against.
const BREAKPOINT_EMS = 28;

// The stock reads theme variables; the view root pins each to a hex of its own, so a color compares
// exactly instead of against whatever the theme resolves.
const MUTED = "#5a6b7c";
const ACCENT = "#9c2f6a";
const BORDER = "#2e8b57";

const YEAR_HOST = "weekends/year-timeline.md";
// May 2027 opens on a Saturday, so a month timeline that hides outside days leads with blanks.
const BLANKS_HOST = "weekends/blank-outside-timeline.md";
const TIMELINE = `${VISIBLE_LEAF} .markdown-reading-view .block-language-calendar-timeline`;

class StockLookError extends Error {
  override name = "StockLookError";
}

async function openView(): Promise<void> {
  // Revealed, not only placed: the right sidebar boots collapsed, and a collapsed split lays nothing out.
  await browser.executeObsidian(async ({ app }, id) => {
    const leaf = app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: `journal-view:${id}`, active: true });
    await app.workspace.revealLeaf(leaf);
  }, VIEW_ID);
  await $(`${MONTH} .notes-month-view__day`).waitForDisplayed({ timeoutMsg: "the view showed no day" });
}

async function detachView(): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    for (const leaf of app.workspace.getLeavesOfType(`journal-view:${id}`)) leaf.detach();
  }, VIEW_ID);
}

async function pinThemeColors(): Promise<void> {
  await browser.execute(
    (root: string, colors: Record<string, string>) => {
      const host = document.querySelector<HTMLElement>(root);
      for (const [name, value] of Object.entries(colors)) host?.style.setProperty(name, value);
    },
    ROOT,
    { "--text-muted": MUTED, "--text-accent": ACCENT, "--background-modifier-border": BORDER },
  );
}

async function forceWidth(block: string, width: string): Promise<void> {
  await browser.execute(
    (selector: string, forced: string) => {
      for (const candidate of document.querySelectorAll<HTMLElement>(selector)) {
        if (candidate.clientWidth > 0) candidate.style.width = forced;
      }
    },
    block,
    width,
  );
}

async function hexOf(selector: string, property: string): Promise<string | undefined> {
  const read = await $(selector).getCSSProperty(property);
  return (read.parsed as { hex?: string }).hex;
}

async function expectHex(selector: string, property: string, hex: string, message: string): Promise<void> {
  let last: string | undefined;
  await waitForState(
    async () => {
      last = await hexOf(selector, property);
      return last;
    },
    (value) => value === hex,
    message,
  ).catch((error: unknown) => {
    throw new StockLookError(`${message}: read ${String(last)}`, { cause: error });
  });
}

// Polls a layout read until it settles on something the predicate accepts, then hands the read back so
// the verdict is asserted outside the wait.
async function settle<T>(read: () => Promise<T | null>, accept: (value: T) => boolean, message: string): Promise<T> {
  let last: T | null = null;
  await waitForState(
    async () => {
      last = await read();
      return last;
    },
    accept,
    message,
  ).catch((error: unknown) => {
    throw new StockLookError(`${message}: read ${JSON.stringify(last)}`, { cause: error });
  });
  return last as unknown as T;
}

// Obsidian's zoom scales authored pixels, so a width compares rounded.
async function roundedPx(selector: string, property: string): Promise<string> {
  const read = await $(selector).getCSSProperty(property);
  return typeof read.parsed.value === "number" ? `${Math.round(read.parsed.value)}px` : String(read.value);
}

interface WeekdayRead {
  readonly wideShown: boolean;
  readonly narrowShown: boolean;
  readonly wide: string;
  readonly narrow: string;
}

// The weekday labels of every laid-out month in `block`, one list per month.
function readWeekdays(block: string): Promise<WeekdayRead[][] | null> {
  return browser.execute((selector: string) => {
    const host = [...document.querySelectorAll<HTMLElement>(selector)].find((candidate) => candidate.clientWidth > 0);
    if (host === undefined) return null;
    return [...host.querySelectorAll(".notes-month-view")].map((month) =>
      [...month.querySelectorAll(".notes-month-view__weekday")].map((weekday) => {
        const wide = weekday.querySelector(".notes-month-view__weekday-wide");
        const narrow = weekday.querySelector(".notes-month-view__weekday-narrow");
        return {
          wideShown: wide !== null && getComputedStyle(wide).display !== "none",
          narrowShown: narrow !== null && getComputedStyle(narrow).display !== "none",
          wide: (wide?.textContent ?? "").trim(),
          narrow: (narrow?.textContent ?? "").trim(),
        };
      }),
    );
  }, block);
}

const oneLetter = (months: readonly (readonly WeekdayRead[])[]): boolean =>
  months.length > 0 &&
  months.every(
    (weekdays) =>
      weekdays.length > 0 &&
      weekdays.every(({ wideShown, narrowShown, narrow }) => !wideShown && narrowShown && [...narrow].length === 1),
  );

interface SelectedRead {
  readonly ring: number;
  readonly strength: number;
}

// The widest length in the ring's box-shadow (its spread) and the fill's opacity.
function readSelected(anchor: string): Promise<SelectedRead | null> {
  return browser.execute(
    (month: string, target: string) => {
      const cell = document.querySelector(`${month} .notes-month-view__day[data-anchor="${CSS.escape(target)}"]`);
      const ring = cell?.querySelector('[data-layer="selected-ring"]');
      const fill = cell?.querySelector('[data-layer="selected-fill"]');
      if (!cell?.hasAttribute("data-selected") || !ring || !fill) return null;
      const lengths = (getComputedStyle(ring).boxShadow.match(/-?[\d.]+px/g) ?? []).map(Number.parseFloat);
      return { ring: Math.round(Math.max(0, ...lengths)), strength: Number(getComputedStyle(fill).opacity) };
    },
    MONTH,
    anchor,
  );
}

interface RowRead {
  readonly minHeight: number;
  readonly inline: number;
  readonly breakpoint: number;
}

// A day cell's min-height at `width`, the inline size of the month it is a row of, and the breakpoint in
// px: a container query's em is the container's own font size.
async function readRow(width: string): Promise<RowRead | null> {
  await forceWidth(MONTH, width);
  return browser.execute(
    (month: string, ems: number) => {
      const view = document.querySelector(`${month} .notes-month-view`);
      const cell = view?.querySelector<HTMLElement>('.notes-calendar-cell[role="gridcell"]');
      if (!view || !cell) return null;
      const styles = getComputedStyle(view);
      const inline = view.clientWidth - Number.parseFloat(styles.paddingLeft) - Number.parseFloat(styles.paddingRight);
      return {
        minHeight: Number.parseFloat(getComputedStyle(cell).minHeight),
        inline,
        breakpoint: ems * Number.parseFloat(styles.fontSize),
      };
    },
    MONTH,
    BREAKPOINT_EMS,
  );
}

describe("the calendar's stock look", () => {
  before(async () => {
    await reloadObsidianOn(PINNED_TODAY, {
      vault: "./e2e-tests/fixtures/e2e-calendar-weekends",
      plugins: ["journals"],
    });
    await openView();
    await pinThemeColors();
    await forceWidth(MONTH, WIDE);
  });

  after(detachView);

  describe("week numbers", () => {
    const plain = `${MONTH} .notes-month-view__week-number:not([data-current-week])`;
    const current = `${MONTH} .notes-month-view__week-number[data-current-week]`;

    it("week numbers are muted and lighter, the current one in the accent and bold", async () => {
      await expectHex(`${plain} > .notes-calendar-cell__text`, "color", MUTED, "a week number is not muted");
      await expectHex(
        `${current} > .notes-calendar-cell__text`,
        "color",
        ACCENT,
        "the current week number is not in the accent",
      );
      const text = await browser.execute(
        (plainCell: string, currentCell: string) => {
          const label = (cell: string): Element | null => document.querySelector(`${cell} .cell-decoration__content`);
          const weight = (element: Element | null): number =>
            element === null ? NaN : Number(getComputedStyle(element).fontWeight);
          const week = document.querySelector(plainCell);
          const row = week?.parentElement;
          const root = getComputedStyle(document.body);
          return {
            plain: weight(label(plainCell)),
            current: weight(label(currentCell)),
            normal: Number(root.getPropertyValue("--font-normal")),
            bold: Number(root.getPropertyValue("--font-bold")),
            size:
              week && row
                ? Number.parseFloat(getComputedStyle(week).fontSize) / Number.parseFloat(getComputedStyle(row).fontSize)
                : NaN,
          };
        },
        plain,
        current,
      );
      expect(text.plain).toBe(text.normal);
      expect(text.current).toBe(text.bold);
      expect(text.current).toBeGreaterThan(text.plain);
      expect(text.size).toBeCloseTo(0.85, 2);
    });

    it("the divider sits between the week numbers and the days", async () => {
      const divider = `${MONTH} .notes-calendar-divider`;
      expect(await roundedPx(divider, "border-right-width")).toBe("1px");
      await expectHex(divider, "border-right-color", BORDER, "the divider does not take the border color");
      const layout = await settle(
        () =>
          browser.execute((month: string) => {
            const grid = document.querySelector(`${month} .notes-month-view__grid`);
            const line = grid?.querySelector(".notes-calendar-divider");
            // May 2027 opens on a Saturday, so the full second week gives the first day column.
            const [header, firstWeek, fullWeek] = grid?.querySelectorAll(":scope > [role='row']") ?? [];
            const week = firstWeek?.querySelector(".notes-month-view__week-number");
            const day = fullWeek?.querySelector(".notes-month-view__day");
            if (!grid || !line || !week || !day || !header) return null;
            const box = line.getBoundingClientRect();
            const width = Number.parseFloat(getComputedStyle(line).borderRightWidth);
            return {
              lineLeft: box.right - width,
              lineRight: box.right,
              top: box.top,
              bottom: box.bottom,
              weekRight: week.getBoundingClientRect().right,
              weekTop: week.getBoundingClientRect().top,
              dayLeft: day.getBoundingClientRect().left,
              headerBottom: header.getBoundingClientRect().bottom,
              gridBottom: grid.getBoundingClientRect().bottom,
            };
          }, MONTH),
        (read) => read.lineRight > read.lineLeft,
        "the month block drew no divider line",
      );
      // Inside the gutter, so no week-number or day fill covers it, and centred on it.
      expect(layout.lineLeft).toBeGreaterThanOrEqual(layout.weekRight - 0.05);
      expect(layout.lineRight).toBeLessThanOrEqual(layout.dayLeft + 0.05);
      expect(Math.abs((layout.lineLeft + layout.lineRight) / 2 - (layout.weekRight + layout.dayLeft) / 2)).toBeLessThan(
        0.5,
      );
      // From the first week row, under the weekday header, to the grid's end.
      expect(Math.abs(layout.top - layout.weekTop)).toBeLessThan(1);
      expect(layout.top).toBeGreaterThanOrEqual(layout.headerBottom - 0.05);
      expect(Math.abs(layout.bottom - layout.gridBottom)).toBeLessThan(1);
    });
  });

  describe("rows", () => {
    after(async () => {
      await forceWidth(MONTH, WIDE);
    });

    it("rows grow on a wide calendar and stay at 26px on a narrow one", async () => {
      const wide = await settle(
        () => readRow(WIDE),
        (value) => value.inline > value.breakpoint,
        `the month did not lay out at ${WIDE}`,
      );
      // The stock wide row: 7% of the calendar's width, between 26px and 64px.
      const growing = Math.min(64, Math.max(26, 0.07 * wide.inline));
      expect(growing).toBeGreaterThan(26);
      expect(Math.abs(wide.minHeight - growing)).toBeLessThan(1);

      // Read where the wide stock would already be taller than 26px, so only the narrow stock gives 26px.
      const narrow = await settle(
        () => readRow(NARROW_BUT_GROWN),
        (value) => value.inline < value.breakpoint,
        `the month did not lay out at ${NARROW_BUT_GROWN}`,
      );
      expect(0.07 * narrow.inline).toBeGreaterThan(27);
      expect(Math.round(narrow.minHeight)).toBe(26);
    });

    // A hidden outside day is no cell and reads the row height itself, so its narrow stock is its own.
    it("a hidden outside day holds a narrow row at 26px", async () => {
      await seedNote(
        BLANKS_HOST,
        hostNote("daily", "2027-05-14", "```calendar-timeline\nmode: month\noutside: hidden\n```"),
      );
      await openInReadingMode(BLANKS_HOST);
      await forceWidth(TIMELINE, NARROW_BUT_GROWN);
      const read = await settle(
        () =>
          browser.execute(
            (block: string, ems: number) => {
              const host = [...document.querySelectorAll<HTMLElement>(block)].find(
                (candidate) => candidate.clientWidth > 0,
              );
              const view = host?.querySelector<HTMLElement>(".notes-month-view");
              const blank = view?.querySelector(".notes-month-view__day--blank");
              const cell = view?.querySelector('.notes-calendar-cell[role="gridcell"]');
              if (!view || !blank || !cell) return null;
              return {
                inline: view.clientWidth,
                breakpoint: ems * Number.parseFloat(getComputedStyle(view).fontSize),
                blank: Math.round(Number.parseFloat(getComputedStyle(blank).minHeight)),
                cell: Math.round(Number.parseFloat(getComputedStyle(cell).minHeight)),
              };
            },
            TIMELINE,
            BREAKPOINT_EMS,
          ),
        (value) => value.inline < value.breakpoint && 0.07 * value.inline > 27,
        `the month timeline did not lay out under the breakpoint at ${NARROW_BUT_GROWN}`,
      );
      expect({ blank: read.blank, cell: read.cell }).toEqual({ blank: 26, cell: 26 });
    });
  });

  describe("a narrow calendar", () => {
    before(async () => {
      // A shift-click selects the date without opening it, as the gate does.
      await browser.execute(
        (month: string, anchor: string) => {
          document
            .querySelector<HTMLElement>(`${month} .notes-month-view__day[data-anchor="${CSS.escape(anchor)}"]`)
            ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, shiftKey: true }));
        },
        MONTH,
        SELECTED,
      );
      await waitForState(
        () => $(`${MONTH} .notes-month-view__day[data-anchor="${SELECTED}"]`).getAttribute("aria-selected"),
        (selected) => selected === "true",
        `the ${SELECTED} day cell did not become selected`,
      );
    });

    after(async () => {
      await forceWidth(MONTH, WIDE);
    });

    it("a narrow calendar shows one-letter weekdays and tints the selected date", async () => {
      // Wide first: the narrow look is a change from it, not the only look there is.
      await forceWidth(MONTH, WIDE);
      const wideDays = await settle(
        () => readWeekdays(MONTH),
        (months) => months.length > 0 && months.every((days) => days.every((day) => day.wideShown)),
        `the weekday header at ${WIDE} did not show its wide labels`,
      );
      expect(wideDays.flat().every((day) => !day.narrowShown && [...day.wide].length > 1)).toBe(true);
      const wideSelected = await settle(
        () => readSelected(SELECTED),
        () => true,
        "no selected date at wide",
      );
      expect(wideSelected).toEqual({ ring: 2, strength: 0 });

      await forceWidth(MONTH, NARROW);
      await settle(() => readWeekdays(MONTH), oneLetter, `the weekday header at ${NARROW} is not one letter`);
      const narrowSelected = await settle(
        () => readSelected(SELECTED),
        (read) => read.ring === 0,
        `the selected date at ${NARROW} kept its ring`,
      );
      expect(narrowSelected).toEqual({ ring: 0, strength: 0.2 });
    });
  });

  describe("headings", () => {
    it("the current month heading takes no accent", async () => {
      const heading = `${MONTH} [data-testid="header-month"]`;
      await $(heading).waitForExist({ timeoutMsg: "the month block showed no month heading" });
      expect(await $(heading).getAttribute("data-anchor")).toBe("2027-05-01");
      expect(await $(heading).getAttribute("data-today")).toBeNull();
      const own = await hexOf(`${MONTH} .notes-month-view__header`, "color");
      expect(own).toBeDefined();
      expect(own).not.toBe(ACCENT);
      await expectHex(`${heading} > .notes-calendar-cell__text`, "color", own ?? "", "the month heading changed color");
    });
  });

  // A timeline's months sit about a third of the note wide each, under the breakpoint, so they take every
  // stock narrow value. A timeline selects no date, so the narrow selected tint is the view's case above.
  describe("a timeline in year mode", () => {
    before(async () => {
      await seedNote(YEAR_HOST, hostNote("daily", "2027-05-14", "```calendar-timeline\nmode: calendar\n```"));
      await openInReadingMode(YEAR_HOST);
      await settle(
        () => readWeekdays(TIMELINE),
        (months) => months.length === 12,
        "the year timeline did not render twelve months",
      );
    });

    it("a timeline in year mode draws its months narrow", async () => {
      await settle(() => readWeekdays(TIMELINE), oneLetter, "a timeline month's weekdays are not one letter");
      const months = await browser.execute(
        (block: string, ems: number) => {
          const host = [...document.querySelectorAll<HTMLElement>(block)].find(
            (candidate) => candidate.clientWidth > 0,
          );
          return [...(host?.querySelectorAll(".notes-month-view") ?? [])].map((month) => {
            const grid = month.querySelector(".notes-month-view__grid");
            const day = month.querySelector<HTMLElement>('.notes-month-view__day[role="gridcell"]');
            const row = day?.parentElement;
            if (!grid || !day || !row) return null;
            return {
              narrow: month.clientWidth < ems * Number.parseFloat(getComputedStyle(month).fontSize),
              minHeight: Math.round(Number.parseFloat(getComputedStyle(day).minHeight)),
              gap: Math.round(Number.parseFloat(getComputedStyle(grid).rowGap)),
              dateSize:
                Math.round(
                  (Number.parseFloat(getComputedStyle(day).fontSize) /
                    Number.parseFloat(getComputedStyle(row).fontSize)) *
                    100,
                ) / 100,
            };
          });
        },
        TIMELINE,
        BREAKPOINT_EMS,
      );
      expect(months).toHaveLength(12);
      for (const month of months) {
        expect(month).not.toBeNull();
        expect(month?.narrow).toBe(true);
        expect({ minHeight: month?.minHeight, gap: month?.gap, dateSize: month?.dateSize }).toEqual({
          minHeight: 26,
          gap: 1,
          dateSize: 1,
        });
      }
    });
  });
});
