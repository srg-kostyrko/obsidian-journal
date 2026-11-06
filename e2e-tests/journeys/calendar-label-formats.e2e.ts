import { $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { reloadObsidianOn } from "../support/clock.js";
import { clickSectionButton, closeSettings, isSettingsOpen, openSettings } from "../support/settings.js";
import { waitForState } from "../support/wait.js";

import { openInReadingMode, VISIBLE_LEAF } from "./code-blocks.js";

type Width = "wide" | "narrow";
type PartKey = "weekday" | "weekNumber" | "date";

// The fixture starts weeks on Sunday with the US first-week rule (day-of-year 6), so its grid is not
// ISO and a `W` format reads a different number than the rows' own `w`. Today is pinned in May 2027,
// whose grid opens on the week of 25 April: week 18 of this grid, while the day a week label formats
// (its representative, Saturday 1 May here) sits in ISO week 17.
const PINNED_TODAY = "2027-05-12";
const FIRST_IN_MONTH = "2027-05-01";
const FIRST_WEEK = "2027-04-25";

const VIEW_ID = "5e1f8a3c-2b4d-4c6e-8f0a-1b2c3d4e5f60";
const VIEW_BLOCK = `[data-journal-view="${VIEW_ID}"] .journal-view-month-calendar`;
const TIMELINE_HOST = "formats/timeline-host.md";
// A markdown leaf mounts the note twice (live preview and reading view); read the reading view's.
const TIMELINE_BLOCK = `${VISIBLE_LEAF} .markdown-reading-view .block-language-calendar-timeline`;

// Either side of the calendar's 28em container query; the sidebar itself sits below it.
const NARROW_WIDTH = "300px";
const WIDE_WIDTH = "700px";

const SUNDAY_FIRST = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_NAMES = SUNDAY_FIRST.map((name) => name.slice(0, 3));
const ONE_LETTER = SUNDAY_FIRST.map((name) => name.slice(0, 1));

const LONG_DAY_FORMAT = "dddd, MMMM Do YYYY";

class FormatReadError extends Error {
  override name = "FormatReadError";
}

async function expectRead<T>(
  read: () => Promise<T | undefined | null>,
  accept: (value: T) => boolean,
  message: string,
): Promise<T> {
  let last: T | undefined | null;
  await waitForState(
    async () => {
      last = await read();
      return last;
    },
    accept,
    message,
  ).catch((error: unknown) => {
    throw new FormatReadError(`${message}: read ${JSON.stringify(last)}`, { cause: error });
  });
  return last as T;
}

async function openView(): Promise<void> {
  // Revealed, not only placed: the right sidebar boots collapsed, and a collapsed split lays
  // nothing out, so no container query would match.
  await browser.executeObsidian(async ({ app }, id) => {
    const leaf = app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: `journal-view:${id}`, active: true });
    await app.workspace.revealLeaf(leaf);
  }, VIEW_ID);
  await $(`${VIEW_BLOCK} .notes-month-view__day`).waitForDisplayed({ timeoutMsg: "the formats view showed no day" });
}

async function detachView(): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    for (const leaf of app.workspace.getLeavesOfType(`journal-view:${id}`)) leaf.detach();
  }, VIEW_ID);
}

// Earlier leaves can keep zero-width copies of a block in the DOM, so every read and every forced
// width goes to the laid-out one (or the one a width was already forced on).
async function forceWidth(blockSelector: string, width: string): Promise<void> {
  await browser.execute(
    (selector: string, forced: string) => {
      const block = [...document.querySelectorAll<HTMLElement>(selector)].find(
        (candidate) => candidate.clientWidth > 0 || candidate.style.width !== "",
      );
      if (block !== undefined) block.style.width = forced;
    },
    blockSelector,
    width,
  );
}

interface DayRead {
  readonly text: string;
  readonly ariaLabel: string | null;
  // Rounded: Obsidian's zoom scales authored pixels.
  readonly width: number;
  readonly clipped: boolean;
}

function readDay(blockSelector: string, anchor: string): Promise<DayRead | null> {
  return browser.execute(
    (selector: string, target: string) => {
      const block = [...document.querySelectorAll<HTMLElement>(selector)].find(
        (candidate) => candidate.clientWidth > 0,
      );
      const cell = block?.querySelector<HTMLElement>(`.notes-month-view__day[data-anchor="${CSS.escape(target)}"]`);
      const content = cell?.querySelector<HTMLElement>(".cell-decoration__content");
      if (!cell || !content) return null;
      return {
        text: (content.textContent ?? "").trim(),
        ariaLabel: cell.getAttribute("aria-label"),
        width: Math.round(cell.getBoundingClientRect().width),
        clipped: content.scrollWidth > content.clientWidth,
      };
    },
    blockSelector,
    anchor,
  );
}

function readWeekNumber(blockSelector: string, anchor: string): Promise<string | null> {
  return browser.execute(
    (selector: string, target: string) => {
      const block = [...document.querySelectorAll<HTMLElement>(selector)].find(
        (candidate) => candidate.clientWidth > 0,
      );
      const cell = block?.querySelector<HTMLElement>(
        `.notes-month-view__week-number[data-anchor="${CSS.escape(target)}"]`,
      );
      return cell ? (cell.textContent ?? "").trim() : null;
    },
    blockSelector,
    anchor,
  );
}

interface WeekdayRead {
  readonly shown: readonly string[];
  readonly names: readonly (string | null)[];
}

// The header holds a wide and a narrow text and the container query hides one, so only the text whose
// span is displayed counts as shown.
function readWeekdays(blockSelector: string): Promise<WeekdayRead | null> {
  return browser.execute((selector: string) => {
    const block = [...document.querySelectorAll<HTMLElement>(selector)].find((candidate) => candidate.clientWidth > 0);
    const headers = [
      ...(block?.querySelector(".notes-month-view")?.querySelectorAll<HTMLElement>(".notes-month-view__weekday") ?? []),
    ];
    if (headers.length === 0) return null;
    return {
      shown: headers.map((header) =>
        [...header.querySelectorAll<HTMLElement>("span")]
          .filter((span) => getComputedStyle(span).display !== "none")
          .map((span) => (span.textContent ?? "").trim())
          .join(""),
      ),
      names: headers.map((header) => header.getAttribute("aria-label")),
    };
  }, blockSelector);
}

const sameList = (read: readonly (string | null)[], expected: readonly string[]): boolean =>
  read.length === expected.length && read.every((value, index) => value === expected[index]);

async function openEditor(): Promise<void> {
  await openSettings();
  await clickSectionButton(m.calendar_appearance_section_title(), m.calendar_appearance_open());
  await $(".appearance-preview").waitForDisplayed({ timeoutMsg: "the appearance subpage showed no preview" });
}

async function chooseWidth(width: Width): Promise<void> {
  await $(`.ui-segmented-control__label=${m.calendar_appearance_width({ width })}`).click();
}

const partsList = () => $(`//select[@id=//label[normalize-space(.)="${m.calendar_appearance_part_label()}"]/@for]`);

async function chooseFromList(part: PartKey): Promise<void> {
  await partsList().selectByAttribute("value", part);
  await waitForState(
    () => partsList().getValue(),
    (value) => value === part,
    `${part} did not become the edited part`,
  );
}

// A format control's row, by its visible label.
const controlRowPath = (label: string): string =>
  `//div[contains(@class,"appearance-control")][.//div[contains(@class,"setting-item-name")][starts-with(normalize-space(.), "${label}")]]`;

const DAY_FORMAT = m.calendar_appearance_control({ control: "label_day" });
const WEEK_FORMAT = m.calendar_appearance_control({ control: "label_week" });
const WEEKDAY_FORMAT = m.calendar_appearance_control({ control: "label_weekday" });

async function typeFormat(label: string, pattern: string): Promise<void> {
  const box = $(controlRowPath(label)).$('input[type="text"]');
  await box.waitForExist({ timeoutMsg: `the inspector showed no ${label} box` });
  await box.setValue(pattern);
  await waitForState(
    () => box.getValue(),
    (value) => value === pattern,
    `the ${label} box did not take ${pattern}`,
  );
}

// Suggestions read "pattern — sample"; a pick is found by the start of its text.
async function pickSuggestion(label: string, startsWith: string): Promise<void> {
  const select = $(controlRowPath(label)).$("select");
  await select.waitForExist({ timeoutMsg: `the inspector showed no ${label} suggestions` });
  const option = select.$(`.//option[starts-with(normalize-space(.), "${startsWith}")]`);
  const value = await option.getAttribute("value");
  if (value === null) throw new FormatReadError(`${label} offers no suggestion starting ${startsWith}`);
  await select.selectByAttribute("value", value);
}

const isoWarning = () => $(`.appearance-format-control__warning=${m.calendar_appearance_format_iso_warning()}`);

// The cases build on one editor session (the long day format replaces the short one), so running a
// single case with --grep is not supported.
describe("calendar label formats", () => {
  before(async () => {
    await reloadObsidianOn(PINNED_TODAY, {
      vault: "./e2e-tests/fixtures/e2e-calendar-formats",
      plugins: ["journals"],
    });
    await openView();
    await openInReadingMode(TIMELINE_HOST);
    await $(`${TIMELINE_BLOCK} .notes-month-view__day[data-anchor="${FIRST_IN_MONTH}"]`).waitForExist({
      timeoutMsg: "the timeline fence did not render May 2027",
    });
    await openEditor();
  });

  afterEach(async () => {
    await forceWidth(VIEW_BLOCK, "");
    await forceWidth(TIMELINE_BLOCK, "");
  });

  after(async () => {
    if (await isSettingsOpen()) await closeSettings();
    await detachView();
  });

  it("a day format changes the date number and leaves its accessible name alone", async () => {
    const stock = await expectRead(
      () => readDay(VIEW_BLOCK, FIRST_IN_MONTH),
      (read) => read.text === "1",
      "the first of May did not start on the stock label",
    );
    expect(stock.ariaLabel).toBe("May 1, 2027");

    await chooseWidth("wide");
    await chooseFromList("date");
    await typeFormat(DAY_FORMAT, "DD");

    const padded = await expectRead(
      () => readDay(VIEW_BLOCK, FIRST_IN_MONTH),
      (read) => read.text === "01",
      "the first of May did not read 01 after the editor set DD",
    );
    expect(padded.ariaLabel).toBe(stock.ariaLabel);
  });

  it("One letter at Narrow shows on a narrow calendar only, and every header keeps the full name", async () => {
    await chooseWidth("narrow");
    await chooseFromList("weekday");
    await pickSuggestion(WEEKDAY_FORMAT, m.calendar_appearance_format_letter());

    await forceWidth(TIMELINE_BLOCK, NARROW_WIDTH);
    const narrow = await expectRead(
      () => readWeekdays(TIMELINE_BLOCK),
      (read) => sameList(read.shown, ONE_LETTER),
      "the narrow calendar did not show one-letter weekday headers",
    );
    expect(narrow.names).toEqual(SUNDAY_FIRST);

    await forceWidth(VIEW_BLOCK, WIDE_WIDTH);
    const wide = await expectRead(
      () => readWeekdays(VIEW_BLOCK),
      (read) => sameList(read.shown, SHORT_NAMES),
      "the wide calendar did not keep its ddd weekday headers",
    );
    expect(wide.names).toEqual(SUNDAY_FIRST);
  });

  it("a W week format warns under a grid that is not ISO, and the row reads the ISO week", async () => {
    await chooseWidth("wide");
    await chooseFromList("weekNumber");
    await expectRead(
      () => readWeekNumber(VIEW_BLOCK, FIRST_WEEK),
      (text) => text === "W18",
      "the first week did not start on this grid's own week number",
    );
    await expect(isoWarning()).not.toBeExisting();

    await typeFormat(WEEK_FORMAT, "[W]W");

    await isoWarning().waitForDisplayed({ timeoutMsg: "the week format showed no ISO warning" });
    await expectRead(
      () => readWeekNumber(VIEW_BLOCK, FIRST_WEEK),
      (text) => text === "W17",
      "the first week did not read its ISO week after the editor set [W]W",
    );
  });

  it("a long day format clips inside the cell instead of widening it", async () => {
    await chooseFromList("date");
    const before = await expectRead(
      () => readDay(VIEW_BLOCK, FIRST_IN_MONTH),
      (read) => read.text === "01",
      "the first of May did not keep the DD label",
    );

    await typeFormat(DAY_FORMAT, LONG_DAY_FORMAT);

    const long = await expectRead(
      () => readDay(VIEW_BLOCK, FIRST_IN_MONTH),
      (read) => read.text === "Saturday, May 1st 2027",
      "the first of May did not take the long format",
    );
    expect(long.width).toBe(before.width);
    expect(long.clipped).toBe(true);
  });
});
