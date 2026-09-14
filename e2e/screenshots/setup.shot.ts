import { browser } from "@wdio/globals";

import { cursorOf, editorValue, waitForCursorLine } from "../support/editor.js";
import { waitForNoticeText } from "../support/notices.js";
import { openViaUri } from "../support/uri.js";
import {
  contentOf,
  frontmatterOf,
  noteExists,
  todayAnchor,
  waitForDistinctActiveNote,
  waitForJournalFrontmatter,
} from "../support/vault.js";

import { recordOutcome } from "./capture.js";

function markdownFileCount(): Promise<number> {
  return browser.executeObsidian(({ app }) => app.vault.getMarkdownFiles().length);
}

function firstPathUnder(prefix: string): Promise<string | undefined> {
  return browser.executeObsidian(
    ({ app }, folderPrefix) => app.vault.getMarkdownFiles().find((f) => f.path.startsWith(folderPrefix))?.path,
    prefix,
  );
}

describe("setup examples", () => {
  it("auto-creates the daily work journal's note for today at startup (setup-daily)", async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-setup-daily", plugins: ["journals"] });

    let path: string | undefined;
    await browser.waitUntil(
      async () => {
        const found = await firstPathUnder("Work/DailyNotes/");
        path = typeof found === "string" ? found : undefined;
        return path !== undefined;
      },
      { timeoutMsg: "no note was auto-created under Work/DailyNotes/" },
    );
    const exists = path !== undefined && (await noteExists(path));
    const frontmatter = path === undefined ? undefined : await frontmatterOf(path);

    await recordOutcome("setup-daily", {
      today: todayAnchor(),
      path,
      exists,
      frontmatter,
    });
  });

  it("names project sprint notes under Projects/<journal name>/Sprints (setup-apollo)", async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-setup-apollo", plugins: ["journals"] });

    const sprint1 = "Projects/Apollo/Sprints/Sprint 1.md";
    await openViaUri({ journal: "Apollo", date: "2026-01-05" });
    await waitForJournalFrontmatter(sprint1, { journal: "Apollo", date: "2026-01-05" });
    const sprint1Exists = await noteExists(sprint1);

    const sprint2 = "Projects/Apollo/Sprints/Sprint 2.md";
    await openViaUri({ journal: "Apollo", date: "2026-01-19" });
    await waitForJournalFrontmatter(sprint2, { journal: "Apollo", date: "2026-01-19" });
    const sprint2Exists = await noteExists(sprint2);

    await recordOutcome("setup-apollo", {
      sprint1: { path: sprint1, exists: sprint1Exists, frontmatter: await frontmatterOf(sprint1) },
      sprint2: { path: sprint2, exists: sprint2Exists, frontmatter: await frontmatterOf(sprint2) },
    });
  });

  it("numbers academic term weeks from the current week grid and refuses a date past the end (setup-academic)", async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-setup-academic", plugins: ["journals"] });

    // The settings pickers store a period's first day, and this fixture's week grid starts
    // Sunday — so the term's start and numbering anchor are the nearest Sunday, 2026-09-06,
    // rather than a Monday.
    await openViaUri({ journal: "term", date: "2026-09-06" });
    const firstPath = await waitForDistinctActiveNote(undefined, {
      timeoutMsg: "no note became active for 2026-09-06",
    });
    const firstContent = await contentOf(firstPath);
    const firstFrontmatter = await frontmatterOf(firstPath);

    await openViaUri({ journal: "term", date: "2026-09-13" });
    const secondPath = await waitForDistinctActiveNote(firstPath, {
      timeoutMsg: "no distinct note became active for 2026-09-13",
    });
    const secondContent = await contentOf(secondPath);
    const secondFrontmatter = await frontmatterOf(secondPath);

    const beforeOutOfRange = await markdownFileCount();
    await openViaUri({ journal: "term", date: "2027-01-04" });
    const outOfRangeNotices = await waitForNoticeText(5000);
    const afterOutOfRange = await markdownFileCount();

    await recordOutcome("setup-academic", {
      configuredStart: "2026-09-06",
      configuredEnd: "2026-12-18",
      firstCreatedNote: {
        requestedDate: "2026-09-06",
        path: firstPath,
        content: firstContent,
        frontmatter: firstFrontmatter,
      },
      secondCreatedNote: {
        requestedDate: "2026-09-13",
        path: secondPath,
        content: secondContent,
        frontmatter: secondFrontmatter,
      },
      outOfRange: {
        date: "2027-01-04",
        notices: outOfRangeNotices,
        fileCountBefore: beforeOutOfRange,
        fileCountAfter: afterOutOfRange,
        createdAnything: afterOutOfRange !== beforeOutOfRange,
      },
    });
  });

  it("numbers release/sprint digits across the release boundary (setup-release)", async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-sprint-index", plugins: ["journals"] });

    // release journal: anchorDate 2026-01-05, 2-week custom interval; release digit never
    // resets, sprint digit resets after 6 — so the first six periods are Release4711Sprint1..6
    // and the seventh rolls over to Release4712Sprint1.
    const anchors = ["2026-01-05", "2026-01-19", "2026-02-02", "2026-02-16", "2026-03-02", "2026-03-16", "2026-03-30"];
    const names: string[] = [];
    for (const anchor of anchors) {
      await openViaUri({ journal: "release", date: anchor });
      names.push(
        await waitForDistinctActiveNote(names.at(-1), {
          timeoutMsg: `no new note became active for release anchor ${anchor}`,
        }),
      );
    }

    await recordOutcome("setup-release", { anchors, names });
  });

  it("renders tp.date.now with the note's own date filled in first (setup-templater-date-now)", async () => {
    await browser.reloadObsidian({
      vault: "./e2e/fixtures/e2e-docs-setup-templater",
      plugins: ["journals", "templater-obsidian"],
    });

    await openViaUri({ journal: "date-now", date: "2026-06-15" });
    const path = "date-now/2026-06-15.md";
    await browser.waitUntil(
      async () => {
        const content = await contentOf(path);
        return typeof content === "string" && !content.includes("<%");
      },
      { timeoutMsg: "tp.date.now template never finished evaluating" },
    );
    const content = await contentOf(path);

    await recordOutcome("setup-templater-date-now", {
      journalDate: "2026-06-15",
      templateSource: '<% tp.date.now("dddd", 0, "{{date}}", "YYYY-MM-DD") %>',
      path,
      content,
    });
  });

  it("jumps the editor cursor to the tp.file.cursor marker on creation (setup-templater-cursor)", async () => {
    // Same fixture as the previous test, but reload so this test does not depend on ordering.
    await browser.reloadObsidian({
      vault: "./e2e/fixtures/e2e-docs-setup-templater",
      plugins: ["journals", "templater-obsidian"],
    });

    await openViaUri({ journal: "cursor", date: todayAnchor() });
    const path = `cursor/${todayAnchor()}.md`;
    await waitForCursorLine(5, "waited for the editor cursor to jump to the Templater marker");

    const cursor = await cursorOf();
    const value = await editorValue();
    const content = await contentOf(path);

    await recordOutcome("setup-templater-cursor", {
      path,
      cursor,
      editorValueContainsMarker: value?.includes("tp.file.cursor") ?? undefined,
      content,
    });
  });
});
