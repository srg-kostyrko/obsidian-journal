import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { CURRENT_VERSION } from "../../src/settings/version.js";
import { pinClock } from "../support/clock.js";
import { runCommand } from "../support/commands.js";
import { waitForNotice } from "../support/notices.js";
import {
  clickIcon,
  closeSettings,
  expandSection,
  openSettings,
  submitModal,
  waitForDialogClosed,
  waitForModalOpen,
} from "../support/settings.js";
import { contentOf, openNote, waitForActiveNote } from "../support/vault.js";

// A sync can land a rolled marker nobody can read while a roll is reading its earlier notes. The
// roll started with the readable one, so it must not read the stamped line as open and copy it.
const FIXTURE = "./e2e-tests/fixtures/e2e-rollover-marker-turns-unreadable";
const SOURCE_DATE = "2026-09-25";
const SOURCE = `daily/${SOURCE_DATE}.md`;
const TODAY = "2026-09-26";
const TARGET = `daily/${TODAY}.md`;

interface MarkerWindow extends Window {
  __e2eMarkerHeld?: boolean;
}

async function waitForMarkerHeld(): Promise<void> {
  await browser.waitUntil(() => browser.execute(() => (window as MarkerWindow).__e2eMarkerHeld === true), {
    timeout: 15_000,
    timeoutMsg: "waited for the synced settings to hold the rolled marker unreadable during the roll's read",
  });
}

// The plugin's own reload hook, the one Obsidian Sync calls, run from inside the roll's read of the
// earlier note, after data.json gains a marker that is not a tag. Written at the running version: an
// older one reads as a downgrade, and the reload keeps what it had.
async function makeMarkerUnreadableDuringReadOf(path: string): Promise<void> {
  await browser.executeObsidian(
    ({ app }, held, version, date) => {
      const vault = app.vault as unknown as { read(file: { path: string }): Promise<string> };
      const plugin = (
        app as unknown as {
          plugins: {
            plugins: Record<
              string,
              {
                manifest: { dir: string };
                api: { tasksFor(selector: string, date: string): Promise<{ text: string }[]> };
                onExternalSettingsChange(): Promise<void>;
              }
            >;
          };
        }
      ).plugins.plugins.journals;
      const read = vault.read.bind(vault);
      vault.read = async (file) => {
        const text = await read(file);
        if (file.path !== held) return text;
        vault.read = read;
        const dataPath = `${plugin.manifest.dir}/data.json`;
        const stored = JSON.parse(await app.vault.adapter.read(dataPath)) as Record<string, unknown>;
        await app.vault.adapter.write(
          dataPath,
          JSON.stringify({ ...stored, version, tasksCheckbox: { rolledMarker: "carried" } }),
        );
        await plugin.onExternalSettingsChange();
        // The hook starts the reload without waiting for it. Held, the marker stamps nothing, so the
        // stamped line, which an open-tasks answer leaves out while it reads as rolled, joins it.
        const settled = async (): Promise<boolean> => {
          const tasks = await plugin.api.tasksFor("daily", date);
          return tasks.some((task) => task.text.includes("milk"));
        };
        // Bounded, so a reload that never lands releases the roll; the spec reports which wait failed.
        const deadline = Date.now() + 10_000;
        let markerHeld = await settled();
        while (!markerHeld && Date.now() < deadline) {
          await new Promise((resolve) => window.setTimeout(resolve, 50));
          markerHeld = await settled();
        }
        const win = window as MarkerWindow;
        win.__e2eMarkerHeld = markerHeld;
        return text;
      };
    },
    path,
    CURRENT_VERSION,
    SOURCE_DATE,
  );
}

describe("rolling over while a sync makes the rolled marker unreadable", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await pinClock(`${TODAY}T12:00:00`);
  });

  it("refuses before writing, without copying the stamped line", async () => {
    const sourceBefore = await contentOf(SOURCE);
    const targetBefore = await contentOf(TARGET);
    await openNote(SOURCE);
    await waitForActiveNote(SOURCE);
    await makeMarkerUnreadableDuringReadOf(SOURCE);

    await runCommand("journals:roll-over");
    await waitForMarkerHeld();

    await waitForNotice(m.tasks_roll_marker_unreadable());
    expect(await contentOf(SOURCE)).toBe(sourceBefore);
    expect(await contentOf(TARGET)).toBe(targetBefore);
  });
});

// What Obsidian Sync does, through the plugin's own reload hook: data.json gains a marker that is
// not a tag. Done once the stamped line reads as open, which only a held marker makes it.
async function syncUnreadableMarker(): Promise<void> {
  await browser.executeObsidian(async ({ app }, version) => {
    const plugin = (
      app as unknown as {
        plugins: {
          plugins: Record<
            string,
            {
              manifest: { dir: string };
              onExternalSettingsChange(): Promise<void>;
            }
          >;
        };
      }
    ).plugins.plugins.journals;
    const dataPath = `${plugin.manifest.dir}/data.json`;
    const stored = JSON.parse(await app.vault.adapter.read(dataPath)) as Record<string, unknown>;
    await app.vault.adapter.write(
      dataPath,
      JSON.stringify({ ...stored, version, tasksCheckbox: { rolledMarker: "carried" } }),
    );
    await plugin.onExternalSettingsChange();
  }, CURRENT_VERSION);
  await browser.waitUntil(
    () =>
      browser.executeObsidian(async ({ app }, date) => {
        const api = (
          app as unknown as {
            plugins: {
              plugins: Record<
                string,
                { api: { tasksFor(selector: string, date: string): Promise<{ text: string }[]> } }
              >;
            };
          }
        ).plugins.plugins.journals.api;
        const tasks = await api.tasksFor("daily", date);
        return tasks.some((task) => task.text.includes("milk"));
      }, SOURCE_DATE),
    { timeout: 10_000, timeoutMsg: "waited for the synced settings to hold the rolled marker unreadable" },
  );
}

// The checkbox modal opened while the marker was still readable. Saving it without touching the
// marker must not write that older value over the one synced in since.
describe("saving checkbox settings after a sync made the rolled marker unreadable", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await pinClock(`${TODAY}T12:00:00`);
  });

  after(closeSettings);

  it("keeps the marker held, so rolling still refuses", async () => {
    await openSettings();
    await expandSection(m.tasks_settings_title());
    await clickIcon(m.tasks_settings_configure());
    await waitForModalOpen();
    await syncUnreadableMarker();
    await submitModal();
    await waitForDialogClosed();
    await closeSettings();

    await openNote(SOURCE);
    await waitForActiveNote(SOURCE);
    await runCommand("journals:roll-over");

    await waitForNotice(m.tasks_roll_marker_unreadable());
  });
});
