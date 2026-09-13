import { $, $$, browser } from "@wdio/globals";

import { CUSTOM_INTERVALS } from "../journeys/view-blocks.js";
import { clickButton, clickRowButton, expandSection, openSettings } from "../support/settings.js";
import { openViaUri } from "../support/uri.js";
import { activeNotePath, frontmatterOf, seedNote, waitForFrontmatter, writeNote } from "../support/vault.js";

import { captureThemed, recordOutcome } from "./capture.js";

const RIBBON_OPEN_SPRINTS = '[aria-label="Open Sprints"]';
const INTERVAL_ENTRY = `${CUSTOM_INTERVALS} .journal-view-custom-intervals__entry`;

// waitForActiveNoteIn (vault.ts) only checks the folder prefix, so a second openViaUri call
// into the same folder can read back the still-active PREVIOUS note if the active-file switch
// hasn't landed yet — the plugin awaits its own metadataCache round trip before opening the
// note. Wait for the active path to both land in the folder AND differ from what was active
// a moment ago (opened via an earlier call in this same test).
async function waitForNewActiveNoteIn(folder: string, previous: string): Promise<string> {
  let path = "";
  await browser.waitUntil(
    async () => {
      const active = await activeNotePath();
      path = active ?? "";
      return path.startsWith(`${folder}/`) && path !== previous;
    },
    { timeoutMsg: `waited for a new journal note to open under ${folder}/ (previous: ${previous})` },
  );
  return path;
}

async function renderedIntervalAnchors(): Promise<string[]> {
  await $(INTERVAL_ENTRY).waitForExist({ timeoutMsg: "no custom-interval entry rendered" });
  return browser.execute(
    (selector) => Array.from(document.querySelectorAll<HTMLElement>(selector), (el) => el.dataset.anchor ?? ""),
    INTERVAL_ENTRY,
  );
}

// Mirrors journals.shot.ts's notice reader: observe whatever the Notice layer shows rather
// than asserting a guess about it up front.
async function noticeTexts(): Promise<string[]> {
  return $$(".notice-container .notice").map((notice) => notice.getText());
}

async function waitForNoticeText(timeout: number): Promise<string[]> {
  try {
    await browser.waitUntil(
      async () => {
        const texts = await noticeTexts();
        return texts.some((text) => text.trim() !== "");
      },
      { timeout, interval: 100 },
    );
  } catch {
    // No notice rendered within the bound; fall through and report whatever is there (nothing).
  }
  const texts = await noticeTexts();
  return texts.filter((text) => text.trim() !== "");
}

async function switchToWesternPreset(): Promise<void> {
  await openSettings();
  await expandSection("Calendar");
  await clickButton("Change");
  await clickRowButton("Western traditional", "Use");
  await clickButton("Update");
}

describe("periods examples", () => {
  it("numbers two-week sprints continuously and renders them on a custom-intervals block", async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-periods-intervals", plugins: ["journals"] });

    // The view must already be mounted and watching before a sprint note becomes active, or its
    // window defaults to today: a freshly-opened view leaf has no file of its own, so the
    // follow-active-note watch's very first (immediate) run sees no active file to follow.
    await $(RIBBON_OPEN_SPRINTS).click();
    await $(CUSTOM_INTERVALS).waitForExist({ timeoutMsg: "Sprints view did not render" });

    await openViaUri({ journal: "Sprint", date: "2026-02-01" });
    await waitForFrontmatter(
      "Sprint 1.md",
      (fm) => fm["journal-date"] === "2026-02-01",
      "first sprint note never attached",
    );
    const sprint1 = await frontmatterOf("Sprint 1.md");

    await openViaUri({ journal: "Sprint", date: "2026-02-15" });
    await waitForFrontmatter(
      "Sprint 2.md",
      (fm) => fm["journal-date"] === "2026-02-15",
      "second sprint note never attached",
    );
    const sprint2 = await frontmatterOf("Sprint 2.md");

    // The view follows the just-opened note, so its window moves onto February; wait for the
    // block to re-render with a February entry before reading anchors or capturing.
    await browser.waitUntil(
      async () => {
        const rendered = await renderedIntervalAnchors();
        return rendered.includes("2026-02-01");
      },
      { timeoutMsg: "custom-intervals block never followed the sprint notes onto February" },
    );
    const anchors = await renderedIntervalAnchors();
    await $(`${INTERVAL_ENTRY} .nav-row`).waitForExist({ timeoutMsg: "custom-intervals entries drew no rows" });

    await captureThemed(CUSTOM_INTERVALS, "periods-intervals");

    await recordOutcome("periods-intervals", {
      sprint1: { path: "Sprint 1.md", frontmatter: sprint1 },
      sprint2: { path: "Sprint 2.md", frontmatter: sprint2 },
      renderedIntervalAnchors: anchors,
    });
  });

  it("changes the week configuration and re-anchors weekly notes, colliding two old weeks onto one new week", async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-periods-week-preset", plugins: ["journals"] });

    // week/2026-W23.md is an ordinary mid-year week; week/2026-W53.md (ISO week 53 of 2026,
    // start 2026-12-28) and week/2027-W01.md (ISO week 1 of 2027, start 2027-01-04) both target
    // the SAME Western-grid anchor (2027-01-03) once the preset switches, so their old identities
    // collide on the new grid.
    await seedNote("week/2026-W23.md", "");
    await seedNote("week/2026-W53.md", "");
    await seedNote("week/2027-W01.md", "");
    await waitForFrontmatter(
      "week/2026-W23.md",
      (fm) => fm["journal-date"] === "2026-06-01",
      "mid-year weekly note never attached",
    );
    await waitForFrontmatter(
      "week/2026-W53.md",
      (fm) => fm["journal-date"] === "2026-12-28",
      "ISO week-53 weekly note never attached",
    );
    await waitForFrontmatter(
      "week/2027-W01.md",
      (fm) => fm["journal-date"] === "2027-01-04",
      "ISO week-1-of-2027 weekly note never attached",
    );

    const before = {
      midYear: await frontmatterOf("week/2026-W23.md"),
      week53: await frontmatterOf("week/2026-W53.md"),
      week1: await frontmatterOf("week/2027-W01.md"),
    };

    await switchToWesternPreset();

    await waitForFrontmatter(
      "week/2026-W23.md",
      (fm) => fm["journal-date"] === "2026-05-31",
      "weekly note was not re-anchored onto the Western week grid",
    );
    // Give the (possibly blocked) collision pair time to settle before reading them.
    await browser
      .waitUntil(
        async () => {
          const week53 = await frontmatterOf("week/2026-W53.md");
          return week53?.["journal-date"] !== "2026-12-28";
        },
        { timeout: 5000, timeoutMsg: "week 53 note never re-anchored", interval: 100 },
      )
      .catch(() => {
        // Recorded either way below — a timeout here just means it never moved.
      });

    const notices = await waitForNoticeText(5000);

    const after = {
      midYear: await frontmatterOf("week/2026-W23.md"),
      week53: await frontmatterOf("week/2026-W53.md"),
      week1: await frontmatterOf("week/2027-W01.md"),
    };

    await recordOutcome("periods-week-preset", { before, after, notices });
  });

  it("shortens a days/weeks custom interval, shifting every later interval by the change", async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-periods-shorten", plugins: ["journals"] });

    const path = "sprint/2026-01-05.md";
    await writeNote(
      path,
      "---\njournal: sprint\njournal-date: 2026-01-05\njournal-end-date: 2026-01-10\n---\n\nFirst sprint interval.\n",
    );
    await waitForFrontmatter(
      path,
      (fm) => fm["journal-end-date"] === "2026-01-10",
      "the shortened end date never reached metadataCache",
    );
    const shortened = await frontmatterOf(path);

    await openViaUri({ journal: "sprint", date: "2026-01-15" });
    const nextPath = await waitForNewActiveNoteIn("sprint", path);
    await waitForFrontmatter(
      nextPath,
      (fm) => typeof fm["journal-start-date"] === "string",
      "the interval after the shortened one never attached",
    );
    const next = await frontmatterOf(nextPath);

    await openViaUri({ journal: "sprint", date: "2026-01-30" });
    const afterPath = await waitForNewActiveNoteIn("sprint", nextPath);
    await waitForFrontmatter(
      afterPath,
      (fm) => typeof fm["journal-start-date"] === "string",
      "the interval two after the shortened one never attached",
    );
    const after = await frontmatterOf(afterPath);

    await recordOutcome("periods-shorten-days-weeks", {
      shortened: { path, frontmatter: shortened },
      next: { path: nextPath, frontmatter: next },
      after: { path: afterPath, frontmatter: after },
    });
  });

  it("shortens a months custom interval, holding every interval after the very next one", async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-periods-shorten", plugins: ["journals"] });

    const path = "monthly/2026-01-01.md";
    await writeNote(
      path,
      "---\njournal: monthly\njournal-date: 2026-01-01\njournal-end-date: 2026-01-20\n---\n\nFirst monthly interval.\n",
    );
    await waitForFrontmatter(
      path,
      (fm) => fm["journal-end-date"] === "2026-01-20",
      "the shortened end date never reached metadataCache",
    );
    const shortened = await frontmatterOf(path);

    await openViaUri({ journal: "monthly", date: "2026-01-25" });
    const nextPath = await waitForNewActiveNoteIn("monthly", path);
    await waitForFrontmatter(
      nextPath,
      (fm) => typeof fm["journal-start-date"] === "string",
      "the interval after the shortened one never attached",
    );
    const next = await frontmatterOf(nextPath);

    await openViaUri({ journal: "monthly", date: "2026-02-10" });
    const afterPath = await waitForNewActiveNoteIn("monthly", nextPath);
    await waitForFrontmatter(
      afterPath,
      (fm) => typeof fm["journal-start-date"] === "string",
      "the interval two after the shortened one never attached",
    );
    const after = await frontmatterOf(afterPath);

    await recordOutcome("periods-shorten-months", {
      shortened: { path, frontmatter: shortened },
      next: { path: nextPath, frontmatter: next },
      after: { path: afterPath, frontmatter: after },
    });
  });

  it("names a week that straddles New Year by the week's own year", async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-periods-week-numbers", plugins: ["journals"] });

    const dates = ["2025-12-29", "2026-12-28", "2027-01-04"];
    const results: { date: string; path: string; name: string; startDate: unknown }[] = [];
    let previous = "";
    for (const date of dates) {
      await openViaUri({ journal: "weekly", date });
      const path = await waitForNewActiveNoteIn("week", previous);
      previous = path;
      await waitForFrontmatter(
        path,
        (fm) => typeof fm["journal-start-date"] === "string",
        `the week containing ${date} never attached`,
      );
      const fm = await frontmatterOf(path);
      const name = path.split("/").pop()?.replace(/\.md$/, "") ?? "";
      results.push({ date, path, name, startDate: fm?.["journal-start-date"] });
    }

    await recordOutcome("periods-week-numbers", { results });
  });
});
