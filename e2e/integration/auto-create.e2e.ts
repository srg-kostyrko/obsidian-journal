import { browser, expect } from "@wdio/globals";

import { todayAnchor, waitForJournalFrontmatter } from "../support/vault.js";

// AutoCreateService.initialize() fires its first tick immediately on boot (the setTimeout only
// schedules the midnight re-tick), so a journal with autoCreate=true must materialize today's note
// shortly after the plugin loads. This boot-time vault write is invisible to __mocks__/obsidian.ts;
// the midnight re-tick stays in auto-create.test.ts. The note is created but NOT opened, so we
// assert the parsed frontmatter at the expected path rather than the active file.
describe("auto-create", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-auto-create", plugins: ["journals"] });
  });

  it("creates today's note on boot for a journal with auto-create enabled", async () => {
    const today = todayAnchor();
    await waitForJournalFrontmatter(`${today}.md`, { journal: "daily", date: today });
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
