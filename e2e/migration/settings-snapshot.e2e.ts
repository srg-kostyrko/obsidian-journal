import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { listPluginDataFiles, readPluginDataFile, waitForSnapshotFiles } from "../support/plugin-data.js";
import { clickButton, closeSettings, openSettings } from "../support/settings.js";

// Colons are illegal in a Windows filename, hence the dashes — see snapshot-service.ts's NAME_PATTERN.
const BACKUP_PATTERN = /^backup-v(\d+)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/;
// Distinct from BACKUP_PATTERN: SnapshotService names a pre-restore snapshot backup-restore-v<n>-<timestamp>.json.
const PRE_RESTORE_PATTERN = /^backup-restore-v(\d+)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/;

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

  it("does not write a second snapshot on a later boot of the same not-yet-migrated data.json", async () => {
    // #loadAndMigrate never flushes the migrated result back to data.json — that write is
    // debounced and, absent any other settings change, may never happen (see the comment on
    // waitForSnapshotFiles in plugin-data.ts) — so a later boot re-enters #snapshotIfBehind
    // with the same still-v4 payload on disk. Reloading with no vault path restarts Obsidian
    // on the *same* on-disk vault rather than a fresh copy of the fixture, so the snapshot
    // this suite already wrote is still there to be deduplicated against.
    await browser.reloadObsidian();

    // Opening Settings only succeeds once the plugin's async initialize() — and the
    // #snapshotIfBehind call inside it — has resolved, so this is the deterministic signal
    // that the second boot's migration pass has finished, not a fixed sleep.
    await openSettings();
    await clickButton(m.maintenance_open());
    await $(`div=${m.maintenance_snapshots_heading()}`).waitForExist({
      timeoutMsg: "Maintenance subpage did not open after the second boot",
    });
    await closeSettings();

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

  it("snapshots the current settings before restoring an older one", async () => {
    await openSettings();
    await clickButton(m.maintenance_open());
    await clickButton(m.maintenance_snapshot_restore());

    await waitForSnapshotFiles(PRE_RESTORE_PATTERN);

    await closeSettings();
  });
});
