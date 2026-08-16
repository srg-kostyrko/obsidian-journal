import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { listPluginDataFiles, readPluginDataFile, waitForSnapshotFiles } from "../support/plugin-data.js";
import { clickButton, closeSettings, openSettings } from "../support/settings.js";

// Colons are illegal in a Windows filename, hence the dashes — see snapshot-service.ts's NAME_PATTERN.
const BACKUP_PATTERN = /^backup-v(\d+)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/;

// Slice C — the migration seam, narrowed to the snapshot SettingsService takes before it
// rewrites a behind-CURRENT_VERSION data.json. The e2e-snapshot-upgrade fixture ships a v4
// data.json (CURRENT_VERSION is 5) whose one journal carries a v4-shaped navBlock
// (`rows`, the pre-v5 field v4ToV5Migration renames to `lines`). That rename is the
// discriminator under test: the backup this boot writes must still read `rows`, proving the
// snapshot captured what was on disk *before* migration touched it, not the migrated shape —
// a distinction __mocks__/obsidian.ts cannot make since it fakes plugin-data persistence
// entirely rather than running the real load -> snapshot -> migrate -> save chain.
describe("pre-migration settings snapshot", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-snapshot-upgrade", plugins: ["journals"] });
  });

  it("snapshots the pre-migration data.json before migrating it", async () => {
    const backups = await waitForSnapshotFiles(BACKUP_PATTERN);
    expect(backups).toHaveLength(1);

    const contents = await readPluginDataFile(backups[0] ?? "");
    const parsed = JSON.parse(contents ?? "{}") as { version?: number; journals?: Record<string, unknown> };

    expect(parsed.version).toBe(4);
    const journal = parsed.journals?.daily as { navBlock?: { rows?: unknown[]; lines?: unknown[] } } | undefined;
    expect(journal?.navBlock?.rows).toEqual([]);
    expect(journal?.navBlock?.lines).toBeUndefined();
  });

  it("does not write a second snapshot once the migration has run", async () => {
    // The backup write happens once, inside the same boot's #loadAndMigrate — nothing re-triggers
    // it later. Re-listing after the assertions above confirms the count stays at one rather than
    // the first test merely having caught it early.
    const files = await listPluginDataFiles();
    expect(files.filter((name) => BACKUP_PATTERN.test(name))).toHaveLength(1);
  });

  it("lists exactly one snapshot on the Maintenance page", async () => {
    await openSettings();
    await clickButton(m.maintenance_open());

    await $(`div=${m.maintenance_snapshots_heading()}`).waitForExist({
      timeoutMsg: "Maintenance subpage did not open",
    });
    await expect($(`div=${m.maintenance_snapshots_empty()}`)).not.toBeExisting();

    const restoreButtons = await $$(`button=${m.maintenance_snapshot_restore()}`).getElements();
    expect(restoreButtons).toHaveLength(1);

    await closeSettings();
  });
});
