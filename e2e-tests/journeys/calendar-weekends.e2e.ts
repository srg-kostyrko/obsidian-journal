import { $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { chooseFromList, controlRowPath, openEditor, setCustomColor } from "../support/appearance-editor.js";
import { reloadObsidianOn } from "../support/clock.js";
import { closeSettings, expandSection, isSettingsOpen, openSettings } from "../support/settings.js";
import { waitForActiveNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { labelHexOf } from "./calendar.js";
import { openInReadingMode, VISIBLE_LEAF } from "./code-blocks.js";

// The fixture starts weeks on Monday and shows week numbers on the left, so the day columns start at
// the grid's second line. Today is pinned to Wednesday 12 May 2027: its row runs 10–16 May, and May
// opens on a Saturday.
const PINNED_TODAY = "2027-05-12";
const TODAY_ROW_LAST = "2027-05-16";
const FRIDAY = "2027-05-21";
const SATURDAY = "2027-05-22";
const SUNDAY = "2027-05-23";
// Both ship in the fixture: the Saturday carries the `tinted` tag the journal's text-color decoration
// matches, and the later Saturday is a plain note a click opens rather than creates.
const DECORATED = SATURDAY;
const PLAIN_WEEKEND = SUNDAY;
const CLICK_TARGET = "2027-05-29";

const VIEW_ID = "2b7e4c19-8a3d-4f6e-9b1c-5d0a7e3f2c84";
const ROOT = `[data-journal-view="${VIEW_ID}"]`;
const MONTH = `${ROOT} .journal-view-month-calendar`;
const WEEK = `${ROOT} .journal-view-week-calendar`;

const TIMELINE_HOST = "weekends/timeline-host.md";
// The host's fence hides Saturday: Friday, Sunday and the rest of its May 2027 row stay.
const TIMELINE_FRIDAY = "2027-05-14";
const TIMELINE_SATURDAY = "2027-05-15";
const TIMELINE_SUNDAY = "2027-05-16";
// A markdown leaf mounts the note twice (live preview and reading view); read the reading view's.
const TIMELINE = `${VISIBLE_LEAF} .markdown-reading-view .block-language-calendar-timeline`;

const BAND_FILL = "#3a7d5f";
const WEEKEND_TEXT = "#563412";
const DECORATION_TEXT = "#cc3300";

const STYLE = m.calendar_appearance_control({ control: "highlight_style" });
const HIGHLIGHT_COLOR = m.calendar_appearance_control({ control: "highlight_color" });
const TEXT_COLOR = m.calendar_appearance_control({ control: "highlight_text_color" });
const OVER = m.calendar_appearance_control({ control: "highlight_over" });

// Unrounded: Obsidian's zoom scales authored pixels, so sides compare within a pixel or rounded.
interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
}

interface GridLayout {
  readonly weekendBands: readonly Box[];
  readonly currentWeekBands: readonly Box[];
  readonly days: Readonly<Record<string, Box>>;
  readonly weekendHeaders: readonly Box[];
  readonly lastRowBottom: number;
  readonly todayRow: { readonly weekNumber: Box | null; readonly lastDay: Box | null } | null;
}

class WeekendReadError extends Error {
  override name = "WeekendReadError";
}

// One round trip per read, so every box comes from the same frame. The grid is the laid-out one that
// holds `anchor`: earlier leaves can keep zero-width copies of a block in the DOM.
function readGrid(scope: string, anchor: string): Promise<GridLayout | null> {
  return browser.execute(
    (scopeSelector: string, target: string) => {
      const box = (element: Element): Box => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
      };
      const grid = [...document.querySelectorAll(`${scopeSelector} [data-anchor="${CSS.escape(target)}"]`)]
        .filter((cell) => cell.getClientRects().length > 0)
        .map((cell) => cell.closest(".notes-month-view__grid, .notes-week-view__grid"))
        .find((candidate) => candidate !== null);
      if (grid == null) return null;
      const bands = (kind: string): Box[] =>
        [...grid.querySelectorAll(`:scope > .notes-calendar-band[data-band="${CSS.escape(kind)}"]`)].map(box);
      const days: Record<string, Box> = {};
      for (const cell of grid.querySelectorAll<HTMLElement>("[role='gridcell'][data-anchor]")) {
        days[cell.dataset.anchor ?? ""] = box(cell);
      }
      const rows = [...grid.querySelectorAll(":scope > [role='row']")];
      const todayRow = grid.querySelector("[role='gridcell'][data-today]")?.closest("[role='row']");
      const rowDays = todayRow ? [...todayRow.querySelectorAll("[role='gridcell']")] : [];
      const weekNumber = todayRow?.querySelector("[data-testid='week-number-cell']");
      const lastDay = rowDays.at(-1);
      return {
        weekendBands: bands("weekend"),
        currentWeekBands: bands("current-week"),
        days,
        weekendHeaders: [...grid.querySelectorAll("[role='columnheader'][data-weekend]")].map(box),
        lastRowBottom: rows.length === 0 ? 0 : (rows.at(-1)?.getBoundingClientRect().bottom ?? 0),
        todayRow: todayRow
          ? { weekNumber: weekNumber ? box(weekNumber) : null, lastDay: lastDay ? box(lastDay) : null }
          : null,
      };
    },
    scope,
    anchor,
  );
}

async function waitForGrid(
  scope: string,
  anchor: string,
  accept: (layout: GridLayout) => boolean,
  message: string,
): Promise<GridLayout> {
  let last: GridLayout | null = null;
  await waitForState(
    async () => {
      last = await readGrid(scope, anchor);
      return last;
    },
    accept,
    message,
  ).catch((error: unknown) => {
    // The day boxes are left out: forty-odd of them bury the bands the message is about.
    const read = last === null ? null : { ...last, days: undefined };
    throw new WeekendReadError(`${message}: read ${JSON.stringify(read)}`, { cause: error });
  });
  return last as unknown as GridLayout;
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1;

function day(layout: GridLayout, anchor: string): Box {
  const found = layout.days[anchor];
  if (found === undefined) throw new WeekendReadError(`the grid has no ${anchor} day cell`);
  return found;
}

// A band spanning exactly the columns from `first`'s cell to `last`'s.
const spans = (band: Box | undefined, first: Box, last: Box): boolean =>
  band !== undefined && near(band.left, first.left) && near(band.right, last.right);

// Rounded, so a failed comparison prints the sides that differ.
const sides = (box: Box | undefined) =>
  box === undefined
    ? null
    : {
        left: Math.round(box.left),
        right: Math.round(box.right),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
      };

const columnsOf = (first: Box, last: Box) => ({ left: Math.round(first.left), right: Math.round(last.right) });
const horizontal = (box: Box | undefined) => {
  const read = sides(box);
  return read === null ? null : { left: read.left, right: read.right };
};

function expectContains(outer: Box, inner: Box, what: string): void {
  const inside =
    outer.left <= inner.left + 1 &&
    outer.right >= inner.right - 1 &&
    outer.top <= inner.top + 1 &&
    outer.bottom >= inner.bottom - 1;
  if (!inside) {
    throw new WeekendReadError(
      `${what}: ${JSON.stringify(sides(outer))} does not hold ${JSON.stringify(sides(inner))}`,
    );
  }
}

async function openView(): Promise<void> {
  // Revealed, not only placed: the right sidebar boots collapsed, and a collapsed split lays
  // nothing out.
  await browser.executeObsidian(async ({ app }, id) => {
    const leaf = app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: `journal-view:${id}`, active: true });
    await app.workspace.revealLeaf(leaf);
  }, VIEW_ID);
  await $(`${MONTH} .notes-month-view__day`).waitForDisplayed({ timeoutMsg: "the weekends view showed no day" });
}

async function detachView(): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    for (const leaf of app.workspace.getLeavesOfType(`journal-view:${id}`)) leaf.detach();
  }, VIEW_ID);
}

const selectIn = (label: string) => $(controlRowPath(label)).$("select");

async function chooseSelect(label: string, value: string): Promise<void> {
  const select = selectIn(label);
  await select.waitForExist({ timeoutMsg: `the inspector showed no ${label} control` });
  await select.selectByAttribute("value", value);
}

const weekendRow = (): string =>
  `//div[contains(@class,"setting-item")][.//div[contains(@class,"setting-item-name")][normalize-space(.)="${m.calendar_weekend_label()}"]]`;

async function openCalendarSettings(): Promise<void> {
  if (await isSettingsOpen()) await closeSettings();
  await openSettings();
  await expandSection(m.common_label_calendar());
  await $(weekendRow()).waitForDisplayed({ timeoutMsg: "the calendar settings showed no weekend row" });
}

const weekdayName = (weekday: number): Promise<string> =>
  browser.executeObsidian(({ obsidian }, index) => obsidian.moment.weekdays(index), weekday);

// The day toggles carry moment's weekday names, in the installed locale.
async function toggleWeekendDay(weekday: number): Promise<void> {
  const name = await weekdayName(weekday);
  await $(`//div[contains(@class,"ui-toggle-group")]/button[normalize-space(.)="${name}"]`).click();
}

async function weekendDaysPressed(): Promise<string[]> {
  return browser.execute(() =>
    [...document.querySelectorAll<HTMLElement>(".ui-toggle-group__option[aria-pressed='true']")].map((button) =>
      (button.textContent ?? "").trim(),
    ),
  );
}

async function expectLabel(anchor: string, hex: string, message: string): Promise<void> {
  let last: string | undefined;
  await waitForState(
    async () => {
      last = await labelHexOf(`${MONTH} .notes-month-view__day[data-anchor="${anchor}"]`);
      return last;
    },
    (value) => value === hex,
    message,
  ).catch((error: unknown) => {
    throw new WeekendReadError(`${message}: read ${String(last)}`, { cause: error });
  });
}

// Every case builds on the editor and settings state the ones before it left, so running a single
// case with --grep is not supported.
describe("weekend and current-week bands", () => {
  before(async () => {
    await reloadObsidianOn(PINNED_TODAY, {
      vault: "./e2e-tests/fixtures/e2e-calendar-weekends",
      plugins: ["journals"],
    });
    await openView();
  });

  after(async () => {
    if (await isSettingsOpen()) await closeSettings();
    await detachView();
  });

  describe("the current week", () => {
    it("its band covers the today row from the week number to the last day", async () => {
      const layout = await waitForGrid(
        MONTH,
        PINNED_TODAY,
        (read) => read.currentWeekBands.length === 1 && read.todayRow?.weekNumber != null,
        "the month block drew no single current-week band",
      );
      const [band] = layout.currentWeekBands;
      const weekNumber = layout.todayRow?.weekNumber;
      const lastDay = layout.todayRow?.lastDay;
      expect(band && weekNumber && lastDay).toBeTruthy();
      if (!band || !weekNumber || !lastDay) return;
      expect(sides(lastDay)).toEqual(sides(day(layout, TODAY_ROW_LAST)));
      expectContains(band, weekNumber, "the current-week band missed the week number");
      expectContains(band, lastDay, "the current-week band missed the row's last day");
      // One row, not the whole grid: the band ends above the row after today's.
      expect(band.bottom).toBeLessThan(day(layout, "2027-05-17").top + 1);
    });

    it("the week view block draws the weekend band and no current-week band", async () => {
      const layout = await waitForGrid(
        WEEK,
        PINNED_TODAY,
        (read) => read.weekendBands.length === 1,
        "the week view block drew no weekend band",
      );
      expect(layout.currentWeekBands).toEqual([]);
      expect(await $(`${WEEK} [data-today]`).isExisting()).toBe(true);
      expect(await $(`${WEEK} [data-current-week]`).isExisting()).toBe(false);
    });
  });

  describe("a weekend styled in the editor", () => {
    before(async () => {
      await openEditor();
      await chooseFromList("weekend");
      await chooseSelect(STYLE, "background");
      await setCustomColor(HIGHLIGHT_COLOR, BAND_FILL);
      await setCustomColor(TEXT_COLOR, WEEKEND_TEXT);
      await waitForState(
        async () => {
          const fill = await $(`${MONTH} [data-layer="weekend-fill"]`).getCSSProperty("background-color");
          return fill.parsed.hex;
        },
        (hex) => hex === BAND_FILL,
        `the weekend band did not take the editor's ${BAND_FILL}`,
      );
    });

    it("spans the Saturday and Sunday columns from the weekday header to the last row, gaps included", async () => {
      const layout = await waitForGrid(
        MONTH,
        SATURDAY,
        (read) => read.weekendBands.length === 1,
        "the month block drew no single weekend band",
      );
      const [band] = layout.weekendBands;
      const saturday = day(layout, SATURDAY);
      const sunday = day(layout, SUNDAY);
      expect(horizontal(band)).toEqual(columnsOf(saturday, sunday));
      expect(layout.weekendHeaders).toHaveLength(2);
      expect(sides(band)?.top).toBe(sides(layout.weekendHeaders[0])?.top);
      expect(sides(band)?.bottom).toBe(Math.round(layout.lastRowBottom));
      expect(band?.width).toBeGreaterThan(saturday.width + sunday.width);
    });

    it("an under band keeps a decorated weekend day's decoration color on its label", async () => {
      await expectLabel(PLAIN_WEEKEND, WEEKEND_TEXT, `a plain weekend day did not take the weekend's ${WEEKEND_TEXT}`);
      await expectLabel(DECORATED, DECORATION_TEXT, `an under weekend replaced the decoration's ${DECORATION_TEXT}`);

      await chooseSelect(OVER, "over");
      await expectLabel(DECORATED, WEEKEND_TEXT, `an over weekend did not take the label from the decoration`);
    });

    it("an over band passes a click through to the weekend day under it", async () => {
      const fill = `${MONTH} [data-layer="weekend-fill"]`;
      await waitForState(
        () =>
          browser.execute((selector: string) => {
            const layer = document.querySelector(selector);
            return layer === null ? null : getComputedStyle(layer).zIndex;
          }, fill),
        (z) => z === "1",
        "the weekend band did not move over the cells",
      );
      await closeSettings();
      const cell = `${MONTH} .notes-month-view__day[data-anchor="${CLICK_TARGET}"]`;
      const hit = await browser.execute(
        (bandSelector: string, cellSelector: string) => {
          const target = document.querySelector(cellSelector)?.getBoundingClientRect();
          const band = document.querySelector(bandSelector)?.getBoundingClientRect();
          if (!target || !band) return null;
          const x = target.left + target.width / 2;
          const y = target.top + target.height / 2;
          const under = band.left <= x && x <= band.right && band.top <= y && y <= band.bottom;
          const anchor = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-anchor]")?.dataset.anchor;
          return { under, anchor: anchor ?? null };
        },
        fill,
        cell,
      );
      expect(hit).toEqual({ under: true, anchor: CLICK_TARGET });
      await $(cell).click();
      await waitForActiveNote(`day/${CLICK_TARGET}.md`);
    });
  });

  describe("a custom weekend", () => {
    before(async () => {
      await openCalendarSettings();
      await $(weekendRow()).$("select").selectByAttribute("value", "custom");
      await $(".ui-toggle-group").waitForDisplayed({ timeoutMsg: "the custom weekend showed no day toggles" });
    });

    it("Friday and Saturday move the band onto their columns", async () => {
      await toggleWeekendDay(5);
      await toggleWeekendDay(0);
      const names = [await weekdayName(5), await weekdayName(6)];
      await waitForState(
        weekendDaysPressed,
        (pressed) => pressed.join(",") === names.join(","),
        "Friday and Saturday did not become the weekend",
      );

      const layout = await waitForGrid(
        MONTH,
        FRIDAY,
        (read) => read.weekendBands.length === 1 && spans(read.weekendBands[0], day(read, FRIDAY), day(read, SATURDAY)),
        "the weekend band did not move onto Friday and Saturday",
      );
      expect(layout.weekendHeaders).toHaveLength(2);
      expect(await $(`${MONTH} [data-anchor="${SATURDAY}"]`).getAttribute("data-weekend")).not.toBeNull();
      expect(await $(`${MONTH} [data-anchor="${SUNDAY}"]`).getAttribute("data-weekend")).toBeNull();
    });

    it("a timeline that hides Saturday draws Friday to Sunday as one band", async () => {
      await toggleWeekendDay(0);
      await waitForGrid(
        MONTH,
        FRIDAY,
        (read) => read.weekendBands.length === 1 && spans(read.weekendBands[0], day(read, FRIDAY), day(read, SUNDAY)),
        "the month block did not draw Friday to Sunday as one band",
      );
      await closeSettings();
      await openInReadingMode(TIMELINE_HOST);

      const layout = await waitForGrid(
        TIMELINE,
        TIMELINE_FRIDAY,
        (read) => read.days[TIMELINE_SUNDAY] !== undefined,
        "the timeline fence did not render May 2027",
      );
      expect(layout.days[TIMELINE_SATURDAY]).toBeUndefined();
      expect(layout.weekendBands).toHaveLength(1);
      expect(horizontal(layout.weekendBands[0])).toEqual(
        columnsOf(day(layout, TIMELINE_FRIDAY), day(layout, TIMELINE_SUNDAY)),
      );
    });

    // Saturday is no weekend day here, so only counting runs over the visible columns joins Friday and
    // Sunday; a run broken at the hidden calendar day would give two bands.
    it("a timeline that hides Saturday joins a Friday and Sunday weekend into one band", async () => {
      await openCalendarSettings();
      await toggleWeekendDay(6);
      const month = await waitForGrid(
        MONTH,
        FRIDAY,
        (read) => read.weekendBands.length === 2,
        "the month block did not split a Friday and Sunday weekend into two bands",
      );
      expect(month.weekendBands.map(horizontal)).toEqual([
        columnsOf(day(month, FRIDAY), day(month, FRIDAY)),
        columnsOf(day(month, SUNDAY), day(month, SUNDAY)),
      ]);
      await closeSettings();

      const timeline = await waitForGrid(
        TIMELINE,
        TIMELINE_FRIDAY,
        (read) => read.weekendHeaders.length === 2,
        "the timeline did not take the Friday and Sunday weekend",
      );
      expect(timeline.days[TIMELINE_SATURDAY]).toBeUndefined();
      expect(timeline.weekendBands.map(horizontal)).toEqual([
        columnsOf(day(timeline, TIMELINE_FRIDAY), day(timeline, TIMELINE_SUNDAY)),
      ]);
    });
  });
});
