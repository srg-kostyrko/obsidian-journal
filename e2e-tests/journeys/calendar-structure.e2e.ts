import { $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { reloadObsidianOn } from "../support/clock.js";
import { clickSectionButton, closeSettings, isSettingsOpen, openSettings } from "../support/settings.js";
import { seedNote, waitForActiveNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { hostNote, openInReadingMode, VISIBLE_LEAF } from "./code-blocks.js";

// The fixture starts weeks on Monday. Today is pinned past every month the cases read, so no case
// reads the current month: the view pages back to April 2027 (outside days at both ends: 29–31
// March and 1–2 May) and then to February 2027 (four whole weeks, no outside day at all).
const PINNED_TODAY = "2027-05-12";
const APRIL_FIRST_CELL = "2027-03-29";
const FEBRUARY_FIRST_CELL = "2027-02-01";
const APRIL_OUTSIDE = ["2027-03-29", "2027-03-30", "2027-03-31", "2027-05-01", "2027-05-02"];
// Both ship in the fixture, so a click opens a note rather than creating one.
const OUTSIDE_WITH_NOTE = "2027-03-31";
const INERT_WITH_NOTE = "2027-05-01";
const INSIDE_WITH_NOTE = "2027-04-15";
const notePath = (anchor: string): string => `day/${anchor}.md`;

const VIEW_ID = "7c2a9e41-5b3d-4f8a-9c6e-0d1f2a3b4c5d";
const ROOT = `[data-journal-view="${VIEW_ID}"]`;
// The fixture's own tooltip on the view's paging button, not a translated string.
const PREVIOUS_MONTH = `${ROOT} [aria-label="Structure previous month"]`;

// The view's two month blocks, in fixture order: the first follows every global (and shows no week
// numbers), the second pins its heading shown and its outside days interactive.
type Block = 0 | 1;
const DEFAULT_BLOCK: Block = 0;
const OVERRIDE_BLOCK: Block = 1;
const BLOCK = `${ROOT} .journal-view-month-calendar`;

const TIMELINE_HOST = "structure/timeline-host.md";
const TIMELINE_HOST_DATE = "2027-04-14";
const TIMELINE_FENCE = "```calendar-timeline\nmode: month\noutside: inert\n```";
// A markdown leaf mounts the note twice (live preview and reading view); count in one of them.
const TIMELINE = `${VISIBLE_LEAF} .markdown-reading-view .block-language-calendar-timeline`;

interface GridRead {
  readonly firstAnchor: string | null;
  readonly outside: readonly string[];
  readonly inertOutside: readonly string[];
  readonly blanks: number;
  readonly weekRows: number;
  readonly headings: number;
}

class GridReadError extends Error {
  override name = "GridReadError";
}

// One round trip per read, so every field describes the same frame.
function readGrid(root: string, index: number): Promise<GridRead | null> {
  return browser.execute(
    (selector: string, at: number) => {
      const grid = document.querySelectorAll(selector)[at];
      if (grid === undefined) return null;
      const outside = [...grid.querySelectorAll<HTMLElement>(".notes-month-view__day[data-outside]")];
      return {
        firstAnchor: grid.querySelector<HTMLElement>(".notes-month-view__day[data-anchor]")?.dataset.anchor ?? null,
        outside: outside.map((cell) => cell.dataset.anchor ?? ""),
        inertOutside: outside
          .filter((cell) => cell.dataset.inactive !== undefined)
          .map((cell) => cell.dataset.anchor ?? ""),
        blanks: grid.querySelectorAll(".notes-month-view__day--blank").length,
        // The weekday header is a row too; it is the grid's first.
        weekRows: grid.querySelectorAll('.notes-month-view__grid > [role="row"]').length - 1,
        headings: grid.querySelectorAll(".notes-month-view__header").length,
      };
    },
    root,
    index,
  );
}

const readBlock = (block: Block): Promise<GridRead | null> => readGrid(BLOCK, block);

async function waitForBlock(block: Block, accept: (read: GridRead) => boolean, message: string): Promise<GridRead> {
  let last: GridRead | null = null;
  await waitForState(
    async () => {
      last = await readBlock(block);
      return last ?? undefined;
    },
    accept,
    message,
  ).catch((error: unknown) => {
    throw new GridReadError(`${message}: read ${JSON.stringify(last)}`, { cause: error });
  });
  return last as unknown as GridRead;
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
  await $(`${ROOT} .notes-month-view__day`).waitForDisplayed({ timeoutMsg: "the structure view showed no day" });
}

async function detachView(): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    for (const leaf of app.workspace.getLeavesOfType(`journal-view:${id}`)) leaf.detach();
  }, VIEW_ID);
}

// A DOM click: the settings modal's overlay can sit over the sidebar, and a reading-mode block is
// out of a WebDriver pointer's reach in this harness (see clickNavNext).
async function domClick(selector: string): Promise<void> {
  await $(selector).waitForExist({ timeoutMsg: `nothing to click at ${selector}` });
  await browser.execute((target: string) => {
    document.querySelector<HTMLElement>(target)?.click();
  }, selector);
}

async function clickInBlock(block: Block, anchor: string): Promise<void> {
  const clicked = await browser.execute(
    (selector: string, at: number, target: string) => {
      const block = document.querySelectorAll(selector)[at];
      const cell = block?.querySelector<HTMLElement>(`.notes-month-view__day[data-anchor="${CSS.escape(target)}"]`);
      cell?.click();
      return cell != null;
    },
    BLOCK,
    block,
    anchor,
  );
  expect(clicked).toBe(true);
}

// The override block never hides an outside day, so its first anchor names the month on show.
async function pageBackTo(firstCell: string): Promise<void> {
  await domClick(PREVIOUS_MONTH);
  await waitForBlock(
    OVERRIDE_BLOCK,
    (read) => read.firstAnchor === firstCell,
    `the view did not page to the month that starts its grid on ${firstCell}`,
  );
}

async function openEditor(): Promise<void> {
  await openSettings();
  await clickSectionButton(m.calendar_appearance_section_title(), m.calendar_appearance_open());
  await $(".appearance-preview").waitForDisplayed({ timeoutMsg: "the appearance subpage showed no preview" });
}

const partsList = () => $(`//select[@id=//label[normalize-space(.)="${m.calendar_appearance_part_label()}"]/@for]`);

async function chooseFromList(part: "outside" | "heading" | "grid" | "date"): Promise<void> {
  await partsList().selectByAttribute("value", part);
  await waitForState(
    () => partsList().getValue(),
    (value) => value === part,
    `${part} did not become the edited part`,
  );
}

// A visibility control's row, by its visible label; the "All widths" note follows it.
const controlRowPath = (label: string): string =>
  `//div[contains(@class,"appearance-control")][.//div[contains(@class,"setting-item-name")][starts-with(normalize-space(.), "${label}")]]`;

const OUTSIDE_VISIBILITY = m.calendar_appearance_control({ control: "visibility_outside_days" });
const HEADING_VISIBILITY = m.calendar_appearance_control({ control: "visibility_show_heading" });
const ROWS_VISIBILITY = m.calendar_appearance_control({ control: "visibility_month_rows" });

function visibilitySelect(label: string): ReturnType<typeof $> {
  return $(controlRowPath(label)).$("select");
}

async function chooseVisibility(label: string, value: string): Promise<void> {
  const select = visibilitySelect(label);
  await select.waitForExist({ timeoutMsg: `the inspector showed no ${label} control` });
  await select.selectByAttribute("value", value);
}

// Rounded: Obsidian's zoom scales authored pixels.
function weekRowHeights(block: Block): Promise<number[]> {
  return browser.execute(
    (selector: string, at: number) => {
      const grid = document.querySelectorAll(selector)[at];
      if (grid === undefined) return [];
      return [...grid.querySelectorAll<HTMLElement>('.notes-month-view__grid > [role="row"]')]
        .slice(1)
        .map((row) => Math.round(row.getBoundingClientRect().height));
    },
    BLOCK,
    block,
  );
}

const sameAnchors = (read: readonly string[], expected: readonly string[]): boolean =>
  read.length === expected.length && expected.every((anchor) => read.includes(anchor));

function noLeafHolds(path: string): Promise<boolean> {
  return browser.executeObsidian(
    ({ app }, notePath) =>
      app.workspace.getLeavesOfType("markdown").every((leaf) => {
        const view = leaf.view as { file?: { path: string } | null };
        return view.file?.path !== notePath;
      }),
    path,
  );
}

// The cases build on one another's settings: the global outside days stay hidden from the first
// case on, and the heading from the third, so running a single case with --grep is not supported.
describe("calendar structure: the global default and the overrides over it", () => {
  before(async () => {
    await reloadObsidianOn(PINNED_TODAY, {
      vault: "./e2e-tests/fixtures/e2e-calendar-structure",
      plugins: ["journals"],
    });
    await openView();
    await pageBackTo(APRIL_FIRST_CELL);
  });

  after(async () => {
    if (await isSettingsOpen()) await closeSettings();
    await detachView();
  });

  describe("days outside the month", () => {
    it("hiding them in the editor blanks the default block, and the interactive block still opens one", async () => {
      // Stock: a lone month block keeps its outside days interactive.
      await waitForBlock(
        DEFAULT_BLOCK,
        (read) => sameAnchors(read.outside, APRIL_OUTSIDE) && read.inertOutside.length === 0 && read.blanks === 0,
        "the default block did not start on the stock interactive outside days",
      );

      await openEditor();
      await chooseFromList("outside");
      await chooseVisibility(OUTSIDE_VISIBILITY, "hidden");

      await waitForBlock(
        DEFAULT_BLOCK,
        (read) => read.outside.length === 0 && read.blanks === APRIL_OUTSIDE.length,
        "the default block did not blank its outside days after the editor hid them",
      );
      const override = await readBlock(OVERRIDE_BLOCK);
      expect(override?.outside).toEqual(APRIL_OUTSIDE);
      expect(override?.inertOutside).toEqual([]);
      expect(override?.blanks).toBe(0);

      await closeSettings();
      await clickInBlock(OVERRIDE_BLOCK, OUTSIDE_WITH_NOTE);
      await waitForActiveNote(notePath(OUTSIDE_WITH_NOTE));
    });
  });

  describe("a timeline fence", () => {
    before(async () => {
      await seedNote(TIMELINE_HOST, hostNote("daily", TIMELINE_HOST_DATE, TIMELINE_FENCE));
      await openInReadingMode(TIMELINE_HOST);
      await $(`${TIMELINE} .notes-month-view__day[data-anchor="${INSIDE_WITH_NOTE}"]`).waitForExist({
        timeoutMsg: "the timeline fence did not render April 2027",
      });
    });

    it("keeps its outside days, inert, while the global hides them", async () => {
      // The global is still hidden: the view's default block shows it.
      const view = await readBlock(DEFAULT_BLOCK);
      expect(view?.blanks).toBe(APRIL_OUTSIDE.length);

      const timeline = await readGrid(TIMELINE, 0);
      expect(timeline?.outside).toEqual(APRIL_OUTSIDE);
      expect(timeline?.inertOutside).toEqual(APRIL_OUTSIDE);
      expect(timeline?.blanks).toBe(0);
      expect(await $(`${TIMELINE} [data-anchor="${INSIDE_WITH_NOTE}"]`).getAttribute("data-inactive")).toBeNull();

      // An inert day opens nothing; the in-month click after it is the sentinel that the first
      // click has been handled.
      await domClick(`${TIMELINE} [data-anchor="${INERT_WITH_NOTE}"]`);
      await domClick(`${TIMELINE} [data-anchor="${INSIDE_WITH_NOTE}"]`);
      await waitForActiveNote(notePath(INSIDE_WITH_NOTE));
      expect(await noLeafHolds(notePath(INERT_WITH_NOTE))).toBe(true);
    });
  });

  describe("the heading", () => {
    before(async () => {
      await openEditor();
    });

    it("hiding it removes the default block's heading and the preview's, and it stays in the parts list", async () => {
      const before = await readBlock(DEFAULT_BLOCK);
      expect(before?.headings).toBe(1);
      await expect($(".appearance-preview__header")).toBeExisting();

      await chooseFromList("heading");
      await chooseVisibility(HEADING_VISIBILITY, "hidden");

      await waitForBlock(DEFAULT_BLOCK, (read) => read.headings === 0, "the default block kept its heading");
      const override = await readBlock(OVERRIDE_BLOCK);
      expect(override?.headings).toBe(1);
      await $(".appearance-preview__header").waitForExist({
        reverse: true,
        timeoutMsg: "the preview kept its heading after the editor hid it",
      });

      await chooseFromList("date");
      await chooseFromList("heading");
      expect(await visibilitySelect(HEADING_VISIBILITY).getValue()).toBe("hidden");
    });
  });

  describe("the month grid", () => {
    before(async () => {
      await pageBackTo("2027-03-01");
      await pageBackTo(FEBRUARY_FIRST_CELL);
    });

    it("Always six gives February 2027 six rows, its padded weeks as tall as a real one", async () => {
      const fit = await waitForBlock(
        DEFAULT_BLOCK,
        (read) => read.weekRows === 4,
        "February 2027 did not fit in four rows",
      );
      expect(fit.blanks).toBe(0);

      await chooseFromList("grid");
      await chooseVisibility(ROWS_VISIBILITY, "six");

      // No week numbers and outside days hidden: the two padded weeks are blanks alone, and nothing
      // but the blanks themselves holds those rows open.
      const six = await waitForBlock(
        DEFAULT_BLOCK,
        (read) => read.weekRows === 6,
        "February 2027 did not take six rows",
      );
      expect(six.blanks).toBe(14);
      expect(six.outside).toEqual([]);
      const heights = await weekRowHeights(DEFAULT_BLOCK);
      expect(heights).toHaveLength(6);
      expect(heights[0]).toBeGreaterThan(0);
      expect(heights[4]).toBe(heights[0]);
      expect(heights[5]).toBe(heights[0]);
    });
  });
});
