import { browser } from "@wdio/globals";

import { PluginDataMissingError } from "./errors.js";
import { waitForState } from "./wait.js";

const PLUGIN_DATA_PATH = ".obsidian/plugins/journals/data.json";

export interface StoredSettings {
  version?: number;
  journals?: Record<string, { name?: string }>;
  shelves?: Record<string, { name?: string }>;
}

// Reads the persisted data.json the plugin wrote back via saveData — the
// user-observable contract, not plugin-internal state.
async function readSettings(): Promise<StoredSettings | undefined> {
  const raw = await browser.executeObsidian(async ({ app }, dataPath) => {
    if (!(await app.vault.adapter.exists(dataPath))) return;
    return app.vault.adapter.read(dataPath);
  }, PLUGIN_DATA_PATH);
  if (typeof raw !== "string") return undefined;
  return JSON.parse(raw) as StoredSettings;
}

export async function getSettings(): Promise<StoredSettings> {
  const settings = await readSettings();
  if (!settings) throw new PluginDataMissingError(PLUGIN_DATA_PATH);
  return settings;
}

export function journalNamesOf(settings: StoredSettings): string[] {
  return Object.values(settings.journals ?? {})
    .map((journal) => journal.name)
    .filter((name): name is string => typeof name === "string");
}

// Journals and shelves are stored keyed by name; the repositories resolve by
// storage[name]. A migration that re-keyed them by a generated id left every
// entity unreachable, so the keys themselves are the contract under test.
export function journalKeysOf(settings: StoredSettings): string[] {
  return Object.keys(settings.journals ?? {});
}

export function shelfKeysOf(settings: StoredSettings): string[] {
  return Object.keys(settings.shelves ?? {});
}

// Migration persists asynchronously (debounced saveData after the note walk
// clears its pending markers), so poll the stored version until it converges.
export function waitForSettingsVersion(version: number): Promise<void> {
  return waitForState(
    readSettings,
    (settings) => settings.version === version,
    `waited for ${PLUGIN_DATA_PATH} to migrate to version ${version}`,
  );
}
