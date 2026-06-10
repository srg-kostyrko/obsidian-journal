import { browser } from "@wdio/globals";

import { FixtureFileMissingError } from "./errors.js";

// Helpers that drive and observe the vault through the real Obsidian process.
// Slice A asserts the seam our mock can't reach: foreign vault mutations flow
// through real metadataCache indexing before the plugin's frontmatter write
// becomes observable. Mechanics (selectors, polling) live here; specs read as
// intent (see docs/e2e-testing-strategy.md, Authoring conventions).

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
// can run ahead of Obsidian's view, which is exactly the timing slice A tests.
export function frontmatterOf(path: string): Promise<Frontmatter | undefined> {
  return browser.executeObsidian(({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof obsidian.TFile)) return;
    return app.metadataCache.getFileCache(file)?.frontmatter;
  }, path);
}

// Polls vault state until the plugin's auto-attach write converges. No fixed
// sleeps: the metadataCache catch-up is async and unobservable-by-duration.
export async function waitForJournalFrontmatter(
  path: string,
  expected: { journal: string; date: string },
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const frontmatter = await frontmatterOf(path);
      return frontmatter?.journal === expected.journal && frontmatter["journal-date"] === expected.date;
    },
    {
      timeoutMsg: `waited for ${path} to attach journal frontmatter (journal=${expected.journal}, journal-date=${expected.date})`,
    },
  );
}
