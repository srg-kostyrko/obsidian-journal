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

// Overwrites a note's whole content in place — a foreign edit (vault.modify, not the
// plugin's own writers) so metadataCache re-reads the note and the live "metadata-changed"
// event fires, exactly as a user typing into the note would drive it.
export async function writeNote(path: string, content: string): Promise<void> {
  const written = await browser.executeObsidian(
    async ({ app, obsidian }, notePath, body) => {
      const file = app.vault.getAbstractFileByPath(notePath);
      if (!(file instanceof obsidian.TFile)) return false;
      await app.vault.modify(file, body);
      return true;
    },
    path,
    content,
  );
  if (!written) throw new FixtureFileMissingError(path);
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

// Resolves against the vault's live file map (updated synchronously by create/rename/trash), not
// metadataCache — so a test can wait for a note to appear or, after a delete, to be gone.
export function noteExists(path: string): Promise<boolean> {
  return browser.executeObsidian(
    ({ app, obsidian }, notePath) => app.vault.getAbstractFileByPath(notePath) instanceof obsidian.TFile,
    path,
  );
}

export function activeNotePath(): Promise<string | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path);
}

// Open in "active" mode reuses the current leaf; "tab" mode adds one. Counting markdown leaves
// before and after is how a test tells those two open modes apart.
export function markdownLeafCount(): Promise<number> {
  return browser.executeObsidian(({ app }) => app.workspace.getLeavesOfType("markdown").length);
}

// A "split" open creates a pane beside the active one, so the main root split gains a child; a
// "tab" open reuses the existing tab group and leaves this count unchanged. A leaf count alone
// cannot tell split from tab — both add a leaf — so this is the signal that distinguishes them.
// Reaching workspace.rootSplit.children mirrors uri.ts's protocolHandlers cast: internal runtime
// shape, deliberately so, since the regression we guard against is Obsidian changing that routing.
export function rootSplitChildCount(): Promise<number> {
  return browser.executeObsidian(({ app }) => {
    const workspace = app.workspace as unknown as { rootSplit: { children: readonly unknown[] } };
    return workspace.rootSplit.children.length;
  });
}

// A "window" open hosts the note in a popout window, which Obsidian tracks under
// workspace.floatingSplit. Counting those windows confirms the popout opened rather than the note
// falling back into the main window — the exact fallback an Obsidian API change once introduced.
export function popoutWindowCount(): Promise<number> {
  return browser.executeObsidian(({ app }) => {
    const workspace = app.workspace as unknown as { floatingSplit?: { children: readonly unknown[] } };
    return workspace.floatingSplit?.children.length ?? 0;
  });
}

// Whether a markdown leaf in the main window holds this note. Opening a note that is already open
// reuses whichever leaf has it, so the active *file* is the target either way — a leaf in the main
// window holding it is what separates "opened in my window" from "focus jumped to the popout".
export function mainWindowHoldsNote(path: string): Promise<boolean> {
  return browser.executeObsidian(
    ({ app }, notePath) =>
      app.workspace.getLeavesOfType("markdown").some((leaf) => {
        const view = leaf.view as { file?: { path: string } | null };
        return leaf.getRoot() === app.workspace.rootSplit && view.file?.path === notePath;
      }),
    path,
  );
}

// Puts the user back in the main window after a popout opened — the state a report of "it takes me
// to a different window" starts from, since opening in a popout leaves that popout focused. Focus
// has to reach the window itself: the plugin reads Obsidian's `activeWindow`, which only moves on a
// real window focus, not on a leaf becoming active.
export async function focusMainWindow(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    app.workspace.containerEl.win.focus();
    const inMain = app.workspace.getLeavesOfType("markdown").find((leaf) => leaf.getRoot() === app.workspace.rootSplit);
    if (inMain) app.workspace.setActiveLeaf(inMain, { focus: true });
  });
  await browser.waitUntil(
    async () =>
      browser.executeObsidian(
        ({ app }) => app.workspace.containerEl.win.activeWindow === app.workspace.containerEl.win,
      ),
    { timeoutMsg: "main window never regained focus after the popout opened" },
  );
}

// Detaches every leaf rooted outside the main window, which closes its popout. A test that opens a
// popout must call this before finishing: an open popout stays the active window, so the next
// test's modals render in the popout's document where the main-window selectors can't reach them.
export async function closePopoutWindows(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    const workspace = app.workspace as unknown as {
      rootSplit: unknown;
      iterateAllLeaves(callback: (leaf: { getRoot(): unknown; detach(): void }) => void): void;
    };
    const popoutLeaves: { detach(): void }[] = [];
    workspace.iterateAllLeaves((leaf) => {
      if (leaf.getRoot() !== workspace.rootSplit) popoutLeaves.push(leaf);
    });
    for (const leaf of popoutLeaves) leaf.detach();
  });
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

// Folder-aware create-or-overwrite: the fixture carries no note folders and vault.create does
// not create missing parents. Idempotent so a seed can't collide with a note the run already
// produced (e.g. today's note when today's day-of-month matches a seeded dayAnchor).
export async function seedNote(path: string, content: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app, obsidian }, notePath, body) => {
      const existing = app.vault.getAbstractFileByPath(notePath);
      if (existing instanceof obsidian.TFile) {
        await app.vault.modify(existing, body);
        return;
      }
      const slash = notePath.lastIndexOf("/");
      if (slash > 0) {
        const dir = notePath.slice(0, slash);
        if (!(await app.vault.adapter.exists(dir))) await app.vault.createFolder(dir);
      }
      await app.vault.create(notePath, body);
    },
    path,
    content,
  );
}

// Opens a note in a markdown editor leaf — the active-editor / active-file precondition for
// the per-note command guards (insert-date-link, connect-note, open-next/prev).
export async function openNote(path: string): Promise<void> {
  await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (file instanceof obsidian.TFile) await app.workspace.getLeaf(false).openFile(file);
  }, path);
}

// Detaches every markdown editor leaf, leaving no active editor and no active file — the
// negative precondition for the editor / active-note command guards.
export async function closeAllLeaves(): Promise<void> {
  await browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType("markdown"));
}

export function waitForActiveNote(path: string): Promise<void> {
  return waitForState(activeNotePath, (active) => active === path, `waited for ${path} to become the active note`);
}

// Today's date as a YYYY-MM-DD anchor, computed in the Node test process. The runner and the
// Obsidian renderer share the machine's local date, so this matches the plugin's notion of today
// (modulo the midnight boundary, same assumption the decoration fixtures already rely on).
export function todayAnchor(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
