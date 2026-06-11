import { browser } from "@wdio/globals";

import { FixtureFileMissingError } from "./errors.js";
import { waitForState } from "./wait.js";

export type Frontmatter = Record<string, unknown>;

// A foreign create — not the plugin's own NoteCreationService — so the
// self-write guard does not suppress it and auto-attach genuinely fires.
export async function createNote(path: string, content = ""): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, notePath, body) => {
      await app.vault.create(notePath, body);
    },
    path,
    content,
  );
}

export async function renameNote(from: string, to: string): Promise<void> {
  // The TFile lookup must run in-browser, but the callback is stringified and
  // can't reach an imported error; report via sentinel and raise in Node.
  const renamed = await browser.executeObsidian(
    async ({ app, obsidian }, fromPath, toPath) => {
      const file = app.vault.getAbstractFileByPath(fromPath);
      if (!(file instanceof obsidian.TFile)) return false;
      await app.fileManager.renameFile(file, toPath);
      return true;
    },
    from,
    to,
  );
  if (!renamed) throw new FixtureFileMissingError(from);
}

// Reads what Obsidian has parsed (post-metadataCache), not raw bytes — the bytes
// can run ahead of Obsidian's view, which is exactly the timing the seam tests.
export function frontmatterOf(path: string): Promise<Frontmatter | undefined> {
  return browser.executeObsidian(({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof obsidian.TFile)) return;
    return app.metadataCache.getFileCache(file)?.frontmatter;
  }, path);
}

// Reads what Obsidian has parsed, not raw bytes — consistent with frontmatterOf.
export async function contentOf(path: string): Promise<string | undefined> {
  return browser.executeObsidian(async ({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof obsidian.TFile)) return;
    return app.vault.cachedRead(file);
  }, path);
}

export function activeNotePath(): Promise<string | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path);
}

export function waitForFrontmatter(
  path: string,
  predicate: (frontmatter: Frontmatter) => boolean,
  timeoutMsg: string,
): Promise<void> {
  return waitForState(() => frontmatterOf(path), predicate, timeoutMsg);
}

export function waitForJournalFrontmatter(path: string, expected: { journal: string; date: string }): Promise<void> {
  return waitForFrontmatter(
    path,
    (frontmatter) => frontmatter.journal === expected.journal && frontmatter["journal-date"] === expected.date,
    `waited for ${path} to attach journal frontmatter (journal=${expected.journal}, journal-date=${expected.date})`,
  );
}

// A command opens today's note under the journal's folder. The date is "today" at
// run time, so we never predict the path — we wait for the active file to land
// under the expected folder, robust against any stale active file from boot.
export async function waitForActiveNoteIn(folder: string): Promise<string> {
  let path = "";
  await waitForState(
    activeNotePath,
    (active) => {
      path = active;
      return active.startsWith(`${folder}/`);
    },
    `waited for a journal note to open under ${folder}/`,
  );
  return path;
}

export function waitForContent(
  path: string,
  predicate: (content: string) => boolean,
  timeoutMsg: string,
): Promise<void> {
  return waitForState(() => contentOf(path), predicate, timeoutMsg);
}
