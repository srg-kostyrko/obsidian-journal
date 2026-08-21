import { browser } from "@wdio/globals";

import { createNote, waitForJournalFrontmatter } from "../support/vault.js";

// The `e2e-week-of-month` fixture pins the week grid to Monday/ISO and commits two weekly
// journals whose names carry `{{week_of_month}}`. The variable renders from the date rather
// than being captured, so inversion has to match its digits without binding them and then
// confirm the period by re-rendering the whole name — a path the unit suite can exercise but
// only a real boot proves is wired.
describe("auto-attach with a week-of-month template", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-week-of-month", plugins: ["journals"] });
  });

  // "September" alone parses to the 1st, which sits in the week starting August 31 — September's
  // week 1. Only the digit tells the two apart, so an attach that ignored it would land here.
  it("walks past the month's first week to the week the digits name", async () => {
    await createNote("2026 September week 3.md");

    await waitForJournalFrontmatter("2026 September week 3.md", { journal: "weekly", date: "2026-09-14" });
  });

  it("attaches a month's first week to the week that opens in the month before", async () => {
    await createNote("2026 September week 1.md");

    await waitForJournalFrontmatter("2026 September week 1.md", { journal: "weekly", date: "2026-08-31" });
  });

  // Both of `planner`'s tokens carry <endOf=week>, so this asks the same walk to run for a
  // template whose date has to be un-snapped back to its own week before it can seed anything.
  it("inverts a template whose tokens are read from the end of the week", async () => {
    await createNote("Plan 2026 September week 3.md");

    await waitForJournalFrontmatter("Plan 2026 September week 3.md", { journal: "planner", date: "2026-09-14" });
  });
});
