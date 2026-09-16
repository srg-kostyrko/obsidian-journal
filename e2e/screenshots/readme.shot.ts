import { $, browser } from "@wdio/globals";

import { hostNote, openInReadingMode } from "../journeys/code-blocks.js";
import { LIVE_LEAF, MONTH_VIEW, openSeededCalendarView } from "../journeys/view.js";
import { reloadObsidianOn } from "../support/clock.js";
import { clickIcon, closeSettings, expandSection, openSettings } from "../support/settings.js";
import { openViaUri } from "../support/uri.js";
import { closeAllLeaves, noteExists, seedNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { captureThemed, recordOutcome, textsOf, widenRightSidebar } from "./capture.js";

// The README's images show Obsidian itself, not a cropped block, so each one is framed on a
// workspace region rather than on the plugin's own root.
const WORKSPACE = ".workspace";
const ROOT_SPLIT = ".workspace-split.mod-root";
const VIEW_ROOT = `${LIVE_LEAF} .journal-view-root`;
const CUSTOM_INTERVALS = `${VIEW_ROOT} .journal-view-custom-intervals`;
const BLOCKS_SECTION = ".vertical-tab-content .collapsible-root:has(.jv-blocks-list)";
const VIEW_BLOCK_ENTRY = `${BLOCKS_SECTION} .jv-block-entry`;

// A markdown leaf mounts a live-preview and a reading-view copy of every fence, so each block
// selector is scoped to the reading view — the copy with a laid-out width.
const READING_VIEW = `${ROOT_SPLIT} .markdown-reading-view`;
const NAV_VIEW = `${READING_VIEW} .block-language-journal-nav .nav-view`;
const NOTELET_BLOCK = `${READING_VIEW} .block-language-journal-notelets`;
const TIMELINE_BLOCK = `${READING_VIEW} .block-language-calendar-timeline`;

const TODAY = "2026-09-14";
// Days carrying a note in both fixtures, so the month grid shows which days are written on.
const WRITTEN_DAYS = [
  "2026-09-01",
  "2026-09-02",
  "2026-09-03",
  "2026-09-04",
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  TODAY,
];

const DAY_DOTS = `${MONTH_VIEW} .cell-marks .place-center_bottom`;

// Chrome that belongs to the desktop rather than to Obsidian or the plugin: the frameless
// window's own buttons, the status bar, and the vault name — which in the harness is the
// fixture's throwaway copy ("e2e-docs-readme-ThB5rx") and would ship in the image.
// cspell:disable
const HOST_CHROME_CSS =
  ".titlebar-button-container, .status-bar, .workspace-sidedock-vault-profile { display: none !important; }";
// cspell:enable

class WindowResizeUnavailableError extends Error {
  constructor() {
    super("electron.remote is unavailable, so the window cannot be sized for a screenshot");
    this.name = "WindowResizeUnavailableError";
  }
}

interface WindowHost {
  electron?: { remote?: { getCurrentWindow(): { setSize(width: number, height: number): void } } };
}

interface VaultConfig {
  setConfig(key: string, value: unknown): void;
}

/**
 * Size the Obsidian window itself. `browser.setWindowSize` is unsupported by the harness, but
 * Electron's own window is reachable through the same remote bridge the capture uses.
 */
async function sizeWindow(width: number, height: number): Promise<void> {
  const resized = await browser.execute(
    (w: number, h: number) => {
      const remote = (window as unknown as WindowHost).electron?.remote;
      if (remote === undefined) return false;
      remote.getCurrentWindow().setSize(w, h);
      return true;
    },
    width,
    height,
  );
  if (!resized) throw new WindowResizeUnavailableError();
  await waitForState(
    () => browser.execute(() => ({ width: window.innerWidth, height: window.innerHeight })),
    (size) => size.width === width && size.height === height,
    `waited for the window to resize to ${width}x${height}`,
  );
}

/** Hide desktop chrome, drop the properties panel, and open notes at full pane width. */
async function prepareWorkspace(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    const config = app.vault as unknown as VaultConfig;
    config.setConfig("propertiesInDocument", "hidden");
    config.setConfig("readableLineLength", false);
    app.workspace.leftSplit.collapse();
  });
  await browser.execute((css: string) => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
  }, HOST_CHROME_CSS);
}

// Opening a view or a note leaves a focus ring on whatever took focus, and the pointer stays
// wherever the last click left it, hovering — both read as a selection in the image. The pointer
// is parked at the bottom edge, below the settings modal and clear of every control, so nothing
// is hovered and no tooltip is left open.
async function settleForCapture(): Promise<void> {
  await browser.execute(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
  });
  const viewport = await browser.execute(() => ({ width: window.innerWidth, height: window.innerHeight }));
  await browser
    .action("pointer")
    .move({ x: Math.round(viewport.width / 2), y: viewport.height - 4 })
    .perform();
  // Long enough for a tooltip an earlier hover opened to fade out.
  await browser.pause(400);
}

class ClippedGridError extends Error {
  constructor(contentWidth: number, frameWidth: number) {
    super(`the month grid needs ${contentWidth}px but its view is ${frameWidth}px, so a column is cut off`);
    this.name = "ClippedGridError";
  }
}

// The month grid overflows rather than shrinking below its content minimums, and a capture framed
// on the view crops whatever overflowed — silently losing Saturday. Anything that widens a cell
// (a larger decoration mark, a longer label) can push it over, so the frame is checked, not
// assumed.
async function assertGridFits(): Promise<void> {
  const measured = await browser.execute(
    (grid: string, frame: string) => ({
      content: document.querySelector(grid)?.scrollWidth ?? 0,
      frame: document.querySelector(frame)?.clientWidth ?? 0,
    }),
    MONTH_VIEW,
    VIEW_ROOT,
  );
  if (measured.content > measured.frame) throw new ClippedGridError(measured.content, measured.frame);
}

/** What the image would show as selected or focused, for the outcome record. */
function selectionState(): Promise<{ focused: string; selectedCells: string[] }> {
  return browser.execute(() => ({
    focused: document.activeElement?.className ?? "",
    selectedCells: [...document.querySelectorAll<HTMLElement>("[data-selected]")].map((el) => el.dataset.anchor ?? ""),
  }));
}

function countMatching(selector: string): Promise<number> {
  return browser.execute((sel) => document.querySelectorAll(sel).length, selector);
}

function dayNotePath(anchor: string): string {
  return `Journal/Daily/${anchor}.md`;
}

async function seedWrittenDays(bodies: Readonly<Record<string, string>> = {}): Promise<void> {
  for (const anchor of WRITTEN_DAYS) {
    await seedNote(dayNotePath(anchor), hostNote("Daily", anchor, bodies[anchor] ?? "## Log\n"));
  }
}

// The week grid and the sprint intervals are anchored by the week configuration and the
// journal's own anchor date, neither of which a hand-written frontmatter date can be trusted to
// reproduce — so those notes are created through the plugin's own URI handler.
async function createThroughPlugin(params: Record<string, string>): Promise<void> {
  await openViaUri(params);
  await browser.pause(300);
}

const TODAY_NOTE_BODY = [
  "```journal-nav",
  "```",
  "",
  "## Today",
  "",
  "- [x] Sprint planning",
  "- [ ] Write up the storage migration",
  "- [ ] Review the release checklist",
  "",
  "## Notes",
  "",
  "The backfill runs in two passes, so the index never goes cold while it catches up.",
].join("\n");

describe("readme screenshots", () => {
  before(async () => {
    await reloadObsidianOn(TODAY, { vault: "./e2e/fixtures/e2e-docs-readme", plugins: ["journals"] }, "09:12:00");
    await prepareWorkspace();
    await seedWrittenDays();
    await createThroughPlugin({ type: "week", date: "2026-09-14" });
    await createThroughPlugin({ type: "week", date: "2026-09-07" });
    await createThroughPlugin({ journal: "Sprints", date: "2026-09-14" });
    await seedNote(dayNotePath(TODAY), hostNote("Daily", TODAY, TODAY_NOTE_BODY));
    await closeAllLeaves();
  });

  after(closeSettings);

  it("shows the seeded Calendar view beside today's note", async () => {
    await sizeWindow(1360, 620);
    await openInReadingMode(dayNotePath(TODAY));
    await openSeededCalendarView();
    await $(CUSTOM_INTERVALS).waitForExist({ timeoutMsg: "the custom-intervals block did not render" });
    await waitForState(
      () => countMatching(DAY_DOTS),
      (count) => count >= WRITTEN_DAYS.length,
      "waited for every written day to carry its has-note dot",
    );

    // The default right sidebar is narrower than the month grid needs at a readable size.
    await widenRightSidebar(440, VIEW_ROOT);
    await assertGridFits();
    await settleForCapture();

    const intervalRows = await textsOf(`${CUSTOM_INTERVALS} .nav-row`);

    await captureThemed(WORKSPACE, "readme-calendar");

    await recordOutcome("readme-calendar", {
      today: TODAY,
      writtenDays: WRITTEN_DAYS,
      dayDots: await countMatching(DAY_DOTS),
      intervalRows,
    });
  });

  it("shows a daily note's navigation block", async () => {
    await browser.executeObsidian(({ app }) => app.workspace.rightSplit.collapse());
    await sizeWindow(1040, 620);
    await closeAllLeaves();
    await openInReadingMode(dayNotePath(TODAY));
    await $(NAV_VIEW).waitForExist({ timeoutMsg: "the journal-nav block did not render" });
    await settleForCapture();

    await captureThemed(ROOT_SPLIT, "readme-nav-block");

    await recordOutcome("readme-nav-block", {
      hostPath: dayNotePath(TODAY),
      segmentTexts: await textsOf(`${NAV_VIEW} .nav-row`),
    });
  });

  it("lists a day's notelets under their types", async () => {
    const anchor = "2026-09-10";
    await seedNote(
      `Journal/Daily/${anchor}/Meeting 1.md`,
      `---\njournal: Daily\njournal-date: ${anchor}\njournal-notelet: Meeting\njournal-notelet-index: 1\n---\n# Standup\n`,
    );
    await seedNote(
      `Journal/Daily/${anchor}/Meeting 2.md`,
      `---\njournal: Daily\njournal-date: ${anchor}\njournal-notelet: Meeting\njournal-notelet-index: 2\n---\n# Design review\n`,
    );
    await seedNote(
      `Journal/Daily/${anchor}/Retro.md`,
      `---\njournal: Daily\njournal-date: ${anchor}\njournal-notelet: Retro\n---\n`,
    );

    const path = dayNotePath(anchor);
    await seedNote(
      path,
      hostNote(
        "Daily",
        anchor,
        ["```journal-notelets", "```", "", "## Log", "", "Two meetings and a retro."].join("\n"),
      ),
    );

    await sizeWindow(700, 440);
    await closeAllLeaves();
    await openInReadingMode(path);
    await $(`${NOTELET_BLOCK} .journal-notelet-list__row`).waitForExist({
      timeoutMsg: "the journal-notelets block listed no rows",
    });
    await settleForCapture();

    await captureThemed(ROOT_SPLIT, "readme-notelets");

    await recordOutcome("readme-notelets", {
      hostPath: path,
      headings: await textsOf(`${NOTELET_BLOCK} .journal-notelet-list__type-heading`),
      rows: await textsOf(`${NOTELET_BLOCK} .journal-notelet-list__row`),
    });
  });

  it("shows a week timeline inside a note", async () => {
    const path = dayNotePath("2026-09-09");
    await seedNote(
      path,
      hostNote(
        "Daily",
        "2026-09-09",
        [
          "```calendar-timeline",
          "mode: quarter",
          "```",
          "",
          "## Log",
          "",
          "Second backfill pass finished; the index caught up by lunchtime.",
        ].join("\n"),
      ),
    );

    await sizeWindow(1040, 640);
    await closeAllLeaves();
    await openInReadingMode(path);
    await $(`${TIMELINE_BLOCK} [data-anchor]`).waitForExist({ timeoutMsg: "the week timeline drew no cells" });
    await settleForCapture();

    await captureThemed(ROOT_SPLIT, "readme-timeline");

    await recordOutcome("readme-timeline", { hostPath: path });
  });

  it("shows the blocks the Calendar view is composed of", async () => {
    await sizeWindow(1200, 900);
    await closeAllLeaves();
    await openSettings();
    await expandSection("Views");
    await clickIcon("Configure Calendar");
    await $(VIEW_BLOCK_ENTRY).waitForExist({ timeoutMsg: "the view editor listed no blocks" });
    await browser.execute((sel: string) => {
      document.querySelector(sel)?.scrollIntoView({ block: "center" });
    }, BLOCKS_SECTION);
    await settleForCapture();

    await captureThemed(BLOCKS_SECTION, "readme-view-editor");

    await recordOutcome("readme-view-editor", { blocks: await textsOf(VIEW_BLOCK_ENTRY) });
  });
});

describe("readme screenshots — decorations", () => {
  const HOLIDAY = "2026-09-07";
  const OPEN_TASKS = "2026-09-09";
  const DONE_TASKS = "2026-09-10";
  const LONG_NOTE = "2026-09-11";
  // The word-count decoration's threshold is 120 words; this clears it with room to spare.
  const LONG_BODY = `${"The migration runs in two passes so the index never goes cold. ".repeat(20)}\n`;

  before(async () => {
    await reloadObsidianOn(
      TODAY,
      { vault: "./e2e/fixtures/e2e-docs-readme-decorations", plugins: ["journals"] },
      "09:12:00",
    );
    await prepareWorkspace();
  });

  it("marks a month of days by their tags, tasks and length", async () => {
    await seedWrittenDays({
      [HOLIDAY]: "#holiday\n\nOut of office.\n",
      [OPEN_TASKS]: "## Today\n\n- [x] Standup\n- [ ] Write up the storage migration\n",
      [DONE_TASKS]: "## Today\n\n- [x] Standup\n- [x] Release notes\n",
      [LONG_NOTE]: LONG_BODY,
    });
    // No weekly note here, and no note left open: following an opened note moves the view's date
    // to that note's period — for a week, to its representative day — which the grid then marks
    // as selected, reading in the image as a date someone picked.
    await closeAllLeaves();

    await sizeWindow(1360, 900);
    await openSeededCalendarView();
    await waitForState(
      () => countMatching(`${MONTH_VIEW} .decoration-corner`),
      (count) => count >= 1,
      "waited for the open-task corner to render",
    );
    await waitForState(
      () => countMatching(DAY_DOTS),
      (count) => count >= WRITTEN_DAYS.length,
      "waited for every written day to carry its has-note dot",
    );

    // Wider than the hero's sidebar: a full-size icon mark widens every cell with it.
    await widenRightSidebar(520, VIEW_ROOT);
    await assertGridFits();
    await settleForCapture();

    // The one image where the marks themselves are the subject, so it is framed on the view
    // rather than on the workspace around it.
    await captureThemed(VIEW_ROOT, "readme-decorations", { padding: 12 });

    await recordOutcome("readme-decorations", {
      today: TODAY,
      holiday: HOLIDAY,
      openTasks: OPEN_TASKS,
      doneTasks: DONE_TASKS,
      longNote: LONG_NOTE,
      longNoteExists: await noteExists(dayNotePath(LONG_NOTE)),
      corners: await countMatching(`${MONTH_VIEW} .decoration-corner`),
      dayDots: await countMatching(DAY_DOTS),
      selection: await selectionState(),
    });
  });
});
