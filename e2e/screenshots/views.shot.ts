import { $, browser } from "@wdio/globals";

import { VISIBLE_LEAF, hostNote, openInReadingMode } from "../journeys/code-blocks.js";
import { dayAnchor, note } from "../journeys/decorations.js";
import { LIVE_LEAF, MONTH_VIEW, openCalendarView } from "../journeys/view.js";
import { openViaUri } from "../support/uri.js";
import {
  activeNotePath,
  frontmatterOf,
  markdownLeafCount,
  noteExists,
  seedNote,
  todayAnchor,
} from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { captureThemed, recordOutcome } from "./capture.js";

class UnexpectedNavSegmentCountError extends Error {
  constructor(segmentTexts: readonly string[]) {
    super(`expected at least 5 nav segments, got: ${JSON.stringify(segmentTexts)}`);
    this.name = "UnexpectedNavSegmentCountError";
  }
}

const VIEW_ROOT = `${LIVE_LEAF} .journal-view-root`;
const DAY_NOTES = `${VIEW_ROOT} .journal-view-day-notes`;
const DAY_NOTES_CARD = `${DAY_NOTES} .journal-view-day-notes__card`;
const DAY_NOTES_TITLE = `${DAY_NOTES} .journal-view-day-notes__title`;

const WEEK_VIEW = `${LIVE_LEAF} .notes-week-view`;
const WEEK_NUMBER_CELL = `${WEEK_VIEW} [data-testid="week-number-cell"]`;

// Reading-mode nav block, rendered through the canonical `journal-nav` fence name (not the
// `calendar-nav` alias journeys/code-blocks.ts's own NAV_BLOCK/NAV_VIEW constants are scoped to).
const READING_VIEW = `${VISIBLE_LEAF} .markdown-reading-view`;
const NAV_BLOCK_JOURNAL = `${READING_VIEW} .block-language-journal-nav`;
const NAV_VIEW_JOURNAL = `${NAV_BLOCK_JOURNAL} .nav-view`;
const NAV_CURRENT_JOURNAL = `${NAV_BLOCK_JOURNAL} .nav-block-current`;

function countMatching(selector: string): Promise<number> {
  return browser.execute((sel) => document.querySelectorAll(sel).length, selector);
}

function textsOf(selector: string): Promise<string[]> {
  return browser.execute(
    (sel) => [...document.querySelectorAll<HTMLElement>(sel)].map((el) => el.textContent?.trim() ?? ""),
    selector,
  );
}

// Segments are `.nav-row` elements sharing one block; picking one by its rendered text is the
// only handle two segments in different lines offer. A real WebDriver click can't reach a row in
// this reading-mode layout (same Electron hit-test gap code-blocks.ts's clickNavNext documents),
// so dispatch a native DOM click, which still fires the Vue @click handler.
async function clickCurrentNavSegment(text: string): Promise<void> {
  const rowSelector = `${NAV_CURRENT_JOURNAL} .nav-row`;
  await browser.waitUntil(
    async () =>
      browser.execute(
        (sel: string, target: string) =>
          [...document.querySelectorAll(sel)].some((el) => el.textContent?.trim() === target),
        rowSelector,
        text,
      ),
    { timeoutMsg: `nav segment "${text}" did not render` },
  );
  await browser.execute(
    (sel: string, target: string) => {
      const el = [...document.querySelectorAll<HTMLElement>(sel)].find((row) => row.textContent?.trim() === target);
      el?.click();
    },
    rowSelector,
    text,
  );
}

describe("views examples", () => {
  describe("sidebar view (#116)", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-views-sidebar", plugins: ["journals"] });
    });

    it("shows a populated month calendar with decorations and a filled Notes by date list", async () => {
      await openCalendarView();

      // A spread of the daily journal's own decoration conditions (title/tag styles), so the
      // hero screenshot shows real, varied marks rather than a bare grid. Days chosen avoid
      // today (13) so they don't collide with the day-notes seeding below.
      // cspell:disable
      const decoDays = {
        title: dayAnchor(7), // filename ends "-07" -> corner condition
        color: dayAnchor(16), // #scolor tag -> text color
        border: dayAnchor(19), // #sborder tag -> border
        shape: dayAnchor(22), // #sshape tag -> shape
        corner: dayAnchor(25), // #scorner tag -> corner
      };
      // Every seeded note's real file ctime is "now" (today), regardless of its journal-date —
      // so each decoration note also carries its own `created` property, pointing at its own
      // day, or the Notes by date block below (which reads real creation time/property, not
      // journal-date) would sweep all five of them into today's list too.
      await seedNote(`day/${decoDays.title}.md`, note("daily", decoDays.title, "", [`created: ${decoDays.title}`]));
      await seedNote(
        `day/${decoDays.color}.md`,
        note("daily", decoDays.color, "marker #scolor", [`created: ${decoDays.color}`]),
      );
      await seedNote(
        `day/${decoDays.border}.md`,
        note("daily", decoDays.border, "marker #sborder", [`created: ${decoDays.border}`]),
      );
      await seedNote(
        `day/${decoDays.shape}.md`,
        note("daily", decoDays.shape, "marker #sshape", [`created: ${decoDays.shape}`]),
      );
      // cspell:enable
      await seedNote(
        `day/${decoDays.corner}.md`,
        note("daily", decoDays.corner, "marker #scorner", [`created: ${decoDays.corner}`]),
      );

      const today = todayAnchor();
      const differentDay = dayAnchor(2);
      // A note with the creation-date property, one without (falls back to file ctime — today,
      // since it's created now), and one whose property points at a different day entirely.
      await seedNote("Inbox/with-created.md", `---\ncreated: ${today}\n---\nGroceries list\n`);
      await seedNote("Inbox/without-created.md", "No frontmatter here; falls back to file ctime.\n");
      await seedNote("Inbox/different-day.md", `---\ncreated: ${differentDay}\n---\nNot shown today.\n`);

      await waitForState(
        () => countMatching(`${MONTH_VIEW} .decoration-corner`),
        (count) => count >= 2,
        "waited for the seeded corner decorations to render on the month grid",
      );
      await waitForState(
        () => countMatching(DAY_NOTES_CARD),
        (count) => count === 2,
        "waited for the Notes by date list to settle on today's two matching notes",
      );

      const cardCount = await countMatching(DAY_NOTES_CARD);
      const titles = await textsOf(DAY_NOTES_TITLE);

      // The default right sidebar is narrower than this view's 7-column month grid needs (it
      // overflows and clips rather than shrinking below content minimums), which would make the
      // hero screenshot unreadable. Widen the sidebar split itself before capturing — the same
      // "force a width via browser.execute" technique CLAUDE.md documents for narrow-pane
      // testing, used here in the opposite direction.
      await browser.execute(() => {
        const split = document.querySelector<HTMLElement>(".mod-right-split");
        if (split) split.style.width = "540px";
      });

      // The grid stretches to the view's full width at any split width, so its rightmost column
      // (the 19th's border, the 3 October cell) always meets the view's edge; the padding is what
      // keeps it off the image's edge.
      await captureThemed(VIEW_ROOT, "views-and-blocks-sidebar", { padding: 8 });

      await recordOutcome("views-and-blocks-sidebar", {
        today,
        decoDays,
        dayNotesPeriod: "day",
        dayNotesCardCount: cardCount,
        dayNotesTitlesInOrder: titles,
        excludedNote: "Inbox/different-day.md",
        excludedNoteCreatedProperty: differentDay,
      });
    });
  });

  describe("navigation rows (#106)", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-views-nav", plugins: ["journals"] });
    });

    it("opens the week's and month's notes from a daily note's default nav rows", async () => {
      const anchor = todayAnchor();
      const path = `day/${anchor}.md`;
      await seedNote(path, hostNote("daily", anchor, "```journal-nav\n```"));

      await openInReadingMode(path);
      await $(NAV_VIEW_JOURNAL).waitForExist({ timeoutMsg: "journal-nav block did not render" });

      const segmentTexts = await textsOf(`${NAV_CURRENT_JOURNAL} .nav-row`);
      // The day journal's default nav block: ddd, D (self), relative, week, month, year — one
      // segment per line. Week and month are lines 3 and 4 (0-indexed).
      const weekText = segmentTexts[3];
      const monthText = segmentTexts[4];
      if (weekText === undefined || monthText === undefined) {
        throw new UnexpectedNavSegmentCountError(segmentTexts);
      }

      await clickCurrentNavSegment(weekText);
      // The host note is still active when the click lands, so wait for the path to move off it.
      await waitForState(activeNotePath, (p) => p !== path, "waited for the week segment to open a note");
      const weekPath = (await activeNotePath()) ?? "";
      const weekFrontmatter = await frontmatterOf(weekPath);

      await openInReadingMode(path);
      await $(NAV_VIEW_JOURNAL).waitForExist({ timeoutMsg: "journal-nav block did not re-render" });
      await clickCurrentNavSegment(monthText);
      await waitForState(
        activeNotePath,
        (active) => active !== path && active !== weekPath,
        "waited for the month segment to open a note",
      );
      const monthPath = (await activeNotePath()) ?? "";
      const monthFrontmatter = await frontmatterOf(monthPath);

      // Both clicks navigated away from the host note's own tab, which Obsidian then hides
      // (inline display:none) — re-open it so the visible-leaf screenshot is its nav block.
      await openInReadingMode(path);
      await $(NAV_VIEW_JOURNAL).waitForExist({ timeoutMsg: "journal-nav block did not re-render for capture" });
      await captureThemed(NAV_VIEW_JOURNAL, "views-and-blocks-nav-rows");

      await recordOutcome("views-and-blocks-nav-rows", {
        hostPath: path,
        segmentTexts,
        week: { label: weekText, openedPath: weekPath, frontmatter: weekFrontmatter },
        month: { label: monthText, openedPath: monthPath, frontmatter: monthFrontmatter },
      });
    });
  });

  describe("week numbers after weekdays (#148)", () => {
    before(async () => {
      await browser.reloadObsidian({
        vault: "./e2e/fixtures/e2e-docs-views-week-numbers",
        plugins: ["journals"],
      });
    });

    it("records whether the week-number cell gets the Active highlight once its note is open", async () => {
      await $('[aria-label="Open Blocks"]').click();
      await $(WEEK_VIEW).waitForExist({ timeoutMsg: "week-calendar block did not render" });

      const cell = $(WEEK_NUMBER_CELL);
      await cell.waitForExist({ timeoutMsg: "week-number cell did not render" });

      const weekAnchor = await cell.getAttribute("data-anchor");
      const dataActiveBefore = await cell.getAttribute("data-active");

      await cell.click();
      await waitForState(activeNotePath, (p) => p !== undefined, "waited for the week note to open");
      const openedPath = (await activeNotePath()) ?? "";

      try {
        await waitForState(
          () => cell.getAttribute("data-active"),
          (v) => v === "true",
          "waited for the week-number cell to show the Active highlight",
        );
      } catch {
        // Recorded either way below; a timeout here just means it never highlighted.
      }
      const dataActiveAfter = await cell.getAttribute("data-active");
      const backgroundColor = await cell.getCSSProperty("background-color");

      await captureThemed(WEEK_VIEW, "views-and-blocks-week-numbers");

      // Surfaced through the outcome JSON and the run report rather than console output — the
      // repo's no-console rule has no e2e-screenshots exemption. activeHighlighted: false here
      // is exactly the "say so loudly" signal the brief asks for.
      const highlighted = dataActiveAfter === "true";

      await recordOutcome("views-and-blocks-week-numbers", {
        weekAnchor,
        openedPath,
        dataActiveBeforeOpen: dataActiveBefore,
        dataActiveAfterOpen: dataActiveAfter,
        activeHighlighted: highlighted,
        backgroundColorParsed: backgroundColor.parsed,
      });
    });
  });

  describe("URI: open next week's note in a new tab", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-uri", plugins: ["journals"] });
    });

    it("opens next week's note in a new tab via type=week&date=+1w&mode=tab", async () => {
      const leavesBefore = await markdownLeafCount();

      await openViaUri({ type: "week", date: "+1w", mode: "tab" });
      await waitForState(activeNotePath, (p) => p !== undefined, "waited for the URI to open a note");
      const openedPath = (await activeNotePath()) ?? "";
      const leavesAfter = await markdownLeafCount();

      const created = await noteExists(openedPath);
      const frontmatter = created ? await frontmatterOf(openedPath) : undefined;

      await recordOutcome("views-uri-next-week-tab", {
        params: { type: "week", date: "+1w", mode: "tab" },
        openedPath,
        created,
        frontmatter,
        leavesBefore,
        leavesAfter,
      });
    });
  });
});
