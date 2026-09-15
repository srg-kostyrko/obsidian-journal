import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { getSettings, waitForSettings } from "../support/plugin-data.js";
import {
  clickButton,
  clickDialogButton,
  closeSettings,
  openSettings,
  waitForDialogClosed,
} from "../support/settings.js";
import { frontmatterOf, waitForJournalFrontmatter } from "../support/vault.js";

const DAILY = m.import_journal_name({ period: "day" });
const WEEKLY = m.import_journal_name({ period: "week" });

async function bootImportVault(): Promise<void> {
  await browser.reloadObsidian({
    vault: "./e2e/fixtures/e2e-import-pn0",
    plugins: ["journals", "periodic-notes", "calendar"],
  });
}

describe("periodic notes 0.x import", () => {
  describe("importing from the dashboard notice", () => {
    before(bootImportVault);
    after(closeSettings);

    it("creates the journals, applies Calendar's week start and connects the notes already there", async () => {
      await openSettings();
      await clickButton(m.import_action());
      await clickDialogButton(m.import_preview_confirm());
      await clickDialogButton(m.import_connect_run());

      await waitForJournalFrontmatter("Daily/2026-03-02.md", { journal: DAILY, date: "2026-03-02" });
      await waitForJournalFrontmatter("Daily/2026-03-03.md", { journal: DAILY, date: "2026-03-03" });
      // Named W10 under both week grids: only Monday-start weeks anchor it on 2 March.
      await waitForJournalFrontmatter("Weekly/2026-W10.md", { journal: WEEKLY, date: "2026-03-02" });
      await waitForSettings(
        (settings) => (settings as { calendar?: { mode?: string; dow?: number } }).calendar?.dow === 1,
        "Calendar's Monday week start was not persisted",
      );

      await clickDialogButton(m.common_action_close());
      await waitForDialogClosed();
    });
  });

  describe("cancelling the preview", () => {
    before(bootImportVault);
    after(closeSettings);

    it("leaves settings and notes as they were", async () => {
      await openSettings();
      await clickButton(m.import_action());
      await clickDialogButton(m.common_action_cancel());
      await waitForDialogClosed();

      const settings = await getSettings();
      expect(Object.keys(settings.journals ?? {})).toEqual([]);
      const frontmatter = await frontmatterOf("Daily/2026-03-02.md");
      expect(frontmatter?.journal).toBeUndefined();
    });
  });
});
