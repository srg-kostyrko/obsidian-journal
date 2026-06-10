import { browser } from "@wdio/globals";

import { PluginDataMissingError } from "./errors.js";
import { frontmatterOf } from "./vault.js";

// Helpers for slice C — the migration seam. A legacy data.json + legacy note
// frontmatter boot through the real plugin: real loadData -> migration chain ->
// saveData round-trip, and a real allMarkdownNotes walk that reads legacy
// frontmatter through metadataCache before rewriting it. None of this is
// reachable through __mocks__/obsidian.ts, which fakes both persistence and the
// metadataCache index. Mechanics live here; specs read as intent.

const PLUGIN_DATA_PATH = ".obsidian/plugins/journals/data.json";

interface StoredSettings {
  version?: number;
  journals?: Record<string, { name?: string }>;
  shelves?: Record<string, { name?: string }>;
}

// Reads the persisted data.json the plugin wrote back via saveData — the
// user-observable migration contract, not plugin-internal state.
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
export async function waitForSettingsVersion(version: number): Promise<void> {
  await browser.waitUntil(
    async () => {
      const settings = await readSettings();
      return settings?.version === version;
    },
    { timeoutMsg: `waited for ${PLUGIN_DATA_PATH} to migrate to version ${version}` },
  );
}

// Polls until the legacy note converges on the new schema: the new journal name
// and date field present, and the legacy section/start-date markers gone — a
// single convergence, so one observed end state proves the rewrite ran fully.
export async function waitForMigratedNote(path: string, expected: { journal: string; date: string }): Promise<void> {
  await browser.waitUntil(
    async () => {
      const frontmatter = await frontmatterOf(path);
      return (
        frontmatter?.journal === expected.journal &&
        frontmatter["journal-date"] === expected.date &&
        frontmatter["journal-section"] === undefined &&
        frontmatter["journal-start-date"] === undefined
      );
    },
    {
      timeoutMsg: `waited for ${path} to migrate to journal=${expected.journal} journal-date=${expected.date} (legacy markers cleared)`,
    },
  );
}

// An interval note carries the legacy interval index, which the migration moves
// into the journal's configured index field (here the default `journal-index`)
// and drops the old key — a rewrite path the calendar notes never exercise.
export async function waitForMigratedIntervalNote(
  path: string,
  expected: { journal: string; date: string; index: number },
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const frontmatter = await frontmatterOf(path);
      return (
        frontmatter?.journal === expected.journal &&
        frontmatter["journal-date"] === expected.date &&
        frontmatter["journal-index"] === expected.index &&
        frontmatter["journal-interval-index"] === undefined &&
        frontmatter["journal-start-date"] === undefined
      );
    },
    {
      timeoutMsg: `waited for ${path} to migrate to journal=${expected.journal} journal-index=${expected.index} (interval index moved, legacy markers cleared)`,
    },
  );
}
