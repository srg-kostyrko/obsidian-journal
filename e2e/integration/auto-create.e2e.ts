import { browser } from "@wdio/globals";

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
});
