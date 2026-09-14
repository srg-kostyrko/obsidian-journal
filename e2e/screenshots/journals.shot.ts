import { $$, browser } from "@wdio/globals";

import { waitForNoticeText } from "../support/notices.js";
import { openViaUri } from "../support/uri.js";
import { contentOf, createNote, frontmatterOf, noteExists, waitForJournalFrontmatter } from "../support/vault.js";

import { recordOutcome } from "./capture.js";

// Notices persist for several seconds, so a leftover from the first half of a two-part test
// would otherwise be read again as if it were fresh. Obsidian dismisses a Notice on click.
async function dismissNotices(): Promise<void> {
  const notices = await $$(".notice-container .notice").getElements();
  for (const notice of notices) {
    await notice.click().catch(() => {
      // The notice may have already dismissed itself; nothing to do either way.
    });
  }
}

describe("journals examples", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-journals", plugins: ["journals"] });
  });

  it("files a note by decade through the folder template (#82)", async () => {
    await openViaUri({ journal: "daily", date: "1959-02-14" });
    const createdPath = "Calendar/1950s/1959/02/1959-02-14.md";
    // Note creation is three writes (empty file, template content, then the journal/journal-date
    // claim) each landing as its own metadataCache update, so wait for the LAST one rather than
    // for "frontmatter exists at all" — that would catch the template-only midpoint, or for mere
    // file existence — that would catch the still-empty first write.
    await waitForJournalFrontmatter(createdPath, { journal: "daily", date: "1959-02-14" });
    const exists = await noteExists(createdPath);
    const frontmatter = exists ? await frontmatterOf(createdPath) : undefined;

    // A plain note dropped by hand at the path the journal would use for the very next day, with
    // no frontmatter of its own — does auto-attach read the decade-boundary folder segment back?
    const nextDayPath = "Calendar/1950s/1959/02/1959-02-15.md";
    await createNote(nextDayPath, "");
    let connected = true;
    await waitForJournalFrontmatter(nextDayPath, { journal: "daily", date: "1959-02-15" }).catch(() => {
      connected = false;
    });
    const nextDayFrontmatter = await frontmatterOf(nextDayPath);

    await recordOutcome("journals-decade-filing", {
      createdPath,
      exists,
      frontmatter,
      nextDayPath,
      autoAttachConnected: connected,
      nextDayFrontmatter,
    });
  });

  it("renders current_date and time variables into a template's frontmatter (#154)", async () => {
    await openViaUri({ journal: "daily", date: "2026-06-15" });
    const path = "Calendar/2020s/2026/06/2026-06-15.md";
    await waitForJournalFrontmatter(path, { journal: "daily", date: "2026-06-15" });
    const content = await contentOf(path);

    const lineFor = (key: string): string | undefined =>
      content
        ?.split("\n")
        .find((line) => line.startsWith(`${key}:`))
        ?.slice(key.length + 1)
        .trim();

    await recordOutcome("journals-creation-time", {
      path,
      content,
      created: lineFor("created"),
      created_wrong: lineFor("created_wrong"),
      stamp: lineFor("stamp"),
    });
  });

  it("refuses to write outside a bounded journal's timeline", async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-bounds", plugins: ["journals"] });

    const beforeStart = "2030-05-31";
    const beforePath = `window/${beforeStart}.md`;
    await openViaUri({ journal: "daily-window", date: beforeStart });
    const beforeNotices = await waitForNoticeText(5000);
    const beforeExists = await noteExists(beforePath);
    await dismissNotices();

    const afterEnd = "2030-07-01";
    const afterPath = `window/${afterEnd}.md`;
    await openViaUri({ journal: "daily-window", date: afterEnd });
    const afterNotices = await waitForNoticeText(5000);
    const afterExists = await noteExists(afterPath);

    await recordOutcome("journals-bounded", {
      before: { date: beforeStart, path: beforePath, exists: beforeExists, notices: beforeNotices },
      after: { date: afterEnd, path: afterPath, exists: afterExists, notices: afterNotices },
    });
  });
});
