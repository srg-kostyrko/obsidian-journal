import { $, browser } from "@wdio/globals";

import { note } from "../journeys/decorations.js";
import { LIVE_LEAF, MONTH_VIEW, openCalendarView } from "../journeys/view.js";
import { reloadObsidianOn } from "../support/clock.js";
import { openViaUri } from "../support/uri.js";
import { activeNotePath, frontmatterOf, markdownLeafCount, noteExists, seedNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { captureThemed, recordOutcome, textsOf, widenRightSidebar } from "./capture.js";

const VIEW_ROOT = `${LIVE_LEAF} .journal-view-root`;
const DAY_NOTES = `${VIEW_ROOT} .journal-view-day-notes`;
const DAY_NOTES_CARD = `${DAY_NOTES} .journal-view-day-notes__card`;
const DAY_NOTES_TITLE = `${DAY_NOTES} .journal-view-day-notes__title`;

const WEEK_VIEW = `${LIVE_LEAF} .notes-week-view`;
const WEEK_NUMBER_CELL = `${WEEK_VIEW} [data-testid="week-number-cell"]`;

// The day views-and-blocks.md quotes; commands.md quotes the next-week link a day earlier.
const TODAY = "2026-09-14";
const URI_DAY = "2026-09-13";

// Obsidian dates a file by its filesystem birth time, which the clock pin does not reach and Linux
// cannot set, so the note is stamped on the pinned clock where the plugin reads it: mtime on disk,
// ctime on its TFile.
async function seedNoteOnPinnedClock(path: string, content: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, notePath, body) => {
      const folder = notePath.slice(0, notePath.lastIndexOf("/"));
      if (!(await app.vault.adapter.exists(folder))) await app.vault.createFolder(folder);
      const now = (window as unknown as { moment: () => { valueOf(): number } }).moment().valueOf();
      const file = await app.vault.create(notePath, body, { ctime: now, mtime: now });
      file.stat.ctime = now;
    },
    path,
    content,
  );
}

function countMatching(selector: string): Promise<number> {
  return browser.execute((sel) => document.querySelectorAll(sel).length, selector);
}

describe("views examples", () => {
  describe("sidebar view (#116)", () => {
    before(async () => {
      // At the time the committed image shows on its cards.
      await reloadObsidianOn(
        TODAY,
        { vault: "./e2e/fixtures/e2e-docs-views-sidebar", plugins: ["journals"] },
        "01:58:00",
      );
    });

    it("shows a populated month calendar with decorations and a filled Notes by date list", async () => {
      await openCalendarView();

      // A spread of the daily journal's own decoration conditions (title/tag styles), so the
      // hero screenshot shows real, varied marks rather than a bare grid. Days chosen avoid
      // today (14) so they don't collide with the day-notes seeding below.
      // cspell:disable
      const decoDays = {
        title: "2026-09-07", // filename ends "-07" -> corner condition
        color: "2026-09-16", // #scolor tag -> text color
        border: "2026-09-19", // #sborder tag -> border
        shape: "2026-09-22", // #sshape tag -> shape
        corner: "2026-09-25", // #scorner tag -> corner
      };
      // Every seeded note's real file ctime is the machine's today, regardless of its journal-date —
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

      const today = TODAY;
      const differentDay = "2026-09-02";
      // A note with the creation-date property, one without (falls back to file ctime — today,
      // since it's created now), and one whose property points at a different day entirely.
      await seedNoteOnPinnedClock("Inbox/with-created.md", `---\ncreated: ${today}\n---\nGroceries list\n`);
      await seedNoteOnPinnedClock("Inbox/without-created.md", "No frontmatter here; falls back to file ctime.\n");
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
      // hero screenshot unreadable. Widen the sidebar split itself before capturing.
      await widenRightSidebar(540, VIEW_ROOT);

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

  describe("week numbers after weekdays (#148)", () => {
    before(async () => {
      await reloadObsidianOn(TODAY, {
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

      // No console exemption for e2e screenshots; surface a false reading through the outcome JSON.
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
      await reloadObsidianOn(URI_DAY, { vault: "./e2e/fixtures/e2e-uri", plugins: ["journals"] });
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
