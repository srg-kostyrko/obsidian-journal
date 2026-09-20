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
import { waitForDistinctActiveNote, waitForJournalFrontmatter } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

// Runs only under the Periodic Notes 1.x capability (see wdio.conf.mts).
async function importFromMaintenance(): Promise<void> {
  await openSettings();
  await clickButton(m.maintenance_open());
  await clickButton(m.import_action());
  await clickDialogButton(m.import_preview_confirm());
  await clickDialogButton(m.import_connect_run());
}

const readSets = (): Promise<string[] | null> =>
  browser.executeObsidian(({ app }) => {
    const plugin = (app as unknown as { plugins: { getPlugin(id: string): unknown } }).plugins.getPlugin(
      "periodic-notes",
    ) as { settings?: { subscribe?: (run: (value: unknown) => void) => () => void } } | null;
    const subscribe = plugin?.settings?.subscribe;
    if (typeof subscribe !== "function") return null;
    let value: unknown;
    subscribe((next) => {
      value = next;
    })();
    return ((value as { calendarSets?: { id: string }[] }).calendarSets ?? []).map((set) => set.id);
  });

describe("periodic notes 1.x", () => {
  describe("the capability", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-import-pn1", plugins: ["journals", "periodic-notes"] });
    });

    it("loads Periodic Notes 1.x with its calendar sets behind a store", async () => {
      // The probe returns null until the host has published its settings store, which is a
      // plugin-load race rather than a missing calendar set — poll it out before comparing.

      await waitForState(readSets, (found) => found.length > 0, "Periodic Notes 1.x never published its calendar sets");
      expect(await readSets()).toEqual(["Default", "Work"]);
    });
  });

  describe("importing two calendar sets", () => {
    const WORK_DAILY = m.import_journal_name_in_set({ set: "Work", period: "day" });
    const DEFAULT_DAILY = m.import_journal_name_in_set({ set: "Default", period: "day" });

    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-import-pn1", plugins: ["journals", "periodic-notes"] });
      // The Work set opens today's note at startup from Periodic Notes' own onLayoutReady callback,
      // which can run after reloadObsidian resolves; opening that note closes the settings modal, so
      // settings must not open until it has landed.
      await waitForDistinctActiveNote(undefined, { timeoutMsg: "Periodic Notes did not open its startup note" });
    });
    after(closeSettings);

    it("shelves each set's journals, sets the startup journal and connects the notes", async () => {
      await importFromMaintenance();

      await waitForJournalFrontmatter("Daily/2026-03-02.md", { journal: DEFAULT_DAILY, date: "2026-03-02" });
      await waitForJournalFrontmatter("Work/2026-03-02.md", { journal: WORK_DAILY, date: "2026-03-02" });
      await waitForSettings((settings) => {
        const stored = settings as {
          shelves?: Record<string, { journals?: string[] }>;
          startup?: { journalName?: string };
        };
        return (
          stored.shelves?.Default?.journals?.includes(DEFAULT_DAILY) === true &&
          stored.shelves.Work?.journals?.includes(WORK_DAILY) === true &&
          stored.startup?.journalName === WORK_DAILY
        );
      }, "the calendar sets were not shelved, or the startup journal was not set");

      await clickDialogButton(m.common_action_close());
      await waitForDialogClosed();
    });
  });

  describe("importing settings 1.x migrated in memory", () => {
    before(async () => {
      await browser.reloadObsidian({
        vault: "./e2e/fixtures/e2e-import-pn1-legacy",
        plugins: ["journals", "periodic-notes"],
      });
    });
    after(closeSettings);

    it("imports the single migrated set without a shelf", async () => {
      await importFromMaintenance();

      await waitForJournalFrontmatter("Legacy/2026-03-02.md", {
        journal: m.import_journal_name({ period: "day" }),
        date: "2026-03-02",
      });
      const settings = await getSettings();
      expect(Object.keys(settings.shelves ?? {})).toEqual([]);

      await clickDialogButton(m.common_action_close());
      await waitForDialogClosed();
    });
  });
});
