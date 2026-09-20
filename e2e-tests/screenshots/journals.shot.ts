import { $$, browser } from "@wdio/globals";

import { pinClock } from "../support/clock.js";
import { waitForNoticeText } from "../support/notices.js";
import { openViaUri } from "../support/uri.js";
import {
  activeNotePath,
  contentOf,
  createNote,
  frontmatterOf,
  noteExists,
  waitForActiveNote,
  waitForJournalFrontmatter,
} from "../support/vault.js";

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
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-docs-journals", plugins: ["journals"] });
  });

  it("files a note by decade through the folder template (#82)", async () => {
    // The template stamps the creation moment; keep it on the day journals.md quotes.
    await pinClock("2026-09-13T20:27:19");
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
    // Bounded well under the config's waitforTimeout: the decade folder cannot be reverse-parsed
    // at all — `{{date<startOf=decade>:YYYY}}` normalizes to 1950-01-01 while the finer tokens
    // normalize to their own ranges' starts, so no candidate ever survives the merge. There is no
    // slow path for this wait to be waiting on, only the full budget to burn.
    let connected = true;
    await waitForJournalFrontmatter(nextDayPath, { journal: "daily", date: "1959-02-15" }, 3000).catch(() => {
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
    // The moment journals.md quotes; read at creation, so no reboot is needed.
    await pinClock("2026-09-13T20:27:19");
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
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-bounds", plugins: ["journals"] });

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

const FOLDERS_VAULT = "./e2e-tests/fixtures/e2e-docs-journals-folders";

function momentLocale(): Promise<string> {
  return browser.execute(() => (window as unknown as { moment: { locale(): string } }).moment.locale());
}

async function createdBody(journal: string, folder: string, date: string): Promise<{ path: string; body?: string }> {
  const path = `${folder}/${date}.md`;
  await openViaUri({ journal, date });
  await waitForJournalFrontmatter(path, { journal, date });
  const content = await contentOf(path);
  return { path, body: content?.replace(/^---\n[\s\S]*?\n---\n/, "").trim() };
}

describe("journals folder and template examples", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FOLDERS_VAULT, plugins: ["journals"] });
  });

  it("files notes under a folder per year, leaving older notes where they are", async () => {
    const createdPath = "Journal/2026/2026-09-14.md";
    await openViaUri({ journal: "daily", date: "2026-09-14" });
    await waitForJournalFrontmatter(createdPath, { journal: "daily", date: "2026-09-14" });

    // The fixture's note for 31 December 2025 sits at the vault root, where the journal wrote its
    // notes before its folder gained a year.
    const olderPath = "2025-12-31.md";
    await openViaUri({ journal: "daily", date: "2025-12-31" });
    let openedOlder = true;
    await waitForActiveNote(olderPath).catch(() => {
      openedOlder = false;
    });
    const activeAfterOlder = await activeNotePath();
    const olderAtNewPath = "Journal/2025/2025-12-31.md";
    const olderAtNewPathExists = await noteExists(olderAtNewPath);

    const handMadePath = "Journal/2027/2027-01-05.md";
    await browser.executeObsidian(async ({ app }) => {
      await app.vault.createFolder("Journal/2027");
    });
    await createNote(handMadePath, "");
    let autoAttached = true;
    await waitForJournalFrontmatter(handMadePath, { journal: "daily", date: "2027-01-05" }).catch(() => {
      autoAttached = false;
    });

    await recordOutcome("journals-year-folders", {
      created: { path: createdPath, exists: await noteExists(createdPath) },
      older: { path: olderPath, openedOlder, activeAfterOlder, olderAtNewPath, olderAtNewPathExists },
      handMade: { path: handMadePath, autoAttached, frontmatter: await frontmatterOf(handMadePath) },
    });
  });

  it("picks a template by the note's weekday", async () => {
    await recordOutcome("journals-weekday-templates", {
      momentLocale: await momentLocale(),
      byName: {
        friday: await createdBody("daily", "Journal/2026", "2026-09-18"),
        monday: await createdBody("daily", "Journal/2026", "2026-09-21"),
      },
      byNumber: {
        friday: await createdBody("iso", "Iso", "2026-09-18"),
        monday: await createdBody("iso", "Iso", "2026-09-21"),
      },
    });
  });
});
