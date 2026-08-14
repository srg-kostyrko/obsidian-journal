import { browser, expect } from "@wdio/globals";

import { todayAnchor, waitForJournalFrontmatter } from "../support/vault.js";

// AutoCreateService.initialize() waits for the index to be built and then ticks (the setTimeout
// only schedules the midnight re-tick), so a journal with autoCreate=true must materialize today's
// note shortly after the plugin loads. This spec is what proves the index ever reports ready at a
// real boot: if it did not, auto-create would silently never run and every unit test would still
// pass. This boot-time vault write is invisible to __mocks__/obsidian.ts; the midnight re-tick and
// the wait itself stay in auto-create.test.ts. The note is created but NOT opened, so we assert the
// parsed frontmatter at the expected path rather than the active file.
describe("auto-create", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-auto-create", plugins: ["journals"] });
  });

  it("creates today's note on boot for a journal with auto-create enabled", async () => {
    const today = todayAnchor();
    await waitForJournalFrontmatter(`${today}.md`, { journal: "daily", date: today });
  });

  it("stamps a non-daily note with the canonical period anchor, not today's raw date", async () => {
    // A monthly journal's file lands at the same YYYY-MM path either way; the regression this
    // guards is the frontmatter journal-date — it must be the month anchor (…-01) so the index
    // accepts the note, not today's mid-month date (which parseEntry would reject → orphaned).
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await waitForJournalFrontmatter(`monthly/${ym}.md`, { journal: "monthly", date: `${ym}-01` });
  });

  it("does not create a note for a journal whose timeline has ended", async () => {
    // The fixture stores "ended" (auto-create on, timeline ended 2020-12-31) before "daily",
    // and the tick awaits journals sequentially — once the previous test observed daily's
    // note, any "ended" create has already settled. Assert raw vault existence, not
    // frontmatter: metadataCache parsing lags creation and would make this vacuously green.
    const exists = await browser.executeObsidian(
      ({ app }, path) => app.vault.getAbstractFileByPath(path) !== null,
      `ended/${todayAnchor()}.md`,
    );
    expect(exists).toBe(false);
  });
});
