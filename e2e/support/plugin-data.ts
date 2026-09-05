import { browser } from "@wdio/globals";

import { CURRENT_VERSION } from "../../src/settings/version.js";

import { PluginDataMissingError } from "./errors.js";
import { waitForState } from "./wait.js";

const PLUGIN_DATA_DIR = ".obsidian/plugins/journals";
const PLUGIN_DATA_PATH = `${PLUGIN_DATA_DIR}/data.json`;

export interface StoredJournal {
  name?: string;
  frontmatter?: { dateField?: string };
  numbering?: { sources?: { frontmatterKey?: string }[] };
  decorations?: { mode?: string }[];
  navBlock?: { lines?: { template?: string }[][] };
  notelets?: Record<string, { name?: string }>;
}

export interface StoredShelf {
  name?: string;
  journals?: string[];
}

export interface StoredViewBlock {
  key?: string;
  config?: { items?: unknown[] };
}

export interface StoredView {
  name?: string;
  icon?: string;
  openOnStartup?: boolean;
  blocks?: StoredViewBlock[];
}

export interface StoredCommand {
  name?: string;
  target?: { kind?: string; journalName?: string };
}

export interface StoredSettings {
  version?: number;
  journals?: Record<string, StoredJournal>;
  shelves?: Record<string, StoredShelf>;
  views?: Record<string, StoredView>;
  commands?: Record<string, StoredCommand>;
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
export function waitForSettingsVersion(version: number = CURRENT_VERSION): Promise<void> {
  return waitForState(
    readSettings,
    (settings) => settings.version === version,
    `waited for ${PLUGIN_DATA_PATH} to migrate to version ${version}`,
  );
}

// Settings flows persist via debounced saveData, so the data.json change lands a tick
// after the modal closes — poll the parsed object until the predicate holds.
export function waitForSettings(predicate: (settings: StoredSettings) => boolean, timeoutMsg: string): Promise<void> {
  return waitForState(readSettings, predicate, timeoutMsg);
}

// Raw read/write of the persisted data.json, for the external-reload (Obsidian Sync) seam where a
// test simulates an out-of-band edit and then triggers the plugin's reload hook.
export async function readRawSettings(): Promise<string | undefined> {
  return browser.executeObsidian(async ({ app }, dataPath) => {
    if (!(await app.vault.adapter.exists(dataPath))) return;
    return app.vault.adapter.read(dataPath);
  }, PLUGIN_DATA_PATH);
}

export async function writeRawSettings(raw: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, dataPath, body) => {
      await app.vault.adapter.write(dataPath, body);
    },
    PLUGIN_DATA_PATH,
    raw,
  );
}

// Files the plugin writes into its own config directory alongside data.json — snapshot
// backups (SnapshotService/PluginData.writeFile) land here, not under a subfolder.
export async function listPluginDataFiles(): Promise<string[]> {
  return browser.executeObsidian(async ({ app }, dir) => {
    const listing = await app.vault.adapter.list(dir);
    return listing.files.map((file) => file.slice(dir.length + 1));
  }, PLUGIN_DATA_DIR);
}

export async function readPluginDataFile(name: string): Promise<string | undefined> {
  return browser.executeObsidian(
    async ({ app }, dir, fileName) => {
      const path = `${dir}/${fileName}`;
      if (!(await app.vault.adapter.exists(path))) return;
      return app.vault.adapter.read(path);
    },
    PLUGIN_DATA_DIR,
    name,
  );
}

// Polls until the plugin has written at least one snapshot backup file — the observable
// signal that #loadAndMigrate's pre-migration write completed, independent of whether the
// migrated data.json itself has been flushed back to disk yet (that write is debounced and,
// absent any other settings change, may never happen).
async function matchingPluginDataFiles(pattern: RegExp): Promise<string[] | undefined> {
  const files = await listPluginDataFiles();
  const matched = files.filter((name) => pattern.test(name));
  return matched.length > 0 ? matched : undefined;
}

export async function waitForSnapshotFiles(pattern: RegExp): Promise<string[]> {
  await waitForState(
    () => matchingPluginDataFiles(pattern),
    () => true,
    "waited for a pre-migration snapshot backup file to be written",
  );
  const matched = await matchingPluginDataFiles(pattern);
  return matched ?? [];
}
